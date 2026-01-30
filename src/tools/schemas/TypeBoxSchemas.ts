// TypeBox Schema Definitions for Tool Input/Output
// Provides compile-time type safety and JSON Schema generation

import { Type, Static, TSchema } from "@sinclair/typebox";

/**
 * BufferEncoding values supported by Node.js
 */
export const BufferEncodingSchema = Type.Union([
  Type.Literal("utf8"),
  Type.Literal("ascii"),
  Type.Literal("base64"),
  Type.Literal("utf16le"),
  Type.Literal("ucs2"),
  Type.Literal("latin1"),
]);

export type BufferEncoding = Static<typeof BufferEncodingSchema>;

// ============================================================================
// File I/O Schemas
// ============================================================================

/**
 * Input schema for fs.read tool
 */
export const FileReadInputSchema = Type.Object({
  path: Type.String({ description: "File path relative to workspace root" }),
  encoding: Type.Optional(BufferEncodingSchema),
});

export type FileReadInput = Static<typeof FileReadInputSchema>;

/**
 * Output schema for fs.read tool
 */
export const FileReadOutputSchema = Type.Object({
  content: Type.String(),
  size: Type.Integer({ minimum: 0 }),
});

export type FileReadOutput = Static<typeof FileReadOutputSchema>;

/**
 * Input schema for fs.write tool
 */
export const FileWriteInputSchema = Type.Object({
  path: Type.String({ description: "File path relative to workspace root" }),
  content: Type.String({ description: "Content to write" }),
  encoding: Type.Optional(BufferEncodingSchema),
  atomic: Type.Optional(Type.Boolean()),
});

export type FileWriteInput = Static<typeof FileWriteInputSchema>;

/**
 * Output schema for fs.write tool
 */
export const FileWriteOutputSchema = Type.Object({
  success: Type.Boolean(),
  path: Type.String(),
});

export type FileWriteOutput = Static<typeof FileWriteOutputSchema>;

/**
 * Input schema for fs.list tool
 */
export const FileListInputSchema = Type.Object({
  path: Type.String({ description: "Directory path relative to workspace root" }),
  recursive: Type.Optional(Type.Boolean()),
});

export type FileListInput = Static<typeof FileListInputSchema>;

/**
 * File entry type
 */
export const FileEntrySchema = Type.Object({
  name: Type.String(),
  path: Type.String(),
  type: Type.Union([Type.Literal("file"), Type.Literal("directory")]),
  size: Type.Optional(Type.Integer({ minimum: 0 })),
});

export type FileEntry = Static<typeof FileEntrySchema>;

/**
 * Output schema for fs.list tool
 */
export const FileListOutputSchema = Type.Object({
  entries: Type.Array(FileEntrySchema),
});

export type FileListOutput = Static<typeof FileListOutputSchema>;

/**
 * Input schema for fs.glob tool
 */
export const FileGlobInputSchema = Type.Object({
  pattern: Type.String({ description: "Glob pattern (e.g., '**/*.ts')" }),
});

export type FileGlobInput = Static<typeof FileGlobInputSchema>;

/**
 * Output schema for fs.glob tool
 */
export const FileGlobOutputSchema = Type.Object({
  paths: Type.Array(Type.String()),
});

export type FileGlobOutput = Static<typeof FileGlobOutputSchema>;

// ============================================================================
// HTTP Schemas
// ============================================================================

/**
 * HTTP methods
 */
export const HttpMethodSchema = Type.Union([
  Type.Literal("GET"),
  Type.Literal("POST"),
  Type.Literal("PUT"),
  Type.Literal("DELETE"),
  Type.Literal("PATCH"),
  Type.Literal("HEAD"),
  Type.Literal("OPTIONS"),
]);

export type HttpMethod = Static<typeof HttpMethodSchema>;

/**
 * HTTP headers (string to string mapping for simplicity)
 */
export const HttpHeadersSchema = Type.Record(Type.String(), Type.String());

export type HttpHeaders = Static<typeof HttpHeadersSchema>;

/**
 * Query parameters
 */
export const HttpQuerySchema = Type.Record(Type.String(), Type.String());

export type HttpQuery = Static<typeof HttpQuerySchema>;

/**
 * Input schema for http.request tool
 */
export const HttpRequestInputSchema = Type.Object({
  method: HttpMethodSchema,
  url: Type.String({ description: "URL to request" }),
  headers: Type.Optional(HttpHeadersSchema),
  query: Type.Optional(HttpQuerySchema),
  body: Type.Optional(Type.String()),
  timeoutMs: Type.Optional(Type.Integer({ minimum: 1, maximum: 300000 })),
});

