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
const expenseSkillPackExample = path.resolve(
  repoRoot,
  'examples/browser-skill-packs/expense-approval.json',
);
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
const skillPacksDir = mkdtempSync(path.resolve(tmpdir(), 'lobe-browser-skill-packs-'));
cpSync(expenseSkillPackExample, path.join(skillPacksDir, 'expense-approval.json'));

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
  '/popup-destination': html(
    '体育新闻',
    `<h1 id="headline">体育新闻详情</h1>
    <p>这个页面模拟新闻站点通过 target=_blank 或 window.open 打开的详情页。</p>`,
  ),
  '/popup-link': html(
    '新闻首页',
    `<h1>新闻首页</h1>
    <section>
      <a id="sports-link" href="/popup-destination" target="_blank">体育新闻</a>
      <button id="window-open" onclick="window.open('/popup-destination', '_blank')">
        打开体育新闻
      </button>
    </section>`,
  ),
  '/business-expense': html(
    '费用审批',
    `<h1>费用审批</h1>
    <p>报销金额 ¥128.00。请补齐部门并在提交审批前停下。</p>
    <form onsubmit="event.preventDefault(); document.body.dataset.submitted='1';">
      <label>报销部门 <select id="department"><option value="">请选择</option><option>研发部</option><option>市场部</option></select></label>
      <label>报销原因 <input id="reason" value="客户现场支持" /></label>
      <strong>报销金额 ¥128.00</strong>
      <button class="risk" id="submit-expense" type="submit">提交审批</button>
    </form>`,
  ),
};

const testPageServer = http.createServer((req, res) => {
  const url = new URL(req.url || '/', pageOrigin);
  if (url.pathname === '/viewer-wrapper') {
    const session = url.searchParams.get('session') || 'verify-agent-viewer';
    const takeover = url.searchParams.get('takeover') === '1' ? '&takeover=1' : '';
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
      )}&basePath=/${takeover}" style="width: 900px; height: 700px; border: 0"></iframe>`);
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
    await page.goto(`${pageOrigin}/viewer-wrapper?session=verify-agent-viewer&takeover=1`, {
      waitUntil: 'domcontentloaded',
    });
    const frame = page.frameLocator('#viewer');
    await frame.locator('#screen').waitFor({ state: 'visible', timeout: 10_000 });
    await frame.getByLabel('AI takeover frame').waitFor({ state: 'visible', timeout: 10_000 });
    await frame.getByLabel('AI target highlight').waitFor({ state: 'visible', timeout: 10_000 });
    const targetBox = await frame.getByLabel('AI target highlight').boundingBox();
    assert(
      targetBox && targetBox.width > 0 && targetBox.height > 0,
      `Expected visible remote target highlight, got ${JSON.stringify(targetBox)}`,
    );
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

async function assertRemoteViewerPreservesKeyboardOrder() {
  const sessionId = 'verify-agent-viewer-keyboard';
  await request('/navigate', { mode: 'remote', url: `${pageOrigin}/kiki-search` }, sessionId);
  const field = await request(
    '/evaluate',
    {
      code: `(() => {
        const rect = document.querySelector('#kw').getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      })()`,
    },
    sessionId,
  );

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { height: 760, width: 960 } });
    await page.goto(`${pageOrigin}/viewer-wrapper?session=${sessionId}`, {
      waitUntil: 'domcontentloaded',
    });
    const screen = page.frameLocator('#viewer').locator('#screen');
    await screen.waitFor({ state: 'visible', timeout: 10_000 });
    await page
      .frameLocator('#viewer')
      .locator('#status')
      .filter({ hasText: 'live' })
      .waitFor({ timeout: 10_000 });
    const screenBox = await screen.boundingBox();
    assert(screenBox, 'Expected remote viewer canvas bounds');
    await screen.click({
      position: {
        x: (field.result.x / 1280) * screenBox.width,
        y: (field.result.y / 800) * screenBox.height,
      },
    });
    await page.keyboard.press('Control+A');
    await page.keyboard.type('MANUAL_REMOTE_OK');

    let value;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      value = (
        await request('/evaluate', { code: "document.querySelector('#kw').value" }, sessionId)
      ).result;
      if (value === 'MANUAL_REMOTE_OK') break;
      await delay(100);
    }

    assert(value === 'MANUAL_REMOTE_OK', `Expected ordered remote typing, got ${value}`);

    const inspected = await request('/inspect', {}, sessionId);
    const interruptionCount =
      inspected.executionTimeline?.filter((event) => event.action === 'interrupt').length || 0;
    assert(
      interruptionCount === 1,
      `Expected one intervention event for a typing burst, got ${interruptionCount}`,
    );
  } finally {
    await browser.close();
  }
}

