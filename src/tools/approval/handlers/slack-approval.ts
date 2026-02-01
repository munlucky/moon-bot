// Slack approval handler - sends Block Kit messages with approval buttons

import type {
  KnownBlock,
  ActionsBlock,
  SectionBlock,
  HeaderBlock,
} from "@slack/types";
import type {
  ApprovalRequest,
  ApprovalHandler,
  SlackBlockMessage,
} from "../types.js";
import type { SlackAdapter } from "../../../channels/slack.js";

/**
 * Create approval button elements for Slack Block Kit.
 */
export function createApprovalButtons(requestId: string): ActionsBlock["elements"] {
  return [
    {
      type: "button",
      text: {
        type: "plain_text",
        text: ":white_check_mark: Approve",
        emoji: true,
      },
      style: "primary",
      action_id: `approval_${requestId}_approve`,
    },
    {
      type: "button",
      text: {
        type: "plain_text",
        text: ":x: Reject",
        emoji: true,
      },
      style: "danger",
      action_id: `approval_${requestId}_reject`,
    },
  ];
}

/**
 * Parse a button action_id to extract request ID and action.
 * Returns null if the action_id is not an approval button.
 */
export function parseButtonActionId(
  actionId: string
): { requestId: string; action: "approve" | "reject" } | null {
  const prefix = "approval_";
  if (!actionId.startsWith(prefix)) {
    return null;
  }

  const parts = actionId.slice(prefix.length).split("_");
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
 * Format an approval request as a Slack Block Kit message.
 */
export function formatApprovalBlocks(request: ApprovalRequest): SlackBlockMessage {
  const toolInput = formatInputForDisplay(request.input);
  const expiresAt = new Date(request.expiresAt);
  const expiresIn = Math.max(0, expiresAt.getTime() - Date.now());

  const minutesLeft = Math.floor(expiresIn / 60000);
  const secondsLeft = Math.floor((expiresIn % 60000) / 1000);

  const blocks: KnownBlock[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: ":shield: Tool Execution Approval Required",
        emoji: true,
      },
    } as HeaderBlock,
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "A tool is requesting approval before execution.",
      },
    } as SectionBlock,
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Tool:*\n\`${request.toolId}\``,
        },
        {
          type: "mrkdwn",
          text: `*Request ID:*\n\`${request.id.slice(-12)}\``,
        },
      ],
    } as SectionBlock,
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Input:*\n${toolInput}`,
      },
    } as SectionBlock,
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Expires:*\n${minutesLeft}m ${secondsLeft}s`,
        },
      ],
    } as SectionBlock,
    {
      type: "actions",
      elements: createApprovalButtons(request.id),
    } as ActionsBlock,
  ];

  return {
    blocks,
    fallbackText: "Tool Execution Approval Required",
  };
}

/**
 * Format tool input for display in Slack message.
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
 * Update the Block Kit message after approval is resolved.
 */
export function formatApprovalUpdateBlocks(request: ApprovalRequest): SlackBlockMessage {
  const statusEmoji =
    request.status === "approved"
      ? ":white_check_mark:"
      : request.status === "rejected"
        ? ":x:"
        : ":warning:";
  const statusText =
    request.status === "approved"
      ? "Approved"
      : request.status === "rejected"
        ? "Rejected"
        : "Expired";

  const blocks: KnownBlock[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${statusEmoji} Tool Execution ${statusText}`,
        emoji: true,
      },
    } as HeaderBlock,
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `Approval request for \`${request.toolId}\` has been *${statusText.toLowerCase()}*.`,
      },
    } as SectionBlock,
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Request ID:*\n\`${request.id.slice(-12)}\``,
        },
        {
          type: "mrkdwn",
          text: `*Responded by:*\n${request.respondedBy ?? "Unknown"}`,
        },
      ],
    } as SectionBlock,
  ];

  return {
    blocks,
    fallbackText: `Tool Execution ${statusText}`,
  };
}

/**
 * Slack approval handler implementation.
 */
export class SlackApprovalHandler implements ApprovalHandler {
  private adapter: SlackAdapter | null = null;
  private channelId: string | null = null;
  private messageStore: Map<string, { channelId: string; messageTs: string }> = new Map();

  constructor(adapter?: SlackAdapter, channelId?: string) {
    this.adapter = adapter ?? null;
    this.channelId = channelId ?? null;
  }

  /**
   * Set the Slack adapter (for dependency injection).
   */
  setAdapter(adapter: SlackAdapter): void {
    this.adapter = adapter;
  }

  /**
   * Set the default channel ID for approval messages.
   */
  setChannelId(channelId: string): void {
    this.channelId = channelId;
  }

  /**
   * Send an approval request to Slack.
   */
  async sendRequest(request: ApprovalRequest): Promise<void> {
    if (!this.adapter) {
      return; // Silently skip if adapter not configured
    }

    const blocks = formatApprovalBlocks(request);

    // Use configured channel ID
    const targetChannelId = this.channelId;

    if (!targetChannelId) {
      console.warn(`[SlackApproval] No channel ID configured for approval request ${request.id}`);
      return;
    }

    try {
      // Send actual Slack Block Kit message
      const messageTs = await this.adapter.sendBlocks(targetChannelId, blocks);

      if (messageTs) {
        // Store message reference for updates
        this.messageStore.set(request.id, {
          channelId: targetChannelId,
          messageTs,
        });

        console.log(`[SlackApproval] Approval request sent:`, {
          fallbackText: blocks.fallbackText,
          requestId: request.id,
          toolId: request.toolId,
          messageTs,
        });
      }
    } catch (error) {
      console.error(`[SlackApproval] Failed to send approval request:`, {
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

    const blocks = formatApprovalUpdateBlocks(request);

    // Get stored message reference
    const messageRef = this.messageStore.get(request.id);
    if (!messageRef) {
      console.warn(`[SlackApproval] No message reference for approval update ${request.id}`);
      return;
    }

    try {
      // Update the existing message
      const success = await this.adapter.updateMessage(
        messageRef.channelId,
        messageRef.messageTs,
        blocks
      );

      if (success) {
        console.log(`[SlackApproval] Approval update sent:`, {
          fallbackText: blocks.fallbackText,
          status: request.status,
          requestId: request.id,
        });

        // Clean up message store after update
        this.messageStore.delete(request.id);
      }
    } catch (error) {
      console.error(`[SlackApproval] Failed to send approval update:`, {
        error: error instanceof Error ? error.message : String(error),
        requestId: request.id,
      });
    }
  }
}
