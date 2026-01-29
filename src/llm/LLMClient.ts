// LLM Client for Planner integration

import type { Step } from "../types/index.js";
import type { LLMConfig } from "../types/index.js";
import { createLogger, type Logger } from "../utils/logger.js";
import { LLMProviderFactory } from "./LLMProviderFactory.js";
import type { ILLMProvider } from "./types.js";

export interface LLMPlanRequest {
  message: string;
  availableTools: string[];
  sessionContext?: string;
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

    const systemPrompt = this.buildSystemPrompt(request.availableTools);

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
   * Build system prompt with available tools
   */
  private buildSystemPrompt(availableTools: string[]): string {
    const toolList = availableTools.length > 0
      ? availableTools.map((t) => `- \`${t}\``).join("\n")
      : "(No tools available)";

    return `You are Moon-Bot, an AI agent that breaks down user requests into executable steps.

## Available Tools
${toolList}

## Your Task
Given a user request, create a sequence of steps to accomplish it. Each step should:
- Have a unique ID (use kebab-case)
- Describe what the step does
- Optionally specify a tool to use
- Optionally list dependencies on previous step IDs

## Step Format
Each step is a JSON object with:
- \`id\`: unique identifier (string)
- \`description\`: what this step does (string)
- \`toolId\`: (optional) the tool to use
- \`dependsOn\`: (optional) array of step IDs this step depends on

## Response Format
Respond ONLY with valid JSON in this format:
\`\`\`json
{
  "steps": [
    {
      "id": "step-1",
      "description": "First step description",
      "toolId": "some.tool"
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
- If no tool is needed, omit the \`toolId\` field
- Always end with a response step (no toolId)
- Ensure step IDs are unique and descriptive
`;
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
