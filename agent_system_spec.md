# Local-first AI Agent System - Technical Specification

이 문서는 'Moltbot 프레임워크 기반 로컬 우선 AI 에이전트 시스템 PRD'를 기반으로 실제 기능 구현을 위한 기술 사양(Specification)을 정의합니다.

---

## 1. 시스템 전반 구조

### 1.1 주요 디렉토리 구조 (TypeScript 기준)
```
/src
  /gateway            # Gateway WebSocket 서버 및 RPC 핸들러
  /channels
    /discord          # Discord 어댑터
    /slack            # Slack 어댑터 (선택적)
  /agents             # Planner / Executor 런타임
  /tools              # Tool 정의 및 레지스트리 등록
  /sessions           # 세션 저장/로드/전달
  /cron               # 예약 작업 관리
  /auth               # 페어링 승인, 인증 모듈
  /config             # 시스템 설정 로딩/검증
```

---

## 2. Gateway 사양

### 2.1 기본 구성
- 포트: `18789`
- 프로토콜: `JSON-RPC` (WebSocket)
- 인증: `Token / Password`, 설정 파일 기반

### 2.2 주요 RPC 메서드
- `connect`: 핸드셰이크 + client info 등록
- `chat.send`: Surface → Agent 메시지 전달
- `session.get` / `session.patch` / `session.send`
- `tool.run`: 실행 요청 (agent → toolkit)
- `logs.tail`: 실시간 로그 스트리밍

### 2.3 보안 정책
- 루프백 바인딩 우선 (외부는 인증 필수)
- config.gateways[].bind, allowFrom 구조화 필요


---

## 3. Channel Adapter 사양 (Discord)

### 3.1 의존성
- `discord.js`

### 3.2 주요 처리 흐름
- 메시지 수신 → `chat.send` RPC 호출
- 응답 수신 → Discord Markdown 메시지로 변환

### 3.3 인증 정책
- 환경변수: `DISCORD_BOT_TOKEN`
- 사용자 인증: DM Pairing / allowFrom 기반

### 3.4 특수 기능
- Mention Gating (Mentions 있을 때만 활성화)
- 첨부파일 자동 다운로드 → `/tmp/moltbot/`


---

## 4. Agent 사고 구조

### 4.1 Planner/Executor
- Planner: Prompt → Steps
- Executor: Step → Tool 실행 → 결과 수집
- Replanner: 실패 → 다른 Tool로 대체 시도

### 4.2 런타임 흐름
1. `chat.send` → agent.ts
2. planner.predictSteps(message)
3. for step in steps → tool.run
4. 결과 누적 → 응답 생성


---

## 5. Tool 정의 및 실행 구조

### 5.1 toolkit.register() 인터페이스
```ts
interface ToolSpec {
  id: string;
  schema: TypeBoxObject;
  run: (input: any, ctx: ToolContext) => Promise<any>;
}
```

### 5.2 도구 예시
- `/tools/browser.ts`: playwright.open(url)
- `/tools/api.ts`: fetch(url, method)
- `/tools/filesystem.ts`: read/write/delete

### 5.3 승인 정책 (Lobster)
- `requiresApproval: true` 옵션 존재
- 승인 흐름: step → pause → 채널 메시지 → 승인 후 재개


---

## 6. 세션 및 저장 구조

### 6.1 저장 위치
- 기본: `~/.clawdbot/agents/<agentId>/sessions/<sessionId>.jsonl`

### 6.2 JSONL 로그 포맷
```json
{ "type": "user", "text": "메시지" }
{ "type": "thought", "content": "도구 선택중" }
{ "type": "tool", "id": "browser.open", "args": {...} }
{ "type": "result", "output": "성공" }
```

### 6.3 세션 기능
- `session.new()` / `session.resume()`
- `session.send(targetAgentId)` → 세션 공유
- `session.compact()` → 메모리 최적화


---

## 7. Cron 시스템

### 7.1 스케줄 명령
- `cron.list()` / `cron.edit()` / `cron.remove()`

### 7.2 예시
```json
{
  "id": "morning-report",
  "agent": "clerk",
  "at": "09:00",
  "task": {
    "text": "오늘 스케줄 알려줘"
  }
}
```


---

## 8. Gateway vs Task Orchestrator 책임 분리

### 8.1 Gateway 역할 (연결 계층)
Gateway는 순수한 **연결 및 라우팅 계층**입니다:
- WebSocket 연결 관리
- JSON-RPC 메시지 라우팅
- 채널 등록/인증
- Rate limiting
- **하지 않는 것**: 프로세스 실행, 작업 상태 관리

### 8.2 Task Orchestrator 역할 (실행 계층)
Task Orchestrator는 **실행 및 조율 계층**입니다:
- Task/Job 생명주기 관리
- Agent 조율 (Planner/Executor/Replanner)
- 다중 채널 → 단일 Task 매핑
- 실패/재시도/중단 처리

### 8.3 채널 vs Task 비교

| 항목 | 채널 (Channel) | Task |
|------|----------------|------|
| 역할 | 입력/출력 뷰 | 실행 객체 |
| 실행 단위 | ❌ | ✅ |
| 상태 관리 | ❌ | ✅ |
| 병렬 실행 | ❌ | ✅ |

### 8.4 메시지 흐름

```
Discord/Slack → Gateway (chat.send) → Task Orchestrator → Agent
                                              ↓
Discord/Slack ← Gateway (broadcast) ← Task Result ←──┘
```

---

## 9. 개발 및 운영 CLI

### 9.1 핵심 명령
- `moltbot gateway status`
- `moltbot gateway call <rpc>`
- `moltbot logs --follow`
- `moltbot pairing approve <code>`
- `moltbot doctor`

### 9.2 개발 환경
- TypeScript (ESM)
- Node.js 22+
- Bun (테스트, watch 모드)
- `pnpm gateway:watch` 지원

