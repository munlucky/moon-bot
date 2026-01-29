/**
 * SessionKey Utilities
 *
 * Moltbot-compatible session key format: agent:<id>:session:<key>
 */

export interface SessionKeyParts {
  agentId: string;
  channelSessionId: string;
}

const SESSION_KEY_PREFIX = "agent";
const SESSION_KEY_SUFFIX = "session";
const SEPARATOR = ":";

/**
 * Parse a session key into its components.
 * @param key - Session key in format "agent:<id>:session:<key>"
 * @returns Parsed parts or null if invalid
 */
export function parse(key: string): SessionKeyParts | null {
  if (!isValid(key)) {
    return null;
  }

  const parts = key.split(SEPARATOR);
  if (parts.length !== 4) {
    return null;
  }

  const [, agentId, , channelSessionId] = parts;
  return { agentId, channelSessionId };
}

/**
 * Generate a session key from components.
 * @param agentId - Agent ID
 * @param channelSessionId - Channel session identifier
 * @returns Session key in format "agent:<id>:session:<key>"
 */
export function generate(agentId: string, channelSessionId: string): string {
  return `${SESSION_KEY_PREFIX}${SEPARATOR}${agentId}${SEPARATOR}${SESSION_KEY_SUFFIX}${SEPARATOR}${channelSessionId}`;
}

/**
 * Validate if a string is a properly formatted session key.
 * @param key - String to validate
 * @returns true if valid session key format
 */
export function isValid(key: string): boolean {
  if (!key || typeof key !== "string") {
    return false;
  }

  const pattern = new RegExp(
    `^${SESSION_KEY_PREFIX}${SEPARATOR}[^${SEPARATOR}]+${SEPARATOR}${SESSION_KEY_SUFFIX}${SEPARATOR}[^${SEPARATOR}]+$`
  );

  return pattern.test(key);
}
