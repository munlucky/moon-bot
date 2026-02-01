/**
 * ApprovalStore Unit Tests
 *
 * Tests for persistent storage of approval requests.
 * Covers CRUD operations, expiration handling, and file persistence.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ApprovalStore } from './ApprovalStore.js';
import type { ApprovalRequest } from './types.js';

// Mock fs/promises module
const { mockMkdir, mockWriteFile, mockReadFile } = vi.hoisted(() => ({
  mockMkdir: vi.fn(),
  mockWriteFile: vi.fn(),
  mockReadFile: vi.fn(),
}));

vi.mock('fs/promises', async () => {
  const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises');
  return {
    ...actual,
    default: {
      ...actual,
      mkdir: mockMkdir,
      writeFile: mockWriteFile,
      readFile: mockReadFile,
    },
  };
});

describe('ApprovalStore', () => {
  let store: ApprovalStore;
  const testStorePath = '/test/path/approvals.json';

  beforeEach(() => {
    vi.resetAllMocks();
    // Default mock implementations - file doesn't exist
    mockReadFile.mockRejectedValue(new Error('File not found'));
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    store = new ApprovalStore(testStorePath);
  });

  const createMockRequest = (overrides?: Partial<ApprovalRequest>): ApprovalRequest => ({
    id: 'approval-123',
    invocationId: 'invocation-abc',
    toolId: 'test-tool',
    sessionId: 'session-xyz',
    input: { action: 'test', params: {} },
    status: 'pending',
    userId: 'user-1',
    createdAt: Date.now(),
    expiresAt: Date.now() + 300000,
    ...overrides,
  });

  describe('constructor', () => {
    // T1 - Constructor with default path
    it('T1: should use default path when no path provided', () => {
      const defaultStore = new ApprovalStore();
      expect(defaultStore).toBeDefined();
    });

    // T2 - Constructor with custom path
    it('T2: should use custom path when provided', async () => {
      const customPath = '/custom/path/approvals.json';
      const customStore = new ApprovalStore(customPath);

      expect(customStore).toBeDefined();

      // Verify the path is actually used when loading
      mockReadFile.mockResolvedValue(JSON.stringify({ requests: [] }));
      await customStore.load();

      expect(mockReadFile).toHaveBeenCalledWith(customPath, 'utf-8');
    });

    // T3 - Initialize empty requests map
    it('T3: should initialize with empty requests map', () => {
      const allRequests = store.getAll();
      expect(allRequests).toEqual([]);
    });
  });

  describe('load', () => {
    // T4 - Load from existing file
    it('T4: should load requests from existing file', async () => {
      const mockRequests = [
        createMockRequest({ id: 'approval-1' }),
        createMockRequest({ id: 'approval-2' }),
      ];
      const storeData = { requests: mockRequests };

      mockReadFile.mockResolvedValue(JSON.stringify(storeData));

      await store.load();

      expect(store.get('approval-1')).toEqual(mockRequests[0]);
      expect(store.get('approval-2')).toEqual(mockRequests[1]);
      expect(store.getAll().length).toBe(2);
    });

    // T5 - Load handles non-existent file
    it('T5: should start with empty store when file does not exist', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));

      await store.load();

      expect(store.getAll()).toEqual([]);
    });

    // T6 - Load clears existing requests
    it('T6: should clear existing requests before loading', async () => {
      const firstRequests = [createMockRequest({ id: 'approval-1' })];
      mockReadFile.mockResolvedValue(JSON.stringify({ requests: firstRequests }));

      await store.load();
      expect(store.getAll().length).toBe(1);

      const secondRequests = [createMockRequest({ id: 'approval-2' })];
      mockReadFile.mockResolvedValue(JSON.stringify({ requests: secondRequests }));

      await store.load();
      expect(store.getAll().length).toBe(1);
      expect(store.get('approval-1')).toBeUndefined();
      expect(store.get('approval-2')).toBeDefined();
    });
  });

  describe('save', () => {
    // T7 - Save creates directory
    it('T7: should create directory before saving', async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      await store.add(createMockRequest());

      expect(mockMkdir).toHaveBeenCalled();
    });

    // T8 - Save writes JSON file
    it('T8: should write requests as JSON', async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const request = createMockRequest();
      await store.add(request);

      expect(mockWriteFile).toHaveBeenCalledWith(
        testStorePath,
        expect.stringContaining('"id": "approval-123"')
      );
    });

    // T9 - Save handles existing directory
    it('T9: should handle directory already exists error', async () => {
      mockMkdir.mockRejectedValue(new Error('Directory exists'));
      mockWriteFile.mockResolvedValue(undefined);

      const request = createMockRequest();
      await expect(store.add(request)).resolves.not.toThrow();
    });
  });

  describe('add', () => {
    // T10 - Auto-load before add
    it('T10: should auto-load store before adding request', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const request = createMockRequest();
      await store.add(request);

      expect(mockReadFile).toHaveBeenCalled();
    });

    // T11 - Add stores request
    it('T11: should store request in memory', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const request = createMockRequest();
      await store.add(request);

      const retrieved = store.get(request.id);
      expect(retrieved).toEqual(request);
    });

    // T12 - Add triggers save
    it('T12: should save after adding request', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const request = createMockRequest();
      await store.add(request);

      expect(mockWriteFile).toHaveBeenCalled();
    });
  });

  describe('get', () => {
    // T13 - Get existing request
    it('T13: should return request by ID', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const request = createMockRequest();
      await store.add(request);

      const retrieved = store.get(request.id);
      expect(retrieved).toEqual(request);
    });

    // T14 - Get non-existent request
    it('T14: should return undefined for non-existent request', () => {
      const retrieved = store.get('non-existent-id');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('listPending', () => {
    // T15 - List pending requests
    it('T15: should return only pending requests', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const pending1 = createMockRequest({ id: 'pending-1', status: 'pending' });
      const pending2 = createMockRequest({ id: 'pending-2', status: 'pending' });
      const approved = createMockRequest({ id: 'approved-1', status: 'approved' });
      const rejected = createMockRequest({ id: 'rejected-1', status: 'rejected' });

      await store.add(pending1);
      await store.add(pending2);
      await store.add(approved);
      await store.add(rejected);

      const pending = store.listPending();
      expect(pending.length).toBe(2);
      expect(pending.every(r => r.status === 'pending')).toBe(true);
    });

    // T16 - Filter expired requests
    it('T16: should exclude expired pending requests', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const now = Date.now();
      const valid = createMockRequest({ id: 'valid-1', expiresAt: now + 10000 });
      const expired = createMockRequest({ id: 'expired-1', expiresAt: now - 1000 });

      await store.add(valid);
      await store.add(expired);

      const pending = store.listPending();
      expect(pending.length).toBe(1);
      expect(pending[0].id).toBe('valid-1');
    });

    // T17 - Empty store returns empty array
    it('T17: should return empty array when no requests', () => {
      const pending = store.listPending();
      expect(pending).toEqual([]);
    });
  });

  describe('remove', () => {
    // T18 - Remove existing request
    it('T18: should remove request from store', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const request = createMockRequest();
      await store.add(request);

      await store.remove(request.id);

      expect(store.get(request.id)).toBeUndefined();
    });

    // T19 - Remove triggers save
    it('T19: should save after removing request', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const request = createMockRequest();
      await store.add(request);
      mockWriteFile.mockClear();

      await store.remove(request.id);

      expect(mockWriteFile).toHaveBeenCalled();
    });

    // T20 - Remove non-existent is safe
    it('T20: should handle removing non-existent request', async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      await expect(store.remove('non-existent')).resolves.not.toThrow();
    });
  });

  describe('updateStatus', () => {
    // T21 - Update to approved
    it('T21: should update request status to approved', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const request = createMockRequest({ status: 'pending' });
      await store.add(request);

      await store.updateStatus(request.id, 'approved', 'user-123');

      const updated = store.get(request.id);
      expect(updated?.status).toBe('approved');
      expect(updated?.respondedBy).toBe('user-123');
      expect(updated?.respondedAt).toBeDefined();
    });

    // T22 - Update to rejected
    it('T22: should update request status to rejected', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const request = createMockRequest({ status: 'pending' });
      await store.add(request);

      await store.updateStatus(request.id, 'rejected', 'user-456');

      const updated = store.get(request.id);
      expect(updated?.status).toBe('rejected');
      expect(updated?.respondedBy).toBe('user-456');
    });

    // T23 - Update non-existent throws error
    it('T23: should throw error when updating non-existent request', async () => {
      await expect(store.updateStatus('non-existent', 'approved', 'user-1'))
        .rejects.toThrow('Approval request not found');
    });

    // T24 - Update triggers save
    it('T24: should save after updating status', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const request = createMockRequest({ status: 'pending' });
      await store.add(request);
      mockWriteFile.mockClear();

      await store.updateStatus(request.id, 'approved', 'user-1');

      expect(mockWriteFile).toHaveBeenCalled();
    });
  });

  describe('expirePending', () => {
    // T25 - Expire old pending requests
    it('T25: should mark expired pending requests', () => {
      const now = Date.now();
      const expired1 = createMockRequest({ id: 'expired-1', status: 'pending', expiresAt: now - 1000 });
      const expired2 = createMockRequest({ id: 'expired-2', status: 'pending', expiresAt: now - 500 });
      const valid = createMockRequest({ id: 'valid-1', status: 'pending', expiresAt: now + 10000 });

      store.getAll = () => [expired1, expired2, valid];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (store as any).requests = new Map([
        ['expired-1', expired1],
        ['expired-2', expired2],
        ['valid-1', valid],
      ]);

      const expiredIds = store.expirePending();

      expect(expiredIds).toEqual(['expired-1', 'expired-2']);
      expect(store.get('expired-1')?.status).toBe('expired');
      expect(store.get('expired-2')?.status).toBe('expired');
      expect(store.get('valid-1')?.status).toBe('pending');
    });

    // T26 - No expired requests
    it('T26: should return empty array when no expired requests', () => {
      const now = Date.now();
      const valid1 = createMockRequest({ id: 'valid-1', status: 'pending', expiresAt: now + 10000 });
      const valid2 = createMockRequest({ id: 'valid-2', status: 'pending', expiresAt: now + 20000 });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (store as any).requests = new Map([
        ['valid-1', valid1],
        ['valid-2', valid2],
      ]);

      const expiredIds = store.expirePending();

      expect(expiredIds).toEqual([]);
    });

    // T27 - Don't expire non-pending requests
    it('T27: should not expire requests with non-pending status', () => {
      const now = Date.now();
      const approvedExpired = createMockRequest({ id: 'approved-1', status: 'approved', expiresAt: now - 1000 });
      const rejectedExpired = createMockRequest({ id: 'rejected-1', status: 'rejected', expiresAt: now - 1000 });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (store as any).requests = new Map([
        ['approved-1', approvedExpired],
        ['rejected-1', rejectedExpired],
      ]);

      const expiredIds = store.expirePending();

      expect(expiredIds).toEqual([]);
      expect(store.get('approved-1')?.status).toBe('approved');
      expect(store.get('rejected-1')?.status).toBe('rejected');
    });
  });

  describe('getAll', () => {
    // T28 - Get all requests
    it('T28: should return all requests in store', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const request1 = createMockRequest({ id: 'req-1' });
      const request2 = createMockRequest({ id: 'req-2' });
      const request3 = createMockRequest({ id: 'req-3' });

      await store.add(request1);
      await store.add(request2);
      await store.add(request3);

      const all = store.getAll();
      expect(all.length).toBe(3);
    });

    // T29 - Empty store
    it('T29: should return empty array for empty store', () => {
      const all = store.getAll();
      expect(all).toEqual([]);
    });
  });
});
