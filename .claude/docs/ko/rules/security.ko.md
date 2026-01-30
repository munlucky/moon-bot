# 보안 가이드라인

## 필수 보안 체크리스트

커밋 전 반드시 확인:
- [ ] 하드코딩된 시크릿 없음 (API 키, 비밀번호, 토큰)
- [ ] 모든 사용자 입력 검증됨
- [ ] SQL 인젝션 방지 (파라미터화된 쿼리)
- [ ] XSS 방지 (HTML 이스케이프)
- [ ] CSRF 보호 활성화
- [ ] 인증/권한 확인됨
- [ ] 민감 정보 노출 없는 에러 메시지

## 시크릿 관리

```typescript
// ❌ 절대 금지: 하드코딩된 시크릿
const apiKey = "sk-proj-xxxxx"

// ✅ 항상 사용: 환경 변수
const apiKey = process.env.OPENAI_API_KEY

if (!apiKey) {
  throw new Error('OPENAI_API_KEY not configured')
}
```

## 보안 이슈 대응 프로토콜

보안 이슈 발견 시:
1. 즉시 작업 중단
2. CRITICAL 이슈 우선 해결
3. 노출된 시크릿 로테이션
4. 유사 이슈 전체 코드베이스 검토

## Memory MCP 보안

Memory MCP 사용 시 주의사항:
- **민감 정보 저장 금지**: 비밀번호, API 키, 개인정보 등을 메모리에 저장하지 마세요
- **Git 관리**: `.claude/memory.json`은 `.gitignore`에 추가 권장
- **용량 관리**: 대용량 데이터보다는 핵심 컨텍스트 위주로 저장
