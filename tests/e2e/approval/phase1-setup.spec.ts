// Phase 1 Foundation Setup Tests
// Verifies that the basic E2E test infrastructure and fixtures work correctly

import { describe, test, expect } from "vitest";
import {
  createMockApprovalRequest,
  createMockSlackBlocks,
  createMockDiscordEmbed,
  createMockSystemConfig,
  mockUsers,
  mockChannels,
} from "./fixtures/test-data.js";

describe("Phase 1: Foundation Setup", () => {
  describe("Test Data Factories", () => {
    test("should create valid approval request", () => {
      const request = createMockApprovalRequest();

      expect(request.id).toMatch(/^approval-/);
      expect(request.invocationId).toBeTruthy();
      expect(request.toolId).toBe("system.run");
      expect(request.status).toBe("pending");
      expect(request.createdAt).toBeGreaterThan(0);
      expect(request.expiresAt).toBeGreaterThan(request.createdAt);
    });

    test("should allow overriding approval request fields", () => {
      const customToolId = "custom.tool";
      const customStatus = "approved" as const;

      const request = createMockApprovalRequest({
        toolId: customToolId,
        status: customStatus,
      });

      expect(request.toolId).toBe(customToolId);
      expect(request.status).toBe(customStatus);
    });

    test("should create valid Slack blocks", () => {
      const requestId = "test-request-123";
      const blocks = createMockSlackBlocks(requestId);

      expect(blocks.blocks).toBeInstanceOf(Array);
      expect(blocks.blocks.length).toBeGreaterThan(0);
      expect(blocks.fallbackText).toBe("Approval request");

      // Check action buttons contain request ID
      const actionsBlock = blocks.blocks.find((b: { type: string }) => b.type === "actions");
      expect(actionsBlock).toBeDefined();
      expect(JSON.stringify(actionsBlock)).toContain(requestId);
    });

    test("should create valid Discord embed", () => {
      const requestId = "test-request-456";
      const embed = createMockDiscordEmbed(requestId);

      expect(embed.title).toBe("Approval Required");
      expect(embed.color).toBe(0xffff00);
      expect(embed.fields).toBeInstanceOf(Array);
      expect(embed.components).toBeInstanceOf(Array);

      // Check components contain request ID
      expect(JSON.stringify(embed.components)).toContain(requestId);
    });

    test("should create valid system config", () => {
      const config = createMockSystemConfig();

      expect(config.agents).toBeInstanceOf(Array);
      expect(config.agents.length).toBeGreaterThan(0);
      expect(config.gateways).toBeInstanceOf(Array);
      expect(config.gateways[0].port).toBe(18789);
    });
  });

  describe("Mock User and Channel Data", () => {
    test("should have valid Slack user data", () => {
      expect(mockUsers.slackUser.id).toMatch(/^U\d+$/);
      expect(mockUsers.slackUser.name).toBeTruthy();
      expect(mockUsers.slackUser.teamId).toMatch(/^T\d+$/);
    });

    test("should have valid Discord user data", () => {
      expect(mockUsers.discordUser.id).toMatch(/^\d+$/);
      expect(mockUsers.discordUser.username).toBeTruthy();
      expect(mockUsers.discordUser.discriminator).toMatch(/^\d{4}$/);
    });

    test("should have valid Slack channel data", () => {
      expect(mockChannels.slackChannel.id).toMatch(/^C\d+$/);
      expect(mockChannels.slackChannel.name).toBeTruthy();
    });

    test("should have valid Discord channel data", () => {
      expect(mockChannels.discordChannel.id).toMatch(/^\d+$/);
      expect(mockChannels.discordChannel.name).toBeTruthy();
    });
  });

  describe("Approval Request Lifecycle", () => {
    test("should calculate expiration correctly", () => {
      const request = createMockApprovalRequest();
      const expirationDuration = request.expiresAt - request.createdAt;

      // Default expiration is 5 minutes (300000ms)
      expect(expirationDuration).toBe(300000);
    });

    test("should generate unique request IDs", () => {
      const request1 = createMockApprovalRequest();
      const request2 = createMockApprovalRequest();

      expect(request1.id).not.toBe(request2.id);
      expect(request1.invocationId).not.toBe(request2.invocationId);
    });

    test("should support different approval statuses", () => {
      const pending = createMockApprovalRequest({ status: "pending" });
      const approved = createMockApprovalRequest({ status: "approved" });
      const rejected = createMockApprovalRequest({ status: "rejected" });
      const expired = createMockApprovalRequest({ status: "expired" });

      expect(pending.status).toBe("pending");
      expect(approved.status).toBe("approved");
      expect(rejected.status).toBe("rejected");
      expect(expired.status).toBe("expired");
    });
  });
});
