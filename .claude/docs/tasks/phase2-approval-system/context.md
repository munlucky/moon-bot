# Phase 2: Approval System (Lobster)

## Overview
승인 요청/대기/재개 흐름을 구현하여 위험 도구(system.run 등)의 실행을 사용자 승인에 연결합니다.

## Background
- **Phase 1 완료**: ApprovalManager 기본 구조 생성됨
- **현재 상태**: 승인 로직은 있으나 UI/플로우 연동 필요
- **다음**: Discord/CLI 승인 UI 연동

## Requirements

### Functional Requirements
1. **승인 요청 플로우**
   - 위험 도구 호출 시 자동 승인 요청
   - Surface(Discord/CLI)로 승인 메시지 발송
   - 타임아웃 설정 (기본 5분)

2. **승인 대기 상태 관리**
   - Invocation 상태: `awaiting_approval`
   - 보류 중인 요청 목록 조회
   - 만료된 요청 자동 거절

3. **승인/거절 처리**
   - Surface에서 승인/거절 응답 수신
   - 승인 시 도구 재실행
   - 거절 시 에러 반환

4. **채널별 승인 UI 연동**
   - Discord: Embed 메시지 + 버튼
   - CLI: 대화형 프롬프트
   - WebSocket: 실시간 이벤트

### Non-Functional Requirements
- **보안**: 승인 토큰 UUID로 생성, 위조 방지
- **신뢰성**: 승인 대기 목록 영구 저장
- **성능**: 승인 응답 100ms 이내 처리

## Technical Architecture

### Components
```
┌─────────────────────────────────────────────────────────┐
│                   Surface Layer                         │
├─────────────┬─────────────┬─────────────┬──────────────┤
│  Discord    │    CLI      │  WebSocket  │  Future UI   │
│  Channel    │  Commands   │   Events    │              │
└──────┬──────┴──────┬──────┴──────┬──────┴──────────────┘
       │             │             │
       └─────────────┼─────────────┘
                     │
       ┌─────────────▼─────────────┐
       │   Approval Flow Manager    │
       │  - requestApproval()       │
       │  - handleResponse()        │
       │  - expirePending()         │
       └─────────────┬─────────────┘
                     │
       ┌─────────────▼─────────────┐
       │     ApprovalManager        │
       │  - checkApproval()         │
       │  - persistRule()           │
       └─────────────┬─────────────┘
                     │
       ┌─────────────▼─────────────┐
       │      ToolRuntime          │
       │  - invoke()               │
       │  - approveRequest()        │
       └───────────────────────────┘
```

### Data Flow
```
1. Tool Invoke (system.run)
   ↓
2. ApprovalManager.checkApproval() → not approved
   ↓
3. Flow Manager.requestApproval()
   ↓
4. Surface Notification (Discord/CLI/WS)
   ↓
5. User Response
   ↓
6. Flow Manager.handleResponse()
   ↓
7. ToolRuntime.approveRequest(true)
   ↓
8. Tool Re-execution
```

## Implementation Plan

### Files to Create (7)
```
src/tools/approval/
  ├─ ApprovalFlowManager.ts      # 승인 플로우 코디네이터
  ├─ ApprovalStore.ts             # 승인 대기 목록 저장소
  ├─ handlers/
  │   ├─ discord-approval.ts      # Discord 승인 UI
  │   ├─ cli-approval.ts          # CLI 승인 UI
  │   └─ ws-approval.ts           # WebSocket 승인 이벤트
  └─ types.ts                     # 승인 관련 타입

src/channels/
  └─ discord-approval.ts          # Discord 승인 핸들러 (확장)
```

### Files to Modify (4)
- `src/tools/runtime/ApprovalManager.ts` - 플로우 매니저 연동
- `src/tools/runtime/ToolRuntime.ts` - 승인 요청 이벤트 발행
- `src/gateway/handlers/tools.handler.ts` - 승인 응답 핸들러
- `src/channels/discord.ts` - 승인 메시지 처리

## Acceptance Tests

### T1: 승인 요청 생성
- Given: system.run 호출, 승인 필요
- When: ApprovalFlowManager.requestApproval()
- Then: UUID 생성, Surface 알림 발송

### T2: Discord 승인 UI
- Given: 승인 요청 대기 중
- When: Discord Embed 전송
- Then: 버튼 [허용] [거부] 표시

### T3: CLI 승인 UI
- Given: 승인 요청 대기 중
- When: CLI 프롬프트 표시
- Then: Y/N 입력 대기

### T4: 승인 후 재실행
- Given: 승인 요청 승인됨
- When: ToolRuntime.approveRequest(true)
- Then: 도구 재실행, 결과 반환

### T5: 거절 처리
- Given: 승인 요청 거부됨
- When: ToolRuntime.approveRequest(false)
- Then: ERR_FORBIDDEN 반환

### T6: 타임아웃 처리
- Given: 승인 요청 5분 경과
- When: expirePending() 실행
- Then: 자동 거절, 상태 갱신

## Integration Points

1. **ToolRuntime.invoke()**
   - 승인 필요 시 `approval.requested` 이벤트 발행
   - 반환: `{ invocationId, awaitingApproval: true }`

2. **Discord Channel**
   - 승인 요청 수신 → Embed 메시지 전송
   - 버튼 클릭 → approval.respond RPC 호출

3. **CLI Commands**
   - `moltbot approvals list` - 대기 목록
   - `moltbot approvals approve <id>` - 승인
   - `moltbot approvals deny <id>` - 거부

4. **Gateway WebSocket**
   - `approval.requested` 이벤트 브로드캐스트
   - `approval.respond` 메서드 등록

## Security Considerations

- 승인 토큰은 UUID v4 (예측 불가능)
- 승인 유효시간 5분 (configurable)
- Surface 인증된 사용자만 승인 가능
- 승인 로그 영구 저장 (audit trail)

## Open Questions

| 질문 | 상태 |
|------|------|
| Discord 버튼 커스텀 ID 포맷 | pending |
| CLI 승인 시 비밀번호 입력 여부 | pending |
| 다중 사용자 동시 승인 처리 | pending |

## References
- Phase 1 context: `../phase1-gateway-tools/context.md`
- Spec: `agent_system_spec.md` (Lobster Approval System)
- PRD: `local_ai_agent_prd.md` (Phase 2)
