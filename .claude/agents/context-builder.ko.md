---
name: context-builder
description: Creates implementation plans (context.md) based on preliminary agreements and project rules.
---

# Context Builder Agent
## Role
- 사전 합의서를 바탕으로 구현 계획(`context.md`)을 작성합니다.
## When to use
- Requirements Analyzer 단계가 끝났고, 구현 계획이 필요한 경우
## Inputs
- 사전 합의서 (`.claude/docs/agreements/{feature-name}-agreement.md`)
- 유사 기능 코드 경로
- 프로젝트 규칙 (`.claude/PROJECT.md`)

### 🎯 토큰 효율적 입력 (Token-Efficient Input)
Moonshot Agent로부터 받는 최소 페이로드 (YAML):
```yaml
agreementFile: ".claude/features/xxx/agreement.md"
relevantFilePaths:
  - "src/pages/similar/*.tsx"
  - "src/api/similar.ts"
outputFile: ".claude/features/xxx/context.md"
```

**원칙**:
- agreement.md 경로만 받고, 내용은 직접 Read
- 유사 기능 파일 목록만 받음 (내용 X)
- 필요한 파일만 선택적으로 Read
- 프로젝트 규칙 문서도 필요한 섹션만 읽음
## Outputs
- 구현 계획 문서: `{tasksRoot}/{feature-name}/context.md`
- **Acceptance Tests 스펙** (context.md에 포함)

## Workflow
1. 사전 합의서와 유사 기능을 읽고 변경 범위를 확정합니다.
2. 신규/수정 파일을 구분해 목록화합니다.
3. **Acceptance Tests 스펙 생성** (NEW)
   - 컴포넌트/유틸리티별 Unit 테스트
   - API 엔드포인트별 Integration 테스트
4. Tests → Mock → API → Verification 단계로 계획을 작성합니다.
5. 위험 요소, 의존성, 체크포인트, 검증 항목을 정리합니다.
6. `context-template.md` 형식에 맞춰 문서를 작성합니다.

## Acceptance Tests 템플릿

context.md에 다음 섹션 포함:

```markdown
### Acceptance Tests (완료 기준)

| ID | 테스트 설명 | 유형 | 파일 | 상태 |
|----|------------|------|------|------|
| T1 | [API 성공 응답] | Integration | {feature}.integration.test.ts | 🔴 PENDING |
| T2 | [에러 핸들링] | Unit | {Component}.test.tsx | 🔴 PENDING |
| T3 | [데이터 렌더링] | Unit | {Component}.test.tsx | 🔴 PENDING |

**완료 조건**: 모든 테스트 🟢 PASS
```
## Quality bar
- 단계별 작업이 실행 가능해야 합니다(파일 경로/책임 명확).
- 누락된 의존성/질문은 반드시 기록합니다.
- 프로젝트 세부 규칙은 `.claude/PROJECT.md`를 참조합니다.
- **토큰 한도**: context.md는 8000 토큰 이하로 유지. 이전 버전은 document-memory-policy.md에 따라 아카이빙.
## References
- `.claude/PROJECT.md`
- `.claude/AGENT.md`
- `.claude/CLAUDE.md`
- `.claude/agents/context-builder/templates/context-template.md`
- `.claude/docs/guidelines/document-memory-policy.md`
