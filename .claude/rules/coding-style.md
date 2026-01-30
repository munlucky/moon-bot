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

## Naming Conventions

> "A code example is worth three paragraphs of description" - Good spec practices

### Good Examples

```typescript
// ✅ Components: PascalCase
export const UserProfile = () => { ... }
export const BatchManagementTable = () => { ... }

// ✅ Variables/Functions: camelCase
const fetchUserData = async () => { ... }
const handleSubmit = () => { ... }
const isLoading = true

// ✅ Constants: SCREAMING_SNAKE_CASE
const API_BASE_URL = '/api/v1'
const MAX_RETRY_COUNT = 3
const DEFAULT_PAGE_SIZE = 10

// ✅ Types/Interfaces: PascalCase
interface UserResponse { ... }
type BatchExecutionStatus = 'pending' | 'running' | 'completed'

// ✅ Hooks: use prefix
const useUserData = () => { ... }
const useBatchManagement = () => { ... }

// ✅ Event handlers: handle prefix
const handleClick = () => { ... }
const handleFormSubmit = (e: FormEvent) => { ... }
```

### Bad Examples

```typescript
// ❌ Component with camelCase
export const userProfile = () => { ... }

// ❌ Function with PascalCase
const FetchUserData = async () => { ... }

// ❌ Vague variable names
const x = await fetchData()
const tmp = users.filter(...)
const data = response.json()  // What data?
const info = getInfo()        // What info?

// ❌ Inconsistent naming
const fetch_user_data = () => { ... }  // snake_case in JS
const USERPROFILE = () => { ... }       // All caps for component
```

### File Naming

```
✅ Good:
- UserProfile.tsx          (component)
- useUserData.ts           (hook)
- userService.ts           (service)
- user.types.ts            (types)

❌ Bad:
- user-profile.tsx         (kebab-case for component)
- User_Data.ts             (mixed case)
- CONSTANTS.ts             (all caps file name)
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

