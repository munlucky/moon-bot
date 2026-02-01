/**
 * Pairing commands
 */

import { printError, printSuccess, formatOutput, printInfo } from "../utils/output.js";
import { GatewayRpcClient } from "../utils/rpc-client.js";
import type { PairingStatus, CliOptions } from "../types.js";

/** Pairing status command */
export async function pairingStatus(options: CliOptions): Promise<void> {
  try {
    const client = new GatewayRpcClient();

    const status = await client.call<PairingStatus>("pairing.status");

    const output = formatOutput(status, options.json ? "json" : "table");
    console.log(output);

    client.close();

  } catch (error) {
    printError(`Failed to get pairing status: ${error}`);
    process.exit(1);
  }
}

/** Pairing approve command */
export async function pairingApprove(token: string, _options: CliOptions): Promise<void> {
  try {
    const client = new GatewayRpcClient();

    printInfo(`Approving pairing token: ${token}`);

    const result = await client.call<{ success: boolean; userId?: string }>("pairing.approve", [token]);

    if (result.success) {
      printSuccess(`Pairing approved for user: ${result.userId || "unknown"}`);
    } else {
      printError("Pairing approval failed. Token may be invalid or expired.");
      process.exit(1);
    }

    client.close();

  } catch (error) {
    printError(`Failed to approve pairing: ${error}`);
    process.exit(1);
  }
}

/** Pairing revoke command */
export async function pairingRevoke(id: string, _options: CliOptions): Promise<void> {
  try {
    const client = new GatewayRpcClient();

    printInfo(`Revoking pairing: ${id}`);

    const result = await client.call<{ success: boolean }>("pairing.revoke", [id]);

    if (result.success) {
      printSuccess(`Pairing revoked: ${id}`);
    } else {
      printError("Failed to revoke pairing. ID may not exist.");
      process.exit(1);
    }

    client.close();

  } catch (error) {
    printError(`Failed to revoke pairing: ${error}`);
    process.exit(1);
  }
}
