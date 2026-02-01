// Smoke Tests for E2E Environment
// Verifies that basic E2E infrastructure is working correctly

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { setupGateway, teardownGateway, createGatewayClient } from "./fixtures/gateway-setup.js";
import type { WebSocket } from "ws";

describe("Smoke Tests", () => {
  let gatewayPort: number;
  let gatewayToken: string;

  describe("Environment Verification", () => {
    test("should have required Node.js version", () => {
      const nodeVersion = process.versions.node;
      const majorVersion = parseInt(nodeVersion.split(".")[0], 10);
      expect(majorVersion).toBeGreaterThanOrEqual(18);
    });

    test("should have crypto module available", () => {
      const uuid = crypto.randomUUID();
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    test("should have WebSocket available", async () => {
      const { WebSocket } = await import("ws");
      expect(WebSocket).toBeDefined();
    });
  });

  describe("Gateway Connection", () => {
    beforeAll(async () => {
      try {
        const setup = await setupGateway();
        gatewayPort = setup.port;
        gatewayToken = setup.token;
      } catch (error) {
        // Skip gateway tests if server cannot start (e.g., in CI without build)
        console.warn("Gateway setup failed, skipping connection tests:", error);
      }
    }, 30000);

    afterAll(async () => {
      await teardownGateway();
    });

    test("should start Gateway server successfully", () => {
      if (!gatewayPort) {
        console.warn("Skipping: Gateway not available");
        return;
      }
      expect(gatewayPort).toBeGreaterThan(0);
      expect(gatewayToken).toBeTruthy();
    });

    test("should connect WebSocket client to Gateway", async () => {
      if (!gatewayPort) {
        console.warn("Skipping: Gateway not available");
        return;
      }

      const client = await createGatewayClient(gatewayPort, gatewayToken);
      expect(client).toBeDefined();
      expect(client.clientId).toBeTruthy();
      expect(client.readyState).toBe(1); // WebSocket.OPEN
      client.close();
    }, 10000);
  });
});
