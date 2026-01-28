# 코딩 스타일 가이드라인

## 파일 구조

- 파일당 200-400줄 (최대 800줄)
- 함수당 50줄 미만
- 중첩 4단계 미만

## 불변성 패턴 (CRITICAL)

```typescript
// ❌ Bad - mutation
user.name = "New Name"
items.push(newItem)

// ✅ Good - immutability
const updatedUser = { ...user, name: "New Name" }
const newItems = [...items, newItem]
```

## 금지 사항

- 프로덕션 코드에 `console.log`
- 코드/주석에 이모지
- 설명 없는 하드코딩된 매직 넘버

## 감지해야 할 코드 스멜

- 긴 함수 (>50줄)
- 깊은 중첩 (>4단계)
- 중복 코드
- 누락된 에러 처리 (try/catch)
- 티켓 없는 TODO/FIXME
- 부적절한 변수명 (x, tmp, data)

## React/Next.js 성능 (CRITICAL)

> 상세 규칙: `.claude/skills/vercel-react-best-practices/SKILL.md` 참조

### Waterfall 제거 (최우선)

```typescript
// ❌ Bad - 순차 실행 (3 round trips)
const user = await fetchUser()
const posts = await fetchPosts()
const comments = await fetchComments()

// ✅ Good - 병렬 실행 (1 round trip)
const [user, posts, comments] = await Promise.all([
  fetchUser(),
  fetchPosts(),
  fetchComments()
])
```

### 번들 최적화

```typescript
// ❌ Bad - Barrel file에서 전체 로드
import { Button, TextField } from '@mui/material'

// ✅ Good - 직접 import
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'

// ✅ Good - Dynamic import로 지연 로딩
const MonacoEditor = dynamic(() => import('./monaco-editor'), { ssr: false })
```

### RSC 직렬화 최소화

```typescript
// ❌ Bad - 50개 필드 전체 전달
<Profile user={user} />

// ✅ Good - 필요한 필드만 전달
<Profile name={user.name} avatar={user.avatar} />
```

