/**
 * GatewayAuthenticator
 *
 * Handles authentication for gateway connections.
 * Single responsibility: token validation using timing-safe comparison.
 */

import { timingSafeEqual } from "crypto";
import type { SystemConfig } from "../types/index.js";
import { createLogger, type Logger } from "../utils/logger.js";
import { ConnectionRateLimiter } from "./ConnectionRateLimiter.js";
import { ErrorSanitizer } from "../utils/error-sanitizer.js";

/** Error codes for authentication failures */
const AuthErrorCode = {
  MISSING_TOKEN: 'AUTH_MISSING_TOKEN',
  RATE_LIMITED: 'RATE_LIMIT_EXCEEDED',
  INVALID_TOKEN: 'AUTH_INVALID_TOKEN',
} as const;

/**
 * Authentication configuration.
 */
export interface AuthConfig {
  tokens?: Record<string, string>; // name -> hashed token (hex)
}

export class GatewayAuthenticator {
  private authConfig: AuthConfig | null;
  private logger: Logger;
  private rateLimiter: ConnectionRateLimiter;

  constructor(config: SystemConfig, rateLimiter: ConnectionRateLimiter) {
    this.authConfig = this.parseAuthConfig(config);
    this.logger = createLogger(config);
    this.rateLimiter = rateLimiter;
  }

  /**
   * Check if authentication is required.
   */
  isAuthRequired(): boolean {
    return this.authConfig !== null;
  }

  /**
   * Validate a connection token.
   * Uses timing-safe comparison to prevent timing attacks.
   * @param token - Token to validate (hex string)
   * @throws Error with sanitized message if validation fails
   */
  validateToken(token: string): void {
    if (!this.authConfig) {
      return;
    }

    if (!token) {
      this.throwAuthError(
        "Authentication required",
        AuthErrorCode.MISSING_TOKEN,
        "Connection attempt without token"
      );
    }

    if (!this.rateLimiter.checkTokenLimit(token)) {
      this.throwAuthError(
        "Rate limit exceeded",
        AuthErrorCode.RATE_LIMITED,
        "Token rate limited"
      );
    }

    if (!this.isValidToken(token)) {
      this.throwAuthError(
        "Authentication failed",
        AuthErrorCode.INVALID_TOKEN,
        "Invalid token attempt"
      );
    }
  }

  /**
   * Parse authentication configuration from system config.
   * @private
   */
  private parseAuthConfig(config: SystemConfig): AuthConfig | null {
    const authConfig = config.gateways?.[0]?.auth;
    if (!authConfig?.tokens || Object.keys(authConfig.tokens).length === 0) {
      return null;
    }
    return authConfig;
  }

  /**
   * Check if token matches any valid token using timing-safe comparison.
   * @private
   */
  private isValidToken(token: string): boolean {
    const validTokens = Object.values(this.authConfig!.tokens ?? []);

    for (const validToken of validTokens) {
      try {
        if (timingSafeEqual(
          Buffer.from(validToken, 'hex'),
          Buffer.from(token, 'hex')
        )) {
          return true;
        }
      } catch {
        // Length mismatch: continue checking (timing-safe)
      }
    }

    return false;
  }

  /**
   * Throw a sanitized authentication error.
   * @private
   */
  private throwAuthError(message: string, code: string, logMessage?: string): never {
    if (logMessage) {
      this.logger.warn(logMessage);
    }
    const sanitized = ErrorSanitizer.sanitizeWithCode(new Error(message), code);
    throw new Error(sanitized.message);
  }
}
