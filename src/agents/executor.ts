// Executor: Executes steps using tools with Replanner integration

import { createLogger, type Logger } from "../utils/logger.js";
import type { SystemConfig, ToolContext, SessionMessage, ToolResult, ToolSpec } from "../types/index.js";
import { Planner, type Step } from "./planner.js";
import { Replanner, type ToolFailure, type ExecutionContext } from "./replanner.js";
import type { Toolkit } from "../tools/index.js";
import type { ToolRuntime } from "../tools/runtime/ToolRuntime.js";

export interface ExecutionResult {
  success: boolean;
  outputs: Map<string, unknown>;
  errors: Map<string, Error>;
  messages: SessionMessage[];
  recoveryStats?: {
    totalAttempts: number;
    successfulRecoveries: number;
    failedRecoveries: number;
  };
}

export class Executor {
  private config: SystemConfig;
  private logger: Logger;
  private planner: Planner;
  private toolkit: Toolkit;
  private replanner: Replanner;
  private toolRuntime: ToolRuntime | null = null;

  constructor(config: SystemConfig, toolkit: Toolkit) {
    this.config = config;
    this.logger = createLogger(config);
    this.toolkit = toolkit;

    // Get tool runtime if available
    this.toolRuntime = toolkit.getRuntime() ?? null;

    // Get available tools
    const toolSpecs = toolkit.list();
    const toolIds = toolSpecs.map((t) => t.id);

    // Initialize Planner with available tool IDs
    this.planner = new Planner(config, toolIds);

    // Initialize Replanner with available tool specs
    this.replanner = new Replanner(this.logger, toolSpecs);
  }

  async execute(
    message: string,
    sessionId: string,
    agentId: string,
    userId: string
  ): Promise<ExecutionResult> {
    this.logger.info("Executing task", { message, sessionId });

    // Reset replanner state for new execution
    this.replanner.reset();

    const messages: SessionMessage[] = [];
    const outputs = new Map<string, unknown>();
    const errors = new Map<string, Error>();
    const completedSteps = new Set<string>();

    // Generate plan
    const plan = await this.planner.plan(message);

    // Add thought message
    messages.push({
      type: "thought",
      content: `Plan: ${plan.steps.map((s) => s.description).join(", ")}`,
      timestamp: Date.now(),
    });

    const startTime = Date.now();

    // Execute steps sequentially with recovery
    for (const step of plan.steps) {
      const stepResult = await this.executeStepWithRetry(
        step,
        plan.steps,
        completedSteps,
        sessionId,
        agentId,
        userId
      );

      if (stepResult.success) {
        completedSteps.add(step.id);
        outputs.set(step.id, stepResult.result);

        // Don't send step completion messages to avoid spam
        // Only send final result

        // Mark step success in replanner
        this.replanner.markStepSuccess(step.id);
      } else {
        errors.set(step.id, stepResult.error!);

        messages.push({
          type: "error",
          content: `Step "${step.description}" failed: ${stepResult.error!.message}`,
          timestamp: Date.now(),
          metadata: { stepId: step.id },
        });

        // Check if we should abort
        if (stepResult.abort) {
          this.logger.error("Execution aborted", { stepId: step.id });
          break;
        }
      }
    }

    const success = errors.size === 0;
    const recoveryStats = this.replanner.getStats();

    this.logger.info("Execution completed", {
      success,
      duration: Date.now() - startTime,
      recoveryStats,
    });

    return { success, outputs, errors, messages, recoveryStats };
  }

