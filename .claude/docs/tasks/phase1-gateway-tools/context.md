# Phase 1 Gateway Tools - Implementation Plan

> Project rules: `.claude/PROJECT.md`
> Requirements: `.claude/docs/tasks/phase1-gateway-tools/agreements/requirements-analysis.md`

## Metadata

- Author: Context Builder Agent
- Created: 2025-01-28
- Branch: main
- Complexity: complex
- Related docs:
  - Requirements: `agreements/requirements-analysis.md`
  - Full spec: `archives/specification-full.md`
  - Session log: `../local-ai-agent/session-logs/day-2025-01-28.md`

## Task Overview

- **Goal**: Implement 4 core Gateway tools (Browser, Desktop/system.run, HTTP, File I/O) following Moltbot-style architecture
- **Scope**:
  - Tool Runtime layer (validation, execution, result formatting)
  - File I/O tool (read, write, list, glob)
  - HTTP Connector (request, download with SSRF protection)
  - Desktop tool (system.run with approval system)
  - Browser tool (Playwright integration)
- **Excluded**:
  - fs.delete (disabled by default in Phase 1)
  - system.runRaw (deprecated/dangerous)
  - Native GUI application (Node Host implementation deferred)
- **Impact**: Core AI Agent capabilities, security-critical

## Target Files

### New

- `src/tools/runtime/` - Tool execution framework
  - `ToolRuntime.ts` - Main runtime class
  - `SchemaValidator.ts` - Input validation (Zod/TypeBox)
  - `ApprovalManager.ts` - Command approval system
- `src/tools/filesystem/` - File I/O implementation
  - `FileIOTool.ts` - Main file operations
  - `PathValidator.ts` - Path traversal protection
- `src/tools/http/` - HTTP Connector
  - `HttpTool.ts` - Request execution
  - `SsrfGuard.ts` - SSRF protection
- `src/tools/desktop/` - Local Node Host
  - `SystemRunTool.ts` - Command execution
  - `CommandSanitizer.ts` - Dangerous pattern detection
- `src/tools/browser/` - Browser automation
  - `BrowserTool.ts` - Playwright wrapper
  - `SessionManager.ts` - Browser session lifecycle
- `src/gateway/handlers/` - Gateway RPC handlers
  - `tools.handler.ts` - tools.list, tools.invoke, tools.approve
- `test/tools/` - Test suites
  - `filesystem.test.ts`
  - `http.test.ts`
  - `desktop.test.ts`
  - `browser.test.ts`
  - `security.test.ts`

### Modified

- `src/types/index.ts` - Extend ToolContext, add ToolResult, ApprovalConfig
- `src/tools/index.ts` - Replace TODO stubs with real implementations
- `src/gateway/json-rpc.ts` - Register tool RPC methods
- `src/gateway/server.ts` - Configure ToolRuntime
- `package.json` - Add playwright, zod dependencies

## Current State

### Existing Infrastructure

- `GatewayServer` with WebSocket transport on ws://127.0.0.1:18789
- `JsonRpcServer` for protocol handling
- `Toolkit` class for tool registry (src/tools/index.ts)
- `ToolSpec` interface (src/types/index.ts)
- Token authentication support
- Rate limiting for connections

### TODO Stubs to Replace

Current stub implementations in `src/tools/index.ts`:
- `createBrowserTool()` - Returns mock response
- `createFilesystemTool()` - Has path validation, TODO for actual FS ops
- `createApiTool()` - Returns mock response

### Reusable Patterns

- Path validation: `validateFilePath()` already implements directory traversal protection
- Toolkit registry: Use `Toolkit.register()` for new tools
- Logger: `createLogger()` for consistent logging

## Technical Architecture

### Layer Structure

