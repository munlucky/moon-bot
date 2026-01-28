# PM 분석 가이드라인

## 1. 작업 유형 분류 (Task Type Classification)
### feature (신규 기능)
**키워드**: "신규", "추가", "구현", "생성", "만들어줘"
**예시**:
- "배치 관리 기능 구현해줘"
- "회원 검색 추가해줘"
**특징**:
- context.md 없음
- 신규 디렉토리/파일 생성
- 3단계 구현 (Planning → Implementation → Verification)

### modification (수정)
**키워드**: "변경", "수정", "개선", "~로 바꿔줘", "제거"
**예시**:
- "날짜 입력 한 개만 남기고"
- "배치 실행 컬럼 제거해줘"
**특징**:
- context.md 있음
- 기존 파일 수정
- 1-2단계 구현 (Implementation → Verification)

### bugfix (버그 수정)
**키워드**: "버그", "에러", "수정", "안 돼", "실패"
**예시**:
- "타입 에러 수정해줘"
- "페이징이 깨졌어"
**특징**:
- 높은 긴급도
- 근본 원인 분석 필요
- 검증 강화

### refactor (리팩터링)
**키워드**: "리팩터링", "정리", "분리", "최적화"
**예시**:
- "컴포넌트 분리해줘"
- "코드 정리해줘"
**특징**:
- 기능 변경 없음
- 코드 품질 개선
- 엄격한 회귀 테스트

## 2. 복잡도 평가 (Complexity Assessment)
### simple (단순)
**조건**: 1-2개 파일, 100줄 미만, 1시간 이내
**에이전트 시퀀스**: Implementation → Verification

**전달 컨텍스트 (최소화, YAML 사용)**:
```yaml
task: "작업 1줄 요약"
targetFiles:
  - "file1.ts"
userRequest: "원본 요청 텍스트 (50자 이내)"
```
- **토큰 절약**: 파일 내용 전달 X, 경로만 전달 → 에이전트가 직접 Read
- **YAML 사용**: JSON 대비 20-30% 토큰 절감 (따옴표, 중괄호 제거)

### medium (중간)
**조건**: 3-5개 파일, 100-300줄, 1-3시간
**에이전트 시퀀스**: Requirements → Context → Implementation → Verification → Documentation

**전달 컨텍스트 (체인 방식, YAML 사용)**:
- Requirements → `agreement.md` 생성
- Context → `agreement.md` 경로 받음, `context.md` 생성
- Implementation → `context.md` 경로 + 핵심 제약 3-5개만:
```yaml
contextFile: ".claude/features/xxx/context.md"
coreConstraints:
  - "페이징 필수"
  - "엔티티-요청 분리"
targetPattern: "src/pages/xxx/*.tsx"
```
- **토큰 절약**: 각 에이전트는 이전 출력물 경로만 받고, 필요시 해당 파일 Read
- **YAML 효과**: JSON 대비 구조가 간결해 토큰 20-30% 절감

### complex (복잡)
**조건**: 6개 이상 파일, 300줄 이상, 3시간 이상
**에이전트 시퀀스**: Requirements → Context → CodexValidator → Implementation → TypeSafety → Verification → Documentation

**전달 컨텍스트 (병렬 실행 고려, YAML 사용)**:
- Requirements → `agreement.md` 생성
- Context → `agreement.md` + `context.md` 생성
- **병렬 실행 시점** (Validator || Implementation):
  - 공통 스냅샷 1회 준비:
```yaml
agreementFile: ".claude/features/xxx/agreement.md"
contextFile: ".claude/features/xxx/context.md"
codebasePatterns:
  entityRequest: "src/types/entities vs src/types/requests"
  apiProxy: "axios 래퍼 사용 중"
relevantFiles:
  - "src/pages/xxx/*.tsx"
  - "src/api/xxx.ts"
  - "src/types/xxx/*.ts"
```
  - Validator: 스냅샷 + 검토 대상 파일 경로만 받음 (읽기 전용)
  - Implementation: 스냅샷 + 구현 대상 파일 경로만 받음 (쓰기 가능)
- **토큰 절약**:
  - 공통 정보는 YAML 1회만 준비 (JSON 대비 20-30% 적음)
  - 각 에이전트는 필요한 파일만 선택적 Read
  - 파일 내용은 스냅샷에 포함 X

## 3. 단계 판단 (Phase Determination)
### Planning (계획)
**조건**: context.md 없음, 신규 기능, 불명확한 요구사항
**에이전트**: Requirements Analyzer, Context Builder, Codex Validator (complex인 경우)

### Implementation (구현)
**조건**: context.md 있음, 명확한 요구사항, 코딩 준비 완료
**에이전트**: Implementation Agent, Type Safety Agent

### Integration (연동)
**조건**: "API 적용", "연동", Mock 완료, API 스펙 확정
**에이전트**: Implementation Agent (API), Type Safety Agent, Verification Agent

### Verification (검증)
**조건**: 구현 완료, "검증", "테스트" 키워드
**에이전트**: Verification Agent, Documentation Agent