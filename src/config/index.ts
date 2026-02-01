// Configuration loader and validator

import fs from "fs";
import path from "path";
import { homedir } from "os";
import type { SystemConfig, LLMConfig } from "../types/index.js";

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

  // LLM configuration
  result.llm = applyLLMEnvironmentVariables(config.llm);

  return result;
}

/**
 * Apply LLM environment variables to config
 * Auto-detects provider based on available API keys
 */
function applyLLMEnvironmentVariables(llmConfig: LLMConfig | undefined): LLMConfig | undefined {
  const llm = llmConfig ? { ...llmConfig } : {};

  // Provider type from env
  if (process.env.LLM_PROVIDER) {
    llm.provider = process.env.LLM_PROVIDER as "openai" | "glm";
  }

  // OpenAI configuration
  if (process.env.OPENAI_API_KEY) {
    llm.apiKey = process.env.OPENAI_API_KEY;
    if (!llm.model) {
      llm.model = "gpt-4o";
    }
  }

  // GLM / Z.AI configuration
  // Support both ZAI_* (new, preferred) and GLM_* (legacy)
  const zaiApiKey = process.env.ZAI_API_KEY || process.env.GLM_API_KEY;
  if (zaiApiKey) {
    llm.glmApiKey = zaiApiKey;

    // Use Coding API endpoint setting
    const useCodingAPI = process.env.ZAI_USE_CODING_API === "true" || process.env.GLM_USE_CODING_API === "true";
    if (useCodingAPI) {
      llm.glmUseCodingAPI = true;
      // glm-4.7 for Coding API
      if (!llm.glmModel) {
        llm.glmModel = "glm-4.7";
      }
      const codingBaseUrl = process.env.ZAI_CODING_BASE_URL || process.env.GLM_CODING_BASE_URL || "https://api.z.ai/api/coding/paas/v4/";
      if (!llm.glmCodingBaseURL) {
        llm.glmCodingBaseURL = codingBaseUrl;
      }
    } else {
      // glm-4.7-flash for free tier
      if (!llm.glmModel) {
        llm.glmModel = process.env.ZAI_MODEL || process.env.GLM_MODEL || "glm-4.7-flash";
      }
    }

    const zaiBaseUrl = process.env.ZAI_BASE_URL || process.env.GLM_BASE_URL;
    if (zaiBaseUrl) {
      llm.glmBaseURL = zaiBaseUrl;
    }
  }

  // Auto-detect provider if not explicitly set
  if (!llm.provider) {
    if (llm.glmApiKey) {
      llm.provider = "glm";
    } else if (llm.apiKey) {
      llm.provider = "openai";
    }
  }

  // Temperature and max tokens
  if (process.env.LLM_TEMPERATURE) {
    const temp = parseFloat(process.env.LLM_TEMPERATURE);
    if (!isNaN(temp)) {
      llm.temperature = temp;
    }
  }

  if (process.env.LLM_MAX_TOKENS) {
    const tokens = parseInt(process.env.LLM_MAX_TOKENS, 10);
    if (!isNaN(tokens)) {
      llm.maxTokens = tokens;
    }
  }

  // Return undefined if no LLM config is set
  if (Object.keys(llm).length === 0) {
    return undefined;
  }

  return llm;
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
  if (!storage) {return;}

  if (!fs.existsSync(storage.sessionsPath)) {
    fs.mkdirSync(storage.sessionsPath, { recursive: true });
  }

  if (!fs.existsSync(storage.logsPath)) {
    fs.mkdirSync(storage.logsPath, { recursive: true });
  }
}

export function getConfigPath(): string {
  const envPath = process.env.MOONBOT_CONFIG;
  if (envPath) {return envPath;}
  return DEFAULT_CONFIG_PATH;
}
