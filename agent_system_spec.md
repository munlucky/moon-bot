# Local-first AI Agent System - Technical Specification

> **문서 버전**: 2.1 (2026-01-29 현행화)
> **PRD 문서**: `local_ai_agent_prd.md`

이 문서는 'Moltbot 프레임워크 기반 로컬 우선 AI 에이전트 시스템 PRD'를 기반으로 실제 기능 구현을 위한 기술 사양(Specification)을 정의합니다.

---

## 1. 시스템 전반 구조

### 1.1 주요 디렉토리 구조 (TypeScript 기준)
```
/src
  /gateway            # Gateway WebSocket 서버 및 RPC 핸들러
    /handlers         # channel.handler.ts, tools.handler.ts
    server.ts         # GatewayServer (TaskOrchestrator 통합)
    json-rpc.ts       # JSON-RPC 프로토콜 처리
  /channels
    discord.ts        # Discord 어댑터 ✅
    GatewayClient.ts  # 채널용 WebSocket 클라이언트 ✅
  /agents
    planner.ts        # 목표 분해 (✅ LLM 연동 완료)
    executor.ts       # 도구 실행 ✅
    /replanner        # 실패 복구 모듈 ✅
  /orchestrator       # Task Orchestrator ✅
    TaskOrchestrator.ts
    TaskRegistry.ts
    PerChannelQueue.ts
  /tools              # Tool 정의 및 레지스트리 등록 ✅
    /browser          # Playwright 기반
    /http             # HTTP + SSRF 가드
    /desktop          # system.run + sanitizer
    /filesystem       # 파일 I/O + 경로 검증
    /approval         # 승인 시스템
    /runtime          # ToolRuntime, ApprovalManager
  /sessions           # 세션 저장/로드/전달 ✅
  /cron               # 예약 작업 관리 (✅ Agent 연동 완료)
  /auth               # 페어링 승인, 인증 모듈 ✅
  /config             # 시스템 설정 로딩/검증 ✅
  /cli                # CLI 명령어 ✅
    /commands         # gateway, channel, config, logs, doctor, call, pairing, approvals
  /types              # 타입 정의
  /utils              # 유틸리티 (logger, error-sanitizer)
  /llm                # LLM 인프라 (✅ 새로 추가)
    LLMClient.ts      # Planner용 LLM 클라이언트
    LLMProviderFactory.ts  # 프로바이더 팩토리
    /providers        # LLM 프로바이더 구현
      BaseLLMProvider.ts
      OpenAIProvider.ts
      GLMProvider.ts   # Z.AI(智谱AI) 프로바이더
    types.ts          # LLM 타입 정의
```

---

## 2. Gateway 사양

### 2.1 기본 구성
- **포트**: `18789` (기본값, `MOONBOT_GATEWAY_PORT`로 변경 가능)
- **호스트**: `127.0.0.1` (기본값, `MOONBOT_GATEWAY_HOST`로 변경 가능)
- **프로토콜**: `JSON-RPC` (WebSocket)
- **인증**: SHA-256 해시 토큰 (allowLegacyTokens: false 기본)

### 2.2 구현된 RPC 메서드

| 메서드 | 설명 | 상태 |
|--------|------|------|
| `chat.send` | Surface → TaskOrchestrator 메시지 전달 | ✅ |
| `chat.response` | Task 결과 브로드캐스트 (notification) | ✅ |
| `approval.grant` | PAUSED 태스크 승인/거부 | ✅ |
| `approval.list` | 대기 중 승인 목록 조회 | ✅ |
| `gateway.info` | Gateway 상태 정보 | ✅ |
| `channel.list/add/remove/enable/disable/get` | 채널 관리 | ✅ |
| `tool.run` | 도구 실행 요청 | ✅ |

### 2.3 이벤트 (Notification)

| 이벤트 | 설명 |
|--------|------|
| `approval.requested` | 승인 요청 발생 시 브로드캐스트 |
| `approval.resolved` | 승인/거부 결정 시 브로드캐스트 |
| `chat.response` | Task 완료 시 결과 브로드캐스트 |

### 2.4 보안 정책
- 루프백 바인딩 우선 (외부는 인증 필수)
- config.gateways[].bind, allowFrom 구조화
- **토큰 해시**: `AuthManager.hashToken(plaintext)` 사용


