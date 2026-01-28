---
paths:
  - ".claude/agents/**/*.md"
  - ".claude/skills/**/*.md"
---

# Agent Delegation Rules

## Auto-delegation Conditions

| Situation | Target | Mode |
|-----------|--------|------|
| Complex feature request | moonshot-orchestrator | PLANNING |
| Unclear requirements | requirements-analyzer | PLANNING |
| Context building needed | context-builder | PLANNING |
| After code changes | codex-review-code | VERIFICATION |
| Testing needed (complex) | codex-test-integration | VERIFICATION |
| Security concern detected | security-reviewer | VERIFICATION |
| Build error occurred | build-error-resolver | EXECUTION |
| Documentation update needed | documentation-agent | EXECUTION |
| Pre-work check | pre-flight-check | PLANNING |

## Do NOT Delegate

- Simple questions/info lookup
- Read/describe file only tasks
- Clear and simple modifications (1-2 files)

## Delegation Principles

1. **Scope clarity**: Provide clear scope and expected outcomes
2. **Context transfer**: Include sufficient background information
3. **Result verification**: Always review delegation results
