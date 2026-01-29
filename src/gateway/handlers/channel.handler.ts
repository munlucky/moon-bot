/**
 * Channel RPC handlers for the Gateway
 */

import type { JsonRpcHandler } from "../json-rpc.js";
import type { SystemConfig, ChannelConfig } from "../../types/index.js";
import { maskToken } from "../../config/manager.js";

/**
 * Create channel RPC handlers map.
 */
export function createChannelHandlers(
  config: SystemConfig,
  updateConfig: (newConfig: SystemConfig) => void
): Map<string, JsonRpcHandler> {
  const handlers = new Map<string, JsonRpcHandler>();

  // channel.list: Return all channels with masked tokens
  handlers.set("channel.list", async () => {
    const channels = config.channels.map(c => ({
      ...c,
      token: c.token ? maskToken(c.token) : undefined
    }));

    return {
      channels,
      count: channels.length
    };
  });

  // channel.add: Add a new channel
  handlers.set("channel.add", async (params) => {
    const { channel } = params as { channel: ChannelConfig };

    if (!channel.id || !channel.type) {
      throw new Error("Channel must have id and type");
    }

    // Check for duplicate ID
    const existing = config.channels.find(c => c.id === channel.id);
    if (existing) {
      throw new Error(`Channel with ID "${channel.id}" already exists`);
    }

    // Add timestamps
    const newChannel: ChannelConfig = {
      ...channel,
      addedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    };

    config.channels.push(newChannel);
    updateConfig(config);

    return {
      success: true,
      channel: {
        ...newChannel,
        token: newChannel.token ? maskToken(newChannel.token) : undefined
      }
    };
  });

  // channel.remove: Remove a channel
  handlers.set("channel.remove", async (params) => {
    const { channelId } = params as { channelId: string };

    if (!channelId) {
      throw new Error("channelId is required");
    }

    const index = config.channels.findIndex(c => c.id === channelId);
    if (index === -1) {
      throw new Error(`Channel with ID "${channelId}" not found`);
    }

    const removed = config.channels.splice(index, 1)[0];
    updateConfig(config);

    return {
      success: true,
      channel: {
        ...removed,
        token: removed.token ? maskToken(removed.token) : undefined
      }
    };
  });

  // channel.enable: Enable a channel
  handlers.set("channel.enable", async (params) => {
    const { channelId } = params as { channelId: string };

    if (!channelId) {
      throw new Error("channelId is required");
    }

    const channel = config.channels.find(c => c.id === channelId);
    if (!channel) {
      throw new Error(`Channel with ID "${channelId}" not found`);
    }

    channel.enabled = true;
    channel.lastUpdated = new Date().toISOString();
    updateConfig(config);

    return {
      success: true,
      channel: {
        ...channel,
        token: channel.token ? maskToken(channel.token) : undefined
      }
    };
  });

  // channel.disable: Disable a channel
  handlers.set("channel.disable", async (params) => {
    const { channelId } = params as { channelId: string };

    if (!channelId) {
      throw new Error("channelId is required");
    }

    const channel = config.channels.find(c => c.id === channelId);
    if (!channel) {
      throw new Error(`Channel with ID "${channelId}" not found`);
    }

    channel.enabled = false;
    channel.lastUpdated = new Date().toISOString();
    updateConfig(config);

    return {
      success: true,
      channel: {
        ...channel,
        token: channel.token ? maskToken(channel.token) : undefined
      }
    };
  });

  // channel.get: Get a specific channel
  handlers.set("channel.get", async (params) => {
    const { channelId } = params as { channelId: string };

    if (!channelId) {
      throw new Error("channelId is required");
    }

    const channel = config.channels.find(c => c.id === channelId);
    if (!channel) {
      throw new Error(`Channel with ID "${channelId}" not found`);
    }

    return {
      channel: {
        ...channel,
        token: channel.token ? maskToken(channel.token) : undefined
      }
    };
  });

  return handlers;
}
