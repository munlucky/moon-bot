# Phase 4: Replanner Logic

## Overview
도구 실행 실패 시 자동으로 대체 도구를 선택하고 경로를 재계획하는 복원력 있는 에이전트 시스템을 구현합니다.

## Background
- **기존 Planner**: 1회 계획 수립
- **기존 Executor**: 순차 실행만 (실패 시 중단)
- **Replanner 필요**: 실패 후 자동 복구

## Requirements

### Functional Requirements
1. **실패 감지 (Failure Detection)**
   - ToolResult.ok === false
   - 타임아웃 (timeoutMs 초과)
   - 연결 실패 (network error)

2. **대체 도구 선택 (Alternative Selection)**
   - 동일 기능 도구 매핑
   - 우선순위 기반 선택
   - 사용자 확인 옵션

3. **경로 재계획 (Path Replanning)**
   - 실패 지점 이후 재계획
   - 종속성 재계산
   - 리소스 상태 고려

4. **복구 한도 (Recovery Limits)**
   - 최대 재시도 횟수 (기본 3회)
   - 최대 대체 도구 시도 (기본 2개)
   - 전체 타임아웃 (기본 10분)

### Non-Functional Requirements
- **신뢰성**: 무한 루프 방지
- **투명성**: 재계획 로그 상세 기록
- **제어**: 사용자 중단 기능

## Technical Architecture

### Replanner Components
```
┌─────────────────────────────────────────────────────────┐
│                   Executor (기존)                       │
│  - executeStep()                                        │
│  - handleToolFailure() → NEW                            │
└───────────────────────┬─────────────────────────────────┘
                        │ failure
                        ↓
┌─────────────────────────────────────────────────────────┐
│                   Replanner (NEW)                       │
├─────────────────────────────────────────────────────────┤
│  1. FailureAnalyzer                                     │
│     - classifyFailure()  → 네트워크/권한/타임아웃/기타   │
│  2. AlternativeSelector                                 │
│     - findAlternatives(tool) → 대체 도구 목록            │
│     - selectBest(alternatives) → 최선 선택               │
│  3. PathReplanner                                       │
│     - replanFrom(failedStep, remainingGoals)            │
│     - validateNewPath()                                 │
│  4. RecoveryLimiter                                     │
│     - canRetry() → 최대 횟수 체크                        │
│     - canUseAlternative() → 최대 대체 체크                │
└─────────────────────────────────────────────────────────┘
```

### Execution Flow
```
┌─────────────────────────────────────────────────────────────┐
│  1. Plan 생성 (Planner)                                     │
│     [Tool A] → [Tool B] → [Tool C]                          │
├─────────────────────────────────────────────────────────────┤
│  2. 실행 시작 (Executor)                                    │
│     [Tool A] ✓ → [Tool B] ✗ FAIL                           │
├─────────────────────────────────────────────────────────────┤
│  3. 실패 분석 (Replanner.FailureAnalyzer)                  │
│     Error: "Network timeout"                                │
│     Classification: NETWORK_FAILURE                         │
├─────────────────────────────────────────────────────────────┤
│  4. 대체 도구 탐색 (AlternativeSelector)                   │
│     Tool B alternatives: [Tool B2, Tool B3]                 │
│     Selected: Tool B2 (higher priority)                     │
├─────────────────────────────────────────────────────────────┤
│  5. 경로 재계획 (PathReplanner)                            │
│     New path: [Tool A] ✓ → [Tool B2] → [Tool C]            │
├─────────────────────────────────────────────────────────────┤
│  6. 복구 실행                                                │
│     [Tool B2] ✓ → [Tool C] ✓                               │
│     Result: SUCCESS (with alternative)                      │
└─────────────────────────────────────────────────────────────┘
```

## Alternative Tool Mapping

| 기능 | 주 도구 | 대체 도구 1 | 대체 도구 2 |
|------|---------|------------|------------|
| 웹 내용 읽기 | browser.goto | http.request | - |
| 파일 읽기 | fs.read | http.request (URL) | - |
| API 호출 | http.request | browser.goto | - |
| 명령 실행 | system.run | - | - (승인 필수) |
| 파일 쓰기 | fs.write | - | - |

## Implementation Plan

### Files to Create (6)
```
src/agents/
  └─ replanner.ts              # 메인 Replanner 클래스

src/agents/replanner/
  ├─ FailureAnalyzer.ts        # 실패 분류
  ├─ AlternativeSelector.ts    # 대체 도구 선택
  ├─ PathReplanner.ts          # 경로 재계획
  ├─ RecoveryLimiter.ts        # 복구 한도 관리
  └─ types.ts                  # Replanner 타입
```

