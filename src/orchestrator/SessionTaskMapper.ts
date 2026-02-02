/**
 * SessionTaskMapper
 *
 * Maps session IDs to task IDs for approval handling.
 * Includes TTL-based auto-cleanup to prevent memory leaks.
 */

import type { Logger } from "../utils/logger.js";

/** Default TTL: 1 hour in milliseconds */
const DEFAULT_TTL_MS = 3600000;

/** Default cleanup interval: 5 minutes in milliseconds */
const DEFAULT_CLEANUP_INTERVAL_MS = 300000;

interface SessionEntry {
  taskId: string;
  createdAt: number;
}

export class SessionTaskMapper {
  private entries = new Map<string, SessionEntry>();
  private readonly logger: Logger;
  private readonly ttlMs: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    logger: Logger,
    ttlMs: number = DEFAULT_TTL_MS,
    cleanupIntervalMs: number = DEFAULT_CLEANUP_INTERVAL_MS
  ) {
    this.logger = logger;
    this.ttlMs = ttlMs;
    this.startCleanupInterval(cleanupIntervalMs);
  }

  /**
   * Map a session ID to a task ID.
   */
  set(sessionId: string, taskId: string): void {
    this.entries.set(sessionId, {
      taskId,
      createdAt: Date.now(),
    });
  }

  /**
   * Get the task ID for a session ID.
   * @returns Task ID if found and not expired, otherwise undefined
   */
  get(sessionId: string): string | undefined {
    const entry = this.entries.get(sessionId);
    if (!entry) {
      return undefined;
    }

    if (this.isExpired(entry)) {
      this.entries.delete(sessionId);
      return undefined;
    }

    return entry.taskId;
  }

  /**
   * Check if a session ID exists and is not expired.
   */
  has(sessionId: string): boolean {
    return this.get(sessionId) !== undefined;
  }

  /**
   * Remove all entries for a specific task ID.
   * Call this when a task completes, fails, or is aborted.
   * @returns Number of entries removed
   */
  cleanupByTaskId(taskId: string): number {
    const sessionIdsToRemove = this.findSessionIdsByTaskId(taskId);

    for (const sessionId of sessionIdsToRemove) {
      this.entries.delete(sessionId);
    }

    if (sessionIdsToRemove.length > 0) {
      this.logger.debug("Cleaned up session mappings", { taskId, count: sessionIdsToRemove.length });
    }

    return sessionIdsToRemove.length;
  }

  /**
   * Remove a specific session ID mapping.
   */
  delete(sessionId: string): boolean {
    return this.entries.delete(sessionId);
  }

  /**
   * Get all session IDs for a specific task ID.
   */
  getSessionIdsForTask(taskId: string): string[] {
    return this.findSessionIdsByTaskId(taskId);
  }

  /**
   * Get the number of active mappings.
   */
  get size(): number {
    return this.entries.size;
  }

  /**
   * Get internal map for compatibility with existing code.
   * TODO: Refactor callers to use dedicated methods instead.
   */
  getEntries(): Map<string, string> {
    const result = new Map<string, string>();
    for (const [sessionId, entry] of this.entries.entries()) {
      result.set(sessionId, entry.taskId);
    }
    return result;
  }

  /**
   * Clear all entries and stop cleanup interval.
   */
  shutdown(): void {
    this.entries.clear();

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.logger.debug("SessionTaskMapper shutdown");
  }

  /**
   * Start the automatic cleanup interval.
   * @private
   */
  private startCleanupInterval(intervalMs: number): void {
    this.cleanupInterval = setInterval(() => {
      this.autoCleanup();
    }, intervalMs);
  }

  /**
   * Check if an entry has expired.
   * @private
   */
  private isExpired(entry: SessionEntry): boolean {
    return Date.now() - entry.createdAt > this.ttlMs;
  }

  /**
   * Find all session IDs for a given task ID.
   * @private
   */
  private findSessionIdsByTaskId(taskId: string): string[] {
    const sessionIds: string[] = [];
    for (const [sessionId, entry] of this.entries.entries()) {
      if (entry.taskId === taskId) {
        sessionIds.push(sessionId);
      }
    }
    return sessionIds;
  }

  /**
   * Automatically clean up expired entries.
   * @private
   */
  private autoCleanup(): void {
    const cutoff = Date.now() - this.ttlMs;
    let removedCount = 0;

    for (const [sessionId, entry] of this.entries.entries()) {
      if (entry.createdAt < cutoff) {
        this.entries.delete(sessionId);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      this.logger.debug("Auto-cleaned expired session mappings", { count: removedCount });
    }
  }
}
