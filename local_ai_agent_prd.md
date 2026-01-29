# Moltbot 프레임워크 기반 로컬 우선주의 AI 에이전트 시스템 PRD

> **문서 버전**: 2.0 (2026-01-29 현행화)
> **기술 사양서**: `agent_system_spec.md`

## 1. 제품 정의 및 아키텍처 철학

본 시스템은 사용자의 로컬 환경에 상주하는 **게이트웨이(Gateway)** 를 중심으로 동작하는 **Local-first** 에이전트 플랫폼이다. Moltbot의 아키텍처를 기반으로, 실행 주체인 Gateway와 인터페이스 역할의 Channel/Surface를 분리하며, 사용자가 자신의 데이터 소유권과 실행 통제권을 유지할 수 있도록 설계되었다.

### 1.1 핵심 설계 원칙
- **Gateway 중심 제어**: WebSocket(기본 포트 18789) 기반의 JSON-RPC 프로토콜로 세션, 채널, 노드, 훅을 통합 관리.
- **Surface 추상화**: Discord, Slack, Telegram, CLI 등 다양한 채널을 표면으로 사용하는 멀티 서피스 구조.
- **보안 가드레일**: 인증 토큰이 없거나 설정되지 않은 경우 외부 포트 바인딩을 차단하는 Fail-closed 정책 적용.

### 1.2 구현 현황 요약 (2026-01-29)

| 컴포넌트 | 상태 | 비고 |
|---------|------|------|
| Gateway | ✅ 완료 | WebSocket 서버, JSON-RPC, TaskOrchestrator 통합 |
| Discord 채널 | ✅ 완료 | ChannelGatewayClient 통합, 자동 재연결 |
| CLI | ✅ 완료 | channel, config, gateway, logs, doctor, call, pairing, approvals |
| Task Orchestrator | ✅ 완료 | 채널별 큐, 상태 관리, 승인 플로우 |
| Tools (5종) | ✅ 완료 | Browser, HTTP, Desktop, Filesystem |
| Sessions | ✅ 완료 | JSONL 저장, SessionKey, 컴팩션 |
| Auth | ✅ 완료 | 페어링, 토큰 해시 검증, 리플레이 방지 |
| Cron | 🔶 부분 | 스케줄링 구현, Agent 연동 미완 |
| Agents (Planner) | 🔶 부분 | 규칙 기반, LLM 연동 미구현 |
| 기타 채널 (Slack 등) | ❌ 미구현 | 로드맵 참조 |


## 2. 인터페이스 레이어: 멀티 서피스 전략

### 2.1 채널 어댑터 구조

| 채널 | 상태 | 파일 위치 |
|------|------|----------|
| Discord | ✅ 구현 | `src/channels/discord.ts` |
| Slack | ❌ 미구현 | - |
| Telegram | ❌ 미구현 | - |
| CLI | ✅ 구현 | `src/cli/` |

- 각 채널은 `ChannelGatewayClient`를 통해 Gateway와 WebSocket 연결
- `chat.send` RPC로 메시지 전송, `chat.response` notification으로 응답 수신
- 자동 재연결 (exponential backoff, 최대 10회)

### 2.2 보안 정책
- **DM 페어링**: 미승인 사용자의 접근 차단, CLI 승인 흐름 요구 (`moonbot pairing approve <code>`)
- **Mention Gating**: 그룹 채팅에서 `@agent` 언급 시에만 활성화되어 불필요한 추론 방지
- **토큰 마스킹**: CLI 출력 시 토큰 앞 6자리 + ... + 뒤 4자리로 마스킹


## 3. 에이전트 인지 및 실행 엔진

### 3.1 Planner–Executor–Replanner 모델

| 컴포넌트 | 파일 위치 | 상태 |
|---------|----------|------|
| Planner | `src/agents/planner.ts` | 🔶 규칙 기반 (LLM 연동 미구현) |
| Executor | `src/agents/executor.ts` | ✅ 완료 (Replanner 통합) |
| Replanner | `src/agents/replanner/` | ✅ 완료 |

**Replanner 서브모듈:**
- `FailureAnalyzer.ts`: 실패 원인 분석
- `AlternativeSelector.ts`: 대체 도구 선택
- `PathReplanner.ts`: 경로 재계획
- `RecoveryLimiter.ts`: 복구 시도 제한

### 3.2 오류 보고 및 복구
- 실행 실패 시 CLI 로그 또는 채널 메시지로 사용자에게 원인 보고
- 도구 fallback 시나리오 (예: API 실패 시 browser.open 시도) 구현
- **에러 포맷 분리**: `userMessage` (채널 전송) vs `internalMessage` (로그용)

### 3.3 TODO: LLM 연동
현재 Planner는 규칙 기반으로 동작하며, 실제 LLM 호출은 미구현 상태:
```typescript
// src/agents/planner.ts:26-27
// In production, this would call an LLM to generate the plan
```


