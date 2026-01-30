// Process Tools (process.exec, write, poll, log, kill, list)
// Enables interactive terminal sessions for Discord bot

import type { ToolSpec } from "../../types/index.js";
import { ApprovalManager } from "../runtime/ApprovalManager.js";
import { CommandSanitizer } from "../desktop/CommandSanitizer.js";
import { ToolResultBuilder } from "../runtime/ToolResultBuilder.js";
import { ProcessSessionManager } from "./ProcessSessionManager.js";
import {
  ProcessExecInputSchema,
  ProcessWriteInputSchema,
  ProcessPollInputSchema,
  ProcessLogInputSchema,
  ProcessKillInputSchema,
  ProcessListInputSchema,
  toJSONSchema,
  type ProcessExecInput,
  type ProcessExecResult,
  type ProcessWriteInput,
  type ProcessWriteResult,
  type ProcessPollInput,
  type ProcessPollResult,
  type ProcessLogInput,
  type ProcessLogResult,
  type ProcessKillInput,
  type ProcessKillResult,
  type ProcessListInput,
  type ProcessListResult,
} from "../schemas/TypeBoxSchemas.js";

/**
 * Create process.exec tool
 */
export function createProcessExecTool(
  sessionManager: ProcessSessionManager,
  approvalManager: ApprovalManager
): ToolSpec<ProcessExecInput, ProcessExecResult> {
  return {
    id: "process.exec",
    description: "Execute a command in background with optional PTY support",
    schema: toJSONSchema(ProcessExecInputSchema),
    requiresApproval: true,
    run: async (input, ctx) => {
      const startTime = Date.now();

      try {
        const argv = Array.isArray(input.argv) ? input.argv : [input.argv];
        const cwd = input.cwd ?? ctx.workspaceRoot;
        const userId = ctx.userId ?? "anonymous";

        // Check approval
        const approval = await approvalManager.checkApproval(
          argv,
          cwd,
          ctx.workspaceRoot
        );

        if (!approval.approved) {
          return ToolResultBuilder.failureWithDuration(
            "APPROVAL_DENIED",
            approval.reason ?? "Command not approved for execution",
            Date.now() - startTime
          );
        }

        // Sanitization check
        const sanitizer = new CommandSanitizer();
        const sanitization = sanitizer.sanitize(argv, cwd, ctx.workspaceRoot);

        if (!sanitization.safe) {
          return ToolResultBuilder.failureWithDuration(
            "SANITIZATION_FAILED",
            sanitization.reason ?? "Command failed sanitization",
            Date.now() - startTime
          );
        }

        // Create session
        const session = await sessionManager.createSession(argv, cwd, userId, {
          pty: input.pty ?? false,
          env: input.env,
        });

        return ToolResultBuilder.success<ProcessExecResult>(
          {
            sessionId: session.id,
            pid: session.pid,
            status: session.status,
          },
          { durationMs: Date.now() - startTime }
        );
      } catch (error) {
        return ToolResultBuilder.failureWithDuration(
          "EXECUTION_ERROR",
          error instanceof Error ? error.message : "Failed to execute command",
          Date.now() - startTime
        );
      }
    },
  };
}

/**
 * Create process.write tool
 */
