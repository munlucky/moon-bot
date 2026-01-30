---
title: Document Memory Policy
description: Document token management policy shared by all agents/skills
applies-to:
  - moonshot-orchestrator
  - context-builder
  - requirements-analyzer
  - implementation-agent
  - verification-agent
  - codex-validate-plan
  - codex-review-code
  - session-logger
  - efficiency-tracker
---

# Document Memory Policy

> **Purpose**: Shared document memory strategy for all agents/skills to prevent token limit errors.
> **Required by**: moonshot-orchestrator, context-builder, requirements-analyzer, implementation-agent, verification-agent, session-logger, efficiency-tracker, codex-* skills

**Path Configuration**: Document paths follow the `documentPaths.tasksRoot` setting in `.claude/PROJECT.md`.
- Default: `.claude/docs/tasks`
- Recommended (for git-tracked): `docs/claude-tasks`

---

## 1. Directory Structure (Per Task)

All tasks follow this structure (`{tasksRoot}` = PROJECT.md's `documentPaths.tasksRoot`):

```
{tasksRoot}/{feature-name}/
├── context.md              # Current plan (max 8000 tokens)
├── specification.md        # Summarized spec (under 2000 tokens)
├── pending-questions.md    # Unresolved questions
├── verification-result.md  # Verification results
├── flow-report.md          # Workflow report
├── session-logs/
│   ├── day-YYYY-MM-DD.md   # Daily session logs
│   └── ...
├── archives/               # Archives (token savings)
│   ├── specification-full.md    # Original specification
│   ├── context-v1.md            # Previous plan versions
│   ├── review-v1.md             # Review logs
│   └── ...
└── subtasks/               # Subtasks (when split)
    ├── subtask-01/
    │   ├── context.md
    │   └── ...
    └── subtask-02/
        └── ...
```

---

## 2. Token Thresholds

| Document Type | Max Tokens | Action When Exceeded |
|---------------|-----------|---------------------|
| `context.md` | 8,000 | Archive previous version |
| `specification.md` | 2,000 | Move original to archives/, keep summary only |
| Single review output | 4,000 | Move to archives/, add summary only to context.md |
| Session log (daily) | 5,000 | Split to next day's file |

**Note**: 1,000 tokens ≈ 750 words (English) / 500 words (Korean)

---

## 3. Large Specification Handling

### 3.1 Summary Trigger

Perform summary when any of these conditions are met:
- Specification word count > 2,000 words
- Specification token count > 3,000 tokens (estimated)
- Contains > 5 independent features/modules

### 3.2 Summary Procedure

1. **Preserve original**: Save to `archives/specification-full.md`
2. **Generate summary**: Extract core requirements, constraints, acceptance criteria only
3. **Write specification.md**: Summary + link to original
4. **Update archive index**: Add reference in context.md

### 3.3 Summary Format

```markdown
## Summarized Specification

### Core Requirements
1. [Requirement 1]
2. [Requirement 2]
...

### Constraints
- [Constraint 1]
- [Constraint 2]

### Acceptance Criteria
- [ ] [Criterion 1]
- [ ] [Criterion 2]

> 📎 Original: [specification-full.md](archives/specification-full.md)
```

### 3.4 Hierarchical Context

> "Context length does not replace quality" - How to write a good spec for AI agents

Use **table of contents and summaries** for agents to navigate large specs efficiently.

#### TOC Pattern

Instead of dumping 50 pages, provide hierarchical summary:

```markdown
# Specification Summary

## Table of Contents
1. [API Endpoints](#api-endpoints) - 5 endpoints
2. [Data Models](#data-models) - 3 entities
3. [Business Logic](#business-logic) - Processing rules
4. [Error Handling](#error-handling) - Error codes

## Summary
- **Total expected files**: 12
- **Complexity**: complex
- **Key constraints**: Auth required, activity logging

## Key Decisions
- Use API proxy pattern (security)
- Date input: single date (yyyy-mm-dd)

> 📎 Full details: [specification-full.md](archives/specification-full.md)
```

#### Section-Based Access

Agents check TOC first, then load only needed sections via `view_file`:

```
1. Check specification.md TOC
2. Identify needed section (e.g., "API Endpoints")
3. Load only that section from archives/specification-full.md via view_file
4. Proceed with work
```

#### Benefits

- **Token savings**: Load only what's needed instead of everything
- **Maintain focus**: Prevent "curse of instructions"
- **Easy navigation**: Quick search via structured TOC

---

## 4. Task Splitting Strategy

### 4.1 Split Trigger

| Complexity | Expected Files | Independent Features | Split? |
|-----------|---------------|---------------------|--------|
| simple | ≤ 3 | 1 | ❌ Don't split |
| medium | 4-10 | 2-4 | ⚠️ Optional split |
| complex | > 10 | > 5 | ✅ Must split |

### 4.2 Split Procedure

1. **Define subtasks**: Separate each independent feature/module into subtask
2. **Create directories**: Create `subtasks/subtask-NN/` structure
3. **Independent execution**: Each subtask runs workflow with independent analysisContext
4. **Merge results**: Record only summary in parent context.md

### 4.3 Subtask context.md Format

```markdown
# Subtask: {subtask-name}

## Parent Task
- Feature: {feature-name}
- Master plan: [../context.md](../context.md)

## Scope
- Assigned module: [module name]
- Target files: [file list]

## Detailed Plan
...
```

---

## 5. Archiving Rules

### 5.1 Archive Trigger

- When context.md is updated with changed content
- When review is complete in plan → review → revise loop
- When token threshold reaches 80% (warning)

### 5.2 Archive Procedure

1. **Create version**: Copy to `archives/context-v{n}.md`
2. **Keep summary**: Keep only latest plan in current context.md
3. **Update index**: Add reference in format below

### 5.3 Archive Index (at bottom of context.md)

```markdown
## Archive References

| Version | File | Key Content | Created |
|---------|------|-------------|---------|
| v1 | [context-v1.md](archives/context-v1.md) | Initial API design | 2026-01-13 |
| v2 | [review-v1.md](archives/review-v1.md) | Codex plan review feedback | 2026-01-13 |
```

---

## 6. Agent/Skill Application

### Common for All Agents/Skills

1. **Token awareness**: Check current context.md size before generating output
2. **Warning logging**: Add warning to notes when threshold reaches 80%
3. **Auto-archive**: Perform archiving when threshold reaches 100%
4. **Maintain index**: Update index when creating archives

### Additional Rules by Skill

| Skill | Additional Rule |
|-------|----------------|
| `moonshot-orchestrator` | Handle large specs and splitting at step 2.0 |
| `codex-validate-plan` | Save full review to archives/, add only summary to context.md |
| `codex-review-code` | Save full review to archives/, add only summary to context.md |
| `session-logger` | Split to next day's file when exceeding 5000 tokens daily |
| `efficiency-tracker` | Archive flow-report.md when exceeding 4000 tokens |

---

## 7. Reference Method

When referencing archived documents:

```markdown
See [specification-full.md](archives/specification-full.md) for full details.
```

Agents load the file directly via `view_file` when needed.

---

## 8. Checklist

Verify at each skill execution:

- [ ] Check `documentPaths.tasksRoot` in PROJECT.md
- [ ] Verify current task directory exists (`{tasksRoot}/{feature-name}/`)
- [ ] Check context.md token usage
- [ ] Verify archive index is up to date
- [ ] Check if large specification (> 2000 words?)
- [ ] Check if subtask split needed (complex + 5+ features?)
