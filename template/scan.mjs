/**
 * NOTE:
 * borrow-practice 의 신호 추출기. 다른 저장소에서 「가져올 만한 기법」 후보 신호를 마크다운으로 뽑는다.
 * **판정은 하지 않는다** — 판정은 run.md 를 읽은 AI 가 사용자와 함께 한다.
 *
 * 사용법
 *   node .borrow-practice/scan.mjs                    # 분석: 소스마다 첫 분석이면 전체 비교, 아니면 마지막 지점부터 최신까지
 *   node .borrow-practice/scan.mjs --source KEY       # 한 소스만
 *   node .borrow-practice/scan.mjs --commit-state     # 보고서를 쓴 뒤 분석 지점 반영
 *   node .borrow-practice/scan.mjs profile            # 이 저장소 프로필만
 *
 * 설정
 *   .env         개인 설정. BORROW_SOURCES — 쉼표로 구분한 저장소 주소, 브랜치는 `주소#브랜치` (기본은 원본의 기본 브랜치)
 *   config.json  저장소 설정. skillPaths — AI 설정 위치 밖의 스킬 원본 경로 패턴
 *   소스 키(KEY)는 저장소 이름을 소문자로 바꾼 것이다 (예: git@github.com:your-org/Web-App.git → web-app).
 *
 * 경로
 *   사본  .borrow-practice/.cache/repos/<key>.git   (bare. origin/* 원격 참조로 fetch)
 *   출력  .borrow-practice/signals/<date>-profile.md            이 저장소 프로필
 *         .borrow-practice/signals/<date>-snapshot-<key>.md     전체 비교 신호 (첫 분석)
 *         .borrow-practice/signals/<date>-diff-<key>.md         변경분 신호 (마지막 지점 이후)
 *   상태  .borrow-practice/state.json   소스별 마지막 분석 지점. 지우면 처음부터 다시 분석한다
 *
 * 상태를 분석과 분리한 이유: 분석만 하고 보고서를 못 쓴 채 끊기면, 상태가 먼저 넘어가
 * 그 구간을 다음 분석에서 다시 볼 수 없게 된다.
 *
 * 이 저장소 쪽은 작업 트리가 아니라 HEAD 커밋을 본다. 커밋하지 않은 변경은 프로필에 들어가지 않는다.
 */
