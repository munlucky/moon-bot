// OpenAI LLM Provider

import OpenAI from "openai";
import { BaseLLMProvider } from "./BaseLLMProvider.js";
import type { ChatCompletionParams, ChatCompletionResponse, LLMProviderConfig } from "../types.js";

export class OpenAIProvider extends BaseLLMProvider {
  private client: OpenAI | null = null;
  private defaultModel: string;

  constructor(config: LLMProviderConfig) {
    super(config);
    this.defaultModel = config.model ?? "gpt-4o";

    const apiKey = config.apiKey ?? process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.client = new OpenAI({ apiKey });
    }
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  async chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResponse> {
    if (!this.client) {
      throw new Error("OpenAI client not available (OPENAI_API_KEY not configured)");
    }

    const response = await this.client.chat.completions.create({
      model: params.model ?? this.defaultModel,
      messages: params.messages,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.max_tokens ?? 2000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from OpenAI");
    }

    return {
      content,
      model: response.model,
    };
  }
}
