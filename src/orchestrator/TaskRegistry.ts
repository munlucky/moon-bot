/**
 * TaskRegistry
 *
 * In-memory storage for active and completed tasks.
 * Provides task lookup, state updates, and event emission.
 */

import type { Task, TaskState, TaskEvent } from "../types/index.js";
import { randomUUID } from "node:crypto";

type TaskEventListener = (event: TaskEvent) => void;

export class TaskRegistry {
  private tasks: Map<string, Task> = new Map();
  private listeners: Set<TaskEventListener> = new Set();

  /**
   * Create a new task with PENDING state.
   */
  create(message: { text: string; userId: string; channelId: string; agentId: string; metadata?: Record<string, unknown> }, channelSessionId: string): Task {
    const now = Date.now();
    const task: Task = {
      id: this.generateTaskId(),
      state: "PENDING",
      channelSessionId,
      message: {
        agentId: message.agentId,
        text: message.text,
        userId: message.userId,
        channelId: message.channelId,
        metadata: message.metadata,
      },
      createdAt: now,
      updatedAt: now,
    };

    this.tasks.set(task.id, task);
    this.emitEvent({
      taskId: task.id,
      previousState: null,
      newState: "PENDING",
      timestamp: now,
    });

    return task;
  }

  /**
   * Get a task by ID.
   */
  get(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Update task state.
   */
  updateState(taskId: string, newState: TaskState, result?: string, error?: { code: string; userMessage: string; internalMessage?: string; stack?: string }): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    const previousState = task.state;
    if (!this.isValidTransition(previousState, newState)) {
      return false;
    }

    task.state = newState;
    task.updatedAt = Date.now();

    if (result) {
      task.result = result;
    }

    if (error) {
      task.error = error;
    }

    this.emitEvent({
      taskId,
      previousState,
      newState,
      timestamp: task.updatedAt,
    });

    return true;
  }

  /**
   * Get all tasks for a specific channel session.
   */
  getByChannelSession(channelSessionId: string): Task[] {
    return Array.from(this.tasks.values()).filter(
      (task) => task.channelSessionId === channelSessionId
    );
  }

  /**
   * Get tasks by state.
   */
  getByState(state: TaskState): Task[] {
    return Array.from(this.tasks.values()).filter((task) => task.state === state);
  }

  /**
   * Clean up old completed tasks.
   */
  cleanup(olderThanMs: number): number {
    const cutoff = Date.now() - olderThanMs;
    let cleaned = 0;

    for (const [id, task] of this.tasks.entries()) {
      if (
        (task.state === "DONE" || task.state === "FAILED") &&
        task.updatedAt < cutoff
      ) {
        this.tasks.delete(id);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Subscribe to task state change events.
   */
  onTaskEvent(listener: TaskEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Generate unique task ID (UUID + timestamp).
   */
  private generateTaskId(): string {
    const uuid = randomUUID();
    const timestamp = Date.now();
    return `${uuid}-${timestamp}`;
  }

  /**
   * Validate state transition.
   */
  private isValidTransition(from: TaskState, to: TaskState): boolean {
    const validTransitions: Record<TaskState, TaskState[]> = {
      PENDING: ["RUNNING", "FAILED"],
      RUNNING: ["DONE", "FAILED"],
      FAILED: [],
      DONE: [],
    };

    return validTransitions[from]?.includes(to) ?? false;
  }

  /**
   * Emit event to all listeners.
   */
  private emitEvent(event: TaskEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("Task event listener error:", error);
      }
    }
  }

  /**
   * Get registry statistics.
   */
  getStats(): { total: number; byState: Record<TaskState, number> } {
    const byState: Record<TaskState, number> = {
      PENDING: 0,
      RUNNING: 0,
      FAILED: 0,
      DONE: 0,
    };

    for (const task of this.tasks.values()) {
      byState[task.state]++;
    }

    return {
      total: this.tasks.size,
      byState,
    };
  }
}
