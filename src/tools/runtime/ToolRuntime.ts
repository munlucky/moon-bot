// Tool execution runtime with validation, approval, result formatting, and retry tracking

import { randomUUID } from "crypto";
import { EventEmitter } from "events";
import type { ToolSpec, ToolContext, ToolResult, SystemConfig } from "../../types/index.js";
import { SchemaValidator } from "./SchemaValidator.js";
import { ApprovalManager } from "./ApprovalManager.js";
import { createLogger, type Logger } from "../../utils/logger.js";

export interface ToolInvocation {
  id: string;
  toolId: string;
  sessionId: string;
  input: unknown;
  status: "pending" | "running" | "completed" | "failed" | "awaiting_approval";
  startTime: number;
  endTime?: number;
  result?: ToolResult;
  retryCount: number;  // Track retry attempts for Replanner
  parentInvocationId?: string;  // Track original invocation for retries
}

export interface RuntimeConfig {
  workspaceRoot: string;
  defaultTimeoutMs: number;
  maxConcurrent: number;
  enableApprovals: boolean;
}

export class ToolRuntime extends EventEmitter {
  private tools = new Map<string, ToolSpec>();
  private invocations = new Map<string, ToolInvocation>();
  private approvalManager: ApprovalManager;
  private config: RuntimeConfig;
  private systemConfig: SystemConfig;
  private logger: Logger;
  private runningCount = 0;

  static readonly Events = {
    APPROVAL_REQUESTED: "approval.requested",
    APPROVAL_RESOLVED: "approval.resolved",
  } as const;

  constructor(systemConfig: SystemConfig, runtimeConfig: Partial<RuntimeConfig> = {}) {
    super();
    this.systemConfig = systemConfig;
    this.config = {
      workspaceRoot: runtimeConfig.workspaceRoot ?? process.cwd(),
      defaultTimeoutMs: runtimeConfig.defaultTimeoutMs ?? 30000,
      maxConcurrent: runtimeConfig.maxConcurrent ?? 10,
      enableApprovals: runtimeConfig.enableApprovals ?? true,
    };
    this.logger = createLogger(systemConfig);
    this.approvalManager = new ApprovalManager();
  }

  /**
   * Register a tool with the runtime.
   */
  register(spec: ToolSpec): void {
    this.tools.set(spec.id, spec);
    this.logger.info(`Tool registered: ${spec.id}`);
  }

  /**
   * Unregister a tool from the runtime.
   */
  unregister(id: string): void {
    this.tools.delete(id);
    this.logger.info(`Tool unregistered: ${id}`);
  }

  /**
   * Get a tool by ID.
   */
  getTool(id: string): ToolSpec | undefined {
    return this.tools.get(id);
  }

  /**
   * List all registered tools.
   */
  listTools(): Array<{ id: string; description: string; schema: object; requiresApproval?: boolean }> {
    return Array.from(this.tools.values()).map((tool) => ({
      id: tool.id,
      description: tool.description,
      schema: tool.schema,
      requiresApproval: tool.requiresApproval,
    }));
  }

  /**
   * Get an invocation by ID.
   */
  getInvocation(id: string): ToolInvocation | undefined {
    return this.invocations.get(id);
  }

  /**
   * Get retry count for a tool invocation
   */
  getRetryCount(invocationId: string): number {
    const invocation = this.invocations.get(invocationId);
    return invocation?.retryCount ?? 0;
  }

  /**
   * Get all invocations for a session
   */
  getInvocationsBySession(sessionId: string): ToolInvocation[] {
    return Array.from(this.invocations.values()).filter(
      (inv) => inv.sessionId === sessionId
    );
  }

  /**
   * Invoke a tool with input validation and timeout.
   */
  async invoke(
    toolId: string,
    sessionId: string,
    input: unknown,
    agentId: string,
    userId: string,
    retryCount: number = 0,
    parentInvocationId?: string
  ): Promise<{ invocationId: string; result?: ToolResult; awaitingApproval?: boolean }> {
    const tool = this.tools.get(toolId);
    if (!tool) {
      return {
        invocationId: "",
        result: {
          ok: false,
          error: { code: "TOOL_NOT_FOUND", message: `Tool not found: ${toolId}` },
          meta: { durationMs: 0 },
        },
      };
    }

    // Check concurrent limit
    if (this.runningCount >= this.config.maxConcurrent) {
      return {
        invocationId: "",
        result: {
          ok: false,
          error: { code: "CONCURRENCY_LIMIT", message: "Too many concurrent tool invocations" },
          meta: { durationMs: 0 },
        },
      };
    }

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
      toolId,
      sessionId,
      input,
      status: "running",
      startTime: Date.now(),
      retryCount,
      parentInvocationId,
    };
    this.invocations.set(invocationId, invocation);
    this.runningCount++;

