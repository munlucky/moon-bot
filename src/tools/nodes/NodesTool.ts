// Nodes Tool - Remote command execution and screen capture via Node Companion

import { randomUUID } from "crypto";
import type { ToolSpec, ToolContext, ToolResult } from "../../types/index.js";
import { ToolResultBuilder } from "../runtime/ToolResultBuilder.js";
import { NodeSessionManager } from "./NodeSessionManager.js";
import { NodeCommandValidator } from "./NodeCommandValidator.js";

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
  commandValidator: NodeCommandValidator
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

        // This would normally call via gateway - for now return queued status
        // Actual execution happens via Gateway RPC handlers
        return ToolResultBuilder.success({
          success: true,
          nodeId: node.nodeId,
          nodeName: node.nodeName,
          status: "queued",
          message: "Command queued for execution on remote node",
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
  sessionManager: NodeSessionManager
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

        // This would normally call via gateway - for now return queued status
        // Actual execution happens via Gateway RPC handlers
        return ToolResultBuilder.success({
          success: true,
          nodeId: node.nodeId,
          nodeName: node.nodeName,
          status: "queued",
          message: "Screen capture requested from remote node",
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
 * Create all nodes tools
 */
export function createNodesTools(
  sessionManager: NodeSessionManager,
  commandValidator: NodeCommandValidator
): ToolSpec<unknown, unknown>[] {
  return [
    createNodesStatusTool(sessionManager),
    createNodesRunTool(sessionManager, commandValidator),
    createNodesScreenSnapTool(sessionManager),
  ];
}
