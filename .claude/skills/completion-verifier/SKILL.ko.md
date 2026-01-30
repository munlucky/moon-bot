---
name: completion-verifier
description: Acceptance 테스트를 실행하여 구현 완료를 검증하고, 실패 시 재시도 루프를 트리거합니다.
context: fork
---

# Completion Verifier 스킬

## 사용 시점

- 각 구현 Phase 완료 후
- 작업 완료 전 최종 확인
- 재시도 루프 트리거 시

## 입력

- context.md 경로 (Acceptance Tests 섹션 포함)
- 테스트 프레임워크 (PROJECT.md에서: jest/vitest/playwright)

## 절차

1. context.md에서 Acceptance Tests 섹션 파싱
2. 테스트 ID 및 파일 경로 추출
3. 테스트 실행: `npm test -- --testPathPattern="{test files}"`
4. 결과 파싱 (테스트별 PASS/FAIL)
5. context.md 상태 컬럼 업데이트
6. 완료 상태 반환

## 출력

```yaml
completionStatus:
  total: 5
  passed: 4
  failed: 1
  allPassed: false
  failedTests:
    - id: T2
      type: Unit  # 또는 Integration
      file: ErrorHandler.test.tsx
      error: "Expected error message not shown"
  failedPhase: "Phase 1"  # 재시도 위치 결정
  recommendation: "ErrorHandler.tsx 수정 후 Phase 1 재실행"
```

## 재시도 로직

`allPassed: false` 시:

1. **실패 Phase 식별** (테스트 유형 기반):
   - Unit FAIL → Phase 1 (Mock 구현)
   - Integration FAIL → Phase 2 (API 연동)

2. **실패 Phase로 돌아가기** (테스트 재작성 X):
   - `failedTests` 정보를 implementation-agent에 전달
   - implementation-agent는 **코드만 수정** (테스트 재작성 금지)
   
3. **재시도 제한**:
   - Phase당 최대 2회 재시도
   - 2회 실패 후 → 사용자에게 개입 요청

## Skip Conditions

- 테스트 프레임워크 미설정 → 경고와 함께 Skip
- context.md에 Acceptance Tests 없음 → Skip
- testing.md의 Skip Conditions 적용 (레거시, 프로토타입 등)

## 도구 호출 예시

```bash
# 특정 테스트 실행
npm test -- --testPathPattern="batch.test|ErrorHandler.test"

# 커버리지 확인 (선택)
npm test -- --coverage --testPathPattern="..."
```

---

## 자체 점검 (Self-Audit) 패턴

> 구현 완료 후 context.md의 요구사항과 대조하여 충족 여부를 확인합니다.

### 목적

"AI 에이전트를 위한 좋은 스펙 작성법" 가이드에 따르면, AI가 자신의 작업을 스펙에 비추어 스스로 검증하도록 만드는 것이 강력한 패턴입니다. 이는 테스트 실행 전 단계에서 누락 사항을 잡아내는 데 도움이 됩니다.

### 트리거

- 각 구현 Phase 완료 후
- 테스트 실행 전

### 프롬프트 예시

작업 완료 시 다음을 확인하세요:

> "구현이 끝난 뒤, 결과를 context.md의 요구사항과 비교하고 
> 모든 항목이 충족되었는지 확인하세요. 
> 충족되지 않은 항목이 있다면 나열하세요."

### Self-Audit 출력 형식

```yaml
selfAuditResult:
  # 요구사항 충족 여부
  requirementsMet:
    - "[REQ-1] 사용자 조회 API ✅"
    - "[REQ-2] 에러 핸들링 ✅"
  requirementsNotMet:
    - "[REQ-3] 페이지네이션 ❌ (미구현)"
  
  # 3단계 경계 체크
  boundaryCheck:
    neverDoViolations: []          # 치명적 위반 (있으면 중단)
    askFirstItems: []              # 승인 필요 항목
    alwaysDoCompleted:             # 필수 수행 항목
      - "lint 실행"
      - "테스트 통과"
  
  # 종합 판단
  readyForTest: true | false
  blockers:                        # false인 경우 차단 이유
    - "REQ-3 미구현"
```

### 워크플로우 통합

```
Implementation Phase 완료
        ↓
[Self-Audit] context.md 요구사항 대조
        ↓
    readyForTest?
     ↓         ↓
   true      false
     ↓         ↓
테스트 실행   구현 보완 후 재시도
```

### 주의사항

- Self-Audit은 **보조 수단**이며, 실제 테스트를 대체하지 않습니다
- 요구사항 충족 여부는 주관적 판단이 포함될 수 있으므로, 테스트로 최종 검증합니다
- `neverDoViolations`가 있으면 즉시 중단하고 사용자에게 보고합니다