    // Log retry attempt
    if (retryCount > 0) {
      this.logger.info(`Tool retry invocation: ${toolId}`, {
        invocationId,
        retryCount,
        parentInvocationId,
      });
    }

    try {
      // Check approval for dangerous tools
      if (tool.requiresApproval && this.config.enableApprovals) {
        await this.approvalManager.loadConfig();

        const { approvalRequired } = await this.checkToolApproval(
          toolId,
          input,
          validationResult.data as Record<string, unknown>
        );

        if (approvalRequired) {
          invocation.status = "awaiting_approval";

          // Emit event for ApprovalFlowManager
          this.emit(ToolRuntime.Events.APPROVAL_REQUESTED, {
            invocationId,
            toolId,
            input,
            sessionId,
            userId,
          });

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
        this.runningCount--;

        this.logger.info(`Tool invoked: ${toolId}`, { durationMs, sessionId, retryCount });

        return { invocationId, result: formattedResult };
      } finally {
        // Always clear timeout to prevent memory leaks
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    } catch (error) {
      this.runningCount--;

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

      this.logger.error(`Tool execution failed: ${toolId}`, { error, retryCount });

      return { invocationId, result: errorResult };
    }
  }

  /**
   * Approve a pending tool invocation.
   */
  async approveRequest(invocationId: string, approved: boolean): Promise<ToolResult> {
    const invocation = this.invocations.get(invocationId);

    if (!invocation) {
      return {
        ok: false,
        error: { code: "INVOCATION_NOT_FOUND", message: "Invocation not found" },
        meta: { durationMs: 0 },
      };
    }

    if (invocation.status !== "awaiting_approval") {
      return {
        ok: false,
        error: { code: "INVALID_STATE", message: "Invocation is not awaiting approval" },
        meta: { durationMs: 0 },
      };
    }

    if (!approved) {
      invocation.status = "failed";
      invocation.endTime = Date.now();
      invocation.result = {
        ok: false,
        error: { code: "APPROVAL_DENIED", message: "Tool execution was not approved" },
        meta: { durationMs: 0 },
      };

      return invocation.result;
    }

    // Re-execute with approval granted
    const tool = this.tools.get(invocation.toolId);
    if (!tool) {
      return {
        ok: false,
        error: { code: "TOOL_NOT_FOUND", message: "Tool not found" },
        meta: { durationMs: 0 },
      };
    }

    invocation.status = "running";
    this.runningCount++;

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
        this.runningCount--;

        return formattedResult;
      } finally {
        // Always clear timeout to prevent memory leaks
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    } catch (error) {
      this.runningCount--;

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

      return errorResult;
    }
  }

  /**
   * Get pending approval requests.
   */
  getPendingApprovals(): ToolInvocation[] {
    return Array.from(this.invocations.values()).filter(
      (inv) => inv.status === "awaiting_approval"
    );
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

  /**
   * Clean up old invocations to prevent memory leaks.
   */
  cleanup(maxAgeMs: number = 3600000): void {
    const now = Date.now();
    const cutoff = now - maxAgeMs;

    for (const [id, invocation] of this.invocations.entries()) {
      if (
        invocation.endTime &&
        invocation.endTime < cutoff &&
        invocation.status !== "awaiting_approval"
      ) {
        this.invocations.delete(id);
      }
    }
  }

  /**
   * Get invocation statistics
   */
  getStats(): {
    totalInvocations: number;
    byStatus: Record<string, number>;
    avgRetryCount: number;
  } {
    const invocations = Array.from(this.invocations.values());
    const byStatus: Record<string, number> = {};
    let totalRetryCount = 0;

    for (const inv of invocations) {
      byStatus[inv.status] = (byStatus[inv.status] || 0) + 1;
      totalRetryCount += inv.retryCount;
    }

    return {
      totalInvocations: invocations.length,
      byStatus,
      avgRetryCount: invocations.length > 0 ? totalRetryCount / invocations.length : 0,
    };
  }
}