## 4. 도구 시스템 (ToolKit)

### 4.1 도구 레지스트리 구조
- JSON Schema 기반 계약(Contract) 구조
- `toolkit.register({ id, schema, run })` 방식으로 정의
- TypeBox 사용, 평탄화된 구조 권장
- **ToolRuntime**: 도구 실행 런타임 (`src/tools/runtime/ToolRuntime.ts`)

### 4.2 구현된 도구 목록

| 카테고리 | 도구 ID | 파일 위치 | 상태 |
|---------|--------|----------|------|
| **Browser** | browser.open, browser.screenshot 등 | `src/tools/browser/BrowserTool.ts` | ✅ |
| **Desktop** | system.run, system.run.raw | `src/tools/desktop/SystemRunTool.ts` | ✅ |
| **HTTP** | http.request, http.download | `src/tools/http/HttpTool.ts` | ✅ |
| **Filesystem** | file.read, file.write, file.list, file.glob | `src/tools/filesystem/FileIOTool.ts` | ✅ |

**보안 컴포넌트:**
- `SsrfGuard.ts`: SSRF 방지
- `PathValidator.ts`: 경로 검증 (디렉토리 탈출 방지)
- `CommandSanitizer.ts`: 명령어 필터링 (allowlist/denylist)

### 4.3 승인 시스템 (Approval Flow)

| 컴포넌트 | 파일 위치 | 설명 |
|---------|----------|------|
| ApprovalFlowManager | `src/tools/approval/ApprovalFlowManager.ts` | 승인 흐름 관리 |
| ApprovalStore | `src/tools/approval/ApprovalStore.ts` | 승인 상태 저장 |
| ApprovalManager | `src/tools/runtime/ApprovalManager.ts` | 런타임 통합 |

**승인 핸들러:**
- `cli-approval.ts`: CLI 기반 승인 ✅
- `ws-approval.ts`: WebSocket 기반 승인 ✅
- `discord-approval.ts`: Discord 승인 🔶 (TODO: 메시지 전송 미구현)

**RPC 핸들러:**
- `approval.grant`: 승인/거부 처리
- `approval.list`: 대기 중 승인 목록

**Task 상태와 연동:**
- `PAUSED`: 승인 대기 상태
- `ABORTED`: 승인 거부 시


## 5. 세션 및 협업 체계

### 5.1 세션 저장 구조
- **저장 경로**: `~/.moonbot/sessions/<sessionId>.jsonl` (설정 가능)
- **SessionKey 형식**: `agent:<agentId>:session:<key>` (Moltbot 호환)
- 로그에는 대화, 사고 과정, 도구 호출, 오류 메시지가 포함

**구현 파일:**
- `src/sessions/manager.ts`: SessionManager
- `src/sessions/SessionKey.ts`: SessionKey 유틸리티

### 5.2 세션 공유 및 전달
- `sessions.send`를 통해 다른 에이전트 또는 채널로 컨텍스트 전달 가능
- 세션별 고유 ID, 사용자/채널 기준 격리 운영
- **페이지네이션 지원**: `listPaginated(page, pageSize)` (최대 500개/페이지)

### 5.3 컴팩션 및 리플레이
- **컴팩션**: 50개 이상 메시지 시 최근 50개만 유지 (`session.compact()`)
- 세션 리플레이 기능으로 특정 시점 디버깅 및 분석 가능


## 6. 자동화 및 크론 시스템

### 6.1 예약 실행 구조
- **구현 파일**: `src/cron/manager.ts`
- `cron.list`, `cron.edit`, `cron.run` 명령을 통해 주기 작업 관리
- 메시지 발화, 상태 점검, 주기 리포트 전송 자동화

**스케줄 형식**: `HH:MM` (매일 해당 시각 실행)

### 6.2 하트비트 및 이벤트 기반 발화
- Active hours 설정, 상태 변화 감지 시 Proactive 메시지 발송

### 6.3 TODO: Agent 연동
현재 CronManager는 스케줄링만 구현되어 있으며, 실제 Agent 호출은 미구현:
```typescript
// src/cron/manager.ts:104
// TODO: Send task to agent
```


## 7. 운영 및 CLI 관리 도구

### 7.1 구현된 CLI 명령

| 명령 | 파일 | 설명 |
|------|------|------|
| `moonbot gateway status/start/stop/restart` | `src/cli/commands/gateway.ts` | Gateway 관리 |
| `moonbot logs --follow` | `src/cli/commands/logs.ts` | 실시간 로그 스트리밍 |
| `moonbot doctor` | `src/cli/commands/doctor.ts` | 보안/권한 진단 |
| `moonbot call <rpc>` | `src/cli/commands/call.ts` | 직접 RPC 호출 |
| `moonbot pairing approve <code>` | `src/cli/commands/pairing.ts` | 사용자 승인 |
| `moonbot channel add/remove/list/enable/disable` | `src/cli/commands/channel.ts` | 채널 관리 |
| `moonbot config import/export/path` | `src/cli/commands/config.ts` | 설정 관리 |
| `moonbot approvals list/approve/deny` | `src/cli/commands/approvals.ts` | 승인 관리 |

