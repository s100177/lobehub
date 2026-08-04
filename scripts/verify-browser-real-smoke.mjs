import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const browserPort = Number.parseInt(process.env.BROWSER_REAL_SMOKE_PORT || '3330', 10);
const browserOrigin = `http://127.0.0.1:${browserPort}`;
const browserOwnerId = 'verify-user';
const browserServiceToken = 'verify-service-token';
const repoRoot = path.resolve(import.meta.dirname, '..');
const inRepoServiceDir = path.resolve(repoRoot, 'browser-service');
const deployedServiceDir = path.resolve(repoRoot, '..', 'browser-service');
const browserServiceDir = process.env.BROWSER_SERVICE_DIR || inRepoServiceDir;
const dependencyServiceDir = existsSync(path.resolve(browserServiceDir, 'node_modules'))
  ? browserServiceDir
  : deployedServiceDir;
const smokeUrls = (process.env.BROWSER_REAL_SMOKE_URLS || 'https://example.com/')
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean);
let browserServiceRuntimeDir;

if (smokeUrls.length === 0) {
  throw new Error('BROWSER_REAL_SMOKE_URLS did not include any URLs');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function waitForProcessExit(child, timeout = 5000) {
  if (child.exitCode !== null || child.signalCode) return Promise.resolve();

  return new Promise((resolvePromise) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolvePromise();
    }, timeout);
    child.once('exit', () => {
      clearTimeout(timer);
      resolvePromise();
    });
  });
}

async function waitForBrowserService() {
  for (let index = 0; index < 60; index += 1) {
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

async function request(path, body, sessionId) {
  const response = await fetch(`${browserOrigin}${path}`, {
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      'X-Browser-Owner-ID': browserOwnerId,
      'X-Browser-Service-Token': browserServiceToken,
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

const browserService = spawn(process.execPath, ['index.js'], {
  cwd: createBrowserServiceRuntimeDir(),
  env: {
    ...process.env,
    BROWSER_IFRAME_ALLOWED_ORIGINS: new URL(smokeUrls[0]).origin,
    BROWSER_SERVICE_TOKEN: browserServiceToken,
    PORT: String(browserPort),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

browserService.stdout.on('data', (chunk) => process.stdout.write(`[browser-service] ${chunk}`));
browserService.stderr.on('data', (chunk) => process.stderr.write(`[browser-service] ${chunk}`));

try {
  await waitForBrowserService();

  for (const [index, url] of smokeUrls.entries()) {
    const sessionId = `real-smoke-${index + 1}`;
    const navigated = await request(
      '/navigate',
      { mode: 'remote', timeout: 30_000, url },
      sessionId,
    );
    assert(navigated.mode === 'remote', `Expected remote mode for ${url}, got ${navigated.mode}`);
    assert(
      navigated.url && navigated.url !== 'about:blank',
      `Expected a real page URL for ${url}, got ${navigated.url}`,
    );
    assert(navigated.title !== undefined, `Expected title field for ${url}`);
    assert(navigated.viewport?.width > 0 && navigated.viewport?.height > 0, 'Missing viewport');

    const inspected = await request('/inspect', {}, sessionId);
    assert(
      inspected.pageState?.url && inspected.pageState.url !== 'about:blank',
      `Expected inspect pageState.url for ${url}, got ${JSON.stringify(inspected.pageState)}`,
    );
    assert(
      Array.isArray(inspected.actionEvents) &&
        inspected.actionEvents.some((event) => event.action === 'inspect'),
      `Expected inspect action event for ${url}, got ${JSON.stringify(inspected.actionEvents)}`,
    );
    assert(
      !inspected.riskBlock && !inspected.blocked,
      `Smoke inspect must not execute risk actions for ${url}`,
    );
  }

  console.log(`Browser real-site smoke verification passed for ${smokeUrls.join(', ')}`);
} finally {
  browserService.kill('SIGTERM');
  await waitForProcessExit(browserService);
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
  cpSync(
    path.resolve(browserServiceDir, 'bridge-session-manager.js'),
    path.resolve(browserServiceRuntimeDir, 'bridge-session-manager.js'),
  );
  cpSync(
    path.resolve(browserServiceDir, 'form-control.js'),
    path.resolve(browserServiceRuntimeDir, 'form-control.js'),
  );
  cpSync(
    path.resolve(browserServiceDir, 'service-auth.js'),
    path.resolve(browserServiceRuntimeDir, 'service-auth.js'),
  );
  cpSync(
    path.resolve(browserServiceDir, 'iframe-policy.js'),
    path.resolve(browserServiceRuntimeDir, 'iframe-policy.js'),
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
