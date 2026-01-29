// GLM (智谱AI) LLM Provider

import OpenAI from "openai";
import { BaseLLMProvider } from "./BaseLLMProvider.js";
import type { ChatCompletionParams, ChatCompletionResponse, LLMProviderConfig } from "../types.js";

const DEFAULT_ZAI_BASE_URL = "https://api.z.ai/api/paas/v4/";
const DEFAULT_ZAI_CODING_BASE_URL = "https://api.z.ai/api/coding/paas/v4/";
const DEFAULT_ZAI_MODEL = "glm-4.7-flash";
const DEFAULT_ZAI_CODING_MODEL = "glm-4.7";

export class GLMProvider extends BaseLLMProvider {
  private client: OpenAI | null = null;
  private codingClient: OpenAI | null = null;
  private defaultModel: string;
  private useCodingAPI: boolean;

  constructor(config: LLMProviderConfig) {
    super(config);
    this.useCodingAPI = config.useCodingAPI ?? false;

    // Determine default model based on coding API setting
    this.defaultModel = config.model ?? (this.useCodingAPI ? DEFAULT_ZAI_CODING_MODEL : DEFAULT_ZAI_MODEL);

    // Support both ZAI_API_KEY (new) and GLM_API_KEY (legacy)
    const apiKey = config.apiKey ?? process.env.ZAI_API_KEY ?? process.env.GLM_API_KEY;
    if (apiKey) {
      // Regular API client
      this.client = new OpenAI({
        apiKey,
        baseURL: config.baseURL ?? process.env.ZAI_BASE_URL ?? process.env.GLM_BASE_URL ?? DEFAULT_ZAI_BASE_URL,
      });

      // Coding API client (if enabled)
      if (this.useCodingAPI) {
        this.codingClient = new OpenAI({
          apiKey,
          baseURL: config.codingBaseURL ?? process.env.ZAI_CODING_BASE_URL ?? process.env.GLM_CODING_BASE_URL ?? DEFAULT_ZAI_CODING_BASE_URL,
        });
      }
    }
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  async chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResponse> {
    // Use coding client if enabled and available
    const activeClient = this.useCodingAPI && this.codingClient ? this.codingClient : this.client;

    if (!activeClient) {
      throw new Error("Z.AI client not available (ZAI_API_KEY not configured)");
    }

    const response = await activeClient.chat.completions.create({
      model: params.model ?? this.defaultModel,
      messages: params.messages,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.max_tokens ?? 2000,
    });

    const message = response.choices[0]?.message as { content?: string; reasoning_content?: string } | undefined;
    const content = message?.content || message?.reasoning_content;

    if (!content) {
      throw new Error("Empty response from Z.AI");
    }

    return {
      content,
      model: response.model,
    };
  }
}
