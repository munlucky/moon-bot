// Replanner - Main failure recovery and path replanning system

import type { ToolSpec } from "../types/index.js";
import {
  FailureType,
  RecoveryAction,
  type ToolFailure,
  type RecoveryPlan,
  type ExecutionContext,
  type RecoveryLimitsConfig,
} from "./replanner/types.js";
import { FailureAnalyzer } from "./replanner/FailureAnalyzer.js";
import { AlternativeSelector } from "./replanner/AlternativeSelector.js";
import { PathReplanner } from "./replanner/PathReplanner.js";
import { RecoveryLimiter } from "./replanner/RecoveryLimiter.js";
import { type Logger } from "../utils/logger.js";

export interface ReplannerConfig {
  recoveryLimits?: Partial<RecoveryLimitsConfig>;
  customAlternatives?: Record<string, Array<{ toolId: string; priority: number }>>;
}

/**
 * Main Replanner class that coordinates all recovery components
 */
export class Replanner {
  private logger: Logger;
  private analyzer: FailureAnalyzer;
  private selector: AlternativeSelector;
  private pathReplanner: PathReplanner;
  private limiter: RecoveryLimiter;

  constructor(logger: Logger, availableTools: ToolSpec[], config?: ReplannerConfig) {
    this.logger = logger;
    this.analyzer = new FailureAnalyzer(logger);
    this.selector = new AlternativeSelector(logger, availableTools, config?.customAlternatives);
    this.pathReplanner = new PathReplanner(logger);
    this.limiter = new RecoveryLimiter(logger, config?.recoveryLimits);

    this.logger.info("Replanner initialized", {
      maxRetries: this.limiter.getConfig().maxRetries,
      maxAlternatives: this.limiter.getConfig().maxAlternatives,
    });
  }

  /**
   * Main replan method - called when a tool fails
   * Determines the best recovery action and returns a plan
   */
  async replan(
    failure: ToolFailure,
    context: ExecutionContext
  ): Promise<RecoveryPlan> {
    this.logger.info("Replanning after failure", {
      toolId: failure.toolId,
      stepId: failure.step.id,
      attemptCount: failure.attemptCount,
    });

    const startTime = Date.now();

    try {
      // 1. Check if recovery is possible
      if (!this.limiter.canRecover(failure)) {
        const plan = this.pathReplanner.createAbortPlan(
          "Max recovery attempts exceeded or global timeout"
        );
        this.recordAttempt(failure.step.id, failure.toolId, RecoveryAction.ABORT, false, Date.now() - startTime);
        return plan;
      }

      // 2. Classify the failure
      const failureType = this.analyzer.classifyFailure(failure);
      this.logger.info(`Failure classified as: ${failureType}`);

      // 3. Check if failure is recoverable
      if (!this.analyzer.isRecoverable(failureType)) {
        const plan = this.pathReplanner.createAbortPlan(
          `Failure type ${failureType} is not recoverable`
        );
        this.recordAttempt(failure.step.id, failure.toolId, RecoveryAction.ABORT, false, Date.now() - startTime);
        return plan;
      }

      // 4. Determine recovery action based on failure type and limits
      const action = this.selectRecoveryAction(failure, failureType);

      // 5. Execute the recovery action
      const plan = await this.executeRecoveryAction(action, failure, failureType, context);

      const duration = Date.now() - startTime;
      this.recordAttempt(
        failure.step.id,
        failure.toolId,
        plan.action,
        plan.action !== RecoveryAction.ABORT,
        duration,
        plan.toolId
      );

      return plan;
    } catch (error) {
      this.logger.error("Error during replanning", { error });
      return this.pathReplanner.createAbortPlan(
        `Replanning error: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Select the appropriate recovery action
   */
  private selectRecoveryAction(
    failure: ToolFailure,
    failureType: FailureType
  ): RecoveryAction {
    const recommendations = this.analyzer.getRecommendedAction(failureType);

    // Check if we need approval (permission denied)
    if (recommendations.needsApproval) {
      return RecoveryAction.REQUEST_APPROVAL;
    }

    // Check if we can retry
    if (recommendations.canRetry && this.limiter.canRetry(failure)) {
      return RecoveryAction.RETRY;
    }

    // Check if we can use alternative
    if (recommendations.canUseAlternative && this.limiter.canUseAlternative(failure)) {
      return RecoveryAction.USE_ALTERNATIVE;
    }

    // No recovery option available
    return RecoveryAction.ABORT;
  }

  /**
   * Execute the selected recovery action
   */
  private async executeRecoveryAction(
    action: RecoveryAction,
    failure: ToolFailure,
    failureType: FailureType,
    context: ExecutionContext
  ): Promise<RecoveryPlan> {
    switch (action) {
      case RecoveryAction.RETRY:
        return this.pathReplanner.createRetryPlan(failure, context);

      case RecoveryAction.USE_ALTERNATIVE: {
        const attemptedAlts = this.limiter
          .getAttempts(failure.step.id)
          .filter((a) => a.action === RecoveryAction.USE_ALTERNATIVE)
          .map((a) => a.alternativeToolId)
          .filter((id): id is string => id !== undefined);

        const alternative = this.selector.selectBest(failure, failureType, attemptedAlts);

        if (!alternative) {
          return this.pathReplanner.createAbortPlan("No viable alternative tool found");
        }

        return this.pathReplanner.createAlternativePlan(
          failure,
          alternative.toolId,
          context
        );
      }

      case RecoveryAction.REQUEST_APPROVAL:
        return this.pathReplanner.createApprovalPlan(
          `Tool ${failure.toolId} requires user approval`
        );

      case RecoveryAction.ABORT:
        return this.pathReplanner.createAbortPlan("No recovery option available");

      default:
        return this.pathReplanner.createAbortPlan("Unknown recovery action");
    }
  }

  /**
   * Record a recovery attempt
   */
  private recordAttempt(
    stepId: string,
    toolId: string,
    action: RecoveryAction,
    success: boolean,
    durationMs: number,
    alternativeToolId?: string
  ): void {
    this.limiter.recordAttempt(stepId, toolId, action, success, durationMs, alternativeToolId);
  }

  /**
   * Call when a step succeeds - clears recovery attempts for that step
   */
  markStepSuccess(stepId: string): void {
    this.limiter.clearAttempts(stepId);
    this.logger.debug(`Step ${stepId} succeeded, cleared recovery attempts`);
  }

  /**
   * Get recovery statistics
   */
  getStats(): ReturnType<RecoveryLimiter["getStats"]> {
    return this.limiter.getStats();
  }

  /**
   * Reset the replanner state (for new execution)
   */
  reset(): void {
    this.limiter.reset();
    this.logger.info("Replanner reset");
  }

  /**
   * Update available tools (for dynamic tool registration)
   */
  updateTools(tools: ToolSpec[]): void {
    this.selector.updateTools(tools);
    this.logger.info(`Updated available tools: ${tools.length} tools`);
  }

  /**
   * Get remaining time before global timeout
   */
  getRemainingTime(): number {
    return this.limiter.getRemainingTime();
  }
}

// Export types for external use
export type { ToolFailure, RecoveryPlan, ExecutionContext } from "./replanner/types.js";
export { FailureType, RecoveryAction } from "./replanner/types.js";
