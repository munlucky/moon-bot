/**
 * Moonbot CLI - Main entry point
 */

import { Command } from "commander";
// import { loadConfig } from "../config/index.js"; // Reserved for future use
import type { CliOptions } from "./types.js";

// Gateway commands
import {
  gatewayStatus,
  gatewayStart,
  gatewayStop,
  gatewayRestart,
} from "./commands/gateway.js";

// Logs command
import { logsCommand } from "./commands/logs.js";

// Doctor command
import { doctorCommand } from "./commands/doctor.js";

// RPC call command
import { callCommand } from "./commands/call.js";

// Pairing commands
import {
  pairingStatus,
  pairingApprove,
  pairingRevoke,
} from "./commands/pairing.js";

// Approvals commands
import {
  approvalsList,
  approvalsApprove,
  approvalsDeny,
} from "./commands/approvals.js";

// Channel commands
import {
  channelList,
  channelAdd,
  channelRemove,
  channelEnable,
  channelDisable,
} from "./commands/channel.js";

// Config commands
import {
  configImport,
  configExport,
  configPath,
} from "./commands/config.js";

/** Helper to get CLI options from a command */
function getCliOptions(command: Command): CliOptions {
  const opts = command.opts();
  return {
    json: opts.json ?? false,
    verbose: opts.verbose ?? false,
  };
}

/** Create CLI program */
export function createCli(): Command {
  const program = new Command();

  program
    .name("moonbot")
    .description("Local-first AI Agent System")
    .version("0.1.0");

  // Global options
  program.option("--json", "Output in JSON format");
  program.option("--verbose", "Verbose output");

  // Gateway commands
  const gatewayCmd = program.command("gateway")
    .description("Gateway management");

  gatewayCmd.command("status")
    .description("Show gateway status")
    .action(async () => {
      const options = getCliOptions(gatewayCmd);
      await gatewayStatus(options);
    });

  gatewayCmd.command("start")
    .description("Start the gateway")
    .action(async () => {
      const options = getCliOptions(gatewayCmd);
      await gatewayStart(options);
    });

  gatewayCmd.command("stop")
    .description("Stop the gateway")
    .action(async () => {
      const options = getCliOptions(gatewayCmd);
      await gatewayStop(options);
    });

  gatewayCmd.command("restart")
    .description("Restart the gateway")
    .action(async () => {
      const options = getCliOptions(gatewayCmd);
      await gatewayRestart(options);
    });

  // Gateway call command (direct RPC invocation)
  program.command("call")
    .description("Call RPC method directly")
    .argument("<rpc>", "RPC method to call (e.g., tools.list, session.list)")
    .argument("[args...]", "Arguments for the RPC method")
    .option("--timeout <ms>", "Request timeout in milliseconds", "5000")
    .action(async (rpc, args, options) => {
      const cliOptions = getCliOptions(program);
      await callCommand(rpc, args, { ...cliOptions, ...options });
    });

  // Logs command
  program.command("logs")
    .description("View gateway logs")
    .option("-f, --follow", "Follow log output (like tail -f)")
    .option("-l, --lines <n>", "Number of lines to show", "50")
    .option("-e, --error", "Show only error logs")
    .action(async (options) => {
      const cliOptions = getCliOptions(program);
      await logsCommand({
        ...options,
        json: cliOptions.json,
        lines: options.lines ? parseInt(options.lines, 10) : undefined,
      });
    });

  // Doctor command
  program.command("doctor")
    .description("Run system diagnostics")
    .option("--fix", "Automatically fix detected issues")
    .action(async (options) => {
      const cliOptions = getCliOptions(program);
      await doctorCommand({ ...cliOptions, ...options });
    });

  // Pairing commands
  const pairingCmd = program.command("pairing")
    .description("Pairing management");

  pairingCmd.command("status")
    .description("Show pairing status")
    .action(async () => {
      const options = getCliOptions(pairingCmd);
      await pairingStatus(options);
    });

  pairingCmd.command("approve")
    .description("Approve a pairing request")
    .argument("<token>", "Pairing token to approve")
    .action(async (token) => {
      const options = getCliOptions(pairingCmd);
      await pairingApprove(token, options);
    });

  pairingCmd.command("revoke")
    .description("Revoke a pairing")
    .argument("<id>", "Pairing ID to revoke")
    .action(async (id) => {
      const options = getCliOptions(pairingCmd);
      await pairingRevoke(id, options);
    });

  // Approvals commands
  const approvalsCmd = program.command("approvals")
    .description("Approval request management");

  approvalsCmd.command("list")
    .description("List pending approvals")
    .action(async () => {
      const options = getCliOptions(approvalsCmd);
      await approvalsList(options);
    });

  approvalsCmd.command("approve")
    .description("Approve a request")
    .argument("<id>", "Request ID to approve")
    .action(async (id) => {
      const options = getCliOptions(approvalsCmd);
      await approvalsApprove(id, options);
    });

  approvalsCmd.command("deny")
    .description("Deny a request")
    .argument("<id>", "Request ID to deny")
    .action(async (id) => {
      const options = getCliOptions(approvalsCmd);
      await approvalsDeny(id, options);
    });

  // Channel commands
  const channelCmd = program.command("channel")
    .description("Channel management");

  channelCmd.command("list")
    .description("List all channels")
    .action(async () => {
      const options = getCliOptions(channelCmd);
      await channelList(options);
    });

  channelCmd.command("add")
    .description("Add a new channel")
    .argument("<id>", "Channel ID")
    .option("--type <type>", "Channel type (discord, slack, telegram, cli)")
    .option("--token <token>", "Channel authentication token")
    .option("--name <name>", "Channel display name")
    .option("--no-enable", "Add channel in disabled state")
    .action(async (id, options) => {
      const cliOptions = getCliOptions(channelCmd);
      await channelAdd(id, { ...cliOptions, ...options });
    });

  channelCmd.command("remove")
    .description("Remove a channel")
    .argument("<id>", "Channel ID to remove")
    .action(async (id) => {
      const options = getCliOptions(channelCmd);
      await channelRemove(id, options);
    });

  channelCmd.command("enable")
    .description("Enable a channel")
    .argument("<id>", "Channel ID to enable")
    .action(async (id) => {
      const options = getCliOptions(channelCmd);
      await channelEnable(id, options);
    });

  channelCmd.command("disable")
    .description("Disable a channel")
    .argument("<id>", "Channel ID to disable")
    .action(async (id) => {
      const options = getCliOptions(channelCmd);
      await channelDisable(id, options);
    });

  // Config commands
  const configCmd = program.command("config")
    .description("Configuration management");

  configCmd.command("import")
    .description("Import config from JSON file")
    .argument("<file>", "JSON config file to import")
    .option("-f, --force", "Overwrite existing config")
    .action(async (file, options) => {
      const cliOptions = getCliOptions(configCmd);
      await configImport(file, { ...cliOptions, ...options });
    });

  configCmd.command("export")
    .description("Export current config to JSON file")
    .argument("<file>", "Output JSON file path")
    .action(async (file, _options) => {
      const cliOptions = getCliOptions(configCmd);
      await configExport(file, cliOptions);
    });

  configCmd.command("path")
    .description("Show config file path")
    .action(async () => {
      const options = getCliOptions(configCmd);
      await configPath(options);
    });

  return program;
}

/** Run CLI */
export async function runCli(): Promise<void> {
  const program = createCli();
  await program.parseAsync(process.argv);
}
