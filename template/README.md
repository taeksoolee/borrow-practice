# borrow-practice 사용 설명서

다른 저장소에서 잘 쓰고 있는 규칙·스킬·테스트 기법·검사 설정을 찾아, **우리 저장소에 더할 만한 것을 AI 가 분석해 추천**해 주는 도구입니다. 추천만 하고 적용은 하지 않습니다. 가져올지 말지는 AI 와 함께 정하고, 결과는 `decisions.md` 에 남습니다.

이 문서는 사람용 설명서입니다. AI 가 따르는 절차는 [run.md](run.md) 에서 시작합니다.

### 지원 범위

- **원본 저장소는 GitHub 만** 지원합니다. PR 번호·본문과 출처 링크가 GitHub 형식에 맞춰져 있습니다.
- **JS/TS 저장소**를 기준으로 만들었습니다. 프레임워크·테스트 도구·의존성은 `package.json` 에서, 검사 설정은 eslint·tsconfig 에서 읽습니다. 테스트 기법 신호(role 쿼리·포커스·뷰포트 등)는 **프런트엔드 중심**입니다.
- 그 밖의 저장소에서도 AI 설정·스킬, 규칙 문서, PR, 문서, CI·훅 신호는 그대로 나옵니다. 의존성·테스트 기법 신호만 비거나 덜 맞습니다.

---

## 빠르게 시작하기

1. 저장소 루트에서 설치합니다. Node 22 이상과 git 이 필요합니다.

   ```bash
   npx borrow-practice@latest init
   ```

2. `.env.example` 을 복사해 `.env` 를 만들고 볼 저장소를 적습니다 (아래 「설정」).
3. AI 에게 이렇게 말합니다. **언제나 이 한 문장입니다.**

   > `.borrow-practice/run.md` 읽고 진행해줘

4. AI 가 신호를 뽑고, 원본을 읽고, 보고서를 쓴 뒤 후보를 **하나씩** 물어봅니다. 채택·보류·제외를 정하면 `decisions.md` 에 기록됩니다.

### 도구 갱신

설치할 때와 같은 명령을 다시 실행합니다.

```bash
npx borrow-practice@latest init
```

- 도구 파일(`README.md`·`run.md`·`common.md`·`scan.mjs`·`.env.example`)만 새 버전으로 다시 깝니다. 분석 기록과 설정(`decisions.md`·`state.json`·`config.json`·`.env`·`.gitignore`·`signals/`·`reports/`·`.cache/`)은 그대로입니다.
- 도구 파일을 직접 고쳤다면 고친 파일 목록을 보여 주고 덮어쓸지 묻습니다. 묻지 않고 덮어쓰려면 `--yes` 를 붙입니다.
- 설치된 도구가 실행한 패키지보다 새 버전이면 멈춥니다. `@latest` 를 붙여 실행하세요.

---

## 동작 방식

저장소(소스)마다 **마지막으로 분석한 지점**(원본 커밋)을 `state.json` 에 남기고, 그걸로 분석 방식이 정해집니다. 고를 필요가 없습니다.

| 그 저장소를 | 분석 | 보는 것 |
|---|---|---|
| 처음 볼 때 | **전체 비교** | 원본과 우리 저장소의 지금 상태를 나란히 놓고, 원본에는 있고 우리에게는 없는 규칙·스킬·검사·테스트 기법 |
| 전에 본 적 있을 때 | **변경분** | 마지막 분석 지점부터 원본 최신까지. 그 사이 PR(번호·제목, `gh` 인증이 있으면 본문까지)·문서·설정·테스트 변경 |

- 분석 지점은 AI 가 보고서를 쓴 **뒤에** 최신으로 넘어갑니다. 중간에 끊기면 같은 구간을 다음에 다시 봅니다.
- 지난번 이후 바뀐 게 없으면 AI 가 그렇다고 알려 주고 끝냅니다. 바뀌었지만 쓸 만한 게 없으면 짧게 보고하고 분석 지점만 넘깁니다.
- 보는 브랜치가 바뀌었거나, 원본이 강제 push 등으로 그 지점을 잃으면 자동으로 전체 비교로 돌아갑니다.
- 다른 사람이 돌려도 `state.json` 과 `decisions.md` 를 공유하면(기본) 지난 분석 다음부터 이어집니다.

### PR 정보와 `gh` 인증

- **PR 번호·제목**은 원본의 머지 커밋(`Merge pull request #N …`)에서 얻습니다. 인증이 필요 없습니다.
- **PR 본문**은 GitHub 에만 있어서, `gh` 가 설치돼 있고 `gh auth login` 이 돼 있을 때만 붙습니다. 없어도 도구는 그대로 동작합니다.
- 원본이 PR 없이 브랜치를 바로 머지한다면(`Merge branch 'x' into develop`) PR 정보는 없고 커밋으로 봅니다.

