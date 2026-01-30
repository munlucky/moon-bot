// Node Command Validator
// Security validation for commands executed on remote nodes

import path from "path";

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Security configuration for command validation
 */
export interface NodeCommandValidatorConfig {
  maxOutputSize?: number;
  maxArgvLength?: number;
}

const DEFAULT_CONFIG: Required<NodeCommandValidatorConfig> = {
  maxOutputSize: 10 * 1024 * 1024, // 10MB
  maxArgvLength: 10000,
};

/**
 * Allowlist of safe commands
 */
const ALLOWLIST = [
  // Development tools
  "npm",
  "pnpm",
  "yarn",
  "bun",

  // Runtimes
  "node",
  "python",
  "python3",
  "ruby",
  "go",
  "rustc",
  "cargo",

  // Git
  "git",

  // Build tools
  "make",
  "cmake",
  "gcc",
  "g++",
  "clang",
  "clang++",

  // File operations (read-only)
  "ls",
  "cat",
  "head",
  "tail",
  "grep",
  "find",
  "file",
  "stat",

  // System info
  "uname",
  "hostname",
  "whoami",
  "df",
  "du",
  "ps",
  "top",

  // Network (read-only)
  "ping",
  "curl",
  "wget",
  "nslookup",
  "dig",

  // Utilities
  "echo",
  "printf",
  "date",
  "which",
  "whereis",
  "type",
];

/**
 * Blocklist of dangerous command patterns
 */
const BLOCKLIST = [
  // Destructive commands
  "rm\\s+-rf",
  "rm\\s+-r\\s+/",
  "rmdir",
  "del",
  "delete",
  "format",
  "fdisk",
  "mkfs",

  // System control
  "shutdown",
  "reboot",
  "poweroff",
  "halt",

  // Privilege escalation
  "sudo\\s+",
  "su\\s+",
  "doas\\s+",

  // Dangerous patterns
  "dd\\s+if=/dev",
  "mkfs",
  ":\\(\\).*\\{", // fork bomb pattern
  ">\\s*/dev/sda",
  ">\\s*/dev/sdb",
  "curl.*\\|.*sh",
  "wget.*\\|.*sh",
  "\\|\\s*sh",
  "\\|\\s*bash",
  "eval\\s+",
  "exec\\s+",

  // Command injection patterns
  "\\$\\(.+\\)",
  "`[^`]+`",
  "\\$\\{[^}]+\\}",

  // Path traversal in commands
  "\\.\\.\\/",
  "\\\\.\\.",

  // Shell escapes
  ";\\s*rm",
  "&&\\s*rm",
  "\\|\\|\\s*rm",
];

/**
 * Validates commands for security before execution on remote nodes
 */
export class NodeCommandValidator {
  private allowlist: Set<string>;
  private blocklist: RegExp[];
  private config: Required<NodeCommandValidatorConfig>;

  constructor(config: NodeCommandValidatorConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.allowlist = new Set(ALLOWLIST);

    // Compile blocklist patterns
    this.blocklist = BLOCKLIST.map((pattern) => {
      try {
        return new RegExp(pattern, "i");
      } catch {
        return null;
      }
    }).filter((p) => p !== null) as RegExp[];
  }

  /**
   * Validate command arguments
   * @param argv - Command arguments (string or array)
   * @returns Validation result
   */
  validateArguments(argv: string | string[]): ValidationResult {
    const argvStr = Array.isArray(argv) ? argv.join(" ") : argv;

    // Check total length
    if (argvStr.length > this.config.maxArgvLength) {
      return {
        valid: false,
        error: `Command arguments too long (max ${this.config.maxArgvLength} characters)`,
      };
    }

    // Check for blocklist patterns
    for (const pattern of this.blocklist) {
      if (pattern.test(argvStr)) {
        return {
          valid: false,
          error: `Command matches dangerous pattern: ${pattern.source}`,
        };
      }
    }

    // Check allowlist
    const commandName = Array.isArray(argv) ? argv[0] : argvStr.split(/\s+/)[0];

    // Extract base command (remove path if present)
    const baseCommand = path.basename(commandName);

    if (!this.allowlist.has(baseCommand)) {
      return {
        valid: false,
        error: `Command not in allowlist: ${baseCommand}`,
      };
    }

    return { valid: true };
  }

  /**
   * Validate working directory for path traversal
   * @param cwd - Working directory path
   * @param allowedBase - Allowed base directory (optional)
   * @returns Validation result
   */
  validateCwd(cwd: string, allowedBase?: string): ValidationResult {
    // Check for obvious path traversal patterns
    if (cwd.includes("..")) {
      return {
        valid: false,
        error: "Path traversal detected: '..' not allowed in working directory",
      };
    }

    // If base directory provided, check if cwd is within it
    if (allowedBase) {
      const normalizedAllowed = path.normalize(allowedBase);
      const normalizedCwd = path.resolve(normalizedAllowed, cwd);

      if (!normalizedCwd.startsWith(normalizedAllowed)) {
        return {
          valid: false,
          error: "Working directory outside allowed base path",
        };
      }
    }

    return { valid: true };
  }

  /**
   * Validate environment variables for dangerous keys
   * @param env - Environment variables object
   * @returns Validation result
   */
  validateEnv(env: Record<string, string>): ValidationResult {
    const dangerousKeys = ["PATH", "LD_PRELOAD", "DYLD_INSERT_LIBRARIES"];

    for (const key of dangerousKeys) {
      if (key in env) {
        return {
          valid: false,
          error: `Environment variable '${key}' is not allowed`,
        };
      }
    }

    // Check for suspicious values
    for (const [key, value] of Object.entries(env)) {
      if (value.includes("..") || value.includes("|") || value.includes(";")) {
        return {
          valid: false,
          error: `Suspicious value in environment variable '${key}'`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Sanitize command arguments by removing dangerous characters
   * @param argv - Command arguments
   * @returns Sanitized arguments
   */
  sanitizeArguments(argv: string | string[]): string[] {
    const argvArray = Array.isArray(argv) ? argv : [argv];

    return argvArray.map((arg) => {
      // Remove null bytes and other dangerous characters
      return arg
        .replace(/\0/g, "")
        .replace(/[\x00-\x1F\x7F]/g, "");
    });
  }

  /**
   * Check if output size is within limits
   * @param size - Output size in bytes
   * @returns true if within limits
   */
  isOutputSizeValid(size: number): boolean {
    return size <= this.config.maxOutputSize;
  }

  /**
   * Get maximum allowed output size
   */
  getMaxOutputSize(): number {
    return this.config.maxOutputSize;
  }

  /**
   * Add a command to the allowlist
   * @param command - Command name
   */
  addAllowlistCommand(command: string): void {
    this.allowlist.add(command);
  }

  /**
   * Remove a command from the allowlist
   * @param command - Command name
   */
  removeAllowlistCommand(command: string): void {
    this.allowlist.delete(command);
  }

  /**
   * Get current allowlist
   */
  getAllowlist(): string[] {
    return Array.from(this.allowlist);
  }

  /**
   * Get current blocklist patterns
   */
  getBlocklist(): string[] {
    return this.blocklist.map((p) => p.source);
  }
}
