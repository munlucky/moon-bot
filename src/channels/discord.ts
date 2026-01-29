// Discord Channel Adapter

import {
  Client,
  GatewayIntentBits,
  Message,
  Partials,
  ButtonInteraction,
} from "discord.js";
import type { SystemConfig, ChatMessage, TaskResponse } from "../types/index.js";
import { createLogger, type Logger } from "../utils/logger.js";
import { parseButtonCustomId } from "../tools/approval/handlers/discord-approval.js";
import { ChannelGatewayClient } from "./GatewayClient.js";

// Type for the gateway call method (will be available when integration is complete)
interface GatewayClient {
  call(method: string, params: unknown): Promise<unknown>;
  isConnected(): boolean;
}

export class DiscordAdapter {
  private client: Client | null = null;
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
    const discordConfig = this.config.channels.find((c) => c.type === "discord");
    if (!discordConfig || !discordConfig.enabled || !discordConfig.token) {
      this.logger.info("Discord channel not configured or disabled");
      return;
    }

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
      partials: [Partials.Channel],
    });

    this.client.on("ready", () => {
      this.logger.info(`Discord bot logged in as ${this.client?.user?.tag}`);
      this.connected = true;
    });

    this.client.on("messageCreate", async (message: Message) => {
      await this.handleMessage(message);
    });

    this.client.on("interactionCreate", async (interaction) => {
      await this.handleInteraction(interaction);
    });

    this.client.on("error", (error) => {
      this.logger.error("Discord client error", { error });
    });

    await this.client.login(discordConfig.token);

    // Connect to Gateway
    await this.connectToGateway();
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
      // Don't throw - Discord can still operate, just won't send to Gateway
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

  private async handleMessage(message: Message): Promise<void> {
    // Ignore bot messages
    if (message.author.bot) return;

    // Check for mention gating in guild channels
    if (message.inGuild()) {
      const botId = this.client?.user?.id;
      const hasMention = message.mentions.has(botId ?? "");

      if (!hasMention) {
        return; // Only respond when mentioned
      }
    }

    // Extract text (remove mention if present)
    let text = message.content;
    const botId = this.client?.user?.id;
    if (message.inGuild() && botId) {
      const mention = `<@${botId}>`;
      if (text.startsWith(mention)) {
        text = text.slice(mention.length).trim();
      }
    }

    // Build chat message
    const chatMessage: ChatMessage = {
      agentId: this.config.agents[0]?.id || "default",
      text,
      userId: message.author.id,
      channelId: message.channelId,
      metadata: {
        guildId: message.guildId,
        channelType: message.channel.type,
      },
    };

    this.logger.info(`Message from Discord: ${text}`);

    // Send to gateway via WebSocket
    // TODO: Implement WebSocket client to communicate with gateway
    await this.sendToGateway(chatMessage);

    // Handle attachments
    if (message.attachments.size > 0) {
      this.logger.info(`Message has ${message.attachments.size} attachment(s)`);
    }
  }

  /**
   * Handle interaction create events (button clicks, etc.).
   */
  private async handleInteraction(interaction: unknown): Promise<void> {
    if (!(interaction instanceof ButtonInteraction)) {
      return;
    }

    const parsed = parseButtonCustomId(interaction.customId);
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
          userId: interaction.user.id,
        });

        // Update the interaction message
        const emoji = parsed.action === "approve" ? "✅" : "❌";
        const text = parsed.action === "approve" ? "Approved" : "Rejected";
        await interaction.update({
          content: `${emoji} ${text} your response has been recorded.`,
          components: [],
        });
      } catch (error) {
        this.logger.error("Failed to process approval response", { error });
        await interaction.reply({
          content: "Failed to process your response. Please try again.",
          ephemeral: true,
        });
      }
    } else {
      this.logger.warn("Gateway client not available for approval response");
      await interaction.reply({
        content: "Gateway not connected. Please try again later.",
        ephemeral: true,
      });
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
    if (!this.client) return;

    try {
      const channel = await this.client.channels.fetch(channelId);
      if (channel?.isSendable()) {
        await channel.send(text);
      }
    } catch (error) {
      this.logger.error(`Failed to send message to channel ${channelId}`, { error });
    }
  }

  stop(): void {
    this.channelGatewayClient?.disconnect();
    this.client?.destroy();
    this.connected = false;
    this.logger.info("Discord adapter stopped");
  }

  isConnected(): boolean {
    return this.connected;
  }
}
