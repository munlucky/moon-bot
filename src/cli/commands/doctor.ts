/**
 * Doctor command - System diagnostics
 */

import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import chalk from "chalk";
import { loadConfig } from "../../config/index.js";
import { GatewayRpcClient } from "../utils/rpc-client.js";
import { printSuccess, printError, /* printWarning, formatOutput, */ printHeader, printInfo } from "../utils/output.js";
import type { DoctorCheck, CliOptions } from "../types.js";

/** Home directory */
const HOME_DIR = process.env.HOME || process.env.USERPROFILE || "";
const MOONBOT_DIR = path.join(HOME_DIR, ".moonbot");

/** Run diagnostic checks */
async function runChecks(): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];

  // 1. Check Moonbot directory
  checks.push(await checkMoonbotDirectory());

  // 2. Check config file
  checks.push(await checkConfigFile());

  // 3. Check log directory
  checks.push(await checkLogDirectory());

  // 4. Check dependencies
  checks.push(await checkDependencies());

  // 5. Check gateway connection
  checks.push(await checkGatewayConnection());

  // 6. Check port availability
  checks.push(await checkPortAvailability());

  // 7. Check Node.js version
  checks.push(checkNodeVersion());

  return checks;
}

/** Check Moonbot directory */
async function checkMoonbotDirectory(): Promise<DoctorCheck> {
  try {
    await fs.access(MOONBOT_DIR);
    return {
      name: "Moonbot Directory",
      status: "pass",
      message: `Directory exists: ${MOONBOT_DIR}`,
    };
  } catch {
    return {
      name: "Moonbot Directory",
      status: "fail",
      message: `Directory not found: ${MOONBOT_DIR}`,
      fix: async () => {
        await fs.mkdir(MOONBOT_DIR, { recursive: true });
        await fs.mkdir(path.join(MOONBOT_DIR, "logs"), { recursive: true });
        await fs.mkdir(path.join(MOONBOT_DIR, "sessions"), { recursive: true });
        await fs.mkdir(path.join(MOONBOT_DIR, "config"), { recursive: true });
        printSuccess(`Created directory: ${MOONBOT_DIR}`);
      },
    };
  }
}

/** Check config file */
async function checkConfigFile(): Promise<DoctorCheck> {
  const configPaths = [
    path.join(MOONBOT_DIR, "config.yaml"),
    path.join(process.cwd(), "moonbot.config.yaml"),
    path.join(process.cwd(), ".moonbot", "config.yaml"),
  ];

  for (const configPath of configPaths) {
    if (existsSync(configPath)) {
      try {
        loadConfig(configPath);
        return {
          name: "Config File",
          status: "pass",
          message: `Valid config: ${configPath}`,
        };
      } catch (error) {
        return {
          name: "Config File",
          status: "fail",
          message: `Invalid config: ${configPath} - ${(error as Error).message}`,
        };
      }
    }
  }

  return {
    name: "Config File",
    status: "fail",
    message: "No config file found",
    fix: async () => {
      const configPath = path.join(MOONBOT_DIR, "config.yaml");
      const defaultConfig = `
gateways:
  - port: 18789
    host: "127.0.0.1"

agents:
  - id: "default"
    name: "Default Agent"

channels: []
`;
      await fs.writeFile(configPath, defaultConfig.trim());
      printSuccess(`Created default config: ${configPath}`);
    },
  };
}

/** Check log directory */
async function checkLogDirectory(): Promise<DoctorCheck> {
  const logDir = path.join(MOONBOT_DIR, "logs");
  try {
    await fs.access(logDir);
    return {
      name: "Log Directory",
      status: "pass",
      message: `Directory exists: ${logDir}`,
    };
  } catch {
    return {
      name: "Log Directory",
      status: "warn",
      message: `Directory not found: ${logDir}`,
      fix: async () => {
        await fs.mkdir(logDir, { recursive: true });
        printSuccess(`Created directory: ${logDir}`);
      },
    };
  }
}

/** Check dependencies */
async function checkDependencies(): Promise<DoctorCheck> {
  const requiredDeps = [
    "ws",
    "chokidar",
    "discord.js",
    "playwright",
    "@sinclair/typebox",
  ];

  const missing: string[] = [];

  for (const dep of requiredDeps) {
    try {
      await import(dep);
    } catch {
      missing.push(dep);
    }
  }

  if (missing.length === 0) {
    return {
      name: "Dependencies",
      status: "pass",
      message: "All dependencies installed",
    };
  }

  return {
    name: "Dependencies",
    status: "fail",
    message: `Missing dependencies: ${missing.join(", ")}`,
    fix: async () => {
      printError("Run: pnpm install");
    },
  };
}

/** Check gateway connection */
async function checkGatewayConnection(): Promise<DoctorCheck> {
  try {
    const client = new GatewayRpcClient();
    await client.connect();
    await client.call("gateway.info");
    client.close();

    return {
      name: "Gateway Connection",
      status: "pass",
      message: "Gateway is running and accessible",
    };
  } catch {
    return {
      name: "Gateway Connection",
      status: "warn",
      message: "Gateway is not running. Run 'moonbot gateway start'",
    };
  }
}

/** Check port availability */
async function checkPortAvailability(): Promise<DoctorCheck> {
  const defaultPort = 18789;

  try {
    const client = new GatewayRpcClient();
    await client.connect();
    client.close();

    return {
      name: "Port Availability",
      status: "pass",
      message: `Port ${defaultPort} is in use by Gateway`,
    };
  } catch {
    // Check if port is in use by something else
    return {
      name: "Port Availability",
      status: "pass",
      message: `Port ${defaultPort} is available`,
    };
  }
}

/** Check Node.js version */
function checkNodeVersion(): DoctorCheck {
  const version = process.version;
  const majorVersion = parseInt(version.slice(1).split(".")[0], 10);
  const requiredMajor = 22;

  if (majorVersion >= requiredMajor) {
    return {
      name: "Node.js Version",
      status: "pass",
      message: `Node.js ${version} (>= ${requiredMajor} required)`,
    };
  }

  return {
    name: "Node.js Version",
    status: "fail",
    message: `Node.js ${version} (< ${requiredMajor} required). Please upgrade.`,
  };
}

/** Doctor command */
export async function doctorCommand(options: CliOptions & { fix?: boolean }): Promise<void> {
  printHeader("Moonbot System Diagnostics");

  const checks = await runChecks();

  // Display results
  for (const check of checks) {
    const icon = check.status === "pass" ? "✓" : check.status === "fail" ? "✗" : "⚠";
    const colorFn = check.status === "pass" ? chalk.green : check.status === "fail" ? chalk.red : chalk.yellow;

    console.log(`${icon} ${colorFn(check.name)}: ${check.message}`);
  }

  // Apply fixes if requested
  if (options.fix) {
    const fixableChecks = checks.filter(c => c.fix);

    if (fixableChecks.length === 0) {
      printSuccess("No fixes needed");
      return;
    }

    console.log();
    printInfo("Applying fixes...");

    for (const check of fixableChecks) {
      if (check.fix) {
        try {
          await check.fix();
        } catch (error) {
          printError(`Failed to fix ${check.name}: ${error}`);
        }
      }
    }
  }

  // Summary
  const passCount = checks.filter(c => c.status === "pass").length;
  const failCount = checks.filter(c => c.status === "fail").length;
  const warnCount = checks.filter(c => c.status === "warn").length;

  console.log();
  console.log(`Summary: ${passCount} passed, ${failCount} failed, ${warnCount} warnings`);

  // Exit with error code if any checks failed
  if (failCount > 0) {
    process.exit(1);
  }
}
