// Browser session lifecycle management for Playwright

import type { Page, Browser, BrowserContext } from "playwright";

export interface BrowserSession {
  id: string;
  sessionKey: string;
  page: Page;
  context: BrowserContext;
  browser: Browser;
  headless: boolean;
  createdAt: number;
  lastActivity: number;
  locked: boolean;
}

export interface SessionConfig {
  sessionKey?: string;
  headless?: boolean;
  timeoutMs?: number;
}

const DEFAULT_SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

export class SessionManager {
  private sessions = new Map<string, BrowserSession>();
  private keyToId = new Map<string, string>();
  private defaultTimeoutMs: number;
  private maxConcurrent: number;

  constructor(
    maxConcurrent: number = 5,
    defaultTimeoutMs: number = DEFAULT_SESSION_TIMEOUT
  ) {
    this.maxConcurrent = maxConcurrent;
    this.defaultTimeoutMs = defaultTimeoutMs;
  }

  /**
   * Create a new browser session.
   */
  async createSession(
    browser: Browser,
    config: SessionConfig = {}
  ): Promise<BrowserSession> {
    const sessionKey = config.sessionKey ?? "default";
    const headless = config.headless ?? true;

    // Check if session already exists for this key
    const existingId = this.keyToId.get(sessionKey);
    if (existingId) {
      const existing = this.sessions.get(existingId);
      if (existing) {
        // Return existing session
        existing.lastActivity = Date.now();
        return existing;
      }
    }

    // Check concurrent limit
    if (this.sessions.size >= this.maxConcurrent) {
      throw new Error(`Maximum concurrent sessions reached: ${this.maxConcurrent}`);
    }

    // Create new context and page
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });

    const page = await context.newPage();
    const sessionId = `${sessionKey}-${Date.now()}`;

    const session: BrowserSession = {
      id: sessionId,
      sessionKey,
      page,
      context,
      browser,
      headless,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      locked: false,
    };

    this.sessions.set(sessionId, session);
    this.keyToId.set(sessionKey, sessionId);

    return session;
  }

  /**
   * Get a session by key.
   */
  getSessionByKey(sessionKey: string): BrowserSession | undefined {
    const sessionId = this.keyToId.get(sessionKey);
    if (!sessionId) {
      return undefined;
    }
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
    }
    return session;
  }

  /**
   * Get a session by ID.
   */
  getSessionById(sessionId: string): BrowserSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
    }
    return session;
  }

  /**
   * Acquire a lock on a session for exclusive access.
   */
  async acquireLock(sessionKey: string): Promise<BrowserSession | null> {
    const session = this.getSessionByKey(sessionKey);

    if (!session) {
      return null;
    }

    // Wait for lock to be released (with timeout)
    const maxWait = 5000;
    const start = Date.now();

    while (session.locked && Date.now() - start < maxWait) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    if (session.locked) {
      throw new Error("Session lock acquisition timeout");
    }

    session.locked = true;
    session.lastActivity = Date.now();

    return session;
  }

  /**
   * Release a lock on a session.
   */
  releaseLock(sessionKey: string): void {
    const session = this.getSessionByKey(sessionKey);
    if (session) {
      session.locked = false;
      session.lastActivity = Date.now();
    }
  }

  /**
   * Close a session.
   */
  async closeSession(sessionKey: string): Promise<boolean> {
    const sessionId = this.keyToId.get(sessionKey);
    if (!sessionId) {
      return false;
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    try {
      await session.page.close();
      await session.context.close();
    } catch (err) {
      // Silent: close errors are not critical
    }

    this.sessions.delete(sessionId);
    this.keyToId.delete(sessionKey);

    return true;
  }

  /**
   * Close all sessions.
   */
  async closeAll(): Promise<void> {
    const closePromises = Array.from(this.sessions.values()).map(async (session) => {
      try {
        await session.page.close();
        await session.context.close();
      } catch (err) {
        // Silent: close errors are not critical
      }
    });

    await Promise.all(closePromises);

    this.sessions.clear();
    this.keyToId.clear();
  }

  /**
   * Clean up expired sessions.
   */
  async cleanupExpired(): Promise<number> {
    const now = Date.now();
    const expired: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      const age = now - session.lastActivity;
      if (age > this.defaultTimeoutMs) {
        expired.push(sessionId);
      }
    }

    for (const sessionId of expired) {
      const session = this.sessions.get(sessionId);
      if (session) {
        await this.closeSession(session.sessionKey);
      }
    }

    return expired.length;
  }

  /**
   * Get all active sessions.
   */
  getActiveSessions(): BrowserSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get session count.
   */
  get count(): number {
    return this.sessions.size;
  }
}
