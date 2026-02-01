// Test data factories for E2E tests

import type { ApprovalRequest } from "../../../../dist/tools/approval/types.js";

/**
 * Create a mock approval request for testing.
 */
export function createMockApprovalRequest(
  overrides?: Partial<ApprovalRequest>
): ApprovalRequest {
  const now = Date.now();
  return {
    id: `approval-${crypto.randomUUID()}`,
    invocationId: crypto.randomUUID(),
    toolId: "system.run",
    sessionId: "test-session",
    input: {
      argv: "echo test",
      cwd: "/tmp",
    },
    status: "pending",
    userId: "test-user",
    channelId: "test-channel",
    createdAt: now,
    expiresAt: now + 300000, // 5 minutes
    ...overrides,
  };
}

/**
 * Create a mock Slack block message for approval.
 */
export function createMockSlackBlocks(requestId: string) {
  return {
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Approval Required*\nTool: system.run\nCommand: echo test",
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Approve",
            },
            style: "primary",
            action_id: `approval_approve_${requestId}`,
          },
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Reject",
            },
            style: "danger",
            action_id: `approval_reject_${requestId}`,
          },
        ],
      },
    ],
    fallbackText: "Approval request",
  };
}

/**
 * Create a mock Discord embed message for approval.
 */
export function createMockDiscordEmbed(requestId: string) {
  return {
    title: "Approval Required",
    description: "Tool: system.run\nCommand: echo test",
    color: 0xffff00,
    fields: [
      {
        name: "Tool",
        value: "system.run",
        inline: true,
      },
      {
        name: "Request ID",
        value: requestId,
        inline: true,
      },
    ],
    components: [
      {
        type: 1, // Action Row
        components: [
          {
            type: 2, // Button
            style: 3, // Success
            label: "Approve",
            custom_id: `approval_approve_${requestId}`,
          },
          {
            type: 2, // Button
            style: 4, // Danger
            label: "Reject",
            custom_id: `approval_reject_${requestId}`,
          },
        ],
      },
    ],
  };
}

/**
 * Test user data.
 */
export const mockUsers = {
  slackUser: {
    id: "U1234567890",
    name: "test-user",
    teamId: "T1234567890",
  },
  discordUser: {
    id: "123456789012345678",
    username: "test-user",
    discriminator: "0000",
  },
};

/**
 * Test channel data.
 */
export const mockChannels = {
  slackChannel: {
    id: "C1234567890",
    name: "test-channel",
  },
  discordChannel: {
    id: "123456789012345678",
    name: "test-channel",
  },
};

/**
 * Mock system config for testing.
 */
export function createMockSystemConfig() {
  return {
    agents: [
      {
        id: "test-agent",
        name: "Test Agent",
        model: "gpt-4",
        apiKey: "test-key",
      },
    ],
    channels: [],
    gateways: [
      {
        port: 18789,
        host: "127.0.0.1",
        auth: {
          tokens: {},
        },
      },
    ],
  };
}
