# How to Execute Work

- Prefer real actions (reading/editing files, running verification) whenever possible.
- **Automatic task analysis**: If the user request is code work (feature add/change, bug fix, refactor, etc.), immediately run the `/moonshot-orchestrator` skill.
  - Exclude simple questions, info lookups, or read/describe-only tasks.
  - The PM orchestrator determines task type/complexity/needed agents and runs the optimal chain.
  - Workflow details: `.claude/skills/moonshot-orchestrator/SKILL.md`
- If information is missing, ask questions or proceed with explicitly stated low-risk assumptions.
- Complex work follows plan -> implement -> verify -> summarize.
