// FailureAnalyzer - Classifies tool failures for recovery strategy

import { FailureType, type ToolFailure } from "./types.js";
import { type Logger } from "../../utils/logger.js";

export class FailureAnalyzer {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Classify a tool failure into a specific failure type
   */
  classifyFailure(failure: ToolFailure): FailureType {
    const { result, error } = failure;

    // Check result error code first
    if (result?.error) {
      return this.classifyByErrorCode(result.error.code, result.error.message);
    }

    // Check error object
    if (error) {
      return this.classifyByError(error);
    }

    this.logger.warn("Unclassified failure", { toolId: failure.toolId });
    return FailureType.UNKNOWN;
  }

  /**
   * Classify by error code from ToolResult
   */
  private classifyByErrorCode(code: string, message: string): FailureType {
    // Network-related errors
    if (
      code === "NETWORK_ERROR" ||
      code === "CONNECTION_ERROR" ||
      code === "TIMEOUT" ||
      code === "ECONNREFUSED" ||
      code === "ENOTFOUND" ||
      code === "ETIMEDOUT" ||
      message.includes("network") ||
      message.includes("timeout") ||
      message.includes("ECONNREFUSED")
    ) {
      return FailureType.NETWORK_FAILURE;
    }

    // Permission-related errors
    if (
      code === "PERMISSION_DENIED" ||
      code === "APPROVAL_DENIED" ||
      code === "EACCES" ||
      code === "EPERM" ||
      message.includes("permission") ||
      message.includes("unauthorized") ||
      message.includes("forbidden") ||
      message.includes("denied")
    ) {
      return FailureType.PERMISSION_DENIED;
    }

    // Validation errors
    if (
      code === "INVALID_INPUT" ||
      code === "VALIDATION_ERROR" ||
      code === "SCHEMA_VALIDATION_FAILED" ||
      message.includes("validation") ||
      message.includes("invalid input") ||
      message.includes("schema")
    ) {
      return FailureType.INVALID_INPUT;
    }

    // Tool not found
    if (
      code === "TOOL_NOT_FOUND" ||
      code === "UNKNOWN_TOOL" ||
      message.includes("not found") ||
      message.includes("unknown tool")
    ) {
      return FailureType.TOOL_NOT_FOUND;
    }

    // Resource exhaustion
    if (
      code === "RESOURCE_EXHAUSTED" ||
      code === "CONCURRENCY_LIMIT" ||
      code === "QUOTA_EXCEEDED" ||
      code === "ENOMEM" ||
      message.includes("resource") ||
      message.includes("quota") ||
      message.includes("limit")
    ) {
      return FailureType.RESOURCE_EXHAUSTED;
    }

    // Timeout specific classification
    if (
      code === "TIMEOUT" ||
      code === "ETIMEDOUT" ||
      message.includes("timeout") ||
      message.includes("timed out")
    ) {
      return FailureType.TIMEOUT;
    }

    return FailureType.UNKNOWN;
  }

  /**
   * Classify by Error object
   */
  private classifyByError(error: Error): FailureType {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    // Network errors
    if (
      message.includes("network") ||
      message.includes("econnrefused") ||
      message.includes("enotfound") ||
      message.includes("etimedout") ||
      message.includes("timeout") ||
      message.includes("connection") ||
      name.includes("network") ||
      name.includes("timeout")
    ) {
      return FailureType.NETWORK_FAILURE;
    }

    // Permission errors
    if (
      message.includes("permission") ||
      message.includes("eacces") ||
      message.includes("eperm") ||
      message.includes("unauthorized") ||
      message.includes("forbidden") ||
      message.includes("denied") ||
      name.includes("permission")
    ) {
      return FailureType.PERMISSION_DENIED;
    }

    // Validation errors
    if (
      message.includes("validation") ||
      message.includes("invalid") ||
      message.includes("schema") ||
      name.includes("validation")
    ) {
      return FailureType.INVALID_INPUT;
    }

    // Tool not found
    if (
      message.includes("not found") ||
      message.includes("unknown") ||
      name.includes("notfound")
    ) {
      return FailureType.TOOL_NOT_FOUND;
    }

    // Resource errors
    if (
      message.includes("resource") ||
      message.includes("quota") ||
      message.includes("limit") ||
      message.includes("enomem") ||
      name.includes("resource")
    ) {
      return FailureType.RESOURCE_EXHAUSTED;
    }

    // Timeout errors
    if (
      message.includes("timeout") ||
      message.includes("timed out") ||
      name.includes("timeout")
    ) {
      return FailureType.TIMEOUT;
    }

    return FailureType.UNKNOWN;
  }

  /**
   * Check if failure is recoverable
   */
  isRecoverable(failureType: FailureType): boolean {
    switch (failureType) {
      case FailureType.NETWORK_FAILURE:
      case FailureType.TIMEOUT:
      case FailureType.RESOURCE_EXHAUSTED:
        return true; // Can retry or use alternative

      case FailureType.PERMISSION_DENIED:
        return false; // Requires user intervention

      case FailureType.INVALID_INPUT:
        return false; // Input must be fixed

      case FailureType.TOOL_NOT_FOUND:
        return true; // Can use alternative

      case FailureType.UNKNOWN:
        return true; // Try recovery as fallback

      default:
        return false;
    }
  }

  /**
   * Get recommended recovery action for failure type
   */
  getRecommendedAction(failureType: FailureType): {
    canRetry: boolean;
    canUseAlternative: boolean;
    needsApproval: boolean;
  } {
    switch (failureType) {
      case FailureType.NETWORK_FAILURE:
      case FailureType.TIMEOUT:
        return { canRetry: true, canUseAlternative: true, needsApproval: false };

      case FailureType.RESOURCE_EXHAUSTED:
        return { canRetry: true, canUseAlternative: true, needsApproval: false };

      case FailureType.PERMISSION_DENIED:
        return { canRetry: false, canUseAlternative: false, needsApproval: true };

      case FailureType.INVALID_INPUT:
        return { canRetry: false, canUseAlternative: false, needsApproval: false };

      case FailureType.TOOL_NOT_FOUND:
        return { canRetry: false, canUseAlternative: true, needsApproval: false };

      case FailureType.UNKNOWN:
        return { canRetry: true, canUseAlternative: true, needsApproval: false };

      default:
        return { canRetry: false, canUseAlternative: false, needsApproval: false };
    }
  }
}
