# Moon-Bot 모듈별 리팩토링 계획

> **작성일**: 2026-02-02
> **목표**: 코드 품질 향상, 단일 책임 원칙 준수, 테스트 커버리지 확대

---

## 1. 개요

### 1.1 프로젝트 현황

| 항목 | 현재 상태 | 목표 |
|------|----------|------|
| 코드 품질 점수 | 8/10 | 9+/10 |
| 테스트 커버리지 | ~44% | 80%+ |
| 규정 초과 파일 | 3개 | 0개 |
| console.log 위반 | 15개 파일 | 0개 |
| any 타입 사용 | 86회 | 0회 |

### 1.2 주요 문제점 요약

1. **파일 크기 규정 초과** (규정: 200-400줄, 최대 800줄)
   - `TaskOrchestrator.ts` (744줄)
   - `GatewayServer.ts` (687줄)
   - `ToolRuntime.ts` (497줄)

2. **단일 책임 원칙 위반**
   - TaskOrchestrator: 승인 플로우 + 세션 매핑 + 작업 관리 혼재
   - GatewayServer: RateLimiter + 인증 + 노드 통신 혼재
   - ToolRuntime: 도구 등록 + 실행 + 승인 처리 혼재

3. **코딩 규칙 위반**
   - console.log 사용 (15개 파일)
   - any 타입 사용 (86회, 대부분 테스트)

4. **테스트 미커버 영역**
   - `channels/` 모듈
   - `agents/executor.ts`, `agents/planner.ts`
   - `cli/` 모듈

5. **메모리 누수 위험**
   - `sessionTaskMap`: TTL 없음
   - `ToolRuntime.invocations`: cleanup 미흡

---

## 2. 리팩토링 계획

### Phase 1: 기반 정리 (저위험)

**예상 소요**: 3-4시간

#### 1.1 ConnectionRateLimiter 분리

**대상 파일**: `src/gateway/server.ts` (1-119줄)

**변경 전**:
```
src/gateway/
└── server.ts (687줄)
```

**변경 후**:
```
src/gateway/
├── server.ts (~570줄)
└── ConnectionRateLimiter.ts (새 파일, ~130줄)
```

**인터페이스**:
```typescript
// src/gateway/ConnectionRateLimiter.ts
export interface RateLimiterConfig {
  windowMs: number;      // default: 60000
  maxAttempts: number;   // default: 10
}

export class ConnectionRateLimiter {
  constructor(config?: Partial<RateLimiterConfig>);
  checkLimit(ip: string): boolean;
  checkTokenLimit(token: string): boolean;
  cleanup(): void;
}
```

**복잡도**: 낮음 | **위험도**: 낮음

---

#### 1.2 console.log 정리

**대상 파일** (15개):
- `src/discord-bot.ts`
- `src/cli/commands/*.ts` (7개)
- `src/cli/utils/output.ts`
- `src/tools/approval/handlers/*.ts` (3개)

**작업 내용**:
| 모듈 | 현재 | 변경 |
|------|------|------|
| CLI 모듈 | console.log | CLI 전용 헬퍼 함수 (허용) |
| Approval handlers | console.log | `this.logger.info()` |
| discord-bot.ts | console.log | LayerLogger |

**복잡도**: 낮음 | **위험도**: 낮음

---

### Phase 2: 핵심 리팩토링 (중간 위험)

**예상 소요**: 10-13시간

#### 2.1 TaskOrchestrator.ts 분할

**현재 책임 분석**:
- 승인 플로우 (152-305줄): `setupApprovalHandlers`, `emitApprovalRequest`
- 세션-태스크 매핑 (72줄, 산재): `sessionTaskMap`
- 작업 생명주기 (나머지): `createTask`, `executeTask`, `abortTask`

**변경 전**:
```
src/orchestrator/
├── TaskOrchestrator.ts (744줄)
├── TaskRegistry.ts
├── PerChannelQueue.ts
└── types.ts
```

**변경 후**:
```
src/orchestrator/
├── TaskOrchestrator.ts (~400줄)
├── ApprovalFlowCoordinator.ts (새 파일, ~180줄)
├── SessionTaskMapper.ts (새 파일, ~80줄)
├── TaskRegistry.ts
├── PerChannelQueue.ts
├── types.ts (확장)
└── index.ts (re-export)
```

**새 클래스 인터페이스**:

