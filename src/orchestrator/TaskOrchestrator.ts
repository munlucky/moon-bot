/**
 * TaskOrchestrator
 *
 * Main orchestrator that manages task lifecycle and per-channel execution queues.
 * Coordinates between Gateway (via RPC) and task execution logic.
 */

import type { Task, TaskResponse, TaskState, ChatMessage } from "../types/index.js";
import type { CreateTaskParams, OrchestratorConfig, TaskResult, ApprovalRequestEvent, ApprovalResolvedEvent } from "./types.js";
import { TaskRegistry } from "./TaskRegistry.js";
import { PerChannelQueue } from "./PerChannelQueue.js";
import { createLogger, type Logger } from "../utils/logger.js";
import type { SystemConfig } from "../types/index.js";
import type { Executor } from "../agents/executor.js";
import type { Toolkit } from "../tools/index.js";
import type { SessionManager } from "../sessions/manager.js";
import type { ExecutionResult } from "../agents/executor.js";
import type { ToolRuntime } from "../tools/runtime/ToolRuntime.js";

const DEFAULT_CONFIG: OrchestratorConfig = {
  taskTimeoutMs: 30000, // 30 seconds
  maxQueueSizePerChannel: 100,
  debugEvents: false,
};

type ResponseCallback = (response: TaskResponse) => void;

type ApprovalCallback = (event: ApprovalRequestEvent) => void;
type ApprovalResolvedCallback = (event: ApprovalResolvedEvent) => void;

/**
 * Task state change event with channel information.
 */
export interface TaskStateChangeEvent {
  taskId: string;
  channelId: string;
  previousState: TaskState | null;
  newState: TaskState;
  timestamp: number;
}

type StateChangeCallback = (event: TaskStateChangeEvent) => void;

/**
 * Pending approval tracking.
 */
interface PendingApproval {
  taskId: string;
  channelId: string;
  toolId: string;
  requestedAt: number;
}

export class TaskOrchestrator {
  private registry: TaskRegistry;
  private queue: PerChannelQueue<string>; // Queue stores task IDs
  private config: OrchestratorConfig;
  private logger: Logger;
  private responseCallbacks: Set<ResponseCallback> = new Set();
  private stateChangeCallbacks: Set<StateChangeCallback> = new Set();
  private approvalCallbacks: Set<ApprovalCallback> = new Set();
  private approvalResolvedCallbacks: Set<ApprovalResolvedCallback> = new Set();
  private processingTimers: Map<string, NodeJS.Timeout> = new Map();
  private systemConfig: SystemConfig;
  private executor: Executor | null = null;
  private toolkit: Toolkit | null = null;
  private sessionManager: SessionManager | null = null;
  private toolRuntime: ToolRuntime | null = null;
  private pendingApprovals: Map<string, PendingApproval> = new Map();
  // Map session IDs to task IDs for approval handling
  private sessionTaskMap: Map<string, string> = new Map();

  constructor(
    systemConfig: SystemConfig,
    config?: Partial<OrchestratorConfig>,
    deps?: {
      executor?: Executor;
      toolkit?: Toolkit;
      sessionManager?: SessionManager;
      toolRuntime?: ToolRuntime;
    }
  ) {
    this.systemConfig = systemConfig;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.registry = new TaskRegistry();
    this.queue = new PerChannelQueue(this.config.maxQueueSizePerChannel);
    this.logger = createLogger(systemConfig);
    this.executor = deps?.executor ?? null;
    this.toolkit = deps?.toolkit ?? null;
    this.sessionManager = deps?.sessionManager ?? null;
    this.toolRuntime = deps?.toolRuntime ?? null;

    // Subscribe to task events for debugging and state change emission
    this.registry.onTaskEvent((event) => {
      if (this.config.debugEvents) {
        this.logger.debug("Task event", { event });
      }
      // Emit state change event with channelId
      const task = this.registry.get(event.taskId);
      if (task) {
        this.emitStateChange({
          taskId: event.taskId,
          channelId: task.message.channelId,
          previousState: event.previousState,
          newState: event.newState,
          timestamp: event.timestamp,
        });
      }
    });

    // Setup approval event handlers
    this.setupApprovalHandlers();
  }

