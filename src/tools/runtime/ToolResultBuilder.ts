// Tool Result Builder Helper
// Provides consistent result construction for all tools

import type { ToolResult, ToolMeta } from "../../types/index.js";

/**
 * Helper for building consistent ToolResult objects.
 * Reduces boilerplate and ensures uniform result structure across all tools.
 *
 * @example
 * // Success result
 * return ToolResultBuilder.success({ content: "file data" }, { durationMs: 150 });
 *
 * // Failure result
 * return ToolResultBuilder.failure("FILE_NOT_FOUND", "File does not exist", { path });
 *
 * // Timeout result
 * return ToolResultBuilder.timeout(30000);
 */
export const ToolResultBuilder = {
  /**
   * Build a success result with data and optional metadata.
   */
  success<T>(data: T, meta?: Partial<ToolMeta>): ToolResult<T> {
    return {
      ok: true,
      data,
      meta: {
        durationMs: meta?.durationMs ?? 0,
        artifacts: meta?.artifacts,
        truncated: meta?.truncated,
      },
    };
  },

  /**
   * Build a failure result with error details.
   * Returns ToolResult<never> which is assignable to any ToolResult<T>.
   */
  failure(code: string, message: string, details?: unknown): ToolResult<never> {
    return {
      ok: false,
      error: { code, message, details },
      meta: { durationMs: 0 },
    } as ToolResult<never>;
  },

  /**
   * Build a failure result with duration metadata (for tracking).
   * Returns ToolResult<never> which is assignable to any ToolResult<T>.
   */
  failureWithDuration(
    code: string,
    message: string,
    durationMs: number,
    details?: unknown
  ): ToolResult<never> {
    return {
      ok: false,
      error: { code, message, details },
      meta: { durationMs },
    } as ToolResult<never>;
  },

  /**
   * Build a timeout failure result.
   */
  timeout(durationMs: number): ToolResult<never> {
    return this.failure("TIMEOUT", "Tool execution timeout", { durationMs });
  },

  /**
   * Build a cancelled failure result.
   */
  cancelled(): ToolResult<never> {
    return this.failure("CANCELLED", "Tool execution cancelled");
  },

  /**
   * Build an approval required failure result.
   */
  approvalRequired(toolId: string, reason?: string): ToolResult<never> {
    return this.failure(
      "APPROVAL_REQUIRED",
      reason ?? `Tool '${toolId}' requires approval before execution`,
      { toolId }
    );
  },

  /**
   * Build a validation error result.
   */
  validationError(message: string, validationErrors?: unknown): ToolResult<never> {
    return this.failure("VALIDATION_ERROR", message, validationErrors);
  },

  /**
   * Build a permission denied result.
   */
  permissionDenied(message: string, details?: unknown): ToolResult<never> {
    return this.failure("PERMISSION_DENIED", message, details);
  },

  /**
   * Build a not found result.
   */
  notFound(resourceType: string, identifier: string): ToolResult<never> {
    return this.failure(
      "NOT_FOUND",
      `${resourceType} '${identifier}' not found`,
      { resourceType, identifier }
    );
  },
};

export default ToolResultBuilder;
