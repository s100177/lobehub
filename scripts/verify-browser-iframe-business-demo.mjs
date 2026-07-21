import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');

const baseUrl = process.argv[2] || process.env.BROWSER_IFRAME_DEMO_URL;
if (!baseUrl) {
  console.error(
    'Usage: node scripts/verify-browser-iframe-business-demo.mjs "http://host:3211/browser-e2e?mode=iframe&path=/browser-business-demo/expense-approval"',
  );
  process.exit(1);
}

const evidenceDir = path.resolve(
  process.env.BROWSER_IFRAME_EVIDENCE_DIR || '.omx/artifacts/browser-iframe-experience',
);
const targetPath = '/browser-business-demo/expense-approval';

const browser = await chromium.launch({ headless: process.env.HEADLESS !== 'false' });

try {
  const context = await browser.newContext({ viewport: { height: 960, width: 1440 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const email = process.env.LOBE_E2E_EMAIL;
  const password = process.env.LOBE_E2E_PASSWORD;
  if (email && password) {
    await page.goto(new URL('/signin', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
    await page.locator('#email').fill(email);
    await page.keyboard.press('Enter');
    await page.locator('#password').waitFor({ timeout: 15_000 });
    await page.locator('#password').fill(password);
    await page.keyboard.press('Enter');
    await page.waitForURL((url) => !url.pathname.startsWith('/signin'), { timeout: 30_000 });
  }

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  const e2eRoot = page.locator('main[data-browser-e2e-session-id]');
  await e2eRoot.waitFor({ timeout: 30_000 });
  const sessionId = await e2eRoot.getAttribute('data-browser-e2e-session-id');
  assert(sessionId, 'Browser E2E session id was not exposed by the protected test panel');

  const businessIframes = page.locator(`iframe[src*="${targetPath}"]`);
  await businessIframes.first().waitFor({ state: 'visible', timeout: 30_000 });
  const originalIframe = businessIframes.first();
  const originalFrame = originalIframe.contentFrame();
  await originalFrame.getByRole('heading', { name: '费用审批' }).waitFor({ timeout: 30_000 });

  await originalFrame.locator('#reason').fill('用户手动填写且必须保留');
  const originalIframeHandle = await originalIframe.elementHandle();
  assert(originalIframeHandle, 'Original business iframe handle was not available');
  await page.getByTestId('simulate-browser-tool-update').click();
  await page.getByTestId('browser-tool-update-complete').waitFor({ timeout: 10_000 });
  const iframeAfterToolUpdate = await businessIframes.first().elementHandle();
  assert(
    iframeAfterToolUpdate &&
      (await originalIframeHandle.evaluate(
        (iframe, next) => iframe === next,
        iframeAfterToolUpdate,
      )),
    'A non-navigation tool result replaced the live iframe node',
  );
  assert.equal(
    await originalFrame.locator('#reason').inputValue(),
    '用户手动填写且必须保留',
    'A non-navigation tool result reloaded the visible iframe',
  );
  await originalFrame.getByTestId('policy-blank-link').click();
  await assertIframeCount(businessIframes, 2);
  const tabs = page.getByRole('tab');
  await tabs.nth(1).waitFor({ timeout: 15_000 });
  assert.equal(context.pages().length, 1, 'target=_blank escaped into a system browser page');
  assert.equal(
    await originalFrame.locator('#reason').inputValue(),
    '用户手动填写且必须保留',
    'Opening a right-panel tab destroyed the original form state',
  );

  await tabs.first().click();
  await originalIframe.waitFor({ state: 'visible' });

  await callBrowserAction(page, sessionId, 'inspect', {});
  const fillRequest = callBrowserAction(page, sessionId, 'fill', {
    selector: '#department',
    text: '研发部',
  });
  const fillHighlight = originalFrame.locator('[data-lobe-browser-highlight="fill"]');
  await fillHighlight.waitFor({ state: 'visible', timeout: 10_000 });
  assert.equal(
    await fillHighlight.evaluate((element) => getComputedStyle(element).pointerEvents),
    'none',
    'AI action highlight blocks user interaction',
  );
  await fillRequest;
  assert.equal(
    await originalFrame.locator('#department').inputValue(),
    '研发部',
    'AI fill did not change the visible iframe DOM',
  );

  await callBrowserAction(page, sessionId, 'click', {
    selector: '[data-testid="preview-expense"]',
  });
  await originalFrame.getByText('预览报销单（1）').waitFor({ timeout: 10_000 });
  assert.equal(
    await originalFrame.getByTestId('preview-expense').getAttribute('data-click-count'),
    '1',
    'AI click bypassed the business page click handler',
  );

  await originalFrame.getByTestId('policy-window-open').click();
  await assertIframeCount(businessIframes, 3);
  await tabs.nth(2).waitFor({ timeout: 15_000 });
  assert.equal(context.pages().length, 1, 'window.open escaped into a system browser page');

  const activeIframe = businessIframes.last();
  const activeFrame = activeIframe.contentFrame();
  await activeFrame.getByTestId('policy-normal-link').click();
  await page.waitForFunction(
    (pathName) => {
      const candidates = [...document.querySelectorAll(`iframe[src*="${pathName}"]`)];
      const active = candidates.at(-1);
      try {
        return active?.contentWindow?.location.search.includes('view=normal-link');
      } catch {
        return false;
      }
    },
    targetPath,
    { timeout: 15_000 },
  );
  await assertIframeCount(businessIframes, 3);
  assert.equal(context.pages().length, 1, 'Normal navigation created an external page');
  assert.equal(pageErrors.length, 0, `Browser page errors:\n${pageErrors.join('\n')}`);

  mkdirSync(evidenceDir, { recursive: true });
  const screenshotFile = path.join(evidenceDir, 'iframe-experience.png');
  const reportFile = path.join(evidenceDir, 'iframe-experience.json');
  await page.screenshot({ fullPage: true, path: screenshotFile });

  const report = {
    aiClickHandlerCount: 1,
    aiFilledDepartment: '研发部',
    browserPageCount: context.pages().length,
    iframeCount: await businessIframes.count(),
    manualInputPreserved: true,
    nonNavigationToolUpdatePreservedIframe: true,
    normalLinkUrl: await activeIframe.evaluate((iframe) => iframe.contentWindow?.location.href),
    ok: true,
    pageErrors,
    rightPanelBlankTab: true,
    rightPanelWindowOpenTab: true,
    sessionId,
  };
  writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ...report, evidenceDir, screenshotFile }, null, 2));
} finally {
  await browser.close();
}

async function callBrowserAction(page, sessionId, action, params) {
  const retryableCodes = new Set([
    'BRIDGE_CLIENT_REPLACED',
    'BRIDGE_DISCONNECTED',
    'BRIDGE_NOT_CONNECTED',
  ]);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await page.evaluate(
      async ({
        action: requestedAction,
        params: requestedParams,
        sessionId: requestedSessionId,
      }) => {
        const result = await fetch('/api/browser/action', {
          body: JSON.stringify({
            action: requestedAction,
            params: requestedParams,
            sessionId: requestedSessionId,
          }),
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        });
        return {
          body: await result.json().catch(() => undefined),
          ok: result.ok,
          status: result.status,
        };
      },
      { action, params, sessionId },
    );

    if (response.ok) return response.body;
    if (!retryableCodes.has(response.body?.code) || attempt === 19) {
      assert.fail(
        `${action} failed with HTTP ${response.status}: ${JSON.stringify(response.body)}`,
      );
    }
    await page.waitForTimeout(250);
  }

  assert.fail(`${action} did not reach an active iframe Bridge`);
}

async function assertIframeCount(locator, expected) {
  await locator.nth(expected - 1).waitFor({ state: 'attached', timeout: 15_000 });
  assert.equal(await locator.count(), expected, `Expected ${expected} retained iframe tabs`);
}
