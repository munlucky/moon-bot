// CLI approval handler - interactive prompts and commands

import readline from "readline";
import type { ApprovalRequest, ApprovalHandler } from "../types.js";

/**
 * CLI approval handler implementation.
 */
export class CLIApprovalHandler implements ApprovalHandler {
  private pendingPrompts = new Map<string, readline.Interface>();

  /**
   * Send an approval request as a CLI prompt.
   * Note: This is a non-blocking implementation.
   * Actual user interaction happens via CLI commands.
   */
  async sendRequest(request: ApprovalRequest): Promise<void> {
    // Log the approval request to console
    console.log(`\n🛡️  Approval Required`);
    console.log(`═══════════════════════════════════════════════════`);
    console.log(`Tool: ${request.toolId}`);
    console.log(`Request ID: ${request.id}`);
    console.log(`Input: ${JSON.stringify(request.input, null, 2)}`);
    console.log(`Expires in: ${Math.floor((request.expiresAt - Date.now()) / 60000)} minutes`);
    console.log(`═══════════════════════════════════════════════════`);
    console.log(`Use 'moltbot approvals approve ${request.id}' to approve`);
    console.log(`Use 'moltbot approvals deny ${request.id}' to deny\n`);
  }

  /**
   * Send an update when approval is resolved.
   */
  async sendUpdate(request: ApprovalRequest): Promise<void> {
    const emoji = request.status === "approved" ? "✅" : request.status === "rejected" ? "❌" : "⏰";
    const statusText =
      request.status === "approved"
        ? "Approved"
        : request.status === "rejected"
          ? "Rejected"
          : "Expired";

    console.log(`\n${emoji} Approval ${statusText}`);
    console.log(`Tool: ${request.toolId}`);
    console.log(`Request ID: ${request.id}`);
    if (request.respondedBy) {
      console.log(`Responded by: ${request.respondedBy}`);
    }
    console.log();
  }

  /**
   * Prompt user for approval (interactive mode).
   * Returns true if approved, false if denied.
   */
  async promptUser(request: ApprovalRequest): Promise<boolean> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    this.pendingPrompts.set(request.id, rl);

    try {
      const answer = await this.question(
        rl,
        `Approve ${request.toolId}? (y/n): `
      );

      return answer.toLowerCase().startsWith("y");
    } finally {
      this.pendingPrompts.delete(request.id);
      rl.close();
    }
  }

  /**
   * Helper function to prompt with timeout.
   */
  private question(rl: readline.Interface, query: string): Promise<string> {
    return new Promise((resolve) => {
      rl.question(query, (answer) => {
        resolve(answer);
      });
    });
  }
}

/**
 * CLI commands for approval management.
 * These would be registered with a CLI command framework.
 */
export class ApprovalCommands {
  private flowManager: unknown; // ApprovalFlowManager - avoiding circular dependency

  constructor(flowManager: unknown) {
    this.flowManager = flowManager;
  }

  /**
   * List all pending approval requests.
   */
  list(): void {
    const pending = (this.flowManager as { listPending: () => unknown[] }).listPending();

    if (pending.length === 0) {
      console.log("No pending approval requests.");
      return;
    }

    console.log(`\n🛡️  Pending Approvals (${pending.length})`);
    console.log(`═══════════════════════════════════════════════════`);

    for (const request of pending as ApprovalRequest[]) {
      const minutesLeft = Math.floor((request.expiresAt - Date.now()) / 60000);
      console.log(`ID: ${request.id}`);
      console.log(`Tool: ${request.toolId}`);
      console.log(`Expires in: ${minutesLeft} minutes`);
      console.log(`Input: ${JSON.stringify(request.input)}`);
      console.log(`───────────────────────────────────────────────`);
    }

    console.log();
  }

  /**
   * Approve a request by ID.
   */
  async approve(requestId: string, userId: string = "cli-user"): Promise<void> {
    const handleResponse = (this.flowManager as {
      handleResponse: (id: string, approved: boolean, user: string) => unknown;
    }).handleResponse;

    const result = await handleResponse(requestId, true, userId);

    if ((result as { ok: boolean }).ok) {
      console.log(`✅ Approved request: ${requestId}`);
    } else {
      const error = (result as { error?: { message: string } }).error;
      console.error(`❌ Failed to approve: ${error?.message ?? "Unknown error"}`);
    }
  }

  /**
   * Deny a request by ID.
   */
  async deny(requestId: string, userId: string = "cli-user"): Promise<void> {
    const handleResponse = (this.flowManager as {
      handleResponse: (id: string, approved: boolean, user: string) => unknown;
    }).handleResponse;

    const result = await handleResponse(requestId, false, userId);

    if ((result as { ok: boolean }).ok) {
      console.log(`❌ Denied request: ${requestId}`);
    } else {
      const error = (result as { error?: { message: string } }).error;
      console.error(`❌ Failed to deny: ${error?.message ?? "Unknown error"}`);
    }
  }
}
