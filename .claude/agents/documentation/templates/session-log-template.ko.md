# {YYYY-MM-DD} {feature-name} 세션 로그

> 프로젝트 규칙: `.claude/PROJECT.md`

## 세션 메타데이터

- 시작 시간: {HH:MM}
- 종료 시간: {HH:MM}
- 브랜치: {branch}
- 작업자: {userName}
- 복잡도: {simple|medium|complex}

## 타임라인

| 시간    | 단계           | 요약   | 산출물        |
| ------- | -------------- | ------ | ------------- |
| {HH:MM} | Requirements   | {요약} | agreement.md  |
| {HH:MM} | Context        | {요약} | context.md    |
| {HH:MM} | Implementation | {요약} | commit {hash} |
| {HH:MM} | Verification   | {요약} | verify 결과   |
| {HH:MM} | Documentation  | {요약} | session log   |

## 의사결정 로그

- {결정 사항} / 이유: {이유} / 대안: {대안}

## 이슈 로그

- {이슈/해결}

## 검증 결과

- `npx tsc --noEmit`: {결과}
- `npm run build`: {결과}
- `npm run lint`: {결과}

## 산출물

- 변경 파일: {요약}
- 커밋: {hash/메시지}

## 남은 작업

- [ ] {남은 작업}
