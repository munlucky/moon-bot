// WebSocket RPC client for E2E testing
// Provides a simple interface for JSON-RPC communication with Gateway

import { WebSocket } from "ws";
import { randomUUID } from "crypto";
import { EventEmitter } from "events";

export interface RpcClientOptions {
  url: string;
  token?: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export class TestRpcClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  private token?: string;
  private reconnectInterval: number;
  private maxReconnectAttempts: number;
  private reconnectAttempts = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private pendingRequests = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();
  private clientId = "";
  private connected = false;

  constructor(options: RpcClientOptions) {
    super();
    this.url = options.url;
    this.token = options.token;
    this.reconnectInterval = options.reconnectInterval ?? 5000;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 10;
  }

  /**
   * Connect to the Gateway server.
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      const timeout = setTimeout(() => {
        reject(new Error("Connection timeout"));
      }, 10000);

      this.ws.on("open", async () => {
        clearTimeout(timeout);

        // Send connect message if token is provided
        if (this.token) {
          await this.call("connect", {
            clientType: "test-client",
            version: "1.0.0",
            token: this.token,
          });
        }

        this.connected = true;
        this.reconnectAttempts = 0;
        this.emit("connected");
        resolve();
      });

      this.ws.on("message", (data: Buffer) => {
        this.handleMessage(data.toString());
      });

      this.ws.on("close", () => {
        this.connected = false;
        this.emit("disconnected");

        // Attempt reconnect
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          this.emit("reconnecting", this.reconnectAttempts);
          this.reconnectTimeout = setTimeout(() => {
            this.connect().catch(() => {
              // Reconnect failed, will retry
            });
          }, this.reconnectInterval);
        } else {
          this.emit("reconnectFailed");
        }
      });

      this.ws.on("error", (error) => {
        this.emit("error", error);
      });
    });
  }

  /**
   * Disconnect from the Gateway server.
   */
  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.connected = false;
  }

  /**
   * Call an RPC method and wait for response.
   */
  async call(method: string, params?: unknown): Promise<unknown> {
    if (!this.ws || !this.connected) {
      throw new Error("Not connected");
    }

    const requestId = randomUUID();
    const request = {
      jsonrpc: "2.0",
      id: requestId,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`RPC timeout for ${method}`));
      }, 5000);

      this.pendingRequests.set(requestId, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      this.ws!.send(JSON.stringify(request));
    });
  }

  /**
   * Listen for a specific notification method.
   */
  async waitForNotification(method: string, timeoutMs = 5000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.off(method, handler);
        reject(new Error(`Notification timeout for ${method}`));
      }, timeoutMs);

      const handler = (params: unknown) => {
        clearTimeout(timeout);
        resolve(params);
      };

      this.once(method, handler);
    });
  }

  /**
   * Handle incoming WebSocket message.
   */
  private handleMessage(message: string): void {
    try {
      const msg = JSON.parse(message);

      // Handle request response
      if (msg.id && this.pendingRequests.has(msg.id)) {
        const pending = this.pendingRequests.get(msg.id);
        this.pendingRequests.delete(msg.id);

        if (msg.error) {
          pending?.reject(new Error(msg.error.message));
        } else {
          pending?.resolve(msg.result);
        }
        return;
      }

      // Handle notification
      if (msg.method) {
        this.emit(msg.method, msg.params);
      }
    } catch (error) {
      this.emit("error", error);
    }
  }

  /**
   * Check if connected.
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get the client ID assigned by Gateway.
   */
  getClientId(): string {
    return this.clientId;
  }
}

/**
 * Create a test RPC client connected to Gateway.
 */
export async function createTestClient(
  port: number,
  token?: string
): Promise<TestRpcClient> {
  const client = new TestRpcClient({
    url: `ws://127.0.0.1:${port}`,
    token,
  });

  await client.connect();
  return client;
}
