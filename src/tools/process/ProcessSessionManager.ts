// Process Session Manager
// Manages lifecycle of background process sessions

import { randomUUID } from "crypto";
import { spawnProcess, type WrappedProcess } from "./PtyWrapper.js";

/**
 * Process session status
 */
export type ProcessSessionStatus = "running" | "exited" | "killed";

/**
 * Process session state
 */
export interface ProcessSession {
  id: string;
  userId: string;
  command: string[];
  cwd: string;
  pty: boolean;
  status: ProcessSessionStatus;
  exitCode: number | null;
  pid: number | null;
  outputBuffer: string[]; // Circular buffer for polling
  fullLog: string[]; // Full log for log retrieval
  createdAt: number;
  lastActivityAt: number;
  handle: WrappedProcess | null;
}

/**
 * Session manager configuration
 */
export interface ProcessSessionManagerConfig {
  maxOutputLines?: number;
  maxLogSize?: number; // bytes
  idleTimeoutMs?: number;
  maxSessionsPerUser?: number;
}

const DEFAULT_CONFIG: Required<ProcessSessionManagerConfig> = {
  maxOutputLines: 1000,
  maxLogSize: 10 * 1024 * 1024, // 10MB
  idleTimeoutMs: 30 * 60 * 1000, // 30 minutes
  maxSessionsPerUser: 3,
};

/**
 * Manages process session lifecycle
 */
export class ProcessSessionManager {
  private sessions = new Map<string, ProcessSession>();
  private userSessionCount = new Map<string, number>();
  private config: Required<ProcessSessionManagerConfig>;

