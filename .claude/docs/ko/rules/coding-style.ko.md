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

## 네이밍 규칙

> "설명 세 문단보다 코드 예제 하나가 낫습니다" - 좋은 스펙 작성 원칙

### 좋은 예시

```typescript
// ✅ 컴포넌트: PascalCase
export const UserProfile = () => { ... }
export const BatchManagementTable = () => { ... }

// ✅ 변수/함수: camelCase
const fetchUserData = async () => { ... }
const handleSubmit = () => { ... }
const isLoading = true

// ✅ 상수: SCREAMING_SNAKE_CASE
const API_BASE_URL = '/api/v1'
const MAX_RETRY_COUNT = 3
const DEFAULT_PAGE_SIZE = 10

// ✅ 타입/인터페이스: PascalCase
interface UserResponse { ... }
type BatchExecutionStatus = 'pending' | 'running' | 'completed'

// ✅ 훅: use 접두사
const useUserData = () => { ... }
const useBatchManagement = () => { ... }

// ✅ 이벤트 핸들러: handle 접두사
const handleClick = () => { ... }
const handleFormSubmit = (e: FormEvent) => { ... }
```

### 나쁜 예시

```typescript
// ❌ 컴포넌트에 camelCase
export const userProfile = () => { ... }

// ❌ 함수에 PascalCase
const FetchUserData = async () => { ... }

// ❌ 모호한 변수명
const x = await fetchData()
const tmp = users.filter(...)
const data = response.json()  // 무슨 데이터?
const info = getInfo()        // 무슨 정보?

// ❌ 일관성 없는 네이밍
const fetch_user_data = () => { ... }  // JS에서 snake_case
const USERPROFILE = () => { ... }       // 컴포넌트에 대문자만
```

### 파일 네이밍

```
✅ 좋은 예시:
- UserProfile.tsx          (컴포넌트)
- useUserData.ts           (훅)
- userService.ts           (서비스)
- user.types.ts            (타입)

❌ 나쁜 예시:
- user-profile.tsx         (컴포넌트에 kebab-case)
- User_Data.ts             (혼합 케이스)
- CONSTANTS.ts             (파일명 전체 대문자)
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

