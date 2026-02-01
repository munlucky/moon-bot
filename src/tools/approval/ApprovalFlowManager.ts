// Approval flow coordinator between ToolRuntime and user surfaces

import { randomUUID } from "crypto";
import { EventEmitter } from "events";
import type { ToolResult } from "../../types/index.js";
import type { ToolInvocation } from "../runtime/ToolRuntime.js";
import type {
  ApprovalRequest,
  ApprovalHandler,
} from "./types.js";
import { ApprovalStore } from "./ApprovalStore.js";
import { createLogger, type Logger } from "../../utils/logger.js";

export class ApprovalFlowManager extends EventEmitter {
  private store: ApprovalStore;
  private handlers: Map<string, ApprovalHandler>;
  private logger: Logger;
  private defaultTimeoutMs: number;

  constructor(store: ApprovalStore, config?: { timeoutMs?: number }) {
    super();
    this.store = store;
    this.handlers = new Map();
    this.logger = createLogger();
    this.defaultTimeoutMs = config?.timeoutMs ?? 300000; // 5 minutes default
  }

  /**
   * Register a surface handler for approval notifications.
   */
  registerHandler(surface: string, handler: ApprovalHandler): void {
    this.handlers.set(surface, handler);
    this.logger.info(`Approval handler registered: ${surface}`);
  }

  /**
   * Unregister a surface handler.
   */
  unregisterHandler(surface: string): void {
    this.handlers.delete(surface);
    this.logger.info(`Approval handler unregistered: ${surface}`);
  }

  /**
   * Request approval for a tool invocation.
   * Called by ToolRuntime when a tool requires approval.
   * Returns the approval request ID.
   */
  async requestApproval(invocation: ToolInvocation): Promise<string> {
    await this.store.load();

    const requestId = `approval-${randomUUID()}`;
    const now = Date.now();

    const request: ApprovalRequest = {
      id: requestId,
      invocationId: invocation.id,
      toolId: invocation.toolId,
      sessionId: invocation.sessionId,
      input: invocation.input,
      status: "pending",
      userId: "", // Will be set by caller
      createdAt: now,
      expiresAt: now + this.defaultTimeoutMs,
    };

    await this.store.add(request);

    this.logger.info(`Approval requested: ${requestId} for tool ${invocation.toolId}`);

    // Emit internal event for any listeners
    this.emit("approval.requested", {
      invocationId: invocation.id,
      toolId: invocation.toolId,
      input: invocation.input,
      sessionId: invocation.sessionId,
      userId: request.userId,
    });

    // Notify all registered handlers
    const notificationPromises = Array.from(this.handlers.values()).map((handler) =>
      handler.sendRequest(request).catch((error) => {
        this.logger.error(`Handler failed to send approval request`, { error, handler: handler.constructor.name });
      })
    );

    await Promise.allSettled(notificationPromises);

    return requestId;
  }

  /**
   * Handle approval response from a surface.
   * Called by RPC handler when user responds to approval request.
   */
  async handleResponse(requestId: string, approved: boolean, userId: string): Promise<ToolResult> {
    await this.store.load();

    const request = this.store.get(requestId);
    if (!request) {
      return {
        ok: false,
        error: { code: "APPROVAL_NOT_FOUND", message: `Approval request not found: ${requestId}` },
        meta: { durationMs: 0 },
      };
    }

    if (request.status !== "pending") {
      return {
        ok: false,
        error: {
          code: "APPROVAL_ALREADY_RESOLVED",
          message: `Approval request already ${request.status}`,
        },
        meta: { durationMs: 0 },
      };
    }

    // Check if expired
    if (Date.now() > request.expiresAt) {
      await this.store.updateStatus(requestId, "expired", userId);
      return {
        ok: false,
        error: { code: "APPROVAL_EXPIRED", message: "Approval request has expired" },
        meta: { durationMs: 0 },
      };
    }

    // Update status
    const newStatus = approved ? "approved" : "rejected";
    await this.store.updateStatus(requestId, newStatus, userId);

    this.logger.info(`Approval ${newStatus}: ${requestId} by user ${userId}`);

    // Notify handlers of update
    const notificationPromises = Array.from(this.handlers.values()).map((handler) =>
      handler.sendUpdate(request).catch((error) => {
        this.logger.error(`Handler failed to send approval update`, { error, handler: handler.constructor.name });
      })
    );

    await Promise.allSettled(notificationPromises);

    // Emit internal event
    this.emit("approval.resolved", {
      requestId,
      approved,
    });

    // Return result based on approval
    if (approved) {
      return {
        ok: true,
        data: { approved: true, message: "Tool execution approved" },
        meta: { durationMs: 0 },
      };
    } else {
      return {
        ok: false,
        error: { code: "APPROVAL_DENIED", message: "Tool execution was denied" },
        meta: { durationMs: 0 },
      };
    }
  }

  /**
   * Periodic cleanup of expired approval requests.
   */
  async expirePending(): Promise<void> {
    await this.store.load();

    const expiredIds = this.store.expirePending();

    if (expiredIds.length > 0) {
      this.logger.info(`Expired ${expiredIds.length} approval requests`);

      // Notify handlers for each expired request
      for (const id of expiredIds) {
        const request = this.store.get(id);
        if (request) {
          const notificationPromises = Array.from(this.handlers.values()).map((handler) =>
            handler.sendUpdate(request).catch((error) => {
              this.logger.error(`Handler failed to send approval update`, { error });
            })
          );
          await Promise.allSettled(notificationPromises);
        }
      }

      await this.store.save();
    }
  }

  /**
   * List all pending approval requests.
   */
  listPending(): ApprovalRequest[] {
    return this.store.listPending();
  }

  /**
   * Get an approval request by ID.
   */
  get(requestId: string): ApprovalRequest | undefined {
    return this.store.get(requestId);
  }

  /**
   * Get the store instance (for direct access if needed).
   */
  getStore(): ApprovalStore {
    return this.store;
  }
}
