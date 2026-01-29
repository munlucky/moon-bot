---
name: moonshot-orchestrator-lite
description: PM 워크플로우 오케스트레이터 (Lite). Fork 없이 모든 에이전트를 직접 실행하는 경량 버전.
---

# PM 오케스트레이터 (Lite)

> **Note**: 이 버전은 fork 서브에이전트를 사용하지 않습니다. 모든 에이전트가 현재 세션에서 직접 실행됩니다.

## 역할
PM 분석 스킬들을 순차적으로 실행하고 최종 에이전트 체인을 구성하는 오케스트레이터.

## 입력
다음 정보를 자동으로 수집:
- `userMessage`: 사용자 요청
- `gitBranch`: 현재 브랜치
- `gitStatus`: Git 상태 (clean/dirty)
- `recentCommits`: 최근 커밋 목록
- `openFiles`: 열린 파일 목록

## 워크플로우

### 1. analysisContext 초기화
```yaml
schemaVersion: "1.0"
request:
  userMessage: "{userMessage}"
  taskType: unknown
  keywords: []
repo:
  gitBranch: "{gitBranch}"
  gitStatus: "{gitStatus}"
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
phase: unknown
complexity: unknown
missingInfo: []
decisions:
  recommendedAgents: []
  skillChain: []
  parallelGroups: []
artifacts:
  tasksRoot: "{PROJECT.md:documentPaths.tasksRoot}"
  contextDocPath: "{tasksRoot}/{feature-name}/context.md"
  verificationScript: .claude/agents/verification/verify-changes.sh
tokenBudget:
  specSummaryTrigger: 2000
  splitTrigger: 5
  contextMaxTokens: 8000
  warningThreshold: 0.8
projectMemory:
  projectId: null
  loaded: false
  boundaries: null
  relevantRules: []
notes: []
```

### 2. PM 스킬 순차 실행

#### 2.0 대형 명세서 처리

초기 작업 명세서(`request.userMessage`)가 매우 길 경우, 최종 계획/컨텍스트 문서가 출력 토큰 한도를 초과할 수 있음.

**2.0.1 명세서 크기 확인**
- `userMessage`의 단어 수 카운트
- `tokenBudget.specSummaryTrigger` (2000단어) 초과 시: 요약 트리거
- 독립 기능 수 > `tokenBudget.splitTrigger` (5개): 작업 분할 트리거

**2.0.2 명세서 요약**
1. 원본 명세서를 `{tasksRoot}/{feature-name}/archives/specification-full.md`에 저장
2. 핵심 요소만 추출
3. 요약본을 `{tasksRoot}/{feature-name}/specification.md`에 작성

**2.0.3 서브태스크 분할**
단일 명세서가 여러 독립 영역을 포함할 경우 `subtasks/` 디렉토리로 분할.

#### 2.0.4 프로젝트 메모리 로드 (직접 실행)

**프로젝트 ID 결정**: `package.json` name → 디렉토리명 → git remote

**직접 실행** (fork 없음):
```
Task 도구: project-memory-agent (subagent_type: general-purpose)
Input: { projectId, changedFiles, taskType, userRequest }
```

에이전트가 프로젝트 메모리(`[ProjectID]::*`)를 검색하고 컨텍스트 반환:
```yaml
projectMemoryContext:
  projectId: "my-app"
  loaded: true
  boundaries:
    alwaysDo: [...]
    askFirst: [...]
    neverDo: [...]
  relevantRules: [...]
```

**에러 처리**:
- 메모리 없음: `loaded: false`, 계속 진행
- MCP 불가: 경고와 함께 진행

#### 2.1 작업 분류
`Skill` 도구를 사용하여 `/moonshot-classify-task` 실행

#### 2.2 복잡도 평가
`Skill` 도구를 사용하여 `/moonshot-evaluate-complexity` 실행

#### 2.3 불확실성 검출
`Skill` 도구를 사용하여 `/moonshot-detect-uncertainty` 실행

#### 2.4 불확실성 처리
`missingInfo`가 비어있지 않으면 `AskUserQuestion` 도구로 질문 생성.

#### 2.5 시퀀스 결정
`Skill` 도구를 사용하여 `/moonshot-decide-sequence` 실행

### 3. 에이전트 체인 실행

`decisions.skillChain`을 순서대로 실행:

