# API Proxy Pattern

## Purpose

- 백엔드 직접 호출을 금지하고 Next.js API 라우트를 통해 인증/로깅을 처리합니다.

## Rules

- API 라우트 위치: `src/app/api/admin/*/route.ts`
- 토큰/헤더 유틸: `getTokenHeader`, `withActivityHeaders`
- 호출 유틸: `fetchEitherWithHeaders`, `toNextResponse`

## Notes

- 활동 로그 헤더 규칙은 `.claude/PROJECT.md`를 참조합니다.
- 클라이언트 호출은 `/api/admin/*`만 사용합니다.
