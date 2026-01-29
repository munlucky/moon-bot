// Core Types for Moonbot AI Agent System

export interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: string | number | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcRequest {
  id: string | number;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: JsonRpcError;
}

export interface GatewayConfig {
  port: number;
  host: string;
  auth?: {
    tokens?: Record<string, string>;
    /**
     * Allow legacy plaintext tokens (NOT RECOMMENDED).
     * Default: false (requires SHA-256 hashed tokens)
     *
     * Migration path:
     * 1. Hash existing tokens using AuthManager.hashToken()
     * 2. Update config with hashed tokens
     * 3. Set allowLegacyTokens: false
     *
     * @deprecated Use SHA-256 hashed tokens instead
     */
    allowLegacyTokens?: boolean;
  };
  allowFrom?: string[];
}

export interface SystemConfig {
  gateways: GatewayConfig[];
  agents: AgentConfig[];
  channels: ChannelConfig[];
  tools: ToolConfig[];
  storage?: StorageConfig;
}

export interface AgentConfig {
  id: string;
  name: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ChannelConfig {
  id: string;
  type: "discord" | "slack" | "telegram" | "cli";
  name?: string;
  token?: string;
  webhookUrl?: string;
  enabled: boolean;
  addedAt?: string;
  lastUpdated?: string;
}

export interface ToolConfig {
  id: string;
  enabled: boolean;
  requiresApproval?: boolean;
}

export interface StorageConfig {
  sessionsPath: string;
  logsPath: string;
}

export interface SessionMessage {
  type: "user" | "assistant" | "thought" | "tool" | "result" | "error";
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface Session {
  id: string;
  agentId: string;
  userId: string;
  channelId: string;
  messages: SessionMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface ToolContext {
  sessionId: string;
  agentId: string;
  userId: string;
  config: SystemConfig;
  workspaceRoot: string;
  policy: {
    allowlist: string[];
    denylist: string[];
    maxBytes: number;
    timeoutMs: number;
  };
}

export interface ToolSpec<TInput = unknown, TOutput = unknown> {
  id: string;
  description: string;
  schema: object;
  requiresApproval?: boolean;
  run: (input: TInput, ctx: ToolContext) => Promise<ToolResult<TOutput>>;
}

export interface ApprovalRequest {
  id: string;
  sessionId: string;
  toolId: string;
  input: unknown;
  userId: string;
  createdAt: number;
  expiresAt: number;
}

export interface ApprovalResponse {
  requestId: string;
  approved: boolean;
  userId: string;
  timestamp: number;
}

export interface ChatMessage {
  sessionId?: string;
  agentId: string;
  text: string;
  userId: string;
  channelId: string;
  metadata?: Record<string, unknown>;
}

export interface CronJob {
  id: string;
  agentId: string;
  schedule: string;
  task: ChatMessage;
  enabled: boolean;
}

export interface ConnectParams {
  clientType: string;
  version: string;
  token?: string;
}

export interface ClientInfo {
  id: string;
  type: string;
  version: string;
  connectedAt: number;
}

export interface LogEntry {
  level: "debug" | "info" | "warn" | "error";
  message: string;
  timestamp: number;
  context?: Record<string, unknown>;
}

export interface Step {
  id: string;
  description: string;
  toolId?: string;
  input?: unknown;
  dependsOn?: string[];
}

export interface ToolResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta: {
    durationMs: number;
    artifacts?: string[];
    truncated?: boolean;
  };
}

export interface ApprovalConfig {
  allowlist: {
    commands: string[];
    cwdPrefix: string[];
  };
  denylist: {
    patterns: string[];
  };
}

export interface ToolRegistry {
  register(spec: ToolSpec): void;
  unregister(id: string): void;
  get(id: string): ToolSpec | undefined;
  list(): ToolSpec[];
  has(id: string): boolean;
}
