# Preliminary Agreement: Moonbot Nodes Tool

**Version**: 1.0
**Date**: 2026-01-30
**Project**: Moonbot (Moltbot-based local-first AI Agent System)
**Author**: Claude AI Assistant

---

## 1. Objective

Implement Moonbot Nodes Tool for Node Companion app integration, enabling remote command execution and screen capture through Discord Bot <-> Gateway (WebSocket) <-> Node Companion (local PC) architecture.

---

## 2. Scope

### 2.1 In Scope

- **Node Companion App** (to be developed in this task)
  - Local PC WebSocket client connecting to Gateway
  - PNG screen capture capability
  - JSON-RPC command execution interface
  - Pairing mechanism (8-char alphanumeric, 5min TTL)

- **Gateway Server Integration**
  - Node-specific RPC handlers (`nodes.*`)
  - Client type identification for node-companion
  - Bidirectional JSON-RPC communication

- **Tool Implementation**
  - `nodes.status` - List paired nodes and their status
  - `nodes.run` - Execute commands on paired nodes
  - `nodes.screen_snap` - Capture screen from nodes

- **Security**
  - Pairing validation and consent tracking
  - Command allow/block lists with argument sanitization
  - Session ownership verification (userId matching)
  - Screen capture explicit consent in Node Companion

### 2.2 Out of Scope

- Node Companion app GUI/UX (CLI-only MVP)
- Multi-node orchestration (single node selection per command)
- File transfer between bot and nodes
- Persistent command queues
- Real-time output streaming (poll-based only)
- Node auto-discovery (manual pairing only)

---

## 3. Technical Specifications

### 3.1 API Contract (TypeBox Schemas)

```typescript
// Node connection status
NodeConnectionStatusSchema = Type.Union([
  Type.Literal("paired"),
  Type.Literal("pending"),
  Type.Literal("offline"),
  Type.Literal("expired")
])

// Node information
NodeInfoSchema = Type.Object({
  nodeId: Type.String(),
  nodeName: Type.String(),
  status: NodeConnectionStatusSchema,
  lastSeen: Type.Integer(),
  platform: Type.Optional(Type.String()),
})

// Pairing request
NodesPairRequestSchema = Type.Object({
  code: Type.String(), // 8-char alphanumeric
})

// Pairing response
NodesPairResponseSchema = Type.Object({
  success: Type.Boolean(),
  nodeId: Type.String(),
  nodeName: Type.String(),
})

// Status request
NodesStatusRequestSchema = Type.Object({
  userId: Type.Optional(Type.String()),
})

// Status response
NodesStatusResponseSchema = Type.Object({
  nodes: Type.Array(NodeInfoSchema),
  count: Type.Integer(),
})

// Run command request
NodesRunRequestSchema = Type.Object({
  nodeId: Type.String(),
  argv: Type.Union([Type.String(), Type.Array(Type.String())]),
  cwd: Type.Optional(Type.String()),
  env: Type.Optional(Type.Record(Type.String(), Type.String())),
  timeoutMs: Type.Optional(Type.Integer({ minimum: 1, maximum: 300000 })),
})

// Run command response
NodesRunResponseSchema = Type.Object({
  success: Type.Boolean(),
  exitCode: Type.Union([Type.Integer(), Type.Null()]),
  stdout: Type.String(),
  stderr: Type.String(),
})

// Screen snap request
NodesScreenSnapRequestSchema = Type.Object({
  nodeId: Type.String(),
})

// Screen snap response
NodesScreenSnapResponseSchema = Type.Object({
  success: Type.Boolean(),
  imageData: Type.String(), // Base64-encoded PNG
  format: Type.Literal("png"),
})
```

### 3.2 Integration Points

#### Files to Create

```
src/tools/nodes/
├── NodeSessionManager.ts    # Pairing, node selection, consent tracking
├── NodeCommandValidator.ts  # Allow/block lists, sanitization
├── NodesTool.ts             # Tool creation functions
├── types.ts                 # Node-specific types
└── index.ts                 # Barrel exports

src/gateway/handlers/nodes.handler.ts  # Gateway RPC handlers
```

#### Files to Modify

| File | Modification |
|------|--------------|
| `src/tools/schemas/TypeBoxSchemas.ts` | Add nodes.* schemas |
| `src/tools/index.ts` | Import and register nodes tools |
| `src/tools/policy/ToolProfile.ts` | Add nodes.* to coding profile |
| `src/gateway/server.ts` | Register nodes handlers, add sendToNodeAndWait() |
| `src/gateway/json-rpc.ts` | (if needed) Extend for node-companion type |

### 3.3 Data Flow

```
User (Discord)
    ↓ "run npm test on my-node"
Discord Bot
    ↓ tool invocation: nodes.run
Gateway (WebSocket)
    ↓ JSON-RPC: nodes.run
Node Companion (local PC)
    ↓ execute command
    ↓ return result
Gateway
    ↓ tool result
Discord Bot
    ↓ response
User
```

---

## 4. Security Requirements

### 4.1 Pairing Security

| Property | Value |
|----------|-------|
| Code format | 8-char alphanumeric |
| TTL | 5 minutes |
| Usage | One-time use |
| Storage | In-memory only |

### 4.2 Command Validation

