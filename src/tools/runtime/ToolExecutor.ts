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

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;  // 2MB

/** Error messages for tool execution */
const ToolExecutionErrorMessage = {
  INVALID_INPUT: 'Invalid input',
  TIMEOUT: 'Tool execution timeout',
  UNKNOWN_ERROR: 'Unknown error',
} as const;

// ============================================================================
// TYPES
// ============================================================================

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

type ExecutionResult =
  | { success: true; data: unknown; durationMs: number }
  | { success: false; error: Error; durationMs: number };

// ============================================================================
// ToolExecutor
// ============================================================================

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

  // ============================================================================
  // PUBLIC API
  // ============================================================================

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
    // Validate input first
    const validationResult = SchemaValidator.validateJsonSchema(tool.schema, input);
    if (!validationResult.success) {
      return {
        invocationId: "",
        result: this.createValidationErrorResult(validationResult.errors),
      };
    }

    // Create invocation record
    const invocationId = randomUUID();
    const invocation = this.createInvocation(
      invocationId,
      tool.id,
      sessionId,
      input,
      retryCount,
      parentInvocationId
    );

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

    // Check approval if required
    if (checkApproval && tool.requiresApproval && this.config.enableApprovals) {
      const approvalResult = await this.checkApprovalIfNeeded(tool.id, input, validationResult.data as Record<string, unknown>);
      if (approvalResult.approvalRequired) {
        invocation.status = "awaiting_approval";
        this.onInvocationUpdated(invocation);
        return { invocationId, awaitingApproval: true };
      }
    }

    // Execute tool
    return this.executeTool(tool, invocation, sessionId, agentId, userId, validationResult.data);
  }

  /**
   * Re-execute a tool with approval granted.
   * Note: Input was already validated in execute(), so we skip validation here.
   */
  async reExecuteAfterApproval(
    tool: ToolSpec,
    invocation: ToolInvocation
  ): Promise<ToolResult> {
    invocation.status = "running";
    this.onInvocationUpdated(invocation);
    this.onRunningCountChange(1);

    // Input was already validated in execute(), skip validation here
    const executionResult = await this.runToolWithTimeout(
      tool,
      invocation.input as never,
      this.createContext(invocation.sessionId, "", "")
    );

    return this.finalizeExecution(invocation, executionResult);
  }

  // ============================================================================
  // PRIVATE - Execution Core
  // ============================================================================

  /**
   * Execute tool and handle success/failure uniformly.
   */
  private async executeTool(
    tool: ToolSpec,
    invocation: ToolInvocation,
    sessionId: string,
    agentId: string,
    userId: string,
    validatedInput: unknown
  ): Promise<{ invocationId: string; result: ToolResult }> {
    const ctx = this.createContext(sessionId, agentId, userId);
    const executionResult = await this.runToolWithTimeout(tool, validatedInput as never, ctx);

    const result = this.finalizeExecution(invocation, executionResult);

    return { invocationId: invocation.id, result };
  }

  /**
   * Run tool with timeout, handling both success and failure cases.
   */
  private async runToolWithTimeout(
    tool: ToolSpec,
    validatedInput: unknown,
    ctx: ToolContext
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const timeoutMs = ctx.policy.timeoutMs;

    let timeoutId: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(ToolExecutionErrorMessage.TIMEOUT)), timeoutMs);
    });

    try {
      const data = await Promise.race([
        tool.run(validatedInput, ctx),
        timeoutPromise,
      ]);

      return { success: true, data, durationMs: Date.now() - startTime };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(ToolExecutionErrorMessage.UNKNOWN_ERROR),
        durationMs: Date.now() - startTime,
      };
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Finalize execution result (success or failure) and update invocation.
   */
  private finalizeExecution(
    invocation: ToolInvocation,
    executionResult: ExecutionResult
  ): ToolResult {
    this.onRunningCountChange(-1);

    const durationMs = executionResult.durationMs;
    invocation.endTime = Date.now();

    if (executionResult.success) {
      invocation.status = "completed";
      const result: ToolResult = {
        ok: true,
        data: executionResult.data,
        meta: { durationMs },
      };
      invocation.result = result;
      this.onInvocationUpdated(invocation);
      this.logger.info(`Tool invoked: ${invocation.toolId}`, { durationMs, sessionId: invocation.sessionId });
      return result;
    }

    invocation.status = "failed";
    const result: ToolResult = {
      ok: false,
      error: {
        code: "EXECUTION_ERROR",
        message: executionResult.error.message,
        details: executionResult.error instanceof Error ? executionResult.error.stack : undefined,
      },
      meta: { durationMs },
    };
    invocation.result = result;
    this.onInvocationUpdated(invocation);
    this.logger.error(`Tool execution failed: ${invocation.toolId}`, { error: executionResult.error });
    return result;
  }

  // ============================================================================
  // PRIVATE - Helpers
  // ============================================================================

  private createInvocation(
    id: string,
    toolId: string,
    sessionId: string,
    input: unknown,
    retryCount: number,
    parentInvocationId?: string
  ): ToolInvocation {
    return {
      id,
      toolId,
      sessionId,
      input,
      status: "running",
      startTime: Date.now(),
      retryCount,
      parentInvocationId,
    };
  }

  private createValidationErrorResult(errors: unknown): ToolResult {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "Input validation failed",
        details: errors,
      },
      meta: { durationMs: 0 },
    };
  }

  private createContext(sessionId: string, agentId: string, userId: string): ToolContext {
    const config = this.approvalManager.getConfig();
    return {
      sessionId,
      agentId,
      userId,
      config: this.systemConfig,
      workspaceRoot: this.config.workspaceRoot,
      policy: {
        allowlist: config?.allowlist.commands ?? [],
        denylist: config?.denylist.patterns ?? [],
        maxBytes: DEFAULT_MAX_BYTES,
        timeoutMs: this.config.defaultTimeoutMs,
      },
    };
  }

  private async checkApprovalIfNeeded(
    toolId: string,
    rawInput: unknown,
    validatedInput: Record<string, unknown>
  ): Promise<{ approvalRequired: boolean; approvalData?: unknown }> {
    if (toolId !== "system.run") {
      return { approvalRequired: false };
    }

    await this.approvalManager.loadConfig();

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
}
