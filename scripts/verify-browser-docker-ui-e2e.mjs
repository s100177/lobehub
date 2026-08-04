import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const bcrypt = require('bcryptjs');
const pg = require('pg');
const { chromium } = require('@playwright/test');

const baseUrl =
  process.env.BROWSER_DOCKER_E2E_BASE_URL || process.env.APP_URL || 'http://127.0.0.1:3211';
const databaseUrl =
  process.env.BROWSER_DOCKER_E2E_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@127.0.0.1:5435/lobehub';
const testUser = {
  email: process.env.BROWSER_DOCKER_E2E_EMAIL || 'browser-e2e@lobehub.local',
  fullName: 'Browser Docker E2E',
  id: 'user_browser_docker_e2e',
  password: process.env.BROWSER_DOCKER_E2E_PASSWORD || 'TestPassword123!',
  username: 'browser_docker_e2e',
};

async function seedTestUser() {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const now = new Date().toISOString();
    const passwordHash = await bcrypt.hash(testUser.password, 10);
    const onboarding = JSON.stringify({ finishedAt: now, version: 1 });

    await client.query(
      `INSERT INTO users (id, email, normalized_email, username, full_name, email_verified, email_verified_at, onboarding, created_at, updated_at, last_active_at)
       VALUES ($1, $2, $3, $4, $5, $6, $8, $7, $8, $8, $8)
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email,
         normalized_email = EXCLUDED.normalized_email,
         username = EXCLUDED.username,
         full_name = EXCLUDED.full_name,
         email_verified = EXCLUDED.email_verified,
         email_verified_at = EXCLUDED.email_verified_at,
         onboarding = EXCLUDED.onboarding,
         updated_at = EXCLUDED.updated_at`,
      [
        testUser.id,
        testUser.email,
        testUser.email.toLowerCase(),
        testUser.username,
        testUser.fullName,
        true,
        onboarding,
        now,
      ],
    );

    await client.query(
      `INSERT INTO accounts (id, user_id, account_id, provider_id, password, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $6)
       ON CONFLICT (id) DO UPDATE SET
         account_id = EXCLUDED.account_id,
         password = EXCLUDED.password,
         updated_at = EXCLUDED.updated_at`,
      ['browser_docker_e2e_account', testUser.id, testUser.email, 'credential', passwordHash, now],
    );
  } finally {
    await client.end();
  }
}

async function login(page) {
  await page.goto(`${baseUrl}/signin`, { waitUntil: 'networkidle' });
  const emailInput = page
    .locator('input[id="email"], input[name="email"], input[type="text"]')
    .first();
  await emailInput.waitFor({ state: 'visible', timeout: 30_000 });
  await emailInput.fill(testUser.email);
  await page.locator('form button').first().click();

  const agreementButton = page.getByRole('button', { name: 'Agree and continue' });
  if (await agreementButton.isVisible().catch(() => false)) {
    await agreementButton.click();
  }

  const passwordInput = page
    .locator('input[id="password"], input[name="password"], input[type="password"]')
    .first();
  await passwordInput.waitFor({ state: 'visible', timeout: 30_000 });
  await passwordInput.fill(testUser.password);
  await page.locator('form button').first().click();
  await page.waitForURL((url) => !url.pathname.includes('/signin'), { timeout: 30_000 });
  await page.waitForLoadState('networkidle');

  const url = new URL(page.url());
  assert.notEqual(
    url.pathname,
    '/verify-email',
    `Login did not create an authenticated session, redirected to ${page.url()}`,
  );
}

async function main() {
  await seedTestUser();

  const browser = await chromium.launch({ headless: process.env.HEADLESS !== 'false' });
  const page = await browser.newPage({ viewport: { height: 980, width: 1440 } });

  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  try {
    await login(page);
    await page.goto(`${baseUrl}/browser-e2e`, { waitUntil: 'domcontentloaded' });

    await page.getByText('Browser Docker UI E2E').waitFor({ timeout: 30_000 });
    await page.getByText('Remote', { exact: true }).first().waitFor({ timeout: 30_000 });
    await page.getByText('/browser-e2e/fixture').first().waitFor({ timeout: 30_000 });

    const iframe = page.locator('iframe[src^="/api/browser/proxy?session="]').first();
    await expectFrameLoaded(iframe);
    await expectRemoteViewerLive(iframe);

    assert.equal(await page.locator('[aria-label="Browser suggested tasks"]').count(), 0);
    assert.equal(await page.locator('[aria-label="Browser authorization card"]').count(), 0);
    assert.equal(await page.locator('[aria-label="Browser agent plan"]').count(), 0);

    assert.equal(errors.length, 0, `Unexpected browser errors: ${errors.join('\n')}`);
  } finally {
    await browser.close();
  }

  console.log(`Browser Docker UI E2E passed at ${baseUrl}`);
}

async function expectFrameLoaded(iframe) {
  await iframe.waitFor({ state: 'attached', timeout: 30_000 });
  const src = await iframe.getAttribute('src');
  assert(src?.includes('/api/browser/proxy?session='), `Expected browser proxy iframe, got ${src}`);
}

async function expectRemoteViewerLive(iframe) {
  const frame = iframe.contentFrame();
  const canvas = frame.locator('canvas[aria-label="Interactive remote browser"]');

  await frame.getByText('live', { exact: true }).waitFor({ timeout: 30_000 });
  await canvas.waitFor({ state: 'visible', timeout: 30_000 });
  await canvas.evaluate(async (element) => {
    const canvas = element;
    const deadline = Date.now() + 30_000;

    while (Date.now() < deadline) {
      const context = canvas.getContext('2d');
      const pixels = context?.getImageData(0, 0, canvas.width, canvas.height).data;
      if (pixels?.some((value, index) => index % 4 !== 3 && value !== 0)) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new Error('Remote viewer did not render a nonblank browser frame');
  });
}

await main();
