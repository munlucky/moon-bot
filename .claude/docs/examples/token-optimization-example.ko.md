# 토큰 효율화 적용 예시

## 시나리오: "배치 관리 기능 구현"

사용자 요청: "배치 관리 기능을 구현해줘. 목록 조회, 상세 보기, 실행 기능이 필요해."

---

## ❌ 비효율적 방식 (Before - JSON 사용)

### Moonshot Agent가 Implementation Agent에게 전달 (JSON 형식)
```yaml
# 이것도 실제로는 JSON으로 전달했지만, YAML로 표시
task: "배치 관리 기능 구현"
userRequest: "배치 관리 기능을 구현해줘. 목록 조회, 상세 보기, 실행 기능이 필요해."
projectContext:
  existingFiles:
    "src/pages/member/MemberListPage.tsx": "... (500줄 전체 내용)"
    "src/pages/member/MemberDetailPage.tsx": "... (300줄 전체 내용)"
    "src/api/member.ts": "... (200줄 전체 내용)"
    "src/types/member/entities.ts": "... (100줄 전체 내용)"
  projectRules: "... (.claude/PROJECT.md 전체 내용 50줄)"
  patterns:
    entityRequest: "... (패턴 문서 전체 내용 80줄)"
    apiProxy: "... (패턴 문서 전체 내용 60줄)"
conversationHistory:
  - "... (전체 대화 내용 100줄)"
```

**토큰 소비**: 약 5,000 토큰 (파일 내용 + 문서 + 히스토리)
**문제점**:
- 파일 전체 내용 포함
- 전체 대화 히스토리 포함
- JSON 사용 시 추가 20-30% 토큰 낭비

---

## ✅ 효율적 방식 (After)

### 1단계: Moonshot Agent 분석 (YAML 사용)
```yaml
taskType: "feature"
complexity: "medium"
phase: "planning"
requiredAgents:
  - "RequirementsAnalyzer"
  - "ContextBuilder"
  - "ImplementationAgent"
  - "VerificationAgent"
```
**YAML 효과**: JSON 대비 20-30% 절감

### 2단계: Requirements Analyzer에게 전달 (YAML)
```yaml
task: "배치 관리 기능 구현"
userRequest: "목록 조회, 상세 보기, 실행 기능"
projectPatterns:
  - "entity-request 분리"
  - "axios 래퍼"
outputFile: ".claude/features/batch/agreement.md"
```
**토큰 소비**: ~70 토큰 (YAML 사용으로 JSON 대비 30% 절감)

**Requirements Analyzer 동작**:
- 필요시 `.claude/PROJECT.md` 직접 Read
- 필요시 유사 기능 탐색 (Glob, Grep)
- `agreement.md` 생성

---

### 3단계: Context Builder에게 전달 (YAML)
```yaml
agreementFile: ".claude/features/batch/agreement.md"
relevantFilePaths:
  - "src/pages/member/*.tsx"
  - "src/api/member.ts"
  - "src/types/member/*.ts"
outputFile: ".claude/features/batch/context.md"
```
**토큰 소비**: ~55 토큰 (YAML 사용으로 JSON 대비 30% 절감)

**Context Builder 동작**:
1. `agreement.md` Read (필요한 부분만)
2. `src/pages/member/MemberListPage.tsx` Read (유사 패턴 확인)
3. `src/api/member.ts:45-67` Read (API 호출 패턴만)
4. `context.md` 생성

**Progressive Disclosure 효과**:
- 전체 파일 읽지 않고 필요한 부분만
- 토큰 절약: ~60%

---

### 4단계: Implementation Agent에게 전달 (YAML)
```yaml
mode: "write"
contextFile: ".claude/features/batch/context.md"
targetFiles:
  - "src/pages/batch/BatchListPage.tsx"
  - "src/pages/batch/BatchDetailPage.tsx"
  - "src/api/batch.ts"
  - "src/types/batch/entities.ts"
  - "src/types/batch/requests.ts"
patterns:
  entityRequest: "entity와 request 타입 분리"
  apiProxy: "axios 래퍼 패턴"
```
**토큰 소비**: ~85 토큰 (YAML 사용으로 JSON 대비 30% 절감)

**Implementation Agent 동작**:
1. `context.md` Read
2. 패턴 필요시 `.claude/agents/implementation/patterns/entity-request-separation.md` Read
3. 유사 파일 참조 필요시 선택적 Read
4. 구현 시작

**출력 체인 효과**:
- 이전 단계 히스토리 없이 context.md만 참조
- 토큰 절약: ~70%

---

## 📊 토큰 소비 비교