### AI 에게 시키는 문장

| 하고 싶은 것 | 이렇게 말하기 |
|---|---|
| 분석 (처음이든 이어서든) | `.borrow-practice/run.md` 읽고 진행해줘 |
| 한 저장소만 분석 | `.borrow-practice/run.md` 읽고 web-app 만 진행해줘 |
| 우리 저장소 프로필만 보기 | `.borrow-practice/run.md` 읽고 프로필만 보여줘 |
| 채택한 것이 잘 적용돼 있는지 확인만 | `.borrow-practice/run.md` 읽고 적용 확인만 해줘 |
| 보류해 둔 것 다시 보기 | `.borrow-practice/run.md` 읽고 보류 재검토해줘 |
| 중간에 끊긴 결정 이어 가기 | `.borrow-practice/run.md` 읽고 결정 이어서 해줘 |
| 처음부터 다시 분석 | `.borrow-practice/run.md` 읽고 처음부터 다시 분석해줘 — 아래 「처음부터 다시」 참고 |

- 「한 저장소만」의 이름은 저장소 이름의 소문자(키)입니다. 아래 「설정」을 보세요.

### 스킬로 부르기 (선택)

「`.borrow-practice/run.md` 읽고 진행해줘」 대신 스킬로 부르고 싶다면, 아래를 AI 에게 그대로 붙여 넣으세요. AI 가 쓰는 도구 형식에 맞춰 스킬을 만들어 줍니다. 저장소에 커밋하면 팀이 함께 씁니다.

```text
이 저장소에 borrow-practice 를 부르는 스킬을 만들어줘. 내용은 아래 그대로, 위치와 형식은 네가 쓰는 도구에 맞춰.

이름: borrow-practice
설명: 다른 저장소의 규칙·스킬·테스트 기법·검사 설정을 분석해 이 저장소에 더할 만한 것을 추천받고
      결정을 기록할 때 쓴다. 「borrow-practice」, 「다른 저장소 참고해서 규칙 갱신」, 「보류 재검토」,
      「적용 확인」 같은 요청.
절차:
1. 저장소 루트의 .borrow-practice/run.md 를 읽고 그 절차를 따른다. 사용자가 한 말(한 저장소만,
   프로필만, 보류 재검토 등)은 run.md 의 해당 항목으로 넘긴다.
2. .borrow-practice/run.md 가 없으면 진행하지 말고, 저장소 루트에서
   npx borrow-practice@latest init 으로 설치하라고 안내한다.
```

스킬은 `run.md` 로 넘기기만 합니다. 절차는 `run.md` 에 있으므로 도구를 갱신해도 스킬은 고칠 필요가 없습니다.

### 처음부터 다시

분석 지점을 지우면 다음 실행이 전체 비교가 됩니다. AI 에게 시켜도 되고, 직접 명령으로 해도 됩니다.

```bash
npx borrow-practice reset                  # 모든 저장소의 분석 지점(state.json)만 지움 — 결정은 유지
npx borrow-practice reset --source web-app # 그 저장소의 분석 지점만
npx borrow-practice reset --all            # 분석 지점과 결정 기록(decisions.md)까지
```

- 지우기 전에 무엇을 지우는지 보여 주고 확인을 받습니다. 묻지 않으려면 `--yes` 를 붙입니다.
- `signals/`·`reports/` 는 지우지 않습니다. 커밋되지 않는 파일이라 지우면 되돌릴 수 없고, 지난 보고서는 다시 분석할 때 비교 자료가 됩니다. 필요 없으면 직접 지우세요.
- `--all` 이 아니면 `decisions.md` 는 그대로라 이미 제외한 것은 다시 추천되지 않습니다.
- `state.json`·`decisions.md` 를 팀과 공유한다면 지운 것도 커밋되어 **팀 전체가** 처음부터 다시 하게 됩니다. 커밋된 파일이면 확인할 때 함께 알려 줍니다.

---

## 설정

`.env.example` 을 `.env` 로 복사해 채웁니다. `.env` 는 개인 설정이라 커밋되지 않습니다.

```bash
cp .borrow-practice/.env.example .borrow-practice/.env
```

### `BORROW_SOURCES` (필수) — 볼 저장소와 브랜치

볼 저장소 주소입니다. 쉼표로 여러 개를 적고, **브랜치는 주소 뒤에 `#브랜치`** 로 정합니다.

```
BORROW_SOURCES=git@github.com:org/repo-a.git,git@github.com:org/repo-b.git#main,https://github.com/org/repo-c.git#release/2026
```

| 적은 것 | 보는 브랜치 |
|---|---|
| `git@github.com:org/repo-a.git` | 원본의 기본 브랜치 (GitHub 에서 기본으로 잡힌 브랜치, 보통 `main`) |
| `git@github.com:org/repo-b.git#main` | `main` |
| `https://github.com/org/repo-c.git#release/2026` | `release/2026` |

