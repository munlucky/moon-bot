# Token Optimization Example

## Scenario: "Implement batch management"

User request: "Implement batch management. We need list view, detail view, and run actions."

---

## Inefficient Approach (Before - JSON)

### Moonshot Agent -> Implementation Agent (JSON format)
```yaml
# Actually sent as JSON, shown here as YAML
task: "Implement batch management"
userRequest: "Implement batch management. We need list view, detail view, and run actions."
projectContext:
  existingFiles:
    "src/pages/member/MemberListPage.tsx": "... (full 500 lines)"
    "src/pages/member/MemberDetailPage.tsx": "... (full 300 lines)"
    "src/api/member.ts": "... (full 200 lines)"
    "src/types/member/entities.ts": "... (full 100 lines)"
  projectRules: "... (full .claude/PROJECT.md, 50 lines)"
  patterns:
    entityRequest: "... (full pattern doc, 80 lines)"
    apiProxy: "... (full pattern doc, 60 lines)"
conversationHistory:
  - "... (full conversation, 100 lines)"
```

**Token usage**: ~5,000 tokens (file contents + docs + history)
**Problems**:
- Includes full file contents
- Includes full conversation history
- JSON adds 20-30% extra token cost

---

## Efficient Approach (After)

### Step 1: Moonshot Agent analysis (YAML)
```yaml
taskType: "feature"
complexity: "medium"
phase: "planning"
requiredAgents:
  - "RequirementsAnalyzer"
  - "ContextBuilder"
  - "ImplementationAgent"
  - "VerificationAgent"
```
**YAML effect**: 20-30% fewer tokens vs JSON

### Step 2: Send to Requirements Analyzer (YAML)
```yaml
task: "Implement batch management"
userRequest: "List view, detail view, run actions"
projectPatterns:
  - "entity-request separation"
  - "axios wrapper"
outputFile: ".claude/features/batch/agreement.md"
```
**Token usage**: ~70 tokens (YAML saves ~30% vs JSON)

**Requirements Analyzer behavior**:
- Read `.claude/PROJECT.md` as needed
- Find similar features if needed (glob/grep)
- Create `agreement.md`

---

### Step 3: Send to Context Builder (YAML)
```yaml
agreementFile: ".claude/features/batch/agreement.md"
relevantFilePaths:
  - "src/pages/member/*.tsx"
  - "src/api/member.ts"
  - "src/types/member/*.ts"
outputFile: ".claude/features/batch/context.md"
```
**Token usage**: ~55 tokens (YAML saves ~30% vs JSON)

**Context Builder behavior**:
1. Read `agreement.md` (only necessary parts)
2. Read `src/pages/member/MemberListPage.tsx` (similar pattern)
3. Read `src/api/member.ts:45-67` (API call pattern only)
4. Create `context.md`

**Progressive Disclosure effect**:
- Read only needed sections, not full files
- Token savings: ~60%

---

### Step 4: Send to Implementation Agent (YAML)
```yaml
mode: "write"
contextFile: ".claude/features/batch/context.md"
targetFiles:
  - "src/pages/batch/BatchListPage.tsx"
  - "src/pages/batch/BatchDetailPage.tsx"
  - "src/api/batch.ts"
  - "src/types/batch/entities.ts"
  - "src/types/batch/requests.ts"
patterns:
  entityRequest: "entity vs request type separation"
  apiProxy: "axios wrapper pattern"
```
**Token usage**: ~85 tokens (YAML saves ~30% vs JSON)

**Implementation Agent behavior**:
1. Read `context.md`
2. Read `.claude/agents/implementation/patterns/entity-request-separation.md` as needed
3. Read similar files selectively if needed
4. Start implementation

**Output chaining effect**:
- Reference only context.md, no prior history
- Token savings: ~70%

---

## Token Usage Comparison

| Item | Before (JSON + full) | After (YAML + minimal) | Savings |
|-----|-----------------------|------------------------|---------|
| Requirements | ~1,500 tokens | ~70 tokens | **95%** |
| Context Builder | ~2,000 tokens | ~55 tokens | **97%** |
| Implementation | ~5,000 tokens | ~85 tokens | **98%** |
| **Total** | **~8,500 tokens** | **~210 tokens** | **98%** |

**Actual work tokens**:
- After approach adds extra tokens when agents read files as needed
- Still large savings because only needed files are read
- **Additional YAML effect**: 20-30% savings vs JSON
- **Expected total**: Before ~15,000 -> After ~2,000 (87% savings)

---

## Parallel Execution Example (Complex)

### Scenario: "Implement order management system" (complex)

#### Before: inefficient parallel execution
```bash
# Sent to Validator (5,000 tokens)
{
  "task": "...",
  "fullContext": "... (full context)",
  "allFiles": {
    "file1.tsx": "... (full content)",
    ...
  }
}

# Sent to Implementation (5,000 tokens)
{
  "task": "...",
  "fullContext": "... (full context)",  # duplicate
  "allFiles": {
    "file1.tsx": "... (full content)",      # duplicate
    ...
  }
}
```
**Total token usage**: 10,000 tokens (100% duplication)

---

#### After: efficient parallel execution

**1. Prepare shared snapshot (once, YAML)**
```yaml
featureName: "order management"
agreementFile: ".claude/features/order/agreement.md"
contextFile: ".claude/features/order/context.md"
codebasePatterns:
  entityRequest: "src/types/entities vs src/types/requests"
  apiProxy: "use axios wrapper"
relevantFilePaths:
  - "src/pages/order/*.tsx"
  - "src/api/order.ts"
  - "src/types/order/*.ts"
  - "src/hooks/useOrder*.ts"
```
**Token usage**: 105 tokens (YAML saves ~30% vs JSON)

**2. Validator extra info (YAML)**
```yaml
mode: "readonly"
reviewFocus:
  - "edge cases"
  - "type safety"
  - "error handling"
```
**Token usage**: 14 tokens (YAML saves ~30% vs JSON)

**3. Implementation extra info (YAML)**
```yaml
mode: "write"
targetFiles:
  - "src/pages/order/OrderListPage.tsx"
  - "src/pages/order/OrderDetailPage.tsx"
  - "src/api/order.ts"
```
**Token usage**: 21 tokens (YAML saves ~30% vs JSON)

**Total token usage**: 140 tokens (initial context only, 30% less than JSON)

**During actual work**:
- Validator: snapshot (105) + extra (14) + file reads (~500) = **~620 tokens**
- Implementation: snapshot (105) + extra (21) + file reads (~800) = **~925 tokens**
- **Total parallel execution**: ~1,545 tokens

**Savings**:
- Before (JSON) 10,000 -> After (YAML) 1,545 = **85% savings**
- YAML adds an extra 30% savings vs JSON

---

## Key Takeaways

### 1. Send only file paths
- Agents read contents only as needed
- PM role: show "where to look"

### 2. Chain output file paths
- agreement.md -> context.md -> implementation
- Do not pass full history

### 3. Prepare one shared snapshot for parallel execution
- Removing duplication is the biggest impact
- Add only role-specific minimums

### 4. Progressive Disclosure
- Do not load everything upfront
- Expand gradually based on workflow

### 5. Reference-based transfer
- Use `file:line` references to point to exact locations
- Read tens of lines instead of hundreds

### 6. Use YAML
- **Do not use JSON**; use YAML
- Removing quotes/braces/commas saves 20-30% tokens
- Improved readability for humans as well

---

**Date**: 2026-01-10
**Version**: 1.0
**Status**: Example document
