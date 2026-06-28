import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const browserPort = Number.parseInt(process.env.BROWSER_VERIFY_PORT || '3310', 10);
const pagePort = Number.parseInt(process.env.BROWSER_VERIFY_PAGE_PORT || '4311', 10);
const browserOrigin = `http://127.0.0.1:${browserPort}`;
const pageOrigin = `http://127.0.0.1:${pagePort}`;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const inRepoServiceDir = resolve(repoRoot, 'browser-service');
const deployedServiceDir = resolve(repoRoot, '..', 'browser-service');
const browserServiceDir =
  process.env.BROWSER_SERVICE_DIR ||
  (existsSync(resolve(inRepoServiceDir, 'node_modules')) ? inRepoServiceDir : deployedServiceDir);
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve('playwright', { paths: [browserServiceDir] }));

const testPageServer = http.createServer((req, res) => {
  if (req.url === '/blocked') {
    res.setHeader('X-Frame-Options', 'DENY');
    res.end('<!doctype html><title>Blocked</title><h1>Blocked</h1>');
    return;
  }

  res.end(`<!doctype html>
    <title>Iframe OK</title>
    <style>
      html,
      body {
        min-height: 100%;
        margin: 0;
        background: linear-gradient(135deg, #f97316, #0891b2);
        color: #111827;
        font: 24px sans-serif;
      }
      h1 {
        margin: 32px 40px;
      }
      button {
        background: #111827;
        border: 0;
        color: white;
        cursor: pointer;
        height: 48px;
        left: 40px;
        position: absolute;
        top: 80px;
        width: 120px;
      }
    </style>
    <h1 id="ok">Iframe OK</h1>
    <button id="btn" onclick="document.body.dataset.clicked='1'">Click</button>`);
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

async function request(path, body, sessionId = 'verify') {
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

async function assertRemoteViewerDoesNotBlankOnPointerFrame() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { height: 700, width: 900 } });
    await page.goto(`${browserOrigin}/viewer?session=verify-remote&basePath=/`, {
      waitUntil: 'domcontentloaded',
    });

    await page.waitForFunction(() => document.getElementById('status')?.textContent === 'live', {
      timeout: 10_000,
    });

    const initial = await page.evaluate(sampleViewerCanvas);
    assert(
      initial.hasContent,
      `Expected remote viewer canvas to contain page pixels: ${initial.reason}`,
    );
    assert(
      initial.fillsStage,
      `Expected canvas to fill stage, got ${JSON.stringify(initial.rects)}`,
    );

    const canvas = page.locator('#screen');
    const box = await canvas.boundingBox();
    assert(box, 'Expected viewer canvas to be visible');
    await page.mouse.move(box.x + 70, box.y + 104);

    await page.waitForFunction(
      () => getComputedStyle(document.getElementById('screen')).cursor === 'pointer',
      {
        timeout: 5000,
      },
    );

    const afterHover = await page.evaluate(sampleViewerCanvas);
    assert(
      afterHover.hasContent,
      `Expected pointer-only frame not to clear canvas: ${afterHover.reason}`,
    );
    assert(
      afterHover.fillsStage,
      `Expected canvas to keep filling stage after hover, got ${JSON.stringify(afterHover.rects)}`,
    );
  } finally {
    await browser.close();
  }
}

function sampleViewerCanvas() {
  const canvas = document.getElementById('screen');
  const stage = document.querySelector('.stage');
  if (!(canvas instanceof HTMLCanvasElement) || !stage) {
    return { hasContent: false, reason: 'missing canvas or stage' };
  }

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { hasContent: false, reason: 'missing canvas context' };

  const width = canvas.width;
  const height = canvas.height;
  const points = [
    [Math.floor(width * 0.25), Math.floor(height * 0.25)],
    [Math.floor(width * 0.5), Math.floor(height * 0.5)],
    [Math.floor(width * 0.75), Math.floor(height * 0.75)],
    [80, 110],
  ];
  const samples = points.map(([x, y]) => Array.from(ctx.getImageData(x, y, 1, 1).data));
  const hasContent = samples.some(([r, g, b, a]) => a > 0 && !(r > 248 && g > 248 && b > 248));
  const canvasRect = canvas.getBoundingClientRect();
  const stageRect = stage.getBoundingClientRect();
  const fillsStage =
    Math.abs(canvasRect.width - stageRect.width) <= 1 &&
    Math.abs(canvasRect.height - stageRect.height) <= 1;

  return {
    fillsStage,
    hasContent,
    reason: hasContent ? 'non-white pixels found' : `samples were ${JSON.stringify(samples)}`,
    rects: {
      canvas: { height: canvasRect.height, width: canvasRect.width },
      stage: { height: stageRect.height, width: stageRect.width },
    },
  };
}

const browserService = spawn(process.execPath, ['index.js'], {
  env: { ...process.env, PORT: String(browserPort) },
  cwd: browserServiceDir,
  stdio: ['ignore', 'pipe', 'pipe'],
});

browserService.stdout.on('data', (chunk) => process.stdout.write(`[browser-service] ${chunk}`));
browserService.stderr.on('data', (chunk) => process.stderr.write(`[browser-service] ${chunk}`));

try {
  await listen(testPageServer, pagePort);
  await waitForBrowserService();

  const iframe = await request(
    '/navigate',
    { mode: 'auto', url: `${pageOrigin}/` },
    'verify-iframe',
  );
  assert(iframe.mode === 'iframe', `Expected iframe mode, got ${iframe.mode}`);
  assert(
    iframe.iframeUrl === `${pageOrigin}/`,
    `Expected iframeUrl ${pageOrigin}/, got ${iframe.iframeUrl}`,
  );

  const blocked = await request(
    '/navigate',
    { mode: 'auto', url: `${pageOrigin}/blocked` },
    'verify-blocked',
  );
  assert(blocked.mode === 'remote', `Expected blocked page to use remote, got ${blocked.mode}`);
  assert(
    blocked.fallbackReason?.includes('X-Frame-Options'),
    `Expected X-Frame-Options fallback reason, got ${blocked.fallbackReason}`,
  );

  const remote = await request(
    '/navigate',
    { mode: 'remote', url: `${pageOrigin}/` },
    'verify-remote',
  );
  assert(remote.mode === 'remote', `Expected forced remote mode, got ${remote.mode}`);

  const hover = await request('/input', { type: 'mousemove', x: 100, y: 104 }, 'verify-remote');
  assert(
    hover.pointer?.cursor === 'pointer',
    `Expected pointer cursor, got ${hover.pointer?.cursor}`,
  );
  assert(!hover.screenshot, 'Mousemove should not return a screenshot frame');

  await request('/input', { type: 'click', x: 100, y: 104 }, 'verify-remote');
  const clicked = await request(
    '/evaluate',
    { code: 'document.body.dataset.clicked' },
    'verify-remote',
  );
  assert(clicked.result === '1', `Expected click to set dataset.clicked=1, got ${clicked.result}`);

  await assertRemoteViewerDoesNotBlankOnPointerFrame();

  console.log('Browser dual-mode verification passed');
} finally {
  browserService.kill('SIGTERM');
  await waitForProcessExit(browserService);
  await closeServer(testPageServer).catch(() => {});
}
