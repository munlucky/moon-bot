// Gateway fixture for E2E tests
// Sets up a test Gateway server with ToolRuntime and ApprovalFlowManager

import { WebSocket } from "ws";
import { randomUUID } from "crypto";
import { GatewayServer } from "../../../../dist/gateway/server.js";
import type { SystemConfig } from "../../../../dist/types/index.js";

// Test Gateway instance
let testGateway: GatewayServer | null = null;
let gatewayPort = 18790; // Different from default 18789, will auto-increment

// Connected test clients
const testClients = new Map<string, WebSocket>();

/**
 * Create a test system configuration.
 */
function createTestConfig(): SystemConfig {
  const token = Buffer.from("test-token-for-e2e").toString("hex");
  return {
    agents: [
      {
        id: "test-agent",
        name: "Test Agent",
        model: "gpt-4",
        apiKey: "test-key",
      },
    ],
    channels: [],
    gateways: [
      {
        port: gatewayPort,
        host: "127.0.0.1",
        auth: {
          tokens: {
            test: token,
          },
        },
      },
    ],
  };
}

/**
 * Initialize and start the test Gateway server.
 */
export async function setupGateway(): Promise<{
  gateway: GatewayServer;
  port: number;
  token: string;
}> {
  if (testGateway) {
    // Gateway already exists, clean it up first
    testGateway.stop();
    testGateway = null;
  }

  const config = createTestConfig();
  const token = config.gateways[0]?.auth?.tokens?.test || "";

  // Find available port
  let port = gatewayPort;
  let attempts = 0;
  while (attempts < 10) {
    try {
      testGateway = new GatewayServer(config, process.cwd());
      await testGateway.start(port, "127.0.0.1");
      gatewayPort = port;
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") {
        port++;
        attempts++;
        continue;
      }
      throw error;
    }
  }

  if (!testGateway) {
    throw new Error("Failed to start Gateway server");
  }

  // Wait for dependencies to initialize
  await new Promise((resolve) => setTimeout(resolve, 500));

  return {
    gateway: testGateway,
    port,
    token,
  };
}

/**
 * Create a test WebSocket client and connect to Gateway.
 */
export async function createGatewayClient(
  port: number,
  token: string
): Promise<WebSocket & { clientId: string }> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const clientId = randomUUID();

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Connection timeout")), 5000);

    ws.on("open", () => {
      clearTimeout(timeout);
      resolve();
    });

    ws.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

  // Send connect message
  const connectRequest = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "connect",
    params: {
      clientType: "test-client",
      version: "1.0.0",
      token,
    },
  });

  ws.send(connectRequest);

  // Wait for connect response
  const response = await new Promise<string>((resolve) => {
    ws.once("message", (data) => resolve(data.toString()));
  });

  const connectResponse = JSON.parse(response);
  if (connectResponse.error) {
    ws.close();
    throw new Error(`Connect failed: ${connectResponse.error.message}`);
  }

  // Store client
  testClients.set(clientId, ws);

  return Object.assign(ws, { clientId });
}

/**
 * Call an RPC method on the Gateway.
 */
export async function callRpc(
  client: WebSocket,
  method: string,
  params: unknown
): Promise<unknown> {
  const requestId = randomUUID();
  const request = JSON.stringify({
    jsonrpc: "2.0",
    id: requestId,
    method,
    params,
  });

  client.send(request);

  // Wait for response
  const response = await new Promise<string>((resolve) => {
    const handler = (data: Buffer) => {
      const msg = JSON.parse(data.toString());
      if (msg.id === requestId) {
        client.off("message", handler);
        resolve(data.toString());
      }
    };
    client.on("message", handler);
  });

  const parsed = JSON.parse(response);
  if (parsed.error) {
    throw new Error(parsed.error.message);
  }
  return parsed.result;
}

/**
 * Listen for Gateway notifications (broadcast events).
 */
export function listenForNotification(
  client: WebSocket,
  method: string,
  timeoutMs = 5000
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.off("message", handler);
      reject(new Error(`Notification timeout for ${method}`));
    }, timeoutMs);

    const handler = (data: Buffer) => {
      const msg = JSON.parse(data.toString());
      if (msg.method === method) {
        clearTimeout(timeout);
        client.off("message", handler);
        resolve(msg.params);
      }
    };
    client.on("message", handler);
  });
}

/**
 * Teardown the test Gateway server.
 */
export async function teardownGateway(): Promise<void> {
  // Close all test clients
  for (const [id, ws] of testClients) {
    ws.close();
    testClients.delete(id);
  }

  // Stop Gateway
  if (testGateway) {
    testGateway.stop();
    testGateway = null;
  }

  // Wait for cleanup
  await new Promise((resolve) => setTimeout(resolve, 100));
}

/**
 * Get the test Gateway instance.
 */
export function getTestGateway(): GatewayServer | null {
  return testGateway;
}
