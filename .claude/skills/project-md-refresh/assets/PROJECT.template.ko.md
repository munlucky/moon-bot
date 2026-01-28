# PROJECT.md

## 프로젝트 개요
- **이름**: [프로젝트 이름]
- **스택**: [프레임워크, 런타임, 라이브러리]
- **기본 언어**: [언어]

## 핵심 규칙 (필수)
1. [규칙 또는 컨벤션]
2. [규칙 또는 컨벤션]
3. [규칙 또는 컨벤션]

## 디렉터리 구조
```
[프로젝트 루트]/
  [주요 디렉터리]/
    [하위 디렉터리]/
  [주요 디렉터리]/
```

## 주요 패턴
- **API 라우팅**: [라우트/컨트롤러 위치]
- **에러 처리**: [에러 처리 패턴]
- **명명 규칙**: [네이밍 규칙]
- **로깅/텔레메트리**: [로깅 규칙]

## API/데이터 모델 패턴
- **API 도메인**: [주요 API 영역]
- **공용 유틸리티**: [공용 헬퍼/클라이언트]
- **클라이언트 사용**: [클라이언트 호출 방식]
- **데이터 모델**: [엔티티/DTO/요청-응답 구조]

## 인증/보안
- **인증 방식**: [JWT/Session/OAuth 등]
- **권한 모델**: [역할/권한]
- **미들웨어**: [인증 미들웨어 위치]

## 문서 경로
> `tasksRoot`는 CLAUDE.md에서 설정. 기본값: `.claude/docs/tasks`

- `{agreementsRoot}/{feature-name}-agreement.md`
- `{tasksRoot}/{feature-name}/context.md`
- `{tasksRoot}/{feature-name}/design-spec.md`
- `{tasksRoot}/{feature-name}/pending-questions.md`
- `{tasksRoot}/{feature-name}/session-logs/day-{YYYY-MM-DD}.md`

## 명령어
- **Dev**: `[command]`
- **Build**: `[command]`
- **Lint**: `[command]`
- **Test**: `[command]`
- **Typecheck**: `[command]`

## 환경
- **필수 환경 변수**: [주요 변수]
- **로컬 설정**: [설정 단계]

## 변경 로그
```
[YYYY-MM-DD] = "[변경 요약]"
```
