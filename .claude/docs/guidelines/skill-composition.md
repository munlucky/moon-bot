# Skill Composition Guide (Reference Only)

> This document is for future reference. Currently not enforced.

## When to Consider Skill Composition

- Same skill combination repeated in 3+ places
- Total skill count exceeds 30
- Onboarding new team members becomes difficult

## Conceptual Patterns

### verification-suite
```yaml
steps:
  parallel:
    - codex-review-code
    - verify-changes.sh
  then:
    - security-reviewer (if hasSecurityChanges)
    - codex-test-integration (if complexity == complex)
```

### implementation-with-recovery
```yaml
steps:
  - implementation-runner
  - on_error:
      - build-error-resolver
      - retry: implementation-runner (max: 2)
```

## Current Status

**Not implemented yet.** The existing complexity-based chain rules in `moonshot-decide-sequence` provide sufficient abstraction for current scale (~20 skills).

## References

- [moonshot-decide-sequence](file://.claude/skills/moonshot-decide-sequence/SKILL.md)
- [moonshot-orchestrator](file://.claude/skills/moonshot-orchestrator/SKILL.md)
