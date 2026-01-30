// LLM Client for Planner integration

import type { Step, ToolDefinition } from "../types/index.js";
import type { LLMConfig } from "../types/index.js";
import { createLogger, type Logger } from "../utils/logger.js";
import { LLMProviderFactory } from "./LLMProviderFactory.js";
import type { ILLMProvider } from "./types.js";

export interface LLMPlanRequest {
  message: string;
  /** @deprecated Use toolDefinitions instead */
  availableTools?: string[];
  /** Tool definitions with schema for accurate parameter generation */
  toolDefinitions?: ToolDefinition[];
  sessionContext?: string;
}

export interface LLMResponseRequest {
  message: string;
  sessionContext?: string;
  toolContext?: string;
  /** Tool definitions for response generation */
  toolDefinitions?: ToolDefinition[];
}

export interface LLMPlanResponse {
  steps: Step[];
  reasoning?: string;
}

export class LLMClient {
  private provider: ILLMProvider;
  private logger: Logger;
  private model: string;
  private providerType: string;

  constructor(config: LLMConfig = {}) {
    this.logger = createLogger();
    this.provider = LLMProviderFactory.create(config);

    // Detect provider type
    this.providerType = config.provider ?? process.env.LLM_PROVIDER ?? "openai";

    // Select model based on provider type
    if (this.providerType === "glm") {
      this.model = config.glmModel ?? "glm-4.7-flash";
    } else {
      this.model = config.model ?? "gpt-4o";
    }

    if (this.provider.isAvailable()) {
      this.logger.info("LLM client initialized", { provider: this.providerType, model: this.model });
    } else {
      this.logger.warn("LLM client not available (no API key configured)");
    }
  }

  isAvailable(): boolean {
    return this.provider.isAvailable();
  }