```typescript
// src/orchestrator/ApprovalFlowCoordinator.ts
export class ApprovalFlowCoordinator {
  constructor(
    toolRuntime: ToolRuntime | null,
    registry: TaskRegistry,
    logger: Logger
  );

  setup(): void;
  onApprovalRequest(callback: ApprovalCallback): () => void;
  onApprovalResolved(callback: ApprovalResolvedCallback): () => void;
  grantApproval(taskId: string, approved: boolean): boolean;
  getPendingApprovals(): PendingApproval[];
}

// src/orchestrator/SessionTaskMapper.ts
export class SessionTaskMapper {
  constructor(logger: Logger, ttlMs?: number);

  set(sessionId: string, taskId: string): void;
  get(sessionId: string): string | undefined;
  cleanupByTaskId(taskId: string): void;

  // 메모리 누수 방지
  private autoCleanup(): void;
}
```

**복잡도**: 중간 | **위험도**: 중간 (기존 테스트 1030줄 활용)

---

#### 2.2 ToolRuntime.ts 분할

**현재 책임 분석**:
- 도구 등록 (60-114줄): `register`, `unregister`, `getTool`, `listTools`
- 호출 실행 (118-284줄): `invoke`, `approveRequest`
- 컨텍스트 생성 (410-453줄): `createContext`, `checkToolApproval`

**변경 전**:
```
src/tools/runtime/
├── ToolRuntime.ts (497줄)
├── ApprovalManager.ts
└── SchemaValidator.ts
```

**변경 후**:
```
src/tools/runtime/
├── ToolRuntime.ts (~250줄, Facade)
├── ToolRegistry.ts (새 파일, ~100줄)
├── ToolExecutor.ts (새 파일, ~150줄)
├── ApprovalManager.ts
├── SchemaValidator.ts
└── index.ts
```

**새 클래스 인터페이스**:

```typescript
// src/tools/runtime/ToolRegistry.ts
export class ToolRegistry {
  register(spec: ToolSpec): void;
  unregister(id: string): void;
  get(id: string): ToolSpec | undefined;
  list(): ToolInfo[];
  has(id: string): boolean;
}

// src/tools/runtime/ToolExecutor.ts
export class ToolExecutor {
  constructor(config: RuntimeConfig, logger: Logger);

  execute(
    tool: ToolSpec,
    input: unknown,
    context: ToolContext,
    timeoutMs: number
  ): Promise<ToolResult>;

  getRunningCount(): number;
}
```

**복잡도**: 중간 | **위험도**: 중간

---

#### 2.3 GatewayServer.ts 추가 분할

Phase 1.1 이후 추가 분할.

**변경 후**:
```
src/gateway/
├── server.ts (~350줄)
├── ConnectionRateLimiter.ts (Phase 1)
├── GatewayAuthenticator.ts (새 파일, ~80줄)
├── NodeCommunicator.ts (새 파일, ~120줄)
└── handlers/
```

**새 클래스 인터페이스**:

```typescript
// src/gateway/GatewayAuthenticator.ts
export class GatewayAuthenticator {
  constructor(authConfig: GatewayConfig['auth'], logger: Logger);

  validateToken(token: string | undefined): boolean;
  isAuthRequired(): boolean;
}

// src/gateway/NodeCommunicator.ts
export class NodeCommunicator {
  constructor(
    nodeSessionManager: NodeSessionManager,
    getSockets: () => Map<string, WebSocket>,
    logger: Logger
  );

  sendToNode(nodeId: string, message: unknown): boolean;
  sendToNodeAndWait(
    nodeId: string,
    method: string,
    params: unknown,
    options?: { timeoutMs?: number }
  ): Promise<unknown>;
}
```

**복잡도**: 중간 | **위험도**: 중간

---

### Phase 3: 테스트 커버리지 확대 (낮은 위험)

**예상 소요**: 8-10시간

#### 3.1 우선순위별 테스트 추가

| 우선순위 | 대상 파일 | 줄 수 | 복잡도 |
|---------|----------|------|--------|
| 1 | `src/agents/executor.ts` | 485 | 높음 |
| 2 | `src/agents/planner.ts` | 206 | 중간 |
| 3 | `src/channels/GatewayClient.ts` | - | 중간 |

**테스트 구조 예시**:
```typescript
// src/agents/executor.test.ts
describe('Executor', () => {
  describe('execute', () => {
    it('should generate plan and execute steps', async () => {});
    it('should handle step failure with retry', async () => {});
    it('should respect recovery limits', async () => {});
    it('should handle approval-required tools', async () => {});
  });

  describe('executeStepWithRetry', () => {
    it('should retry on recoverable errors', async () => {});
    it('should use alternative tools when available', async () => {});
    it('should abort on unrecoverable errors', async () => {});
  });
});
```

**복잡도**: 높음 | **위험도**: 낮음

---

### Phase 4: 코드 품질 개선 (낮은 위험)

**예상 소요**: 3-5시간

#### 4.1 any 타입 제거

**현황**: 86회 사용

