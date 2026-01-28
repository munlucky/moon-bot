// Executor: Executes steps using tools

import { createLogger, type Logger } from "../utils/logger.js";
import type { SystemConfig, ToolContext, SessionMessage } from "../types/index.js";
import { Planner, type Step } from "./planner.js";
import type { Toolkit } from "../tools/index.js";

export interface ExecutionResult {
  success: boolean;
  outputs: Map<string, unknown>;
  errors: Map<string, Error>;
  messages: SessionMessage[];
}

export class Executor {
  private config: SystemConfig;
  private logger: Logger;
  private planner: Planner;
  private toolkit: Toolkit;

  constructor(config: SystemConfig, toolkit: Toolkit) {
    this.config = config;
    this.logger = createLogger(config);
    this.planner = new Planner(config);
    this.toolkit = toolkit;
  }

  async execute(
    message: string,
    sessionId: string,
    agentId: string,
    userId: string
  ): Promise<ExecutionResult> {
    this.logger.info("Executing task", { message, sessionId });

    const messages: SessionMessage[] = [];
    const outputs = new Map<string, unknown>();
    const errors = new Map<string, Error>();

    // Generate plan
    const plan = await this.planner.plan(message);

    // Add thought message
    messages.push({
      type: "thought",
      content: `Plan: ${plan.steps.map((s) => s.description).join(", ")}`,
      timestamp: Date.now(),
    });

    // Execute steps sequentially
    for (const step of plan.steps) {
      try {
        const toolMessage = await this.executeStep(step, sessionId, agentId, userId);
        if (toolMessage) {
          messages.push(toolMessage);
        }

        const result = { completed: true };
        outputs.set(step.id, result);

        messages.push({
          type: "result",
          content: `Step "${step.description}" completed`,
          timestamp: Date.now(),
          metadata: { stepId: step.id, result },
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        errors.set(step.id, err);

        messages.push({
          type: "error",
          content: `Step "${step.description}" failed: ${err.message}`,
          timestamp: Date.now(),
          metadata: { stepId: step.id },
        });

        // Try replanning
        const newPlan = await this.planner.replan(step, err, plan);
        if (newPlan.steps.length > 0) {
          // Continue with new plan
          plan.steps = newPlan.steps;
        }
      }
    }

    const success = errors.size === 0;
    return { success, outputs, errors, messages };
  }

  private async executeStep(
    step: Step,
    sessionId: string,
    agentId: string,
    userId: string
  ): Promise<SessionMessage | null> {
    if (!step.toolId) {
      // Non-tool step (like "respond")
      return null;
    }

    const tool = this.toolkit.get(step.toolId);
    if (!tool) {
      throw new Error(`Tool not found: ${step.toolId}`);
    }

    // Check approval
    if (tool.requiresApproval) {
      this.logger.info(`Tool ${step.toolId} requires approval`);
      // TODO: Implement approval flow
      throw new Error("Approval required but not implemented");
    }

    const context: ToolContext = {
      sessionId,
      agentId,
      userId,
      config: this.config,
      workspaceRoot: process.cwd(),
      policy: {
        allowlist: ["git", "pnpm", "npm", "node", "python", "python3"],
        denylist: ["rm\\s+-rf", "curl.*\\|.*sh", "sudo", "chmod\\s+777"],
        maxBytes: 2 * 1024 * 1024, // 2MB
        timeoutMs: 30000,
      },
    };

    const toolMessage: SessionMessage = {
      type: "tool",
      content: `Executing tool: ${step.toolId}`,
      timestamp: Date.now(),
      metadata: { stepId: step.id, toolId: step.toolId, input: step.input },
    };

    await tool.run(step.input, context);
    return toolMessage;
  }
}
