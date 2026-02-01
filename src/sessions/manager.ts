// Session Manager: Store and retrieve sessions

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { createLogger, type Logger } from "../utils/logger.js";
import type { SystemConfig, Session, SessionMessage } from "../types/index.js";
import { generate as generateSessionKey } from "./SessionKey.js";

export class SessionManager {
  private config: SystemConfig;
  private logger: Logger;
  private sessions = new Map<string, Session>();
  private sessionKeys = new Map<string, Session>();

  constructor(config: SystemConfig) {
    this.config = config;
    this.logger = createLogger(config);
  }

  create(agentId: string, userId: string, channelId: string, channelSessionId?: string): Session {
    const session: Session = {
      id: randomUUID(),
      sessionKey: channelSessionId ? generateSessionKey(agentId, channelSessionId) : undefined,
      agentId,
      userId,
      channelId,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.sessions.set(session.id, session);

    // Index by sessionKey if provided
    if (session.sessionKey) {
      this.sessionKeys.set(session.sessionKey, session);
    }

    this.save(session);

    this.logger.info(`Session created: ${session.id}`);
    return session;
  }

  get(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get a session by sessionKey (agent:<id>:session:<key> format).
   */
  getBySessionKey(sessionKey: string): Session | undefined {
    return this.sessionKeys.get(sessionKey);
  }

  async load(sessionId: string): Promise<Session | null> {
    const session = this.sessions.get(sessionId);
    if (session) {
      return session;
    }

    const filePath = this.getSessionPath(sessionId);
    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const lines = fs.readFileSync(filePath, "utf-8").trim().split("\n");
      const messages: SessionMessage[] = [];

      for (const line of lines) {
        if (line) {
          messages.push(JSON.parse(line) as SessionMessage);
        }
      }

      const session: Session = {
        id: sessionId,
        agentId: "unknown",
        userId: "unknown",
        channelId: "unknown",
        messages,
        createdAt: messages[0]?.timestamp || Date.now(),
        updatedAt: messages[messages.length - 1]?.timestamp || Date.now(),
      };

      this.sessions.set(sessionId, session);
      return session;
    } catch (error) {
      this.logger.error(`Failed to load session: ${sessionId}`, { error });
      return null;
    }
  }

  addMessage(sessionId: string, message: SessionMessage): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.messages.push(message);
    session.updatedAt = Date.now();

    this.appendMessage(sessionId, message);
  }

  private save(session: Session): void {
    const dir = this.getSessionsDir();
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const filePath = this.getSessionPath(session.id);
      const lines = session.messages.map((m) => JSON.stringify(m)).join("\n");
      fs.writeFileSync(filePath, lines);
    } catch (error) {
      this.logger.error(`Failed to save session: ${session.id}`, { error });
      throw new Error(`Session save failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private appendMessage(sessionId: string, message: SessionMessage): void {
    const filePath = this.getSessionPath(sessionId);
    try {
      fs.appendFileSync(filePath, JSON.stringify(message) + "\n");
    } catch (error) {
      this.logger.error(`Failed to append message to session: ${sessionId}`, { error });
      throw new Error(`Message append failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private getSessionPath(sessionId: string): string {
    return path.join(this.getSessionsDir(), `${sessionId}.jsonl`);
  }

  private getSessionsDir(): string {
    return this.config.storage?.sessionsPath || path.join(process.env.HOME || "", ".moonbot", "sessions");
  }

  compact(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {return;}

    // Simple compaction: keep only last 50 messages
    if (session.messages.length > 50) {
      session.messages = session.messages.slice(-50);
      this.save(session);
      this.logger.info(`Session compacted: ${sessionId}`);
    }
  }

  list(): Session[] {
    return Array.from(this.sessions.values());
  }

  /**
   * List sessions with pagination support.
   * @param page Page number (1-indexed)
   * @param pageSize Number of items per page (default: 50, max: 500)
   * @returns Paginated list of sessions
   */
  listPaginated(page: number = 1, pageSize: number = 50): {
    sessions: Session[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasMore: boolean;
  } {
    // Clamp pageSize to prevent excessive memory usage
    const clampedPageSize = Math.min(Math.max(pageSize, 1), 500);
    const allSessions = Array.from(this.sessions.values());
    const total = allSessions.length;
    const totalPages = Math.ceil(total / clampedPageSize);

    // Clamp page to valid range
    const clampedPage = Math.min(Math.max(page, 1), totalPages || 1);

    const start = (clampedPage - 1) * clampedPageSize;
    const end = start + clampedPageSize;
    const sessions = allSessions.slice(start, end);

    return {
      sessions,
      total,
      page: clampedPage,
      pageSize: clampedPageSize,
      totalPages,
      hasMore: clampedPage < totalPages,
    };
  }
}
