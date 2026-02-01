/**
 * Gateway management commands
 */

import path from "path";
import fs from "fs/promises";
// import { fileURLToPath } from "url"; // Reserved for future use
import { GatewayRpcClient } from "../utils/rpc-client.js";
import { printError, printSuccess, formatOutput, printInfo, printWarning } from "../utils/output.js";
import type { GatewayStatus, CliOptions } from "../types.js";

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename); // Reserved for future use

/** PID file path */
const PID_FILE = path.join(process.env.HOME || process.env.USERPROFILE || "", ".moonbot", "gateway.pid");

/** Get gateway PID from file */
async function getGatewayPid(): Promise<number | null> {
  try {
    const content = await fs.readFile(PID_FILE, "utf-8");
    return parseInt(content.trim(), 10);
  } catch {
    return null;
  }
}

/** Save gateway PID to file */
async function saveGatewayPid(pid: number): Promise<void> {
  const dir = path.dirname(PID_FILE);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(PID_FILE, String(pid));
}

/** Remove gateway PID file */
async function removeGatewayPid(): Promise<void> {
  try {
    await fs.unlink(PID_FILE);
  } catch {
    // Ignore if file doesn't exist
  }
}

/** Check if process is running */
async function isProcessRunning(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Gateway status command */
export async function gatewayStatus(options: CliOptions): Promise<void> {
  const status: GatewayStatus = { running: false };

  const pid = await getGatewayPid();
  if (pid && await isProcessRunning(pid)) {
    status.running = true;
    status.pid = pid;

    // Try to get more info via RPC
    try {
      const client = new GatewayRpcClient();
      await client.connect();
      const info = await client.call<{ port: number; host: string; uptime: number }>("gateway.info");
      status.port = info.port;
      status.host = info.host;
      status.uptime = info.uptime;
      client.close();
    } catch {
      // RPC not available, basic status only
    }
  }

  const output = formatOutput(status, options.json ? "json" : "table");
  console.log(output);

  if (!status.running) {
    process.exit(1);
  }
}

/** Gateway start command */
export async function gatewayStart(_options: CliOptions): Promise<void> {
  const pid = await getGatewayPid();

  if (pid && await isProcessRunning(pid)) {
    printWarning("Gateway is already running");
    console.log(`PID: ${pid}`);
    process.exit(0);
  }

  printInfo("Starting Gateway...");

  // Import and start gateway
  const { startGateway } = await import("../../gateway/index.js");
  const { loadConfig } = await import("../../config/index.js");

  try {
    const config = loadConfig();
    const gateway = await startGateway();
    const gatewayConfig = config.gateways[0];

    if (!gatewayConfig) {
      printError("No gateway configuration found");
      process.exit(1);
    }

    // Save PID
    await saveGatewayPid(process.pid);

    printSuccess(`Gateway started on ${gatewayConfig.host}:${gatewayConfig.port}`);
    printInfo(`PID: ${process.pid}`);

    // Keep process alive
    process.on("SIGINT", () => {
      printInfo("Shutting down gateway...");
      gateway.stop();
      removeGatewayPid();
      process.exit(0);
    });

    process.on("SIGTERM", () => {
      printInfo("Shutting down gateway...");
      gateway.stop();
      removeGatewayPid();
      process.exit(0);
    });

  } catch (error) {
    printError(`Failed to start gateway: ${error}`);
    process.exit(1);
  }
}

/** Gateway stop command */
export async function gatewayStop(_options: CliOptions): Promise<void> {
  const pid = await getGatewayPid();

  if (!pid) {
    printWarning("Gateway is not running");
    process.exit(0);
  }

  if (!await isProcessRunning(pid)) {
    printWarning("Gateway PID file exists but process is not running");
    await removeGatewayPid();
    process.exit(0);
  }

  printInfo("Stopping Gateway...");

  try {
    process.kill(pid, "SIGTERM");

    // Wait for process to exit
    let attempts = 0;
    while (attempts < 10) {
      await new Promise(resolve => setTimeout(resolve, 500));
      if (!await isProcessRunning(pid)) {
        break;
      }
      attempts++;
    }

    if (await isProcessRunning(pid)) {
      printWarning("Gateway did not stop gracefully, forcing...");
      process.kill(pid, "SIGKILL");
    }

    await removeGatewayPid();
    printSuccess("Gateway stopped");

  } catch (error) {
    printError(`Failed to stop gateway: ${error}`);
    process.exit(1);
  }
}

/** Gateway restart command */
export async function gatewayRestart(options: CliOptions): Promise<void> {
  const pid = await getGatewayPid();

  if (pid && await isProcessRunning(pid)) {
    await gatewayStop(options);
  }

  // Wait a bit before starting
  await new Promise(resolve => setTimeout(resolve, 1000));

  await gatewayStart(options);
}
