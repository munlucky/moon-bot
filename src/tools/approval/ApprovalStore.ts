// Persistent storage for pending approval requests

import path from "path";
import os from "os";
import fs from "fs/promises";
import type { ApprovalRequest, ApprovalStoreData } from "./types.js";

export class ApprovalStore {
  private storePath: string;
  private requests: Map<string, ApprovalRequest>;
  private loaded = false;

  constructor(storePath?: string) {
    this.storePath = storePath ?? path.join(os.homedir(), ".moonbot", "pending-approvals.json");
    this.requests = new Map();
  }

  /**
   * Load pending approvals from disk.
   */
  async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.storePath, "utf-8");
      const data = JSON.parse(content) as ApprovalStoreData;

      this.requests.clear();
      for (const request of data.requests) {
        this.requests.set(request.id, request);
      }

      this.loaded = true;
    } catch {
      // File doesn't exist yet, start with empty store
      this.requests.clear();
      this.loaded = true;
    }
  }

  /**
   * Save pending approvals to disk.
   */
  async save(): Promise<void> {
    const dir = path.dirname(this.storePath);

    try {
      await fs.mkdir(dir, { recursive: true });
    } catch {
      // Directory may already exist
    }

    const data: ApprovalStoreData = {
      requests: Array.from(this.requests.values()),
    };

    await fs.writeFile(this.storePath, JSON.stringify(data, null, 2));
  }

  /**
   * Add a new approval request to the store.
   */
  async add(request: ApprovalRequest): Promise<void> {
    if (!this.loaded) {
      await this.load();
    }

    this.requests.set(request.id, request);
    await this.save();
  }

  /**
   * Get an approval request by ID.
   */
  get(requestId: string): ApprovalRequest | undefined {
    return this.requests.get(requestId);
  }

  /**
   * List all pending approval requests.
   */
  listPending(): ApprovalRequest[] {
    const now = Date.now();
    const pending: ApprovalRequest[] = [];

    for (const request of this.requests.values()) {
      if (request.status === "pending" && request.expiresAt > now) {
        pending.push(request);
      }
    }

    return pending;
  }

  /**
   * Remove an approval request from the store.
   */
  async remove(requestId: string): Promise<void> {
    this.requests.delete(requestId);
    await this.save();
  }

  /**
   * Update the status of an approval request.
   */
  async updateStatus(
    requestId: string,
    status: ApprovalRequest["status"],
    respondedBy: string
  ): Promise<void> {
    const request = this.requests.get(requestId);
    if (!request) {
      throw new Error(`Approval request not found: ${requestId}`);
    }

    request.status = status;
    request.respondedBy = respondedBy;
    request.respondedAt = Date.now();

    await this.save();
  }

  /**
   * Expire pending approval requests that have passed their timeout.
   * Returns the IDs of expired requests.
   */
  expirePending(): string[] {
    const now = Date.now();
    const expiredIds: string[] = [];

    for (const [id, request] of this.requests.entries()) {
      if (request.status === "pending" && request.expiresAt <= now) {
        request.status = "expired";
        expiredIds.push(id);
      }
    }

    return expiredIds;
  }

  /**
   * Get all requests (for debugging/testing).
   */
  getAll(): ApprovalRequest[] {
    return Array.from(this.requests.values());
  }
}
