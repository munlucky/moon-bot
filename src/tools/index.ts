// Toolkit: Tool registry and execution

import path from "path";
import { createLogger, type Logger } from "../utils/logger.js";
import type { SystemConfig, ToolSpec, ToolContext } from "../types/index.js";

export class Toolkit {
  private tools = new Map<string, ToolSpec>();
  private logger: Logger;

  constructor(config: SystemConfig) {
    this.logger = createLogger(config);
  }

  register(spec: ToolSpec): void {
    this.tools.set(spec.id, spec);
    this.logger.info(`Tool registered: ${spec.id}`);
  }

  unregister(id: string): void {
    this.tools.delete(id);
    this.logger.info(`Tool unregistered: ${id}`);
  }

  get(id: string): ToolSpec | undefined {
    return this.tools.get(id);
  }

  list(): ToolSpec[] {
    return Array.from(this.tools.values());
  }

  has(id: string): boolean {
    return this.tools.has(id);
  }
}

/**
 * Normalize and validate file path to prevent directory traversal attacks.
 * Resolves any ".." or "." segments and ensures the path is within allowed directory.
 */
function validateFilePath(inputPath: string, allowedDir: string): string {
  // Normalize the path to resolve any ".." or "."
  const normalized = path.normalize(inputPath);

  // Check if the normalized path contains ".." (after normalization it should be resolved)
  if (normalized.includes("..")) {
    throw new Error("Path traversal detected: '..' not allowed");
  }

  // Resolve against the allowed directory
  const resolved = path.resolve(allowedDir, normalized);

  // Ensure the resolved path is within the allowed directory
  if (!resolved.startsWith(allowedDir)) {
    throw new Error("Path traversal detected: path outside allowed directory");
  }

  return resolved;
}

// Example tools
export function createBrowserTool(): ToolSpec {
  return {
    id: "browser.open",
    description: "Open a web page in the browser",
    schema: {
      type: "object",
      properties: {
        url: { type: "string" },
      },
      required: ["url"],
    },
    run: async (input: unknown, ctx: ToolContext) => {
      const { url } = input as { url: string };
      // TODO: Implement Playwright integration
      return { url, opened: true };
    },
  };
}

export function createFilesystemTool(allowedDir: string = "/tmp/moonbot"): ToolSpec {
  return {
    id: "filesystem.write",
    description: "Write content to a file",
    schema: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
      },
      required: ["path", "content"],
    },
    run: async (input: unknown, ctx: ToolContext) => {
      const { path: inputPath, content } = input as { path: string; content: string };

      // Validate and sanitize the file path
      const safePath = validateFilePath(inputPath, allowedDir);

      // TODO: Implement filesystem operations with safePath
      return { path: safePath, written: true };
    },
  };
}

export function createApiTool(): ToolSpec {
  return {
    id: "api.call",
    description: "Make an HTTP API call",
    schema: {
      type: "object",
      properties: {
        url: { type: "string" },
        method: { type: "string", enum: ["GET", "POST", "PUT", "DELETE"] },
      },
      required: ["url", "method"],
    },
    run: async (input: unknown, ctx: ToolContext) => {
      const { url, method } = input as { url: string; method: string };
      // TODO: Implement HTTP client
      return { url, method, status: 200 };
    },
  };
}
