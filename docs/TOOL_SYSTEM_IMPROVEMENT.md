# Tool System Improvement Guide

> Moltbot TOOL 패턴 분석 및 moon-bot 적용 계획

## Overview

Moltbot의 TOOL 시스템을 분석하여 moon-bot에 적용할 개선사항을 정리합니다.

## Current State Comparison

| Area | Moltbot | moon-bot Current | Status |
|------|---------|------------------|--------|
| Tool Definition | TypeBox JSON Schema | Raw JSON Schema | Needs Improvement |
| LLM Integration | Auto Tool Definitions | Tool ID only | **Needs Improvement** |
| Runtime Management | Direct call | ToolRuntime centralized | Excellent |
| Approval System | Basic | Multi-channel approval | Excellent |
| Retry/Recovery | Limited | Replanner auto-recovery | Excellent |
| Policy Filtering | Profile-based early filter | Runtime-based | Can Improve |
| Result Helpers | jsonResult(), imageResult() | Direct construction | Can Improve |

## Architecture Diagrams

### Moltbot Tool Architecture

```
+------------------------------------------------------------------+
|                        Tool System Structure                      |
+------------------------------------------------------------------+
|                                                                   |
|  +---------------+     +---------------+     +---------------+    |
|  | Tool Define   | --> | Tool Register | --> | Tool Execute  |    |
|  | (Schema)      |     | (Policy)      |     | (Execute)     |    |
|  +---------------+     +---------------+     +---------------+    |
|         |                    |                    |               |
|         v                    v                    v               |
|  +---------------+     +---------------+     +---------------+    |
|  | TypeBox       |     | allow/deny   |     | LLM Result    |    |
|  | JSON Schema   |     | Profile      |     | Feedback      |    |
|  +---------------+     +---------------+     +---------------+    |
|                                                                   |
+------------------------------------------------------------------+
```

### moon-bot Current Flow

```
User Input
    |
    v
Orchestrator (TaskOrchestrator)
    |
    v
Planner (LLM: message -> steps, tool ID only)  <-- Problem: No schema
    |
    v
Executor (execute steps)
    |
    v (step specifies tool)
ToolRuntime.invoke()
    +-- SchemaValidator (input validation)
    +-- ApprovalManager (policy check)
    +-- Tool.run() (actual execution)
    +-- ToolResult return
    |
    v (on failure)
Replanner (FailureAnalyzer -> RecoveryAction)
    +-- RETRY: recursive call
    +-- ALTERNATIVE: switch tool
    +-- APPROVAL: wait for user
    +-- ABORT: stop execution
```

## Improvement Phases

### Phase 1: LLM Tool Definitions (Required)

**Problem:**
```typescript
// Current: Only tool ID
availableTools: ["fs.read", "system.run"]
// LLM: "What is fs.read? path? filePath? What parameters?"
```

**Solution:**
```typescript
// Include tool metadata
toolDefinitions: [
  {
    name: "fs.read",
    description: "Read file content",
    schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path to read" },
        encoding: { type: "string", enum: ["utf8", "ascii", "base64"] }
      },
      required: ["path"]
    }
  }
]
```

**Files to Modify:**
- `src/llm/LLMClient.ts:120-170` - Include schema in buildSystemPrompt()
- `src/agents/planner.ts` - Pass toolDefinitions

**Effect:** LLM generates steps with accurate parameters

---

### Phase 2: Tool Result Builder Helper

**New File:** `src/tools/runtime/ToolResultBuilder.ts`

```typescript
import { ToolResult, ToolMeta } from "../../types";

export const ToolResultBuilder = {
  success<T>(data: T, meta?: Partial<ToolMeta>): ToolResult<T> {
    return {
      ok: true,
      data,
      meta: {
        durationMs: meta?.durationMs ?? 0,
        artifacts: meta?.artifacts,
        truncated: meta?.truncated
      }
    };
  },

  failure(code: string, message: string, details?: unknown): ToolResult {
    return {
      ok: false,
      error: { code, message, details },
      meta: { durationMs: 0 }
    };
  },

  timeout(durationMs: number): ToolResult {
    return this.failure("TIMEOUT", "Tool execution timeout", { durationMs });
  },

  cancelled(): ToolResult {
    return this.failure("CANCELLED", "Tool execution cancelled");
  }
};
```

**Apply to:**
- `src/tools/filesystem/FileIOTool.ts`
- `src/tools/http/HttpTool.ts`
- `src/tools/desktop/SystemRunTool.ts`
- `src/tools/browser/BrowserTool.ts`

---

### Phase 3: Tool Policy Profile (Optional)

**New File:** `src/tools/policy/ToolProfile.ts`

```typescript
export type ToolProfile = "minimal" | "coding" | "full";

export const TOOL_PROFILES: Record<ToolProfile, Set<string>> = {
  minimal: new Set(["fs.read", "fs.list"]),
  coding: new Set([
    "fs.read", "fs.write", "fs.list", "fs.glob",
    "system.run", "http.request"
  ]),
  full: new Set(["*"])
};

export function filterToolsByProfile(
  tools: ToolSpec[],
  profile: ToolProfile
): ToolSpec[] {
  const allowed = TOOL_PROFILES[profile];
  if (allowed.has("*")) return tools;
  return tools.filter(t => allowed.has(t.id));
}
```

**Modify:** `src/tools/index.ts` - Add profile parameter to createGatewayTools()

---

### Phase 4: TypeBox Integration (Long-term)

**Add Dependency:** `@sinclair/typebox`

**Example Migration:**
```typescript
// Before
const schema = {
  type: "object",
  properties: {
    path: { type: "string" }
  }
};

// After
import { Type, Static } from "@sinclair/typebox";

const FileReadSchema = Type.Object({
  path: Type.String({ description: "File path to read" }),
  encoding: Type.Optional(Type.Enum({ utf8: "utf8", ascii: "ascii" }))
});

type FileReadInput = Static<typeof FileReadSchema>;
// Compile-time type safety!
```

---

## Implementation Priority

| Priority | Phase | Effort | Impact |
|----------|-------|--------|--------|
| 1 | LLM Tool Definitions | 1-2 days | High |
| 2 | Tool Result Builder | 1 day | Medium |
| 3 | Tool Policy Profile | 1 day | Low |
| 4 | TypeBox Integration | 1 week | Medium |

## moon-bot Strengths (Keep)

1. **ToolRuntime Centralization**
   - Logging, timeout, concurrency control
   - Enterprise-grade management

2. **Replanner Auto-Recovery**
   - Automatic retry on failure
   - Alternative tool suggestion
   - Recovery statistics tracking

3. **Multi-Channel Approval**
   - CLI, Discord, WebSocket support
   - Button-based approval UX
   - Timeout-based expiration

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/types/index.ts:124-130` | ToolSpec, ToolResult definition |
| `src/tools/index.ts` | Toolkit class, factory functions |
| `src/tools/runtime/ToolRuntime.ts` | Runtime engine (270+ lines) |
| `src/agents/executor.ts` | Executor, retry logic |
| `src/agents/planner.ts` | LLM planning |
| `src/llm/LLMClient.ts` | LLM integration (improvement target) |

## Verification

1. **Phase 1 Verification:**
   - Check LLMClient logs for Tool schema in prompt
   - Verify Planner generates steps with correct parameters

2. **Phase 2 Verification:**
   - Existing tests pass (ToolRuntime tests)
   - Consistent result format across Tools

3. **Integration Test:**
   - Discord channel Tool call test
   - "Read README.md file" -> fs.read works correctly
