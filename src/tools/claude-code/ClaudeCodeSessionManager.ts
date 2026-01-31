// Claude Code Session Manager
// Manages Claude CLI sessions with optional screen capture mode

import { randomUUID } from "crypto";
import { existsSync } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import {
  ProcessSessionManager,
  type ProcessSession,
} from "../process/ProcessSessionManager.js";
import type { NodeExecutor } from "../nodes/NodeExecutor.js";

const execAsync = promisify(exec);

/**
 * Claude Code session metadata
 */
export interface ClaudeCodeSession {
  id: string;
  processSessionId: string;
  userId: string;
  workingDirectory: string;
  useScreenCapture: boolean;
  timeout: number;
  createdAt: number;
  lastActivityAt: number;
  /** Node ID when useScreenCapture is true */
  nodeId?: string;
  /** Node name when useScreenCapture is true */
  nodeName?: string;
  /** Whether this session runs on a remote node */
  isNodeSession: boolean;
  /** Remote session ID on the node (for interactive sessions) */
  remoteSessionId?: string;
}

/**
 * Claude Code session manager configuration
 */
export interface ClaudeCodeSessionManagerConfig {
  claudeCliPath?: string;
  defaultTimeout?: number;
  maxSessionsPerUser?: number;
  nodeExecutor?: NodeExecutor;
  /** Delay before capturing screen after write (ms) - default 300 */
  screenCaptureDelayMs?: number;
}

type ClaudeCodeSessionManagerConfigInternal = Omit<ClaudeCodeSessionManagerConfig, 'nodeExecutor'> & {
  nodeExecutor?: NodeExecutor;
};

const DEFAULT_CONFIG: Required<Omit<ClaudeCodeSessionManagerConfigInternal, 'nodeExecutor'>> = {
  claudeCliPath: "claude",
  defaultTimeout: 1800,
  maxSessionsPerUser: 2,
  screenCaptureDelayMs: 300,
};

/**
 * Manages Claude CLI sessions
 * Wraps ProcessSessionManager with Claude-specific functionality
 */
export class ClaudeCodeSessionManager {
  private sessions = new Map<string, ClaudeCodeSession>();
  private userSessionCount = new Map<string, number>();
  private config: Required<Omit<ClaudeCodeSessionManagerConfigInternal, 'nodeExecutor'>>;
  private processSessionManager: ProcessSessionManager;
  private claudeCliAvailable: boolean | null = null;
  private nodeExecutor?: NodeExecutor;

  constructor(
    processSessionManager: ProcessSessionManager,
    config: ClaudeCodeSessionManagerConfig = {}
  ) {
    this.processSessionManager = processSessionManager;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.nodeExecutor = config.nodeExecutor;
  }

  /**
   * Validate Claude CLI is available
   */
  async validateClaudeCli(): Promise<{ available: boolean; path?: string; error?: string }> {
    if (this.claudeCliAvailable !== null) {
      return {
        available: this.claudeCliAvailable,
        path: this.claudeCliAvailable ? this.config.claudeCliPath : undefined,
      };
    }

    try {
      const { stdout } = await execAsync(`${this.config.claudeCliPath} --version`);
      this.claudeCliAvailable = true;
      return {
        available: true,
        path: this.config.claudeCliPath,
      };
    } catch {
      // Try common paths
      const commonPaths = [
        "/usr/local/bin/claude",
        "/usr/bin/claude",
        `${process.env.HOME}/.local/bin/claude`,
        `${process.env.HOME}/.npm-global/bin/claude`,
      ];

      for (const path of commonPaths) {
        if (existsSync(path)) {
          try {
            await execAsync(`${path} --version`);
            this.config.claudeCliPath = path;
            this.claudeCliAvailable = true;
            return { available: true, path };
          } catch {
            continue;
          }
        }
      }

      this.claudeCliAvailable = false;
      return {
        available: false,
        error: "Claude CLI not found. Please install it with: npm install -g @anthropic-ai/claude-code",
      };
    }
  }

