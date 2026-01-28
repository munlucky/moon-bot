---
name: build-error-resolver
description: 빌드 및 컴파일 에러를 해결합니다. 빌드 실패 또는 타입 에러 발생 시 사용하세요.
context: fork
---

# 빌드 에러 해결 스킬

## 사용 시점

- `npm run build` / `tsc` 실패
- TypeScript 컴파일 에러
- 빌드를 막는 Lint 에러
- 모듈 해석 이슈

## 절차

1. 빌드 에러 출력 캡처
2. 에러 유형 분류
3. 영향받는 파일과 라인 위치 파악
4. 적절한 수정 적용
5. 빌드 통과 확인

## 에러 분류

### TypeScript 에러

| 에러 코드 | 설명 | 일반적인 수정 |
|-----------|------|---------------|
| TS2304 | 이름을 찾을 수 없음 | import 추가 또는 타입 선언 |
| TS2339 | 속성이 존재하지 않음 | 인터페이스에 추가 또는 옵셔널 체이닝 |
| TS2345 | 인수 타입 불일치 | 캐스트 또는 타입 정의 수정 |
| TS2322 | 타입 할당 불가 | 타입 호환성 확인 |
| TS7006 | 파라미터 암시적 any | 명시적 타입 어노테이션 추가 |

### 모듈 에러

| 에러 | 일반적인 수정 |
|------|---------------|
| Cannot find module | 패키지 설치 또는 경로 수정 |
| Module not found | tsconfig paths 확인 |
| Circular dependency | import 구조 재설계 |

### Lint 에러

| 분류 | 조치 |
|------|------|
| 포맷팅 | `prettier --write` 실행 |
| 미사용 변수 | 제거 또는 `_` 접두사 추가 |
| 누락된 deps | dependency 배열에 추가 |

## 출력 형식

```markdown
## 빌드 에러 해결

### 에러 요약
- 전체 에러: N개
- 수정됨: N개
- 남음: N개

### 수정된 이슈

1. **TS2339**: 'foo' 속성이 존재하지 않음
   - 파일: src/utils.ts:42
   - 수정: 옵셔널 체이닝 추가 `obj?.foo`

2. **TS2304**: 'UserType' 이름을 찾을 수 없음
   - 파일: src/types.ts:15
   - 수정: '@/types'에서 import 추가

### 검증
✅ `npm run build` 통과
✅ `tsc --noEmit` 통과
```

## 위임 형식 (Codex용)

```
TASK: [프로젝트 경로]의 빌드 에러를 해결합니다.

EXPECTED OUTCOME: 모든 빌드 에러 수정, 빌드 통과.

CONTEXT:
- 에러 출력: [에러 로그 붙여넣기]
- 빌드 명령어: [npm run build / tsc]
- 영향받는 파일: [목록]

MUST DO:
- 모든 TypeScript 에러 수정
- 기존 기능 유지
- 각 수정 후 검증 실행

MUST NOT DO:
- 꼭 필요한 경우 외 @ts-ignore 추가 금지
- 관련 없는 코드 변경 금지
- 검증 단계 생략 금지
```
