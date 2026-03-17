# Decision Log

## 2026-03-17
### 초기 레포 구조
- 이유: 현재 레포는 문서만 있으므로 빠르게 구현 가능한 최소 workspace가 필요하다.
- 대안: 단일 앱, 풀 모노레포
- 영향: `apps/extension`과 핵심 `packages/*`만 먼저 만든다.

## 2026-03-17
### 초기 브라우저 범위
- 이유: Chrome/Edge Desktop에 집중해야 MVP 검증이 빠르다.
- 대안: Safari 포함, Firefox 포함
- 영향: Safari/Firefox는 capability/adapter skeleton만 준비한다.

## 2026-03-17
### 오버레이 중심 엔트리포인트
- 이유: popup/sidepanel/devtools를 초기에 넣으면 사용자 흐름과 구현 범위가 과하게 넓어진다.
- 대안: popup 또는 sidepanel 동시 구현
- 영향: action click + content/main-world + options만 만든다.

## 2026-03-17
### Redaction 기본값 ON
- 이유: 이 제품은 민감정보 노출 리스크가 핵심이다.
- 대안: 사용자가 필요할 때만 마스킹
- 영향: headers, body, export 모두 redaction을 기본 적용한다.