/** DOCS: .borrow-practice/run.md (AI 절차), .borrow-practice/README.md (사람용 설명서) */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// NOTE: URL.pathname 은 공백·한글을 퍼센트 인코딩한 채 돌려줘 경로가 깨진다.
const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = execFileSync('git', ['-C', TOOL_DIR, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const REPO_CACHE = path.join(TOOL_DIR, '.cache/repos');
const SIGNAL_DIR = path.join(TOOL_DIR, 'signals');
const PENDING_FILE = path.join(SIGNAL_DIR, '.pending.json');
const STATE_FILE = path.join(TOOL_DIR, 'state.json');
const ENV_FILE = path.join(TOOL_DIR, '.env');
const CONFIG_FILE = path.join(TOOL_DIR, 'config.json');
const TOOL_PREFIX = `${path.relative(ROOT, TOOL_DIR)}/`;

const TEST_FILE = /(\.test\.|\.spec\.|\/__tests?__\/|\/e2e\/)/;
const AI_CONFIG =
  /^(\.kiro\/|\.cursor\/|\.agents\/|\.codex\/|\.claude\/|\.github\/copilot|\.cursorrules$|AGENTS\.md|CLAUDE\.md|AI\.md|.*\.mdc$)/;
const TOOLING =
  /^(\.github\/workflows\/|\.husky\/|eslint\.config|\.eslintrc|tsconfig|vite\.config|vitest\.config|jest\.config|playwright\.config|\.prettierrc|commitlint|lint-staged|scripts\/)/;
// 규칙 문서. 절 제목을 뽑아 비교 근거로 쓴다.
const RULE_DOC =
  /^(AGENTS\.md|CLAUDE\.md|AI\.md|\.cursorrules|\.github\/copilot-instructions\.md|.*\/(rules|steering)\/[^/]+\.mdc?|.*\.mdc)$/;
// 개인 설정이라 비교 대상에서 뺀다
const PERSONAL = /(^|\/)settings\.local\.json$/;

const FRAMEWORKS = ['react', 'vue', 'svelte', '@angular/core', 'solid-js', 'next', 'nuxt', '@sveltejs/kit'];
const TEST_TOOLS = [
  'vitest',
  'jest',
  '@playwright/test',
  'cypress',
  '@testing-library/react',
  '@testing-library/vue',
  '@testing-library/svelte',
  '@testing-library/user-event',
  '@testing-library/jest-dom',
  '@vue/test-utils',
  'msw',
  'fast-check',
  'storybook',
  '@storybook/test',
  'happy-dom',
  'jsdom',
];
const LOCKFILES = { 'pnpm-lock.yaml': 'pnpm', 'package-lock.json': 'npm', 'yarn.lock': 'yarn', 'bun.lockb': 'bun', 'bun.lock': 'bun' };

/**
 * NOTE:
 * 테스트 파일에서 찾는 기법 신호. `rx` 는 git grep -E 에도 그대로 쓰이므로
 * JS 전용 문법(\d 등)을 넣지 않는다.
 */
const TECHNIQUES = [
  { key: 'property-test', rx: 'fast-check|fc\\.(assert|property)', desc: '속성 기반 테스트' },
  { key: 'fake-timer', rx: 'useFakeTimers|advanceTimersByTime', desc: '가짜 타이머(폴링·지연 검증)' },
  { key: 'role-query', rx: 'ByRole\\(', desc: 'role 기반 쿼리(접근성 겸 검증)' },
  { key: 'focus-assert', rx: 'toHaveFocus|toBeFocused|activeElement', desc: '포커스 복원 검증' },
  { key: 'abort', rx: 'AbortController|AbortSignal|signal\\.aborted', desc: '요청 취소(abort)' },
  { key: 'stale-guard', rx: 'runId|requestId|latestRequest|isStale', desc: '늦은 응답 폐기' },
  { key: 'viewport-boundary', rx: 'matchMedia|innerWidth|resizeTo|setViewportSize', desc: '뷰포트 경계' },
  { key: 'network-failure', rx: 'mockRejected|networkError|HttpResponse\\.error', desc: '실패 경로 테스트' },
  { key: 'a11y-attr', rx: 'aria-(live|describedby|invalid|busy)|role="(alert|status)"', desc: '접근성 속성' },
];

const git = (repo, args, { check = true } = {}) => {
  const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (check && r.status !== 0) {
    console.error(`git ${args.join(' ')} 실패 (${repo}):\n${r.stderr}`);
    process.exit(1);
  }
  return r.status === 0 ? r.stdout : '';
};

const fail = msg => {
  console.error(msg);
  process.exit(1);
};

const readJson = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
};

const lines = text => text.split('\n').filter(Boolean);
const uniq = xs => [...new Set(xs)];
const code = s => `\`${s}\``;

const ensureClone = src => {
  const repo = path.join(REPO_CACHE, `${src.key}.git`);
  if (!fs.existsSync(repo)) {
    fs.mkdirSync(REPO_CACHE, { recursive: true });
    execFileSync('git', ['init', '--bare', '-q', repo]);
    git(repo, ['remote', 'add', 'origin', src.url]);
    git(repo, ['config', 'remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*']);
  }
  git(repo, ['fetch', '-q', '--prune', 'origin']);
  if (src.branch === null) src.branch = defaultBranch(src, repo);
  return repo;
};

// 브랜치를 적지 않은 소스는 원본의 기본 브랜치(origin/HEAD)를 본다. 원본에서 기본 브랜치를 바꿀 수 있어 매번 다시 묻는다.
const defaultBranch = (src, repo) => {
  git(repo, ['remote', 'set-head', 'origin', '--auto'], { check: false });
  const ref = git(repo, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { check: false }).trim();
  if (!ref.startsWith('origin/')) fail(`${src.key} 의 기본 브랜치를 알 수 없다. BORROW_SOURCES 에 \`${src.url}#브랜치\` 처럼 브랜치를 적는다.`);
  return ref.slice('origin/'.length);
};

const pkgOf = (repo, rev) => {
  const raw = git(repo, ['show', `${rev}:package.json`], { check: false });
  if (raw === '') return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

const deps = (repo, rev) => {
  const pkg = pkgOf(repo, rev);
  return { ...pkg.dependencies, ...pkg.devDependencies };
};

// 런타임 의존성으로 판별한다. react 를 스토리북용 devDependency 로만 둔 vue 저장소가 「react+vue」로 잡히지 않게.
const frameworkOf = pkg => {
  const pick = d => FRAMEWORKS.filter(f => f in (d ?? {}));
  const runtime = pick(pkg.dependencies);
  return (runtime.length > 0 ? runtime : pick(pkg.devDependencies)).join('+') || '알 수 없음';
};

// 스킬 하나가 여러 파일이라 단위(SKILL.md 가 있는 폴더, 없으면 파일)로 묶는다
const unitOf = p => {
  const m = p.match(/^(.*\/(skills|specs?|rules|steering|hooks|commands|agents)\/[^/]+)\//);
  return m === null ? p : m[1];
};

/**
 * NOTE:
 * 같은 단위를 저장소끼리 맞춰 보는 이름. 경로 앞부분(.claude/·.cursor/·docs/)은 저장소마다 달라 끝 이름만 쓰고,
 * 스킬 원본을 일반 문서로 두는 저장소(`docs/start-task-guide.md`)와 맞추려고 -guide 같은 꼬리도 뗀다.
 */
const GENERIC_NAMES = new Set(['readme', 'index', 'overview', 'contributing', 'skill']);
const unitName = unit => {
  const base = path
    .basename(unit)
    .replace(/\.(md|mdc|json|ya?ml)$/, '')
    .replace(/[-_](guide|skill|rules?|instructions?)$/i, '')
    .toLowerCase();
  // README 처럼 흔한 이름은 그것만으로는 같은 것이라 볼 수 없어 폴더 이름을 붙인다 (skills/README ≠ codemod/README)
  return GENERIC_NAMES.has(base) ? `${path.basename(path.dirname(unit)).toLowerCase()}/${base}` : base;
};

// config.json 의 경로 패턴(`docs/*-guide.md`, `docs/**/*.md`)을 정규식으로. `**` 는 폴더를 넘고 `*` 는 넘지 않는다.
const globToRegExp = glob =>
  new RegExp(
    `^${glob
      .split('**')
      .map(part =>
        part
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '[^/]*')
          .replace(/\?/g, '[^/]'),
      )
      .join('.*')}$`,
  );

/**
 * NOTE:
 * 문서 본문에서 저장소 안의 다른 마크다운 경로를 찾는다. 루트 기준과 문서 위치 기준을 둘 다 후보로 내고,
 * 실제로 있는 파일인지는 호출하는 쪽이 파일 목록으로 거른다.
 */
const mdRefsIn = (text, from) => {
  const out = new Set();
  for (const m of text.matchAll(/(?:\.{1,2}\/)?[\w@.-]+(?:\/[\w@.-]+)*\.mdc?\b/g)) {
    const raw = m[0];
    out.add(path.posix.normalize(raw.replace(/^\.\//, '')));
    out.add(path.posix.normalize(path.posix.join(path.posix.dirname(from), raw)));
  }
  return out;
};

/**
 * NOTE:
 * eslint 설정 파일에서 「규칙 이름: 심각도」 형태를 정규식으로 뽑는다. 설정을 실행하지 않으므로
 * 공유 설정(extends·플러그인 recommended)이 켠 규칙은 보이지 않는다 — 직접 적은 규칙만이다.
 */
const eslintRules = text => {
  const out = new Map();
  // 따옴표 키는 숫자 심각도까지, 따옴표 없는 키(eqeqeq 등)는 문자열 심각도만 받는다 — `indent: 2` 같은 값과 헷갈리지 않게.
  const quoted = /['"]((?:@[\w-]+\/)?[\w-]+(?:\/[\w-]+)?)['"]\s*:\s*\[?\s*['"]?(error|warn|off|0|1|2)\b/g;
  const bare = /(?<![\w$'"])([a-zA-Z_$][\w$]*)\s*:\s*\[?\s*['"](error|warn|off)['"]/g;
  for (const m of [...text.matchAll(quoted), ...text.matchAll(bare)]) out.set(m[1], { 0: 'off', 1: 'warn', 2: 'error' }[m[2]] ?? m[2]);
  return out;
};

// 워크플로의 run 명령. `run: |` 블록은 첫 명령 줄을 대신 쓴다.
const runsOf = text => {
  const ls = text.split('\n').map(l => l.trim());
  const out = [];
  ls.forEach((l, i) => {
    const m = l.match(/^-?\s*run:\s*(.*)$/);
    if (m === null) return;
    const v = /^[|>][-+]?$/.test(m[1]) ? (ls.slice(i + 1).find(n => n !== '') ?? '') : m[1];
    if (v !== '') out.push(v);
  });
  return out;
};

// 마크다운 절 제목(#~###). 코드 블록 안의 셸 주석(`# …`)은 제목이 아니므로 건너뛴다.
const headingsOf = text => {
  let fenced = false;
  const out = [];
  for (const l of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(l)) fenced = !fenced;
    else if (!fenced && /^#{1,3} /.test(l)) out.push(l.trim());
  }
  return out;
};

const TS_FLAGS =
  /"(strict\w*|noUnchecked\w+|noImplicit\w+|exactOptional\w+|noFallthrough\w+|noUnused\w+|noPropertyAccessFromIndexSignature)"\s*:\s*true/g;

/**
 * NOTE:
 * 저장소 하나의 프로필. 이 저장소(HEAD)와 원본(origin/<branch>)에 같은 함수를 써서 나란히 비교한다.
 * 파일 내용은 모두 git 객체에서 읽는다 — 원본은 bare 사본이라 작업 트리가 없다.
 */
const profileOf = (repo, rev, { exclude = null, skillPaths = [] } = {}) => {
  const files = lines(git(repo, ['ls-tree', '-r', '--name-only', rev])).filter(p => (exclude === null ? true : !p.startsWith(exclude)));
  const show = p => git(repo, ['show', `${rev}:${p}`], { check: false });
  const pkg = pkgOf(repo, rev);
  const d = { ...pkg.dependencies, ...pkg.devDependencies };

  const aiUnits = new Map();
  const aiFiles = files.filter(f => AI_CONFIG.test(f) && !PERSONAL.test(f));
  for (const p of aiFiles) {
    const u = unitOf(p);
    if (!aiUnits.has(u)) aiUnits.set(u, []);
    aiUnits.get(u).push(p);
  }

  /**
   * NOTE:
   * AI 설정 위치 밖에 둔 스킬·가이드 문서. 스킬 원본을 `docs/` 같은 일반 위치에 두고 도구별 파일은
   * 로컬에서 만들어 내는 저장소는 위 목록만으로는 스킬이 하나도 안 보인다. 두 경로로 찾는다.
   *   설정    config.json 의 skillPaths (이 저장소만 — 원본 저장소의 구조는 알 수 없다)
   *   참조    AI 설정 문서가 본문에서 가리키는 마크다운 (양쪽 모두)
   */
  const fileSet = new Set(files);
  const skillDocs = new Map();
  const patterns = skillPaths.map(globToRegExp);
  for (const p of files.filter(f => patterns.some(rx => rx.test(f)) && !AI_CONFIG.test(f))) skillDocs.set(p, '설정');
  for (const from of aiFiles.filter(f => /\.mdc?$/.test(f))) {
    for (const ref of mdRefsIn(show(from), from)) {
      if (fileSet.has(ref) && !AI_CONFIG.test(ref) && !skillDocs.has(ref)) skillDocs.set(ref, `참조: ${from}`);
    }
  }

  const ruleDocs = files
    .filter(p => RULE_DOC.test(p))
    .map(p => ({
      path: p,
      headings: headingsOf(show(p)),
    }));

  const hooks = files
    .filter(p => p.startsWith('.husky/') && !p.startsWith('.husky/_/'))
    .map(p => ({
      path: p,
      commands: lines(show(p))
        .map(l => l.trim())
        .filter(l => l !== '' && !l.startsWith('#') && !/^(\.|source) /.test(l) && !/^(if|then|else|fi|done|do|exit)\b/.test(l))
        .slice(0, 8),
    }));

  const workflows = files
    .filter(p => /^\.github\/workflows\/.+\.ya?ml$/.test(p))
    .map(p => ({
      path: p,
      runs: runsOf(show(p)).slice(0, 15),
    }));

  const lint = new Map();
  for (const p of files.filter(f => /^(eslint\.config\.[cm]?[jt]s|\.eslintrc(\.[cm]?js|\.json|\.ya?ml)?)$/.test(f))) {
    for (const [k, v] of eslintRules(show(p))) lint.set(k, v);
  }

  const tsFlags = uniq(
    files.filter(f => /^tsconfig[\w.-]*\.json$/.test(f)).flatMap(p => [...show(p).matchAll(TS_FLAGS)].map(m => m[1])),
  ).sort();

  // 테스트 기법 사용량: 원본·이 저장소 모두 커밋된 전체 파일 기준
  const techniques = Object.fromEntries(
    TECHNIQUES.map(t => {
      const counts = lines(
        git(repo, ['grep', '-c', '-E', t.rx, rev, '--', '.', ...(exclude === null ? [] : [`:!${exclude}`])], { check: false }),
      );
      return [t.key, counts.reduce((sum, l) => sum + Number(l.slice(l.lastIndexOf(':') + 1)), 0)];
    }),
  );

  return {
    framework: frameworkOf(pkg),
    testTools: TEST_TOOLS.filter(t => t in d),
    packageManager: Object.entries(LOCKFILES).find(([f]) => files.includes(f))?.[1] ?? '알 수 없음',
    scripts: pkg.scripts ?? {},
    deps: d,
    aiUnits,
    skillDocs,
    ruleDocs,
    hooks,
    workflows,
    lint,
    tsFlags,
    testFileCount: files.filter(p => TEST_FILE.test(p)).length,
    techniques,
  };
};

const targetProfile = (() => {
  let cached = null;
  return () => (cached ??= profileOf(ROOT, 'HEAD', { exclude: TOOL_PREFIX, skillPaths: readConfig().skillPaths }));
})();

// 저장소끼리 맞춰 볼 스킬 이름 → 대표 경로. AI 설정 단위와 AI 설정 밖의 스킬 문서를 함께 본다.
const skillIndex = prof => {
  const out = new Map();
  for (const u of prof.aiUnits.keys()) out.set(unitName(u), u);
  for (const d of prof.skillDocs.keys()) if (!out.has(unitName(d))) out.set(unitName(d), d);
  return out;
};

const targetHead = () => git(ROOT, ['rev-parse', '--short=8', 'HEAD']).trim();

/** 이 저장소 프로필 문서. diff·snapshot 모두 이 파일을 근거로 「이미 있음」「빈자리」를 판단한다. */
const renderProfile = p => {
  const out = [
    `# 이 저장소 프로필 — ${path.basename(ROOT)}`,
    '',
    `- 기준: HEAD \`${targetHead()}\` (커밋하지 않았거나 .gitignore 로 뺀 파일 — 개인 CLAUDE.md·스킬 등 — 은 들어가지 않는다)`,
    `- 프레임워크: ${p.framework} / 패키지 매니저: ${p.packageManager}`,
    `- 테스트 도구: ${p.testTools.length === 0 ? '없음' : p.testTools.map(code).join(', ')} / 테스트 파일 ${p.testFileCount}개`,
    '',
    '## AI 설정·스킬',
    '',
  ];
  if (p.aiUnits.size === 0) out.push('없음');
  for (const [u, members] of p.aiUnits) out.push(`- ${code(u)}${members.length > 1 ? ` (${members.length}개 파일)` : ''}`);
  out.push(
    '',
    '## AI 설정 밖의 스킬·가이드 문서',
    '',
    '`설정` 은 config.json 의 skillPaths, `참조: X` 는 AI 설정 문서 X 가 본문에서 가리키는 문서다.',
    '',
  );
  if (p.skillDocs.size === 0) out.push('없음');
  for (const [doc, origin] of [...p.skillDocs].sort(([a], [b]) => a.localeCompare(b))) out.push(`- ${code(doc)} — ${origin}`);
  out.push('', '## 규칙 문서 절 제목', '');
  if (p.ruleDocs.length === 0) out.push('없음');
  for (const doc of p.ruleDocs) {
    out.push(`### ${code(doc.path)}`, '');
    out.push(...(doc.headings.length === 0 ? ['(제목 없음)'] : doc.headings.map(h => `- ${h.replace(/^#+ /, '')}`)), '');
  }
  out.push('## 훅', '');
  if (p.hooks.length === 0) out.push('없음');
  for (const h of p.hooks) out.push(`- ${code(h.path)}: ${h.commands.map(code).join(' / ') || '(명령 없음)'}`);
  out.push('', '## CI 실행 명령', '');
  if (p.workflows.length === 0) out.push('없음');
  for (const w of p.workflows) out.push(`- ${code(w.path)}: ${w.runs.map(code).join(' / ') || '(run 없음)'}`);
  out.push('', '## package.json scripts', '');
  const scripts = Object.entries(p.scripts);
  if (scripts.length === 0) out.push('없음');
  for (const [k, v] of scripts) out.push(`- ${code(k)}: ${code(v)}`);
  out.push('', `## eslint 규칙 (설정 파일에 직접 적은 것만, 여러 블록에 있으면 마지막 값, ${p.lint.size}개)`, '');
  if (p.lint.size === 0) out.push('없음');
  for (const [k, v] of [...p.lint].sort(([a], [b]) => a.localeCompare(b))) out.push(`- ${code(k)}: ${v}`);
  out.push('', '## tsconfig 엄격 옵션', '', p.tsFlags.length === 0 ? '없음' : p.tsFlags.map(code).join(', '), '');
  out.push('## 테스트 기법 사용량 (일치 줄 수)', '', '| 기법 | 줄 수 |', '|---|---|');
  for (const t of TECHNIQUES) out.push(`| ${t.desc} (${code(t.key)}) | ${p.techniques[t.key]} |`);
  return out;
};

const writeSignal = (name, out) => {
  fs.mkdirSync(SIGNAL_DIR, { recursive: true });
  const file = path.join(SIGNAL_DIR, name);
  fs.writeFileSync(file, `${out.join('\n')}\n`);
  console.log(path.relative(ROOT, file));
};

const today = new Date().toISOString().slice(0, 10);
const profileFile = `${today}-profile.md`;

const writeProfile = () => writeSignal(profileFile, renderProfile(targetProfile()));

// ---------------------------------------------------------------- diff

const GH_PR_LIMIT = 30;
const GH_BODY_LIMIT = 1500;

/**
 * NOTE:
 * gh 가 설치돼 있고 인증돼 있으면 PR 본문까지 붙인다. 없거나 실패하면 null — 머지 커밋에서 얻은 번호·제목만 쓴다.
 * 인증은 필수가 아니다. 결과를 프로세스 안에서 한 번만 확인한다.
 */
const ghReady = (() => {
  let ready = null;
  return () => (ready ??= spawnSync('gh', ['auth', 'status'], { encoding: 'utf8' }).status === 0);
})();

const ghPrBody = (src, number) => {
  if (!ghReady()) return null;
  const r = spawnSync('gh', ['pr', 'view', String(number), '--repo', src.slug, '--json', 'body'], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  try {
    return (JSON.parse(r.stdout).body ?? '').trim();
  } catch {
    return null;
  }
};

/**
 * NOTE:
 * 구간 안의 머지 커밋. GitHub 의 PR 머지는 `Merge pull request #N from …` 제목과 PR 제목 본문을 남긴다.
 * PR 을 거치지 않은 브랜치 머지(`Merge branch 'x' into develop`)는 PR 번호가 없어 브랜치 머지로만 적는다.
 */
const mergesIn = (repo, range) =>
  git(repo, ['log', '--merges', '--format=%H%x1f%ad%x1f%s%x1f%b%x1e', '--date=short', range])
    .split('\x1e')
    .map(r => r.trim())
    .filter(Boolean)
    .map(r => {
      const [sha, date, subject, body = ''] = r.split('\x1f');
      const m = subject.match(/^Merge pull request #(\d+) from (\S+)/);
      return { sha, date, subject, title: body.trim().split('\n')[0] ?? '', pr: m === null ? null : Number(m[1]), from: m?.[2] ?? null };
    });

const diff = (src, repo, head, last) => {
  const headRef = `origin/${src.branch}`;
  const range = `${last}..${head}`;

  const commits = lines(git(repo, ['log', '--no-merges', '--format=%H%x1f%an%x1f%ad%x1f%s', '--date=short', range])).map(line =>
    line.split('\x1f'),
  );
  const merges = mergesIn(repo, range);

  const mine = targetProfile();
  const out = [
    `# 변경분 신호 — ${src.key}`,
    '',
    `- 원본: \`${headRef}\` = \`${head.slice(0, 8)}\` / 프레임워크 ${frameworkOf(pkgOf(repo, head))}`,
    `- 이 저장소: HEAD \`${targetHead()}\` / 프레임워크 ${mine.framework} — 프로필은 \`signals/${profileFile}\``,
    `- 범위: 마지막 분석 지점 \`${last.slice(0, 8)}\` 이후 / 커밋 ${commits.length}개 (머지 제외), 머지 ${merges.length}개`,
    '',
  ];
  if (commits.length === 0 && merges.length === 0) return [...out, '새 변경 없음.'];

  const authors = {};
  for (const [, a] of commits) authors[a] = (authors[a] ?? 0) + 1;
  out.push(
    `작성자: ${Object.entries(authors)
      .sort((x, y) => y[1] - x[1])
      .map(([a, n]) => `${a} ${n}`)
      .join(', ')}`,
    '',
  );

  // 범위 안 파일별 마지막 변경(삭제 포함)
  const files = new Map();
  let cur = null;
  for (const line of git(repo, ['log', '--no-merges', '--name-status', '--format=@@%H%x1f%an', range]).split('\n')) {
    if (line.startsWith('@@')) {
      const [sha, author] = line.slice(2).split('\x1f');
      cur = { sha, author };
    } else if (line.trim() !== '' && cur !== null) {
      const parts = line.split('\t');
      const p = parts[parts.length - 1];
      if (!files.has(p)) files.set(p, { status: parts[0][0], ...cur });
    }
  }
  // 삭제된 파일은 지운 커밋의 부모에서 읽어야 내용이 보인다
  const link = (p, info) => `[${p}](${src.web}/blob/${info.status === 'D' ? `${info.sha}^` : info.sha}/${p})`;

  // 1. PR — 판단 근거(왜 바꿨는지)가 가장 많이 담기는 곳이라 먼저 둔다
  const prs = merges.filter(m => m.pr !== null);
  const branchMerges = merges.filter(m => m.pr === null);
  out.push('## 1. PR (머지 커밋 기준)', '');
  if (prs.length === 0) out.push('없음');
  prs.forEach((m, i) => {
    out.push(`- ${m.date} [#${m.pr}](${src.web}/pull/${m.pr}) ${m.title || m.subject} — \`${m.from}\``);
    if (i >= GH_PR_LIMIT) return;
    const body = ghPrBody(src, m.pr);
    if (body)
      out.push(...`${body.slice(0, GH_BODY_LIMIT)}${body.length > GH_BODY_LIMIT ? ' …(생략)' : ''}`.split('\n').map(l => `  > ${l}`));
  });
  out.push('');
  if (prs.length > 0) {
    out.push(
      ghReady()
        ? `PR 본문은 gh 로 붙였다 (최대 ${GH_PR_LIMIT}개, 개당 ${GH_BODY_LIMIT}자).`
        : 'gh 가 없거나 인증되지 않아 PR 본문은 붙이지 않았다. 번호·제목은 머지 커밋에서 얻었다.',
      '',
    );
  }
  if (branchMerges.length > 0) {
    out.push('### PR 없이 머지된 브랜치', '');
    for (const m of branchMerges) out.push(`- ${m.date} [${m.subject}](${src.web}/commit/${m.sha})`);
    out.push('');
  }

  // 2. 의존성
  const before = deps(repo, last);
  const after = deps(repo, head);
  const added = Object.keys(after)
    .filter(p => !(p in before))
    .sort();
  out.push('## 2. 새 의존성', '');
  if (added.length === 0) out.push('없음');
  else {
    out.push('| 패키지 | 버전 | 이 저장소에 있음 |', '|---|---|---|');
    for (const p of added) out.push(`| \`${p}\` | ${after[p]} | ${p in mine.deps ? `예 ${mine.deps[p]}` : '아니오'} |`);
  }
  out.push('');

  // 3. 테스트·코드 기법
  const tests = [...files].filter(([p, i]) => TEST_FILE.test(p) && i.status !== 'D').map(([p]) => p);
  const bodies = new Map(tests.map(p => [p, git(repo, ['show', `${head}:${p}`], { check: false })]));
  out.push('## 3. 테스트·코드 기법', '');
  const rows = [];
  for (const t of TECHNIQUES) {
    const rx = new RegExp(t.rx, 'g');
    const where = tests
      .map(p => ({ p, n: (bodies.get(p).match(rx) ?? []).length }))
      .filter(w => w.n > 0)
      .sort((x, y) => y.n - x.n);
    if (where.length === 0) continue;
    const sample = where
      .slice(0, 3)
      .map(w => `${link(w.p, files.get(w.p))} (${w.n})`)
      .join(', ');
    rows.push(`| ${t.desc} (\`${t.key}\`) | ${where.length} | ${mine.techniques[t.key]} | ${sample} |`);
  }
  if (rows.length === 0) out.push('없음');
  else out.push('| 기법 | 원본 파일 수 | 이 저장소 일치 줄 수 | 대표 파일 |', '|---|---|---|---|', ...rows);
  out.push('', `테스트 파일 ${tests.length}개를 봤다 (삭제 제외).`, '');

  // 4·5. 설정
  const mineIndex = skillIndex(mine);
  for (const [title, rx, withMine] of [
    ['4. AI 설정·스킬', AI_CONFIG, true],
    ['5. 도구·검사 설정', TOOLING, false],
  ]) {
    const hit = [...files].filter(([p]) => rx.test(p) && !PERSONAL.test(p)).sort(([a], [b]) => a.localeCompare(b));
    out.push(`## ${title}`, '');
    if (hit.length === 0) out.push('없음');
    const units = new Map();
    for (const [p, i] of hit) {
      const unit = unitOf(p);
      if (!units.has(unit)) units.set(unit, []);
      units.get(unit).push([p, i]);
    }
    for (const [unit, members] of units) {
      const statuses = uniq(members.map(([, i]) => i.status)).join('/');
      const entry = members.find(([p]) => /SKILL\.md$|requirements\.md$/.test(p)) ?? members[0];
      const deleted = members.every(([, i]) => i.status === 'D');
      const same =
        withMine && mineIndex.has(unitName(unit)) ? ` — 이 저장소에 같은 이름 있음 (${code(mineIndex.get(unitName(unit)))})` : '';
      out.push(
        `- \`${statuses}\` ${link(unit === entry[0] ? unit : entry[0], entry[1])}` +
          `${members.length > 1 ? ` 외 ${members.length - 1}개 파일` : ''} — ${entry[1].author}` +
          `${deleted ? ' (삭제됨: 지운 커밋의 부모에서 읽기)' : ''}${same}`,
      );
    }
    out.push('');
  }

  // 6. 그 밖의 문서 — AI 설정 밖이지만 판단 근거가 될 수 있는 마크다운(설계·가이드·결정 기록 등)
  const docs = [...files]
    .filter(([p]) => /\.mdx?$/i.test(p) && !AI_CONFIG.test(p) && !/(^|\/)CHANGELOG\.md$/i.test(p))
    .sort(([a], [b]) => a.localeCompare(b));
  out.push('## 6. 그 밖의 문서', '');
  if (docs.length === 0) out.push('없음');
  for (const [p, i] of docs.slice(0, 40)) out.push(`- \`${i.status}\` ${link(p, i)} — ${i.author}`);
  if (docs.length > 40) out.push(`- … 외 ${docs.length - 40}개`);
  out.push('');

  // 7. 커밋 목록
  out.push('## 7. 커밋 목록', '');
  for (const [h, a, d, s2] of commits.slice(0, 80)) out.push(`- ${d} ${a} [${s2}](${src.web}/commit/${h})`);
  if (commits.length > 80) out.push(`- … 외 ${commits.length - 80}개`);
  return out;
};

// ---------------------------------------------------------------- snapshot

const snapshot = (src, repo, head, note = null) => {
  const headRef = `origin/${src.branch}`;
  const theirs = profileOf(repo, head);
  const mine = targetProfile();
  const blob = p => `[${p}](${src.web}/blob/${head}/${p})`;

  const out = [
    `# 전체 비교 신호 — ${src.key}`,
    '',
    `- 원본: \`${headRef}\` = \`${head.slice(0, 8)}\``,
    ...(note === null ? [] : [`- ${note}`]),
    `- 이 저장소: HEAD \`${targetHead()}\` — 프로필은 \`signals/${profileFile}\``,
    '',
    '## 1. 기반',
    '',
    '| 항목 | 원본 | 이 저장소 |',
    '|---|---|---|',
    `| 프레임워크 | ${theirs.framework} | ${mine.framework} |`,
    `| 패키지 매니저 | ${theirs.packageManager} | ${mine.packageManager} |`,
    `| 테스트 도구 | ${theirs.testTools.map(code).join(', ') || '없음'} | ${mine.testTools.map(code).join(', ') || '없음'} |`,
    `| 테스트 파일 수 | ${theirs.testFileCount} | ${mine.testFileCount} |`,
    '',
  ];
  const onlyTools = theirs.testTools.filter(t => !mine.testTools.includes(t));
  if (onlyTools.length > 0) out.push(`원본에만 있는 테스트 도구: ${onlyTools.map(code).join(', ')}`, '');

  // 2. AI 설정·스킬 — 끝 이름으로 맞춘다. 같은 이름이어도 내용이 다를 수 있어 「양쪽 있음」도 남긴다.
  const mineNames = skillIndex(mine);
  const theirsNames = skillIndex(theirs);
  out.push('## 2. AI 설정·스킬', '', '### 원본에만 있음', '');
  const onlyTheirs = [...theirs.aiUnits].filter(([u]) => !mineNames.has(unitName(u)));
  const onlyTheirsDocs = [...theirs.skillDocs].filter(([d]) => !mineNames.has(unitName(d)) && !theirs.aiUnits.has(d));
  if (onlyTheirs.length === 0 && onlyTheirsDocs.length === 0) out.push('없음');
  for (const [u, members] of onlyTheirs) {
    const entry = members.find(p => /SKILL\.md$/.test(p)) ?? members[0];
    out.push(`- ${blob(entry)}${members.length > 1 ? ` 외 ${members.length - 1}개 파일` : ''}`);
  }
  for (const [d, origin] of onlyTheirsDocs) out.push(`- ${blob(d)} — AI 설정 밖 문서 (${origin})`);
  out.push('', '### 양쪽 같은 이름 (내용 비교 필요)', '');
  const both = [...theirsNames].filter(([n]) => mineNames.has(n));
  if (both.length === 0) out.push('없음');
  for (const [n, u] of both) out.push(`- 원본 ${code(u)} ↔ 이 저장소 ${code(mineNames.get(n))}`);
  out.push('', '### 이 저장소에만 있음', '');
  const onlyMine = [...mineNames].filter(([n]) => !theirsNames.has(n)).map(([, u]) => u);
  out.push(onlyMine.length === 0 ? '없음' : onlyMine.map(code).join(', '), '');

  // 3. 규칙 문서 — 절 제목만 뽑는다. 같은 주제인지는 AI 가 이 저장소 프로필의 절 제목과 비교해 판단한다.
  out.push('## 3. 원본 규칙 문서 절 제목', '');
  if (theirs.ruleDocs.length === 0) out.push('없음', '');
  for (const doc of theirs.ruleDocs) {
    out.push(`### ${blob(doc.path)}`, '');
    out.push(...(doc.headings.length === 0 ? ['(제목 없음)'] : doc.headings.map(h => `- ${h.replace(/^#+ /, '')}`)), '');
  }

  // 4. 검사
  out.push('## 4. 검사', '', `### eslint 규칙 — 원본에만 있거나 심각도가 다름 (설정 파일에 직접 적은 것만)`, '');
  const lintRows = [...theirs.lint]
    .filter(([k, v]) => mine.lint.get(k) !== v)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `| ${code(k)} | ${v} | ${mine.lint.get(k) ?? '없음'} |`);
  out.push(...(lintRows.length === 0 ? ['없음'] : ['| 규칙 | 원본 | 이 저장소 |', '|---|---|---|', ...lintRows]), '');
  const onlyFlags = theirs.tsFlags.filter(f => !mine.tsFlags.includes(f));
  out.push('### tsconfig 엄격 옵션 — 원본에만 있음', '', onlyFlags.length === 0 ? '없음' : onlyFlags.map(code).join(', '), '');
  out.push('### 원본 훅', '');
  if (theirs.hooks.length === 0) out.push('없음');
  for (const h of theirs.hooks) out.push(`- ${blob(h.path)}: ${h.commands.map(code).join(' / ') || '(명령 없음)'}`);
  out.push('', '### 원본 CI 실행 명령', '');
  if (theirs.workflows.length === 0) out.push('없음');
  for (const w of theirs.workflows) out.push(`- ${blob(w.path)}: ${w.runs.map(code).join(' / ') || '(run 없음)'}`);
  out.push('');

  // 5. 테스트 기법 사용량
  out.push('## 5. 테스트 기법 사용량 (일치 줄 수)', '', '| 기법 | 원본 | 이 저장소 |', '|---|---|---|');
  for (const t of TECHNIQUES) out.push(`| ${t.desc} (${code(t.key)}) | ${theirs.techniques[t.key]} | ${mine.techniques[t.key]} |`);
  out.push('');

  // 6. 의존성 — 원본에만 있는 것. 프레임워크가 다르면 대부분 그 생태계 패키지라 AI 가 거른다.
  const onlyDeps = Object.keys(theirs.deps)
    .filter(p => !(p in mine.deps))
    .sort();
  out.push(`## 6. 원본에만 있는 의존성 (${onlyDeps.length}개)`, '');
  out.push(onlyDeps.length === 0 ? '없음' : onlyDeps.map(p => `${code(p)} ${theirs.deps[p]}`).join(', '), '');
  return out;
};

// ---------------------------------------------------------------- 실행

const args = process.argv.slice(2);
const opt = name => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};

/**
 * NOTE:
 * config.json 은 「이 저장소의 성격」을 적는 커밋 대상 설정이다. 개인 설정(.env)과 달리 팀이 같은 값을 쓴다.
 *   skillPaths  AI 설정 위치 밖에 둔 스킬·가이드 원본의 경로 패턴 (예: ["docs/*-guide.md"])
 * 파일이 없으면 빈 설정으로 본다.
 */
const readConfig = () => {
  if (!fs.existsSync(CONFIG_FILE)) return { skillPaths: [] };
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (e) {
    fail(`${path.relative(ROOT, CONFIG_FILE)} 을 JSON 으로 읽을 수 없다: ${e.message}`);
  }
  const skillPaths = raw.skillPaths ?? [];
  if (!Array.isArray(skillPaths) || !skillPaths.every(v => typeof v === 'string' && v !== '')) {
    fail(`${path.relative(ROOT, CONFIG_FILE)} 의 skillPaths 는 경로 패턴 문자열 배열이어야 한다.`);
  }
  return { skillPaths };
};

// .env 는 KEY=VALUE 몇 줄뿐이라 dotenv 를 들이지 않고 직접 읽는다. 셸 환경변수가 있으면 그쪽이 우선한다.
const readEnv = () => {
  if (!fs.existsSync(ENV_FILE)) fail(`${path.relative(ROOT, ENV_FILE)} 이 없다. .env.example 을 복사해 만든다.`);
  const env = {};
  for (const raw of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const line = raw.trim();
    const eq = line.indexOf('=');
    if (line === '' || line.startsWith('#') || eq < 1) continue;
    env[line.slice(0, eq).trim()] = line
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
  }
  return { ...env, ...process.env };
};

// git@github.com:org/Repo.git 또는 https://github.com/org/Repo(.git) → 키·웹 주소
const toSource = entry => {
  const [url, branch = null] = entry.split('#');
  const m = url.match(/github\.com[:/]([^/]+)\/([^/]+?)(\.git)?$/);
  if (m === null) fail(`GitHub 저장소 주소로 읽을 수 없다: ${url} — 지금은 GitHub 저장소만 지원한다.`);
  return { key: m[2].toLowerCase(), url, branch, slug: `${m[1]}/${m[2]}`, web: `https://github.com/${m[1]}/${m[2]}` };
};

const USAGE = '사용법: node .borrow-practice/scan.mjs [--source KEY] | --commit-state | profile';

if (args[0] === 'profile') {
  writeProfile();
  process.exit(0);
}
if (args[0] !== undefined && !args[0].startsWith('--')) fail(USAGE);

const env = readEnv();
const sources = (env.BORROW_SOURCES ?? '')
  .split(',')
  .map(v => v.trim())
  .filter(Boolean)
  .map(toSource);
if (sources.length === 0) fail('BORROW_SOURCES 가 비어 있다.');
const state = readJson(STATE_FILE, {});

if (args.includes('--commit-state')) {
  const pending = readJson(PENDING_FILE, {});
  if (Object.keys(pending).length === 0) fail('반영할 분석 결과가 없다. 먼저 분석을 돌린다.');
  // 이전 버전의 .pending.json 은 키 → sha 문자열이다
  const entries = Object.entries(pending).map(([key, v]) => [key, typeof v === 'string' ? { sha: v, branch: null } : v]);
  for (const [key, { sha, branch }] of entries) {
    state[key] = { ...state[key], last_sha: sha, ...(branch === null ? {} : { branch }), analyzed_at: today };
  }
  fs.writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
  fs.rmSync(PENDING_FILE);
  console.log(
    `state.json 갱신: ${entries
      .map(([k, v]) => `${k}=${v.sha.slice(0, 8)}${v.branch === null ? '' : ` (${v.branch})`}`)
      .join(', ')}`,
  );
  process.exit(0);
}

const only = opt('--source');
if (only !== undefined && !sources.some(s => s.key === only)) {
  fail(`--source ${only} 는 BORROW_SOURCES 에 없다. 있는 키: ${sources.map(s => s.key).join(', ')}`);
}

/**
 * NOTE:
 * 소스마다 분석 방식을 state.json 으로 정한다. 마지막 분석 지점이 없으면 전체 비교, 있으면 그 지점부터 최신까지.
 * 보는 브랜치가 바뀌었거나, 지점이 사라졌거나(강제 push), 지점이 지금 브랜치 이력 밖이면 이어 볼 기준이 없으므로
 * 전체 비교로 돌아간다. 브랜치를 기록하는 이유: 기본 브랜치를 자동으로 보는 소스는 원본 설정만으로 브랜치가 바뀔 수 있다.
 * 처음부터 다시 보고 싶으면 state.json(또는 그 소스 항목)을 지운다.
 */
writeProfile();
const pending = {};
for (const src of sources.filter(s => only === undefined || s.key === only)) {
  const repo = ensureClone(src);
  const head = git(repo, ['rev-parse', `origin/${src.branch}`]).trim();
  const last = state[src.key]?.last_sha ?? null;
  // 브랜치 기록이 없는 항목(이전 버전)은 지점이 이력 안에 있는지만 본다
  const lastBranch = state[src.key]?.branch ?? null;
  let fallback = null;
  if (last !== null) {
    if (lastBranch !== null && lastBranch !== src.branch) {
      fallback = `보는 브랜치가 \`${lastBranch}\` 에서 \`${src.branch}\` 로 바뀌어 전체 비교로 돌아갔다`;
    } else if (git(repo, ['cat-file', '-t', last], { check: false }).trim() !== 'commit') {
      fallback = `마지막 분석 지점 \`${last.slice(0, 8)}\` 이 원본에 없어(강제 push 등) 전체 비교로 돌아갔다`;
    } else if (spawnSync('git', ['-C', repo, 'merge-base', '--is-ancestor', last, head]).status !== 0) {
      fallback = `마지막 분석 지점 \`${last.slice(0, 8)}\` 이 \`origin/${src.branch}\` 이력에 없어(브랜치 변경·강제 push 등) 전체 비교로 돌아갔다`;
    }
  }
  if (last !== null && fallback === null) {
    writeSignal(`${today}-diff-${src.key}.md`, diff(src, repo, head, last));
  } else {
    writeSignal(`${today}-snapshot-${src.key}.md`, snapshot(src, repo, head, fallback ?? '첫 분석이라 전체 비교'));
  }
  pending[src.key] = { sha: head, branch: src.branch };
}
fs.writeFileSync(PENDING_FILE, JSON.stringify(pending));
