/**
 * ProcessTool Unit Tests
 *
 * Tests for process operations (exec, write, poll, log, kill, list).
 * Covers session management, approval checks, and sanitization.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createProcessExecTool,
  createProcessWriteTool,
  createProcessPollTool,
  createProcessLogTool,
  createProcessKillTool,
  createProcessListTool,
} from "./ProcessTool.js";
import { ProcessSessionManager } from "./ProcessSessionManager.js";
import { ApprovalManager } from "../runtime/ApprovalManager.js";
import { CommandSanitizer } from "../desktop/CommandSanitizer.js";
import type { ToolContext } from "../../types/index.js";

describe("ProcessTool", () => {
  let mockContext: ToolContext;
  let sessionManager: ProcessSessionManager;
  let approvalManager: ApprovalManager;

  beforeEach(() => {
    vi.resetAllMocks();
    mockContext = {
      workspaceRoot: "/workspace",
      policy: {
        maxBytes: 1024 * 1024,
        timeoutMs: 5000,
      },
      userId: "test-user",
      sessionId: "test-session",
    };

    // Create real instances but mock their methods
    sessionManager = new ProcessSessionManager();
    approvalManager = new ApprovalManager();

    // Mock approvalManager.loadConfig and checkApproval
    vi.spyOn(approvalManager, "loadConfig").mockResolvedValue();
    vi.spyOn(approvalManager, "checkApproval").mockResolvedValue({
      approved: true,
    });

    // Mock CommandSanitizer to allow common commands
    vi.spyOn(CommandSanitizer.prototype, "sanitize").mockReturnValue({
      safe: true,
    });
  });

  describe("createProcessExecTool", () => {
    let execTool: ReturnType<typeof createProcessExecTool>;

    beforeEach(() => {
      execTool = createProcessExecTool(sessionManager, approvalManager);
    });

    it("T1: should execute approved command successfully", async () => {
      // Mock spawnProcess to return a mock handle
      const mockHandle = {
        pid: 12345,
        onData: vi.fn(),
        onExit: vi.fn(),
        write: vi.fn(() => true),
        kill: vi.fn(() => true),
      };

      vi.doMock("../process/PtyWrapper.js", () => ({
        spawnProcess: vi.fn().mockResolvedValue(mockHandle),
      }));

      const result = await execTool.run(
        { argv: ["echo", "hello"] },
        mockContext
      );

      expect(result.ok).toBe(true);
      expect(result.data?.sessionId).toBeDefined();
      expect(result.data?.pid).toBeDefined();
      expect(result.data?.status).toBe("running");
    });

    it("T2: should handle string argv", async () => {
      const mockHandle = {
        pid: 12345,
        onData: vi.fn(),
        onExit: vi.fn(),
        write: vi.fn(() => true),
        kill: vi.fn(() => true),
      };

      vi.doMock("../process/PtyWrapper.js", () => ({
        spawnProcess: vi.fn().mockResolvedValue(mockHandle),
      }));

      const result = await execTool.run(
        { argv: "echo test" },
        mockContext
      );

      expect(result.ok).toBe(true);
      expect(result.data?.sessionId).toBeDefined();
    });

    it("T3: should reject unapproved commands", async () => {
      vi.spyOn(approvalManager, "checkApproval").mockResolvedValue({
        approved: false,
        reason: "Command not in allowlist",
      });

      const result = await execTool.run(
        { argv: ["rm", "-rf", "/"] },
        mockContext
      );

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("APPROVAL_DENIED");
    });

    it("T4: should use custom cwd when provided", async () => {
      const mockHandle = {
        pid: 12345,
        onData: vi.fn(),
        onExit: vi.fn(),
        write: vi.fn(() => true),
        kill: vi.fn(() => true),
      };

      vi.doMock("../process/PtyWrapper.js", () => ({
        spawnProcess: vi.fn().mockResolvedValue(mockHandle),
      }));

      const result = await execTool.run(
        { argv: ["git", "status"], cwd: "/workspace/subdir" },
        mockContext
      );

      expect(result.ok).toBe(true);
    });

    it("T5: should support PTY sessions", async () => {
      const mockHandle = {
        pid: 12345,
        onData: vi.fn(),
        onExit: vi.fn(),
        write: vi.fn(() => true),
        kill: vi.fn(() => true),
      };

      vi.doMock("../process/PtyWrapper.js", () => ({
        spawnProcess: vi.fn().mockResolvedValue(mockHandle),
      }));

      const result = await execTool.run(
        { argv: ["node", "script.js"], pty: true },
        mockContext
      );

      expect(result.ok).toBe(true);
    });

    it("T6: should support custom environment variables", async () => {
      const mockHandle = {
        pid: 12345,
        onData: vi.fn(),
        onExit: vi.fn(),
        write: vi.fn(() => true),
        kill: vi.fn(() => true),
      };

      vi.doMock("../process/PtyWrapper.js", () => ({
        spawnProcess: vi.fn().mockResolvedValue(mockHandle),
      }));

      const result = await execTool.run(
        {
          argv: ["node", "script.js"],
          env: { NODE_ENV: "test", CUSTOM_VAR: "value" },
        },
        mockContext
      );

      expect(result.ok).toBe(true);
    });

    it("T7: should handle execution errors", async () => {
      vi.spyOn(sessionManager, "createSession").mockRejectedValue(
        new Error("Command not found")
      );

      const result = await execTool.run(
        { argv: ["nonexistent", "command"] },
        mockContext
      );

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("EXECUTION_ERROR");
    });

    it("T8: should reject failed sanitization", async () => {
      vi.spyOn(CommandSanitizer.prototype, "sanitize").mockReturnValue({
        safe: false,
        reason: "Dangerous command detected",
      });

      const result = await execTool.run(
        { argv: ["rm", "-rf", "/"] },
        mockContext
      );

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("SANITIZATION_FAILED");
    });
  });

  describe("createProcessWriteTool", () => {
    let writeTool: ReturnType<typeof createProcessWriteTool>;

    beforeEach(() => {
      writeTool = createProcessWriteTool(sessionManager);
    });

    it("T9: should write to existing session successfully", async () => {
      // Create a mock session
      const mockSession = {
        id: "session-123",
        userId: "test-user",
        command: ["node"],
        cwd: "/workspace",
        pty: false,
        status: "running" as const,
        exitCode: null,
        pid: 12345,
        outputBuffer: [],
        fullLog: [],
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        handle: null,
      };

      vi.spyOn(sessionManager, "getSession").mockReturnValue(mockSession as any);
      vi.spyOn(sessionManager, "writeToSession").mockReturnValue({
        success: true,
        bytesWritten: 10,
      });

      const result = await writeTool.run(
        { sessionId: "session-123", input: "console.log('hello')" },
        mockContext
      );

      expect(result.ok).toBe(true);
      expect(result.data?.success).toBe(true);
      expect(result.data?.bytesWritten).toBeGreaterThan(0);
    });

    it("T10: should reject writing to non-existent session", async () => {
      vi.spyOn(sessionManager, "getSession").mockReturnValue(undefined);

      const result = await writeTool.run(
        { sessionId: "non-existent", input: "test" },
        mockContext
      );

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("SESSION_NOT_FOUND");
    });

    it("T11: should reject writing to sessions owned by other users", async () => {
      const otherUserSession = {
        id: "session-456",
        userId: "other-user",
        command: ["node"],
        cwd: "/workspace",
        pty: false,
        status: "running" as const,
        exitCode: null,
        pid: 12345,
        outputBuffer: [],
        fullLog: [],
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        handle: null,
      };

      vi.spyOn(sessionManager, "getSession").mockReturnValue(otherUserSession as any);

      const result = await writeTool.run(
        { sessionId: "session-456", input: "test" },
        { ...mockContext, userId: "different-user" }
      );

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("ACCESS_DENIED");
    });

    it("T12: should handle write errors", async () => {
      const mockSession = {
        id: "session-789",
        userId: "test-user",
        command: ["node"],
        cwd: "/workspace",
        pty: false,
        status: "exited" as const,
        exitCode: 0,
        pid: 12345,
        outputBuffer: [],
        fullLog: [],
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        handle: null,
      };

      vi.spyOn(sessionManager, "getSession").mockReturnValue(mockSession as any);
      vi.spyOn(sessionManager, "writeToSession").mockReturnValue({
        success: false,
        bytesWritten: 0,
      });

      const result = await writeTool.run(
        { sessionId: "session-789", input: "test" },
        mockContext
      );

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("WRITE_FAILED");
    });
  });

  describe("createProcessPollTool", () => {
    let pollTool: ReturnType<typeof createProcessPollTool>;

    beforeEach(() => {
      pollTool = createProcessPollTool(sessionManager);
    });

    it("T13: should poll output from existing session", async () => {
      const mockSession = {
        id: "session-123",
        userId: "test-user",
        command: ["node"],
        cwd: "/workspace",
        pty: false,
        status: "running" as const,
        exitCode: null,
        pid: 12345,
        outputBuffer: [],
        fullLog: [],
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        handle: null,
      };

      vi.spyOn(sessionManager, "getSession").mockReturnValue(mockSession as any);
      vi.spyOn(sessionManager, "pollOutput").mockReturnValue({
        lines: ["output line 1", "output line 2"],
        hasMore: false,
        status: "running" as const,
        exitCode: null,
      });

      const result = await pollTool.run(
        { sessionId: "session-123", maxLines: 100 },
        mockContext
      );

      expect(result.ok).toBe(true);
      expect(result.data?.lines).toEqual(["output line 1", "output line 2"]);
      expect(result.data?.hasMore).toBe(false);
      expect(result.data?.status).toBe("running");
    });

    it("T14: should use default maxLines when not provided", async () => {
      const mockSession = {
        id: "session-123",
        userId: "test-user",
        status: "running" as const,
        exitCode: null,
        command: [],
        cwd: "",
        pty: false,
        pid: 12345,
        outputBuffer: [],
        fullLog: [],
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        handle: null,
      };

      vi.spyOn(sessionManager, "getSession").mockReturnValue(mockSession as any);
      vi.spyOn(sessionManager, "pollOutput").mockReturnValue({
        lines: [],
        hasMore: false,
        status: "running" as const,
        exitCode: null,
      });

      const result = await pollTool.run(
        { sessionId: "session-123" },
        mockContext
      );

      expect(result.ok).toBe(true);
    });

    it("T14a: should reject polling non-existent session", async () => {
      vi.spyOn(sessionManager, "getSession").mockReturnValue(undefined);

      const result = await pollTool.run(
        { sessionId: "non-existent", maxLines: 100 },
        mockContext
      );

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("SESSION_NOT_FOUND");
    });

    it("T15a: should reject polling sessions owned by other users", async () => {
      const otherUserSession = {
        id: "session-456",
        userId: "other-user",
        status: "running" as const,
        exitCode: null,
        command: [],
        cwd: "",
        pty: false,
        pid: 12345,
        outputBuffer: [],
        fullLog: [],
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        handle: null,
      };

      vi.spyOn(sessionManager, "getSession").mockReturnValue(otherUserSession as any);

      const result = await pollTool.run(
        { sessionId: "session-456" },
        { ...mockContext, userId: "different-user" }
      );

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("ACCESS_DENIED");
    });

    it("T16a: should handle poll errors", async () => {
      const mockSession = {
        id: "session-789",
        userId: "test-user",
        status: "running" as const,
        exitCode: null,
        command: [],
        cwd: "",
        pty: false,
        pid: 12345,
        outputBuffer: [],
        fullLog: [],
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        handle: null,
      };

      vi.spyOn(sessionManager, "getSession").mockReturnValue(mockSession as any);
      vi.spyOn(sessionManager, "pollOutput").mockReturnValue(null);

      const result = await pollTool.run(
        { sessionId: "session-789" },
        mockContext
      );

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("POLL_FAILED");
    });
  });

  describe("createProcessLogTool", () => {
    let logTool: ReturnType<typeof createProcessLogTool>;

    beforeEach(() => {
      logTool = createProcessLogTool(sessionManager);
    });

    it("T17: should get full log from existing session", async () => {
      const mockSession = {
        id: "session-123",
        userId: "test-user",
        status: "running" as const,
        exitCode: null,
        command: [],
        cwd: "",
        pty: false,
        pid: 12345,
        outputBuffer: [],
        fullLog: [],
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        handle: null,
      };

      vi.spyOn(sessionManager, "getSession").mockReturnValue(mockSession as any);
      vi.spyOn(sessionManager, "getFullLog").mockReturnValue({
        log: "full log output",
        totalLines: 10,
        status: "running" as const,
        exitCode: null,
      });

      const result = await logTool.run(
        { sessionId: "session-123" },
        mockContext
      );

      expect(result.ok).toBe(true);
      expect(result.data?.log).toBe("full log output");
      expect(result.data?.totalLines).toBe(10);
      expect(result.data?.status).toBe("running");
    });

    it("T18: should reject getting log from non-existent session", async () => {
      vi.spyOn(sessionManager, "getSession").mockReturnValue(undefined);

      const result = await logTool.run(
        { sessionId: "non-existent" },
        mockContext
      );

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("SESSION_NOT_FOUND");
    });

    it("T19: should reject getting log from sessions owned by other users", async () => {
      const otherUserSession = {
        id: "session-456",
        userId: "other-user",
        status: "running" as const,
        exitCode: null,
        command: [],
        cwd: "",
        pty: false,
        pid: 12345,
        outputBuffer: [],
        fullLog: [],
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        handle: null,
      };

      vi.spyOn(sessionManager, "getSession").mockReturnValue(otherUserSession as any);

      const result = await logTool.run(
        { sessionId: "session-456" },
        { ...mockContext, userId: "different-user" }
      );

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("ACCESS_DENIED");
    });

    it("T20: should handle log retrieval errors", async () => {
      const mockSession = {
        id: "session-789",
        userId: "test-user",
        status: "running" as const,
        exitCode: null,
        command: [],
        cwd: "",
        pty: false,
        pid: 12345,
        outputBuffer: [],
        fullLog: [],
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        handle: null,
      };

      vi.spyOn(sessionManager, "getSession").mockReturnValue(mockSession as any);
      vi.spyOn(sessionManager, "getFullLog").mockReturnValue(null);

      const result = await logTool.run(
        { sessionId: "session-789" },
        mockContext
      );

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("LOG_FAILED");
    });
  });

  describe("createProcessKillTool", () => {
    let killTool: ReturnType<typeof createProcessKillTool>;

    beforeEach(() => {
      killTool = createProcessKillTool(sessionManager);
    });

    it("T22: should kill existing session successfully", async () => {
      const mockSession = {
        id: "session-123",
        userId: "test-user",
        status: "running" as const,
        exitCode: null,
        command: [],
        cwd: "",
        pty: false,
        pid: 12345,
        outputBuffer: [],
        fullLog: [],
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        handle: {
          kill: vi.fn(() => true),
        },
      };

      vi.spyOn(sessionManager, "getSession").mockReturnValue(mockSession as any);
      vi.spyOn(sessionManager, "killSession").mockResolvedValue({
        success: true,
        message: "Killed with SIGTERM",
      });

      const result = await killTool.run(
        { sessionId: "session-123" },
        mockContext
      );

      expect(result.ok).toBe(true);
      expect(result.data?.success).toBe(true);
    });

    it("T23a: should support custom signal", async () => {
      const mockSession = {
        id: "session-123",
        userId: "test-user",
        status: "running" as const,
        exitCode: null,
        command: [],
        cwd: "",
        pty: false,
        pid: 12345,
        outputBuffer: [],
        fullLog: [],
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        handle: null,
      };

      vi.spyOn(sessionManager, "getSession").mockReturnValue(mockSession as any);
      vi.spyOn(sessionManager, "killSession").mockResolvedValue({
        success: true,
        message: "Killed with SIGKILL",
      });

      const result = await killTool.run(
        { sessionId: "session-123", signal: "SIGKILL" },
        mockContext
      );

      expect(result.ok).toBe(true);
      expect(result.data?.message).toContain("SIGKILL");
    });

    it("T24: should reject killing non-existent session", async () => {
      vi.spyOn(sessionManager, "getSession").mockReturnValue(undefined);

      const result = await killTool.run(
        { sessionId: "non-existent" },
        mockContext
      );

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("SESSION_NOT_FOUND");
    });

    it("T25: should reject killing sessions owned by other users", async () => {
      const otherUserSession = {
        id: "session-456",
        userId: "other-user",
        status: "running" as const,
        exitCode: null,
        command: [],
        cwd: "",
        pty: false,
        pid: 12345,
        outputBuffer: [],
        fullLog: [],
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        handle: null,
      };

      vi.spyOn(sessionManager, "getSession").mockReturnValue(otherUserSession as any);

      const result = await killTool.run(
        { sessionId: "session-456" },
        { ...mockContext, userId: "different-user" }
      );

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("ACCESS_DENIED");
    });

    it("T26: should handle kill errors", async () => {
      const mockSession = {
        id: "session-789",
        userId: "test-user",
        status: "running" as const,
        exitCode: null,
        command: [],
        cwd: "",
        pty: false,
        pid: 12345,
        outputBuffer: [],
        fullLog: [],
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        handle: null,
      };

      vi.spyOn(sessionManager, "getSession").mockReturnValue(mockSession as any);
      vi.spyOn(sessionManager, "killSession").mockResolvedValue({
        success: false,
        message: "Process already exited",
      });

      const result = await killTool.run(
        { sessionId: "session-789" },
        mockContext
      );

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("KILL_FAILED");
    });
  });

  describe("createProcessListTool", () => {
    let listTool: ReturnType<typeof createProcessListTool>;

    beforeEach(() => {
      listTool = createProcessListTool(sessionManager);
    });

    it("T27: should list sessions for current user", async () => {
      const mockSessions = [
        {
          id: "session-1",
          command: ["git", "status"],
          status: "running" as const,
          pid: 12345,
          createdAt: Date.now(),
          lastActivityAt: Date.now(),
          pty: false,
        },
        {
          id: "session-2",
          command: ["npm", "test"],
          status: "running" as const,
          pid: 12346,
          createdAt: Date.now(),
          lastActivityAt: Date.now(),
          pty: false,
        },
      ];

      vi.spyOn(sessionManager, "listActiveSessions").mockReturnValue(mockSessions as any);

      const result = await listTool.run(
        {},
        { ...mockContext, userId: "user-1" }
      );

      expect(result.ok).toBe(true);
      expect(result.data?.sessions).toHaveLength(2);
      expect(result.data?.count).toBe(2);
    });

    it("T28: should list all sessions when no user filter", async () => {
      const mockSessions = [
        {
          id: "session-1",
          command: ["git", "status"],
          status: "running" as const,
          pid: 12345,
          createdAt: Date.now(),
          lastActivityAt: Date.now(),
          pty: false,
        },
      ];

      vi.spyOn(sessionManager, "listActiveSessions").mockReturnValue(mockSessions as any);

      const result = await listTool.run({}, mockContext);

      expect(result.ok).toBe(true);
      expect(result.data?.sessions.length).toBeGreaterThan(0);
    });

    it("T29: should respect userId parameter", async () => {
      const mockSessions = [
        {
          id: "session-2",
          command: ["npm", "test"],
          status: "running" as const,
          pid: 12346,
          createdAt: Date.now(),
          lastActivityAt: Date.now(),
          pty: false,
        },
      ];

      vi.spyOn(sessionManager, "listActiveSessions").mockReturnValue(mockSessions as any);

      const result = await listTool.run({ userId: "user-2" }, mockContext);

      expect(result.ok).toBe(true);
      expect(result.data?.sessions).toHaveLength(1);
      expect(result.data?.sessions[0].command[0]).toBe("npm");
    });

    it("T30: should return session info with required fields", async () => {
      const mockSessions = [
        {
          id: "session-1",
          command: ["git", "status"],
          status: "running" as const,
          pid: 12345,
          createdAt: Date.now(),
          lastActivityAt: Date.now(),
          pty: false,
        },
      ];

      vi.spyOn(sessionManager, "listActiveSessions").mockReturnValue(mockSessions as any);

      const result = await listTool.run({}, mockContext);

      expect(result.ok).toBe(true);
      const session = result.data?.sessions[0];
      expect(session).toMatchObject({
        id: expect.any(String),
        command: ["git", "status"],
        status: "running",
        pid: expect.any(Number),
        createdAt: expect.any(Number),
        lastActivityAt: expect.any(Number),
        pty: false,
      });
    });

    it("T31: should handle empty session list", async () => {
      vi.spyOn(sessionManager, "listActiveSessions").mockReturnValue([]);

      const result = await listTool.run({}, mockContext);

      expect(result.ok).toBe(true);
      expect(result.data?.sessions).toEqual([]);
      expect(result.data?.count).toBe(0);
    });
  });
});
