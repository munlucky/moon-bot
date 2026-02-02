/**
 * ApprovalFlowCoordinator
 *
 * Manages approval request flow for tool execution.
 * Coordinates between ToolRuntime and TaskOrchestrator for approval lifecycle.
 */

import type { ToolRuntime } from "../tools/runtime/ToolRuntime.js";
import type { Logger } from "../utils/logger.js";
import type { ApprovalRequestEvent, ApprovalResolvedEvent } from "./types.js";
import type { TaskRegistry } from "./TaskRegistry.js";
import type { SessionTaskMapper } from "./SessionTaskMapper.js";
import type { TaskResponse, Task } from "../types/index.js";

type ApprovalCallback = (event: ApprovalRequestEvent) => void;
type ApprovalResolvedCallback = (event: ApprovalResolvedEvent) => void;

/** Korean message constants for approval flow */
const ApprovalMessages = {
  REQUESTED: (toolId: string) => `승인 필요: 도구 '${toolId}' 실행을 위한 승인이 필요합니다.`,
  DENIED: "승인이 거부되어 작업이 중단되었습니다.",
} as const;

/**
 * Pending approval tracking.
 */
export interface PendingApproval {
  taskId: string;
  channelId: string;
  toolId: string;
  requestedAt: number;
}

/**
 * Response callback for sending task responses.
 */
export type ResponseCallback = (response: TaskResponse) => void;

/**
 * Callback for resuming task processing after approval.
 */
export type ResumeCallback = (channelSessionId: string) => void;

/**
 * Callback for cleaning up session mappings.
 */
export type CleanupCallback = (taskId: string) => void;

export interface ApprovalFlowCoordinatorDeps {
  toolRuntime: ToolRuntime | null;
  registry: TaskRegistry;
  logger: Logger;
  responseCallback: ResponseCallback;
  resumeCallback: ResumeCallback;
  cleanupCallback: CleanupCallback;
}

export class ApprovalFlowCoordinator {
  private toolRuntime: ToolRuntime | null;
  private registry: TaskRegistry;
  private logger: Logger;
  private responseCallback: ResponseCallback;
  private resumeCallback: ResumeCallback;
  private cleanupCallback: CleanupCallback;
  private approvalCallbacks: Set<ApprovalCallback> = new Set();
  private approvalResolvedCallbacks: Set<ApprovalResolvedCallback> = new Set();
  private pendingApprovals: Map<string, PendingApproval> = new Map();

  constructor(deps: ApprovalFlowCoordinatorDeps) {
    this.toolRuntime = deps.toolRuntime;
    this.registry = deps.registry;
    this.logger = deps.logger;
    this.responseCallback = deps.responseCallback;
    this.resumeCallback = deps.resumeCallback;
    this.cleanupCallback = deps.cleanupCallback;
  }

  /**
   * Setup approval event handlers from ToolRuntime.
   */
  setup(sessionTaskMapper: SessionTaskMapper): void {
    if (!this.toolRuntime) {
      return;
    }

    this.toolRuntime.on("approvalRequested", (data) =>
      this.handleApprovalRequested(data, sessionTaskMapper)
    );

    this.toolRuntime.on("approvalResolved", (data) =>
      this.handleApprovalResolved(data)
    );
  }

  /**
   * Register a callback for approval requests.
   */
  onApprovalRequest(callback: ApprovalCallback): () => void {
    this.approvalCallbacks.add(callback);
    return () => this.approvalCallbacks.delete(callback);
  }

  /**
   * Register a callback for approval resolved events.
   */
  onApprovalResolved(callback: ApprovalResolvedCallback): () => void {
    this.approvalResolvedCallbacks.add(callback);
    return () => this.approvalResolvedCallbacks.delete(callback);
  }

  /**
   * Grant or deny approval for a paused task.
   */
  grantApproval(taskId: string, approved: boolean): boolean {
    const task = this.registry.get(taskId);
    if (!task) {
      return false;
    }

    if (task.state !== "PAUSED") {
      this.logger.warn("Cannot approve task not in PAUSED state", { taskId, state: task.state });
      return false;
    }

    const approvalRequestId = this.findApprovalRequestId(taskId);
    if (!approvalRequestId) {
      this.logger.warn("No pending approval found for task", { taskId });
      return false;
    }

    this.toolRuntime?.emit("approvalResolved", { requestId: approvalRequestId, approved });
    this.logger.info("Approval processed", { taskId, approved });
    return true;
  }

  /**
   * Get pending approval requests.
   */
  getPendingApprovals(): PendingApproval[] {
    return Array.from(this.pendingApprovals.values());
  }

