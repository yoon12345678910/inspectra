# Decision Log

## 2026-03-17
### Eruda를 기준선으로 사용
- 이유: 직접 패널을 복제하는 방식으로는 Console/Elements/Network 품질이 Eruda 수준에 못 미친다.
- 대안: 커스텀 React 오버레이를 계속 확장
- 영향: 기본 디버깅 UX는 Eruda가 담당하고, Inspectra는 플러그인과 후킹 계층에 집중한다.

## 2026-03-17
### 초기 브라우저 범위
- 이유: Chrome/Edge Desktop에 집중해야 MVP 검증이 빠르다.
- 대안: Safari 포함, Firefox 포함
- 영향: Safari/Firefox는 capability/adapter skeleton만 준비한다.

## 2026-03-17
### Inspectra 고유 기능은 Eruda 플러그인으로 추가
- 이유: WebRTC 같은 패널은 Eruda 플러그인 탭으로 추가하는 편이 구조적으로 단순하다.
- 대안: 별도 자체 UI를 병행
- 영향: `packages/eruda-plugin-webrtc` 같은 확장 패키지로 기능을 붙인다.

## 2026-03-17
### Eruda 초기화와 플러그인 등록은 별도 runtime 패키지로 분리
- 이유: entrypoint 파일에 Eruda 초기화 로직이 퍼지면 유지보수가 어렵다.
- 대안: `main-world.ts`에서 직접 초기화
- 영향: `packages/eruda-runtime`이 Eruda wrapper 역할을 맡는다.

## 2026-03-17
### WebSocket은 Chromium debugger API로 수집
- 이유: main-world `window.WebSocket` 후킹만으로는 worker/early bootstrap 소켓을 안정적으로 잡을 수 없다.
- 대안: main-world hook만 유지, worker patch 확장
- 영향: `apps/extension` background가 `chrome.debugger`로 `Network.webSocket*` 이벤트를 수집하고, content/runtime 경로로 Eruda websocket 탭에 전달한다.
