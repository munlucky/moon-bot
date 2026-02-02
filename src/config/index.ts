// Configuration loader and validator

import fs from "fs";
import path from "path";
import { homedir } from "os";
import type { SystemConfig, LLMConfig } from "../types/index.js";

// Configuration paths
const DEFAULT_CONFIG_PATH = path.join(homedir(), ".moonbot", "config.json");
const DEFAULT_STORAGE_BASE = path.join(homedir(), ".moonbot");
const STORAGE_SESSIONS_DIR = "sessions";
const STORAGE_LOGS_DIR = "logs";

// Environment variable names
const ENV_DISCORD_TOKEN = "MOONBOT_DISCORD_TOKEN";
const ENV_GATEWAY_PORT = "MOONBOT_GATEWAY_PORT";
const ENV_GATEWAY_HOST = "MOONBOT_GATEWAY_HOST";
const ENV_CONFIG = "MOONBOT_CONFIG";

// LLM environment variables
const ENV_LLM_PROVIDER = "LLM_PROVIDER";
const ENV_OPENAI_API_KEY = "OPENAI_API_KEY";
const ENV_ZAI_API_KEY = "ZAI_API_KEY";
const ENV_GLM_API_KEY = "GLM_API_KEY";
const ENV_ZAI_USE_CODING_API = "ZAI_USE_CODING_API";
const ENV_GLM_USE_CODING_API = "GLM_USE_CODING_API";
const ENV_ZAI_CODING_BASE_URL = "ZAI_CODING_BASE_URL";
const ENV_GLM_CODING_BASE_URL = "GLM_CODING_BASE_URL";
const ENV_ZAI_MODEL = "ZAI_MODEL";
const ENV_GLM_MODEL = "GLM_MODEL";
const ENV_ZAI_BASE_URL = "ZAI_BASE_URL";
const ENV_GLM_BASE_URL = "GLM_BASE_URL";
const ENV_LLM_TEMPERATURE = "LLM_TEMPERATURE";
const ENV_LLM_MAX_TOKENS = "LLM_MAX_TOKENS";

// Default values
const DEFAULT_GATEWAY_PORT = 18789;
const DEFAULT_GATEWAY_HOST = "127.0.0.1";
const DEFAULT_DISCORD_CHANNEL_ID = "discord-from-env";
const DEFAULT_OPENAI_MODEL = "gpt-4o";
const DEFAULT_GLM_MODEL_CODING = "glm-4.7";
const DEFAULT_GLM_MODEL_FREE = "glm-4.7-flash";
const DEFAULT_CODING_BASE_URL = "https://api.z.ai/api/coding/paas/v4/";

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
  } catch {
    // Error loading config, using defaults
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
  if (process.env[ENV_DISCORD_TOKEN]) {
    const discordChannel = result.channels.find(c => c.type === "discord");
    if (discordChannel) {
      discordChannel.token = process.env[ENV_DISCORD_TOKEN]!;
    } else {
      result.channels.push({
        id: DEFAULT_DISCORD_CHANNEL_ID,
        type: "discord",
        token: process.env[ENV_DISCORD_TOKEN]!,
        enabled: true
      });
    }
  }

  // Gateway port
  if (process.env[ENV_GATEWAY_PORT]) {
    const port = parseInt(process.env[ENV_GATEWAY_PORT], 10);
    if (!isNaN(port) && result.gateways[0]) {
      result.gateways[0].port = port;
    }
  }

  // Gateway host
  if (process.env[ENV_GATEWAY_HOST] && result.gateways[0]) {
    result.gateways[0].host = process.env[ENV_GATEWAY_HOST];
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
  if (process.env[ENV_LLM_PROVIDER]) {
    llm.provider = process.env[ENV_LLM_PROVIDER] as "openai" | "glm";
  }

  // OpenAI configuration
  if (process.env[ENV_OPENAI_API_KEY]) {
    llm.apiKey = process.env[ENV_OPENAI_API_KEY];
    if (!llm.model) {
      llm.model = DEFAULT_OPENAI_MODEL;
    }
  }

  // GLM / Z.AI configuration
  // Support both ZAI_* (new, preferred) and GLM_* (legacy)
  const zaiApiKey = process.env[ENV_ZAI_API_KEY] || process.env[ENV_GLM_API_KEY];
  if (zaiApiKey) {
    llm.glmApiKey = zaiApiKey;

    // Use Coding API endpoint setting
    const useCodingAPI = process.env[ENV_ZAI_USE_CODING_API] === "true" || process.env[ENV_GLM_USE_CODING_API] === "true";
    if (useCodingAPI) {
      llm.glmUseCodingAPI = true;
      // glm-4.7 for Coding API
      if (!llm.glmModel) {
        llm.glmModel = DEFAULT_GLM_MODEL_CODING;
      }
      const codingBaseUrl = process.env[ENV_ZAI_CODING_BASE_URL] || process.env[ENV_GLM_CODING_BASE_URL] || DEFAULT_CODING_BASE_URL;
      if (!llm.glmCodingBaseURL) {
        llm.glmCodingBaseURL = codingBaseUrl;
      }
    } else {
      // glm-4.7-flash for free tier
      if (!llm.glmModel) {
        llm.glmModel = process.env[ENV_ZAI_MODEL] || process.env[ENV_GLM_MODEL] || DEFAULT_GLM_MODEL_FREE;
      }
    }

    const zaiBaseUrl = process.env[ENV_ZAI_BASE_URL] || process.env[ENV_GLM_BASE_URL];
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
  if (process.env[ENV_LLM_TEMPERATURE]) {
    const temp = parseFloat(process.env[ENV_LLM_TEMPERATURE]);
    if (!isNaN(temp)) {
      llm.temperature = temp;
    }
  }

  if (process.env[ENV_LLM_MAX_TOKENS]) {
    const tokens = parseInt(process.env[ENV_LLM_MAX_TOKENS], 10);
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
        port: parseInt(process.env[ENV_GATEWAY_PORT] || String(DEFAULT_GATEWAY_PORT), 10),
        host: process.env[ENV_GATEWAY_HOST] || DEFAULT_GATEWAY_HOST,
      },
    ],
    agents: [
      {
        id: "default",
        name: "Default Agent",
        model: DEFAULT_OPENAI_MODEL,
        temperature: 0.7,
        maxTokens: 4096,
      },
    ],
    channels: [],
    tools: [],
    storage: {
      sessionsPath: path.join(DEFAULT_STORAGE_BASE, STORAGE_SESSIONS_DIR),
      logsPath: path.join(DEFAULT_STORAGE_BASE, STORAGE_LOGS_DIR),
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
  const envPath = process.env[ENV_CONFIG];
  if (envPath) {
    return envPath;
  }
  return DEFAULT_CONFIG_PATH;
}
