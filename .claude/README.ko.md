# Moonshot 워크플로우 가이드

> 이 문서는 현재 저장소의 Moonshot 워크플로우 구성요소를 설명합니다. 프로젝트별 규칙은 `.claude/PROJECT.md`를 참고하세요.

## 진입점

- 전역 규칙: `.claude/CLAUDE.md` (필요 시 `@` import로 추가 규칙 로드)
- 모듈식 규칙: `.claude/rules/`
- 프로젝트 규칙: `.claude/PROJECT.md`
- 에이전트 포맷: `.claude/AGENT.md`
- 오케스트레이터 스킬: `.claude/skills/moonshot-orchestrator/SKILL.md`

## 메모리 구조와 우선순위

Claude Code는 아래 순서로 메모리를 로드합니다(상위가 기본 규칙, 하위가 더 구체적인 규칙).

| 메모리 유형 | 위치 | 용도 | 공유 범위 |
| --- | --- | --- | --- |
| Enterprise policy | macOS: `/Library/Application Support/ClaudeCode/CLAUDE.md`<br />Linux: `/etc/claude-code/CLAUDE.md`<br />Windows: `C:\Program Files\ClaudeCode\CLAUDE.md` | 조직 공통 규칙 | 조직 전체 |
| Project memory | `./CLAUDE.md` 또는 `./.claude/CLAUDE.md` | 프로젝트 공통 규칙 | 팀 공유 |
| Project rules | `./.claude/rules/*.md` | 모듈식 프로젝트 규칙 | 팀 공유 |
| User memory | `~/.claude/CLAUDE.md` | 개인 기본값 | 개인 |
| Project memory (local) | `./CLAUDE.local.md` | 개인 프로젝트 선호 설정 | 개인 |

- `CLAUDE.local.md`는 자동으로 `.gitignore`에 추가됩니다.

## 메모리 로딩/편집 방식

- 실행 시 cwd에서 상위 디렉토리로 올라가며 `CLAUDE.md`/`CLAUDE.local.md`를 재귀 로드합니다.
- 하위 디렉토리의 `CLAUDE.md`는 해당 경로의 파일을 읽을 때만 로드됩니다.
- `/memory`로 로딩된 메모리 확인/편집, `/init`으로 기본 `CLAUDE.md` 생성이 가능합니다.

## CLAUDE.md imports

`@path/to/import` 문법으로 추가 파일을 불러올 수 있습니다.

```
See @README for project overview and @package.json for npm commands.

# Additional Instructions
- git workflow @docs/git-instructions.md
```

- 상대/절대 경로 모두 지원합니다(예: `@~/.claude/my-project-instructions.md`).
- 코드 스팬/코드 블록 안의 `@`는 import로 처리되지 않습니다.
- import 깊이는 최대 5단계입니다.

## 모듈식 규칙 (rules/)

`.claude/rules/` 하위의 모든 `.md` 파일이 자동으로 로드됩니다(하위 디렉토리 포함).

- `~/.claude/rules/`는 사용자 규칙으로 먼저 로드됩니다.
- 필요하면 심볼릭 링크로 규칙을 공유할 수 있습니다.

- `basic-principles.md`: 기본 원칙
- `workflow.md`: 작업 실행 방식
- `context-management.md`: 컨텍스트 관리
- `quality.md`: 검증/품질
- `communication.md`: 커뮤니케이션
- `output-format.md`: 출력 형식

### Path-specific rules

- `rules/skills/skill-definition.md`: 스킬 정의 규칙 (`.claude/skills/**/*.md`)
- `rules/agents/agent-definition.md`: 에이전트 정의 규칙 (`.claude/agents/**/*.md`)
- `rules/docs/documentation.md`: 문서 규칙 (`.claude/docs/**/*.md`)
- `paths`는 표준 glob 패턴을 지원하며 여러 패턴을 지정할 수 있습니다.

## 에이전트

- Requirements Analyzer: `.claude/agents/requirements-analyzer.md`
- Context Builder: `.claude/agents/context-builder.md`
- Implementation Agent: `.claude/agents/implementation-agent.md`
- Verification Agent: `.claude/agents/verification-agent.md`
- Documentation Agent: `.claude/agents/documentation-agent.md`
- Design Spec Extractor: `.claude/agents/design-spec-extractor.md`
- 검증 스크립트: `.claude/agents/verification/verify-changes.sh`

## 스킬

### Moonshot 분석
- `moonshot-classify-task`
- `moonshot-evaluate-complexity`
- `moonshot-detect-uncertainty`
- `moonshot-decide-sequence`

### 실행 및 검증
- `pre-flight-check`
- `implementation-runner`
- `completion-verifier` (신규)
- `codex-validate-plan`
- `codex-review-code`

### 문서 및 로깅
- `session-logger`
- `efficiency-tracker`

### 유틸리티
- `design-asset-parser`
- `project-md-refresh`
- `security-reviewer`
- `build-error-resolver`

## 일반 흐름 (예시)

1. `moonshot-orchestrator`가 요청을 분석하고 체인을 구성합니다.
2. `requirements-analyzer`와 `context-builder`가 계획을 정리합니다.
3. 복잡한 작업은 `codex-validate-plan`으로 계획을 검증한 뒤 `implementation-runner`를 실행합니다.
4. `verification-agent`와 `verify-changes.sh`로 품질을 확인합니다.
5. `documentation-agent`가 문서화를 마무리하고 필요 시 `doc-sync`를 호출합니다.

## 문서와 템플릿

- 작업 문서는 `.claude/docs` 하위에 두며 경로 규칙은 `.claude/PROJECT.md`를 따릅니다.
- 출력 템플릿: `.claude/templates/moonshot-output.md`, `.claude/templates/moonshot-output.ko.md`, `.claude/templates/moonshot-output.yaml`.

## 유지보수 노트 (이 저장소)

- 영문 `.md`는 ASCII만 사용하고 동일한 `.ko.md`를 함께 유지합니다.
- 이름이나 경로를 바꾸면 이 문서와 `install-claude.sh`를 함께 갱신합니다.
- 대상 프로젝트에 `PROJECT.md`가 없다면 `project-md-refresh` 스킬을 실행합니다.
