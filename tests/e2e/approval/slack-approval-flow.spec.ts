// E01: Slack Approval Flow E2E Test
// Tests tool invocation with approval flow

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { setupGateway, teardownGateway, createGatewayClient, callRpc } from "./fixtures/gateway-setup.js";
import type { WebSocket } from "ws";

describe("E01: Tool Approval Flow", () => {
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

  test("should complete tool approval flow", async () => {
    // Step 1: Invoke a tool that requires approval (system.run with dangerous command)
    const invokeResult = await callRpc(client, "tools.invoke", {
      toolId: "system.run",
      sessionId: "test-session-e01",
      args: {
        argv: "rm -rf /tmp/test",
        cwd: "/tmp",
      },
      agentId: "test-agent",
      userId: "test-user",
    }) as { invocationId: string; awaitingApproval: boolean };

    // Verify tool execution is paused for approval
    expect(invokeResult.awaitingApproval).toBe(true);
    expect(invokeResult.invocationId).toBeTruthy();

    // Step 2: Check pending approvals list
    const pendingResult = await callRpc(client, "tools.getPending", {}) as {
      pending: Array<{ id: string; toolId: string }>;
      count: number;
    };

    expect(pendingResult.count).toBeGreaterThan(0);
    const pendingRequest = pendingResult.pending.find(
      (p) => p.id === invokeResult.invocationId
    );
    expect(pendingRequest).toBeDefined();

    // Step 3: Approve the tool execution
    const approveResult = await callRpc(client, "tools.approve", {
      requestId: invokeResult.invocationId,
      approved: true,
    }) as { ok: boolean };

    expect(approveResult.ok).toBe(true);

    // Step 4: Verify invocation status changed to completed
    const getInvocationResult = await callRpc(client, "tools.getInvocation", {
      invocationId: invokeResult.invocationId,
    }) as {
      id: string;
      toolId: string;
      status: string;
      result?: unknown;
    };

    // Status should be completed after approval
    expect(getInvocationResult.status).toBe("completed");
    expect(getInvocationResult.id).toBe(invokeResult.invocationId);
  }, 15000);

  test("should handle rejection via approval flow", async () => {
    // Invoke tool requiring approval
    const invokeResult = await callRpc(client, "tools.invoke", {
      toolId: "system.run",
      sessionId: "test-session-e01-reject",
      args: {
        argv: "rm -rf /tmp/test2",
        cwd: "/tmp",
      },
      agentId: "test-agent",
      userId: "test-user",
    }) as { invocationId: string; awaitingApproval: boolean };

    expect(invokeResult.awaitingApproval).toBe(true);

    // Reject the approval
    const rejectResult = await callRpc(client, "tools.approve", {
      requestId: invokeResult.invocationId,
      approved: false,
    }) as { ok: boolean; error?: { code?: string } };

    // Rejection returns ok: false with APPROVAL_DENIED error
    expect(rejectResult.ok).toBe(false);
    expect(rejectResult.error?.code).toBe("APPROVAL_DENIED");

    // Verify invocation status is failed
    const getInvocationResult = await callRpc(client, "tools.getInvocation", {
      invocationId: invokeResult.invocationId,
    }) as {
      status: string;
      result?: { error?: { code?: string } };
    };

    expect(getInvocationResult.status).toBe("failed");
    expect(getInvocationResult.result?.error?.code).toBe("APPROVAL_DENIED");
  }, 15000);

  test("should verify approval request persists in list", async () => {
    // Create multiple approval requests
    const invoke1 = await callRpc(client, "tools.invoke", {
      toolId: "system.run",
      sessionId: "test-session-e01-list-1",
      args: { argv: "cmd1", cwd: "/tmp" },
      agentId: "test-agent",
      userId: "test-user",
    }) as { invocationId: string; awaitingApproval: boolean };

    const invoke2 = await callRpc(client, "tools.invoke", {
      toolId: "system.run",
      sessionId: "test-session-e01-list-2",
      args: { argv: "cmd2", cwd: "/tmp" },
      agentId: "test-agent",
      userId: "test-user",
    }) as { invocationId: string; awaitingApproval: boolean };

    expect(invoke1.awaitingApproval).toBe(true);
    expect(invoke2.awaitingApproval).toBe(true);

    // Check both are in pending list
    const pendingResult = await callRpc(client, "tools.getPending", {}) as {
      pending: Array<{ id: string }>;
      count: number;
    };

    expect(pendingResult.count).toBeGreaterThanOrEqual(2);

    const ids = pendingResult.pending.map((p) => p.id);
    expect(ids).toContain(invoke1.invocationId);
    expect(ids).toContain(invoke2.invocationId);

    // Clean up
    await callRpc(client, "tools.approve", {
      requestId: invoke1.invocationId,
      approved: false,
    });

    await callRpc(client, "tools.approve", {
      requestId: invoke2.invocationId,
      approved: false,
    });
  }, 15000);
});