| 항목 | Before (JSON+전체) | After (YAML+최소) | 절감률 |
|-----|-------------------|------------------|--------|
| Requirements | ~1,500 토큰 | ~70 토큰 | **95%** |
| Context Builder | ~2,000 토큰 | ~55 토큰 | **97%** |
| Implementation | ~5,000 토큰 | ~85 토큰 | **98%** |
| **총합** | **~8,500 토큰** | **~210 토큰** | **98%** |

**실제 작업 토큰**:
- After 방식은 각 에이전트가 필요시 파일을 Read하므로 추가 소비 발생
- 하지만 필요한 파일만 선택적으로 읽으므로 여전히 큰 폭 절감
- **YAML 효과 추가**: JSON 대비 20-30% 절감
- **예상 총 토큰**: Before ~15,000 → After ~2,000 (87% 절감)

---

## 🔀 병렬 실행 예시 (Complex 작업)

### 시나리오: "주문 관리 시스템 구현" (복잡도: complex)

#### Before: 비효율적 병렬 실행
```bash
# Validator에게 전달 (5,000 토큰)
{
  "task": "...",
  "fullContext": "... (전체 컨텍스트)",
  "allFiles": {
    "file1.tsx": "... (전체 내용)",
    ...
  }
}

# Implementation에게 전달 (5,000 토큰)
{
  "task": "...",
  "fullContext": "... (전체 컨텍스트)",  # 중복!
  "allFiles": {
    "file1.tsx": "... (전체 내용)",      # 중복!
    ...
  }
}
```
**총 토큰 소비**: 10,000 토큰 (중복 100%)

---

#### After: 효율적 병렬 실행

**1. 공통 스냅샷 준비 (1회, YAML 사용)**
```yaml
featureName: "주문 관리"
agreementFile: ".claude/features/order/agreement.md"
contextFile: ".claude/features/order/context.md"
codebasePatterns:
  entityRequest: "src/types/entities vs src/types/requests"
  apiProxy: "axios 래퍼 사용"
relevantFilePaths:
  - "src/pages/order/*.tsx"
  - "src/api/order.ts"
  - "src/types/order/*.ts"
  - "src/hooks/useOrder*.ts"
```
**토큰 소비**: 105 토큰 (YAML 사용으로 JSON 대비 30% 절감)

**2. Validator 추가 정보 (YAML)**
```yaml
mode: "readonly"
reviewFocus:
  - "엣지 케이스"
  - "타입 안정성"
  - "에러 처리"
```
**토큰 소비**: 14 토큰 (YAML 사용으로 JSON 대비 30% 절감)

**3. Implementation 추가 정보 (YAML)**
```yaml
mode: "write"
targetFiles:
  - "src/pages/order/OrderListPage.tsx"
  - "src/pages/order/OrderDetailPage.tsx"
  - "src/api/order.ts"
```
**토큰 소비**: 21 토큰 (YAML 사용으로 JSON 대비 30% 절감)

**총 토큰 소비**: 140 토큰 (초기 컨텍스트만, JSON 대비 30% 절감)

**실제 작업 중**:
- Validator: 스냅샷(105) + 추가(14) + 필요시 파일 Read (~500) = **~620 토큰**
- Implementation: 스냅샷(105) + 추가(21) + 필요시 파일 Read (~800) = **~925 토큰**
- **총 병렬 실행**: ~1,545 토큰

**절감 효과**:
- Before (JSON) 10,000 → After (YAML) 1,545 = **85% 절감**
- YAML 추가 효과: JSON 대비 30% 추가 절감

---

## 💡 핵심 교훈

### 1. 파일 경로만 전달하라
- 내용은 에이전트가 필요시 직접 Read
- PM의 역할: "어디를 보면 되는지" 안내

### 2. 출력 파일 경로를 체인하라
- agreement.md → context.md → implementation
- 전체 히스토리 전달 금지

### 3. 병렬 실행 시 공통 스냅샷 1회 준비
- 중복 제거가 가장 큰 효과
- 역할별 최소 추가 정보만

### 4. Progressive Disclosure
- 처음부터 모든 것을 로드하지 마라
- 작업 흐름에 따라 점진적 확장

### 5. 참조 기반 전달
- `파일명:라인` 형태로 정확한 위치 안내
- 수백 줄 대신 수십 줄만 읽게

### 6. YAML 사용 필수
- **JSON 사용 금지**, 반드시 YAML 사용
- 따옴표, 중괄호, 쉼표 제거로 20-30% 토큰 절감
- 가독성도 향상되어 인간도 읽기 편함

---

**작성일**: 2026-01-10
**버전**: 1.0
**상태**: 예시 문서
