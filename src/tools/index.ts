// Tool Registry and Integration

import path from "path";
import os from "os";
import { randomUUID } from "crypto";
import { createLogger, type Logger } from "../utils/logger.js";
import type { SystemConfig, ToolSpec, ToolContext, ToolResult, ToolDefinition, ToolMeta } from "../types/index.js";
import { ToolRuntime } from "./runtime/ToolRuntime.js";
import { ApprovalManager } from "./runtime/ApprovalManager.js";
import { filterToolsByProfile, type ToolProfile } from "./policy/ToolProfile.js";

// File I/O Tools
import {
  createFileReadTool,
  createFileWriteTool,
  createFileListTool,
  createFileGlobTool,
} from "./filesystem/FileIOTool.js";

// HTTP Tools
import { createHttpRequestTool, createHttpDownloadTool } from "./http/HttpTool.js";

// Desktop Tools
import { createSystemRunTool, createSystemRunRawTool } from "./desktop/SystemRunTool.js";

// Browser Tools
import { BrowserTool, createBrowserTools } from "./browser/BrowserTool.js";

// Process Tools
import { ProcessSessionManager } from "./process/ProcessSessionManager.js";
import { createProcessTools } from "./process/ProcessTool.js";

export class Toolkit {
  private tools = new Map<string, ToolSpec>();
  private logger: Logger;
  private runtime: ToolRuntime | null = null;
  private browserTool: BrowserTool | null = null;

  constructor(config: SystemConfig) {
    this.logger = createLogger(config);
  }

  /**
   * Initialize the tool runtime with all registered tools.
   */
  initializeRuntime(workspaceRoot?: string): ToolRuntime {
    if (this.runtime) {
      return this.runtime;
    }

    const runtime = new ToolRuntime(
      {
        gateways: [],
        agents: [],
        channels: [],
        tools: [],
      },
      {
        workspaceRoot: workspaceRoot ?? process.cwd(),
        defaultTimeoutMs: 30000,
        maxConcurrent: 10,
        enableApprovals: true,
      }
    );

    // Register all tools
    for (const tool of this.tools.values()) {
      runtime.register(tool);
    }

    this.runtime = runtime;
    return runtime;
  }

  /**
   * Initialize browser tool (requires Playwright).
   */
  async initializeBrowser(headless: boolean = true): Promise<void> {
    if (!this.browserTool) {
      this.browserTool = new BrowserTool(5);
      await this.browserTool.initialize(headless);
    }
  }

  /**
   * Close browser tool.
   */
  async closeBrowser(): Promise<void> {
    if (this.browserTool) {
      await this.browserTool.close();
      this.browserTool = null;
    }
  }

  register(spec: ToolSpec<unknown, unknown>): void {
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

  /**
   * Get tool definitions for LLM context.
   * Returns an array of ToolDefinition containing name, description, and schema.
   */
  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.id,
      description: tool.description,
      schema: tool.schema,
    }));
  }

  /**
   * Get the tool runtime instance.
   */
  getRuntime(): ToolRuntime | null {
    return this.runtime;
  }
}

/**
 * Create and configure all Gateway tools.
 * @param config - System configuration
 * @param options - Tool creation options
 * @param options.profile - Tool profile to apply (default: 'full')
 * @param options.workspaceRoot - Workspace root directory
 * @param options.enableBrowser - Enable browser tools (requires profile='full')
 * @param options.browserHeadless - Run browser in headless mode
 */
