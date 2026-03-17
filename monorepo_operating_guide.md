# 모노레포 기반 운영안

## 1. 이 문서를 왜 쓰는가

AI를 활용해 개발 속도를 올리면, 코드 작성은 빨라지지만 **왜 이렇게 구현했는지**, **어떤 범위까지 이번 변경에 포함되는지**, **어느 앱과 패키지가 영향 범위인지**가 흐려지기 쉽습니다.

모노레포에서는 특히 아래 문제가 자주 생깁니다.

- 하나의 기능이 `apps/`와 `packages/`를 동시에 수정한다.
- 공통 코드 수정이 여러 앱에 파급된다.
- MR 본문만으로는 배경과 범위를 충분히 남기기 어렵다.
- AI가 기능 문맥 없이 일부 파일만 수정하면, 구조와 정책이 쉽게 흔들린다.

이 운영안의 목적은 다음입니다.

1. **기능 변경의 배경과 범위를 짧고 명확하게 남긴다.**
2. **문서 작성 비용은 낮추되, 기록은 반드시 남긴다.**
3. **Codex와 GitLab CI가 사람이 빠뜨리기 쉬운 부분을 자동 보완한다.**
4. **모노레포의 장점인 공통 규칙·공통 CI·원자적 변경을 최대한 살린다.**

---

## 2. 어떤 상황에서 사용하는가

이 운영안은 아래와 같은 모노레포에 적합합니다.

- 하나의 Git 저장소 안에 여러 앱과 라이브러리가 함께 있는 구조
- 예: `apps/admin`, `apps/partner`, `apps/user`, `packages/ui`, `packages/auth`, `packages/order-domain`
- 하나의 MR에서 앱과 공통 패키지를 함께 수정할 수 있는 구조
- 공통 CI와 공통 개발 규칙을 저장소 루트에서 관리할 수 있는 구조

### 예시 구조

```text
repo-root/
  apps/
    admin/
    partner/
    user/
  packages/
    ui/
    auth/
    order-domain/
  docs/
    features/
  .agents/
    skills/
  AGENTS.md
  .gitlab-ci.yml
```

---

## 3. 핵심 원칙

### 3-1. 모든 변경에 같은 문서를 요구하지 않는다

모든 MR에 `README/tasks/decision-log`를 강제하면 실무에서 금방 무너집니다.

따라서 변경을 아래처럼 나눕니다.

| 변경 유형 | 예시 | 요구 수준 |
|---|---|---|
| feature | 신규 기능, 새로운 사용자 흐름 | README + tasks 필수 |
| feature-update | 기존 기능의 의미 있는 확장 | README + tasks 필수 |
| bugfix | 작은 오류 수정 | MR 본문으로 대체 가능 |
| refactor | 동작 변화 없는 구조 개선 | MR 본문으로 대체 가능 |
| env | CI, build, config, infra 설정 변경 | 문서 면제 가능 |
| docs/chore | 문서, 의존성, 잡무성 변경 | 문서 면제 가능 |

### 3-2. 문서는 형식별이 아니라 기능별로 둔다

기능과 관련된 정보는 한곳에서 찾을 수 있어야 합니다.

```text
docs/
  features/
    admin/
      bulk-coupon-upload/
        README.md
        tasks.md
        decision-log.md
    shared/
      auth-token-refresh/
        README.md
        tasks.md
        decision-log.md
```

### 3-3. AI는 문서를 바탕으로 작업한다

- Codex는 기능 시작 시 문서 초안 생성
- 구현 요청은 기능 단위로 제한
- 문서와 코드가 어긋나면 먼저 문서를 보고 범위를 재정리

### 3-4. GitLab CI는 “문서 강제”가 아니라 “근거 강제”를 맡는다

- 기능 변경이면 문서 존재 여부 확인
- 문서가 필요 없는 변경이면 MR 본문에 면제 사유 확인
- 둘 다 없으면 MR 실패

---

