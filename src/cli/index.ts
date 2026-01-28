/**
 * Moonbot CLI - Main entry point
 */

import { Command } from "commander";
import { loadConfig } from "../config/index.js";
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

  return program;
}

/** Run CLI */
export async function runCli(): Promise<void> {
  const program = createCli();
  await program.parseAsync(process.argv);
}
