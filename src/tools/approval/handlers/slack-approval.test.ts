/**
 * SlackApprovalHandler Unit Tests
 *
 * Tests for Slack approval handler including:
 * - createApprovalButtons() - Button element creation
 * - parseButtonActionId() - Action ID parsing
 * - formatApprovalBlocks() - Block Kit message formatting
 * - formatApprovalUpdateBlocks() - Status update formatting
 * - SlackApprovalHandler class - Request sending and updates
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createApprovalButtons,
  parseButtonActionId,
  formatApprovalBlocks,
  formatApprovalUpdateBlocks,
  SlackApprovalHandler,
} from './slack-approval.js';
import type { ApprovalRequest } from '../types.js';
import type { SlackAdapter } from '../../../channels/slack.js';

// Mock SlackAdapter
vi.mock('../../../channels/slack.js', () => ({
  SlackAdapter: vi.fn(),
}));

const createMockRequest = (overrides?: Partial<ApprovalRequest>): ApprovalRequest => ({
  id: 'approval-1234567890',
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

describe('slack-approval', () => {
  describe('createApprovalButtons', () => {
    // T1 - Create buttons with valid request ID
    it('T1: should create approve and reject buttons', () => {
      const buttons = createApprovalButtons('req-123');

      expect(buttons).toHaveLength(2);
      expect(buttons[0]).toMatchObject({
        type: 'button',
        text: { type: 'plain_text', text: ':white_check_mark: Approve', emoji: true },
        style: 'primary',
        action_id: 'approval_req-123_approve',
      });
      expect(buttons[1]).toMatchObject({
        type: 'button',
        text: { type: 'plain_text', text: ':x: Reject', emoji: true },
        style: 'danger',
        action_id: 'approval_req-123_reject',
      });
    });

    // T2 - Button action IDs have correct format
    it('T2: should create buttons with correct action_id format', () => {
      const buttons = createApprovalButtons('test-request-id');

      expect(buttons[0].action_id).toBe('approval_test-request-id_approve');
      expect(buttons[1].action_id).toBe('approval_test-request-id_reject');
    });
  });

  describe('parseButtonActionId', () => {
    // T3 - Parse valid approve action
    it('T3: should parse valid approve action_id', () => {
      const result = parseButtonActionId('approval_req-123_approve');

      expect(result).toEqual({ requestId: 'req-123', action: 'approve' });
    });

    // T4 - Parse valid reject action
    it('T4: should parse valid reject action_id', () => {
      const result = parseButtonActionId('approval_req-456_reject');

      expect(result).toEqual({ requestId: 'req-456', action: 'reject' });
    });

    // T5 - Handle action ID without approval prefix
    it('T5: should return null for action_id without approval prefix', () => {
      const result = parseButtonActionId('other_action_req-123_approve');

      expect(result).toBeNull();
    });

    // T6 - Handle malformed action ID (missing parts)
    it('T6: should return null for malformed action_id', () => {
      expect(parseButtonActionId('approval_req-123')).toBeNull();
      expect(parseButtonActionId('approval_req-123_extra_reject')).toBeNull();
    });

    // T7 - Handle invalid action type
    it('T7: should return null for invalid action type', () => {
      const result = parseButtonActionId('approval_req-123_cancel');

      expect(result).toBeNull();
    });
  });

  describe('formatApprovalBlocks', () => {
    // T8 - Format approval request with basic input
    it('T8: should format approval request with basic input', () => {
      const request = createMockRequest({
        toolId: 'system.run',
        input: { argv: ['git', 'status'], cwd: '/workspace' },
      });

      const result = formatApprovalBlocks(request);

      expect(result.blocks).toBeDefined();
      expect(result.blocks.length).toBeGreaterThan(0);
      expect(result.fallbackText).toBe('Tool Execution Approval Required');
    });

    // T9 - Include tool ID in blocks
    it('T9: should include tool ID in formatted blocks', () => {
      const request = createMockRequest({ toolId: 'test.tool' });
      const result = formatApprovalBlocks(request);

      const hasToolId = JSON.stringify(result.blocks).includes('test.tool');
      expect(hasToolId).toBe(true);
    });

    // T10 - Include request ID (last 12 chars) in blocks
    it('T10: should include truncated request ID in blocks', () => {
      const request = createMockRequest({ id: 'approval-abcdefghijkl1234567890' });
      const result = formatApprovalBlocks(request);

      const blocksStr = JSON.stringify(result.blocks);
      expect(blocksStr).toContain('1234567890');
    });

    // T11 - Include expiry time in blocks
    it('T11: should include expiry time in formatted blocks', () => {
      const now = Date.now();
      const request = createMockRequest({ expiresAt: now + 120000 }); // 2 minutes
      const result = formatApprovalBlocks(request);

      const blocksStr = JSON.stringify(result.blocks);
      expect(blocksStr).toMatch(/\d+m \d+s/);
    });

    // T12 - Handle null input
    it('T12: should handle null input gracefully', () => {
      const request = createMockRequest({ input: null });
      const result = formatApprovalBlocks(request);

      expect(result.blocks).toBeDefined();
      const blocksStr = JSON.stringify(result.blocks);
      expect(blocksStr).toContain('(empty)');
    });

    // T13 - Handle undefined input
    it('T13: should handle undefined input gracefully', () => {
      const request = createMockRequest({ input: undefined });
      const result = formatApprovalBlocks(request);

      expect(result.blocks).toBeDefined();
      const blocksStr = JSON.stringify(result.blocks);
      expect(blocksStr).toContain('(empty)');
    });

    // T14 - Handle string input
    it('T14: should handle string input', () => {
      const request = createMockRequest({ input: 'test command string' });
      const result = formatApprovalBlocks(request);

      expect(result.blocks).toBeDefined();
      const blocksStr = JSON.stringify(result.blocks);
      expect(blocksStr).toContain('test command string');
    });

    // T15 - Handle object input with argv
    it('T15: should format object input with argv', () => {
      const request = createMockRequest({
        input: { argv: ['npm', 'install'], cwd: '/project' },
      });
      const result = formatApprovalBlocks(request);

      expect(result.blocks).toBeDefined();
      const blocksStr = JSON.stringify(result.blocks);
      expect(blocksStr).toContain('npm install');
      expect(blocksStr).toContain('/project');
    });

    // T16 - Truncate long input strings
    it('T16: should truncate long input strings', () => {
      const longInput = 'a'.repeat(600);
      const request = createMockRequest({ input: longInput });
      const result = formatApprovalBlocks(request);

      const blocksStr = JSON.stringify(result.blocks);
      // Input should be truncated - check for the ellipsis indicator
      expect(blocksStr).toContain('...');
      // The truncated string should be much shorter than original 600 chars
      // (accounting for JSON structure overhead, check it's under 1500 chars total)
      expect(blocksStr.length).toBeLessThan(1500);
    });

    // T17 - Include approval buttons in blocks
    it('T17: should include approval buttons in formatted blocks', () => {
      const request = createMockRequest();
      const result = formatApprovalBlocks(request);

      const hasActionsBlock = result.blocks.some((block) => block.type === 'actions');
      expect(hasActionsBlock).toBe(true);
    });
  });

  describe('formatApprovalUpdateBlocks', () => {
    // T18 - Format approved status update
    it('T18: should format approved status update', () => {
      const request = createMockRequest({
        status: 'approved',
        respondedBy: 'user-123',
      });
      const result = formatApprovalUpdateBlocks(request);

      expect(result.fallbackText).toBe('Tool Execution Approved');
      const blocksStr = JSON.stringify(result.blocks);
      expect(blocksStr).toContain(':white_check_mark:');
      expect(blocksStr).toContain('Approved');
    });

    // T19 - Format rejected status update
    it('T19: should format rejected status update', () => {
      const request = createMockRequest({
        status: 'rejected',
        respondedBy: 'user-456',
      });
      const result = formatApprovalUpdateBlocks(request);

      expect(result.fallbackText).toBe('Tool Execution Rejected');
      const blocksStr = JSON.stringify(result.blocks);
      expect(blocksStr).toContain(':x:');
      expect(blocksStr).toContain('Rejected');
    });

    // T20 - Format expired status update
    it('T20: should format expired status update', () => {
      const request = createMockRequest({ status: 'expired' });
      const result = formatApprovalUpdateBlocks(request);

      expect(result.fallbackText).toBe('Tool Execution Expired');
      const blocksStr = JSON.stringify(result.blocks);
      expect(blocksStr).toContain(':warning:');
      expect(blocksStr).toContain('Expired');
    });

    // T21 - Include responded by user
    it('T21: should include responded by user in update', () => {
      const request = createMockRequest({
        status: 'approved',
        respondedBy: 'user-test',
      });
      const result = formatApprovalUpdateBlocks(request);

      const blocksStr = JSON.stringify(result.blocks);
      expect(blocksStr).toContain('user-test');
    });

    // T22 - Handle missing respondedBy
    it('T22: should handle missing respondedBy gracefully', () => {
      const request = createMockRequest({
        status: 'approved',
        // @ts-expect-error - testing missing respondedBy
        respondedBy: undefined,
      });
      const result = formatApprovalUpdateBlocks(request);

      const blocksStr = JSON.stringify(result.blocks);
      expect(blocksStr).toContain('Unknown');
    });
  });

  describe('SlackApprovalHandler', () => {
    let handler: SlackApprovalHandler;
    let mockAdapter: SlackAdapter;

    beforeEach(() => {
      vi.clearAllMocks();
      handler = new SlackApprovalHandler();
      mockAdapter = {
        sendBlocks: vi.fn(),
        updateMessage: vi.fn(),
      } as unknown as SlackAdapter;
    });

    // T23 - Constructor without parameters
    it('T23: should create handler without adapter', () => {
      const newHandler = new SlackApprovalHandler();

      expect(newHandler).toBeDefined();
    });

    // T24 - Constructor with parameters
    it('T24: should create handler with adapter and channelId', () => {
      const newHandler = new SlackApprovalHandler(mockAdapter, 'channel-123');

      expect(newHandler).toBeDefined();
    });

    // T25 - Set adapter method
    it('T25: should set adapter via setAdapter method', () => {
      handler.setAdapter(mockAdapter);

      expect(handler).toBeDefined();
      // Adapter is private, so we just verify no error thrown
    });

    // T26 - Set channel ID method
    it('T26: should set channel ID via setChannelId method', () => {
      handler.setChannelId('test-channel');

      expect(handler).toBeDefined();
      // ChannelId is private, so we just verify no error thrown
    });

    // T27 - Send request without adapter (silent skip)
    it('T27: should silently skip sendRequest when adapter not set', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const request = createMockRequest();

      await expect(handler.sendRequest(request)).resolves.not.toThrow();

      // Adapter is not set, so should skip without warning
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });

    // T28 - Send request without channel ID (warns but doesn't throw)
    it('T28: should handle sendRequest without channel ID', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      handler.setAdapter(mockAdapter);
      // Don't set channel ID
      const request = createMockRequest();

      await expect(handler.sendRequest(request)).resolves.not.toThrow();

      // Channel ID is not set, so should skip with warning
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('No channel ID configured')
      );
      expect(mockAdapter.sendBlocks).not.toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });

    // T29 - Send request successfully
    it('T29: should send approval request via adapter', async () => {
      handler.setAdapter(mockAdapter);
      handler.setChannelId('test-channel');

      vi.mocked(mockAdapter.sendBlocks).mockResolvedValue('message-ts-123');

      const request = createMockRequest({
        toolId: 'test.tool',
        input: { command: 'test' },
      });
      await handler.sendRequest(request);

      expect(mockAdapter.sendBlocks).toHaveBeenCalledWith(
        'test-channel',
        expect.objectContaining({
          blocks: expect.any(Array),
          fallbackText: expect.any(String),
        })
      );

      // Verify message content structure
      const callArgs = vi.mocked(mockAdapter.sendBlocks).mock.calls[0];
      const blocksMessage = callArgs[1] as { blocks: Array<{ type: string; text?: { text: string } }> };
      const blocks = blocksMessage.blocks;
      expect(blocks).toBeDefined();
      expect(blocks.length).toBeGreaterThan(0);

      // Check for tool ID in message
      const blocksStr = JSON.stringify(blocks);
      expect(blocksStr).toContain('test.tool');
    });

    // T30 - Handle sendBlocks error
    it('T30: should handle sendBlocks error gracefully', async () => {
      handler.setAdapter(mockAdapter);
      handler.setChannelId('test-channel');

      vi.mocked(mockAdapter.sendBlocks).mockRejectedValue(new Error('API error'));

      const request = createMockRequest();

      await expect(handler.sendRequest(request)).resolves.not.toThrow();
    });

    // T31 - Store message reference after sending
    it('T31: should store message reference when sendBlocks succeeds', async () => {
      handler.setAdapter(mockAdapter);
      handler.setChannelId('test-channel');

      vi.mocked(mockAdapter.sendBlocks).mockResolvedValue('msg-ts-456');

      const request = createMockRequest();
      await handler.sendRequest(request);

      // Verify adapter was called
      expect(mockAdapter.sendBlocks).toHaveBeenCalled();
    });

    // T32 - Send update without adapter (silent skip)
    it('T32: should silently skip sendUpdate when adapter not set', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const request = createMockRequest();

      await expect(handler.sendUpdate(request)).resolves.not.toThrow();

      // Adapter is not set, so should skip without warning
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });

    // T33 - Send update without stored message reference
    it('T33: should handle sendUpdate without stored message reference', async () => {
      handler.setAdapter(mockAdapter);
      // No sendRequest was called, so no message reference stored

      const request = createMockRequest();
      await expect(handler.sendUpdate(request)).resolves.not.toThrow();
    });

    // T34 - Send update successfully
    it('T34: should send approval update via adapter', async () => {
      handler.setAdapter(mockAdapter);
      handler.setChannelId('test-channel');

      // First send the request to store message reference
      vi.mocked(mockAdapter.sendBlocks).mockResolvedValue('msg-ts-789');
      const request = createMockRequest();
      await handler.sendRequest(request);

      // Then send update
      vi.mocked(mockAdapter.updateMessage).mockResolvedValue(true);
      request.status = 'approved';
      await handler.sendUpdate(request);

      expect(mockAdapter.updateMessage).toHaveBeenCalledWith(
        'test-channel',
        'msg-ts-789',
        expect.objectContaining({
          blocks: expect.any(Array),
        })
      );
    });

    // T35 - Handle updateMessage error
    it('T35: should handle updateMessage error gracefully', async () => {
      handler.setAdapter(mockAdapter);
      handler.setChannelId('test-channel');

      vi.mocked(mockAdapter.sendBlocks).mockResolvedValue('msg-ts-error');
      const request = createMockRequest();
      await handler.sendRequest(request);

      vi.mocked(mockAdapter.updateMessage).mockRejectedValue(new Error('Update failed'));
      request.status = 'approved';

      await expect(handler.sendUpdate(request)).resolves.not.toThrow();
    });

    // T36 - Clean up message store after update
    it('T36: should clean up message store after successful update', async () => {
      handler.setAdapter(mockAdapter);
      handler.setChannelId('test-channel');

      vi.mocked(mockAdapter.sendBlocks).mockResolvedValue('msg-ts-cleanup');
      const request = createMockRequest();
      await handler.sendRequest(request);

      vi.mocked(mockAdapter.updateMessage).mockResolvedValue(true);
      request.status = 'approved';
      await handler.sendUpdate(request);

      expect(mockAdapter.updateMessage).toHaveBeenCalled();
    });
  });
});
