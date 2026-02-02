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
import type { Task } from "../types/index.js";
import type { SessionTaskMapper } from "./SessionTaskMapper.js";
import type { TaskResponse } from "../types/index.js";

type ApprovalCallback = (event: ApprovalRequestEvent) => void;
type ApprovalResolvedCallback = (event: ApprovalResolvedEvent) => void;

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

    // Listen for approval requested events
    this.toolRuntime.on("approvalRequested", ({ requestId, sessionId, toolId, input }) => {
      this.logger.info("Approval requested", { requestId, toolId, sessionId });

      // Find the task associated with this session via sessionTaskMapper
      const taskId = sessionTaskMapper.get(sessionId);
      const task = taskId ? this.registry.get(taskId) : undefined;

      if (task) {
        // Transition task to PAUSED state
        this.registry.updateState(task.id, "PAUSED");

        // Track pending approval
        this.pendingApprovals.set(requestId, {
          taskId: task.id,
          channelId: task.message.channelId,
          toolId,
          requestedAt: Date.now(),
        });

        // Notify about approval request via response callback
        this.responseCallback({
          taskId: task.id,
          channelId: task.message.channelId,
          text: `승인 필요: 도구 '${toolId}' 실행을 위한 승인이 필요합니다.`,
          status: "pending",
          metadata: {
            state: "PAUSED",
            approvalRequestId: requestId,
            toolId,
          },
        });

        // Emit approval request event for Gateway to broadcast
        this.emitApprovalRequest({
          taskId: task.id,
          channelId: task.message.channelId,
          toolId,
          input,
          requestId,
        });
      }
    });

    // Listen for approval resolved events
    this.toolRuntime.on("approvalResolved", ({ requestId, approved }) => {
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
        // Resume task: transition back to RUNNING
        this.registry.updateState(task.id, "RUNNING");

        // Resume processing
        this.resumeCallback(task.channelSessionId);

        // Emit approval resolved event
        this.emitApprovalResolved({
          taskId: task.id,
          channelId: task.message.channelId,
          approved: true,
          requestId,
        });
      } else {
        // Approval denied: abort task
        this.registry.updateState(task.id, "ABORTED", undefined, {
          code: "APPROVAL_DENIED",
          userMessage: "승인이 거부되어 작업이 중단되었습니다.",
          internalMessage: `Tool ${pending.toolId} approval denied`,
        });

        // Send response
        this.responseCallback({
          taskId: task.id,
          channelId: task.message.channelId,
          text: "승인이 거부되어 작업이 중단되었습니다.",
          status: "failed",
          metadata: { state: "ABORTED" },
        });

        // Clean up session mappings and queue (handled by caller)
        this.cleanupCallback(task.id);

        // Emit approval resolved event
        this.emitApprovalResolved({
          taskId: task.id,
          channelId: task.message.channelId,
          approved: false,
          requestId,
        });
      }
    });
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
   * Called when user responds to an approval request.
   */
  grantApproval(taskId: string, approved: boolean): boolean {
    const task = this.registry.get(taskId);
    if (!task) {
      return false;
    }

    // Only PAUSED tasks can be approved/denied
    if (task.state !== "PAUSED") {
      this.logger.warn("Cannot approve task not in PAUSED state", { taskId, state: task.state });
      return false;
    }

    // Find the approval request for this task
    let approvalRequestId: string | undefined;
    for (const [requestId, pending] of this.pendingApprovals.entries()) {
      if (pending.taskId === taskId) {
        approvalRequestId = requestId;
        break;
      }
    }

    if (!approvalRequestId) {
      this.logger.warn("No pending approval found for task", { taskId });
      return false;
    }

    // Emit approval resolved event (triggers setup logic)
    this.toolRuntime?.emit("approvalResolved", {
      requestId: approvalRequestId,
      approved,
    });

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
   * Called when a task is aborted.
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
   * Emit approval request event to all registered callbacks.
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

  /**
   * Clear all pending approvals.
   */
  shutdown(): void {
    this.pendingApprovals.clear();
  }
}
