/**
 * Connection Rate Limiter
 *
 * Prevents connection flooding by tracking connection attempts per IP address
 * AND per token within a time window. Dual-layer rate limiting prevents bypass
 * via multiple IP addresses.
 */

import { createHash } from "crypto";

/**
 * Configuration for ConnectionRateLimiter
 */
export interface RateLimiterConfig {
  /** Time window in milliseconds (default: 60000 = 1 minute) */
  windowMs: number;
  /** Maximum attempts per window (default: 10) */
  maxAttempts: number;
}

export class ConnectionRateLimiter {
  private attempts = new Map<string, number[]>();
  private tokenAttempts = new Map<string, number[]>();
  private readonly windowMs: number;
  private readonly maxAttempts: number;

  constructor(config?: Partial<RateLimiterConfig>) {
    this.windowMs = config?.windowMs ?? 60000;
    this.maxAttempts = config?.maxAttempts ?? 10;
  }

  /**
   * Check if a connection is allowed from the given IP.
   * @param ip IP address (or socket ID as fallback)
   * @returns true if connection is allowed, false if rate limited
   */
  checkLimit(ip: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Get existing attempts for this IP
    let attempts = this.attempts.get(ip) || [];

    // Filter out attempts outside the time window
    attempts = attempts.filter(timestamp => timestamp > windowStart);

    // Check if limit exceeded
    if (attempts.length >= this.maxAttempts) {
      return false;
    }

    // Add current attempt
    attempts.push(now);
    this.attempts.set(ip, attempts);

    return true;
  }

  /**
   * Check if a token is within rate limits.
   * Prevents bypass of IP-based rate limiting via multiple IPs.
   * @param token Authentication token (first 8 chars for logging)
   * @returns true if connection is allowed, false if rate limited
   */
  checkTokenLimit(token: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Hash token for storage (SHA-256 to prevent collisions)
    const tokenHash = createHash('sha256').update(token).digest('hex');
    let attempts = this.tokenAttempts.get(tokenHash) || [];

    // Filter out attempts outside the time window
    attempts = attempts.filter(timestamp => timestamp > windowStart);

    // Check if limit exceeded
    if (attempts.length >= this.maxAttempts) {
      return false;
    }

    // Add current attempt
    attempts.push(now);
    this.tokenAttempts.set(tokenHash, attempts);

    return true;
  }

  /**
   * Clean up old entries to prevent memory leaks.
   */
  cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Clean IP-based entries
    for (const [ip, attempts] of this.attempts.entries()) {
      const validAttempts = attempts.filter(timestamp => timestamp > windowStart);
      if (validAttempts.length === 0) {
        this.attempts.delete(ip);
      } else {
        this.attempts.set(ip, validAttempts);
      }
    }

    // Clean token-based entries
    for (const [tokenHash, attempts] of this.tokenAttempts.entries()) {
      const validAttempts = attempts.filter(timestamp => timestamp > windowStart);
      if (validAttempts.length === 0) {
        this.tokenAttempts.delete(tokenHash);
      } else {
        this.tokenAttempts.set(tokenHash, validAttempts);
      }
    }
  }
}
