# {feature-name} 구현 계획

> 프로젝트 규칙: `.claude/PROJECT.md`

## 메타데이터

- 작업자: {userName}
- 작성일: {YYYY-MM-DD HH:MM}
- 브랜치: {branchName}
- 복잡도: {simple|medium|complex}
- 관련 문서: `.claude/docs/agreements/{feature-name}-agreement.md`

## 작업 개요

- 목적: {한 줄 요약}
- 범위: {포함/제외}
- 영향: {영향 범위}

## 변경 대상 파일

### 신규

- `path/to/new-file.tsx` - {설명}

### 수정

- `path/to/existing-file.ts` - {변경 요약}

## 현재 상태/유사 기능

- 유사 기능: `path/to/similar/feature.tsx`
- 재사용 패턴/컴포넌트: {목록}

## 구현 계획

### Phase 1: Mock/UI (필요 시)

1. 타입 정의 (`_entities/`, `_requests/`)
2. Mock 데이터/스켈레톤
3. UI/상태/이벤트 구현

### Phase 2: API 연동 (필요 시)

1. API 프록시 라우트
2. Fetch 함수 구현
3. 응답 매핑/포맷 변환

### Phase 3: Verification

1. `npx tsc --noEmit`
2. `npm run build`
3. `npm run lint`
4. `.claude/agents/verification/verify-changes.sh {feature-name}`

## 위험 및 대안

- 위험: {설명}
- 영향: {영향}
- 대안: {대안}

## 의존성

- API 스펙: {확정 여부}
- 메뉴/권한: {필요 여부}
- 기타: {외부 의존성}

## 체크포인트

- [ ] Phase 1 완료
- [ ] Phase 2 완료
- [ ] Phase 3 완료

## 남은 질문

- {질문 목록}
