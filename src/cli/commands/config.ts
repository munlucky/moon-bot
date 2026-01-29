/**
 * Config commands - Import/Export configuration
 */

import fs from "fs";
import path from "path";
import { homedir } from "os";
import type { CliOptions } from "../types.js";
import type { ChannelConfig } from "../../types/index.js";
import { loadConfig, getConfigPath, ensureStorageDirectories } from "../../config/index.js";

const BACKUP_DIR = path.join(homedir(), ".moonbot", "backups");

// Output helpers (inline to avoid circular dependency)
function printSuccess(message: string): void {
  console.log(`\x1b[32m✓\x1b[0m ${message}`);
}

function printError(message: string): void {
  console.error(`\x1b[31m✗\x1b[0m ${message}`);
}

function printInfo(message: string): void {
  console.log(`\x1b[36mℹ\x1b[0m ${message}`);
}

/**
 * Create backup of existing config
 */
function createBackup(): string | null {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return null;
  }

  // Ensure backup directory exists
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(BACKUP_DIR, `config-${timestamp}.json`);
  fs.copyFileSync(configPath, backupPath);

  return backupPath;
}

/**
 * Clean old backups (keep only 10 most recent)
 */
function cleanOldBackups(): void {
  if (!fs.existsSync(BACKUP_DIR)) {
    return;
  }

  const files = fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith("config-") && f.endsWith(".json"))
    .map((f) => ({
      name: f,
      path: path.join(BACKUP_DIR, f),
      time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime(),
    }))
    .sort((a, b) => b.time - a.time);

  // Remove old backups beyond 10
  if (files.length > 10) {
    files.slice(10).forEach((f) => {
      fs.unlinkSync(f.path);
    });
  }
}

/**
 * Import config from JSON file
 */
export async function configImport(
  filePath: string,
  options: CliOptions & { force?: boolean }
): Promise<void> {
  // Resolve file path
  const resolvedPath = path.resolve(filePath);

  if (!fs.existsSync(resolvedPath)) {
    printError(`File not found: ${resolvedPath}`);
    process.exit(1);
  }

  // Read and parse import file
  let importConfig;
  try {
    const content = fs.readFileSync(resolvedPath, "utf-8");
    importConfig = JSON.parse(content);
  } catch (error) {
    printError(`Failed to parse JSON file: ${(error as Error).message}`);
    process.exit(1);
  }

  // Validate required fields
  if (!importConfig.channels || !Array.isArray(importConfig.channels)) {
    printError("Invalid config: 'channels' field is required and must be an array");
    process.exit(1);
  }

  // Check if config already exists
  const configPath = getConfigPath();
  if (fs.existsSync(configPath) && !options.force) {
    printError(`Config file already exists: ${configPath}`);
    printInfo("Use --force to overwrite");
    process.exit(1);
  }

  // Create backup
  const backupPath = createBackup();
  cleanOldBackups();

  // Ensure directory exists
  const configDir = path.dirname(configPath);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  // Write new config
  fs.writeFileSync(configPath, JSON.stringify(importConfig, null, 2), "utf-8");

  // Ensure storage directories
  const mergedConfig = loadConfig();
  ensureStorageDirectories(mergedConfig);

  // Summary
  if (options.json) {
    console.log(JSON.stringify({
      success: true,
      config: configPath,
      backup: backupPath,
      channels: importConfig.channels.length,
      gateways: importConfig.gateways?.length || 0,
    }, null, 2));
  } else {
    printSuccess(`Config imported from ${resolvedPath}`);
    console.log(`Saved to: ${configPath}`);
    if (backupPath) {
      console.log(`Backup: ${backupPath}`);
    }
    const enabledCount = importConfig.channels.filter((c: ChannelConfig) => c.enabled).length;
    console.log(`Channels: ${importConfig.channels.length} (${enabledCount} enabled)`);
    console.log(`Gateways: ${importConfig.gateways?.length || 1}`);
  }
}

/**
 * Export config to JSON file
 */
export async function configExport(
  filePath: string,
  options: CliOptions
): Promise<void> {
  const config = loadConfig();

  // Resolve output path
  const resolvedPath = path.resolve(filePath);

  // Write export file
  fs.writeFileSync(resolvedPath, JSON.stringify(config, null, 2), "utf-8");

  if (options.json) {
    console.log(JSON.stringify({
      success: true,
      exported: resolvedPath,
      channels: config.channels.length,
    }, null, 2));
  } else {
    printSuccess(`Config exported to ${resolvedPath}`);
    console.log(`Channels: ${config.channels.length}`);
  }
}

/**
 * Show current config path
 */
export async function configPath(options: CliOptions): Promise<void> {
  const configPath = getConfigPath();

  if (options.json) {
    console.log(JSON.stringify({
      path: configPath,
      exists: fs.existsSync(configPath),
    }, null, 2));
  } else {
    console.log(`Config path: ${configPath}`);
    if (fs.existsSync(configPath)) {
      console.log("Status: exists");
    } else {
      console.log("Status: not found (will use defaults)");
    }
  }
}
