/**
 * ToolRegistry
 *
 * Manages tool registration and lookup.
 * Single responsibility: tool storage and retrieval.
 */

import type { ToolSpec } from "../../types/index.js";
import { createLogger, type Logger } from "../../utils/logger.js";

/**
 * Tool information for listing.
 */
export interface ToolInfo {
  id: string;
  description: string;
  schema: object;
  requiresApproval?: boolean;
}

export class ToolRegistry {
  private tools = new Map<string, ToolSpec>();
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Register a tool with the runtime.
   */
  register(spec: ToolSpec): void {
    this.tools.set(spec.id, spec);
    this.logger.info(`Tool registered: ${spec.id}`);
  }

  /**
   * Unregister a tool from the runtime.
   */
  unregister(id: string): void {
    this.tools.delete(id);
    this.logger.info(`Tool unregistered: ${id}`);
  }

  /**
   * Get a tool by ID.
   */
  get(id: string): ToolSpec | undefined {
    return this.tools.get(id);
  }

  /**
   * Check if a tool is registered.
   */
  has(id: string): boolean {
    return this.tools.has(id);
  }

  /**
   * List all registered tools.
   */
  list(): ToolInfo[] {
    return Array.from(this.tools.values()).map((tool) => ({
      id: tool.id,
      description: tool.description,
      schema: tool.schema,
      requiresApproval: tool.requiresApproval,
    }));
  }

  /**
   * Get all registered tools as a map.
   */
  getAll(): Map<string, ToolSpec> {
    return new Map(this.tools);
  }

  /**
   * Get the number of registered tools.
   */
  get size(): number {
    return this.tools.size;
  }
}
