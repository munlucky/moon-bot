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

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_CLEANUP_INTERVAL_MS = 300000;  // 5 minutes
const DEFAULT_INVOCATION_TTL_MS = 3600000;   // 1 hour
const DEFAULT_TIMEOUT_MS = 30000;            // 30 seconds
const DEFAULT_MAX_CONCURRENT = 10;
const DEFAULT_WORKSPACE_ROOT = process.cwd();

// ============================================================================
// ERROR RESULT CREATORS
// ============================================================================

function createToolNotFoundError(toolId: string): ToolResult {
  return {
    ok: false,
    error: { code: "TOOL_NOT_FOUND", message: `Tool not found: ${toolId}` },
    meta: { durationMs: 0 },
  };
}

function createConcurrencyLimitError(): ToolResult {
  return {
    ok: false,
    error: { code: "CONCURRENCY_LIMIT", message: "Too many concurrent tool invocations" },
    meta: { durationMs: 0 },
  };
}

function createInvocationNotFoundError(): ToolResult {
  return {
    ok: false,
    error: { code: "INVOCATION_NOT_FOUND", message: "Invocation not found" },
    meta: { durationMs: 0 },
  };
}

function createInvalidStateError(message: string): ToolResult {
  return {
    ok: false,
    error: { code: "INVALID_STATE", message },
    meta: { durationMs: 0 },
  };
}

function createApprovalDeniedError(): ToolResult {
  return {
    ok: false,
    error: { code: "APPROVAL_DENIED", message: "Tool execution was not approved" },
    meta: { durationMs: 0 },
  };
}

// ============================================================================
// TYPES
// ============================================================================

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
  private readonly CLEANUP_INTERVAL_MS: number;
  private readonly INVOCATION_TTL_MS: number;

  static readonly Events = {
    APPROVAL_REQUESTED: "approval.requested",
    APPROVAL_RESOLVED: "approval.resolved",
  } as const;

  constructor(
    systemConfig: SystemConfig,
    runtimeConfig: Partial<RuntimeConfig> = {},
    timingConfig?: { cleanupIntervalMs?: number; invocationTtlMs?: number }
  ) {
    super();
    this.systemConfig = systemConfig;
    this.config = this.buildRuntimeConfig(runtimeConfig);
    this.CLEANUP_INTERVAL_MS = timingConfig?.cleanupIntervalMs ?? DEFAULT_CLEANUP_INTERVAL_MS;
    this.INVOCATION_TTL_MS = timingConfig?.invocationTtlMs ?? DEFAULT_INVOCATION_TTL_MS;

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

  private buildRuntimeConfig(runtimeConfig: Partial<RuntimeConfig>): RuntimeConfig {
    return {
      workspaceRoot: runtimeConfig.workspaceRoot ?? DEFAULT_WORKSPACE_ROOT,
      defaultTimeoutMs: runtimeConfig.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxConcurrent: runtimeConfig.maxConcurrent ?? DEFAULT_MAX_CONCURRENT,
      enableApprovals: runtimeConfig.enableApprovals ?? true,
    };
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

  // ============================================================================
  // PUBLIC API - Tool Registration
  // ============================================================================

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

  // ============================================================================
  // PUBLIC API - Invocations
  // ============================================================================

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
   * Get invocation statistics.
   */
  getStats(): {
    totalInvocations: number;
    byStatus: Record<string, number>;
    avgRetryCount: number;
  } {
    const invocations = Array.from(this.invocations.values());

    const byStatus = invocations.reduce<Record<string, number>>((acc, inv) => {
      acc[inv.status] = (acc[inv.status] || 0) + 1;
      return acc;
    }, {});

    const totalRetryCount = invocations.reduce((sum, inv) => sum + inv.retryCount, 0);

    return {
      totalInvocations: invocations.length,
      byStatus,
      avgRetryCount: invocations.length > 0 ? totalRetryCount / invocations.length : 0,
    };
  }

  // ============================================================================
  // PUBLIC API - Tool Invocation
  // ============================================================================

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
      return { invocationId: "", result: createToolNotFoundError(toolId) };
    }

    if (this.runningCount >= this.config.maxConcurrent) {
      return { invocationId: "", result: createConcurrencyLimitError() };
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

  // ============================================================================
  // PUBLIC API - Approvals
  // ============================================================================

  /**
   * Approve a pending tool invocation.
   */
  async approveRequest(invocationId: string, approved: boolean): Promise<ToolResult> {
    const invocation = this.invocations.get(invocationId);

    if (!invocation) {
      return createInvocationNotFoundError();
    }

    if (invocation.status !== "awaiting_approval") {
      return createInvalidStateError("Invocation is not awaiting approval");
    }

    if (!approved) {
      return this.handleApprovalDenied(invocation);
    }

    return this.handleApprovalGranted(invocation);
  }

  /**
   * Get pending approval requests.
   */
  getPendingApprovals(): ToolInvocation[] {
    return Array.from(this.invocations.values()).filter(
      (inv) => inv.status === "awaiting_approval"
    );
  }

  // ============================================================================
  // PRIVATE - Approval Handling
  // ============================================================================

  private handleApprovalDenied(invocation: ToolInvocation): ToolResult {
    invocation.status = "failed";
    invocation.endTime = Date.now();
    invocation.result = createApprovalDeniedError();

    this.emit(ToolRuntime.Events.APPROVAL_RESOLVED, {
      requestId: invocation.id,
      approved: false,
    });

    return invocation.result;
  }

  private async handleApprovalGranted(invocation: ToolInvocation): Promise<ToolResult> {
    const tool = this.registry.get(invocation.toolId);
    if (!tool) {
      return createToolNotFoundError(invocation.toolId);
    }

    const result = await this.executor.reExecuteAfterApproval(tool, invocation);

    this.emit(ToolRuntime.Events.APPROVAL_RESOLVED, {
      requestId: invocation.id,
      approved: true,
    });

    return result;
  }

  // ============================================================================
  // PRIVATE - Cleanup
  // ============================================================================

  /**
   * Clean up old invocations to prevent memory leaks.
   */
  cleanup(maxAgeMs: number = this.INVOCATION_TTL_MS): void {
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
   * Shutdown the runtime and clean up resources.
   */
  shutdown(): void {
    this.stopCleanupInterval();
    this.invocations.clear();
    this.logger.info("ToolRuntime shutdown complete");
  }
}
