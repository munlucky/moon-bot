/**
 * CLI types and interfaces
 */

import type { SystemConfig } from "../types/index.js";

/** CLI command options */
export interface CliOptions {
  json?: boolean;
  verbose?: boolean;
}

/** Output format */
export type OutputFormat = "table" | "json";

/** Gateway status info */
export interface GatewayStatus {
  running: boolean;
  pid?: number;
  port?: number;
  host?: string;
  uptime?: number;
}

/** Log options */
export interface LogOptions {
  follow?: boolean;
  lines?: number;
  error?: boolean;
  json?: boolean;
}

/** Doctor check result */
export interface DoctorCheck {
  name: string;
  status: "pass" | "fail" | "warn";
  message: string;
  fix?: () => Promise<void>;
}

/** RPC call options */
export interface RpcCallOptions {
  json?: boolean;
  timeout?: number;
}

/** Pairing status info */
export interface PairingStatus {
  enabled: boolean;
  pendingCount: number;
  pairedClients: number;
}

/** Approval item */
export interface ApprovalItem {
  id: string;
  tool: string;
  summary: string;
  createdAt: Date;
  expiresAt?: Date;
}

/** CLI context passed to commands */
export interface CliContext {
  config: SystemConfig;
  options: CliOptions;
}
