## 📊 작업 분석 결과 (Task Analysis Result)
### 작업 정보
- **유형**: {{taskType}}
- **복잡도**: {{complexity}}
- **예상 시간**: {{estimatedTime}}
- **예상 파일 수**: {{estimatedFiles}}
- **위험도**: {{riskLevel}}

### 현재 단계 (Current Phase)
**{{phase}}**
- {{phaseReason}}

### 불확실성 (확인 필수)
{{#missingInfo}}
#### {{index}}. [{{priority}}] {{category}}
❓ {{question}}
- 이유: {{reason}}
{{/missingInfo}}

### 필요 에이전트 시퀀스
{{#requiredAgents}}
{{index}}. **{{name}}**
{{/requiredAgents}}

### 권장사항
{{#recommendations}}
- {{.}}
{{/recommendations}}

### 다음 단계
{{nextStepInstruction}}