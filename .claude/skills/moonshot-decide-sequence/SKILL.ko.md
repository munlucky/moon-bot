---
name: moonshot-decide-sequence
description: `analysisContext`(작업 유형, 복잡도, 시그널)를 기준으로 단계(`phase`)와 실행 체인을 결정한다. 불확실성 검출 후 체인 구성 시 사용.
context: fork
---

# PM 시퀀스 결정

## 공유 스키마 (analysisContext.v1)
```yaml
schemaVersion: "1.0"
request:
  userMessage: "..."
  taskType: feature|modification|bugfix|refactor|unknown
  keywords: []
repo:
  gitBranch: "..."
  gitStatus: clean|dirty
  openFiles: []
  changedFiles: []
signals:
  hasContextMd: false
  hasPendingQuestions: false
  requirementsClear: false
  implementationReady: false
  implementationComplete: false
  hasMockImplementation: false
  apiSpecConfirmed: false
  reactProject: false
estimates:
  estimatedFiles: 0
  estimatedLines: 0
  estimatedTime: unknown
phase: planning|implementation|integration|verification|unknown
complexity: simple|medium|complex|unknown
missingInfo: []
decisions:
  recommendedAgents: []
  skillChain: []
  parallelGroups: []
artifacts:
  contextDocPath: {tasksRoot}/{feature-name}/context.md
  verificationScript: .claude/agents/verification/verify-changes.sh
notes: []
```

## 단계(Phase) 규칙
1. hasPendingQuestions == true -> planning
2. implementationComplete == true && (complexity == complex 또는 (apiSpecConfirmed && hasMockImplementation)) -> integration
3. implementationComplete == true -> verification
4. requirementsClear && hasContextMd && implementationReady -> implementation
5. 그 외 -> planning

## 체인 규칙
skillChain에는 **moonshot-decide-sequence 이후** 실행할 단계만 포함한다(moonshot-* 스킬은 포함하지 않음).

- simple: implementation-runner -> verify-changes.sh
- medium: requirements-analyzer -> project-memory-check -> implementation-runner -> completion-verifier -> codex-review-code -> efficiency-tracker
- complex: pre-flight-check -> requirements-analyzer -> context-builder -> codex-validate-plan -> project-memory-check -> implementation-runner -> completion-verifier -> codex-review-code -> efficiency-tracker -> session-logger

**참고**: `project-memory-check`는 계획 완료 후, 구현 시작 전에 실행되어 경계 준수 여부를 확인한다.

complex는 항상 테스트 기반 완료 검증을 포함한다.

**테스팅 연동** (참조: `.claude/rules/testing.md`):
- medium/complex 체인은 구현 후 `completion-verifier` 포함
- 커버리지 < 80% 시 추가 테스트 요청
- API 변경 시 통합 테스트 필수

**보안 및 빌드 에러 연동**:
- `security-reviewer`: 보안 우려 감지 시 트리거 (인증 변경, env 파일 수정, 새 의존성)
- `build-error-resolver`: `tsc`/`build` 실패 시 트리거, 다음 구현 단계 전에 삽입

## 병렬 실행 가이드
의존성이 없는 단계만 병렬로 실행한다. 결과가 다음 단계에 영향을 주면 병렬 금지.

**가능한 병렬 조합 예시**:
- `/moonshot-classify-task` 이후: `/moonshot-evaluate-complexity` + `/moonshot-detect-uncertainty`
- 구현 완료 후: `codex-review-code` + `verify-changes.sh` (리뷰 수정 시 `verify-changes.sh` 재실행)
- 로깅: `efficiency-tracker` + `session-logger`

**병렬 금지 예시**:
- `requirements-analyzer` ↔ `context-builder` (요구사항 선행 필요)
- `codex-validate-plan` ↔ `implementation-runner` (계획 검증 후 구현)

## 출력 (patch)
```yaml
phase: planning
decisions.skillChain:
  - pre-flight-check
  - requirements-analyzer
  - context-builder
decisions.parallelGroups:
  - - moonshot-evaluate-complexity
    - moonshot-detect-uncertainty
decisions.recommendedAgents:
  - requirements-analyzer
  - context-builder
notes:
  - "phase=planning, chain=complex"
```
