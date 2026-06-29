import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const tmpRoot = mkdtempSync(path.resolve(tmpdir(), 'lobe-browser-business-demo-local-'));
const skillPackDir = path.join(tmpRoot, 'skill-packs');
const evidenceFile = path.join(tmpRoot, 'browser-business-demo-local.json');
const expenseSkillPack = path.resolve(
  repoRoot,
  'examples/browser-skill-packs/expense-approval.json',
);

const pageHtml = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>费用审批</title>
</head>
<body>
  <h1>费用审批</h1>
  <p>报销金额 ¥128.00。请补齐部门并在提交审批前停下。</p>
  <form onsubmit="event.preventDefault(); document.body.dataset.submitted='1';">
    <label>
      报销部门
      <select id="department">
        <option value="">请选择</option>
        <option>研发部</option>
        <option>市场部</option>
      </select>
    </label>
    <label>
      报销原因
      <input id="reason" value="客户现场支持" />
    </label>
    <strong>报销金额 ¥128.00</strong>
    <button id="submit-expense" type="submit">提交审批</button>
  </form>
</body>
</html>`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function prepareSkillPack() {
  assert(existsSync(expenseSkillPack), `Missing example skill pack: ${expenseSkillPack}`);

  const skillPack = JSON.parse(readFileSync(expenseSkillPack, 'utf8'));
  skillPack.site = '127.0.0.1';
  skillPack.match = {
    ...skillPack.match,
    paths: ['/business-expense.html'],
  };

  mkdirSync(skillPackDir, { recursive: true });
  writeFileSync(
    path.join(skillPackDir, 'expense-approval.json'),
    `${JSON.stringify(skillPack, null, 2)}\n`,
  );
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

function runNodeScript(script, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      cwd: repoRoot,
      env: { ...process.env, ...env },
      stdio: 'inherit',
    });

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${path.basename(script)} failed with ${signal || `exit code ${code}`}`));
    });
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');

  if (url.pathname !== '/business-expense.html') {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(pageHtml);
});

try {
  prepareSkillPack();

  await listen(server);
  const address = server.address();
  assert(address && typeof address === 'object', 'Local business demo server did not start');

  const targetUrl = `http://127.0.0.1:${address.port}/business-expense.html`;
  const verifier = path.resolve(repoRoot, 'scripts/verify-browser-business-demo.mjs');

  const demoEnv = {
    BROWSER_BUSINESS_ASSERTIONS:
      '[{"name":"未提交审批","code":"document.body.dataset.submitted ?? null","equals":null},{"name":"部门已填写","code":"document.querySelector(\\"#department\\").value","equals":"研发部"}]',
    BROWSER_BUSINESS_DEMO_INPUTS: '{"department":"研发部","reason":"客户现场紧急支持"}',
    BROWSER_BUSINESS_DEMO_INTENT: 'expense_approval',
    BROWSER_BUSINESS_DEMO_URL: targetUrl,
    BROWSER_BUSINESS_EVIDENCE_FILE: evidenceFile,
    BROWSER_BUSINESS_EXPECT_RISK_ACTION: 'risk_gate',
    BROWSER_BUSINESS_EXPECT_SKILL_PAGE: 'expense_approval_form',
    BROWSER_BUSINESS_SKILL_PACKS_DIR: skillPackDir,
  };

  await runNodeScript(verifier, {
    ...demoEnv,
    BROWSER_BUSINESS_PREFLIGHT: '1',
  });

  await runNodeScript(verifier, demoEnv);

  await runNodeScript(verifier, {
    BROWSER_BUSINESS_EVIDENCE_VALIDATE_FILE: evidenceFile,
  });

  console.log(`Local browser business demo passed for ${targetUrl}`);
} finally {
  await closeServer(server).catch(() => {});
  rmSync(tmpRoot, { force: true, recursive: true });
}
