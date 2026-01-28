---
name: implementation-runner
description: 체인에서 실제 구현을 수행하고 완료 상태와 변경 파일을 `analysisContext`에 기록한다. 구현 단계에서 사용.
---

# 구현 실행

## 입력
- `analysisContext.request.userMessage`
- `analysisContext.decisions.skillChain`
- `analysisContext.repo.openFiles`
- `analysisContext.artifacts.contextDocPath` (존재 시)

## 절차
1. 요구사항과 컨텍스트를 확인한다.
2. 변경 범위를 정리하고 실제 구현을 수행한다.
3. 변경 파일 목록과 핵심 변경 요약을 기록한다.
4. 구현 완료 상태를 `analysisContext`에 반영한다.

## 출력 (patch)
```yaml
signals.implementationComplete: true
repo.changedFiles:
  - src/...
notes:
  - "구현: 완료, 변경 파일=3"
```

## 규칙
- 다른 스킬/서브에이전트를 호출하지 않는다.
- 실패하거나 보류할 경우 `notes`에 사유를 기록한다.
