# Phase 2: Approval System - Implementation Plan

> Project rules: `.claude/PROJECT.md`
> Agreement: `.claude/docs/agreements/phase2-approval-system.md`
> Phase 1 context: `../phase1-gateway-tools/context.md`

## Metadata

- Author: Context Builder Agent
- Created: 2026-01-28
- Updated: 2026-01-28
- Branch: main
- Complexity: complex
- Task Type: feature

## Overview

Phase 2 implements the approval flow UI integration for dangerous tool operations (e.g., `system.run`). This connects the Phase 1 infrastructure (ApprovalManager, ToolRuntime) to user-facing surfaces (Discord, CLI, WebSocket).

**Background**: Phase 1 implemented the approval checking logic and pending state storage. Phase 2 completes the user interaction flow - requesting approval, displaying approval UI, handling user responses, and resuming execution.

**Goal**: Enable users to approve/reject dangerous tool executions through Discord buttons, CLI prompts, and WebSocket events.

---

## Requirements

### Functional Requirements

1. **승인 요청 플로우 (Approval Request Flow)**
   - When `system.run` is called and approval is required, automatically request approval
   - Send approval notifications to all active surfaces (Discord/CLI/WS)
   - Generate unique UUID token for each request (format: `approval-{uuid}`)
   - Set timeout (default 5 minutes, configurable)

2. **승인 대기 상태 관리 (Approval State Management)**
   - Invocation state transitions to `awaiting_approval`
   - Maintain persistent pending approval list
   - Auto-reject expired requests
   - Support listing pending approvals

3. **승인/거절 처리 (Approval/Rejection Handling)**
   - Receive approval/rejection responses from surfaces
   - On approval: Re-execute tool and return result
   - On rejection: Return `APPROVAL_DENIED` error
   - Remove from pending store after resolution

4. **채널별 승인 UI 연동 (Surface-Specific UI)**
   - **Discord**: Embed message with Green [Approve] / Red [Reject] buttons
   - **CLI**: Interactive prompt with timeout, commands to list/approve/deny
   - **WebSocket**: Real-time events (`approval.requested`, `approval.updated`)

### Non-Functional Requirements

| Requirement | Specification |
|-------------|---------------|
| Security | UUID v4 tokens (cryptographically random), one-time use |
| Reliability | Pending approvals persist across restarts |
| Performance | Approval response processed within 100ms |
| Audit Trail | All approvals logged permanently |

### Out of Scope

- Multi-user concurrent approval (Future phase)
- Approval permission levels (Future phase)
- Approval history UI (Future phase)

---

## Technical Architecture

### Component Diagram

```
                                    ┌─────────────────────────────────────────┐
                                    │           Surface Layer                 │
├─────────────┬─────────────┬──────┴──────┬─────────────┬──────────────────┤
│  Discord    │    CLI      │ WebSocket   │  Future UI  │   Notification    │
│  Adapter    │  Commands   │   Events    │              │   Broadcaster    │
└──────┬──────┴──────┬──────┴──────┬──────┴─────────────┴──────────────────┘
       │             │             │
       │  DiscordApprovalHandler    │
       │  - sendApprovalRequest()   │
       │  - handleButtonInteraction()│
       └─────────────┼─────────────┘
                     │
       ┌─────────────▼─────────────┐
       │   ApprovalFlowManager      │
       │  - requestApproval()       │
       │  - handleResponse()        │
       │  - expirePending()         │
       └─────────────┬─────────────┘
                     │
       ┌─────────────▼─────────────┐
       │     ApprovalStore         │
       │  - save(request)          │
       │  - get(requestId)         │
       │  - listPending()          │
       │  - remove(requestId)      │
       └─────────────┬─────────────┘
                     │
       ┌─────────────▼─────────────┐
       │      ToolRuntime          │
       │  - invoke()               │
       │  - approveRequest()        │
       │  - getPendingApprovals()  │
       └───────────────────────────┘
```

### Data Flow

```
1. AI Agent calls system.run (dangerous tool)
   ↓
2. ToolRuntime.invoke() → ApprovalManager.checkApproval() → not approved
   ↓
3. ToolRuntime sets invocation.status = "awaiting_approval"
   ↓
4. ApprovalFlowManager.requestApproval(invocation)
   ↓
5. ApprovalStore.save(request) → generates UUID token
   ↓
6. Notification Broadcaster sends to all surfaces:
   - Discord: DiscordApprovalHandler.sendRequest() → Embed + Buttons
   - CLI: CLIApprovalHandler.showPrompt() → Y/N prompt
   - WebSocket: WsApprovalHandler.broadcast() → approval.requested event
   ↓
7. User clicks Discord button / types CLI command / sends WS response
   ↓
8. ApprovalFlowManager.handleResponse(requestId, approved, userId)
   ↓
9. ToolRuntime.approveRequest(invocationId, approved)
   ↓
10. If approved: Re-execute tool → return result
    If rejected: Return APPROVAL_DENIED error
   ↓
11. ApprovalStore.remove(requestId)
   ↓
12. Broadcast approval.updated event to all surfaces
```

