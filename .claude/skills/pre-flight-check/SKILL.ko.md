---
name: pre-flight-check
description: Checks essential information and project status before starting a task.
context: fork
---

# Pre-Flight Check Skill

**역할**: 작업 시작 전에 필수 정보와 프로젝트 상태를 점검해 누락을 줄입니다.

## 입력
- 기능명/브랜치명 (선택)
- 필수 문서 경로: CLAUDE.md, context.md 등

## 체크 항목
- 화면 정의서 버전/디자인 산출물 존재 여부
- API 스펙 확보 여부
- 유사 기능 참조 여부
- git 상태/브랜치, 빌드 상태
- context.md 최신 여부, pending-questions.md 미해결 항목
- **문서 메모리 정책 체크**:
  - context.md 토큰 사용량 (~80%인 6,000토큰 초과 시 경고)
  - specification.md 존재 및 요약 여부 (대형 명세서인 경우)
  - archives/ 디렉토리 구조 존재 여부

## 출력 (예시)
```markdown
# 사전 체크 결과

## 필수 정보
✅ 화면 정의서: v3 (YYYY-MM-DD)
✅ API 스펙: 초안 확보
⚠️  유사 기능 참조: 찾지 못함

## 프로젝트 상태
✅ git 상태: clean
✅ 브랜치: feature/{feature-name}
✅ 빌드 상태: 성공

## 문서
✅ CLAUDE.md: 최신
⚠️  context.md: 없음 (생성 필요)

## 문서 메모리 정책
✅ context.md 토큰: ~3,200 (8,000 한도 이내)
✅ specification.md: 요약됨 (원본은 archives/에)
✅ archives/ 디렉토리: 존재

## 권장 액션
1. [HIGH] context.md 생성 (ContextBuilder Agent)
2. [MEDIUM] 디자인 산출물 확인 (design-spec-extractor 호출)
```

---

## 안티패턴 체크

> "AI 에이전트를 위한 좋은 스펙 작성법" 가이드에 따른 흔한 실수 감지

### 체크 항목

| 안티패턴 | 감지 방법 | 상태 |
|----------|----------|------|
| **모호한 프롬프트** | "멋진 걸 만들어줘", "더 잘 작동하게" 같은 불명확 요청 | ⚠️ |
| **요약 없는 대용량 컨텍스트** | specification.md > 3,000 토큰 + 요약 없음 | ⚠️ |
| **6가지 핵심 영역 누락** | PROJECT.md에 명령어/테스트/구조/스타일/Git/경계 중 미정의 | ⚠️ |
| **바이브 코딩 ↔ 프로덕션 혼동** | 테스트 없이 프로덕션 배포 시도 | ⚠️ |
| **치명적인 삼위일체 무시** | 속도/비결정성/비용 중 검증 없이 진행 | ⚠️ |

### 감지 시 권장 액션

| 감지된 안티패턴 | 권장 액션 |
|----------------|----------|
| 모호한 요청 | `requirements-analyzer` 호출하여 명확화 |
| 대용량 문서 | `document-memory-policy.md` 따라 요약 |
| 영역 누락 | PROJECT.md 점검 권고, 템플릿 섹션 참조 |
| 테스트 없음 | `completion-verifier` 호출 전 테스트 작성 권고 |

### 출력 예시

```markdown
## 안티패턴 체크 결과

| 항목 | 상태 | 액션 |
|------|------|------|
| 명확한 요청 | ✅ | - |
| 컨텍스트 크기 | ✅ | ~2,500 토큰 |
| 6가지 영역 | ⚠️ | Git 워크플로우 미정의 |
| 테스트 정의 | ✅ | - |

**권장 액션:**
1. [MEDIUM] PROJECT.md에 Git 워크플로우 섹션 추가
```

## 참조
- `.claude/docs/guidelines/document-memory-policy.md`

