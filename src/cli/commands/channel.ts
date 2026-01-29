/**
 * Channel management commands
 */

import Table from "cli-table3";
import type { CliOptions } from "../types.js";
import { GatewayRpcClient } from "../utils/rpc-client.js";
import {
  printError,
  printSuccess,
  formatOutput,
  printInfo,
  printWarning
} from "../utils/output.js";
import type { ChannelConfig } from "../../types/index.js";
import { maskToken } from "../../config/manager.js";

/**
 * List all channels
 */
export async function channelList(options: CliOptions): Promise<void> {
  try {
    const client = new GatewayRpcClient();
    await client.connect();

    const result = await client.call<{ channels: ChannelConfig[]; count: number }>("channel.list");
    client.close();

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (result.count === 0) {
      printInfo("No channels configured");
      console.log("\nAdd a channel with:");
      console.log("  moonbot channel add <id> --type <discord|slack|telegram> --token <token>");
      return;
    }

    // Display as table
    const tableInstance = new Table({
      head: ["ID", "Type", "Name", "Enabled", "Token"],
      colWidths: [25, 12, 20, 10, 30]
    });

    for (const channel of result.channels) {
      tableInstance.push([
        channel.id,
        channel.type,
        channel.name || "-",
        channel.enabled ? "✓" : "✗",
        channel.token ? maskToken(channel.token) : "[none]"
      ]);
    }

    console.log(tableInstance.toString());
    console.log(`\nTotal: ${result.count} channel(s)`);

  } catch (error) {
    if (error instanceof Error && error.message.includes("ECONNREFUSED")) {
      printError("Gateway is not running. Start it with: moonbot gateway start");
    } else {
      printError(`Failed to list channels: ${error}`);
    }
    process.exit(1);
  }
}

/**
 * Add a new channel
 */
export async function channelAdd(
  id: string,
  options: CliOptions & { type?: string; token?: string; name?: string; enable?: boolean }
): Promise<void> {
  if (!id) {
    printError("Channel ID is required");
    console.log("\nUsage: moonbot channel add <id> --type <type> --token <token>");
    process.exit(1);
  }

  if (!options.type) {
    printError("--type is required (discord, slack, telegram, cli)");
    process.exit(1);
  }

  if (!["discord", "slack", "telegram", "cli"].includes(options.type)) {
    printError(`Invalid type: ${options.type}`);
    console.log("Valid types: discord, slack, telegram, cli");
    process.exit(1);
  }

  const channel: ChannelConfig = {
    id,
    type: options.type as ChannelConfig["type"],
    name: options.name,
    token: options.token,
    enabled: options.enable !== false
  };

  try {
    const client = new GatewayRpcClient();
    await client.connect();

    const result = await client.call<{ success: boolean; channel: ChannelConfig }>("channel.add", [channel]);
    client.close();

    printSuccess(`Channel "${id}" added successfully`);
    console.log(`Type: ${channel.type}`);
    console.log(`Enabled: ${channel.enabled}`);

    if (result.channel.token) {
      console.log(`Token: ${maskToken(result.channel.token)}`);
    }

  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("ECONNREFUSED")) {
        printError("Gateway is not running. Start it with: moonbot gateway start");
      } else if (error.message.includes("already exists")) {
        printError(error.message);
      } else {
        printError(`Failed to add channel: ${error.message}`);
      }
    } else {
      printError(`Failed to add channel: ${error}`);
    }
    process.exit(1);
  }
}

/**
 * Remove a channel
 */
export async function channelRemove(id: string, options: CliOptions): Promise<void> {
  if (!id) {
    printError("Channel ID is required");
    console.log("\nUsage: moonbot channel remove <id>");
    process.exit(1);
  }

  try {
    const client = new GatewayRpcClient();
    await client.connect();

    const result = await client.call<{ success: boolean; channel: ChannelConfig }>("channel.remove", [{ channelId: id }]);
    client.close();

    printSuccess(`Channel "${id}" removed successfully`);

  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("ECONNREFUSED")) {
        printError("Gateway is not running. Start it with: moonbot gateway start");
      } else if (error.message.includes("not found")) {
        printError(error.message);
      } else {
        printError(`Failed to remove channel: ${error.message}`);
      }
    } else {
      printError(`Failed to remove channel: ${error}`);
    }
    process.exit(1);
  }
}

/**
 * Enable a channel
 */
export async function channelEnable(id: string, options: CliOptions): Promise<void> {
  if (!id) {
    printError("Channel ID is required");
    console.log("\nUsage: moonbot channel enable <id>");
    process.exit(1);
  }

  try {
    const client = new GatewayRpcClient();
    await client.connect();

    const result = await client.call<{ success: boolean; channel: ChannelConfig }>("channel.enable", [{ channelId: id }]);
    client.close();

    printSuccess(`Channel "${id}" enabled`);

  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("ECONNREFUSED")) {
        printError("Gateway is not running. Start it with: moonbot gateway start");
      } else if (error.message.includes("not found")) {
        printError(error.message);
      } else {
        printError(`Failed to enable channel: ${error.message}`);
      }
    } else {
      printError(`Failed to enable channel: ${error}`);
    }
    process.exit(1);
  }
}

/**
 * Disable a channel
 */
export async function channelDisable(id: string, options: CliOptions): Promise<void> {
  if (!id) {
    printError("Channel ID is required");
    console.log("\nUsage: moonbot channel disable <id>");
    process.exit(1);
  }

  try {
    const client = new GatewayRpcClient();
    await client.connect();

    const result = await client.call<{ success: boolean; channel: ChannelConfig }>("channel.disable", [{ channelId: id }]);
    client.close();

    printSuccess(`Channel "${id}" disabled`);

  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("ECONNREFUSED")) {
        printError("Gateway is not running. Start it with: moonbot gateway start");
      } else if (error.message.includes("not found")) {
        printError(error.message);
      } else {
        printError(`Failed to disable channel: ${error.message}`);
      }
    } else {
      printError(`Failed to disable channel: ${error}`);
    }
    process.exit(1);
  }
}
