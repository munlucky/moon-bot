/**
 * NodeCommunicator
 *
 * Handles communication with node companions.
 * Single responsibility: node RPC communication with request-response correlation.
 */

import { randomUUID } from "crypto";
import type { WebSocket } from "ws";
import type { NodeSessionManager } from "../tools/nodes/index.js";
import { createLogger, type Logger } from "../utils/logger.js";

/**
 * Pending request with timeout and callbacks.
 */
interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

export interface NodeCommunicatorDeps {
  nodeSessionManager: NodeSessionManager;
  getSockets: () => Map<string, WebSocket>;
  logger: Logger;
}

export class NodeCommunicator {
  private nodeSessionManager: NodeSessionManager;
  private getSockets: () => Map<string, WebSocket>;
  private logger: Logger;
  private pendingRequests = new Map<string, PendingRequest>();

  constructor(deps: NodeCommunicatorDeps) {
    this.nodeSessionManager = deps.nodeSessionManager;
    this.getSockets = deps.getSockets;
    this.logger = deps.logger;
  }

  /**
   * Send a message to a specific node (one-way, no response handling).
   * @param nodeId - Node ID to send message to
   * @param message - Message to send
   * @returns true if sent successfully
   */
  sendToNode(nodeId: string, message: unknown): boolean {
    const node = this.nodeSessionManager.getNode(nodeId);
    if (!node) {
      return false;
    }

    const sockets = this.getSockets();
    const socket = sockets.get(node.socketId);
    if (!socket || socket.readyState !== socket.OPEN) {
      return false;
    }

    socket.send(JSON.stringify(message));
    return true;
  }

  /**
   * Send a message to a node and wait for response with correlation ID.
   * @param nodeId - Node ID to send message to
   * @param method - RPC method name
   * @param params - RPC parameters
   * @param options - Optional timeout configuration
   * @returns Promise that resolves with response or rejects on timeout/error
   */
  async sendToNodeAndWait(
    nodeId: string,
    method: string,
    params: unknown,
    options: { timeoutMs?: number } = {}
  ): Promise<unknown> {
    // Generate correlation ID
    const correlationId = randomUUID();

    // Check node exists and is connected
    const node = this.nodeSessionManager.getNode(nodeId);
    if (!node) {
      throw new Error("NODE_NOT_FOUND: Node not found or not paired");
    }

    if (node.status !== "paired") {
      throw new Error(`NODE_NOT_AVAILABLE: Node is ${node.status}`);
    }

    // Set up timeout
    const timeoutMs = options.timeoutMs ?? 30000; // 30s default

    // Send request
    const request = {
      jsonrpc: "2.0",
      id: correlationId,
      method,
      params,
    };

    const sent = this.sendToNode(nodeId, request);
    if (!sent) {
      throw new Error("NODE_UNREACHABLE: Unable to send message to node");
    }

    // Wait for response
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(correlationId);
        reject(new Error(`NODE_TIMEOUT: No response after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(correlationId, { resolve, reject, timeout });
    });
  }

  /**
   * Handle response from node companion (called when receiving response message).
   * @param message - JSON-RPC response message
   */
  handleNodeResponse(message: { id: string; result?: unknown; error?: { message: string } }): void {
    const { id, result, error } = message;
    const pending = this.pendingRequests.get(id);

    if (!pending) {
      // No pending request for this ID (might be already handled or unknown)
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(id);

    if (error) {
      pending.reject(new Error(error.message));
    } else {
      pending.resolve(result);
    }
  }

  /**
   * Handle node disconnection (rejects all pending requests for that node).
   * @param socketId - WebSocket socket ID
   */
  handleNodeDisconnect(socketId: string): void {
    // Mark node as offline
    this.nodeSessionManager.markOffline(socketId);

    // Find the node and reject all its pending requests
    const node = this.nodeSessionManager.getNodeBySocket(socketId);
    if (node) {
      for (const [id, pending] of this.pendingRequests.entries()) {
        // Reject all pending requests (conservative approach - node disconnected)
        pending.reject(new Error("NODE_DISCONNECTED: Node companion disconnected"));
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(id);
      }
    }
  }

  /**
   * Clean up all pending requests.
   */
  shutdown(): void {
    for (const [id, pending] of this.pendingRequests.entries()) {
      pending.reject(new Error("COMMUNICATOR_SHUTDOWN: Node communicator shutting down"));
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(id);
    }
  }
}
