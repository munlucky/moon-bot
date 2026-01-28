/**
 * WebSocket RPC client for Gateway communication
 */

import WebSocket from "ws";
import type { RpcCallOptions } from "../types.js";
import { printError } from "./output.js";

/** RPC request */
interface RpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: unknown[];
}

/** RPC response */
interface RpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/** RPC notification */
interface RpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown[];
}

/** Gateway RPC client */
export class GatewayRpcClient {
  private ws: WebSocket | null = null;
  private messageId = 0;
  private pendingRequests = new Map<number | string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();

  constructor(
    private host: string = "localhost",
    private port: number = 18789,
    private timeout: number = 5000
  ) {}

  /** Connect to Gateway */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `ws://${this.host}:${this.port}`;
      this.ws = new WebSocket(url);

      this.ws.on("open", () => {
        resolve();
      });

      this.ws.on("error", (error) => {
        reject(new Error(`Failed to connect to Gateway: ${error.message}`));
      });

      this.ws.on("message", (data: Buffer) => {
        this.handleMessage(data);
      });

      this.ws.on("close", () => {
        // Reject all pending requests
        for (const [_, { reject }] of this.pendingRequests) {
          reject(new Error("Connection closed"));
        }
        this.pendingRequests.clear();
      });
    });
  }

  /** Call RPC method */
  async call<T = unknown>(method: string, params: unknown[] = [], options?: RpcCallOptions): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }

    const id = ++this.messageId;
    const request: RpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const timeoutMs = options?.timeout ?? this.timeout;

      // Set up timeout
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`RPC call timeout: ${method}`));
      }, timeoutMs);

      // Store promise handlers
      this.pendingRequests.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value as T);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });

      // Send request
      this.ws?.send(JSON.stringify(request), (error) => {
        if (error) {
          clearTimeout(timer);
          this.pendingRequests.delete(id);
          reject(error);
        }
      });
    });
  }

  /** Send notification (no response expected) */
  notify(method: string, params: unknown[] = []): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected to Gateway");
    }

    const notification: RpcNotification = {
      jsonrpc: "2.0",
      method,
      params,
    };

    this.ws.send(JSON.stringify(notification));
  }

  /** Handle incoming message */
  private handleMessage(data: Buffer): void {
    try {
      const message: RpcResponse | RpcNotification = JSON.parse(data.toString());

      // Handle response
      if ("id" in message) {
        const handlers = this.pendingRequests.get(message.id);
        if (handlers) {
          this.pendingRequests.delete(message.id);

          if (message.error) {
            handlers.reject(new Error(`${message.error.message} (${message.error.code})`));
          } else {
            handlers.resolve(message.result);
          }
        }
      }
    } catch (error) {
      printError(`Failed to parse RPC message: ${error}`);
    }
  }

  /** Close connection */
  close(): void {
    this.ws?.close();
    this.ws = null;
  }

  /** Check if connected */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

/** Create RPC client with config */
export async function createRpcClient(
  host?: string,
  port?: number,
  timeout?: number
): Promise<GatewayRpcClient> {
  const client = new GatewayRpcClient(host, port, timeout);
  await client.connect();
  return client;
}
