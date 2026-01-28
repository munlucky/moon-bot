---
name: project-md-refresh
description: 현재 저장소를 분석해 .claude/PROJECT.md를 생성/갱신한다. PROJECT.md가 없거나 오래되었거나 프로젝트 규칙/구조/명령/아키텍처 업데이트 요청 시 사용.
---

# PROJECT.md 현행화

## 목표
정확한 근거를 바탕으로 `.claude/PROJECT.md`를 생성하거나 갱신합니다.

## 워크플로우
1. 기준 파일을 찾습니다.
   - `.claude/PROJECT.md`가 있으면 이를 기준으로 사용하고, 사용자 규칙은 유지하며 사실만 갱신합니다.
   - 없으면 `.claude/`를 만들고 `assets/PROJECT.template.md`를 `.claude/PROJECT.md`로 복사합니다.

2. 저장소에서 근거를 수집합니다.
   - `README.md`와 프로젝트 문서를 읽습니다.
   - 설정 파일로 스택을 파악합니다: `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `build.gradle`, `pom.xml`, `Gemfile`, `requirements.txt`, `Makefile`, `Taskfile`.
   - 스크립트/도구에서 run/build/test/lint 명령을 추출합니다.
   - 최상위 디렉토리 구조와 주요 엔트리포인트를 확인합니다.
   - API 라우트/컨트롤러와 데이터 모델을 찾습니다 (`route`, `router`, `controller`, `handler`, `model`, `schema` 검색).
   - 인증 설정을 찾습니다 (`auth`, `jwt`, `session`, `oauth` 검색).
   - 환경 변수 사용을 확인합니다 (`ENV`, `process.env`, `os.environ`, `dotenv` 검색).

3. `PROJECT.md` 섹션을 업데이트합니다.
   - 개요(이름, 스택, 기본 언어)를 채웁니다.
   - 핵심 규칙과 컨벤션을 요약합니다.
   - 디렉토리 구조(최상위 + 주요 하위)를 문서화합니다.
   - API/데이터 패턴, 인증, 문서 경로를 정리합니다.
   - dev/build/lint/test/typecheck 명령을 구체적으로 추가합니다.

4. 출력합니다.
   - `.claude/PROJECT.md`를 저장합니다.
   - 간단한 요약과 누락/질문을 제공합니다.

## 가드레일
- 내용을 추측하지 말고, 발견한 파일 근거만 사용합니다.
- 정보가 부족하면 TODO를 추가하거나 확인 질문을 합니다.
- 간결하고 프로젝트 맞춤형으로 유지합니다.
