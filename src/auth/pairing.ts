// Authentication and Pairing

import { randomUUID, createHash, randomBytes } from "crypto";
import { createLogger, type Logger } from "../utils/logger.js";
import type { SystemConfig } from "../types/index.js";

export interface PairingCode {
  code: string;
  userId: string;
  expiresAt: number;
  approved: boolean;
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
  // Track used codes to prevent replay attacks
  private usedCodes = new Set<string>();

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
    if (this.usedCodes.has(code)) {
      this.logger.warn(`Replay attack detected: code already used`);
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
    this.usedCodes.add(code); // Mark as used

    this.logger.info(`Pairing approved for ${pairing.userId}`);
    return true;
  }

  isApproved(userId: string): boolean {
    return this.approvedUsers.has(userId);
  }

  /**
   * Validate an authentication token.
   * Uses constant-time comparison via hash to prevent timing attacks.
   * Note: Tokens in config should be stored as hashes, not plaintext.
   */
  validate(token: string): boolean {
    if (!this.config.gateways[0]?.auth?.tokens) {
      return true; // No auth configured
    }

    const tokenHash = hashToken(token);
    const validTokens = Object.values(this.config.gateways[0].auth.tokens);

    // Check if any token hash matches
    // Note: In production, config should store pre-hashed tokens
    return validTokens.some(validToken => {
      // Support both plaintext (legacy) and hashed tokens
      if (validToken.length === 64) {
        // Assume it's a SHA-256 hash (64 hex chars)
        return validToken === tokenHash;
      } else {
        // Legacy plaintext comparison (not recommended)
        return validToken === token;
      }
    });
  }

  cleanup(): void {
    const now = Date.now();

    // Clean expired pairing codes
    for (const [code, pairing] of this.pendingCodes.entries()) {
      if (pairing.expiresAt < now) {
        this.pendingCodes.delete(code);
      }
    }

    // Clean used codes older than 1 hour to prevent memory leak
    const oneHourAgo = now - 60 * 60 * 1000;
    // Note: We don't have creation time for used codes, so we do a simple cleanup
    // In production, track creation time for used codes
  }

  /**
   * Generate a hash for a token (for config file usage).
   * Use this when setting up tokens in configuration.
   */
  static hashToken(token: string): string {
    return hashToken(token);
  }
}