  /**
   * Cancel all pending approvals for a task.
   */
  cancelTaskApprovals(taskId: string): void {
    for (const [requestId, pending] of this.pendingApprovals.entries()) {
      if (pending.taskId === taskId) {
        this.toolRuntime?.emit("approvalCancelled", { requestId });
        this.pendingApprovals.delete(requestId);
      }
    }
  }

  /**
   * Clear all pending approvals.
   */
  shutdown(): void {
    this.pendingApprovals.clear();
  }

  /**
   * Handle approval requested event from ToolRuntime.
   * @private
   */
  private handleApprovalRequested(
    { requestId, sessionId, toolId, input }: { requestId: string; sessionId: string; toolId: string; input: unknown },
    sessionTaskMapper: SessionTaskMapper
  ): void {
    this.logger.info("Approval requested", { requestId, toolId, sessionId });

    const taskId = sessionTaskMapper.get(sessionId);
    const task = taskId ? this.registry.get(taskId) : undefined;

    if (!task) {
      return;
    }

    this.trackPendingApproval(requestId, task.id, task.message.channelId, toolId);
    this.pauseTask(task, requestId, toolId);
    this.emitApprovalRequest({ taskId: task.id, channelId: task.message.channelId, toolId, input, requestId });
  }

  /**
   * Handle approval resolved event from ToolRuntime.
   * @private
   */
  private handleApprovalResolved({ requestId, approved }: { requestId: string; approved: boolean }): void {
    this.logger.info("Approval resolved", { requestId, approved });

    const pending = this.pendingApprovals.get(requestId);
    if (!pending) {
      return;
    }

    const task = this.registry.get(pending.taskId);
    if (!task) {
      this.pendingApprovals.delete(requestId);
      return;
    }

    this.pendingApprovals.delete(requestId);

    if (approved) {
      this.resumeApprovedTask(task, requestId);
    } else {
      this.abortDeniedTask(task, pending, requestId);
    }
  }

  /**
   * Track a pending approval request.
   * @private
   */
  private trackPendingApproval(requestId: string, taskId: string, channelId: string, toolId: string): void {
    this.pendingApprovals.set(requestId, {
      taskId,
      channelId,
      toolId,
      requestedAt: Date.now(),
    });
  }

  /**
   * Pause a task and send pending response.
   * @private
   */
  private pauseTask(task: Task, requestId: string, toolId: string): void {
    this.registry.updateState(task.id, "PAUSED");

    this.responseCallback({
      taskId: task.id,
      channelId: task.message.channelId,
      text: ApprovalMessages.REQUESTED(toolId),
      status: "pending",
      metadata: {
        state: "PAUSED",
        approvalRequestId: requestId,
        toolId,
      },
    });
  }

  /**
   * Resume an approved task.
   * @private
   */
  private resumeApprovedTask(task: Task, requestId: string): void {
    this.registry.updateState(task.id, "RUNNING");
    this.resumeCallback(task.channelSessionId);
    this.emitApprovalResolved({
      taskId: task.id,
      channelId: task.message.channelId,
      approved: true,
      requestId,
    });
  }

  /**
   * Abort a task with denied approval.
   * @private
   */
  private abortDeniedTask(task: Task, pending: PendingApproval, requestId: string): void {
    this.registry.updateState(task.id, "ABORTED", undefined, {
      code: "APPROVAL_DENIED",
      userMessage: ApprovalMessages.DENIED,
      internalMessage: `Tool ${pending.toolId} approval denied`,
    });

    this.responseCallback({
      taskId: task.id,
      channelId: task.message.channelId,
      text: ApprovalMessages.DENIED,
      status: "failed",
      metadata: { state: "ABORTED" },
    });

    this.cleanupCallback(task.id);
    this.emitApprovalResolved({
      taskId: task.id,
      channelId: task.message.channelId,
      approved: false,
      requestId,
    });
  }

  /**
   * Find approval request ID for a task.
   * @private
   */
  private findApprovalRequestId(taskId: string): string | undefined {
    for (const [requestId, pending] of this.pendingApprovals.entries()) {
      if (pending.taskId === taskId) {
        return requestId;
      }
    }
    return undefined;
  }

  /**
   * Emit approval request event to all registered callbacks.
   * @private
   */
  private emitApprovalRequest(event: ApprovalRequestEvent): void {
    for (const callback of this.approvalCallbacks) {
      try {
        callback(event);
      } catch (error) {
        this.logger.error("Approval callback error", { error });
      }
    }
  }

  /**
   * Emit approval resolved event to all registered callbacks.
   * @private
   */
  private emitApprovalResolved(event: ApprovalResolvedEvent): void {
    for (const callback of this.approvalResolvedCallbacks) {
      try {
        callback(event);
      } catch (error) {
        this.logger.error("Approval resolved callback error", { error });
      }
    }
  }
}
