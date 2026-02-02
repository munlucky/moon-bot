/**
 * Tool execution runtime with validation, approval, result formatting, and retry tracking.
 *
 * Refactored to use Facade pattern:
 * - ToolRegistry: manages tool registration
 * - ToolExecutor: handles tool execution
 * - ToolRuntime: coordinates and provides public API
 */

import { EventEmitter } from "events";
import type { ToolSpec, ToolContext, ToolResult, SystemConfig } from "../../types/index.js";
import { ToolRegistry } from "./ToolRegistry.js";
import { ToolExecutor, type RuntimeConfig } from "./ToolExecutor.js";
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

export class ToolRuntime extends EventEmitter {
  private registry: ToolRegistry;
  private executor: ToolExecutor;
  private invocations = new Map<string, ToolInvocation>();
  private approvalManager: ApprovalManager;
  private config: RuntimeConfig;
  private systemConfig: SystemConfig;
  private logger: Logger;
  private runningCount = 0;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly CLEANUP_INTERVAL_MS = 300000; // 5 minutes
  private readonly INVOCATION_TTL_MS = 3600000; // 1 hour

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
    this.registry = new ToolRegistry(this.logger);
    this.approvalManager = new ApprovalManager();

    // Initialize ToolExecutor with dependencies
    this.executor = new ToolExecutor({
      systemConfig: this.systemConfig,
      config: this.config,
      approvalManager: this.approvalManager,
      logger: this.logger,
      onInvocationCreated: (invocation) => {
        this.invocations.set(invocation.id, invocation);
      },
      onInvocationUpdated: (invocation) => {
        this.invocations.set(invocation.id, invocation);
      },
      onRunningCountChange: (delta) => {
        this.runningCount += delta;
      },
    });

    // Start automatic cleanup interval
    this.startCleanupInterval();
  }

  /**
   * Start the automatic cleanup interval for old invocations.
   */
  private startCleanupInterval(): void {
    if (this.cleanupInterval) {
      return; // Already started
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanup(this.INVOCATION_TTL_MS);
    }, this.CLEANUP_INTERVAL_MS);

    this.logger.debug("ToolRuntime cleanup interval started", {
      intervalMs: this.CLEANUP_INTERVAL_MS,
      ttlMs: this.INVOCATION_TTL_MS,
    });
  }

  /**
   * Stop the automatic cleanup interval.
   */
  private stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      this.logger.debug("ToolRuntime cleanup interval stopped");
    }
  }

  /**
   * Register a tool with the runtime.
   */
  register(spec: ToolSpec): void {
    this.registry.register(spec);
  }

  /**
   * Unregister a tool from the runtime.
   */
  unregister(id: string): void {
    this.registry.unregister(id);
  }

  /**
   * Get a tool by ID.
   */
  getTool(id: string): ToolSpec | undefined {
    return this.registry.get(id);
  }

  /**
   * List all registered tools.
   */
  listTools(): Array<{ id: string; description: string; schema: object; requiresApproval?: boolean }> {
    return this.registry.list();
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
   * Get the current number of running tool invocations.
   */
  getRunningCount(): number {
    return this.runningCount;
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
    const tool = this.registry.get(toolId);
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

    const result = await this.executor.execute(
      tool,
      sessionId,
      input,
      agentId,
      userId,
      retryCount,
      parentInvocationId,
      true // checkApproval
    );

    // Emit approval requested event if awaiting approval
    if (result.awaitingApproval) {
      this.emit(ToolRuntime.Events.APPROVAL_REQUESTED, {
        invocationId: result.invocationId,
        toolId,
        input,
        sessionId,
        userId,
      });
    }

    return result;
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

      // Emit approval resolved event
      this.emit(ToolRuntime.Events.APPROVAL_RESOLVED, {
        requestId: invocationId,
        approved: false,
      });

      return invocation.result;
    }

    // Re-execute with approval granted
    const tool = this.registry.get(invocation.toolId);
    if (!tool) {
      return {
        ok: false,
        error: { code: "TOOL_NOT_FOUND", message: "Tool not found" },
        meta: { durationMs: 0 },
      };
    }

    const result = await this.executor.reExecuteAfterApproval(tool, invocation);

    // Emit approval resolved event
    this.emit(ToolRuntime.Events.APPROVAL_RESOLVED, {
      requestId: invocationId,
      approved: true,
    });

    return result;
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

  /**
   * Shutdown the runtime and clean up resources.
   */
  shutdown(): void {
    this.stopCleanupInterval();
    this.invocations.clear();
    this.logger.info("ToolRuntime shutdown complete");
  }
}