  /**
   * Create a new Claude Code session
   */
  async createSession(
    workingDirectory: string,
    userId: string,
    options: {
      prompt?: string;
      env?: Record<string, string>;
      timeout?: number;
      useScreenCapture?: boolean;
    } = {}
  ): Promise<ClaudeCodeSession> {
    // Check per-user session limit
    const currentCount = this.userSessionCount.get(userId) ?? 0;
    if (currentCount >= this.config.maxSessionsPerUser) {
      throw new Error(
        `Maximum Claude Code sessions per user reached: ${this.config.maxSessionsPerUser}`
      );
    }

    // Validate Claude CLI
    const cliCheck = await this.validateClaudeCli();
    if (!cliCheck.available) {
      throw new Error(cliCheck.error ?? "Claude CLI not available");
    }

    // Validate working directory
    if (!existsSync(workingDirectory)) {
      throw new Error(`Working directory does not exist: ${workingDirectory}`);
    }

    const sessionId = randomUUID();
    const now = Date.now();
    const useScreenCapture = options.useScreenCapture ?? false;
    const timeout = options.timeout ?? this.config.defaultTimeout;

    // Build command
    const command = [this.config.claudeCliPath];
    if (options.prompt) {
      command.push("-p", options.prompt);
    }

    // Branch: useScreenCapture=true -> execute on remote node
    if (useScreenCapture) {
      return this.createNodeSession(
        sessionId,
        workingDirectory,
        userId,
        command,
        timeout,
        options.env,
        currentCount,
        now
      );
    }

    // Default: local PTY session
    const processSession = await this.processSessionManager.createSession(
      command,
      workingDirectory,
      userId,
      {
        pty: true,
        env: options.env,
      }
    );

    const session: ClaudeCodeSession = {
      id: sessionId,
      processSessionId: processSession.id,
      userId,
      workingDirectory,
      useScreenCapture: false,
      timeout,
      createdAt: now,
      lastActivityAt: now,
      isNodeSession: false,
    };

    this.sessions.set(sessionId, session);
    this.userSessionCount.set(userId, currentCount + 1);

    return session;
  }

  /**
   * Create a session that runs on a remote node with screen capture
   * Uses startRemoteSession to create a persistent interactive session on the node
   */
  private async createNodeSession(
    sessionId: string,
    workingDirectory: string,
    userId: string,
    command: string[],
    timeout: number,
    env?: Record<string, string>,
    currentCount: number = 0,
    now: number = Date.now()
  ): Promise<ClaudeCodeSession> {
    if (!this.nodeExecutor) {
      throw new Error(
        "NODE_EXECUTOR_NOT_AVAILABLE: NodeExecutor not configured. Cannot use screen capture mode."
      );
    }

    // Check if screen capture capable node exists
    if (!this.hasScreenCaptureAvailable(userId)) {
      throw new Error(
        "NODE_NOT_FOUND: No screen capture capable node found. " +
          "Pair a Node Companion with screen capture support first."
      );
    }

    // Get the node for screen capture
    const nodeInfo = this.getScreenCaptureNode(userId);
    if (!nodeInfo) {
      throw new Error("NODE_NOT_FOUND: Failed to get screen capture node");
    }

    // Check consent
    if (!this.hasScreenCaptureConsent(userId, nodeInfo.nodeId)) {
      throw new Error(
        "CONSENT_REQUIRED: Screen capture consent not granted. " +
          "User must grant consent via nodes.consent.grant before using screen capture mode."
      );
    }

    // Start interactive PTY session on the remote node
    // This creates a persistent session that can receive input and produce output
    const remoteResult = await this.nodeExecutor.startRemoteSession(userId, command, {
      nodeId: nodeInfo.nodeId,
      cwd: workingDirectory,
      env,
      timeoutMs: timeout * 1000,
    });

    if (!remoteResult.success || remoteResult.status === "failed") {
      throw new Error(
        `NODE_SESSION_FAILED: Failed to start interactive session on node: ${remoteResult.error || "Unknown error"}`
      );
    }

    // Create a placeholder local process session for compatibility
    // Note: For node sessions, write/poll operations use the remote session
    const processSession = await this.processSessionManager.createSession(
      ["echo", "Remote session placeholder"],
      workingDirectory,
      userId,
      { pty: false }
    );

    const session: ClaudeCodeSession = {
      id: sessionId,
      processSessionId: processSession.id,
      userId,
      workingDirectory,
      useScreenCapture: true,
      timeout,
      createdAt: now,
      lastActivityAt: now,
      nodeId: nodeInfo.nodeId,
      nodeName: nodeInfo.nodeName,
      isNodeSession: true,
      remoteSessionId: remoteResult.remoteSessionId,
    };

    this.sessions.set(sessionId, session);
    this.userSessionCount.set(userId, currentCount + 1);

    return session;
  }

