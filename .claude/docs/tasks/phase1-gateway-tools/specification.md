# Phase 1 Gateway Protocol & Tools Specification

## 목적
Phase 1 도구 4종(Browser, system.run, HTTP, File I/O)을 "몰트봇 스타일"로 구현하기 위한 Gateway WebSocket 프로토콜 및 도구 스펙.

## 핵심 요구사항

### 아키텍처
- **Gateway 단일 진입점**: WebSocket 서버 (ws://127.0.0.1:18789)
- **스키마 기반 도구 호출**: 인자 검증 후 결과 반환
- **노드+승인 시스템**: system.run은 로컬 노드가 제공, approvals로 통제
- **보안 기본값**: loopback bind + 토큰 인증

### 도구 4종
1. **Browser Tool (Playwright)**: 웹 제어 (start, goto, snapshot, act, screenshot)
2. **Desktop Tool (system.run)**: OS 명령 실행 (승인 필수)
3. **HTTP Connector**: API 요청 (SSRF 방지)
4. **File I/O**: 파일 읽기/쓰기 (workspaceRoot 제한)

### 보안 체크리스트
- [ ] Gateway loopback bind
- [ ] 토큰 인증
- [ ] system.run approvals 필수
- [ ] File I/O workspaceRoot 밖 차단
- [ ] HTTP localhost/사설망 차단
- [ ] Audit log (세션ID 포함)

## 참조
- 전체 스펙: [specification-full.md](archives/specification-full.md)
- 지난 작업: [day-2025-01-28.md](../local-ai-agent/session-logs/day-2025-01-28.md)
