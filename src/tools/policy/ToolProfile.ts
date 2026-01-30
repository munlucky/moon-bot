// Tool Policy Profile System

import type { ToolSpec } from "../../types/index.js";

/**
 * Tool profile types for different permission levels.
 * - minimal: Read-only filesystem operations
 * - coding: File I/O + system commands + HTTP requests
 * - full: All tools including browser automation
 */
export type ToolProfile = "minimal" | "coding" | "full";

/**
 * Default tool profiles with allowed tool IDs.
 */
export const TOOL_PROFILES: Record<ToolProfile, Set<string>> = {
  minimal: new Set([
    "fs.read",
    "fs.list",
    "fs.glob"
  ]),

  coding: new Set([
    "fs.read",
    "fs.write",
    "fs.list",
    "fs.glob",
    "system.run",
    "system.runRaw",
    "http.request",
    "http.download",
    "process.exec",
    "process.write",
    "process.poll",
    "process.log",
    "process.kill",
    "process.list",
    "claude_code.start",
    "claude_code.write",
    "claude_code.poll",
    "claude_code.stop",
    "nodes.status",
    "nodes.run",
    "nodes.screen_snap"
  ]),

  full: new Set(["*"])
};

/**
 * Filter tools by profile.
 * @param tools - Array of tool specs to filter
 * @param profile - Profile to apply
 * @returns Filtered array of tool specs
 */
export function filterToolsByProfile(
  tools: ToolSpec[],
  profile: ToolProfile
): ToolSpec[] {
  const allowed = TOOL_PROFILES[profile];

  // Full profile: allow all tools
  if (allowed.has("*")) {
    return tools;
  }

  // Filter by allowed tool IDs
  return tools.filter(t => allowed.has(t.id));
}

/**
 * Get default profile based on environment.
 * Production uses 'coding' by default for safety.
 */
export function getDefaultProfile(): ToolProfile {
  const env = process.env.NODE_ENV;
  return env === "production" ? "coding" : "full";
}
