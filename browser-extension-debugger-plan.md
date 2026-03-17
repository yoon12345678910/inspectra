# 브라우저 확장 기반 오버레이 디버거 제품/구현 문서

## 문서 목적
이 문서는 **프로젝트 코드 수정·배포 없이**, 브라우저 확장 프로그램만 설치해서 웹페이지 위에 **Eruda급 이상의 실무형 디버깅 도구**를 제공하는 제품을 바로 구현하기 위한 기준 문서입니다.

이 문서 하나만으로도 Codex CLI가 바로 구현을 시작할 수 있도록 아래를 포함합니다.

- 왜 이 제품을 만들어야 하는지
- 어떤 기능을 제공해야 하는지
- 어떤 브라우저를 어디까지 지원해야 하는지
- 어떤 구조로 구현해야 하는지
- 어떤 라이브러리를 써도 되는지
- 어떤 이슈가 치명적인지
- **추정** 일정과 단계별 산출물
- 바로 착수 가능한 폴더 구조, 명령어, 작업 백로그, 수용 기준

---

# 1. 한 줄 결론

이 제품은 **충분히 만들 가치가 있습니다.**
다만 제품의 목표는 “브라우저 내장 DevTools 전체 복제”가 아니라 아래여야 합니다.

> **확장 설치만으로 현재 페이지에 즉시 붙는 오버레이 디버거 + Chromium에서는 더 깊은 진단 옵션 제공**

즉 현실적인 제품 전략은 다음입니다.

- **공통 코어**: 페이지 위 오버레이 디버거
- **심화 모드(Chromium 우선)**: Debugger / DevTools API 기반 네트워크·WebSocket·진단 강화
- **Safari**: 오버레이 중심 정식 지원
- **Firefox**: 코어 기능 중심 지원
- **Android Chrome 계열 모바일**: 확장 모델 한계로 초기 제외

---

# 2. 왜 사용해야 하는가

## 2.1 기존 방식의 문제

실무에서 페이지 디버깅은 보통 아래 방식 중 하나입니다.

1. 브라우저 DevTools 직접 사용
2. Eruda 같은 디버그 라이브러리를 프로젝트에 삽입
3. console/log 코드를 직접 심고 재배포
4. 모바일/운영 환경 문제를 PC에서 재현 시도

이 방식들은 아래 문제가 있습니다.

- 프로젝트마다 삽입/빌드/배포가 필요함
- 운영 환경에서 “지금 이 페이지”를 바로 보기 어려움
- QA/운영/CS가 개발자 도움 없이 증적을 남기기 어려움
- WebRTC, 성능, 네트워크, 콘솔을 한 화면에서 통합 보기 어려움
- 모바일 Safari 같은 환경에서는 확인 루트가 제한됨

## 2.2 이 제품의 핵심 가치

- **프로젝트 무수정**: 서비스 코드에 디버그 코드 삽입 불필요
- **즉시성**: 확장 설치 후 현재 열린 페이지에 바로 주입
- **실무형 증적**: QA/운영이 세션을 export해서 개발자에게 전달 가능
- **통합성**: 콘솔/에러/요소 검사/네트워크/WebSocket/성능/WebRTC를 한 화면 제공
- **보안성**: 민감정보 자동 마스킹과 수집 정책 적용 가능
- **제품 확장성**: 내부 도구를 넘어 팀/조직용 제품으로 확장 가능

## 2.3 주요 사용자

- 프런트엔드 개발자
- QA 엔지니어
- 운영/CS/현장 지원 인력
- WebRTC/스트리밍/실시간 기능 담당자
- 모바일 Safari나 특정 테스트 기기에서 즉시 증적이 필요한 팀

---

# 3. 제품 정의

브라우저 확장을 설치하면 현재 페이지에 디버깅 에이전트를 주입하고, 화면 위에 떠 있는 패널 또는 사이드 패널에서 아래 정보를 볼 수 있는 제품입니다.

- Console / Errors
- **Elements Inspector(UI 요소 검사)**
- Network / HTTP
- **WebSocket Inspector**
- Performance / Long Task / Frame Delay
- WebRTC Stats
- Storage / Env Snapshot
- Session Export

핵심 포지션은 아래 두 가지를 동시에 만족하는 것입니다.

1. **Eruda처럼 바로 띄울 수 있어야 함**
2. **Eruda보다 실무에서 필요한 진단 신호를 더 많이 보여줘야 함**

---

# 4. 목표와 비목표

## 4.1 목표

- 확장 설치만으로 현재 웹페이지에 디버깅 UI를 띄운다.
- 프로젝트 코드 수정 없이 동작한다.
- 콘솔/에러/요소 검사/네트워크/WebSocket/성능/WebRTC를 최소 공통 기능으로 제공한다.
- 세션을 JSON으로 저장해 공유할 수 있다.
- 민감정보 자동 마스킹 정책을 제공한다.
- Chromium에서는 선택적으로 더 깊은 디버깅을 제공한다.
- QA/운영/기획도 쓸 수 있을 정도로 UI가 단순해야 한다.

## 4.2 비목표

- 브라우저 내장 DevTools 전체 복제
- 모든 모바일 브라우저 완전 지원
- 모든 브라우저에서 동일한 CPU profiler 수준 제공
- 모든 브라우저에서 동일한 HAR 수집 보장
- 네이티브 앱 WebView까지 초기부터 통합 지원
- 원격 업로드 서버를 초기 MVP에 포함

---

# 5. 브라우저 지원 전략

## 5.1 권장 지원 범위

### Phase 1

- **Chrome Desktop**: 정식 지원
- **Edge Desktop**: 정식 지원
- **Brave / Chromium Desktop**: 정식에 준하는 지원

### Phase 2

- **Safari macOS**: 정식 지원
- **Safari iPhone/iPad**: 코어 기능 정식 지원

### Phase 3

- **Firefox Desktop**: 코어 기능 지원

### 초기 제외

- **Android Chrome / Samsung Internet / Huawei Browser 등 일반 Chromium 모바일 브라우저**
  - 모바일 Chrome 계열은 데스크톱처럼 확장 설치 전략을 기대하기 어려움
  - 별도 원격 수집 모드가 없다면 범용 제품 메시지를 만들기 어려움