---

## 3. Channel Adapter 사양

### 3.1 ChannelGatewayClient (공통)

**파일**: `src/channels/GatewayClient.ts`

```typescript
interface ChannelGatewayClient {
  connect(): Promise<void>;
  sendToGateway(message: ChatMessage): Promise<TaskResponse>;
  on(event: 'chat.response', handler: (response: TaskResponse) => void): void;
  close(): void;
}
```

**기능:**
- 자동 재연결 (exponential backoff, 최대 10회)
- RPC 타임아웃 (30초 기본)
- EventEmitter 기반 notification 핸들링

### 3.2 Discord 어댑터

**파일**: `src/channels/discord.ts`, `src/discord-bot.ts`

**의존성**: `discord.js`

**환경변수**: `MOONBOT_DISCORD_TOKEN`

**처리 흐름:**
1. 메시지 수신 → `ChannelGatewayClient.sendToGateway()` 호출
2. `chat.response` notification 수신 → Discord 채널로 전달

**특수 기능:**
- Mention Gating (@agent 언급 시만 활성화)
- 첨부파일 자동 다운로드 → `/tmp/moonbot/`

### 3.3 미구현 어댑터

| 어댑터 | 상태 |
|--------|------|
| Slack | ❌ 미구현 |
| Telegram | ❌ 미구현 |
| WhatsApp | ❌ 미구현 |


---

## 4. LLM 인프라

### 4.1 LLMClient

**파일**: `src/llm/LLMClient.ts`

```typescript
class LLMClient {
  constructor(config: LLMConfig)
  isAvailable(): boolean
  generatePlan(request: LLMPlanRequest): Promise<LLMPlanResponse>
  generateFallbackPlan(message: string): LLMPlanResponse
}
```

**기능:**
- Planner를 위한 LLM 기반 계획 생성
- LLM unavailable 시 키워드 기반 fallback
- 프로바이더 자동 감지 (OpenAI/GLM)

### 4.2 LLMProviderFactory

**파일**: `src/llm/LLMProviderFactory.ts`

**지원 프로바이더:**
| 프로바이더 | 타입 | 기본 모델 |
|-----------|------|----------|
| OpenAI | `openai` | `gpt-4o` |
| Z.AI (智谱AI) | `glm` | `glm-4.7-flash` |

**자동 감지 우선순위:**
1. `config.provider` 명시적 설정
2. `ZAI_API_KEY` 또는 `GLM_API_KEY` 환경변수 → GLM
3. `OPENAI_API_KEY` 환경변수 → OpenAI
4. `LLM_PROVIDER` 환경변수
5. 기본값: OpenAI

### 4.3 GLMProvider (Z.AI)

**파일**: `src/llm/providers/GLMProvider.ts`

**특징:**
- Coding API 지원 (`useCodingAPI: true`)
- `reasoning_content` 필드 지원
- 환경변수: `ZAI_API_KEY`, `ZAI_BASE_URL`, `ZAI_CODING_BASE_URL`

### 4.4 환경변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `LLM_PROVIDER` | 프로바이더 타입 (`openai`\|`glm`) | - |
| `OPENAI_API_KEY` | OpenAI API 키 | - |
| `ZAI_API_KEY` | Z.AI API 키 | - |
| `GLM_API_KEY` | GLM API 키 (legacy) | - |
| `ZAI_BASE_URL` | Z.AI 기본 URL | `https://api.z.ai/api/paas/v4/` |
| `ZAI_CODING_BASE_URL` | Z.AI Coding URL | `https://api.z.ai/api/coding/paas/v4/` |


---

## 5. Agent 사고 구조

### 5.1 Planner/Executor/Replanner

| 컴포넌트 | 파일 | 상태 |
|---------|------|------|
| Planner | `src/agents/planner.ts` | ✅ 완료 (LLM 연동) |
| Executor | `src/agents/executor.ts` | ✅ 완료 |
| Replanner | `src/agents/replanner/` | ✅ 완료 |

