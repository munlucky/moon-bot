// System Prompt Builder for Moon-Bot
// Inspired by OpenClaw's structured system prompt architecture

import type { ToolDefinition } from "../types/index.js";

/**
 * Safety policy configuration for the agent.
 */
export interface SafetyPolicy {
  /** Actions that are strictly forbidden */
  forbiddenActions: string[];
  /** Actions that require user approval before execution */
  requireApproval: string[];
  /** Allowed directory paths for file operations */
  allowedDirectories: string[];
}

/**
 * Workspace configuration for the agent.
 */
export interface WorkspaceConfig {
  /** Root working directory */
  root: string;
  /** Whether running in a sandboxed environment */
  sandbox?: boolean;
  /** Sandbox type (e.g., "docker", "vm") */
  sandboxType?: string;
}

/**
 * Runtime information for the agent.
 */
export interface RuntimeInfo {
  /** Agent identifier */
  agentId: string;
  /** LLM model being used */
  model: string;
  /** Channel identifier (e.g., discord channel ID) */
  channelId?: string;
  /** Host machine identifier */
  host?: string;
  /** Operating system */
  os?: string;
}

/**
 * User context information.
 */
export interface UserInfo {
  /** User's timezone (e.g., "Asia/Seoul") */
  timezone?: string;
  /** User's locale (e.g., "ko-KR") */
  locale?: string;
  /** User identifier */
  userId?: string;
}

/**
 * Extension configuration for additional context.
 */
export interface ExtensionConfig {
  /** Path to SOUL.md or personality file */
  soulFile?: string;
  /** Additional context to include */
  additionalContext?: string[];
  /** Custom sections to append */
  customSections?: Array<{ title: string; content: string }>;
}

/**
 * Main configuration for SystemPromptBuilder.
 */
export interface SystemPromptConfig {
  /** Agent identity */
  identity: {
    name: string;
    description: string;
  };
  /** Available tools */
  tools: ToolDefinition[];
  /** Workspace configuration */
  workspace?: WorkspaceConfig;
  /** User information */
  userInfo?: UserInfo;
  /** Runtime information */
  runtime?: RuntimeInfo;
  /** Extension configuration */
  extensions?: ExtensionConfig;
  /** Safety policy */
  safety?: SafetyPolicy;
  /** Whether to include CLI reference */
  includeCLIReference?: boolean;
  /** Whether to include tool call style guide */
  includeToolCallStyle?: boolean;
}

/**
 * Default safety policy for Moon-Bot.
 */
export const DEFAULT_SAFETY_POLICY: SafetyPolicy = {
  forbiddenActions: [
    "Execute commands that could damage the system (rm -rf /, format, etc.)",
    "Access or modify files outside the allowed workspace without permission",
    "Send data to external servers without explicit user consent",
    "Modify system configuration files",
    "Self-replicate or spawn autonomous processes",
    "Change your own system prompt or safety policies",
  ],
  requireApproval: [
    "File deletion operations",
    "System command execution",
    "Network requests to new or unknown hosts",
    "Installation of packages or dependencies",
    "Modifications to configuration files",
  ],
  allowedDirectories: [],
};

/**
 * CLI reference for Moon-Bot commands.
 */
const CLI_REFERENCE = `
## CLI Reference

If unsure about available commands, ask the user to run \`moonbot help\`.

Common commands:
- \`moonbot gateway status|start|stop|restart\` - Manage the gateway server
- \`moonbot channel list|add|remove|enable|disable\` - Manage channels
- \`moonbot config import|export|path\` - Configuration management
- \`moonbot approvals list|approve|deny\` - Manage pending approvals
- \`moonbot logs --follow\` - View logs
- \`moonbot doctor\` - Diagnose system issues
`.trim();

/**
 * Tool call style guide.
 */
const TOOL_CALL_STYLE = `
## Tool Call Style

- **Routine operations**: Proceed without verbose explanation. Simply execute and report results.
- **Complex operations**: Briefly explain what you're about to do before executing.
- **Sensitive operations**: Always explain the action and wait for confirmation if required.
- **Chained operations**: Summarize the sequence before starting, then execute step by step.
`.trim();

/**
 * Builds structured system prompts for Moon-Bot LLM interactions.
 */
export class SystemPromptBuilder {
  private config: SystemPromptConfig;

