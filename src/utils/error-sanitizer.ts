// Error message sanitization to prevent information disclosure

export interface SanitizedError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Sanitize error messages to prevent information disclosure.
 *
 * Security rules:
 * - Remove file paths (keep filename only)
 * - Remove stack traces in production
 * - Generic messages for authentication errors
 * - Preserve error codes for debugging
 *
 * @example
 * const original = new Error("Failed at /home/user/project/src/file.ts:42");
 * const sanitized = ErrorSanitizer.sanitize(original);
 * // Returns: { code: 'UNKNOWN', message: 'Failed at [path]' }
 */
export class ErrorSanitizer {
  private static readonly SENSITIVE_PATTERNS = [
    /\/[a-zA-Z0-9_\-/.]+\//g, // Unix paths: /home/user/project/
    /[a-zA-Z]:\\[a-zA-Z0-9_\-\\.]+\\/g, // Windows paths: C:\Users\project\
    /at .*\(.*:\d+:\d+\)/g, // Stack traces: at functionName (file.js:10:5)
    /\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/gi, // UUIDs
  ];

  private static readonly AUTH_KEYWORDS = [
    'token', 'auth', 'credential', 'unauthorized', 'forbidden', 'login'
  ];

  /**
   * Sanitize an error to prevent information disclosure.
   * @param error Error object or message string
   * @returns Sanitized error with code and message
   */
  static sanitize(error: Error | string): SanitizedError {
    const message = typeof error === 'string' ? error : error.message;

    // Authentication errors: generic message
    if (this.isAuthError(message)) {
      return {
        code: 'AUTH_FAILED',
        message: 'Authentication failed'
      };
    }

    // Remove sensitive patterns (paths, stack traces, UUIDs)
    let sanitized = message;
    for (const pattern of this.SENSITIVE_PATTERNS) {
      sanitized = sanitized.replace(pattern, '[path]');
    }

    return {
      code: 'UNKNOWN',
      message: sanitized
    };
  }

  /**
   * Sanitize error with custom error code.
   * @param error Error object or message string
   * @param code Custom error code
   * @returns Sanitized error with custom code
   */
  static sanitizeWithCode(error: Error | string, code: string): SanitizedError {
    const sanitized = this.sanitize(error);
    return {
      ...sanitized,
      code
    };
  }

  /**
   * Check if message contains authentication-related keywords.
   */
  private static isAuthError(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    return this.AUTH_KEYWORDS.some(keyword => lowerMessage.includes(keyword));
  }

  /**
   * Create a generic error response for client-side consumption.
   * Hides internal details while preserving error codes.
   */
  static toClientResponse(error: Error | string): { code: string; message: string } {
    const sanitized = this.sanitize(error);
    return {
      code: sanitized.code,
      message: sanitized.message
    };
  }
}
