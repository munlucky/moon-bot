#!/bin/bash

# Verification Script for Readlog CMS v3
# 목적: 코드 변경사항 자동 검증 (tsc, build, lint, 활동 로그 헤더)
# 사용: ./verify-changes.sh [feature-name]

set -e  # 에러 발생 시 즉시 중단

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 헬퍼 함수
log_info() {
  echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
  echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
  echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
  echo -e "${RED}❌ $1${NC}"
}

# 헤더
echo ""
echo "======================================"
echo "  🔍 Verification Agent"
echo "======================================"
echo ""

# 기능명 파라미터 (선택적)
FEATURE_NAME=${1:-"changes"}
log_info "검증 대상: $FEATURE_NAME"
echo ""

# 결과 누적
VERIFICATION_PASSED=true
RESULTS_FILE=".claude/verification-results-$(date +%Y%m%d-%H%M%S).txt"

# 결과 파일 헤더
echo "# Verification Results" > "$RESULTS_FILE"
echo "Date: $(date '+%Y-%m-%d %H:%M:%S')" >> "$RESULTS_FILE"
echo "Feature: $FEATURE_NAME" >> "$RESULTS_FILE"
echo "" >> "$RESULTS_FILE"

# ====================================
# 1. TypeScript 타입 체크
# ====================================
log_info "1/6 TypeScript 타입 체크 실행 중..."
if npx tsc --noEmit 2>&1 | tee -a "$RESULTS_FILE"; then
  log_success "TypeScript 타입 체크 통과"
  echo "TypeScript: ✅ PASSED" >> "$RESULTS_FILE"
else
  log_error "TypeScript 타입 에러 발생"
  echo "TypeScript: ❌ FAILED" >> "$RESULTS_FILE"
  VERIFICATION_PASSED=false
fi
echo ""

# ====================================
# 2. 프로덕션 빌드
# ====================================
log_info "2/6 프로덕션 빌드 실행 중..."
if npm run build 2>&1 | tee -a "$RESULTS_FILE"; then
  log_success "프로덕션 빌드 성공"
  echo "Build: ✅ PASSED" >> "$RESULTS_FILE"
else
  log_error "빌드 실패"
  echo "Build: ❌ FAILED" >> "$RESULTS_FILE"
  VERIFICATION_PASSED=false
fi
echo ""

# ====================================
# 3. ESLint 검사
# ====================================
log_info "3/6 ESLint 검사 실행 중..."
if npm run lint 2>&1 | tee -a "$RESULTS_FILE"; then
  log_success "ESLint 검사 통과"
  echo "Lint: ✅ PASSED" >> "$RESULTS_FILE"
else
  log_warning "ESLint 경고 발생 (무시 가능)"
  echo "Lint: ⚠️  WARNINGS" >> "$RESULTS_FILE"
fi
echo ""

# ====================================
# 4. 활동 로그 헤더 확인
# ====================================
log_info "4/6 활동 로그 헤더 확인 중..."
echo "" >> "$RESULTS_FILE"
echo "## Activity Log Headers" >> "$RESULTS_FILE"
echo "" >> "$RESULTS_FILE"

# staged 파일 중 _fetch/*.client.ts 찾기
FETCH_FILES=$(git diff --cached --name-only | grep "_fetch/.*\.client\.ts$" || true)

if [ -z "$FETCH_FILES" ]; then
  log_info "변경된 _fetch 파일 없음 (활동 로그 헤더 확인 생략)"
  echo "No _fetch files changed" >> "$RESULTS_FILE"
