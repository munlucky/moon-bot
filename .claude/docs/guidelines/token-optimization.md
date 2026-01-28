# Token Optimization Guidelines

## Goal
Minimize token waste when passing context between agents, and remove duplicate cost especially in parallel execution.

---

## Six Core Principles

### 0. Skill Fork Context (`context: fork`)
**Problem**: When PM skills execute sequentially, intermediate analysis (file reads, codebase exploration) accumulates in the main session, bloating context

**Solution**:
- Apply `context: fork` option to analysis/review skills
- Skill runs in **separate sub-agent session**, only **results return to main session**
- ~90% token reduction in main session (analysis phase)

**Criteria**:
- ✅ **Analysis/review skills**: Read many files but don't write
- ❌ **Execution/write skills**: Require file modifications

**Apply to**:
```yaml
# Add to SKILL.md frontmatter
---
name: moonshot-classify-task
description: ...
context: fork   # ← Add this line
---
```

| Fork O | Fork X |
|--------|--------|
| moonshot-classify-task | implementation-runner |
| moonshot-evaluate-complexity | efficiency-tracker |
| moonshot-detect-uncertainty | session-logger |
| moonshot-decide-sequence | doc-sync |
| pre-flight-check | |
| codex-validate-plan | |
| codex-review-code | |
| codex-test-integration | |

**Caution**:
- Fork session cannot reference main context → pass needed info as arguments
- Current skills use `analysisContext` argument structure → compatible

### 1. Minimal Context Transfer
**Problem**: Passing full context to sub-agents doubles token usage
**Solution**:
- Send only **necessary info** in a small YAML snapshot (5-10 lines)
- Send **file paths only**, not file contents
- **Use YAML**: 20-30% fewer tokens vs JSON (fewer quotes/braces/commas)
- Example:
```yaml
task: "implement batch management"
targetFiles:
  - "src/pages/batch/*.tsx"
constraints:
  - "paging required"
```

### 2. Progressive Disclosure
**Problem**: Loading all files upfront wastes tokens
**Solution**:
- Agents receive only path lists at first
- **Read only necessary files** during work
- PM only tells "where to look"

### 3. Output Chaining
**Problem**: Passing full conversation history to the next agent grows cost
**Solution**:
- Pass only the **output file paths** from the previous agent
- Do not pass full history
- Example chain:
  - Requirements -> create `agreement.md`
  - Context -> receive `agreement.md` path, create `context.md`
  - Implementation -> receive `context.md` path only

### 4. Single Shared Context for Parallel Execution
**Problem**: Parallel Validator and Implementation load the same context twice
**Solution**:
- PM prepares **one shared snapshot**
- Both agents reference the same snapshot
- Add only role-specific minimums:
  - Validator: `"mode": "readonly"` + review file paths
  - Implementation: `"mode": "write"` + target file paths

**Example (YAML)**:
```yaml
# Shared snapshot (prepared once)
featureName: "batch management"
contextFile: ".claude/features/batch/context.md"
patterns:
  entityRequest: "type separation pattern"
relevantFilePaths:
  - "src/pages/batch/*.tsx"

# Validator extra info
mode: "readonly"
reviewFocus:
  - "edge cases"

# Implementation extra info
mode: "write"
targetFiles:
  - "src/pages/batch/BatchListPage.tsx"
```

### 5. Reference-Based Transfer
**Problem**: Passing full file content adds hundreds or thousands of lines
**Solution**:
- Pass references only in `file:line` format
- Example: `src/api/batch.ts:45-67` (only that function is needed)
- Agent reads only the referenced range if needed

---

## Strategy by Complexity

### Simple (1-2 files)
```yaml
task: "one-line task summary"
targetFiles:
  - "file1.ts"
userRequest: "original request (<= 50 chars)"
```
- File paths only, no contents
- YAML saves 20-30% vs JSON

### Medium (3-5 files)
**Chained approach**:
- Requirements -> `agreement.md` path
- Context -> `context.md` path
- Implementation -> `context.md` path + 3-5 core constraints

### Complex (6+ files)
**Parallel + shared snapshot (YAML)**:
```yaml
agreementFile: ".claude/features/xxx/agreement.md"
contextFile: ".claude/features/xxx/context.md"
codebasePatterns:
  entityRequest: "separate entity and request"
  apiProxy: "axios wrapper"
relevantFilePaths:
  - "src/pages/xxx/*.tsx"
  - "src/api/xxx.ts"
```
- Validator and Implementation share the same snapshot
- Each reads only the needed files
- YAML saves an additional 20-30%

---

## Expected Impact

### Token savings in parallel execution
- Remove duplicate shared info: **~50% saved**
- Deferred file content loading: **~30% saved**
- Role-specific minimums only: **~20% saved**
- YAML (vs JSON): **~20-30% saved**
- **Total expected savings**: **50-70%** tokens in parallel

### Token savings in sequential execution
- Output chaining: **~30% saved**
- Progressive Disclosure: **~25% saved**
- Reference-based transfer: **~15% saved**
- YAML (vs JSON): **~20-30% saved**
- **Total expected savings**: **40-50%** tokens in sequence

---

## Implementation Checklist

### Moonshot Agent items
- [ ] Build minimal per-agent YAML payloads (no JSON)
- [ ] Include only file paths, not contents
- [ ] Prepare one shared snapshot for parallel execution
- [ ] Pass only previous output file paths

### Per-agent items
- [ ] Confirm file paths from the payload
- [ ] Read only needed files
- [ ] Do not request full history
- [ ] Create output files (next agents reference paths)

### Prohibited
- Do not include full file contents in the payload
- Do not pass full conversation history to the next agent
- Do not prepare separate contexts for each agent in parallel
- Do not load all files upfront
- Do not use JSON (use YAML)

---

## References
- `.claude/agents/moonshot-agent.md` - PM workflow
- `.claude/docs/guidelines/analysis-guide.md` - complexity-specific context
- `.claude/docs/guidelines/parallel-execution.md` - parallel strategy
- `.claude/templates/moonshot-output.json` - payload structure

---

## Practical Tips

### Debugging
- If token usage is higher than expected, check whether file contents were included
- Confirm the first agent action is "read file"

### Optimization priority
1. **Parallel execution sections** (largest impact)
2. **Complex tasks** (more files, bigger gains)
3. **Medium tasks** (moderate impact)
4. **Simple tasks** (small but consistent)

### Measurement
- Log actual token usage to measure improvements
- Analyze token spending by complexity and phase
- Compare before/after parallel execution

---

**Date**: 2026-01-10
**Version**: 1.0
**Status**: Active
