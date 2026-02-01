/**
 * Configuration Manager
 * Handles config file CRUD, environment variables, and token masking
 */

import fs from "fs/promises";
import path from "path";
import { homedir } from "os";
import type { SystemConfig, ChannelConfig } from "../types/index.js";

const DEFAULT_CONFIG_PATH = path.join(homedir(), ".moonbot", "config.json");
const BACKUP_DIR = path.join(homedir(), ".moonbot", "backups");

/**
 * Mask token for display (show first 6 and last 4 chars)
 */
export function maskToken(token?: string): string {
  if (!token) {return "[none]";}
  if (token.length <= 10) {return "***";}
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}

/**
 * Load configuration from file
 */
export async function loadConfigAsync(configPath?: string): Promise<SystemConfig> {
  const filePath = configPath || DEFAULT_CONFIG_PATH;

  try {
    const content = await fs.readFile(filePath, "utf-8");
    const config = JSON.parse(content) as SystemConfig;
    return applyEnvironmentVariables(config);
  } catch {
    // Return default if file doesn't exist
    return getDefaultConfig();
  }
}

/**
 * Save configuration to file
 */
export async function saveConfig(config: SystemConfig, configPath?: string): Promise<void> {
  const filePath = configPath || DEFAULT_CONFIG_PATH;

  // Create backup before saving
  await createBackup(filePath);

  // Ensure directory exists
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  // Write config
  await fs.writeFile(filePath, JSON.stringify(config, null, 2), "utf-8");
}

/**
 * Create backup of config file
 */
async function createBackup(configPath: string): Promise<void> {
  try {
    const exists = await fs.access(configPath).then(() => true).catch(() => false);
    if (!exists) {return;}

    // Ensure backup directory exists
    await fs.mkdir(BACKUP_DIR, { recursive: true });

    // Create backup with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(BACKUP_DIR, `config-${timestamp}.json`);
    await fs.copyFile(configPath, backupPath);

    // Clean old backups (keep last 10)
    await cleanOldBackups();
  } catch (error) {
    // Log warning but don't fail the save operation
    console.warn(`Backup failed: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Clean old backup files (keep last 10)
 */
async function cleanOldBackups(): Promise<void> {
  try {
    const files = await fs.readdir(BACKUP_DIR);
    const backups = files
      .filter(f => f.startsWith("config-") && f.endsWith(".json"))
      .map(f => ({
        name: f,
        path: path.join(BACKUP_DIR, f),
        time: 0
      }));

    // Sort by modification time
    for (const backup of backups) {
      const stat = await fs.stat(backup.path);
      backup.time = stat.mtimeMs;
    }
    backups.sort((a, b) => b.time - a.time);

    // Remove old backups
    const toDelete = backups.slice(10);
    for (const file of toDelete) {
      await fs.unlink(file.path);
    }
  } catch (err) {
    console.debug("[ConfigManager] Backup cleanup error:", (err as Error)?.message ?? err);
  }
}

/**
 * Apply environment variables to config
 */
function applyEnvironmentVariables(config: SystemConfig): SystemConfig {
  const result = { ...config };

  // Environment variable priority: env > config > defaults

  // Discord token
  if (process.env.MOONBOT_DISCORD_TOKEN) {
    // Find or create Discord channel
    const discordChannel = result.channels.find(c => c.type === "discord");
    if (discordChannel) {
      discordChannel.token = process.env.MOONBOT_DISCORD_TOKEN;
    } else {
      result.channels.push({
        id: "discord-from-env",
        type: "discord",
        token: process.env.MOONBOT_DISCORD_TOKEN,
        enabled: true
      });
    }
  }

  // Gateway port
  if (process.env.MOONBOT_GATEWAY_PORT) {
    const port = parseInt(process.env.MOONBOT_GATEWAY_PORT, 10);
    if (!isNaN(port) && result.gateways[0]) {
      result.gateways[0].port = port;
    }
  }

  // Gateway host
  if (process.env.MOONBOT_GATEWAY_HOST && result.gateways[0]) {
    result.gateways[0].host = process.env.MOONBOT_GATEWAY_HOST;
  }

  return result;
}

/**
 * Get default configuration
 */
function getDefaultConfig(): SystemConfig {
  return {
    gateways: [
      {
        port: parseInt(process.env.MOONBOT_GATEWAY_PORT || "18789", 10),
        host: process.env.MOONBOT_GATEWAY_HOST || "127.0.0.1",
      },
    ],
    agents: [
      {
        id: "default",
        name: "Default Agent",
        model: "gpt-4o",
        temperature: 0.7,
        maxTokens: 4096,
      },
    ],
    channels: [],
    tools: [],
    storage: {
      sessionsPath: path.join(homedir(), ".moonbot", "sessions"),
      logsPath: path.join(homedir(), ".moonbot", "logs"),
    },
  };
}

/**
 * Add channel to config
 */
export async function addChannel(channel: ChannelConfig, configPath?: string): Promise<void> {
  const config = await loadConfigAsync(configPath);

  // Check for duplicate ID
  const existing = config.channels.find(c => c.id === channel.id);
  if (existing) {
    throw new Error(`Channel with ID "${channel.id}" already exists`);
  }

  // Add timestamp
  channel.addedAt = new Date().toISOString();
  channel.lastUpdated = new Date().toISOString();

  config.channels.push(channel);
  await saveConfig(config, configPath);
}

/**
 * Remove channel from config
 */
export async function removeChannel(channelId: string, configPath?: string): Promise<void> {
  const config = await loadConfigAsync(configPath);

  const index = config.channels.findIndex(c => c.id === channelId);
  if (index === -1) {
    throw new Error(`Channel with ID "${channelId}" not found`);
  }

  config.channels.splice(index, 1);
  await saveConfig(config, configPath);
}

/**
 * Update channel in config
 */
export async function updateChannel(
  channelId: string,
  updates: Partial<ChannelConfig>,
  configPath?: string
): Promise<void> {
  const config = await loadConfigAsync(configPath);

  const channel = config.channels.find(c => c.id === channelId);
  if (!channel) {
    throw new Error(`Channel with ID "${channelId}" not found`);
  }

  // Apply updates
  Object.assign(channel, updates);
  channel.lastUpdated = new Date().toISOString();

  await saveConfig(config, configPath);
}

/**
 * List all channels with optional token masking
 */
export async function listChannels(configPath?: string, maskTokens: boolean = true): Promise<ChannelConfig[]> {
  const config = await loadConfigAsync(configPath);

  if (maskTokens) {
    return config.channels.map(c => ({
      ...c,
      token: c.token ? maskToken(c.token) : undefined
    }));
  }

  return config.channels;
}

/**
 * Get channel by ID
 */
export async function getChannel(channelId: string, configPath?: string): Promise<ChannelConfig | null> {
  const config = await loadConfigAsync(configPath);
  return config.channels.find(c => c.id === channelId) || null;
}

/**
 * Enable/disable channel
 */
export async function setChannelEnabled(
  channelId: string,
  enabled: boolean,
  configPath?: string
): Promise<void> {
  await updateChannel(channelId, { enabled }, configPath);
}
