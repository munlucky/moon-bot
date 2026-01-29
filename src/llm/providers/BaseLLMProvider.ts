// Base LLM Provider

import type { ILLMProvider, ChatCompletionParams, ChatCompletionResponse, LLMProviderConfig } from "../types.js";
import { createLogger, type Logger } from "../../utils/logger.js";

export abstract class BaseLLMProvider implements ILLMProvider {
  protected config: LLMProviderConfig;
  protected logger: Logger;

  constructor(config: LLMProviderConfig) {
    this.config = config;
    this.logger = createLogger();
  }

  abstract isAvailable(): boolean;
  abstract chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResponse>;
}
