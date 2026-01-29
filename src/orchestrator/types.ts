/**
 * Orchestrator Types
 */

import type { ChatMessage, TaskResponse, TaskState, Task, TaskError, TaskEvent } from "../types/index.js";

/**
 * Parameters for creating a new task.
 */
export interface CreateTaskParams {
  /** Original chat message */
  message: ChatMessage;
  /** Channel session identifier for queue mapping */
  channelSessionId: string;
}

/**
 * Result of task execution.
 */
export interface TaskResult {
  /** Task identifier */
  taskId: string;
  /** Final state */
  state: TaskState;
  /** Result text if successful */
  text?: string;
  /** Error details if failed */
  error?: TaskError;
}

/**
 * Configuration for the orchestrator.
 */
export interface OrchestratorConfig {
  /** Default timeout for task execution (ms) */
  taskTimeoutMs: number;
  /** Maximum queue size per channel */
  maxQueueSizePerChannel: number;
  /** Whether to emit debug events */
  debugEvents: boolean;
}

// Re-export types from main types module for convenience
export type { TaskState, Task, TaskError, TaskEvent, ChatMessage, TaskResponse };
