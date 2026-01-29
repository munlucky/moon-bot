# Moonbot

Local-first AI Agent System based on the Moltbot framework.

## Overview

Moonbot is a local-first AI agent platform that centers around a Gateway running on your local machine. It provides multi-surface support (Discord, Slack, Telegram, etc.) and maintains full data ownership and execution control.

### Key Features

- **Gateway-Centric Architecture**: WebSocket-based JSON-RPC server (port 18789)
- **Multi-Surface Channels**: Discord, Slack, Telegram, and more
- **Cognitive Agent Model**: Planner-Executor-Replanner for robust task execution
- **Security First**: Fail-closed policy, approval system for sensitive operations
- **Extensible Tools**: Browser automation, HTTP requests, filesystem, desktop commands

## Architecture

```
+---------+     WebSocket     +----------+     RPC     +----------+
| Channel | <===============> | Gateway  | <========> |  Agent   |
+---------+   JSON-RPC 18789  +----------+            +----------+
                                                     |
                                                     v
                                              +------------+
                                              | Tool Kit   |
                                              +------------+
```

## Installation

```bash
# Clone repository
git clone <repository-url>
cd moon-bot

# Install dependencies
pnpm install

# Build
pnpm build
```

## Quick Start

```bash
# Start gateway
pnpm gateway:watch

# In another terminal, check status
moonbot gateway status

# View logs
moonbot logs --follow
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `moonbot gateway status` | Check gateway status |
| `moonbot logs --follow` | Stream logs in real-time |
| `moonbot doctor` | Run security/permission diagnostics |
| `moonbot call <rpc>` | Direct RPC invocation |
| `moonbot pairing approve <code>` | Approve user authentication |

## Project Structure

```
/src
  /gateway       # WebSocket server, JSON-RPC handlers
  /channels      # Channel adapters (Discord, etc.)
  /agents        # Planner, Executor, Replanner
  /tools         # Tool definitions and runtime
  /sessions      # Session storage (JSONL format)
  /cron          # Scheduled tasks
  /auth          # Pairing and authentication
  /cli           # CLI commands
```

## Development

```bash
# Watch mode
pnpm dev

# Run gateway with hot reload (Bun)
pnpm gateway:watch

# Run tests
pnpm test

# Lint
pnpm lint

# Format
pnpm format
```

## Configuration

Sessions are stored in `~/.clawdbot/agents/<agentId>/sessions/<sessionId>.jsonl`

## Documentation

- [PRD](local_ai_agent_prd.md) - Product Requirements Document
- [Spec](agent_system_spec.md) - Technical Specification
- [.claude/PROJECT.md](.claude/PROJECT.md) - Project-specific development rules

## Requirements

- Node.js 22+
- TypeScript (ESM)
- pnpm

## License

MIT