```
┌─────────────────────────────────────────────────────────┐
│                   AI Agent / Node Host                   │
│  (External: Python scripts, Claude Code, etc.)           │
└──────────────────────────┬──────────────────────────────┘
                           │ WebSocket (JSON-RPC 2.0)
                           │ ws://127.0.0.1:18789
┌──────────────────────────▼──────────────────────────────┐
│                      Gateway Server                       │
│  - Token authentication                                  │
│  - Rate limiting                                         │
│  - Session management                                    │
├─────────────────────────────────────────────────────────┤
│                   Tool Runtime Layer                     │
│  - Schema validation                                     │
│  - Approval checking                                     │
│  - Timeout enforcement                                   │
│  - Result formatting                                     │
├─────────────────────────────────────────────────────────┤
│                    Tool Registry                         │
│  ┌─────────┬─────────┬──────────┬─────────┐             │
│  │ Browser │Desktop  │   HTTP   │File I/O │             │
│  │(Playwright│system.run│Connector│   FS    │             │
│  └─────────┴─────────┴──────────┴─────────┘             │
└─────────────────────────────────────────────────────────┘
```

### Protocol: JSON-RPC 2.0 over WebSocket

**New Methods to Implement**:

```typescript
// tools.list - Return available tools with schemas
{
  jsonrpc: "2.0",
  id: "uuid",
  method: "tools.list",
  params: { sessionId: string }
}

// tools.invoke - Execute a tool
{
  jsonrpc: "2.0",
  id: "uuid",
  method: "tools.invoke",
  params: {
    toolId: "browser.goto",
    sessionId: "session-uuid",
    args: { url: "https://example.com" }
  }
}

// tools.approve - Approve pending execution (for system.run)
{
  jsonrpc: "2.0",
  id: "uuid",
  method: "tools.approve",
  params: {
    requestId: "approval-uuid",
    approved: true
  }
}
```

## Tool Specifications

### 1. Browser Tool (Playwright)

**Operations**:
- `browser.start(sessionKey?, headless?) -> { sessionId }`
- `browser.goto(url) -> { success, url }`
- `browser.snapshot(mode: "aria"|"dom") -> { tree }`
- `browser.act(type, selector, text?, key?) -> { success }`
- `browser.screenshot(fullPage?) -> { imageData }`
- `browser.extract(selector, kind) -> { content }`
- `browser.close() -> {}`

**Security Policies**:
- Only HTTPS URLs allowed (block `file://`)
- Session isolation per sessionKey
- Concurrency lock per session (sequential execution)
- Default session timeout: 30 minutes

### 2. Desktop Tool (system.run)

**Operations**:
- `system.run(argv, cwd?, env?, timeoutMs?) -> { exitCode, stdout, stderr }`
- `system.runRaw(command, shell?) -> { exitCode, stdout, stderr }`

**Security Policies**:
- **CRITICAL**: ALL commands require approval check BEFORE execution
- Allowlist: Only whitelisted commands (git, pnpm, npm, node, python)
- CWD restriction: Only paths under `workspaceRoot`
- Denylist patterns: `rm -rf`, `curl | sh`, `sudo`, `chmod 777`
- Timeout: Default 30 seconds
- Output truncation: Limit stdout/stderr size

**Approval Config** (`~/.moonbot/exec-approvals.json`):
```json
{
  "allowlist": {
    "commands": ["git", "pnpm", "npm", "node", "python"],
    "cwdPrefix": ["$workspaceRoot"]
  },
  "denylist": {
    "patterns": ["rm\\s+-rf", "curl.*\\|.*sh", "sudo", "chmod\\s+777"]
  }
}
```

### 3. HTTP Connector

**Operations**:
- `http.request(method, url, headers?, query?, body?, timeoutMs?) -> { status, headers, body }`
- `http.download(url, destPath) -> { success, path }` (optional)

**Security Policies**:
- SSRF protection: Block internal network requests
- Blocked destinations:
  - localhost, 127.0.0.1, ::1
  - 169.254.169.254 (AWS metadata)
  - 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
- Protocol restriction: Only `http://` and `https://`
- Timeout: Default 30 seconds
- Size limit: 10MB response body

### 4. File I/O Tool

**Operations**:
- `fs.read(path, encoding?) -> { content, size }`
- `fs.write(path, content, encoding?, atomic?) -> { success, path }`
- `fs.list(path, recursive?) -> { entries }`
- `fs.glob(pattern) -> { paths }` (optional)
- `fs.delete(path) -> { success }` (DISABLED by default)

**Security Policies**:
- **CRITICAL**: ALL paths must be within `workspaceRoot`
- Path traversal protection: Block `..` escape attempts
- Size limits: 2MB default for read/write
- Atomic writes: Use temp file + rename pattern
- Delete: Disabled in Phase 1

