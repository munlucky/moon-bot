---
name: moonshot-detect-uncertainty
description: 요구사항 누락을 감지하고 명확화 질문을 생성한다. 분류/복잡도 이후, 사용자 입력 필요 여부 판단에 사용.
context: fork
---

# PM 불확실성 검출

## 입력
- `analysisContext.request.userMessage`
- `analysisContext.request.keywords`
- `analysisContext.request.taskType`
- `analysisContext.signals.hasContextMd`

## 트리거 및 질문
- UI/버전: `UI`/화면 키워드가 있을 때 디자인 스펙 버전 확인
- API: `API` 키워드가 있을 때 엔드포인트, 요청/응답 스키마, 에러 형식 확인
- 날짜 범위: 날짜/기간 키워드가 있을 때 단일 또는 범위 확인
- 페이징: 목록/테이블 키워드가 있을 때 서버 또는 클라이언트 페이징 확인
- 에러 처리: 신규 기능일 때 `alert`/`toast`/`inline` 정책 확인

## 출력 (patch)
```yaml
missingInfo:
  - category: api-spec
    priority: HIGH
    question: "API 엔드포인트, 요청/응답 스키마, 에러 형식을 공유해주세요."
    reason: "Mock과 타입 정의에 안정적인 계약이 필요합니다."
signals.hasPendingQuestions: true
```
