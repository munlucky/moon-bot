# PROJECT.md

## Project Overview
- **Name**: [project name]
- **Stack**: [frameworks, runtimes, libraries]
- **Primary Language**: [language]

## Core Rules (Must Follow)
1. [rule or convention]
2. [rule or convention]
3. [rule or convention]

## Directory Structure
```
[project root]/
  [main dir]/
    [subdir]/
  [main dir]/
```

## Key Patterns
- **API Routing**: [where routes/controllers live]
- **Error Handling**: [error handling pattern]
- **Naming Conventions**: [naming rules]
- **Logging/Telemetry**: [logging rules]

## API/Data Model Patterns
- **API Domains**: [major API areas]
- **Shared Utilities**: [shared helpers/clients]
- **Client Usage**: [how clients call APIs]
- **Data Models**: [entity/DTO/request-response structures]

## Auth/Security
- **Auth Method**: [JWT/session/oauth/etc]
- **Authorization Model**: [roles/permissions]
- **Middleware**: [auth middleware locations]

## Documentation Paths
> Configure `tasksRoot` in CLAUDE.md. Default: `.claude/docs/tasks`

- `{agreementsRoot}/{feature-name}-agreement.md`
- `{tasksRoot}/{feature-name}/context.md`
- `{tasksRoot}/{feature-name}/design-spec.md`
- `{tasksRoot}/{feature-name}/pending-questions.md`
- `{tasksRoot}/{feature-name}/session-logs/day-{YYYY-MM-DD}.md`

## Commands
- **Dev**: `[command]`
- **Build**: `[command]`
- **Lint**: `[command]`
- **Test**: `[command]`
- **Typecheck**: `[command]`

## Environment
- **Required Env Vars**: [key vars]
- **Local Setup**: [setup steps]

## Change Log
```
[YYYY-MM-DD] = "[change summary]"
```
