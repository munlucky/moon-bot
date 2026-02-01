import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  SystemPromptBuilder,
  DEFAULT_SAFETY_POLICY,
  type SystemPromptConfig,
  type ToolDefinition,
} from "./SystemPromptBuilder.js";

describe("SystemPromptBuilder", () => {
  const mockTools: ToolDefinition[] = [
    {
      name: "browser.search",
      description: "Search the web for information",
      schema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
        },
        required: ["query"],
      },
    },
    {
      name: "fs.read",
      description: "Read file contents from the filesystem",
      schema: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to read" },
          encoding: { type: "string", enum: ["utf8", "base64"] },
        },
        required: ["path"],
      },
    },
  ];

  describe("build()", () => {
    it("should include identity section", () => {
      const builder = SystemPromptBuilder.createDefault(mockTools);
      const prompt = builder.build();

      expect(prompt).toContain("You are Moon-Bot");
      expect(prompt).toContain("AI agent");
    });

    it("should include tools section with correct formatting", () => {
      const builder = SystemPromptBuilder.createDefault(mockTools);
      const prompt = builder.build();

      expect(prompt).toContain("## Tools");
      expect(prompt).toContain("`browser.search`");
      expect(prompt).toContain("`fs.read`");
      expect(prompt).toContain("Search the web for information");
      expect(prompt).toContain("**Parameters:**");
      expect(prompt).toContain("`query`: string (required)");
    });

    it("should include case-sensitivity warning for tool names", () => {
      const builder = SystemPromptBuilder.createDefault(mockTools);
      const prompt = builder.build();

      expect(prompt).toContain("Tool names are case-sensitive");
    });

    it("should include tool call style section by default", () => {
      const builder = SystemPromptBuilder.createDefault(mockTools);
      const prompt = builder.build();

      expect(prompt).toContain("## Tool Call Style");
      expect(prompt).toContain("Routine operations");
      expect(prompt).toContain("Complex operations");
      expect(prompt).toContain("Sensitive operations");
    });

    it("should include safety rules section", () => {
      const builder = SystemPromptBuilder.createDefault(mockTools);
      const prompt = builder.build();

      expect(prompt).toContain("## Safety Rules");
      expect(prompt).toContain("### Forbidden Actions");
      expect(prompt).toContain("### Requires User Approval");
      expect(prompt).toContain("NEVER");
    });

    it("should include default safety policy items", () => {
      const builder = SystemPromptBuilder.createDefault(mockTools);
      const prompt = builder.build();

      for (const action of DEFAULT_SAFETY_POLICY.forbiddenActions) {
        expect(prompt).toContain(action);
      }
    });

    it("should include plan format section", () => {
      const builder = SystemPromptBuilder.createDefault(mockTools);
      const prompt = builder.build();

      expect(prompt).toContain("## Task Planning");
      expect(prompt).toContain("### Step Format");
      expect(prompt).toContain("### Response Format");
      expect(prompt).toContain("### Guidelines");
      expect(prompt).toContain("JSON");
    });

    it("should include workspace section when configured", () => {
      const builder = SystemPromptBuilder.createFull({
        tools: mockTools,
        workspace: {
          root: "/home/user/projects",
          sandbox: true,
          sandboxType: "docker",
        },
      });
      const prompt = builder.build();

      expect(prompt).toContain("## Workspace");
      expect(prompt).toContain("/home/user/projects");
      expect(prompt).toContain("Sandbox Mode");
      expect(prompt).toContain("docker");
    });

    it("should include user info section when configured", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2024-01-15T10:30:00Z"));

      const builder = SystemPromptBuilder.createFull({
        tools: mockTools,
        userInfo: {
          timezone: "Asia/Seoul",
          locale: "ko-KR",
          userId: "user123",
        },
      });
      const prompt = builder.build();

      expect(prompt).toContain("## User Context");
      expect(prompt).toContain("Asia/Seoul");
      expect(prompt).toContain("user123");
      expect(prompt).toContain("**Current Time**:");

      vi.useRealTimers();
    });

    it("should include runtime section when configured", () => {
      const builder = SystemPromptBuilder.createFull({
        tools: mockTools,
        runtime: {
          agentId: "agent-1",
          model: "gpt-4o",
          channelId: "discord-123",
          host: "localhost",
          os: "linux",
        },
      });
      const prompt = builder.build();

      expect(prompt).toContain("Runtime:");
      expect(prompt).toContain("Agent: agent-1");
      expect(prompt).toContain("Model: gpt-4o");
      expect(prompt).toContain("Channel: discord-123");
    });

    it("should include CLI reference when enabled", () => {
      const builder = SystemPromptBuilder.createFull({
        tools: mockTools,
        includeCLIReference: true,
      });
      const prompt = builder.build();

      expect(prompt).toContain("## CLI Reference");
      expect(prompt).toContain("moonbot gateway");
      expect(prompt).toContain("moonbot channel");
      expect(prompt).toContain("moonbot approvals");
    });

    it("should not include CLI reference by default", () => {
      const builder = SystemPromptBuilder.createDefault(mockTools);
      const prompt = builder.build();

      expect(prompt).not.toContain("## CLI Reference");
    });

    it("should include custom safety policy when provided", () => {
      const builder = SystemPromptBuilder.createFull({
        tools: mockTools,
        safety: {
          forbiddenActions: ["Custom forbidden action"],
          requireApproval: ["Custom approval action"],
          allowedDirectories: ["/safe/dir"],
        },
      });
      const prompt = builder.build();

      expect(prompt).toContain("Custom forbidden action");
      expect(prompt).toContain("Custom approval action");
    });

    it("should include extensions when configured", () => {
      const builder = SystemPromptBuilder.createFull({
        tools: mockTools,
        extensions: {
          additionalContext: ["Extra context line 1", "Extra context line 2"],
          customSections: [
            { title: "Custom Section", content: "Custom content here" },
          ],
        },
      });
      const prompt = builder.build();

      expect(prompt).toContain("## Additional Context");
      expect(prompt).toContain("Extra context line 1");
      expect(prompt).toContain("## Custom Section");
      expect(prompt).toContain("Custom content here");
    });

    it("should handle empty tools array", () => {
      const builder = SystemPromptBuilder.createDefault([]);
      const prompt = builder.build();

      expect(prompt).toContain("(No tools available)");
    });

    it("should format enum parameters correctly", () => {
      const builder = SystemPromptBuilder.createDefault(mockTools);
      const prompt = builder.build();

      expect(prompt).toContain("enum[utf8, base64]");
    });
  });

  describe("buildForResponse()", () => {
    it("should include simplified identity", () => {
      const builder = SystemPromptBuilder.createDefault(mockTools);
      const prompt = builder.buildForResponse();

      expect(prompt).toContain("Moon-Bot");
      expect(prompt).toContain("helpful assistant");
    });

    it("should include tools overview section", () => {
      const builder = SystemPromptBuilder.createDefault(mockTools);
      const prompt = builder.buildForResponse();

      expect(prompt).toContain("## Available Tools");
      expect(prompt).toContain("`browser.search`");
      expect(prompt).toContain("`fs.read`");
    });

    it("should include condensed safety section", () => {
      const builder = SystemPromptBuilder.createDefault(mockTools);
      const prompt = builder.buildForResponse();

      expect(prompt).toContain("## Safety");
      expect(prompt).toContain("harmful commands");
    });

    it("should include guidelines section", () => {
      const builder = SystemPromptBuilder.createDefault(mockTools);
      const prompt = builder.buildForResponse();

      expect(prompt).toContain("## Guidelines");
      expect(prompt).toContain("same language as the user");
    });

    it("should include runtime when configured", () => {
      const builder = SystemPromptBuilder.createFull({
        tools: mockTools,
        runtime: {
          agentId: "agent-1",
          model: "gpt-4o",
        },
      });
      const prompt = builder.buildForResponse();

      expect(prompt).toContain("Runtime:");
      expect(prompt).toContain("Agent: agent-1");
    });

    it("should be shorter than full build prompt", () => {
      const builder = SystemPromptBuilder.createDefault(mockTools);
      const fullPrompt = builder.build();
      const responsePrompt = builder.buildForResponse();

      expect(responsePrompt.length).toBeLessThan(fullPrompt.length);
    });
  });

  describe("createDefault()", () => {
    it("should create builder with default identity", () => {
      const builder = SystemPromptBuilder.createDefault(mockTools);
      const prompt = builder.build();

      expect(prompt).toContain("Moon-Bot");
      expect(prompt).toContain("AI agent");
    });

    it("should enable tool call style by default", () => {
      const builder = SystemPromptBuilder.createDefault(mockTools);
      const prompt = builder.build();

      expect(prompt).toContain("## Tool Call Style");
    });

    it("should not include CLI reference by default", () => {
      const builder = SystemPromptBuilder.createDefault(mockTools);
      const prompt = builder.build();

      expect(prompt).not.toContain("## CLI Reference");
    });
  });

  describe("createFull()", () => {
    it("should allow custom identity", () => {
      const builder = SystemPromptBuilder.createFull({
        tools: mockTools,
        identity: {
          name: "CustomBot",
          description: "a custom AI assistant",
        },
      });
      const prompt = builder.build();

      expect(prompt).toContain("CustomBot");
      expect(prompt).toContain("custom AI assistant");
    });

    it("should allow all configurations", () => {
      const builder = SystemPromptBuilder.createFull({
        tools: mockTools,
        identity: {
          name: "FullBot",
          description: "fully configured bot",
        },
        workspace: { root: "/workspace" },
        userInfo: { timezone: "UTC" },
        runtime: { agentId: "full-1", model: "gpt-4" },
        includeToolCallStyle: true,
        includeCLIReference: true,
      });
      const prompt = builder.build();

      expect(prompt).toContain("FullBot");
      expect(prompt).toContain("/workspace");
      expect(prompt).toContain("UTC");
      expect(prompt).toContain("Agent: full-1");
      expect(prompt).toContain("## Tool Call Style");
      expect(prompt).toContain("## CLI Reference");
    });
  });

  describe("DEFAULT_SAFETY_POLICY", () => {
    it("should have forbidden actions", () => {
      expect(DEFAULT_SAFETY_POLICY.forbiddenActions).toBeInstanceOf(Array);
      expect(DEFAULT_SAFETY_POLICY.forbiddenActions.length).toBeGreaterThan(0);
    });

    it("should have require approval items", () => {
      expect(DEFAULT_SAFETY_POLICY.requireApproval).toBeInstanceOf(Array);
      expect(DEFAULT_SAFETY_POLICY.requireApproval.length).toBeGreaterThan(0);
    });

    it("should include critical safety rules", () => {
      const forbidden = DEFAULT_SAFETY_POLICY.forbiddenActions.join(" ");

      expect(forbidden).toContain("damage");
      expect(forbidden).toContain("Self-replicate");
      expect(forbidden).toContain("system prompt");
    });
  });
});
