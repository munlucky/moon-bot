---
name: project-memory-agent
description: Loads project memory from global Memory MCP (filtered by ProjectID namespace) and composes context for the main session.
---

# Project Memory Agent

## Role
Fork-based agent that loads project-specific memory from global Memory MCP and returns a summarized context to avoid polluting the main session.

## Execution
- **Must run as**: Task tool (fork/subagent)
- **When**: Before analysis/planning phase (step 2.1 in moonshot-orchestrator)

## Inputs
Receive from orchestrator:
```yaml
projectId: "{projectId}"       # from package.json name or directory
changedFiles: []               # planned change files
taskType: "{taskType}"         # feature/bugfix/refactor
userRequest: "{summary}"       # brief task summary
```

## Workflow

### 1. Determine Project ID
```bash
# Priority: package.json > directory name > git remote
PROJECT_ID=$(cat package.json 2>/dev/null | jq -r '.name // empty' || basename $(pwd))
```

### 2. Search Project Memory
Use `mcp__memory__search_nodes` to find all entities with `[ProjectID]::` prefix:

```
search_nodes("[ProjectID]::")
```

### 3. Load Boundary Entities
Use `mcp__memory__open_nodes` to load:
- `[ProjectID]::Boundary::AlwaysDo`
- `[ProjectID]::Boundary::AskFirst`
- `[ProjectID]::Boundary::NeverDo`

### 4. Load Related Conventions
Based on `changedFiles`, search for related entities:
- `[ProjectID]::Component::*` - component definitions
- `[ProjectID]::Convention::*` - coding conventions
- `[ProjectID]::API::*` - API specifications
- `[ProjectID]::Domain::*` - domain rules

### 5. Compose Context Summary
**Critical**: Return ONLY summarized context, not raw memory data.

```yaml
projectMemoryContext:
  projectId: "{projectId}"
  loaded: true
  
  boundaries:
    alwaysDo:
      - "Run lint before commit"
      - "Ensure tests pass"
    askFirst:
      - "Adding new dependencies"
      - "DB schema changes"
    neverDo:
      - "Commit .env files"
      - "Delete existing tests"
  
  relevantRules:
    - entity: "[proj]::Component::Button"
      summary: "variant prop required, onClick handler rules"
    - entity: "[proj]::Convention::API"
      summary: "unified error response format"
  
  warnings: []  # any issues found during loading
```

## Output
Return the `projectMemoryContext` object to be merged into `analysisContext.projectMemory`.

## Error Handling
1. **No project memory found**: Return empty context with `loaded: false`
2. **Memory MCP unavailable**: Return empty context, log warning
3. **Partial load**: Return what was loaded, list missing in `warnings`

## Contract
- This agent runs in a forked session to prevent context pollution
- Returns ONLY summarized context (not full memory contents)
- Main session receives clean, minimal context
