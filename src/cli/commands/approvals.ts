/**
 * Approvals commands
 */

import { printError, printSuccess, formatOutput, printInfo } from "../utils/output.js";
import { GatewayRpcClient } from "../utils/rpc-client.js";
import type { ApprovalItem, CliOptions } from "../types.js";

/** Approvals list command */
export async function approvalsList(options: CliOptions): Promise<void> {
  try {
    const client = new GatewayRpcClient();

    const approvals = await client.call<ApprovalItem[]>("approvals.list");

    if (approvals.length === 0) {
      printInfo("No pending approvals");
      client.close();
      return;
    }

    const output = formatOutput(approvals, options.json ? "json" : "table");
    console.log(output);

    client.close();

  } catch (error) {
    printError(`Failed to get approvals: ${error}`);
    process.exit(1);
  }
}

/** Approvals approve command */
export async function approvalsApprove(id: string, options: CliOptions): Promise<void> {
  try {
    const client = new GatewayRpcClient();

    printInfo(`Approving request: ${id}`);

    const result = await client.call<{ success: boolean; message?: string }>("approvals.approve", [id]);

    if (result.success) {
      printSuccess(`Approval granted: ${id}`);
    } else {
      printError(result.message || "Failed to approve request");
      process.exit(1);
    }

    client.close();

  } catch (error) {
    printError(`Failed to approve: ${error}`);
    process.exit(1);
  }
}

/** Approvals deny command */
export async function approvalsDeny(id: string, options: CliOptions): Promise<void> {
  try {
    const client = new GatewayRpcClient();

    printInfo(`Denying request: ${id}`);

    const result = await client.call<{ success: boolean; message?: string }>("approvals.deny", [id]);

    if (result.success) {
      printSuccess(`Approval denied: ${id}`);
    } else {
      printError(result.message || "Failed to deny request");
      process.exit(1);
    }

    client.close();

  } catch (error) {
    printError(`Failed to deny: ${error}`);
    process.exit(1);
  }
}
