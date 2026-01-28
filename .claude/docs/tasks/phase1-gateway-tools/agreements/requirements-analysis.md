# Phase 1 Gateway Tools - Requirements Analysis

**Date**: 2025-01-28
**Version**: 1.0
**Status**: Approved

---

## 1. Overview

Phase 1 implements 4 core tools for the Moonbot Gateway following the "Moltbot-style" architecture pattern. These tools enable AI agents to interact with web browsers, the operating system, HTTP APIs, and the local filesystem through a secure, controlled WebSocket interface.

### 1.1 Project Context

- **Base Project**: Moonbot (Local-first AI Agent System)
- **Reference**: Moltbot architecture patterns
- **Gateway Protocol**: WebSocket (ws://127.0.0.1:18789)
- **Protocol Format**: JSON-RPC 2.0 over WebSocket
- **Implementation Language**: TypeScript (Node.js)

### 1.2 Existing Infrastructure

The project already has:
- `GatewayServer` with WebSocket transport
- `JsonRpcServer` for protocol handling
- `ToolSpec` interface for tool definitions
- `Toolkit` class for tool registry
- Token-based authentication support
- Rate limiting for connections

---

## 2. Functional Requirements

### 2.1 Browser Tool (Playwright)

#### 2.1.1 Core Operations

| Operation | Input | Output | Description |
|-----------|-------|--------|-------------|
| `browser.start` | `sessionKey?`, `headless?` | `sessionId` | Initialize browser context |
| `browser.goto` | `url` | navigation result | Navigate to URL |
| `browser.snapshot` | `mode: "aria"\|"dom"` | page structure | Extract page structure |
| `browser.act` | `type`, `selector`, `text?`, `key?` | action result | Perform click/type/press |
| `browser.screenshot` | `fullPage?` | image data | Capture screenshot |
| `browser.extract` | `selector`, `kind` | extracted content | Extract element content |
| `browser.close` | - | - | Terminate browser session |

#### 2.1.2 Behavioral Requirements

1. **Session Management**: Each session maintains isolated browser context
2. **Concurrency Control**: Sequential execution within a session (no parallel actions)
3. **Navigation Policy**: Only HTTPS allowed; `file://` protocol blocked
4. **Snapshot Priority**: ARIA tree preferred over DOM for accessibility

#### 2.1.3 Input Schema

```typescript
// browser.start
{
  sessionKey?: string;  // Resume existing session
  headless?: boolean;   // Default: true
}

// browser.goto
{
  url: string;  // Must be HTTPS
}

// browser.snapshot
{
  mode: "aria" | "dom";  // "aria" for accessibility tree
}

// browser.act
{
  type: "click" | "type" | "press";
  selector: string;  // CSS/aria selector
  text?: string;     // For type action
  key?: string;      // For press action
}

// browser.screenshot
{
  fullPage?: boolean;  // Default: false
}

// browser.extract
{
  selector: string;
  kind: "text" | "html";
}
```

---

### 2.2 Desktop Tool (system.run)

#### 2.2.1 Core Operations

| Operation | Input | Output | Description |
|-----------|-------|--------|-------------|
| `system.run` | `argv`, `cwd?`, `env?`, `timeoutMs?` | execution result | Execute command safely |
| `system.runRaw` | `command`, `shell?` | execution result | Execute via shell |

#### 2.2.2 Behavioral Requirements

1. **Approval System**: ALL commands require approval check before execution
2. **Allowlist**: Only whitelisted commands allowed
3. **CWD Restriction**: Only paths under `workspaceRoot` allowed
4. **Deny Patterns**: Dangerous patterns blocked (`rm -rf`, `sudo`, `chmod 777`)
5. **Timeout**: Commands have configurable timeout (default 30s)
6. **Output Truncation**: stdout/stderr truncated if too large

#### 2.2.3 Approval Configuration

**Location**: `~/.moonbot/exec-approvals.json`

```json
{
  "allowlist": {
    "commands": ["git", "pnpm", "npm", "node", "python"],
    "cwdPrefix": ["$workspaceRoot"]
  },
  "denylist": {
    "patterns": [
      "rm\\s+-rf",
      "curl.*\\|.*sh",
      "sudo",
      "chmod\\s+777"
    ]
  }
}
```

#### 2.2.4 Input Schema

```typescript
// system.run
{
  argv: string[];        // Command and arguments
  cwd?: string;          // Must be under workspaceRoot
  env?: Record<string, string>;
  timeoutMs?: number;    // Default: 30000
}

// system.runRaw
{
  command: string;
  shell?: "sh" | "bash" | "cmd";
}

// Output
{
  exitCode: number;
  stdout: string;
  stderr: string;
  truncated?: boolean;
}
```

---

### 2.3 HTTP Connector

#### 2.3.1 Core Operations

| Operation | Input | Output | Description |
|-----------|-------|--------|-------------|
| `http.request` | `method`, `url`, `headers?`, `query?`, `body?`, `timeoutMs?` | response data | Make HTTP request |
| `http.download` | `url`, `destPath` | download result | Download file (optional) |

#### 2.3.2 Behavioral Requirements

1. **SSRF Protection**: Block requests to internal networks
2. **Protocol Restriction**: Only `http://` and `https://` allowed
3. **Blocked Destinations**:
   - `localhost`, `127.0.0.1`, `::1`
   - `169.254.169.254` (AWS metadata)
   - Private IP ranges: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
4. **Timeout**: Configurable (default 30s)
5. **Size Limits**: Response body limited (default 10MB)

#### 2.3.3 Input Schema

```typescript
// http.request
{
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  url: string;           // SSRF validated
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: string | object;
  timeoutMs?: number;    // Default: 30000
}

// http.request output
{
  status: number;
  headers: Record<string, string>;
  bodyText?: string;
  bodyJson?: object;
}
```

---

### 2.4 File I/O Tool

#### 2.4.1 Core Operations

| Operation | Input | Output | Description |
|-----------|-------|--------|-------------|
| `fs.read` | `path`, `encoding?` | file content | Read file |
| `fs.write` | `path`, `content`, `encoding?`, `atomic?` | write result | Write file |
| `fs.list` | `path`, `recursive?` | entries list | List directory |
| `fs.glob` | `pattern` | matching paths | Find files (optional) |
| `fs.delete` | `path` | delete result | Delete file (Phase 1: deny by default) |

#### 2.4.2 Behavioral Requirements

1. **Workspace Boundary**: ALL paths must be within `workspaceRoot`
2. **Path Traversal Protection**: Block `..` escape attempts
3. **Size Limits**:
   - Read: 2MB default
   - Write: 2MB default
4. **Atomic Writes**: Use temp file + rename pattern
5. **Delete Protection**: Disabled by default in Phase 1

#### 2.4.3 Input Schema

```typescript
// fs.read
{
  path: string;          // Relative to workspaceRoot
  encoding?: string;     // Default: "utf-8"
}

// fs.write
{
  path: string;          // Relative to workspaceRoot
  content: string;
  encoding?: string;     // Default: "utf-8"
  atomic?: boolean;      // Default: true
}

// fs.list
{
  path: string;          // Relative to workspaceRoot
  recursive?: boolean;   // Default: false
}

// fs.glob
{
  pattern: string;       // Glob pattern (e.g., "**/*.ts")
}

// fs.read output
{
  content: string;
  size: number;
  encoding: string;
}
```

---

## 3. Non-Functional Requirements

### 3.1 Security Requirements

| Priority | Requirement | Tool Impact |
|----------|-------------|-------------|
| **CRITICAL** | Loopback bind only | All (Gateway) |
| **CRITICAL** | Token authentication | All (Gateway) |
| **CRITICAL** | system.run approvals | Desktop |
| **CRITICAL** | Workspace boundary enforcement | File I/O |
| **HIGH** | SSRF protection | HTTP |
| **HIGH** | Path traversal prevention | File I/O |
| **HIGH** | Audit logging (all operations) | All |
| **MEDIUM** | Command timeout | Desktop, HTTP |
| **MEDIUM** | Size limits | File I/O, HTTP |

#### Security Checklist (Must Pass Before Phase 1 Complete)

- [ ] Gateway binds to `127.0.0.1` only (not `0.0.0.0`)
- [ ] All connections require valid token
- [ ] `system.run` checks approvals BEFORE execution
- [ ] File paths validated against `workspaceRoot`
- [ ] HTTP requests blocked to internal IPs
- [ ] All tool calls logged with `sessionId`
- [ ] Browser allows only HTTPS URLs
- [ ] Dangerous command patterns rejected

### 3.2 Performance Requirements

| Metric | Target | Notes |
|--------|--------|-------|
| Tool invocation latency | < 50ms | Excludes actual tool execution |
| Schema validation | < 5ms | Per request |
| Concurrent sessions | 10+ | Per gateway instance |
| Browser session startup | < 3s | Headless mode |
| File I/O throughput | > 10MB/s | Within size limits |

### 3.3 Reliability Requirements

| Requirement | Specification |
|-------------|----------------|
| Error handling | All tools return `ToolResult` with `ok` boolean |
| Timeout handling | Configurable per tool, enforced by runtime |
| Resource cleanup | Browser contexts closed on session end |
| Graceful degradation | Tools fail independently without crashing gateway |
| Audit trail | 100% of operations logged (success/failure) |

### 3.4 Observability Requirements

```typescript
interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta: {
    durationMs: number;
    artifacts?: string[];  // File paths created
    truncated?: boolean;   // Output was truncated
  };
}
```

---

## 4. Technical Constraints

### 4.1 Protocol Constraints

**WebSocket Protocol v1**: JSON-RPC 2.0

```typescript
// Request
{
  "jsonrpc": "2.0",
  "id": "uuid",
  "method": "tools.invoke",
  "params": {
    "toolId": "browser.goto",
    "sessionId": "session-uuid",
    "args": { "url": "https://example.com" }
  }
}

// Response
{
  "jsonrpc": "2.0",
  "id": "uuid",
  "result": {
    "ok": true,
    "data": { /* ... */ },
    "meta": { "durationMs": 1234 }
  }
}
```

**New Gateway Methods Required**:

| Method | Purpose |
|--------|---------|
| `tools.list` | Return available tools with schemas |
| `tools.invoke` | Execute a tool with arguments |
| `tools.approve` | Approve a pending tool execution |

### 4.2 Interface Constraints

**Must implement `ToolSpec` interface** (from `src/types/index.ts`):

```typescript
interface ToolSpec<TInput = unknown, TOutput = unknown> {
  id: string;                    // e.g., "browser.goto"
  description: string;
  schema: object;                // JSON Schema for input
  requiresApproval?: boolean;
  run: (input: TInput, ctx: ToolContext) => Promise<TOutput>;
}
```

**ToolContext contents** (must be provided by Gateway):

```typescript
interface ToolContext {
  sessionId: string;
  agentId: string;
  userId: string;
  config: SystemConfig;
  workspaceRoot: string;         // For File I/O boundary
  policy: {
    allowlist: string[];
    denylist: string[];
    maxBytes: number;
    timeoutMs: number;
  };
}
```

### 4.3 Dependency Constraints

| Dependency | Version | Purpose |
|------------|---------|---------|
| `playwright` | Latest | Browser automation |
| `ws` | Existing | WebSocket server |
| `zod` or `typebox` | TBD | Schema validation |
| Node.js | Current LTS | Runtime |

**Note**: Use existing `ws` dependency. Don't add new WebSocket libraries.

---

## 5. Dependencies

### 5.1 Existing Codebase Dependencies

| Module | Purpose | Usage |
|--------|---------|-------|
| `src/gateway/server.ts` | GatewayServer | Extend with tool methods |
| `src/gateway/json-rpc.ts` | JsonRpcServer | Register tool handlers |
| `src/types/index.ts` | Type definitions | Implement ToolSpec |
| `src/tools/index.ts` | Toolkit | Register new tools |
| `src/config/index.ts` | Config loader | Load tool policies |

### 5.2 New Dependencies Required

```json
{
  "playwright": "^1.x",
  "zod": "^3.x"  // OR "typebox": "^0.x"
}
```

### 5.3 Integration Points

1. **Gateway Extension**: Add `tools.list` and `tools.invoke` methods to `JsonRpcServer`
2. **Tool Runtime**: Create `ToolRuntime` class for execution and validation
3. **Session Context**: Extend `ToolContext` with `workspaceRoot` and `policy`
4. **Approval System**: Create `ApprovalManager` for `system.run`

---

## 6. Risks and Mitigations

### 6.1 Security Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Token leakage allows unauthorized access | CRITICAL | Document token storage; recommend environment variables |
| Approval bypass in system.run | CRITICAL | Approval check BEFORE command execution; unit test required |
| Path traversal escape | HIGH | Validate ALL paths against `workspaceRoot`; use `path.resolve()` + prefix check |
| SSRF via HTTP redirect | HIGH | Follow redirects only to same-origin; validate final URL |
| Browser file:// access | MEDIUM | Explicit protocol block in Playwright context |
| Command injection in runRaw | MEDIUM | Deprecated/dangerous; document risks |

### 6.2 Implementation Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Playwright installation fails | MEDIUM | Document install steps; provide error handling |
| Schema validation library choice | LOW | Evaluate Zod vs TypeBox early; document decision |
| Browser session memory leak | MEDIUM | Implement session cleanup on timeout/disconnect |
| Test coverage gaps | LOW | Write tests before implementation (TDD) |

### 6.3 Operational Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Gateway port conflict | LOW | Make port configurable; document default |
| Concurrent browser resource exhaustion | MEDIUM | Limit concurrent sessions; queue requests |
| Large file read/write OOM | MEDIUM | Enforce size limits; stream large files |

---

## 7. Implementation Order (Recommended)

Based on spec section 5:

1. **Tool Runtime + Registry** (Foundation)
   - Schema validation integration
   - ToolResult standardization
   - tools.list and tools.invoke methods

2. **File I/O** (Lowest risk, easiest to test)
   - Path validation
   - Read/write/list operations
   - Size limits

3. **HTTP Connector** (SSRF logic first)
   - URL validation
   - Block list implementation
   - Request execution

4. **Local Node + system.run** (Requires approval system)
   - ApprovalManager implementation
   - Allowlist/denylist parsing
   - Command execution with timeout

5. **Browser Tool** (Most complex)
   - Playwright integration
   - Session management
   - Concurrency locking
   - Screenshot/extraction

---

## 8. Acceptance Criteria

### 8.1 Per-Tool Criteria

**Browser Tool**:
- [ ] Successfully starts headless browser session
- [ ] Navigates to HTTPS URLs only
- [ ] Captures ARIA snapshot of page
- [ ] Performs click/type/press actions
- [ ] Takes full-page screenshots
- [ ] Closes session cleanly

**Desktop Tool**:
- [ ] Executes allowlisted commands only
- [ ] Blocks denylisted patterns
- [ ] Enforces workspaceRoot CWD restriction
- [ ] Times out long-running commands
- [ ] Truncates large output

**HTTP Connector**:
- [ ] Blocks requests to localhost/private IPs
- [ ] Allows only http/https protocols
- [ ] Returns response with headers/body
- [ ] Enforces timeout

**File I/O**:
- [ ] Blocks paths outside workspaceRoot
- [ ] Enforces size limits on read/write
- [ ] Uses atomic writes
- [ ] Lists directories recursively

### 8.2 Cross-Cutting Criteria

- [ ] All tools conform to `ToolSpec` interface
- [ ] Schema validation rejects invalid input
- [ ] All operations return `ToolResult` format
- [ ] Audit log includes sessionId for every call
- [ ] Gateway loopback bind enforced
- [ ] Token authentication required

### 8.3 Testing Criteria

| Tool Type | Minimum Tests |
|-----------|---------------|
| Unit (per tool) | 5 tests |
| Integration (WebSocket) | 3 tests |
| Security (path/approval) | 3 tests |
| E2E (full workflow) | 1 test |

---

## 9. Open Questions

| Question | Impact | Status |
|----------|--------|--------|
| Zod or TypeBox for schema validation? | Affects all tools | TBD |
| Where to store exec-approvals.json? | Configurable path | Use `$HOME/.moonbot/` |
| Browser session timeout duration? | Resource management | Default 30 min |
| Max concurrent browser sessions? | Resource limits | Default 5 |
| Should fs.glob be implemented in Phase 1? | Scope | Optional, can defer |

---

## 10. References

- **Full Specification**: `.claude/docs/tasks/phase1-gateway-tools/archives/specification-full.md`
- **Summary Specification**: `.claude/docs/tasks/phase1-gateway-tools/specification.md`
- **Session Log**: `.claude/docs/tasks/local-ai-agent/session-logs/day-2025-01-28.md`
- **Existing Types**: `src/types/index.ts`
- **Existing Gateway**: `src/gateway/server.ts`
- **Existing Tools**: `src/tools/index.ts`

---

**Document Status**: Approved for implementation planning.
