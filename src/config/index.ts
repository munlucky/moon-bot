// Configuration loader and validator

import fs from "fs";
import path from "path";
import { homedir } from "os";
import type { SystemConfig } from "../types/index.js";

const DEFAULT_CONFIG_PATH = path.join(homedir(), ".moonbot", "config.json");
const DEFAULT_STORAGE_BASE = path.join(homedir(), ".moonbot");

export function loadConfig(configPath?: string): SystemConfig {
  const filePath = configPath || DEFAULT_CONFIG_PATH;

  if (!fs.existsSync(filePath)) {
    const defaults = getDefaultConfig();
    return applyEnvironmentVariables(defaults);
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const config = JSON.parse(content) as SystemConfig;
    const merged = mergeWithDefaults(config);
    return applyEnvironmentVariables(merged);
  } catch (error) {
    console.warn(`Failed to load config from ${filePath}, using defaults`);
    const defaults = getDefaultConfig();
    return applyEnvironmentVariables(defaults);
  }
}

/**
 * Apply environment variables to config
 * Priority: env > config.json > defaults
 */
function applyEnvironmentVariables(config: SystemConfig): SystemConfig {
  const result = { ...config };

  // Discord token
  if (process.env.MOONBOT_DISCORD_TOKEN) {
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
      sessionsPath: path.join(DEFAULT_STORAGE_BASE, "sessions"),
      logsPath: path.join(DEFAULT_STORAGE_BASE, "logs"),
    },
  };
}

function mergeWithDefaults(config: Partial<SystemConfig>): SystemConfig {
  const defaults = getDefaultConfig();
  return {
    gateways: config.gateways || defaults.gateways,
    agents: config.agents || defaults.agents,
    channels: config.channels || defaults.channels,
    tools: config.tools || defaults.tools,
    storage: config.storage || defaults.storage,
  };
}

export function ensureStorageDirectories(config: SystemConfig): void {
  const storage = config.storage;
  if (!storage) return;

  if (!fs.existsSync(storage.sessionsPath)) {
    fs.mkdirSync(storage.sessionsPath, { recursive: true });
  }

  if (!fs.existsSync(storage.logsPath)) {
    fs.mkdirSync(storage.logsPath, { recursive: true });
  }
}

export function getConfigPath(): string {
  const envPath = process.env.MOONBOT_CONFIG;
  if (envPath) return envPath;
  return DEFAULT_CONFIG_PATH;
}
