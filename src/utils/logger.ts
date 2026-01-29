// Enhanced logger utility with service layer tracking and trace context

import fs from "fs";
import path from "path";
import { AsyncLocalStorage } from "async_hooks";
import type { LogEntry, ServiceLayer, TraceContext, SystemConfig } from "../types/index.js";

/**
 * Generate a short unique ID for trace/span identification.
 */
function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

/**
 * AsyncLocalStorage for propagating trace context across async boundaries.
 */
const traceStorage = new AsyncLocalStorage<TraceContext>();

/**
 * Get the current trace context from AsyncLocalStorage.
 */
export function getTraceContext(): TraceContext | undefined {
  return traceStorage.getStore();
}

/**
 * Run a function within a trace context.
 * Automatically inherits parent context from AsyncLocalStorage.
 */
export function runWithTrace<T>(
  layer: ServiceLayer,
  fn: () => T
): T {
  const parentContext = getTraceContext();
  const traceId = parentContext?.traceId ?? generateId();
  const spanId = generateId();
  const parentSpanId = parentContext?.spanId;

  const context: TraceContext = {
    traceId,
    spanId,
    parentSpanId,
    layer,
    startTime: Date.now(),
  };

  return traceStorage.run(context, fn);
}

/**
 * Run an async function within a trace context.
 * Automatically inherits parent context from AsyncLocalStorage.
 */
export async function runWithTraceAsync<T>(
  layer: ServiceLayer,
  fn: () => Promise<T>
): Promise<T> {
  const parentContext = getTraceContext();
  const traceId = parentContext?.traceId ?? generateId();
  const spanId = generateId();
  const parentSpanId = parentContext?.spanId;

  const context: TraceContext = {
    traceId,
    spanId,
    parentSpanId,
    layer,
    startTime: Date.now(),
  };

  return traceStorage.run(context, fn);
}

/**
 * Create a child span within the current trace context.
 */
export function createChildSpan(layer: ServiceLayer): TraceContext {
  const parent = getTraceContext();
  return {
    traceId: parent?.traceId ?? generateId(),
    spanId: generateId(),
    parentSpanId: parent?.spanId,
    layer,
    startTime: Date.now(),
  };
}

export class Logger {
  private logFile: string | null = null;
  private minLevel: LogEntry["level"] = "info";
  private fileErrorLogged = false;
  private defaultLayer?: ServiceLayer;

  constructor(config?: SystemConfig, defaultLayer?: ServiceLayer) {
    this.defaultLayer = defaultLayer;
    if (config?.storage?.logsPath) {
      const date = new Date().toISOString().split("T")[0];
      this.logFile = path.join(config.storage.logsPath, `moonbot-${date}.log`);
    }
  }

  /**
   * Create a child logger bound to a specific service layer.
   */
  forLayer(layer: ServiceLayer): LayerLogger {
    return new LayerLogger(this, layer);
  }

  private log(
    level: LogEntry["level"],
    message: string,
    context?: Record<string, unknown>,
    layer?: ServiceLayer
  ): void {
    const traceCtx = getTraceContext();
    const effectiveLayer = layer ?? this.defaultLayer ?? traceCtx?.layer;

    const entry: LogEntry = {
      level,
      message,
      timestamp: Date.now(),
      context,
      layer: effectiveLayer,
      traceId: traceCtx?.traceId,
      spanId: traceCtx?.spanId,
      parentSpanId: traceCtx?.parentSpanId,
    };

    // Console output with colors and layer prefix
    const colors: Record<LogEntry["level"], string> = {
      debug: "\x1b[36m", // cyan
      info: "\x1b[32m", // green
      warn: "\x1b[33m", // yellow
      error: "\x1b[31m", // red
    };
    const layerColors: Record<string, string> = {
      gateway: "\x1b[35m", // magenta
      orchestrator: "\x1b[34m", // blue
      executor: "\x1b[36m", // cyan
      planner: "\x1b[33m", // yellow
      replanner: "\x1b[33m", // yellow
      tools: "\x1b[32m", // green
      llm: "\x1b[95m", // bright magenta
      session: "\x1b[94m", // bright blue
      channel: "\x1b[96m", // bright cyan
      config: "\x1b[90m", // gray
      cron: "\x1b[93m", // bright yellow
      approval: "\x1b[91m", // bright red
    };
    const reset = "\x1b[0m";
    const dim = "\x1b[2m";

    const levelPrefix = `${colors[level]}[${level.toUpperCase().padEnd(5)}]${reset}`;
    const layerPrefix = effectiveLayer
      ? `${layerColors[effectiveLayer] || ""}[${effectiveLayer.toUpperCase().padEnd(12)}]${reset}`
      : "[            ]";
    const tracePrefix = traceCtx?.traceId
      ? `${dim}[${traceCtx.traceId.substring(0, 8)}]${reset}`
      : "";

    console.log(`${levelPrefix} ${layerPrefix} ${tracePrefix} ${message}`);

    // File output
    if (this.logFile) {
      try {
        fs.appendFileSync(this.logFile, JSON.stringify(entry) + "\n");
      } catch (err) {
        if (!this.fileErrorLogged) {
          console.error(`[LOGGER ERROR] Failed to write to log file: ${this.logFile}`, err);
          this.fileErrorLogged = true;
        }
      }
    }
  }