## 5.2 브라우저별 가능 범위 매트릭스

| 브라우저 | 설치 방식 | 오버레이 UI | 요소 검사 | 콘솔/에러 | HTTP 네트워크 | WebSocket | 성능 | WebRTC | Chromium 심화 모드 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Chrome Desktop | Web Store / Unpacked | O | O | O | O | O | O | O | O |
| Edge Desktop | Add-ons / Unpacked | O | O | O | O | O | O | O | O |
| Brave/Desktop Chromium | Chromium 호환 | O | O | O | O | O | O | O | O |
| Safari macOS | App Extension | O | O | O | O | O | O | O | △ |
| Safari iPhone/iPad | App Extension | O | O | O | O | O | O | O | X |
| Firefox Desktop | AMO | O | O | O | O | O | O | O | △ |
| Android Chrome 계열 | 사실상 불가 | X | X | X | X | X | X | X | X |

설명:
- **O**: 정식 목표 가능
- **△**: 브라우저별 편차와 추가 검증 필요
- **X**: 초기 제품 범위에서 제외

## 5.3 제품 메시지 원칙

절대 “모든 브라우저/모바일 지원”이라고 말하지 않습니다.
제품 설명은 아래처럼 가져갑니다.

> 설치 가능한 브라우저에서 프로젝트 무수정으로 즉시 붙는 오버레이 디버거. Chromium에서는 심화 진단을 추가 제공.

---

# 6. 핵심 기능 정의

# 6.1 런처

## 제공 기능

- 툴바 아이콘 클릭 시 현재 탭에 디버거 주입
- 우클릭 컨텍스트 메뉴로 실행
- 단축키로 열기/닫기
- 페이지 내 떠 있는 FAB 버튼 제공
- 마지막 열림 위치/크기 저장

## 구현 원칙

- 기본은 **사용자 액션 기반 on-demand injection**
- 항상 모든 페이지에 상시 주입하지 않음
- `activeTab` 우선 전략으로 권한과 성능 부담 최소화

## 수용 기준

- 확장 아이콘 클릭 후 1초 내 오버레이가 보인다.
- 같은 페이지에서 재클릭 시 토글된다.
- 새로고침 후에도 필요 시 재주입 가능하다.

---

# 6.2 Console / Error 패널

## 제공 기능

- `console.log/info/warn/error/debug` 캡처
- `window.onerror` 캡처
- `unhandledrejection` 캡처
- timestamp, level, source, stack, page URL 표시
- 로그 레벨 필터링
- 검색, 복사, JSON export
- pause / clear 지원

## 구현 포인트

- main world에서 `console.*` 래핑
- 원본 console 호출 유지
- 직렬화 가능한 payload만 저장
- 큰 객체는 depth / length 제한
- ring buffer로 메모리 보호

## 수용 기준

- 페이지에서 발생한 console 로그가 실시간으로 패널에 표시된다.
- 에러와 미처리 Promise rejection이 stack과 함께 보인다.
- 1,000개 이상 로그에서도 UI가 즉시 멈추지 않는다.

---

# 6.3 Elements Inspector(UI 요소 검사)

## 이 기능이 필요한 이유

Eruda 수준을 넘어서려면 **“지금 이 화면에서 어떤 DOM 요소가 문제인지”**를 볼 수 있어야 합니다.
이 기능이 없으면 UI 문제 디버깅 가치가 크게 떨어집니다.

## 제공 기능

- inspect 모드 on/off
- 마우스 hover 시 요소 하이라이트
- click 시 요소 고정 선택
- 현재 요소의 아래 정보 표시
  - tag
  - id
  - class
  - text 요약
  - DOM path
  - CSS selector 제안
  - 크기(width/height)
  - 위치(x/y)
  - box model 요약(margin/border/padding/content)
  - 주요 computed style 일부
- copy selector
- 선택 요소 스크린샷은 초기 제외

## 구현 포인트

- `document.elementFromPoint()` 기반으로 현재 포인터 하위 요소 탐지
- 별도 highlight overlay 레이어 사용
- `getBoundingClientRect()`로 위치/크기 계산
- `getComputedStyle()`로 요약 스타일 표시
- inspect 모드일 때 페이지 click 이벤트를 캡처하고 필요 시 `preventDefault()` 옵션 제공
- iframe은 v1에서 “선택된 것이 iframe인지”만 식별하고, **same-origin iframe 내부 검사**는 Phase 2

## 구조적 한계

- cross-origin iframe 내부 요소를 자유롭게 읽을 수 없음
- pseudo element(`::before`, `::after`) 직접 검사 난도 높음
- 완전한 CSS cascade/Rules panel 복제는 비목표

## 수용 기준

- 사용자가 inspect 모드를 켜면 hover한 요소가 하이라이트된다.
- 클릭 시 해당 요소의 selector, 크기, box model이 표시된다.
- overlay UI가 자기 자신을 검사 대상으로 오염시키지 않는다.

---

# 6.4 Network 패널(HTTP)

## 제공 기능

- `fetch` / `XMLHttpRequest` 후킹
- request start/end 시간
- URL / method / status / duration
- success/failure 표시
- request headers 일부
- response headers 일부
- request/response body preview(크기 제한)
- resource timing 기반 리소스 요약
- 검색/필터(status, method, text)
- slow request top N 표시

## 구현 포인트

- main world에서 `fetch` 후킹
- `XMLHttpRequest.prototype.open/send/setRequestHeader` 래핑
- body는 text/json만 preview
- binary/form-data는 길이와 content-type만
- body preview는 기본 16KB 제한
- redaction 후 저장

## 구조적 한계

- 페이지 레벨에서 관찰 가능한 요청 중심
- 브라우저 내부 네트워크 전체와 완전 동일하지 않음
- service worker 내부 요청, prefetch, 브라우저 내부 요청은 브라우저마다 차이

## 수용 기준

- fetch/XHR 요청이 URL, status, duration과 함께 보인다.
- 실패 요청은 실패 원인 추정과 함께 구분 표시된다.
- body preview는 민감정보 마스킹 후 표시된다.

