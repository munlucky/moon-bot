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
    const authConfig = config.gateways?.[0]?.auth;
    this.authConfig = authConfig?.tokens && Object.keys(authConfig.tokens).length > 0
      ? authConfig
      : null;
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
   * @returns true if token is valid
   * @throws Error with sanitized message if validation fails
   */
  validateToken(token: string): void {
    if (!this.authConfig) {
      return; // No auth configured
    }

    if (!token) {
      this.logger.warn("Connection attempt without token");
      const sanitized = ErrorSanitizer.sanitizeWithCode(
        new Error("Authentication required"),
        'AUTH_MISSING_TOKEN'
      );
      throw new Error(sanitized.message);
    }

    // Check token-based rate limit (prevents IP bypass)
    if (!this.rateLimiter.checkTokenLimit(token)) {
      this.logger.warn(`Token rate limited`);
      const sanitized = ErrorSanitizer.sanitizeWithCode(
        new Error("Rate limit exceeded"),
        'RATE_LIMIT_EXCEEDED'
      );
      throw new Error(sanitized.message);
    }

    // Use timing-safe comparison to prevent timing attacks
    // Compare against VALUES (hashed tokens), not keys
    // Must iterate ALL tokens to prevent timing leak via short-circuit
    let isValidToken = false;
    const validTokens = this.authConfig.tokens ? Object.values(this.authConfig.tokens) : [];
    for (const validToken of validTokens) {
      try {
        if (timingSafeEqual(
          Buffer.from(validToken, 'hex'),
          Buffer.from(token, 'hex')
        )) {
          isValidToken = true;
        }
      } catch {
        // Length mismatch: continue checking, still takes same time
      }
    }

    if (!isValidToken) {
      this.logger.warn(`Invalid token attempt`);
      const sanitized = ErrorSanitizer.sanitizeWithCode(
        new Error("Authentication failed"),
        'AUTH_INVALID_TOKEN'
      );
      throw new Error(sanitized.message);
    }
  }
}
