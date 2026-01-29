/**
 * TaskOrchestrator
 *
 * Main orchestrator that manages task lifecycle and per-channel execution queues.
 * Coordinates between Gateway (via RPC) and task execution logic.
 */

import type { Task, TaskResponse, TaskState, ChatMessage } from "../types/index.js";
import type { CreateTaskParams, OrchestratorConfig, TaskResult } from "./types.js";
import { TaskRegistry } from "./TaskRegistry.js";
import { PerChannelQueue } from "./PerChannelQueue.js";
import { createLogger, type Logger } from "../utils/logger.js";
import type { SystemConfig } from "../types/index.js";

const DEFAULT_CONFIG: OrchestratorConfig = {
  taskTimeoutMs: 30000, // 30 seconds
  maxQueueSizePerChannel: 100,
  debugEvents: false,
};

type ResponseCallback = (response: TaskResponse) => void;

export class TaskOrchestrator {
  private registry: TaskRegistry;
  private queue: PerChannelQueue<string>; // Queue stores task IDs
  private config: OrchestratorConfig;
  private logger: Logger;
  private responseCallbacks: Set<ResponseCallback> = new Set();
  private processingTimers: Map<string, NodeJS.Timeout> = new Map();
  private systemConfig: SystemConfig;

  constructor(systemConfig: SystemConfig, config?: Partial<OrchestratorConfig>) {
    this.systemConfig = systemConfig;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.registry = new TaskRegistry();
    this.queue = new PerChannelQueue(this.config.maxQueueSizePerChannel);
    this.logger = createLogger(systemConfig);

    // Subscribe to task events for debugging
    if (this.config.debugEvents) {
      this.registry.onTaskEvent((event) => {
        this.logger.debug("Task event", { event });
      });
    }
  }

  /**
   * Register a callback for task responses.
   */
  onResponse(callback: ResponseCallback): () => void {
    this.responseCallbacks.add(callback);
    return () => this.responseCallbacks.delete(callback);
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
   * Execute the actual task logic.
   * TODO: Integrate with existing Agent/Executor logic.
   */
  private async executeTaskLogic(task: Task): Promise<{ text: string }> {
    // Placeholder: Echo the message back
    // This will be replaced with actual Agent/Executor integration

    const { message } = task;

    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    // TODO: Call Agent Planner/Executor
    // For now, simple echo response
    return {
      text: `[Echo] ${message.text}`,
    };
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
   * Shutdown the orchestrator.
   */
  shutdown(): void {
    // Clear all timeout timers
    for (const timer of this.processingTimers.values()) {
      clearTimeout(timer);
    }
    this.processingTimers.clear();

    this.logger.info("TaskOrchestrator shutdown");
  }
}
