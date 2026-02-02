// Node Executor
// Executes commands on remote Node Companion instances
// Bridges Claude Code sessions with Node Companion for screen capture

import type { NodeSessionManager } from "./NodeSessionManager.js";
import type { NodeConnection } from "./types.js";

// Error messages
const ERR_NODE_NOT_FOUND = "NODE_NOT_FOUND: Node not found or access denied";
const ERR_NODE_NOT_FOUND_CAPABLE = "NODE_NOT_FOUND: No screen capture capable node found. Pair a node with screen capture support first.";
const ERR_NODE_CAPABILITY_REQUIRED = "NODE_CAPABILITY_REQUIRED: This node does not support";
const ERR_NODE_NOT_AVAILABLE = "NODE_NOT_AVAILABLE: Node is";
const ERR_RPC_NOT_AVAILABLE = "RPC_NOT_AVAILABLE: Gateway RPC sender not configured";
const ERR_NODE_SESSION_ERROR = "NODE_SESSION_ERROR: Remote session did not return sessionId";
const ERR_EXECUTOR_SHUTDOWN = "EXECUTOR_SHUTDOWN";
const ERR_CONSENT_REQUIRED = "CONSENT_REQUIRED: Screen capture consent not granted. User must grant consent first.";

// Time constants
const MS_PER_SECOND = 1000;

/**
 * RPC send function type for communicating with nodes
 * This avoids circular dependency with GatewayServer
 */
export type NodeRpcSender = (
  _nodeId: string,
  _method: string,
  _params: unknown,
  _options?: { timeoutMs?: number }
) => Promise<unknown>;

/**
 * Result of a node command execution
 */
export interface NodeExecutionResult {
  success: boolean;
  nodeId: string;
  nodeName: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  status: "queued" | "completed" | "failed";
}

/**
 * Result of starting a remote interactive session
 */
export interface RemoteSessionResult {
  success: boolean;
  nodeId: string;
  nodeName: string;
  remoteSessionId: string;
  status: "started" | "failed";
  error?: string;
}

/**
 * Result of writing to a remote session
 */
export interface RemoteWriteResult {
  success: boolean;
  bytesWritten: number;
}

/**
 * Result of polling a remote session
 */
export interface RemotePollResult {
  lines: string[];
  hasMore: boolean;
  status: "running" | "exited" | "killed";
  exitCode: number | null;
}

/**
 * Result of a screen capture request
 */
export interface ScreenCaptureResult {
  success: boolean;
  nodeId: string;
  nodeName: string;
  imageData?: string; // Base64-encoded PNG
  format: "png";
  status: "queued" | "completed" | "failed";
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

/**
 * Node executor configuration
 */
export interface NodeExecutorConfig {
  defaultTimeoutMs?: number;
  retry?: RetryConfig;
}

const DEFAULT_RETRY: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000, // 1 second
  maxDelayMs: 10000, // 10 seconds
  backoffMultiplier: 2,
};

const DEFAULT_CONFIG: Required<Omit<NodeExecutorConfig, 'retry'>> & { retry: RetryConfig } = {
  defaultTimeoutMs: 30000, // 30 seconds
  retry: DEFAULT_RETRY,
};

/**
 * Error codes that are retryable
 */
const RETRYABLE_ERROR_CODES = [
  "NODE_TIMEOUT",
  "NODE_UNREACHABLE",
  "RPC_TIMEOUT",
  "NETWORK_ERROR",
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNREFUSED",
];

/**
 * Check if an error is retryable
 */
function isRetryableError(error: Error): boolean {
  const message = error.message;
  // Node.js errors have a 'code' property (e.g., 'ECONNREFUSED', 'ETIMEDOUT')
  const code = (error as Error & { code?: string }).code;

  // Check error code
  if (code && RETRYABLE_ERROR_CODES.includes(code)) {
    return true;
  }

  // Check error message patterns
  return RETRYABLE_ERROR_CODES.some(pattern => message.includes(pattern));
}

/**
 * Calculate delay with exponential backoff
 */
function calculateRetryDelay(
  attempt: number,
  config: RetryConfig
): number {
  const exponentialDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);
  const jitter = Math.random() * 0.3 * exponentialDelay; // Add ±15% jitter
  return Math.min(config.maxDelayMs, exponentialDelay + jitter);
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute with retry logic
 */