### Files to Modify (3)
- `src/agents/executor.ts` - 실패 시 Replanner 호출
- `src/agents/planner.ts` - 재계획 로직 공유
- `src/tools/runtime/ToolRuntime.ts` - 재시도 카운터

## Acceptance Tests

### T1: 실패 감지 - 네트워크
- Given: http.request 타임아웃
- When: FailureAnalyzer.classifyFailure()
- Then: NETWORK_FAILURE 반환

### T2: 대체 도구 선택
- Given: browser.goto 실패
- When: AlternativeSelector.findAlternatives()
- Then: http.request 반환 (대체 가능)

### T3: 경로 재계획
- Given: Tool B 실패, 남은 목표 [C, D]
- When: PathReplanner.replanFrom(Tool B)
- Then: 새 경로 [B2, C, D] 반환

### T4: 복구 한도 - 최대 재시도
- Given: 같은 도구 3회 실패
- When: RecoveryLimiter.canRetry()
- Then: false 반환 (중단)

### T5: 복구 한도 - 대체 도구
- Given: 대체 도구 2개 시도 실패
- When: RecoveryLimiter.canUseAlternative()
- Then: false 반환 (중단)

### T6: 전체 플로우 - 성공
- Given: [A, B, C] 계획, B 실패
- When: Replanner 실행
- Then: [A, B2, C]로 복구 성공

### T7: 전체 플로우 - 실패 (복구 불가)
- Given: [A] 계획, 3회 재시도 실패
- When: Replanner 실행
- Then: RECOVERY_FAILED 에러 반환

## Configuration

```yaml
# ~/.moonbot/config.yaml
replanner:
  maxRetries: 3           # 같은 도구 최대 재시도
  maxAlternatives: 2      # 대체 도구 최대 시도
  globalTimeout: 600000   # 전체 작업 타임아웃 (10분)
  autoRetry: true         # 자동 재시도 (false면 사용자 확인)
  logRecovery: true       # 복구 로그 상세 기록
```

## Failure Classification

```typescript
enum FailureType {
  NETWORK_FAILURE = "NETWORK",        // 네트워크/타임아웃
  PERMISSION_DENIED = "PERMISSION",   // 권한/승인 거부
  INVALID_INPUT = "VALIDATION",       // 입력 검증 실패
  TOOL_NOT_FOUND = "NOT_FOUND",       // 도구 없음
  RESOURCE_EXHAUSTED = "RESOURCE",    // 리소스 고갈
  UNKNOWN = "UNKNOWN"                 // 기타
}

enum RecoveryAction {
  RETRY = "RETRY",                   // 같은 도구 재시도
  USE_ALTERNATIVE = "ALTERNATIVE",    // 대체 도구 사용
  REQUEST_APPROVAL = "APPROVAL",      // 사용자 승인 요청
  ABORT = "ABORT"                    // 중단
}
```

## Replanner Algorithm

```typescript
async replan(failure: ToolFailure, context: ExecutionContext): Promise<RecoveryPlan> {
  // 1. 복구 가능 확인
  if (!limiter.canRecover(failure)) {
    return { action: ABORT, reason: "Max recovery attempts exceeded" };
  }

  // 2. 실패 분류
  const type = analyzer.classifyFailure(failure);

  // 3. 복구 액션 결정
  const action = selectRecoveryAction(type, failure);

  // 4. 액션 실행
  switch (action) {
    case RETRY:
      return { action: RETRY, tool: failure.tool };
    case USE_ALTERNATIVE:
      const alt = selector.selectBest(alternatives);
      return { action: USE_ALTERNATIVE, tool: alt };
    case REQUEST_APPROVAL:
      return { action: REQUEST_APPROVAL, message: "User intervention needed" };
    default:
      return { action: ABORT, reason: "No recovery possible" };
  }
}
```

## Integration Points

1. **Executor.executeStep()**
   - 실패 시 `Replanner.replan()` 호출
   - 복구 플랜에 따라 재시도/대체/중단

2. **Planner**
   - `replanFrom(step, goals)` 공유 로직
   - 기존 계획 구조 재사용

3. **Session**
   - 복구 이벤트 기록
   - 최종 결과에 복구 히스토리 포함

## Security Considerations

- 무한 루프 방지: RecoveryLimiter 필수
- 대체 도구 권한 확인 (승인 필요 도구)
- 복구 로그에 민감 정보 포함 금지

## Open Questions

| 질문 | 상태 |
|------|------|
| 대체 도구 매핑 확장 방식 | pending |
| 사용자 승인 요청 UI 연동 | pending |
| 복구 성공 메트릭 정의 | pending |

## References
- Phase 1 context: `../phase1-gateway-tools/context.md`
- PRD: `local_ai_agent_prd.md` (Replanner Requirements)
- Spec: `agent_system_spec.md` (Agent Architecture)