  /**
   * Write input to a session
   * Returns screen capture data when useScreenCapture is true
   */
  async writeToSession(
    sessionId: string,
    input: string
  ): Promise<{
    success: boolean;
    bytesWritten: number;
    useScreenCapture: boolean;
    screenCaptureData?: string;
    nodeId?: string;
    nodeName?: string;
  }> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return { success: false, bytesWritten: 0, useScreenCapture: false };
    }

    session.lastActivityAt = Date.now();

    // If node session, write to the remote session
    if (session.isNodeSession && session.remoteSessionId && this.nodeExecutor) {
      try {
        const writeResult = await this.nodeExecutor.writeToRemoteSession(
          session.nodeId!,
          session.remoteSessionId,
          input
        );

        // Wait configurable delay before capturing (allows UI to update)
        await new Promise((resolve) => setTimeout(resolve, this.config.screenCaptureDelayMs));

        // Capture screen and return combined result
        const captureData = await this.captureScreenWithLogging(session);

        return {
          success: writeResult.success,
          bytesWritten: writeResult.bytesWritten,
          useScreenCapture: session.useScreenCapture,
          ...captureData,
        };
      } catch (error) {
        console.error(
          `[ClaudeCodeSessionManager] Write to remote session ${session.id} failed:`,
          error instanceof Error ? error.message : error
        );
        return {
          success: false,
          bytesWritten: 0,
          useScreenCapture: session.useScreenCapture,
          nodeId: session.nodeId,
          nodeName: session.nodeName,
        };
      }
    }

    // Local session: write to process
    const result = this.processSessionManager.writeToSession(
      session.processSessionId,
      input
    );

    return {
      ...result,
      useScreenCapture: session.useScreenCapture,
    };
  }

  /**
   * Poll output from a session
   * Includes screen capture data when useScreenCapture is true
   */
  async pollOutput(
    sessionId: string,
    maxLines: number = 100
  ): Promise<{
    lines: string[];
    hasMore: boolean;
    status: "running" | "exited" | "killed";
    exitCode: number | null;
    useScreenCapture: boolean;
    screenCaptureData?: string;
    nodeId?: string;
    nodeName?: string;
  } | null> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return null;
    }

    session.lastActivityAt = Date.now();

    // If node session, poll from the remote session
    if (session.isNodeSession && session.remoteSessionId && this.nodeExecutor) {
      try {
        const pollResult = await this.nodeExecutor.pollRemoteSession(
          session.nodeId!,
          session.remoteSessionId,
          maxLines
        );

        // Also capture screen
        const captureData = await this.captureScreenWithLogging(session);

        return {
          lines: pollResult.lines,
          hasMore: pollResult.hasMore,
          status: pollResult.status,
          exitCode: pollResult.exitCode,
          useScreenCapture: session.useScreenCapture,
          ...captureData,
        };
      } catch (error) {
        console.error(
          `[ClaudeCodeSessionManager] Poll remote session ${session.id} failed:`,
          error instanceof Error ? error.message : error
        );
        return null;
      }
    }

    // Local session: poll from process
    const result = this.processSessionManager.pollOutput(
      session.processSessionId,
      maxLines
    );

    if (!result) {
      return null;
    }

    return {
      ...result,
      useScreenCapture: session.useScreenCapture,
    };
  }

  /**
   * Get full log from a session
   */
  getFullLog(sessionId: string): {
    log: string;
    totalLines: number;
    status: "running" | "exited" | "killed";
    exitCode: number | null;
    useScreenCapture: boolean;
    nodeId?: string;
    nodeName?: string;
  } | null {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return null;
    }

    session.lastActivityAt = Date.now();

    const result = this.processSessionManager.getFullLog(session.processSessionId);

    if (!result) {
      return null;
    }

    return {
      ...result,
      useScreenCapture: session.useScreenCapture,
      nodeId: session.nodeId,
      nodeName: session.nodeName,
    };
  }

  /**
   * Stop a session
   * Captures final screenshot when useScreenCapture is true
   */
  async stopSession(
    sessionId: string,
    signal: NodeJS.Signals = "SIGTERM"
  ): Promise<{
    success: boolean;
    message: string;
    status: "running" | "exited" | "killed";
    exitCode: number | null;
    lastOutput?: string;
    useScreenCapture: boolean;
    screenCaptureData?: string;
    nodeId?: string;
    nodeName?: string;
  }> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return {
        success: false,
        message: "Session not found",
        status: "exited",
        exitCode: null,
        useScreenCapture: false,
      };
    }

    // Capture final screenshot before stopping (if screen capture mode)
    const captureData = await this.captureScreenWithLogging(session);

    let exitCode: number | null = null;
    let lastOutput: string | undefined;
    let killSuccess = true;
    let killMessage = "Session stopped";

    // If node session, stop the remote session
    if (session.isNodeSession && session.remoteSessionId && this.nodeExecutor) {
      // Get last output - best effort, should not prevent session stop
      try {
        const pollResult = await this.nodeExecutor.pollRemoteSession(
          session.nodeId!,
          session.remoteSessionId,
          100
        );
        lastOutput = pollResult.lines.slice(-50).join("\n"); // Last 50 lines
      } catch (error) {
        console.warn(
          `[ClaudeCodeSessionManager] Could not poll last output for session ${session.id} before stopping:`,
          error instanceof Error ? error.message : error
        );
      }

      // Stop remote session - this must always be attempted
      try {
        const stopResult = await this.nodeExecutor.stopRemoteSession(
          session.nodeId!,
          session.remoteSessionId,
          signal
        );
        exitCode = stopResult.exitCode;
        killSuccess = stopResult.success;
        killMessage = stopResult.success ? "Remote session stopped" : "Failed to stop remote session";
      } catch (error) {
        console.error(
          `[ClaudeCodeSessionManager] Stop remote session ${session.id} failed:`,
          error instanceof Error ? error.message : error
        );
        killSuccess = false;
        killMessage = error instanceof Error ? error.message : "Failed to stop remote session";
      }
    } else {
      // Local session: kill process
      const logResult = this.processSessionManager.getFullLog(session.processSessionId);
      lastOutput = logResult?.log.slice(-2000);

      const killResult = await this.processSessionManager.killSession(
        session.processSessionId,
        signal
      );
      killSuccess = killResult.success;
      killMessage = killResult.message;

      const processSession = this.processSessionManager.getSession(session.processSessionId);
      exitCode = processSession?.exitCode ?? null;
    }

    // Update session counts
    const currentCount = this.userSessionCount.get(session.userId) ?? 0;
    if (currentCount > 1) {
      this.userSessionCount.set(session.userId, currentCount - 1);
    } else {
      this.userSessionCount.delete(session.userId);
    }

    // Remove our session record
    this.sessions.delete(sessionId);

    return {
      success: killSuccess,
      message: killMessage,
      status: "killed",
      exitCode,
      lastOutput,
      useScreenCapture: session.useScreenCapture,
      ...captureData,
    };
  }

  /**
   * Helper method to capture screen with proper error logging
   * Extracts common screen capture logic to reduce duplication
   */
  private async captureScreenWithLogging(
    session: ClaudeCodeSession
  ): Promise<{
    screenCaptureData?: string;
    nodeId?: string;
    nodeName?: string;
  }> {
    if (!session.useScreenCapture || !session.isNodeSession || !this.nodeExecutor) {
      return {
        nodeId: session.nodeId,
        nodeName: session.nodeName,
      };
    }

    try {
      const captureResult = await this.requestScreenCapture(
        session.userId,
        session.nodeId
      );
      return {
        screenCaptureData: captureResult.imageData,
        nodeId: session.nodeId,
        nodeName: session.nodeName,
      };
    } catch (error) {
      console.warn(
        `[ClaudeCodeSessionManager] Screen capture failed for session ${session.id}:`,
        error instanceof Error ? error.message : error
      );
      return {
        nodeId: session.nodeId,
        nodeName: session.nodeName,
      };
    }
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): ClaudeCodeSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get underlying process session
   */
  getProcessSession(sessionId: string): ProcessSession | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return undefined;
    }
    return this.processSessionManager.getSession(session.processSessionId);
  }

  /**
   * List active sessions for a user
   */
  listSessions(userId?: string): ClaudeCodeSession[] {
    const sessions = Array.from(this.sessions.values());

    if (userId) {
      return sessions.filter((s) => s.userId === userId);
    }

    return sessions;
  }

  /**
   * Get session count
   */
  get count(): number {
    return this.sessions.size;
  }

  /**
   * Cleanup expired sessions
   */
  async cleanupExpired(): Promise<number> {
    const now = Date.now();
    const expired: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      const age = now - session.lastActivityAt;
      const timeoutMs = session.timeout * 1000;

      if (age > timeoutMs) {
        expired.push(sessionId);
      }
    }

    for (const sessionId of expired) {
      await this.stopSession(sessionId, "SIGTERM");
    }

    return expired.length;
  }

  /**
   * Close all sessions
   */
  async closeAll(): Promise<void> {
    const sessionIds = Array.from(this.sessions.keys());
    for (const sessionId of sessionIds) {
      await this.stopSession(sessionId, "SIGKILL");
    }
  }

  /**
   * Check if screen capture is available via nodes
   * @param userId - User ID to check
   * @returns true if at least one paired node with screen capture capability exists
   */
  hasScreenCaptureAvailable(userId: string): boolean {
    return this.nodeExecutor?.hasScreenCaptureAvailable(userId) ?? false;
  }

  /**
   * Get the screen capture node for a user
   * @param userId - User ID
   * @returns Node connection info or undefined
   */
  getScreenCaptureNode(userId: string): {
    nodeId: string;
    nodeName: string;
  } | undefined {
    const node = this.nodeExecutor?.getScreenCaptureNode(userId);
    if (!node) {
      return undefined;
    }
    return {
      nodeId: node.nodeId,
      nodeName: node.nodeName,
    };
  }

  /**
   * Check if screen capture consent is granted
   * @param userId - User ID
   * @param nodeId - Optional node ID
   * @returns true if consent is granted
   */
  hasScreenCaptureConsent(userId: string, nodeId?: string): boolean {
    return this.nodeExecutor?.hasScreenCaptureConsent(userId, nodeId) ?? false;
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
    if (!this.nodeExecutor) {
      throw new Error("NODE_EXECUTOR_NOT_AVAILABLE: NodeExecutor not configured");
    }
    this.nodeExecutor.grantScreenCaptureConsent(userId, nodeId, durationMs);
  }

  /**
   * Request screen capture from a node
   * @param userId - User ID
   * @param nodeId - Optional node ID
   * @param timeoutMs - Optional timeout in milliseconds
   * @returns Promise that resolves with screen capture result
   */
  async requestScreenCapture(
    userId: string,
    nodeId?: string,
    timeoutMs?: number
  ): Promise<{
    success: boolean;
    nodeId: string;
    nodeName: string;
    imageData?: string;
    format: "png";
  }> {
    if (!this.nodeExecutor) {
      throw new Error("NODE_EXECUTOR_NOT_AVAILABLE: NodeExecutor not configured");
    }
    const result = await this.nodeExecutor.requestScreenCapture(
      userId,
      nodeId,
      timeoutMs
    );
    return {
      success: result.success,
      nodeId: result.nodeId,
      nodeName: result.nodeName,
      imageData: result.imageData,
      format: result.format,
    };
  }
}