export async function createGatewayTools(
  config: SystemConfig,
  options: {
    profile?: ToolProfile;
    workspaceRoot?: string;
    enableBrowser?: boolean;
    browserHeadless?: boolean;
  } = {}
): Promise<Toolkit> {
  const toolkit = new Toolkit(config);
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const profile = options.profile ?? "full";

  // Collect all candidate tools
  const candidateTools: ToolSpec[] = [];

  // Create approval manager (needed for system tools)
  const approvalManager = new ApprovalManager();
  await approvalManager.loadConfig();

  // File I/O tools
  candidateTools.push(
    createFileReadTool() as ToolSpec<unknown, unknown>,
    createFileWriteTool() as ToolSpec<unknown, unknown>,
    createFileListTool() as ToolSpec<unknown, unknown>,
    createFileGlobTool() as ToolSpec<unknown, unknown>
  );

  // HTTP tools
  candidateTools.push(
    createHttpRequestTool() as ToolSpec<unknown, unknown>,
    createHttpDownloadTool() as ToolSpec<unknown, unknown>
  );

  // Desktop tools
  candidateTools.push(
    createSystemRunTool(approvalManager) as ToolSpec<unknown, unknown>,
    createSystemRunRawTool(approvalManager) as ToolSpec<unknown, unknown>
  );

  // Browser tools (only if explicitly enabled AND profile allows)
  const enableBrowser = options.enableBrowser && profile === "full";
  if (enableBrowser) {
    const browserTool = new BrowserTool(5);
    await browserTool.initialize(options.browserHeadless ?? true);

    candidateTools.push(...createBrowserTools(browserTool));

    // Store browser tool reference for cleanup
    (toolkit as any).browserTool = browserTool;
  }

  // Process tools (for interactive terminal sessions)
  const processSessionManager = new ProcessSessionManager({
    maxOutputLines: 1000,
    maxLogSize: 10 * 1024 * 1024, // 10MB
    idleTimeoutMs: 30 * 60 * 1000, // 30 minutes
    maxSessionsPerUser: 3,
  });

  candidateTools.push(
    ...createProcessTools(processSessionManager, approvalManager)
  );

  // Store process session manager reference for cleanup
  (toolkit as any).processSessionManager = processSessionManager;

  // Set up periodic session cleanup
  setInterval(() => {
    processSessionManager.cleanupExpired().catch(() => {
      // Ignore cleanup errors
    });
  }, 5 * 60 * 1000); // Every 5 minutes

  // Filter tools by profile and register
  const filteredTools = filterToolsByProfile(candidateTools, profile);
  for (const tool of filteredTools) {
    toolkit.register(tool);
  }

  // Initialize runtime
  toolkit.initializeRuntime(workspaceRoot);

  return toolkit;
}

/**
 * Normalize and validate file path to prevent directory traversal attacks.
 * Resolves any ".." or "." segments and ensures the path is within allowed directory.
 * Works correctly on both Windows and Unix systems.
 */
export function validateFilePath(inputPath: string, allowedDir: string): string {
  // Normalize allowed directory first for consistent comparison
  const normalizedAllowed = path.normalize(allowedDir);

  // Normalize the input path to resolve any ".." or "."
  const normalized = path.normalize(inputPath);

  // Check for path traversal attempts (after normalization, ".." should be resolved)
  // This is a defense-in-depth check
  if (normalized.includes("..")) {
    throw new Error("Path traversal detected: '..' not allowed");
  }

  // Resolve against the allowed directory
  const resolved = path.resolve(normalizedAllowed, normalized);

  // Normalize the resolved path for comparison (handles case-insensitive filesystems)
  const normalizedResolved = path.normalize(resolved);
  const normalizedAllowedLower = normalizedAllowed.toLowerCase();
  const normalizedResolvedLower = normalizedResolved.toLowerCase();

  // Check if the resolved path starts with allowed directory
  // Using case-insensitive comparison for Windows compatibility
  if (!normalizedResolvedLower.startsWith(normalizedAllowedLower)) {
    throw new Error("Path traversal detected: path outside allowed directory");
  }

  // Additional check: ensure we don't escape via parent directory on case-sensitive systems
  if (!normalizedResolved.startsWith(normalizedAllowed)) {
    throw new Error("Path traversal detected: path outside allowed directory");
  }

  return resolved;
}

// Re-export for convenience
export { ToolRuntime, ApprovalManager };
export { ToolResultBuilder } from "./runtime/ToolResultBuilder.js";
export type { ToolContext, ToolResult, ToolDefinition, ToolMeta };
