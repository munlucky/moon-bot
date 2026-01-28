# 글로벌 개발 지침

> 이 문서는 전역 규칙 문서입니다. 프로젝트별 규칙은 `.claude/PROJECT.md`, 에이전트 canonical format은 `.claude/AGENT.md`를 참고하세요.

## 개요

이 문서는 `.claude/rules/`에 저장된 모듈식 규칙을 사용합니다. 모든 규칙은 자동으로 로드됩니다.

## 핵심 규칙

- @.claude/rules/basic-principles.md
- @.claude/rules/workflow.md
- @.claude/rules/context-management.md
- @.claude/rules/quality.md
- @.claude/rules/communication.md
- @.claude/rules/output-format.md
- @.claude/rules/security.md
- @.claude/rules/coding-style.md
- @.claude/rules/testing.md

## 경로별 규칙

- @.claude/rules/skills/skill-definition.md
- @.claude/rules/agents/agent-definition.md
- @.claude/rules/agents/agent-delegation.md
- @.claude/rules/docs/documentation.md

## 문서 메모리 정책

> **중요**: 64k token limit 오류를 방지하려면 `.claude/docs/guidelines/document-memory-policy.md`를 따르세요.

**기본 문서 경로** (필요 시 PROJECT.md에서 override):
```yaml
documentPaths:
  tasksRoot: ".claude/docs/tasks"       # DEFAULT (often gitignored)
  # tasksRoot: "docs/claude-tasks"      # Use this for git-tracked projects
  agreementsRoot: ".claude/docs/agreements"
  guidelinesRoot: ".claude/docs/guidelines"
```

**토큰 제한(필수 준수):**
| 문서 | 최대 토큰 | 초과 시 조치 |
|----------|-----------|------------------|
| context.md | 8,000 | 이전 버전 아카이브 |
| specification.md | 2,000 | 요약 후 전체를 archives/로 이동 |
| Review outputs | 4,000 | 전체를 archives/에 저장하고 context.md에는 요약만 |

**트리거:**
- Spec > 2,000 words -> 요약 + 원본 아카이브
- Independent features > 5 -> 하위 태스크로 분리
- Plan/review loop -> 섹션 교체, append 금지

## 품질/검증
## 참고

- 프로젝트별 규칙: @.claude/PROJECT.md
- 에이전트 포맷: @.claude/AGENT.md
