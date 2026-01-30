// NodeExecutor Integration Tests
// Tests real node communication with mocked Gateway RPC

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NodeExecutor, type NodeRpcSender } from "./NodeExecutor.js";
import { NodeSessionManager } from "./NodeSessionManager.js";

describe("NodeExecutor Integration Tests", () => {
  let sessionManager: NodeSessionManager;
  let executor: NodeExecutor;
  let mockRpcSender: NodeRpcSender;

  const testUserId = "test-user-123";
  const testNodeId = "node-test-456";
  const testSocketId = "socket-test-789";

  beforeEach(() => {
    // Create session manager
    sessionManager = new NodeSessionManager({
      pairingCodeTtlMs: 5 * 60 * 1000,
      sessionTimeoutMs: 60 * 60 * 1000,
      maxNodesPerUser: 5,
    });

    // Create executor with custom retry config for faster tests
    executor = new NodeExecutor(sessionManager, {
      defaultTimeoutMs: 5000,
      retry: {
        maxRetries: 1, // Reduce retries for faster tests
        initialDelayMs: 100,
        maxDelayMs: 500,
        backoffMultiplier: 2,
      },
    });

    // Mock RPC sender
    mockRpcSender = vi.fn();
    executor.setRpcSender(mockRpcSender);
  });

  afterEach(() => {
    executor.cleanup();
  });

  describe("Pairing Flow", () => {
    it("should complete pairing flow", () => {
      // Generate pairing code
      const code = sessionManager.generatePairingCode(testUserId);
      expect(code).toHaveLength(8);
      expect(code).toMatch(/^[A-Z0-9]+$/);

      // Complete pairing (simulating Node Companion)
      const connection = sessionManager.completePairing(code, testSocketId, {
        nodeName: "TestNode",
        platform: "windows",
        capabilities: {
          screenCapture: true,
          commandExec: true,
        },
      });

      expect(connection.nodeId).toBeTruthy();
      expect(connection.userId).toBe(testUserId);

      // Verify node is paired
      const node = sessionManager.getNode(connection.nodeId);
      expect(node?.status).toBe("paired");
      expect(node?.nodeName).toBe("TestNode");
      expect(node?.capabilities.screenCapture).toBe(true);
    });
  });

  describe("Screen Capture Integration", () => {
    beforeEach(() => {
      // Set up paired node with screen capture capability
      const code = sessionManager.generatePairingCode(testUserId);
      const connection = sessionManager.completePairing(code, testSocketId, {
        nodeName: "CaptureNode",
        platform: "darwin",
        capabilities: {
          screenCapture: true,
          commandExec: true,
        },
      });

      // Grant consent
      sessionManager.grantScreenCaptureConsent(connection.nodeId);
    });

    it("should successfully capture screen with mocked RPC", async () => {
      // Mock successful RPC response
      const mockImageData = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      mockRpcSender.mockResolvedValue({
        imageData: mockImageData,
      });

      // Request screen capture
      const result = await executor.requestScreenCapture(testUserId);

      expect(result.success).toBe(true);
      expect(result.imageData).toBe(mockImageData);
      expect(result.format).toBe("png");
      expect(result.status).toBe("completed");

      // Verify RPC was called correctly
      expect(mockRpcSender).toHaveBeenCalledTimes(1);
      const callArgs = mockRpcSender.mock.calls[0];
      expect(callArgs[1]).toBe("nodes.capture");
      expect(callArgs[3]).toEqual({ timeoutMs: 5000 });
    });

    it("should handle RPC timeout and retry", async () => {
      // Mock timeout error first, then success
      mockRpcSender
        .mockRejectedValueOnce(new Error("NODE_TIMEOUT: No response after 5000ms"))
        .mockResolvedValueOnce({
          imageData: "mock-image-data",
        });

      // Request screen capture - should retry and succeed
      const result = await executor.requestScreenCapture(testUserId);

      expect(result.success).toBe(true);
      expect(mockRpcSender).toHaveBeenCalledTimes(2); // Initial call + 1 retry
    });

    it("should fail after max retries on persistent errors", async () => {
      // Mock persistent timeout error
      mockRpcSender.mockRejectedValue(new Error("NODE_TIMEOUT: No response"));

      // Request screen capture - should fail after retries
      await expect(executor.requestScreenCapture(testUserId)).rejects.toThrow("NODE_TIMEOUT");

      // Should have attempted initial + 1 retry = 2 calls
      expect(mockRpcSender).toHaveBeenCalledTimes(2);
    });

    it("should not retry non-retryable errors", async () => {
      // Mock permission error (non-retryable)
      mockRpcSender.mockRejectedValue(new Error("PERMISSION_DENIED: Access denied"));

      // Request screen capture - should fail immediately
      await expect(executor.requestScreenCapture(testUserId)).rejects.toThrow("PERMISSION_DENIED");

      // Should only attempt once (no retries)
      expect(mockRpcSender).toHaveBeenCalledTimes(1);
    });

    it("should return error from RPC response", async () => {
      // Mock RPC error response
      mockRpcSender.mockResolvedValue({
        error: "CAPTURE_FAILED: Screen capture API error",
      });

      // Request screen capture - should fail
      await expect(executor.requestScreenCapture(testUserId)).rejects.toThrow("CAPTURE_FAILED");
    });
  });

  describe("Command Execution Integration", () => {
    beforeEach(() => {
      // Set up paired node with command execution capability
      const code = sessionManager.generatePairingCode(testUserId);
      sessionManager.completePairing(code, testSocketId, {
        nodeName: "ExecNode",
        platform: "linux",
        capabilities: {
          screenCapture: false,
          commandExec: true,
        },
      });
    });

    it("should successfully execute command with mocked RPC", async () => {
      // Mock successful RPC response
      mockRpcSender.mockResolvedValue({
        exitCode: 0,
        stdout: "Hello, World!",
        stderr: "",
      });

      // Execute command
      const result = await executor.executeCommand(testUserId, ["echo", "Hello, World!"]);

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("Hello, World!");
      expect(result.status).toBe("completed");

      // Verify RPC was called correctly
      expect(mockRpcSender).toHaveBeenCalledTimes(1);
      const callArgs = mockRpcSender.mock.calls[0];
      expect(callArgs[1]).toBe("nodes.exec");
      expect(callArgs[2]).toEqual({
        argv: ["echo", "Hello, World!"],
        cwd: undefined,
        env: undefined,
        timeoutMs: 5000,
      });
    });

    it("should execute command with custom options", async () => {
      mockRpcSender.mockResolvedValue({
        exitCode: 0,
        stdout: "done",
        stderr: "",
      });

      // Execute with options
      const result = await executor.executeCommand(testUserId, "ls", {
        cwd: "/tmp",
        env: { TEST: "value" },
        timeoutMs: 10000,
      });

      expect(result.success).toBe(true);

      // Verify options were passed
      const callArgs = mockRpcSender.mock.calls[0];
      expect(callArgs[2]).toEqual({
        argv: "ls",
        cwd: "/tmp",
        env: { TEST: "value" },
        timeoutMs: 10000,
      });
    });

    it("should handle non-zero exit code", async () => {
      mockRpcSender.mockResolvedValue({
        exitCode: 1,
        stdout: "",
        stderr: "Command failed",
      });

      const result = await executor.executeCommand(testUserId, ["false"]);

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe("Command failed");
      expect(result.status).toBe("failed");
    });
  });

  describe("Node Selection", () => {
    it("should use specific node when nodeId is provided", async () => {
      // Create multiple nodes
      const code1 = sessionManager.generatePairingCode(testUserId);
      const node1 = sessionManager.completePairing(code1, "socket-1", {
        nodeName: "Node1",
        platform: "windows",
        capabilities: { screenCapture: true, commandExec: true },
      });
      sessionManager.grantScreenCaptureConsent(node1.nodeId);

      const code2 = sessionManager.generatePairingCode(testUserId);
      const node2 = sessionManager.completePairing(code2, "socket-2", {
        nodeName: "Node2",
        platform: "windows",
        capabilities: { screenCapture: true, commandExec: true },
      });
      sessionManager.grantScreenCaptureConsent(node2.nodeId);

      // Mock RPC
      mockRpcSender.mockResolvedValue({ imageData: "data" });

      // Request from specific node
      const result = await executor.requestScreenCapture(testUserId, node2.nodeId);

      expect(result.nodeId).toBe(node2.nodeId);
      expect(result.nodeName).toBe("Node2");

      // Verify RPC was called for the specific node
      const callArgs = mockRpcSender.mock.calls[0];
      expect(callArgs[0]).toBe(node2.nodeId);
    });

    it("should auto-select screen capture capable node", async () => {
      // Create one node with screen capture, one without
      const code1 = sessionManager.generatePairingCode(testUserId);
      const node1 = sessionManager.completePairing(code1, "socket-1", {
        nodeName: "CaptureNode",
        platform: "darwin",
        capabilities: { screenCapture: true, commandExec: true },
      });
      sessionManager.grantScreenCaptureConsent(node1.nodeId);

      const code2 = sessionManager.generatePairingCode(testUserId);
      sessionManager.completePairing(code2, "socket-2", {
        nodeName: "ExecNode",
        platform: "linux",
        capabilities: { screenCapture: false, commandExec: true },
      });

      // Mock RPC
      mockRpcSender.mockResolvedValue({ imageData: "data" });

      // Request without specifying node - should auto-select
      const result = await executor.requestScreenCapture(testUserId);

      expect(result.nodeId).toBe(node1.nodeId);
      expect(result.nodeName).toBe("CaptureNode");
    });
  });

  describe("Consent Management", () => {
    it("should check consent status correctly", () => {
      // Create node without consent
      const code = sessionManager.generatePairingCode(testUserId);
      const node = sessionManager.completePairing(code, testSocketId, {
        nodeName: "TestNode",
        platform: "windows",
        capabilities: { screenCapture: true, commandExec: true },
      });

      // No consent initially
      expect(executor.hasScreenCaptureConsent(testUserId, node.nodeId)).toBe(false);

      // Grant consent
      executor.grantScreenCaptureConsent(testUserId, node.nodeId);

      // Now has consent
      expect(executor.hasScreenCaptureConsent(testUserId, node.nodeId)).toBe(true);
    });

    it("should fail capture without consent", async () => {
      // Create node without granting consent
      const code = sessionManager.generatePairingCode(testUserId);
      sessionManager.completePairing(code, testSocketId, {
        nodeName: "TestNode",
        platform: "windows",
        capabilities: { screenCapture: true, commandExec: true },
      });

      // Try to capture without consent
      await expect(executor.requestScreenCapture(testUserId)).rejects.toThrow("CONSENT_REQUIRED");
    });
  });

  describe("Error Handling", () => {
    it("should throw when no paired node available", async () => {
      // No nodes paired
      await expect(executor.requestScreenCapture(testUserId)).rejects.toThrow("NODE_NOT_FOUND");
    });

    it("should throw when node lacks capability", async () => {
      // Create node without screen capture capability
      const code = sessionManager.generatePairingCode(testUserId);
      const node = sessionManager.completePairing(code, testSocketId, {
        nodeName: "ExecOnlyNode",
        platform: "linux",
        capabilities: { screenCapture: false, commandExec: true },
      });

      await expect(executor.requestScreenCapture(testUserId, node.nodeId))
        .rejects.toThrow("NODE_CAPABILITY_REQUIRED");
    });

    it("should throw when node is offline", async () => {
      // Create node
      const code = sessionManager.generatePairingCode(testUserId);
      const node = sessionManager.completePairing(code, testSocketId, {
        nodeName: "OfflineNode",
        platform: "windows",
        capabilities: { screenCapture: true, commandExec: true },
      });
      sessionManager.grantScreenCaptureConsent(node.nodeId);

      // Mark node as offline
      sessionManager.markOffline(testSocketId);

      // Try to capture
      await expect(executor.requestScreenCapture(testUserId, node.nodeId))
        .rejects.toThrow("NODE_NOT_AVAILABLE");
    });

    it("should throw when RPC sender not configured", async () => {
      // Create executor without RPC sender
      const noRpcExecutor = new NodeExecutor(sessionManager);

      // Set up node
      const code = sessionManager.generatePairingCode(testUserId);
      const node = sessionManager.completePairing(code, testSocketId, {
        nodeName: "TestNode",
        platform: "windows",
        capabilities: { screenCapture: true, commandExec: true },
      });
      sessionManager.grantScreenCaptureConsent(node.nodeId);

      // Try to capture without RPC sender
      await expect(noRpcExecutor.requestScreenCapture(testUserId, node.nodeId))
        .rejects.toThrow("RPC_NOT_AVAILABLE");

      noRpcExecutor.cleanup();
    });
  });

  // Note: Cleanup tests removed because pendingCaptures/pendingExecutions maps
  // are not used in current implementation. They exist for future callback-based patterns.
});