---

# 6.5 WebSocket Inspector

## 이 기능이 필요한 이유

실무에서는 HTTP보다 **WebSocket 문제**가 더 까다로운 경우가 많습니다.
특히 실시간 알림, 채팅, RTC signaling, 사내 websocket 서버 연동은 브라우저 DevTools 없이 현장 확인이 어려운 경우가 많습니다.

## 제공 기능

### 공통 모드
- `WebSocket` constructor 감지
- 연결 URL 표시
- open / message / error / close 이벤트 표시
- 송신(send) 이벤트 표시
- 수신(message) 이벤트 표시
- text payload preview
- binary payload는 길이만 표시
- 연결별 메시지 개수 / 마지막 활동 시각 / 상태 표시
- 연결별 필터와 search

### Chromium 심화 모드
- handshake 메타 강화
- frame 송수신 이벤트 타임라인 강화
- 탭 단위 심화 추적

## 구현 포인트

- main world에서 `window.WebSocket` 래핑
- 인스턴스별 id 부여
- `send()` 래핑
- `message`, `open`, `error`, `close` listener 추가
- payload preview 크기 제한
- JSON 문자열이면 pretty print 시도
- 과도한 frame 수집에 대비한 ring buffer 분리

## 구조적 한계

- 모든 브라우저에서 DevTools급 frame 디테일 보장은 어려움
- 공통 모드는 앱 레벨 후킹 중심
- 네트워크 핸드셰이크 전체와 low-level frame 정보는 Chromium 심화 모드가 더 강함

## 수용 기준

- 페이지가 WebSocket을 생성하면 연결 목록에 나타난다.
- send/message 이벤트가 실시간으로 보인다.
- 메시지 폭주 시에도 UI가 완전히 멈추지 않는다.

---

# 6.6 Performance 패널

## 제공 기능

- Navigation Timing 요약
- Resource Timing 요약
- Long Task 목록
- frame delay / frame overrun 추정
- FPS 추정
- event loop lag 추정
- 사용자 액션 기준 mark/measure 보조
- 느린 리소스 top N
- 메인 스레드 블로킹 히트맵

## 표기 원칙

브라우저 공통 CPU% 같은 오해를 부르는 숫자 대신 아래를 기본 지표로 사용합니다.

- long task count
- total blocking time 추정
- frame overrun
- average action latency
- event loop lag

## 구현 포인트

- `performance.getEntriesByType('navigation')`
- `performance.getEntriesByType('resource')`
- `PerformanceObserver`
- Long Tasks API
- `requestAnimationFrame` 기반 frame delay 추정
- collapsed 상태에서는 샘플링 강도 축소

## 구조적 한계

- 브라우저 공통 CPU profiler 대체는 아님
- 메모리 MB 수치도 브라우저별 편차가 큼
- 이 패널은 **페이지 체감 성능** 중심이어야 함

## 수용 기준

- 페이지 로드 후 핵심 navigation/resource timing이 보인다.
- long task count와 느린 구간을 확인할 수 있다.
- UI가 최소화된 상태에서는 과도한 수집이 줄어든다.

---

# 6.7 WebRTC 패널

## 제공 기능

- `RTCPeerConnection` 생성/종료 감지
- connection state / ice connection state / signaling state 표시
- selected candidate pair 추적
- inbound/outbound bitrate
- packets lost
- jitter
- RTT
- resolution / fps / frames dropped(가능 범위)
- ICE 실패/재연결 이벤트 타임라인
- 연결별 상태 배지

## 구현 포인트

- `RTCPeerConnection` 생성자 래핑
- peer connection별 내부 id 부여
- state change 이벤트 기록
- `getStats()` 주기적 polling
- 브라우저별 stats normalization 레이어 작성

## 권장 polling 정책

- 기본 2초
- 통화/재생 active 시 1초
- 비가시/백그라운드 시 5초로 다운샘플

## 수용 기준

- peer connection 생성 시 즉시 목록에 나타난다.
- 주요 상태와 핵심 품질 지표가 주기적으로 갱신된다.
- 없는 지표는 빈칸이 아니라 `N/A`로 명시된다.

---

# 6.8 Storage / Env 패널

## 제공 기능

- localStorage/sessionStorage key 목록
- IndexedDB DB 목록 요약
- 쿠키 key 목록(값은 기본 마스킹)
- User Agent / viewport / DPR / language / timezone
- online/offline 상태
- visibility/focus 상태
- service worker 등록 여부 요약

## 수용 기준

- 현재 페이지 환경 정보가 즉시 확인 가능하다.
- 쿠키/스토리지 값은 기본 마스킹 규칙을 따른다.

---

# 6.9 Session Recorder / Export

## 제공 기능

- 세션 기록 시작/중지
- 기록 범위 선택
  - console
  - error
  - element selection history
  - network
  - websocket
  - performance
  - webrtc
  - storage snapshot
- JSON export
- 압축 zip export
- 나중에 import해서 재열람 가능하도록 포맷 설계

## 수용 기준

- 현재 세션 데이터를 JSON으로 다운로드할 수 있다.
- 민감정보가 export 전에 마스킹된다.
- 파일 용량이 너무 커질 경우 경고를 보여준다.

---

# 6.10 보안 / 민감정보 보호

## 제공 기능

- Authorization/Cookie/Set-Cookie 자동 마스킹
- body JSON key 기반 마스킹
  - token
  - password
  - email
  - phone
  - ssn/resident-like
- 수집 제외 URL 패턴
- 민감정보 수집 금지 모드
- 로컬 저장만 / 다운로드만 옵션
- 고급 모드 진입 시 경고

## 제품 원칙

이 제품은 잘 만들면 디버깅 도구지만, 못 만들면 **민감정보 유출 도구**가 됩니다.
보안/마스킹은 옵션이 아니라 코어 기능입니다.

## 수용 기준

- 기본값이 redaction ON이다.
- 민감한 헤더와 key는 자동 마스킹된다.
- export 전에 민감 필드 포함 여부를 다시 검사한다.

---

# 7. 추천 제품 범위

## 7.1 MVP

아래만 있어도 충분히 가치가 있습니다.

