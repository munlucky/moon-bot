# Moon-Bot 코드 플로우 가이드

> 주니어 개발자를 위한 코드베이스 이해 가이드

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [아키텍처 다이어그램](#2-아키텍처-다이어그램)
3. [핵심 플로우](#3-핵심-플로우)
4. [모듈별 상세 설명](#4-모듈별-상세-설명)
5. [데이터 흐름](#5-데이터-흐름)
6. [시작하기](#6-시작하기)
7. [보안 아키텍처](#7-보안-아키텍처)

---

## 1. 프로젝트 개요

### Moon-Bot이란?

Moon-Bot은 **로컬 우선 AI 에이전트 시스템**입니다. Discord 같은 채팅 플랫폼에서 사용자 명령을 받아 LLM(GPT-4, GLM 등)이 계획을 세우고, 다양한 도구(파일 읽기, 웹 검색 등)를 실행하여 작업을 완료합니다.

### 핵심 특징

| 특징 | 설명 |
|------|------|
| **Gateway 중심** | 모든 채널(Discord, Slack 등)이 WebSocket Gateway를 통해 통신 |
| **Planner-Executor-Replanner** | LLM이 계획 → 실행 → 실패 시 재계획하는 3단계 파이프라인 |
| **승인 시스템** | 위험한 도구(시스템 명령 등)는 사용자 승인 후 실행 |
| **다중 LLM 지원** | OpenAI, GLM(Z.AI) 자동 감지 및 전환 |

### 기술 스택

```
Runtime: Node.js 22+ (ES Modules)
Language: TypeScript 5.5+
WebSocket: ws 라이브러리
Discord: discord.js v14
Slack: @slack/bolt v3
LLM: OpenAI SDK, GLM API
Browser: Playwright
Testing: Vitest
Schema: @sinclair/typebox, Zod
```

---

## 2. 아키텍처 다이어그램

### 전체 시스템 구조

```
┌─────────────────────────────────────────────────────────────────┐
│                        사용자 (Discord, Slack, CLI)              │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Channel Adapters                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   Discord   │  │    Slack    │  │  Telegram   │  (확장 가능)  │
│  │   Adapter   │  │   Adapter   │  │   Adapter   │              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
└─────────┼────────────────┼────────────────┼─────────────────────┘
          │                │                │
          └────────────────┼────────────────┘
                           │ WebSocket (JSON-RPC 2.0)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Gateway Server (포트 18789)                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  JSON-RPC Handler  │  Rate Limiter  │  Auth (SHA-256)   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              TaskOrchestrator (작업 조율)                 │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │    │
│  │  │ TaskRegistry │  │PerChannelQueue│ │StateManager │   │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │    │
│  │                                                          │    │
│  │  ┌──────────────┐  ┌──────────────┐                     │    │
│  │  │SessionTask   │  │ ApprovalFlow │                     │    │
│  │  │   Mapper     │  │ Coordinator  │                     │    │
│  │  └──────────────┘  └──────────────┘                     │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Agent System (AI 두뇌)                        │
│                                                                  │
│  ┌──────────┐     ┌──────────┐     ┌──────────┐                 │
│  │ Planner  │────▶│ Executor │────▶│Replanner │                 │
│  │(계획 수립)│     │(도구 실행)│     │(오류 복구)│                 │
│  └──────────┘     └──────────┘     └──────────┘                 │
│       │                │                 │                       │
│       ▼                ▼                 ▼                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   LLM Client                              │   │
│  │  ┌────────────┐            ┌────────────┐                 │   │
│  │  │  OpenAI    │    또는    │    GLM     │                 │   │
│  │  │ (GPT-4o)   │            │(glm-4.7-flash)│              │   │
│  │  └────────────┘            └────────────┘                 │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Tool Layer (도구 실행)                        │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌──────────┐  │
│  │FileSystem │  │    HTTP    │  │  Browser   │  │ Desktop  │  │
│  │ (파일 I/O) │  │(웹 요청)   │  │(Playwright)│  │(명령실행)│  │
│  └────────────┘  └────────────┘  └────────────┘  └──────────┘  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐                │
│  │  Process   │  │Claude Code │  │   Nodes    │                │
│  │(터미널 세션)│  │  (CLI 통합) │  │(Companion) │                │
│  └────────────┘  └────────────┘  └────────────┘                │
│                         ▲                                       │
│                         │                                       │
│  ┌──────────────────────┴───────────────────────────────────┐  │
│  │  ToolRegistry + ToolExecutor + ApprovalManager           │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Persistence (저장소)                          │
│  ┌────────────────────┐  ┌────────────────────┐                 │
│  │  SessionManager    │  │    ConfigManager   │                 │
│  │  (JSONL 파일)      │  │   (config.json)    │                 │
│  └────────────────────┘  └────────────────────┘                 │
└─────────────────────────────────────────────────────────────────┘
```

### 디렉토리 구조

```
src/
├── index.ts              # 메인 진입점 (모든 모듈 export)
├── cli.ts                # CLI 진입점
├── discord-bot.ts        # Discord 봇 단독 실행
│
├── gateway/              # WebSocket 서버
│   ├── index.ts          # GatewayServer 클래스
│   ├── json-rpc.ts       # JSON-RPC 2.0 유틸리티
│   ├── ConnectionRateLimiter.ts  # 연결 속도 제한
│   └── handlers/         # RPC 메서드 핸들러
│       ├── channel.handler.ts
│       ├── tools.handler.ts
│       └── nodes.handler.ts
│
├── orchestrator/         # 작업 조율
│   ├── index.ts          # 모듈 export
│   ├── TaskOrchestrator.ts   # 핵심 조율 로직
│   ├── TaskRegistry.ts       # 작업 등록/추적
│   ├── PerChannelQueue.ts    # 채널별 FIFO 큐
│   ├── SessionTaskMapper.ts  # 세션-작업 매핑
│   ├── ApprovalFlowCoordinator.ts  # 승인 플로우 조율
│   └── types.ts           # Orchestrator 타입 정의
│
├── agents/               # AI 에이전트
│   ├── planner.ts        # LLM 기반 계획 수립
│   ├── executor.ts       # 도구 실행 관리
│   └── replanner.ts      # 통합 Replanner 모듈
│
├── llm/                  # LLM 통합
│   ├── LLMClient.ts          # 고수준 LLM 인터페이스
│   ├── LLMProviderFactory.ts # 공급자 팩토리
│   ├── ToolCallParser.ts     # 도구 호출 파서
│   ├── SystemPromptBuilder.ts # 시스템 프롬프트 빌더
│   ├── types.ts              # LLM 타입 정의
│   └── providers/
│       ├── index.ts
│       ├── BaseLLMProvider.ts
│       ├── OpenAIProvider.ts
│       └── GLMProvider.ts
│
├── tools/                # 도구 모음
│   ├── index.ts          # 도구 모음 export
│   ├── runtime/          # 실행 환경
│   │   ├── ToolRegistry.ts    # 도구 등록/조회
│   │   ├── ToolExecutor.ts    # 도구 실행
│   │   ├── ToolResultBuilder.ts
│   │   ├── ApprovalManager.ts # 승인 관리
│   │   └── SchemaValidator.ts # 스키마 검증
│   ├── approval/         # 승인 시스템
│   │   ├── ApprovalFlowManager.ts
│   │   ├── ApprovalStore.ts
│   │   └── handlers/     # 채널별 승인 핸들러
│   │       ├── cli-approval.ts
│   │       ├── ws-approval.ts
│   │       ├── discord-approval.ts
│   │       └── slack-approval.ts
│   ├── filesystem/       # 파일 도구
│   ├── http/             # HTTP 도구 (+ SsrfGuard)
│   ├── browser/          # 브라우저 도구 (Playwright)
│   ├── desktop/          # 시스템 명령 도구
│   ├── process/          # 대화형 터미널 세션 도구
│   ├── claude-code/      # Claude Code CLI 통합 도구
│   ├── nodes/            # Node Companion 연동 도구
│   ├── policy/           # 도구 프로필 정책
│   └── schemas/          # TypeBox/Zod 스키마
│
├── channels/             # 채널 어댑터
│   ├── index.ts
│   ├── discord.ts        # Discord 봇
│   ├── slack.ts          # Slack 봇
│   └── GatewayClient.ts  # Gateway 클라이언트
│
├── cli/                  # CLI 명령어
│   ├── index.ts
│   ├── types.ts
│   ├── commands/         # gateway, logs, approvals, channel 등
│   │   ├── gateway.ts
│   │   ├── logs.ts
│   │   ├── approvals.ts
│   │   ├── channel.ts
│   │   ├── config.ts
│   │   ├── call.ts
│   │   ├── doctor.ts     # 진단 도구
│   │   └── pairing.ts    # 페어링 명령
│   └── utils/            # 출력 유틸리티, RPC 클라이언트
│
├── auth/                 # 인증 시스템
│   └── pairing.ts        # DM 페어링
│
├── cron/                 # 예약 작업
│   └── manager.ts        # Cron 매니저
│
├── sessions/             # 세션 관리
│   ├── manager.ts
│   └── SessionKey.ts
│
├── config/               # 설정 관리
├── types/                # TypeScript 타입 정의
│   └── index.ts
└── utils/                # 유틸리티 (logger 등)
```

---

## 3. 핵심 플로우

### 3.1 메시지 처리 플로우 (가장 중요!)

사용자가 Discord에서 메시지를 보내면 어떤 일이 일어나는지 단계별로 설명합니다.

```
[1] Discord 메시지 수신
        │
        ▼
[2] DiscordAdapter.handleMessage()
    └── src/channels/discord.ts
        │
        ▼
[3] Gateway RPC 호출: "chat" 메서드
    └── WebSocket으로 JSON-RPC 요청 전송
        │
        ▼
[4] GatewayServer "chat.send" RPC Handler
    └── src/gateway/index.ts
        │
        ▼
[5] TaskOrchestrator.createTask()
    └── src/orchestrator/TaskOrchestrator.ts
    └── Task 상태: PENDING
        │
        ▼
[6] PerChannelQueue.enqueue()
    └── 채널별 큐에 작업 추가
        │
        ▼
[7] TaskOrchestrator.processQueue() [비동기]
    └── Task 상태: RUNNING
        │
        ▼
[8] Executor.execute()
    └── src/agents/executor.ts
        │
        ├──▶ [8a] Planner.plan()
        │         └── LLM에게 계획 요청
        │         └── Steps[] 반환
        │
        ├──▶ [8b] 각 Step 순차 실행
        │         └── ToolExecutor.invoke()
        │
        └──▶ [8c] 실패 시 Replanner 호출
                  └── 복구 시도 또는 중단
        │
        ▼
[9] Task 상태 업데이트: DONE / FAILED / ABORTED
        │
        ▼
[10] Gateway → Discord 응답 전송
         └── 사용자에게 결과 표시
```

### 3.2 코드로 보는 메시지 처리

**Step 1-2: Discord 메시지 수신**

```typescript
// src/channels/discord.ts
export class DiscordAdapter {
  private async handleMessage(message: Message) {
    // 봇 메시지 무시
    if (message.author.bot) return;

    // Gateway로 전달
    await this.gatewayClient.sendChat({
      agentId: this.agentId,
      userId: message.author.id,
      channelId: message.channel.id,
      message: message.content,
    });
  }
}
```

**Step 4-6: Gateway에서 Task 생성**

```typescript
// src/gateway/index.ts (GatewayServer)
private async handleChatMessage(params: ChatParams): Promise<TaskResponse> {
  // Task 생성
  const { taskId, state } = this.orchestrator.createTask({
    message: {
      role: "user",
      content: params.message,
    },
    channelSessionId: `${params.channelId}:${params.userId}`,
  });

  return { taskId, state };
}
```

**Step 7-8: Executor가 계획 실행**

```typescript
// src/agents/executor.ts
export class Executor {
  async execute(session: Session, toolkit: Toolkit): Promise<ExecutionResult> {
    // 1. 계획 수립
    const plan = await this.planner.plan(
      session.messages[0].content,
      session
    );

    // 2. 각 단계 실행
    for (const step of plan.steps) {
      const result = await this.executeStep(step, toolkit);

      if (!result.ok) {
        // 3. 실패 시 Replanner 호출
        const recovery = await this.replanner.analyze(step, result);
        if (recovery.action === "ABORT") break;
        // 복구 시도...
      }
    }

    return this.buildResult();
  }
}
```

### 3.3 승인 플로우

위험한 도구(시스템 명령 등)는 사용자 승인이 필요합니다.

```
[1] Executor가 SystemRunTool 호출 시도
        │
        ▼
[2] ToolExecutor.invoke() 에서 승인 필요 확인
    └── spec.requiresApproval === true
        │
        ▼
[3] ApprovalManager.requestApproval()
    └── 승인 요청 생성 (ID, 만료시간 포함)
        │
        ▼
[4] ApprovalFlowCoordinator 플로우 시작
    └── 채널별 핸들러로 승인 UI 표시 요청
        │
        ▼
[5] Gateway → Discord: 승인 UI 표시
    └── 버튼: [승인] [거부]
        │
        ▼
[6] 사용자가 버튼 클릭
        │
        ├──▶ [승인] ApprovalManager.approve()
        │         └── 도구 실행 진행
        │
        └──▶ [거부] ApprovalManager.reject()
                  └── Task 상태: FAILED
```

### 3.4 LLM 계획 수립 플로우

```
[1] Planner.plan() 호출
        │
        ▼
[2] LLMClient.isAvailable() 확인
        │
        ├──▶ [사용 가능] LLM 계획
        │         │
        │         ▼
        │    [3a] LLMProviderFactory.create()
        │         └── OpenAI 또는 GLM 선택
        │         │
        │         ▼
        │    [4a] chatCompletion() 호출
        │         └── 시스템 프롬프트 + 사용자 메시지
        │         │
        │         ▼
        │    [5a] JSON 파싱하여 Steps[] 반환
        │
        └──▶ [사용 불가] 키워드 기반 폴백
                  │
                  ▼
             [3b] keywordPlan()
                  └── 키워드 매칭으로 단순 계획 생성
```

---

## 4. 모듈별 상세 설명

### 4.1 Gateway 모듈 (`src/gateway/`)

**역할**: 모든 외부 통신의 중앙 허브

| 파일 | 역할 | 핵심 클래스/함수 |
|------|------|-----------------|
| `index.ts` | WebSocket 서버 + JSON-RPC 핸들러 | `GatewayServer` |
| `json-rpc.ts` | JSON-RPC 2.0 유틸리티 | `createRequest`, `createResponse` |
| `ConnectionRateLimiter.ts` | 연결 속도 제한 | `ConnectionRateLimiter` |
| `handlers/` | RPC 메서드별 핸들러 | `ChannelHandler`, `ToolsHandler`, `NodesHandler` |

**GatewayServer 주요 메서드**:

```typescript
class GatewayServer {
  // 서버 시작
  async start(): Promise<void>

  // WebSocket 연결 핸들링
  private handleConnection(ws: WebSocket, req: IncomingMessage): void

  // JSON-RPC 메시지 처리
  private handleMessage(ws: WebSocket, data: string): Promise<void>

  // RPC 메서드: chat, approve, status, tools.list 등
  private handleChatMessage(params): Promise<TaskResponse>
  private handleApprove(params): Promise<ApprovalResponse>
}
```

### 4.2 Orchestrator 모듈 (`src/orchestrator/`)

**역할**: 작업 생명주기 관리 및 채널별 큐 조정

| 파일 | 역할 |
|------|------|
| `TaskOrchestrator.ts` | 핵심 조율 로직 |
| `TaskRegistry.ts` | 작업 등록/추적 |
| `PerChannelQueue.ts` | 채널별 FIFO 큐 |
| `SessionTaskMapper.ts` | 세션과 작업의 매핑 관리 |
| `ApprovalFlowCoordinator.ts` | 승인 플로우 조율 |
| `types.ts` | Orchestrator 타입 정의 |

**Task 상태 머신**:

```
          createTask()
               │
               ▼
           ┌───────┐
           │PENDING│ ←────────────────────┐
           └───┬───┘                      │
               │ processQueue()           │
               ▼                          │
           ┌───────┐                      │
     ┌─────│RUNNING│─────┐                │
     │     └───────┘     │                │
     │         │         │                │
     │   ┌─────┴─────┐   │                │
     │   │           │   │                │
     ▼   ▼           ▼   ▼                │
 ┌──────┐ ┌──────┐ ┌──────┐               │
 │ DONE │ │FAILED│ │PAUSED│───resume()────┘
 └──────┘ └───┬──┘ └──────┘
              │
              ▼ (복구 불가)
          ┌───────┐
          │ABORTED│
          └───────┘
```

**PerChannelQueue 동작**:

```typescript
// 채널별로 독립적인 FIFO 큐
class PerChannelQueue<T> {
  private queues: Map<string, T[]> = new Map();
  private processing: Map<string, boolean> = new Map();

  enqueue(channelSessionId: string, item: T): void {
    // 해당 채널 큐에 추가
  }

  dequeue(channelSessionId: string): T | undefined {
    // FIFO로 꺼냄
  }
}
```

**왜 채널별 큐가 필요한가?**

- A 채널의 느린 작업이 B 채널을 블로킹하지 않음
- 각 채널 내에서는 메시지 순서 보장
- 동시에 여러 채널의 작업 처리 가능

### 4.3 Agent 모듈 (`src/agents/`)

**역할**: AI 기반 계획 수립 및 실행

#### Planner (`planner.ts`)

```typescript
class Planner {
  async plan(message: string, session?: Session): Promise<Plan> {
    // LLM 사용 가능하면 LLM 계획
    if (this.llmClient?.isAvailable()) {
      return await this.llmPlan(message, session);
    }
    // 아니면 키워드 기반 폴백
    return this.keywordPlan(message);
  }
}

// Plan 구조
interface Plan {
  steps: Step[];
  estimatedDuration?: number;
}

interface Step {
  id: string;           // "read-config-file"
  description: string;  // "설정 파일을 읽습니다"
  toolId?: string;      // "file-read"
  dependsOn?: string[]; // ["previous-step-id"]
}
```

#### Executor (`executor.ts`)

```typescript
class Executor {
  async execute(session: Session, toolkit: Toolkit): Promise<ExecutionResult> {
    // 계획 수립
    const plan = await this.planner.plan(lastMessage);

    // 각 단계 실행
    for (const step of plan.steps) {
      this.addMessage("thought", `실행 중: ${step.description}`);

      if (step.toolId) {
        const result = await toolkit.invoke(step.toolId, step.input);

        if (!result.ok) {
          // Replanner에게 복구 요청
          const recovery = await this.replanner.analyze(step, result);
          // 복구 액션에 따라 처리
        }
      }
    }

    return this.buildResult();
  }
}
```

#### Replanner (`replanner.ts`)

실패 시 복구 전략을 결정하는 4개의 컴포넌트:

| 컴포넌트 | 역할 |
|---------|------|
| `FailureAnalyzer` | 실패 원인 분류 (NETWORK, PERMISSION, VALIDATION 등) |
| `AlternativeSelector` | 대체 도구 추천 |
| `RecoveryLimiter` | 복구 횟수 제한 (기본 3회) |
| `PathReplanner` | 실패 후 남은 목표에 대한 새 계획 생성 |

```typescript
// 복구 액션 종류
type RecoveryAction =
  | "RETRY"       // 같은 도구 재시도
  | "ALTERNATIVE" // 대체 도구 사용
  | "APPROVAL"    // 사용자 승인 요청
  | "ABORT"       // 작업 중단
```

### 4.4 LLM 모듈 (`src/llm/`)

**역할**: 다중 LLM 공급자 통합

```typescript
// 공급자 자동 감지 우선순위
1. config.provider 명시적 설정
2. GLM API 키 존재 (ZAI_API_KEY, GLM_API_KEY)
3. OpenAI API 키 존재 (OPENAI_API_KEY)
4. 기본값: OpenAI

// 사용 예시
const client = new LLMClient({
  provider: "openai",  // 또는 "glm"
  model: "gpt-4o",     // 또는 "glm-4.7-flash"
  apiKey: process.env.OPENAI_API_KEY,
});

const response = await client.chatCompletion({
  messages: [
    { role: "system", content: "당신은 계획을 세우는 AI입니다." },
    { role: "user", content: "파일을 읽고 요약해줘" },
  ],
});
```

### 4.5 Tools 모듈 (`src/tools/`)

**역할**: 실제 작업을 수행하는 도구 모음

**도구 카테고리**:

| 카테고리 | 도구 | 승인 필요 |
|---------|------|----------|
| `filesystem/` | FileRead, FileWrite, FileList, FileGlob | X |
| `http/` | HttpRequest, HttpDownload | X |
| `browser/` | BrowserOpen, BrowserSearch, BrowserClose | X |
| `desktop/` | SystemRun, SystemRunRaw | O |
| `process/` | ProcessStart, ProcessInput, ProcessList, ProcessKill | O |
| `claude-code/` | ClaudeCodeStart, ClaudeCodeInput, ClaudeCodeList | O |
| `nodes/` | NodesRegister, NodesExecute, NodesList, NodesCapture | X |

**도구 구조 (ToolSpec)**:

```typescript
interface ToolSpec<TInput, TOutput> {
  id: string;                    // "file-read"
  description: string;           // "파일 내용을 읽습니다"
  schema: JSONSchema;            // 입력 검증 스키마
  requiresApproval?: boolean;    // 승인 필요 여부

  run(input: TInput, context: ToolContext): Promise<ToolResult<TOutput>>;
}

// 도구 결과
interface ToolResult<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
  meta: {
    durationMs: number;
    artifacts?: string[];
  };
}
```

**도구 런타임 구조**:

```typescript
// ToolRegistry: 도구 등록/조회
class ToolRegistry {
  register(spec: ToolSpec): void
  get(id: string): ToolSpec | undefined
  list(): ToolInfo[]
}

// ToolExecutor: 도구 실행
class ToolExecutor {
  async invoke(toolId: string, input: unknown): Promise<ToolResult>
}

// ApprovalManager: 승인 관리
class ApprovalManager {
  async requestApproval(toolId: string, input: unknown): Promise<boolean>
  approve(approvalId: string): void
  reject(approvalId: string): void
}
```

**새 도구 추가 방법**:

```typescript
// 1. 도구 정의
const myTool: ToolSpec<MyInput, MyOutput> = {
  id: "my-custom-tool",
  description: "내 커스텀 도구",
  schema: {
    type: "object",
    properties: {
      param1: { type: "string" },
    },
    required: ["param1"],
  },

  async run(input, context) {
    // 도구 로직
    return { ok: true, data: result, meta: { durationMs: 100 } };
  },
};

// 2. ToolRegistry에 등록
toolRegistry.register(myTool);
```

---

## 5. 데이터 흐름

### 5.1 핵심 타입 (`src/types/index.ts`)

```typescript
// 작업 단위
interface Task {
  id: string;                    // UUID
  state: TaskState;              // PENDING | RUNNING | PAUSED | DONE | FAILED | ABORTED
  channelSessionId: string;      // "channel123:user456"
  message: ChatMessage;          // 원본 요청
  createdAt: number;
  updatedAt: number;
  error?: TaskError;
  result?: string;
}

// 세션 (대화 히스토리)
interface Session {
  id: string;
  agentId: string;
  userId: string;
  channelId: string;
  messages: SessionMessage[];
  createdAt: number;
}

// 메시지 타입
interface SessionMessage {
  type: "user" | "assistant" | "thought" | "tool" | "result" | "error";
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}
```

### 5.2 설정 흐름

```
환경변수 (최우선)
       │
       ▼
~/.moonbot/config.json (파일)
       │
       ▼
기본값 (코드 내)

// 적용 예시
MOONBOT_GATEWAY_PORT=18790  ──┐
                              │
config.json: { port: 18789 } ─┼─▶ 최종값: 18790 (환경변수 우선)
                              │
기본값: 18789 ────────────────┘
```

### 5.3 세션 저장 구조

```
~/.moonbot/
├── config.json                    # 전역 설정
└── agents/
    └── <agentId>/
        └── sessions/
            └── <sessionId>.jsonl  # 세션별 메시지 로그
```

**JSONL 형식** (한 줄에 하나의 JSON):

```json
{"type":"user","content":"파일 읽어줘","timestamp":1706500000000}
{"type":"thought","content":"파일 읽기 계획 수립","timestamp":1706500001000}
{"type":"tool","content":"file-read 실행","timestamp":1706500002000}
{"type":"result","content":"파일 내용: ...","timestamp":1706500003000}
```

---

## 6. 시작하기

### 6.1 개발 환경 설정

```bash
# 의존성 설치
npm install

# TypeScript 컴파일 (watch 모드)
npm run dev

# Gateway 서버 실행
npm run gateway

# 테스트 실행
npm run test
```

### 6.2 환경 변수 설정

```bash
# .env 파일 생성
cp .env.example .env

# 필수 설정
OPENAI_API_KEY=sk-...        # 또는
ZAI_API_KEY=...              # GLM 사용 시

# 선택 설정
MOONBOT_GATEWAY_PORT=18789
MOONBOT_DISCORD_TOKEN=...
```

### 6.3 코드 탐색 시작점

1. **전체 흐름 이해**: `src/gateway/index.ts` → 메시지 핸들러
2. **작업 조율 이해**: `src/orchestrator/TaskOrchestrator.ts`
3. **AI 로직 이해**: `src/agents/executor.ts` → `execute()`
4. **도구 추가 방법**: `src/tools/filesystem/` 참고

### 6.4 CLI 명령어

```bash
# Gateway 시작/중지
moonbot gateway start
moonbot gateway stop

# 로그 확인
moonbot logs

# 승인 대기 목록
moonbot approvals list
moonbot approvals approve <id>

# 진단
moonbot doctor

# 채널 페어링
moonbot pairing
```

### 6.5 디버깅 팁

```typescript
// 로거 사용
import { Logger } from "./utils/logger.js";
const logger = new Logger("MyModule");

logger.info("정보 메시지", { context: "추가 정보" });
logger.error("에러 발생", { error: err });

// 로그 파일 위치: ~/.moonbot/logs/
```

---

## 7. 보안 아키텍처

### 7.1 SSRF 방어 (SsrfGuard)

HTTP 도구는 SSRF(Server-Side Request Forgery) 공격을 방지합니다.

```typescript
// src/tools/http/SsrfGuard.ts
- IPv4 내부망 차단: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8
- IPv6 내부망 차단: ::1, fe80::/10 (link-local), fc00::/7 (unique local), ff00::/8 (multicast)
- IPv4-mapped IPv6 차단: ::ffff:x.x.x.x 형식의 내부 IP
- DNS Rebinding 방어: resolveAndCheck()로 DNS 해석 후 IP 검증
```

### 7.2 명령어 살균 (CommandSanitizer)

시스템 명령 도구는 allowlist/denylist 방식으로 위험한 명령을 차단합니다.

```typescript
// src/tools/desktop/CommandSanitizer.ts
- Allowlist: git, pnpm, npm, node, python 등 허용 명령
- Denylist: rm -rf, curl|sh, sudo, chmod 777 등 위험 패턴
```

### 7.3 경로 검증 (PathValidator)

파일 도구는 디렉토리 탈출 공격을 방지합니다.

```typescript
// src/tools/filesystem/PathValidator.ts
- 경로 정규화: path.normalize()로 ".." 해결
- 경계 검증: workspace 외부 접근 차단
```

### 7.4 인증 (Gateway)

```typescript
// src/gateway/index.ts
- SHA-256 토큰 기반 인증
- timingSafeEqual()로 타이밍 공격 방지
- Rate Limiting: IP당 + 토큰당 요청 제한
```

---

## 다음 단계

이 문서를 읽은 후:

1. **코드 따라가기**: Discord 메시지가 처리되는 전체 경로를 직접 따라가 보세요
2. **테스트 읽기**: `src/orchestrator/TaskOrchestrator.test.ts`에서 동작 예시 확인
3. **도구 추가 실습**: 간단한 커스텀 도구를 만들어 등록해 보세요
4. **아키텍처 문서**: `docs/` 디렉토리의 다른 문서들 참고

---

*마지막 업데이트: 2026-02-02*
