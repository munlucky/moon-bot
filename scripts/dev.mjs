#!/usr/bin/env node
/**
 * Cross-platform development script for Moon-Bot
 * Replaces scripts/dev.ps1 for non-Windows environments
 *
 * Usage:
 *   node scripts/dev.mjs start [--build]
 *   node scripts/dev.mjs stop
 *   node scripts/dev.mjs restart [--build]
 */

import { spawn, execSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PID_DIR = join(ROOT, ".moonbot-dev");
const GATEWAY_PID = join(PID_DIR, "gateway.pid");
const DISCORD_PID = join(PID_DIR, "discord.pid");

const GATEWAY_PORT = 18789;

function ensurePidDir() {
  if (!existsSync(PID_DIR)) {
    mkdirSync(PID_DIR, { recursive: true });
  }
}

function readPid(pidPath) {
  if (!existsSync(pidPath)) {
    return null;
  }
  try {
    const content = readFileSync(pidPath, "utf-8").trim();
    return parseInt(content, 10) || null;
  } catch {
    return null;
  }
}

function isProcessRunning(pid) {
  if (!pid) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function stopProcess(pidPath, name) {
  const pid = readPid(pidPath);
  if (pid && isProcessRunning(pid)) {
    console.log(`Stopping ${name} (PID ${pid})`);
    try {
      process.kill(pid, "SIGTERM");
      // Give it a moment to stop gracefully
      setTimeout(() => {
        if (isProcessRunning(pid)) {
          process.kill(pid, "SIGKILL");
        }
      }, 2000);
    } catch (err) {
      console.debug(`[dev] Error stopping ${name}:`, err.message);
    }
  } else {
    console.log(`${name} not running (pid file missing or stale)`);
  }

  if (existsSync(pidPath)) {
    try {
      unlinkSync(pidPath);
    } catch {
      // Ignore
    }
  }
}

function stopByPort(port) {
  try {
    const platform = process.platform;
    if (platform === "win32") {
      // Windows: use netstat
      const result = execSync(`netstat -ano | findstr :${port}`, { encoding: "utf-8" });
      const lines = result.split("\n").filter((l) => l.includes("LISTENING"));
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parseInt(parts[parts.length - 1], 10);
        if (pid) {
          console.log(`Stopping process on port ${port} (PID ${pid})`);
          try {
            execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
          } catch {
            // Ignore
          }
        }
      }
    } else {
      // Unix: use lsof
      try {
        const result = execSync(`lsof -i :${port} -t`, { encoding: "utf-8" });
        const pids = result.trim().split("\n").filter(Boolean);
        for (const pidStr of pids) {
          const pid = parseInt(pidStr, 10);
          if (pid) {
            console.log(`Stopping process on port ${port} (PID ${pid})`);
            try {
              process.kill(pid, "SIGTERM");
            } catch {
              // Ignore
            }
          }
        }
      } catch {
        // No process on port, ignore
      }
    }
  } catch {
    // Ignore errors
  }
}

function startGateway() {
  const existingPid = readPid(GATEWAY_PID);
  if (existingPid && isProcessRunning(existingPid)) {
    console.log(`Gateway already running (PID ${existingPid})`);
    return;
  }

  console.log("Starting gateway...");
  const proc = spawn("node", ["dist/cli.js", "gateway", "start"], {
    cwd: ROOT,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  // Log output to files
  const { createWriteStream } = await import("fs");
  const outLog = createWriteStream(join(ROOT, "gateway.log"), { flags: "a" });
  const errLog = createWriteStream(join(ROOT, "gateway.error.log"), { flags: "a" });
  proc.stdout.pipe(outLog);
  proc.stderr.pipe(errLog);

  proc.unref();
  writeFileSync(GATEWAY_PID, String(proc.pid));
  console.log(`Gateway started (PID ${proc.pid})`);
}

function startDiscord() {
  const existingPid = readPid(DISCORD_PID);
  if (existingPid && isProcessRunning(existingPid)) {
    console.log(`Discord bot already running (PID ${existingPid})`);
    return;
  }

  console.log("Starting Discord bot...");
  const proc = spawn("node", ["dist/discord-bot.js"], {
    cwd: ROOT,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  // Log output to files
  const { createWriteStream } = await import("fs");
  const outLog = createWriteStream(join(ROOT, "discord-bot.log"), { flags: "a" });
  const errLog = createWriteStream(join(ROOT, "discord-bot.error.log"), { flags: "a" });
  proc.stdout.pipe(outLog);
  proc.stderr.pipe(errLog);

  proc.unref();
  writeFileSync(DISCORD_PID, String(proc.pid));
  console.log(`Discord bot started (PID ${proc.pid})`);
}

function build() {
  console.log("Building...");
  execSync("pnpm build", { cwd: ROOT, stdio: "inherit" });
}

async function main() {
  const args = process.argv.slice(2);
  const action = args[0] || "restart";
  const shouldBuild = args.includes("--build") || args.includes("-b");

  if (!["start", "stop", "restart"].includes(action)) {
    console.error("Usage: node scripts/dev.mjs <start|stop|restart> [--build]");
    process.exit(1);
  }

  ensurePidDir();

  if (action === "stop" || action === "restart") {
    stopProcess(DISCORD_PID, "Discord bot");
    stopProcess(GATEWAY_PID, "Gateway");
    stopByPort(GATEWAY_PORT);

    // Wait for processes to stop
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  if (action === "start" || action === "restart") {
    if (shouldBuild) {
      build();
    }
    await startGateway();
    await startDiscord();
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
