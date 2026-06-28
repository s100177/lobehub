import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const browserPort = Number.parseInt(process.env.BROWSER_AGENT_VERIFY_PORT || '3320', 10);
const pagePort = Number.parseInt(process.env.BROWSER_AGENT_VERIFY_PAGE_PORT || '4330', 10);
const browserOrigin = `http://127.0.0.1:${browserPort}`;
const pageOrigin = `http://127.0.0.1:${pagePort}`;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inRepoServiceDir = path.resolve(repoRoot, 'browser-service');
const deployedServiceDir = path.resolve(repoRoot, '..', 'browser-service');
const browserServiceDir = process.env.BROWSER_SERVICE_DIR || inRepoServiceDir;
const playwrightResolveDir = existsSync(path.resolve(inRepoServiceDir, 'node_modules'))
  ? inRepoServiceDir
  : deployedServiceDir;
const dependencyServiceDir = existsSync(path.resolve(browserServiceDir, 'node_modules'))
  ? browserServiceDir
  : deployedServiceDir;
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve('playwright', { paths: [playwrightResolveDir] }));
let browserServiceRuntimeDir;

const html = (title, body) => `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body {
      margin: 0;
      padding: 32px;
      background: #f8fafc;
      color: #0f172a;
      font-family: sans-serif;
    }
    main {
      display: grid;
      gap: 18px;
      max-width: 960px;
    }
    section {
      display: grid;
      gap: 10px;
      padding: 18px;
      border: 1px solid #cbd5e1;
      border-radius: 16px;
      background: white;
    }
    button,
    input,
    select {
      width: max-content;
      min-width: 180px;
      padding: 10px 12px;
      border: 1px solid #94a3b8;
      border-radius: 10px;
      font: inherit;
    }
    button {
      cursor: pointer;
      background: #0f172a;
      color: white;
    }
    .risk {
      background: #b91c1c;
    }
    .selected {
      border-color: #0284c7;
      color: #075985;
      background: #e0f2fe;
    }
  </style>
</head>
<body>
  <main>${body}</main>
</body>
</html>`;

const pages = {
  '/kiki-cloud-buy': html(
    'KiKi Cloud Buy',
    `<h1>云服务器购买</h1>
    <p>场景：个人建站。请根据预算读取配置并停在提交订单前。</p>
    <section>
      <h2>地域选择</h2>
      <button class="selected" id="region-nanjing">南京</button>
      <button id="region-shanghai">上海</button>
    </section>
    <section>
      <h2>实例规格</h2>
      <label>实例规格 <select id="instance"><option>2核4GB</option><option>4核8GB</option></select></label>
      <strong id="price">配置费用 ¥114.36 / 月</strong>
      <button class="risk" id="buy" onclick="document.body.dataset.purchased='1'">立即购买</button>
    </section>`,
  ),
  '/kiki-cloud-buy-ambiguous': html(
    'KiKi Cloud Buy Ambiguous',
    `<h1>云服务器购买</h1>
    <p>多个地域都满足要求，请选择其中一个。预算缺少，需要补充。</p>
    <section>
      <label>地域 <select id="region"><option value="">请选择</option><option>上海</option><option>南京</option></select></label>
      <label>预算 <input id="budget" placeholder="请填写预算" /></label>
      <button id="recommend">生成推荐</button>
    </section>`,
  ),
  '/kiki-cloud-buy-risk': html(
    'KiKi Cloud Buy Risk',
    `<h1>订单确认</h1>
    <p>请确认配置、费用和风险动作。提交订单、去支付、删除资源、释放资源、授权都需要确认。</p>
    <section>
      <strong>配置费用 ¥228.00 / 月</strong>
      <button class="risk" id="submit-order" onclick="document.body.dataset.submitted='1'">提交订单</button>
      <button class="risk" id="pay" onclick="document.body.dataset.paid='1'">去支付</button>
      <button class="risk" id="delete" onclick="document.body.dataset.deleted='1'">删除资源</button>
      <button class="risk" id="release" onclick="document.body.dataset.released='1'">释放资源</button>
      <button class="risk" id="authorize" onclick="document.body.dataset.authorized='1'">授权</button>
    </section>`,
  ),
  '/kiki-cloud-buy-login': html(
    'KiKi Login',
    `<h1>请先登录</h1>
    <p>未登录，登录后继续当前任务。验证码和账号密码由用户手动完成。</p>
    <section>
      <label>账号密码 <input id="account" placeholder="账号密码" /></label>
      <label>验证码 <input id="captcha" placeholder="验证码" /></label>
      <button id="login">登录</button>
    </section>`,
  ),
  '/kiki-search': html(
    'KiKi Search',
    `<h1>搜索</h1>
    <p>查询结果页面。先输入搜索词，再提交搜索。</p>
    <form onsubmit="event.preventDefault(); document.body.dataset.query=document.querySelector('#kw').value;">
      <label>搜索 <input id="kw" name="wd" placeholder="请输入搜索词" /></label>
      <button id="search" type="submit">搜索</button>
    </form>`,
  ),
};

