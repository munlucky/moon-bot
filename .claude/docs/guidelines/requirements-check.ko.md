# 요구사항 완료 체크 가이드라인 (Requirements Completion Check Guidelines)

## 트리거 (Trigger)
- **Verification Agent** 완료 후.
- **Documentation Agent** 최종화(Finalize) 전.

## 목적 (Purpose)
작업 종료 전 요구사항 100% 충족 보장.

## 체크 항목 (Check Items)
1. **합의서 대조 (Agreement Cross-check)**: `context.md` vs 초기 합의서 비교.
2. **Context 체크포인트**: `context.md`의 모든 Phase가 "Done" 상태인지 확인.
3. **미해결 질문 (Pending Questions)**: `pending-questions.md`에 해결되지 않은 HIGH/MEDIUM 질문이 없는지 확인.

## 프로세스 (Process)
1. 체크 실행.
2. 미완료 시 -> Implementation Agent 재실행 (타겟 수정).
3. 완료 시 -> 문서 최종화 (Finalize Documentation).

## 출력 형식 (JSON)
### 미완료 (재실행 필요)
```json
{
  "status": "incomplete",
  "incomplete_items": [
    {
      "type": "agreement",
      "content": "에러 Alert 추가",
      "priority": "HIGH",
      "reason": "합의서 누락 항목"
    }
  ],
  "next_action": "re_run_implementation"
}
```

### 완료
```json
{
  "status": "all_complete",
  "completed_items": ["날짜 UI", "배치 API", "결과 테이블"],
  "next_action": "documentation_finalize"
}
```

## 재실행 로직 (Re-run Logic)
- `incomplete_items`에 대해서만 구현 수행.
- 전체 재생성 건너뜀.
- 루프: Implementation -> Verification -> 다시 체크.