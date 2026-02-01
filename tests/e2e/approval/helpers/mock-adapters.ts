// Mock channel adapters for E2E testing
// Provides in-memory Slack/Discord adapter implementations

import { EventEmitter } from "events";
import type { SlackBlockMessage } from "../../../../dist/tools/approval/types.js";
import type { DiscordEmbedMessage } from "../../../../dist/tools/approval/types.js";

/**
 * Mock Slack adapter for testing.
 */
export class MockSlackAdapter extends EventEmitter {
  private messages = new Map<string, Array<{ blocks: SlackBlockMessage; ts: string }>>();
  private connected = false;

  /**
   * Start the mock adapter.
   */
  async start(): Promise<void> {
    this.connected = true;
    this.emit("connected");
  }

  /**
   * Stop the mock adapter.
   */
  stop(): void {
    this.connected = false;
    this.emit("disconnected");
  }

  /**
   * Send blocks to a channel.
   */
  async sendBlocks(
    channelId: string,
    blocks: SlackBlockMessage
  ): Promise<string | null> {
    if (!this.connected) {
      throw new Error("Slack adapter not connected");
    }

    const timestamp = `${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;

    if (!this.messages.has(channelId)) {
      this.messages.set(channelId, []);
    }

    this.messages.get(channelId)!.push({
      blocks,
      ts: timestamp,
    });

    this.emit("messageSent", { channelId, blocks, timestamp });
    return timestamp;
  }

  /**
   * Update an existing message.
   */
  async updateMessage(
    channelId: string,
    messageTs: string,
    blocks: SlackBlockMessage
  ): Promise<boolean> {
    if (!this.connected) {
      throw new Error("Slack adapter not connected");
    }

    const messages = this.messages.get(channelId);
    if (!messages) {
      return false;
    }

    const index = messages.findIndex((m) => m.ts === messageTs);
    if (index < 0) {
      return false;
    }

    messages[index].blocks = blocks;
    this.emit("messageUpdated", { channelId, messageTs, blocks });
    return true;
  }

  /**
   * Simulate a button click.
   */
  simulateButtonClick(channelId: string, actionId: string, userId: string): void {
    const parsed = this.parseActionId(actionId);
    if (!parsed) {
      throw new Error(`Invalid action ID: ${actionId}`);
    }

    this.emit("buttonClicked", {
      channelId,
      action: parsed.action,
      requestId: parsed.requestId,
      userId,
    });
  }

  /**
   * Parse button action ID.
   */
  private parseActionId(actionId: string): { action: string; requestId: string } | null {
    const match = actionId.match(/^approval_(approve|reject)_(.+)$/);
    if (!match) {
      return null;
    }
    return {
      action: match[1],
      requestId: match[2],
    };
  }

  /**
   * Get all messages for a channel.
   */
  getMessages(channelId: string): Array<{ blocks: SlackBlockMessage; ts: string }> {
    return this.messages.get(channelId) || [];
  }

  /**
   * Clear all messages.
   */
  clearMessages(): void {
    this.messages.clear();
  }

  /**
   * Check if connected.
   */
  isConnected(): boolean {
    return this.connected;
  }
}

/**
 * Mock Discord adapter for testing.
 */
export class MockDiscordAdapter extends EventEmitter {
  private messages = new Map<string, Array<{ embed: DiscordEmbedMessage; id: string }>>();
  private connected = false;
  private messageIdCounter = 1;

  /**
   * Start the mock adapter.
   */
  async start(): Promise<void> {
    this.connected = true;
    this.emit("connected");
  }

  /**
   * Stop the mock adapter.
   */
  stop(): void {
    this.connected = false;
    this.emit("disconnected");
  }

  /**
   * Send an embed to a channel.
   */
  async sendEmbed(
    channelId: string,
    embed: DiscordEmbedMessage
  ): Promise<string | null> {
    if (!this.connected) {
      throw new Error("Discord adapter not connected");
    }

    const messageId = `msg_${this.messageIdCounter++}`;

    if (!this.messages.has(channelId)) {
      this.messages.set(channelId, []);
    }

    this.messages.get(channelId)!.push({
      embed,
      id: messageId,
    });

    this.emit("messageSent", { channelId, embed, messageId });
    return messageId;
  }

  /**
   * Edit an existing message.
   */
  async editMessage(
    channelId: string,
    messageId: string,
    embed: DiscordEmbedMessage
  ): Promise<boolean> {
    if (!this.connected) {
      throw new Error("Discord adapter not connected");
    }

    const messages = this.messages.get(channelId);
    if (!messages) {
      return false;
    }

    const index = messages.findIndex((m) => m.id === messageId);
    if (index < 0) {
      return false;
    }

    messages[index].embed = embed;
    this.emit("messageUpdated", { channelId, messageId, embed });
    return true;
  }

  /**
   * Simulate a button click.
   */
  simulateButtonClick(channelId: string, customId: string, userId: string): void {
    const parsed = this.parseCustomId(customId);
    if (!parsed) {
      throw new Error(`Invalid custom ID: ${customId}`);
    }

    this.emit("buttonClicked", {
      channelId,
      action: parsed.action,
      requestId: parsed.requestId,
      userId,
    });
  }

  /**
   * Parse button custom ID.
   */
  private parseCustomId(customId: string): { action: string; requestId: string } | null {
    const match = customId.match(/^approval_(approve|reject)_(.+)$/);
    if (!match) {
      return null;
    }
    return {
      action: match[1],
      requestId: match[2],
    };
  }

  /**
   * Get all messages for a channel.
   */
  getMessages(channelId: string): Array<{ embed: DiscordEmbedMessage; id: string }> {
    return this.messages.get(channelId) || [];
  }

  /**
   * Clear all messages.
   */
  clearMessages(): void {
    this.messages.clear();
  }

  /**
   * Check if connected.
   */
  isConnected(): boolean {
    return this.connected;
  }
}
