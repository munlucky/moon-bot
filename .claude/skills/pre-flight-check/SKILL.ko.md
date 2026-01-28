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

## 참조
- `.claude/docs/guidelines/document-memory-policy.md`
