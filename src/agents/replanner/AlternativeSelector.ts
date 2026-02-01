// AlternativeSelector - Selects alternative tools for recovery

import type { ToolSpec } from "../../types/index.js";
import { FailureType } from "./types.js";
import type {
  AlternativeTool,
  ToolAlternativeMap,
  ToolFailure,
} from "./types.js";
import { type Logger } from "../../utils/logger.js";

/**
 * Default tool alternative mapping
 * Maps primary tools to their functional alternatives
 */
const DEFAULT_ALTERNATIVES: ToolAlternativeMap = {
  // Browser tools
  "browser.goto": [
    { toolId: "http.request", priority: 1 },
  ],
  "browser.search": [
    { toolId: "http.request", priority: 1 },
  ],
  "browser.open": [
    { toolId: "http.request", priority: 1 },
  ],

  // HTTP tools
  "http.request": [
    { toolId: "browser.goto", priority: 1, requiresApproval: false },
  ],

  // Filesystem tools
  "filesystem.read": [],

  // System tools (no alternatives - require approval)
  "system.run": [],

  // File write has no safe alternative
  "filesystem.write": [],
};

export class AlternativeSelector {
  private logger: Logger;
  private alternatives: ToolAlternativeMap;
  private availableTools: Map<string, ToolSpec>;

  constructor(logger: Logger, availableTools: ToolSpec[], customAlternatives?: ToolAlternativeMap) {
    this.logger = logger;
    this.alternatives = { ...DEFAULT_ALTERNATIVES, ...customAlternatives };
    this.availableTools = new Map(
      availableTools.map((tool) => [tool.id, tool])
    );
  }

  /**
   * Find alternative tools for a failed tool
   */
  findAlternatives(failure: ToolFailure, _failureType: FailureType): AlternativeTool[] {
    const { toolId } = failure;

    // Get configured alternatives
    const configuredAlts = this.alternatives[toolId] || [];

    // Filter by availability
    const availableAlts = configuredAlts.filter((alt) =>
      this.availableTools.has(alt.toolId)
    );

    if (availableAlts.length === 0) {
      this.logger.debug(`No alternatives found for tool: ${toolId}`);
      return [];
    }

    // Sort by priority (lower number = higher priority)
    const sorted = availableAlts.sort((a, b) => a.priority - b.priority);

    this.logger.info(`Found ${sorted.length} alternatives for ${toolId}`, {
      alternatives: sorted.map((a) => a.toolId),
    });

    return sorted;
  }

  /**
   * Select the best alternative tool
   */
  selectBest(
    failure: ToolFailure,
    failureType: FailureType,
    attemptedAlternatives?: string[]
  ): AlternativeTool | null {
    const alternatives = this.findAlternatives(failure, failureType);

    if (alternatives.length === 0) {
      return null;
    }

    // Filter out already attempted alternatives
    const available = attemptedAlternatives
      ? alternatives.filter((alt) => !attemptedAlternatives.includes(alt.toolId))
      : alternatives;

    if (available.length === 0) {
      this.logger.warn("All alternatives have been attempted");
      return null;
    }

    // Select highest priority (first after sorting)
    const selected = available[0];

    this.logger.info(`Selected alternative: ${selected.toolId} for ${failure.toolId}`, {
      priority: selected.priority,
      requiresApproval: selected.requiresApproval,
    });

    return selected;
  }

  /**
   * Check if a tool has alternatives
   */
  hasAlternatives(toolId: string): boolean {
    const alternatives = this.alternatives[toolId] || [];
    return alternatives.length > 0;
  }

  /**
   * Add a custom alternative mapping
   */
  addAlternative(primaryTool: string, alternative: AlternativeTool): void {
    if (!this.alternatives[primaryTool]) {
      this.alternatives[primaryTool] = [];
    }
    this.alternatives[primaryTool].push(alternative);
    this.logger.debug(`Added alternative ${alternative.toolId} for ${primaryTool}`);
  }

  /**
   * Get all alternative mappings
   */
  getAlternativeMap(): ToolAlternativeMap {
    return { ...this.alternatives };
  }

  /**
   * Update available tools (for dynamic tool registration)
   */
  updateTools(tools: ToolSpec[]): void {
    this.availableTools = new Map(tools.map((tool) => [tool.id, tool]));
    this.logger.debug(`Updated available tools: ${tools.length} tools`);
  }
}
