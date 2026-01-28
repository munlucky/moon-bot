# 병렬 실행 가이드라인 (Parallel Execution Guidelines)

## 트리거 조건 (Trigger Conditions)
- **Context Builder** 완료 후.
- **complexity: complex**일 때만.
- **Planning Phase**의 마지막 단계.

## 전략 (Strategy)
**Codex Validator** (계획 검증)와 **Implementation Agent** (코딩)를 병렬로 실행합니다.
- Validator는 엣지 케이스 등 계획을 검토합니다.
- Implementation은 즉시 코딩을 시작합니다.
- 동기화(Sync)는 Validator가 완료된 후 수행됩니다.

### 🎯 토큰 중복 방지 전략
**문제**: Validator와 Implementation을 병렬로 실행하면 같은 컨텍스트가 2번 로드됨
**해결**:
1. **공통 스냅샷 1회 준비**:
   - Moonshot Agent가 병렬 실행 전 단일 JSON 스냅샷 생성
   - 두 에이전트 모두 이 스냅샷을 참조
2. **역할별 최소 정보만 추가**:
   - Validator: `"mode": "readonly"` + 검토 대상 파일 경로만
   - Implementation: `"mode": "write"` + 구현 대상 파일 경로만
3. **파일 내용은 포함 안 함**:
   - 스냅샷에는 파일 경로만 (`src/pages/xxx/*.tsx`)
   - 각 에이전트가 필요시 직접 Read 호출
4. **이전 단계 출력 파일 경로만 전달**:
   - `agreement.md`, `context.md` 경로만 제공
   - 파일 내용은 에이전트가 필요시 읽음

**예시 - 공통 스냅샷 (YAML)**:
```yaml
featureName: "배치 관리"
agreementFile: ".claude/features/batch/agreement.md"
contextFile: ".claude/features/batch/context.md"
patterns:
  entityRequest: "entity와 request 타입 분리"
  apiProxy: "axios 래퍼 패턴"
relevantFilePaths:
  - "src/pages/batch/*.tsx"
  - "src/api/batch.ts"
  - "src/types/batch/*.ts"
```

**예시 - Validator 추가 정보 (YAML)**:
```yaml
mode: "readonly"
reviewFocus:
  - "엣지 케이스"
  - "타입 안정성"
  - "에러 처리"
```

**예시 - Implementation 추가 정보 (YAML)**:
```yaml
mode: "write"
targetFiles:
  - "src/pages/batch/BatchListPage.tsx"
  - "src/api/batch.ts"
```

**토큰 절약 효과**:
- 공통 정보 중복 제거: ~50% 절약
- 파일 내용 지연 로드: ~30% 절약
- 역할별 필요 정보만: ~20% 절약
- YAML 사용 (vs JSON): ~20-30% 절약
- **총 예상 절약**: 병렬 실행 시 ~50-70% 토큰 절감

## 실행 스크립트 로직 (Execution Script Logic)
```bash
# Context Builder 완료 후
echo "✅ Context Builder 완료"
echo "🔀 병렬 실행 시작: Codex Validator || Implementation Agent"

# 병렬 호출
codex-validator-agent --feature {feature_name} &
VALIDATOR_PID=$!

implementation-agent --feature {feature_name} &
IMPL_PID=$!

# Validator 대기 (읽기 전용이라 빠름)
wait $VALIDATOR_PID
echo "✅ Codex Validator 완료"

# Validator 피드백을 Context에 동기화
doc-sync-skill \
  --feature {feature_name} \
  --updates validator-output.json
echo "✅ Doc Sync 완료: context.md 업데이트됨"

# Implementation 대기
wait $IMPL_PID
echo "✅ Implementation Agent 완료"

# 구현 중 계획 변경 여부 확인
if [[ context.md updated after implementation start ]]; then
  echo "⚠️ Validator가 계획을 수정했습니다."
  echo "📝 Implementation Agent가 변경사항을 반영했는지 확인 중..."
  # 중요한 변경사항이 누락되었다면 다음 페이즈에서 패치 스케줄링
fi
```

## 동기화 지점 (Synchronization Points)
| 시점 | 이벤트 | 액션 |
|---|---|---|
| Context Builder 완료 | 병렬 실행 시작 | Validator와 Implementation 동시 시작 |
| Validator 완료 | Doc Sync | `context.md`에 피드백 업데이트 |
| Implementation 완료 | Context 확인 | Validator의 피드백 반영 여부 검증 |
| 둘 다 완료 | Type Safety 시작 | 다음 순차 단계로 진행 |

```