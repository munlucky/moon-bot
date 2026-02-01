// Approval flow helper utilities for E2E testing
// Provides functions to simulate complete approval flows

import type { ApprovalRequest } from "../../../../dist/tools/approval/types.js";
import type { TestRpcClient } from "./websocket-client.js";

/**
 * Simulate a complete approval flow:
 * 1. Tool invocation requires approval
 * 2. Approval request is broadcast
 * 3. User approves
 * 4. Tool execution proceeds
 */
export async function simulateApprovalFlow(
  client: TestRpcClient,
  requestId: string,
  approve: boolean = true,
  userId: string = "test-user"
): Promise<{
  success: boolean;
  result?: unknown;
}> {
  try {
    // Call approval.respond RPC
    const result = await client.call("approval.respond", {
      requestId,
      approved: approve,
      userId,
    });

    return {
      success: true,
      result,
    };
  } catch (error) {
    return {
      success: false,
      result: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Wait for an approval request notification from Gateway.
 */
export async function waitForApprovalRequest(
  client: TestRpcClient,
  timeoutMs: number = 5000
): Promise<{
  taskId: string;
  channelId: string;
  toolId: string;
  input: unknown;
  requestId: string;
}> {
  const params = await client.waitForNotification("approval.requested", timeoutMs);
  return params as {
    taskId: string;
    channelId: string;
    toolId: string;
    input: unknown;
    requestId: string;
  };
}

/**
 * Wait for an approval resolved notification from Gateway.
 */
export async function waitForApprovalResolved(
  client: TestRpcClient,
  timeoutMs: number = 5000
): Promise<{
  taskId: string;
  channelId: string;
  approved: boolean;
  requestId: string;
}> {
  const params = await client.waitForNotification("approval.resolved", timeoutMs);
  return params as {
    taskId: string;
    channelId: string;
    approved: boolean;
    requestId: string;
  };
}

/**
 * List pending approval requests from Gateway.
 */
export async function listPendingApprovals(client: TestRpcClient): Promise<{
  pending: unknown[];
  count: number;
}> {
  const result = await client.call("approval.list");
  return result as {
    pending: unknown[];
    count: number;
  };
}

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
    expiresAt: now + 300000,
    ...overrides,
  };
}

/**
 * Assert approval request status.
 */
export function assertApprovalStatus(
  request: ApprovalRequest,
  expectedStatus: "pending" | "approved" | "rejected" | "expired"
): void {
  if (request.status !== expectedStatus) {
    throw new Error(
      `Expected status ${expectedStatus}, got ${request.status}`
    );
  }
}

/**
 * Calculate time until approval expires.
 */
export function getTimeUntilExpiry(request: ApprovalRequest): number {
  return request.expiresAt - Date.now();
}

/**
 * Check if approval request is expired.
 */
export function isApprovalExpired(request: ApprovalRequest): boolean {
  return Date.now() > request.expiresAt;
}