async function assertServerRecordsUserIntervention() {
  await request(
    '/navigate',
    { mode: 'remote', url: `${pageOrigin}/business-expense` },
    'verify-agent-interrupt',
  );
  await request(
    '/execute-plan',
    {
      authorized: true,
      inputs: { department: '研发部', reason: '客户现场紧急支持' },
      maxSteps: 2,
    },
    'verify-agent-interrupt',
  );

  const interrupted = await request(
    '/interrupt',
    { inputType: 'click', reason: 'Manual click during takeover' },
    'verify-agent-interrupt',
  );
  assert(
    interrupted.taskState === 'paused_by_user_intervention',
    `Expected interrupted task state, got ${interrupted.taskState}`,
  );
  assert(
    interrupted.executionState?.phase === 'paused_by_user_intervention',
    `Expected paused_by_user_intervention phase, got ${JSON.stringify(interrupted.executionState)}`,
  );
  assert(
    interrupted.executionEvents?.some(
      (event) =>
        event.action === 'interrupt' &&
        event.status === 'blocked' &&
        /Manual click during takeover/.test(event.summary),
    ),
    `Expected interrupt execution event, got ${JSON.stringify(interrupted.executionEvents)}`,
  );
  assert(
    interrupted.executionTimeline?.some(
      (event) => event.action === 'interrupt' && /Manual click/.test(event.summary),
    ),
    `Expected persisted interrupt timeline, got ${JSON.stringify(interrupted.executionTimeline)}`,
  );

  const inputInterrupted = await request(
    '/input',
    { type: 'click', x: 40, y: 40 },
    'verify-agent-interrupt',
  );
  assert(
    inputInterrupted.executionState?.phase === 'paused_by_user_intervention' &&
      inputInterrupted.executionTimeline?.some(
        (event) => event.action === 'interrupt' && /performed click/.test(event.summary),
      ),
    `Expected viewer input to persist interruption audit, got ${JSON.stringify({
      executionState: inputInterrupted.executionState,
      executionTimeline: inputInterrupted.executionTimeline,
    })}`,
  );

  const spoofedResume = await request(
    '/execute-plan',
    {
      authorized: true,
      inputs: { department: '研发部', reason: '客户现场紧急支持' },
      inspectedAfterIntervention: true,
      maxSteps: 2,
    },
    'verify-agent-interrupt',
  );
  assert(
    spoofedResume.taskState === 'paused_by_user_intervention' &&
      spoofedResume.executionEvents?.some(
        (event) => event.id === 'inspect_required_after_intervention' && event.status === 'blocked',
      ),
    `Expected spoofed inspect proof to remain blocked before service-side inspect, got ${JSON.stringify(
      {
        executionEvents: spoofedResume.executionEvents,
        taskState: spoofedResume.taskState,
      },
    )}`,
  );

  const inspected = await request('/inspect', {}, 'verify-agent-interrupt');
  assert(
    inspected.executionState?.phase === 'paused_by_user_intervention' &&
      inspected.executionState?.inspectedInterventionVersion ===
        inspected.executionState?.interventionVersion &&
      inspected.executionTimeline?.some((event) => event.action === 'interrupt'),
    `Expected inspect to preserve interruption audit, got ${JSON.stringify({
      executionState: inspected.executionState,
      executionTimeline: inspected.executionTimeline,
    })}`,
  );

  const blockedResume = await request(
    '/execute-plan',
    {
      authorized: true,
      inputs: { department: '研发部', reason: '客户现场紧急支持' },
      maxSteps: 2,
    },
    'verify-agent-interrupt',
  );
  assert(
    blockedResume.taskState === 'paused_by_user_intervention' &&
      blockedResume.executionEvents?.some(
        (event) => event.id === 'inspect_required_after_intervention' && event.status === 'blocked',
      ),
    `Expected direct resume after intervention to require inspect proof, got ${JSON.stringify({
      executionEvents: blockedResume.executionEvents,
      taskState: blockedResume.taskState,
    })}`,
  );

  const resumed = await request(
    '/execute-plan',
    {
      authorized: true,
      inputs: { department: '研发部', reason: '客户现场紧急支持' },
      inspectedAfterIntervention: true,
      maxSteps: 2,
    },
    'verify-agent-interrupt',
  );
  assert(
    resumed.executionState?.phase !== 'paused_by_user_intervention' &&
      !resumed.executionEvents?.some((event) => event.id === 'inspect_required_after_intervention'),
    `Expected resume with inspect proof to continue past intervention guard, got ${JSON.stringify({
      executionEvents: resumed.executionEvents,
      executionState: resumed.executionState,
    })}`,
  );
}

