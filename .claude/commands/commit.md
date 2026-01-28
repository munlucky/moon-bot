---
description: Changes를 확인하고 Memory를 현행화한 후 커밋을 수행합니다.
argument-hint: [context]
allowed-tools: Bash(git status:*), Bash(git add:*), Bash(git diff:*), Bash(git commit:*), Bash(git log:*), Bash(jq:*), Bash(basename:*), mcp__memory__create_entities, mcp__memory__add_observations, mcp__memory__create_relations, mcp__memory__search_nodes, mcp__memory__open_nodes
---

# 커밋 및 프로젝트 메모리 현행화

## 개요
이 명령어는 메인 세션에서 실행되며, 변경사항을 분석하고 전역 Memory MCP에 프로젝트 메모리(`[ProjectID]::*`)를 현행화합니다.

## 1. 변경사항 분석
```bash
git status
git diff --cached --stat
git log -3 --oneline
```

## 2. 프로젝트 ID 확인
```bash
# 우선순위: package.json > 디렉토리명 > git remote
PROJECT_ID=$(cat package.json 2>/dev/null | jq -r '.name // empty' || basename $(pwd))
```

## 3. 변경 파일 분석
```bash
git diff --cached --name-only
```

변경 파일에서 다음 정보 추출:
- 컴포넌트 이름 (from paths like `src/components/Button.tsx`)
- 도메인 영역 (from paths like `src/domains/user/`)
- API 엔드포인트 (from API-related files)
- 코딩 패턴 (반복되는 구조)

## 4. 3단계 경계 현행화

### 기존 경계 확인
`search_nodes`로 `[PROJECT_ID]::Boundary::*` 검색

### 경계가 없는 경우 (첫 사용)
기본 경계 생성:
```
create_entities([
  { name: "[PROJECT_ID]::Boundary::AlwaysDo", entityType: "boundary", observations: ["커밋 전 lint 실행", "테스트 통과 확인"] },
  { name: "[PROJECT_ID]::Boundary::AskFirst", entityType: "boundary", observations: ["새 의존성 추가", "DB 스키마 변경"] },
  { name: "[PROJECT_ID]::Boundary::NeverDo", entityType: "boundary", observations: [".env 파일 커밋", "기존 테스트 삭제"] }
])
```

### 새로운 경계 발견 시 추가
변경사항 분석 중 다음을 발견하면 해당 경계에 추가:

| 발견 내용 | 추가 대상 |
|----------|----------|
| 필수 실행 명령어 | `[PROJECT_ID]::Boundary::AlwaysDo` |
| 승인 필요 패턴 | `[PROJECT_ID]::Boundary::AskFirst` |
| 금지 패턴 | `[PROJECT_ID]::Boundary::NeverDo` |

예시:
```
# CI에서 반드시 실행해야 하는 명령어 발견 시
add_observations("[my-app]::Boundary::AlwaysDo", ["npm run build 전 npm run lint 필수"])
```

## 5. 도메인/컴포넌트 메모리 현행화

### 엔티티 생성/업데이트 규칙

| 변경 유형 | 액션 |
|----------|------|
| 새 컴포넌트 파일 | `create_entities`로 `[PROJECT_ID]::Component::[Name]` 생성 |
| 기존 컴포넌트 수정 | `add_observations`로 변경 내용 추가 |
| API 엔드포인트 추가/변경 | `[PROJECT_ID]::API::[EndpointName]` 업데이트 |
| 도메인 로직 변경 | `[PROJECT_ID]::Domain::[DomainName]` 업데이트 |

### 관계 설정
컴포넌트 간 의존관계 발견 시:
```
create_relations([{
  from: "[my-app]::Component::Button",
  to: "[my-app]::Component::ThemeContext",
  relationType: "uses"
}])
```

## 6. 코딩 규약 현행화

반복되는 패턴 발견 시 `[PROJECT_ID]::Convention::[Name]`으로 등록:
- 네이밍 규칙 (예: 컴포넌트는 PascalCase)
- 파일 구조 패턴 (예: feature-based structure)
- 에러 처리 패턴 (예: try-catch with logging)
- API 응답 형식 (예: { success, data, error })

## 7. 현행화 요약 출력
현행화 완료 후 변경 내용 요약:
```markdown
### 프로젝트 메모리 현행화 완료

**프로젝트**: {PROJECT_ID}

**생성된 엔티티:**
- [proj]::Component::NewComponent

**업데이트된 엔티티:**
- [proj]::Component::Button (새 prop 추가됨)

**새 관계:**
- Button → ThemeContext (uses)

**경계 업데이트:**
- AlwaysDo: +1 항목
```

## 8. 커밋 생성

```bash
git add [files]
git commit -m "[간결한 한글 커밋 메시지]"
```

**커밋 메시지 규칙:**
- 이모지, 특수문자 제외
- 간결하고 명확하게
- 변경 목적 중심

---

사용자 컨텍스트: $ARGUMENTS