### 7.2 개발 환경
- Node.js 22+, TypeScript(ESM)
- **테스트 프레임워크**: Vitest
- **빌드/린트**: `pnpm build`, `pnpm lint`
- **테스트 실행**: `pnpm test`, `pnpm test:run`, `pnpm test:coverage`

### 7.3 npm 스크립트
```bash
pnpm cli        # CLI 실행 (node dist/cli.js)
pnpm discord    # Discord 봇 실행 (node dist/discord-bot.js)
```


## 8. Task Orchestrator 및 채널 독립성

### 8.1 Task Orchestrator 구현 현황

Task Orchestrator는 Gateway와 Agent 사이에서 **작업 실행을 조율**하는 핵심 컴포넌트입니다:

```
Channel → Gateway → Task Orchestrator → Agent (Planner/Executor)
                          ↓
                    Task Queue (PerChannelQueue)
                    Task State (TaskRegistry)
                    Result Routing (chat.response)
```

**구현 파일:**
| 컴포넌트 | 파일 위치 | 테스트 |
|---------|----------|--------|
| TaskOrchestrator | `src/orchestrator/TaskOrchestrator.ts` | 36개 단위 테스트 |
| TaskRegistry | `src/orchestrator/TaskRegistry.ts` | ✅ |
| PerChannelQueue | `src/orchestrator/PerChannelQueue.ts` | 42개 단위 테스트 |

**주요 기능:**
- Task 생성 및 상태 관리 (PENDING → RUNNING → DONE/FAILED/PAUSED/ABORTED)
- Per-channel FIFO 큐 (채널 간 병렬, 채널 내 순서 보장)
- 승인 이벤트 핸들링 (`onApprovalRequest`, `onApprovalResolved`)
- Task 중단 (`abortTask`)
- SessionKey를 통한 세션-태스크 매핑

### 8.2 채널 독립성 원칙

채널은 **순수한 입출력 뷰**로 설계됩니다:

1. **상태 무관성**: 채널은 Task 상태를 저장하지 않음
2. **교체 가능성**: 동일 Task에 여러 채널이 연결될 수 있음
3. **단방향 의존**: 채널 → Gateway 방향의 의존만 존재

```
Discord ─┐
Slack ───┼→ Gateway → Task → Agent
CLI ─────┘
```

### 8.3 다중 채널 Observer 패턴

하나의 Task 실행 결과를 여러 채널에서 관찰할 수 있습니다:

```typescript
// 예시: Task 완료 시 모든 등록된 채널에 브로드캐스트
task.on('complete', (result) => {
  for (const channelId of task.observers) {
    gateway.sendToChannel(channelId, result);
  }
});
```

**활용 시나리오:**
- Discord에서 시작한 작업을 CLI에서도 모니터링
- 장시간 작업 결과를 여러 채널에 동시 알림
- 채널 간 컨텍스트 공유

---

## 9. 향후 로드맵

### 9.1 TODO 항목 (코드베이스에서 발견)

| 위치 | TODO 내용 | 우선순위 |
|------|----------|---------|
| `src/agents/planner.ts:26` | LLM 연동 (현재 규칙 기반) | P0 |
| `src/agents/executor.ts:269` | Approval flow 구현 | P1 |
| `src/cron/manager.ts:104` | Agent로 task 전송 | P1 |
| `src/tools/approval/handlers/discord-approval.ts:212` | Discord 메시지 전송 | P2 |
| `src/tools/desktop/CommandSanitizer.ts:79` | 새 명령어 추가 (보안 검토 후) | P3 |

### 9.2 기술 발전 방향
- **멀티 에이전트 슬롯**: 하나의 Gateway에서 성격/역할이 다른 에이전트 동시 운영
- **로컬 소형 모델 연동(sLLM)**: 기본 요약, 감정 분석 등은 오프라인 모델 처리
- **MCP 지원**: 외부 도구를 Skill 형태로 등록 및 동적 확장
- **Web Companion UI**: 현재 세션/로그 뷰어 제공

### 9.3 미구현 채널 어댑터
- Slack (`src/channels/slack/`) - 미구현
- Telegram - 미구현
- WhatsApp - 미구현

---

본 설계는 Moltbot의 철학을 계승하면서도 실질적인 로컬 제어력과 유연한 확장을 모두 갖춘 Sovereign AI Agent 시스템을 지향한다.

