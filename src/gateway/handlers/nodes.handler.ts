// Nodes RPC Handlers for Gateway
// Handles pairing, status, command execution, and screen capture for Node Companion

import type { JsonRpcHandler } from "../json-rpc.js";
import type { NodeSessionManager } from "../../tools/nodes/NodeSessionManager.js";
import type { NodeCommandValidator } from "../../tools/nodes/NodeCommandValidator.js";
import type { SystemConfig } from "../../types/index.js";

/**
 * Create nodes RPC handlers map.
 * @param sessionManager - Node session manager instance
 * @param commandValidator - Command validator instance
 * @param config - System configuration
 * @param sendToNode - Function to send messages to a specific node
 */
export function createNodesHandlers(
  sessionManager: NodeSessionManager,
  commandValidator: NodeCommandValidator,
  _config: SystemConfig,
  _sendToNode: (nodeId: string, message: unknown) => boolean
): Map<string, JsonRpcHandler> {
  const handlers = new Map<string, JsonRpcHandler>();

  // nodes.pair.request: Generate pairing code for user
  handlers.set("nodes.pair.request", async (params) => {
    const { userId } = params as { userId: string };

    if (!userId) {
      throw new Error("userId is required");
    }

    const code = sessionManager.generatePairingCode(userId);

    return {
      success: true,
      code,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    };
  });

  // nodes.pair.verify: Complete pairing (called by Node Companion)
  handlers.set("nodes.pair.verify", async (params) => {
    const { code, socketId, nodeName, platform, capabilities } = params as {
      code: string;
      socketId: string;
      nodeName: string;
      platform: string;
      capabilities: { screenCapture: boolean; commandExec: boolean };
    };

    if (!code || !socketId || !nodeName) {
      throw new Error("Missing required pairing parameters");
    }

    const connection = sessionManager.completePairing(code, socketId, {
      nodeName,
      platform,
      capabilities: capabilities ?? { screenCapture: false, commandExec: true },
    });

    return {
      success: true,
      nodeId: connection.nodeId,
      userId: connection.userId,
    };
  });

  // nodes.status: List paired nodes for a user
  handlers.set("nodes.status", async (params) => {
    const { userId } = params as { userId?: string };

    const nodes = userId
      ? sessionManager.getNodesForUser(userId)
      : sessionManager.getAllNodes();

    return {
      nodes: nodes.map((n) => ({
        nodeId: n.nodeId,
        nodeName: n.nodeName,
        status: n.status,
        lastSeen: n.lastSeen,
        platform: n.platform,
        capabilities: n.capabilities,
      })),
      count: nodes.length,
    };
  });

  // nodes.run: Execute command on a node
  handlers.set("nodes.run", async (params) => {
    const { userId, nodeId, argv, cwd, env, timeoutMs } = params as {
      userId: string;
      nodeId?: string;
      argv: string | string[];
      cwd?: string;
      env?: Record<string, string>;
      timeoutMs?: number;
    };

    if (!userId) {
      throw new Error("userId is required");
    }

    if (!argv) {
      throw new Error("argv is required");
    }

    // Validate command
    const argValidation = commandValidator.validateArguments(argv);
    if (!argValidation.valid) {
      throw new Error(`COMMAND_BLOCKED: ${argValidation.error}`);
    }

    // Validate CWD
    if (cwd) {
      const cwdValidation = commandValidator.validateCwd(cwd);
      if (!cwdValidation.valid) {
        throw new Error(`INVALID_CWD: ${cwdValidation.error}`);
      }
    }

    // Validate env
    if (env) {
      const envValidation = commandValidator.validateEnv(env);
      if (!envValidation.valid) {
        throw new Error(`INVALID_ENV: ${envValidation.error}`);
      }
    }

    // Select node
    const node = sessionManager.selectNodeForCommand(userId, nodeId);

    if (!node.capabilities.commandExec) {
      throw new Error("NODE_CAPABILITY_REQUIRED: This node does not support command execution");
    }

    if (node.status !== "paired") {
      throw new Error(`NODE_NOT_AVAILABLE: Node is ${node.status}`);
    }

    // Send command to node
    const success = _sendToNode(node.nodeId, {
      jsonrpc: "2.0",
      method: "nodes.exec",
      params: {
        argv,
        cwd,
        env,
        timeoutMs: timeoutMs ?? 300000, // 5 minutes default
      },
    });

    if (!success) {
      throw new Error("NODE_UNREACHABLE: Unable to send command to node");
    }

    return {
      success: true,
      nodeId: node.nodeId,
      nodeName: node.nodeName,
      status: "queued",
    };
  });

  // nodes.screen_snap: Request screen capture from a node
  handlers.set("nodes.screen_snap", async (params) => {
    const { userId, nodeId } = params as {
      userId: string;
      nodeId?: string;
    };

    if (!userId) {
      throw new Error("userId is required");
    }

    // Select node (prioritize screen capture capable)
    let node: ReturnType<NodeSessionManager["getNode"]>;

    if (nodeId) {
      node = sessionManager.getNode(nodeId);
      if (!node || node.userId !== userId) {
        throw new Error("NODE_NOT_FOUND: Node not found or access denied");
      }
    } else {
      node = sessionManager.getScreenCaptureCapableNode(userId);
    }

    if (!node) {
      throw new Error("NODE_NOT_FOUND: No screen capture capable node found");
    }

    if (!node.capabilities.screenCapture) {
      throw new Error("NODE_CAPABILITY_REQUIRED: This node does not support screen capture");
    }

    if (node.status !== "paired") {
      throw new Error(`NODE_NOT_AVAILABLE: Node is ${node.status}`);
    }

    // Check consent
    if (!sessionManager.hasScreenCaptureConsent(node.nodeId)) {
      throw new Error("CONSENT_REQUIRED: Screen capture consent not granted");
    }

    // Send capture request to node
    const success = _sendToNode(node.nodeId, {
      jsonrpc: "2.0",
      method: "nodes.capture",
      params: {},
    });

    if (!success) {
      throw new Error("NODE_UNREACHABLE: Unable to send capture request to node");
    }

    return {
      success: true,
      nodeId: node.nodeId,
      nodeName: node.nodeName,
      status: "queued",
    };
  });

  // nodes.consent.grant: Grant screen capture consent (called by user action)
  handlers.set("nodes.consent.grant", async (params) => {
    const { userId, nodeId, durationMs } = params as {
      userId: string;
      nodeId: string;
      durationMs?: number;
    };

    if (!userId || !nodeId) {
      throw new Error("userId and nodeId are required");
    }

    const node = sessionManager.getNode(nodeId);

    if (!node || node.userId !== userId) {
      throw new Error("NODE_NOT_FOUND: Node not found or access denied");
    }

    sessionManager.grantScreenCaptureConsent(nodeId, durationMs);

    return {
      success: true,
      nodeId,
      grantedAt: Date.now(),
      expiresAt: durationMs ? Date.now() + durationMs : undefined,
    };
  });

  // nodes.consent.revoke: Revoke screen capture consent
  handlers.set("nodes.consent.revoke", async (params) => {
    const { userId, nodeId } = params as {
      userId: string;
      nodeId: string;
    };

    if (!userId || !nodeId) {
      throw new Error("userId and nodeId are required");
    }

    const node = sessionManager.getNode(nodeId);

    if (!node || node.userId !== userId) {
      throw new Error("NODE_NOT_FOUND: Node not found or access denied");
    }

    sessionManager.revokeScreenCaptureConsent(nodeId);

    return {
      success: true,
      nodeId,
    };
  });

  // nodes.consent.check: Check screen capture consent status
  handlers.set("nodes.consent.check", async (params) => {
    const { userId, nodeId } = params as {
      userId: string;
      nodeId: string;
    };

    if (!userId || !nodeId) {
      throw new Error("userId and nodeId are required");
    }

    const node = sessionManager.getNode(nodeId);

    if (!node || node.userId !== userId) {
      throw new Error("NODE_NOT_FOUND: Node not found or access denied");
    }

    const hasConsent = sessionManager.hasScreenCaptureConsent(nodeId);

    return {
      nodeId,
      hasConsent,
      grantedAt: node.screenCaptureConsent.grantedAt,
      expiresAt: node.screenCaptureConsent.expiresAt,
    };
  });

  return handlers;
}