- 오버레이 UI
- Console / Error
- Elements Inspector
- fetch/XHR 네트워크 요약
- WebSocket 기본 inspector
- Long Task / FPS 추정
- WebRTC 기본 패널
- Session export
- Redaction v1
- Chrome / Edge Desktop 지원

## 7.2 실무형 v1

- MVP 전체
- Safari macOS / iPhone / iPad 지원
- Storage / Env 패널
- network / websocket 검색·필터 개선
- 리소스 타이밍 시각화
- 설정 저장
- capability fallback UI
- 브라우저별 테스트 체크리스트

## 7.3 실무형 v1.5

- Chromium deep mode
- DevTools panel
- Firefox Desktop 코어 지원
- handshake/frame 시각화 강화
- session compare
- 에러 fingerprinting 준비

---

# 8. 구현 전략

## 8.1 핵심 구현 원칙

1. **공통 코어와 브라우저 어댑터를 분리**한다.
2. **기본은 오버레이 제품**으로 설계한다.
3. **브라우저별 심화 기능은 optional capability**로 취급한다.
4. **권한은 최소화**한다.
5. **성능 오버헤드 자체도 측정 대상**으로 둔다.
6. **민감정보 마스킹을 기본값 ON**으로 둔다.
7. **무거운 패널은 펼쳐졌을 때만 상세 수집**한다.

## 8.2 추천 기술 스택

### 권장
- **Framework**: WXT + React + TypeScript
- **상태관리**: Zustand
- **UI**: React + CSS Modules 또는 Tailwind
- **차트**: custom SVG 우선, 필요 시 lightweight chart 추가
- **빌드**: pnpm workspace
- **테스트**: Vitest + Playwright

### 왜 WXT인가
- Chrome / Firefox / Edge / Safari 빌드 흐름이 단순함
- Web extension 개발을 빠르게 시작하기 좋음
- manifest/entrypoint 관리가 편함
- 개발 루프가 빠름

### 허용 라이브러리 전략
Eruda 등 유명한 라이브러리를 **내부 구성 요소로 활용해도 됩니다.**
다만 아래 원칙을 지킵니다.

- Eruda를 그대로 노출하는 것이 아니라 **우리 제품 UX에 맞게 래핑**한다.
- 꼭 필요한 경우에만 차용하고, 제품의 핵심 차별 기능(요소 검사, WebSocket, WebRTC, export, redaction)은 자체 구현한다.
- 타사 라이브러리를 써도 이벤트 스키마와 저장 포맷은 내부 표준을 사용한다.

### 추천 판단
- 빠르게 시작하려면 **WXT + React + TS**
- Eruda는 참고 또는 일부 콘솔 UI 차용 가능
- 핵심 수집 로직은 자체 구현 권장

---

# 9. 시스템 아키텍처

```text
[Browser Extension]
  ├─ Background / Service Worker
  │   ├─ 주입 제어
  │   ├─ 권한/설정 관리
  │   ├─ 세션 메타 저장
  │   └─ 브라우저별 adapter 호출
  │
  ├─ Content Script
  │   ├─ 오버레이 root mount
  │   ├─ page <-> extension bridge
  │   ├─ FAB / drag / resize
  │   └─ inspect overlay host
  │
  ├─ Main World Agent
  │   ├─ console hook
  │   ├─ error hook
  │   ├─ fetch/XHR hook
  │   ├─ WebSocket hook
  │   ├─ RTCPeerConnection hook
  │   ├─ PerformanceObserver
  │   ├─ element inspector helper
  │   └─ storage/env snapshot helper
  │
  ├─ Overlay UI (React)
  │   ├─ Console panel
  │   ├─ Elements panel
  │   ├─ Network panel
  │   ├─ WebSocket panel
  │   ├─ Performance panel
  │   ├─ WebRTC panel
  │   ├─ Storage/Env panel
  │   └─ Export panel
  │
  └─ Chromium Deep Adapter (optional)
      ├─ debugger API bridge
      ├─ devtools panel
      └─ network/websocket deep events
```

## 9.1 왜 Main World Agent가 필요한가

content script는 페이지 스크립트와 동일한 실행 세계가 아니므로, 아래 객체를 깊게 후킹하려면 **main world 주입 스크립트**가 필요합니다.

- `console`
- `fetch`
- `XMLHttpRequest`
- `WebSocket`
- `RTCPeerConnection`
- 사용자 코드가 가진 전역 객체

즉 구조는 사실상 아래처럼 가야 합니다.

1. 확장이 content script 삽입
2. content script가 main world agent 삽입
3. agent가 페이지 객체를 후킹
4. agent가 이벤트를 bridge로 전달
5. overlay와 background가 저장/표시

## 9.2 데이터 흐름

```text
Page Runtime
  -> Agent hooks collect event
  -> normalize event schema
  -> postMessage to content bridge
  -> content bridge batches events
  -> overlay store updates
  -> optional background persistence
  -> optional export serializer
```

---

# 10. 런타임 capability 모델

```ts
export interface RuntimeCapabilities {
  consoleHook: boolean;
  errorHook: boolean;
  elementInspector: boolean;
  networkHttp: boolean;
  networkWebSocket: boolean;
  longTask: boolean;
  webRtcStats: boolean;
  storageSnapshot: boolean;
  chromiumDeepMode: boolean;
  devtoolsPanel: boolean;
  sameOriginIframeInspect: boolean;
}
```

UI는 capability에 따라 패널/버튼/배지를 자동 제어합니다.
기능 코드 곳곳에 브라우저 예외를 흩뿌리지 말고 capability/adapter로 격리합니다.

---

# 11. 이벤트 스키마 표준

