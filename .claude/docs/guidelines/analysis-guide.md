# PM Analysis Guidelines

## 1. Task Type Classification
### feature (new feature)
**Keywords**: "new", "add", "implement", "create", "build"
**Examples**:
- "Implement batch management"
- "Add member search"
**Characteristics**:
- No context.md
- New directories/files
- 3-step flow (Planning -> Implementation -> Verification)

### modification (change)
**Keywords**: "change", "modify", "improve", "switch to", "remove"
**Examples**:
- "Leave only one date input"
- "Remove batch execution column"
**Characteristics**:
- context.md exists
- Modify existing files
- 1-2 step flow (Implementation -> Verification)

### bugfix (bug fix)
**Keywords**: "bug", "error", "fix", "broken", "fail"
**Examples**:
- "Fix type errors"
- "Paging is broken"
**Characteristics**:
- High urgency
- Root cause analysis required
- Stronger verification

### refactor
**Keywords**: "refactor", "clean up", "split", "optimize"
**Examples**:
- "Split components"
- "Clean up code"
**Characteristics**:
- No behavior change
- Improve code quality
- Strict regression testing

## 2. Complexity Assessment
### simple
**Criteria**: 1-2 files, <100 lines, under 1 hour
**Agent sequence**: Implementation -> Verification

**Transfer context (minimal, YAML)**:
```yaml
task: "one-line task summary"
targetFiles:
  - "file1.ts"
userRequest: "original request text (<= 50 chars)"
```
- **Token savings**: pass file paths only; the agent reads content directly
- **YAML**: 20-30% fewer tokens than JSON (fewer quotes/braces)

### medium
**Criteria**: 3-5 files, 100-300 lines, 1-3 hours
**Agent sequence**: Requirements -> Context -> Implementation -> Verification -> Documentation

**Transfer context (chained, YAML)**:
- Requirements -> create `agreement.md`
- Context -> receive `agreement.md` path, create `context.md`
- Implementation -> `context.md` path + only 3-5 core constraints:
```yaml
contextFile: ".claude/features/xxx/context.md"
coreConstraints:
  - "paging required"
  - "entity-request separation"
targetPattern: "src/pages/xxx/*.tsx"
```
- **Token savings**: each agent receives only output paths and reads as needed
- **YAML effect**: 20-30% token savings vs JSON

### complex
**Criteria**: 6+ files, 300+ lines, 3+ hours
**Agent sequence**: Requirements -> Context -> CodexValidator -> Implementation -> TypeSafety -> Verification -> Documentation

**Transfer context (consider parallel, YAML)**:
- Requirements -> create `agreement.md`
- Context -> create `agreement.md` + `context.md`
- **Parallel start** (Validator || Implementation):
  - Prepare one shared snapshot:
```yaml
agreementFile: ".claude/features/xxx/agreement.md"
contextFile: ".claude/features/xxx/context.md"
codebasePatterns:
  entityRequest: "src/types/entities vs src/types/requests"
  apiProxy: "use axios wrapper"
relevantFiles:
  - "src/pages/xxx/*.tsx"
  - "src/api/xxx.ts"
  - "src/types/xxx/*.ts"
```
  - Validator: snapshot + review file paths only (read-only)
  - Implementation: snapshot + target file paths only (write)
- **Token savings**:
  - One shared YAML snapshot (20-30% smaller than JSON)
  - Each agent reads only needed files
  - No file contents in the snapshot

## 3. Phase Determination
### Planning
**Criteria**: no context.md, new feature, unclear requirements
**Agents**: Requirements Analyzer, Context Builder, Codex Validator (for complex)

### Implementation
**Criteria**: context.md exists, clear requirements, ready to code
**Agents**: Implementation Agent, Type Safety Agent

### Integration
**Criteria**: "API apply", "integration", Mock complete, API spec confirmed
**Agents**: Implementation Agent (API), Type Safety Agent, Verification Agent

### Verification
**Criteria**: implementation complete, "verify" or "test" keywords
**Agents**: Verification Agent, Documentation Agent
