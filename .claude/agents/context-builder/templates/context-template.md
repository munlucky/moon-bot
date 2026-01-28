# {feature-name} Implementation Plan

> Project rules: `.claude/PROJECT.md`

## Metadata

- Author: {userName}
- Created: {YYYY-MM-DD HH:MM}
- Branch: {branchName}
- Complexity: {simple|medium|complex}
- Related doc: `.claude/docs/agreements/{feature-name}-agreement.md`

## Task Overview

- Goal: {one-line summary}
- Scope: {included/excluded}
- Impact: {impact scope}

## Target Files

### New

- `path/to/new-file.tsx` - {description}

### Modified

- `path/to/existing-file.ts` - {change summary}

## Current State / Similar Features

- Similar feature: `path/to/similar/feature.tsx`
- Reused patterns/components: {list}

## Implementation Plan

### Phase 1: Mock/UI (if needed)

1. Type definitions (`_entities/`, `_requests/`)
2. Mock data/skeleton
3. UI/state/event implementation

### Phase 2: API Integration (if needed)

1. API proxy route
2. Fetch function implementation
3. Response mapping/format conversion

### Phase 3: Verification

1. `npx tsc --noEmit`
2. `npm run build`
3. `npm run lint`
4. `.claude/agents/verification/verify-changes.sh {feature-name}`

## Risks and Alternatives

- Risk: {description}
- Impact: {impact}
- Alternative: {alternative}

## Dependencies

- API spec: {confirmed or not}
- Menu/permissions: {needed or not}
- Other: {external dependencies}

## Checkpoints

- [ ] Phase 1 complete
- [ ] Phase 2 complete
- [ ] Phase 3 complete

## Open Questions

- {question list}