## 4. 문서 구조

## 4-1. README.md

기능 설명서입니다. 길게 쓰는 문서가 아니라, **이번 변경을 이해하는 최소 설명서**입니다.

### 템플릿

```md
# <feature-name>

## 배경
왜 이 변경이 필요한가

## 목표
이번 변경으로 무엇이 가능해져야 하는가

## 포함 범위
이번 MR 또는 기능 작업에서 포함되는 항목

## 제외 범위
이번에 하지 않는 항목

## 영향 범위
영향받는 앱/패키지

## 사용자 흐름
사용자가 어떤 흐름으로 기능을 사용하는가

## 정책/예외
권한, 상태, 제한, 예외 처리

## 테스트 포인트
꼭 확인해야 할 체크 항목
```

## 4-2. tasks.md

구현 체크리스트입니다.

### 템플릿

```md
# Tasks

- [ ] UI 추가
- [ ] 상태 로직 구현
- [ ] API 연동
- [ ] 예외 처리
- [ ] 테스트 코드 작성
- [ ] QA 체크
```

## 4-3. decision-log.md

되돌리기 어렵거나 영향이 큰 기술 결정을 남기는 문서입니다. 모든 기능에 필요하지 않습니다.

### 언제 쓰는가

- API 계약 방식이 바뀔 때
- 상태 관리 방식이 바뀔 때
- 캐시 전략, 인증 전략, 공통 정책이 바뀔 때
- 여러 앱/패키지에 영향을 주는 설계 결정을 할 때

### 템플릿

```md
# Decision Log

## YYYY-MM-DD
### 결정 내용
- 이유:
- 대안:
- 영향:
```

---

## 5. 운영 정책

## 5-1. 문서 생성 정책

### 신규 기능 시작 시
- 반드시 `README.md`, `tasks.md` 생성
- 필요 시 `decision-log.md` 생성

### 작은 버그 수정 시
- 문서 파일은 생략 가능
- MR 본문에 변경 이유/영향/테스트를 작성

### 환경 변경 시
- 문서 파일은 생략 가능
- MR 본문에 문서 면제 사유를 남김

## 5-2. 문서 위치 정책

### 화면 중심 기능
`docs/features/<app>/<feature-name>/`

예:

```text
docs/features/admin/cancel-reason-report/
```

### 공통 정책·공통 도메인 기능
`docs/features/shared/<feature-name>/`

예:

```text
docs/features/shared/auth-token-refresh/
```

## 5-3. 문서 갱신 정책

다음 중 하나라도 바뀌면 README를 갱신합니다.

- 포함 범위가 달라짐
- 사용자 흐름이 달라짐
- 정책/예외가 추가됨
- 영향 범위 앱/패키지가 늘어남

---

## 6. 루트 CI 운영안

모노레포의 장점은 **루트 CI 하나로 전체 기준을 관리**할 수 있다는 점입니다.

## 6-1. 역할 분리

- 루트 CI: 문서/정책/MR 검증
- 앱/패키지별 작업: lint, test, build

## 6-2. 검사 대상 예시

### 문서 필요로 보는 변경

- `apps/**/src/features/**`
- `packages/**` 중 사용자 기능·정책·도메인 로직 변경
- 권한/상태/API/화면 흐름 변경

### 문서 면제 가능한 변경

- `.gitlab-ci.yml`
- `Dockerfile`
- `tsconfig*`
- `.eslintrc*`
- `.prettierrc*`
- `pnpm-lock.yaml`
- `vite.config.*`
- `webpack.config.*`

## 6-3. GitLab CI 예시

```yaml
stages:
  - validate
  - test

artifact_check:
  stage: validate
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
  script:
    - bash ./scripts/check-artifact.sh

lint_changed:
  stage: test
  script:
    - pnpm lint

unit_test:
  stage: test
  script:
    - pnpm test
```

## 6-4. check-artifact.sh 개념 예시

