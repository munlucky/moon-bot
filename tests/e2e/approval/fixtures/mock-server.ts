// Mock Server Setup using MSW (Mock Service Worker)
// Provides WebSocket and HTTP mocking for E2E tests

import { SetupApi, setupServer } from "msw/node";
import type { ApprovalRequest } from "../../../../dist/tools/approval/types.js";

// Mock handlers storage
let mockServer: SetupApi | null = null;

/**
 * Approval request storage for mocking.
 * Maps requestId -> ApprovalRequest
 */
const approvalStore = new Map<string, ApprovalRequest>();

/**
 * Slack message storage for mocking.
 * Maps channelId -> Array of messages
 */
const slackMessageStore = new Map<string, Array<{ blocks: unknown; ts: string }>>();

/**
 * Discord message storage for mocking.
 * Maps channelId -> Array of messages
 */
const discordMessageStore = new Map<string, Array<{ embed: unknown; id: string }>>();

/**
 * Initialize the mock server with handlers.
 */
export function initializeMockServer(): SetupApi {
  if (mockServer) {
    return mockServer;
  }

  const server = setupServer(
    // Mock Slack chat.postMessage
    {
      method: "post",
      path: "https://slack.com/api/chat.postMessage",
      handler: async ({ request }) => {
        const body = await request.json() as { channel: string; blocks: unknown };
        const channelId = body.channel;
        const timestamp = `${Date.now()}.000000`;

        // Store message
        if (!slackMessageStore.has(channelId)) {
          slackMessageStore.set(channelId, []);
        }
        slackMessageStore.get(channelId)!.push({ blocks: body.blocks, ts: timestamp });

        return new Response(
          JSON.stringify({
            ok: true,
            ts: timestamp,
            channel: channelId,
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      },
    },

    // Mock Slack chat.update
    {
      method: "post",
      path: "https://slack.com/api/chat.update",
      handler: async ({ request }) => {
        const body = await request.json() as { channel: string; ts: string; blocks: unknown };
        const channelId = body.channel;
        const messageTs = body.ts;

        // Update message
        const messages = slackMessageStore.get(channelId);
        if (messages) {
          const index = messages.findIndex((m) => m.ts === messageTs);
          if (index >= 0) {
            messages[index].blocks = body.blocks;
          }
        }

        return new Response(
          JSON.stringify({
            ok: true,
            ts: messageTs,
            channel: channelId,
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      },
    }
  );

  mockServer = server;
  return server;
}

/**
 * Start the mock server.
 */
export async function startMockServer(): Promise<void> {
  const server = initializeMockServer();
  await server.listen();
}

/**
 * Stop the mock server.
 */
export async function stopMockServer(): Promise<void> {
  if (mockServer) {
    await mockServer.close();
    mockServer = null;
  }
}

/**
 * Reset all mock stores.
 */
export function resetMockStores(): void {
  approvalStore.clear();
  slackMessageStore.clear();
  discordMessageStore.clear();
}

/**
 * Get stored Slack messages for a channel.
 */
export function getSlackMessages(channelId: string): Array<{ blocks: unknown; ts: string }> {
  return slackMessageStore.get(channelId) || [];
}

/**
 * Get stored Discord messages for a channel.
 */
export function getDiscordMessages(channelId: string): Array<{ embed: unknown; id: string }> {
  return discordMessageStore.get(channelId) || [];
}

/**
 * Store an approval request.
 */
export function storeApprovalRequest(request: ApprovalRequest): void {
  approvalStore.set(request.id, request);
}

/**
 * Get an approval request by ID.
 */
export function getApprovalRequest(requestId: string): ApprovalRequest | undefined {
  return approvalStore.get(requestId);
}

/**
 * Get all stored approval requests.
 */
export function getAllApprovalRequests(): ApprovalRequest[] {
  return Array.from(approvalStore.values());
}
