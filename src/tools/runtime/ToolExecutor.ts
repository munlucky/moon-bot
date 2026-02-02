/**
 * ToolExecutor
 *
 * Handles tool execution with timeout and error handling.
 * Single responsibility: execute tools and manage running count.
 */

import { randomUUID } from "crypto";
import type { ToolSpec, ToolContext, ToolResult, SystemConfig } from "../../types/index.js";
import { SchemaValidator } from "./SchemaValidator.js";
import { ApprovalManager } from "./ApprovalManager.js";
import { createLogger, type Logger } from "../../utils/logger.js";
import type { ToolInvocation } from "./ToolRuntime.js";

export interface RuntimeConfig {
  workspaceRoot: string;
  defaultTimeoutMs: number;
  maxConcurrent: number;
  enableApprovals: boolean;
}

export interface ToolExecutorDeps {
  systemConfig: SystemConfig;
  config: RuntimeConfig;
  approvalManager: ApprovalManager;
  logger: Logger;
  onInvocationCreated: (invocation: ToolInvocation) => void;
  onInvocationUpdated: (invocation: ToolInvocation) => void;
  onRunningCountChange: (delta: number) => void;
}

export class ToolExecutor {
  private systemConfig: SystemConfig;
  private config: RuntimeConfig;
  private approvalManager: ApprovalManager;
  private logger: Logger;
  private onInvocationCreated: (invocation: ToolInvocation) => void;
  private onInvocationUpdated: (invocation: ToolInvocation) => void;
  private onRunningCountChange: (delta: number) => void;

  constructor(deps: ToolExecutorDeps) {
    this.systemConfig = deps.systemConfig;
    this.config = deps.config;
    this.approvalManager = deps.approvalManager;
    this.logger = deps.logger;
    this.onInvocationCreated = deps.onInvocationCreated;
    this.onInvocationUpdated = deps.onInvocationUpdated;
    this.onRunningCountChange = deps.onRunningCountChange;
  }

