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

  async replan(
    failedStep: Step,
    error: Error,
    previousPlan: Plan
  ): Promise<Plan> {
    this.logger.warn("Replanning after failure", {
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
}
