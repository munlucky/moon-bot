# Moonbot Project

> **Last Updated**: 2026-01-29

## Project Overview
- **Name**: Moonbot
- **Stack**: Node.js 22+, TypeScript (ESM), WebSocket, JSON-RPC
- **Primary Language**: TypeScript
- **Key Dependencies**: discord.js, playwright, ws, @sinclair/typebox, zod, commander, openai

## Core Rules (Must Follow)
1. **Immutability**: 객체/배열 변경 시 spread operator 사용 (mutation 금지)
2. **Error Handling**: `userMessage`/`internalMessage` 분리, 민감 정보 노출 금지
3. **Security**: SSRF Guard, Path Validation, Command Sanitization 필수
4. **Testing**: 새 코드는 테스트 포함 (Vitest), 최소 80% 커버리지 목표

## Implementation Status (2026-01-29)

| Component | Status | Tests |
|-----------|--------|-------|
| Gateway | ✅ Complete | 8 integration |
| TaskOrchestrator | ✅ Complete | 36 unit |
| PerChannelQueue | ✅ Complete | 42 unit |
| Discord Channel | ✅ Complete | - |
| Sessions | ✅ Complete | - |
| Auth | ✅ Complete | - |
| Tools (4 categories) | ✅ Complete | - |
| Planner | ✅ Complete (LLM) | - |
| LLM Infrastructure | ✅ Complete | - |
| Cron | ✅ Complete | - |
| Discord Approval | ✅ Complete | - |

## Directory Structure
```
/src
  /gateway            # WebSocket server, JSON-RPC handlers
    /handlers         # RPC handlers (channel, tools)
    server.ts         # GatewayServer (TaskOrchestrator integrated)
  /orchestrator       # Task execution layer
    TaskOrchestrator.ts
    TaskRegistry.ts
    PerChannelQueue.ts
  /channels           # Channel adapters
    discord.ts        # Discord adapter
    GatewayClient.ts  # WebSocket client for channels
  /agents             # Cognitive model
    planner.ts        # Goal decomposition (LLM-powered)
    executor.ts       # Tool execution
    /replanner        # Failure recovery modules
  /tools              # Tool definitions
    /browser          # Playwright-based
    /http             # HTTP + SSRF guard
    /filesystem       # File I/O + path validation
    /desktop          # system.run + sanitizer
    /approval         # Approval flow system
    /runtime          # ToolRuntime, ApprovalManager
  /sessions           # JSONL session storage
  /cron               # Scheduled tasks (with Agent integration)
  /auth               # Pairing, token auth
  /cli                # CLI commands
    /commands         # gateway, channel, config, logs, doctor, call, pairing, approvals
  /config             # System configuration
  /types              # TypeScript definitions
  /utils              # Logger, error-sanitizer
  /llm                # LLM infrastructure (NEW)
    LLMClient.ts      # Planner LLM client
    LLMProviderFactory.ts  # Provider factory
    /providers        # LLM provider implementations
      BaseLLMProvider.ts
      OpenAIProvider.ts
      GLMProvider.ts   # Z.AI (智谱AI) provider
    types.ts          # LLM types
```

## Key Patterns

### API Routing (JSON-RPC)
- **Location**: `src/gateway/handlers/`
- **Methods**: `chat.send`, `chat.response`, `approval.grant`, `approval.list`, `gateway.info`, `channel.*`, `tool.run`

### Error Handling
```typescript
interface TaskError {
  code: string;
  userMessage: string;      // Safe for channel display
  internalMessage?: string; // Logs only
}
```

### Tool Registration
```typescript
toolkit.register({
  id: string,
  schema: TObject,  // TypeBox schema
  run: (input, ctx) => Promise<any>,
  requiresApproval?: boolean
})
```

### Session Storage
- **Location**: `~/.moonbot/sessions/<sessionId>.jsonl`
- **SessionKey Format**: `agent:<agentId>:session:<key>`

## Auth/Security
- **Auth Method**: SHA-256 hashed token
- **Authorization**: DM pairing approval, allowFrom whitelist
- **Middleware**: `src/auth/` (AuthManager, PairingManager)
- **Security Guards**: SsrfGuard, PathValidator, CommandSanitizer

## Documentation Paths
- `local_ai_agent_prd.md` - PRD v2.0
- `agent_system_spec.md` - Technical Spec v2.0
- `.claude/docs/tasks/{feature}/context.md` - Task context
- `.claude/docs/agreements/{feature}-agreement.md` - Agreements

## Commands

### Development
```bash
pnpm build          # TypeScript compilation
pnpm dev            # Watch mode (tsc --watch)
pnpm lint           # ESLint
pnpm format         # Prettier
```

### Testing
```bash
pnpm test           # Vitest watch mode
pnpm test:run       # Single run
pnpm test:coverage  # Coverage report
```

### Runtime
```bash
pnpm cli            # CLI (node dist/cli.js)
pnpm discord        # Discord bot (node dist/discord-bot.js)
pnpm gateway        # Gateway server
pnpm gateway:watch  # Gateway with Bun (hot reload)
```

### CLI (moonbot)
```bash
moonbot gateway status|start|stop|restart
moonbot channel list|add|remove|enable|disable
moonbot config import|export|path
moonbot approvals list|approve|deny
moonbot logs --follow
moonbot doctor
moonbot call <rpc> [params]
moonbot pairing approve <code>
```

## Environment
- **Required Env Vars**:
  - `MOONBOT_DISCORD_TOKEN` - Discord bot token
  - `MOONBOT_GATEWAY_PORT` - Gateway port (default: 18789)
  - `MOONBOT_GATEWAY_HOST` - Gateway host (default: 127.0.0.1)
- **LLM Env Vars** (Optional):
  - `LLM_PROVIDER` - Provider type (`openai`|`glm`)
  - `OPENAI_API_KEY` - OpenAI API key
  - `ZAI_API_KEY` - Z.AI (智谱AI) API key
  - `GLM_API_KEY` - GLM API key (legacy)
  - `ZAI_BASE_URL` - Z.AI base URL (default: `https://api.z.ai/api/paas/v4/`)
  - `ZAI_CODING_BASE_URL` - Z.AI coding URL (default: `https://api.z.ai/api/coding/paas/v4/`)
- **Config Path**: `~/.moonbot/config.json`

## Completed Items (2026-01-29)

| Priority | Description |
|----------|-------------|
| P0 | LLM integration (OpenAI, GLM) |
| P1 | Approval flow implementation |
| P1 | Cron Agent task dispatch |
| P2 | Discord approval handler |

## TODO Items (from codebase)

| Priority | Location | Description |
|----------|----------|-------------|
| P3 | `src/tools/desktop/CommandSanitizer.ts:79` | New commands (security review needed) |

## Roadmap
- Multi-agent slots (different personalities)
- Local sLLM integration for offline tasks
- MCP support for external tools
- Web Companion UI
- Slack/Telegram channel adapters

## Change Log
```
2026-01-29 = "문서 현행화 - LLM 인프라 추가, P0-P2 TODO 완료 반영"
2026-01-29 = "GLM(Z.AI) LLM provider 통합"
2026-01-28 = "TaskOrchestrator 통합 완료, Vitest 테스트 추가"
```
