# Coding Style Guidelines

## File Structure

- 200-400 lines per file (max 800)
- Functions under 50 lines
- Nesting under 4 levels

## Immutability Pattern (CRITICAL)

```typescript
// ❌ Bad - mutation
user.name = "New Name"
items.push(newItem)

// ✅ Good - immutability
const updatedUser = { ...user, name: "New Name" }
const newItems = [...items, newItem]
```

## Prohibited

- `console.log` in production code
- Emojis in code/comments
- Hardcoded magic numbers without explanation

## Code Smells to Detect

- Long functions (>50 lines)
- Deep nesting (>4 levels)
- Duplicated code
- Missing error handling (try/catch)
- TODO/FIXME without tickets
- Poor variable naming (x, tmp, data)

## React/Next.js Performance (CRITICAL)

> Detailed rules: `.claude/skills/vercel-react-best-practices/SKILL.md`

### Eliminate Waterfalls (Top Priority)

```typescript
// ❌ Bad - Sequential execution (3 round trips)
const user = await fetchUser()
const posts = await fetchPosts()
const comments = await fetchComments()

// ✅ Good - Parallel execution (1 round trip)
const [user, posts, comments] = await Promise.all([
  fetchUser(),
  fetchPosts(),
  fetchComments()
])
```

### Bundle Optimization

```typescript
// ❌ Bad - Loads entire library from barrel file
import { Button, TextField } from '@mui/material'

// ✅ Good - Direct imports
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'

// ✅ Good - Dynamic import for lazy loading
const MonacoEditor = dynamic(() => import('./monaco-editor'), { ssr: false })
```

### Minimize RSC Serialization

```typescript
// ❌ Bad - Passes all 50 fields
<Profile user={user} />

// ✅ Good - Pass only needed fields
<Profile name={user.name} avatar={user.avatar} />
```

