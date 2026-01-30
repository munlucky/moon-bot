// Nodes Tool - Remote command execution and screen capture via Node Companion

import { randomUUID } from "crypto";
import type { ToolSpec, ToolContext, ToolResult } from "../../types/index.js";
import { ToolResultBuilder } from "../runtime/ToolResultBuilder.js";
import { NodeSessionManager } from "./NodeSessionManager.js";
import { NodeCommandValidator } from "./NodeCommandValidator.js";
import { NodeExecutor } from "./NodeExecutor.js";

/**
 * Create nodes.status tool
 */
export function createNodesStatusTool(
  sessionManager: NodeSessionManager
): ToolSpec<unknown, unknown> {
  return {
    id: "nodes.status",
    description: "List paired Node Companion connections with their status and capabilities",
    schema: {
      input: {
        type: "object",
        properties: {},
      },
      output: {
        type: "object",
        properties: {
          nodes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                nodeId: { type: "string" },
                nodeName: { type: "string" },
                status: { type: "string" },
                lastSeen: { type: "number" },
                platform: { type: "string" },
                capabilities: {
                  type: "object",
                  properties: {
                    screenCapture: { type: "boolean" },
                    commandExec: { type: "boolean" },
                  },
                },
              },
            },
          },
          count: { type: "number" },
        },
      },
    },
    run: async (input: unknown, context: ToolContext): Promise<ToolResult> => {
      const userId = context.userId ?? "default";

      try {
        const nodes = sessionManager.getNodesForUser(userId);

        return ToolResultBuilder.success({
          nodes: nodes.map((n) => ({
            nodeId: n.nodeId,
            nodeName: n.nodeName,
            status: n.status,
            lastSeen: n.lastSeen,
            platform: n.platform,
            capabilities: n.capabilities,
          })),
          count: nodes.length,
        });
      } catch (error) {
        return ToolResultBuilder.failure(
          "NODE_LIST_ERROR",
          error instanceof Error ? error.message : "Failed to list nodes"
        );
      }
    },
  };
}

/**
 * Create nodes.run tool
 */
export function createNodesRunTool(
  sessionManager: NodeSessionManager,
  commandValidator: NodeCommandValidator,
  nodeExecutor?: NodeExecutor
): ToolSpec<unknown, unknown> {
  return {
    id: "nodes.run",
    description: "Execute a command on a paired Node Companion. Requires approval for sensitive operations.",
    requiresApproval: true,
    schema: {
      input: {
        type: "object",
        properties: {
          nodeId: {
            type: "string",
            description: "Node ID to execute command on (optional, defaults to first available node)",
          },
          argv: {
            oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
            description: "Command and arguments to execute",
          },
          cwd: {
            type: "string",
            description: "Working directory (optional)",
          },
          env: {
            type: "object",
            description: "Environment variables (optional)",
          },
          timeoutMs: {
            type: "number",
            description: "Timeout in milliseconds (max 300000, default 30000)",
          },
        },
        required: ["argv"],
      },
      output: {
        type: "object",
        properties: {
          success: { type: "boolean" },
          nodeId: { type: "string" },
          nodeName: { type: "string" },
          exitCode: { type: "number" },
          stdout: { type: "string" },
          stderr: { type: "string" },
        },
      },
    },
    run: async (input: unknown, context: ToolContext): Promise<ToolResult> => {
      const userId = context.userId ?? "default";
      const params = input as {
        nodeId?: string;
        argv: string | string[];
        cwd?: string;
        env?: Record<string, string>;
        timeoutMs?: number;
      };

      try {
        // Validate command
        const argValidation = commandValidator.validateArguments(params.argv);
        if (!argValidation.valid) {
          return ToolResultBuilder.failure("COMMAND_BLOCKED", argValidation.error ?? "Command validation failed");
        }

        // Validate CWD
        if (params.cwd) {
          const cwdValidation = commandValidator.validateCwd(params.cwd);
          if (!cwdValidation.valid) {
            return ToolResultBuilder.failure("INVALID_CWD", cwdValidation.error ?? "Invalid working directory");
          }
        }

        // Validate env
        if (params.env) {
          const envValidation = commandValidator.validateEnv(params.env);
          if (!envValidation.valid) {
            return ToolResultBuilder.failure("INVALID_ENV", envValidation.error ?? "Invalid environment variables");
          }
        }

        // Select node
        const node = sessionManager.selectNodeForCommand(userId, params.nodeId);

        if (!node.capabilities.commandExec) {
          return ToolResultBuilder.failure("NODE_CAPABILITY_REQUIRED", "This node does not support command execution");
        }

        if (node.status !== "paired") {
          return ToolResultBuilder.failure("NODE_NOT_AVAILABLE", `Node is ${node.status}`);
        }

        // Execute via NodeExecutor if available
        if (nodeExecutor) {
          const result = await nodeExecutor.executeCommand(userId, params.argv, {
            nodeId: params.nodeId,
            cwd: params.cwd,
            env: params.env,
            timeoutMs: params.timeoutMs,
          });

          return ToolResultBuilder.success({
            success: result.success,
            nodeId: result.nodeId,
            nodeName: result.nodeName,
            exitCode: result.exitCode ?? null,
            stdout: result.stdout ?? "",
            stderr: result.stderr ?? "",
            status: result.status,
          });
        }

        // Fallback: return queued status if NodeExecutor not configured
        return ToolResultBuilder.success({
          success: true,
          nodeId: node.nodeId,
          nodeName: node.nodeName,
          status: "queued",
          message: "Command queued for execution on remote node (NodeExecutor not configured)",
        });
      } catch (error) {
        return ToolResultBuilder.failure(
          "NODE_RUN_ERROR",
          error instanceof Error ? error.message : "Failed to execute command on node"
        );
      }
    },
  };
}

