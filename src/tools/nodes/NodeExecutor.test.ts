// NodeExecutor Unit Tests
// Tests individual functions and edge cases without external dependencies

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NodeExecutor } from "./NodeExecutor.js";
import { NodeSessionManager } from "./NodeSessionManager.js";

describe("NodeExecutor Unit Tests", () => {
  let sessionManager: NodeSessionManager;
  let executor: NodeExecutor;

  const testUserId = "test-user-123";
  const testSocketId = "socket-test-789";

  beforeEach(() => {
    sessionManager = new NodeSessionManager({
      pairingCodeTtlMs: 5 * 60 * 1000,
      sessionTimeoutMs: 60 * 60 * 1000,
      maxNodesPerUser: 5,
    });

    executor = new NodeExecutor(sessionManager, {
      defaultTimeoutMs: 5000,
      retry: {
        maxRetries: 2,
        initialDelayMs: 100,
        maxDelayMs: 500,
        backoffMultiplier: 2,
      },
    });
  });

  describe("Constructor and Configuration", () => {
    it("should use default config when none provided", () => {
      const defaultExecutor = new NodeExecutor(sessionManager);
      expect(defaultExecutor).toBeDefined();
      defaultExecutor.cleanup();
    });

    it("should merge custom config with defaults", () => {
      const customExecutor = new NodeExecutor(sessionManager, {
        defaultTimeoutMs: 10000,
      });
      expect(customExecutor).toBeDefined();
      customExecutor.cleanup();
    });

    it("should accept custom retry config", () => {
      const customExecutor = new NodeExecutor(sessionManager, {
        retry: {
          maxRetries: 5,
          initialDelayMs: 500,
          maxDelayMs: 30000,
          backoffMultiplier: 3,
        },
      });
      expect(customExecutor).toBeDefined();
      customExecutor.cleanup();
    });
  });

  describe("RPC Sender Setup", () => {
    it("should allow setting RPC sender", () => {
      const mockSender = vi.fn();
      executor.setRpcSender(mockSender);
      // Should not throw
      expect(executor).toBeDefined();
    });

    it("should update RPC sender when set multiple times", () => {
      const mockSender1 = vi.fn();
      const mockSender2 = vi.fn();
      executor.setRpcSender(mockSender1);
      executor.setRpcSender(mockSender2);
      // Should not throw - latest sender is used
      expect(executor).toBeDefined();
    });
  });

  describe("Screen Capture Availability", () => {
    it("should return false when no nodes paired", () => {
      expect(executor.hasScreenCaptureAvailable(testUserId)).toBe(false);
    });

    it("should return false when node lacks screen capture capability", () => {
      const code = sessionManager.generatePairingCode(testUserId);
      sessionManager.completePairing(code, testSocketId, {
        nodeName: "ExecOnlyNode",
        platform: "linux",
        capabilities: { screenCapture: false, commandExec: true },
      });

      expect(executor.hasScreenCaptureAvailable(testUserId)).toBe(false);
    });

    it("should return true when screen capture capable node exists", () => {
      const code = sessionManager.generatePairingCode(testUserId);
      sessionManager.completePairing(code, testSocketId, {
        nodeName: "CaptureNode",
        platform: "darwin",
        capabilities: { screenCapture: true, commandExec: true },
      });

      expect(executor.hasScreenCaptureAvailable(testUserId)).toBe(true);
    });

    it("should return false for different user", () => {
      const otherUserId = "other-user-456";
      const code = sessionManager.generatePairingCode(testUserId);
      sessionManager.completePairing(code, testSocketId, {
        nodeName: "CaptureNode",
        platform: "darwin",
        capabilities: { screenCapture: true, commandExec: true },
      });

      expect(executor.hasScreenCaptureAvailable(otherUserId)).toBe(false);
    });
  });

  describe("Get Screen Capture Node", () => {
    it("should return undefined when no nodes paired", () => {
      const node = executor.getScreenCaptureNode(testUserId);
      expect(node).toBeUndefined();
    });

    it("should return undefined when no screen capture capable nodes", () => {
      const code = sessionManager.generatePairingCode(testUserId);
      sessionManager.completePairing(code, testSocketId, {
        nodeName: "ExecOnlyNode",
        platform: "linux",
        capabilities: { screenCapture: false, commandExec: true },
      });

      const node = executor.getScreenCaptureNode(testUserId);
      expect(node).toBeUndefined();
    });

    it("should return screen capture capable node", () => {
      const code = sessionManager.generatePairingCode(testUserId);
      const connection = sessionManager.completePairing(code, testSocketId, {
        nodeName: "CaptureNode",
        platform: "darwin",
        capabilities: { screenCapture: true, commandExec: true },
      });

      const node = executor.getScreenCaptureNode(testUserId);
      expect(node).toBeDefined();
      expect(node?.nodeId).toBe(connection.nodeId);
      expect(node?.nodeName).toBe("CaptureNode");
    });

    it("should prefer nodes with screen capture when multiple exist", () => {
      // Create exec-only node first
      const code1 = sessionManager.generatePairingCode(testUserId);
      sessionManager.completePairing(code1, "socket-1", {
        nodeName: "ExecNode",
        platform: "linux",
        capabilities: { screenCapture: false, commandExec: true },
      });

      // Create screen capture node second
      const code2 = sessionManager.generatePairingCode(testUserId);
      const captureConnection = sessionManager.completePairing(code2, "socket-2", {
        nodeName: "CaptureNode",
        platform: "darwin",
        capabilities: { screenCapture: true, commandExec: true },
      });

      const node = executor.getScreenCaptureNode(testUserId);
      expect(node?.nodeId).toBe(captureConnection.nodeId);
    });
  });

  describe("Consent Status", () => {
    it("should return false when node not found", () => {
      expect(executor.hasScreenCaptureConsent(testUserId, "nonexistent-node")).toBe(false);
    });

    it("should return false when node belongs to different user", () => {
      const otherUserId = "other-user-456";
      const code = sessionManager.generatePairingCode(otherUserId);
      const node = sessionManager.completePairing(code, testSocketId, {
        nodeName: "OtherNode",
        platform: "windows",
        capabilities: { screenCapture: true, commandExec: true },
      });

      expect(executor.hasScreenCaptureConsent(testUserId, node.nodeId)).toBe(false);
    });

    it("should return false when consent not granted", () => {
      const code = sessionManager.generatePairingCode(testUserId);
      const node = sessionManager.completePairing(code, testSocketId, {
        nodeName: "TestNode",
        platform: "windows",
        capabilities: { screenCapture: true, commandExec: true },
      });

      expect(executor.hasScreenCaptureConsent(testUserId, node.nodeId)).toBe(false);
    });

    it("should return true when consent granted", () => {
      const code = sessionManager.generatePairingCode(testUserId);
      const node = sessionManager.completePairing(code, testSocketId, {
        nodeName: "TestNode",
        platform: "windows",
        capabilities: { screenCapture: true, commandExec: true },
      });

      executor.grantScreenCaptureConsent(testUserId, node.nodeId);
      expect(executor.hasScreenCaptureConsent(testUserId, node.nodeId)).toBe(true);
    });

    it("should find node by userId when nodeId not specified", () => {
      const code = sessionManager.generatePairingCode(testUserId);
      const node = sessionManager.completePairing(code, testSocketId, {
        nodeName: "TestNode",
        platform: "windows",
        capabilities: { screenCapture: true, commandExec: true },
      });

      expect(executor.hasScreenCaptureConsent(testUserId)).toBe(false);

      executor.grantScreenCaptureConsent(testUserId, node.nodeId);
      expect(executor.hasScreenCaptureConsent(testUserId)).toBe(true);
    });
  });

  describe("Grant Consent", () => {
    it("should throw when node not found", () => {
      expect(() => {
        executor.grantScreenCaptureConsent(testUserId, "nonexistent-node");
      }).toThrow("NODE_NOT_FOUND");
    });

    it("should throw when node belongs to different user", () => {
      const otherUserId = "other-user-456";
      const code = sessionManager.generatePairingCode(otherUserId);
      const node = sessionManager.completePairing(code, testSocketId, {
        nodeName: "OtherNode",
        platform: "windows",
        capabilities: { screenCapture: true, commandExec: true },
      });

      expect(() => {
        executor.grantScreenCaptureConsent(testUserId, node.nodeId);
      }).toThrow("NODE_NOT_FOUND");
    });

    it("should grant consent successfully", () => {
      const code = sessionManager.generatePairingCode(testUserId);
      const node = sessionManager.completePairing(code, testSocketId, {
        nodeName: "TestNode",
        platform: "windows",
        capabilities: { screenCapture: true, commandExec: true },
      });

      // Should not throw
      executor.grantScreenCaptureConsent(testUserId, node.nodeId);
      expect(executor.hasScreenCaptureConsent(testUserId, node.nodeId)).toBe(true);
    });

    it("should accept optional duration", () => {
      const code = sessionManager.generatePairingCode(testUserId);
      const node = sessionManager.completePairing(code, testSocketId, {
        nodeName: "TestNode",
        platform: "windows",
        capabilities: { screenCapture: true, commandExec: true },
      });

      const durationMs = 60000; // 1 minute
      executor.grantScreenCaptureConsent(testUserId, node.nodeId, durationMs);

      // Consent should be granted
      expect(executor.hasScreenCaptureConsent(testUserId, node.nodeId)).toBe(true);
    });
  });

  describe("Error Messages", () => {
    it("should provide helpful error when no paired nodes", async () => {
      executor.setRpcSender(vi.fn());

      await expect(executor.requestScreenCapture(testUserId))
        .rejects.toThrow("No screen capture capable node found");
    });

    it("should provide helpful error for missing capability", async () => {
      executor.setRpcSender(vi.fn());

      const code = sessionManager.generatePairingCode(testUserId);
      const node = sessionManager.completePairing(code, testSocketId, {
        nodeName: "ExecOnlyNode",
        platform: "linux",
        capabilities: { screenCapture: false, commandExec: true },
      });

      await expect(executor.requestScreenCapture(testUserId, node.nodeId))
        .rejects.toThrow("does not support screen capture");
    });

    it("should provide helpful error for missing consent", async () => {
      executor.setRpcSender(vi.fn());

      const code = sessionManager.generatePairingCode(testUserId);
      const node = sessionManager.completePairing(code, testSocketId, {
        nodeName: "TestNode",
        platform: "windows",
        capabilities: { screenCapture: true, commandExec: true },
      });

      await expect(executor.requestScreenCapture(testUserId, node.nodeId))
        .rejects.toThrow("CONSENT_REQUIRED");
    });

    it("should provide helpful error when offline", async () => {
      executor.setRpcSender(vi.fn());

      const code = sessionManager.generatePairingCode(testUserId);
      const node = sessionManager.completePairing(code, testSocketId, {
        nodeName: "TestNode",
        platform: "windows",
        capabilities: { screenCapture: true, commandExec: true },
      });
      sessionManager.grantScreenCaptureConsent(node.nodeId);
      sessionManager.markOffline(testSocketId);

      await expect(executor.requestScreenCapture(testUserId, node.nodeId))
        .rejects.toThrow("NODE_NOT_AVAILABLE");
    });

    it("should provide helpful error when RPC not configured", async () => {
      const noRpcExecutor = new NodeExecutor(sessionManager);

      const code = sessionManager.generatePairingCode(testUserId);
      const node = sessionManager.completePairing(code, testSocketId, {
        nodeName: "TestNode",
        platform: "windows",
        capabilities: { screenCapture: true, commandExec: true },
      });
      sessionManager.grantScreenCaptureConsent(node.nodeId);

      await expect(noRpcExecutor.requestScreenCapture(testUserId, node.nodeId))
        .rejects.toThrow("RPC_NOT_AVAILABLE");

      noRpcExecutor.cleanup();
    });
  });

  describe("Command Execution Node Selection", () => {
    it("should use specific node when provided", async () => {
      const mockSender = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
      executor.setRpcSender(mockSender);

      // Create two nodes
      const code1 = sessionManager.generatePairingCode(testUserId);
      const node1 = sessionManager.completePairing(code1, "socket-1", {
        nodeName: "Node1",
        platform: "windows",
        capabilities: { screenCapture: false, commandExec: true },
      });

      const code2 = sessionManager.generatePairingCode(testUserId);
      sessionManager.completePairing(code2, "socket-2", {
        nodeName: "Node2",
        platform: "linux",
        capabilities: { screenCapture: false, commandExec: true },
      });

      // Execute on specific node
      await executor.executeCommand(testUserId, "echo test", { nodeId: node1.nodeId });

      expect(mockSender).toHaveBeenCalledTimes(1);
      expect(mockSender.mock.calls[0][0]).toBe(node1.nodeId);
    });

    it("should auto-select node when nodeId not provided", async () => {
      const mockSender = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
      executor.setRpcSender(mockSender);

      // Create node
      const code = sessionManager.generatePairingCode(testUserId);
      const node = sessionManager.completePairing(code, testSocketId, {
        nodeName: "AutoNode",
        platform: "darwin",
        capabilities: { screenCapture: false, commandExec: true },
      });

      // Execute without specifying node
      await executor.executeCommand(testUserId, "echo test");

      expect(mockSender).toHaveBeenCalledTimes(1);
      expect(mockSender.mock.calls[0][0]).toBe(node.nodeId);
    });
  });

  describe("Cleanup", () => {
    it("should cleanup without errors when nothing to clean", () => {
      // Should not throw
      executor.cleanup();
    });

    it("should allow multiple cleanup calls", () => {
      // Should not throw
      executor.cleanup();
      executor.cleanup();
      executor.cleanup();
    });
  });
});