- **Allowlist**: Safe commands (e.g., `npm`, `git`, `ls`, `cat`)
- **Blocklist**: Dangerous patterns (e.g., `rm -rf`, `> /dev/sda`)
- **Argument sanitization**: Shell escape sequences, command injection prevention
- **CWD validation**: Prevent directory traversal

### 4.3 Session Ownership

```typescript
// Verify userId before executing
if (nodeSession.userId !== ctx.userId) {
  return ToolResultBuilder.failure("ACCESS_DENIED", "You do not own this session");
}
```

### 4.4 Screen Capture Consent

- Node Companion MUST require explicit consent
- Consent flag stored in session
- Gateway checks consent flag before requesting capture

---

## 5. Implementation Plan (10 Steps)

### Step 1: TypeBox Schemas
Add `NodeConnectionStatus`, `NodeInfo`, `NodesStatus`, `NodesRun`, `NodesScreenSnap` schemas to `src/tools/schemas/TypeBoxSchemas.ts`.

### Step 2: NodeSessionManager
Create `src/tools/nodes/NodeSessionManager.ts`:
- Pairing code generation/validation
- Node session storage (userId -> nodeId mapping)
- Consent tracking for screen capture
- Session expiration (5min TTL)

### Step 3: NodeCommandValidator
Create `src/tools/nodes/NodeCommandValidator.ts`:
- Allowlist validation
- Blocklist pattern matching
- Argument sanitization (shell escape, injection prevention)
- CWD validation (path traversal prevention)

### Step 4: Gateway Handlers
Create `src/gateway/handlers/nodes.handler.ts`:
- `nodes.pair.request` - Generate pairing code
- `nodes.pair.verify` - Verify and complete pairing
- `nodes.status` - List paired nodes
- `nodes.run` - Execute command on node
- `nodes.screen_snap` - Request screen capture

### Step 5: NodesTool
Create `src/tools/nodes/NodesTool.ts`:
- `createNodesStatusTool()` - List node status
- `createNodesRunTool()` - Execute commands
- `createNodesScreenSnapTool()` - Screen capture

### Step 6: Gateway Server Integration
Modify `src/gateway/server.ts`:
- Add `sendToNodeAndWait(nodeId, method, params)` method
- Register `node-companion` as client type
- Route node-specific RPC messages

### Step 7: Tool Registration
Modify `src/tools/index.ts`:
- Import nodes tools
- Register in `createGatewayTools()`

### Step 8: ToolProfile Update
Modify `src/tools/policy/ToolProfile.ts`:
- Add `nodes.status`, `nodes.run`, `nodes.screen_snap` to `coding` profile

### Step 9: ClaudeCodeSessionManager
Extend for remote session support:
- Map Discord userId -> Node Companion sessionId
- Track node selection per session

### Step 10: ClaudeCodeTool Integration
Modify `src/tools/desktop/ClaudeCodeTool.ts`:
- Integrate `useScreenCapture` parameter
- Auto-trigger `nodes.screen_snap` when enabled

---

## 6. Verification Criteria

### 6.1 Build Verification

```bash
npm run build          # TypeScript compilation
npm run typecheck      # No type errors
```

### 6.2 Unit Tests (if test framework exists)

| Component | Test Cases |
|-----------|------------|
| NodeSessionManager | Pairing generation, expiration, ownership |
| NodeCommandValidator | Allowlist, blocklist, sanitization |
| NodesTool | Tool invocation, error handling |

### 6.3 Manual Tests

| Scenario | Expected Result |
|----------|----------------|
| Pairing flow | Code generation, verification, session creation |
| nodes.status | List user's paired nodes |
| nodes.run | Command executes, output returned |
| nodes.screen_snap | PNG base64 image returned |
| Invalid pairing | Access denied error |
| Unauthorized command | Blocklist rejection |

### 6.4 Integration Tests

- Node Companion connects to Gateway with `clientType: "node-companion"`
- Bidirectional JSON-RPC communication
- Timeout handling for unresponsive nodes

---

## 7. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Node Companion disconnection | Medium | Medium | Auto-reconnect, session recovery |
| Command injection | Low | High | Strict sanitization, allowlist |
| Screen capture latency | Medium | Low | Timeout, error handling |
| Pairing code collision | Very Low | Low | 8-char alphanumeric (2.8T combos) |
| Unauthorized node access | Low | High | userId verification, session ownership |

---

## 8. Open Questions

1. **Node Companion auto-start**: Should Node Companion run as system service or manual start?
2. **Multi-user support**: Can multiple Discord users pair with same node?
3. **Concurrent commands**: Should nodes support parallel command execution?
4. **Output size limits**: Max stdout/stderr size for `nodes.run`?

---

## 9. References

- Existing patterns: `src/tools/process/` (ProcessSessionManager, ProcessTool)
- Gateway handlers: `src/gateway/handlers/tools.handler.ts`
- TypeBox schemas: `src/tools/schemas/TypeBoxSchemas.ts`
- Tool profile: `src/tools/policy/ToolProfile.ts`

---

**Approval**:

Author: _________________________
Date: _________________________

**Review**:

Technical Lead: _________________________
Date: _________________________

**Approval**:

Project Manager: _________________________
Date: _________________________