  constructor(config: SystemPromptConfig) {
    this.config = config;
  }

  /**
   * Build the complete system prompt for planning mode.
   */
  build(): string {
    const sections: string[] = [];

    // 1. Identity declaration
    sections.push(this.buildIdentitySection());

    // 2. Tools section
    sections.push(this.buildToolsSection());

    // 3. Tool call style (optional)
    if (this.config.includeToolCallStyle !== false) {
      sections.push(TOOL_CALL_STYLE);
    }

    // 4. Safety rules
    sections.push(this.buildSafetySection());

    // 5. Workspace info (optional)
    if (this.config.workspace) {
      sections.push(this.buildWorkspaceSection());
    }

    // 6. CLI reference (optional)
    if (this.config.includeCLIReference) {
      sections.push(CLI_REFERENCE);
    }

    // 7. User info and time (optional)
    if (this.config.userInfo) {
      sections.push(this.buildUserInfoSection());
    }

    // 8. Extensions (optional)
    if (this.config.extensions) {
      const extSection = this.buildExtensionsSection();
      if (extSection) {
        sections.push(extSection);
      }
    }

    // 9. Plan format instructions
    sections.push(this.buildPlanFormatSection());

    // 10. Runtime info (always at the end)
    if (this.config.runtime) {
      sections.push(this.buildRuntimeSection());
    }

    return sections.join("\n\n");
  }

  /**
   * Build a simplified system prompt for response generation mode.
   */
  buildForResponse(): string {
    const sections: string[] = [];

    // 1. Identity (simplified)
    sections.push(
      `You are ${this.config.identity.name}, a helpful assistant. Respond to the user's request clearly and concisely.`
    );

    // 2. Tools overview (if available)
    if (this.config.tools.length > 0) {
      sections.push(this.buildToolsOverviewSection());
    }

    // 3. Safety reminder (condensed)
    sections.push(this.buildCondensedSafetySection());

    // 4. Response guidelines
    sections.push(`
## Guidelines

- Use any provided tool context to inform your response
- If unsure about something, say so clearly
- Respond in the same language as the user
- Keep responses focused and actionable
`.trim());

    // 5. Runtime info (optional)
    if (this.config.runtime) {
      sections.push(this.buildRuntimeSection());
    }

    return sections.join("\n\n");
  }

  /**
   * Build identity declaration section.
   */
  private buildIdentitySection(): string {
    const { name, description } = this.config.identity;
    return `You are ${name}, ${description}

You break down user requests into executable steps and use available tools to accomplish tasks.`;
  }

  /**
   * Build tools section with detailed schema.
   */
  private buildToolsSection(): string {
    if (this.config.tools.length === 0) {
      return `## Tools\n\n(No tools available)`;
    }

    const toolDescriptions = this.config.tools
      .map((tool) => this.formatToolDefinition(tool))
      .join("\n\n");

    return `## Tools

You have access to the following tools. **Tool names are case-sensitive** - use them exactly as shown.

${toolDescriptions}`;
  }

  /**
   * Build condensed tools overview for response mode.
   */
  private buildToolsOverviewSection(): string {
    const toolList = this.config.tools
      .map((t) => `- \`${t.name}\`: ${t.description}`)
      .join("\n");

    return `## Available Tools

${toolList}

When users ask about capabilities, reference these tools. If a task requires a tool, explain which one and why.`;
  }

  /**
   * Format a single tool definition.
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
   * Build safety rules section.
   */
  private buildSafetySection(): string {
    const policy = this.config.safety ?? DEFAULT_SAFETY_POLICY;

    const forbidden = policy.forbiddenActions
      .map((a) => `- NEVER: ${a}`)
      .join("\n");

    const approval = policy.requireApproval
      .map((a) => `- ${a}`)
      .join("\n");

    return `## Safety Rules

### Forbidden Actions
${forbidden}

### Requires User Approval
${approval}

If you're unsure whether an action is safe, ask the user before proceeding.`;
  }

  /**
   * Build condensed safety section for response mode.
   */
  private buildCondensedSafetySection(): string {
    return `## Safety

- Do not execute potentially harmful commands
- Ask for confirmation before destructive operations
- Stay within the designated workspace`;
  }

