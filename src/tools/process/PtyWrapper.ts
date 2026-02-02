// PTY Wrapper with dynamic loading and fallback to child_process
// Supports both node-pty (for full terminal emulation) and spawn (fallback)

import { spawn, type ChildProcess, type SpawnOptions } from "child_process";
import type { EventEmitter } from "events";

// PTY configuration constants
const DEFAULT_PTY_NAME = "xterm-256color";
const DEFAULT_PTY_COLS = 80;
const DEFAULT_PTY_ROWS = 24;
const DEFAULT_WINDOWS_SHELL = "cmd.exe";
const DEFAULT_UNIX_SHELL = "/bin/sh";
const DEFAULT_SIGNAL_NUMBER = 15; // SIGTERM

// Signal numbers
const SIGNAL_NUMBERS: Record<string, number> = {
  SIGTERM: 15,
  SIGKILL: 9,
  SIGINT: 2,
  SIGHUP: 1,
  SIGQUIT: 3,
  SIGABRT: 6,
  SIGALRM: 14,
  SIGUSR1: 10,
  SIGUSR2: 12,
  SIGTRAP: 5,
  SIGPIPE: 13,
  SIGSTOP: 19,
  SIGTSTP: 20,
  SIGCONT: 18,
  SIGCHLD: 17,
};

/**
 * Common interface for both PTY and ChildProcess handles
 */
export interface ProcessHandle extends EventEmitter {
  pid: number | undefined;
  kill(signal?: NodeJS.Signals | number): boolean;
  write?(data: string): boolean;
}

/**
 * PTY-specific interface (from node-pty)
 */
export interface IPty {
  pid: number | undefined;
  onData: (callback: (data: string) => void) => { dispose: () => void };
  onExit: (callback: (e: { exitCode: number; signal?: number }) => void) => { dispose: () => void };
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: (signal?: number) => void;
  cols: number;
  rows: number;
}

export interface SpawnProcessOptions {
  cwd?: string;
  env?: Record<string, string>;
  usePty?: boolean;
  cols?: number;
  rows?: number;
}

/**
 * Wrapped process handle with unified interface
 */
export interface WrappedProcess {
  handle: ChildProcess | IPty;
  isPty: boolean;
  pid: number | undefined;
  write(data: string): boolean;
  kill(signal?: NodeJS.Signals): boolean;
  onData(callback: (data: string) => void): void;
  onExit(callback: (code: number | null, signal?: number | null) => void): void;
}

// Dynamic PTY module reference (optional dependency)
// Use typeof import() for type safety when module is loaded
type NodePtyModule = {
  spawn: (file: string, args: string[], options: {
    name: string;
    cols: number;
    rows: number;
    cwd: string;
    env: Record<string, string>;
  }) => IPty;
};

let nodePty: NodePtyModule | null = null;
let ptyLoadAttempted = false;

/**
 * Check if node-pty is available
 */
export async function isPtyAvailable(): Promise<boolean> {
  if (ptyLoadAttempted) {
    return nodePty !== null;
  }

  ptyLoadAttempted = true;

  try {
    // Dynamic import for optional dependency
    nodePty = await import("node-pty");
    return true;
  } catch {
    nodePty = null;
    return false;
  }
}

/**
 * Get default shell for the current platform
 */
export function getDefaultShell(): string {
  if (process.platform === "win32") {
    return process.env.COMSPEC || DEFAULT_WINDOWS_SHELL;
  }
  return process.env.SHELL || DEFAULT_UNIX_SHELL;
}

/**
 * Spawn a process with optional PTY support
 */
export async function spawnProcess(
  command: string[],
  options: SpawnProcessOptions = {}
): Promise<WrappedProcess> {
  const usePty = options.usePty ?? false;
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ? { ...process.env, ...options.env } : process.env;

  // Try PTY if requested and available
  if (usePty && (await isPtyAvailable()) && nodePty) {
    return spawnWithPty(command, cwd, env as Record<string, string>, options.cols, options.rows);
  }

  // Fallback to child_process spawn
  return spawnWithChildProcess(command, cwd, env as Record<string, string>);
}

