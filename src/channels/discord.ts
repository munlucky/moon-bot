// Discord Channel Adapter

import {
  Client,
  GatewayIntentBits,
  Message,
  Partials,
} from "discord.js";
import type { SystemConfig, ChatMessage } from "../types/index.js";
import { createLogger, type Logger } from "../utils/logger.js";

export class DiscordAdapter {
  private client: Client | null = null;
  private config: SystemConfig;
  private gatewayUrl: string;
  private logger: Logger;
  private connected = false;

  constructor(config: SystemConfig, gatewayUrl = "ws://localhost:18789") {
    this.config = config;
    this.gatewayUrl = gatewayUrl;
    this.logger = createLogger(config);
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

    this.client.on("error", (error) => {
      this.logger.error("Discord client error", { error });
    });

    await this.client.login(discordConfig.token);
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

  private async sendToGateway(message: ChatMessage): Promise<void> {
    // TODO: Implement WebSocket client to send messages to gateway
    this.logger.debug("Sending message to gateway", { message });
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
    this.client?.destroy();
    this.connected = false;
    this.logger.info("Discord adapter stopped");
  }

  isConnected(): boolean {
    return this.connected;
  }
}
