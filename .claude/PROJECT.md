# Moonbot Project

## Overview

**Moonbot** is a local-first AI Agent System based on the Moltbot framework. The system centers around a local Gateway that manages sessions, channels, nodes, and hooks via WebSocket-based JSON-RPC protocol.

- **Primary Language**: TypeScript (ESM)
- **Runtime**: Node.js 22+
- **Key Dependencies**: discord.js, playwright, ws, @sinclair/typebox, zod
- **CLI Entry Point**: `moonbot`

## Core Architecture

### Gateway-Centric Control
- Port: `18789` (default)
- Protocol: JSON-RPC over WebSocket
- Components: Session management, Channel routing, Tool registry, Authorization

### Multi-Surface Strategy
- Channels: Discord (primary), with extensible adapter structure for Slack, Telegram, etc.
- Security: DM pairing approval, mention gating for group chats

### Agent Cognitive Model
- **Planner**: Goal decomposition using high-performance LLMs
- **Executor**: Tool execution and result collection
- **Replanner**: Automatic failure recovery with alternative tool selection

## Directory Structure

```
/src
  /gateway           # WebSocket server, JSON-RPC handlers
  /channels          # Channel adapters (Discord, etc.)
  /agents            # Planner, Executor, Replanner runtime
  /tools             # Tool definitions and runtime registry
    /browser         # Playwright-based web automation
    /http            # API connector with SSRF guard
    /filesystem      # File I/O with path validation
    /desktop         # System command execution
    /approval        # Lobster approval system
    /runtime         # Tool runtime, schema validator
  /sessions          # Session storage/transfer (JSONL format)
  /cron              # Scheduled task management
  /auth              # Pairing and authentication
  /cli               # CLI commands
  /config            # System configuration
  /types             # TypeScript type definitions
  /utils             # Logger, error sanitizer
```

## Key Patterns

### Tool Registration
```typescript
toolkit.register({
  id: string,
  schema: TypeBoxObject,
  run: (input, ctx) => Promise<any>
})
```

### Session Storage
- Location: `~/.clawdbot/agents/<agentId>/sessions/<sessionId>.jsonl`
- Format: JSONL with user messages, thoughts, tool calls, results

### Security Model
- Fail-closed: External port binding requires authentication token
- SSRF protection in HTTP tool
- Command sanitization in desktop tool
- Path validation in filesystem operations

## Commands

### Development
```bash
pnpm build          # TypeScript compilation
pnpm dev            # Watch mode
pnpm gateway:watch  # Run gateway with Bun (hot reload)
pnpm test           # Run tests
pnpm lint           # ESLint
pnpm format         # Prettier
```

### CLI (moonbot)
```bash
moonbot gateway status    # Check gateway status
moonbot logs --follow     # Stream logs
moonbot doctor            # Security/permission diagnostics
moonbot call <rpc>        # Direct RPC invocation
moonbot pairing approve   # Approve user authentication
```

## Roadmap

- Multi-agent slots (different personalities in one Gateway)
- Local small LLM integration (sLLM) for offline tasks
- MCP (Model Context Protocol) support for external tools
- Web Companion UI for session/log viewing

## References

- PRD: `local_ai_agent_prd.md`
- Technical Spec: `agent_system_spec.md`
