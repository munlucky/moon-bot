# TypeBox Migration Guide

## Overview

Phase 4 introduces TypeBox for compile-time type safety in tool schemas. This guide explains how to migrate remaining tools.

## What Changed

### Before (Manual JSON Schema)
```typescript
interface FileReadInput {
  path: string;
  encoding?: BufferEncoding;
}

const schema = {
  type: "object",
  properties: {
    path: { type: "string", description: "File path" },
    encoding: { type: "string", enum: ["utf8", "ascii"] }
  },
  required: ["path"]
};
```

### After (TypeBox)
```typescript
import { FileReadInputSchema, toJSONSchema, type FileReadInput } from "../schemas/TypeBoxSchemas.js";

const schema = toJSONSchema(FileReadInputSchema);
// Type is automatically inferred from TypeBox schema!
```

## Migration Steps

### Step 1: Add Schema to TypeBoxSchemas.ts

```typescript
// src/tools/schemas/TypeBoxSchemas.ts

export const YourToolInputSchema = Type.Object({
  param1: Type.String({ description: "Description" }),
  param2: Type.Optional(Type.Integer({ minimum: 0 })),
});

export type YourToolInput = Static<typeof YourToolInputSchema>;
```

### Step 2: Update Tool File

```typescript
// src/tools/yourtool/YourTool.ts

// Remove manual interface
// interface YourToolInput { ... }  // DELETE

// Import from TypeBoxSchemas
import {
  YourToolInputSchema,
  toJSONSchema,
  type YourToolInput
} from "../schemas/TypeBoxSchemas.js";

// Update tool creation
export function createYourTool(): ToolSpec<YourToolInput, ...> {
  return {
    id: "your.tool",
    description: "...",
    schema: toJSONSchema(YourToolInputSchema),  // Use TypeBox
    run: async (input: YourToolInput, ctx) => {
      // input is now properly typed!
      ...
    }
  };
}
```

## TypeBox Quick Reference

### Common Patterns

```typescript
// String
Type.String({ description: "A string value" })

// Optional string
Type.Optional(Type.String())

// Number with constraints
Type.Integer({ minimum: 0, maximum: 100 })

// Literal values (enum-like)
Type.Union([
  Type.Literal("GET"),
  Type.Literal("POST"),
  Type.Literal("DELETE")
])

// Record (key-value pairs)
Type.Record(Type.String(), Type.String())

// Array
Type.Array(Type.String())

// Union of string or array of strings
Type.Union([Type.String(), Type.Array(Type.String())])

// Nested object
Type.Object({
  nested: Type.Object({
    value: Type.String()
  })
})
```

## Migration Status

| Tool | Status | Notes |
|------|--------|-------|
| FileIOTool | ✅ Done | 4 tools (read, write, list, glob) |
| HttpTool | ✅ Done | 2 tools (request, download) |
| SystemRunTool | ✅ Done | 2 tools (run, runRaw) |
| BrowserTool | ✅ Done | 7 tools (start, goto, snapshot, act, screenshot, extract, close) |

**All tools migrated!** 🎉

## Benefits

1. **Compile-time type safety**: TypeScript validates input/output types
2. **Single source of truth**: Schema and type are always in sync
3. **Better IDE support**: Autocomplete for tool parameters
4. **JSON Schema compatible**: Still works with LLM integration

## Verification

After migration, run:
```bash
npx tsc --noEmit  # Type check
npm test          # Verify tests still pass
```
