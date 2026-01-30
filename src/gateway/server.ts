// WebSocket Gateway Server

import { WebSocketServer, WebSocket } from "ws";
import { randomUUID, timingSafeEqual, createHash } from "crypto";
import type { SystemConfig, ClientInfo, ConnectParams, ChatMessage, TaskResponse } from "../types/index.js";
import { JsonRpcServer } from "./json-rpc.js";
import { createLogger, type Logger, type LayerLogger, runWithTraceAsync } from "../utils/logger.js";
import { ErrorSanitizer } from "../utils/error-sanitizer.js";
import { ToolRuntime } from "../tools/runtime/ToolRuntime.js";
import { createToolHandlers } from "./handlers/tools.handler.js";
import { createChannelHandlers } from "./handlers/channel.handler.js";
import { saveConfig } from "../config/manager.js";
import { DiscordAdapter } from "../channels/discord.js";
import { TaskOrchestrator } from "../orchestrator/index.js";
import { createGatewayTools, type Toolkit } from "../tools/index.js";
import { SessionManager } from "../sessions/manager.js";
import { Executor } from "../agents/executor.js";

/**
 * Rate limiter to prevent connection flooding.
 * Tracks connection attempts per IP address AND per token within a time window.
 * Dual-layer rate limiting prevents bypass via multiple IP addresses.
 */
class ConnectionRateLimiter {
  private attempts = new Map<string, number[]>();
  private tokenAttempts = new Map<string, number[]>();
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
   * Check if a token is within rate limits.
   * Prevents bypass of IP-based rate limiting via multiple IPs.
   * @param token Authentication token (first 8 chars for logging)
   * @returns true if connection is allowed, false if rate limited
   */
  checkTokenLimit(token: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Hash token for storage (SHA-256 to prevent collisions)
    const tokenHash = createHash('sha256').update(token).digest('hex');
    let attempts = this.tokenAttempts.get(tokenHash) || [];

    // Filter out attempts outside the time window
    attempts = attempts.filter(timestamp => timestamp > windowStart);

    // Check if limit exceeded
    if (attempts.length >= this.maxAttempts) {
      return false;
    }

    // Add current attempt
    attempts.push(now);
    this.tokenAttempts.set(tokenHash, attempts);

    return true;
  }

  /**
   * Clean up old entries to prevent memory leaks.
   */
  cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Clean IP-based entries
    for (const [ip, attempts] of this.attempts.entries()) {
      const validAttempts = attempts.filter(timestamp => timestamp > windowStart);
      if (validAttempts.length === 0) {
        this.attempts.delete(ip);
      } else {
        this.attempts.set(ip, validAttempts);
      }
    }

