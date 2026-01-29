# Moon-Bot 개선점 분석 리포트

> 코드베이스 분석을 통해 도출한 개선 사항

## 목차

1. [요약](#1-요약)
2. [P0 - 필수 개선](#2-p0---필수-개선)
3. [P1 - 중요 개선](#3-p1---중요-개선)
4. [P2 - 권장 개선](#4-p2---권장-개선)
5. [P3 - 장기 개선](#5-p3---장기-개선)
6. [기술 부채 목록](#6-기술-부채-목록)

---

## 1. 요약

### 현재 상태

| 영역 | 점수 | 평가 |
|------|------|------|
| 아키텍처 | 8/10 | 게이트웨이 중심 설계 우수, 채널 독립성 보장 |
| 코드 품질 | 6/10 | 일부 대형 파일, null 체크 반복 |
| 테스트 | 4/10 | 핵심 로직 테스트 부재 |
| 문서화 | 5/10 | PRD/스펙 존재, 코드 레벨 문서 부족 |
| 보안 | 7/10 | 정보 공개 제한, 승인 시스템 존재 |
| 확장성 | 7/10 | 플러그인 구조 기반, 일부 제약 |

### 주요 발견

```
[강점]
+ Gateway-Centric 아키텍처로 채널 확장 용이
+ Planner-Executor-Replanner 자동 복구 시스템
+ 다중 LLM 공급자 지원 (OpenAI, GLM)
+ 승인 시스템으로 위험 도구 제어

[약점]
- 핵심 모듈(Executor, Planner) 테스트 부재
- TaskOrchestrator 730줄 - 단일 책임 원칙 위반
- 의존성 주입 컨테이너 부재
- 병렬 실행 미지원 (순차 실행만)
```

---

## 2. P0 - 필수 개선

> 즉시 해결해야 할 중요 이슈

### 2.1 테스트 커버리지 확대

**현황**:
- 테스트 존재: `TaskOrchestrator`, `PerChannelQueue`, `gateway/integration`
- 테스트 부재: `Executor`, `Planner`, `Replanner`, `LLMClient`, `ToolRuntime`

**문제점**:
```
src/agents/executor.ts    (368줄) - 테스트 0개
src/agents/planner.ts     (187줄) - 테스트 0개
src/llm/LLMClient.ts      (244줄) - 테스트 0개
```

**해결 방안**:

```typescript
// 예시: executor.test.ts 구조
describe('Executor', () => {
  describe('execute()', () => {
    it('should execute all steps in order', async () => {});
    it('should call replanner on step failure', async () => {});
    it('should stop execution when replanner returns ABORT', async () => {});
    it('should handle tool approval flow', async () => {});
  });

  describe('executeStep()', () => {
    it('should invoke tool with correct parameters', async () => {});
    it('should record execution in session', async () => {});
  });
});
```

**영향도**: 높음 - 핵심 비즈니스 로직의 안정성 확보
**예상 작업량**: 3-5일

---

### 2.2 에러 처리 표준화

**현황**:
- 에러 처리가 모듈마다 다름
- 일부는 `throw`, 일부는 `{ ok: false }` 반환
- 에러 타입이 명확하지 않음

**문제 코드 예시**:

```typescript
// src/agents/executor.ts - 일관성 없는 에러 처리
try {
  const result = await toolkit.invoke(toolId, input);
  if (!result.ok) {
    // ToolResult 형식
  }
} catch (error) {
  // throw된 Error 형식
}

// src/gateway/server.ts - 문자열 에러
return this.createError(request.id, -32603, "Internal error", errorMsg);
```

**해결 방안**:

```typescript
// 1. 에러 타입 정의
// src/types/errors.ts
export class MoonBotError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'MoonBotError';
  }
}

export enum ErrorCode {
  // 도구 관련
  TOOL_NOT_FOUND = 'TOOL_NOT_FOUND',
  TOOL_EXECUTION_FAILED = 'TOOL_EXECUTION_FAILED',
  TOOL_VALIDATION_FAILED = 'TOOL_VALIDATION_FAILED',

  // LLM 관련
  LLM_UNAVAILABLE = 'LLM_UNAVAILABLE',
  LLM_RESPONSE_INVALID = 'LLM_RESPONSE_INVALID',

  // 승인 관련
  APPROVAL_TIMEOUT = 'APPROVAL_TIMEOUT',
  APPROVAL_REJECTED = 'APPROVAL_REJECTED',

  // 시스템
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

// 2. Result 타입 통일
type Result<T, E = MoonBotError> =
  | { ok: true; data: T }
  | { ok: false; error: E };
```

**영향도**: 중간 - 디버깅 효율성 및 에러 추적성 개선
**예상 작업량**: 2-3일

---

### 2.3 민감 정보 로깅 방지

**현황**:
- `ErrorSanitizer`가 클라이언트 응답만 처리
- 내부 로그에 민감 정보가 그대로 기록될 수 있음

**문제점**:

```typescript
// src/utils/logger.ts - API 키가 로그에 포함될 수 있음
logger.error('LLM call failed', {
  config: this.config,  // apiKey 포함 가능
});
```

**해결 방안**:

```typescript
// 1. 로거에 자동 필터링 추가
class Logger {
  private static SENSITIVE_KEYS = [
    'apiKey', 'token', 'password', 'secret', 'credential'
  ];

  private sanitizeContext(context: unknown): unknown {
    if (typeof context !== 'object' || context === null) return context;

    return Object.fromEntries(
      Object.entries(context).map(([key, value]) => {
        if (Logger.SENSITIVE_KEYS.some(k => key.toLowerCase().includes(k))) {
          return [key, '[REDACTED]'];
        }
        return [key, this.sanitizeContext(value)];
      })
    );
  }
}
```

**영향도**: 높음 - 보안 취약점
**예상 작업량**: 1일

---

## 3. P1 - 중요 개선

> 단기 내 해결 권장

### 3.1 TaskOrchestrator 분해

**현황**:
- 730줄의 대형 클래스
- 상태 관리, 큐 관리, 이벤트 발행, 실행 조율 모두 포함

**문제점**:
- 단일 책임 원칙(SRP) 위반
- 테스트 어려움
- 변경 시 영향 범위 큼

**해결 방안**:

```
현재:
TaskOrchestrator (730줄)
  └── 모든 로직

개선 후:
TaskOrchestrator (200줄) - 조율만
  ├── TaskStateManager (150줄) - 상태 전이
  ├── TaskExecutionService (200줄) - 실행 로직
  ├── TaskEventEmitter (100줄) - 이벤트 발행
  └── PerChannelQueue (기존) - 큐 관리
```

```typescript
// 분리된 구조 예시
class TaskOrchestrator {
  constructor(
    private stateManager: TaskStateManager,
    private executionService: TaskExecutionService,
    private eventEmitter: TaskEventEmitter,
    private queue: PerChannelQueue<Task>
  ) {}

  async createTask(params: CreateTaskParams): Promise<TaskResponse> {
    const task = this.stateManager.create(params);
    this.queue.enqueue(task.channelSessionId, task);
    this.eventEmitter.emit('taskCreated', task);
    return { taskId: task.id, state: task.state };
  }
}
```

**영향도**: 중간 - 유지보수성 개선
**예상 작업량**: 3-4일

---

### 3.2 의존성 주입 개선

**현황**:
- 생성자에 `deps?` 옵션으로 주입
- 주입되지 않으면 `null`로 설정 후 런타임 체크

**문제 코드**:

```typescript
// src/orchestrator/TaskOrchestrator.ts
constructor(systemConfig, config?, deps?) {
  this.executor = deps?.executor ?? null;
  // ...
}

async processTask(task: Task) {
  if (!this.executor) {
    throw new Error('Executor not configured');
  }
  // 모든 메서드에서 반복되는 null 체크
}
```

**해결 방안**:

```typescript
// 옵션 1: 필수 의존성으로 변경
constructor(
  private executor: Executor,
  private sessionManager: SessionManager,
  // ...
) {}

// 옵션 2: 간단한 DI 컨테이너
// src/di/container.ts
class Container {
  private instances = new Map<string, unknown>();

  register<T>(token: string, instance: T): void {
    this.instances.set(token, instance);
  }

  resolve<T>(token: string): T {
    const instance = this.instances.get(token);
    if (!instance) throw new Error(`Dependency not found: ${token}`);
    return instance as T;
  }
}

// 사용
const container = new Container();
container.register('executor', new Executor(...));
container.register('orchestrator', new TaskOrchestrator(
  container.resolve('executor'),
  // ...
));
```

**영향도**: 중간 - 코드 안정성 개선
**예상 작업량**: 2-3일

---

### 3.3 설정 검증 강화

**현황**:
- 설정 로드 시 검증 로직 미흡
- 잘못된 설정으로 런타임 에러 발생 가능

**문제점**:

```typescript
// src/config/index.ts - 검증 없이 JSON.parse
const config = JSON.parse(fs.readFileSync(filePath, "utf-8"));
return applyEnvironmentVariables(config);
// 필수 필드 누락, 타입 불일치 시 나중에 에러
```

**해결 방안**:

```typescript
// Zod 스키마로 검증
import { z } from 'zod';

const SystemConfigSchema = z.object({
  gateways: z.array(z.object({
    port: z.number().min(1024).max(65535),
    token: z.string().min(1),
  })).min(1),

  llm: z.object({
    provider: z.enum(['openai', 'glm']).optional(),
    apiKey: z.string().optional(),
    model: z.string().optional(),
  }).optional(),

  channels: z.array(z.object({
    type: z.enum(['discord', 'slack', 'telegram']),
    enabled: z.boolean(),
    token: z.string(),
  })).optional(),
});

export function loadConfig(path?: string): SystemConfig {
  const raw = JSON.parse(fs.readFileSync(path, 'utf-8'));
  const result = SystemConfigSchema.safeParse(raw);

  if (!result.success) {
    throw new ConfigValidationError(result.error.issues);
  }

  return applyEnvironmentVariables(result.data);
}
```

**영향도**: 중간 - 설정 오류 조기 발견
**예상 작업량**: 1-2일

---

### 3.4 API 문서화 (JSDoc)

**현황**:
- 대부분의 함수에 JSDoc 없음
- 타입만으로 의도 파악 어려움

**문제 예시**:

```typescript
// src/agents/executor.ts - 문서 없음
async execute(session: Session, toolkit: Toolkit): Promise<ExecutionResult> {
  // 무슨 일을 하는지? 어떤 조건에서 실패하는지?
}
```

**해결 방안**:

```typescript
/**
 * 세션의 마지막 메시지를 기반으로 계획을 수립하고 실행합니다.
 *
 * @param session - 대화 히스토리가 포함된 세션
 * @param toolkit - 사용 가능한 도구 모음
 * @returns 실행 결과 (성공/실패 여부, 메시지, 에러 정보)
 *
 * @throws {MoonBotError} LLM 계획 수립 실패 시 (code: LLM_UNAVAILABLE)
 * @throws {MoonBotError} 모든 복구 시도 실패 시 (code: RECOVERY_EXHAUSTED)
 *
 * @example
 * const result = await executor.execute(session, toolkit);
 * if (result.success) {
 *   console.log(result.messages);
 * } else {
 *   console.error(result.errors);
 * }
 */
async execute(session: Session, toolkit: Toolkit): Promise<ExecutionResult> {
  // ...
}
```

**영향도**: 낮음 - 개발자 경험 개선
**예상 작업량**: 3-5일 (점진적)

---

## 4. P2 - 권장 개선

> 품질 향상을 위한 개선

### 4.1 병렬 실행 지원

**현황**:
- 모든 Step이 순차 실행됨
- 독립적인 Step도 병렬화되지 않음

**문제 코드**:

```typescript
// src/agents/executor.ts
for (const step of plan.steps) {
  await this.executeStep(step, toolkit);  // 항상 순차
}
```

**해결 방안**:

```typescript
// 의존성 그래프 기반 병렬 실행
async execute(session: Session, toolkit: Toolkit): Promise<ExecutionResult> {
  const plan = await this.planner.plan(...);

  // 의존성 그래프 구축
  const graph = this.buildDependencyGraph(plan.steps);

  // 병렬 실행 가능한 그룹으로 분할
  const executionGroups = this.topologicalSort(graph);

  for (const group of executionGroups) {
    // 같은 그룹은 병렬 실행
    await Promise.all(
      group.map(step => this.executeStep(step, toolkit))
    );
  }
}

// 의존성 예시
// Step A: 파일 읽기 (의존성 없음)
// Step B: API 호출 (의존성 없음)
// Step C: A, B 결과 병합 (A, B에 의존)
//
// 실행: [A, B] 병렬 → [C] 순차
```

**영향도**: 중간 - 성능 개선
**예상 작업량**: 3-4일

---

### 4.2 메트릭 수집

**현황**:
- 성능/사용량 메트릭 수집 없음
- 문제 진단 시 로그만 의존

**해결 방안**:

```typescript
// src/metrics/collector.ts
interface Metrics {
  // 작업 관련
  tasksCreated: Counter;
  tasksCompleted: Counter;
  tasksFailed: Counter;
  taskDuration: Histogram;

  // LLM 관련
  llmCalls: Counter;
  llmLatency: Histogram;
  llmTokensUsed: Counter;

  // 도구 관련
  toolInvocations: Counter;
  toolLatency: Histogram;
  toolErrors: Counter;
}

class MetricsCollector {
  recordTaskCompletion(task: Task, duration: number): void {
    this.metrics.tasksCompleted.inc({ state: task.state });
    this.metrics.taskDuration.observe(duration);
  }
}

// CLI 명령으로 조회
// moonbot metrics --format json
```

**영향도**: 낮음 - 운영 가시성 개선
**예상 작업량**: 2-3일

---

### 4.3 캐싱 레이어

**현황**:
- 동일한 LLM 요청도 매번 API 호출
- 파일 읽기 결과 캐싱 없음

**해결 방안**:

```typescript
// src/cache/manager.ts
class CacheManager {
  private cache = new Map<string, { data: unknown; expiresAt: number }>();

  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlMs: number = 60000
  ): Promise<T> {
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data as T;
    }

    const data = await fetcher();
    this.cache.set(key, { data, expiresAt: Date.now() + ttlMs });
    return data;
  }
}

// LLM 응답 캐싱 (동일 프롬프트)
const planCacheKey = hashPrompt(systemPrompt + userMessage);
const plan = await cache.getOrFetch(
  `plan:${planCacheKey}`,
  () => this.llmClient.generatePlan(...),
  300000  // 5분
);
```

**영향도**: 중간 - 비용/성능 개선
**예상 작업량**: 2일

---

### 4.4 Graceful Shutdown

**현황**:
- 서버 종료 시 진행 중인 작업 처리 불명확
- 세션 데이터 손실 가능성

**해결 방안**:

```typescript
// src/gateway/server.ts
class GatewayServer {
  async shutdown(timeout: number = 30000): Promise<void> {
    this.logger.info('Shutdown initiated');

    // 1. 새 연결 거부
    this.acceptingConnections = false;

    // 2. 진행 중인 작업 완료 대기
    const runningTasks = this.orchestrator.getRunningTasks();
    if (runningTasks.length > 0) {
      this.logger.info(`Waiting for ${runningTasks.length} tasks to complete`);
      await Promise.race([
        this.orchestrator.waitForCompletion(),
        this.timeout(timeout),
      ]);
    }

    // 3. 세션 저장
    await this.sessionManager.saveAll();

    // 4. WebSocket 연결 종료
    this.wss.clients.forEach(client => {
      client.close(1001, 'Server shutting down');
    });

    // 5. 서버 종료
    this.wss.close();
    this.logger.info('Shutdown complete');
  }
}

// 시그널 핸들러
process.on('SIGTERM', () => server.shutdown());
process.on('SIGINT', () => server.shutdown());
```

**영향도**: 중간 - 안정성 개선
**예상 작업량**: 1-2일

---

## 5. P3 - 장기 개선

> 향후 고려할 개선 사항

### 5.1 플러그인 시스템

**현황**: 도구 추가 시 코드 수정 필요

**개선 방향**:
- 런타임에 도구 로드/언로드
- 도구 패키지 매니페스트 (`package.json` 확장)
- 버전 호환성 체크

### 5.2 멀티 에이전트 협업

**현황**: 단일 에이전트만 지원

**개선 방향**:
- 에이전트 간 메시지 패싱
- 작업 위임 (delegation)
- 공유 메모리/컨텍스트

### 5.3 스트리밍 응답

**현황**: 작업 완료 후 한 번에 응답

**개선 방향**:
- LLM 스트리밍 출력 실시간 전달
- 진행 상황 실시간 표시
- Server-Sent Events 또는 WebSocket 스트리밍

### 5.4 웹 대시보드

**현황**: CLI만 존재

**개선 방향**:
- React 기반 관리 대시보드
- 실시간 작업 모니터링
- 설정 GUI

---

## 6. 기술 부채 목록

### 코드 레벨

| 위치 | 이슈 | 우선순위 |
|------|------|----------|
| `src/orchestrator/TaskOrchestrator.ts` | 730줄 대형 클래스 | P1 |
| `src/agents/executor.ts:145` | `result?: unknown` 타입 사용 | P2 |
| `src/gateway/server.ts:147` | 하드코딩된 타임아웃 (30000) | P2 |
| `src/llm/LLMClient.ts:168` | 에러 메시지 한국어/영어 혼용 | P3 |
| `src/tools/runtime/ToolRuntime.ts:234` | `as never` 타입 캐스팅 | P2 |

### 테스트 부채

| 모듈 | 현재 커버리지 | 목표 |
|------|-------------|------|
| `orchestrator/` | ~70% | 90% |
| `agents/` | ~5% | 80% |
| `llm/` | 0% | 70% |
| `tools/runtime/` | ~30% | 80% |
| `gateway/` | ~40% | 70% |

### 문서 부채

| 문서 | 상태 | 필요 작업 |
|------|------|----------|
| API Reference | 없음 | JSDoc + TypeDoc 생성 |
| 아키텍처 다이어그램 | 텍스트만 | Mermaid/PlantUML 전환 |
| 설정 가이드 | 예제만 | 전체 옵션 문서화 |
| 트러블슈팅 가이드 | 없음 | 일반 오류 해결법 정리 |

---

## 부록: 개선 로드맵

```
Phase 1 (2주)
├── P0 테스트 커버리지
├── P0 에러 처리 표준화
└── P0 민감 정보 로깅 방지

Phase 2 (3주)
├── P1 TaskOrchestrator 분해
├── P1 의존성 주입 개선
└── P1 설정 검증 강화

Phase 3 (2주)
├── P1 API 문서화
├── P2 병렬 실행 지원
└── P2 Graceful Shutdown

Phase 4 (지속)
├── P2 메트릭 수집
├── P2 캐싱 레이어
└── P3 장기 개선 사항
```

---

*분석 일자: 2025-01*
*분석 도구: 코드 정적 분석, 아키텍처 리뷰*
