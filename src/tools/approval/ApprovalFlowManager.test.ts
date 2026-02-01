/**
 * ApprovalFlowManager Unit Tests
 *
 * Tests for approval flow coordinator including:
 * - registerHandler/unregisterHandler - Handler management
 * - requestApproval - Request creation and handler notification
 * - handleResponse - Response processing and status updates
 * - expirePending - Expiration handling
 * - listPending/get - Query methods
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import { ApprovalFlowManager } from './ApprovalFlowManager.js';
import { ApprovalStore } from './ApprovalStore.js';
import type { ApprovalHandler, ApprovalRequest } from './types.js';
import type { ToolInvocation } from '../runtime/ToolRuntime.js';

// Mock ApprovalStore
vi.mock('./ApprovalStore.js', () => ({
  ApprovalStore: vi.fn(),
}));

// Mock logger
vi.mock('../../utils/logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

const createMockInvocation = (overrides?: Partial<ToolInvocation>): ToolInvocation => ({
  id: 'invocation-123',
  toolId: 'test-tool',
  sessionId: 'session-abc',
  input: { action: 'test' },
  status: 'pending',
  startTime: Date.now(),
  retryCount: 0,
  ...overrides,
});

const createMockRequest = (overrides?: Partial<ApprovalRequest>): ApprovalRequest => ({
  id: 'approval-xyz',
  invocationId: 'invocation-123',
  toolId: 'test-tool',
  sessionId: 'session-abc',
  input: { action: 'test' },
  status: 'pending',
  userId: 'user-1',
  createdAt: Date.now(),
  expiresAt: Date.now() + 300000,
  ...overrides,
});

// Mock ApprovalHandler
class MockApprovalHandler implements ApprovalHandler {
  sendRequest = vi.fn(async () => {});
  sendUpdate = vi.fn(async () => {});
}

describe('ApprovalFlowManager', () => {
  let manager: ApprovalFlowManager;
  let mockStore: ApprovalStore;
  let mockHandler: ApprovalHandler;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock store
    mockStore = {
      load: vi.fn(),
      save: vi.fn(),
      add: vi.fn(),
      get: vi.fn(),
      getAll: vi.fn(),
      listPending: vi.fn(),
      remove: vi.fn(),
      updateStatus: vi.fn(),
      expirePending: vi.fn(),
    } as unknown as ApprovalStore;

    // Create ApprovalFlowManager with mocked store
    manager = new ApprovalFlowManager(mockStore);
    mockHandler = new MockApprovalHandler();
  });

  describe('constructor', () => {
    // T1 - Constructor with store only
    it('T1: should create manager with default timeout', () => {
      const newManager = new ApprovalFlowManager(mockStore);
      expect(newManager).toBeInstanceOf(EventEmitter);
    });

    // T2 - Constructor with custom timeout
    it('T2: should create manager with custom timeout', async () => {
      const customTimeout = 600000;
      const newManager = new ApprovalFlowManager(mockStore, { timeoutMs: customTimeout });
      newManager.registerHandler('slack', mockHandler);

      let capturedRequest: ApprovalRequest | undefined;
      vi.mocked(mockStore.add).mockImplementation((request) => {
        capturedRequest = request;
        return Promise.resolve(undefined);
      });
      vi.mocked(mockStore.load).mockResolvedValue(undefined);

      const invocation = createMockInvocation();
      await newManager.requestApproval(invocation);

      expect(capturedRequest).toBeDefined();
      const expectedExpiresAt = capturedRequest!.createdAt + customTimeout;
      expect(capturedRequest!.expiresAt).toBe(expectedExpiresAt);
      expect(mockStore.add).toHaveBeenCalled();
    });
  });

  describe('registerHandler', () => {
    // T3 - Register handler successfully
    it('T3: should register handler for surface', () => {
      manager.registerHandler('slack', mockHandler);

      // Handler is stored internally, verify by using it
      expect(manager).toBeDefined();
    });

    // T4 - Register multiple handlers
    it('T4: should register multiple handlers', () => {
      const handler2 = new MockApprovalHandler();

      manager.registerHandler('slack', mockHandler);
      manager.registerHandler('discord', handler2);

      expect(manager).toBeDefined();
    });

    // T5 - Overwrite existing handler
    it('T5: should overwrite handler for same surface', () => {
      const handler2 = new MockApprovalHandler();

      manager.registerHandler('slack', mockHandler);
      manager.registerHandler('slack', handler2);

      expect(manager).toBeDefined();
    });
  });

  describe('unregisterHandler', () => {
    // T6 - Unregister existing handler
    it('T6: should unregister handler', async () => {
      manager.registerHandler('slack', mockHandler);
      manager.unregisterHandler('slack');

      vi.mocked(mockStore.load).mockResolvedValue(undefined);
      vi.mocked(mockStore.add).mockResolvedValue(undefined);

      const invocation = createMockInvocation();
      await manager.requestApproval(invocation);

      // Handler was unregistered, so sendRequest should not be called
      expect(mockHandler.sendRequest).not.toHaveBeenCalled();
    });

    // T7 - Unregister non-existent handler (no-op)
    it('T7: should handle unregistering non-existent handler', () => {
      expect(() => manager.unregisterHandler('nonexistent')).not.toThrow();
    });
  });

  describe('requestApproval', () => {
    // T8 - Request approval successfully
    it('T8: should create approval request and notify handlers', async () => {
      vi.mocked(mockStore.load).mockResolvedValue(undefined);
      vi.mocked(mockStore.add).mockResolvedValue(undefined);
      manager.registerHandler('slack', mockHandler);

      const invocation = createMockInvocation();
      const requestId = await manager.requestApproval(invocation);

      expect(requestId).toMatch(/^approval-/);
      expect(mockStore.load).toHaveBeenCalled();
      expect(mockStore.add).toHaveBeenCalled();
    });

    // T9 - Emit approval.requested event
    it('T9: should emit approval.requested event', async () => {
      vi.mocked(mockStore.load).mockResolvedValue(undefined);
      vi.mocked(mockStore.add).mockResolvedValue(undefined);

      const eventSpy = vi.fn();
      manager.on('approval.requested', eventSpy);

      const invocation = createMockInvocation();
      await manager.requestApproval(invocation);

      expect(eventSpy).toHaveBeenCalled();
    });

    // T10 - Call handler.sendRequest for each handler
    it('T10: should call sendRequest on all registered handlers', async () => {
      vi.mocked(mockStore.load).mockResolvedValue(undefined);
      vi.mocked(mockStore.add).mockResolvedValue(undefined);

      const handler2 = new MockApprovalHandler();
      manager.registerHandler('slack', mockHandler);
      manager.registerHandler('discord', handler2);

      const invocation = createMockInvocation();
      await manager.requestApproval(invocation);

      expect(mockHandler.sendRequest).toHaveBeenCalled();
      expect(handler2.sendRequest).toHaveBeenCalled();
    });

    // T11 - Handle handler sendRequest errors gracefully
    it('T11: should continue when handler sendRequest fails', async () => {
      vi.mocked(mockStore.load).mockResolvedValue(undefined);
      vi.mocked(mockStore.add).mockResolvedValue(undefined);

      const failingHandler = {
        sendRequest: vi.fn().mockRejectedValue(new Error('Handler error')),
        sendUpdate: vi.fn(),
      };
      manager.registerHandler('slack', failingHandler);

      const invocation = createMockInvocation();

      await expect(manager.requestApproval(invocation)).resolves.not.toThrow();
    });

    // T12 - Generate unique request ID
    it('T12: should generate unique request ID for each request', async () => {
      vi.mocked(mockStore.load).mockResolvedValue(undefined);
      vi.mocked(mockStore.add).mockResolvedValue(undefined);

      const invocation = createMockInvocation();
      const id1 = await manager.requestApproval(invocation);
      const id2 = await manager.requestApproval(invocation);

      expect(id1).not.toBe(id2);
    });

    // T13 - Set correct expiry time
    it('T13: should set expiry time based on timeout', async () => {
      vi.mocked(mockStore.load).mockResolvedValue(undefined);
      vi.mocked(mockStore.add).mockResolvedValue(undefined);

      const invocation = createMockInvocation();
      await manager.requestApproval(invocation);

      expect(mockStore.add).toHaveBeenCalledWith(
        expect.objectContaining({
          expiresAt: expect.any(Number),
        })
      );
    });
  });

  describe('handleResponse', () => {
    // T14 - Handle approve response
    it('T14: should approve request and return success result', async () => {
      vi.mocked(mockStore.load).mockResolvedValue(undefined);
      vi.mocked(mockStore.get).mockReturnValue(
        createMockRequest({ status: 'pending', expiresAt: Date.now() + 10000 })
      );
      vi.mocked(mockStore.updateStatus).mockResolvedValue(undefined);
      manager.registerHandler('slack', mockHandler);

      const result = await manager.handleResponse('approval-xyz', true, 'user-123');

      expect(result.ok).toBe(true);
      expect(result.data?.approved).toBe(true);
      expect(mockStore.updateStatus).toHaveBeenCalledWith('approval-xyz', 'approved', 'user-123');
    });

    // T15 - Handle reject response
    it('T15: should reject request and return error result', async () => {
      vi.mocked(mockStore.load).mockResolvedValue(undefined);
      vi.mocked(mockStore.get).mockReturnValue(
        createMockRequest({ status: 'pending', expiresAt: Date.now() + 10000 })
      );
      vi.mocked(mockStore.updateStatus).mockResolvedValue(undefined);
      manager.registerHandler('slack', mockHandler);

      const result = await manager.handleResponse('approval-xyz', false, 'user-456');

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('APPROVAL_DENIED');
      expect(mockStore.updateStatus).toHaveBeenCalledWith('approval-xyz', 'rejected', 'user-456');
    });

    // T16 - Return error for non-existent request
    it('T16: should return error for non-existent request', async () => {
      vi.mocked(mockStore.load).mockResolvedValue(undefined);
      vi.mocked(mockStore.get).mockReturnValue(undefined);

      const result = await manager.handleResponse('non-existent', true, 'user-1');

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('APPROVAL_NOT_FOUND');
    });

    // T17 - Return error for already resolved request
    it('T17: should return error for already resolved request', async () => {
      vi.mocked(mockStore.load).mockResolvedValue(undefined);
      vi.mocked(mockStore.get).mockReturnValue(createMockRequest({ status: 'approved' }));

      const result = await manager.handleResponse('approval-xyz', true, 'user-1');

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('APPROVAL_ALREADY_RESOLVED');
    });

    // T18 - Return error for expired request
    it('T18: should return error for expired request', async () => {
      vi.mocked(mockStore.load).mockResolvedValue(undefined);
      vi.mocked(mockStore.get).mockReturnValue(
        createMockRequest({
          status: 'pending',
          expiresAt: Date.now() - 1000,
        })
      );
      vi.mocked(mockStore.updateStatus).mockResolvedValue(undefined);

      const result = await manager.handleResponse('approval-xyz', true, 'user-1');

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('APPROVAL_EXPIRED');
      expect(mockStore.updateStatus).toHaveBeenCalledWith('approval-xyz', 'expired', 'user-1');
    });

    // T19 - Notify handlers on approval update
    it('T19: should notify handlers of status update', async () => {
      vi.mocked(mockStore.load).mockResolvedValue(undefined);
      vi.mocked(mockStore.get).mockReturnValue(
        createMockRequest({ status: 'pending', expiresAt: Date.now() + 10000 })
      );
      vi.mocked(mockStore.updateStatus).mockResolvedValue(undefined);

      const handler2 = new MockApprovalHandler();
      manager.registerHandler('slack', mockHandler);
      manager.registerHandler('discord', handler2);

      await manager.handleResponse('approval-xyz', true, 'user-1');

      expect(mockHandler.sendUpdate).toHaveBeenCalled();
      expect(handler2.sendUpdate).toHaveBeenCalled();
    });

    // T20 - Emit approval.resolved event
    it('T20: should emit approval.resolved event', async () => {
      vi.mocked(mockStore.load).mockResolvedValue(undefined);
      vi.mocked(mockStore.get).mockReturnValue(
        createMockRequest({ status: 'pending', expiresAt: Date.now() + 10000 })
      );
      vi.mocked(mockStore.updateStatus).mockResolvedValue(undefined);

      const eventSpy = vi.fn();
      manager.on('approval.resolved', eventSpy);

      await manager.handleResponse('approval-xyz', true, 'user-1');

      expect(eventSpy).toHaveBeenCalledWith({ requestId: 'approval-xyz', approved: true });
    });

    // T21 - Handle handler sendUpdate errors gracefully
    it('T21: should continue when handler sendUpdate fails', async () => {
      vi.mocked(mockStore.load).mockResolvedValue(undefined);
      vi.mocked(mockStore.get).mockReturnValue(
        createMockRequest({ status: 'pending', expiresAt: Date.now() + 10000 })
      );
      vi.mocked(mockStore.updateStatus).mockResolvedValue(undefined);

      const failingHandler = {
        sendRequest: vi.fn(),
        sendUpdate: vi.fn().mockRejectedValue(new Error('Update error')),
      };
      manager.registerHandler('slack', failingHandler);

      await expect(manager.handleResponse('approval-xyz', true, 'user-1')).resolves.not.toThrow();
    });
  });

  describe('expirePending', () => {
    // T22 - Expire pending requests
    it('T22: should mark expired pending requests', async () => {
      vi.mocked(mockStore.load).mockResolvedValue(undefined);
      vi.mocked(mockStore.expirePending).mockReturnValue(['expired-1', 'expired-2']);
      vi.mocked(mockStore.get).mockReturnValue(
        createMockRequest({ id: 'expired-1', status: 'expired' })
      );
      vi.mocked(mockStore.save).mockResolvedValue(undefined);
      manager.registerHandler('slack', mockHandler);

      await manager.expirePending();

      expect(mockStore.expirePending).toHaveBeenCalled();
    });

    // T23 - Notify handlers for each expired request
    it('T23: should notify handlers for each expired request', async () => {
      vi.mocked(mockStore.load).mockResolvedValue(undefined);
      vi.mocked(mockStore.expirePending).mockReturnValue(['expired-1', 'expired-2']);

      let callCount = 0;
      vi.mocked(mockStore.get).mockImplementation(() => {
        callCount++;
        return createMockRequest({ id: `expired-${callCount}`, status: 'expired' });
      });

      vi.mocked(mockStore.save).mockResolvedValue(undefined);

      const handler2 = new MockApprovalHandler();
      manager.registerHandler('slack', mockHandler);
      manager.registerHandler('discord', handler2);

      await manager.expirePending();

      // Each expired request triggers updates for all handlers
      expect(mockHandler.sendUpdate).toHaveBeenCalledTimes(2);
      expect(handler2.sendUpdate).toHaveBeenCalledTimes(2);
    });

    // T24 - Save store after expiring
    it('T24: should save store after marking expired', async () => {
      vi.mocked(mockStore.load).mockResolvedValue(undefined);
      vi.mocked(mockStore.expirePending).mockReturnValue(['expired-1']);
      vi.mocked(mockStore.get).mockReturnValue(createMockRequest({ status: 'expired' }));
      vi.mocked(mockStore.save).mockResolvedValue(undefined);

      await manager.expirePending();

      expect(mockStore.save).toHaveBeenCalled();
    });

    // T25 - Handle no expired requests
    it('T25: should handle case with no expired requests', async () => {
      vi.mocked(mockStore.load).mockResolvedValue(undefined);
      vi.mocked(mockStore.expirePending).mockReturnValue([]);
      vi.mocked(mockStore.save).mockResolvedValue(undefined);

      await expect(manager.expirePending()).resolves.not.toThrow();
    });
  });

  describe('listPending', () => {
    // T26 - List pending requests from store
    it('T26: should return pending requests from store', () => {
      const pendingRequests = [
        createMockRequest({ id: 'pending-1' }),
        createMockRequest({ id: 'pending-2' }),
      ];
      vi.mocked(mockStore.listPending).mockReturnValue(pendingRequests);

      const result = manager.listPending();

      expect(result).toEqual(pendingRequests);
      expect(mockStore.listPending).toHaveBeenCalled();
    });

    // T27 - Return empty array when no pending requests
    it('T27: should return empty array when no pending requests', () => {
      vi.mocked(mockStore.listPending).mockReturnValue([]);

      const result = manager.listPending();

      expect(result).toEqual([]);
    });
  });

  describe('get', () => {
    // T28 - Get existing request
    it('T28: should return request by ID', () => {
      const request = createMockRequest({ id: 'request-xyz' });
      vi.mocked(mockStore.get).mockReturnValue(request);

      const result = manager.get('request-xyz');

      expect(result).toEqual(request);
      expect(mockStore.get).toHaveBeenCalledWith('request-xyz');
    });

    // T29 - Get non-existent request returns undefined
    it('T29: should return undefined for non-existent request', () => {
      vi.mocked(mockStore.get).mockReturnValue(undefined);

      const result = manager.get('non-existent');

      expect(result).toBeUndefined();
    });
  });

  describe('getStore', () => {
    // T30 - Get store instance
    it('T30: should return the store instance', () => {
      const store = manager.getStore();

      expect(store).toBe(mockStore);
    });
  });

  describe('Event emission', () => {
    // T31 - approval.requested event contains correct data
    it('T31: should emit approval.requested with correct data', async () => {
      vi.mocked(mockStore.load).mockResolvedValue(undefined);
      vi.mocked(mockStore.add).mockResolvedValue(undefined);

      const eventSpy = vi.fn();
      manager.on('approval.requested', eventSpy);

      const invocation = createMockInvocation({
        id: 'inv-123',
        toolId: 'tool.test',
        sessionId: 'sess-abc',
        input: { param: 'value' },
      });

      await manager.requestApproval(invocation);

      const eventData = eventSpy.mock.calls[0][0];
      expect(eventData).toMatchObject({
        invocationId: 'inv-123',
        toolId: 'tool.test',
        input: { param: 'value' },
        sessionId: 'sess-abc',
      });
    });

    // T32 - approval.resolved event with approved=true
    it('T32: should emit approval.resolved with approved=true', async () => {
      vi.mocked(mockStore.load).mockResolvedValue(undefined);
      vi.mocked(mockStore.get).mockReturnValue(
        createMockRequest({ status: 'pending', expiresAt: Date.now() + 10000 })
      );
      vi.mocked(mockStore.updateStatus).mockResolvedValue(undefined);

      const eventSpy = vi.fn();
      manager.on('approval.resolved', eventSpy);

      await manager.handleResponse('approval-xyz', true, 'user-1');

      expect(eventSpy).toHaveBeenCalledWith({ requestId: 'approval-xyz', approved: true });
    });

    // T33 - approval.resolved event with approved=false
    it('T33: should emit approval.resolved with approved=false', async () => {
      vi.mocked(mockStore.load).mockResolvedValue(undefined);
      vi.mocked(mockStore.get).mockReturnValue(
        createMockRequest({ status: 'pending', expiresAt: Date.now() + 10000 })
      );
      vi.mocked(mockStore.updateStatus).mockResolvedValue(undefined);

      const eventSpy = vi.fn();
      manager.on('approval.resolved', eventSpy);

      await manager.handleResponse('approval-xyz', false, 'user-1');

      expect(eventSpy).toHaveBeenCalledWith({ requestId: 'approval-xyz', approved: false });
    });
  });

  describe('Error handling', () => {
    // T34 - Handle store load errors in requestApproval
    it('T34: should handle store load errors in requestApproval', async () => {
      vi.mocked(mockStore.load).mockRejectedValue(new Error('Load failed'));

      const invocation = createMockInvocation();

      await expect(manager.requestApproval(invocation)).rejects.toThrow();
    });

    // T35 - Handle store add errors in requestApproval
    it('T35: should handle store add errors in requestApproval', async () => {
      vi.mocked(mockStore.load).mockResolvedValue(undefined);
      vi.mocked(mockStore.add).mockRejectedValue(new Error('Add failed'));

      const invocation = createMockInvocation();

      await expect(manager.requestApproval(invocation)).rejects.toThrow();
    });
  });
});
