# Phase 1 Gateway Protocol & Tools Specification (Full)

## 1. 몰트봇 스타일 핵심(비교 기준)

몰트봇 계열은 대체로 이렇게 설계합니다.

Gateway가 단일 진입점: WebSocket 서버(기본 ws://127.0.0.1:18789)가 세션/라우팅/도구 호출을 총괄

도구 호출은 스키마 기반: 도구 목록/설명 + "실제 tool schema"를 모델 런타임에 주입하고, 실행 시 인자 검증 후 결과를 toolResult로 되돌립니다

system.run 같은 위험 도구는 '노드(호스트)'로 분리 + 승인(approvals)로 게이트: 노드가 system.run을 제공하고, Gateway/노드 측에서 승인/허용목록으로 통제

보안 기본값: loopback bind + 토큰 인증 같은 "기본 안전장치"를 강하게 권장

## 2. Phase 1 권장 아키텍처(당장 만들 형태)

### 레이어 분리

**Gateway**
- WS API 제공: tools.list, tools.invoke
- 세션 컨텍스트(사용자/워크스페이스/정책/타임아웃) 생성
- 로깅/감사(audit) + 승인 플로우 이벤트 브로커

**Tool Runtime (서버 내부 모듈)**
- Tool Registry(도구 등록소)
- 인자 스키마 검증(TypeBox/Zod)
- 실행/에러 표준화

**Node Host (Phase 1에서는 "로컬 노드"로만 시작 가능)**
- system.run 제공
- approvals/allowlist 파일을 읽어 실행 가능 여부 판단

## 3. 도구 공통 규격

### Tool 인터페이스(최소 표준)
- name, version, description
- schema(JSON Schema/TypeBox/Zod)
- run(ctx, args) -> ToolResult

### ToolContext에 반드시 넣을 것
- sessionId, userId(또는 surface identity)
- workspaceRoot (File I/O, system.run 제한의 기준)
- policy (allowlist/denylist, maxBytes, networkRules 등)
- logger, auditLogger
- timeouts (기본 timeoutMs)

### ToolResult 표준(중요)
- ok: boolean
- data(성공 payload)
- error: { code, message, details? }
- meta: { durationMs, artifacts?, truncated? }

### Gateway 이벤트(스트리밍 대비)
- tool.started
- tool.progress (선택)
- tool.finished

## 4. 도구별 구현 가이드

### A. Browser Tool (Playwright) — 웹 제어

**최소 API:**
- browser.start({ sessionKey?, headless? })
- browser.goto({ url })
- browser.snapshot({ mode: "aria" | "dom" })
- browser.act({ type: "click"|"type"|"press", selector, text?, key? })
- browser.screenshot({ fullPage? })
- browser.extract({ selector, kind: "text"|"html" })
- browser.close()

**구현 포인트:**
- 세션 단위 브라우저 컨텍스트 유지
- 동시성 잠금: 한 세션에서 Playwright 액션 병렬 실행 막기
- 네비게이션 정책: https만 허용, file:// 금지
- 스냅샷은 "접근성 트리(aria)" 우선

### B. Desktop Tool (system.run) — OS 명령 실행

**최소 API:**
- system.run({ argv: string[], cwd?, env?, timeoutMs? })
- system.runRaw({ command: string, shell?: "sh"|"bash"|"cmd" })
- 리턴: { exitCode, stdout, stderr, truncated? }

**approvals 구현(Phase 1에서 반드시):**
- 파일 예시: ~/.<app>/exec-approvals.json
- allowlist commands: ["git", "pnpm", "npm", "node", "python"]
- allow cwd prefix: workspaceRoot 하위만
- deny patterns: rm -rf, curl ... | sh, sudo, chmod 777 등

### C. API Connector — HTTP 요청

**최소 API:**
- http.request({ method, url, headers?, query?, body?, timeoutMs? })
- http.download({ url, destPath })(선택)
- http.response: { status, headers, bodyText?, bodyJson? }

**필수 보안(SSRF 방지):**
- http/https만 허용
- localhost, 127.0.0.1, 사설망, 169.254.169.254 차단

### D. File I/O — 파일 읽기/쓰기

**최소 API:**
- fs.read({ path, encoding? })
- fs.write({ path, content, encoding?, atomic?: true })
- fs.list({ path, recursive? })
- fs.glob({ pattern })(선택)
- fs.delete({ path })(Phase 1에서는 기본 deny로 두고 옵션화 추천)

**구현 포인트:**
- workspaceRoot 밖 경로는 무조건 차단
- 기본 maxBytes 제한(예: read 2MB, write 2MB)
- atomic write: temp 파일 → rename

## 5. Phase 1 개발 순서(추천)

1. Tool Runtime/Registry + 스키마 검증 + ToolResult 표준화
2. File I/O (가장 테스트/디버깅 쉬움)
3. HTTP Connector (정책/차단 로직 먼저)
4. Local Node Host + system.run + approvals
5. Playwright Browser Tool (세션/락/스냅샷/액션)

## 6. 체크리스트(몰트봇 스타일로 최소 안전장치)

- Gateway 기본 bind: loopback
- Gateway 연결: 토큰 인증(최소 1개의 shared token)
- system.run: approvals 없이는 실행 금지
- File I/O: workspaceRoot 밖 차단 + 크기 제한
- HTTP: 내부망/localhost 차단 + allowlist 옵션
- 모든 tool 호출/결과는 audit log에 남기기(세션ID 포함)
