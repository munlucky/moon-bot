// LLM Provider Types

export type LLMProviderType = "openai" | "glm";

export interface LLMProviderConfig {
  provider?: LLMProviderType;
  apiKey?: string;
  model?: string;
  baseURL?: string;
  useCodingAPI?: boolean;
  codingBaseURL?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ILLMProvider {
  isAvailable(): boolean;
  chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResponse>;
}

export interface ChatCompletionParams {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionResponse {
  content: string;
  model?: string;
}

// Re-export ToolCallParser types for convenience
export { ToolCallParser, TOOL_ALIASES } from "./ToolCallParser.js";
export type { ToolCallParser as ToolCallParserClass } from "./ToolCallParser.js";