```ts
export type DebugEvent =
  | ConsoleEvent
  | RuntimeErrorEvent
  | InspectEvent
  | NetworkHttpEvent
  | NetworkWebSocketEvent
  | PerfEvent
  | WebRtcEvent
  | StorageSnapshotEvent;

export interface BaseEvent {
  id: string;
  type: string;
  ts: number;
  sessionId: string;
  pageUrl: string;
  tabId?: number;
}

export interface ConsoleEvent extends BaseEvent {
  type: 'console';
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  args: SerializedValue[];
}

export interface RuntimeErrorEvent extends BaseEvent {
  type: 'runtime-error';
  message: string;
  source?: string;
  lineno?: number;
  colno?: number;
  stack?: string;
  kind: 'error' | 'unhandledrejection';
}

export interface InspectEvent extends BaseEvent {
  type: 'inspect';
  action: 'hover' | 'select';
  selector?: string;
  domPath?: string;
  tagName: string;
  idValue?: string;
  classList?: string[];
  textPreview?: string;
  rect: { x: number; y: number; width: number; height: number };
  boxModel?: {
    margin: number[];
    border: number[];
    padding: number[];
  };
}

export interface NetworkHttpEvent extends BaseEvent {
  type: 'network-http';
  requestId: string;
  transport: 'fetch' | 'xhr';
  method: string;
  url: string;
  status?: number;
  durationMs?: number;
  ok?: boolean;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  requestBodyPreview?: string;
  responseBodyPreview?: string;
  errorReason?: string;
}

export interface NetworkWebSocketEvent extends BaseEvent {
  type: 'network-ws';
  connectionId: string;
  url: string;
  phase: 'open' | 'send' | 'message' | 'error' | 'close';
  preview?: string;
  byteLength?: number;
  closeCode?: number;
  closeReason?: string;
}

export interface PerfEvent extends BaseEvent {
  type: 'perf';
  metric:
    | 'navigation'
    | 'resource'
    | 'longtask'
    | 'frame-delay'
    | 'event-loop-lag';
  data: Record<string, unknown>;
}

export interface WebRtcEvent extends BaseEvent {
  type: 'webrtc';
  peerId: string;
  phase: 'created' | 'state-change' | 'stats' | 'closed';
  data: Record<string, unknown>;
}

export interface StorageSnapshotEvent extends BaseEvent {
  type: 'storage-snapshot';
  localStorageKeys: string[];
  sessionStorageKeys: string[];
  cookieKeys: string[];
  indexedDbNames: string[];
}
```

---

# 12. 권한 전략

## 12.1 기본 권한

초기 권장 권한:

- `activeTab`
- `scripting`
- `storage`
- `tabs` (필요 최소 범위)
- host permissions는 필요 시 요청

## 12.2 Chromium 심화 모드에서만 검토

- `debugger`
- `webRequest`
- devtools panel 관련 설정

## 12.3 권한 단계화 원칙

### 기본 모드
- 현재 탭만 디버깅
- 사용자 클릭 시 활성화
- 민감도 낮음

### 고급 모드
- 심화 네트워크/디버깅 권한 요청
- Chromium 전용
- 별도 토글과 경고 문구 제공

---

# 13. 폴더 구조 제안

```text
browser-debugger/
├─ apps/
│  ├─ extension/
│  │  ├─ entrypoints/
│  │  │  ├─ background.ts
│  │  │  ├─ content.ts
│  │  │  ├─ popup/
│  │  │  ├─ options/
│  │  │  ├─ sidepanel/
│  │  │  └─ devtools/
│  │  ├─ assets/
│  │  ├─ public/
│  │  └─ wxt.config.ts
│  └─ safari-shell/
│     └─ (필요 시 Xcode wrapper metadata)
│
├─ packages/
│  ├─ agent-main/
│  │  ├─ src/bootstrap.ts
│  │  ├─ src/console/
│  │  ├─ src/error/
│  │  ├─ src/network-http/
│  │  ├─ src/network-ws/
│  │  ├─ src/perf/
│  │  ├─ src/webrtc/
│  │  ├─ src/inspect/
│  │  └─ src/storage/
│  │
│  ├─ bridge/
│  │  ├─ src/postMessage.ts
│  │  ├─ src/event-bus.ts
│  │  └─ src/serialization.ts
│  │
│  ├─ core/
│  │  ├─ src/types/
│  │  ├─ src/capabilities/
│  │  ├─ src/redaction/
│  │  ├─ src/export/
│  │  ├─ src/settings/
│  │  └─ src/constants/
│  │
│  ├─ ui-overlay/
│  │  ├─ src/app/
│  │  ├─ src/components/
│  │  ├─ src/panels/
│  │  ├─ src/store/
│  │  └─ src/theme/
│  │
│  ├─ adapter-chromium/
│  │  ├─ src/debugger/
│  │  ├─ src/devtools/
│  │  └─ src/network/
│  │
│  ├─ adapter-firefox/
│  └─ adapter-safari/
│
├─ docs/
│  ├─ architecture.md
│  ├─ browser-matrix.md
│  ├─ permissions.md
│  ├─ redaction-policy.md
│  ├─ test-checklist.md
│  └─ release-checklist.md
│
├─ package.json
├─ pnpm-workspace.yaml
└─ README.md
```

---

# 14. 구현 상세

## 14.1 Console 후킹

### 방식
- `console.*` 메서드 래핑
- 원본 console 호출 유지
- payload는 `safeSerialize` 후 저장
- burst 상황에서는 batch flush

### 구현 메모
- 순환 참조 처리 필수
- DOM node, Event, Error 객체는 custom serializer 필요
- depth / maxLen 제한 필요

---

## 14.2 에러 수집

### 방식
- `window.addEventListener('error', ...)`
- `window.addEventListener('unhandledrejection', ...)`

### 구현 메모
- reason이 Error가 아닐 수 있으므로 normalize 필요
- source map 복원은 초기 범위 밖

---

## 14.3 요소 검사 구현

### 기본 흐름
1. inspect mode on
2. pointermove 시 `elementFromPoint()` 호출
3. overlay root와 자기 자신은 무시
4. 새 요소면 highlight box 갱신
5. click 시 선택 고정 및 세부 정보 표시

### 필요한 유틸
- `isOverlayElement(node)`
- `buildSelector(el)`
- `buildDomPath(el)`
- `getBoxModel(el)`
- `pickComputedStyle(el, keys)`

### v1 표시 스타일 키 예시
- display
- position
- z-index
- width
- height
- margin
- padding
- color
- background-color
- font-size
- line-height

---

## 14.4 HTTP 네트워크 구현

