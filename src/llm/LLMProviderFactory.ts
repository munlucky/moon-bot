// LLM Provider Factory

import type { ILLMProvider, LLMProviderConfig, LLMProviderType } from "./types.js";
import type { LLMConfig } from "../types/index.js";
import { OpenAIProvider, GLMProvider } from "./providers/index.js";
import { createLogger, type Logger } from "../utils/logger.js";

export class LLMProviderFactory {
  private static logger: Logger = createLogger();

  /**
   * Create an LLM provider based on configuration
   */
  static create(config: LLMConfig = {}): ILLMProvider {
    const providerType = LLMProviderFactory.detectProvider(config);
    const providerConfig = LLMProviderFactory.buildProviderConfig(config);

    this.logger.info("Creating LLM provider", { provider: providerType, model: providerConfig.model });

    switch (providerType) {
      case "openai":
        return new OpenAIProvider(providerConfig);
      case "glm":
        return new GLMProvider(providerConfig);
      default:
        this.logger.warn("Unknown provider type, falling back to OpenAI", { providerType });
        return new OpenAIProvider(providerConfig);
    }
  }

  /**
   * Detect provider type from configuration
   * Priority: explicit provider setting -> GLM key -> OpenAI key
   */
  private static detectProvider(config: LLMConfig): LLMProviderType {
    // Explicit provider setting
    if (config.provider) {
      return config.provider;
    }

    // Auto-detect based on available API keys
    if (config.glmApiKey || process.env.ZAI_API_KEY || process.env.GLM_API_KEY) {
      return "glm";
    }

    if (config.apiKey || process.env.OPENAI_API_KEY) {
      return "openai";
    }

    // Check env provider variable
    const envProvider = process.env.LLM_PROVIDER as LLMProviderType;
    if (envProvider === "glm" || envProvider === "openai") {
      return envProvider;
    }

    return "openai"; // Default
  }

  /**
   * Build provider-specific config from LLMConfig
   */
  private static buildProviderConfig(config: LLMConfig): LLMProviderConfig {
    const providerType = LLMProviderFactory.detectProvider(config);

    const baseConfig: LLMProviderConfig = {
      provider: providerType,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    };

    if (providerType === "glm") {
      return {
        ...baseConfig,
        apiKey: config.glmApiKey,
        model: config.glmModel,
        baseURL: config.glmBaseURL,
        useCodingAPI: config.glmUseCodingAPI,
        codingBaseURL: config.glmCodingBaseURL,
      };
    }

    // openai
    return {
      ...baseConfig,
      apiKey: config.apiKey,
      model: config.model,
    };
  }
}