## Implementation Order

### Phase 1: Foundation (Tool Runtime)

**Files**: `src/tools/runtime/`

1. **SchemaValidator** - Choose Zod vs TypeBox
   - Evaluate both libraries
   - Implement validation wrapper
   - Add to package.json

2. **ApprovalManager** - Command approval system
   - Load `~/.moonbot/exec-approvals.json`
   - Parse allowlist/denylist
   - Implement `checkApproval(command, cwd)` method

3. **ToolRuntime** - Main execution framework
   - Integrate SchemaValidator
   - Add timeout enforcement
   - Format ToolResult with metadata
   - Audit logging (sessionId, duration, success)

**Dependencies**: None
**Verification**: Unit tests for validation, approval, result formatting

### Phase 2: File I/O Tool

**Files**: `src/tools/filesystem/`

1. **PathValidator** - Security boundary
   - Validate paths against `workspaceRoot`
   - Prevent `..` traversal
   - Reuse existing `validateFilePath()` pattern

2. **FileIOTool** - Core operations
   - `fs.read()` with size limit
   - `fs.write()` with atomic option
   - `fs.list()` with recursive option
   - `fs.glob()` (optional)

**Dependencies**: Phase 1 complete
**Verification**: Security tests (path traversal), functional tests

### Phase 3: HTTP Connector

**Files**: `src/tools/http/`

1. **SsrfGuard** - URL validation
   - Parse and validate URLs
   - Check against blocked IP ranges
   - Protocol restriction check

2. **HttpTool** - Request execution
   - `http.request()` with timeout
   - Response size limiting
   - Header/body handling

**Dependencies**: Phase 1 complete
**Verification**: SSRF tests, protocol tests, timeout tests

### Phase 4: Desktop Tool (system.run)

**Files**: `src/tools/desktop/`

1. **CommandSanitizer** - Pattern detection
   - Check against denylist patterns
   - Verify allowlist membership
   - CWD validation

2. **SystemRunTool** - Command execution
   - `system.run()` with spawn + timeout
   - `system.runRaw()` (mark as dangerous)
   - Output truncation

**Dependencies**: Phase 1 complete, ApprovalManager
**Verification**: Approval tests, denylist tests, timeout tests

### Phase 5: Browser Tool

**Files**: `src/tools/browser/`

1. **SessionManager** - Browser lifecycle
   - Playwright context management
   - Session isolation
   - Timeout cleanup
   - Concurrency locking

2. **BrowserTool** - Playwright operations
   - `browser.start()` - Launch browser
   - `browser.goto()` - Navigate (HTTPS only)
   - `browser.snapshot()` - ARIA/DOM extraction
   - `browser.act()` - Click/type/press
   - `browser.screenshot()` - Capture image
   - `browser.close()` - Cleanup

**Dependencies**: Phase 1 complete, Playwright installed
**Verification**: Session tests, protocol blocking, ARIA snapshot tests

### Phase 6: Gateway Integration

**Files**: `src/gateway/`

1. **Register RPC handlers** - Extend JsonRpcServer
   - `tools.list` handler
   - `tools.invoke` handler
   - `tools.approve` handler

2. **Wire ToolRuntime** - Configure in GatewayServer
   - Initialize with config
   - Register all tools
   - Connect to WebSocket handlers

**Dependencies**: All tool phases complete
**Verification**: Integration tests with WebSocket client

## Security Checklist

### CRITICAL (Must Pass)

- [ ] Gateway binds to `127.0.0.1` only (not `0.0.0.0`)
- [ ] All connections require valid token
- [ ] `system.run` checks approvals BEFORE command execution
- [ ] File paths validated against `workspaceRoot`
- [ ] HTTP requests blocked to internal IPs (SSRF)
- [ ] Browser allows only HTTPS URLs (no `file://`)

### HIGH Priority

- [ ] All tool calls logged with `sessionId`
- [ ] Dangerous command patterns rejected (denylist)
- [ ] Path traversal protection tested (`..` escape)
- [ ] Command timeout enforced (no hangs)

### MEDIUM Priority

- [ ] Response size limits (HTTP, File I/O)
- [ ] Browser session timeout (30 min default)
- [ ] Output truncation (system.run stdout/stderr)

### Testing Requirements

