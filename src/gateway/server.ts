// WebSocket Gateway Server

import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";
import type { SystemConfig, ClientInfo, ConnectParams, ChatMessage } from "../types/index.js";
import { JsonRpcServer } from "./json-rpc.js";
import { createLogger, type Logger } from "../utils/logger.js";

/**
 * Rate limiter to prevent connection flooding.
 * Tracks connection attempts per IP address within a time window.
 */
class ConnectionRateLimiter {
  private attempts = new Map<string, number[]>();
  private readonly windowMs: number;
  private readonly maxAttempts: number;

  constructor(windowMs: number = 60000, maxAttempts: number = 10) {
    this.windowMs = windowMs;
    this.maxAttempts = maxAttempts;
  }

  /**
   * Check if a connection is allowed from the given IP.
   * @param ip IP address (or socket ID as fallback)
   * @returns true if connection is allowed, false if rate limited
   */
  checkLimit(ip: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Get existing attempts for this IP
    let attempts = this.attempts.get(ip) || [];

    // Filter out attempts outside the time window
    attempts = attempts.filter(timestamp => timestamp > windowStart);

    // Check if limit exceeded
    if (attempts.length >= this.maxAttempts) {
      return false;
    }

    // Add current attempt
    attempts.push(now);
    this.attempts.set(ip, attempts);

    return true;
  }

  /**
   * Clean up old entries to prevent memory leaks.
   */
  cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    for (const [ip, attempts] of this.attempts.entries()) {
      const validAttempts = attempts.filter(timestamp => timestamp > windowStart);
      if (validAttempts.length === 0) {
        this.attempts.delete(ip);
      } else {
        this.attempts.set(ip, validAttempts);
      }
    }
  }
}

export class GatewayServer {
  private wss: WebSocketServer | null = null;
  private rpc: JsonRpcServer;
  private clients = new Map<string, ClientInfo>();
  private sockets = new Map<string, WebSocket>();
  private config: SystemConfig;
  private logger: Logger;
  private rateLimiter: ConnectionRateLimiter;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: SystemConfig) {
    this.config = config;
    this.logger = createLogger(config);
    this.rpc = new JsonRpcServer();
    this.rateLimiter = new ConnectionRateLimiter(
      60000, // 1 minute window
      10     // max 10 connections per minute per IP
    );
    this.setupHandlers();
  }

  private setupHandlers(): void {
    // connect: Handshake and client registration
    this.rpc.register("connect", async (params) => {
      const { clientType, version, token } = params as ConnectParams;

      // Validate auth if configured
      if (this.config.gateways[0]?.auth?.tokens) {
        if (!token || !this.config.gateways[0].auth.tokens[token]) {
          throw new Error("Authentication failed");
        }
      }

      const clientId = randomUUID();
      const clientInfo: ClientInfo = {
        id: clientId,
        type: clientType,
        version,
        connectedAt: Date.now(),
      };

      this.clients.set(clientId, clientInfo);
      this.logger.info(`Client connected: ${clientType} (${clientId})`);

      return { clientId, ...clientInfo };
    });

    // chat.send: Send message from surface to agent
    this.rpc.register("chat.send", async (params) => {
      const message = params as ChatMessage;
      this.logger.info(`Chat message from ${message.channelId}: ${message.text}`);
      // Will be handled by agent module
      return { status: "queued", sessionId: message.sessionId || "new" };
    });

    // session.get: Get session by ID
    this.rpc.register("session.get", async (params) => {
      const { sessionId } = params as { sessionId: string };
      // Will be handled by session module
      return { sessionId, exists: false };
    });

    // logs.tail: Stream logs
    this.rpc.register("logs.tail", async (params) => {
      const { filter } = params as { filter?: string };
      this.logger.info("Logs tail requested", { filter });
      return { status: "streaming" };
    });

    // disconnect: Client disconnect
    this.rpc.register("disconnect", async (params) => {
      const { clientId } = params as { clientId: string };
      this.clients.delete(clientId);
      this.sockets.delete(clientId);
      this.logger.info(`Client disconnected: ${clientId}`);
      return { success: true };
    });
  }

  async start(port: number, host: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wss = new WebSocketServer({ port, host });

      // Start periodic cleanup of rate limiter
      this.cleanupInterval = setInterval(() => {
        this.rateLimiter.cleanup();
      }, 60000); // Every minute

      this.wss.on("listening", () => {
        this.logger.info(`Gateway listening on ${host}:${port}`);
        resolve();
      });

      this.wss.on("error", (error) => {
        this.logger.error("Gateway error", { error });
        reject(error);
      });

      this.wss.on("connection", (ws, req) => {
        // Generate socket ID first for rate limiting fallback
        const socketId = randomUUID();

        // Extract IP address for rate limiting
        const ip = req.socket.remoteAddress || socketId;

        // Check rate limit
        if (!this.rateLimiter.checkLimit(ip)) {
          this.logger.warn(`Connection rate limited: ${ip}`);
          ws.close(1008, "Rate limit exceeded");
          return;
        }

        this.sockets.set(socketId, ws);
        this.logger.info(`WebSocket connected: ${socketId} from ${ip}`);

        ws.on("message", async (data) => {
          try {
            const message = data.toString();
            const response = await this.rpc.handleMessage(message);
            if (response) {
              ws.send(response);
            }
          } catch (error) {
            this.logger.error("Error handling message", { error });
          }
        });

        ws.on("close", () => {
          this.sockets.delete(socketId);
          this.logger.info(`WebSocket disconnected: ${socketId}`);
        });

        ws.on("error", (error) => {
          this.logger.error(`WebSocket error: ${socketId}`, { error });
        });
      });
    });
  }

  stop(): void {
    for (const socket of this.sockets.values()) {
      socket.close();
    }
    this.wss?.close();

    // Clean up rate limiter interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.logger.info("Gateway stopped");
  }

  broadcast(method: string, params?: unknown): void {
    const notification = JSON.stringify({
      jsonrpc: "2.0",
      method,
      params,
    });

    for (const socket of this.sockets.values()) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(notification);
      }
    }
  }

  sendToClient(clientId: string, method: string, params?: unknown): boolean {
    const socket = this.sockets.get(clientId);
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    socket.send(
      JSON.stringify({
        jsonrpc: "2.0",
        method,
        params,
      })
    );
    return true;
  }

  getClientInfo(clientId: string): ClientInfo | undefined {
    return this.clients.get(clientId);
  }

  getConnectedClients(): ClientInfo[] {
    return Array.from(this.clients.values());
  }
}