export function createProcessWriteTool(
  sessionManager: ProcessSessionManager
): ToolSpec<ProcessWriteInput, ProcessWriteResult> {
  return {
    id: "process.write",
    description: "Write input to a process session",
    schema: toJSONSchema(ProcessWriteInputSchema),
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

        const result = sessionManager.writeToSession(
          input.sessionId,
          input.input
        );

        if (!result.success) {
          return ToolResultBuilder.failureWithDuration(
            "WRITE_FAILED",
            "Failed to write to session",
            Date.now() - startTime
          );
        }

        return ToolResultBuilder.success<ProcessWriteResult>(result, {
          durationMs: Date.now() - startTime,
        });
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
 * Create process.poll tool
 */
export function createProcessPollTool(
  sessionManager: ProcessSessionManager
): ToolSpec<ProcessPollInput, ProcessPollResult> {
  return {
    id: "process.poll",
    description: "Poll recent output from a process session",
    schema: toJSONSchema(ProcessPollInputSchema),
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

        return ToolResultBuilder.success<ProcessPollResult>(result, {
          durationMs: Date.now() - startTime,
        });
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
 * Create process.log tool
 */
export function createProcessLogTool(
  sessionManager: ProcessSessionManager
): ToolSpec<ProcessLogInput, ProcessLogResult> {
  return {
    id: "process.log",
    description: "Get full output log from a process session",
    schema: toJSONSchema(ProcessLogInputSchema),
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

        const result = sessionManager.getFullLog(input.sessionId);

        if (!result) {
          return ToolResultBuilder.failureWithDuration(
            "LOG_FAILED",
            "Failed to get session log",
            Date.now() - startTime
          );
        }

        return ToolResultBuilder.success<ProcessLogResult>(result, {
          durationMs: Date.now() - startTime,
        });
      } catch (error) {
        return ToolResultBuilder.failureWithDuration(
          "LOG_ERROR",
          error instanceof Error ? error.message : "Log retrieval failed",
          Date.now() - startTime
        );
      }
    },
  };
}

/**
 * Create process.kill tool
 */
export function createProcessKillTool(
  sessionManager: ProcessSessionManager
): ToolSpec<ProcessKillInput, ProcessKillResult> {
  return {
    id: "process.kill",
    description: "Kill a process session",
    schema: toJSONSchema(ProcessKillInputSchema),
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

        const signal = input.signal ?? "SIGTERM";
        const result = await sessionManager.killSession(
          input.sessionId,
          signal as NodeJS.Signals
        );

        if (!result.success) {
          return ToolResultBuilder.failureWithDuration(
            "KILL_FAILED",
            result.message,
            Date.now() - startTime
          );
        }

        return ToolResultBuilder.success<ProcessKillResult>(result, {
          durationMs: Date.now() - startTime,
        });
      } catch (error) {
        return ToolResultBuilder.failureWithDuration(
          "KILL_ERROR",
          error instanceof Error ? error.message : "Kill failed",
          Date.now() - startTime
        );
      }
    },
  };
}

/**
 * Create process.list tool
 */
export function createProcessListTool(
  sessionManager: ProcessSessionManager
): ToolSpec<ProcessListInput, ProcessListResult> {
  return {
    id: "process.list",
    description: "List active process sessions",
    schema: toJSONSchema(ProcessListInputSchema),
    requiresApproval: false,
    run: async (input, ctx) => {
      const startTime = Date.now();

      try {
        // Filter by current user unless admin
        const userId = input.userId ?? ctx.userId ?? "anonymous";
        const sessions = sessionManager.listActiveSessions(userId);

        const sessionInfos = sessions.map((s) => ({
          id: s.id,
          command: s.command,
          status: s.status,
          pid: s.pid,
          createdAt: s.createdAt,
          lastActivityAt: s.lastActivityAt,
          pty: s.pty,
        }));

        return ToolResultBuilder.success<ProcessListResult>(
          {
            sessions: sessionInfos,
            count: sessionInfos.length,
          },
          { durationMs: Date.now() - startTime }
        );
      } catch (error) {
        return ToolResultBuilder.failureWithDuration(
          "LIST_ERROR",
          error instanceof Error ? error.message : "List failed",
          Date.now() - startTime
        );
      }
    },
  };
}

/**
 * Create all process tools
 */
export function createProcessTools(
  sessionManager: ProcessSessionManager,
  approvalManager: ApprovalManager
): ToolSpec[] {
  return [
    createProcessExecTool(sessionManager, approvalManager) as ToolSpec<unknown, unknown>,
    createProcessWriteTool(sessionManager) as ToolSpec<unknown, unknown>,
    createProcessPollTool(sessionManager) as ToolSpec<unknown, unknown>,
    createProcessLogTool(sessionManager) as ToolSpec<unknown, unknown>,
    createProcessKillTool(sessionManager) as ToolSpec<unknown, unknown>,
    createProcessListTool(sessionManager) as ToolSpec<unknown, unknown>,
  ];
}