```bash
#!/usr/bin/env bash
set -euo pipefail

# 예시 개념:
# 1) 변경 파일 목록 확인
# 2) MR description에서 change type 확인
# 3) feature/feature-update이면 README/tasks 존재 확인
# 4) 그 외는 artifact not required 사유 확인

echo "Validate artifact policy"
```

---

## 7. 공통 에이전트 규칙 운영안

Codex는 루트의 `AGENTS.md`와 저장소 내 skills를 통해 작업 방식을 표준화할 수 있습니다.

## 7-1. 무엇을 자동화할 것인가

- 기능 폴더용 문서 초안 생성
- README/tasks 템플릿 삽입
- feature 이름 정규화
- 문서가 필요한 변경인지 먼저 판단하도록 유도

## 7-2. AGENTS.md 예시

```md
# Repository Instructions

## Artifact Policy
- 신규 기능 또는 의미 있는 기능 확장 작업을 시작할 때는 먼저 문서 초안을 생성한다.
- 문서 경로는 `docs/features/<owner>/<feature-name>/` 형식을 따른다.
- 최소 문서는 `README.md`, `tasks.md`다.
- 공통 정책 또는 되돌리기 어려운 기술 결정이 포함되면 `decision-log.md`도 생성한다.

## Working Rules
- 기능 작업은 관련 앱/패키지 범위 안에서만 수행한다.
- 문서와 코드가 충돌하면 먼저 문서를 갱신하고 구현을 이어간다.
- 작은 bugfix, env 변경은 MR 본문 설명으로 대체 가능하다.
```

## 7-3. Skill 구조 예시

```text
.agents/
  skills/
    feature-bootstrap/
      SKILL.md
      assets/
        README.template.md
        tasks.template.md
        decision-log.template.md
      scripts/
        create_feature.sh
```

## 7-4. Skill 사용 예시

개발자가 Codex에 다음처럼 요청합니다.

```text
admin 기능 bulk-coupon-upload 문서 초안 만들어줘.
owner는 admin이고 영향 범위는 apps/admin, packages/order-domain 이야.
```

Codex가 생성하는 결과 예시:

```text
docs/features/admin/bulk-coupon-upload/
  README.md
  tasks.md
```

---

## 8. MR 템플릿 예시

```md
## Change Type
- [ ] feature
- [ ] feature-update
- [ ] bugfix
- [ ] refactor
- [ ] env
- [ ] docs
- [ ] chore

## Artifact
- [ ] README added or updated
- [ ] tasks added or updated
- [ ] decision-log added or updated
- [ ] artifact not required

## Artifact Path
<!-- 예: docs/features/admin/bulk-coupon-upload -->

## If artifact not required
사유:
- [ ] 기능 변경 아님
- [ ] 사용자 영향 없음
- [ ] 환경/설정 변경
- [ ] 단순 버그 수정

상세 설명:

## Validation
- [ ] 테스트 완료
- [ ] 영향 범위 확인
- [ ] 롤백 가능 여부 확인
```

---

## 9. 실제 사용 예시

## 예시 A. 관리자 쿠폰 일괄 업로드 기능 추가

### 변경 내용
- `apps/admin`에 업로드 UI 추가
- `packages/order-domain`에 CSV 유효성 로직 추가

### 문서 경로

```text
docs/features/admin/bulk-coupon-upload/
```

### README 예시 요약
- 배경: 쿠폰을 수동으로 개별 등록 중이라 운영 비용이 큼
- 목표: CSV 업로드로 일괄 등록 가능
- 포함 범위: 업로드, 검증, 결과 표시
- 제외 범위: 예약 업로드, 실패 재시도 자동화

### tasks 예시
- [ ] 업로드 화면 추가
- [ ] CSV 파서 유틸 구현
- [ ] 컬럼 유효성 검사
- [ ] 업로드 API 연동
- [ ] 결과 화면 구현

