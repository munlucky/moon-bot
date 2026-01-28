---
name: moonshot-classify-task
description: 사용자 요청을 작업 유형(`feature`, `modification`, `bugfix`, `refactor`)으로 분류하고 의도 키워드를 추출한다. PM 분석 시작 시 사용.
context: fork
---

# PM 작업 분류

## 입력
- `analysisContext.request.userMessage`

## 절차
1. 사용자 메시지에서 의도 키워드를 식별한다.
2. taskType을 하나 선택한다: `feature | modification | bugfix | refactor`.
3. 신뢰도를 설정한다: `high | medium | low`.

## 휴리스틱
- feature: "신규", "추가", "구현", "만들기", "생성"
- modification: "변경", "수정", "개선", "조정", "제거"
- bugfix: "버그", "에러", "오류", "안 됨", "깨짐"
- refactor: "리팩터링", "정리", "재구성", "중복 제거"

## 기술 스택 감지

React/Next.js 키워드 감지 시 시그널 설정:
- Keywords: "react", "next", "next.js", "nextjs", "jsx", "tsx", "useState", "useEffect"
- Output: `signals.reactProject: true`

## 출력 (patch)
```yaml
request.taskType: feature
request.keywords:
  - 구현
  - react
signals:
  reactProject: true  # React/Next.js 키워드 감지 시 설정
notes:
  - "taskType=feature, confidence=high"
  - "tech-stack: react/next.js detected"  # reactProject=true일 때 추가
```
