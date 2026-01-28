# Moonbot: Local-first AI Agent System - Context

## Project Overview

**Task Type**: Feature (신규 프로젝트)
**Complexity**: Complex
**Approach**: PRD 및 Spec 문서 기반 개발

### 핵심 구성요소
- **Gateway**: WebSocket 기반 JSON-RPC 서버 (포트 18789)
- **Channel Adapter**: Discord/Slack/Telegram 등 멀티 서피스 어댑터
- **Agent Engine**: Planner-Executor-Replanner 모델
- **ToolKit**: JSON Schema 기반 도구 레지스트리
- **Session**: JSONL 기반 세션 저장/공유
- **Cron**: 예약 작업 및 자동화

### Reference Documents
- PRD: `C:\dev\moon-bot\local_ai_agent_prd.md`
- Spec: `C:\dev\moon-bot\agent_system_spec.md`

---

## Uncertainty Analysis (Updated After Implementation)

### 1. API RPC Schema - RESOLVED

**Status**: All request/response types defined in `src/types/index.ts`
- `connect`: `ConnectParams` -> `ClientInfo`
- `chat.send`: `ChatMessage` -> `{status, sessionId}`
- `session.get`: `{sessionId}` -> `Session`
- `logs.tail`: `{filter?}` -> `{status}`
- `disconnect`: `{clientId}` -> `{success}`

---

### 2. Error Handling Policy - PARTIALLY RESOLVED

**Done**: Standard JSON-RPC error codes in `src/gateway/json-rpc.ts`
- `-32700`: Parse error
- `-32600`: Invalid request
- `-32601`: Method not found
- `-32602`: Invalid params
- `-32603`: Internal error

**Missing**:
- Domain-specific error codes (e.g., `E_AUTH_FAILED`, `E_TOOL_TIMEOUT`)
- User-facing error display policy (Toast/Alert/Inline)
- CLI vs Channel error formatting

---

### 3. Config Schema - RESOLVED

**Status**: Complete in `src/config/index.ts` and `src/types/index.ts`
- `SystemConfig`, `GatewayConfig`, `AgentConfig`, `ChannelConfig`, `ToolConfig`, `StorageConfig`
- Defaults: port 18789, host 127.0.0.1, ~/.moonbot storage

---

### 4. Lobster Approval System - PARTIALLY RESOLVED

**Done**: Types defined in `src/types/index.ts`
- `ApprovalRequest`: `{id, sessionId, toolId, input, userId, createdAt, expiresAt}`
- `ApprovalResponse`: `{requestId, approved, userId, timestamp}`

**Missing**:
- Approval flow implementation (UI, timeout handling, rejection logic)
- Integration with ToolKit for `requiresApproval` tools

---

### 5. Paging Strategy - NOT RESOLVED

**Status**: `SessionManager.list()` returns all sessions without pagination
- No cursor/offset-based pagination for sessions
- No pagination for log tailing
- Potential memory issue for large session counts

---

### 6. TypeBox Tool Schema - PARTIALLY RESOLVED

**Done**: Plain JSON Schema used in `src/tools/index.ts`
- `browser.open`, `filesystem.write`, `api.call` tools defined

**Missing**:
- TypeBox library integration (mentioned in spec but not implemented)
- Flattened schema structure recommendation not applied

---

## Signals

- `hasPendingQuestions`: true (3 partially resolved, 1 unresolved)
- `hasContextMd`: true
- `hasExternalDeps`: ws (WebSocket), discord.js (planned)

---

## Development Environment

- **Runtime**: Node.js 22+
- **Language**: TypeScript (ESM)
- **Package Manager**: pnpm
- **Testing**: Bun (테스트 및 watch 모드)
- **Watch Command**: `pnpm gateway:watch`
