// Planner: Breaks down goals into steps

import { createLogger, type Logger } from "../utils/logger.js";
import type { SystemConfig, Session, SessionMessage, Step } from "../types/index.js";
import { LLMClient, type LLMPlanRequest } from "../llm/LLMClient.js";

export { Step } from "../types/index.js";

export interface Plan {
  steps: Step[];
  estimatedDuration?: number;
}

export class Planner {
  private config: SystemConfig;
  private logger: Logger;
  private llmClient: LLMClient;
  private availableTools: string[];

  constructor(config: SystemConfig, availableTools: string[] = []) {
    this.config = config;
    this.logger = createLogger(config);
    this.availableTools = availableTools;

    // Initialize LLM client
    this.llmClient = new LLMClient({
      apiKey: process.env.OPENAI_API_KEY,
      model: "gpt-4o",
    });
  }

  async plan(message: string, session?: Session): Promise<Plan> {
    this.logger.info("Planning steps for message", { message });

    // Try to use LLM for planning
    if (this.llmClient.isAvailable()) {
      try {
        const request: LLMPlanRequest = {
          message,
          availableTools: this.availableTools,
          sessionContext: session?.messages
            .filter((m) => m.type === "user" || m.type === "assistant")
            .map((m) => `${m.type}: ${m.content}`)
            .join("\n"),
        };

        const response = await this.llmClient.generatePlan(request);

        this.logger.debug("Generated plan (LLM)", {
          steps: response.steps,
          reasoning: response.reasoning,
        });

        return {
          steps: response.steps,
          estimatedDuration: response.steps.length * 5000, // 5s per step estimate
        };
      } catch (error) {
        this.logger.warn("LLM planning failed, falling back to keyword matching", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Fallback to keyword-based planning
    return this.keywordPlan(message);
  }

  /**
   * Fallback keyword-based planning (used when LLM is unavailable)
   */
  private keywordPlan(message: string): Plan {
    const response = this.llmClient.generateFallbackPlan(message);

    this.logger.debug("Generated plan (keyword fallback)", {
      steps: response.steps,
    });

    return {
      steps: response.steps,
      estimatedDuration: response.steps.length * 5000,
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
