# 토큰 효율화 가이드라인 (Token Optimization Guidelines)

## 📌 목표
에이전트 간 컨텍스트 전달 시 토큰 낭비를 최소화하고, 특히 병렬 실행에서 중복 비용을 제거합니다.

---

## 🎯 6대 핵심 원칙

### 0. 스킬 Fork 컨텍스트 (`context: fork`)
**문제**: PM 스킬들이 순차 실행될 때 중간 분석 과정(파일 읽기, 코드베이스 탐색)이 메인 세션에 누적되어 컨텍스트 비대화

**해결**:
- 분석/검토 중심 스킬에 `context: fork` 옵션 적용
- 스킬이 **별도 sub-agent 세션**에서 실행되고, **결과만 메인 세션에 반환**
- 메인 세션 토큰 ~90% 절감 (분석 단계 기준)

**적용 기준**:
- ✅ **분석/검토 스킬**: 파일을 많이 읽지만 쓰지 않는 스킬
- ❌ **실행/쓰기 스킬**: 파일 수정이 필요한 스킬

**적용 대상**:
```yaml
# SKILL.md frontmatter에 추가
---
name: moonshot-classify-task
description: ...
context: fork   # ← 이 한 줄 추가
---
```

| 적용 O (fork) | 적용 X |
|--------------|--------|
| moonshot-classify-task | implementation-runner |
| moonshot-evaluate-complexity | efficiency-tracker |
| moonshot-detect-uncertainty | session-logger |
| moonshot-decide-sequence | doc-sync |
| pre-flight-check | |
| codex-validate-plan | |
| codex-review-code | |
| codex-test-integration | |

**주의사항**:
- Fork 세션은 메인 컨텍스트를 참조할 수 없음 → 필요한 정보를 인수로 전달해야 함
- 현재 스킬들은 `analysisContext`를 인수로 받는 구조여서 호환됨

### 1. 최소 정보 전달 (Minimal Context Transfer)
**문제**: 전체 컨텍스트를 sub-agent에게 전달하면 토큰이 2배로 소비됨
**해결**:
- 각 에이전트에게 **필요한 정보만** YAML 스냅샷(5-10줄)으로 전달
- 파일 내용 대신 **파일 경로만** 전달
- **YAML 사용**: JSON 대비 20-30% 토큰 절감 (따옴표, 중괄호, 쉼표 제거)
- 예시:
```yaml
task: "배치 관리 기능 구현"
targetFiles:
  - "src/pages/batch/*.tsx"
constraints:
  - "페이징 필수"
```

### 2. Progressive Disclosure
**문제**: 처음부터 모든 파일을 로드하면 불필요한 토큰 소비
**해결**:
- 에이전트는 처음에 경로 목록만 받음
- 작업 중 **필요한 파일만 선택적으로 Read**
- PM은 "어디를 보면 되는지" 안내만 제공

### 3. 출력 체인 (Output Chaining)
**문제**: 전체 대화 히스토리를 다음 에이전트에게 넘기면 누적 증가
**해결**:
- 이전 에이전트의 **출력 파일 경로만** 전달
- 전체 히스토리를 넘기지 않음
- 예시 체인:
  - Requirements → `agreement.md` 생성
  - Context → `agreement.md` 경로만 받음, `context.md` 생성
  - Implementation → `context.md` 경로만 받음

### 4. 병렬 실행 시 공통 컨텍스트 단일화
**문제**: Validator와 Implementation을 병렬 실행하면 같은 컨텍스트가 2번 로드됨
**해결**:
- PM이 **공통 스냅샷을 1회만 준비**
- 두 에이전트 모두 이 스냅샷 참조
- 역할별 최소 정보만 추가:
  - Validator: `"mode": "readonly"` + 검토 대상 파일 경로
  - Implementation: `"mode": "write"` + 구현 대상 파일 경로

**예시 (YAML)**:
```yaml
# 공통 스냅샷 (1회 준비)
featureName: "배치 관리"
contextFile: ".claude/features/batch/context.md"
patterns:
  entityRequest: "타입 분리 패턴"
relevantFilePaths:
  - "src/pages/batch/*.tsx"

# Validator 추가 정보
mode: "readonly"
reviewFocus:
  - "엣지 케이스"

# Implementation 추가 정보
mode: "write"
targetFiles:
  - "src/pages/batch/BatchListPage.tsx"
```

