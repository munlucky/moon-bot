// Discord approval handler - sends Embed messages with approval buttons

import type {
  ApprovalRequest,
  ApprovalHandler,
  DiscordButtonComponent,
  DiscordEmbedMessage,
} from "../types.js";
import type { DiscordAdapter } from "../../../channels/discord.js";

/**
 * Create approval button components for Discord.
 */
export function createApprovalButtons(requestId: string): DiscordButtonComponent[] {
  return [
    {
      type: 2, // BUTTON
      style: 3, // SUCCESS (green)
      label: "✅ Approve",
      custom_id: `approval_${requestId}_approve`,
    },
    {
      type: 2, // BUTTON
      style: 4, // DANGER (red)
      label: "❌ Reject",
      custom_id: `approval_${requestId}_reject`,
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
  const prefix = "approval_";
  if (!customId.startsWith(prefix)) {
    return null;
  }

  const parts = customId.slice(prefix.length).split("_");
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
    color: 0xffaa00, // Yellow for pending
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
        type: 1, // ACTION_ROW
        components: createApprovalButtons(request.id),
      },
    ],
  };
}

/**
 * Format tool input for display in Discord message.
 * Truncates long inputs to prevent message overflow.
 */
function formatInputForDisplay(input: unknown): string {
  if (input === null || input === undefined) {
    return "`(empty)`";
  }

  if (typeof input === "string") {
    return truncateString(input, 500);
  }

  if (typeof input === "object") {
    // For system.run, extract command and cwd
    const obj = input as Record<string, unknown>;
    if ("argv" in obj) {
      const argv = obj.argv as string | string[];
      const command = Array.isArray(argv) ? argv.join(" ") : argv;
      const cwd = obj.cwd as string | undefined;
      const result = `\`\`\`\n${command}${cwd ? `\n(cwd: ${cwd})` : ""}\n\`\`\``;
      return truncateString(result, 500);
    }
    const json = JSON.stringify(input, null, 2);
    return truncateString(`\`\`\`json\n${json}\n\`\`\``, 500);
  }

  return `\`\`\`${String(input)}\`\`\``;
}

/**
 * Truncate a string to a maximum length.
 */
function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength - 3) + "...";
}

/**
 * Update the Embed message after approval is resolved.
 */
export function formatApprovalUpdateEmbed(
  request: ApprovalRequest
): DiscordEmbedMessage {
  const color = request.status === "approved" ? 0x00ff00 : 0xff0000; // Green or Red
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

  constructor(adapter?: DiscordAdapter, channelId?: string) {
    this.adapter = adapter ?? null;
    this.channelId = channelId ?? null;
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
      console.warn(`[DiscordApproval] No channel ID configured for approval request ${request.id}`);
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

        console.log(`[DiscordApproval] Approval request sent:`, {
          title: embed.title,
          requestId: request.id,
          toolId: request.toolId,
          messageId: message.id,
        });
      }
    } catch (error) {
      console.error(`[DiscordApproval] Failed to send approval request:`, {
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
      console.warn(`[DiscordApproval] No message reference for approval update ${request.id}`);
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
        console.log(`[DiscordApproval] Approval update sent:`, {
          title: embed.title,
          status: request.status,
          requestId: request.id,
        });

        // Clean up message store after update
        this.messageStore.delete(request.id);
      }
    } catch (error) {
      console.error(`[DiscordApproval] Failed to send approval update:`, {
        error: error instanceof Error ? error.message : String(error),
        requestId: request.id,
      });
    }
  }
}