### fetch
- request input/init normalize
- 시작 시각 기록
- clone 가능한 경우 response.clone() 사용
- body preview 추출 후 원본 동작 보존

### XHR
- `open`, `setRequestHeader`, `send` 래핑
- readyState 변화에서 완료 시점 기록
- responseType에 따라 preview 정책 분기

### body 정책
- text/json만 preview
- binary/form-data는 메타만
- 기본 preview 16KB
- redaction 후 저장

---

## 14.5 WebSocket 구현

### 기본 흐름
- 원본 `WebSocket` 보존
- 래핑 생성자에서 connectionId 부여
- `send()` 래핑
- `open/message/error/close` 리스너 연결
- payload preview 생성
- 연결별 state 저장

### 주의
- message 폭주 가능성 매우 큼
- connection별 ring buffer 필요
- large payload truncate 필요
- binary는 문자열 변환 시도 금지

### v1 정책
- 연결당 최근 200개 메시지 유지
- 전체 최근 2,000개 메시지 상한
- payload preview 최대 4KB

---

## 14.6 Performance 구현

### 수집 소스
- navigation entries
- resource entries
- PerformanceObserver
- Long Tasks
- `requestAnimationFrame` 루프
- `setTimeout` 기반 event loop lag

### 추천 지표
- TTFB
- DOMContentLoaded
- Load event
- slow resource top N
- long task count
- long task total ms
- frame delay p50/p95
- event loop lag avg/max

---

## 14.7 WebRTC 구현

### 기본 흐름
- `RTCPeerConnection` 래핑
- peer id 부여
- state change 이벤트 기록
- `getStats()` polling
- stats normalizer로 표준 shape 변환

### 기본 normalize 필드
- connectionState
- iceConnectionState
- selectedCandidatePair
- currentRoundTripTime
- availableOutgoingBitrate
- packetsLost
- framesDropped
- framesPerSecond
- jitter

---

## 14.8 Overlay UI 구현

### 공통 요구사항
- 페이지를 과도하게 가리지 않아야 함
- drag / resize 가능
- dark theme 기본
- 모바일 Safari에서도 최소 사용 가능
- z-index 충돌 최소화

### 레이아웃 추천
- 좌하단 FAB
- 우하단 drawer 또는 우측 패널
- compact / full 모드 전환
- inspect mode일 때 FAB를 축소하거나 숨김

---

## 14.9 저장 정책

### 기본 정책
- 메모리 우선 저장
- 최근 세션 메타만 extension storage
- 장기 보관은 opt-in
- export 시 압축 가능

### 이유
- 로그 누적으로 확장이 무거워지는 것을 방지
- 민감정보 장기 저장 리스크를 줄임

---

# 15. 성능 예산과 비기능 요구사항

## 15.1 성능 예산

- idle 상태에서 확장 UI가 열려 있어도 페이지 체감 성능 저하가 작아야 함
- overlay collapsed 상태에서는 수집 강도를 줄여야 함
- 패널 렌더는 debounce/batch를 사용해야 함
- 긴 로그/메시지 burst에서도 탭이 멈추지 않아야 함

## 15.2 기본 상한값

- global ring buffer: 1,000 ~ 3,000 이벤트
- websocket connection당 최근 200개 프레임
- body preview: 16KB
- websocket preview: 4KB
- WebRTC polling: 2초 기본
- UI batch flush: 250~500ms

## 15.3 접근성

- 키보드 조작 가능
- font scaling 지원
- reduced motion 옵션 제공

---

# 16. 치명적 이슈와 대응

## 16.1 가장 치명적 이슈 1: 모바일 Chromium 확장 부재

### 문제
모바일 Chrome 계열은 데스크톱처럼 확장 설치 모델을 기대하기 어렵습니다.

### 영향
- 범용 모바일 제품 메시지가 깨짐
- 특정 테스트 기기 지원 범위가 갈림

### 대응
- 초기 범위에서 제외
- 별도 원격 수집 모드가 생기기 전까지 문서/스토어에 명시

### 판단
이건 회피 불가 구조적 이슈입니다.
숨기면 안 됩니다.

---

## 16.2 가장 치명적 이슈 2: 민감정보 유출 위험

### 문제
네트워크/스토리지/콘솔 수집은 토큰, 쿠키, 개인정보를 그대로 노출할 수 있습니다.

### 대응
- redaction 기본 ON
- key 기반 자동 마스킹
- URL exclude rule
- export 전 재검사
- 원격 업로드는 초기 제외

### 판단
이건 기능 문제가 아니라 **제품 존속 리스크**입니다.

---

## 16.3 가장 치명적 이슈 3: 확장 자체가 성능을 오염시킴

### 문제
디버거가 무거우면 측정 결과가 왜곡됩니다.

### 대응
- on-demand injection
- ring buffer
- batch rendering
- collapsed 상태에서 다운샘플
- payload truncate

### 판단
성능 패널을 만드는 순간 확장 성능도 같이 관리해야 합니다.

---

## 16.4 가장 치명적 이슈 4: 브라우저별 API 차이

### 문제
Chromium / Safari / Firefox는 동일하지 않습니다.

### 대응
- capability detection
- adapter 분리
- 심화 기능은 Chromium optional로 제한

---

## 16.5 가장 치명적 이슈 5: MV3 서비스 워커 수명

### 문제
Chromium MV3 background service worker는 영구 상주 프로세스가 아닙니다.

### 대응
- 핵심 수집은 page agent + content 쪽 유지
- background는 주입/설정/저장 메타 중심으로 축소

---

## 16.6 가장 치명적 이슈 6: 요소 검사 자기오염

### 문제
오버레이 UI가 자기 자신을 검사 대상으로 잡으면 UX가 무너집니다.

### 대응
- overlay root에 식별자 부여
- `closest('[data-debugger-root]')` 검사로 제외
- pointer-events 전략 분리

---

## 16.7 가장 치명적 이슈 7: WebSocket 폭주

### 문제
메시지가 초당 수십~수백 개 들어오면 UI가 쉽게 무거워집니다.

### 대응
- connection별 ring buffer
- 펼쳐진 상세 패널에서만 payload 디코딩 강화
- payload preview 길이 제한
- pause 모드 제공

