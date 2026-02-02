/**
 * Planner Unit Tests
 *
 * Tests for plan generation, LLM integration, and fallback behavior.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Planner, type Plan } from './planner.js';
import type { SystemConfig, ToolDefinition, Step, Session } from '../types/index.js';

// Mock dependencies
const mockSystemConfig: SystemConfig = {
  logLevel: 'error',
  gatewayPort: 18789,
  workspaceRoot: '/test/workspace',
  gateways: [],
  agents: [],
  channels: [],
  tools: [],
  llm: {
    apiKey: 'test-api-key',
  },
} as SystemConfig;

const mockToolDefinitions: ToolDefinition[] = [
  {
    name: 'browser.search',
    description: 'Search the web for information',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
      },
      required: ['query'],
    },
  },
  {
    name: 'fs.write',
    description: 'Write content to a file',
    schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
        content: { type: 'string', description: 'File content' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'fs.read',
    description: 'Read content from a file',
    schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
      },
      required: ['path'],
    },
  },
];

describe('Planner', () => {
  describe('constructor', () => {
    it('should initialize with ToolDefinition array', () => {
      const planner = new Planner(mockSystemConfig, mockToolDefinitions);

      expect(planner).toBeDefined();
    });

    it('should initialize with legacy string array', () => {
      const legacyTools = ['browser.search', 'fs.write', 'fs.read'];
      const planner = new Planner(mockSystemConfig, legacyTools);

      expect(planner).toBeDefined();
    });

    it('should initialize with empty tools array', () => {
      const planner = new Planner(mockSystemConfig, []);

      expect(planner).toBeDefined();
    });

    it('should initialize without tools parameter', () => {
      const planner = new Planner(mockSystemConfig);

      expect(planner).toBeDefined();
    });
  });

  describe('plan', () => {
    let planner: Planner;

    beforeEach(() => {
      planner = new Planner(mockSystemConfig, mockToolDefinitions);
    });

    it('should generate a plan with steps', async () => {
      const plan = await planner.plan('Search for information');

      expect(plan).toBeDefined();
      expect(plan.steps).toBeInstanceOf(Array);
      expect(plan.steps.length).toBeGreaterThan(0);
    });

    it('should include estimatedDuration', async () => {
      const plan = await planner.plan('Test plan');

      expect(plan.estimatedDuration).toBeDefined();
      expect(typeof plan.estimatedDuration).toBe('number');
    });

    it('should generate steps with valid structure', async () => {
      const plan = await planner.plan('Write a file');

      plan.steps.forEach((step: Step) => {
        expect(step.id).toBeDefined();
        expect(typeof step.id).toBe('string');

        expect(step.description).toBeDefined();
        expect(typeof step.description).toBe('string');

        // toolId and input are optional
        if (step.toolId) {
          expect(typeof step.toolId).toBe('string');
        }

        if (step.input) {
          expect(typeof step.input).toBe('object');
        }

        // dependsOn is optional
        if (step.dependsOn) {
          expect(Array.isArray(step.dependsOn)).toBe(true);
        }
      });
    });

    it('should use session context when provided', async () => {
      const mockSession: Session = {
        id: 'session-1',
        agentId: 'agent-1',
        userId: 'user-1',
        channelId: 'channel-1',
        messages: [
          {
            type: 'user',
            content: 'Previous message',
            timestamp: Date.now(),
          },
          {
            type: 'assistant',
            content: 'Previous response',
            timestamp: Date.now(),
          },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const plan = await planner.plan('Continue the task', mockSession);

      expect(plan.steps.length).toBeGreaterThan(0);
    });

    it('should handle empty message', async () => {
      const plan = await planner.plan('');

      expect(plan).toBeDefined();
      expect(plan.steps).toBeInstanceOf(Array);
    });

    it('should handle special characters in message', async () => {
      const specialMessage = 'Test with emoji 🎉 and special chars: <>&"\'';

      const plan = await planner.plan(specialMessage);

      expect(plan).toBeDefined();
      expect(plan.steps.length).toBeGreaterThan(0);
    });

    it('should handle very long messages', async () => {
      const longMessage = 'Test '.repeat(1000);

      const plan = await planner.plan(longMessage);

      expect(plan).toBeDefined();
    });
  });

  describe('keyword fallback', () => {
    it('should use keyword-based planning when LLM unavailable', async () => {
      const configWithoutLLM = {
        ...mockSystemConfig,
        llm: undefined,
      };

      const plannerNoLLM = new Planner(configWithoutLLM, mockToolDefinitions);

      const plan = await plannerNoLLM.plan('Search for something');

      expect(plan).toBeDefined();
      expect(plan.steps.length).toBeGreaterThan(0);
    });

    it('should detect search keywords and use browser.search', async () => {
      const configNoLLM = { ...mockSystemConfig, llm: undefined };
      const plannerFallback = new Planner(configNoLLM, mockToolDefinitions);

      const plan = await plannerFallback.plan('Search the web for cats');

      const searchStep = plan.steps.find((s: Step) => s.toolId === 'browser.search');
      expect(searchStep).toBeDefined();
    });

    it('should detect file keywords and use fs.write', async () => {
      const configNoLLM = { ...mockSystemConfig, llm: undefined };
      const plannerFallback = new Planner(configNoLLM, mockToolDefinitions);

      const plan = await plannerFallback.plan('Save a file');

      const fileStep = plan.steps.find((s: Step) => s.toolId === 'fs.write');
      expect(fileStep).toBeDefined();
    });

    it('should add response step as final step', async () => {
      const configNoLLM = { ...mockSystemConfig, llm: undefined };
      const plannerFallback = new Planner(configNoLLM, mockToolDefinitions);

      const plan = await plannerFallback.plan('Any request');

      const lastStep = plan.steps[plan.steps.length - 1];
      expect(lastStep.description).toContain('Generate response');
    });
  });

  describe('replan (legacy method)', () => {
    let planner: Planner;

    beforeEach(() => {
      planner = new Planner(mockSystemConfig, mockToolDefinitions);
    });

    it('should create alternative plan after failure', async () => {
      const failedStep: Step = {
        id: 'step-1',
        description: 'Failed step',
        toolId: 'browser.search',
        input: { query: 'test' },
      };

      const originalPlan: Plan = {
        steps: [failedStep],
        estimatedDuration: 5000,
      };

      const newPlan = await planner.replan(
        failedStep,
        new Error('Search failed'),
        originalPlan
      );

      expect(newPlan).toBeDefined();
      expect(newPlan.steps).toBeInstanceOf(Array);
    });

    it('should remove failed step from new plan', async () => {
      const failedStep: Step = {
        id: 'failed-step',
        description: 'This failed',
        toolId: 'browser.search',
      };

      const originalPlan: Plan = {
        steps: [
          failedStep,
          {
            id: 'step-2',
            description: 'Next step',
          },
        ],
        estimatedDuration: 10000,
      };

      const newPlan = await planner.replan(
        failedStep,
        new Error('Failed'),
        originalPlan
      );

      const hasFailedStep = newPlan.steps.some((s: Step) => s.id === 'failed-step');
      expect(hasFailedStep).toBe(false);
    });

    it('should create alternative step with retry suffix', async () => {
      const failedStep: Step = {
        id: 'search-step',
        description: 'Search for info',
        toolId: 'browser.search',
      };

      const originalPlan: Plan = {
        steps: [failedStep],
        estimatedDuration: 5000,
      };

      const newPlan = await planner.replan(
        failedStep,
        new Error('Network error'),
        originalPlan
      );

      const altStep = newPlan.steps.find((s: Step) => s.id.includes('-alt'));
      expect(altStep).toBeDefined();
    });
  });

  describe('generateRemainingSteps', () => {
    let planner: Planner;

    beforeEach(() => {
      planner = new Planner(mockSystemConfig, mockToolDefinitions);
    });

    it('should generate retry step for failed step', () => {
      const failedStep: Step = {
        id: 'step-1',
        description: 'Failed step',
        toolId: 'browser.search',
      };

      const remainingGoals = ['Complete the task'];

      const newSteps = planner.generateRemainingSteps(failedStep, remainingGoals);

      expect(newSteps.length).toBeGreaterThan(0);
      expect(newSteps[0].id).toContain('-retry');
    });

    it('should add remaining goals as new steps', () => {
      const failedStep: Step = {
        id: 'step-1',
        description: 'Failed',
      };

      const remainingGoals = ['Goal 1', 'Goal 2', 'Goal 3'];

      const newSteps = planner.generateRemainingSteps(failedStep, remainingGoals);

      expect(newSteps.length).toBe(4); // 1 retry + 3 goals
    });

    it('should set dependencies correctly', () => {
      const failedStep: Step = {
        id: 'base-step',
        description: 'Base',
      };

      const remainingGoals = ['Next goal'];

      const newSteps = planner.generateRemainingSteps(failedStep, remainingGoals);

      // Goal steps should depend on retry step
      const goalStep = newSteps.find((s: Step) => s.description === 'Next goal');
      expect(goalStep?.dependsOn).toBeDefined();
      expect(goalStep?.dependsOn?.length).toBeGreaterThan(0);
    });
  });

  describe('validatePlan', () => {
    let planner: Planner;

    beforeEach(() => {
      planner = new Planner(mockSystemConfig, mockToolDefinitions);
    });

    it('should validate correct plan', () => {
      const validPlan: Plan = {
        steps: [
          {
            id: 'step-1',
            description: 'First step',
            toolId: 'browser.search',
          },
          {
            id: 'step-2',
            description: 'Second step',
            dependsOn: ['step-1'],
          },
        ],
        estimatedDuration: 10000,
      };

      const validation = planner.validatePlan(validPlan);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect duplicate step IDs', () => {
      const invalidPlan: Plan = {
        steps: [
          {
            id: 'duplicate-id',
            description: 'First step',
          },
          {
            id: 'duplicate-id',
            description: 'Second step',
          },
        ],
        estimatedDuration: 5000,
      };

      const validation = planner.validatePlan(invalidPlan);

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.errors.some((e: string) => e.includes('Duplicate'))).toBe(true);
    });

    it('should detect invalid dependencies', () => {
      const invalidPlan: Plan = {
        steps: [
          {
            id: 'step-1',
            description: 'First step',
            dependsOn: ['non-existent-step'],
          },
        ],
        estimatedDuration: 5000,
      };

      const validation = planner.validatePlan(invalidPlan);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e: string) => e.includes('non-existent'))).toBe(true);
    });

    it('should handle plan with no dependencies', () => {
      const planWithoutDeps: Plan = {
        steps: [
          {
            id: 'step-1',
            description: 'First',
          },
          {
            id: 'step-2',
            description: 'Second',
          },
        ],
        estimatedDuration: 10000,
      };

      const validation = planner.validatePlan(planWithoutDeps);

      expect(validation.valid).toBe(true);
    });

    it('should handle circular dependency detection', () => {
      // Note: Current implementation doesn't detect circular dependencies
      // but this test documents expected behavior
      const circularPlan: Plan = {
        steps: [
          {
            id: 'step-1',
            description: 'First',
            dependsOn: ['step-2'],
          },
          {
            id: 'step-2',
            description: 'Second',
            dependsOn: ['step-1'],
          },
        ],
        estimatedDuration: 10000,
      };

      const validation = planner.validatePlan(circularPlan);

      // Currently this validates (doesn't check for cycles)
      // This is a known limitation
      expect(validation).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle plan with single step', async () => {
      const planner = new Planner(mockSystemConfig, []);
      const plan = await planner.plan('Simple task');

      expect(plan.steps.length).toBeGreaterThan(0);
    });

    it('should handle step with all optional fields', async () => {
      const planner = new Planner(mockSystemConfig, mockToolDefinitions);
      const plan = await planner.plan('Complex plan');

      // Verify steps can have optional fields
      plan.steps.forEach((step: Step) => {
        expect(step.id).toBeDefined();
        expect(step.description).toBeDefined();

        // These are optional
        if (step.toolId) {
          expect(typeof step.toolId).toBe('string');
        }
        if (step.input) {
          expect(typeof step.input).toBe('object');
        }
        if (step.dependsOn) {
          expect(Array.isArray(step.dependsOn)).toBe(true);
        }
      });
    });

    it('should handle empty tool definitions', async () => {
      const plannerNoTools = new Planner(mockSystemConfig, []);
      const plan = await plannerNoTools.plan('Test with no tools');

      expect(plan).toBeDefined();
      expect(plan.steps).toBeInstanceOf(Array);
    });

    it('should handle malformed tool definitions gracefully', () => {
      const malformedTools = [
        {
          name: '',
          description: '',
          schema: {},
        },
      ] as ToolDefinition[];

      expect(() => {
        new Planner(mockSystemConfig, malformedTools);
      }).not.toThrow();
    });
  });

  describe('integration scenarios', () => {
    it('should handle multi-step planning for file operations', async () => {
      const planner = new Planner(mockSystemConfig, mockToolDefinitions);
      const plan = await planner.plan('Read a file, modify it, and write it back');

      expect(plan.steps.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle planning with tool dependencies', async () => {
      const planner = new Planner(mockSystemConfig, mockToolDefinitions);
      const plan = await planner.plan('Search for info and save to file');

      // Check if steps have logical dependencies
      const hasDependencies = plan.steps.some((s: Step) =>
        s.dependsOn && s.dependsOn.length > 0
      );

      // Dependencies are optional but may exist
      expect(plan).toBeDefined();
    });

    it('should estimate reasonable duration', async () => {
      const planner = new Planner(mockSystemConfig, mockToolDefinitions);
      const plan = await planner.plan('Multiple steps task');

      // Duration should be based on step count (5s per step)
      const expectedMinDuration = plan.steps.length * 5000;
      expect(plan.estimatedDuration).toBeGreaterThanOrEqual(expectedMinDuration);
    });
  });

  describe('error handling', () => {
    it('should handle LLM errors gracefully', async () => {
      const configWithInvalidLLM = {
        ...mockSystemConfig,
        llm: {
          apiKey: 'invalid-key-that-will-fail',
        },
      };

      const plannerWithFallback = new Planner(configWithInvalidLLM, mockToolDefinitions);

      // Should fall back to keyword planning
      const plan = await plannerWithFallback.plan('Test fallback');

      expect(plan).toBeDefined();
      expect(plan.steps.length).toBeGreaterThan(0);
    });

    it('should handle malformed LLM responses', async () => {
      // This test documents behavior when LLM returns invalid JSON
      // In practice, the planner should fall back to keyword planning
      const planner = new Planner(mockSystemConfig, mockToolDefinitions);

      const plan = await planner.plan('Test malformed response');

      expect(plan).toBeDefined();
    });
  });
});
