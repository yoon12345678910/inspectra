# browser-overlay-debugger

## 배경
프로젝트 코드 수정 없이 현재 열린 웹페이지에서 바로 디버깅해야 한다. 직접 DevTools를 복제하는 접근은 비용이 크고 완성도가 낮아지기 쉬우므로, Inspectra는 Eruda를 기준선으로 삼고 필요한 확장 기능만 추가한다.

## 목표
Chrome/Edge Desktop에서 Eruda 수준의 즉시 사용 가능한 디버거를 제공한다. 기본 디버깅 UI는 Eruda를 기준선으로 사용하고, Inspectra 고유 기능은 Eruda 플러그인과 main-world hook으로 확장한다.

## 포함 범위
- WXT + TypeScript 기반 작은 workspace 구성
- action click 기반 Eruda 토글
- content script와 main-world agent 분리
- Eruda runtime wrapper
- 공통 WebRTC event type과 ring buffer
- Eruda Console/Elements/Network/Resources/Sources/Info/Snippets/Settings 기본 제공
- Inspectra WebRTC Eruda 플러그인
- GitHub Actions와 PR 템플릿

## 제외 범위
- Safari/Firefox 실제 동작 지원
- Chromium `debugger` API 심화 모드 구현
- 원격 업로드 서버
- 별도 React 오버레이 패널

## 영향 범위
- `apps/extension`
- `packages/agent-main`
- `packages/eruda-runtime`
- `packages/eruda-plugin-webrtc`

## 사용자 흐름
1. 사용자가 확장 action을 클릭한다.
2. content script가 main-world script를 주입하고 Eruda visibility를 토글한다.
3. 첫 실행 시 main-world agent가 sessionId를 받아 WebRTC 후킹을 시작한다.
4. Eruda가 Console/Elements/Network 중심 UI를 제공한다.
5. Inspectra 플러그인이 WebRTC 같은 전용 탭을 추가한다.

## 정책/예외
- WebRTC 이벤트는 최근 버퍼만 유지한다.
- Chrome Web Store 제한 페이지 같은 특수 탭은 동작하지 않을 수 있다.
- Eruda가 기준선이므로 기본 패널 품질은 Eruda가 결정하고, Inspectra는 확장 패널 품질에 집중한다.

## 테스트 포인트
- action click으로 Eruda가 열리고 닫히는지
- Console/Elements/Network가 Eruda 기준으로 동작하는지
- WebRTC 플러그인이 peer connection 상태를 표시하는지
