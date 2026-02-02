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

/** Error codes for node communication */
const NodeErrorCode = {
  NOT_FOUND: 'NODE_NOT_FOUND',
  NOT_AVAILABLE: 'NODE_NOT_AVAILABLE',
  UNREACHABLE: 'NODE_UNREACHABLE',
  TIMEOUT: 'NODE_TIMEOUT',
  DISCONNECTED: 'NODE_DISCONNECTED',
  SHUTDOWN: 'COMMUNICATOR_SHUTDOWN',
} as const;

/** Default timeout for node requests (30 seconds) */
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Pending request with timeout and callbacks.
 */
interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
  nodeId: string; // Track which node this request belongs to
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
    const socket = this.getNodeSocket(nodeId);
    if (!socket) {
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
    this.ensureNodeAvailable(nodeId);

    const correlationId = randomUUID();
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const request = { jsonrpc: "2.0", id: correlationId, method, params };

    if (!this.sendToNode(nodeId, request)) {
      throw new Error(`${NodeErrorCode.UNREACHABLE}: Unable to send message to node`);
    }

    return this.createPendingRequest(correlationId, nodeId, timeoutMs);
  }

  /**
   * Handle response from node companion (called when receiving response message).
   * @param message - JSON-RPC response message
   */
  handleNodeResponse(message: { id: string; result?: unknown; error?: { message: string } }): void {
    const { id, result, error } = message;
    const pending = this.pendingRequests.get(id);

    if (!pending) {
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
   * Handle node disconnection - rejects only that node's pending requests.
   * @param socketId - WebSocket socket ID
   */
  handleNodeDisconnect(socketId: string): void {
    this.nodeSessionManager.markOffline(socketId);

    const node = this.nodeSessionManager.getNodeBySocket(socketId);
    if (!node) {
      return;
    }

    // FIX: Only reject pending requests for THIS specific node
    this.rejectNodeRequests(node.nodeId, new Error(`${NodeErrorCode.DISCONNECTED}: Node companion disconnected`));
  }

  /**
   * Clean up all pending requests.
   */
  shutdown(): void {
    const error = new Error(`${NodeErrorCode.SHUTDOWN}: Node communicator shutting down`);
    for (const [id, pending] of this.pendingRequests.entries()) {
      pending.reject(error);
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(id);
    }
  }

  /**
   * Get the WebSocket for a node.
   * @private
   */
  private getNodeSocket(nodeId: string): WebSocket | null {
    const node = this.nodeSessionManager.getNode(nodeId);
    if (!node) {
      return null;
    }

    const sockets = this.getSockets();
    const socket = sockets.get(node.socketId);
    if (!socket || socket.readyState !== socket.OPEN) {
      return null;
    }

    return socket;
  }

  /**
   * Ensure a node is available for communication.
   * @private
   */
  private ensureNodeAvailable(nodeId: string): void {
    const node = this.nodeSessionManager.getNode(nodeId);
    if (!node) {
      throw new Error(`${NodeErrorCode.NOT_FOUND}: Node not found or not paired`);
    }
    if (node.status !== "paired") {
      throw new Error(`${NodeErrorCode.NOT_AVAILABLE}: Node is ${node.status}`);
    }
  }

  /**
   * Create a pending request promise with timeout.
   * @private
   */
  private createPendingRequest(correlationId: string, nodeId: string, timeoutMs: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(correlationId);
        reject(new Error(`${NodeErrorCode.TIMEOUT}: No response after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(correlationId, { resolve, reject, timeout, nodeId });
    });
  }

  /**
   * Reject all pending requests for a specific node.
   * @private
   */
  private rejectNodeRequests(nodeId: string, error: Error): void {
    for (const [id, pending] of this.pendingRequests.entries()) {
      if (pending.nodeId === nodeId) {
        pending.reject(error);
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(id);
      }
    }
  }
}
