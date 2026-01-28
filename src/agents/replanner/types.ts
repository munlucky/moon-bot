// Replanner Types - Failure Recovery and Path Replanning

import type { Step, ToolResult } from "../../types/index.js";

/**
 * Failure classification types
 */
export enum FailureType {
  NETWORK_FAILURE = "NETWORK",
  PERMISSION_DENIED = "PERMISSION",
  INVALID_INPUT = "VALIDATION",
  TOOL_NOT_FOUND = "NOT_FOUND",
  RESOURCE_EXHAUSTED = "RESOURCE",
  TIMEOUT = "TIMEOUT",
  UNKNOWN = "UNKNOWN",
}

/**
 * Recovery action types
 */
export enum RecoveryAction {
  RETRY = "RETRY",
  USE_ALTERNATIVE = "ALTERNATIVE",
  REQUEST_APPROVAL = "APPROVAL",
  ABORT = "ABORT",
}

/**
 * Tool failure information
 */
export interface ToolFailure {
  toolId: string;
  step: Step;
  result?: ToolResult;
  error?: Error;
  attemptCount: number;
  alternativeAttemptCount: number;
  timestamp: number;
}

/**
 * Recovery plan result
 */
export interface RecoveryPlan {
  action: RecoveryAction;
  toolId?: string;
  reason?: string;
  message?: string;
  newSteps?: Step[];
}

/**
 * Alternative tool mapping
 */
export interface AlternativeTool {
  toolId: string;
  priority: number;
  requiresApproval?: boolean;
}

/**
 * Execution context for replanning
 */
export interface ExecutionContext {
  sessionId: string;
  agentId: string;
  userId: string;
  remainingGoals: string[];
  completedSteps: Step[];
  failedStep: Step;
  startTime: number;
}

/**
 * Recovery limits configuration
 */
export interface RecoveryLimitsConfig {
  maxRetries: number;
  maxAlternatives: number;
  globalTimeout: number;
  autoRetry: boolean;
  logRecovery: boolean;
}

/**
 * Recovery attempt record
 */
export interface RecoveryAttempt {
  attemptId: string;
  originalToolId: string;
  action: RecoveryAction;
  alternativeToolId?: string;
  timestamp: number;
  success: boolean;
  durationMs: number;
}

/**
 * Tool alternative mapping configuration
 * Maps primary tools to their alternatives
 */
export interface ToolAlternativeMap {
  [primaryTool: string]: AlternativeTool[];
}
