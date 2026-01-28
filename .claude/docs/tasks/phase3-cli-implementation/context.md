# Phase 3: CLI Implementation

## Overview
CLI 명령어를 실제 구현하여 Gateway 관리, 로그 조회, 진단, 승인 기능을 제공합니다.

## Background
- **현재 상태**: `src/cli.ts` 기본 구조만 존재
- **기존**: `start` 명령만 구현됨
- **Phase 2 의존**: 승인 관련 명령은 Phase 2 완료 후 필요

## Requirements

### CLI Commands (PRD 기준)

#### Gateway Management
```bash
moltbot gateway status    # Gateway 상태 확인
moltbot gateway start     # Gateway 시작
moltbot gateway stop      # Gateway 중지
moltbot gateway restart   # Gateway 재시작
```

#### Logs
```bash
moltbot logs --follow     # 실시간 로그 조회 (tail -f)
moltbot logs --lines 100  # 최근 100줄
moltbot logs --error      # 에러 로그만
```

#### Doctor (Diagnosis)
```bash
moltbot doctor             # 시스템 진단
moltbot doctor --fix       # 자동 수정 시도
```

#### Gateway RPC (Direct Call)
```bash
moltbot gateway call <rpc>          # RPC 직접 호출
moltbot gateway call tools.list    # 도구 목록 조회
moltbot gateway call session.list  # 세션 목록
```

#### Pairing (Auth)
```bash
moltbot pairing status       # 페어링 상태
moltbot pairing approve <token>  # 페어링 승인
moltbot pairing revoke <id>      # 페어링 취소
```

#### Approvals (Phase 2)
```bash
moltbot approvals list       # 대기 중인 승인 목록
moltbot approvals approve <id>  # 승인
moltbot approvals deny <id>     # 거부
```

### Functional Requirements
1. **Command Structure**
   - Commander.js 또는 yargs 사용
   - 서브커맨드 계층 구조
   - 도움말 자동 생성

2. **Output Format**
   - JSON 모드 (`--json`): 프로그래밍 방식 사용
   - 테이블 모드 (기본): 사람이 읽기 쉬운 형식
   - Color 출력 (지원 시)

3. **Error Handling**
   - 사용자 친화적 에러 메시지
   - 종료 코드 표준 준수 (0=성공, 1=실패)

## Technical Architecture

### CLI Structure
```
moltbot/
├── gateway/
│   ├── status
│   ├── start
│   ├── stop
│   └── restart
├── logs/
│   ├── [--follow]
│   ├── [--lines N]
│   └── [--error]
├── doctor
│   └── [--fix]
├── gateway call <rpc>
├── pairing/
│   ├── status
│   ├── approve <token>
│   └── revoke <id>
└── approvals/
    ├── list
    ├── approve <id>
    └── deny <id>
```

### Implementation
```
src/cli/
├── index.ts                 # 메인 진입점
├── commands/
│   ├── gateway.ts           # gateway 관리 명령
│   ├── logs.ts              # 로그 조회 명령
│   ├── doctor.ts            # 진단 명령
│   ├── call.ts              # RPC 직접 호출
│   ├── pairing.ts           # 페어링 명령
│   └── approvals.ts         # 승인 명령 (Phase 2)
├── utils/
│   ├── output.ts            # 출력 포맷팅 (JSON/테이블)
│   └── rpc-client.ts        # Gateway RPC 클라이언트
└── types.ts                 # CLI 타입
```

## Implementation Plan

### Phase 3.1: Foundation (week 1)
1. CLI 프레임워크 선택 (Commander.js vs yargs)
2. 기본 구조 리팩토링
3. Output 포맷 유틸리티

### Phase 3.2: Gateway Commands (week 1)
1. `moltbot gateway status` - 프로세스 확인
2. `moltbot gateway start/stop/restart` - PID 관리

### Phase 3.3: Logs & Doctor (week 2)
1. `moltbot logs` - 파일 tail/watch
2. `moltbot doctor` - 진단 체크리스트

### Phase 3.4: RPC & Pairing (week 2)
1. `moltbot gateway call` - WebSocket RPC 직접 호출
2. `moltbot pairing` - 페어링 관리

### Phase 3.5: Approvals (week 3, Phase 2 의존)
1. `moltbot approvals list` - 대기 목록 조회
2. `moltbot approvals approve/deny` - 승인 처리

## Acceptance Tests

### T1: gateway status
- Given: Gateway 실행 중
- When: `moltbot gateway status`
- Then: "Running", PID, 포트 표시

### T2: logs --follow
- Given: 로그 파일 존재
- When: `moltbot logs --follow`
- Then: 실시간 새 줄 표시 (Ctrl+C 종료)

### T3: doctor --fix
- Given: 설정 파일 손상
- When: `moltbot doctor --fix`
- Then: 문제 감지 + 자동 수정 시도

### T4: gateway call tools.list
- Given: Gateway 실행 중
- When: `moltbot gateway call tools.list`
- Then: 도구 목록 JSON 또는 테이블 출력

### T5: pairing approve
- Given: 페어링 코드 생성됨
- When: `moltbot pairing approve <code>`
- Then: 페어링 승인 완료

### T6: approvals list
- Given: 대기 중인 승인 있음
- When: `moltbot approvals list`
- Then: 승인 목록 (ID, 도구, 요약) 표시

## Integration Points

1. **Gateway WebSocket**
   - RPC 직접 호출을 위한 WS 클라이언트
   - 인증 토큰 필요

2. **PID File**
   - Gateway 프로세스 시작/중지 관리
   - 경로: `~/.moonbot/gateway.pid`

3. **Log Files**
   - Gateway 로그 경로
   - 기본: `~/.moonbot/logs/gateway.log`

4. **Config File**
   - `~/.moonbot/config.yaml`
   - doctor 진단 시 확인

## Dependencies

| 패키지 | 용도 | 버전 |
|--------|------|------|
| commander | CLI 프레임워크 | ^12.0 |
| chalk | Color 출력 | ^5.0 |
| cli-table3 | 테이블 출력 | ^0.6 |
| ws | WebSocket 클라이언트 | ^8.0 |
| tail - Node | 로그 tail | ^2.2 |

## Security Considerations

- RPC 호출 시 인증 토큰 필요
- PID 파일 권한 확인 (user only)
- 로그 파일 민감 정보 마스킹

## Open Questions

| 질문 | 상태 |
|------|------|
| Gateway 프로세스 관리 방식 (PM2 vs 직접) | pending |
| 로그 파일 로테이션 여부 | pending |
| Windows 호환성 (PID 파일) | pending |

## References
- Phase 2 context: `../phase2-approval-system/context.md`
- PRD: `local_ai_agent_prd.md` (CLI Requirements)
