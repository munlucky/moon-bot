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
    return getDefaultConfig();
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const config = JSON.parse(content) as SystemConfig;
    return mergeWithDefaults(config);
  } catch (error) {
    console.warn(`Failed to load config from ${filePath}, using defaults`);
    return getDefaultConfig();
  }
}

function getDefaultConfig(): SystemConfig {
  return {
    gateways: [
      {
        port: 18789,
        host: "127.0.0.1",
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
