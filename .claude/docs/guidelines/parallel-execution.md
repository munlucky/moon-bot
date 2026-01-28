# Parallel Execution Guidelines

## Trigger Conditions
- After Context Builder completes.
- Only when complexity: complex.
- Final step of the Planning phase.

## Strategy
Run **Codex Validator** (plan review) and **Implementation Agent** (coding) in parallel.
- Validator reviews edge cases, etc.
- Implementation starts coding immediately.
- Sync occurs after Validator completes.

### Token Duplication Avoidance Strategy
**Problem**: Running Validator and Implementation in parallel loads the same context twice
**Solution**:
1. **Prepare one shared snapshot**:
   - Moonshot Agent prepares a single JSON snapshot before parallel execution
   - Both agents reference the same snapshot
2. **Add only role-specific minimums**:
   - Validator: `"mode": "readonly"` + review file paths only
   - Implementation: `"mode": "write"` + target file paths only
3. **Do not include file contents**:
   - Snapshot includes only file paths (`src/pages/xxx/*.tsx`)
   - Each agent reads files as needed
4. **Pass only previous output paths**:
   - Provide only `agreement.md`, `context.md` paths
   - Agents read file contents when needed

**Example - shared snapshot (YAML)**:
```yaml
featureName: "batch management"
agreementFile: ".claude/features/batch/agreement.md"
contextFile: ".claude/features/batch/context.md"
patterns:
  entityRequest: "separate entity and request types"
  apiProxy: "axios wrapper pattern"
relevantFilePaths:
  - "src/pages/batch/*.tsx"
  - "src/api/batch.ts"
  - "src/types/batch/*.ts"
```

**Example - Validator extra info (YAML)**:
```yaml
mode: "readonly"
reviewFocus:
  - "edge cases"
  - "type safety"
  - "error handling"
```

**Example - Implementation extra info (YAML)**:
```yaml
mode: "write"
targetFiles:
  - "src/pages/batch/BatchListPage.tsx"
  - "src/api/batch.ts"
```

**Token savings effect**:
- Remove duplicate shared info: ~50% saved
- Deferred file content loading: ~30% saved
- Role-specific minimums only: ~20% saved
- YAML (vs JSON): ~20-30% saved
- **Total expected savings**: ~50-70% tokens in parallel

## Execution Script Logic
```bash
# After Context Builder completes
echo "Context Builder complete"
echo "Parallel start: Codex Validator || Implementation Agent"

# Parallel calls
codex-validator-agent --feature {feature_name} &
VALIDATOR_PID=$!

implementation-agent --feature {feature_name} &
IMPL_PID=$!

# Wait for Validator (read-only, usually faster)
wait $VALIDATOR_PID
echo "Codex Validator complete"

# Sync Validator feedback into context
doc-sync-skill   --feature {feature_name}   --updates validator-output.json
echo "Doc Sync complete: context.md updated"

# Wait for Implementation
wait $IMPL_PID
echo "Implementation Agent complete"

# Check if plan changed during implementation
if [[ context.md updated after implementation start ]]; then
  echo "Validator updated the plan."
  echo "Checking whether Implementation reflected the changes..."
  # If critical changes are missing, schedule a patch in the next phase
fi
```

## Synchronization Points
| Timing | Event | Action |
|---|---|---|
| Context Builder complete | Start parallel execution | Start Validator and Implementation together |
| Validator complete | Doc Sync | Update `context.md` with feedback |
| Implementation complete | Context check | Verify Validator feedback was applied |
| Both complete | Start Type Safety | Proceed to next sequential stage |