  /**
   * Generate a plan using LLM
   */
  async generatePlan(request: LLMPlanRequest): Promise<LLMPlanResponse> {
    if (!this.provider.isAvailable()) {
      throw new Error("LLM client not available (API key not configured)");
    }

    const systemPrompt = this.buildSystemPrompt(
      request.toolDefinitions,
      request.availableTools
    );

    try {
      const response = await this.provider.chatCompletion({
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: this.buildUserPrompt(request),
          },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      });

      return this.parsePlanResponse(response.content);
    } catch (error) {
      this.logger.error("LLM plan generation failed", { error });
      throw error;
    }
  }

  /**
   * Generate a direct response using LLM
   */
  async generateResponse(request: LLMResponseRequest): Promise<string> {
    if (!this.provider.isAvailable()) {
      throw new Error("LLM client not available (API key not configured)");
    }

    const systemPrompt = this.buildResponseSystemPrompt(request.toolDefinitions);
    const userPrompt = this.buildResponseUserPrompt(request);

    try {
      const response = await this.provider.chatCompletion({
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      });

      return response.content.trim();
    } catch (error) {
      this.logger.error("LLM response generation failed", { error });
      throw error;
    }
  }

  /**
   * Build system prompt with available tools
   * @param toolDefinitions Full tool definitions with schema (preferred)
   * @param availableTools Legacy tool ID list (fallback)
   */
  private buildSystemPrompt(
    toolDefinitions?: ToolDefinition[],
    availableTools?: string[]
  ): string {
    let toolSection: string;

    if (toolDefinitions && toolDefinitions.length > 0) {
      // Use full tool definitions with schema
      toolSection = toolDefinitions
        .map((tool) => this.formatToolDefinition(tool))
        .join("\n\n");
    } else if (availableTools && availableTools.length > 0) {
      // Fallback to simple tool ID list
      toolSection = availableTools.map((t) => `- \`${t}\``).join("\n");
    } else {
      toolSection = "(No tools available)";
    }

    return `You are Moon-Bot, an AI agent that breaks down user requests into executable steps.

## Available Tools
${toolSection}

## Your Task
Given a user request, create a sequence of steps to accomplish it. Each step should:
- Have a unique ID (use kebab-case)
- Describe what the step does
- Optionally specify a tool to use with its input parameters
- Optionally list dependencies on previous step IDs

## Step Format
Each step is a JSON object with:
- \`id\`: unique identifier (string)
- \`description\`: what this step does (string)
- \`toolId\`: (optional) the tool to use
- \`input\`: (optional) input parameters for the tool (must match the tool's schema)
- \`dependsOn\`: (optional) array of step IDs this step depends on

## Response Format
Respond ONLY with valid JSON in this format:
\`\`\`json
{
  "steps": [
    {
      "id": "step-1",
      "description": "First step description",
      "toolId": "some.tool",
      "input": { "param1": "value1" }
    },
    {
      "id": "step-2",
      "description": "Second step description",
      "dependsOn": ["step-1"]
    }
  ],
  "reasoning": "Brief explanation of the plan"
}
\`\`\`

## Guidelines
- Keep plans simple and focused (3-5 steps maximum)
- Only use tools from the available list
- When using a tool, provide the \`input\` object with required parameters
- If no tool is needed, omit the \`toolId\` and \`input\` fields
- Always end with a response step (no toolId)
- Ensure step IDs are unique and descriptive
`;
  }

  /**
   * Format a single tool definition for the prompt
   */
  private formatToolDefinition(tool: ToolDefinition): string {
    const schema = tool.schema as {
      type?: string;
      properties?: Record<string, { type?: string; description?: string; enum?: string[] }>;
      required?: string[];
    };

    let result = `### \`${tool.name}\`\n${tool.description}`;

    if (schema.properties) {
      result += "\n\n**Parameters:**";
      for (const [name, prop] of Object.entries(schema.properties)) {
        const required = schema.required?.includes(name) ? " (required)" : "";
        const typeStr = prop.enum ? `enum[${prop.enum.join(", ")}]` : prop.type ?? "any";
        const desc = prop.description ? ` - ${prop.description}` : "";
        result += `\n- \`${name}\`: ${typeStr}${required}${desc}`;
      }
    }

    return result;
  }

  /**
   * Build user prompt with context
   */
  private buildUserPrompt(request: LLMPlanRequest): string {
    let prompt = `User request: ${request.message}`;

    if (request.sessionContext) {
      prompt += `\n\nSession context:\n${request.sessionContext}`;
    }

    return prompt;
  }

  /**
   * Build system prompt for direct response
   * @param toolDefinitions Optional tool definitions to include in the prompt
   */
  private buildResponseSystemPrompt(toolDefinitions?: ToolDefinition[]): string {
    let prompt = "You are Moon-Bot, a helpful assistant. Respond to the user's request clearly and concisely.";

    // Add available tools section if tool definitions are provided
    if (toolDefinitions && toolDefinitions.length > 0) {
      const toolSection = toolDefinitions
        .map((tool) => this.formatToolDefinition(tool))
        .join("\n\n");

      prompt += `

## Available Tools
You have access to the following tools that can help accomplish tasks:

${toolSection}

When users ask about available tools or what you can do, reference this list. If they ask to perform a task that requires a tool, explain which tool would be used and why.
`;
    }

    prompt += `

Use any tool context if provided. If you are unsure, say so. Respond in the same language as the user.`;

    return prompt;
  }

  /**
   * Build user prompt for direct response
   */
  private buildResponseUserPrompt(request: LLMResponseRequest): string {
    let prompt = `User request: ${request.message}`;

    if (request.sessionContext) {
      prompt += `\n\nSession context:\n${request.sessionContext}`;
    }

    if (request.toolContext) {
      prompt += `\n\nTool context:\n${request.toolContext}`;
    }

    return prompt;
  }

  /**
   * Parse LLM response into LLMPlanResponse
   */
  private parsePlanResponse(content: string): LLMPlanResponse {
    // Extract JSON from markdown code blocks if present
    const jsonMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    const jsonContent = jsonMatch ? jsonMatch[1] : content;

    try {
      const parsed = JSON.parse(jsonContent);

      // Validate response structure
      if (!parsed.steps || !Array.isArray(parsed.steps)) {
        throw new Error("Invalid response: missing or invalid 'steps' array");
      }

      // Validate each step
      const steps: Step[] = parsed.steps.map((step: unknown, index: number) => {
        if (!step || typeof step !== "object") {
          throw new Error(`Invalid step at index ${index}`);
        }

        const s = step as Record<string, unknown>;

        if (!s.id || typeof s.id !== "string") {
          throw new Error(`Step at index ${index} missing valid 'id'`);
        }

        if (!s.description || typeof s.description !== "string") {
          throw new Error(`Step at index ${index} missing valid 'description'`);
        }

        return {
          id: s.id,
          description: s.description,
          toolId: s.toolId as string | undefined,
          input: s.input as unknown,
          dependsOn: s.dependsOn as string[] | undefined,
        };
      });

      return {
        steps,
        reasoning: parsed.reasoning as string | undefined,
      };
    } catch (error) {
      this.logger.error("Failed to parse LLM response", { content, error });
      throw new Error(`Failed to parse LLM response: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Generate a fallback plan when LLM is unavailable
   */
  generateFallbackPlan(message: string): LLMPlanResponse {
    this.logger.warn("Using fallback plan (LLM unavailable)", { message });

    const lowerMessage = message.toLowerCase();
    const steps: Step[] = [];

    // Simple keyword-based fallback
    if (lowerMessage.includes("search") || lowerMessage.includes("find")) {
      steps.push({
        id: "search",
        description: "Search for information",
        toolId: "browser.search",
      });
    }

    if (lowerMessage.includes("open") || lowerMessage.includes("browse")) {
      steps.push({
        id: "browse",
        description: "Open browser",
        toolId: "browser.open",
      });
    }

    if (lowerMessage.includes("file") || lowerMessage.includes("save")) {
      steps.push({
        id: "file",
        description: "File operation",
        toolId: "filesystem.write",
      });
    }

    // Always add a response step
    steps.push({
      id: "respond",
      description: "Generate response",
    });

    return { steps };
  }
}
