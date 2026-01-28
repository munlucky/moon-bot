---
name: moonshot-orchestrator
description: PM 워크플로우 오케스트레이터. 사용자 요청을 분석하고 최적의 에이전트 체인을 자동으로 실행한다.
---

# PM 오케스트레이터

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
  reactProject: false  # React/Next.js 프로젝트 감지
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
  tasksRoot: "{PROJECT.md:documentPaths.tasksRoot}"  # 기본값: .claude/docs/tasks
  contextDocPath: "{tasksRoot}/{feature-name}/context.md"
  verificationScript: .claude/agents/verification/verify-changes.sh
tokenBudget:
  specSummaryTrigger: 2000     # 단어 수
  splitTrigger: 5              # 독립 기능 수
  contextMaxTokens: 8000
  warningThreshold: 0.8
projectMemory:
  projectId: null
  boundaryStatus: "not_checked"  # not_checked|ok|violation|needs_approval|not_initialized
  boundary:
    violations: []
    needsApproval: []
    reminders: []
  relatedConventions: []
  lastChecked: null
notes: []
```

### 2. PM 스킬 순차 실행

#### 2.0 대형 명세서 처리

초기 작업 명세서(`request.userMessage`)가 매우 길 경우, 최종 계획/컨텍스트 문서가 출력 토큰 한도를 초과할 수 있음. `.claude/docs/guidelines/document-memory-policy.md` 참조:

**2.0.1 명세서 크기 확인**
- `userMessage`의 단어 수 카운트
- `tokenBudget.specSummaryTrigger` (2000단어) 초과 시: 요약 트리거
- 독립 기능 수 > `tokenBudget.splitTrigger` (5개): 작업 분할 트리거

**2.0.2 명세서 요약**
1. 원본 명세서를 `{tasksRoot}/{feature-name}/archives/specification-full.md`에 저장
2. 핵심 요소만 추출:
   - 핵심 요구사항 (최대 5개)
   - 제약조건
   - 수용기준
3. 요약본을 `{tasksRoot}/{feature-name}/specification.md`에 작성
4. 요약에 원본 링크 포함

**2.0.3 서브태스크 분할**
단일 명세서가 여러 독립 영역을 포함할 경우:
1. `subtasks/` 디렉토리 생성
2. 각 서브태스크에 대해 `subtasks/subtask-NN/` 생성 (독립 `context.md` 포함)
3. 각 서브태스크는 독립 `analysisContext`로 이 워크플로우 실행
4. 마스터 `context.md`에는 다음만 포함:
   - 서브태스크 목록과 링크
   - 통합 지점
   - 공유 제약조건

**2.0.4 context.md 크기 제한**
- 요약된 명세서만 포함
- 현재 계획만 유지 (히스토리 없음)
- 이전 버전은 document-memory-policy.md에 따라 아카이빙

#### 2.0.5 프로젝트 메모리 로드 (Fork)
**중요**: 컨텍스트 오염 방지를 위해 `project-memory-agent`를 **fork 서브에이전트**로 실행.

1. **프로젝트 ID 결정**:
   - 우선순위: `package.json` name → 디렉토리명 → git remote

2. **fork 실행**:
   ```
   Task 도구: project-memory-agent (subagent_type: general-purpose)
   Input: { projectId, changedFiles, taskType, userRequest }
   ```

3. **요약된 컨텍스트 수신**:
   fork 에이전트가 프로젝트 메모리(`[ProjectID]::*`)를 검색하고 요약만 반환:
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

4. **analysisContext에 병합**:
   ```yaml
   projectMemory:
     ...projectMemoryContext
     lastChecked: "{timestamp}"
     boundaryStatus: "ok"
   ```

5. **에러 처리**:
   - 메모리 없음: `boundaryStatus: "not_initialized"`, 계속 진행
   - MCP 불가: `boundaryStatus: "not_checked"`, 경고와 함께 진행

#### 2.1 작업 분류
`Skill` 도구를 사용하여 `/moonshot-classify-task` 실행
- 반환된 patch를 analysisContext에 병합
- 예: `request.taskType`, `request.keywords`, `notes` 추가

#### 2.2 복잡도 평가
`Skill` 도구를 사용하여 `/moonshot-evaluate-complexity` 실행
- 반환된 patch를 analysisContext에 병합
- 예: `complexity`, `estimates.*` 업데이트

#### 2.3 불확실성 검출
`Skill` 도구를 사용하여 `/moonshot-detect-uncertainty` 실행
- 반환된 patch를 analysisContext에 병합
- `missingInfo` 배열 확인

#### 2.4 불확실성 처리
`missingInfo`가 비어있지 않으면:
1. `AskUserQuestion` 도구로 질문 생성
   - `missingInfo`의 각 항목을 질문으로 변환
   - priority HIGH 항목 우선
2. 사용자 답변 대기
3. 답변을 analysisContext에 반영:
   - API 관련 답변 → `signals.apiSpecConfirmed = true`
   - 디자인 스펙 답변 → 디자인 파일 경로 저장
   - 기타 답변 → `notes`에 기록
4. `signals.hasPendingQuestions = false` 설정
5. 필요시 `/moonshot-detect-uncertainty` 재실행

`missingInfo`가 비면 다음 단계로 진행.

#### 2.5 시퀀스 결정
`Skill` 도구를 사용하여 `/moonshot-decide-sequence` 실행
- 반환된 patch를 analysisContext에 병합
- `phase`, `decisions.skillChain`, `decisions.parallelGroups` 설정

#### 2.6 계획 크기 관리 (계획/리뷰 반복 시)
계획→리뷰→개선 반복 시 `context.md`가 급격히 커질 수 있음. `.claude/docs/guidelines/document-memory-policy.md` 참조:

1. **각 계획 업데이트 전**: 현재 토큰 사용량 확인
2. **80% 임계치 도달 시**: `notes`에 경고 로깅, 요약 고려
3. **100% 임계치 도달 시**:
   - 현재 버전을 `archives/context-v{n}.md`에 아카이빙
   - 요약 버전으로 교체
   - context.md에 아카이브 인덱스 업데이트

4. **리뷰 출력 처리**:
   - 전체 리뷰 → `archives/review-v{n}.md`
   - 요약만 → `context.md`에 추가

5. **토큰 한도 근접 시**: 더 작은 서브 계획으로 추가 분할

**아카이브 인덱스 형식** (context.md 하단):
```markdown
## 아카이브 참조

