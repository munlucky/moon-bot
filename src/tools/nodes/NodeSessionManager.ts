// Node Session Manager
// Manages node pairing, session storage, and consent tracking for Node Companion integration

import { randomUUID } from "crypto";
import type { NodeConnectionStatus } from "./types.js";

/**
 * Screen capture consent state
 */
export interface ScreenCaptureConsent {
  granted: boolean;
  grantedAt?: number;
  expiresAt?: number;
}

/**
 * Node connection state
 */
export interface NodeConnection {
  nodeId: string;
  socketId: string;
  userId: string;
  nodeName: string;
  platform: string;
  capabilities: {
    screenCapture: boolean;
    commandExec: boolean;
  };
  screenCaptureConsent: ScreenCaptureConsent;
  status: NodeConnectionStatus;
  pairedAt: number;
  lastSeen: number;
}

/**
 * Pending pairing request
 */
export interface PendingPairing {
  code: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
}

/**
 * Session manager configuration
 */
export interface NodeSessionManagerConfig {
  pairingCodeTtlMs?: number;
  sessionTimeoutMs?: number;
  maxNodesPerUser?: number;
}

const DEFAULT_CONFIG: Required<NodeSessionManagerConfig> = {
  pairingCodeTtlMs: 5 * 60 * 1000, // 5 minutes
  sessionTimeoutMs: 60 * 60 * 1000, // 1 hour
  maxNodesPerUser: 5,
};

/**
 * Character set for pairing codes (alphanumeric, excluding confusing characters)
 */
const PAIRING_CHARS = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // 34 chars (no I, O)
const PAIRING_CODE_LENGTH = 8;

/**
 * Manages node sessions, pairing, and consent tracking
 */
export class NodeSessionManager {
  private nodes = new Map<string, NodeConnection>();
  private pendingPairings = new Map<string, PendingPairing>();
  private userNodeCount = new Map<string, number>();
  private config: Required<NodeSessionManagerConfig>;

  constructor(config: NodeSessionManagerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate a pairing code for a user
   * @param userId - User ID requesting pairing
   * @returns 8-character alphanumeric pairing code
   */
  generatePairingCode(userId: string): string {
    // Check user limit
    const userNodes = this.getNodesForUser(userId);
    if (userNodes.length >= this.config.maxNodesPerUser) {
      throw new Error(`Maximum nodes per user reached: ${this.config.maxNodesPerUser}`);
    }

    // Clean up expired pairings first
    this.cleanupExpiredPairings();

    // Generate unique code
    let code: string;
    let attempts = 0;
    const maxAttempts = 100;

    do {
      code = this.generateRandomCode();
      attempts++;
      if (attempts > maxAttempts) {
        throw new Error("Failed to generate unique pairing code");
      }
    } while (this.pendingPairings.has(code));

    const now = Date.now();
    const pairing: PendingPairing = {
      code,
      userId,
      createdAt: now,
      expiresAt: now + this.config.pairingCodeTtlMs,
    };

    this.pendingPairings.set(code, pairing);
    return code;
  }

  /**
   * Complete pairing process
   * @param code - Pairing code
   * @param socketId - WebSocket socket ID
   * @param nodeInfo - Node information from Node Companion
   * @returns Node connection
   */
  completePairing(
    code: string,
    socketId: string,
    nodeInfo: {
      nodeName: string;
      platform: string;
      capabilities: { screenCapture: boolean; commandExec: boolean };
    }
  ): NodeConnection {
    const pairing = this.pendingPairings.get(code);

    if (!pairing) {
      throw new Error("Invalid or expired pairing code");
    }

    if (Date.now() > pairing.expiresAt) {
      this.pendingPairings.delete(code);
      throw new Error("Pairing code expired");
    }

    // Check if already paired (same node name for same user)
    const existingNodes = this.getNodesForUser(pairing.userId);
    const existing = existingNodes.find((n) => n.nodeName === nodeInfo.nodeName);
    if (existing) {
      // Update existing connection
      existing.socketId = socketId;
      existing.status = "paired";
      existing.lastSeen = Date.now();
      existing.capabilities = nodeInfo.capabilities;

      // Remove pending pairing
      this.pendingPairings.delete(code);

      return existing;
    }

    // Create new node connection
    const now = Date.now();
    const nodeId = randomUUID();

    const connection: NodeConnection = {
      nodeId,
      socketId,
      userId: pairing.userId,
      nodeName: nodeInfo.nodeName,
      platform: nodeInfo.platform,
      capabilities: nodeInfo.capabilities,
      screenCaptureConsent: { granted: false },
      status: "paired",
      pairedAt: now,
      lastSeen: now,
    };

    this.nodes.set(nodeId, connection);

    // Update user count
    const currentCount = this.userNodeCount.get(pairing.userId) ?? 0;
    this.userNodeCount.set(pairing.userId, currentCount + 1);

    // Remove pending pairing
    this.pendingPairings.delete(code);

    return connection;
  }

  /**
   * Get all nodes for a user
   * @param userId - User ID
   * @returns Array of node connections
   */
  getNodesForUser(userId: string): NodeConnection[] {
    return Array.from(this.nodes.values()).filter((n) => n.userId === userId);
  }

  /**
   * Get node by ID
   * @param nodeId - Node ID
   * @returns Node connection or undefined
   */
  getNode(nodeId: string): NodeConnection | undefined {
    return this.nodes.get(nodeId);
  }

  /**
   * Get node by socket ID
   * @param socketId - WebSocket socket ID
   * @returns Node connection or undefined
   */
  getNodeBySocket(socketId: string): NodeConnection | undefined {
    return Array.from(this.nodes.values()).find((n) => n.socketId === socketId);
  }

  /**
   * Get a node capable of screen capture for a user
   * @param userId - User ID
   * @returns Node connection or undefined
   */
  getScreenCaptureCapableNode(userId: string): NodeConnection | undefined {
    const userNodes = this.getNodesForUser(userId);
    return userNodes.find(
      (n) => n.capabilities.screenCapture && n.status === "paired"
    );
  }

  /**
   * Select a node for command execution
   * @param userId - User ID
   * @param nodeId - Optional node ID (if specified, must belong to user)
   * @returns Node connection or throws error
   */
  selectNodeForCommand(userId: string, nodeId?: string): NodeConnection {
    const userNodes = this.getNodesForUser(userId).filter((n) => n.status === "paired");

    if (userNodes.length === 0) {
      throw new Error("No paired nodes found");
    }

    if (nodeId) {
      const node = this.nodes.get(nodeId);
      if (!node || node.userId !== userId) {
        throw new Error("Node not found or access denied");
      }
      if (node.status !== "paired") {
        throw new Error("Node is not paired");
      }
      return node;
    }

    // Return first paired node
    return userNodes[0];
  }

  /**
   * Update node last seen timestamp
   * @param nodeId - Node ID
   */
  updateLastSeen(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.lastSeen = Date.now();
    }
  }

