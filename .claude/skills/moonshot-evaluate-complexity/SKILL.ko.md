---
name: moonshot-evaluate-complexity
description: 예상 파일 수/라인 수/시간을 기준으로 복잡도(`simple`, `medium`, `complex`)를 평가한다. 작업 분류 이후에 사용.
context: fork
---

# PM 복잡도 평가

## 입력
- `analysisContext.estimates.estimatedFiles`
- `analysisContext.estimates.estimatedLines`
- `analysisContext.estimates.estimatedTime`
- `analysisContext.request.taskType`

## 기준
- `simple`: 1-2개 파일, 100줄 이하, 1시간 이내
- `medium`: 3-5개 파일, 100-300줄, 1-3시간
- `complex`: 6개 이상, 300줄 이상, 3시간 이상

추정치가 없으면 `taskType` 키워드로 추론하고 낮은 신뢰 메모를 남긴다.

## 출력 (patch)
```yaml
complexity: medium
estimates.estimatedFiles: 4
estimates.estimatedLines: 180
estimates.estimatedTime: 2h
notes:
  - "복잡도=medium, 추정치=추론"
```