| 버전 | 파일 | 핵심 내용 | 생성일 |
|------|------|----------|--------|
| v1 | [context-v1.md](archives/context-v1.md) | 초기 설계 | YYYY-MM-DD |
```

### 3. 에이전트 체인 실행

`decisions.skillChain`을 순서대로 실행:

**허용된 단계:**
- `pre-flight-check`: 사전 점검 스킬
- `project-memory-agent`: 프로젝트 메모리 로드 에이전트 (Task tool, fork)
- `requirements-analyzer`: 요구사항 분석 에이전트 (Task tool)
- `context-builder`: 컨텍스트 구축 에이전트 (Task tool)
- `codex-validate-plan`: Codex 계획 검증 스킬
- `implementation-runner`: 구현 에이전트 (Task tool)
- `completion-verifier`: 테스트 기반 완료 검증 스킬
- `codex-review-code`: Codex 코드 리뷰 스킬
- `project-memory-reviewer`: 프로젝트 메모리 규칙/스펙 위반 검증 에이전트 (Task tool, fork)
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

**Fork 기반 에이전트:**
- `project-memory-agent`와 `project-memory-reviewer`는 **fork 서브에이전트**로 실행
- 프로젝트 메모리(`[ProjectID]::*`)를 격리된 환경에서 로드/검증
- 요약된 컨텍스트/위반 사항만 메인 세션에 반환
- 원본 메모리 데이터로 인한 컨텍스트 오염 방지

**스킬별 실행 방법:**

`vercel-react-best-practices`의 경우:
- `signals.reactProject = true`일 때 트리거
- `Skill 도구`로 `skill: "vercel-react-best-practices"` 사용하여 실행
- 변경된 파일을 분석하여 React/Next.js 성능 이슈 확인
- 분석 결과를 `analysisContext.notes`에 병합

**에이전트 매핑:**
- `project-memory-agent` → `subagent_type: "general-purpose"` + 프롬프트 (fork, 2.1 전 실행)
- `requirements-analyzer` → `subagent_type: "general-purpose"` + 프롬프트
- `context-builder` → `subagent_type: "context-builder"`
- `implementation-runner` → `subagent_type: "implementation-agent"`
- `project-memory-reviewer` → `subagent_type: "general-purpose"` + 프롬프트 (fork, codex-review-code 후 실행)

### 3.1 동적 스킬 삽입 (Dynamic Skill Injection)

skillChain 실행 중 시그널 감지 시 스킬 동적 삽입:

| 시그널 | 조건 | 삽입 스킬 | 삽입 위치 |
|--------|------|----------|----------|
| `buildFailed` | Bash exit code ≠ 0 | build-error-resolver | 현재 단계 재시도 전 |
| `securityConcern` | 변경 파일에 `.env`, `auth`, `password`, `token` 포함 | security-reviewer | codex-review-code 후 |
| `coverageLow` | codex-test-integration 출력에서 커버리지 < 80% | (추가 테스트 요청) | codex-test-integration 후 |
| `reactProject` | `.tsx`/`.jsx` 파일 또는 React 키워드 | (codex-review-code 확장) | codex-review-code 내부 |

**시그널 감지:**
```yaml
buildFailed:
  trigger: Bash 도구가 0이 아닌 exit code 반환
  action: build-error-resolver 삽입, 실패한 단계 재시도 (최대 2회)

