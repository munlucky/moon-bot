// Slack Channel Adapter

import { App, type AppMentionEvent, type ButtonAction } from "@slack/bolt";
import type { SystemConfig, ChatMessage, TaskResponse } from "../types/index.js";
import { createLogger, type Logger } from "../utils/logger.js";
import { parseButtonActionId } from "../tools/approval/handlers/slack-approval.js";
import { ChannelGatewayClient } from "./GatewayClient.js";
import type { SlackBlockMessage } from "../tools/approval/types.js";

// Type for the gateway call method (will be available when integration is complete)
interface GatewayClient {
  call(_method: string, _params: unknown): Promise<unknown>;
  isConnected(): boolean;
}

export class SlackAdapter {
  private app: App | null = null;
  private config: SystemConfig;
  private gatewayUrl: string;
  private gatewayClient: GatewayClient | null = null;
  private channelGatewayClient: ChannelGatewayClient | null = null;
  private logger: Logger;
  private connected = false;

  constructor(config: SystemConfig, gatewayUrl = "ws://localhost:18789") {
    this.config = config;
    this.gatewayUrl = gatewayUrl;
    this.logger = createLogger(config);
  }

  /**
   * Set the gateway client for RPC calls.
   */
  setGatewayClient(client: GatewayClient): void {
    this.gatewayClient = client;
  }

  /**
   * Get the gateway client.
   */
  getGatewayClient(): GatewayClient | null {
    return this.gatewayClient;
  }

  async start(): Promise<void> {
    const slackConfig = this.config.channels.find((c) => c.type === "slack");
    if (!slackConfig || !slackConfig.enabled || !slackConfig.token) {
      this.logger.info("Slack channel not configured or disabled");
      return;
    }

    // Initialize Slack Bolt App
    this.app = new App({
      token: slackConfig.token,
      signingSecret: slackConfig.webhookUrl || process.env.SLACK_SIGNING_SECRET || "",
    });

    // Handle app_mention events
    this.app.event("app_mention", async ({ event, say }) => {
      await this.handleAppMention(event as AppMentionEvent, say);
    });

    // Handle button interactions
    this.app.action(/^approval_/, async ({ body, ack, respond }) => {
      await this.handleButtonInteraction(body, ack, respond);
    });

    // Handle errors
    this.app.error(async (error) => {
      this.logger.error("Slack app error", { error });
    });

    // Start the app (using Socket Mode for simplicity)
    try {
      await this.app.start();
      this.logger.info("Slack bot started");
      this.connected = true;

      // Connect to Gateway
      await this.connectToGateway();
    } catch (error) {
      this.logger.error("Failed to start Slack app", { error });
      throw error;
    }
  }

  /**
   * Connect to Gateway server and set up notification handlers.
   */
  private async connectToGateway(): Promise<void> {
    this.channelGatewayClient = new ChannelGatewayClient({
      url: this.gatewayUrl,
      reconnectInterval: 5000,
      maxReconnectAttempts: 10,
    });

    this.channelGatewayClient.on("notification", (method: string, params: unknown) => {
      if (method === "chat.response") {
        this.handleAgentResponse(params).catch((error) => {
          this.logger.error("Failed to handle agent response", { error });
        });
      }
    });

    this.channelGatewayClient.on("connected", () => {
      this.logger.info("Connected to Gateway");
    });

    this.channelGatewayClient.on("disconnected", () => {
      this.logger.warn("Disconnected from Gateway");
    });

    this.channelGatewayClient.on("reconnecting", (attempt: number) => {
      this.logger.info(`Reconnecting to Gateway (attempt ${attempt})`);
    });

    this.channelGatewayClient.on("error", (error: Error) => {
      this.logger.error("Gateway client error", { error });
    });

    try {
      await this.channelGatewayClient.connect();
    } catch (error) {
      this.logger.error("Failed to connect to Gateway", { error });
      // Don't throw - Slack can still operate, just won't send to Gateway
    }
  }

  /**
   * Handle agent response from Gateway.
   */
  private async handleAgentResponse(params: unknown): Promise<void> {
    const response = params as TaskResponse;
    if (!response.channelId || !response.text) {
      this.logger.warn("Invalid agent response", { params });
      return;
    }

    await this.sendToChannel(response.channelId, response.text);
  }

  /**
   * Handle app_mention events from Slack.
   */
  private async handleAppMention(
    event: AppMentionEvent
    // _say: (textOrBlock: string | Record<string, unknown>) => Promise<unknown> - Reserved for future use
  ): Promise<void> {
    // Extract text (remove bot mention)
    let text = event.text;

    // Remove mention format: <@USER_ID> - remove all user mentions
    const mentionPattern = /<@[A-Z0-9]+>/g;
    text = text.replace(mentionPattern, "").trim();

    // Build chat message
    const chatMessage: ChatMessage = {
      agentId: this.config.agents[0]?.id || "default",
      text,
      userId: event.user ?? "unknown",
      channelId: event.channel,
      metadata: {
        teamId: event.team,
        eventType: event.type,
      },
    };

    this.logger.info(`Message from Slack: ${text}`);

    await this.sendToGateway(chatMessage);

    // Handle attachments (Slack files)
    if (event.files && event.files.length > 0) {
      this.logger.info(`Message has ${event.files.length} file(s)`);
    }
  }

