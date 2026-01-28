# Moonbot Development Roadmap

## Overview
Local-first AI Agent System 구현을 위한 4단계 로드맵입니다.

## Progress Summary

| Phase | Status | Files | Completion |
|-------|--------|-------|------------|
| **Phase 1** | ✅ Complete | 21 | 100% |
| **Phase 2** | 🔵 Pending | ~7 | 0% |
| **Phase 3** | 🔵 Pending | ~10 | 0% |
| **Phase 4** | 🔵 Pending | ~6 | 0% |

---

## Phase 1: Gateway Tools (✅ Complete)

**목표**: 도구 4종 실제 구현 (Browser, Desktop, HTTP, File I/O)

**상세**: [phase1-gateway-tools/context.md](phase1-gateway-tools/context.md)

### 구현 완료
- ✅ ToolRuntime (레지스트리, 검증, 실행)
- ✅ SchemaValidator (Zod 기반)
- ✅ ApprovalManager (승인 관리 기본)
- ✅ File I/O Tool (read, write, list, glob)
- ✅ HTTP Connector (SSRF 방지 포함)
- ✅ Desktop Tool (system.run, 승인 연동)
- ✅ Browser Tool (Playwright, 7개 작업)

### 검증
- ✅ TypeScript 빌드 성공
- ✅ 보안 이슈 5건 수정 완료

### 다음 단계
→ Phase 2: 승인 플로우 UI 연동

---

## Phase 2: Approval System (🔵 Pending)

**목표**: 승인 요청/대기/재개 흐름 구현

**상세**: [phase2-approval-system/context.md](phase2-approval-system/context.md)

### 주요 작업
1. ApprovalFlowManager (승인 플로우 코디네이터)
2. Discord 승인 UI (Embed + 버튼)
3. CLI 승인 UI (Y/N 프롬프트)
4. WebSocket 승인 이벤트

### 의존성
- Phase 1 완료 필요 ✅

### 예상 소요시간
- 1주 (7개 파일)

---

## Phase 3: CLI Implementation (🔵 Pending)

**목표**: CLI 명령어 실제 구현

**상세**: [phase3-cli-implementation/context.md](phase3-cli-implementation/context.md)

### 주요 작업
1. Gateway 관리 명령 (status, start, stop, restart)
2. 로그 조회 명령 (logs --follow)
3. 진단 명령 (doctor --fix)
4. RPC 직접 호출 (gateway call)
5. 페어링 명령 (pairing approve)
6. 승인 명령 (approvals list/approve/deny)

### 의존성
- Phase 2 완료 필요 (승인 명령)

### 예상 소요시간
- 2주 (10개 파일)

---

## Phase 4: Replanner Logic (🔵 Pending)

**목표**: 실패 감지, 대체 도구 선택, 경로 재계획

**상세**: [phase4-replanner/context.md](phase4-replanner/context.md)

### 주요 작업
1. FailureAnalyzer (실패 분류)
2. AlternativeSelector (대체 도구 선택)
3. PathReplanner (경로 재계획)
4. RecoveryLimiter (복구 한도)

### 의존성
- Phase 1 완료 필요 ✅
- Phase 3 완료 권장 (CLI 재시작)

### 예상 소요시간
- 1주 (6개 파일)

---

## Dependency Graph

```
Phase 1 (Tools)
    ↓
Phase 2 (Approvals) ←─┐
    ↓                  │
Phase 3 (CLI) ─────────┘
    ↓
Phase 4 (Replanner) ← Phase 1 (Tools)
```

## Total Estimates

| Phase | Files | Time | Priority |
|-------|-------|------|----------|
| Phase 1 | 21 | 3h | ✅ Done |
| Phase 2 | ~7 | 1주 | HIGH |
| Phase 3 | ~10 | 2주 | MEDIUM |
| Phase 4 | ~6 | 1주 | MEDIUM |
| **Total** | **~44** | **~4주** | |

## Session Logs

- [2025-01-28](phase1-gateway-tools/session-logs/day-2025-01-28.md) - Phase 1 구현 세션

## Flow Reports

- [Phase 1 Flow Report](phase1-gateway-tools/flow-report.md)