/**
 * Spawn with node-pty for full terminal emulation
 */
function spawnWithPty(
  command: string[],
  cwd: string,
  env: Record<string, string>,
  cols: number = DEFAULT_PTY_COLS,
  rows: number = DEFAULT_PTY_ROWS
): WrappedProcess {
  if (!nodePty) {
    throw new Error("node-pty not available");
  }

  const [cmd, ...args] = command;
  const pty = nodePty.spawn(cmd, args, {
    name: DEFAULT_PTY_NAME,
    cols,
    rows,
    cwd,
    env,
  });

  const dataCallbacks: ((data: string) => void)[] = [];
  const exitCallbacks: ((code: number | null, signal?: number | null) => void)[] = [];

  // Set up PTY event listeners
  pty.onData((data: string) => {
    dataCallbacks.forEach((cb) => cb(data));
  });

  pty.onExit((e: { exitCode: number; signal?: number }) => {
    exitCallbacks.forEach((cb) => cb(e.exitCode, e.signal ?? null));
  });

  return {
    handle: pty,
    isPty: true,
    pid: pty.pid,
    write(data: string): boolean {
      try {
        pty.write(data);
        return true;
      } catch {
        return false;
      }
    },
    kill(signal?: NodeJS.Signals): boolean {
      try {
        pty.kill(signalToNumber(signal));
        return true;
      } catch {
        return false;
      }
    },
    onData(callback: (data: string) => void): void {
      dataCallbacks.push(callback);
    },
    onExit(callback: (code: number | null, signal?: number | null) => void): void {
      exitCallbacks.push(callback);
    },
  };
}

/**
 * Spawn with child_process as fallback
 */
function spawnWithChildProcess(
  command: string[],
  cwd: string,
  env: Record<string, string>
): WrappedProcess {
  const [cmd, ...args] = command;

  const spawnOptions: SpawnOptions = {
    cwd,
    env,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  };

  const child = spawn(cmd, args, spawnOptions);

  const dataCallbacks: ((data: string) => void)[] = [];
  const exitCallbacks: ((code: number | null, signal?: number | null) => void)[] = [];

  // Combine stdout and stderr for data events
  child.stdout?.on("data", (chunk) => {
    const data = chunk.toString();
    dataCallbacks.forEach((cb) => cb(data));
  });

  child.stderr?.on("data", (chunk) => {
    const data = chunk.toString();
    dataCallbacks.forEach((cb) => cb(data));
  });

  child.on("exit", (code, signal) => {
    exitCallbacks.forEach((cb) => cb(code, signalNameToNumber(signal)));
  });

  child.on("error", (error) => {
    dataCallbacks.forEach((cb) => cb(`[Error] ${error.message}\n`));
    exitCallbacks.forEach((cb) => cb(1, null));
  });

  return {
    handle: child,
    isPty: false,
    pid: child.pid,
    write(data: string): boolean {
      if (!child.stdin?.writable) {
        return false;
      }
      try {
        child.stdin.write(data);
        return true;
      } catch {
        return false;
      }
    },
    kill(signal?: NodeJS.Signals): boolean {
      try {
        return child.kill(signal ?? "SIGTERM");
      } catch {
        return false;
      }
    },
    onData(callback: (data: string) => void): void {
      dataCallbacks.push(callback);
    },
    onExit(callback: (code: number | null, signal?: number | null) => void): void {
      exitCallbacks.push(callback);
    },
  };
}

/**
 * Convert signal name to number for PTY
 */
function signalToNumber(signal?: NodeJS.Signals): number {
  if (!signal) {
    return DEFAULT_SIGNAL_NUMBER;
  }
  return SIGNAL_NUMBERS[signal] ?? DEFAULT_SIGNAL_NUMBER;
}

/**
 * Convert signal name string to number
 */
function signalNameToNumber(signal: NodeJS.Signals | null): number | null {
  if (!signal) {return null;}
  return signalToNumber(signal);
}