export type HttpRequestInput = Static<typeof HttpRequestInputSchema>;

/**
 * Output schema for http.request tool
 */
export const HttpResponseSchema = Type.Object({
  status: Type.Integer({ minimum: 100, maximum: 599 }),
  statusText: Type.String(),
  headers: HttpHeadersSchema,
  body: Type.String(),
});

export type HttpResponse = Static<typeof HttpResponseSchema>;

/**
 * Input schema for http.download tool
 */
export const HttpDownloadInputSchema = Type.Object({
  url: Type.String({ description: "URL to download from" }),
  destPath: Type.String({ description: "Destination path relative to workspace" }),
});

export type HttpDownloadInput = Static<typeof HttpDownloadInputSchema>;

/**
 * Output schema for http.download tool
 */
export const HttpDownloadResultSchema = Type.Object({
  success: Type.Boolean(),
  path: Type.String(),
  size: Type.Integer({ minimum: 0 }),
});

export type HttpDownloadResult = Static<typeof HttpDownloadResultSchema>;

// ============================================================================
// System Schemas
// ============================================================================

/**
 * Input schema for system.run tool
 */
export const SystemRunInputSchema = Type.Object({
  argv: Type.Union([
    Type.String(),
    Type.Array(Type.String())
  ]),
  cwd: Type.Optional(Type.String()),
  env: Type.Optional(Type.Record(Type.String(), Type.String())),
  timeoutMs: Type.Optional(Type.Integer({ minimum: 1, maximum: 300000 })),
});

export type SystemRunInput = Static<typeof SystemRunInputSchema>;

/**
 * Output schema for system.run tool
 */
export const SystemRunResultSchema = Type.Object({
  exitCode: Type.Union([Type.Integer(), Type.Null()]),
  stdout: Type.String(),
  stderr: Type.String(),
});

export type SystemRunResult = Static<typeof SystemRunResultSchema>;

/**
 * Input schema for system.runRaw tool (deprecated)
 */
export const SystemRunRawInputSchema = Type.Object({
  command: Type.String({ description: "Raw shell command" }),
  shell: Type.Optional(Type.Boolean()),
  cwd: Type.Optional(Type.String()),
  env: Type.Optional(Type.Record(Type.String(), Type.String())),
  timeoutMs: Type.Optional(Type.Integer({ minimum: 1, maximum: 300000 })),
});

export type SystemRunRawInput = Static<typeof SystemRunRawInputSchema>;

// ============================================================================
// Browser Schemas
// ============================================================================

/**
 * Input schema for browser.start tool
 */
export const BrowserStartInputSchema = Type.Object({
  sessionKey: Type.Optional(Type.String()),
  headless: Type.Optional(Type.Boolean()),
});

export type BrowserStartInput = Static<typeof BrowserStartInputSchema>;

/**
 * Output schema for browser.start tool
 */
export const BrowserStartResultSchema = Type.Object({
  sessionId: Type.String(),
});

export type BrowserStartResult = Static<typeof BrowserStartResultSchema>;

/**
 * Input schema for browser.goto tool
 */
export const BrowserGotoInputSchema = Type.Object({
  url: Type.String({ description: "URL to navigate to" }),
  sessionKey: Type.Optional(Type.String()),
});

export type BrowserGotoInput = Static<typeof BrowserGotoInputSchema>;

/**
 * Output schema for browser.goto tool
 */
export const BrowserGotoResultSchema = Type.Object({
  success: Type.Boolean(),
  url: Type.String(),
});

export type BrowserGotoResult = Static<typeof BrowserGotoResultSchema>;

/**
 * Snapshot mode
 */
export const BrowserSnapshotModeSchema = Type.Union([
  Type.Literal("aria"),
  Type.Literal("dom")
]);

export type BrowserSnapshotMode = Static<typeof BrowserSnapshotModeSchema>;

/**
 * Input schema for browser.snapshot tool
 */
export const BrowserSnapshotInputSchema = Type.Object({
  mode: BrowserSnapshotModeSchema,
  sessionKey: Type.Optional(Type.String()),
});

export type BrowserSnapshotInput = Static<typeof BrowserSnapshotInputSchema>;

/**
 * Output schema for browser.snapshot tool
 */
export const BrowserSnapshotResultSchema = Type.Object({
  tree: Type.String(),
});

export type BrowserSnapshotResult = Static<typeof BrowserSnapshotResultSchema>;

/**
 * Browser action type
 */
