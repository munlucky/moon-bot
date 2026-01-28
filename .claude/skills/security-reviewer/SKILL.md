---
name: security-reviewer
description: Reviews code for security vulnerabilities. Use when security concerns are detected or before deploying critical changes.
context: fork
---

# Security Reviewer Skill

## When to Use

- Security concerns detected during code review
- API key or credential exposure suspected
- Before deploying authentication/authorization changes
- When handling user input or external data

## Procedure

1. Scan changed files for security patterns
2. Check against security checklist (`.claude/rules/security.md`)
3. Report findings with severity levels
4. Suggest fixes for each issue

## Security Checklist

### CRITICAL (Must Fix Before Merge)
- [ ] Hardcoded secrets (API keys, passwords, tokens)
- [ ] SQL injection vulnerabilities
- [ ] XSS vulnerabilities (unescaped user input)
- [ ] Authentication bypass risks

### HIGH (Should Fix)
- [ ] Missing input validation
- [ ] Insecure dependencies (outdated packages)
- [ ] Path traversal risks
- [ ] CSRF vulnerabilities

### MEDIUM (Recommended)
- [ ] Missing rate limiting
- [ ] Verbose error messages leaking info
- [ ] Missing HTTPS enforcement
- [ ] Weak password policies

## Output Format

```markdown
## Security Review Results

### Summary
- Files scanned: N
- Critical: N | High: N | Medium: N

### Findings

#### [CRITICAL] Hardcoded API Key
- **File**: src/api/client.ts:42
- **Issue**: API key exposed in source code
- **Fix**: Move to environment variable

#### [HIGH] Missing Input Validation
- **File**: src/routes/user.ts:15
- **Issue**: User input passed directly to query
- **Fix**: Add Zod validation schema

### Verdict
❌ BLOCK / ⚠️ WARNING / ✅ PASS
```

## Auto-trigger Conditions

| Signal | Action |
|--------|--------|
| `*.env` file modified | Trigger review |
| Auth-related files changed | Trigger review |
| New dependency added | Check vulnerability |
| API endpoint added | Validate input handling |