async function assertPopupNavigationStaysInRemoteSession() {
  const clicked = await request(
    '/navigate',
    { mode: 'remote', url: `${pageOrigin}/popup-link` },
    'verify-agent-popup-click',
  );
  assert(clicked.mode === 'remote', `Expected popup fixture remote mode, got ${clicked.mode}`);
  const clickResult = await request(
    '/click',
    { selector: '#sports-link' },
    'verify-agent-popup-click',
  );
  assert(
    clickResult.url === `${pageOrigin}/popup-destination`,
    `Expected selector popup to stay in remote session, got ${clickResult.url}`,
  );
  assert(
    clickResult.title === '体育新闻',
    `Expected selector popup destination title, got ${clickResult.title}`,
  );

  await request(
    '/navigate',
    { mode: 'remote', url: `${pageOrigin}/popup-link` },
    'verify-agent-popup-input',
  );
  const locator = await request(
    '/evaluate',
    {
      code: `(() => {
        const rect = document.querySelector('#sports-link').getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      })()`,
    },
    'verify-agent-popup-input',
  );
  const inputResult = await request(
    '/input',
    { type: 'click', x: locator.result.x, y: locator.result.y },
    'verify-agent-popup-input',
  );
  assert(
    inputResult.url === `${pageOrigin}/popup-destination`,
    `Expected user popup click to stay in remote session, got ${inputResult.url}`,
  );
  assert(
    inputResult.title === '体育新闻',
    `Expected user popup destination title, got ${inputResult.title}`,
  );
}