  /**
   * Handle button interaction events (approval requests).
   */
  private async handleButtonInteraction(
    body: unknown,
    ack: () => Promise<void>
    // _respond: (response: Record<string, unknown>) => Promise<unknown> - Reserved for future use
  ): Promise<void> {
    // Acknowledge the interaction first (must be done within 3 seconds)
    await ack();

    const action = body as Record<string, unknown>;
    const actions = action.actions as Array<ButtonAction>;

    if (!actions || actions.length === 0) {
      return;
    }

    const buttonAction = actions[0];
    const parsed = parseButtonActionId(buttonAction.action_id);

    if (!parsed) {
      return; // Not an approval button
    }

    this.logger.info(`Approval button clicked: ${parsed.action} for ${parsed.requestId}`);

    // Call approval.respond RPC via gateway
    if (this.gatewayClient) {
      try {
        await this.gatewayClient.call("approval.respond", {
          requestId: parsed.requestId,
          approved: parsed.action === "approve",
          userId: (action.user as Record<string, string>).id,
        });
        this.logger.info(`Approval response recorded: ${parsed.action}`);
      } catch (error) {
        this.logger.error("Failed to process approval response", { error });
      }
    } else {
      this.logger.warn("Gateway client not available for approval response");
    }
  }

  private async sendToGateway(message: ChatMessage): Promise<void> {
    // Use ChannelGatewayClient if available
    if (this.channelGatewayClient?.isConnected()) {
      try {
        await this.channelGatewayClient.call("chat.send", message);
        this.logger.debug("Message sent to Gateway via WebSocket", { message });
        return;
      } catch (error) {
        this.logger.error("Failed to send message via WebSocket", { error });
      }
    }

    // Fallback to legacy gatewayClient if set
    if (this.gatewayClient?.isConnected()) {
      try {
        await this.gatewayClient.call("chat.send", message);
        this.logger.debug("Message sent to Gateway via legacy client", { message });
        return;
      } catch (error) {
        this.logger.error("Failed to send message via legacy client", { error });
      }
    }

    this.logger.warn("No Gateway connection available, message not sent", { message });
  }

  async sendToChannel(channelId: string, text: string): Promise<void> {
    if (!this.app) {
      this.logger.warn("Slack app not available for sending message");
      return;
    }

    try {
      await this.app.client.chat.postMessage({
        channel: channelId,
        text,
      });
    } catch (error) {
      this.logger.error(`Failed to send message to channel ${channelId}`, { error });
    }
  }

  /**
   * Send a Block Kit message with optional buttons to a channel.
   * Used for approval requests and other rich messages.
   */
  async sendBlocks(
    channelId: string,
    blocks: SlackBlockMessage
  ): Promise<string | null> {
    if (!this.app) {
      this.logger.warn("Slack app not available for block sending");
      return null;
    }

    try {
      const result = await this.app.client.chat.postMessage({
        channel: channelId,
        blocks: blocks.blocks,
        text: blocks.fallbackText || "Message",
      });

      const messageId = result.ts;
      if (!messageId) {
        this.logger.warn(`No message ID returned for channel ${channelId}`);
        return null;
      }

      this.logger.debug(`Blocks sent to channel ${channelId}`, {
        messageId,
      });

      return messageId;
    } catch (error) {
      this.logger.error(`Failed to send blocks to channel ${channelId}`, { error });
      return null;
    }
  }

  /**
   * Update an existing message (e.g., to update approval status).
   */
  async updateMessage(
    channelId: string,
    messageTs: string,
    blocks: SlackBlockMessage
  ): Promise<boolean> {
    if (!this.app) {
      this.logger.warn("Slack app not available for message updating");
      return false;
    }

    try {
      await this.app.client.chat.update({
        channel: channelId,
        ts: messageTs,
        blocks: blocks.blocks,
        text: blocks.fallbackText || "Message",
      });

      this.logger.debug(`Message ${messageTs} updated in channel ${channelId}`);

      return true;
    } catch (error) {
      this.logger.error(
        `Failed to update message ${messageTs} in channel ${channelId}`,
        { error }
      );
      return false;
    }
  }

  stop(): void {
    this.channelGatewayClient?.disconnect();
    this.app?.stop();
    this.connected = false;
    this.logger.info("Slack adapter stopped");
  }

  isConnected(): boolean {
    return this.connected;
  }
}
