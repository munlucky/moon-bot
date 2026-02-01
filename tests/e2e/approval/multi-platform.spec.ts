// E04: Multi-Client E2E Test
// Tests approval flow with multiple connected clients

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { setupGateway, teardownGateway, createGatewayClient, callRpc } from "./fixtures/gateway-setup.js";
import type { WebSocket } from "ws";

describe("E04: Multi-Client", () => {
  let gatewayPort: number;
  let gatewayToken: string;
  let client: WebSocket & { clientId: string };
  let client2: WebSocket & { clientId: string };

  beforeAll(async () => {
    const setup = await setupGateway();
    gatewayPort = setup.port;
    gatewayToken = setup.token;
    client = await createGatewayClient(gatewayPort, gatewayToken);
    client2 = await createGatewayClient(gatewayPort, gatewayToken);
  }, 30000);

  afterAll(async () => {
    await teardownGateway();
  });

  test("should handle approval from one client", async () => {
    // Create an approval request via first client
    const invokeResult = await callRpc(client, "tools.invoke", {
      toolId: "system.run",
      sessionId: "test-session-e04-multi",
      args: {
        argv: "sudo rm -rf /important/data",
        cwd: "/tmp",
      },
      agentId: "test-agent",
      userId: "test-user",
    }) as { invocationId: string; awaitingApproval: boolean };

    expect(invokeResult.awaitingApproval).toBe(true);

    // Both clients should see the same pending list
    const pending1 = await callRpc(client, "tools.getPending", {}) as {
      pending: Array<{ id: string }>;
      count: number;
    };

    const pending2 = await callRpc(client2, "tools.getPending", {}) as {
      pending: Array<{ id: string }>;
      count: number;
    };

    expect(pending1.count).toBe(pending2.count);
    expect(pending1.count).toBeGreaterThan(0);

    // First client approves
    const approveResult = await callRpc(client, "tools.approve", {
      requestId: invokeResult.invocationId,
      approved: true,
    }) as { ok: boolean };

    expect(approveResult.ok).toBe(true);

    // Both clients should see the invocation as completed
    const getResult1 = await callRpc(client, "tools.getInvocation", {
      invocationId: invokeResult.invocationId,
    }) as { status: string };

    const getResult2 = await callRpc(client2, "tools.getInvocation", {
      invocationId: invokeResult.invocationId,
    }) as { status: string };

    expect(getResult1.status).toBe("completed");
    expect(getResult2.status).toBe("completed");
  }, 20000);

  test("should handle rejection visible to all clients", async () => {
    // Create approval request
    const invokeResult = await callRpc(client, "tools.invoke", {
      toolId: "system.run",
      sessionId: "test-session-e04-multi-reject",
      args: { argv: "dangerous command", cwd: "/tmp" },
      agentId: "test-agent",
      userId: "test-user",
    }) as { invocationId: string; awaitingApproval: boolean };

    expect(invokeResult.awaitingApproval).toBe(true);

    // First client rejects
    const rejectResult = await callRpc(client, "tools.approve", {
      requestId: invokeResult.invocationId,
      approved: false,
    }) as { ok: boolean; error?: { code?: string } };

    // Rejection returns ok: false with APPROVAL_DENIED error
    expect(rejectResult.ok).toBe(false);
    expect(rejectResult.error?.code).toBe("APPROVAL_DENIED");

    // Both clients should see the invocation as failed
    const getResult1 = await callRpc(client, "tools.getInvocation", {
      invocationId: invokeResult.invocationId,
    }) as { status: string };

    const getResult2 = await callRpc(client2, "tools.getInvocation", {
      invocationId: invokeResult.invocationId,
    }) as { status: string };

    expect(getResult1.status).toBe("failed");
    expect(getResult2.status).toBe("failed");
  }, 20000);

  test("should maintain consistent pending list across clients", async () => {
    // Create two separate approval requests
    const invoke1 = await callRpc(client, "tools.invoke", {
      toolId: "system.run",
      sessionId: "test-session-e04-list-1",
      args: { argv: "cmd1", cwd: "/tmp" },
      agentId: "test-agent",
      userId: "test-user",
    }) as { invocationId: string; awaitingApproval: boolean };

    const invoke2 = await callRpc(client2, "tools.invoke", {
      toolId: "system.run",
      sessionId: "test-session-e04-list-2",
      args: { argv: "cmd2", cwd: "/tmp" },
      agentId: "test-agent",
      userId: "test-user",
    }) as { invocationId: string; awaitingApproval: boolean };

    expect(invoke1.awaitingApproval).toBe(true);
    expect(invoke2.awaitingApproval).toBe(true);

    // Both clients should see the same pending list
    const list1 = await callRpc(client, "tools.getPending", {}) as { count: number };
    const list2 = await callRpc(client2, "tools.getPending", {}) as { count: number };

    expect(list1.count).toBe(list2.count);
    expect(list1.count).toBeGreaterThanOrEqual(2);

    // Clean up
    await callRpc(client, "tools.approve", {
      requestId: invoke1.invocationId,
      approved: false,
    });

    await callRpc(client2, "tools.approve", {
      requestId: invoke2.invocationId,
      approved: false,
    });
  }, 20000);
});