---

## Implementation Plan

### Files to Create (7)

```
src/tools/approval/
  ├─ ApprovalFlowManager.ts      # 승인 플로우 코디네이터
  ├─ ApprovalStore.ts             # 승인 대기 목록 저장소
  ├─ handlers/
  │   ├─ discord-approval.ts      # Discord 승인 UI
  │   ├─ cli-approval.ts          # CLI 승인 UI
  │   └─ ws-approval.ts           # WebSocket 승인 이벤트
  └─ types.ts                     # 승인 관련 타입

src/channels/
  └─ discord-approval.ts          # Discord 승인 핸들러 (확장)
```

### Files to Modify (4)

| File | Changes |
|------|---------|
| `src/tools/runtime/ApprovalManager.ts` | Add flow manager integration hook |
| `src/tools/runtime/ToolRuntime.ts` | Add approval requested event emission |
| `src/gateway/handlers/tools.handler.ts` | Add `approval.respond` handler |
| `src/channels/discord.ts` | Add approval message component handling |

---

## Detailed Specifications

### 1. Approval Types (`src/tools/approval/types.ts`)

```typescript
import type { ToolInvocation } from "../../types/index.js";

export interface ApprovalRequest {
  id: string;                    // UUID v4, format: "approval-{uuid}"
  invocationId: string;          // ToolInvocation.id
  toolId: string;                // e.g., "system.run"
  sessionId: string;
  input: unknown;                // Tool input (for display)
  status: "pending" | "approved" | "rejected" | "expired";
  userId: string;                // Requester
  createdAt: number;
  expiresAt: number;             // createdAt + timeout
  respondedBy?: string;          // Approver/rejecter
  respondedAt?: number;
}

export interface ApprovalResponse {
  requestId: string;
  approved: boolean;
  userId: string;
  timestamp: number;
}

export interface ApprovalNotification {
  request: ApprovalRequest;
  surfaces: Array<"discord" | "cli" | "websocket">;
}

export interface DiscordButtonComponent {
  type: 2;  // BUTTON
  style: 3 | 4;  // SUCCESS (green) or DANGER (red)
  label: string;
  custom_id: string;  // format: "approval_{requestId}_{approve|reject}"
}

export interface DiscordEmbedMessage {
  title: string;
  description: string;
  color: number;  // Yellow for pending
  fields: Array<{ name: string; value: string; inline: boolean }>;
  components: Array<{ type: 1; components: DiscordButtonComponent[] }>;
}
```

### 2. ApprovalStore (`src/tools/approval/ApprovalStore.ts`)

**Purpose**: Persistent storage for pending approvals

**Interface**:
```typescript
export class ApprovalStore {
  private storePath: string;  // ~/.moonbot/pending-approvals.json
  private requests: Map<string, ApprovalRequest>;

  constructor(storePath?: string);
  async load(): Promise<void>;
  async save(): Promise<void>;
  async add(request: ApprovalRequest): Promise<void>;
  get(requestId: string): ApprovalRequest | undefined;
  listPending(): ApprovalRequest[];
  async remove(requestId: string): Promise<void>;
  async updateStatus(requestId: string, status: ApprovalRequest["status"], respondedBy: string): Promise<void>;
  expirePending(): string[];  // Returns expired request IDs
}
```

**Storage Format** (`~/.moonbot/pending-approvals.json`):
```json
{
  "requests": [
    {
      "id": "approval-uuid",
      "invocationId": "invocation-uuid",
      "toolId": "system.run",
      "sessionId": "session-uuid",
      "input": { "argv": ["git", "status"], "cwd": "/path/to/workspace" },
      "status": "pending",
      "userId": "user-id",
      "createdAt": 1706457600000,
      "expiresAt": 1706460600000
    }
  ]
}
```

### 3. ApprovalFlowManager (`src/tools/approval/ApprovalFlowManager.ts`)

**Purpose**: Coordinate approval flow between ToolRuntime and surfaces

**Interface**:
```typescript
export class ApprovalFlowManager {
  private store: ApprovalStore;
  private handlers: Map<string, ApprovalHandler>;
  private eventEmitter: EventEmitter;

  constructor(store: ApprovalStore);
  registerHandler(surface: string, handler: ApprovalHandler): void;

  // Called by ToolRuntime when approval needed
  async requestApproval(invocation: ToolInvocation): Promise<string>;  // Returns requestId

  // Called by surfaces when user responds
  async handleResponse(requestId: string, approved: boolean, userId: string): Promise<ToolResult>;

  // Periodic cleanup
  async expirePending(): Promise<void>;

  // Query
  listPending(): ApprovalRequest[];
  get(requestId: string): ApprovalRequest | undefined;
}

interface ApprovalHandler {
  sendRequest(request: ApprovalRequest): Promise<void>;
  sendUpdate(request: ApprovalRequest): Promise<void>;
}
```

