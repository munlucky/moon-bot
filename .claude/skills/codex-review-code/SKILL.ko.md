---
name: codex-review-code
description: claude-delegator(Code Reviewer 전문가)를 통해 구현 품질과 회귀 위험을 검토합니다. 복잡한 작업, 리팩터링, API 변경 후 사용하세요.
context: fork
---

# Codex 코드 리뷰 (claude-delegator 사용)

## 사용 시점
- 복잡한 작업 구현 후
- 리팩터링 작업
- API 변경
- 중요한 변경사항 병합 전

## 절차

### 1단계: MCP 가용성 확인 (필수 - 최우선 수행)
리뷰 작업 전, Codex MCP 사용 가능 여부를 먼저 확인합니다:

```typescript
// 간단한 MCP 호출로 가용성 확인
try {
  mcp__codex__codex({
    prompt: "ping",
    sandbox: "read-only",
    cwd: process.cwd()
  })
  // 성공하면 MCP 사용 가능
} catch (error) {
  // MCP 사용 불가 - Claude 폴백으로 진행
}
```

**MCP 사용 불가 조건:**
- 도구를 찾을 수 없음 / 등록되지 않음
- "quota exceeded", "rate limit", "API error", "unavailable"
- 연결 타임아웃
- 모든 에러 응답

### 2-8단계: 리뷰 프로세스

2. 변경 범위, 변경된 파일, 핵심 동작 요약
3. context.md 경로를 캡처하고 관련 코드 읽기 (기본: `{tasksRoot}/{feature-name}/context.md`)
4. 아래 7-섹션 형식으로 위임 프롬프트 구성

5. **MCP 사용 가능한 경우 (1단계에서 확인)**:
   - `mcp__codex__codex` 호출 (developer-instructions에 Code Reviewer 지침 포함)
   - 성공 시 7단계로 진행

6. **MCP 사용 불가한 경우 (1단계에서 확인)**:
   - Claude가 아래 Code Reviewer 지침에 따라 직접 코드 리뷰 수행
   - 노트 추가: `"codex-fallback: Claude가 직접 리뷰 수행 (MCP 사용 불가)"`
   - 동일한 MUST DO / MUST NOT DO 기준 따르기

7. 중대 이슈, 경고, 제안사항 기록
8. **`.claude/docs/guidelines/document-memory-policy.md` 참조**: 전체 리뷰는 `archives/review-v{n}.md`에 보관하고 `context.md`에는 짧은 요약만 남김

## 위임 형식

7-섹션 형식 사용:

```
TASK: [context.md 경로]의 구현을 [집중 영역: 정확성, 보안, 성능, 유지보수성]에 대해 검토합니다.

EXPECTED OUTCOME: 판정 및 권장사항이 포함된 이슈 목록.

CONTEXT:
- 검토할 코드: [파일 경로 또는 스니펫]
- 목적: [이 코드가 하는 일]
- 최근 변경사항:
  * [변경된 파일 목록]
  * [핵심 동작 요약]
- 기능 요약: [간략한 설명]

CONSTRAINTS:
- 프로젝트 규칙: [따라야 할 기존 패턴]
- 기술 스택: [언어, 프레임워크]

MUST DO:
- 우선순위: 정확성 → 보안 → 성능 → 유지보수성
- **보안 체크 (CRITICAL)**:
  * 하드코딩된 자격증명 (API 키, 비밀번호, 토큰)
  * SQL 인젝션 위험 (쿼리 문자열 결합)
  * XSS 취약점 (이스케이프되지 않은 사용자 입력)
  * 입력 검증 누락
- **코드 품질 (HIGH)**:
  * 긴 함수 (>50줄)
  * 긴 파일 (>800줄)
  * 깊은 중첩 (>4단계)
  * 누락된 에러 처리 (try/catch)
  * console.log 문
- **React/Next.js 성능 (CRITICAL)** [signals.reactProject일 때]:
  * 순차 await 대신 Promise.all() (워터폴 패턴)
  * 배럴 파일 import (`import { X } from 'lib'` → 직접 import)
  * 무거운 컴포넌트의 dynamic import 누락
  * RSC 직렬화: 필요한 필드 대신 전체 객체 전달
  * async 컴포넌트의 Suspense 경계 누락
  Reference: `.claude/skills/vercel-react-best-practices/SKILL.md`
- 중요한 이슈에 집중, 스타일 세부사항 지적하지 않기
- 로직/흐름 오류 및 엣지 케이스 확인
- 타입 안전성 및 오류 처리 검증
- API 계약 및 데이터 모델 일관성 확인

MUST NOT DO:
- 스타일 세부사항 지적 (포매터가 처리)
- 발생 가능성 낮은 이론적 우려사항 지적
- 수정된 파일 범위 외 변경 제안

OUTPUT FORMAT:
요약 → 중대 이슈 → 경고 → 권장사항 → 판정 (APPROVE/REJECT)

## 승인 기준

- ✅ **APPROVE**: CRITICAL/HIGH 이슈 없음
- ⚠️ **WARNING**: MEDIUM 이슈만 (주의하며 머지 가능)
- ❌ **REJECT**: CRITICAL/HIGH 이슈 발견
```

