// Authentication and Pairing

import { createHash, randomBytes } from "crypto";
import { createLogger, type Logger } from "../utils/logger.js";
import type { SystemConfig } from "../types/index.js";

export interface PairingCode {
  code: string;
  userId: string;
  expiresAt: number;
  approved: boolean;
}

/**
 * Track used pairing codes with timestamps for replay attack prevention.
 * Enables TTL-based cleanup and forensic logging.
 */
interface UsedCodeEntry {
  code: string;
  usedAt: number;
  userId: string;
}

/**
 * Generate a cryptographically secure random pairing code.
 * Uses randomBytes instead of UUID for better entropy and unpredictability.
 */
function generateSecureCode(length: number = 8): string {
  // Generate 3 bytes for 8 characters (6 bits per byte -> base64url encoding)
  const bytes = randomBytes(Math.ceil(length * 3 / 4));
  // Convert to base64url (remove + and /, replace with - and _)
  return bytes.toString("base64url")
    .replace(/=/g, "")
    .slice(0, length)
    .toUpperCase();
}

/**
 * Hash a token using SHA-256 for secure comparison and storage.
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export class AuthManager {
  private config: SystemConfig;
  private logger: Logger;
  private pendingCodes = new Map<string, PairingCode>();
  private approvedUsers = new Set<string>();
  // Track used codes with timestamps for replay attack prevention and TTL cleanup
  private usedCodes = new Map<string, UsedCodeEntry>();

  constructor(config: SystemConfig) {
    this.config = config;
    this.logger = createLogger(config);
  }

  generatePairingCode(userId: string, ttlMinutes = 5): PairingCode {
    // Use cryptographically secure code generation
    const code = generateSecureCode(8);
    const pairingCode: PairingCode = {
      code,
      userId,
      expiresAt: Date.now() + ttlMinutes * 60 * 1000,
      approved: false,
    };

    this.pendingCodes.set(code, pairingCode);
    this.logger.info(`Pairing code generated for ${userId}`);

    return pairingCode;
  }

  approve(code: string): boolean {
    // Check if code was already used (replay attack prevention)
    const existingEntry = this.usedCodes.get(code);
    if (existingEntry) {
      this.logger.warn(
        `Replay attack detected: code used at ${new Date(existingEntry.usedAt).toISOString()}`
      );
      return false;
    }

    const pairing = this.pendingCodes.get(code);

    if (!pairing) {
      this.logger.warn(`Invalid pairing code`);
      return false;
    }

    if (pairing.expiresAt < Date.now()) {
      this.pendingCodes.delete(code);
      this.logger.warn(`Expired pairing code`);
      return false;
    }

    pairing.approved = true;
    this.approvedUsers.add(pairing.userId);
    this.pendingCodes.delete(code);

    // Mark as used with timestamp for TTL cleanup
    this.usedCodes.set(code, {
      code,
      usedAt: Date.now(),
      userId: pairing.userId
    });

    this.logger.info(`Pairing approved for ${pairing.userId}`);
    return true;
  }

  isApproved(userId: string): boolean {
    return this.approvedUsers.has(userId);
  }

  /**
   * Validate an authentication token.
   * Uses constant-time comparison via hash to prevent timing attacks.
   *
   * Token format requirements:
   * - Default: SHA-256 hashed tokens (64 hex chars)
   * - Legacy mode: Plaintext tokens (requires allowLegacyTokens: true)
   *
   * Migration: Use AuthManager.hashToken() to convert plaintext tokens
   */
  validate(token: string): boolean {
    const authConfig = this.config.gateways[0]?.auth;
    if (!authConfig?.tokens) {
      return true; // No auth configured
    }

    const tokenHash = hashToken(token);
    const validTokens = Object.values(authConfig.tokens);

    // Check legacy token support (default: false)
    const allowLegacy = authConfig.allowLegacyTokens ?? false;

    return validTokens.some(validToken => {
      // SHA-256 hash format: 64 hex characters
      if (validToken.length === 64 && /^[a-f0-9]{64}$/i.test(validToken)) {
        return validToken === tokenHash;
      }
      // Legacy plaintext comparison (only if allowLegacyTokens is true)
      if (allowLegacy) {
        return validToken === token;
      }
      return false;
    });
  }

  /**
   * Clean up expired entries to prevent memory leaks.
   * - Removes expired pending pairing codes
   * - Removes used codes older than 24 hours (TTL-based cleanup)
   */
  cleanup(): void {
    const now = Date.now();
    const TTL_24H = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

    // Clean expired pairing codes
    for (const [code, pairing] of this.pendingCodes.entries()) {
      if (pairing.expiresAt < now) {
        this.pendingCodes.delete(code);
      }
    }

    // Clean used codes older than 24 hours (TTL-based cleanup)
    for (const [code, entry] of this.usedCodes.entries()) {
      if (now - entry.usedAt > TTL_24H) {
        this.usedCodes.delete(code);
      }
    }
  }

  /**
   * Generate a hash for a token (for config file usage).
   * Use this when setting up tokens in configuration.
   */
  static hashToken(token: string): string {
    return hashToken(token);
  }
}