  constructor(config: ProcessSessionManagerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Create a new process session
   */
  async createSession(
    command: string[],
    cwd: string,
    userId: string,
    options: { pty?: boolean; env?: Record<string, string> } = {}
  ): Promise<ProcessSession> {
    // Check per-user session limit
    const currentCount = this.userSessionCount.get(userId) ?? 0;
    if (currentCount >= this.config.maxSessionsPerUser) {
      throw new Error(
        `Maximum sessions per user reached: ${this.config.maxSessionsPerUser}`
      );
    }

    const sessionId = randomUUID();
    const now = Date.now();

    const session: ProcessSession = {
      id: sessionId,
      userId,
      command,
      cwd,
      pty: options.pty ?? false,
      status: "running",
      exitCode: null,
      pid: null,
      outputBuffer: [],
      fullLog: [],
      createdAt: now,
      lastActivityAt: now,
      handle: null,
    };

    // Spawn the process
    try {
      const handle = await spawnProcess(command, {
        cwd,
        env: options.env,
        usePty: options.pty,
      });

      session.handle = handle;
      session.pid = handle.pid ?? null;

      // Set up output handling
      handle.onData((data) => {
        this.appendOutput(session, data);
      });

      // Set up exit handling
      handle.onExit((code, signal) => {
        session.status = signal !== null ? "killed" : "exited";
        session.exitCode = code;
        session.handle = null;
        session.lastActivityAt = Date.now();
      });

      // Register session
      this.sessions.set(sessionId, session);
      this.userSessionCount.set(userId, currentCount + 1);

      return session;
    } catch (error) {
      throw new Error(
        `Failed to spawn process: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Write input to a session
   */
  writeToSession(sessionId: string, input: string): { success: boolean; bytesWritten: number } {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return { success: false, bytesWritten: 0 };
    }

    if (session.status !== "running" || !session.handle) {
      return { success: false, bytesWritten: 0 };
    }

    const success = session.handle.write(input);
    session.lastActivityAt = Date.now();

    return {
      success,
      bytesWritten: success ? Buffer.byteLength(input, "utf8") : 0,
    };
  }

  /**
   * Poll recent output from a session
   */
  pollOutput(
    sessionId: string,
    maxLines: number = 100
  ): { lines: string[]; hasMore: boolean; status: ProcessSessionStatus; exitCode: number | null } | null {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return null;
    }

    session.lastActivityAt = Date.now();

    // Get lines from buffer and clear them
    const lines = session.outputBuffer.splice(0, maxLines);
    const hasMore = session.outputBuffer.length > 0;

    return {
      lines,
      hasMore,
      status: session.status,
      exitCode: session.exitCode,
    };
  }

  /**
   * Get full log from a session
   */
  getFullLog(sessionId: string): { log: string; totalLines: number; status: ProcessSessionStatus; exitCode: number | null } | null {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return null;
    }

    session.lastActivityAt = Date.now();

    return {
      log: session.fullLog.join(""),
      totalLines: session.fullLog.length,
      status: session.status,
      exitCode: session.exitCode,
    };
  }

  /**
   * Kill a session
   */
  async killSession(
    sessionId: string,
    signal: NodeJS.Signals = "SIGTERM"
  ): Promise<{ success: boolean; message: string }> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return { success: false, message: "Session not found" };
    }

    if (session.status !== "running" || !session.handle) {
      return {
        success: false,
        message: `Session already ${session.status}`,
      };
    }

    const killed = session.handle.kill(signal);

    if (killed) {
      session.status = "killed";
      session.lastActivityAt = Date.now();
      return { success: true, message: `Session killed with ${signal}` };
    }

    return { success: false, message: "Failed to kill process" };
  }

  /**
   * Remove a session from the manager
   */
  removeSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return false;
    }

    // Kill if still running
    if (session.status === "running" && session.handle) {
      session.handle.kill("SIGKILL");
    }

    // Update user count
    const currentCount = this.userSessionCount.get(session.userId) ?? 0;
    if (currentCount > 1) {
      this.userSessionCount.set(session.userId, currentCount - 1);
    } else {
      this.userSessionCount.delete(session.userId);
    }

    this.sessions.delete(sessionId);
    return true;
  }

  /**
   * Cleanup expired sessions
   */
  async cleanupExpired(): Promise<number> {
    const now = Date.now();
    const expired: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      const age = now - session.lastActivityAt;

      // Only cleanup non-running sessions that have been idle
      if (session.status !== "running" && age > this.config.idleTimeoutMs) {
        expired.push(sessionId);
      }
      // Also cleanup running sessions that have been idle too long
      else if (age > this.config.idleTimeoutMs * 2) {
        expired.push(sessionId);
      }
    }

    for (const sessionId of expired) {
      this.removeSession(sessionId);
    }

    return expired.length;
  }

  /**
   * List active sessions
   */
  listActiveSessions(userId?: string): ProcessSession[] {
    const sessions = Array.from(this.sessions.values());

    if (userId) {
      return sessions.filter((s) => s.userId === userId);
    }

    return sessions;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): ProcessSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get session count
   */
  get count(): number {
    return this.sessions.size;
  }

  /**
   * Append output to session buffers
   */
  private appendOutput(session: ProcessSession, data: string): void {
    session.lastActivityAt = Date.now();

    // Add to output buffer (for polling)
    const lines = data.split(/(?<=\n)/); // Split keeping newlines
    session.outputBuffer.push(...lines);

    // Trim output buffer if too large
    if (session.outputBuffer.length > this.config.maxOutputLines) {
      session.outputBuffer = session.outputBuffer.slice(
        -this.config.maxOutputLines
      );
    }

    // Add to full log
    session.fullLog.push(data);

    // Trim full log if too large
    let logSize = session.fullLog.reduce(
      (acc, s) => acc + Buffer.byteLength(s, "utf8"),
      0
    );

    while (logSize > this.config.maxLogSize && session.fullLog.length > 0) {
      const removed = session.fullLog.shift();
      if (removed) {
        logSize -= Buffer.byteLength(removed, "utf8");
      }
    }
  }

  /**
   * Close all sessions
   */
  async closeAll(): Promise<void> {
    Array.from(this.sessions.keys()).forEach((sessionId) => {
      this.removeSession(sessionId);
    });
  }
}
