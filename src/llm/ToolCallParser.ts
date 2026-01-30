// ToolCallParser: Parse tool call markup into JSON plan format

import type { Step } from "../types/index.js";
import { createLogger, type Logger } from "../utils/logger.js";

/**
 * Tool alias mapping for compatibility
 * Maps legacy/alternative tool names to canonical tool IDs
 */
export const TOOL_ALIASES: Record<string, string> = {
  // Process tools
  "exec": "process.exec",
  "shell": "process.exec",

  // Browser tools
  "browser.open": "browser.goto",
  "open": "browser.goto",

  // Filesystem tools
  "filesystem.write": "fs.write",
  "fs.write": "fs.write",
  "file.write": "fs.write",

  "filesystem.read": "fs.read",
  "fs.read": "fs.read",
  "file.read": "fs.read",

  "filesystem.list": "fs.list",
  "fs.list": "fs.list",
  "file.list": "fs.list",

  "browser.search": "browser.search",
  "search": "browser.search",
};

/**
 * Parsed tool call result
 */
interface ParsedToolCall {
  toolId: string;
  args: Record<string, unknown>;
}

/**
 * ToolCallParser: Parse tool call markup format into Step array
 *
 * Markup format:
 * ```
 * >>tool.name arg1=value1 arg2="value with spaces"
 * >>another.tool arg1=[1,2,3] arg2={"key":"value"}
 * ```
 */
export class ToolCallParser {
  private logger: Logger;

  constructor() {
    this.logger = createLogger();
  }

  /**
   * Parse tool call markup content into steps array
   * @param content Raw content containing tool call markup
   * @returns Parsed steps array
   */
  parse(content: string): Step[] {
    const steps: Step[] = [];
    const lines = content.split("\n");
    let stepIndex = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue; // Skip empty lines and comments
      }

      // Check if this is a tool call line
      if (trimmed.startsWith(">>")) {
        const parsed = this.parseToolCall(trimmed);
        if (parsed) {
          steps.push({
            id: `step-${stepIndex++}`,
            description: `Execute ${parsed.toolId}`,
            toolId: parsed.toolId,
            input: parsed.args,
          });
        }
      }
    }

    // Always add a response step if no steps were added
    if (steps.length === 0) {
      steps.push({
        id: "respond",
        description: "Generate response",
      });
    } else {
      // Add final response step
      steps.push({
        id: `step-${stepIndex}`,
        description: "Generate response",
        dependsOn: steps.map((s) => s.id),
      });
    }

    return steps;
  }

  /**
   * Check if content contains tool call markup
   */
  hasToolCallMarkup(content: string): boolean {
    return content.includes(">>");
  }

  /**
   * Parse a single tool call line
   * @param line Tool call line (e.g., ">>fs.list path=/tmp")
   * @returns Parsed tool call or null if invalid
   */
  private parseToolCall(line: string): ParsedToolCall | null {
    try {
      // Remove the >> prefix
      const withoutPrefix = line.substring(2).trim();

      // Split on first space to separate toolId from args
      const firstSpaceIndex = withoutPrefix.indexOf(" ");
      if (firstSpaceIndex === -1) {
        // No args, just toolId
        const rawToolId = withoutPrefix;
        const toolId = this.resolveAlias(rawToolId);
        return { toolId, args: {} };
      }

      const rawToolId = withoutPrefix.substring(0, firstSpaceIndex).trim();
      const argsString = withoutPrefix.substring(firstSpaceIndex + 1).trim();

      const toolId = this.resolveAlias(rawToolId);
      const args = this.parseArgs(argsString);

      return { toolId, args };
    } catch (error) {
      this.logger.warn("Failed to parse tool call", { line, error });
      return null;
    }
  }

  /**
   * Resolve tool alias to canonical tool ID
   */
  private resolveAlias(toolId: string): string {
    return TOOL_ALIASES[toolId] || toolId;
  }

  /**
   * Parse arguments string into key-value pairs
   * Supports:
   * - Simple values: key=value
   * - Quoted strings: key="quoted value"
   * - JSON values: key=["array"] or key={"object":true}
   */
  private parseArgs(argsString: string): Record<string, unknown> {
    const args: Record<string, unknown> = {};
    const regex = /(\w+)=("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\[[^\]]*\]|\{[^}]*\}|[^\s]+)/g;
    let match;

    while ((match = regex.exec(argsString)) !== null) {
      const key = match[1];
      const rawValue = match[2];

      // Remove surrounding quotes
      let value: unknown = rawValue;
      if ((rawValue.startsWith('"') && rawValue.endsWith('"')) ||
          (rawValue.startsWith("'") && rawValue.endsWith("'"))) {
        value = rawValue.slice(1, -1);
      }
      // Try to parse as JSON for arrays and objects
      else if (rawValue.startsWith("[") || rawValue.startsWith("{")) {
        try {
          value = JSON.parse(rawValue);
        } catch {
          value = rawValue;
        }
      }
      // Try to parse as number
      else if (!isNaN(Number(rawValue))) {
        value = Number(rawValue);
      }
      // Try to parse as boolean
      else if (rawValue === "true") {
        value = true;
      } else if (rawValue === "false") {
        value = false;
      }

      args[key] = value;
    }

    return args;
  }

  /**
   * Get all registered aliases
   */
  getAliases(): Record<string, string> {
    return { ...TOOL_ALIASES };
  }

  /**
   * Add a custom alias
   */
  addAlias(from: string, to: string): void {
    TOOL_ALIASES[from] = to;
    this.logger.debug(`Added tool alias: ${from} -> ${to}`);
  }
}
