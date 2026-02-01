// JSON-RPC Protocol Handler

import { randomUUID } from "crypto";
import type { JsonRpcMessage, JsonRpcRequest, JsonRpcResponse, JsonRpcError } from "../types/index.js";

export type JsonRpcHandler = (params: unknown) => Promise<unknown>;

export class JsonRpcServer {
  private handlers = new Map<string, JsonRpcHandler>();

  register(method: string, handler: JsonRpcHandler): void {
    this.handlers.set(method, handler);
  }

  /**
   * Register multiple handlers at once.
   */
  registerBatch(handlers: Map<string, JsonRpcHandler>): void {
    for (const [method, handler] of handlers.entries()) {
      this.handlers.set(method, handler);
    }
  }

  unregister(method: string): void {
    this.handlers.delete(method);
  }

  async handleMessage(message: string): Promise<string> {
    try {
      const parsed = JSON.parse(message) as JsonRpcMessage;

      // Validate JSON-RPC 2.0
      if (parsed.jsonrpc !== "2.0") {
        return this.createError(null, -32600, "Invalid Request");
      }

      // Handle request
      if (parsed.method) {
        return await this.handleRequest(parsed as JsonRpcRequest);
      }

      // Invalid message
      return this.createError(parsed.id ?? null, -32600, "Invalid Request");
    } catch {
      return this.createError(null, -32700, "Parse error");
    }
  }

  private async handleRequest(request: JsonRpcRequest): Promise<string> {
    const handler = this.handlers.get(request.method);

    if (!handler) {
      return this.createError(request.id, -32601, "Method not found");
    }

    // Validate params type (must be object or array if present)
    if (request.params !== undefined && request.params !== null) {
      const _paramsType = typeof request.params; // Reserved for future use
      if (_paramsType !== "object") {
        return this.createError(request.id, -32602, "Invalid params", "params must be an object or array");
      }
    }

    try {
      const result = await handler(request.params);
      return this.createResult(request.id, result);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      return this.createError(request.id, -32603, "Internal error", errorMsg);
    }
  }

  private createResult(id: string | number, result: unknown): string {
    const response: JsonRpcResponse = {
      jsonrpc: "2.0",
      id,
      result,
    };
    return JSON.stringify(response);
  }

  private createError(
    id: string | number | null,
    code: number,
    message: string,
    data?: unknown
  ): string {
    const error: JsonRpcError = { code, message };
    if (data !== undefined) {
      error.data = data;
    }

    const response: JsonRpcResponse = {
      jsonrpc: "2.0",
      id,
      error,
    };
    return JSON.stringify(response);
  }

  // Standard error codes
  static readonly Errors = {
    ParseError: -32700,
    InvalidRequest: -32600,
    MethodNotFound: -32601,
    InvalidParams: -32602,
    InternalError: -32603,
  };
}

export function createRequest(method: string, params?: unknown, id?: string | number): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    id: id ?? randomUUID(),
    method,
    params,
  });
}

export function createNotification(method: string, params?: unknown): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    method,
    params,
  });
}