  /**
   * Execute a step with automatic retry and recovery
   */
  private async executeStepWithRetry(
    step: Step,
    allSteps: Step[],
    completedSteps: Set<string>,
    sessionId: string,
    agentId: string,
    userId: string,
    attemptCount: number = 0,
    alternativeAttemptCount: number = 0
  ): Promise<{
    success: boolean;
    result?: unknown;
    error?: Error;
    abort?: boolean;
  }> {
    try {
      const toolMessage = await this.executeStep(step, sessionId, agentId, userId);
      return { success: true, result: { completed: true } };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      this.logger.warn("Step execution failed, attempting recovery", {
        stepId: step.id,
        toolId: step.toolId,
        attemptCount,
        error: err.message,
      });

      // Create ToolFailure for replanner
      const failure: ToolFailure = {
        toolId: step.toolId || "",
        step,
        error: err,
        attemptCount,
        alternativeAttemptCount,
        timestamp: Date.now(),
      };

      // Create execution context
      const context: ExecutionContext = {
        sessionId,
        agentId,
        userId,
        remainingGoals: allSteps
          .filter((s) => !completedSteps.has(s.id) && s.id !== step.id)
          .map((s) => s.description),
        completedSteps: Array.from(completedSteps).map((id) =>
          allSteps.find((s) => s.id === id)!
        ),
        failedStep: step,
        startTime: Date.now(),
      };

      // Call replanner
      const recoveryPlan = await this.replanner.replan(failure, context);

      // Handle recovery plan
      switch (recoveryPlan.action) {
        case "RETRY": {
          this.logger.info(`Retrying step ${step.id}`, {
            reason: recoveryPlan.reason,
          });

          return this.executeStepWithRetry(
            step,
            allSteps,
            completedSteps,
            sessionId,
            agentId,
            userId,
            attemptCount + 1,
            alternativeAttemptCount
          );
        }

        case "ALTERNATIVE": {
          this.logger.info(`Using alternative tool for step ${step.id}`, {
            alternativeTool: recoveryPlan.toolId,
            reason: recoveryPlan.reason,
          });

          // Create alternative step
          const alternativeStep: Step = {
            ...step,
            toolId: recoveryPlan.toolId!,
          };

          return this.executeStepWithRetry(
            alternativeStep,
            allSteps,
            completedSteps,
            sessionId,
            agentId,
            userId,
            0,
            alternativeAttemptCount + 1
          );
        }

        case "APPROVAL": {
          this.logger.info(`Approval requested for step ${step.id}`, {
            message: recoveryPlan.message,
          });
          return {
            success: false,
            error: new Error(`Approval required: ${recoveryPlan.message}`),
            abort: true,
          };
        }

        case "ABORT": {
          this.logger.error(`Recovery aborted for step ${step.id}`, {
            reason: recoveryPlan.reason,
          });
          return { success: false, error: err, abort: true };
        }

        default:
          return { success: false, error: err, abort: true };
      }
    }
  }

  private async executeStep(
    step: Step,
    sessionId: string,
    agentId: string,
    userId: string
  ): Promise<SessionMessage | null> {
    if (!step.toolId) {
      this.logger.debug("Non-tool step (no toolId specified)", {
        stepId: step.id,
        description: step.description,
      });
      return null;
    }

    const tool = this.toolkit.get(step.toolId);
    if (!tool) {
      throw new Error(`Tool not found: ${step.toolId}`);
    }

    // Use ToolRuntime if available (supports approval flow)
    if (this.toolRuntime) {
      this.logger.debug(`Executing tool via ToolRuntime: ${step.toolId}`);

      const invokeResult = await this.toolRuntime.invoke(
        step.toolId,
        sessionId,
        step.input ?? {},
        agentId,
        userId
      );

      // Check if approval is required
      if (invokeResult.awaitingApproval) {
        this.logger.info(`Tool ${step.toolId} requires approval, awaiting user response`);

        // Return a special message indicating approval is needed
        return {
          type: "thought",
          content: `Tool '${step.toolId}' requires approval. Waiting for user response...`,
          timestamp: Date.now(),
          metadata: {
            stepId: step.id,
            toolId: step.toolId,
            invocationId: invokeResult.invocationId,
            awaitingApproval: true,
          },
        };
      }

      // Check for execution result
      if (invokeResult.result) {
        if (!invokeResult.result.ok) {
          throw new Error(invokeResult.result.error?.message ?? "Tool execution failed");
        }

        return {
          type: "tool",
          content: `Executed tool: ${step.toolId}`,
          timestamp: Date.now(),
          metadata: {
            stepId: step.id,
            toolId: step.toolId,
            result: invokeResult.result.data,
          },
        };
      }

      return null;
    }

    // Fallback: Direct tool execution (no approval support)
    this.logger.debug(`Executing tool directly: ${step.toolId} (no ToolRuntime)`);

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

  /**
   * Get recovery statistics
   */
  getRecoveryStats(): ReturnType<Replanner["getStats"]> {
    return this.replanner.getStats();
  }

  /**
   * Get remaining time before global timeout
   */
  getRemainingTime(): number {
    return this.replanner.getRemainingTime();
  }
}
