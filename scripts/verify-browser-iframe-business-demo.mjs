import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(
  require.resolve('playwright', { paths: [resolve(process.cwd(), '..', 'browser-service')] }),
);

const baseUrl = process.argv[2] || process.env.BROWSER_IFRAME_DEMO_URL;
if (!baseUrl) {
  console.error(
    'Usage: node scripts/verify-browser-iframe-business-demo.mjs http://host:3211/browser-e2e?mode=iframe&path=/browser-business-demo/expense-approval',
  );
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { height: 900, width: 1440 } });
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
  await page.waitForSelector('iframe', { timeout: 30_000 });

  const findBusinessFrame = () =>
    page
      .frames()
      .find(
        (item) =>
          item !== page.mainFrame() && /browser-business-demo\/expense-approval/.test(item.url()),
      );

  const readIframeLocation = async () =>
    page.evaluate(() => {
      const candidates = [...document.querySelectorAll('iframe')];
      return candidates.find((item) =>
        item.contentWindow?.location.href?.includes('/browser-business-demo/expense-approval'),
      )?.contentWindow?.location.href;
    });

  const frame = findBusinessFrame();
  if (!frame) throw new Error('Business demo iframe was not found');

  await frame.getByText('新标签打开报销制度').waitFor({ timeout: 30_000 });
  await frame.getByText('新标签打开报销制度').click();
  await page.waitForFunction(() => {
    const iframe = [...document.querySelectorAll('iframe')].find((item) =>
      item.contentWindow?.location.href?.includes('/browser-business-demo/expense-approval'),
    );
    try {
      return iframe?.contentWindow?.location.href?.includes('view=policy');
    } catch {
      return false;
    }
  });

  const blankLinkLocation = await readIframeLocation();
  if (!blankLinkLocation?.includes('/browser-business-demo/expense-approval?view=policy')) {
    throw new Error(`Expected iframe to stay in-panel with policy view, got ${blankLinkLocation}`);
  }

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('iframe', { timeout: 30_000 });
  await page.waitForFunction(() =>
    [...document.querySelectorAll('iframe')].some((item) => {
      try {
        return item.contentWindow?.location.href?.includes(
          '/browser-business-demo/expense-approval',
        );
      } catch {
        return false;
      }
    }),
  );

  const refreshedFrame = findBusinessFrame();
  if (!refreshedFrame) throw new Error('Business demo iframe was not found after reload');

  await refreshedFrame.evaluate(() => {
    const link = document.createElement('a');
    link.href = '/browser-business-demo/expense-approval?view=normal-link';
    link.id = 'normal-link-test';
    link.textContent = '普通链接跳转测试';
    document.body.prepend(link);
  });
  await refreshedFrame.locator('#normal-link-test').click();
  await page.waitForFunction(() => {
    const iframe = [...document.querySelectorAll('iframe')].find((item) =>
      item.contentWindow?.location.href?.includes('/browser-business-demo/expense-approval'),
    );
    try {
      return iframe?.contentWindow?.location.href?.includes('view=normal-link');
    } catch {
      return false;
    }
  });

  const normalLinkLocation = await readIframeLocation();
  if (!normalLinkLocation?.includes('/browser-business-demo/expense-approval?view=normal-link')) {
    throw new Error(`Expected normal iframe link to navigate in-panel, got ${normalLinkLocation}`);
  }

  const pages = browser.contexts().flatMap((context) => context.pages());
  if (pages.length !== 1) {
    throw new Error(`Expected no popup/system page, but browser context has ${pages.length} pages`);
  }

  console.log(
    JSON.stringify(
      {
        blankLinkLocation,
        normalLinkLocation,
        ok: true,
        pages: pages.length,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
