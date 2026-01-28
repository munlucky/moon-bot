---
paths:
  - ".claude/agents/**/*.md"
  - ".claude/skills/**/*.md"
---

# 에이전트 위임 규칙

## 자동 위임 조건

| 상황 | 호출 대상 | 모드 |
|------|----------|------|
| 복잡한 기능 요청 | moonshot-orchestrator | PLANNING |
| 요구사항 불명확 | requirements-analyzer | PLANNING |
| 컨텍스트 구축 필요 | context-builder | PLANNING |
| 코드 변경 후 | codex-review-code | VERIFICATION |
| 테스트 필요 (complex) | codex-test-integration | VERIFICATION |
| 보안 우려 감지 | security-reviewer | VERIFICATION |
| 빌드 에러 발생 | build-error-resolver | EXECUTION |
| 문서 업데이트 필요 | documentation-agent | EXECUTION |
| 작업 시작 전 점검 | pre-flight-check | PLANNING |

## 위임하지 않는 경우

- 단순 질문/정보 조회
- 파일 읽기/설명만 필요한 경우
- 명확하고 간단한 수정 (1-2개 파일)

## 위임 원칙

1. **범위 명확화**: 위임 시 명확한 범위와 기대 결과 제시
2. **컨텍스트 전달**: 충분한 배경 정보 포함
3. **결과 검증**: 위임 결과 반드시 검토
