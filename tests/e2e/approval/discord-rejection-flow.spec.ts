// E02: Tool Rejection Flow E2E Test
// Tests rejection flow for tool executions

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { setupGateway, teardownGateway, createGatewayClient, callRpc } from "./fixtures/gateway-setup.js";
import type { WebSocket } from "ws";

describe("E02: Tool Rejection Flow", () => {
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

  test("should complete tool rejection flow", async () => {
    // Step 1: Invoke a tool that requires approval
    const invokeResult = await callRpc(client, "tools.invoke", {
      toolId: "system.run",
      sessionId: "test-session-e02",
      args: {
        argv: "format c:",
        cwd: "/tmp",
      },
      agentId: "test-agent",
      userId: "test-user",
    }) as { invocationId: string; awaitingApproval: boolean };

    expect(invokeResult.awaitingApproval).toBe(true);

    // Step 2: Verify it's in pending list
    const pendingResult = await callRpc(client, "tools.getPending", {}) as {
      pending: Array<{ id: string }>;
      count: number;
    };

    expect(pendingResult.count).toBeGreaterThan(0);

    // Step 3: Reject the tool execution
    const rejectResult = await callRpc(client, "tools.approve", {
      requestId: invokeResult.invocationId,
      approved: false,
    }) as { ok: boolean; error?: { code?: string } };

    // Rejection returns ok: false with APPROVAL_DENIED error
    expect(rejectResult.ok).toBe(false);
    expect(rejectResult.error?.code).toBe("APPROVAL_DENIED");

    // Step 4: Verify the invocation was rejected
    const getInvocationResult = await callRpc(client, "tools.getInvocation", {
      invocationId: invokeResult.invocationId,
    }) as {
      status: string;
      result?: { error?: { code?: string; message?: string } };
    };

    expect(getInvocationResult.status).toBe("failed");
    expect(getInvocationResult.result?.error?.code).toBe("APPROVAL_DENIED");
  }, 15000);

  test("should handle multiple rejection attempts", async () => {
    // Create first approval request
    const invoke1 = await callRpc(client, "tools.invoke", {
      toolId: "system.run",
      sessionId: "test-session-e02-multiple-1",
      args: { argv: "dangerous command 1", cwd: "/tmp" },
      agentId: "test-agent",
      userId: "test-user",
    }) as { invocationId: string; awaitingApproval: boolean };

    // Create second approval request
    const invoke2 = await callRpc(client, "tools.invoke", {
      toolId: "system.run",
      sessionId: "test-session-e02-multiple-2",
      args: { argv: "dangerous command 2", cwd: "/tmp" },
      agentId: "test-agent",
      userId: "test-user",
    }) as { invocationId: string; awaitingApproval: boolean };

    expect(invoke1.awaitingApproval).toBe(true);
    expect(invoke2.awaitingApproval).toBe(true);

    // Reject both
    await callRpc(client, "tools.approve", {
      requestId: invoke1.invocationId,
      approved: false,
    });

    await callRpc(client, "tools.approve", {
      requestId: invoke2.invocationId,
      approved: false,
    });

    // Verify both were rejected
    const result1 = await callRpc(client, "tools.getInvocation", {
      invocationId: invoke1.invocationId,
    }) as { status: string };

    const result2 = await callRpc(client, "tools.getInvocation", {
      invocationId: invoke2.invocationId,
    }) as { status: string };

    expect(result1.status).toBe("failed");
    expect(result2.status).toBe("failed");

    // Verify both IDs are different
    expect(invoke1.invocationId).not.toBe(invoke2.invocationId);
  }, 20000);

  test("should handle approval after rejection", async () => {
    // First request gets rejected
    const invoke1 = await callRpc(client, "tools.invoke", {
      toolId: "system.run",
      sessionId: "test-session-e02-retry",
      args: { argv: "same command", cwd: "/tmp" },
      agentId: "test-agent",
      userId: "test-user",
    }) as { invocationId: string; awaitingApproval: boolean };

    await callRpc(client, "tools.approve", {
      requestId: invoke1.invocationId,
      approved: false,
    });

    // Second similar request can be approved
    const invoke2 = await callRpc(client, "tools.invoke", {
      toolId: "system.run",
      sessionId: "test-session-e02-retry-2",
      args: { argv: "same command", cwd: "/tmp" },
      agentId: "test-agent",
      userId: "test-user",
    }) as { invocationId: string; awaitingApproval: boolean };

    expect(invoke2.awaitingApproval).toBe(true);

    const approveResult = await callRpc(client, "tools.approve", {
      requestId: invoke2.invocationId,
      approved: true,
    }) as { ok: boolean };

    expect(approveResult.ok).toBe(true);

    const getResult = await callRpc(client, "tools.getInvocation", {
      invocationId: invoke2.invocationId,
    }) as { status: string };

    expect(getResult.status).toBe("completed");
  }, 20000);
});
