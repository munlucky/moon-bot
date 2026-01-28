# Security Guidelines

## Mandatory Security Checks

Before ANY commit:
- [ ] No hardcoded secrets (API keys, passwords, tokens)
- [ ] All user inputs validated
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (sanitized HTML)
- [ ] CSRF protection enabled
- [ ] Authentication/authorization verified
- [ ] Error messages don't leak sensitive data

## Secret Management

```typescript
// ❌ NEVER: Hardcoded secrets
const apiKey = "sk-proj-xxxxx"

// ✅ ALWAYS: Environment variables
const apiKey = process.env.OPENAI_API_KEY

if (!apiKey) {
  throw new Error('OPENAI_API_KEY not configured')
}
```

## Security Response Protocol

If security issue found:
1. STOP immediately
2. Fix CRITICAL issues before continuing
3. Rotate any exposed secrets
4. Review entire codebase for similar issues

## Memory MCP Security

When using Memory MCP:
- **No sensitive data**: Never store passwords, API keys, or personal information in memory
- **Git management**: Add `.claude/memory.json` to `.gitignore`
- **Size management**: Store only essential context, not large data