**허용된 단계:**
- `pre-flight-check`: 사전 점검 스킬
- `project-memory-agent`: 프로젝트 메모리 로드 에이전트 (Task tool, 직접 실행)
- `requirements-analyzer`: 요구사항 분석 에이전트 (Task tool)
- `context-builder`: 컨텍스트 구축 에이전트 (Task tool)
- `codex-validate-plan`: Codex 계획 검증 스킬
- `implementation-runner`: 구현 에이전트 (Task tool)
- `completion-verifier`: 테스트 기반 완료 검증 스킬
- `codex-review-code`: Codex 코드 리뷰 스킬
- `project-memory-reviewer`: 프로젝트 메모리 규칙/스펙 위반 검증 에이전트 (Task tool, 직접 실행)
- `vercel-react-best-practices`: React/Next.js 성능 최적화 리뷰 스킬
- `security-reviewer`: 보안 취약점 검토 스킬
- `build-error-resolver`: 빌드/컴파일 에러 해결 스킬
- `verify-changes.sh`: 검증 스크립트 (Bash tool)
- `efficiency-tracker`: 효율성 추적 스킬
- `session-logger`: 세션 로깅 스킬

**실행 규칙:**
1. 각 단계를 순차적으로 실행
2. 스킬 단계는 `Skill` 도구 사용
3. 에이전트 단계는 `Task` 도구 사용 (subagent_type 매핑)
4. 스크립트 단계는 `Bash` 도구 사용
5. 병렬 그룹이 있으면 해당 그룹 내에서만 병렬 실행
6. 정의되지 않은 단계 발견 시 사용자에게 확인 요청 후 중단
7. **모든 에이전트/스킬은** `.claude/docs/guidelines/document-memory-policy.md` 준수

**에이전트 매핑:**
- `project-memory-agent` → `subagent_type: "general-purpose"` + 프롬프트 (직접 실행)
- `requirements-analyzer` → `subagent_type: "general-purpose"` + 프롬프트
- `context-builder` → `subagent_type: "context-builder"`
- `implementation-runner` → `subagent_type: "implementation-agent"`
- `project-memory-reviewer` → `subagent_type: "general-purpose"` + 프롬프트 (직접 실행)

### 3.1 동적 스킬 삽입 (Dynamic Skill Injection)

skillChain 실행 중 시그널 감지 시 스킬 동적 삽입:

| 시그널 | 조건 | 삽입 스킬 | 삽입 위치 |
|--------|------|----------|----------|
| `buildFailed` | Bash exit code ≠ 0 | build-error-resolver | 현재 단계 재시도 전 |
| `securityConcern` | 변경 파일에 `.env`, `auth`, `password`, `token` 포함 | security-reviewer | codex-review-code 후 |
| `reactProject` | `.tsx`/`.jsx` 파일 또는 React 키워드 | vercel-react-best-practices | codex-review-code 후 |

### 3.2 프로젝트 메모리 리뷰 (직접 실행)

`codex-review-code` 이후, `project-memory-reviewer`를 **직접 실행**:

```
Task 도구: project-memory-reviewer (subagent_type: general-purpose)
Input: { projectId, changedFiles, projectMemoryContext, diff }
```

**위반 보고서 수신:**
```yaml
memoryReviewResult:
  status: "passed" | "failed" | "needs_approval"
  violations: [...]     # NeverDo 위반
  needsApproval: [...]  # AskFirst 항목
  warnings: [...]       # 규약/스펙 경고
  reminders: [...]      # AlwaysDo 리마인더
```

**결과 처리:**
- `status: "failed"`: 실행 **중단**, 위반 사항 사용자에게 보고
- `status: "needs_approval"`: 진행 전 사용자 승인 요청
- `status: "passed"`: 다음 단계로 진행

### 3.3 Completion Verification Loop

implementation-runner 완료 후 `completion-verifier` 호출.
`allPassed: false` 시 retryCount < 2까지 재시도.

### 4. 결과 기록
최종 analysisContext를 `.claude/docs/moonshot-analysis.yaml`에 저장.

## 출력 형식

### 사용자에게 보여줄 요약 (Markdown)
```markdown
## PM 분석 결과

**작업 유형**: {taskType}
**복잡도**: {complexity}
**단계**: {phase}

### 실행 체인
1. {step1}
2. {step2}
...

### 추정치
- 파일 수: {estimatedFiles}개
- 라인 수: {estimatedLines}줄
- 예상 시간: {estimatedTime}
```

## 에러 처리

1. **스킬 실행 실패**: 에러 로그를 notes에 기록하고 사용자에게 보고
2. **미정의 단계**: 사용자에게 확인 요청
3. **질문 무한 루프**: 최대 3회 질문 제한
4. **토큰 한도 경고**: 계속하기 전에 아카이빙 및 요약

## 계약
- 이 스킬은 다른 PM 스킬들을 오케스트레이션만 하고 직접 분석하지 않음
- 모든 분석 로직은 개별 PM 스킬에 위임
- **Fork를 사용하지 않음** - 모든 에이전트가 현재 세션에서 직접 실행됨
- **문서 메모리 정책**: `.claude/docs/guidelines/document-memory-policy.md` 준수

## 참조
- `.claude/docs/guidelines/document-memory-policy.md`
