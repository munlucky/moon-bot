// WebSocket approval handler - broadcasts approval events to connected clients

import type { ApprovalRequest, ApprovalHandler } from "../types.js";

/**
 * Gateway server interface for WebSocket handler.
 * This avoids circular dependency issues.
 */
export interface GatewayServer {
  broadcast(method: string, params?: unknown): void;
}

/**
 * Events emitted by the approval system.
 */
export interface ApprovalRequestedEvent {
  type: "approval.requested";
  data: ApprovalRequest;
}

export interface ApprovalUpdatedEvent {
  type: "approval.updated";
  data: {
    requestId: string;
    status: "approved" | "rejected" | "expired";
    result?: unknown;
  };
}

/**
 * WebSocket approval handler implementation.
 */
export class WsApprovalHandler implements ApprovalHandler {
  private gateway: GatewayServer | null = null;

  constructor(gateway?: GatewayServer) {
    this.gateway = gateway ?? null;
  }

  /**
   * Set the gateway server (for dependency injection).
   */
  setGateway(gateway: GatewayServer): void {
    this.gateway = gateway;
  }

  /**
   * Broadcast approval request to all WebSocket clients.
   */
  async sendRequest(request: ApprovalRequest): Promise<void> {
    if (!this.gateway) {
      return; // Silently skip if gateway not configured
    }

    const event: ApprovalRequestedEvent = {
      type: "approval.requested",
      data: request,
    };

    this.gateway.broadcast("approval.requested", event);
  }

  /**
   * Broadcast approval update to all WebSocket clients.
   */
  async sendUpdate(request: ApprovalRequest): Promise<void> {
    if (!this.gateway) {
      return;
    }

    const event: ApprovalUpdatedEvent = {
      type: "approval.updated",
      data: {
        requestId: request.id,
        status: request.status as "approved" | "rejected" | "expired",
      },
    };

    this.gateway.broadcast("approval.updated", event);
  }
}