  debug(message: string, context?: Record<string, unknown>, layer?: ServiceLayer): void {
    if (this.minLevel === "debug") {
      this.log("debug", message, context, layer);
    }
  }

  info(message: string, context?: Record<string, unknown>, layer?: ServiceLayer): void {
    this.log("info", message, context, layer);
  }

  warn(message: string, context?: Record<string, unknown>, layer?: ServiceLayer): void {
    this.log("warn", message, context, layer);
  }

  error(message: string, context?: Record<string, unknown>, layer?: ServiceLayer): void {
    this.log("error", message, context, layer);
  }

  setLevel(level: LogEntry["level"]): void {
    this.minLevel = level;
  }

  getLevel(): LogEntry["level"] {
    return this.minLevel;
  }
}

/**
 * Layer-specific logger that automatically tags logs with a service layer.
 */
export class LayerLogger {
  constructor(
    private parent: Logger,
    private layer: ServiceLayer
  ) {}

  debug(message: string, context?: Record<string, unknown>): void {
    this.parent.debug(message, context, this.layer);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.parent.info(message, context, this.layer);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.parent.warn(message, context, this.layer);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.parent.error(message, context, this.layer);
  }

  /**
   * Log the start of an operation with input data.
   */
  logInput(operation: string, input: unknown): void {
    this.info(`→ ${operation}`, { input: sanitizeForLog(input) });
  }

  /**
   * Log the completion of an operation with output data and duration.
   */
  logOutput(operation: string, output: unknown, startTime: number): void {
    const durationMs = Date.now() - startTime;
    this.info(`← ${operation} (${durationMs}ms)`, {
      output: sanitizeForLog(output),
      durationMs,
    });
  }

  /**
   * Log an operation failure with error details and duration.
   */
  logError(operation: string, error: unknown, startTime?: number): void {
    const durationMs = startTime ? Date.now() - startTime : undefined;
    this.error(`✗ ${operation} failed${durationMs ? ` (${durationMs}ms)` : ""}`, {
      error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
      durationMs,
    });
  }
}

/**
 * Sanitize data for logging (truncate large objects, remove sensitive fields).
 */
function sanitizeForLog(data: unknown, maxDepth = 3, currentDepth = 0): unknown {
  if (currentDepth >= maxDepth) {
    return "[MAX_DEPTH]";
  }

  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === "string") {
    return data.length > 500 ? data.substring(0, 500) + "...[truncated]" : data;
  }

  if (typeof data !== "object") {
    return data;
  }

  if (Array.isArray(data)) {
    if (data.length > 10) {
      return [...data.slice(0, 10).map((item) => sanitizeForLog(item, maxDepth, currentDepth + 1)), `...[${data.length - 10} more]`];
    }
    return data.map((item) => sanitizeForLog(item, maxDepth, currentDepth + 1));
  }

  const sanitized: Record<string, unknown> = {};
  const sensitiveKeys = ["password", "token", "secret", "apiKey", "api_key", "authorization"];
  const entries = Object.entries(data as Record<string, unknown>);

  if (entries.length > 20) {
    const truncated = entries.slice(0, 20);
    for (const [key, value] of truncated) {
      if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk))) {
        sanitized[key] = "[REDACTED]";
      } else {
        sanitized[key] = sanitizeForLog(value, maxDepth, currentDepth + 1);
      }
    }
    sanitized["..."] = `[${entries.length - 20} more keys]`;
  } else {
    for (const [key, value] of entries) {
      if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk))) {
        sanitized[key] = "[REDACTED]";
      } else {
        sanitized[key] = sanitizeForLog(value, maxDepth, currentDepth + 1);
      }
    }
  }

  return sanitized;
}

/**
 * Higher-order function to wrap async functions with automatic input/output logging.
 */
export function withLogging<TArgs extends unknown[], TResult>(
  logger: LayerLogger,
  operationName: string,
  fn: (...args: TArgs) => Promise<TResult>
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    const startTime = Date.now();
    logger.logInput(operationName, args.length === 1 ? args[0] : args);

    try {
      const result = await fn(...args);
      logger.logOutput(operationName, result, startTime);
      return result;
    } catch (error) {
      logger.logError(operationName, error, startTime);
      throw error;
    }
  };
}

/**
 * Decorator-style function for wrapping class methods with logging.
 * Usage: this.methodName = withMethodLogging(this, logger, 'methodName', this.methodName);
 */
export function withMethodLogging<T, TArgs extends unknown[], TResult>(
  instance: T,
  logger: LayerLogger,
  methodName: string,
  method: (...args: TArgs) => Promise<TResult>
): (...args: TArgs) => Promise<TResult> {
  return withLogging(logger, methodName, method.bind(instance) as (...args: TArgs) => Promise<TResult>);
}

export function createLogger(config?: SystemConfig, defaultLayer?: ServiceLayer): Logger {
  return new Logger(config, defaultLayer);
}
