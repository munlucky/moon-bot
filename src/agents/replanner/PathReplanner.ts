// PathReplanner - Re-plans execution path after failure

import type { Step } from "../../types/index.js";
import type {
  ExecutionContext,
  RecoveryPlan,
  ToolFailure,
} from "./types.js";
import { RecoveryAction } from "./types.js";
import { type Logger } from "../../utils/logger.js";
import { randomUUID } from "node:crypto";

export class PathReplanner {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Re-plan execution from a failed step
   * Returns new steps to execute after the failure point
   */
  async replanFrom(
    failure: ToolFailure,
    context: ExecutionContext
  ): Promise<Step[]> {
    this.logger.info("Replanning from failed step", {
      stepId: failure.step.id,
      toolId: failure.toolId,
    });

    const newSteps: Step[] = [];

    // Create replacement step for failed tool
    const replacementStep: Step = {
      ...failure.step,
      id: `${failure.step.id}-retry-${failure.attemptCount + 1}`,
      description: `${failure.step.description} (retry ${failure.attemptCount + 1})`,
    };

    newSteps.push(replacementStep);

    // Add remaining goals as new steps
    // In production, this would use an LLM to generate proper steps
    for (const goal of context.remainingGoals) {
      const goalStep: Step = {
        id: `goal-${Date.now()}-${randomUUID()}`,
        description: goal,
        dependsOn: newSteps.map((s) => s.id),
      };
      newSteps.push(goalStep);
    }

    this.logger.info(`Generated ${newSteps.length} new steps`, {
      steps: newSteps.map((s) => ({ id: s.id, description: s.description })),
    });

    return newSteps;
  }

  /**
   * Create a recovery plan with alternative tool
   */
  createAlternativePlan(
    failure: ToolFailure,
    alternativeToolId: string,
    _context: ExecutionContext // Reserved for future use
  ): RecoveryPlan {
    this.logger.info(`Creating alternative plan using ${alternativeToolId}`);

    const alternativeStep: Step = {
      ...failure.step,
      id: `${failure.step.id}-alt-${failure.alternativeAttemptCount + 1}`,
      description: `${failure.step.description} (alternative: ${alternativeToolId})`,
      toolId: alternativeToolId,
    };

    return {
      action: RecoveryAction.USE_ALTERNATIVE,
      toolId: alternativeToolId,
      reason: `Original tool ${failure.toolId} failed, using alternative`,
      newSteps: [alternativeStep],
    };
  }

  /**
   * Create a retry recovery plan
   */
  createRetryPlan(
    failure: ToolFailure,
    _context: ExecutionContext // Reserved for future use
  ): RecoveryPlan {
    this.logger.info(`Creating retry plan for ${failure.toolId}`);

    return {
      action: RecoveryAction.RETRY,
      toolId: failure.toolId,
      reason: `Retrying ${failure.toolId} (attempt ${failure.attemptCount + 1})`,
    };
  }

  /**
   * Create an abort recovery plan
   */
  createAbortPlan(reason: string): RecoveryPlan {
    this.logger.warn(`Creating abort plan: ${reason}`);

    return {
      action: RecoveryAction.ABORT,
      reason,
    };
  }

  /**
   * Create an approval request plan
   */
  createApprovalPlan(message: string): RecoveryPlan {
    this.logger.info(`Creating approval request plan`);

    return {
      action: RecoveryAction.REQUEST_APPROVAL,
      message,
    };
  }

  /**
   * Validate that a new plan is viable
   * Checks for circular dependencies and missing tools
   */
  validateNewPlan(steps: Step[], availableTools: Set<string>): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Check for circular dependencies
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    for (const step of steps) {
      if (this.hasCycle(step, steps, visited, recursionStack)) {
        errors.push(`Circular dependency detected involving step: ${step.id}`);
      }
    }

    // Check that all tool IDs exist
    for (const step of steps) {
      if (step.toolId && !availableTools.has(step.toolId)) {
        errors.push(`Tool not found: ${step.toolId} for step: ${step.id}`);
      }
    }

    // Check that dependencies exist
    const stepIds = new Set(steps.map((s) => s.id));
    for (const step of steps) {
      if (step.dependsOn) {
        for (const dep of step.dependsOn) {
          if (!stepIds.has(dep)) {
            errors.push(
              `Dependency not found: ${dep} for step: ${step.id}`
            );
          }
        }
      }
    }

    const valid = errors.length === 0;

    if (!valid) {
      this.logger.error("Plan validation failed", { errors });
    }

    return { valid, errors };
  }

  /**
   * Helper to detect circular dependencies
   */
  private hasCycle(
    step: Step,
    allSteps: Step[],
    visited: Set<string>,
    recursionStack: Set<string>
  ): boolean {
    if (recursionStack.has(step.id)) {
      return true;
    }

    if (visited.has(step.id)) {
      return false;
    }

    visited.add(step.id);
    recursionStack.add(step.id);

    const dependencies = step.dependsOn || [];
    for (const depId of dependencies) {
      const depStep = allSteps.find((s) => s.id === depId);
      if (depStep && this.hasCycle(depStep, allSteps, visited, recursionStack)) {
        return true;
      }
    }

    recursionStack.delete(step.id);
    return false;
  }

  /**
   * Extract remaining goals from a plan after a failure
   */
  extractRemainingGoals(
    allSteps: Step[],
    completedStepIds: Set<string>,
    failedStepId: string
  ): string[] {
    const remaining: string[] = [];

    for (const step of allSteps) {
      // Skip completed and failed steps
      if (completedStepIds.has(step.id) || step.id === failedStepId) {
        continue;
      }

      // Check if all dependencies are met
      const depsMet = !step.dependsOn ||
        step.dependsOn.every((dep) =>
          completedStepIds.has(dep) || dep === failedStepId
        );

      if (depsMet) {
        remaining.push(step.description);
      }
    }

    return remaining;
  }
}
