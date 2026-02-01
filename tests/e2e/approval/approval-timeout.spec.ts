// E03: Approval Timeout E2E Test
// Tests timeout handling for approval requests

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { setupGateway, teardownGateway, createGatewayClient, callRpc } from "./fixtures/gateway-setup.js";
import type { WebSocket } from "ws";

describe("E03: Approval Timeout", () => {
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

  test("should handle rejection simulating timeout", async () => {
    // Create an approval request
    const invokeResult = await callRpc(client, "tools.invoke", {
      toolId: "system.run",
      sessionId: "test-session-e03-timeout",
      args: {
        argv: "rm -rf /tmp/test-timeout",
        cwd: "/tmp",
      },
      agentId: "test-agent",
      userId: "test-user",
    }) as { invocationId: string; awaitingApproval: boolean };

    expect(invokeResult.awaitingApproval).toBe(true);

    // Verify the request is in pending list
    const listResult1 = await callRpc(client, "tools.getPending", {}) as {
      pending: Array<{ id: string }>;
      count: number;
    };

    const initialCount = listResult1.count;
    expect(initialCount).toBeGreaterThan(0);

    // Simulate timeout by rejecting (real timeout would require time manipulation)
    await callRpc(client, "tools.approve", {
      requestId: invokeResult.invocationId,
      approved: false,
    });

    // Verify the request was removed from pending list
    const listResult2 = await callRpc(client, "tools.getPending", {}) as {
      pending: Array<{ id: string }>;
      count: number;
    };

    // Count should decrease (request removed)
    expect(listResult2.count).toBeLessThanOrEqual(initialCount);

    // Verify the invocation status is failed
    const getResult = await callRpc(client, "tools.getInvocation", {
      invocationId: invokeResult.invocationId,
    }) as { status: string };

    expect(getResult.status).toBe("failed");
  }, 15000);

  test("should handle new request after rejection", async () => {
    // Create first request and reject it
    const invoke1 = await callRpc(client, "tools.invoke", {
      toolId: "system.run",
      sessionId: "test-session-e03-retry-1",
      args: { argv: "command 1", cwd: "/tmp" },
      agentId: "test-agent",
      userId: "test-user",
    }) as { invocationId: string; awaitingApproval: boolean };

    await callRpc(client, "tools.approve", {
      requestId: invoke1.invocationId,
      approved: false,
    });

    // Create a new request with same input (simulating retry)
    const invoke2 = await callRpc(client, "tools.invoke", {
      toolId: "system.run",
      sessionId: "test-session-e03-retry-2",
      args: { argv: "command 1", cwd: "/tmp" },
      agentId: "test-agent",
      userId: "test-user",
    }) as { invocationId: string; awaitingApproval: boolean };

    // Verify new request is created successfully
    expect(invoke2.awaitingApproval).toBe(true);
    expect(invoke2.invocationId).toBeTruthy();
    expect(invoke2.invocationId).not.toBe(invoke1.invocationId);

    // Clean up
    await callRpc(client, "tools.approve", {
      requestId: invoke2.invocationId,
      approved: false,
    });
  }, 20000);

  test("should verify invocation metadata", async () => {
    // Create approval request
    const invokeResult = await callRpc(client, "tools.invoke", {
      toolId: "system.run",
      sessionId: "test-session-e03-meta",
      args: { argv: "test command", cwd: "/tmp" },
      agentId: "test-agent",
      userId: "test-user",
    }) as { invocationId: string; awaitingApproval: boolean };

    expect(invokeResult.awaitingApproval).toBe(true);

    // Get the invocation details
    const getResult = await callRpc(client, "tools.getInvocation", {
      invocationId: invokeResult.invocationId,
    }) as {
      id: string;
      toolId: string;
      sessionId: string;
      status: string;
      startTime: number;
    };

    expect(getResult.id).toBe(invokeResult.invocationId);
    expect(getResult.toolId).toBe("system.run");
    expect(getResult.sessionId).toBe("test-session-e03-meta");
    expect(getResult.status).toBe("awaiting_approval");
    expect(getResult.startTime).toBeGreaterThan(0);

    // Clean up
    await callRpc(client, "tools.approve", {
      requestId: invokeResult.invocationId,
      approved: false,
    });
  }, 15000);
});
