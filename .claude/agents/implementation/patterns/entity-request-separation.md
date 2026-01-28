# Entity-Request Separation Pattern

## Purpose

- Separate response (Entity) types from request (Request) types to ensure type safety.

## Rules

- Entity types: `src/app/_entities/{feature}/types.ts`
- Request types: `src/app/_requests/{feature}/types.ts`
- Perform response mapping logic in `_fetch/`.

## Notes

- Handle snake_case -> camelCase conversion in mapping functions.
- See `.claude/PROJECT.md` for detailed rules.
