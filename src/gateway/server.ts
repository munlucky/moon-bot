// WebSocket Gateway Server
//
// Refactored to use:
// - ConnectionRateLimiter: rate limiting (Phase 1)
// - GatewayAuthenticator: authentication (Phase 2)
// - NodeCommunicator: node communication (Phase 2)

import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";
import type { SystemConfig, ClientInfo, ConnectParams, ChatMessage } from "../types/index.js";
import { JsonRpcServer } from "./json-rpc.js";
import { createLogger, type Logger, type LayerLogger, runWithTraceAsync } from "../utils/logger.js";
import { ToolRuntime } from "../tools/runtime/ToolRuntime.js";
import { createToolHandlers } from "./handlers/tools.handler.js";
import { createChannelHandlers } from "./handlers/channel.handler.js";
import { createNodesHandlers } from "./handlers/nodes.handler.js";
import { NodeSessionManager, NodeCommandValidator } from "../tools/nodes/index.js";
import { saveConfig } from "../config/manager.js";
import { TaskOrchestrator } from "../orchestrator/index.js";
import { createGatewayTools, type Toolkit, type ToolkitWithResources } from "../tools/index.js";
import { SessionManager } from "../sessions/manager.js";
import { Executor } from "../agents/executor.js";
import { ConnectionRateLimiter } from "./ConnectionRateLimiter.js";
import { GatewayAuthenticator } from "./GatewayAuthenticator.js";
import { NodeCommunicator } from "./NodeCommunicator.js";

export class GatewayServer {
  private wss: WebSocketServer | null = null;
  private rpc: JsonRpcServer;
  private clients = new Map<string, ClientInfo>();
  private sockets = new Map<string, WebSocket>();
  private config: SystemConfig;
  private logger: Logger;
  private layerLogger: LayerLogger;
  private authenticator: GatewayAuthenticator;
  private rateLimiter: ConnectionRateLimiter;
  private nodeCommunicator: NodeCommunicator;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private toolRuntime: ToolRuntime | null = null;
  private toolkit: Toolkit | null = null;
  private sessionManager: SessionManager | null = null;
  private executor: Executor | null = null;
  private orchestrator!: TaskOrchestrator; // Definitely assigned in initializeDependencies
  private nodeSessionManager: NodeSessionManager;
  private nodeCommandValidator: NodeCommandValidator;

  constructor(config: SystemConfig, workspaceRoot?: string) {
    this.config = config;
    this.logger = createLogger(config);
    this.layerLogger = this.logger.forLayer("gateway");
    this.rpc = new JsonRpcServer();

    // Initialize rate limiter
    this.rateLimiter = new ConnectionRateLimiter({
      windowMs: 60000, // 1 minute window
      maxAttempts: 10, // max 10 connections per minute per IP
    });

    // Initialize authenticator (depends on rate limiter)
    this.authenticator = new GatewayAuthenticator(config, this.rateLimiter);

    // Initialize node managers
    this.nodeSessionManager = new NodeSessionManager({
      pairingCodeTtlMs: 5 * 60 * 1000, // 5 minutes
      sessionTimeoutMs: 60 * 60 * 1000, // 1 hour
      maxNodesPerUser: 5,
    });
    this.nodeCommandValidator = new NodeCommandValidator({
      maxOutputSize: 10 * 1024 * 1024, // 10MB
      maxArgvLength: 10000,
    });

    // Initialize node communicator
    this.nodeCommunicator = new NodeCommunicator({
      nodeSessionManager: this.nodeSessionManager,
      getSockets: () => this.sockets,
      logger: this.logger,
    });

    // Note: toolRuntime will be initialized from Toolkit in initializeDependencies()
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

    // Set up NodeExecutor RPC sender
    const nodeExecutor = (this.toolkit as unknown as ToolkitWithResources).nodeExecutor;
    if (nodeExecutor) {
      nodeExecutor.setRpcSender(
        (nodeId: string, method: string, params: unknown, options?: { timeoutMs?: number }) =>
          this.nodeCommunicator.sendToNodeAndWait(nodeId, method, params, options)
      );
      this.logger.info("NodeExecutor RPC sender configured");
    }

    this.logger.info("Dependencies initialized", {
      hasToolkit: !!this.toolkit,
      hasToolRuntime: !!this.toolRuntime,
      hasSessionManager: !!this.sessionManager,
      hasExecutor: !!this.executor,
      hasNodeExecutor: !!nodeExecutor,
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
      saveConfig(newConfig).catch(error => {
        this.logger.error("Failed to save config", { error });
      });
    });
    this.rpc.registerBatch(channelHandlers);

    // Register nodes handlers
    const nodesHandlers = createNodesHandlers(
      this.nodeSessionManager,
      this.nodeCommandValidator,
      this.config,
      (nodeId, message) => this.nodeCommunicator.sendToNode(nodeId, message)
    );
    this.rpc.registerBatch(nodesHandlers);

    // connect: Handshake and client registration
    this.rpc.register("connect", async (params) => {
      const { clientType, version, token } = params as ConnectParams;

      // Validate authentication
      this.authenticator.validateToken(token ?? "");

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

      return runWithTraceAsync("gateway", async () => {
        const startTime = Date.now();
        this.layerLogger.logInput("chat.send", { channelId: message.channelId, text: message.text });

        const channelSessionId = message.channelId;

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
      }, 60000);

      this.wss.on("listening", () => {
        this.logger.info(`Gateway listening on ${host}:${port}`);
        resolve();
      });

      this.wss.on("error", (error) => {
        this.logger.error("Gateway error", { error });
        reject(error);
      });

      this.wss.on("connection", (ws, req) => {
        const socketId = randomUUID();
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
          this.nodeCommunicator.handleNodeDisconnect(socketId);
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

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.nodeCommunicator.shutdown();
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

  /**
   * Get the node session manager instance.
   */
  getNodeSessionManager(): NodeSessionManager {
    return this.nodeSessionManager;
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