- 기본 브랜치가 아닌 브랜치(`develop` 등)를 보려면 `#브랜치` 를 붙이세요. 없는 브랜치면 `git rev-parse origin/<브랜치> 실패` 로 멈춥니다.
- 브랜치를 적지 않으면 실행할 때마다 원본의 기본 브랜치를 다시 확인합니다. 원본이 기본 브랜치를 바꾸면 보는 브랜치도 따라 바뀌니, 계속 같은 브랜치를 보려면 `#브랜치` 를 적어 두세요.
- SSH(`git@github.com:…`)와 HTTPS(`https://github.com/…`) 주소 모두 됩니다. 지금은 GitHub 저장소만 지원합니다.
- 원본은 **내 git 권한으로** 받아 옵니다. 비공개 저장소는 내가 읽을 수 있어야 합니다. 터미널에서 `git ls-remote <주소>` 가 되면 됩니다.
- 저장소마다 **키**가 붙습니다. 저장소 이름을 소문자로 바꾼 것입니다(`Web-App` → `web-app`). 한 저장소만 볼 때 이 키를 씁니다.
- 보는 브랜치가 바뀌면(`#브랜치` 를 고쳤거나 원본의 기본 브랜치가 바뀜) 그 저장소는 다음 실행에서 자동으로 전체 비교가 됩니다. `decisions.md` 는 그대로라 이미 정한 것은 다시 추천되지 않습니다.

> 셸 환경변수로 같은 이름을 주면 `.env` 보다 우선합니다.

### 저장소 설정 `config.json` (선택, 커밋)

`.env` 가 **사람마다** 다른 설정이라면, `config.json` 은 **이 저장소의 성격**을 적는 설정입니다. 팀이 같은 값을 쓰도록 커밋합니다. 없으면 기본값으로 동작합니다.

```json
{
  "skillPaths": ["docs/*-guide.md"]
}
```

| 키 | 내용 |
|---|---|
| `skillPaths` | AI 설정 위치(`.claude/`·`.cursor/`·`.agents/`·`AGENTS.md` 등) **밖에** 둔 스킬·가이드 원본의 경로 패턴. `*` 는 한 폴더 안, `**` 는 하위 폴더까지 |

- 왜 필요한가: 스킬 원본을 `docs/` 같은 일반 문서로 두고, 도구별 스킬 파일은 스크립트로 각자 만들어 커밋하지 않는 저장소가 있습니다. 이 경우 설정이 없으면 우리 스킬을 「없다」고 보고, 원본의 같은 스킬을 「빈자리」로 잘못 추천할 수 있습니다.
- 설정하지 않아도 **AI 규칙 문서(`AI.md`·`AGENTS.md` 등)가 본문에서 가리키는 문서**는 자동으로 잡힙니다. 규칙 문서에서 언급하지 않는 스킬 원본만 `skillPaths` 로 알려 주면 됩니다.
- 무엇이 잡혔는지는 `node .borrow-practice/scan.mjs profile` 결과의 「AI 설정 밖의 스킬·가이드 문서」에서 확인합니다.

---

## 결과물

모든 결과는 이 디렉터리 안에 생깁니다.

| 파일 | 내용 | 커밋 |
|---|---|---|
| `decisions.md` | 결정 기록 — 무엇을 채택·보류·제외했고 왜 그랬는지 | **기본으로 커밋** (`state.json` 과 한 쌍) |
| `state.json` | 저장소별 마지막 분석 지점 | **기본으로 커밋** (`decisions.md` 와 한 쌍) |
| `config.json` | 저장소 설정 — 스킬 원본 위치 등 | 커밋 |
| `reports/<날짜>.md` | AI 의 분석 보고서 — 후보 표와 근거 | 안 함 |
| `signals/<날짜>-profile.md` | 우리 저장소 프로필 — 프레임워크·테스트 도구·AI 설정·검사 설정 요약 | 안 함 |
| `signals/<날짜>-snapshot-<키>.md`·`signals/<날짜>-diff-<키>.md` | 원본에서 뽑은 신호 (판정 없는 재료) | 안 함 |
| `signals/.pending.json` | 이번 분석에서 본 원본 최신 지점. 보고서를 쓴 뒤 `--commit-state` 가 `state.json` 에 옮기고 지운다 | 안 함 |
| `.cache/` | 원본 저장소 사본 | 안 함 |

- 결과를 볼 때는 **보고서**를 먼저 보세요. 신호 파일은 AI 가 분석에 쓰는 재료라 날것 그대로입니다.
- 우리 저장소 프로필은 **커밋된 내용(HEAD)** 기준입니다. 커밋하지 않은 변경이나 `.gitignore` 로 뺀 개인 설정은 들어가지 않습니다.