**Replanner 모듈:**
```
/replanner
  types.ts              # ToolFailure, RecoveryPlan 타입
  FailureAnalyzer.ts    # 실패 원인 분석
  AlternativeSelector.ts # 대체 도구 선택
  PathReplanner.ts      # 경로 재계획
  RecoveryLimiter.ts    # 복구 시도 제한
```

### 5.2 런타임 흐름
```
chat.send → TaskOrchestrator.createTask()
                    ↓
            Executor.execute(message, sessionId, agentId, userId)
                    ↓
            Planner.plan(message) → Steps[]
                    ↓
            for step in steps:
                executeStepWithRetry(step)
                    ↓ (실패 시)
                Replanner.replan(failure, context)
                    → RETRY / ALTERNATIVE / APPROVAL / ABORT
                    ↓
            ExecutionResult → chat.response
```

### 5.3 Step 타입
```typescript
interface Step {
  id: string;
  description: string;
  toolId?: string;
  input?: unknown;
  dependsOn?: string[];
}
```

### 5.4 LLM 연동 상태
```typescript
// src/agents/planner.ts:26
// ✅ LLM 연동 완료 - LLMClient 통해 OpenAI/GLM 프로바이더 지원
```

**Planner.lmClient 기능:**
- `llmClient.isAvailable()`: LLM 사용 가능 여부 확인
- `generatePlan()`: LLM 기반 계획 생성
- `generateFallbackPlan()`: 키워드 기반 fallback

---

## 6. Tool 정의 및 실행 구조

### 6.1 ToolSpec 인터페이스
```typescript
interface ToolSpec<TInput = unknown, TOutput = unknown> {
  id: string;
  schema: TObject;  // TypeBox schema
  run: (input: TInput, ctx: ToolContext) => Promise<TOutput>;
  requiresApproval?: boolean;
  description?: string;
}

interface ToolContext {
  sessionId: string;
  agentId: string;
  userId: string;
  config: SystemConfig;
  workspaceRoot: string;
  policy: {
    allowlist: string[];
    denylist: string[];
    maxBytes: number;
    timeoutMs: number;
  };
}
```

### 6.2 구현된 도구

| 카테고리 | 도구 ID | 파일 |
|---------|--------|------|
| **Browser** | browser.open, browser.screenshot, browser.click, browser.type, browser.scroll, browser.close | `src/tools/browser/BrowserTool.ts` |
| **HTTP** | http.request, http.download | `src/tools/http/HttpTool.ts` |
| **Desktop** | system.run, system.run.raw | `src/tools/desktop/SystemRunTool.ts` |
| **Filesystem** | file.read, file.write, file.list, file.glob | `src/tools/filesystem/FileIOTool.ts` |

### 6.3 보안 컴포넌트

| 컴포넌트 | 파일 | 기능 |
|---------|------|------|
| SsrfGuard | `src/tools/http/SsrfGuard.ts` | SSRF 방지 |
| PathValidator | `src/tools/filesystem/PathValidator.ts` | 경로 검증 |
| CommandSanitizer | `src/tools/desktop/CommandSanitizer.ts` | 명령어 필터링 |

### 6.4 승인 시스템

**파일 구조:**
```
/tools/approval
  types.ts                    # ApprovalRequest, ApprovalResult 타입
  ApprovalFlowManager.ts      # 승인 흐름 관리
  ApprovalStore.ts            # 승인 상태 저장
  /handlers
    cli-approval.ts           # CLI 기반 승인 ✅
    ws-approval.ts            # WebSocket 기반 승인 ✅
    discord-approval.ts       # Discord 승인 ✅ (완료)
```

**승인 흐름:**
```
Tool(requiresApproval: true) → Task PAUSED
        ↓
approval.requested notification → Channel
        ↓
User decision → approval.grant RPC
        ↓
Task resume / abort
```


---

## 7. 세션 및 저장 구조

### 7.1 저장 위치
- **기본**: `~/.moonbot/sessions/<sessionId>.jsonl`
- **설정 가능**: `config.storage.sessionsPath`

### 7.2 SessionKey 형식
```
agent:<agentId>:session:<channelSessionId>
```
**유틸리티**: `src/sessions/SessionKey.ts`
- `generate(agentId, key)`: SessionKey 생성
- `parse(sessionKey)`: agentId, key 추출
- `isValid(sessionKey)`: 유효성 검사

