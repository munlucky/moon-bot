/**
 * Connection Rate Limiter
 *
 * Prevents connection flooding by tracking connection attempts per IP address
 * AND per token within a time window. Dual-layer rate limiting prevents bypass
 * via multiple IP addresses.
 */

import { createHash } from "crypto";

/** Default time window: 1 minute in milliseconds */
const DEFAULT_WINDOW_MS = 60000;

/** Default maximum attempts per window */
const DEFAULT_MAX_ATTEMPTS = 10;

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
    this.windowMs = config?.windowMs ?? DEFAULT_WINDOW_MS;
    this.maxAttempts = config?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  }

  /**
   * Check if a connection is allowed from the given IP.
   * @param ip IP address (or socket ID as fallback)
   * @returns true if connection is allowed, false if rate limited
   */
  checkLimit(ip: string): boolean {
    return this.checkLimitInMap(this.attempts, ip);
  }

  /**
   * Check if a token is within rate limits.
   * Prevents bypass of IP-based rate limiting via multiple IPs.
   * @param token Authentication token
   * @returns true if connection is allowed, false if rate limited
   */
  checkTokenLimit(token: string): boolean {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    return this.checkLimitInMap(this.tokenAttempts, tokenHash);
  }

  /**
   * Clean up old entries to prevent memory leaks.
   */
  cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    this.cleanupMap(this.attempts, windowStart);
    this.cleanupMap(this.tokenAttempts, windowStart);
  }

  /**
   * Check if limit is exceeded for a given key in a map.
   * @private
   */
  private checkLimitInMap(map: Map<string, number[]>, key: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    let attempts = map.get(key) || [];
    attempts = attempts.filter(timestamp => timestamp > windowStart);

    if (attempts.length >= this.maxAttempts) {
      return false;
    }

    attempts.push(now);
    map.set(key, attempts);
    return true;
  }

  /**
   * Clean up expired entries from a map.
   * @private
   */
  private cleanupMap(map: Map<string, number[]>, windowStart: number): void {
    for (const [key, attempts] of map.entries()) {
      const validAttempts = attempts.filter(timestamp => timestamp > windowStart);
      if (validAttempts.length === 0) {
        map.delete(key);
      } else {
        map.set(key, validAttempts);
      }
    }
  }
}