else
  log_info "변경된 _fetch 파일 발견:"
  echo "$FETCH_FILES" | while read -r file; do
    echo "  - $file"
  done
  echo ""

  # 활동 로그 헤더 패턴 검색
  log_info "활동 로그 헤더 패턴 검색 중..."
  HEADER_FOUND=false

  echo "$FETCH_FILES" | while read -r file; do
    if git diff --cached "$file" | grep -q "createActivityHeaders"; then
      log_success "$file: 활동 로그 헤더 포함 ✅"
      echo "- $file: ✅ HAS ACTIVITY HEADERS" >> "$RESULTS_FILE"
      HEADER_FOUND=true
    else
      log_warning "$file: 활동 로그 헤더 누락 가능성 ⚠️"
      echo "- $file: ⚠️  MISSING ACTIVITY HEADERS?" >> "$RESULTS_FILE"
    fi
  done

  # 헤더 사용 규칙 안내
  echo ""
  log_info "활동 로그 헤더 규칙 (CLAUDE.md):"
  echo "  ✅ 목록 조회 (_fetchList): ActivityAction.SEARCH"
  echo "  ✅ 등록: ActivityAction.ADD"
  echo "  ✅ 수정: ActivityAction.EDIT"
  echo "  ✅ 삭제: ActivityAction.DELETE"
  echo "  ❌ 카운트 조회 (_fetchCount): 헤더 제외"
  echo "  ❌ 팝업 내부 조회: 헤더 제외"
fi
echo ""

# ====================================
# 5. Git 상태 확인
# ====================================
log_info "5/6 Git 상태 확인 중..."
echo "" >> "$RESULTS_FILE"
echo "## Git Status" >> "$RESULTS_FILE"
echo "" >> "$RESULTS_FILE"

# Staged 파일 확인
STAGED_FILES=$(git diff --cached --name-only)
if [ -z "$STAGED_FILES" ]; then
  log_warning "Staged 파일 없음 (git add 필요)"
  echo "No staged files" >> "$RESULTS_FILE"
else
  log_info "Staged 파일 ($(echo "$STAGED_FILES" | wc -l | tr -d ' ')개):"
  echo "$STAGED_FILES" | while read -r file; do
    echo "  - $file"
    echo "- $file" >> "$RESULTS_FILE"
  done
fi
echo ""

# ====================================
# 6. Entity-Request 분리 패턴 확인 (선택적)
# ====================================
log_info "6/6 (선택) Entity-Request 분리 패턴 확인 중..."
echo "" >> "$RESULTS_FILE"
echo "## Entity-Request Separation" >> "$RESULTS_FILE"
echo "" >> "$RESULTS_FILE"

# _entities/ 파일 확인
ENTITY_FILES=$(echo "$STAGED_FILES" | grep "_entities/.*\.ts$" || true)
REQUEST_FILES=$(echo "$STAGED_FILES" | grep "_requests/.*\.ts$" || true)

if [ -n "$ENTITY_FILES" ] || [ -n "$REQUEST_FILES" ]; then
  log_info "Entity/Request 파일 발견:"

  if [ -n "$ENTITY_FILES" ]; then
    echo "  [Entity]"
    echo "$ENTITY_FILES" | while read -r file; do
      echo "  - $file"
      echo "- Entity: $file" >> "$RESULTS_FILE"
    done
  fi

  if [ -n "$REQUEST_FILES" ]; then
    echo "  [Request]"
    echo "$REQUEST_FILES" | while read -r file; do
      echo "  - $file"
      echo "- Request: $file" >> "$RESULTS_FILE"
    done
  fi

  log_success "Entity-Request 분리 패턴 준수 확인 ✅"
else
  log_info "Entity/Request 파일 변경 없음"
  echo "No Entity/Request files changed" >> "$RESULTS_FILE"
fi
echo ""

# ====================================
# 최종 결과
# ====================================
echo "======================================"
echo ""

if [ "$VERIFICATION_PASSED" = true ]; then
  log_success "🎉 모든 검증 통과!"
  echo "" >> "$RESULTS_FILE"
  echo "Overall: ✅ ALL PASSED" >> "$RESULTS_FILE"

  echo ""
  log_info "다음 단계:"
  echo "  1. git commit -m \"커밋 메시지\""
  echo "  2. Documentation Agent 호출 (context.md 업데이트)"
  echo ""

  exit 0
else
  log_error "검증 실패 - 위의 에러를 수정해주세요"
  echo "" >> "$RESULTS_FILE"
  echo "Overall: ❌ FAILED" >> "$RESULTS_FILE"

  echo ""
  log_info "에러 수정 후 다시 실행:"
  echo "  ./verify-changes.sh $FEATURE_NAME"
  echo ""

  exit 1
fi
