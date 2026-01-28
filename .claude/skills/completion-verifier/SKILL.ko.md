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
