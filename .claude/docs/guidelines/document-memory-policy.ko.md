---
title: Document Memory Policy
description: 모든 에이전트/스킬이 공유하는 문서 토큰 관리 정책
applies-to:
  - moonshot-orchestrator
  - context-builder
  - requirements-analyzer
  - implementation-agent
  - verification-agent
  - codex-validate-plan
  - codex-review-code
  - session-logger
  - efficiency-tracker
---

# Document Memory Policy

> **Purpose**: 모든 에이전트/스킬이 공유하는 문서 메모리 전략으로, 토큰 제한 오류를 방지합니다.
> **Required by**: moonshot-orchestrator, context-builder, requirements-analyzer, implementation-agent, verification-agent, session-logger, efficiency-tracker, codex-* skills

**Path Configuration**: 문서 경로는 `.claude/PROJECT.md`의 `documentPaths.tasksRoot` 설정을 따릅니다.
- 기본값: `.claude/docs/tasks`
- 권장값 (git 추적 시): `docs/claude-tasks`

---

## 1. 디렉토리 구조 (작업 단위)

모든 작업은 다음 구조를 따릅니다 (`{tasksRoot}` = PROJECT.md의 `documentPaths.tasksRoot`):

```
{tasksRoot}/{feature-name}/
├── context.md              # 현재 계획 (최대 8000 토큰)
├── specification.md        # 요약된 명세서 (2000 토큰 이하)
├── pending-questions.md    # 미해결 질문
├── verification-result.md  # 검증 결과
├── flow-report.md          # 워크플로우 리포트
├── session-logs/
│   ├── day-YYYY-MM-DD.md   # 일별 세션 로그
│   └── ...
├── archives/               # 아카이브 (토큰 절약)
│   ├── specification-full.md    # 원본 명세서
│   ├── context-v1.md            # 이전 계획 버전
│   ├── review-v1.md             # 리뷰 로그
│   └── ...
└── subtasks/               # 서브태스크 (분할 시)
    ├── subtask-01/
    │   ├── context.md
    │   └── ...
    └── subtask-02/
        └── ...
```

---

## 2. 토큰 임계값

| 문서 유형 | 최대 토큰 | 초과 시 조치 |
|-----------|----------|-------------|
| `context.md` | 8,000 | 이전 버전 아카이빙 |
| `specification.md` | 2,000 | 원본을 archives/로 이동, 요약만 유지 |
| 단일 리뷰 출력 | 4,000 | archives/로 이동, 요약만 context.md에 추가 |
| 세션 로그 (일별) | 5,000 | 다음 날 파일로 분할 |

**참고**: 1,000 토큰 ≈ 750 단어 (영어) / 500 단어 (한국어)

---

## 3. 대형 명세서 처리

### 3.1 요약 트리거

다음 조건 중 하나 충족 시 요약 수행:
- 명세서 단어 수 > 2,000단어
- 명세서 토큰 수 > 3,000토큰 (추정)
- 독립 기능/모듈 > 5개 포함

### 3.2 요약 절차

1. **원본 보존**: `archives/specification-full.md`에 저장
2. **요약 생성**: 핵심 요구사항, 제약조건, 수용기준만 추출
3. **specification.md 작성**: 요약본 + 원본 링크
4. **아카이브 인덱스 갱신**: context.md에 참조 추가

### 3.3 요약 포맷

```markdown
## 요약된 명세서

### 핵심 요구사항
1. [요구사항 1]
2. [요구사항 2]
...

### 제약조건
- [제약조건 1]
- [제약조건 2]

### 수용기준
- [ ] [기준 1]
- [ ] [기준 2]

> 📎 원본: [specification-full.md](archives/specification-full.md)
```

### 3.4 계층적 요약 (Hierarchical Context)

> "컨텍스트 길이는 품질을 대체하지 못합니다" - AI 에이전트를 위한 좋은 스펙 작성법

대규모 스펙에서 에이전트가 효율적으로 탐색할 수 있도록 **목차와 요약**을 활용합니다.

#### 목차(TOC) 패턴

50페이지 문서를 그대로 던져주는 대신, 계층적 요약을 제공합니다:

```markdown
# Specification Summary

## 목차
1. [API 엔드포인트](#api-endpoints) - 5개 엔드포인트
2. [데이터 모델](#data-models) - 3개 엔티티
3. [비즈니스 로직](#business-logic) - 처리 규칙
4. [에러 처리](#error-handling) - 에러 코드

## 요약
- **총 예상 파일**: 12개
- **복잡도**: complex
- **핵심 제약**: 인증 필수, 활동 로그 기록

## 주요 결정 사항
- API 프록시 패턴 사용 (보안)
- 날짜 입력: 단일 일자 (yyyy-mm-dd)

> 📎 상세 내용: [specification-full.md](archives/specification-full.md)
```