**접근 방법**:
| 대상 | 변경 |
|------|------|
| 테스트 파일 | `unknown` + 타입 가드 |
| 소스 파일 | 구체적 타입 정의 |

**우선 대상**:
- `src/gateway/server.ts`: RPC params 타입
- `src/tools/runtime/ToolRuntime.ts`: input 타입

---

#### 4.2 메모리 누수 방지

**대상**:
1. `sessionTaskMap` → SessionTaskMapper로 TTL 적용
2. `ToolRuntime.invocations` → 자동 cleanup 스케줄링

**구현 예시**:
```typescript
// SessionTaskMapper TTL 구현
private entries = new Map<string, { taskId: string; createdAt: number }>();
private readonly TTL_MS = 3600000; // 1시간
private cleanupInterval: NodeJS.Timeout;

constructor() {
  this.cleanupInterval = setInterval(() => this.autoCleanup(), 300000); // 5분마다
}

public shutdown(): void {
  clearInterval(this.cleanupInterval);
}

private autoCleanup(): void {
  const cutoff = Date.now() - this.TTL_MS;
  for (const [key, entry] of this.entries) {
    if (entry.createdAt < cutoff) {
      this.entries.delete(key);
    }
  }
}
```

---

## 3. 실행 로드맵

```
Phase 1 (기반 정리) ─────────────────────────────────
├── 1.1 ConnectionRateLimiter 분리  ──┬── 병렬 가능
└── 1.2 console.log 정리             ──┘
                │
                ▼
Phase 2 (핵심 리팩토링) ─────────────────────────────
├── 2.1 TaskOrchestrator 분할  ←── 최우선
├── 2.2 ToolRuntime 분할
└── 2.3 GatewayServer 추가 분할
                │
                ▼
Phase 3 (테스트 확대) ───────────────────────────────
├── 3.1 executor.test.ts
└── 3.2 planner.test.ts
                │
                ▼
Phase 4 (품질 개선) ─────────────────────────────────
├── 4.1 any 타입 제거
└── 4.2 메모리 누수 방지
```

---

## 4. 신규 파일 목록

### Phase 1
| 파일 | 설명 |
|------|------|
| `src/gateway/ConnectionRateLimiter.ts` | 연결 속도 제한기 |

### Phase 2
| 파일 | 설명 |
|------|------|
| `src/orchestrator/ApprovalFlowCoordinator.ts` | 승인 플로우 관리 |
| `src/orchestrator/SessionTaskMapper.ts` | 세션-태스크 매핑 (TTL 포함) |
| `src/tools/runtime/ToolRegistry.ts` | 도구 등록/관리 |
| `src/tools/runtime/ToolExecutor.ts` | 도구 실행 로직 |
| `src/gateway/GatewayAuthenticator.ts` | 게이트웨이 인증 |
| `src/gateway/NodeCommunicator.ts` | 노드 통신 |

### Phase 3
| 파일 | 설명 |
|------|------|
| `src/agents/executor.test.ts` | Executor 테스트 |
| `src/agents/planner.test.ts` | Planner 테스트 |

---

## 5. 검증 방법

각 Phase 완료 후 필수 검증:

```bash
# 1. 타입 체크
pnpm build

# 2. 단위 테스트
pnpm test:run

# 3. 커버리지 확인 (80% 목표)
pnpm test:coverage

# 4. E2E 테스트
pnpm test:e2e
```

---

## 6. 위험 요소 및 완화 방안

| 위험 | 영향도 | 완화 방안 |
|------|--------|----------|
| TaskOrchestrator 분할 중 상태 관리 버그 | 높음 | 기존 테스트 1030줄 활용, 분할 전 테스트 보강 |
| GatewayServer 인증 분리 시 보안 취약점 | 높음 | timing-safe 비교 유지, 보안 리뷰 |
| ToolRuntime 분할 중 호출 순서 오류 | 중간 | 기존 테스트 활용, invocation 추적 검증 |
| 메모리 누수 방지 로직 오작동 | 낮음 | TTL 충분히 설정 (1시간), 모니터링 추가 |

---

## 7. 예상 소요 시간

| Phase | 작업 | 예상 시간 |
|-------|------|----------|
| Phase 1 | 기반 정리 | 3-4시간 |
| Phase 2 | 핵심 리팩토링 | 10-13시간 |
| Phase 3 | 테스트 확대 | 8-10시간 |
| Phase 4 | 품질 개선 | 3-5시간 |
| **총계** | | **24-32시간 (4-5일)** |

---

## 8. 참고 자료

- `.claude/rules/coding-style.md` - 코딩 스타일 규칙
- `.claude/rules/testing.md` - 테스트 가이드라인
- `.claude/rules/quality.md` - 품질 검증 규칙