const testPageServer = http.createServer((req, res) => {
  const url = new URL(req.url || '/', pageOrigin);
  if (url.pathname === '/viewer-wrapper') {
    const session = url.searchParams.get('session') || 'verify-agent-viewer';
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html>
      <meta charset="utf-8" />
      <title>Viewer Wrapper</title>
      <script>
        window.browserMessages = [];
        window.addEventListener('message', (event) => {
          if (event.data?.source === 'lobe-browser-viewer') {
            window.browserMessages.push(event.data);
            document.body.dataset.lastInput = event.data.inputType;
          }
        });
      </script>
      <iframe id="viewer" src="${browserOrigin}/viewer?session=${encodeURIComponent(
        session,
      )}&basePath=/" style="width: 900px; height: 700px; border: 0"></iframe>`);
    return;
  }

  const page = pages[url.pathname];
  if (!page) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(page);
});

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

function waitForProcessExit(child, timeout = 5000) {
  if (child.exitCode !== null || child.signalCode) return Promise.resolve();

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, timeout);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function request(path, body, sessionId = 'verify-agent') {
  const response = await fetch(`${browserOrigin}${path}`, {
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      'X-Session-ID': sessionId,
    },
    method: 'POST',
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`${path} failed: ${response.status} ${JSON.stringify(data)}`);
  }

  return data;
}

async function waitForBrowserService() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const response = await fetch(`${browserOrigin}/status`);
      if (response.ok) return;
    } catch {
      // Service is still starting.
    }
    await delay(500);
  }

  throw new Error('Browser service did not become ready');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertTargetHighlight(target, labelPattern, context) {
  assert(target, `Expected ${context} target highlight`);
  assert(
    Number.isFinite(target.x) &&
      Number.isFinite(target.y) &&
      Number.isFinite(target.width) &&
      Number.isFinite(target.height),
    `Expected ${context} target bbox, got ${JSON.stringify(target)}`,
  );
  assert(target.width > 0 && target.height > 0, `Expected ${context} positive bbox dimensions`);
  assert(target.selector, `Expected ${context} selector, got ${JSON.stringify(target)}`);
  assert(
    labelPattern.test(target.label || target.selector || ''),
    `Expected ${context} label to match ${labelPattern}, got ${JSON.stringify(target)}`,
  );
}

async function assertRemoteViewerPostsUserInput() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { height: 760, width: 960 } });
    await page.goto(`${pageOrigin}/viewer-wrapper?session=verify-agent-viewer`, {
      waitUntil: 'domcontentloaded',
    });
    const frame = page.frameLocator('#viewer');
    await frame.locator('#screen').waitFor({ state: 'visible', timeout: 10_000 });
    await page.waitForFunction(() => {
      const frameElement = document.querySelector('#viewer');
      return frameElement instanceof HTMLIFrameElement;
    });

    const box = await page.locator('#viewer').boundingBox();
    assert(box, 'Expected viewer iframe to be visible');
    await page.mouse.click(box.x + 80, box.y + 120);

    await page.waitForFunction(() => document.body.dataset.lastInput === 'click', {
      timeout: 5000,
    });
    const messages = await page.evaluate(() => window.browserMessages);
    assert(
      messages.some(
        (message) =>
          message.source === 'lobe-browser-viewer' &&
          message.type === 'user-input' &&
          message.inputType === 'click' &&
          message.sessionId === 'verify-agent-viewer',
      ),
      `Expected remote viewer to post user-input message, got ${JSON.stringify(messages)}`,
    );
  } finally {
    await browser.close();
  }
}

const browserService = spawn(process.execPath, ['index.js'], {
  cwd: createBrowserServiceRuntimeDir(),
  env: { ...process.env, PORT: String(browserPort) },
  stdio: ['ignore', 'pipe', 'pipe'],
});

browserService.stdout.on('data', (chunk) => process.stdout.write(`[browser-service] ${chunk}`));
browserService.stderr.on('data', (chunk) => process.stderr.write(`[browser-service] ${chunk}`));