### 4. Discord Approval Handler (`src/tools/approval/handlers/discord-approval.ts`)

**Purpose**: Send Discord Embed with approval buttons

**Interface**:
```typescript
export class DiscordApprovalHandler implements ApprovalHandler {
  private adapter: DiscordAdapter;

  constructor(adapter: DiscordAdapter);

  async sendRequest(request: ApprovalRequest): Promise<void>;
  async sendUpdate(request: ApprovalRequest): Promise<void>;
  formatEmbed(request: ApprovalRequest): DiscordEmbedMessage;
}

export function createApprovalButtons(requestId: string): DiscordButtonComponent[];
export function parseButtonCustomId(customId: string): { requestId: string; action: "approve" | "reject" } | null;
```

**Discord Embed Format**:
```
🛡️ Tool Execution Approval Required

Tool: system.run
Command: git status
CWD: /path/to/workspace

Requested by: @user
Expires in: 5 minutes

[✅ Approve]  [❌ Reject]
```

### 5. CLI Approval Handler (`src/tools/approval/handlers/cli-approval.ts`)

**Purpose**: Interactive CLI prompts and commands

**Interface**:
```typescript
export class CLIApprovalHandler implements ApprovalHandler {
  async sendRequest(request: ApprovalRequest): Promise<void>;
  async sendUpdate(request: ApprovalRequest): Promise<void>;
  async promptUser(request: ApprovalRequest): Promise<boolean>;
}

// CLI Commands
export class ApprovalCommands {
  private flowManager: ApprovalFlowManager;

  list(): void;
  approve(requestId: string): Promise<void>;
  deny(requestId: string): Promise<void>;
}
```

**CLI Commands**:
```bash
moltbot approvals list              # List pending approvals
moltbot approvals approve <id>      # Approve request
moltbot approvals deny <id>         # Deny request
```

### 6. WebSocket Approval Handler (`src/tools/approval/handlers/ws-approval.ts`)

**Purpose**: Broadcast approval events to WebSocket clients

**Interface**:
```typescript
export class WsApprovalHandler implements ApprovalHandler {
  private gateway: GatewayServer;

  constructor(gateway: GatewayServer);

  async sendRequest(request: ApprovalRequest): Promise<void>;
  async sendUpdate(request: ApprovalRequest): Promise<void>;
}

// Events
interface ApprovalRequestedEvent {
  type: "approval.requested";
  data: ApprovalRequest;
}

interface ApprovalUpdatedEvent {
  type: "approval.updated";
  data: {
    requestId: string;
    status: "approved" | "rejected" | "expired";
    result?: ToolResult;
  };
}
```

---

## Default Decisions (Applied)

| ID | Decision | Applied Value |
|----|----------|---------------|
| D1 | Discord UI 패턴 | Message Component Buttons (Green Approve / Red Reject) |
| D2 | CLI UI 패턴 | Readline prompt with timeout |
| D3 | WebSocket 이벤트 | `approval.updated` with `{requestId, status, result}` |
| D4 | 타임아웃 설정 | `approval.timeoutSeconds` (default: 300) |

---

## Integration Points

### 1. ToolRuntime.invoke() Modification

**Current behavior**: Returns `{ invocationId, awaitingApproval: true }` when approval required

**Add**: Emit `approval.requested` event

```typescript
// In ToolRuntime.invoke()
if (approvalRequired) {
  invocation.status = "awaiting_approval";

  // EMIT EVENT for ApprovalFlowManager
  this.emit("approval.requested", {
    invocationId,
    toolId,
    input,
    sessionId
  });

  return { invocationId, awaitingApproval: true };
}
```

### 2. Discord Channel Extension

**Add** (`src/channels/discord.ts`):
```typescript
// Handle interaction create events (button clicks)
this.client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const parsed = parseButtonCustomId(interaction.customId);
  if (!parsed || !parsed.action) return;

  // Call approval.respond RPC
  await this.gateway.call("approval.respond", {
    requestId: parsed.requestId,
    approved: parsed.action === "approve",
    userId: interaction.user.id
  });

  await interaction.update({ content: "Response recorded", components: [] });
});
```

### 3. Gateway RPC Handler Extension

**Add** (`src/gateway/handlers/tools.handler.ts`):
```typescript
// approval.respond: Handle approval response from surfaces
handlers.set("approval.respond", async (params) => {
  const { requestId, approved, userId } = params as {
    requestId: string;
    approved: boolean;
    userId: string;
  };

  return flowManager.handleResponse(requestId, approved, userId);
});

// approval.list: Get pending approvals
handlers.set("approval.list", async () => {
  return {
    pending: flowManager.listPending()
  };
});
```

