# Moonbot 사용자 가이드

> 로컬 퍼스트 AI Agent System - 전체 사용자 매뉴얼

**버전**: 0.1.0
**최종 업데이트**: 2025-01-29

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

- 🤖 **AI Agent**: Planner, Executor, Replanner로 구성된 지능형 에이전트
- 🔌 **멀티 채널**: Discord, Slack, Telegram 지원
- 🛡️ **로컬 퍼스트**: 모든 데이터가 로컬에 저장
- 🔐 **보안**: DM 페어링 승인, mention gating
- 🛠️ **도구**: 브라우저 자동화, HTTP 요청, 파일 시스템, 시스템 명령

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

# CLI 전역 설치 (선택)
pnpm link
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
| `channel` | 채널 관리 |
| `logs` | 로그 조회 |
| `doctor` | 진단 정보 |
| `call` | 직접 RPC 호출 |
| `pairing` | 페어링 관리 |
| `approvals` | 승인 관리 |

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

## 환경 변수

### 지원하는 환경 변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `MOONBOT_DISCORD_TOKEN` | Discord 봇 토큰 | - |
| `MOONBOT_GATEWAY_PORT` | Gateway 포트 | 18789 |
| `MOONBOT_GATEWAY_HOST` | Gateway 호스트 | 127.0.0.1 |

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
│   ├── channels/      # 채널 어댑터 (Discord, Slack 등)
│   ├── agents/        # Planner, Executor, Replanner
│   ├── tools/         # 도구 정의 및 런타임
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
