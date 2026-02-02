/**
 * SessionTaskMapper
 *
 * Maps session IDs to task IDs for approval handling.
 * Includes TTL-based auto-cleanup to prevent memory leaks.
 */

import type { Logger } from "../utils/logger.js";

export class SessionTaskMapper {
  private entries = new Map<string, { taskId: string; createdAt: number }>();
  private readonly logger: Logger;
  private readonly ttlMs: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  /**
   * @param logger - Logger instance
   * @param ttlMs - Time-to-live for entries in milliseconds (default: 1 hour)
   * @param cleanupIntervalMs - Cleanup interval in milliseconds (default: 5 minutes)
   */
  constructor(logger: Logger, ttlMs: number = 3600000, cleanupIntervalMs: number = 300000) {
    this.logger = logger;
    this.ttlMs = ttlMs;

    // Start automatic cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.autoCleanup();
    }, cleanupIntervalMs);
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
   */
  get(sessionId: string): string | undefined {
    const entry = this.entries.get(sessionId);
    if (!entry) {
      return undefined;
    }

    // Check if entry has expired
    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.entries.delete(sessionId);
      return undefined;
    }

    return entry.taskId;
  }

  /**
   * Check if a session ID exists.
   */
  has(sessionId: string): boolean {
    return this.get(sessionId) !== undefined;
  }

  /**
   * Remove all entries for a specific task ID.
   * Call this when a task completes, fails, or is aborted.
   */
  cleanupByTaskId(taskId: string): number {
    const sessionIdsToRemove: string[] = [];
    for (const [sessionId, entry] of this.entries.entries()) {
      if (entry.taskId === taskId) {
        sessionIdsToRemove.push(sessionId);
      }
    }

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
    const sessionIds: string[] = [];
    for (const [sessionId, entry] of this.entries.entries()) {
      if (entry.taskId === taskId) {
        sessionIds.push(sessionId);
      }
    }
    return sessionIds;
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
   * Automatically clean up expired entries.
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
}