export const BrowserActTypeSchema = Type.Union([
  Type.Literal("click"),
  Type.Literal("type"),
  Type.Literal("press")
]);

export type BrowserActType = Static<typeof BrowserActTypeSchema>;

/**
 * Input schema for browser.act tool
 */
export const BrowserActInputSchema = Type.Object({
  type: BrowserActTypeSchema,
  selector: Type.String({ description: "CSS selector for element" }),
  text: Type.Optional(Type.String()),
  key: Type.Optional(Type.String()),
  sessionKey: Type.Optional(Type.String()),
});

export type BrowserActInput = Static<typeof BrowserActInputSchema>;

/**
 * Output schema for browser.act tool
 */
export const BrowserActResultSchema = Type.Object({
  success: Type.Boolean(),
});

export type BrowserActResult = Static<typeof BrowserActResultSchema>;

/**
 * Input schema for browser.screenshot tool
 */
export const BrowserScreenshotInputSchema = Type.Object({
  fullPage: Type.Optional(Type.Boolean()),
  sessionKey: Type.Optional(Type.String()),
});

export type BrowserScreenshotInput = Static<typeof BrowserScreenshotInputSchema>;

/**
 * Output schema for browser.screenshot tool
 */
export const BrowserScreenshotResultSchema = Type.Object({
  imageData: Type.String(),
  format: Type.Literal("png"),
});

export type BrowserScreenshotResult = Static<typeof BrowserScreenshotResultSchema>;

/**
 * Input schema for browser.close tool
 */
export const BrowserCloseInputSchema = Type.Object({
  sessionKey: Type.Optional(Type.String()),
});

export type BrowserCloseInput = Static<typeof BrowserCloseInputSchema>;

/**
 * Output schema for browser.close tool
 */
export const BrowserCloseResultSchema = Type.Object({
  success: Type.Boolean(),
});

export type BrowserCloseResult = Static<typeof BrowserCloseResultSchema>;

/**
 * Extraction kind
 */
export const BrowserExtractKindSchema = Type.Union([
  Type.Literal("text"),
  Type.Literal("html"),
  Type.Literal("attribute")
]);

export type BrowserExtractKind = Static<typeof BrowserExtractKindSchema>;

/**
 * Input schema for browser.extract tool
 */
export const BrowserExtractInputSchema = Type.Object({
  selector: Type.String({ description: "CSS selector for element" }),
  kind: BrowserExtractKindSchema,
  attribute: Type.Optional(Type.String()),
  sessionKey: Type.Optional(Type.String()),
});

export type BrowserExtractInput = Static<typeof BrowserExtractInputSchema>;

/**
 * Output schema for browser.extract tool
 */
export const BrowserExtractResultSchema = Type.Object({
  content: Type.String(),
});

export type BrowserExtractResult = Static<typeof BrowserExtractResultSchema>;

// ============================================================================
// Process Schemas
// ============================================================================

/**
 * Process session status
 */
export const ProcessStatusSchema = Type.Union([
  Type.Literal("running"),
  Type.Literal("exited"),
  Type.Literal("killed"),
]);

export type ProcessStatus = Static<typeof ProcessStatusSchema>;

/**
 * Input schema for process.exec tool
 */
export const ProcessExecInputSchema = Type.Object({
  argv: Type.Union([Type.String(), Type.Array(Type.String())], {
    description: "Command and arguments to execute",
  }),
  cwd: Type.Optional(Type.String({ description: "Working directory" })),
  env: Type.Optional(Type.Record(Type.String(), Type.String())),
  background: Type.Optional(
    Type.Boolean({ default: false, description: "Run in background mode" })
  ),
  pty: Type.Optional(
    Type.Boolean({ default: false, description: "Use PTY for terminal emulation" })
  ),
  timeoutMs: Type.Optional(
    Type.Integer({ minimum: 1, maximum: 3600000, description: "Timeout in ms (max 1 hour)" })
  ),
});

export type ProcessExecInput = Static<typeof ProcessExecInputSchema>;

/**
 * Output schema for process.exec tool
 */
export const ProcessExecResultSchema = Type.Object({
  sessionId: Type.String(),
  pid: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
  status: ProcessStatusSchema,
});

export type ProcessExecResult = Static<typeof ProcessExecResultSchema>;

/**
 * Input schema for process.write tool
 */
export const ProcessWriteInputSchema = Type.Object({
  sessionId: Type.String({ description: "Session ID to write to" }),
  input: Type.String({ description: "Input string to send (include \\n for newline)" }),
});

export type ProcessWriteInput = Static<typeof ProcessWriteInputSchema>;

