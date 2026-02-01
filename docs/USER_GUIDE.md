# Moonbot 사용자 가이드

> 로컬 퍼스트 AI Agent System - 전체 사용자 매뉴얼

**버전**: 0.1.0
**최종 업데이트**: 2026-02-01

---

## 목차

1. [시작하기](#시작하기)
2. [설치](#설치)
3. [기본 설정](#기본-설정)
4. [CLI 명령어](#cli-명령어)
5. [채널 관리](#채널-관리)
6. [환경 변수](#환경-변수)
7. [Gateway](#gateway)
8. [보안](#보안)
9. [문제 해결](#문제-해결)

---

## 시작하기

Moonbot은 Moltbot 프레임워크 기반의 로컬 퍼스트 AI Agent System입니다. Discord, Slack, Telegram 등 다양한 채널을 통해 AI 에이전트를 제어할 수 있습니다.

### 주요 기능

- **AI Agent**: Planner, Executor, Replanner로 구성된 지능형 에이전트
- **멀티 채널**: Discord, Slack 지원 (Telegram 예정)
- **로컬 퍼스트**: 모든 데이터가 로컬에 저장
- **보안**: DM 페어링 승인, mention gating
- **도구**: 브라우저 자동화, HTTP 요청, 파일 시스템, 시스템 명령, 대화형 터미널, Claude Code CLI, Node Companion 연동

---

## 설치

### 요구 사항

- **Node.js**: 22.0.0 이상
- **패키지 관리자**: pnpm 권장

### 설치 단계

```bash
# 리포지토리 클론
git clone https://github.com/your-org/moonbot.git
cd moonbot

# 의존성 설치
pnpm install

# 빌드
pnpm build
```

### CLI 실행 방법

빌드 후 다음 방법으로 CLI를 실행할 수 있습니다:

```bash
# 방법 1: pnpm exec (권장)
pnpm exec moonbot <command>

# 방법 2: 전역 설치 후
pnpm link
moonbot <command>

# 방법 3: 직접 실행
node dist/cli.js <command>
```

---

## 기본 설정

### 설정 파일 위치

```
~/.moonbot/config.json
```

### 기본 설정 구조

```json
{
  "gateways": [
    {
      "port": 18789,
      "host": "127.0.0.1"
    }
  ],
  "agents": [
    {
      "id": "default",
      "name": "Default Agent",
      "model": "gpt-4o",
      "temperature": 0.7,
      "maxTokens": 4096
    }
  ],
  "channels": [],
  "tools": [],
  "storage": {
    "sessionsPath": "~/.moonbot/sessions",
    "logsPath": "~/.moonbot/logs"
  }
}
```

---

## CLI 명령어

### 기본 구조

```bash
moonbot <command> [options]
```

### 사용 가능한 명령어

| 명령어 | 설명 |
|--------|------|
| `gateway` | Gateway 제어 |
| `config` | 설정 관리 (import/export) |
| `channel` | 채널 관리 |
| `logs` | 로그 조회 |
| `doctor` | 진단 정보 |
| `call` | 직접 RPC 호출 |
| `pairing` | 페어링 관리 |
| `approvals` | 승인 관리 |

---

## 빠른 설정 (Config Import)

JSON 파일로 한 번에 모든 채널을 설정할 수 있습니다.

### 1. 설정 파일 작성

```bash
# 예시 파일 복사
cp docs/config.example.json my-config.json
```

`my-config.json`을 편집하여 토큰을 입력하세요:

```json
{
  "gateways": [{"port": 18789, "host": "127.0.0.1"}],
  "channels": [
    {
      "id": "my-discord",
      "type": "discord",
      "name": "My Discord Bot",
      "token": "발급받은_Discord_토큰",
      "enabled": true
    }
  ]
}
```

### 2. 설정 가져오기

```bash
pnpm exec moonbot config import my-config.json
```

### 3. 확인

```bash
pnpm exec moonbot channel list
pnpm exec moonbot gateway start
```

### Config 명령어

| 명령어 | 설명 |
|--------|------|
| `config import <file>` | JSON 파일에서 설정 가져오기 |
| `config export <file>` | 현재 설정을 JSON 파일로 내보내기 |
| `config path` | 설정 파일 위치 표시 |

**옵션**:
- `--force`: 기존 설정 덮어쓰기
- `--json`: JSON 형식 출력

---

## 채널 관리

### 채널이란?

채널은 Moonbot이 외부 서비스(Discord, Slack, Telegram 등)와 통신하는 방법입니다. 각 채널은 고유한 ID, 타입, 토큰을 가집니다.

### 채널 명령어

#### 1. 채널 목록 조회

```bash
moonbot channel list
```

**출력 예시**:
```
┌─────────────────────────┬────────────┬────────────────────┬──────────┬─────────────────────┐
│ ID                      │ Type       │ Name               │ Enabled  │ Token               │
├─────────────────────────┼────────────┼────────────────────┼──────────┼─────────────────────┤
│ my-discord              │ discord    │ My Discord Bot     │ ✓        │ MTIzNDU2...Njc4OQ   │
│ work-slack              │ slack      │ Work Slack         │ ✗        │ xoxb-1234...5678    │
└─────────────────────────┴────────────┴────────────────────┴──────────┴─────────────────────┘

Total: 2 channel(s)
```

#### 2. 채널 추가

```bash
moonbot channel add <id> --type <type> --token <token> [--name <name>] [--enable]
```

**옵션**:
- `--type`: 채널 타입 (`discord`, `slack`, `telegram`, `cli`)
- `--token`: 인증 토큰
- `--name`: 채널 이름 (선택)
- `--enable`: 추가 후 즉시 활성화 (기본값: true)

**예시**:
```bash
# Discord 채널 추가
moonbot channel add my-discord --type discord --token "MTIzNDU2Nzg5MDEyMzQ1Njc4OQ=="

# Slack 채널 추가 (이름 포함)
moonbot channel add work-slack --type slack --token "xoxb-1234567890-1234567890123" --name "Work Slack"

# 비활성화 상태로 추가
moonbot channel add test-bot --type discord --token "ABC..." --enable false
```

#### 3. 채널 삭제

```bash
moonbot channel remove <id>
```

**예시**:
```bash
moonbot channel remove old-discord
```

#### 4. 채널 활성화

```bash
moonbot channel enable <id>
```

**예시**:
```bash
moonbot channel enable my-discord
```

#### 5. 채널 비활성화

```bash
moonbot channel disable <id>
```

**예시**:
```bash
moonbot channel disable work-slack
```

### 채널 토큰 마스킹

보안을 위해 모든 토큰은 자동으로 마스킹됩니다:
- 형식: `앞 6자리...뒤 4자리`
- 예시: `MTIzNDU2Nzg5...Njc4OQ==`

---

## 채널별 설정

### Discord

Discord 봇을 생성하고 토큰을 발급받는 방법입니다.

#### 1. Discord 애플리케이션 생성

1. [Discord Developer Portal](https://discord.com/developers/applications) 접속
2. **New Application** 클릭
3. 애플리케이션 이름 입력 (예: `Moonbot`)
4. **Create** 클릭

#### 2. 봇 생성

1. 왼쪽 메뉴에서 **Bot** 클릭
2. **Reset Token** 또는 **Add Bot** 클릭
3. **Yes, do it!** 확인
4. **Reset Token** 클릭하여 토큰 생성
5. 토큰을 복사 (※ 이 토큰은 다시 볼 수 없으므로 반드시 저장)

#### 3. 봇 권한 설정

1. **Privileged Gateway Intents** 섹션에서 다음 활성화:
   - ✅ **MESSAGE CONTENT INTENT** (필수)
   - ✅ **SERVER MEMBERS INTENT** (선택)
   - ✅ **PRESENCE INTENT** (선택)

#### 4. 봇 초대

1. **OAuth2** → **URL Generator** 클릭
2. **Scopes**에서 `bot` 선택
3. **Bot Permissions**에서 필요한 권한 선택:
   - ✅ Send Messages
   - ✅ Embed Links
   - ✅ Attach Files
   - ✅ Read Message History
   - ✅ Add Reactions
4. 생성된 URL로 접속하여 봇을 서버에 초대

#### 5. Moonbot에 Discord 채널 등록

```bash
moonbot channel add my-discord \
  --type discord \
  --token "여기에_복사한_토큰_입력" \
  --name "My Discord Bot" \
  --enable
```

---

### Slack

Slack 앱을 생성하고 Moonbot에 연결하는 방법입니다.

#### 1. Slack 앱 생성

1. [Slack API](https://api.slack.com/apps) 접속
2. **Create New App** 클릭
3. **From scratch** 선택
4. 앱 이름 입력 (예: `Moonbot`)
5. 워크스페이스 선택 후 **Create App**

#### 2. Bot Token 발급

1. 왼쪽 메뉴에서 **OAuth & Permissions** 클릭
2. **Bot Token Scopes**에서 필요한 권한 추가:
   - `app_mentions:read`
   - `chat:write`
   - `channels:history`
   - `groups:history`
   - `im:history`
3. 페이지 상단의 **Install to Workspace** 클릭
4. **Bot User OAuth Token** 복사 (`xoxb-`로 시작)

#### 3. Socket Mode 활성화

1. 왼쪽 메뉴에서 **Socket Mode** 클릭 후 활성화
2. 토큰 이름(예: `moonbot-socket-token`)을 지정하고 **Generate** 클릭
3. 생성된 App-Level Token (`xapp-...`)을 복사하여 `SLACK_APP_TOKEN` 환경 변수에 설정

#### 4. Event Subscriptions 설정

1. **Event Subscriptions** 메뉴에서 **Enable Events** 활성화
2. **Subscribe to bot events**에서 `app_mention` 추가

> **참고**: Socket Mode에서는 Request URL이 필요하지 않습니다.

#### 5. Moonbot에 Slack 채널 등록

```bash
moonbot channel add my-slack \
  --type slack \
  --token "xoxb-your-bot-token" \
  --name "My Slack Bot" \
  --enable
```

---

### Telegram (곧 지원 예정)

Telegram Bot 생성 및 토큰 발급 가이드는 Telegram 채널 어댑터 구현 시 추가될 예정입니다.

---

## 환경 변수

### 지원하는 환경 변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `MOONBOT_DISCORD_TOKEN` | Discord 봇 토큰 | - |
| `MOONBOT_GATEWAY_PORT` | Gateway 포트 | 18789 |
| `MOONBOT_GATEWAY_HOST` | Gateway 호스트 | 127.0.0.1 |
| `SLACK_BOT_TOKEN` | Slack 봇 토큰 (`xoxb-...`) | - |
| `SLACK_APP_TOKEN` | Slack App-Level 토큰 (Socket Mode, `xapp-...`) | - |
| `SLACK_SIGNING_SECRET` | Slack Signing Secret (HTTP 방식 전용) | - |
| `OPENAI_API_KEY` | OpenAI API 키 | - |
| `ZAI_API_KEY` / `GLM_API_KEY` | GLM API 키 | - |

### 우선순위

환경 변수는 설정 파일보다 높은 우선순위를 가집니다:

```
환경 변수 > config.json > 기본값
```

### 사용 예시

```bash
# Discord 토큰 설정
export MOONBOT_DISCORD_TOKEN="MTIzNDU2Nzg5MDEyMzQ1Njc4OQ=="

# Gateway 포트 변경
export MOONBOT_GATEWAY_PORT=8080

# Gateway 시작
moonbot gateway start
```

### .env 파일 (선택)

```bash
# ~/.moonbot/.env
MOONBOT_DISCORD_TOKEN="your_token_here"
MOONBOT_GATEWAY_PORT=18789
```

> **경고**: `.env` 파일은 `.gitignore`에 추가되어야 합니다. 절대 커밋하지 마세요.

---

## Gateway

### Gateway 시작

```bash
moonbot gateway start
```

### Gateway 상태 확인

```bash
moonbot gateway status
```

### Gateway 중지

```bash
# Ctrl+C 또는
moonbot gateway stop
```

### 로그 실시간 조회

```bash
moonbot logs --follow
```

---

## 보안

### 토큰 관리

1. **절대 하드코딩하지 마세요**: 토큰은 항상 환경 변수나 설정 파일로 관리
2. **토큰 마스킹**: list 명령은 자동으로 토큰을 마스킹
3. **백업**: 설정 변경 시 자동 백업 (최대 10개 보관)

### 백업 위치

```
~/.moonbot/backups/config-YYYY-MM-DDTHH-MM-SS-mmmZ.json
```

### 진단 명령어

```bash
moonbot doctor
```

- 파일 권한 확인
- 포트 사용 가능 여부
- 설정 유효성 검사
- 보안 권장사항 확인

---

## 문제 해결

### Gateway가 시작되지 않음

```bash
# 포트 확인
moonbot gateway status

# 로그 확인
moonbot logs --follow

# 포트 변경
export MOONBOT_GATEWAY_PORT=8080
moonbot gateway start
```

### 채널 연결 실패

```bash
# 토큰 확인 (마스킹됨)
moonbot channel list

# 진단
moonbot doctor
```

### 설정 초기화

```bash
# 백업에서 복원
cp ~/.moonbot/backups/config-<latest>.json ~/.moonbot/config.json

# Gateway 재시작
moonbot gateway restart
```

---

## 추가 정보

### 프로젝트 구조

```
moonbot/
├── src/
│   ├── gateway/       # WebSocket 서버, JSON-RPC 핸들러
│   ├── channels/      # 채널 어댑터 (Discord, Slack)
│   ├── agents/        # Planner, Executor, Replanner
│   ├── tools/         # 도구 정의 및 런타임
│   │   ├── filesystem/   # 파일 I/O 도구
│   │   ├── http/         # HTTP 요청 도구
│   │   ├── browser/      # 브라우저 자동화 (Playwright)
│   │   ├── desktop/      # 시스템 명령 도구
│   │   ├── process/      # 대화형 터미널 세션
│   │   ├── claude-code/  # Claude Code CLI 통합
│   │   └── nodes/        # Node Companion 연동
│   ├── llm/           # LLM 공급자 (OpenAI, GLM)
│   ├── orchestrator/  # 작업 조율 및 큐 관리
│   ├── auth/          # 인증 및 페어링
│   ├── sessions/      # 세션 저장소
│   ├── config/        # 설정 관리
│   └── cli/           # CLI 명령어
└── dist/              # 컴파일된 출력
```

### 도움말

```bash
# 전체 도움말
moonbot --help

# 특정 명령어 도움말
moonbot channel --help
moonbot gateway --help
```

### 버전 확인

```bash
moonbot --version
```

---

**문의사항**: [GitHub Issues](https://github.com/your-org/moonbot/issues)
