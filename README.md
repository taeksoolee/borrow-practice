# borrow-practice

다른 저장소에서 잘 쓰고 있는 규칙·스킬·테스트 기법·검사 설정을 **AI 가 분석해, 내 저장소에 더할 만한 것을 추천**하게 하는 도구입니다. 추천만 하고 적용은 하지 않습니다. 가져올지 말지는 AI 와 함께 정하고, 결과는 저장소에 기록으로 남습니다.

- 원본 저장소마다 마지막으로 분석한 지점을 남겨, 처음에는 전체 비교, 그다음부터는 변경분(그 사이 PR·문서·설정·테스트)만 봅니다.
- 이미 정한 것(채택·보류·제외)은 다시 추천되지 않습니다. 기록을 팀과 공유하면 누가 돌려도 이어집니다.
- 지침·스킬을 **돌리는 시점에** 갱신하려고 쓰는 도구입니다. 작업 중에 끼어들어 알려 주지 않습니다.

## 지원 범위

- 원본 저장소는 **GitHub** 만 지원합니다.
- **JS/TS 저장소**를 기준으로 만들었습니다. 테스트 기법 신호는 **프런트엔드 중심**입니다. 그 밖의 저장소에서도 AI 설정·스킬, 규칙 문서, PR, 문서, CI·훅 신호는 나옵니다.

## 필요한 것

- Node 22 이상
- git — 원본 저장소를 내 git 권한으로 받아 옵니다. 비공개 저장소는 내가 읽을 수 있어야 합니다.
- `gh` (선택) — 설치·인증돼 있으면 PR 본문까지 붙습니다. 없어도 PR 번호·제목은 나옵니다.

## 시작하기

1. 분석 결과를 받을 저장소에서 설치합니다. `.borrow-practice/` 디렉터리가 생깁니다.

   ```bash
   npx borrow-practice@latest init
   ```

2. `.borrow-practice/.env.example` 을 `.env` 로 복사해 볼 저장소를 적습니다.

   ```
   BORROW_SOURCES=git@github.com:your-org/web-app.git,https://github.com/your-org/admin-app.git#main
   ```

3. AI 에게 이렇게 말합니다.

   > `.borrow-practice/run.md` 읽고 진행해줘

AI 가 신호를 뽑고, 원본을 읽고, 보고서를 쓴 뒤 후보를 하나씩 물어봅니다.

## 명령

| 명령 | 하는 일 |
|---|---|
| `npx borrow-practice@latest init` | 없으면 설치하고, 있으면 도구 파일만 새 버전으로 다시 깝니다. 분석 기록과 설정은 그대로 둡니다. 직접 고친 도구 파일이 있으면 덮어쓸지 묻습니다 |
| `npx borrow-practice reset` | 분석 지점을 지워 다음 실행을 전체 비교로 만듭니다. 결정 기록은 그대로 둡니다 |
| `npx borrow-practice reset --source <키>` | 그 저장소의 분석 지점만 지웁니다 |
| `npx borrow-practice reset --all` | 분석 지점과 결정 기록을 함께 지웁니다 |

`--yes` 를 붙이면 묻지 않고 진행합니다.

## 자세한 사용법

설정, AI 에게 시키는 문장, 결과물, 팀 공유 여부, 자주 겪는 문제는 설치되는 `.borrow-practice/README.md` 에 있습니다. 설치 전에 보려면 [template/README.md](template/README.md) 를 보세요.

## 라이선스

[MIT](LICENSE)
