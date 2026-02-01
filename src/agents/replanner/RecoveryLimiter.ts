// RecoveryLimiter - Manages recovery limits to prevent infinite loops

import type {
  RecoveryLimitsConfig,
  RecoveryAttempt,
  ToolFailure,
} from "./types.js";
import { RecoveryAction } from "./types.js";
import { type Logger } from "../../utils/logger.js";
import { randomUUID } from "node:crypto";

const DEFAULT_CONFIG: RecoveryLimitsConfig = {
  maxRetries: 3,
  maxAlternatives: 2,
  globalTimeout: 600000, // 10 minutes
  autoRetry: true,
  logRecovery: true,
};

export class RecoveryLimiter {
  private logger: Logger;
  private config: RecoveryLimitsConfig;
  private attempts = new Map<string, RecoveryAttempt[]>();
  private globalStartTime: number;

  constructor(logger: Logger, config?: Partial<RecoveryLimitsConfig>) {
    this.logger = logger;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.globalStartTime = Date.now();
  }

  /**
   * Get current configuration
   */
  getConfig(): RecoveryLimitsConfig {
    return { ...this.config };
  }

  /**
   * Check if recovery is possible for a failure
   */
  canRecover(_failure: ToolFailure): boolean {
    // _failure parameter reserved for future use
    // Check global timeout
    const elapsed = Date.now() - this.globalStartTime;
    if (elapsed > this.config.globalTimeout) {
      this.logger.warn("Global timeout exceeded", {
        elapsed,
        limit: this.config.globalTimeout,
      });
      return false;
    }

    // Check if auto-retry is enabled
    if (!this.config.autoRetry) {
      this.logger.info("Auto-retry is disabled");
      return false;
    }

    return true;
  }

  /**
   * Check if we can retry the same tool
   */
  canRetry(failure: ToolFailure): boolean {
    if (!this.canRecover(failure)) {
      return false;
    }

    const attempts = this.getAttempts(failure.step.id);
    const retryCount = attempts.filter(
      (a) => a.action === RecoveryAction.RETRY && a.originalToolId === failure.toolId
    ).length;

    const canRetry = retryCount < this.config.maxRetries;

    if (!canRetry) {
      this.logger.warn("Max retry limit reached", {
        stepId: failure.step.id,
        toolId: failure.toolId,
        retryCount,
        limit: this.config.maxRetries,
      });
    }

    return canRetry;
  }

  /**
   * Check if we can use an alternative tool
   */
  canUseAlternative(failure: ToolFailure): boolean {
    if (!this.canRecover(failure)) {
      return false;
    }

    const attempts = this.getAttempts(failure.step.id);
    const altCount = attempts.filter(
      (a) => a.action === RecoveryAction.USE_ALTERNATIVE
    ).length;

    const canAlt = altCount < this.config.maxAlternatives;

    if (!canAlt) {
      this.logger.warn("Max alternative limit reached", {
        stepId: failure.step.id,
        altCount,
        limit: this.config.maxAlternatives,
      });
    }

    return canAlt;
  }

  /**
   * Record a recovery attempt
   */
  recordAttempt(
    stepId: string,
    originalToolId: string,
    action: RecoveryAction,
    success: boolean,
    durationMs: number,
    alternativeToolId?: string
  ): void {
    const attempt: RecoveryAttempt = {
      attemptId: `${stepId}-${Date.now()}-${randomUUID()}`,
      originalToolId,
      action,
      alternativeToolId,
      timestamp: Date.now(),
      success,
      durationMs,
    };

    if (!this.attempts.has(stepId)) {
      this.attempts.set(stepId, []);
    }

    this.attempts.get(stepId)?.push(attempt) ?? this.attempts.set(stepId, [attempt]);

    if (this.config.logRecovery) {
      this.logger.info("Recovery attempt recorded", {
        attemptId: attempt.attemptId,
        stepId,
        action,
        success,
        durationMs,
      });
    }
  }

  /**
   * Get all attempts for a step
   */
  getAttempts(stepId: string): RecoveryAttempt[] {
    return this.attempts.get(stepId) || [];
  }

  /**
   * Get recovery statistics
   */
  getStats(): {
    totalAttempts: number;
    successfulRecoveries: number;
    failedRecoveries: number;
    byAction: Record<string, number>;
  } {
    let totalAttempts = 0;
    let successfulRecoveries = 0;
    let failedRecoveries = 0;
    const byAction: Record<string, number> = {};

    for (const attempts of this.attempts.values()) {
      for (const attempt of attempts) {
        totalAttempts++;
        if (attempt.success) {
          successfulRecoveries++;
        } else {
          failedRecoveries++;
        }

        byAction[attempt.action] = (byAction[attempt.action] || 0) + 1;
      }
    }

    return {
      totalAttempts,
      successfulRecoveries,
      failedRecoveries,
      byAction,
    };
  }

  /**
   * Clear attempts for a step (called when step succeeds)
   */
  clearAttempts(stepId: string): void {
    this.attempts.delete(stepId);
    this.logger.debug(`Cleared attempts for step: ${stepId}`);
  }

  /**
   * Reset all state (for new execution)
   */
  reset(): void {
    this.attempts.clear();
    this.globalStartTime = Date.now();
    this.logger.info("Recovery limiter reset");
  }

  /**
   * Get remaining time before global timeout
   */
  getRemainingTime(): number {
    const elapsed = Date.now() - this.globalStartTime;
    return Math.max(0, this.config.globalTimeout - elapsed);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<RecoveryLimitsConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info("Recovery limiter config updated", {
      maxRetries: this.config.maxRetries,
      maxAlternatives: this.config.maxAlternatives,
      globalTimeout: this.config.globalTimeout,
      autoRetry: this.config.autoRetry,
      logRecovery: this.config.logRecovery,
    });
  }
}
