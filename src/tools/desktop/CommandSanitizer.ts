// Command sanitization for dangerous pattern detection

export interface SanitizationResult {
  safe: boolean;
  reason?: string;
  matchedPattern?: string;
}

export class CommandSanitizer {
  /**
   * Default denylist patterns for dangerous commands.
   */
  private static readonly DEFAULT_DENYLIST = [
    // Destructive commands
    "rm\\s+-rf\\s+/?$",
    "rm\\s+-rf\\s+\\*",
    "del\\s+/[SQ]",
    // Shell injection
    "curl.*\\|.*sh",
    "wget.*\\|.*sh",
    "eval\\s+",
    "exec\\s+",
    "\\$\\(.+\\)", // Command substitution
    // Privilege escalation
    "sudo\\s+",
    "su\\s+",
    // Dangerous permissions
    "chmod\\s+777",
    "chmod\\s+a\\+rw",
    "chown\\s+",
    // Device operations
    ">\\s*/dev/",
    "<\\s+/dev/",
    // Shell escapes
    ":\\(\\).*\\{",
    // File redirects to sensitive locations
    ">\\s+/etc/",
    ">\\s+/sys/",
    ">\\s+/proc/",
  ];

  /**
   * Default allowlist for safe commands.
   */
  private static readonly DEFAULT_ALLOWLIST = [
    "git",
    "pnpm",
    "npm",
    "node",
    "python",
    "python3",
    "pip",
    "bun",
    "deno",
    "ls",
    "cat",
    "head",
    "tail",
    "grep",
    "find",
    "echo",
    "pwd",
    "cd",
    "mkdir",
    "cp",
    "mv",
    "stat",
    "file",
    "which",
    "where",
  ];

  private denylist: string[];
  private allowlist: string[];

  constructor(
    denylist?: string[],
    allowlist?: string[]
  ) {
    this.denylist = denylist ?? CommandSanitizer.DEFAULT_DENYLIST;
    this.allowlist = allowlist ?? CommandSanitizer.DEFAULT_ALLOWLIST;
  }

  /**
   * Check if a command is safe to execute.
   * @param command - Command as string or argv array
   * @param cwd - Working directory
   * @param workspaceRoot - Workspace root directory for CWD validation
   */
  sanitize(
    command: string | string[],
    cwd: string,
    workspaceRoot: string
  ): SanitizationResult {
    const commandStr = Array.isArray(command) ? command.join(" ") : command;

    // Check denylist patterns first (security priority)
    for (const pattern of this.denylist) {
      try {
        const regex = new RegExp(pattern);
        if (regex.test(commandStr)) {
          return {
            safe: false,
            reason: "Command matches dangerous pattern",
            matchedPattern: pattern,
          };
        }
      } catch {
        // Invalid regex, skip this pattern
      }
    }

    // Check allowlist
    const commandName = Array.isArray(command) ? command[0] : commandStr.split(" ")[0];

    const isAllowed = this.allowlist.some((allowed) => {
      // Exact match or command starts with allowed name
      return commandName === allowed || commandName.startsWith(`${allowed} `);
    });

    if (!isAllowed) {
      return {
        safe: false,
        reason: `Command not in allowlist: ${commandName}`,
      };
    }

    // Check CWD is within workspace
    const { PathValidator } = require("../filesystem/PathValidator.js");
    const pathValidation = PathValidator.validate(cwd, workspaceRoot);

    if (!pathValidation.valid) {
      return {
        safe: false,
        reason: `Working directory outside workspace: ${pathValidation.error}`,
      };
    }

    return { safe: true };
  }

  /**
   * Sanitize multiple commands.
   */
  sanitizeMany(
    commands: Array<{ command: string | string[]; cwd: string }>,
    workspaceRoot: string
  ): SanitizationResult[] {
    return commands.map((cmd) =>
      this.sanitize(cmd.command, cmd.cwd, workspaceRoot)
    );
  }

  /**
   * Add a pattern to the denylist.
   */
  addDenylistPattern(pattern: string): void {
    this.denylist.push(pattern);
  }

  /**
   * Add a command to the allowlist.
   */
  addAllowlistCommand(command: string): void {
    this.allowlist.push(command);
  }

  /**
   * Get current denylist.
   */
  getDenylist(): string[] {
    return [...this.denylist];
  }

  /**
   * Get current allowlist.
   */
  getAllowlist(): string[] {
    return [...this.allowlist];
  }
}