### 팀과 공유하지 않으려면

`decisions.md`(무엇을 정했는지)와 `state.json`(어디까지 봤는지)은 **한 쌍**입니다. 공유하면 누가 돌려도 지난 분석 다음부터 이어지고, 이미 정한 것은 다시 추천되지 않습니다. 개인용으로만 쓰려면 `.borrow-practice/.gitignore` 에 **둘 다** 더하세요.

```
decisions.md
state.json
```

하나만 빼면 「어디까지 봤는지」와 「무엇을 정했는지」가 어긋납니다.

### 도구 파일을 커밋하지 않으려면

도구 파일(`README.md`·`run.md`·`common.md`·`scan.mjs`·`.env.example`)과 설치 기록 `tool.json` 은 기본으로 커밋합니다. 팀이 같은 버전의 도구로 분석하게 하기 위해서입니다. 저장소에 도구 코드를 두고 싶지 않으면 `.borrow-practice/.gitignore` 에 더하세요.

```
README.md
run.md
common.md
scan.mjs
.env.example
tool.json
```

- 도구를 쓰려는 사람은 저마다 `npx borrow-practice@latest init` 으로 설치해야 합니다. 도구가 없는 상태에서 AI 에게 시키면 AI 가 먼저 설치하라고 안내합니다.
- 사람마다 도구 버전이 다를 수 있습니다. `decisions.md`·`state.json` 을 공유한다면 같은 버전을 쓰도록 맞추세요.

---

## 지켜지는 약속

AI 는 이 도구를 돌리는 동안 아래를 하지 않습니다.

- 혼자 적용 여부를 정하거나 코드를 고치기 — 결정은 항상 사람과 함께, 적용은 평소 작업 흐름으로 따로
- 이슈(일감) 만들기 — 필요해 보이면 제안만
- 의존성 설치 — 필요하면 「설치 필요」로만 적기
- 원본 저장소의 작업 폴더 건드리기 — 이 디렉터리 안의 사본만 읽기

우리 저장소에 AI 규칙 문서(`AGENTS.md`·`CLAUDE.md` 등)가 있으면 AI 는 그 규칙을 먼저 따릅니다.

---

## 자주 겪는 문제

| 증상 | 원인과 해결 |
|---|---|
| `이 저장소에 커밋이 없다` | 도구는 커밋된 내용을 읽습니다. 커밋을 하나 이상 만든 뒤 실행하세요. |
| `.borrow-practice/.env 이 없다` | `.env.example` 을 복사해 `.env` 를 만드세요. |
| `BORROW_SOURCES 가 비어 있다` | `.env` 에 볼 저장소 주소를 적으세요. |
| `GitHub 저장소 주소로 읽을 수 없다` | 주소 형식을 확인하세요. GitHub 주소만 지원합니다. |
| `git fetch -q --prune origin 실패` | 그 저장소를 읽을 권한이 있는지 `git ls-remote <주소>` 로 확인하세요. |
| `git rev-parse origin/<브랜치> 실패` | 원본에 그 브랜치가 없습니다. `#브랜치` 의 이름을 확인하세요. |
| `<키> 의 기본 브랜치를 알 수 없다` | 원본의 기본 브랜치를 확인하지 못했습니다. 주소 뒤에 `#main` 처럼 브랜치를 적으세요. |
| `config.json 을 JSON 으로 읽을 수 없다`·`skillPaths 는 경로 패턴 문자열 배열이어야 한다` | `config.json` 형식을 확인하세요. `{"skillPaths": ["docs/*-guide.md"]}` 꼴입니다. |
| `--source xxx 는 BORROW_SOURCES 에 없다` | 키는 저장소 이름의 소문자입니다. 오류 문구에 있는 키 목록을 보세요. |

### 직접 돌려 보기

AI 없이 신호만 뽑아 볼 수도 있습니다. Node 와 git 이 필요합니다 (Node 22·24 에서 확인).

```bash
node .borrow-practice/scan.mjs profile          # 우리 저장소 프로필만
node .borrow-practice/scan.mjs                  # 분석 신호 (저장소마다 전체 비교 또는 변경분)
node .borrow-practice/scan.mjs --commit-state   # 분석 지점 반영 (보통 AI 가 보고서를 쓴 뒤 실행)
```

---

## 디렉터리 구성

| 파일 | 역할 |
|---|---|
| `README.md` | 이 설명서 (사람용) |
| `run.md` | AI 용 입구 — 분석과 그 밖의 일 |
| `common.md` | AI 용 공통 절차 — 거르기·보고서·결정·적용 확인 |
| `scan.mjs` | 신호 추출기 |
| `.env.example`·`.gitignore` | 개인 설정 틀·무시 목록 |
| `config.json` | 저장소 설정 (선택) |
