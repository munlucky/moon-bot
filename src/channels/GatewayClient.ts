/**
 * Channel Gateway Client
 *
 * WebSocket client for channel adapters to communicate with Gateway.
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Notification handling via EventEmitter
 * - Connection state tracking
 */

import { EventEmitter } from "events";
import WebSocket from "ws";

interface RpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: unknown;
}

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

interface RpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

export interface ChannelGatewayClientOptions {
  url: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  timeout?: number;
  token?: string;
}

export interface ChannelGatewayClientEvents {
  notification: (method: string, params: unknown) => void;
  connected: () => void;
  disconnected: () => void;
  error: (error: Error) => void;
  reconnecting: (attempt: number) => void;
}

export class ChannelGatewayClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private messageId = 0;
  private pendingRequests = new Map<
    number | string,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private intentionalClose = false;
  private _isConnected = false;

  private readonly url: string;
  private readonly reconnectInterval: number;
  private readonly maxReconnectAttempts: number;
  private readonly timeout: number;
  private readonly token?: string;

  constructor(options: ChannelGatewayClientOptions) {
    super();
    this.url = options.url;
    this.reconnectInterval = options.reconnectInterval ?? 5000;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 10;
    this.timeout = options.timeout ?? 30000;
    this.token = options.token;
  }

  /**
   * Connect to the Gateway server.
   */
  async connect(): Promise<void> {
    if (this._isConnected) {
      return;
    }

    this.intentionalClose = false;
    return this.doConnect();
  }

  private doConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.on("open", async () => {
          this._isConnected = true;
          this.reconnectAttempts = 0;

          // Perform initial handshake
          try {
            await this.call("connect", {
              clientType: "channel-adapter",
              version: "1.0.0",
              token: this.token,
            });
            this.emit("connected");
            resolve();
          } catch (error) {
            this._isConnected = false;
            reject(error);
          }
        });

        this.ws.on("message", (data: Buffer) => {
          this.handleMessage(data);
        });

        this.ws.on("close", () => {
          this._isConnected = false;
          this.rejectAllPending("Connection closed");
          this.emit("disconnected");

          if (!this.intentionalClose) {
            this.scheduleReconnect();
          }
        });

        this.ws.on("error", (error) => {
          this.emit("error", error);
          if (!this._isConnected) {
            reject(new Error(`Failed to connect to Gateway: ${error.message}`));
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Call an RPC method on the Gateway.
   */
  async call<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected to Gateway");
    }

    const id = ++this.messageId;
    const request: RpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`RPC call timeout: ${method}`));
      }, this.timeout);

      this.pendingRequests.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value as T);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
        timer,
      });

      this.ws?.send(JSON.stringify(request), (error) => {
        if (error) {
          clearTimeout(timer);
          this.pendingRequests.delete(id);
          reject(error);
        }
      });
    });
  }

  /**
   * Handle incoming WebSocket message.
   */
  private handleMessage(data: Buffer): void {
    try {
      const message: RpcResponse | RpcNotification = JSON.parse(data.toString());

      // Handle RPC response
      if ("id" in message && message.id !== null) {
        const handlers = this.pendingRequests.get(message.id);
        if (handlers) {
          this.pendingRequests.delete(message.id);

          if (message.error) {
            handlers.reject(
              new Error(`${message.error.message} (${message.error.code})`)
            );
          } else {
            handlers.resolve(message.result);
          }
        }
        return;
      }

      // Handle notification (no id)
      if ("method" in message) {
        this.emit("notification", message.method, message.params);
      }
    } catch (error) {
      this.emit("error", new Error(`Failed to parse message: ${error}`));
    }
  }

  /**
   * Schedule a reconnection attempt.
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit(
        "error",
        new Error(`Max reconnect attempts (${this.maxReconnectAttempts}) reached`)
      );
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1),
      30000 // Max 30 seconds
    );

    this.emit("reconnecting", this.reconnectAttempts);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;

      try {
        await this.doConnect();
      } catch {
        // doConnect will trigger another scheduleReconnect via 'close' event
      }
    }, delay);
  }

  /**
   * Reject all pending requests.
   */
  private rejectAllPending(reason: string): void {
    for (const [id, handlers] of this.pendingRequests) {
      clearTimeout(handlers.timer);
      handlers.reject(new Error(reason));
      this.pendingRequests.delete(id);
    }
  }

  /**
   * Disconnect from the Gateway.
   */
  disconnect(): void {
    this.intentionalClose = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.rejectAllPending("Client disconnected");

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this._isConnected = false;
  }

  /**
   * Check if connected to Gateway.
   */
  isConnected(): boolean {
    return this._isConnected && this.ws?.readyState === WebSocket.OPEN;
  }
}