### 4. Configuration Extension

**Add** (`~/.moonbot/config.json`):
```json
{
  "approval": {
    "timeoutSeconds": 300,
    "enabledSurfaces": ["discord", "cli", "websocket"],
    "autoExpire": true
  }
}
```

---

## Acceptance Tests (Completion Criteria)

| ID | Test Description | Type | File | Status |
|----|------------------|------|------|--------|
| T1 | [Approval] Request generates UUID token | Unit | `ApprovalFlowManager.test.ts` | PENDING |
| T2 | [Approval] Request persists to store | Unit | `ApprovalStore.test.ts` | PENDING |
| T3 | [Discord] Embed sent with approve/reject buttons | Integration | `discord-approval.test.ts` | PENDING |
| T4 | [Discord] Button click triggers approval.respond | Integration | `discord-approval.test.ts` | PENDING |
| T5 | [CLI] Prompt accepts Y/N input | Unit | `cli-approval.test.ts` | PENDING |
| T6 | [CLI] Commands: list, approve, deny | Integration | `cli-approval.test.ts` | PENDING |
| T7 | [Approval] Approved request re-executes tool | Integration | `ApprovalFlowManager.test.ts` | PENDING |
| T8 | [Approval] Rejected request returns error | Unit | `ApprovalFlowManager.test.ts` | PENDING |
| T9 | [Approval] Timeout auto-rejects pending request | Unit | `ApprovalStore.test.ts` | PENDING |
| T10 | [WebSocket] Emits approval.requested event | Integration | `ws-approval.test.ts` | PENDING |
| T11 | [WebSocket] Emits approval.updated event | Integration | `ws-approval.test.ts` | PENDING |
| T12 | [Security] Token is UUID v4 format | Security | `ApprovalFlowManager.test.ts` | PENDING |
| T13 | [Security] One-time token use enforced | Security | `ApprovalFlowManager.test.ts` | PENDING |

**Completion Condition**: All tests PASS

---

## Security Considerations

| Concern | Mitigation |
|---------|-----------|
| 토큰 위조 (Token forgery) | UUID v4 (cryptographically random, unpredictable) |
| 재생 공격 (Replay attack) | One-time tokens, invalidated after use |
| 미인증 승인 (Unauthorized approval) | Surface authentication required (Discord user, CLI session) |
| 감사 추적 (Audit trail) | All approvals logged with userId, timestamp |
| 타임아웃 (Timeout) | Approval valid for 5 minutes (configurable) |
| 경쟁 조건 (Race condition) | Update status atomically, check before re-execution |

---

## Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Discord API rate limit | MEDIUM | Use webhook for high-volume, batch requests |
| CLI prompt blocks async flow | MEDIUM | Use non-blocking readline with timeout |
| WebSocket connection drops | LOW | Auto-reconnect with pending approval sync |
| Pending approval file corruption | MEDIUM | Atomic writes, backup on save |
| Multiple surfaces approve simultaneously | LOW | First response wins, others ignored |

---

## Checkpoints

- [ ] ApprovalStore implementation with persistence
- [ ] ApprovalFlowManager coordinates flow
- [ ] Discord handler sends Embed + buttons
- [ ] Discord button interaction handling
- [ ] CLI prompt with timeout
- [ ] CLI commands (list, approve, deny)
- [ ] WebSocket event broadcasting
- [ ] ToolRuntime emits approval.requested
- [ ] Gateway adds approval.respond handler
- [ ] All acceptance tests passing
- [ ] Security checklist verified
- [ ] Build succeeds (`npm run build`)
- [ ] Type check passes (`npx tsc --noEmit`)

---

## Dependencies

### Phase 1 (Completed)
- ToolRuntime with `awaiting_approval` state
- ApprovalManager with allowlist/denylist
- Gateway RPC handlers (tools.invoke, tools.approve)
- DiscordAdapter with basic message handling

### New Dependencies
- **Discord.js**: Message components, interactions (already in Phase 1)
- **readline**: Built-in Node.js module for CLI
- **EventEmitter**: Built-in Node.js module for internal events

---

## References

- Phase 1 context: `../phase1-gateway-tools/context.md`
- Agreement: `../../agreements/phase2-approval-system.md`
- Spec: `agent_system_spec.md` (Lobster Approval System)
- PRD: `local_ai_agent_prd.md` (Phase 2)

---

## Archive Index

| Version | File | Content | Date |
|---------|------|---------|------|
| v1 | context.md | Initial implementation plan | 2026-01-28 |

---

**Document Status**: Ready for implementation
**Next Step**: Execute implementation (medium complexity)