Each security check must have:
- Unit test verifying the protection
- Integration test with attempt to bypass
- Negative test (ensure valid ops still work)

## Integration Points

### Type Extensions (src/types/index.ts)

```typescript
// Add to existing ToolContext
interface ToolContext {
  sessionId: string;
  agentId: string;
  userId: string;
  config: SystemConfig;
  workspaceRoot: string;         // NEW - for File I/O boundary
  policy: {                       // NEW - tool-specific policies
    allowlist: string[];
    denylist: string[];
    maxBytes: number;
    timeoutMs: number;
  };
}

// Add new result type
interface ToolResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta: {
    durationMs: number;
    artifacts?: string[];
    truncated?: boolean;
  };
}

// Add approval config
interface ApprovalConfig {
  allowlist: {
    commands: string[];
    cwdPrefix: string[];
  };
  denylist: {
    patterns: string[];
  };
}
```

### ToolSpec Interface

All tools must implement:
```typescript
interface ToolSpec<TInput = unknown, TOutput = unknown> {
  id: string;              // e.g., "browser.goto"
  description: string;     // What the tool does
  schema: object;          // JSON Schema for input validation
  requiresApproval?: boolean;  // For system.run
  run: (input: TInput, ctx: ToolContext) => Promise<ToolResult<TOutput>>;
}
```

### Gateway Handler Registration

```typescript
// In src/gateway/json-rpc.ts
registerToolHandlers(runtime: ToolRuntime) {
  this.handlers.set("tools.list", async (params) => {
    return runtime.listTools(params.sessionId);
  });
  this.handlers.set("tools.invoke", async (params) => {
    return runtime.invokeTool(params.toolId, params.sessionId, params.args);
  });
  this.handlers.set("tools.approve", async (params) => {
    return runtime.approveRequest(params.requestId, params.approved);
  });
}
```

## Dependencies

### New Packages

```json
{
  "dependencies": {
    "playwright": "^1.40.0",
    "zod": "^3.22.0"
  }
}
```

**Decision Required**: Zod vs TypeBox for schema validation
- Zod: More mature, better TypeScript inference
- TypeBox: Smaller bundle, faster runtime
- **Recommendation**: Start with Zod, evaluate TypeBox if bundle size becomes issue

### External Dependencies

- Playwright browsers (install via `npx playwright install`)
- Node.js spawn/exec for system.run

### Config Files

- `~/.moonbot/exec-approvals.json` - Command approval config
- `~/.moonbot/config.json` - Gateway config (existing)

## Risks and Mitigations

### Security Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Token leakage allows unauthorized access | CRITICAL | Document token storage; recommend environment variables |
| Approval bypass in system.run | CRITICAL | Approval check BEFORE execution; unit test required |
| Path traversal escape | HIGH | Validate ALL paths; use `path.resolve()` + prefix check |
| SSRF via HTTP redirect | HIGH | Follow redirects only to same-origin; validate final URL |
| Browser file:// access | MEDIUM | Explicit protocol block in Playwright context |

### Implementation Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Playwright installation fails | MEDIUM | Document install steps; provide error handling |
| Browser session memory leak | MEDIUM | Implement session cleanup on timeout/disconnect |
| Test coverage gaps | LOW | Write tests before implementation (TDD) |

### Operational Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Gateway port conflict | LOW | Make port configurable; document default |
| Concurrent browser resource exhaustion | MEDIUM | Limit concurrent sessions; queue requests |

## Acceptance Tests (Completion Criteria)

