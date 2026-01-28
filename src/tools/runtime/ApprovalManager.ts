// Approval system for dangerous tool operations

import path from "path";
import os from "os";
import fs from "fs/promises";
import type { ApprovalConfig } from "../../types/index.js";

export interface ApprovalCheck {
  approved: boolean;
  reason?: string;
}

export class ApprovalManager {
  private config: ApprovalConfig | null = null;
  private readonly configPath: string;
  private loaded = false;

  constructor(configDir?: string) {
    this.configPath = configDir ?? path.join(os.homedir(), ".moonbot", "exec-approvals.json");
  }

  /**
   * Load approval configuration from file.
   * Uses default config if file doesn't exist.
   */
  async loadConfig(): Promise<void> {
    try {
      const content = await fs.readFile(this.configPath, "utf-8");
      this.config = JSON.parse(content) as ApprovalConfig;
      this.loaded = true;
    } catch {
      // Use default config if file doesn't exist
      this.config = {
        allowlist: {
          commands: ["git", "pnpm", "npm", "node", "python", "python3"],
          cwdPrefix: ["$workspaceRoot"],
        },
        denylist: {
          patterns: [
            "rm\\s+-rf\\s+/",
            "curl.*\\|.*sh",
            "wget.*\\|.*sh",
            "sudo\\s+",
            "chmod\\s+777",
            ">\\s*/dev/",
            ":\\(\\).*\\{",
            "eval\\s+",
            "exec\\s+",
          ],
        },
      };
      this.loaded = true;
    }
  }

  /**
   * Check if a command is approved for execution.
   * @param command - Command string or argv array
   * @param cwd - Working directory (must be within workspaceRoot)
   * @param workspaceRoot - Root directory for CWD validation
   */
  async checkApproval(
    command: string | string[],
    cwd: string,
    workspaceRoot: string
  ): Promise<ApprovalCheck> {
    if (!this.loaded) {
      await this.loadConfig();
    }

    if (!this.config) {
      return { approved: false, reason: "Approval config not loaded" };
    }

    // Normalize command to string for pattern matching
    const commandStr = Array.isArray(command) ? command.join(" ") : command;

    // Check denylist patterns first (security priority)
    for (const pattern of this.config.denylist.patterns) {
      try {
        const regex = new RegExp(pattern);
        if (regex.test(commandStr)) {
          return {
            approved: false,
            reason: `Command matches denied pattern: ${pattern}`,
          };
        }
      } catch {
        // Invalid regex, skip
      }
    }

    // Check allowlist - command must start with allowed command
    const commandName = Array.isArray(command) ? command[0] : commandStr.split(" ")[0];
    const isAllowed = this.config.allowlist.commands.some((allowed) => {
      // Exact match or starts with allowed command (e.g., "git" allows "git status")
      return commandName === allowed || commandName.startsWith(`${allowed} `);
    });

    if (!isAllowed) {
      return {
        approved: false,
        reason: `Command not in allowlist: ${commandName}`,
      };
    }

    // Check CWD restriction - must be within workspaceRoot
    const normalizedCwd = path.normalize(cwd);
    const normalizedWorkspace = path.normalize(workspaceRoot);

    // Expand $workspaceRoot if present in config
    const allowedPrefixes = this.config.allowlist.cwdPrefix.map((prefix) =>
      prefix === "$workspaceRoot" ? normalizedWorkspace : prefix
    );

    const isCwdAllowed = allowedPrefixes.some((prefix) => {
      return normalizedCwd.startsWith(prefix);
    });

    if (!isCwdAllowed) {
      return {
        approved: false,
        reason: `Working directory outside allowed prefix: ${cwd}`,
      };
    }

    return { approved: true };
  }

  /**
   * Get the current approval config.
   */
  getConfig(): ApprovalConfig | null {
    return this.config;
  }

  /**
   * Create default approval config file.
   */
  async createDefaultConfig(): Promise<void> {
    const configDir = path.dirname(this.configPath);

    try {
      await fs.mkdir(configDir, { recursive: true });
    } catch {
      // Directory may already exist
    }

    const defaultConfig: ApprovalConfig = {
      allowlist: {
        commands: ["git", "pnpm", "npm", "node", "python", "python3"],
        cwdPrefix: ["$workspaceRoot"],
      },
      denylist: {
        patterns: [
          "rm\\s+-rf\\s+/",
          "curl.*\\|.*sh",
          "wget.*\\|.*sh",
          "sudo\\s+",
          "chmod\\s+777",
          ">\\s*/dev/",
          ":\\(\\).*\\{",
          "eval\\s+",
          "exec\\s+",
        ],
      },
    };

    await fs.writeFile(this.configPath, JSON.stringify(defaultConfig, null, 2));
  }
}