securityConcern:
  trigger: |
    changedFiles.any(f => 
      f.includes('.env') || 
      f.includes('auth') || 
      f.includes('password') || 
      f.includes('token') ||
      f.includes('secret')
    )
  action: codex-review-code 후 security-reviewer 추가

coverageLow:
  trigger: codex-test-integration에서 커버리지 < 80% 보고
  action: 경고 로깅, 사용자에게 추가 테스트 요청

reactProject:
  trigger: |
    changedFiles.any(f =>
      f.endsWith('.tsx') || f.endsWith('.jsx') ||
      f.includes('/pages/') || f.includes('/app/') ||
      f.includes('/components/')
    ) ||
    request.keywords.any(k =>
      ['react', 'next', 'next.js', 'nextjs', 'jsx', 'tsx', 'useState', 'useEffect'].includes(k.toLowerCase())
    )
  action: |
    - signals.reactProject = true 설정
    - codex-review-code 이후 skillChain에 vercel-react-best-practices 삽입
    - 실행 시: Skill 도구로 skill="vercel-react-best-practices" 사용
```

### 3.2 프로젝트 메모리 리뷰 (Fork)
**중요**: `codex-review-code` 이후, `project-memory-reviewer`를 **fork 서브에이전트**로 실행.

1. **fork 실행**:
   ```
   Task 도구: project-memory-reviewer (subagent_type: general-purpose)
   Input: { projectId, changedFiles, projectMemoryContext, diff }
   ```

2. **위반 보고서 수신**:
   ```yaml
   memoryReviewResult:
     status: "passed" | "failed" | "needs_approval"
     violations: [...]     # NeverDo 위반
     needsApproval: [...]  # AskFirst 항목
     warnings: [...]       # 규약/스펙 경고
     reminders: [...]      # AlwaysDo 리마인더
   ```

3. **결과 처리**:
   - `status: "failed"`: 실행 **중단**, 위반 사항 사용자에게 보고
   - `status: "needs_approval"`: 진행 전 사용자 승인 요청
   - `status: "passed"`: 다음 단계로 진행

4. **analysisContext에 병합**:
   ```yaml
   projectMemory:
     ...existing
     reviewResult: { ...memoryReviewResult }
   ```

### 3.3 Completion Verification Loop

implementation-runner 완료 후:

1. `completion-verifier` 호출
2. `allPassed: true` 시:
   - `implementationComplete: true` 설정
   - 다음 단계로 진행 (codex-review-code)
3. `allPassed: false` 시:
   - 실패 Phase 식별 (Unit → Phase 1, Integration → Phase 2)
   - retryCount < 2 시:
     - **실패한 Phase로 돌아가기 (테스트 작성 X)**
     - `failedTests`를 implementation-agent에 전달
     - implementation-agent는 코드만 수정
     - retryCount 증가
   - 그 외:
     - 사용자에게 개입 요청
     - 실패 테스트 상세 제공

**Signals 업데이트:**
```yaml
signals:
  implementationComplete: false  # 기존
  
  # 신규 필드
  acceptanceTestsGenerated: false
  testsPassed: 0
  testsFailed: 0
  completionRetryCount: 0
  currentPhase: "Phase 0"  # 0=Tests, 1=Mock, 2=API, 3=Verify
```

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

{missingInfo가 있으면 질문 섹션 추가}
```

## 에러 처리

1. **스킬 실행 실패**: 에러 로그를 notes에 기록하고 사용자에게 보고
2. **미정의 단계**: 사용자에게 확인 요청
3. **질문 무한 루프**: 최대 3회 질문 제한, 이후 기본값으로 진행
4. **토큰 한도 경고**: 계속하기 전에 아카이빙 및 요약

## 계약
- 이 스킬은 다른 PM 스킬들을 오케스트레이션만 하고 직접 분석하지 않음
- 모든 분석 로직은 개별 PM 스킬에 위임
- patch 병합은 단순 오브젝트 머지 (깊은 병합 아님)
- 사용자 질문은 AskUserQuestion 도구 사용
- **문서 메모리 정책**: `.claude/docs/guidelines/document-memory-policy.md` 준수

## 참조
- `.claude/docs/guidelines/document-memory-policy.md`
