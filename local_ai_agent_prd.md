# Moltbot 프레임워크 기반 로컬 우선주의 AI 에이전트 시스템 PRD

## 1. 제품 정의 및 아키텍처 철학

본 시스템은 사용자의 로컬 환경에 상주하는 **게이트웨이(Gateway)** 를 중심으로 동작하는 **Local-first** 에이전트 플랫폼이다. Moltbot의 아키텍처를 기반으로, 실행 주체인 Gateway와 인터페이스 역할의 Channel/Surface를 분리하며, 사용자가 자신의 데이터 소유권과 실행 통제권을 유지할 수 있도록 설계되었다.

### 1.1 핵심 설계 원칙
- **Gateway 중심 제어**: WebSocket(기본 포트 18789) 기반의 JSON-RPC 프로토콜로 세션, 채널, 노드, 훅을 통합 관리.
- **Surface 추상화**: Discord, Slack, Telegram, CLI 등 다양한 채널을 표면으로 사용하는 멀티 서피스 구조.
- **보안 가드레일**: 인증 토큰이 없거나 설정되지 않은 경우 외부 포트 바인딩을 차단하는 Fail-closed 정책 적용.


## 2. 인터페이스 레이어: 멀티 서피스 전략

### 2.1 채널 어댑터 구조
- Discord, Slack, Telegram, WhatsApp 등 10개 이상 플랫폼 지원.
- 각 채널은 `chat.send` RPC로 게이트웨이와 통신하며 Markdown 포맷에 맞게 메시지 렌더링.

### 2.2 보안 정책
- **DM 페어링**: 미승인 사용자의 접근 차단, CLI 승인 흐름 요구.
- **Mention Gating**: 그룹 채팅에서 `@agent` 언급 시에만 활성화되어 불필요한 추론 방지.


## 3. 에이전트 인지 및 실행 엔진

### 3.1 Planner–Executor–Replanner 모델
- **플래너**: 목표 분해 및 단계 설계. 고성능 LLM 활용 (GPT-4o 등).
- **엑제큐터**: 도구 호출 및 결과 수집. 경량 모델 또는 실행 엔진 사용.
- **리플래너**: 실패 시 대체 도구 자동 선택 및 경로 재계획.

### 3.2 오류 보고 및 복구
- 실행 실패 시 CLI 로그 또는 채널 메시지로 사용자에게 원인 보고.
- 도구 fallback 시나리오 (예: API 실패 시 browser.open 시도) 구현.


## 4. 도구 시스템 (ToolKit)

### 4.1 도구 레지스트리 구조
- JSON Schema 기반 계약(Contract) 구조.
- `toolkit.register({ id, schema, run })` 방식으로 정의.
- TypeBox 사용, 평탄화된 구조 권장.

### 4.2 주요 도구 분류
- **Browser Tool**: Playwright 기반 웹 제어.
- **Desktop Tool**: system.run 명령 실행, OS 스크립트.
- **API Connector**: 외부 REST API 호출 및 요약.
- **File I/O**: 파일 생성/읽기/삭제.

### 4.3 승인 시스템 (Lobster)
- 부수효과 있는 도구는 승인 요청을 채널 메시지로 전달.
- 사용자가 확인 버튼을 누르기 전까지 실행 중단.


## 5. 세션 및 협업 체계

### 5.1 세션 저장 구조
- 모든 세션 로그는 `~/.clawdbot/agents/<agentId>/sessions/<sessionId>.jsonl` 경로에 JSONL 형식 저장.
- 로그에는 대화, 사고 과정, 도구 호출, 오류 메시지가 포함.

### 5.2 세션 공유 및 전달
- `sessions.send`를 통해 다른 에이전트 또는 채널로 컨텍스트 전달 가능.
- 세션별 고유 ID, 사용자/채널 기준 격리 운영.

### 5.3 컴팩션 및 리플레이
- 대화 길이에 따라 과거 문맥 요약 (Compaction).
- 세션 리플레이 기능으로 특정 시점 디버깅 및 분석 가능.


## 6. 자동화 및 크론 시스템

### 6.1 예약 실행 구조
- `cron.list`, `cron.edit`, `cron.run` 명령을 통해 주기 작업 관리.
- 메시지 발화, 상태 점검, 주기 리포트 전송 자동화.

### 6.2 하트비트 및 이벤트 기반 발화
- Active hours 설정, 상태 변화 감지 시 Proactive 메시지 발송.


## 7. 운영 및 CLI 관리 도구

### 7.1 CLI 명령 예시
- `moltbot gateway status`: 상태 점검
- `moltbot logs --follow`: 실시간 로그 스트리밍
- `moltbot doctor`: 보안 설정/권한 오류 점검
- `gateway call <rpc>`: 직접 메서드 호출
- `pairing approve <token>`: 사용자 인증 승인

### 7.2 개발 환경
- Node.js 22+, TypeScript(ESM), Bun(테스트 및 스크립트)
- `pnpm gateway:watch` 개발 자동화


## 8. Task Orchestrator 및 채널 독립성

### 8.1 Task Orchestrator 개념

Task Orchestrator는 Gateway와 Agent 사이에서 **작업 실행을 조율**하는 핵심 컴포넌트입니다:

```
Channel → Gateway → Task Orchestrator → Agent (Planner/Executor)
                          ↓
                    Task Queue
                    Task State
                    Result Routing
```

**주요 책임:**
- Task 생성 및 큐 관리
- Agent 인스턴스 조율
- 다중 채널에서 온 메시지를 단일 Task로 매핑
- 실행 결과를 원본 채널로 라우팅

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

### 9.1 기술 발전 방향
- **멀티 에이전트 슬롯**: 하나의 Gateway에서 성격/역할이 다른 에이전트 동시 운영
- **로컬 소형 모델 연동(sLLM)**: 기본 요약, 감정 분석 등은 오프라인 모델 처리
- **MCP 지원**: 외부 도구를 Skill 형태로 등록 및 동적 확장
- **Web Companion UI**: 현재 세션/로그 뷰어 제공

---

본 설계는 Moltbot의 철학을 계승하면서도 실질적인 로컬 제어력과 유연한 확장을 모두 갖춘 Sovereign AI Agent 시스템을 지향한다.