### 5. 참조 기반 전달 (Reference-Based Transfer)
**문제**: 파일 전체 내용을 전달하면 수백~수천 줄이 컨텍스트에 포함
**해결**:
- `파일명:라인` 형태로 참조만 전달
- 예: `src/api/batch.ts:45-67` (해당 함수만 보면 됨)
- 에이전트가 필요시 해당 범위만 Read

---

## 📊 복잡도별 적용 전략

### Simple (1-2개 파일)
```yaml
task: "작업 1줄 요약"
targetFiles:
  - "file1.ts"
userRequest: "원본 요청 (50자 이내)"
```
- 파일 경로만, 내용 X
- YAML로 JSON 대비 20-30% 절감

### Medium (3-5개 파일)
**체인 방식**:
- Requirements → `agreement.md` 경로
- Context → `context.md` 경로
- Implementation → `context.md` 경로 + 핵심 제약 3-5개

### Complex (6개 이상 파일)
**병렬 실행 + 공통 스냅샷 (YAML)**:
```yaml
agreementFile: ".claude/features/xxx/agreement.md"
contextFile: ".claude/features/xxx/context.md"
codebasePatterns:
  entityRequest: "entity와 request 분리"
  apiProxy: "axios 래퍼"
relevantFilePaths:
  - "src/pages/xxx/*.tsx"
  - "src/api/xxx.ts"
```
- Validator와 Implementation이 이 스냅샷 공유
- 각자 필요한 파일만 선택적 로드
- YAML 사용으로 추가 20-30% 절감

---

## 📈 예상 효과

### 병렬 실행 시 토큰 절감
- 공통 정보 중복 제거: **~50% 절약**
- 파일 내용 지연 로드: **~30% 절약**
- 역할별 필요 정보만: **~20% 절약**
- YAML 사용 (vs JSON): **~20-30% 절약**
- **총 예상 절감**: 병렬 실행 시 **50-70% 토큰 절감**

### 순차 실행 시 토큰 절감
- 출력 체인 적용: **~30% 절약**
- Progressive Disclosure: **~25% 절약**
- 참조 기반 전달: **~15% 절약**
- YAML 사용 (vs JSON): **~20-30% 절약**
- **총 예상 절감**: 순차 실행 시 **40-50% 토큰 절감**

---

## 🛠️ 구현 체크리스트

### Moonshot Agent 수행 항목
- [ ] 에이전트별 최소 페이로드 YAML 생성 (JSON 사용 금지)
- [ ] 파일 경로만 포함, 내용 제외
- [ ] 병렬 실행 시 공통 스냅샷 1회 준비
- [ ] 이전 단계 출력 파일 경로만 전달

### 개별 에이전트 수행 항목
- [ ] 받은 페이로드에서 파일 경로 확인
- [ ] 필요한 파일만 선택적으로 Read
- [ ] 전체 히스토리 요청 금지
- [ ] 출력 파일 생성 (다음 에이전트가 경로로 참조)

### 금지 사항
- ❌ 파일 전체 내용을 페이로드에 포함
- ❌ 전체 대화 히스토리를 다음 에이전트에게 전달
- ❌ 병렬 실행 시 각 에이전트에게 별도 컨텍스트 준비
- ❌ 처음부터 모든 파일 로드
- ❌ JSON 사용 (반드시 YAML 사용)

---

## 📚 참조 문서
- `.claude/agents/moonshot-agent.md` - PM 워크플로우
- `.claude/docs/guidelines/analysis-guide.md` - 복잡도별 컨텍스트
- `.claude/docs/guidelines/parallel-execution.md` - 병렬 실행 전략
- `.claude/templates/moonshot-output.json` - 페이로드 구조

---

## 💡 실전 팁

### 디버깅 시
- 토큰 사용량이 예상보다 높다면 페이로드에 파일 내용이 포함되었는지 확인
- 각 에이전트의 첫 번째 동작이 "파일 Read"인지 확인

### 최적화 우선순위
1. **병렬 실행 구간** (가장 큰 효과)
2. **Complex 작업** (파일이 많아 누적 효과)
3. **Medium 작업** (중간 효과)
4. **Simple 작업** (효과는 작지만 일관성 유지)

### 측정 방법
- 실제 토큰 사용량을 로깅해서 개선 효과 측정
- 복잡도별/단계별 토큰 소비 패턴 분석
- 병렬 실행 전후 비교

---

**작성일**: 2026-01-10
**버전**: 1.0
**상태**: 활성
