/**
 * Gateway ↔ TaskOrchestrator Integration Tests
 *
 * Tests the integration between Gateway RPC handlers and TaskOrchestrator
 * using actual WebSocket connections.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { WebSocket } from 'ws';
import { GatewayServer } from './server.js';
import type { SystemConfig } from '../types/index.js';

// Test configuration
const TEST_PORT = 18799;
const TEST_HOST = '127.0.0.1';
const TEST_TOKEN = 'integration-test-token-12345';

const createTestConfig = (): SystemConfig => ({
  logLevel: 'error',
  gatewayPort: TEST_PORT,
  gatewayHost: TEST_HOST,
  gatewayToken: TEST_TOKEN,
  workspaceRoot: '/test/workspace',
  gateways: [],
  agents: [
    {
      id: 'test-agent',
      name: 'Test Agent',
      model: 'test-model',
      type: 'chat',
    },
  ],
  channels: [],
  tools: [],
} as unknown as SystemConfig);

// Helper to create JSON-RPC request
function createRpcRequest(method: string, params: unknown, id: number = 1): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    method,
    params,
    id,
  });
}

// Helper to send RPC and wait for response
async function sendRpc(
  ws: WebSocket,
  method: string,
  params: unknown,
  id: number = 1,
  timeoutMs: number = 5000
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`RPC timeout for ${method}`));
    }, timeoutMs);

    const handler = (data: WebSocket.RawData) => {
      const message = JSON.parse(data.toString());
      if (message.id === id) {
        ws.removeListener('message', handler);
        clearTimeout(timeout);
        if (message.error) {
          reject(new Error(message.error.message));
        } else {
          resolve(message.result);
        }
      }
    };

    ws.on('message', handler);
    ws.send(createRpcRequest(method, params, id));
  });
}

// Helper to connect to gateway
async function connectToGateway(token: string = TEST_TOKEN): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${TEST_HOST}:${TEST_PORT}`);

    ws.on('open', async () => {
      try {
        // Authenticate
        await sendRpc(ws, 'connect', {
          token,
          clientType: 'test',
          clientName: 'integration-test',
        }, 0);
        resolve(ws);
      } catch (error) {
        reject(error);
      }
    });

    ws.on('error', reject);

    setTimeout(() => {
      reject(new Error('Connection timeout'));
    }, 5000);
  });
}

describe('Gateway ↔ TaskOrchestrator Integration', () => {
  let gateway: GatewayServer;
  let ws: WebSocket;
  let rpcId: number;

  beforeAll(async () => {
    const config = createTestConfig();
    gateway = new GatewayServer(config);
    await gateway.start(TEST_PORT, TEST_HOST);

    // Wait for server to be fully ready
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  afterAll(async () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
    if (gateway) {
      await gateway.stop();
    }
  });

  beforeEach(async () => {
    rpcId = 1;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    ws = await connectToGateway();
  });

  describe('chat.send → TaskOrchestrator.createTask', () => {
    it('should create a task when chat.send RPC is called', async () => {
      const result = await sendRpc(ws, 'chat.send', {
        agentId: 'test-agent',
        userId: 'user-1',
        channelId: 'channel-1',
        text: 'Hello, integration test!',
      }, rpcId++);

      expect(result).toBeDefined();
      expect((result as { taskId: string }).taskId).toBeDefined();
      expect((result as { status: string }).status).toBe('queued');
      expect(['PENDING', 'RUNNING', 'DONE']).toContain((result as { state: string }).state);
    });

    it('should create multiple tasks for multiple messages', async () => {
      const messages = [
        { agentId: 'test-agent', userId: 'user-1', channelId: 'ch-1', text: 'First' },
        { agentId: 'test-agent', userId: 'user-1', channelId: 'ch-1', text: 'Second' },
        { agentId: 'test-agent', userId: 'user-1', channelId: 'ch-1', text: 'Third' },
      ];

      const taskIds: string[] = [];
      for (const msg of messages) {
        const result = await sendRpc(ws, 'chat.send', msg, rpcId++);
        taskIds.push((result as { taskId: string }).taskId);
      }

      // All task IDs should be unique
      const uniqueIds = new Set(taskIds);
      expect(uniqueIds.size).toBe(3);
    });

    it('should handle messages from different channels independently', async () => {
      const [result1, result2] = await Promise.all([
        sendRpc(ws, 'chat.send', {
          agentId: 'test-agent',
          userId: 'user-1',
          channelId: 'channel-a',
          text: 'Channel A message',
        }, rpcId++),
        sendRpc(ws, 'chat.send', {
          agentId: 'test-agent',
          userId: 'user-2',
          channelId: 'channel-b',
          text: 'Channel B message',
        }, rpcId++),
      ]);

      expect((result1 as { taskId: string }).taskId).toBeDefined();
      expect((result2 as { taskId: string }).taskId).toBeDefined();
      expect((result1 as { taskId: string }).taskId).not.toBe(
        (result2 as { taskId: string }).taskId
      );
    });
  });

  describe('approval.list → TaskOrchestrator.getPendingApprovals', () => {
    it('should return empty list initially', async () => {
      const result = await sendRpc(ws, 'approval.list', {}, rpcId++);

      expect(result).toBeDefined();
      expect((result as { pending: unknown[] }).pending).toEqual([]);
      expect((result as { count: number }).count).toBe(0);
    });
  });

  describe('approval.grant → TaskOrchestrator.grantApproval', () => {
    it('should fail for non-existent task', async () => {
      await expect(
        sendRpc(ws, 'approval.grant', { taskId: 'non-existent-id', approved: true }, rpcId++)
      ).rejects.toThrow();
    });

    it('should fail for task not in PAUSED state', async () => {
      // Create a task first
      const sendResult = await sendRpc(ws, 'chat.send', {
        agentId: 'test-agent',
        userId: 'user-1',
        channelId: 'channel-grant-test',
        text: 'Approval test message',
      }, rpcId++);

      const taskId = (sendResult as { taskId: string }).taskId;

      // Task is not PAUSED, so approval should fail
      await expect(
        sendRpc(ws, 'approval.grant', { taskId, approved: true }, rpcId++)
      ).rejects.toThrow();
    });
  });

  describe('task response broadcast', () => {
    it('should receive chat.response notification on task completion', async () => {
      const responses: unknown[] = [];

      // Set up listener for notifications
      ws.on('message', (data: WebSocket.RawData) => {
        const message = JSON.parse(data.toString());
        if (message.method === 'chat.response') {
          responses.push(message.params);
        }
      });

      // Send a message
      await sendRpc(ws, 'chat.send', {
        agentId: 'test-agent',
        userId: 'user-1',
        channelId: 'channel-broadcast-test',
        text: 'Broadcast notification test',
      }, rpcId++);

      // Wait for task to complete and notification to be sent
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Should have received at least one response notification
      expect(responses.length).toBeGreaterThan(0);
      expect((responses[0] as { taskId: string }).taskId).toBeDefined();
    });
  });

  describe('full message flow', () => {
    it('should complete full send → process → notify flow', async () => {
      const notifications: unknown[] = [];

      ws.on('message', (data: WebSocket.RawData) => {
        const message = JSON.parse(data.toString());
        if (message.method === 'chat.response') {
          notifications.push(message.params);
        }
      });

      // Send message
      const sendResult = await sendRpc(ws, 'chat.send', {
        agentId: 'test-agent',
        userId: 'user-1',
        channelId: 'channel-full-flow',
        text: 'Full flow test message',
      }, rpcId++);

      expect((sendResult as { status: string }).status).toBe('queued');

      // Wait for completion
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Should receive completion notification
      const completedNotification = notifications.find(
        (n) => (n as { status: string }).status === 'completed'
      );
      expect(completedNotification).toBeDefined();

      // Response should contain some text
      const text = (completedNotification as { text: string }).text;
      expect(text).toBeDefined();
      expect(text.length).toBeGreaterThan(0);
    });
  });
});
