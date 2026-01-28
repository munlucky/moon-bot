# {YYYY-MM-DD} {feature-name} Session Log

> Project rules: `.claude/PROJECT.md`

## Session Metadata

- Start time: {HH:MM}
- End time: {HH:MM}
- Branch: {branch}
- Owner: {userName}
- Complexity: {simple|medium|complex}

## Timeline

| Time  | Phase          | Summary | Artifact       |
| ----- | -------------- | ------- | -------------- |
| {HH:MM} | Requirements   | {summary} | agreement.md |
| {HH:MM} | Context        | {summary} | context.md   |
| {HH:MM} | Implementation | {summary} | commit {hash} |
| {HH:MM} | Verification   | {summary} | verify result |
| {HH:MM} | Documentation  | {summary} | session log  |

## Decision Log

- {decision} / Reason: {reason} / Alternative: {alternative}

## Issue Log

- {issue/resolution}

## Verification Results

- `npx tsc --noEmit`: {result}
- `npm run build`: {result}
- `npm run lint`: {result}

## Deliverables

- Changed files: {summary}
- Commits: {hash/message}

## Remaining Work

- [ ] {remaining work}
