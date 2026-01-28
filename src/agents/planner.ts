// Planner: Breaks down goals into steps

import { createLogger, type Logger } from "../utils/logger.js";
import type { SystemConfig, Session, SessionMessage, Step } from "../types/index.js";

export { Step } from "../types/index.js";

export interface Plan {
  steps: Step[];
  estimatedDuration?: number;
}

export class Planner {
  private config: SystemConfig;
  private logger: Logger;

  constructor(config: SystemConfig) {
    this.config = config;
    this.logger = createLogger(config);
  }

  async plan(message: string, session?: Session): Promise<Plan> {
    this.logger.info("Planning steps for message", { message });

    // For now, return a simple plan
    // In production, this would call an LLM to generate the plan
    const steps: Step[] = [];

    // Analyze if tools are needed
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes("search") || lowerMessage.includes("find")) {
      steps.push({
        id: "search",
        description: "Search for information",
        toolId: "browser.search",
      });
    }

    if (lowerMessage.includes("open") || lowerMessage.includes("browse")) {
      steps.push({
        id: "browse",
        description: "Open browser",
        toolId: "browser.open",
      });
    }

    if (lowerMessage.includes("file") || lowerMessage.includes("save")) {
      steps.push({
        id: "file",
        description: "File operation",
        toolId: "filesystem.write",
      });
    }

    // Default response step
    steps.push({
      id: "respond",
      description: "Generate response",
    });

    this.logger.debug("Generated plan", { steps });

    return {
      steps,
      estimatedDuration: steps.length * 5000, // 5s per step estimate
    };
  }

  /**
   * Replan after a failure (legacy method - Replanner now handles this)
   * @deprecated Use Replanner.replan() instead
   */
  async replan(
    failedStep: Step,
    error: Error,
    previousPlan: Plan
  ): Promise<Plan> {
    this.logger.warn("Replanning after failure (legacy method)", {
      stepId: failedStep.id,
      error: error.message,
    });

    // Simple fallback strategy
    const steps = previousPlan.steps.filter((s) => s.id !== failedStep.id);

    // Try alternative tool if available
    if (failedStep.toolId) {
      const alternativeStep: Step = {
        ...failedStep,
        id: `${failedStep.id}-alt`,
        description: `${failedStep.description} (alternative)`,
      };
      steps.push(alternativeStep);
    }

    return {
      steps,
      estimatedDuration: steps.length * 5000,
    };
  }

  /**
   * Generate remaining steps from a failure point
   * Used by PathReplanner for consistent planning logic
   */
  generateRemainingSteps(
    failedStep: Step,
    remainingGoals: string[],
    completedSteps: Step[]
  ): Step[] {
    const newSteps: Step[] = [];

    // Create retry step
    const retryStep: Step = {
      ...failedStep,
      id: `${failedStep.id}-retry`,
      description: `${failedStep.description} (retry)`,
    };
    newSteps.push(retryStep);

    // Add remaining goals
    for (const goal of remainingGoals) {
      const goalStep: Step = {
        id: `goal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        description: goal,
        dependsOn: newSteps.map((s) => s.id),
      };
      newSteps.push(goalStep);
    }

    return newSteps;
  }

  /**
   * Validate a plan for correctness
   */
  validatePlan(plan: Plan): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for duplicate step IDs
    const stepIds = new Set<string>();
    for (const step of plan.steps) {
      if (stepIds.has(step.id)) {
        errors.push(`Duplicate step ID: ${step.id}`);
      }
      stepIds.add(step.id);
    }

    // Check dependencies exist
    for (const step of plan.steps) {
      if (step.dependsOn) {
        for (const dep of step.dependsOn) {
          if (!stepIds.has(dep) && !completedStepsHas(dep, plan.steps)) {
            errors.push(`Step ${step.id} depends on non-existent step: ${dep}`);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

/**
 * Helper to check if a step ID exists in completed steps
 */
function completedStepsHas(stepId: string, steps: Step[]): boolean {
  // This would need access to completed steps from context
  // For now, just check if it's in the current plan
  return steps.some((s) => s.id === stepId);
}