async function executeWithRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig,
  operationName: string
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry if this is the last attempt or error is not retryable
      if (attempt === config.maxRetries || !isRetryableError(lastError)) {
        throw lastError;
      }

      // Calculate delay and retry
      const delay = calculateRetryDelay(attempt, config);

      await sleep(delay);
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError || new Error(`${operationName} failed after retries`);
}

/**
 * NodeExecutor - Manages execution of commands and screen capture on paired nodes
 *
 * This class serves as the bridge between Claude Code sessions and Node Companion
 * instances, enabling remote screen capture when useScreenCapture is enabled.
 *
 * Features:
 * - Automatic retry with exponential backoff for transient failures
 * - Configurable timeout handling
 * - Proper error categorization and reporting
 */
export class NodeExecutor {
  private sessionManager: NodeSessionManager;
  private config: Required<Omit<NodeExecutorConfig, 'retry'>> & { retry: RetryConfig };
  private rpcSender: NodeRpcSender | null = null;
  private pendingExecutions = new Map<string, {
    resolve: (_value: NodeExecutionResult) => void;
    reject: (_error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();
  private pendingCaptures = new Map<string, {
    resolve: (_value: ScreenCaptureResult) => void;
    reject: (_error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();

  constructor(
    sessionManager: NodeSessionManager,
    config: NodeExecutorConfig = {}
  ) {
    this.sessionManager = sessionManager;
    const retry = config.retry ?? DEFAULT_RETRY;
    this.config = {
      defaultTimeoutMs: config.defaultTimeoutMs ?? DEFAULT_CONFIG.defaultTimeoutMs,
      retry,
    };
  }

  /**
   * Set the RPC sender function for communicating with nodes
   * This should be called by GatewayServer after initialization
   */
  setRpcSender(sender: NodeRpcSender): void {
    this.rpcSender = sender;
  }

  /**
   * Check if RPC sender is configured
   */
  private isRpcReady(): boolean {
    return this.rpcSender !== null;
  }

  /**
   * Check if screen capture is available for a user
   * @param userId - User ID to check
   * @returns true if at least one paired node with screen capture capability exists
   */
  hasScreenCaptureAvailable(userId: string): boolean {
    const node = this.sessionManager.getScreenCaptureCapableNode(userId);
    return node !== undefined;
  }

  /**
   * Get the screen capture node for a user
   * @param userId - User ID
   * @returns Node connection or undefined
   */
  getScreenCaptureNode(userId: string): NodeConnection | undefined {
    return this.sessionManager.getScreenCaptureCapableNode(userId);
  }

  /**
   * Check if screen capture consent is granted
   * @param userId - User ID
   * @param nodeId - Optional node ID (if not specified, uses first capable node)
   * @returns true if consent is granted
   */
  hasScreenCaptureConsent(userId: string, nodeId?: string): boolean {
    let node: NodeConnection | undefined;

    if (nodeId) {
      node = this.sessionManager.getNode(nodeId);
      if (!node || node.userId !== userId) {
        return false;
      }
    } else {
      node = this.sessionManager.getScreenCaptureCapableNode(userId);
    }

    if (!node) {
      return false;
    }

    return this.sessionManager.hasScreenCaptureConsent(node.nodeId);
  }

  /**
   * Grant screen capture consent
   * @param userId - User ID
   * @param nodeId - Node ID
   * @param durationMs - Optional duration in milliseconds
   */
  grantScreenCaptureConsent(
    userId: string,
    nodeId: string,
    durationMs?: number
  ): void {
    const node = this.sessionManager.getNode(nodeId);
    if (!node || node.userId !== userId) {
      throw new Error(ERR_NODE_NOT_FOUND);
    }

    this.sessionManager.grantScreenCaptureConsent(nodeId, durationMs);
  }

  /**
   * Request screen capture from a node
   * @param userId - User ID
   * @param nodeId - Optional node ID (if not specified, uses first capable node)
   * @param timeoutMs - Optional timeout in milliseconds
   * @returns Promise that resolves with screen capture result
   */
  async requestScreenCapture(
    userId: string,
    nodeId?: string,
    timeoutMs?: number
  ): Promise<ScreenCaptureResult> {
    // Find screen capture capable node
    let node: NodeConnection | undefined;

    if (nodeId) {
      node = this.sessionManager.getNode(nodeId);
      if (!node || node.userId !== userId) {
        throw new Error(ERR_NODE_NOT_FOUND);
      }
    } else {
      node = this.sessionManager.getScreenCaptureCapableNode(userId);
    }

    if (!node) {
      throw new Error(ERR_NODE_NOT_FOUND_CAPABLE);
    }

    if (!node.capabilities.screenCapture) {
      throw new Error(`${ERR_NODE_CAPABILITY_REQUIRED} screen capture`);
    }

    if (node.status !== "paired") {
      throw new Error(`${ERR_NODE_NOT_AVAILABLE} ${node.status}`);
    }

    // Check consent
    if (!this.sessionManager.hasScreenCaptureConsent(node.nodeId)) {
      throw new Error(ERR_CONSENT_REQUIRED);
    }

    // Check RPC sender is available
    if (!this.isRpcReady()) {
      throw new Error(ERR_RPC_NOT_AVAILABLE);
    }

    const rpcSender = this.rpcSender;
    if (!rpcSender) {
      throw new Error(ERR_RPC_NOT_AVAILABLE);
    }

    const timeout = timeoutMs ?? this.config.defaultTimeoutMs;

    // Execute with retry logic
    return executeWithRetry(async () => {
      const result = await rpcSender(node.nodeId, "nodes.capture", {}, { timeoutMs: timeout }) as {
        imageData?: string;
        error?: string;
      };

      if (result.error) {
        throw new Error(result.error);
      }

      return {
        success: true,
        nodeId: node.nodeId,
        nodeName: node.nodeName,
        imageData: result.imageData,
        format: "png",
        status: "completed",
      };
    }, this.config.retry, "Screen capture");
  }

  /**
   * Execute a command on a node
   * @param userId - User ID
   * @param argv - Command and arguments
   * @param options - Execution options
   * @returns Promise that resolves with execution result
   */
  async executeCommand(
    userId: string,
    argv: string | string[],
    options: {
      nodeId?: string;
      cwd?: string;
      env?: Record<string, string>;
      timeoutMs?: number;
    } = {}
  ): Promise<NodeExecutionResult> {
    // Select node
    const node = this.sessionManager.selectNodeForCommand(
      userId,
      options.nodeId
    );

    if (!node.capabilities.commandExec) {
      throw new Error(`${ERR_NODE_CAPABILITY_REQUIRED} command execution`);
    }

    if (node.status !== "paired") {
      throw new Error(`${ERR_NODE_NOT_AVAILABLE} ${node.status}`);
    }

    // Check RPC sender is available
    if (!this.isRpcReady()) {
      throw new Error(ERR_RPC_NOT_AVAILABLE);
    }

    const rpcSender = this.rpcSender;
    if (!rpcSender) {
      throw new Error(ERR_RPC_NOT_AVAILABLE);
    }

    const timeout = options.timeoutMs ?? this.config.defaultTimeoutMs;

    // Execute with retry logic
    return executeWithRetry(async () => {
      const result = await rpcSender(node.nodeId, "nodes.exec", {
        argv,
        cwd: options.cwd,
        env: options.env,
        timeoutMs: timeout,
      }, { timeoutMs: timeout }) as {
        exitCode?: number;
        stdout?: string;
        stderr?: string;
        error?: string;
      };

      if (result.error) {
        throw new Error(result.error);
      }

      return {
        success: result.exitCode === 0,
        nodeId: node.nodeId,
        nodeName: node.nodeName,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        status: result.exitCode === 0 ? "completed" : "failed",
      };
    }, this.config.retry, "Command execution");
  }

  /**
   * Handle completion of a screen capture request
   * Called by Gateway when receiving a response from a node
   * @param nodeId - Node ID
   * @param result - Screen capture result
   */
  handleScreenCaptureComplete(
    nodeId: string,
    result: { imageData?: string; error?: string }
  ): void {
    const pending = this.pendingCaptures.get(nodeId);
    if (!pending) {
      return; // No pending request
    }

    clearTimeout(pending.timeout);
    this.pendingCaptures.delete(nodeId);

    const node = this.sessionManager.getNode(nodeId);
    if (!node) {
      pending.reject(new Error("NODE_NOT_FOUND"));
      return;
    }

    if (result.error) {
      pending.reject(new Error(result.error));
    } else {
      pending.resolve({
        success: true,
        nodeId,
        nodeName: node.nodeName,
        imageData: result.imageData,
        format: "png",
        status: "completed",
      });
    }
  }

  /**
   * Handle completion of a command execution
   * Called by Gateway when receiving a response from a node
   * @param nodeId - Node ID
   * @param result - Execution result
   */
  handleExecutionComplete(
    nodeId: string,
    result: { exitCode?: number; stdout?: string; stderr?: string; error?: string }
  ): void {
    const pending = this.pendingExecutions.get(nodeId);
    if (!pending) {
      return; // No pending request
    }

    clearTimeout(pending.timeout);
    this.pendingExecutions.delete(nodeId);

    const node = this.sessionManager.getNode(nodeId);
    if (!node) {
      pending.reject(new Error("NODE_NOT_FOUND"));
      return;
    }

    if (result.error) {
      pending.reject(new Error(result.error));
    } else {
      pending.resolve({
        success: result.exitCode === 0,
        nodeId,
        nodeName: node.nodeName,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        status: result.exitCode === 0 ? "completed" : "failed",
      });
    }
  }

  /**
   * Clean up pending requests
   */
  cleanup(): void {
    // Clear all pending timeouts
    for (const pending of this.pendingExecutions.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("EXECUTOR_SHUTDOWN"));
    }
    this.pendingExecutions.clear();

    for (const pending of this.pendingCaptures.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("EXECUTOR_SHUTDOWN"));
    }
    this.pendingCaptures.clear();
  }

  // ============================================
  // Remote Interactive Session Management
  // ============================================

  /**
   * Start an interactive PTY session on a remote node
   * This creates a persistent session that can receive input and produce output
   *
   * @param userId - User ID
   * @param argv - Command and arguments to execute
   * @param options - Session options
   * @returns Promise that resolves with remote session info
   */
  async startRemoteSession(
    userId: string,
    argv: string | string[],
    options: {
      nodeId?: string;
      cwd?: string;
      env?: Record<string, string>;
      timeoutMs?: number;
    } = {}
  ): Promise<RemoteSessionResult> {
    // Select node
    const node = this.sessionManager.selectNodeForCommand(
      userId,
      options.nodeId
    );

    if (!node.capabilities.commandExec) {
      throw new Error(`${ERR_NODE_CAPABILITY_REQUIRED} command execution`);
    }

    if (node.status !== "paired") {
      throw new Error(`${ERR_NODE_NOT_AVAILABLE} ${node.status}`);
    }

    // Check RPC sender is available
    if (!this.isRpcReady()) {
      throw new Error(ERR_RPC_NOT_AVAILABLE);
    }

    const rpcSender = this.rpcSender;
    if (!rpcSender) {
      throw new Error(ERR_RPC_NOT_AVAILABLE);
    }

    const timeout = options.timeoutMs ?? this.config.defaultTimeoutMs;

    // Execute with retry logic - start interactive session on node
    return executeWithRetry(async () => {
      const result = await rpcSender(node.nodeId, "nodes.session.start", {
        argv,
        cwd: options.cwd,
        env: options.env,
        pty: true,
      }, { timeoutMs: timeout }) as {
        sessionId?: string;
        error?: string;
      };

      if (result.error) {
        throw new Error(result.error);
      }

      if (!result.sessionId) {
        throw new Error("NODE_SESSION_ERROR: Remote session did not return sessionId");
      }

      return {
        success: true,
        nodeId: node.nodeId,
        nodeName: node.nodeName,
        remoteSessionId: result.sessionId,
        status: "started",
      };
    }, this.config.retry, "Start remote session");
  }

  /**
   * Write input to a remote interactive session
   *
   * @param nodeId - Node ID
   * @param remoteSessionId - Remote session ID returned from startRemoteSession
   * @param input - Input to write
   * @returns Promise that resolves with write result
   */
  async writeToRemoteSession(
    nodeId: string,
    remoteSessionId: string,
    input: string
  ): Promise<RemoteWriteResult> {
    const node = this.sessionManager.getNode(nodeId);
    if (!node) {
      throw new Error("NODE_NOT_FOUND: Node not found");
    }

    if (!this.isRpcReady()) {
      throw new Error("RPC_NOT_AVAILABLE: Gateway RPC sender not configured");
    }

    const rpcSender = this.rpcSender;
    if (!rpcSender) {
      throw new Error("RPC_NOT_AVAILABLE: Gateway RPC sender not configured");
    }

    return executeWithRetry(async () => {
      const result = await rpcSender(nodeId, "nodes.session.write", {
        sessionId: remoteSessionId,
        input,
      }, { timeoutMs: this.config.defaultTimeoutMs }) as {
        bytesWritten?: number;
        error?: string;
      };

      if (result.error) {
        throw new Error(result.error);
      }

      // Validate bytesWritten field - be conservative about success
      const bytesWritten = typeof result.bytesWritten === 'number' ? result.bytesWritten : 0;
      const success = typeof result.bytesWritten === 'number' && result.bytesWritten > 0;

      return {
        success,
        bytesWritten,
      };
    }, this.config.retry, "Write to remote session");
  }

  /**
   * Poll output from a remote interactive session
   *
   * @param nodeId - Node ID
   * @param remoteSessionId - Remote session ID
   * @param maxLines - Maximum lines to return
   * @returns Promise that resolves with poll result
   */
  async pollRemoteSession(
    nodeId: string,
    remoteSessionId: string,
    maxLines: number = 100
  ): Promise<RemotePollResult> {
    const node = this.sessionManager.getNode(nodeId);
    if (!node) {
      throw new Error("NODE_NOT_FOUND: Node not found");
    }

    if (!this.isRpcReady()) {
      throw new Error("RPC_NOT_AVAILABLE: Gateway RPC sender not configured");
    }

    const rpcSender = this.rpcSender;
    if (!rpcSender) {
      throw new Error("RPC_NOT_AVAILABLE: Gateway RPC sender not configured");
    }

    return executeWithRetry(async () => {
      const result = await rpcSender(nodeId, "nodes.session.poll", {
        sessionId: remoteSessionId,
        maxLines,
      }, { timeoutMs: this.config.defaultTimeoutMs }) as {
        lines?: string[];
        hasMore?: boolean;
        status?: "running" | "exited" | "killed";
        exitCode?: number | null;
        error?: string;
      };

      if (result.error) {
        throw new Error(result.error);
      }

      return {
        lines: result.lines ?? [],
        hasMore: result.hasMore ?? false,
        status: result.status ?? "running",
        exitCode: result.exitCode ?? null,
      };
    }, this.config.retry, "Poll remote session");
  }

  /**
   * Stop a remote interactive session
   *
   * @param nodeId - Node ID
   * @param remoteSessionId - Remote session ID
   * @param signal - Signal to send (default: SIGTERM)
   * @returns Promise that resolves when session is stopped
   */
  async stopRemoteSession(
    nodeId: string,
    remoteSessionId: string,
    signal: string = "SIGTERM"
  ): Promise<{ success: boolean; exitCode: number | null }> {
    const node = this.sessionManager.getNode(nodeId);
    if (!node) {
      throw new Error("NODE_NOT_FOUND: Node not found");
    }

    if (!this.isRpcReady()) {
      throw new Error("RPC_NOT_AVAILABLE: Gateway RPC sender not configured");
    }

    const rpcSender = this.rpcSender;
    if (!rpcSender) {
      throw new Error("RPC_NOT_AVAILABLE: Gateway RPC sender not configured");
    }

    return executeWithRetry(async () => {
      const result = await rpcSender(nodeId, "nodes.session.stop", {
        sessionId: remoteSessionId,
        signal,
      }, { timeoutMs: this.config.defaultTimeoutMs }) as {
        success?: boolean;
        exitCode?: number | null;
        error?: string;
      };

      if (result.error) {
        throw new Error(result.error);
      }

      return {
        success: result.success ?? true,
        exitCode: result.exitCode ?? null,
      };
    }, this.config.retry, "Stop remote session");
  }
}
