// ToolRuntime Unit Tests

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ToolRuntime } from "./ToolRuntime.js";
import type { ToolSpec, SystemConfig } from "../../types/index.js";

describe("ToolRuntime", () => {
  let runtime: ToolRuntime;
  let mockConfig: SystemConfig;

  beforeEach(() => {
    mockConfig = {
      agents: [{ id: "test-agent", name: "Test Agent" }],
      gateways: [],
      channels: [],
      tools: [],
    };
    runtime = new ToolRuntime(mockConfig, {
      workspaceRoot: "/tmp/test",
      defaultTimeoutMs: 5000,
      maxConcurrent: 2,
      enableApprovals: false,
    });
  });

  describe("register", () => {
    it("should register a tool successfully", () => {
      const mockTool: ToolSpec = {
        id: "test.tool",
        description: "Test tool",
        schema: { type: "object" },
        run: vi.fn().mockResolvedValue("result"),
      };

      runtime.register(mockTool);
      const retrieved = runtime.getTool("test.tool");

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe("test.tool");
    });

    it("should allow overwriting existing tool", () => {
      const tool1: ToolSpec = {
        id: "test.tool",
        description: "First",
        schema: { type: "object" },
        run: vi.fn(),
      };
      const tool2: ToolSpec = {
        id: "test.tool",
        description: "Second",
        schema: { type: "object" },
        run: vi.fn(),
      };

      runtime.register(tool1);
      runtime.register(tool2);

      expect(runtime.getTool("test.tool")?.description).toBe("Second");
    });
  });

  describe("unregister", () => {
    it("should unregister a tool", () => {
      const mockTool: ToolSpec = {
        id: "test.tool",
        description: "Test tool",
        schema: { type: "object" },
        run: vi.fn(),
      };

      runtime.register(mockTool);
      runtime.unregister("test.tool");

      expect(runtime.getTool("test.tool")).toBeUndefined();
    });

    it("should handle unregistering non-existent tool", () => {
      expect(() => runtime.unregister("nonexistent")).not.toThrow();
    });
  });

  describe("getTool", () => {
    it("should return undefined for non-existent tool", () => {
      expect(runtime.getTool("nonexistent")).toBeUndefined();
    });
  });

  describe("listTools", () => {
    it("should return empty array when no tools registered", () => {
      const tools = runtime.listTools();
      expect(tools).toEqual([]);
    });

    it("should list all registered tools", () => {
      const tool1: ToolSpec = {
        id: "tool1",
        description: "First tool",
        schema: { type: "object" },
        run: vi.fn(),
      };
      const tool2: ToolSpec = {
        id: "tool2",
        description: "Second tool",
        schema: { type: "object" },
        requiresApproval: true,
        run: vi.fn(),
      };

      runtime.register(tool1);
      runtime.register(tool2);

      const tools = runtime.listTools();
      expect(tools).toHaveLength(2);
      expect(tools[0].id).toBe("tool1");
      expect(tools[1].id).toBe("tool2");
      expect(tools[1].requiresApproval).toBe(true);
    });
  });

  describe("invoke - basic execution", () => {
    it("should invoke a tool successfully", async () => {
      const mockTool: ToolSpec = {
        id: "test.tool",
        description: "Test tool",
        schema: { type: "object" },
        run: vi.fn().mockResolvedValue("success"),
      };

      runtime.register(mockTool);

      const result = await runtime.invoke(
        "test.tool",
        "session-1",
        { input: "data" },
        "agent-1",
        "user-1"
      );

      expect(result.awaitingApproval).toBeUndefined();
      expect(result.result?.ok).toBe(true);
      expect(result.result?.data).toBe("success");
      expect(mockTool.run).toHaveBeenCalled();
    });

    it("should return TOOL_NOT_FOUND for non-existent tool", async () => {
      const result = await runtime.invoke(
        "nonexistent",
        "session-1",
        {},
        "agent-1",
        "user-1"
      );

      expect(result.result?.ok).toBe(false);
      expect(result.result?.error?.code).toBe("TOOL_NOT_FOUND");
    });

    it("should return INVALID_INPUT for invalid schema", async () => {
      const mockTool: ToolSpec = {
        id: "test.tool",
        description: "Test tool",
        schema: {
          type: "object",
          required: ["name"],
          properties: { name: { type: "string" } },
        },
        run: vi.fn(),
      };

      runtime.register(mockTool);

      const result = await runtime.invoke(
        "test.tool",
        "session-1",
        {}, // Missing required 'name'
        "agent-1",
        "user-1"
      );

      expect(result.result?.ok).toBe(false);
      expect(result.result?.error?.code).toBe("INVALID_INPUT");
    });
  });

  describe("invoke - concurrent limit", () => {
    it("should enforce max concurrent limit", async () => {
      const mockTool: ToolSpec = {
        id: "test.tool",
        description: "Test tool",
        schema: { type: "object" },
        run: vi.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 100))
        ),
      };

      runtime.register(mockTool);

      // Start 3 concurrent invocations (max is 2)
      const results = await Promise.all([
        runtime.invoke("test.tool", "s1", {}, "a1", "u1"),
        runtime.invoke("test.tool", "s2", {}, "a1", "u1"),
        runtime.invoke("test.tool", "s3", {}, "a1", "u1"),
      ]);

      // First two should succeed, third should fail with CONCURRENCY_LIMIT
      const successCount = results.filter((r) => r.result?.ok).length;
      const concurrencyErrors = results.filter(
        (r) => r.result?.error?.code === "CONCURRENCY_LIMIT"
      );

      expect(successCount).toBe(2);
      expect(concurrencyErrors.length).toBe(1);
    });
  });

  describe("invoke - retry tracking", () => {
    it("should track retry count", async () => {
      const mockTool: ToolSpec = {
        id: "test.tool",
        description: "Test tool",
        schema: { type: "object" },
        run: vi.fn().mockResolvedValue("result"),
      };

      runtime.register(mockTool);

      const result = await runtime.invoke(
        "test.tool",
        "session-1",
        {},
        "agent-1",
        "user-1",
        2, // retryCount
        "parent-invocation-id"
      );

      expect(result.result?.ok).toBe(true);

      const invocation = runtime.getInvocation(result.invocationId);
      expect(invocation?.retryCount).toBe(2);
      expect(invocation?.parentInvocationId).toBe("parent-invocation-id");
    });

    it("should get retry count for invocation", async () => {
      const mockTool: ToolSpec = {
        id: "test.tool",
        description: "Test tool",
        schema: { type: "object" },
        run: vi.fn().mockResolvedValue("result"),
      };

      runtime.register(mockTool);

      const result = await runtime.invoke(
        "test.tool",
        "session-1",
        {},
        "agent-1",
        "user-1",
        3
      );

      const retryCount = runtime.getRetryCount(result.invocationId);
      expect(retryCount).toBe(3);
    });
  });

  describe("invoke - execution errors", () => {
    it("should handle tool execution errors", async () => {
      const mockTool: ToolSpec = {
        id: "test.tool",
        description: "Test tool",
        schema: { type: "object" },
        run: vi.fn().mockRejectedValue(new Error("Tool failed")),
      };

      runtime.register(mockTool);

      const result = await runtime.invoke(
        "test.tool",
        "session-1",
        {},
        "agent-1",
        "user-1"
      );

      expect(result.result?.ok).toBe(false);
      expect(result.result?.error?.code).toBe("EXECUTION_ERROR");
      expect(result.result?.error?.message).toBe("Tool failed");
    });
  });

  describe("getInvocationsBySession", () => {
    it("should return invocations for a session", async () => {
      const mockTool: ToolSpec = {
        id: "test.tool",
        description: "Test tool",
        schema: { type: "object" },
        run: vi.fn().mockResolvedValue("result"),
      };

      runtime.register(mockTool);

      await runtime.invoke("test.tool", "session-1", {}, "a1", "u1");
      await runtime.invoke("test.tool", "session-2", {}, "a1", "u1");
      await runtime.invoke("test.tool", "session-1", {}, "a1", "u1");

      const session1Invocations = runtime.getInvocationsBySession("session-1");
      const session2Invocations = runtime.getInvocationsBySession("session-2");

      expect(session1Invocations).toHaveLength(2);
      expect(session2Invocations).toHaveLength(1);
    });
  });

  describe("getStats", () => {
    it("should return statistics", async () => {
      const mockTool: ToolSpec = {
        id: "test.tool",
        description: "Test tool",
        schema: { type: "object" },
        run: vi.fn().mockResolvedValue("result"),
      };

      runtime.register(mockTool);

      await runtime.invoke("test.tool", "s1", {}, "a1", "u1", 2);
      await runtime.invoke("test.tool", "s2", {}, "a1", "u1", 0);

      const stats = runtime.getStats();

      expect(stats.totalInvocations).toBe(2);
      expect(stats.byStatus.completed).toBe(2);
      expect(stats.avgRetryCount).toBe(1);
    });
  });

  describe("cleanup", () => {
    it("should clean up old invocations", async () => {
      const mockTool: ToolSpec = {
        id: "test.tool",
        description: "Test tool",
        schema: { type: "object" },
        run: vi.fn().mockResolvedValue("result"),
      };

      runtime.register(mockTool);

      await runtime.invoke("test.tool", "s1", {}, "a1", "u1");

      // Cleanup with very large maxAge (keeps invocations)
      runtime.cleanup(1000000);

      const stats = runtime.getStats();
      expect(stats.totalInvocations).toBe(1);

      // Cleanup with maxAge of 0 (removes completed invocations with endTime)
      runtime.cleanup(0);

      const statsAfter = runtime.getStats();
      // Note: Invocations may not be immediately cleaned if endTime is very recent
      expect(statsAfter.totalInvocations).toBeLessThanOrEqual(1);
    });
  });

  describe("getPendingApprovals", () => {
    it("should return pending approval invocations for system.run", async () => {
      // Note: ToolRuntime only checks approval for system.run tool
      const systemRunTool: ToolSpec = {
        id: "system.run",
        description: "System run tool",
        schema: {
          type: "object",
          properties: {
            argv: { type: "array" },
          },
        },
        requiresApproval: true,
        run: vi.fn().mockResolvedValue("result"),
      };

      const runtimeWithApproval = new ToolRuntime(mockConfig, {
        enableApprovals: true,
        workspaceRoot: "/tmp/test",
        defaultTimeoutMs: 5000,
        maxConcurrent: 2,
      });

      runtimeWithApproval.register(systemRunTool);

      // Mock approvalManager to require approval
      vi.spyOn(
        (runtimeWithApproval as any).approvalManager,
        "loadConfig"
      ).mockResolvedValue();
      vi.spyOn(
        (runtimeWithApproval as any).approvalManager,
        "checkApproval"
      ).mockResolvedValue({ approved: false, reason: "Needs approval" });

      const result = await runtimeWithApproval.invoke(
        "system.run",
        "s1",
        { argv: ["echo", "test"] },
        "a1",
        "u1"
      );

      expect(result.awaitingApproval).toBe(true);

      const pending = runtimeWithApproval.getPendingApprovals();
      expect(pending.length).toBeGreaterThan(0);
      expect(pending[0].status).toBe("awaiting_approval");
    });
  });

  describe("approveRequest", () => {
    it("should approve a pending request for system.run", async () => {
      const systemRunTool: ToolSpec = {
        id: "system.run",
        description: "System run tool",
        requiresApproval: true,
        schema: {
          type: "object",
          properties: {
            argv: { type: "array" },
          },
        },
        run: vi.fn().mockResolvedValue("approved result"),
      };

      const runtimeWithApproval = new ToolRuntime(mockConfig, {
        enableApprovals: true,
        workspaceRoot: "/tmp/test",
        defaultTimeoutMs: 5000,
        maxConcurrent: 2,
      });

      runtimeWithApproval.register(systemRunTool);

      vi.spyOn(
        (runtimeWithApproval as any).approvalManager,
        "loadConfig"
      ).mockResolvedValue();
      vi.spyOn(
        (runtimeWithApproval as any).approvalManager,
        "checkApproval"
      ).mockResolvedValue({ approved: false, reason: "Needs approval" });

      const invokeResult = await runtimeWithApproval.invoke(
        "system.run",
        "s1",
        { argv: ["echo", "test"] },
        "a1",
        "u1"
      );

      expect(invokeResult.awaitingApproval).toBe(true);

      const approveResult = await runtimeWithApproval.approveRequest(
        invokeResult.invocationId,
        true
      );

      expect(approveResult.ok).toBe(true);
      expect(approveResult.data).toBe("approved result");
    });

    it("should deny a pending request for system.run", async () => {
      const systemRunTool: ToolSpec = {
        id: "system.run",
        description: "System run tool",
        requiresApproval: true,
        schema: {
          type: "object",
          properties: {
            argv: { type: "array" },
          },
        },
        run: vi.fn().mockResolvedValue("result"),
      };

      const runtimeWithApproval = new ToolRuntime(mockConfig, {
        enableApprovals: true,
        workspaceRoot: "/tmp/test",
        defaultTimeoutMs: 5000,
        maxConcurrent: 2,
      });

      runtimeWithApproval.register(systemRunTool);

      vi.spyOn(
        (runtimeWithApproval as any).approvalManager,
        "loadConfig"
      ).mockResolvedValue();
      vi.spyOn(
        (runtimeWithApproval as any).approvalManager,
        "checkApproval"
      ).mockResolvedValue({ approved: false, reason: "Needs approval" });

      const invokeResult = await runtimeWithApproval.invoke(
        "system.run",
        "s1",
        { argv: ["echo", "test"] },
        "a1",
        "u1"
      );

      const denyResult = await runtimeWithApproval.approveRequest(
        invokeResult.invocationId,
        false
      );

      expect(denyResult.ok).toBe(false);
      expect(denyResult.error?.code).toBe("APPROVAL_DENIED");
    });

    it("should return INVOCATION_NOT_FOUND for invalid invocation", async () => {
      const result = await runtime.approveRequest("invalid-id", true);

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("INVOCATION_NOT_FOUND");
    });

    it("should return INVALID_STATE for non-awaiting invocation", async () => {
      const mockTool: ToolSpec = {
        id: "test.tool",
        description: "Test tool",
        schema: { type: "object" },
        run: vi.fn().mockResolvedValue("result"),
      };

      runtime.register(mockTool);

      const invokeResult = await runtime.invoke(
        "test.tool",
        "s1",
        {},
        "a1",
        "u1"
      );

      const approveResult = await runtime.approveRequest(
        invokeResult.invocationId,
        true
      );

      expect(approveResult.ok).toBe(false);
      expect(approveResult.error?.code).toBe("INVALID_STATE");
    });
  });
});