| ID | Test Description | Type | File | Status |
|----|------------------|------|------|--------|
| T1 | [Browser] Start headless session | Integration | `browser.test.ts` | PENDING |
| T2 | [Browser] Navigate to HTTPS only | Security | `browser.test.ts` | PENDING |
| T3 | [Browser] ARIA snapshot extraction | Unit | `browser.test.ts` | PENDING |
| T4 | [Browser] Click/type actions | Integration | `browser.test.ts` | PENDING |
| T5 | [Browser] Screenshot capture | Unit | `browser.test.ts` | PENDING |
| T6 | [Browser] Session cleanup | Integration | `browser.test.ts` | PENDING |
| T7 | [File I/O] Read within workspace | Unit | `filesystem.test.ts` | PENDING |
| T8 | [File I/O] Write with atomic option | Unit | `filesystem.test.ts` | PENDING |
| T9 | [File I/O] List directory recursive | Unit | `filesystem.test.ts` | PENDING |
| T10 | [Security] Path traversal blocked | Security | `security.test.ts` | PENDING |
| T11 | [Security] File path outside workspace rejected | Security | `security.test.ts` | PENDING |
| T12 | [HTTP] Request to public API | Integration | `http.test.ts` | PENDING |
| T13 | [HTTP] SSRF localhost blocked | Security | `security.test.ts` | PENDING |
| T14 | [HTTP] SSRF private IP blocked | Security | `security.test.ts` | PENDING |
| T15 | [HTTP] Protocol restriction (http/https only) | Security | `http.test.ts` | PENDING |
| T16 | [Desktop] Allowlisted command execution | Integration | `desktop.test.ts` | PENDING |
| T17 | [Desktop] Denylisted pattern blocked | Security | `security.test.ts` | PENDING |
| T18 | [Desktop] Approval check before execution | Security | `desktop.test.ts` | PENDING |
| T19 | [Desktop] Workspace CWD restriction | Security | `desktop.test.ts` | PENDING |
| T20 | [Desktop] Command timeout enforced | Unit | `desktop.test.ts` | PENDING |
| T21 | [Desktop] Output truncation | Unit | `desktop.test.ts` | PENDING |
| T22 | [Gateway] tools.list returns schemas | Integration | `integration.test.ts` | PENDING |
| T23 | [Gateway] tools.invoke with valid input | Integration | `integration.test.ts` | PENDING |
| T24 | [Gateway] tools.invoke with invalid input | Integration | `integration.test.ts` | PENDING |
| T25 | [Gateway] Token authentication required | Security | `integration.test.ts` | PENDING |
| T26 | [Gateway] Loopback bind only | Security | `integration.test.ts` | PENDING |

**Completion Condition**: All tests PASS

## Checkpoints

- [ ] Phase 1: Tool Runtime complete (validation, approval, result formatting)
- [ ] Phase 2: File I/O tool complete with security tests
- [ ] Phase 3: HTTP Connector complete with SSRF tests
- [ ] Phase 4: Desktop tool complete with approval tests
- [ ] Phase 5: Browser tool complete with session tests
- [ ] Phase 6: Gateway integration complete
- [ ] All acceptance tests passing
- [ ] Security checklist verified
- [ ] Build succeeds (`npm run build`)
- [ ] Type check passes (`npx tsc --noEmit`)

## Reviews

### v1 - 2025-01-28

**Status**: APPROVE
**Reviewer**: Claude (Plan Reviewer guidelines)

**Summary**:
- 4-criteria assessment: Clarity ✅, Verifiability ✅, Completeness ✅, Big Picture ✅
- 26 acceptance tests defined with clear success criteria
- Comprehensive security model documented
- Phase dependencies clearly specified

**Warnings** (non-blocking):
- Resolve Zod vs TypeBox decision early in Phase 1
- Verify test framework exists before writing tests
- Document Playwright installation troubleshooting

**Full review**: `archives/review-v1.md`

---

## Open Questions

| Question | Impact | Status |
|----------|--------|--------|
| Zod or TypeBox for schema validation? | Affects all tools | TBD - Evaluate in Phase 1 |
| fs.glob implementation in Phase 1? | Scope | Optional, can defer |
| Max concurrent browser sessions? | Resource limits | Default: 5 |
| Browser session timeout duration? | Resource management | Default: 30 min |
| Store exec-approvals.json location? | Config | Use `$HOME/.moonbot/` |

## References

- **Full Specification**: `.claude/docs/tasks/phase1-gateway-tools/archives/specification-full.md`
- **Requirements Analysis**: `.claude/docs/tasks/phase1-gateway-tools/agreements/requirements-analysis.md`
- **Existing Types**: `src/types/index.ts`
- **Existing Gateway**: `src/gateway/server.ts`
- **Existing Tools**: `src/tools/index.ts`
- **Session Log**: `.claude/docs/tasks/local-ai-agent/session-logs/day-2025-01-28.md`

---

**Document Status**: Ready for implementation
**Next Step**: Execute Phase 1 (Tool Runtime foundation)
