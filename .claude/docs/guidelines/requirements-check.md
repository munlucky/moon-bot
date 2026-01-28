# Requirements Completion Check Guidelines

## Trigger
- After **Verification Agent** completes.
- Before **Documentation Agent** finalize.

## Purpose
Guarantee 100% requirement completion before closeout.

## Check Items
1. **Agreement cross-check**: compare `context.md` vs initial agreement.
2. **Context checkpoints**: ensure all phases in `context.md` are marked "Done".
3. **Pending questions**: ensure no unresolved HIGH/MEDIUM items in `pending-questions.md`.

## Process
1. Run checks.
2. If incomplete -> re-run Implementation Agent (targeted changes).
3. If complete -> finalize documentation.

## Output Format (JSON)
### Incomplete (re-run required)
```json
{
  "status": "incomplete",
  "incomplete_items": [
    {
      "type": "agreement",
      "content": "add error alert",
      "priority": "HIGH",
      "reason": "missing in agreement"
    }
  ],
  "next_action": "re_run_implementation"
}
```

### Complete
```json
{
  "status": "all_complete",
  "completed_items": ["date UI", "batch API", "result table"],
  "next_action": "documentation_finalize"
}
```

## Re-run Logic
- Implement only items in `incomplete_items`.
- Skip full regeneration.
- Loop: Implementation -> Verification -> check again.
