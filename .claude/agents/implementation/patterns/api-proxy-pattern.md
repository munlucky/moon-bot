# API Proxy Pattern

## Purpose

- Do not call the backend directly; handle auth/logging via Next.js API routes.

## Rules

- API route location: `src/app/api/admin/*/route.ts`
- Token/header utils: `getTokenHeader`, `withActivityHeaders`
- Call utils: `fetchEitherWithHeaders`, `toNextResponse`

## Notes

- See `.claude/PROJECT.md` for activity log header rules.
- Client calls should use `/api/admin/*` only.
