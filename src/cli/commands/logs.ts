/**
 * Logs command
 */

import fs from "fs";
import path from "path";
import { createReadStream } from "fs";
import { createInterface } from "readline";
import chalk from "chalk";
import { printError, printInfo } from "../utils/output.js";
import type { LogOptions } from "../types.js";

/** Log file path */
const LOG_DIR = path.join(process.env.HOME || process.env.USERPROFILE || "", ".moonbot", "logs");
const GATEWAY_LOG = path.join(LOG_DIR, "gateway.log");

/** Ensure log directory exists */
async function ensureLogDir(): Promise<void> {
  await fs.promises.mkdir(LOG_DIR, { recursive: true });
}

/** Tail log file (follow mode) */
async function tailLog(filePath: string, filterError: boolean): Promise<void> {
  printInfo("Following log file (Ctrl+C to stop)...");

  const readStream = createReadStream(filePath, { encoding: "utf-8", flags: "r" });
  const rl = createInterface({ input: readStream, crlfDelay: Infinity });

  // Start from end of file
  const stats = await fs.promises.stat(filePath);
  let position = stats.size;

  readStream.close();

  // Watch file for changes
  const watcher = fs.watch(filePath, { persistent: true }, async (eventType) => {
    if (eventType === "change") {
      const newStats = await fs.promises.stat(filePath);
      if (newStats.size > position) {
        const stream = createReadStream(filePath, {
          start: position,
          encoding: "utf-8",
        });
        const rl = createInterface({ input: stream, crlfDelay: Infinity });

        for await (const line of rl) {
          if (!filterError || line.toLowerCase().includes("error")) {
            printLogLine(line, filterError);
          }
        }

        position = newStats.size;
      }
    }
  });

  // Handle exit
  process.on("SIGINT", () => {
    watcher.close();
    process.exit(0);
  });
}

/** Print log line with coloring */
function printLogLine(line: string, filterError: boolean): void {
  if (!line.trim()) {return;}

  const lowerLine = line.toLowerCase();
  const isError = lowerLine.includes("error") || lowerLine.includes("fail");
  const isWarn = lowerLine.includes("warn");

  if (filterError && !isError) {return;}

  if (isError) {
    console.log(chalk.red(line));
  } else if (isWarn) {
    console.log(chalk.yellow(line));
  } else if (filterError) {
    console.log(line);
  } else {
    console.log(line);
  }
}

/** Read last N lines from log file */
async function tailLines(filePath: string, lines: number, filterError: boolean): Promise<void> {
  const content = await fs.promises.readFile(filePath, "utf-8");
  const allLines = content.split("\n").filter(line => line.trim());

  const filteredLines = filterError
    ? allLines.filter(line => line.toLowerCase().includes("error"))
    : allLines;

  const lastLines = filteredLines.slice(-lines);

  if (lastLines.length === 0) {
    printInfo("No log entries found");
    return;
  }

  for (const line of lastLines) {
    printLogLine(line, filterError);
  }
}

/** Logs command */
export async function logsCommand(options: LogOptions): Promise<void> {
  await ensureLogDir();

  // Check if log file exists
  try {
    await fs.promises.access(GATEWAY_LOG);
  } catch {
    printError("Log file not found. Start the gateway first.");
    printInfo(`Log path: ${GATEWAY_LOG}`);
    process.exit(1);
  }

  if (options.follow) {
    await tailLog(GATEWAY_LOG, options.error ?? false);
  } else {
    const lines = options.lines ?? 50;
    await tailLines(GATEWAY_LOG, lines, options.error ?? false);
  }
}
