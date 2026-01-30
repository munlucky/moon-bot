// Claude Code Tools (claude_code.start, write, poll, stop)
// Enables Claude CLI sessions for Discord bot

import type { ToolSpec } from "../../types/index.js";
import { ApprovalManager } from "../runtime/ApprovalManager.js";
import { ToolResultBuilder } from "../runtime/ToolResultBuilder.js";
import { ClaudeCodeSessionManager } from "./ClaudeCodeSessionManager.js";
import {
  ClaudeCodeStartInputSchema,
  ClaudeCodeWriteInputSchema,
  ClaudeCodeStopInputSchema,
  ClaudeCodePollInputSchema,
  toJSONSchema,
  type ClaudeCodeStartInput,
  type ClaudeCodeStartResult,
  type ClaudeCodeWriteInput,
  type ClaudeCodeWriteResult,
  type ClaudeCodeStopInput,
  type ClaudeCodeStopResult,
  type ClaudeCodePollInput,
  type ClaudeCodePollResult,
} from "../schemas/TypeBoxSchemas.js";

/**
 * Create claude_code.start tool
 */
export function createClaudeCodeStartTool(
  sessionManager: ClaudeCodeSessionManager,
  approvalManager: ApprovalManager
): ToolSpec<ClaudeCodeStartInput, ClaudeCodeStartResult> {
  return {
    id: "claude_code.start",
    description:
      "Start a Claude Code CLI session with PTY support. Returns sessionId for subsequent operations.",
    schema: toJSONSchema(ClaudeCodeStartInputSchema),
    requiresApproval: true,
    run: async (input, ctx) => {
      const startTime = Date.now();

      try {
        const userId = ctx.userId ?? "anonymous";
        const workingDirectory = input.workingDirectory;

        // Check approval for working directory
        const approval = await approvalManager.checkApproval(
          ["claude"],
          workingDirectory,
          ctx.workspaceRoot
        );

        if (!approval.approved) {
          return ToolResultBuilder.failureWithDuration(
            "APPROVAL_DENIED",
            approval.reason ?? "Claude Code execution not approved",
            Date.now() - startTime
          );
        }

        // Create session
        const session = await sessionManager.createSession(
          workingDirectory,
          userId,
          {
            prompt: input.prompt,
            env: input.env,
            timeout: input.timeout,
            useScreenCapture: input.useScreenCapture,
          }
        );

        // Get process info
        const processSession = sessionManager.getProcessSession(session.id);

        return ToolResultBuilder.success<ClaudeCodeStartResult>(
          {
            sessionId: session.id,
            pid: processSession?.pid ?? null,
            status: processSession?.status ?? "running",
            useScreenCapture: session.useScreenCapture,
            workingDirectory: session.workingDirectory,
          },
          { durationMs: Date.now() - startTime }
        );
      } catch (error) {
        return ToolResultBuilder.failureWithDuration(
          "START_ERROR",
          error instanceof Error ? error.message : "Failed to start Claude Code session",
          Date.now() - startTime
        );
      }
    },
  };
}

/**
 * Create claude_code.write tool
 */
export function createClaudeCodeWriteTool(
  sessionManager: ClaudeCodeSessionManager
): ToolSpec<ClaudeCodeWriteInput, ClaudeCodeWriteResult> {
  return {
    id: "claude_code.write",
    description: "Write input to a Claude Code session",
    schema: toJSONSchema(ClaudeCodeWriteInputSchema),
    requiresApproval: false,
    run: async (input, ctx) => {
      const startTime = Date.now();

      try {
        const session = sessionManager.getSession(input.sessionId);

        if (!session) {
          return ToolResultBuilder.failureWithDuration(
            "SESSION_NOT_FOUND",
            `Session not found: ${input.sessionId}`,
            Date.now() - startTime
          );
        }

        // Verify user ownership
        const userId = ctx.userId ?? "anonymous";
        if (session.userId !== userId && session.userId !== "anonymous") {
          return ToolResultBuilder.failureWithDuration(
            "ACCESS_DENIED",
            "You do not own this session",
            Date.now() - startTime
          );
        }

        const result = sessionManager.writeToSession(input.sessionId, input.input);

        if (!result.success) {
          return ToolResultBuilder.failureWithDuration(
            "WRITE_FAILED",
            "Failed to write to session",
            Date.now() - startTime
          );
        }

        return ToolResultBuilder.success<ClaudeCodeWriteResult>(
          {
            success: result.success,
            bytesWritten: result.bytesWritten,
            useScreenCapture: result.useScreenCapture,
          },
          { durationMs: Date.now() - startTime }
        );
      } catch (error) {
        return ToolResultBuilder.failureWithDuration(
          "WRITE_ERROR",
          error instanceof Error ? error.message : "Write failed",
          Date.now() - startTime
        );
      }
    },
  };
}