### MR 처리
- Change Type: `feature`
- Artifact Path: `docs/features/admin/bulk-coupon-upload`
- CI: README/tasks 존재 확인

## 예시 B. 공통 토큰 갱신 정책 변경

### 변경 내용
- `packages/auth` 수정
- `apps/admin`, `apps/partner`, `apps/user` 영향

### 문서 경로

```text
docs/features/shared/auth-token-refresh/
```

### 추가 문서
- `decision-log.md` 작성
- 이유: 여러 앱에 영향을 주는 공통 인증 정책 변경이기 때문

### MR 처리
- Change Type: `feature-update`
- Artifact Path: `docs/features/shared/auth-token-refresh`
- CI: README/tasks + 필요 시 decision-log 확인

## 예시 C. ESLint 설정 변경

### 변경 내용
- `.eslintrc.cjs`, `package.json`만 수정

### 문서 처리
- 별도 기능 문서 없음
- MR 본문에 “artifact not required / 환경성 변경” 체크

### MR 처리
- Change Type: `env`
- CI: 면제 사유 확인 후 통과

---

## 10. 장점

### 10-1. 장점

- 기능 배경과 범위를 짧게라도 남길 수 있다.
- 앱과 패키지를 함께 수정하는 MR의 맥락이 명확해진다.
- Codex가 구조를 덜 흔들고, 기능 단위로 작업하기 쉬워진다.
- MR 리뷰어가 코드만이 아니라 의도와 범위를 함께 볼 수 있다.
- GitLab CI가 기록 누락을 자동으로 잡아준다.
- 루트 정책 하나로 저장소 전체 기준을 맞출 수 있다.

### 10-2. 주의점

- 모든 변경에 풀 문서를 요구하면 실패한다.
- `decision-log.md`는 정말 영향 큰 결정에만 써야 한다.
- 문서 경로 소유권 기준이 모호하면 다시 혼란스러워진다.

---

## 11. 설정 방법

## 11-1. 디렉토리 준비

```bash
mkdir -p docs/features
mkdir -p .agents/skills/feature-bootstrap/assets
mkdir -p .agents/skills/feature-bootstrap/scripts
```

## 11-2. 템플릿 준비

- `README.template.md`
- `tasks.template.md`
- `decision-log.template.md`

## 11-3. AGENTS.md 추가

루트에 저장소 공통 규칙 작성

## 11-4. GitLab MR 템플릿 추가

- Change Type
- Artifact Path
- 면제 사유
- Validation

## 11-5. GitLab CI 추가

- merge request pipeline에서 artifact check 실행
- lint/test/build와 분리

## 11-6. 팀 운영 규칙 공지

팀 합의는 아래 3가지만 명확하면 됩니다.

1. 언제 문서가 필요한가
2. 문서는 어디에 두는가
3. 문서가 없으면 무엇으로 대체하는가

---

## 12. 권장 도입 순서

### 1단계
- MR 템플릿 도입
- README/tasks만 먼저 사용

### 2단계
- Codex skill로 문서 초안 자동화
- 루트 CI에서 artifact check 추가

### 3단계
- 공통 정책 변경에 decision-log 도입
- owner 기준 문서 경로 정교화

---

## 13. 최종 정리

모노레포에서는 하나의 기능이 여러 앱과 패키지에 동시에 영향을 주기 쉽습니다. 그래서 **문서/정책/루트 CI/공통 에이전트 규칙을 루트에서 함께 운영하는 방식**이 잘 맞습니다.

핵심은 복잡한 문서를 많이 쓰는 것이 아니라, 아래를 짧고 확실하게 남기는 것입니다.

- 왜 바꾸는가
- 어디까지 바꾸는가
- 어떤 앱/패키지가 영향 범위인가
- 문서가 필요 없는 변경이라면 왜 면제인가

이 운영안은 그 기준을 **문서 + MR 템플릿 + GitLab CI + Codex 자동화**로 분산해서 실무에 맞게 유지하려는 방식입니다.
