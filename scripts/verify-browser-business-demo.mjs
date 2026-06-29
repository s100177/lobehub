import { spawn } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const browserPort = Number.parseInt(process.env.BROWSER_BUSINESS_DEMO_PORT || '3340', 10);
const browserOrigin = `http://127.0.0.1:${browserPort}`;
const repoRoot = path.resolve(import.meta.dirname, '..');
const inRepoServiceDir = path.resolve(repoRoot, 'browser-service');
const deployedServiceDir = path.resolve(repoRoot, '..', 'browser-service');
const browserServiceDir = process.env.BROWSER_SERVICE_DIR || inRepoServiceDir;
const dependencyServiceDir = existsSync(path.resolve(browserServiceDir, 'node_modules'))
  ? browserServiceDir
  : deployedServiceDir;
const skillPacksDir = process.env.BROWSER_BUSINESS_SKILL_PACKS_DIR
  ? path.resolve(repoRoot, process.env.BROWSER_BUSINESS_SKILL_PACKS_DIR)
  : undefined;
const targetUrl = process.env.BROWSER_BUSINESS_DEMO_URL;
const intent = process.env.BROWSER_BUSINESS_DEMO_INTENT;
const expectedSkillPage = process.env.BROWSER_BUSINESS_EXPECT_SKILL_PAGE;
const expectedRiskAction = process.env.BROWSER_BUSINESS_EXPECT_RISK_ACTION;
const maxSteps = Number.parseInt(process.env.BROWSER_BUSINESS_DEMO_MAX_STEPS || '8', 10);
const inputs = process.env.BROWSER_BUSINESS_DEMO_INPUTS
  ? JSON.parse(process.env.BROWSER_BUSINESS_DEMO_INPUTS)
  : {};
const assertions = process.env.BROWSER_BUSINESS_ASSERTIONS
  ? JSON.parse(process.env.BROWSER_BUSINESS_ASSERTIONS)
  : [];
const evidenceFile = process.env.BROWSER_BUSINESS_EVIDENCE_FILE
  ? path.resolve(repoRoot, process.env.BROWSER_BUSINESS_EVIDENCE_FILE)
  : undefined;
const evidenceValidateFile = process.env.BROWSER_BUSINESS_EVIDENCE_VALIDATE_FILE
  ? path.resolve(repoRoot, process.env.BROWSER_BUSINESS_EVIDENCE_VALIDATE_FILE)
  : undefined;
let browserServiceRuntimeDir;

if (evidenceValidateFile) {
  validateEvidenceFile(evidenceValidateFile);
  process.exit(0);
}

if (!targetUrl) {
  throw new Error('BROWSER_BUSINESS_DEMO_URL is required for a real business-system demo');
}

if (!skillPacksDir) {
  throw new Error('BROWSER_BUSINESS_SKILL_PACKS_DIR is required');
}

if (!existsSync(skillPacksDir)) {
  throw new Error(`BROWSER_BUSINESS_SKILL_PACKS_DIR does not exist: ${skillPacksDir}`);
}

