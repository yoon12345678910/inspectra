# browser-overlay-debugger

## 배경
프로젝트 코드 수정 없이 현재 열린 웹페이지 위에 실무형 디버거를 올려서 QA, 운영, 프런트엔드 개발자가 바로 증적을 수집할 수 있어야 한다.

## 목표
Chrome/Edge Desktop에서 오버레이 디버거 MVP를 제공한다. Console/Error, Elements Inspector, Network HTTP, WebSocket, Performance, WebRTC, Export, Redaction을 한 화면에서 다룬다.

## 포함 범위
- WXT + React + TypeScript 기반 작은 workspace 구성
- action click 기반 오버레이 토글
- content script와 main-world agent 분리
- 공통 `DebugEvent` 스키마와 ring buffer
- Console/Error, Elements, HTTP, WebSocket, Performance, WebRTC, Export, Settings 최소 구현
- GitHub Actions와 PR 템플릿

## 제외 범위
- Safari/Firefox 실제 동작 지원
- Chromium `debugger` API 심화 모드 구현
- 원격 업로드 서버
- popup, sidepanel, devtools 엔트리포인트

## 영향 범위
- `apps/extension`
- `packages/core`
- `packages/bridge`
- `packages/agent-main`
- `packages/ui-overlay`
- `packages/adapter-chromium`

## 사용자 흐름
1. 사용자가 확장 action을 클릭한다.
2. content script가 overlay visibility를 토글한다.
3. 첫 실행 시 main-world agent가 주입되고 settings와 sessionId를 받아 후킹을 시작한다.
4. agent 이벤트가 bridge를 거쳐 overlay store에 쌓인다.
5. 사용자는 패널을 탐색하고 inspect/export/settings를 수행한다.

## 정책/예외
- 기본 마스킹은 항상 ON이다.
- 대량 이벤트는 batch flush와 ring buffer로 제한한다.
- overlay 자신은 inspect 대상에서 제외한다.
- Chrome Web Store 제한 페이지 같은 특수 탭은 동작하지 않을 수 있다.

## 테스트 포인트
- action click으로 overlay가 열리고 닫히는지
- console/error/fetch/xhr/ws/webrtc 이벤트가 수집되는지
- inspect mode가 overlay를 집지 않는지
- export JSON이 redaction을 거친 뒤 다운로드되는지