### 7.3 SessionMessage 타입
```typescript
interface SessionMessage {
  type: 'user' | 'thought' | 'tool' | 'result' | 'error';
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}
```

### 7.4 SessionManager API
```typescript
class SessionManager {
  create(agentId, userId, channelId, channelSessionId?): Session;
  get(sessionId): Session | undefined;
  getBySessionKey(sessionKey): Session | undefined;
  load(sessionId): Promise<Session | null>;
  addMessage(sessionId, message): void;
  compact(sessionId): void;  // 50개 초과 시 최근 50개만 유지
  list(): Session[];
  listPaginated(page, pageSize): PaginatedResult;
}
```


---

## 8. Cron 시스템

**파일**: `src/cron/manager.ts`

### 8.1 CronManager API
```typescript
class CronManager {
  add(job: CronJob): void;
  remove(jobId: string): void;
  start(jobId: string): void;
  stop(jobId: string): void;
  list(): CronJob[];
  get(jobId: string): CronJob | undefined;
}
```

### 8.2 CronJob 타입
```typescript
interface CronJob {
  id: string;
  agentId: string;
  schedule: string;  // "HH:MM" 형식
  task: { text: string };
  enabled: boolean;
}
```

### 8.3 스케줄 처리
- `HH:MM` 형식으로 매일 해당 시각 실행
- 첫 실행 후 24시간 간격으로 반복

### 8.4 Agent 연동 상태
```typescript
// src/cron/manager.ts:119-154
// ✅ Agent 연동 완료 - orchestrator.createTask() 호출
```

**CronManager.executeJob() 기능:**
- TaskOrchestrator.createTask()로 크론 작업 실행
- ChatMessage 필드 자동 완성 (agentId, channelId, userId)
- `cron:${jobId}` 형식의 channelSessionId 사용


---

## 9. Gateway vs Task Orchestrator 책임 분리

### 9.1 Gateway 역할 (연결 계층)

**파일**: `src/gateway/server.ts`

Gateway는 순수한 **연결 및 라우팅 계층**입니다:
- WebSocket 연결 관리
- JSON-RPC 메시지 라우팅
- 채널 등록/인증
- Rate limiting
- **하지 않는 것**: 프로세스 실행, 작업 상태 관리

### 9.2 Task Orchestrator 역할 (실행 계층)

**파일**: `src/orchestrator/TaskOrchestrator.ts`

Task Orchestrator는 **실행 및 조율 계층**입니다:
- Task 생명주기 관리
- Agent 조율 (Planner/Executor/Replanner)
- 다중 채널 → 단일 Task 매핑
- 실패/재시도/중단 처리
- 승인 플로우 관리

### 9.3 Task 상태 머신

```
PENDING → RUNNING → DONE
              ↓
         PAUSED (승인 대기)
              ↓
         DONE / ABORTED (승인/거부)

RUNNING → FAILED (실행 실패)
RUNNING → ABORTED (사용자 중단)
```

### 9.4 TaskOrchestrator API

```typescript
class TaskOrchestrator {
  // Task 관리
  createTask(message: ChatMessage): Promise<TaskResponse>;
  abortTask(taskId: string): void;

  // 승인 관리
  grantApproval(taskId: string, approved: boolean): void;
  getPendingApprovals(): ApprovalRequestEvent[];

  // 이벤트 콜백
  onResponse(callback: (response: TaskResponse) => void): void;
  onApprovalRequest(callback: (event: ApprovalRequestEvent) => void): void;
  onApprovalResolved(callback: (event: ApprovalResolvedEvent) => void): void;

  // 라이프사이클
  shutdown(): void;
}
```

### 9.5 PerChannelQueue

**파일**: `src/orchestrator/PerChannelQueue.ts`

- 채널별 독립적인 FIFO 큐
- 채널 간 병렬 처리, 동일 채널 내 순서 보장
- 최대 큐 크기 제한 (기본 100)
- 42개 단위 테스트로 검증

### 9.6 메시지 흐름

```
Discord/Slack → Gateway (chat.send) → TaskOrchestrator.createTask()
                                              ↓
                                    PerChannelQueue.enqueue()
                                              ↓
                                    Executor.execute()
                                              ↓
Discord/Slack ← Gateway (chat.response) ← TaskResponse
```

