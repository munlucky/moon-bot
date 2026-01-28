# Codex Fallback Guidelines

## Overview

All Codex-delegated skills should follow consistent fallback behavior when Codex is unavailable.

## When to Fallback

**Error conditions triggering fallback:**
- `"quota exceeded"`
- `"rate limit"`
- `"API error"`
- `"unavailable"`
- `"timeout"` (> 300 seconds)

## Fallback Procedure

```yaml
procedure:
  1. Attempt Codex call: mcp__codex__codex({...})
  2. If error matches fallback conditions:
     - Log: "codex-fallback: Claude performing {task} directly"
     - Claude performs the task using same guidelines
     - Add note to output: "codex-fallback: true"
  3. Continue with results
```

## Applying to Codex Skills

Reference this guideline in Codex skills:

```markdown
## Fallback
See `.claude/docs/guidelines/codex-fallback.md` for fallback procedure.
```

## Affected Skills

| Skill | Fallback Behavior |
|-------|------------------|
| codex-validate-plan | Claude performs plan review |
| codex-review-code | Claude performs code review |
| completion-verifier | Claude runs tests directly |

## Note Format

When fallback occurs, add to output:
```yaml
notes:
  - "{skill}-result: [result], codex-fallback=true"
```
