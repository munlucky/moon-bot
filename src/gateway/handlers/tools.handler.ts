// Tools RPC handlers for the Gateway

import type { JsonRpcHandler } from "../json-rpc.js";
import type { ToolRuntime } from "../../tools/runtime/ToolRuntime.js";
import type { SystemConfig } from "../../types/index.js";
import type { ApprovalFlowManager } from "../../tools/approval/ApprovalFlowManager.js";

/**
 * Create tools RPC handlers map.
 */
export function createToolHandlers(
  runtime: ToolRuntime,
  config: SystemConfig,
  flowManager?: ApprovalFlowManager
): Map<string, JsonRpcHandler> {
  const handlers = new Map<string, JsonRpcHandler>();

  // tools.list: Return available tools with schemas
  handlers.set("tools.list", async (params) => {
    const { sessionId } = params as { sessionId?: string };

    const tools = runtime.listTools();

    return {
      tools,
      count: tools.length,
    };
  });

  // tools.invoke: Execute a tool
  handlers.set("tools.invoke", async (params) => {
    const { toolId, sessionId, args, agentId, userId } = params as {
      toolId: string;
      sessionId: string;
      args: unknown;
      agentId?: string;
      userId?: string;
    };

    return runtime.invoke(
      toolId,
      sessionId,
      args,
      agentId ?? "default",
      userId ?? "default"
    );
  });

  // tools.approve: Approve pending execution (for system.run)
  handlers.set("tools.approve", async (params) => {
    const { requestId, approved } = params as {
      requestId: string;
      approved: boolean;
    };

    return runtime.approveRequest(requestId, approved ?? true);
  });

  // tools.getPending: Get pending approval requests
  handlers.set("tools.getPending", async (params) => {
    const pending = runtime.getPendingApprovals();

    return {
      pending: pending.map((p) => ({
        id: p.id,
        toolId: p.toolId,
        sessionId: p.sessionId,
        input: p.input,
        createdAt: p.startTime,
      })),
      count: pending.length,
    };
  });

  // tools.getInvocation: Get invocation status
  handlers.set("tools.getInvocation", async (params) => {
    const { invocationId } = params as { invocationId: string };

    const invocation = runtime.getInvocation(invocationId);

    if (!invocation) {
      throw new Error("Invocation not found");
    }

    return {
      id: invocation.id,
      toolId: invocation.toolId,
      sessionId: invocation.sessionId,
      status: invocation.status,
      startTime: invocation.startTime,
      endTime: invocation.endTime,
      result: invocation.result,
    };
  });

  // approval.respond: Handle approval response from surfaces
  handlers.set("approval.respond", async (params) => {
    if (!flowManager) {
      throw new Error("Approval flow manager not configured");
    }

    const { requestId, approved, userId } = params as {
      requestId: string;
      approved: boolean;
      userId: string;
    };

    return flowManager.handleResponse(requestId, approved, userId);
  });

  // approval.list: Get pending approval requests
  handlers.set("approval.list", async () => {
    if (!flowManager) {
      return { pending: [], count: 0 };
    }

    const pending = flowManager.listPending();

    return {
      pending: pending.map((p) => ({
        id: p.id,
        invocationId: p.invocationId,
        toolId: p.toolId,
        sessionId: p.sessionId,
        input: p.input,
        status: p.status,
        createdAt: p.createdAt,
        expiresAt: p.expiresAt,
      })),
      count: pending.length,
    };
  });

  return handlers;
}