if (!Array.isArray(assertions)) {
  throw new Error('BROWSER_BUSINESS_ASSERTIONS must be a JSON array when provided');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function valuesEqual(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

async function runAssertions(sessionId) {
  const results = [];

  for (const [index, item] of assertions.entries()) {
    assert(item && typeof item === 'object', `Assertion ${index} must be an object`);
    assert(typeof item.code === 'string' && item.code, `Assertion ${index} requires code`);
    assert(
      Object.hasOwn(item, 'equals'),
      `Assertion ${item.name || index} requires an equals field`,
    );

    const evaluated = await request('/evaluate', { code: item.code }, sessionId);
    const passed = valuesEqual(evaluated.result, item.equals);
    assert(
      passed,
      `Assertion ${item.name || index} failed: expected ${JSON.stringify(
        item.equals,
      )}, got ${JSON.stringify(evaluated.result)}`,
    );
    results.push({
      code: item.code,
      expected: item.equals,
      name: item.name || `assertion-${index}`,
      passed,
      result: evaluated.result,
    });
  }

  return results;
}

function writeEvidence(data) {
  if (!evidenceFile) return;

  mkdirSync(path.dirname(evidenceFile), { recursive: true });
  writeFileSync(evidenceFile, `${JSON.stringify(data, null, 2)}\n`);
}

function validateEvidenceFile(file) {
  assert(existsSync(file), `Evidence file does not exist: ${file}`);

  const data = JSON.parse(readFileSync(file, 'utf8'));
  assert(typeof data.targetUrl === 'string' && data.targetUrl, 'Evidence targetUrl is required');
  assert(data.skillPack?.page, 'Evidence skillPack.page is required');
  assert(data.plan?.source === 'skill_pack', 'Evidence plan.source must be skill_pack');
  assert(
    data.executionState?.phase === 'risk_blocked',
    `Evidence executionState.phase must be risk_blocked, got ${data.executionState?.phase}`,
  );
  assert(data.blockedRiskEvent?.id, 'Evidence blockedRiskEvent.id is required');
  assert(
    Array.isArray(data.executionEvents) && data.executionEvents.length > 0,
    'Evidence executionEvents must be a non-empty array',
  );
  assert(
    data.executionEvents.some((event) => event.status === 'completed'),
    'Evidence must contain at least one completed execution event',
  );
  assert(
    data.executionEvents.some((event) => event.status === 'blocked'),
    'Evidence must contain at least one blocked execution event',
  );
  assert(Array.isArray(data.assertionResults), 'Evidence assertionResults must be an array');
  assert(
    data.assertionResults.every((item) => item?.passed === true),
    'Every evidence assertion must pass',
  );

  console.log(
    `Browser business demo evidence verification passed for ${data.targetUrl} with skill pack ${data.skillPack.page}`,
  );
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

async function request(pathname, body, sessionId) {
  const response = await fetch(`${browserOrigin}${pathname}`, {
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      'X-Session-ID': sessionId,
    },
    method: 'POST',
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`${pathname} failed: ${response.status} ${JSON.stringify(data)}`);
  }

  return data;
}

const browserService = spawn(process.execPath, ['index.js'], {
  cwd: createBrowserServiceRuntimeDir(),
  env: {
    ...process.env,
    BROWSER_SKILL_PACKS_DIR: skillPacksDir,
    PORT: String(browserPort),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

browserService.stdout.on('data', (chunk) => process.stdout.write(`[browser-service] ${chunk}`));
browserService.stderr.on('data', (chunk) => process.stderr.write(`[browser-service] ${chunk}`));

try {
  await waitForBrowserService();

  const sessionId = `business-demo-${Date.now()}`;
  const navigated = await request(
    '/navigate',
    { mode: 'remote', timeout: 30_000, url: targetUrl },
    sessionId,
  );

  assert(navigated.mode === 'remote', `Expected remote mode, got ${navigated.mode}`);
  assert(navigated.skillPack, `Expected matching skill pack, got ${JSON.stringify(navigated)}`);
  if (expectedSkillPage) {
    assert(
      navigated.skillPack?.page === expectedSkillPage,
      `Expected skill page ${expectedSkillPage}, got ${JSON.stringify(navigated.skillPack)}`,
    );
  }
  assert(
    navigated.plan?.source === 'skill_pack' && Array.isArray(navigated.plan.steps),
    `Expected skill-pack plan, got ${JSON.stringify(navigated.plan)}`,
  );

  const execution = await request(
    '/execute-plan',
    {
      inputs,
      intent,
      maxSteps,
    },
    sessionId,
  );

  assert(
    Array.isArray(execution.executionEvents) && execution.executionEvents.length > 0,
    `Expected execution events, got ${JSON.stringify(execution.executionEvents)}`,
  );
  assert(
    execution.executionEvents.some((event) => event.status === 'completed'),
    `Expected at least one completed safe step, got ${JSON.stringify(execution.executionEvents)}`,
  );
  assert(
    execution.executionState?.phase === 'risk_blocked',
    `Expected execution to stop at risk gate, got ${JSON.stringify(execution.executionState)}`,
  );

  const blockedRiskEvent = execution.executionEvents.find(
    (event) =>
      event.status === 'blocked' && /risky|风险|Execution stopped before/i.test(event.summary),
  );
  assert(
    blockedRiskEvent,
    `Expected blocked risk event, got ${JSON.stringify(execution.executionEvents)}`,
  );
  if (expectedRiskAction) {
    assert(
      execution.riskBlock?.risk === expectedRiskAction ||
        execution.executionState?.blockedStepId === expectedRiskAction ||
        blockedRiskEvent.id === expectedRiskAction,
      `Expected risk action ${expectedRiskAction}, got ${JSON.stringify({
        blockedRiskEvent,
        executionState: execution.executionState,
        riskBlock: execution.riskBlock,
      })}`,
    );
  }

  const assertionResults = await runAssertions(sessionId);

  writeEvidence({
    assertionResults,
    blockedRiskEvent,
    executionEvents: execution.executionEvents,
    executionState: execution.executionState,
    generatedAt: new Date().toISOString(),
    inputs,
    plan: navigated.plan,
    skillPack: navigated.skillPack,
    targetUrl,
  });

  console.log(
    `Browser business demo verification passed for ${targetUrl} with skill pack ${navigated.skillPack.page} and ${assertions.length} assertion(s)`,
  );
  if (evidenceFile) console.log(`Evidence written to ${evidenceFile}`);
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
