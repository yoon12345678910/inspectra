# browser-overlay-debugger

## 배경
프로젝트 코드 수정 없이 현재 열린 웹페이지에서 바로 디버깅해야 한다. 직접 DevTools를 복제하는 접근은 비용이 크고 완성도가 낮아지기 쉬우므로, Inspectra는 Eruda를 기준선으로 삼고 필요한 확장 기능만 추가한다.

## 목표
Chrome/Edge Desktop에서 Eruda 수준의 즉시 사용 가능한 디버거를 제공한다. 기본 디버깅 UI는 Eruda를 기준선으로 사용하고, Inspectra 고유 기능은 Eruda 플러그인, main-world hook, 필요한 경우 Chromium `debugger` API로 확장한다.

## 포함 범위
- WXT + TypeScript 기반 작은 workspace 구성
- action click 기반 Eruda 토글
- content script와 main-world agent 분리
- Eruda runtime wrapper
- 공통 WebRTC event type과 ring buffer
- Chromium `debugger` API 기반 WebSocket capture
- Eruda Console/Elements/Network/Resources/Sources/Info/Snippets/Settings 기본 제공
- Inspectra WebRTC Eruda 플러그인
- Inspectra Media Permissions Eruda 플러그인
- Inspectra WebSocket Eruda 플러그인
- GitHub Actions와 PR 템플릿

## 제외 범위
- Safari/Firefox 실제 동작 지원
- 원격 업로드 서버
- 별도 React 오버레이 패널

## 영향 범위
- `apps/extension`
- `packages/agent-main`
- `packages/eruda-runtime`
- `packages/eruda-plugin-webrtc`
- `packages/eruda-plugin-media-permissions`
- `packages/eruda-plugin-websocket`

## 사용자 흐름
1. 사용자가 확장 action을 클릭한다.
2. content script가 문서 시작 시 hidden main-world runtime을 주입해 후킹을 먼저 설치한다.
3. background가 현재 탭에 `debugger`를 attach하고 WebSocket network 이벤트를 수집한다.
4. action click 시 sessionId와 visibility를 동기화하고 Eruda를 보여준다.
5. Eruda가 Console/Elements/Network 중심 UI를 제공한다.
6. Inspectra 플러그인이 WebRTC, Media, WebSocket 전용 탭을 추가한다.

## 정책/예외
- WebRTC/WebSocket 이벤트는 최근 버퍼만 유지한다.
- Chrome Web Store 제한 페이지 같은 특수 탭은 동작하지 않을 수 있다.
- WebSocket은 page hook보다 `debugger` API 이벤트를 우선 신뢰한다.
- Eruda가 기준선이므로 기본 패널 품질은 Eruda가 결정하고, Inspectra는 확장 패널 품질에 집중한다.

## 테스트 포인트
- action click으로 Eruda가 열리고 닫히는지
- Console/Elements/Network가 Eruda 기준으로 동작하는지
- WebRTC 플러그인이 peer connection 상태를 표시하는지
- Media 플러그인이 camera/microphone permission과 최근 `getUserMedia` 요청을 표시하는지
- WebSocket 플러그인이 생성, 송수신, 종료 이벤트를 표시하는지