#### 섹션별 접근 방법

에이전트는 목차를 먼저 확인 후, 필요한 섹션만 `view_file`로 로드합니다:

```
1. specification.md 목차 확인
2. 필요한 섹션 식별 (예: "API 엔드포인트")
3. archives/specification-full.md에서 해당 섹션만 view_file로 로드
4. 작업 수행
```

#### 이점

- **토큰 절약**: 전체 로드 대신 필요한 부분만 로드
- **집중력 유지**: "지시 사항의 저주" 방지
- **탐색 용이**: 구조화된 목차로 빠른 검색

---

## 4. 작업 분할 전략

### 4.1 분할 트리거

| 복잡도 | 예상 파일 수 | 독립 기능 수 | 분할 여부 |
|--------|-------------|-------------|----------|
| simple | ≤ 3 | 1 | ❌ 분할 안 함 |
| medium | 4-10 | 2-4 | ⚠️ 선택적 분할 |
| complex | > 10 | > 5 | ✅ 필수 분할 |

### 4.2 분할 절차

1. **서브태스크 정의**: 각 독립 기능/모듈을 서브태스크로 분리
2. **디렉토리 생성**: `subtasks/subtask-NN/` 구조 생성
3. **독립 실행**: 각 서브태스크는 독립 analysisContext로 워크플로우 실행
4. **결과 병합**: 상위 context.md에 요약만 기록

### 4.3 서브태스크 context.md 포맷

```markdown
# Subtask: {subtask-name}

## 상위 작업
- 기능명: {feature-name}
- 마스터 계획: [../context.md](../context.md)

## 범위
- 담당 모듈: [모듈명]
- 대상 파일: [파일 목록]

## 상세 계획
...
```

---

## 5. 아카이빙 규칙

### 5.1 아카이빙 트리거

- context.md 갱신 시 이전 내용이 변경된 경우
- plan → review → revise 루프에서 리뷰 완료 시
- 토큰 임계치 80% 도달 시 (경고)

### 5.2 아카이빙 절차

1. **버전 생성**: `archives/context-v{n}.md`로 복사
2. **요약 유지**: 현재 context.md에는 최신 계획만 유지
3. **인덱스 갱신**: 아래 형식으로 참조 추가

### 5.3 아카이브 인덱스 (context.md 하단)

```markdown
## 아카이브 참조

| 버전 | 파일 | 핵심 내용 | 생성일 |
|------|------|----------|--------|
| v1 | [context-v1.md](archives/context-v1.md) | 초기 API 설계 | 2026-01-13 |
| v2 | [review-v1.md](archives/review-v1.md) | Codex 플랜 리뷰 피드백 | 2026-01-13 |
```

---

## 6. 에이전트/스킬별 적용

### 모든 에이전트/스킬 공통

1. **토큰 인식**: 출력 생성 전 현재 context.md 크기 확인
2. **경고 로깅**: 임계치 80% 도달 시 notes에 경고 추가
3. **자동 아카이빙**: 임계치 100% 도달 시 아카이빙 수행
4. **인덱스 유지**: 아카이브 생성 시 인덱스 갱신

### 스킬별 추가 규칙

| 스킬 | 추가 규칙 |
|------|----------|
| `moonshot-orchestrator` | 2.0 단계에서 대형 명세서 처리 및 분할 수행 |
| `codex-validate-plan` | 전체 리뷰는 archives/에 저장, 요약만 context.md에 추가 |
| `codex-review-code` | 전체 리뷰는 archives/에 저장, 요약만 context.md에 추가 |
| `session-logger` | 일별 5000토큰 초과 시 다음 날 파일로 분할 |
| `efficiency-tracker` | flow-report.md 4000토큰 초과 시 아카이빙 |

---

## 7. 참조 방법

아카이브된 문서 참조 시:

```markdown
상세 내용은 [specification-full.md](archives/specification-full.md)를 참조하세요.
```

에이전트는 필요 시 해당 파일을 `view_file`로 직접 로드합니다.

---

## 8. 체크리스트

각 스킬 실행 시 확인:

- [ ] PROJECT.md에서 `documentPaths.tasksRoot` 확인
- [ ] 현재 작업 디렉토리 존재 확인 (`{tasksRoot}/{feature-name}/`)
- [ ] context.md 토큰 사용량 확인
- [ ] 아카이브 인덱스 최신화 확인
- [ ] 대형 명세서 여부 확인 (2000단어 초과?)
- [ ] 서브태스크 분할 필요 여부 확인 (complex + 5개 이상 기능?)