try {
  await listen(testPageServer, pagePort);
  await waitForBrowserService();

  const buy = await request(
    '/navigate',
    { mode: 'remote', url: `${pageOrigin}/kiki-cloud-buy` },
    'verify-agent-buy',
  );
  assert(buy.mode === 'remote', `Expected remote mode, got ${buy.mode}`);
  assert(
    buy.taskState === 'waiting_user_authorization',
    `Expected authorization task state, got ${buy.taskState}`,
  );
  assert(
    buy.pageState?.pageType === 'purchase',
    `Expected purchase page, got ${buy.pageState?.pageType}`,
  );
  assert(buy.pageState?.confirmBeforeProceed === true, 'Expected confirmBeforeProceed=true');
  assert(
    buy.pageState?.workflowHints?.includes('读取配置并停在确认前'),
    `Expected purchase workflow hint, got ${JSON.stringify(buy.pageState?.workflowHints)}`,
  );
  assert(
    buy.pageState?.prices?.some((price) => price.value.includes('¥114.36')),
    `Expected price extraction, got ${JSON.stringify(buy.pageState?.prices)}`,
  );
  assert(
    buy.skillPack?.page === 'cloud_buy',
    `Expected cloud_buy skill pack, got ${JSON.stringify(buy.skillPack)}`,
  );
  assert(
    buy.plan?.source === 'skill_pack' && buy.plan.intent === 'cloud_server_purchase',
    `Expected skill-pack workflow plan, got ${JSON.stringify(buy.plan)}`,
  );
  assert(
    buy.plan?.steps?.some((step) => step.type === 'risk_gate' && step.status === 'blocked'),
    `Expected blocked risk gate in plan, got ${JSON.stringify(buy.plan?.steps)}`,
  );
  assertTargetHighlight(buy.pageState?.targetHighlight, /购买|提交|支付|风险/, 'cloud buy');

  const ambiguous = await request(
    '/navigate',
    { mode: 'remote', url: `${pageOrigin}/kiki-cloud-buy-ambiguous` },
    'verify-agent-ambiguous',
  );
  assert(
    ambiguous.taskState === 'asking_clarification',
    `Expected clarification task state, got ${ambiguous.taskState}`,
  );
  assert(
    ambiguous.pageState?.gaps?.includes('missing_field_values'),
    `Expected missing field gap, got ${JSON.stringify(ambiguous.pageState?.gaps)}`,
  );

  const login = await request(
    '/navigate',
    { mode: 'remote', url: `${pageOrigin}/kiki-cloud-buy-login` },
    'verify-agent-login',
  );
  assert(login.taskState === 'needs_more_info', `Expected login gap state, got ${login.taskState}`);
  assert(
    login.pageState?.gaps?.includes('login_required'),
    `Expected login_required gap, got ${JSON.stringify(login.pageState?.gaps)}`,
  );

  await request(
    '/navigate',
    { mode: 'remote', url: `${pageOrigin}/kiki-cloud-buy-risk` },
    'verify-agent-risk',
  );
  for (const [selector, datasetKey, expectedRisk] of [
    ['#submit-order', 'submitted', 'purchase'],
    ['#pay', 'paid', 'purchase'],
    ['#delete', 'deleted', 'delete'],
    ['#release', 'released', 'delete'],
    ['#authorize', 'authorized', 'authorization'],
  ]) {
    const blocked = await request('/click', { selector }, 'verify-agent-risk');
    assert(blocked.blocked === true, `Expected ${selector} to be blocked`);
    assert(
      blocked.riskBlock?.risk === expectedRisk,
      `Expected ${selector} risk ${expectedRisk}, got ${JSON.stringify(blocked.riskBlock)}`,
    );
    const flag = await request(
      '/evaluate',
      { code: `document.body.dataset.${datasetKey}` },
      'verify-agent-risk',
    );
    assert(flag.result === undefined, `Expected ${selector} not to execute, got ${flag.result}`);
  }

  const search = await request(
    '/navigate',
    { mode: 'remote', url: `${pageOrigin}/kiki-search` },
    'verify-agent-search',
  );
  assert(
    search.taskState === 'understanding',
    `Expected search understanding, got ${search.taskState}`,
  );
  assert(
    search.skillPack?.page === 'search' && search.plan?.intent === 'search_web',
    `Expected search skill-pack workflow plan, got ${JSON.stringify({
      plan: search.plan,
      skillPack: search.skillPack,
    })}`,
  );
  assertTargetHighlight(search.pageState?.targetHighlight, /搜索|查询/, 'search page');
  await request('/fill', { selector: '#kw', text: '复星医药' }, 'verify-agent-search');
  await request('/submit', { selector: '#kw' }, 'verify-agent-search');
  const query = await request(
    '/evaluate',
    { code: 'document.body.dataset.query' },
    'verify-agent-search',
  );
  assert(query.result === '复星医药', `Expected submitted query, got ${query.result}`);

  await request(
    '/navigate',
    { mode: 'remote', url: `${pageOrigin}/kiki-cloud-buy` },
    'verify-agent-viewer',
  );
  await assertRemoteViewerPostsUserInput();

  console.log('Browser agent product verification passed');
} finally {
  browserService.kill('SIGTERM');
  await waitForProcessExit(browserService);
  await closeServer(testPageServer).catch(() => {});
  cleanupBrowserServiceRuntimeDir();
}

function createBrowserServiceRuntimeDir() {
  if (existsSync(path.resolve(browserServiceDir, 'node_modules'))) return browserServiceDir;

  browserServiceRuntimeDir = mkdtempSync(path.resolve(tmpdir(), 'lobe-browser-service-'));
  cpSync(
    path.resolve(browserServiceDir, 'index.js'),
    path.resolve(browserServiceRuntimeDir, 'index.js'),
  );
  cpSync(
    path.resolve(browserServiceDir, 'package.json'),
    path.resolve(browserServiceRuntimeDir, 'package.json'),
  );
  symlinkSync(
    path.resolve(dependencyServiceDir, 'node_modules'),
    path.resolve(browserServiceRuntimeDir, 'node_modules'),
    'dir',
  );

  return browserServiceRuntimeDir;
}

function cleanupBrowserServiceRuntimeDir() {
  if (!browserServiceRuntimeDir) return;
  rmSync(browserServiceRuntimeDir, { force: true, recursive: true });
}