## 도구 호출 (MCP 사용 가능 시)

```typescript
mcp__codex__codex({
  prompt: "[전체 컨텍스트가 포함된 7-섹션 위임 프롬프트]",
  "developer-instructions": "[code-reviewer.md의 내용]",
  sandbox: "read-only",  // Advisory 모드 - 검토만
  cwd: "[현재 작업 디렉터리]"
})
```

## Claude 폴백 (MCP 사용 불가 시)

MCP를 사용할 수 없을 때, Claude가 직접 리뷰를 수행합니다:

1. 동일한 7-섹션 형식을 자체 리뷰 체크리스트로 적용
2. 모든 MUST DO / MUST NOT DO 기준 준수
3. 동일한 형식으로 출력: 요약 → 중대 이슈 → 경고 → 권장사항 → 판정
4. 폴백 모드 사용 표시 노트 추가

## 구현 모드 (자동 수정)

전문가가 이슈를 자동으로 수정하도록 하려면:

```typescript
mcp__codex__codex({
  prompt: "[동일한 7-섹션 형식, 단 추가: '발견된 이슈를 수정하고 변경사항을 검증하세요']",
  "developer-instructions": "[code-reviewer.md의 내용]",
  sandbox: "workspace-write",  // 구현 모드 - 파일 수정 가능
  cwd: "[현재 작업 디렉터리]"
})
```

## 출력 (patch)
```yaml
notes:
  - "codex-review: [APPROVE/REJECT], critical=[개수], warnings=[개수]"
  # 폴백 사용 시:
  - "codex-fallback: Claude가 직접 리뷰 수행 (MCP 사용 불가)"
```

## Review-Fix Loop (자동 수정 모드)

### 워크플로우

1. **codex-review-code 실행**
2. **결과 분석:**
   - `APPROVE` → 다음 단계로
   - `REJECT (CRITICAL/HIGH 이슈)` → Auto-Fix Loop 진입
3. **Auto-Fix Loop:**
   - `sandbox: "workspace-write"`로 재호출
   - 수정 지시 포함
   - 수정 후 검증 실행
4. **반복 제한:** 최대 2회
5. **2회 실패 후:** 사용자 확인 요청

### 설정

```yaml
reviewFixLoop:
  enabled: true
  maxRetries: 2
  fixableIssues:
    - console.log 문
    - 누락된 에러 처리
    - 타입 에러
    - 단순 보안 이슈 (하드코딩된 문자열)
  nonFixableIssues:
    - 아키텍처 변경
    - 브레이킹 API 변경
    - 복잡한 보안 취약점
```

### Auto-Fix 프롬프트 추가

수정 모드 진입 시 프롬프트에 추가:
```
다음 이슈를 수정하고 변경사항을 검증하세요:
1. [리뷰에서 발견된 이슈 설명]
2. [리뷰에서 발견된 이슈 설명]

수정 후 검증을 실행하여 이슈가 해결되었는지 확인하세요.
```
