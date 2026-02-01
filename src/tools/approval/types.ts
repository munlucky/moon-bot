// Approval system types for Phase 2: Approval UI Flow Integration

import type { ToolResult } from "../../types/index.js";

export interface ApprovalRequest {
  id: string;
  invocationId: string;
  toolId: string;
  sessionId: string;
  input: unknown;
  status: "pending" | "approved" | "rejected" | "expired";
  userId: string;
  createdAt: number;
  expiresAt: number;
  respondedBy?: string;
  respondedAt?: number;
}

export interface ApprovalResponse {
  requestId: string;
  approved: boolean;
  userId: string;
  timestamp: number;
}

export interface ApprovalNotification {
  request: ApprovalRequest;
  surfaces: Array<"discord" | "slack" | "cli" | "websocket">;
}

export interface DiscordButtonComponent {
  type: number;
  style: number;
  label: string;
  custom_id: string;
}

export interface DiscordEmbedMessage {
  title: string;
  description: string;
  color: number;
  fields: Array<{ name: string; value: string; inline: boolean }>;
  components?: Array<{ type: number; components: DiscordButtonComponent[] }>;
}

// Slack Block Kit types
import type { Block } from "@slack/types";

export interface SlackBlockMessage {
  blocks: Block[];
  fallbackText: string;
}

export interface ApprovalHandler {
  sendRequest(request: ApprovalRequest): Promise<void>;
  sendUpdate(request: ApprovalRequest): Promise<void>;
}

export interface ApprovalFlowEvents {
  "approval.requested": (data: {
    invocationId: string;
    toolId: string;
    input: unknown;
    sessionId: string;
    userId: string;
  }) => void;
  "approval.resolved": (data: {
    requestId: string;
    approved: boolean;
    result?: ToolResult;
  }) => void;
}

export interface ApprovalStoreData {
  requests: ApprovalRequest[];
}