/**
 * Create nodes.screen_snap tool
 */
export function createNodesScreenSnapTool(
  sessionManager: NodeSessionManager,
  nodeExecutor?: NodeExecutor
): ToolSpec<unknown, unknown> {
  return {
    id: "nodes.screen_snap",
    description: "Capture a screenshot from a paired Node Companion. Requires user consent.",
    requiresApproval: true,
    schema: {
      input: {
        type: "object",
        properties: {
          nodeId: {
            type: "string",
            description: "Node ID to capture from (optional, defaults to first screen-capable node)",
          },
        },
      },
      output: {
        type: "object",
        properties: {
          success: { type: "boolean" },
          nodeId: { type: "string" },
          nodeName: { type: "string" },
          imageData: { type: "string", description: "Base64-encoded PNG image" },
          format: { type: "string", enum: ["png"] },
        },
      },
    },
    run: async (input: unknown, context: ToolContext): Promise<ToolResult> => {
      const userId = context.userId ?? "default";
      const params = input as { nodeId?: string };

      try {
        // Find screen capture capable node
        let node;
        if (params.nodeId) {
          node = sessionManager.getNode(params.nodeId);
          if (!node || node.userId !== userId) {
            return ToolResultBuilder.failure("NODE_NOT_FOUND", "Node not found or access denied");
          }
        } else {
          node = sessionManager.getScreenCaptureCapableNode(userId);
        }

        if (!node) {
          return ToolResultBuilder.failure(
            "NODE_NOT_FOUND",
            "No screen capture capable node found. Pair a node with screen capture support first."
          );
        }

        if (!node.capabilities.screenCapture) {
          return ToolResultBuilder.failure("NODE_CAPABILITY_REQUIRED", "This node does not support screen capture");
        }

        if (node.status !== "paired") {
          return ToolResultBuilder.failure("NODE_NOT_AVAILABLE", `Node is ${node.status}`);
        }

        // Check consent
        if (!sessionManager.hasScreenCaptureConsent(node.nodeId)) {
          return ToolResultBuilder.failure(
            "CONSENT_REQUIRED",
            "Screen capture consent not granted. User must grant consent via nodes.consent.grant"
          );
        }

        // Execute via NodeExecutor if available
        if (nodeExecutor) {
          const result = await nodeExecutor.requestScreenCapture(userId, params.nodeId);

          return ToolResultBuilder.success({
            success: result.success,
            nodeId: result.nodeId,
            nodeName: result.nodeName,
            imageData: result.imageData,
            format: result.format,
            status: result.status,
          });
        }

        // Fallback: return queued status if NodeExecutor not configured
        return ToolResultBuilder.success({
          success: true,
          nodeId: node.nodeId,
          nodeName: node.nodeName,
          status: "queued",
          message: "Screen capture requested from remote node (NodeExecutor not configured)",
        });
      } catch (error) {
        return ToolResultBuilder.failure(
          "NODE_CAPTURE_ERROR",
          error instanceof Error ? error.message : "Failed to capture screen from node"
        );
      }
    },
  };
}

/**
 * Create nodes.consent.grant tool
 */