/**
 * Create claude_code.poll tool
 */
export function createClaudeCodePollTool(
  sessionManager: ClaudeCodeSessionManager
): ToolSpec<ClaudeCodePollInput, ClaudeCodePollResult> {
  return {
    id: "claude_code.poll",
    description: "Poll recent output from a Claude Code session",
    schema: toJSONSchema(ClaudeCodePollInputSchema),
    requiresApproval: false,
    run: async (input, ctx) => {
      const startTime = Date.now();

      try {
        const session = sessionManager.getSession(input.sessionId);

        if (!session) {
          return ToolResultBuilder.failureWithDuration(
            "SESSION_NOT_FOUND",
            `Session not found: ${input.sessionId}`,
            Date.now() - startTime
          );
        }

        // Verify user ownership
        const userId = ctx.userId ?? "anonymous";
        if (session.userId !== userId && session.userId !== "anonymous") {
          return ToolResultBuilder.failureWithDuration(
            "ACCESS_DENIED",
            "You do not own this session",
            Date.now() - startTime
          );
        }

        const result = sessionManager.pollOutput(
          input.sessionId,
          input.maxLines ?? 100
        );

        if (!result) {
          return ToolResultBuilder.failureWithDuration(
            "POLL_FAILED",
            "Failed to poll session",
            Date.now() - startTime
          );
        }

        return ToolResultBuilder.success<ClaudeCodePollResult>(
          {
            lines: result.lines,
            hasMore: result.hasMore,
            status: result.status,
            exitCode: result.exitCode,
            useScreenCapture: result.useScreenCapture,
          },
          { durationMs: Date.now() - startTime }
        );
      } catch (error) {
        return ToolResultBuilder.failureWithDuration(
          "POLL_ERROR",
          error instanceof Error ? error.message : "Poll failed",
          Date.now() - startTime
        );
      }
    },
  };
}

/**
 * Create claude_code.stop tool
 */
export function createClaudeCodeStopTool(
  sessionManager: ClaudeCodeSessionManager
): ToolSpec<ClaudeCodeStopInput, ClaudeCodeStopResult> {
  return {
    id: "claude_code.stop",
    description: "Stop a Claude Code session",
    schema: toJSONSchema(ClaudeCodeStopInputSchema),
    requiresApproval: false,
    run: async (input, ctx) => {
      const startTime = Date.now();

      try {
        const session = sessionManager.getSession(input.sessionId);

        if (!session) {
          return ToolResultBuilder.failureWithDuration(
            "SESSION_NOT_FOUND",
            `Session not found: ${input.sessionId}`,
            Date.now() - startTime
          );
        }

        // Verify user ownership
        const userId = ctx.userId ?? "anonymous";
        if (session.userId !== userId && session.userId !== "anonymous") {
          return ToolResultBuilder.failureWithDuration(
            "ACCESS_DENIED",
            "You do not own this session",
            Date.now() - startTime
          );
        }

        const signal = (input.signal ?? "SIGTERM") as NodeJS.Signals;
        const result = await sessionManager.stopSession(input.sessionId, signal);

        return ToolResultBuilder.success<ClaudeCodeStopResult>(
          {
            success: result.success,
            status: result.status,
            exitCode: result.exitCode,
            message: result.message,
            lastOutput: result.lastOutput,
          },
          { durationMs: Date.now() - startTime }
        );
      } catch (error) {
        return ToolResultBuilder.failureWithDuration(
          "STOP_ERROR",
          error instanceof Error ? error.message : "Stop failed",
          Date.now() - startTime
        );
      }
    },
  };
}

/**
 * Create all Claude Code tools
 */
export function createClaudeCodeTools(
  sessionManager: ClaudeCodeSessionManager,
  approvalManager: ApprovalManager
): ToolSpec[] {
  return [
    createClaudeCodeStartTool(sessionManager, approvalManager) as ToolSpec<
      unknown,
      unknown
    >,
    createClaudeCodeWriteTool(sessionManager) as ToolSpec<unknown, unknown>,
    createClaudeCodePollTool(sessionManager) as ToolSpec<unknown, unknown>,
    createClaudeCodeStopTool(sessionManager) as ToolSpec<unknown, unknown>,
  ];
}