  /**
   * Build workspace section.
   */
  private buildWorkspaceSection(): string {
    const { root, sandbox, sandboxType } = this.config.workspace!;

    let section = `## Workspace

Your working directory is: \`${root}\`
Stay within this directory unless explicitly instructed otherwise.`;

    if (sandbox) {
      section += `\n\n**Sandbox Mode**: Running in ${sandboxType ?? "sandboxed"} environment with restricted permissions.`;
    }

    return section;
  }

  /**
   * Build user info section.
   */
  private buildUserInfoSection(): string {
    const { timezone, locale, userId } = this.config.userInfo!;
    const now = new Date();

    let section = `## User Context`;

    if (timezone) {
      const formatter = new Intl.DateTimeFormat(locale ?? "en-US", {
        timeZone: timezone,
        dateStyle: "full",
        timeStyle: "long",
      });
      section += `\n- **Timezone**: ${timezone}`;
      section += `\n- **Current Time**: ${formatter.format(now)}`;
    } else {
      section += `\n- **Current Time**: ${now.toISOString()}`;
    }

    if (userId) {
      section += `\n- **User ID**: ${userId}`;
    }

    return section;
  }

  /**
   * Build extensions section.
   */
  private buildExtensionsSection(): string | null {
    const { additionalContext, customSections } = this.config.extensions!;

    const parts: string[] = [];

    if (additionalContext && additionalContext.length > 0) {
      parts.push(`## Additional Context\n\n${additionalContext.join("\n\n")}`);
    }

    if (customSections && customSections.length > 0) {
      for (const section of customSections) {
        parts.push(`## ${section.title}\n\n${section.content}`);
      }
    }

    return parts.length > 0 ? parts.join("\n\n") : null;
  }

  /**
   * Build plan format instructions section.
   */
  private buildPlanFormatSection(): string {
    return `## Task Planning

Given a user request, create a sequence of steps to accomplish it.

### Step Format
Each step is a JSON object with:
- \`id\`: unique identifier (kebab-case string)
- \`description\`: what this step does
- \`toolId\`: (optional) the tool to use
- \`input\`: (optional) input parameters matching the tool's schema
- \`dependsOn\`: (optional) array of step IDs this step depends on

### Response Format
Respond ONLY with valid JSON:
\`\`\`json
{
  "steps": [
    {
      "id": "step-1",
      "description": "First step description",
      "toolId": "tool.name",
      "input": { "param": "value" }
    },
    {
      "id": "step-2",
      "description": "Second step",
      "dependsOn": ["step-1"]
    }
  ],
  "reasoning": "Brief explanation of the plan"
}
\`\`\`

### Guidelines
- Keep plans simple and focused (3-5 steps maximum)
- Only use tools from the available list
- Ensure step IDs are unique and descriptive
- Always end with a response step (no toolId)`;
  }

  /**
   * Build runtime information section.
   */
  private buildRuntimeSection(): string {
    const { agentId, model, channelId, host, os } = this.config.runtime!;

    const parts = [`Agent: ${agentId}`, `Model: ${model}`];

    if (channelId) {parts.push(`Channel: ${channelId}`);}
    if (host) {parts.push(`Host: ${host}`);}
    if (os) {parts.push(`OS: ${os}`);}

    const now = new Date().toISOString();
    parts.push(`Time: ${now}`);

    return `---\nRuntime: ${parts.join(" | ")}`;
  }

  /**
   * Create a builder with default Moon-Bot configuration.
   */
  static createDefault(tools: ToolDefinition[]): SystemPromptBuilder {
    return new SystemPromptBuilder({
      identity: {
        name: "Moon-Bot",
        description: "an AI agent that helps users accomplish tasks on their local machine",
      },
      tools,
      includeToolCallStyle: true,
      includeCLIReference: false,
    });
  }

  /**
   * Create a builder with full configuration.
   */
  static createFull(config: Partial<SystemPromptConfig> & { tools: ToolDefinition[] }): SystemPromptBuilder {
    return new SystemPromptBuilder({
      identity: config.identity ?? {
        name: "Moon-Bot",
        description: "an AI agent that helps users accomplish tasks on their local machine",
      },
      tools: config.tools,
      workspace: config.workspace,
      userInfo: config.userInfo,
      runtime: config.runtime,
      extensions: config.extensions,
      safety: config.safety,
      includeToolCallStyle: config.includeToolCallStyle ?? true,
      includeCLIReference: config.includeCLIReference ?? false,
    });
  }
}