export function createNodesConsentGrantTool(
  sessionManager: NodeSessionManager
): ToolSpec<unknown, unknown> {
  return {
    id: "nodes.consent.grant",
    description: "Grant screen capture consent for a paired Node Companion",
    schema: {
      input: {
        type: "object",
        properties: {
          nodeId: {
            type: "string",
            description: "Node ID to grant consent for",
          },
          durationMs: {
            type: "number",
            description: "Consent duration in milliseconds (optional, defaults to indefinite)",
          },
        },
        required: ["nodeId"],
      },
      output: {
        type: "object",
        properties: {
          success: { type: "boolean" },
          nodeId: { type: "string" },
          grantedAt: { type: "number" },
          expiresAt: { type: "number" },
        },
      },
    },
    run: async (input: unknown, context: ToolContext): Promise<ToolResult> => {
      const userId = context.userId ?? "default";
      const params = input as { nodeId: string; durationMs?: number };

      try {
        const node = sessionManager.getNode(params.nodeId);

        if (!node || node.userId !== userId) {
          return ToolResultBuilder.failure("NODE_NOT_FOUND", "Node not found or access denied");
        }

        sessionManager.grantScreenCaptureConsent(params.nodeId, params.durationMs);

        return ToolResultBuilder.success({
          success: true,
          nodeId: params.nodeId,
          grantedAt: Date.now(),
          expiresAt: params.durationMs ? Date.now() + params.durationMs : undefined,
        });
      } catch (error) {
        return ToolResultBuilder.failure(
          "CONSENT_GRANT_ERROR",
          error instanceof Error ? error.message : "Failed to grant consent"
        );
      }
    },
  };
}

/**
 * Create nodes.consent.revoke tool
 */
export function createNodesConsentRevokeTool(
  sessionManager: NodeSessionManager
): ToolSpec<unknown, unknown> {
  return {
    id: "nodes.consent.revoke",
    description: "Revoke screen capture consent for a paired Node Companion",
    schema: {
      input: {
        type: "object",
        properties: {
          nodeId: {
            type: "string",
            description: "Node ID to revoke consent for",
          },
        },
        required: ["nodeId"],
      },
      output: {
        type: "object",
        properties: {
          success: { type: "boolean" },
          nodeId: { type: "string" },
        },
      },
    },
    run: async (input: unknown, context: ToolContext): Promise<ToolResult> => {
      const userId = context.userId ?? "default";
      const params = input as { nodeId: string };

      try {
        const node = sessionManager.getNode(params.nodeId);

        if (!node || node.userId !== userId) {
          return ToolResultBuilder.failure("NODE_NOT_FOUND", "Node not found or access denied");
        }

        sessionManager.revokeScreenCaptureConsent(params.nodeId);

        return ToolResultBuilder.success({
          success: true,
          nodeId: params.nodeId,
        });
      } catch (error) {
        return ToolResultBuilder.failure(
          "CONSENT_REVOKE_ERROR",
          error instanceof Error ? error.message : "Failed to revoke consent"
        );
      }
    },
  };
}

/**
 * Create nodes.consent.check tool
 */
export function createNodesConsentCheckTool(
  sessionManager: NodeSessionManager
): ToolSpec<unknown, unknown> {
  return {
    id: "nodes.consent.check",
    description: "Check screen capture consent status for a paired Node Companion",
    schema: {
      input: {
        type: "object",
        properties: {
          nodeId: {
            type: "string",
            description: "Node ID to check consent for",
          },
        },
        required: ["nodeId"],
      },
      output: {
        type: "object",
        properties: {
          nodeId: { type: "string" },
          hasConsent: { type: "boolean" },
          grantedAt: { type: "number" },
          expiresAt: { type: "number" },
        },
      },
    },
    run: async (input: unknown, context: ToolContext): Promise<ToolResult> => {
      const userId = context.userId ?? "default";
      const params = input as { nodeId: string };

      try {
        const node = sessionManager.getNode(params.nodeId);

        if (!node || node.userId !== userId) {
          return ToolResultBuilder.failure("NODE_NOT_FOUND", "Node not found or access denied");
        }

        const hasConsent = sessionManager.hasScreenCaptureConsent(params.nodeId);

        return ToolResultBuilder.success({
          nodeId: params.nodeId,
          hasConsent,
          grantedAt: node.screenCaptureConsent.grantedAt,
          expiresAt: node.screenCaptureConsent.expiresAt,
        });
      } catch (error) {
        return ToolResultBuilder.failure(
          "CONSENT_CHECK_ERROR",
          error instanceof Error ? error.message : "Failed to check consent"
        );
      }
    },
  };
}

/**
 * Create all nodes tools
 */
export function createNodesTools(
  sessionManager: NodeSessionManager,
  commandValidator: NodeCommandValidator,
  nodeExecutor?: NodeExecutor
): ToolSpec<unknown, unknown>[] {
  return [
    createNodesStatusTool(sessionManager),
    createNodesRunTool(sessionManager, commandValidator, nodeExecutor),
    createNodesScreenSnapTool(sessionManager, nodeExecutor),
    createNodesConsentGrantTool(sessionManager),
    createNodesConsentRevokeTool(sessionManager),
    createNodesConsentCheckTool(sessionManager),
  ];
}
