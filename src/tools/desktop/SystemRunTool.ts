// System execution tool (system.run) with approval and sanitization

import { spawn } from "child_process";
import type { ToolSpec } from "../../types/index.js";
import { ApprovalManager } from "../runtime/ApprovalManager.js";
import { CommandSanitizer } from "./CommandSanitizer.js";
import { ToolResultBuilder } from "../runtime/ToolResultBuilder.js";

interface SystemRunInput {
  argv: string | string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

interface SystemRunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

interface SystemRunRawInput {
  command: string;
  shell?: boolean;
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

const MAX_OUTPUT_SIZE = 1024 * 1024; // 1MB max for stdout/stderr

/**
 * Create system.run tool with approval and sanitization.
 */
export function createSystemRunTool(approvalManager: ApprovalManager): ToolSpec<SystemRunInput, SystemRunResult> {
  return {
    id: "system.run",
    description: "Execute a system command (requires approval)",
    schema: {
      type: "object",
      properties: {
        argv: {
          oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
        },
        cwd: { type: "string" },
        env: { type: "object" },
        timeoutMs: { type: "number" },
      },
      required: ["argv"],
    },
    requiresApproval: true,
    run: async (input, ctx) => {
      const startTime = Date.now();

      try {
        const argv = Array.isArray(input.argv) ? input.argv : [input.argv];
        const cwd = input.cwd ?? ctx.workspaceRoot;

        // Check approval
        const approval = await approvalManager.checkApproval(argv, cwd, ctx.workspaceRoot);

        if (!approval.approved) {
          return ToolResultBuilder.failureWithDuration(
            "APPROVAL_DENIED",
            approval.reason ?? "Command not approved for execution",
            Date.now() - startTime
          );
        }

        // Additional sanitization check
        const sanitizer = new CommandSanitizer();
        const sanitization = sanitizer.sanitize(argv, cwd, ctx.workspaceRoot);

        if (!sanitization.safe) {
          return ToolResultBuilder.failureWithDuration(
            "SANITIZATION_FAILED",
            sanitization.reason ?? "Command failed sanitization",
            Date.now() - startTime,
            { matchedPattern: sanitization.matchedPattern }
          );
        }

        // Execute command
        const result = await executeCommand(argv, cwd, input.env, input.timeoutMs ?? ctx.policy.timeoutMs);

        return ToolResultBuilder.success(result, { durationMs: Date.now() - startTime });
      } catch (error) {
        return ToolResultBuilder.failureWithDuration(
          "EXECUTION_ERROR",
          error instanceof Error ? error.message : "Command execution failed",
          Date.now() - startTime
        );
      }
    },
  };
}

/**
 * Create system.runRaw tool (deprecated/dangerous, requires explicit approval).
 */
export function createSystemRunRawTool(approvalManager: ApprovalManager): ToolSpec<SystemRunRawInput, SystemRunResult> {
  return {
    id: "system.runRaw",
    description: "[DANGEROUS] Execute raw shell command (DEPRECATED)",
    schema: {
      type: "object",
      properties: {
        command: { type: "string" },
        shell: { type: "boolean", default: false },
        cwd: { type: "string" },
        env: { type: "object" },
        timeoutMs: { type: "number" },
      },
      required: ["command"],
    },
    requiresApproval: true,
    run: async (input, ctx) => {
      const startTime = Date.now();

      try {
        // RunRaw is inherently dangerous, always deny unless explicitly allowed
        // This is a safety measure - the tool exists for edge cases but should be rarely used
        return ToolResultBuilder.failureWithDuration(
          "DEPRECATED_TOOL",
          "system.runRaw is deprecated. Use system.run with argv array instead.",
          Date.now() - startTime
        );
      } catch (error) {
        return ToolResultBuilder.failureWithDuration(
          "EXECUTION_ERROR",
          error instanceof Error ? error.message : "Command execution failed",
          Date.now() - startTime
        );
      }
    },
  };
}

/**
 * Execute a command with timeout and output size limits.
 */
async function executeCommand(
  argv: string[],
  cwd: string,
  env: Record<string, string> | undefined,
  timeoutMs: number
): Promise<SystemRunResult> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let killed = false;

    const child = spawn(argv[0], argv.slice(1), {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    const timeoutId = setTimeout(() => {
      killed = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
      if (stdout.length > MAX_OUTPUT_SIZE) {
        killed = true;
        child.kill("SIGKILL");
        stdout = stdout.slice(0, MAX_OUTPUT_SIZE);
      }
    });

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
      if (stderr.length > MAX_OUTPUT_SIZE) {
        killed = true;
        child.kill("SIGKILL");
        stderr = stderr.slice(0, MAX_OUTPUT_SIZE);
      }
    });

    child.on("close", (code) => {
      clearTimeout(timeoutId);

      if (killed) {
        resolve({
          exitCode: null,
          stdout,
          stderr: stderr || "[Output truncated due to size limit or timeout]",
        });
      } else {
        resolve({ exitCode: code, stdout, stderr });
      }
    });

    child.on("error", (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });
  });
}
