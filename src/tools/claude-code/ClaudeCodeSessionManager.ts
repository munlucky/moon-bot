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
}

/**
 * Claude Code session manager configuration
 */
export interface ClaudeCodeSessionManagerConfig {
  claudeCliPath?: string;
  defaultTimeout?: number;
  maxSessionsPerUser?: number;
  nodeExecutor?: NodeExecutor;
}

type ClaudeCodeSessionManagerConfigInternal = Omit<ClaudeCodeSessionManagerConfig, 'nodeExecutor'> & {
  nodeExecutor?: NodeExecutor;
};

const DEFAULT_CONFIG: Required<Omit<ClaudeCodeSessionManagerConfigInternal, 'nodeExecutor'>> = {
  claudeCliPath: "claude",
  defaultTimeout: 1800,
  maxSessionsPerUser: 2,
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

    // Create process session with PTY
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
      useScreenCapture,
      timeout,
      createdAt: now,
      lastActivityAt: now,
    };

    this.sessions.set(sessionId, session);
    this.userSessionCount.set(userId, currentCount + 1);

    return session;
  }

  /**
   * Write input to a session
   */
  writeToSession(
    sessionId: string,
    input: string
  ): { success: boolean; bytesWritten: number; useScreenCapture: boolean } {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return { success: false, bytesWritten: 0, useScreenCapture: false };
    }

    session.lastActivityAt = Date.now();

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
   */
  pollOutput(
    sessionId: string,
    maxLines: number = 100
  ): {
    lines: string[];
    hasMore: boolean;
    status: "running" | "exited" | "killed";
    exitCode: number | null;
    useScreenCapture: boolean;
  } | null {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return null;
    }

    session.lastActivityAt = Date.now();

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
    };
  }

  /**
   * Stop a session
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
  }> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return {
        success: false,
        message: "Session not found",
        status: "exited",
        exitCode: null,
      };
    }

    // Get last output before killing
    const logResult = this.processSessionManager.getFullLog(session.processSessionId);
    const lastOutput = logResult?.log.slice(-2000); // Last 2KB

    const killResult = await this.processSessionManager.killSession(
      session.processSessionId,
      signal
    );

    // Get final status
    const processSession = this.processSessionManager.getSession(
      session.processSessionId
    );

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
      success: killResult.success,
      message: killResult.message,
      status: processSession?.status ?? "killed",
      exitCode: processSession?.exitCode ?? null,
      lastOutput,
    };
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