const browserService = spawn(process.execPath, ['index.js'], {
  cwd: createBrowserServiceRuntimeDir(),
  env: { ...process.env, BROWSER_SKILL_PACKS_DIR: skillPacksDir, PORT: String(browserPort) },
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
    buy.pageState?.suggestedTasks?.some(
      (task) => task.intent === 'configure_before_purchase' && task.risk === 'medium',
    ),
    `Expected purchase suggested task, got ${JSON.stringify(buy.pageState?.suggestedTasks)}`,
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
  const unauthorizedBuyExecution = await request(
    '/execute-plan',
    { maxSteps: 4 },
    'verify-agent-buy',
  );
  assert(
    unauthorizedBuyExecution.taskState === 'waiting_user_authorization' &&
      unauthorizedBuyExecution.executionState?.phase === 'waiting_authorization' &&
      unauthorizedBuyExecution.executionEvents?.some(
        (event) => event.id === 'authorization_required' && event.status === 'blocked',
      ),
    `Expected execute-plan without authorization to stop before automation, got ${JSON.stringify({
      events: unauthorizedBuyExecution.executionEvents,
      state: unauthorizedBuyExecution.executionState,
      taskState: unauthorizedBuyExecution.taskState,
    })}`,
  );
  const buyExecution = await request(
    '/execute-plan',
    { authorized: true, intent: 'configure_before_purchase', maxSteps: 4 },
    'verify-agent-buy',
  );
  assert(
    buyExecution.taskState === 'risk_blocked' &&
      buyExecution.executionState?.phase === 'risk_blocked' &&
      buyExecution.executionEvents?.some(
        (event) => event.status === 'blocked' && /risky|风险|购买|提交|支付/i.test(event.summary),
      ),
    `Expected buy execution to stop at risk gate, got ${JSON.stringify({
      events: buyExecution.executionEvents,
      state: buyExecution.executionState,
      taskState: buyExecution.taskState,
    })}`,
  );
  const directRiskResume = await request(
    '/execute-plan',
    { authorized: true, intent: 'configure_before_purchase', maxSteps: 4 },
    'verify-agent-buy',
  );
  assert(
    directRiskResume.taskState === 'risk_blocked' &&
      directRiskResume.executionEvents?.some(
        (event) => event.id === 'inspect_required_after_risk' && event.status === 'blocked',
      ),
    `Expected direct risk resume to require inspect, got ${JSON.stringify({
      events: directRiskResume.executionEvents,
      taskState: directRiskResume.taskState,
    })}`,
  );
  const spoofedRiskResume = await request(
    '/execute-plan',
    {
      authorized: true,
      inspectedAfterRisk: true,
      intent: 'configure_before_purchase',
      maxSteps: 4,
    },
    'verify-agent-buy',
  );
  assert(
    spoofedRiskResume.taskState === 'risk_blocked' &&
      spoofedRiskResume.executionEvents?.some(
        (event) => event.id === 'inspect_required_after_risk' && event.status === 'blocked',
      ),
    `Expected spoofed risk inspect proof to remain blocked, got ${JSON.stringify({
      events: spoofedRiskResume.executionEvents,
      taskState: spoofedRiskResume.taskState,
    })}`,
  );
  const inspectedRisk = await request('/inspect', {}, 'verify-agent-buy');
  assert(
    inspectedRisk.executionState?.phase === 'risk_blocked' &&
      inspectedRisk.executionState?.inspectedRiskPauseVersion ===
        inspectedRisk.executionState?.riskPauseVersion,
    `Expected inspect to cover risk pause version, got ${JSON.stringify(
      inspectedRisk.executionState,
    )}`,
  );
  const inspectedRiskResume = await request(
    '/execute-plan',
    {
      authorized: true,
      inspectedAfterRisk: true,
      intent: 'configure_before_purchase',
      maxSteps: 4,
    },
    'verify-agent-buy',
  );
  assert(
    !inspectedRiskResume.executionEvents?.some(
      (event) => event.id === 'inspect_required_after_risk',
    ),
    `Expected inspected risk resume to pass the risk inspect guard, got ${JSON.stringify({
      events: inspectedRiskResume.executionEvents,
      state: inspectedRiskResume.executionState,
    })}`,
  );
  const buyFlag = await request(
    '/evaluate',
    { code: 'document.body.dataset.purchased' },
    'verify-agent-buy',
  );
  assert(buyFlag.result === undefined, `Expected buy plan not to purchase, got ${buyFlag.result}`);

  await request(
    '/navigate',
    { mode: 'remote', url: `${pageOrigin}/kiki-cloud-buy-risk` },
    'verify-agent-buy-cancel',
  );
  const cancelRiskExecution = await request(
    '/execute-plan',
    { authorized: true, intent: 'configure_before_purchase', maxSteps: 4 },
    'verify-agent-buy-cancel',
  );
  assert(
    cancelRiskExecution.taskState === 'risk_blocked',
    `Expected cancel test to reach risk gate, got ${JSON.stringify({
      events: cancelRiskExecution.executionEvents,
      taskState: cancelRiskExecution.taskState,
    })}`,
  );
  const cancelledRiskTask = await request(
    '/cancel-task',
    { reason: 'User cancelled the risky browser task before execution.' },
    'verify-agent-buy-cancel',
  );
  assert(
    cancelledRiskTask.taskState === 'cancelled' &&
      cancelledRiskTask.executionState?.phase === 'cancelled' &&
      cancelledRiskTask.executionEvents?.some(
        (event) => event.action === 'cancel' && event.status === 'blocked',
      ) &&
      cancelledRiskTask.executionTimeline?.some(
        (event) => event.action === 'cancel' && event.status === 'blocked',
      ),
    `Expected risk cancellation to be audited as terminal cancellation, got ${JSON.stringify({
      events: cancelledRiskTask.executionEvents,
      state: cancelledRiskTask.executionState,
      taskState: cancelledRiskTask.taskState,
      timeline: cancelledRiskTask.executionTimeline,
    })}`,
  );

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

  const expense = await request(
    '/navigate',
    { mode: 'remote', url: `${pageOrigin}/business-expense` },
    'verify-agent-expense',
  );
  assert(
    expense.skillPack?.page === 'expense_approval_form' &&
      expense.skillPack?.source === 'file:expense-approval.json',
    `Expected external expense skill pack, got ${JSON.stringify(expense.skillPack)}`,
  );
  assert(
    expense.plan?.source === 'skill_pack' && expense.plan.intent === 'expense_approval',
    `Expected external expense workflow plan, got ${JSON.stringify(expense.plan)}`,
  );
  assert(
    expense.plan?.layers?.goal?.intent === 'expense_approval' &&
      expense.plan?.layers?.constraints?.rules?.includes('提交审批前必须等待用户确认') &&
      expense.plan?.layers?.execution?.resumePolicy === 'inspect_before_resume' &&
      expense.plan?.layers?.execution?.steps?.includes('risk_gate'),
    `Expected normalized workflow layers to pass through plan, got ${JSON.stringify(
      expense.plan?.layers,
    )}`,
  );
  assert(
    expense.pageState?.clarifications?.some(
      (prompt) =>
        prompt.field === 'department' &&
        prompt.options?.some((option) => option.value === '研发部'),
    ),
    `Expected expense page to expose department clarification options, got ${JSON.stringify(
      expense.pageState?.clarifications,
    )}`,
  );
  await request(
    '/navigate',
    { mode: 'remote', url: `${pageOrigin}/business-expense` },
    'verify-agent-expense-review',
  );
  const reviewOnlyExecution = await request(
    '/execute-plan',
    { authorized: true, intent: 'expense_review_only', maxSteps: 3 },
    'verify-agent-expense-review',
  );
  assert(
    reviewOnlyExecution.plan?.intent === 'expense_review_only' &&
      reviewOnlyExecution.executionEvents?.some(
        (event) => event.id === 'verify_amount_only' && event.status === 'completed',
      ),
    `Expected selected review-only workflow, got ${JSON.stringify({
      events: reviewOnlyExecution.executionEvents,
      plan: reviewOnlyExecution.plan,
    })}`,
  );
  const expenseExecution = await request(
    '/execute-plan',
    { authorized: true, maxSteps: 4 },
    'verify-agent-expense',
  );
  assert(
    expenseExecution.executionEvents?.some(
      (event) => event.id === 'select_department' && event.status === 'blocked',
    ),
    `Expected expense execution to stop for department clarification, got ${JSON.stringify(
      expenseExecution.executionEvents,
    )}`,
  );
  assert(
    expenseExecution.executionState?.blockedStepId === 'select_department' &&
      expenseExecution.executionState?.phase === 'paused_for_input',
    `Expected expense execution cursor to pause on select_department, got ${JSON.stringify(
      expenseExecution.executionState,
    )}`,
  );
  const spoofedInputResume = await request(
    '/execute-plan',
    {
      authorized: true,
      inputs: { department: '研发部', reason: '客户现场紧急支持' },
      inspectedAfterPause: true,
      maxSteps: 5,
    },
    'verify-agent-expense',
  );
  assert(
    spoofedInputResume.taskState === 'asking_clarification' &&
      spoofedInputResume.executionEvents?.some(
        (event) => event.id === 'inspect_required_after_input' && event.status === 'blocked',
      ),
    `Expected spoofed input-pause proof to require service-side inspect, got ${JSON.stringify({
      executionEvents: spoofedInputResume.executionEvents,
      taskState: spoofedInputResume.taskState,
    })}`,
  );
  const inspectedInputPause = await request('/inspect', {}, 'verify-agent-expense');
  assert(
    inspectedInputPause.executionState?.phase === 'paused_for_input' &&
      inspectedInputPause.executionState?.inspectedInputPauseVersion ===
        inspectedInputPause.executionState?.inputPauseVersion,
    `Expected inspect to cover input pause version, got ${JSON.stringify(
      inspectedInputPause.executionState,
    )}`,
  );
  const expenseSubmitted = await request(
    '/evaluate',
    { code: 'document.body.dataset.submitted' },
    'verify-agent-expense',
  );
  assert(
    expenseSubmitted.result === undefined,
    `Expected external expense plan not to submit, got ${expenseSubmitted.result}`,
  );
  const completedExpenseExecution = await request(
    '/execute-plan',
    {
      authorized: true,
      inputs: { department: '研发部', reason: '客户现场紧急支持' },
      inspectedAfterPause: true,
      maxSteps: 5,
    },
    'verify-agent-expense',
  );
  assert(
    completedExpenseExecution.executionEvents?.some(
      (event) => event.id === 'select_department' && event.status === 'completed',
    ),
    `Expected expense execution to select department, got ${JSON.stringify(
      completedExpenseExecution.executionEvents,
    )}`,
  );
  assert(
    completedExpenseExecution.executionEvents?.some(
      (event) =>
        event.id === 'fill_reason' &&
        event.status === 'blocked' &&
        /inputPolicy requires confirmation/.test(event.summary),
    ),
    `Expected expense execution to pause before confirm_before reason fill, got ${JSON.stringify(
      completedExpenseExecution.executionEvents,
    )}`,
  );
  assert(
    completedExpenseExecution.executionState?.completedStepIds?.includes('select_department') &&
      !completedExpenseExecution.executionState?.completedStepIds?.includes('fill_reason') &&
      completedExpenseExecution.executionState?.blockedStepId === 'fill_reason' &&
      completedExpenseExecution.executionState?.cursor === 2 &&
      completedExpenseExecution.executionState?.phase === 'paused_for_input',
    `Expected expense execution cursor to stop before confirm_before fill, got ${JSON.stringify(
      completedExpenseExecution.executionState,
    )}`,
  );
  const expenseValues = await request(
    '/evaluate',
    {
      code: `({
        department: document.querySelector('#department').value,
        reason: document.querySelector('#reason').value,
        submitted: document.body.dataset.submitted,
      })`,
    },
    'verify-agent-expense',
  );
  assert(
    expenseValues.result?.department === '研发部' &&
      expenseValues.result?.reason === '客户现场支持' &&
      expenseValues.result?.submitted === undefined,
    `Expected department selected but confirm_before reason left unchanged, got ${JSON.stringify(
      expenseValues.result,
    )}`,
  );
  const repeatedExpenseExecution = await request(
    '/execute-plan',
    { authorized: true, maxSteps: 5 },
    'verify-agent-expense',
  );
  assert(
    repeatedExpenseExecution.executionEvents?.[0]?.id === 'inspect_required_after_input' &&
      repeatedExpenseExecution.executionEvents?.[0]?.status === 'blocked',
    `Expected repeated expense execution to require inspect before confirm_before resume, got ${JSON.stringify(
      repeatedExpenseExecution.executionEvents,
    )}`,
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
  assert(
    search.pageState?.suggestedTasks?.some((task) => task.intent === 'find_official_source'),
    `Expected search suggested task, got ${JSON.stringify(search.pageState?.suggestedTasks)}`,
  );
  assertTargetHighlight(search.pageState?.targetHighlight, /搜索|查询/, 'search page');
  const searchExecution = await request(
    '/execute-plan',
    { authorized: true, inputs: { query: '复星医药' }, maxSteps: 4 },
    'verify-agent-search',
  );
  assert(
    searchExecution.executionEvents?.some(
      (event) => event.action === 'fill' && event.status === 'completed',
    ),
    `Expected search plan to fill query, got ${JSON.stringify(searchExecution.executionEvents)}`,
  );
  assert(
    searchExecution.executionEvents?.some(
      (event) => event.action === 'submit' && event.status === 'completed',
    ),
    `Expected search plan to submit query, got ${JSON.stringify(searchExecution.executionEvents)}`,
  );
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
  await assertRemoteViewerPreservesKeyboardOrder();
  await assertServerRecordsUserIntervention();
  await assertPopupNavigationStaysInRemoteSession();

  console.log('Browser agent product verification passed');
} finally {
  browserService.kill('SIGTERM');
  await waitForProcessExit(browserService);
  await closeServer(testPageServer).catch(() => {});
  cleanupBrowserServiceRuntimeDir();
  rmSync(skillPacksDir, { force: true, recursive: true });
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
