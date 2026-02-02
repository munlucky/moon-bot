// Discord approval handler - sends Embed messages with approval buttons

import type {
  ApprovalRequest,
  ApprovalHandler,
  DiscordButtonComponent,
  DiscordEmbedMessage,
} from "../types.js";
import type { DiscordAdapter } from "../../../channels/discord.js";
import { createLogger, type Logger } from "../../../utils/logger.js";
import { truncateString, formatInputForDisplay } from "./formatUtils.js";

const BUTTON_TYPE = 2;
const BUTTON_STYLE_SUCCESS = 3;
const BUTTON_STYLE_DANGER = 4;
const ACTION_ROW_TYPE = 1;
const COLOR_YELLOW = 0xffaa00;
const COLOR_GREEN = 0x00ff00;
const COLOR_RED = 0xff0000;
const APPROVAL_BUTTON_PREFIX = "approval_";
const MAX_DISPLAY_LENGTH = 500;

/**
 * Create approval button components for Discord.
 */
export function createApprovalButtons(requestId: string): DiscordButtonComponent[] {
  return [
    {
      type: BUTTON_TYPE,
      style: BUTTON_STYLE_SUCCESS,
      label: "✅ Approve",
      custom_id: `${APPROVAL_BUTTON_PREFIX}${requestId}_approve`,
    },
    {
      type: BUTTON_TYPE,
      style: BUTTON_STYLE_DANGER,
      label: "❌ Reject",
      custom_id: `${APPROVAL_BUTTON_PREFIX}${requestId}_reject`,
    },
  ];
}

/**
 * Parse a button custom_id to extract request ID and action.
 * Returns null if the custom_id is not an approval button.
 */
export function parseButtonCustomId(
  customId: string
): { requestId: string; action: "approve" | "reject" } | null {
  if (!customId.startsWith(APPROVAL_BUTTON_PREFIX)) {
    return null;
  }

  const parts = customId.slice(APPROVAL_BUTTON_PREFIX.length).split("_");
  if (parts.length !== 2) {
    return null;
  }

  const [requestId, action] = parts;
  if (action !== "approve" && action !== "reject") {
    return null;
  }

  return { requestId, action };
}

/**
 * Format an approval request as a Discord Embed message.
 */
export function formatApprovalEmbed(request: ApprovalRequest): DiscordEmbedMessage {
  const toolInput = formatInputForDisplay(request.input);
  const expiresAt = new Date(request.expiresAt);
  const expiresIn = Math.max(0, expiresAt.getTime() - Date.now());

  const minutesLeft = Math.floor(expiresIn / 60000);
  const secondsLeft = Math.floor((expiresIn % 60000) / 1000);

  return {
    title: "🛡️ Tool Execution Approval Required",
    description: `A tool is requesting approval before execution.`,
    color: COLOR_YELLOW,
    fields: [
      {
        name: "Tool",
        value: `\`${request.toolId}\``,
        inline: true,
      },
      {
        name: "Request ID",
        value: `\`${request.id.slice(-12)}\``,
        inline: true,
      },
      {
        name: "Input",
        value: toolInput,
        inline: false,
      },
      {
        name: "Expires",
        value: `${minutesLeft}m ${secondsLeft}s`,
        inline: true,
      },
    ],
    components: [
      {
        type: ACTION_ROW_TYPE,
        components: createApprovalButtons(request.id),
      },
    ],
  };
}

/**
 * Update the Embed message after approval is resolved.
 */
export function formatApprovalUpdateEmbed(
  request: ApprovalRequest
): DiscordEmbedMessage {
  const color = request.status === "approved" ? COLOR_GREEN : COLOR_RED;
  const statusEmoji = request.status === "approved" ? "✅" : "❌";
  const statusText =
    request.status === "approved"
      ? "Approved"
      : request.status === "rejected"
        ? "Rejected"
        : "Expired";

  return {
    title: `${statusEmoji} Tool Execution ${statusText}`,
    description: `Approval request for \`${request.toolId}\` has been ${statusText.toLowerCase()}.`,
    color,
    fields: [
      {
        name: "Request ID",
        value: `\`${request.id.slice(-12)}\``,
        inline: true,
      },
      {
        name: "Responded by",
        value: request.respondedBy ?? "Unknown",
        inline: true,
      },
    ],
  };
}

/**
 * Discord approval handler implementation.
 */
export class DiscordApprovalHandler implements ApprovalHandler {
  private adapter: DiscordAdapter | null = null;
  private channelId: string | null = null;
  private messageStore: Map<string, { channelId: string; messageId: string }> = new Map();
  private logger: Logger;

  constructor(adapter?: DiscordAdapter, channelId?: string) {
    this.adapter = adapter ?? null;
    this.channelId = channelId ?? null;
    this.logger = createLogger();
  }

  /**
   * Set the Discord adapter (for dependency injection).
   */
  setAdapter(adapter: DiscordAdapter): void {
    this.adapter = adapter;
  }

  /**
   * Set the default channel ID for approval messages.
   */
  setChannelId(channelId: string): void {
    this.channelId = channelId;
  }

  /**
   * Send an approval request to Discord.
   */
  async sendRequest(request: ApprovalRequest): Promise<void> {
    if (!this.adapter) {
      return; // Silently skip if adapter not configured
    }

    const embed = formatApprovalEmbed(request);

    // Use configured channel ID
    const targetChannelId = this.channelId;

    if (!targetChannelId) {
      this.logger.warn(`[DiscordApproval] No channel ID configured for approval request ${request.id}`);
      return;
    }

    try {
      // Send actual Discord Embed message
      const message = await this.adapter.sendEmbed(targetChannelId, embed);

      if (message) {
        // Store message reference for updates
        this.messageStore.set(request.id, {
          channelId: targetChannelId,
          messageId: message.id,
        });

        this.logger.info(`[DiscordApproval] Approval request sent:`, {
          title: embed.title,
          requestId: request.id,
          toolId: request.toolId,
          messageId: message.id,
        });
      }
    } catch (error) {
      this.logger.error(`[DiscordApproval] Failed to send approval request:`, {
        error: error instanceof Error ? error.message : String(error),
        requestId: request.id,
      });
    }
  }

  /**
   * Send an update when approval is resolved.
   */
  async sendUpdate(request: ApprovalRequest): Promise<void> {
    if (!this.adapter) {
      return;
    }

    const embed = formatApprovalUpdateEmbed(request);

    // Get stored message reference
    const messageRef = this.messageStore.get(request.id);
    if (!messageRef) {
      this.logger.warn(`[DiscordApproval] No message reference for approval update ${request.id}`);
      return;
    }

    try {
      // Edit the existing message
      const success = await this.adapter.editMessage(
        messageRef.channelId,
        messageRef.messageId,
        embed
      );

      if (success) {
        this.logger.info(`[DiscordApproval] Approval update sent:`, {
          title: embed.title,
          status: request.status,
          requestId: request.id,
        });

        // Clean up message store after update
        this.messageStore.delete(request.id);
      }
    } catch (error) {
      this.logger.error(`[DiscordApproval] Failed to send approval update:`, {
        error: error instanceof Error ? error.message : String(error),
        requestId: request.id,
      });
    }
  }
}