    // Clean token-based entries
    for (const [tokenHash, attempts] of this.tokenAttempts.entries()) {
      const validAttempts = attempts.filter(timestamp => timestamp > windowStart);
      if (validAttempts.length === 0) {
        this.tokenAttempts.delete(tokenHash);
      } else {
        this.tokenAttempts.set(tokenHash, validAttempts);
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
  private layerLogger: LayerLogger;
  private rateLimiter: ConnectionRateLimiter;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private toolRuntime: ToolRuntime | null = null;
  private toolkit: Toolkit | null = null;
  private sessionManager: SessionManager | null = null;
  private executor: Executor | null = null;
  private orchestrator!: TaskOrchestrator; // Definitely assigned in initializeDependencies

  constructor(config: SystemConfig, workspaceRoot?: string) {
    this.config = config;
    this.logger = createLogger(config);
    this.layerLogger = this.logger.forLayer("gateway");
    this.rpc = new JsonRpcServer();
    this.rateLimiter = new ConnectionRateLimiter(
      60000, // 1 minute window
      10     // max 10 connections per minute per IP
    );

    // Note: toolRuntime will be initialized from Toolkit in initializeDependencies()
    // This ensures all tools are registered and available
    this.toolRuntime = null;

    this.initializeDependencies(workspaceRoot).then(() => {
      // Initialize TaskOrchestrator with dependencies
      this.orchestrator = new TaskOrchestrator(config, undefined, {
        executor: this.executor ?? undefined,
        toolkit: this.toolkit ?? undefined,
        sessionManager: this.sessionManager ?? undefined,
      });

      // Register orchestrator response callback
      this.orchestrator.onResponse((response) => {
        this.broadcast("chat.response", response);
      });

      // Register orchestrator approval request callback
      this.orchestrator.onApprovalRequest((event) => {
        this.broadcast("approval.requested", {
          taskId: event.taskId,
          channelId: event.channelId,
          toolId: event.toolId,
          input: event.input,
          requestId: event.requestId,
        });
      });

      // Register orchestrator approval resolved callback
      this.orchestrator.onApprovalResolved((event) => {
        this.broadcast("approval.resolved", {
          taskId: event.taskId,
          channelId: event.channelId,
          approved: event.approved,
          requestId: event.requestId,
        });
      });

      this.setupHandlers();
    }).catch((error) => {
      this.logger.error("Failed to initialize dependencies", { error });
      // Still create orchestrator without dependencies for fallback echo mode
      this.orchestrator = new TaskOrchestrator(config);
      this.setupHandlers();
    });
  }

  /**
   * Initialize Toolkit, SessionManager, and Executor asynchronously.
   */
  private async initializeDependencies(workspaceRoot?: string): Promise<void> {
    // Initialize Toolkit
    this.toolkit = await createGatewayTools(this.config, {
      workspaceRoot: workspaceRoot ?? process.cwd(),
      enableBrowser: false,
    });

    // Sync toolRuntime from Toolkit
    this.toolRuntime = this.toolkit.getRuntime() ?? null;

    // Initialize SessionManager
    this.sessionManager = new SessionManager(this.config);

    // Initialize Executor with Toolkit
    if (this.toolkit) {
      this.executor = new Executor(this.config, this.toolkit);
    }

    this.logger.info("Dependencies initialized", {
      hasToolkit: !!this.toolkit,
      hasToolRuntime: !!this.toolRuntime,
      hasSessionManager: !!this.sessionManager,
      hasExecutor: !!this.executor,
    });
  }

  /**
   * Get the tool runtime instance.
   */
  getToolRuntime(): ToolRuntime | null {
    return this.toolRuntime;
  }

  private setupHandlers(): void {
    // Register tool handlers
    if (this.toolRuntime) {
      const toolHandlers = createToolHandlers(this.toolRuntime, this.config);
      this.rpc.registerBatch(toolHandlers);
    }

    // Register channel handlers
    const channelHandlers = createChannelHandlers(this.config, (newConfig) => {
      this.config = newConfig;
      // Save config to file when updated via RPC
      saveConfig(newConfig).catch(error => {
        this.logger.error("Failed to save config", { error });
      });
    });
    this.rpc.registerBatch(channelHandlers);

    // connect: Handshake and client registration
    this.rpc.register("connect", async (params) => {
      const { clientType, version, token } = params as ConnectParams;

      // Validate auth if configured (safe check for empty gateway array)
      const authConfig = this.config.gateways?.[0]?.auth;
      if (authConfig?.tokens && Object.keys(authConfig.tokens).length > 0) {
        if (!token) {
          this.logger.warn("Connection attempt without token");
          const sanitized = ErrorSanitizer.sanitizeWithCode(
            new Error("Authentication required"),
            'AUTH_MISSING_TOKEN'
          );
          throw new Error(sanitized.message);
        }

        // Check token-based rate limit (prevents IP bypass)
        if (!this.rateLimiter.checkTokenLimit(token)) {
          this.logger.warn(`Token rate limited`);
          const sanitized = ErrorSanitizer.sanitizeWithCode(
            new Error("Rate limit exceeded"),
            'RATE_LIMIT_EXCEEDED'
          );
          throw new Error(sanitized.message);
        }

        // Use timing-safe comparison to prevent timing attacks
        // Compare against VALUES (hashed tokens), not keys
        // Must iterate ALL tokens to prevent timing leak via short-circuit
        let isValidToken = false;
        const validTokens = Object.values(authConfig.tokens);
        for (const validToken of validTokens) {
          try {
            if (timingSafeEqual(
              Buffer.from(validToken, 'hex'),
              Buffer.from(token, 'hex')
            )) {
              isValidToken = true;
            }
          } catch {
            // Length mismatch: continue checking, still takes same time
          }
        }

        if (!isValidToken) {
          this.logger.warn(`Invalid token attempt from ${clientType}`);
          const sanitized = ErrorSanitizer.sanitizeWithCode(
            new Error("Authentication failed"),
            'AUTH_INVALID_TOKEN'
          );
          throw new Error(sanitized.message);
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
      this.layerLogger.info(`Client connected: ${clientType}`, { clientId, clientType, version });

      return { clientId, ...clientInfo };
    });

    // chat.send: Send message from surface to agent (delegated to Orchestrator)
    this.rpc.register("chat.send", async (params) => {
      const message = params as ChatMessage;

      // Start trace context for this request flow
      return runWithTraceAsync("gateway", async () => {
        const startTime = Date.now();
        this.layerLogger.logInput("chat.send", { channelId: message.channelId, text: message.text });

        // Generate channel session ID for per-channel queue mapping
        const channelSessionId = message.channelId;

        // Delegate to TaskOrchestrator
        const { taskId, state } = this.orchestrator.createTask({
          message,
          channelSessionId,
        });

        const result = { status: "queued", taskId, state };
        this.layerLogger.logOutput("chat.send", result, startTime);
        return result;
      });
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

    // approval.grant: Grant or deny approval for a paused task
    this.rpc.register("approval.grant", async (params) => {
      const { taskId, approved } = params as { taskId: string; approved: boolean };
      this.logger.info("Approval request", { taskId, approved });

      const success = this.orchestrator.grantApproval(taskId, approved);
      if (!success) {
        throw new Error("Failed to process approval - task not found or not in PAUSED state");
      }

      return { success: true, taskId, approved };
    });

    // approval.list: Get pending approval requests
    this.rpc.register("approval.list", async () => {
      const pending = this.orchestrator.getPendingApprovals();
      return {
        pending,
        count: pending.length,
      };
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

    // Shutdown orchestrator
    this.orchestrator.shutdown();

    this.logger.info("Gateway stopped");
  }

  /**
   * Get the orchestrator instance.
   */
  getOrchestrator(): TaskOrchestrator {
    return this.orchestrator;
  }

  /**
   * Get the session manager instance.
   */
  getSessionManager(): SessionManager | null {
    return this.sessionManager;
  }

  /**
   * Get the toolkit instance.
   */
  getToolkit(): Toolkit | null {
    return this.toolkit;
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
