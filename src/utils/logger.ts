// Simple logger utility

import fs from "fs";
import path from "path";
import type { LogEntry } from "../types/index.js";
import type { SystemConfig } from "../types/index.js";

export class Logger {
  private logFile: string | null = null;
  private minLevel: LogEntry["level"] = "info";
  private fileErrorLogged = false; // Track if we've logged file errors

  constructor(config?: SystemConfig) {
    if (config?.storage?.logsPath) {
      const date = new Date().toISOString().split("T")[0];
      this.logFile = path.join(config.storage.logsPath, `moonbot-${date}.log`);
    }
  }

  private log(level: LogEntry["level"], message: string, context?: Record<string, unknown>): void {
    const entry: LogEntry = {
      level,
      message,
      timestamp: Date.now(),
      context,
    };

    // Console output with colors
    const colors = {
      debug: "\x1b[36m", // cyan
      info: "\x1b[32m", // green
      warn: "\x1b[33m", // yellow
      error: "\x1b[31m", // red
    };
    const reset = "\x1b[0m";
    const prefix = colors[level] || "";
    console.log(`${prefix}[${level.toUpperCase()}]${reset} ${message}`);

    // File output with error handling
    if (this.logFile) {
      try {
        fs.appendFileSync(this.logFile, JSON.stringify(entry) + "\n");
      } catch (err) {
        // Log file error only once to prevent error loops
        if (!this.fileErrorLogged) {
          console.error(`[LOGGER ERROR] Failed to write to log file: ${this.logFile}`, err);
          this.fileErrorLogged = true;
        }
        // Ensure console output still works as fallback
      }
    }
  }

  debug(message: string, context?: Record<string, unknown>): void {
    if (this.minLevel === "debug") {
      this.log("debug", message, context);
    }
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log("info", message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log("warn", message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log("error", message, context);
  }

  setLevel(level: LogEntry["level"]): void {
    this.minLevel = level;
  }
}

export function createLogger(config?: SystemConfig): Logger {
  return new Logger(config);
}
