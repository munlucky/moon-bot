## Task Analysis Result

### Task Info
- **Type**: {{taskType}}
- **Complexity**: {{complexity}}
- **Estimated Time**: {{estimatedTime}}
- **Estimated File Count**: {{estimatedFiles}}
- **Risk Level**: {{riskLevel}}

### Current Phase
**{{phase}}**
- {{phaseReason}}

### Uncertainty (Confirmation Required)
{{#missingInfo}}
#### {{index}}. [{{priority}}] {{category}}
? {{question}}
- Reason: {{reason}}
{{/missingInfo}}

### Required Agent Sequence
{{#requiredAgents}}
{{index}}. **{{name}}**
{{/requiredAgents}}

### Recommendations
{{#recommendations}}
- {{.}}
{{/recommendations}}

### Next Step
{{nextStepInstruction}}
