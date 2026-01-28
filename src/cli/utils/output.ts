/**
 * Output formatting utilities for CLI
 */

import type { OutputFormat } from "../types.js";
import Table from "cli-table3";
import chalk from "chalk";

/** Format output based on format type */
export function formatOutput<T>(
  data: T,
  format: OutputFormat = "table"
): string {
  if (format === "json") {
    return JSON.stringify(data, null, 2);
  }

  // Default table formatting for objects
  if (typeof data === "object" && data !== null) {
    return formatAsTable(data);
  }

  return String(data);
}

/** Format object as table */
export function formatAsTable(data: unknown): string {
  if (typeof data !== "object" || data === null) {
    return String(data);
  }

  const obj = data as Record<string, unknown>;

  // Handle arrays
  if (Array.isArray(obj)) {
    if (obj.length === 0) return "No data";

    const keys = Object.keys(obj[0] as Record<string, unknown>);
    const table = new Table({
      head: keys.map((k) => chalk.cyan(k)),
    });

    for (const item of obj) {
      const row = keys.map((k) => formatValue((item as Record<string, unknown>)[k]));
      table.push(row);
    }

    return table.toString();
  }

  // Handle single object
  const table = new Table({
    colWidths: [30, 50],
  });

  for (const [key, value] of Object.entries(obj)) {
    table.push([chalk.cyan(key), formatValue(value)]);
  }

  return table.toString();
}

/** Format a value for display */
function formatValue(value: unknown): string {
  if (value === null) return chalk.gray("null");
  if (value === undefined) return chalk.gray("undefined");
  if (typeof value === "boolean") return value ? chalk.green("true") : chalk.red("false");
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return `[${value.length} items]`;
  return JSON.stringify(value);
}

/** Print success message */
export function printSuccess(message: string): void {
  console.log(chalk.green("✓"), message);
}

/** Print error message */
export function printError(message: string): void {
  console.error(chalk.red("✗"), message);
}

/** Print warning message */
export function printWarning(message: string): void {
  console.warn(chalk.yellow("⚠"), message);
}

/** Print info message */
export function printInfo(message: string): void {
  console.log(chalk.blue("ℹ"), message);
}

/** Print header */
export function printHeader(title: string): void {
  console.log("\n" + chalk.bold.cyan(title));
  console.log(chalk.gray("─".repeat(50)));
}