  /**
   * Mark node as offline
   * @param socketId - WebSocket socket ID
   */
  markOffline(socketId: string): void {
    const node = this.getNodeBySocket(socketId);
    if (node) {
      node.status = "offline";
    }
  }

  /**
   * Mark node as paired (reconnected)
   * @param socketId - WebSocket socket ID
   */
  markPaired(socketId: string): void {
    const node = this.getNodeBySocket(socketId);
    if (node) {
      node.status = "paired";
      node.lastSeen = Date.now();
    }
  }

  /**
   * Grant screen capture consent
   * @param nodeId - Node ID
   * @param durationMs - Optional duration in milliseconds
   */
  grantScreenCaptureConsent(nodeId: string, durationMs?: number): void {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error("Node not found");
    }

    node.screenCaptureConsent = {
      granted: true,
      grantedAt: Date.now(),
      expiresAt: durationMs ? Date.now() + durationMs : undefined,
    };
  }

  /**
   * Check if node has screen capture consent
   * @param nodeId - Node ID
   * @returns true if consent is granted and not expired
   */
  hasScreenCaptureConsent(nodeId: string): boolean {
    const node = this.nodes.get(nodeId);
    if (!node || !node.screenCaptureConsent.granted) {
      return false;
    }

    // Check expiry
    if (node.screenCaptureConsent.expiresAt) {
      if (Date.now() > node.screenCaptureConsent.expiresAt) {
        node.screenCaptureConsent.granted = false;
        return false;
      }
    }

    return true;
  }

  /**
   * Revoke screen capture consent
   * @param nodeId - Node ID
   */
  revokeScreenCaptureConsent(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error("Node not found");
    }
    node.screenCaptureConsent.granted = false;
  }

  /**
   * Remove a node
   * @param nodeId - Node ID
   * @returns true if removed
   */
  removeNode(nodeId: string): boolean {
    const node = this.nodes.get(nodeId);
    if (!node) {
      return false;
    }

    // Update user count
    const currentCount = this.userNodeCount.get(node.userId) ?? 0;
    if (currentCount > 1) {
      this.userNodeCount.set(node.userId, currentCount - 1);
    } else {
      this.userNodeCount.delete(node.userId);
    }

    this.nodes.delete(nodeId);
    return true;
  }

  /**
   * Clean up expired sessions and pairings
   * @returns Number of items cleaned up
   */
  cleanupExpired(): number {
    const now = Date.now();
    let cleaned = 0;

    // Clean expired pairings
    for (const [code, pairing] of this.pendingPairings.entries()) {
      if (now > pairing.expiresAt) {
        this.pendingPairings.delete(code);
        cleaned++;
      }
    }

    // Clean expired sessions
    for (const [nodeId, node] of this.nodes.entries()) {
      const idleTime = now - node.lastSeen;
      if (idleTime > this.config.sessionTimeoutMs) {
        this.removeNode(nodeId);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Get pending pairing info (for testing/debugging)
   * @param code - Pairing code
   * @returns Pending pairing or undefined
   */
  getPendingPairing(code: string): PendingPairing | undefined {
    return this.pendingPairings.get(code);
  }

  /**
   * Get all nodes
   * @returns Array of all node connections
   */
  getAllNodes(): NodeConnection[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Get node count
   */
  get count(): number {
    return this.nodes.size;
  }

  /**
   * Clean up expired pairings
   */
  private cleanupExpiredPairings(): void {
    const now = Date.now();
    for (const [code, pairing] of this.pendingPairings.entries()) {
      if (now > pairing.expiresAt) {
        this.pendingPairings.delete(code);
      }
    }
  }

  /**
   * Generate random pairing code
   */
  private generateRandomCode(): string {
    const array = new Uint8Array(PAIRING_CODE_LENGTH);
    crypto.getRandomValues(array);

    let code = "";
    for (let i = 0; i < PAIRING_CODE_LENGTH; i++) {
      const index = array[i] % PAIRING_CHARS.length;
      code += PAIRING_CHARS[index];
    }

    return code;
  }

  /**
   * Close all sessions
   */
  async closeAll(): Promise<void> {
    this.nodes.clear();
    this.pendingPairings.clear();
    this.userNodeCount.clear();
  }
}