---

# 17. 일정과 난이도

## 17.1 전제

아래 일정은 **추정**입니다.

- 개발자 1명
- 프런트엔드/브라우저 확장 경험 중상급
- LLM 보조 사용
- 서버 없는 로컬형 제품부터 시작
- 디자인 시스템을 깊게 만들지 않음

## 17.2 일정 추정

### MVP (Chrome/Edge Desktop 중심)
- **추정 2~3주**

포함 범위:
- 런처
- 오버레이 UI
- Console/Error
- Elements Inspector v1
- fetch/XHR 네트워크 요약
- WebSocket 기본 inspector
- Long Task/FPS 추정
- WebRTC 기본 stats
- JSON export
- redaction v1

### 실무형 v1
- **추정 5~7주**

추가 범위:
- Safari macOS/iPhone/iPad 지원
- settings 저장
- Storage/Env 패널
- 세션 압축
- capability fallback UI
- 브라우저 matrix 기반 QA

### 실무형 v1.5
- **추정 8~10주**

추가 범위:
- Chromium deep mode
- devtools panel
- Firefox Desktop 코어 지원
- websocket 심화 타임라인
- session compare

## 17.3 난이도 체감

| 영역 | 난이도 | 이유 |
|---|---|---|
| 오버레이 UI | 중 | 일반 FE 역량으로 가능 |
| console/error | 하 | 구현 난도 낮음 |
| 요소 검사 | 중 | overlay 충돌/iframe 고려 필요 |
| fetch/XHR | 중 | body/예외 처리 필요 |
| websocket | 중상 | burst 처리와 preview 정책 필요 |
| performance panel | 중상 | 지표 해석이 중요 |
| webrtc panel | 상 | stats normalization 난도 높음 |
| Safari 지원 | 상 | 패키징/검증 부담 |
| Chromium deep mode | 상 | 권한/복잡도 상승 |
| 보안/마스킹 | 상 | 실수 비용이 큼 |

---

# 18. Codex CLI 바로 실행용 구현 계획

## 18.1 프로젝트 생성 명령

```bash
pnpm dlx wxt@latest init browser-debugger
cd browser-debugger
pnpm install
pnpm add react react-dom zustand clsx
pnpm add -D typescript vitest playwright @types/chrome @types/node
```

## 18.2 1차 브랜치 전략

- `main`: 안정 버전
- `feat/bootstrap-wxt`
- `feat/injection-and-bridge`
- `feat/console-error`
- `feat/elements-inspector`
- `feat/network-http`
- `feat/network-websocket`
- `feat/perf`
- `feat/webrtc`
- `feat/export-redaction`

## 18.3 구현 순서

### Milestone 1: Bootstrap
- WXT React 프로젝트 기동
- extension icon 클릭 시 content script 주입
- 오버레이 루트 렌더

### Milestone 2: Bridge
- content -> main world injection
- postMessage bridge
- event schema / store / ring buffer 구현

### Milestone 3: Console/Error
- console wrapper
- error / rejection handler
- Console 패널 UI

### Milestone 4: Elements Inspector
- inspect mode
- highlight overlay
- selector / box model / style summary UI

### Milestone 5: HTTP / WebSocket
- fetch/XHR wrapper
- WebSocket wrapper
- Network / WebSocket 패널 UI

### Milestone 6: Perf / WebRTC
- Long Tasks / frame delay
- RTCPeerConnection wrapper + stats polling
- Performance / WebRTC 패널 UI

### Milestone 7: Export / Redaction
- redaction engine
- export serializer
- settings 화면

---

# 19. 바이브코딩용 작업 백로그

## Epic A. Bootstrap
- [ ] WXT React 템플릿 생성
- [ ] pnpm workspace 세팅
- [ ] 공통 타입 패키지 생성
- [ ] lint/test/build 스크립트 설정
- [ ] overlay root 렌더링

## Epic B. Injection / Bridge
- [ ] action 클릭 시 active tab 주입
- [ ] content -> main world script injection
- [ ] postMessage bridge 구현
- [ ] runtime capability detector 구현
- [ ] overlay mount/unmount 구현

## Epic C. Event Bus / Store
- [ ] `DebugEvent` 스키마 정의
- [ ] ring buffer store 구현
- [ ] batched dispatch 구현
- [ ] export serializer 골격 구현

## Epic D. Console / Error
- [ ] console wrapper
- [ ] error handler
- [ ] rejection handler
- [ ] safe serializer
- [ ] Console 패널 UI

## Epic E. Elements Inspector
- [ ] inspect mode toggle
- [ ] highlight box overlay
- [ ] selector builder
- [ ] DOM path builder
- [ ] box model extractor
- [ ] computed style summary
- [ ] overlay self-ignore 처리

## Epic F. HTTP Network
- [ ] fetch wrapper
- [ ] XHR wrapper
- [ ] request/response preview 정책
- [ ] header redaction
- [ ] Network 패널 UI

## Epic G. WebSocket
- [ ] WebSocket wrapper
- [ ] send/message/error/close 수집
- [ ] connection별 store 분리
- [ ] payload preview/truncate
- [ ] WebSocket 패널 UI

## Epic H. Performance
- [ ] navigation/resource timing 수집
- [ ] long task observer
- [ ] frame delay tracker
- [ ] event loop lag tracker
- [ ] Performance 패널 UI

## Epic I. WebRTC
- [ ] RTCPeerConnection wrapper
- [ ] state event logger
- [ ] getStats poller
- [ ] stats normalizer
- [ ] WebRTC 패널 UI

## Epic J. Export / Settings / Security
- [ ] redaction rules engine
- [ ] JSON export
- [ ] zip export
- [ ] settings page
- [ ] mask rule editor

## Epic K. Browser Adapters
- [ ] chromium adapter skeleton
- [ ] safari adapter skeleton
- [ ] firefox adapter skeleton
- [ ] capability badges

---

# 20. 기능별 수용 기준(Acceptance Criteria)

## 런처
- [ ] 확장 아이콘 클릭 시 현재 페이지에 오버레이가 뜬다.
- [ ] 같은 탭에서 재클릭 시 닫힌다.

