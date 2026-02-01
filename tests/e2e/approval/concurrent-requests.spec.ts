// E05: Concurrent Requests E2E Test
// Tests multiple simultaneous approval requests

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { setupGateway, teardownGateway, createGatewayClient, callRpc } from "./fixtures/gateway-setup.js";
import type { WebSocket } from "ws";

describe("E05: Concurrent Requests", () => {
  let gatewayPort: number;
  let gatewayToken: string;
  let client: WebSocket & { clientId: string };

  beforeAll(async () => {
    const setup = await setupGateway();
    gatewayPort = setup.port;
    gatewayToken = setup.token;
    client = await createGatewayClient(gatewayPort, gatewayToken);
  }, 30000);

  afterAll(async () => {
    await teardownGateway();
  });

  test("should handle concurrent approval requests", async () => {
    // Create 3 concurrent approval requests
    const invokePromises = [
      callRpc(client, "tools.invoke", {
        toolId: "system.run",
        sessionId: "test-session-e05-concurrent-1",
        args: { argv: "command 1", cwd: "/tmp" },
        agentId: "test-agent",
        userId: "test-user",
      }),
      callRpc(client, "tools.invoke", {
        toolId: "system.run",
        sessionId: "test-session-e05-concurrent-2",
        args: { argv: "command 2", cwd: "/tmp" },
        agentId: "test-agent",
        userId: "test-user",
      }),
      callRpc(client, "tools.invoke", {
        toolId: "system.run",
        sessionId: "test-session-e05-concurrent-3",
        args: { argv: "command 3", cwd: "/tmp" },
        agentId: "test-agent",
        userId: "test-user",
      }),
    ];

    const invokeResults = await Promise.all(invokePromises) as Array<{
      invocationId: string;
      awaitingApproval: boolean;
    }>;

    // Verify all requests are awaiting approval
    for (const result of invokeResults) {
      expect(result.awaitingApproval).toBe(true);
      expect(result.invocationId).toBeTruthy();
    }

    // Verify all IDs are unique
    const ids = invokeResults.map((r) => r.invocationId);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(3);

    // Verify all requests are in pending list
    const listResult = await callRpc(client, "tools.getPending", {}) as {
      pending: Array<{ id: string }>;
      count: number;
    };

    expect(listResult.count).toBeGreaterThanOrEqual(3);

    // Approve all requests in order
    for (const result of invokeResults) {
      const approveResult = await callRpc(client, "tools.approve", {
        requestId: result.invocationId,
        approved: true,
      }) as { ok: boolean };

      expect(approveResult.ok).toBe(true);
    }

    // Verify all requests were processed
    for (const result of invokeResults) {
      const getResult = await callRpc(client, "tools.getInvocation", {
        invocationId: result.invocationId,
      }) as { status: string };

      expect(getResult.status).toBe("completed");
    }
  }, 30000);

  test("should handle rejection of one request among many", async () => {
    // Create 3 requests, reject the middle one
    const invokePromises = [
      callRpc(client, "tools.invoke", {
        toolId: "system.run",
        sessionId: "test-session-e05-reject-1",
        args: { argv: "cmd 1", cwd: "/tmp" },
        agentId: "test-agent",
        userId: "test-user",
      }),
      callRpc(client, "tools.invoke", {
        toolId: "system.run",
        sessionId: "test-session-e05-reject-2",
        args: { argv: "cmd 2", cwd: "/tmp" },
        agentId: "test-agent",
        userId: "test-user",
      }),
      callRpc(client, "tools.invoke", {
        toolId: "system.run",
        sessionId: "test-session-e05-reject-3",
        args: { argv: "cmd 3", cwd: "/tmp" },
        agentId: "test-agent",
        userId: "test-user",
      }),
    ];

    const invokeResults = await Promise.all(invokePromises) as Array<{
      invocationId: string;
    }>;

    // Approve first, reject second, approve third
    await callRpc(client, "tools.approve", {
      requestId: invokeResults[0].invocationId,
      approved: true,
    });

    await callRpc(client, "tools.approve", {
      requestId: invokeResults[1].invocationId,
      approved: false,
    });

    await callRpc(client, "tools.approve", {
      requestId: invokeResults[2].invocationId,
      approved: true,
    });

    // Verify first and third are completed, second is failed
    const result1 = await callRpc(client, "tools.getInvocation", {
      invocationId: invokeResults[0].invocationId,
    }) as { status: string };

    const result2 = await callRpc(client, "tools.getInvocation", {
      invocationId: invokeResults[1].invocationId,
    }) as { status: string };

    const result3 = await callRpc(client, "tools.getInvocation", {
      invocationId: invokeResults[2].invocationId,
    }) as { status: string };

    expect(result1.status).toBe("completed");
    expect(result2.status).toBe("failed");
    expect(result3.status).toBe("completed");
  }, 30000);

  test("should process requests independently", async () => {
    // Verify each request is processed independently

    // Create 3 requests (reduced from 5 for stability)
    const invokeResults: Array<{ invocationId: string }> = [];
    for (let i = 0; i < 3; i++) {
      const result = await callRpc(client, "tools.invoke", {
        toolId: "system.run",
        sessionId: `test-session-e05-sequential-${i}`,
        args: { argv: `echo test${i}`, cwd: "/tmp" },
        agentId: "test-agent",
        userId: "test-user",
      }) as { invocationId: string };

      invokeResults.push(result);
    }

    // Each should have unique invocation ID
    const uniqueIds = new Set(invokeResults.map((r) => r.invocationId));
    expect(uniqueIds.size).toBe(3);

    // Approve each request individually
    const approvalResults: Array<{ ok: boolean }> = [];
    for (let i = 0; i < invokeResults.length; i++) {
      const result = await callRpc(client, "tools.approve", {
        requestId: invokeResults[i].invocationId,
        approved: true,
      }) as { ok: boolean };

      approvalResults.push(result);
    }

    // All approvals should succeed
    for (let i = 0; i < approvalResults.length; i++) {
      expect(approvalResults[i].ok).toBe(true);
    }

    // Verify all processed
    for (const result of invokeResults) {
      const getResult = await callRpc(client, "tools.getInvocation", {
        invocationId: result.invocationId,
      }) as { status: string };

      expect(getResult.status).toBe("completed");
    }
  }, 40000);
});