/**
 * Output schema for process.write tool
 */
export const ProcessWriteResultSchema = Type.Object({
  success: Type.Boolean(),
  bytesWritten: Type.Integer({ minimum: 0 }),
});

export type ProcessWriteResult = Static<typeof ProcessWriteResultSchema>;

/**
 * Input schema for process.poll tool
 */
export const ProcessPollInputSchema = Type.Object({
  sessionId: Type.String({ description: "Session ID to poll" }),
  maxLines: Type.Optional(
    Type.Integer({ minimum: 1, maximum: 1000, default: 100 })
  ),
});

export type ProcessPollInput = Static<typeof ProcessPollInputSchema>;

/**
 * Output schema for process.poll tool
 */
export const ProcessPollResultSchema = Type.Object({
  lines: Type.Array(Type.String()),
  hasMore: Type.Boolean(),
  status: ProcessStatusSchema,
  exitCode: Type.Union([Type.Integer(), Type.Null()]),
});

export type ProcessPollResult = Static<typeof ProcessPollResultSchema>;

/**
 * Input schema for process.log tool
 */
export const ProcessLogInputSchema = Type.Object({
  sessionId: Type.String({ description: "Session ID to get full log" }),
});

export type ProcessLogInput = Static<typeof ProcessLogInputSchema>;

/**
 * Output schema for process.log tool
 */
export const ProcessLogResultSchema = Type.Object({
  log: Type.String(),
  totalLines: Type.Integer({ minimum: 0 }),
  status: ProcessStatusSchema,
  exitCode: Type.Union([Type.Integer(), Type.Null()]),
});

export type ProcessLogResult = Static<typeof ProcessLogResultSchema>;

/**
 * Input schema for process.kill tool
 */
export const ProcessKillInputSchema = Type.Object({
  sessionId: Type.String({ description: "Session ID to kill" }),
  signal: Type.Optional(
    Type.Union([Type.Literal("SIGTERM"), Type.Literal("SIGKILL"), Type.Literal("SIGINT")], {
      default: "SIGTERM",
    })
  ),
});

export type ProcessKillInput = Static<typeof ProcessKillInputSchema>;

/**
 * Output schema for process.kill tool
 */
export const ProcessKillResultSchema = Type.Object({
  success: Type.Boolean(),
  message: Type.String(),
});

export type ProcessKillResult = Static<typeof ProcessKillResultSchema>;

/**
 * Input schema for process.list tool
 */
export const ProcessListInputSchema = Type.Object({
  userId: Type.Optional(Type.String({ description: "Filter by user ID" })),
});

export type ProcessListInput = Static<typeof ProcessListInputSchema>;

/**
 * Process session info for list response
 */
export const ProcessSessionInfoSchema = Type.Object({
  id: Type.String(),
  command: Type.Array(Type.String()),
  status: ProcessStatusSchema,
  pid: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
  createdAt: Type.Integer(),
  lastActivityAt: Type.Integer(),
  pty: Type.Boolean(),
});

export type ProcessSessionInfo = Static<typeof ProcessSessionInfoSchema>;

/**
 * Output schema for process.list tool
 */
export const ProcessListResultSchema = Type.Object({
  sessions: Type.Array(ProcessSessionInfoSchema),
  count: Type.Integer({ minimum: 0 }),
});

export type ProcessListResult = Static<typeof ProcessListResultSchema>;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Convert TypeBox schema to plain JSON Schema for LLM consumption
 * This preserves the JSON Schema format while using TypeBox for type safety
 */
export function toJSONSchema(schema: TSchema): Record<string, unknown> {
  // TypeBox schemas are already JSON Schema compatible
  // Just need to convert to plain object
  return JSON.parse(JSON.stringify(schema));
}

/**
 * Create a tool definition with TypeBox schema
 * Combines compile-time type safety with runtime JSON Schema generation
 */
export interface TypedToolDefinition<I extends TSchema, O extends TSchema> {
  name: string;
  description: string;
  inputSchema: I;
  outputSchema: O;
  inputJSON: Record<string, unknown>;
  outputJSON: Record<string, unknown>;
}

/**
 * Create a typed tool definition from TypeBox schemas
 */
export function createTypedToolDef<I extends TSchema, O extends TSchema>(
  name: string,
  description: string,
  inputSchema: I,
  outputSchema: O
): TypedToolDefinition<I, O> {
  return {
    name,
    description,
    inputSchema,
    outputSchema,
    inputJSON: toJSONSchema(inputSchema),
    outputJSON: toJSONSchema(outputSchema),
  };
}