  /**
   * Register a callback for task responses.
   */
  onResponse(callback: ResponseCallback): () => void {
    this.responseCallbacks.add(callback);
    return () => this.responseCallbacks.delete(callback);
  }

  /**
   * Register a callback for task state changes.
   */
  onTaskState(callback: StateChangeCallback): () => void {
    this.stateChangeCallbacks.add(callback);
    return () => this.stateChangeCallbacks.delete(callback);
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
   * Emit state change event to all registered callbacks.
   */
  private emitStateChange(event: TaskStateChangeEvent): void {
    for (const callback of this.stateChangeCallbacks) {
      try {
        callback(event);
      } catch (error) {
        this.logger.error("State change callback error", { error });
      }
    }
  }

  /**
   * Setup approval event handlers from ToolRuntime.
   */
  private setupApprovalHandlers(): void {
    if (!this.toolRuntime) {
      return;
    }

    // Listen for approval requested events
    this.toolRuntime.on("approvalRequested", ({ requestId, sessionId, toolId, input }) => {
      this.logger.info("Approval requested", { requestId, toolId, sessionId });

      // Find the task associated with this session via sessionTaskMap
      const taskId = this.sessionTaskMap.get(sessionId);
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
        this.sendResponse({
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
        this.processChannel(task.channelSessionId);

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
        this.sendResponse({
          taskId: task.id,
          channelId: task.message.channelId,
          text: "승인이 거부되어 작업이 중단되었습니다.",
          status: "failed",
          metadata: { state: "ABORTED" },
        });

        // Clean up session mappings and queue
        this.cleanupSessionMappings(task.id);
        this.queue.dequeue(task.channelSessionId);
        this.queue.stopProcessing(task.channelSessionId);

        // Process next task
        this.processChannel(task.channelSessionId);

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
   * Abort a running or paused task.
   */
  abortTask(taskId: string): boolean {
    const task = this.registry.get(taskId);
    if (!task) {
      return false;
    }

    // Can only abort PENDING, RUNNING, or PAUSED tasks
    if (task.state !== "PENDING" && task.state !== "RUNNING" && task.state !== "PAUSED") {
      this.logger.warn("Cannot abort task in state", { taskId, state: task.state });
      return false;
    }

    // Update state to ABORTED
    this.registry.updateState(taskId, "ABORTED", undefined, {
      code: "ABORTED",
      userMessage: "작업이 중단되었습니다.",
      internalMessage: "Task aborted by user request",
    });

    // Clear timeout if set
    const timer = this.processingTimers.get(taskId);
    if (timer) {
      clearTimeout(timer);
      this.processingTimers.delete(taskId);
    }

    // Remove from queue if pending
    if (task.state === "PENDING") {
      this.queue.remove(task.channelSessionId, taskId);
    }

    // Stop processing if this was the running task
    if (task.state === "RUNNING" || task.state === "PAUSED") {
      this.queue.dequeue(task.channelSessionId);
      this.queue.stopProcessing(task.channelSessionId);

      // Cancel any pending approvals
      for (const [requestId, pending] of this.pendingApprovals.entries()) {
        if (pending.taskId === taskId) {
          this.toolRuntime?.emit("approvalCancelled", { requestId });
          this.pendingApprovals.delete(requestId);
        }
      }

      // Process next task in channel
      this.processChannel(task.channelSessionId);
    }

    // Clean up session mappings
    this.cleanupSessionMappings(taskId);

    // Send response
    this.sendResponse({
      taskId,
      channelId: task.message.channelId,
      text: "작업이 중단되었습니다.",
      status: "failed",
      metadata: { state: "ABORTED" },
    });

    this.logger.info("Task aborted", { taskId });
    return true;
  }

  /**
   * Create a new task from a chat message.
   * Called by Gateway via RPC when receiving a chat.send request.
   */
  createTask(params: CreateTaskParams): { taskId: string; state: TaskState } {
    const task = this.registry.create(params.message, params.channelSessionId);
    const enqueued = this.queue.enqueue(params.channelSessionId, task.id);

    if (!enqueued) {
      this.registry.updateState(task.id, "FAILED", undefined, {
        code: "QUEUE_FULL",
        userMessage: "대기열이 가득 찼습니다. 잠시 후 다시 시도해주세요.",
        internalMessage: `Channel ${params.channelSessionId} queue is full`,
      });
      throw new Error("Queue full for channel: " + params.channelSessionId);
    }

    this.logger.info("Task created", {
      taskId: task.id,
      channelSessionId: params.channelSessionId,
    });

    // Try to process this channel's queue
    this.processChannel(params.channelSessionId);

    return {
      taskId: task.id,
      state: task.state,
    };
  }

  /**
   * Get task status.
   */
  getTask(taskId: string): Task | undefined {
    return this.registry.get(taskId);
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

    // Emit approval resolved event (triggers setupApprovalHandlers logic)
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
  getPendingApprovals(): Array<{
    taskId: string;
    channelId: string;
    toolId: string;
    requestedAt: number;
  }> {
    return Array.from(this.pendingApprovals.values()).map((p) => ({
      taskId: p.taskId,
      channelId: p.channelId,
      toolId: p.toolId,
      requestedAt: p.requestedAt,
    }));
  }

  /**
   * Process all pending tasks for a specific channel.
   * Ensures FIFO ordering within the channel.
   */
  private processChannel(channelSessionId: string): void {
    // If already processing, wait for current task to complete
    if (this.queue.isProcessing(channelSessionId)) {
      this.logger.debug("Channel already processing", { channelSessionId });
      return;
    }

    const nextTaskId = this.queue.peek(channelSessionId);
    if (!nextTaskId) {
      return; // No pending tasks
    }

    // Mark as processing and execute
    this.queue.startProcessing(channelSessionId);
    this.executeTask(nextTaskId, channelSessionId);
  }

  /**
   * Execute a single task.
   */
  private async executeTask(taskId: string, channelSessionId: string): Promise<void> {
    const task = this.registry.get(taskId);
    if (!task) {
      this.queue.dequeue(channelSessionId);
      this.queue.stopProcessing(channelSessionId);
      return;
    }

    // Update state to RUNNING
    this.registry.updateState(taskId, "RUNNING");

    // Set up timeout
    const timeoutTimer = setTimeout(() => {
      this.handleTaskError(taskId, {
        code: "TIMEOUT",
        userMessage: "요청 시간이 초과되었습니다. 다시 시도해주세요.",
        internalMessage: `Task exceeded ${this.config.taskTimeoutMs}ms timeout`,
      });
    }, this.config.taskTimeoutMs);

    this.processingTimers.set(taskId, timeoutTimer);

    try {
      // Execute the task (placeholder - calls existing Echo/Agent logic)
      const result = await this.executeTaskLogic(task);

      // Track session to task mapping for approval handling
      if (result.sessionId) {
        this.sessionTaskMap.set(result.sessionId, task.id);
      }

      // Clear timeout
      clearTimeout(timeoutTimer);
      this.processingTimers.delete(taskId);

      // Update state to DONE
      this.registry.updateState(taskId, "DONE", result.text);

      // Send response
      this.sendResponse({
        taskId,
        channelId: task.message.channelId,
        text: result.text,
        status: "completed",
        metadata: { state: "DONE" },
      });

      this.logger.info("Task completed", { taskId });
    } catch (error) {
      clearTimeout(timeoutTimer);
      this.processingTimers.delete(taskId);

      this.handleTaskError(taskId, {
        code: "EXECUTION_ERROR",
        userMessage: "요청 처리 중 오류가 발생했습니다.",
        internalMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    } finally {
      // Clean up session to task mapping
      this.cleanupSessionMappings(taskId);

      // Mark task as done in queue
      this.queue.dequeue(channelSessionId);
      this.queue.stopProcessing(channelSessionId);

      // Process next task in channel
      this.processChannel(channelSessionId);
    }
  }

  /**
   * Handle task execution error.
   */
  private handleTaskError(taskId: string, error: { code: string; userMessage: string; internalMessage?: string; stack?: string }): void {
    const task = this.registry.get(taskId);
    if (!task) return;

    this.registry.updateState(taskId, "FAILED", undefined, error);

    this.sendResponse({
      taskId,
      channelId: task.message.channelId,
      text: error.userMessage,
      status: "failed",
      metadata: {
        errorCode: error.code,
        state: "FAILED",
      },
    });

    this.logger.error("Task failed", {
      taskId,
      code: error.code,
      internalMessage: error.internalMessage,
    });
  }

  /**
   * Execute the actual task logic using Executor.
   */
  private async executeTaskLogic(task: Task): Promise<{ text: string; sessionId?: string }> {
    // If no executor configured, fall back to echo placeholder
    if (!this.executor || !this.sessionManager) {
      const { message } = task;
      await new Promise((resolve) => setTimeout(resolve, 100));
      return {
        text: `[Echo - No Executor] ${message.text}`,
      };
    }

    const { message } = task;

    // Get or create session for this task
    let session = this.sessionManager.getBySessionKey(task.channelSessionId);

    if (!session) {
      session = this.sessionManager.create(
        message.agentId,
        message.userId,
        message.channelId,
        task.channelSessionId
      );
    }

    // Set up session to task mapping BEFORE executing
    // This allows approvalRequested events to find the task during execution
    this.sessionTaskMap.set(session.id, task.id);

    // Add user message to session
    this.sessionManager.addMessage(session.id, {
      type: "user",
      content: message.text,
      timestamp: Date.now(),
      metadata: message.metadata,
    });

    // Execute using Executor
    const result: ExecutionResult = await this.executor.execute(
      message.text,
      session.id,
      message.agentId,
      message.userId
    );

    // Add execution messages to session
    for (const msg of result.messages) {
      this.sessionManager.addMessage(session.id, msg);
    }

    // Format response from execution result
    if (result.success) {
      const summaryMsg = result.messages.find((m) => m.type === "assistant" || m.type === "result");
      return {
        text: summaryMsg?.content ?? "작업이 완료되었습니다.",
        sessionId: session.id,
      };
    } else {
      // Format error messages
      const errorMessages = Array.from(result.errors.values())
        .map((e) => e.message)
        .join("; ");
      return {
        text: `실패: ${errorMessages || "알 수 없는 오류"}`,
        sessionId: session.id,
      };
    }
  }

  /**
   * Send response to all registered callbacks.
   */
  private sendResponse(response: TaskResponse): void {
    for (const callback of this.responseCallbacks) {
      try {
        callback(response);
      } catch (error) {
        this.logger.error("Response callback error", { error });
      }
    }
  }

  /**
   * Clean up old completed tasks.
   */
  cleanup(olderThanMs: number = 3600000): number {
    return this.registry.cleanup(olderThanMs);
  }

  /**
   * Get orchestrator statistics.
   */
  getStats(): {
    tasks: { total: number; byState: Record<TaskState, number> };
    queue: { channels: number; totalItems: number; processing: number };
  } {
    return {
      tasks: this.registry.getStats(),
      queue: this.queue.getStats(),
    };
  }

  /**
   * Clean up session-to-task mappings for a given task.
   * Call this when a task completes, fails, or is aborted.
   */
  private cleanupSessionMappings(taskId: string): void {
    const sessionIdsToRemove: string[] = [];
    for (const [sessionId, tid] of this.sessionTaskMap.entries()) {
      if (tid === taskId) {
        sessionIdsToRemove.push(sessionId);
      }
    }
    for (const sessionId of sessionIdsToRemove) {
      this.sessionTaskMap.delete(sessionId);
    }
    if (sessionIdsToRemove.length > 0) {
      this.logger.debug("Cleaned up session mappings", { taskId, count: sessionIdsToRemove.length });
    }
  }

  /**
   * Shutdown the orchestrator.
   */
  shutdown(): void {
    // Clear all timeout timers
    for (const timer of this.processingTimers.values()) {
      clearTimeout(timer);
    }
    this.processingTimers.clear();

    // Clear session to task mapping
    this.sessionTaskMap.clear();

    // Clear pending approvals
    this.pendingApprovals.clear();

    this.logger.info("TaskOrchestrator shutdown");
  }
}
