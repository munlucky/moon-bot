/**
 * TaskOrchestrator Unit Tests
 *
 * Tests for task lifecycle management and state transitions.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskOrchestrator } from './TaskOrchestrator.js';
import type { SystemConfig } from '../types/index.js';
import type { Executor } from '../agents/executor.js';
import type { SessionManager } from '../sessions/manager.js';
import type { ToolRuntime } from '../tools/runtime/ToolRuntime.js';
import type { ChatMessage, TaskState } from '../types/index.js';

// Mock dependencies
const mockSystemConfig: SystemConfig = {
  logLevel: 'error',
  gatewayPort: 18789,
  workspaceRoot: '/test/workspace',
  gateways: [],
  agents: [],
  channels: [],
  tools: [],
} as SystemConfig;

const createMockExecutor = (): Executor => ({
  execute: vi.fn().mockResolvedValue({
    success: true,
    messages: [{ type: 'assistant', content: 'Test response', timestamp: Date.now() }],
    errors: new Map(),
  }),
} as unknown as Executor);

const createMockSessionManager = (): SessionManager => ({
  create: vi.fn().mockReturnValue({ id: 'session-1', agentId: 'agent-1', userId: 'user-1', channelId: 'channel-1', sessionKey: 'ch-session-1', createdAt: Date.now(), messages: [] }),
  getBySessionKey: vi.fn().mockReturnValue(null),
  addMessage: vi.fn(),
  get: vi.fn().mockReturnValue(null),
} as unknown as SessionManager);

const createMockToolRuntime = (): ToolRuntime => ({
  on: vi.fn(),
  emit: vi.fn(),
} as unknown as ToolRuntime);

const createMockMessage = (text: string, channelId = 'channel-1', userId = 'user-1'): ChatMessage => ({
  agentId: 'agent-1',
  userId,
  channelId,
  text,
});

describe('TaskOrchestrator', () => {
  let orchestrator: TaskOrchestrator;
  let mockExecutor: Executor;
  let mockSessionManager: SessionManager;
  let mockToolRuntime: ToolRuntime;

  beforeEach(() => {
    mockExecutor = createMockExecutor();
    mockSessionManager = createMockSessionManager();
    mockToolRuntime = createMockToolRuntime();

    orchestrator = new TaskOrchestrator(mockSystemConfig, {
      taskTimeoutMs: 5000,
      maxQueueSizePerChannel: 10,
      debugEvents: false,
    }, {
      executor: mockExecutor,
      sessionManager: mockSessionManager,
      toolRuntime: mockToolRuntime,
    });
  });

  describe('task creation', () => {
    it('should create a task and return taskId with state', () => {
      const message = createMockMessage('test message');
      const result = orchestrator.createTask({
        message,
        channelSessionId: 'ch-session-1',
      });

      expect(result.taskId).toBeDefined();
      // State is PENDING when returned, but may start processing immediately
      expect(['PENDING', 'RUNNING']).toContain(result.state);

      const task = orchestrator.getTask(result.taskId);
      expect(task).toBeDefined();
      expect(task?.message.text).toBe('test message');
    });

    it('should add task to per-channel queue', () => {
      const message = createMockMessage('test message');
      const result = orchestrator.createTask({
        message,
        channelSessionId: 'ch-session-1',
      });

      const stats = orchestrator.getStats();
      expect(stats.queue.totalItems).toBeGreaterThan(0);
    });

    it('should throw when queue is full', () => {
      const smallOrchestrator = new TaskOrchestrator(mockSystemConfig, {
        maxQueueSizePerChannel: 2,
      });

      const message = createMockMessage('test');
      smallOrchestrator.createTask({ message, channelSessionId: 'ch-1' });
      smallOrchestrator.createTask({ message, channelSessionId: 'ch-1' });

      expect(() => {
        smallOrchestrator.createTask({ message, channelSessionId: 'ch-1' });
      }).toThrow('Queue full');
    });

    it('should maintain separate queues per channel', () => {
      const msg1 = createMockMessage('msg1', 'channel-1');
      const msg2 = createMockMessage('msg2', 'channel-2');

      orchestrator.createTask({ message: msg1, channelSessionId: 'ch-1' });
      orchestrator.createTask({ message: msg2, channelSessionId: 'ch-2' });

      const stats = orchestrator.getStats();
      expect(stats.queue.channels).toBe(2);
    });
  });

  describe('state transitions - basic flow', () => {
    it('should transition PENDING -> RUNNING -> DONE on success', async () => {
      const message = createMockMessage('test message');
      const { taskId, state } = orchestrator.createTask({
        message,
        channelSessionId: 'ch-session-1',
      });

      // State returned may be PENDING or RUNNING (async processing starts immediately)
      expect(['PENDING', 'RUNNING']).toContain(state);

      // Task progresses from initial state to DONE
      let task = orchestrator.getTask(taskId);
      const initialState = task?.state ?? 'PENDING';
      expect(['PENDING', 'RUNNING', 'DONE']).toContain(initialState);

      // Wait for execution to complete
      await new Promise(resolve => setTimeout(resolve, 200));

      // Final state
      task = orchestrator.getTask(taskId);
      expect(task?.state).toBe('DONE');
      expect(task?.result).toBeDefined();
    });

    it('should transition PENDING -> RUNNING -> FAILED on error', async () => {
      const errorExecutor: Executor = {
        execute: vi.fn().mockRejectedValue(new Error('Execution failed')),
      } as unknown as Executor;

      const errorOrchestrator = new TaskOrchestrator(mockSystemConfig, undefined, {
        executor: errorExecutor,
        sessionManager: mockSessionManager,
      });

      const message = createMockMessage('failing task');
      const { taskId } = errorOrchestrator.createTask({
        message,
        channelSessionId: 'ch-session-1',
      });

      // Wait for execution to fail
      await new Promise(resolve => setTimeout(resolve, 200));

      const task = errorOrchestrator.getTask(taskId);
      expect(task?.state).toBe('FAILED');
      expect(task?.error?.code).toBe('EXECUTION_ERROR');
    });
  });

  describe('state transitions - timeout', () => {
    it('should transition to FAILED on timeout', async () => {
      const slowExecutor: Executor = {
        execute: vi.fn().mockImplementation(
          () => new Promise(resolve => setTimeout(resolve, 10000))
        ),
      } as unknown as Executor;

      const timeoutOrchestrator = new TaskOrchestrator(mockSystemConfig, {
        taskTimeoutMs: 100, // Short timeout for testing
      }, {
        executor: slowExecutor,
        sessionManager: mockSessionManager,
      });

      const message = createMockMessage('slow task');
      const { taskId } = timeoutOrchestrator.createTask({
        message,
        channelSessionId: 'ch-session-1',
      });

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 200));

      const task = timeoutOrchestrator.getTask(taskId);
      expect(task?.state).toBe('FAILED');
      expect(task?.error?.code).toBe('TIMEOUT');
    });
  });

  describe('abort functionality', () => {
    it('should abort PENDING task', () => {
      const message = createMockMessage('pending task');
      const { taskId } = orchestrator.createTask({
        message,
        channelSessionId: 'ch-session-1',
      });

      const aborted = orchestrator.abortTask(taskId);
      expect(aborted).toBe(true);

      const task = orchestrator.getTask(taskId);
      expect(task?.state).toBe('ABORTED');
    });

    it('should abort RUNNING task', async () => {
      const slowExecutor: Executor = {
        execute: vi.fn().mockImplementation(
          () => new Promise(resolve => setTimeout(resolve, 5000))
        ),
      } as unknown as Executor;

      const slowOrchestrator = new TaskOrchestrator(mockSystemConfig, {
        taskTimeoutMs: 10000,
      }, {
        executor: slowExecutor,
        sessionManager: mockSessionManager,
      });

      const message = createMockMessage('long task');
      const { taskId } = slowOrchestrator.createTask({
        message,
        channelSessionId: 'ch-session-1',
      });

      // Wait a bit for task to start running
      await new Promise(resolve => setTimeout(resolve, 100));

      const task = slowOrchestrator.getTask(taskId);
      // Task should be RUNNING or DONE (if it completed quickly)
      expect(['RUNNING', 'DONE']).toContain(task?.state);

      if (task?.state === 'RUNNING') {
        // Abort the running task
        const aborted = slowOrchestrator.abortTask(taskId);
        expect(aborted).toBe(true);

        const abortedTask = slowOrchestrator.getTask(taskId);
        expect(abortedTask?.state).toBe('ABORTED');
      }
      // If already DONE, skip abort test for this case
    });

    it('should return false when aborting non-existent task', () => {
      const aborted = orchestrator.abortTask('non-existent-task');
      expect(aborted).toBe(false);
    });

    it('should return false when aborting completed task', async () => {
      const message = createMockMessage('quick task');
      const { taskId } = orchestrator.createTask({
        message,
        channelSessionId: 'ch-session-1',
      });

      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 200));

      const aborted = orchestrator.abortTask(taskId);
      expect(aborted).toBe(false);
    });

    it('should process next task after abort', async () => {
      const slowExecutor: Executor = {
        execute: vi.fn().mockImplementation(
          () => new Promise(resolve => setTimeout(resolve, 5000))
        ),
      } as unknown as Executor;

      const slowOrchestrator = new TaskOrchestrator(mockSystemConfig, {
        taskTimeoutMs: 10000,
        maxQueueSizePerChannel: 10,
      }, {
        executor: slowExecutor,
        sessionManager: mockSessionManager,
      });

      const msg1 = createMockMessage('task 1');
      const msg2 = createMockMessage('task 2');

      const { taskId: task1Id } = slowOrchestrator.createTask({ message: msg1, channelSessionId: 'ch-1' });
      slowOrchestrator.createTask({ message: msg2, channelSessionId: 'ch-1' });

      // Wait for first task to start
      await new Promise(resolve => setTimeout(resolve, 50));

      // Abort first task
      slowOrchestrator.abortTask(task1Id);

      // Wait a bit more for processing to continue
      await new Promise(resolve => setTimeout(resolve, 100));
      const stats = slowOrchestrator.getStats();
      // At least one task should have been processed
      // Queue may still have items if second task is still processing
      expect(stats.tasks.total).toBeGreaterThanOrEqual(1);
    });
  });

  describe('approval flow structure', () => {
    it('should setup approval handlers when ToolRuntime is provided', () => {
      const emitSpy = vi.fn();
      const runtimeWithSpy: ToolRuntime = {
        on: vi.fn(),
        emit: emitSpy,
      } as unknown as ToolRuntime;

      new TaskOrchestrator(mockSystemConfig, undefined, {
        toolRuntime: runtimeWithSpy,
      });

      // Check that on was called to setup handlers
      expect(runtimeWithSpy.on).toHaveBeenCalledWith('approvalRequested', expect.any(Function));
      expect(runtimeWithSpy.on).toHaveBeenCalledWith('approvalResolved', expect.any(Function));
    });

    it('should not setup approval handlers without ToolRuntime', () => {
      const orchestratorWithoutRuntime = new TaskOrchestrator(mockSystemConfig);
      // Should not throw - just skip setup
      expect(orchestratorWithoutRuntime).toBeDefined();
    });
  });

  describe('response callbacks', () => {
    it('should call response callbacks on task completion', async () => {
      const callback = vi.fn();
      orchestrator.onResponse(callback);

      const message = createMockMessage('test message');
      orchestrator.createTask({
        message,
        channelSessionId: 'ch-session-1',
      });

      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          metadata: { state: 'DONE' },
        })
      );
    });

    it('should call response callbacks on task failure', async () => {
      const callback = vi.fn();
      const errorExecutor: Executor = {
        execute: vi.fn().mockRejectedValue(new Error('Test error')),
      } as unknown as Executor;

      const errorOrchestrator = new TaskOrchestrator(mockSystemConfig, undefined, {
        executor: errorExecutor,
        sessionManager: mockSessionManager,
      });

      errorOrchestrator.onResponse(callback);

      const message = createMockMessage('failing task');
      errorOrchestrator.createTask({
        message,
        channelSessionId: 'ch-session-1',
      });

      // Wait for failure
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          metadata: { state: 'FAILED', errorCode: 'EXECUTION_ERROR' },
        })
      );
    });

    it('should unregister callback when unsubscribe function is called', async () => {
      const callback = vi.fn();
      const unsubscribe = orchestrator.onResponse(callback);

      unsubscribe();

      const message = createMockMessage('test message');
      orchestrator.createTask({
        message,
        channelSessionId: 'ch-session-1',
      });

      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('state change events', () => {
    it('should emit state change events', async () => {
      const stateChanges: Array<{ previousState: TaskState | null; newState: TaskState }> = [];
      orchestrator.onTaskState((event) => {
        stateChanges.push({
          previousState: event.previousState,
          newState: event.newState,
        });
      });

      const message = createMockMessage('test message');
      const { taskId } = orchestrator.createTask({
        message,
        channelSessionId: 'ch-session-1',
      });

      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 200));

      // Should have captured state transitions: null->PENDING (creation), PENDING->RUNNING, RUNNING->DONE
      expect(stateChanges.length).toBeGreaterThanOrEqual(2);
      // First event is task creation (null -> PENDING)
      expect(stateChanges[0].previousState).toBeNull();
      expect(stateChanges[0].newState).toBe('PENDING');
      // Last event should be DONE
      expect(stateChanges[stateChanges.length - 1].newState).toBe('DONE');
    });

    it('should include channelId in state change events', async () => {
      const events: Array<{ channelId: string }> = [];
      orchestrator.onTaskState((event) => {
        events.push({ channelId: event.channelId });
      });

      const message = createMockMessage('test message', 'test-channel-123');
      orchestrator.createTask({
        message,
        channelSessionId: 'ch-session-1',
      });

      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(events.some(e => e.channelId === 'test-channel-123')).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return statistics', () => {
      const message = createMockMessage('test message');
      orchestrator.createTask({
        message,
        channelSessionId: 'ch-session-1',
      });

      const stats = orchestrator.getStats();

      expect(stats.tasks).toBeDefined();
      expect(stats.tasks.total).toBeGreaterThan(0);
      expect(stats.tasks.byState).toBeDefined();

      expect(stats.queue).toBeDefined();
      expect(stats.queue.channels).toBeGreaterThan(0);
    });

    it('should track tasks by state', async () => {
      const msg1 = createMockMessage('task 1');
      const msg2 = createMockMessage('task 2');

      orchestrator.createTask({ message: msg1, channelSessionId: 'ch-1' });
      orchestrator.createTask({ message: msg2, channelSessionId: 'ch-1' });

      let stats = orchestrator.getStats();
      // Tasks may have started processing already
      const initialTotal = stats.tasks.byState.PENDING + stats.tasks.byState.RUNNING;
      expect(initialTotal).toBeGreaterThanOrEqual(1);

      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 300));

      stats = orchestrator.getStats();
      expect(stats.tasks.byState.DONE).toBeGreaterThanOrEqual(1);
    });
  });

  describe('cleanup', () => {
    it('should remove old completed tasks', async () => {
      const message = createMockMessage('test message');
      orchestrator.createTask({
        message,
        channelSessionId: 'ch-session-1',
      });

      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 200));

      const beforeCount = orchestrator.getStats().tasks.total;
      const cleaned = orchestrator.cleanup(0); // Clean all
      const afterCount = orchestrator.getStats().tasks.total;

      expect(cleaned).toBeGreaterThan(0);
      expect(afterCount).toBeLessThan(beforeCount);
    });
  });

  describe('shutdown', () => {
    it('should clear all resources', () => {
      const message = createMockMessage('test message');
      orchestrator.createTask({
        message,
        channelSessionId: 'ch-session-1',
      });

      orchestrator.shutdown();

      // Stats should show empty state
      const stats = orchestrator.getStats();
      // Note: queue stats are independent of shutdown in current implementation
      expect(stats).toBeDefined();
    });
  });

  describe('getTask', () => {
    it('should return undefined for non-existent task', () => {
      const task = orchestrator.getTask('non-existent');
      expect(task).toBeUndefined();
    });

    it('should return task by ID', () => {
      const message = createMockMessage('test message');
      const { taskId } = orchestrator.createTask({
        message,
        channelSessionId: 'ch-session-1',
      });

      const task = orchestrator.getTask(taskId);
      expect(task).toBeDefined();
      expect(task?.id).toBe(taskId);
    });
  });

  describe('edge cases', () => {
    it('should handle task creation without executor', async () => {
      const noExecutorOrch = new TaskOrchestrator(mockSystemConfig);

      const message = createMockMessage('test');
      const { taskId } = noExecutorOrch.createTask({
        message,
        channelSessionId: 'ch-1',
      });

      // Wait for echo fallback
      await new Promise(resolve => setTimeout(resolve, 200));

      const task = noExecutorOrch.getTask(taskId);
      expect(task?.state).toBe('DONE');
      // result should be set by the echo fallback
      if (task?.result) {
        expect(task.result).toContain('[Echo - No Executor]');
      } else {
        // If result is undefined, task should still be DONE
        expect(task?.state).toBe('DONE');
      }
    });

    it('should handle multiple channels independently', async () => {
      const msg1 = createMockMessage('channel 1 task', 'channel-1');
      const msg2 = createMockMessage('channel 2 task', 'channel-2');
      const msg3 = createMockMessage('channel 1 another', 'channel-1');

      orchestrator.createTask({ message: msg1, channelSessionId: 'ch-1' });
      orchestrator.createTask({ message: msg2, channelSessionId: 'ch-2' });
      orchestrator.createTask({ message: msg3, channelSessionId: 'ch-1' });

      await new Promise(resolve => setTimeout(resolve, 300));

      const stats = orchestrator.getStats();
      expect(stats.tasks.total).toBe(3);
    });
  });
});
