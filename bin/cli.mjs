#!/usr/bin/env node
/**
 * NOTE:
 * borrow-practice 설치 명령. 도구 파일만 다룬다 — 분석 데이터(state·decisions·.env 등)는 설치된 scan.mjs 만 다룬다.
 * CLI(npx 로 받은 버전)와 설치본의 버전이 다를 수 있어, 데이터 형식을 아는 설치본에 맡긴다.
 *
 * 사용법
 *   npx borrow-practice init          # 없으면 설치, 있으면 도구 파일만 이 버전으로 다시 깐다
 *   npx borrow-practice init --yes    # 고친 도구 파일이 있어도 묻지 않고 덮어쓴다
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const PKG_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TEMPLATE_DIR = path.join(PKG_DIR, 'template');
const { version: VERSION } = JSON.parse(fs.readFileSync(path.join(PKG_DIR, 'package.json'), 'utf8'));

const TOOL_DIR_NAME = '.borrow-practice';
// init 이 다시 깔 때마다 이 버전으로 바뀌는 파일
const TOOL_FILES = ['README.md', 'run.md', 'common.md', 'scan.mjs', '.env.example'];
// 처음에만 만들고 이후로는 건드리지 않는 파일 — 사용자가 고치라고 안내하는 파일이다. 설치 이름 → 템플릿 이름
// NOTE: npm 은 패키지에 .gitignore 를 넣지 않아 템플릿에는 점 없이 둔다.
const USER_FILES = { '.gitignore': 'gitignore' };
// 설치한 버전과 파일 해시. 다음 init 때 「사용자가 고친 파일」을 가려낸다
const MANIFEST = 'tool.json';

const fail = msg => {
  console.error(`borrow-practice: ${msg}`);
  process.exit(1);
};

const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

// 0.10.0 > 0.9.0 처럼 숫자로 비교한다. 사전 릴리스 꼬리는 보지 않는다
const compareVersion = (a, b) => {
  const pa = a.split(/[.-]/).map(Number);
  const pb = b.split(/[.-]/).map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
};

const gitRoot = () => {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    fail('git 저장소 안에서 실행한다. 도구는 그 저장소의 커밋을 읽어 분석한다.');
  }
};

const readManifest = toolDir => {
  const file = path.join(toolDir, MANIFEST);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    fail(`${TOOL_DIR_NAME}/${MANIFEST} 을 JSON 으로 읽을 수 없다. 지우고 다시 실행하면 모든 도구 파일을 고친 것으로 보고 확인을 받는다.`);
  }
};

const confirm = async question => {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^y(es)?$/i.test((await rl.question(`${question} [y/N] `)).trim());
  } catch (error) {
    // Ctrl+D·Ctrl+C 로 끊으면 「아니오」로 본다
    if (error.code === 'ABORT_ERR') return false;
    throw error;
  } finally {
    rl.close();
  }
};

const init = async ({ yes }) => {
  const root = gitRoot();
  const toolDir = path.join(root, TOOL_DIR_NAME);
  const fresh = !fs.existsSync(toolDir);
  const manifest = fresh ? null : readManifest(toolDir);

  if (manifest && compareVersion(manifest.version, VERSION) > 0) {
    fail(
      `설치된 도구(${manifest.version})가 실행한 패키지(${VERSION})보다 새 버전이다. ` +
        '`npx borrow-practice@latest init` 으로 실행한다.',
    );
  }

  // 사용자가 고친 파일: 기록된 해시와 다른 것. 기록이 없으면(이전 방식 설치) 새 버전과 다른 파일을 모두 고친 것으로 본다
  const modified = fresh
    ? []
    : TOOL_FILES.filter(name => {
        const file = path.join(toolDir, name);
        if (!fs.existsSync(file)) return false;
        const current = sha256(file);
        const recorded = manifest?.files?.[name];
        return recorded ? current !== recorded : current !== sha256(path.join(TEMPLATE_DIR, name));
      });

  if (modified.length > 0 && !yes) {
    const list = modified.map(name => `  - ${TOOL_DIR_NAME}/${name}`).join('\n');
    const why = manifest ? '설치 후 바뀌었다' : `${VERSION} 버전과 다르다 (설치 기록 ${MANIFEST} 이 없어 직접 고쳤는지 알 수 없다)`;
    console.log(`아래 도구 파일이 ${why}. 계속하면 ${VERSION} 버전으로 덮어써 그 변경이 사라진다.\n${list}`);
    if (!process.stdin.isTTY) fail('확인을 받을 수 없는 환경이다. 덮어써도 되면 --yes 를 붙인다.');
    if (!(await confirm('덮어쓸까요?'))) fail('멈췄다. 아무것도 바꾸지 않았다.');
  }

  fs.mkdirSync(toolDir, { recursive: true });
  const changes = [];
  const files = {};
  for (const name of TOOL_FILES) {
    const src = path.join(TEMPLATE_DIR, name);
    const dest = path.join(toolDir, name);
    const existed = fs.existsSync(dest);
    files[name] = sha256(src);
    if (existed && sha256(dest) === files[name]) continue;
    fs.copyFileSync(src, dest);
    changes.push(`${existed ? '갱신' : '생성'} ${TOOL_DIR_NAME}/${name}`);
  }
  for (const [name, templateName] of Object.entries(USER_FILES)) {
    const dest = path.join(toolDir, name);
    if (fs.existsSync(dest)) continue;
    fs.copyFileSync(path.join(TEMPLATE_DIR, templateName), dest);
    changes.push(`생성 ${TOOL_DIR_NAME}/${name}`);
  }
  fs.writeFileSync(path.join(toolDir, MANIFEST), `${JSON.stringify({ version: VERSION, files }, null, 2)}\n`);

  const from = manifest ? `${manifest.version} → ` : '';
  console.log(`borrow-practice ${from}${VERSION} ${fresh ? '설치' : '다시 깔기'} 완료 (${path.relative(process.cwd(), toolDir) || '.'})`);
  console.log(changes.length > 0 ? changes.map(c => `  ${c}`).join('\n') : '  바뀐 도구 파일 없음');
  if (!fs.existsSync(path.join(toolDir, '.env'))) {
    console.log(`\n다음 단계\n  1. ${TOOL_DIR_NAME}/.env.example 을 .env 로 복사해 볼 저장소를 적는다 (${TOOL_DIR_NAME}/README.md 「설정」)`);
    console.log(`  2. AI 에게: 「${TOOL_DIR_NAME}/run.md 읽고 진행해줘」`);
  }
};

const USAGE = `사용법: npx borrow-practice init [--yes]

  init     없으면 설치하고, 있으면 도구 파일만 이 버전으로 다시 깐다.
           분석 기록과 설정(decisions·state·config·.env·.gitignore 등)은 그대로 둔다.
  --yes    고친 도구 파일이 있어도 묻지 않고 덮어쓴다.`;

const [command, ...rest] = process.argv.slice(2);
const unknown = rest.filter(arg => arg !== '--yes');
if (command === undefined || command === '-h' || command === '--help') {
  console.log(USAGE);
} else if (command !== 'init') {
  fail(`알 수 없는 명령: ${command}\n\n${USAGE}`);
} else if (unknown.length > 0) {
  fail(`알 수 없는 옵션: ${unknown.join(' ')}\n\n${USAGE}`);
} else {
  await init({ yes: rest.includes('--yes') });
}