## Console/Error
- [ ] console.log/warn/error가 보인다.
- [ ] uncaught error/unhandled rejection이 구분되어 보인다.

## Elements Inspector
- [ ] inspect mode에서 hover 요소가 하이라이트된다.
- [ ] 클릭 시 selector, rect, box model이 보인다.
- [ ] overlay 자신은 선택되지 않는다.

## Network HTTP
- [ ] fetch/XHR 요청이 목록에 표시된다.
- [ ] status/duration/filter/search가 동작한다.
- [ ] body preview는 제한 크기와 마스킹 규칙을 따른다.

## WebSocket
- [ ] ws 연결 생성 시 connection row가 생긴다.
- [ ] send/message 이벤트가 보인다.
- [ ] burst 상황에서 UI가 멈추지 않는다.

## Performance
- [ ] navigation/resource timing이 보인다.
- [ ] long task count가 집계된다.
- [ ] frame delay와 event loop lag이 보인다.

## WebRTC
- [ ] peer connection 목록이 보인다.
- [ ] state와 주요 stats가 주기적으로 갱신된다.

## Export / Security
- [ ] 세션 JSON export가 가능하다.
- [ ] 민감정보는 기본 마스킹된다.

---

# 21. 테스트 전략

## 21.1 수동 테스트 페이지 준비

다음 테스트 샘플 페이지를 로컬에 만든다.

- `playground-console.html`
- `playground-error.html`
- `playground-network.html`
- `playground-websocket.html`
- `playground-performance.html`
- `playground-webrtc.html`
- `playground-elements.html`

## 21.2 자동화 우선순위

### Vitest
- serializer
- redaction
- selector builder
- event normalizer

### Playwright
- 오버레이 렌더
- inspect mode toggle
- console/error 수집
- network 목록 표시

## 21.3 브라우저별 체크리스트

### Chrome/Edge
- 런처
- inspect mode
- fetch/XHR
- websocket
- performance
- webrtc
- export

### Safari
- 런처
- inspect mode
- fetch/XHR
- websocket
- performance
- webrtc
- overlay interaction

---

# 22. 첫 3주 산출물 정의

## 1주차 종료 시
- 확장 아이콘 클릭 시 오버레이가 뜬다.
- Console / Error가 보인다.
- Elements Inspector로 요소 선택이 된다.

## 2주차 종료 시
- Network HTTP / WebSocket 패널이 동작한다.
- Performance 기본 지표가 보인다.
- WebRTC 기본 상태가 보인다.

## 3주차 종료 시
- Export / Redaction이 동작한다.
- Chrome/Edge MVP 수동 QA 완료
- 내부 데모 가능 상태

---

# 23. 지금 당장 Codex CLI에 줄 작업 지시문

아래 지시문을 그대로 시작 프롬프트로 사용합니다.

```text
목표:
브라우저 확장 기반 오버레이 디버거 MVP를 구현한다.
프로젝트 코드 수정 없이 현재 페이지에 오버레이 디버거를 주입하고,
Console/Error, Elements Inspector, HTTP Network, WebSocket, Performance, WebRTC, Export, Redaction의 최소 기능을 제공한다.

기술 스택:
- WXT
- React
- TypeScript
- Zustand
- pnpm workspace

브라우저 범위:
- 1차: Chrome/Edge Desktop
- Safari/Firefox는 adapter skeleton만 준비

중요 제약:
- content script와 main world agent를 분리한다.
- 모든 이벤트는 공통 DebugEvent 스키마로 정규화한다.
- 민감정보 마스킹은 기본 ON이다.
- overlay 자신은 요소 검사 대상에서 제외한다.
- message/log burst에 대비해 ring buffer와 batch flush를 구현한다.
- body preview와 websocket preview는 최대 길이를 제한한다.

1차 구현 우선순위:
1. bootstrap + injection + bridge
2. console/error 패널
3. elements inspector
4. HTTP network
5. websocket inspector
6. performance
7. webrtc
8. export + redaction

완료 기준:
- 확장 아이콘 클릭 시 현재 페이지에 오버레이가 뜬다.
- console/error가 보인다.
- inspect mode로 요소를 선택하면 selector/box model이 보인다.
- fetch/XHR 및 websocket 이벤트가 보인다.
- long task/fps 추정이 보인다.
- RTCPeerConnection 상태와 일부 stats가 보인다.
- 세션 JSON export가 된다.
```

---

# 24. 최종 판단

이 제품은 **실무에서 사용할 가치가 충분합니다.**
특히 아래 조건에서 강합니다.

- 프로젝트 코드 수정이 어려운 환경
- QA/운영/현장 지원이 자주 필요한 조직
- WebRTC/네트워크/성능 문제가 자주 섞이는 서비스
- 모바일 Safari와 데스크톱 Chromium에서 즉시 증적이 필요한 경우

다만 아래는 반드시 받아들여야 합니다.

1. **모든 브라우저/모바일에서 동일한 확장 경험은 불가능**
2. **내장 DevTools 전체 복제는 비현실적**
3. **민감정보 마스킹은 제품의 핵심 기능**
4. **Chromium이 가장 강하고 Safari/Firefox는 코어 기능 위주**

즉 최적 전략은 아래입니다.

> **크로스 브라우저 공통 오버레이 디버거를 먼저 만들고, Chromium에서는 선택적 심화 기능을 얹는다.**

이 방향이 가장 현실적이고, 실제로 쓰이는 제품이 될 가능성이 높습니다.

---

# 25. 참고 결정 메모

## 지금 바로 결정할 것
- 프로젝트명 확정
- WXT + React + TS 사용 확정
- MVP 범위 확정
- Chrome/Edge 우선 지원 확정
- Safari를 v1 포함할지 결정
- redaction 기본 정책 확정

## 추천안
- **제품명 임시**: `PageProbe`, `OverlayScope`, `LiveInspect`
- **기술**: WXT + React + TypeScript + Zustand
- **1차 지원**: Chrome / Edge
- **2차 지원**: Safari macOS + iOS
- **핵심 차별점**: 요소 검사 + WebSocket + WebRTC + Export + Redaction

