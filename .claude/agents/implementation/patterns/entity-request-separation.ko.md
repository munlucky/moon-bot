# Entity-Request Separation Pattern

## Purpose

- 응답(Entity) 타입과 요청(Request) 타입을 분리해 타입 안정성을 확보합니다.

## Rules

- Entity 타입: `src/app/_entities/{feature}/types.ts`
- Request 타입: `src/app/_requests/{feature}/types.ts`
- 응답 매핑 로직은 `_fetch/`에서 수행합니다.

## Notes

- snake_case → camelCase 변환은 매핑 함수에서 처리합니다.
- 세부 규칙은 `.claude/PROJECT.md`를 참조합니다.
