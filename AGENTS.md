# Repository Instructions

## Artifact Policy
- 신규 기능 또는 의미 있는 기능 확장을 시작할 때는 `docs/features/...` 문서를 먼저 맞춘다.
- 현재 제품의 기준 문서는 `docs/features/extension/browser-overlay-debugger/` 아래에 둔다.
- 최소 문서는 `README.md`, `tasks.md`이며, 되돌리기 어려운 결정은 `decision-log.md`에 남긴다.

## Working Rules
- 현재 프로젝트는 작은 workspace로 운영한다. `apps/extension`과 `packages/*` 범위를 넘는 구조 확장은 근거가 있을 때만 한다.
- Chrome/Edge Desktop에서 Eruda 기반 디버깅 경험이 우선이다.
- 기본 디버깅 UX는 Eruda를 재사용하고, Inspectra 고유 기능은 Eruda 플러그인과 main-world hook으로 확장한다.
- 문서와 구현이 충돌하면 문서를 먼저 갱신하고 코드를 수정한다.
