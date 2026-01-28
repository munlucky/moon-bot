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

### 4. Lobster Approval System - PHASE 2 UNCERTAINTIES

**Done** (Phase 1):
- Types defined: `ApprovalRequest`, `ApprovalResponse`, `ToolSpec.requiresApproval`
- `ApprovalManager`: Command allowlist/denylist policy checker
- RPC handlers: `tools.approve`, `tools.getPending`, `tools.getInvocation`
- Gateway: WebSocket server with `broadcast()`, `sendToClient()` methods

**Phase 2: Approval Flow UI Integration - UNCERTAINTIES DETECTED**:

| Category | Priority | Question | Reason |
|----------|----------|----------|--------|
| **UI Interaction** | HIGH | Discord 승인 UI: 버튼 컴포넌트 vs 슬래시 명령어? | 인터랙션 컴포넌트(API)로 승인/거절 버튼 제공 필요 |
| **CLI UI** | MEDIUM | CLI 승인 방식: 프롬프트(y/n) vs 별도 명령어? | 간단한 y/n 프롬프트가 사용자 친화적 |
| **Timeout Policy** | MEDIUM | 승인 타임아웃 기본값? Config 가능 여부? | 5분 권장, Config로 설정 가능하게 |
| **WebSocket Events** | MEDIUM | 승인 상태 변화 시 푸시 방법? 메서드/파라미터? | `approval.updated` 이벤트 정의 필요 |
| **Session Resume** | HIGH | 승인 대기 후 재개 시 실행 컨텍스트 복원? | ToolRuntime이 승인 완료 시 실행 재개 로직 필요 |
| **Timeout Behavior** | MEDIUM | 타임아웃 시 자동 거절 후 알림? | 만료된 요청 자동 정리 및 사용자 알림 |

**Suggested Implementation Approach**:
1. Discord: Message Component Buttons (Green/Red)
2. CLI: Readline prompt with timeout
3. WebSocket: `approval.updated` notification with `{requestId, status, result}`
4. Config: `approval.timeoutSeconds` (default: 300)

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

- `hasPendingQuestions`: true (Phase 2: 6 uncertainties detected for approval flow)
- `hasContextMd`: true
- `hasExternalDeps`: ws (WebSocket), discord.js (planned)

---

## Development Environment

- **Runtime**: Node.js 22+
- **Language**: TypeScript (ESM)
- **Package Manager**: pnpm
- **Testing**: Bun (테스트 및 watch 모드)
- **Watch Command**: `pnpm gateway:watch`
