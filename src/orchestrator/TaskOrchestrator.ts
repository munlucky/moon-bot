/**
 * TaskOrchestrator
 *
 * Main orchestrator that manages task lifecycle and per-channel execution queues.
 * Coordinates between Gateway (via RPC) and task execution logic.
 */

import type { Task, TaskState, TaskResponse } from "../types/index.js";
import type { CreateTaskParams, OrchestratorConfig, ApprovalRequestEvent, ApprovalResolvedEvent } from "./types.js";
import { TaskRegistry } from "./TaskRegistry.js";
import { PerChannelQueue } from "./PerChannelQueue.js";
import { ApprovalFlowCoordinator } from "./ApprovalFlowCoordinator.js";
import { SessionTaskMapper } from "./SessionTaskMapper.js";
import { createLogger, type Logger, type LayerLogger, runWithTraceAsync, getTraceContext } from "../utils/logger.js";
import type { SystemConfig } from "../types/index.js";
import type { Executor } from "../agents/executor.js";
import type { Toolkit } from "../tools/index.js";
import type { SessionManager } from "../sessions/manager.js";
import type { ExecutionResult } from "../agents/executor.js";
import type { ToolRuntime } from "../tools/runtime/ToolRuntime.js";

const DEFAULT_CONFIG: OrchestratorConfig = {
  taskTimeoutMs: 600000, // 10 minutes
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

export class TaskOrchestrator {
  private registry: TaskRegistry;
  private queue: PerChannelQueue<string>; // Queue stores task IDs
  private config: OrchestratorConfig;
  private logger: Logger;
  private layerLogger: LayerLogger;
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
  private approvalFlowCoordinator: ApprovalFlowCoordinator;
  private sessionTaskMapper: SessionTaskMapper;

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
    this.layerLogger = this.logger.forLayer("orchestrator");
    this.executor = deps?.executor ?? null;
    this.toolkit = deps?.toolkit ?? null;
    this.sessionManager = deps?.sessionManager ?? null;
    this.toolRuntime = deps?.toolRuntime ?? null;

    // Initialize approval flow coordinator
    this.approvalFlowCoordinator = new ApprovalFlowCoordinator({
      toolRuntime: this.toolRuntime,
      registry: this.registry,
      logger: this.logger,
      responseCallback: (response) => this.sendResponse(response),
      resumeCallback: (channelSessionId) => this.processChannel(channelSessionId),
      cleanupCallback: (taskId) => {
        this.cleanupSessionMappings(taskId);
        this.queue.dequeue(this.getChannelSessionIdForTask(taskId));
        this.queue.stopProcessing(this.getChannelSessionIdForTask(taskId));
      },
    });

    // Initialize session task mapper with TTL
    this.sessionTaskMapper = new SessionTaskMapper(this.logger, 3600000, 300000);

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
    this.approvalFlowCoordinator.setup(this.sessionTaskMapper);

    // Forward approval events from coordinator
    this.approvalFlowCoordinator.onApprovalRequest((event) => {
      // Emit approval request event to all registered callbacks
      for (const callback of this.approvalCallbacks) {
        try {
          callback(event);
        } catch (error) {
          this.logger.error("Approval callback error", { error });
        }
      }
    });
    this.approvalFlowCoordinator.onApprovalResolved((event) => {
      // Emit approval resolved event to all registered callbacks
      for (const callback of this.approvalResolvedCallbacks) {
        try {
          callback(event);
        } catch (error) {
          this.logger.error("Approval resolved callback error", { error });
        }
      }
    });
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
      this.approvalFlowCoordinator.cancelTaskApprovals(taskId);

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
    const startTime = Date.now();
    const traceCtx = getTraceContext();

    this.layerLogger.logInput("createTask", {
      channelSessionId: params.channelSessionId,
      messageText: params.message.text,
      traceId: traceCtx?.traceId,
    });

    const task = this.registry.create(params.message, params.channelSessionId);
    const enqueued = this.queue.enqueue(params.channelSessionId, task.id);

    if (!enqueued) {
      this.registry.updateState(task.id, "FAILED", undefined, {
        code: "QUEUE_FULL",
        userMessage: "대기열이 가득 찼습니다. 잠시 후 다시 시도해주세요.",
        internalMessage: `Channel ${params.channelSessionId} queue is full`,
      });
      this.layerLogger.logError("createTask", new Error("Queue full"), startTime);
      throw new Error("Queue full for channel: " + params.channelSessionId);
    }

    // Try to process this channel's queue
    this.processChannel(params.channelSessionId);

    const result = { taskId: task.id, state: task.state };
    this.layerLogger.logOutput("createTask", result, startTime);

    return result;
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
    return this.approvalFlowCoordinator.grantApproval(taskId, approved);
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
    return this.approvalFlowCoordinator.getPendingApprovals();
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

    const startTime = Date.now();
    this.layerLogger.logInput("executeTask", { taskId, channelSessionId });

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
      // Execute the task via executor layer
      const result = await runWithTraceAsync("executor", async () => {
        return this.executeTaskLogic(task);
      });

      // Track session to task mapping for approval handling
      if (result.sessionId) {
        this.sessionTaskMapper.set(result.sessionId, task.id);
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

      this.layerLogger.logOutput("executeTask", { taskId, success: true }, startTime);
    } catch (error) {
      clearTimeout(timeoutTimer);
      this.processingTimers.delete(taskId);

      this.layerLogger.logError("executeTask", error, startTime);

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
    if (!task) {return;}

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
    this.sessionTaskMapper.set(session.id, task.id);

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
    this.sessionTaskMapper.cleanupByTaskId(taskId);
  }

  /**
   * Get channel session ID for a task.
   */
  private getChannelSessionIdForTask(taskId: string): string {
    const task = this.registry.get(taskId);
    return task?.channelSessionId ?? "";
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

    // Shutdown session task mapper
    this.sessionTaskMapper.shutdown();

    // Shutdown approval flow coordinator
    this.approvalFlowCoordinator.shutdown();

    this.logger.info("TaskOrchestrator shutdown");
  }
}