---

## 10. 개발 및 운영 CLI

### 10.1 구현된 명령어

| 명령 | 파일 | 설명 |
|------|------|------|
| `moonbot gateway status` | `src/cli/commands/gateway.ts` | Gateway 상태 확인 |
| `moonbot gateway start` | 〃 | Gateway 시작 |
| `moonbot gateway stop` | 〃 | Gateway 중지 |
| `moonbot gateway restart` | 〃 | Gateway 재시작 |
| `moonbot call <rpc> [params]` | `src/cli/commands/call.ts` | 직접 RPC 호출 |
| `moonbot logs --follow` | `src/cli/commands/logs.ts` | 실시간 로그 |
| `moonbot doctor` | `src/cli/commands/doctor.ts` | 진단 |
| `moonbot pairing approve <code>` | `src/cli/commands/pairing.ts` | 승인 |
| `moonbot channel list` | `src/cli/commands/channel.ts` | 채널 목록 |
| `moonbot channel add <type> <name>` | 〃 | 채널 추가 |
| `moonbot channel remove <name>` | 〃 | 채널 삭제 |
| `moonbot channel enable/disable <name>` | 〃 | 채널 활성화/비활성화 |
| `moonbot config import <file>` | `src/cli/commands/config.ts` | 설정 가져오기 |
| `moonbot config export <file>` | 〃 | 설정 내보내기 |
| `moonbot config path` | 〃 | 설정 파일 경로 |
| `moonbot approvals list` | `src/cli/commands/approvals.ts` | 대기 중 승인 |
| `moonbot approvals approve <id>` | 〃 | 승인 |
| `moonbot approvals deny <id>` | 〃 | 거부 |

### 10.2 개발 환경

| 항목 | 값 |
|------|---|
| 언어 | TypeScript (ESM) |
| 런타임 | Node.js 22+ |
| 패키지 매니저 | pnpm |
| 테스트 프레임워크 | Vitest |

### 10.3 npm 스크립트

```bash
pnpm build          # TypeScript 컴파일
pnpm lint           # ESLint
pnpm test           # Vitest watch 모드
pnpm test:run       # Vitest 단일 실행
pnpm test:coverage  # 커버리지 리포트
pnpm cli            # CLI 실행 (node dist/cli.js)
pnpm discord        # Discord 봇 실행
```

---

## 11. 타입 정의

**파일**: `src/types/index.ts`

### 11.1 Task 관련 타입

```typescript
type TaskState = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'PAUSED' | 'ABORTED';

interface Task {
  id: string;
  state: TaskState;
  channelSessionId: string;
  message: ChatMessage;
  createdAt: number;
  updatedAt: number;
  error?: TaskError;
  result?: unknown;
}

interface TaskError {
  code: string;
  userMessage: string;
  internalMessage?: string;
  stack?: string;
}

interface ChatMessage {
  agentId: string;
  text: string;
  userId: string;
  channelId: string;
  metadata?: Record<string, unknown>;
}

interface TaskResponse {
  taskId?: string;
  channelId: string;
  text: string;
  status: 'success' | 'error' | 'pending';
  metadata?: Record<string, unknown>;
}
```

### 11.2 승인 관련 타입

```typescript
interface ApprovalRequestEvent {
  taskId: string;
  channelId: string;
  toolId: string;
  input: unknown;
  requestId: string;
}

interface ApprovalResolvedEvent {
  taskId: string;
  channelId: string;
  approved: boolean;
  requestId: string;
}
```

---

## 12. 테스트

### 12.1 테스트 현황

| 컴포넌트 | 테스트 파일 | 테스트 수 |
|---------|------------|----------|
| PerChannelQueue | `src/orchestrator/PerChannelQueue.test.ts` | 42개 |
| TaskOrchestrator | `src/orchestrator/TaskOrchestrator.test.ts` | 36개 |
| Gateway Integration | `src/gateway/integration.test.ts` | 8개 |

### 12.2 테스트 실행

```bash
pnpm test:run           # 전체 테스트 실행
pnpm test:coverage      # 커버리지 리포트
```