  /**
   * Execute a tool with input validation and timeout.
   * @returns { invocationId, result, awaitingApproval }
   */
  async execute(
    tool: ToolSpec,
    sessionId: string,
    input: unknown,
    agentId: string,
    userId: string,
    retryCount: number = 0,
    parentInvocationId?: string,
    checkApproval: boolean = true
  ): Promise<{ invocationId: string; result?: ToolResult; awaitingApproval?: boolean }> {
    // Validate input
    const validationResult = SchemaValidator.validateJsonSchema(tool.schema, input);
    if (!validationResult.success) {
      return {
        invocationId: "",
        result: {
          ok: false,
          error: {
            code: "INVALID_INPUT",
            message: "Input validation failed",
            details: validationResult.errors,
          },
          meta: { durationMs: 0 },
        },
      };
    }

    const invocationId = randomUUID();
    const invocation: ToolInvocation = {
      id: invocationId,
      toolId: tool.id,
      sessionId,
      input,
      status: "running",
      startTime: Date.now(),
      retryCount,
      parentInvocationId,
    };

    this.onInvocationCreated(invocation);
    this.onRunningCountChange(1);

    // Log retry attempt
    if (retryCount > 0) {
      this.logger.info(`Tool retry invocation: ${tool.id}`, {
        invocationId,
        retryCount,
        parentInvocationId,
      });
    }

    try {
      // Check approval for dangerous tools
      if (checkApproval && tool.requiresApproval && this.config.enableApprovals) {
        await this.approvalManager.loadConfig();

        const { approvalRequired } = await this.checkToolApproval(
          tool.id,
          input,
          validationResult.data as Record<string, unknown>
        );

        if (approvalRequired) {
          invocation.status = "awaiting_approval";
          this.onInvocationUpdated(invocation);
          return { invocationId, awaitingApproval: true };
        }
      }

      // Execute tool
      const ctx = this.createContext(sessionId, agentId, userId);
      const startTime = Date.now();

      // Create timeout with cleanup
      let timeoutId: NodeJS.Timeout | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("Tool execution timeout")),
          ctx.policy.timeoutMs
        );
      });

      try {
        const result = await Promise.race([
          tool.run(validationResult.data as never, ctx),
          timeoutPromise,
        ]);

        const durationMs = Date.now() - startTime;

        // Format result
        const formattedResult: ToolResult = {
          ok: true,
          data: result,
          meta: { durationMs },
        };

        invocation.status = "completed";
        invocation.endTime = Date.now();
        invocation.result = formattedResult;
        this.onInvocationUpdated(invocation);
        this.onRunningCountChange(-1);

        this.logger.info(`Tool invoked: ${tool.id}`, { durationMs, sessionId, retryCount });

        return { invocationId, result: formattedResult };
      } finally {
        // Always clear timeout to prevent memory leaks
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    } catch (error) {
      this.onRunningCountChange(-1);

      const durationMs = Date.now() - invocation.startTime;
      invocation.status = "failed";
      invocation.endTime = Date.now();

      const errorResult: ToolResult = {
        ok: false,
        error: {
          code: "EXECUTION_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
          details: error instanceof Error ? error.stack : undefined,
        },
        meta: { durationMs },
      };

      invocation.result = errorResult;
      this.onInvocationUpdated(invocation);

      this.logger.error(`Tool execution failed: ${tool.id}`, { error, retryCount });

      return { invocationId, result: errorResult };
    }
  }

  /**
   * Re-execute a tool with approval granted.
   */
  async reExecuteAfterApproval(
    tool: ToolSpec,
    invocation: ToolInvocation
  ): Promise<ToolResult> {
    invocation.status = "running";
    this.onInvocationUpdated(invocation);
    this.onRunningCountChange(1);

    try {
      const ctx = this.createContext(invocation.sessionId, "", "");
      const startTime = Date.now();

      // Create timeout with cleanup
      let timeoutId: NodeJS.Timeout | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("Tool execution timeout")),
          ctx.policy.timeoutMs
        );
      });

      const validationResult = SchemaValidator.validateJsonSchema(tool.schema, invocation.input);
      if (!validationResult.success) {
        throw new Error("Invalid input");
      }

      try {
        const result = await Promise.race([
          tool.run(validationResult.data as never, ctx),
          timeoutPromise,
        ]);

        const durationMs = Date.now() - startTime;

        const formattedResult: ToolResult = {
          ok: true,
          data: result,
          meta: { durationMs },
        };

        invocation.status = "completed";
        invocation.endTime = Date.now();
        invocation.result = formattedResult;
        this.onInvocationUpdated(invocation);
        this.onRunningCountChange(-1);

        return formattedResult;
      } finally {
        // Always clear timeout to prevent memory leaks
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    } catch (error) {
      this.onRunningCountChange(-1);

      const durationMs = Date.now() - invocation.startTime;
      invocation.status = "failed";
      invocation.endTime = Date.now();

      const errorResult: ToolResult = {
        ok: false,
        error: {
          code: "EXECUTION_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        meta: { durationMs },
      };

      invocation.result = errorResult;
      this.onInvocationUpdated(invocation);

      return errorResult;
    }
  }

  /**
   * Create a ToolContext for tool execution.
   */
  private createContext(sessionId: string, agentId: string, userId: string): ToolContext {
    return {
      sessionId,
      agentId,
      userId,
      config: this.systemConfig,
      workspaceRoot: this.config.workspaceRoot,
      policy: {
        allowlist: this.approvalManager.getConfig()?.allowlist.commands ?? [],
        denylist: this.approvalManager.getConfig()?.denylist.patterns ?? [],
        maxBytes: 2 * 1024 * 1024, // 2MB default
        timeoutMs: this.config.defaultTimeoutMs,
      },
    };
  }

  /**
   * Check if tool requires approval.
   */
  private async checkToolApproval(
    toolId: string,
    rawInput: unknown,
    validatedInput: Record<string, unknown>
  ): Promise<{ approvalRequired: boolean; approvalData?: unknown }> {
    // Special handling for system.run tool
    if (toolId === "system.run") {
      const command = validatedInput.argv as string | string[];
      const cwd = validatedInput.cwd as string;

      const approval = await this.approvalManager.checkApproval(
        command,
        cwd,
        this.config.workspaceRoot
      );

      return {
        approvalRequired: !approval.approved,
        approvalData: approval.reason,
      };
    }

    return { approvalRequired: false };
  }
}
