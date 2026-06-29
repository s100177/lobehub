import assert from 'node:assert/strict';
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

import { loadValidatedSkillPacks } from './verify-browser-skill-packs.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');

loadEnvFile(process.env.BROWSER_BUSINESS_ENV_FILE);

const browserPort = Number.parseInt(process.env.BROWSER_BUSINESS_DEMO_PORT || '3340', 10);
const browserOrigin = `http://127.0.0.1:${browserPort}`;
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
const evidenceSummaryFile = process.env.BROWSER_BUSINESS_EVIDENCE_SUMMARY_FILE
  ? path.resolve(repoRoot, process.env.BROWSER_BUSINESS_EVIDENCE_SUMMARY_FILE)
  : undefined;
const preflightReportFile = process.env.BROWSER_BUSINESS_PREFLIGHT_REPORT_FILE
  ? path.resolve(repoRoot, process.env.BROWSER_BUSINESS_PREFLIGHT_REPORT_FILE)
  : undefined;
const preflightOnly = process.env.BROWSER_BUSINESS_PREFLIGHT === '1';
const verifierVersion = 2;
let browserServiceRuntimeDir;

if (evidenceValidateFile) {
  validateEvidenceFile(evidenceValidateFile);
  process.exit(0);
}

const demoConfiguration = validateDemoConfiguration();

if (preflightOnly) {
  writePreflightReport(demoConfiguration);
  console.log(`Browser business demo preflight passed for ${targetUrl}`);
  if (preflightReportFile) console.log(`Preflight report written to ${preflightReportFile}`);
  process.exit(0);
}

function loadEnvFile(file) {
  if (!file) return;

  const envFile = path.resolve(repoRoot, file);
  assert(existsSync(envFile), `BROWSER_BUSINESS_ENV_FILE does not exist: ${envFile}`);

  const lines = readFileSync(envFile, 'utf8').split(/\r?\n/);
  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separatorIndex = line.indexOf('=');
    assert(separatorIndex > 0, `${envFile}:${index + 1} must use KEY=value syntax`);

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1);
    assert(/^[A-Z0-9_]+$/.test(key), `${envFile}:${index + 1} has invalid key "${key}"`);
    if (process.env[key] !== undefined) continue;

    process.env[key] = unquoteEnvValue(rawValue.trim());
  }
}

function unquoteEnvValue(value) {
  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function validateDemoConfiguration() {
  assert(targetUrl, 'BROWSER_BUSINESS_DEMO_URL is required for a real business-system demo');
  assert(skillPacksDir, 'BROWSER_BUSINESS_SKILL_PACKS_DIR is required');
  assert(
    existsSync(skillPacksDir),
    `BROWSER_BUSINESS_SKILL_PACKS_DIR does not exist: ${skillPacksDir}`,
  );
  assert(intent, 'BROWSER_BUSINESS_DEMO_INTENT is required');
  assert(expectedSkillPage, 'BROWSER_BUSINESS_EXPECT_SKILL_PAGE is required');
  assert(expectedRiskAction, 'BROWSER_BUSINESS_EXPECT_RISK_ACTION is required');
  assert(evidenceFile, 'BROWSER_BUSINESS_EVIDENCE_FILE is required');
  assert(Array.isArray(assertions), 'BROWSER_BUSINESS_ASSERTIONS must be a JSON array');
  assert(
    assertions.length > 0,
    'BROWSER_BUSINESS_ASSERTIONS must include at least one side-effect assertion',
  );

  for (const [index, item] of assertions.entries()) {
    assert(item && typeof item === 'object', `Assertion ${index} must be an object`);
    assert(typeof item.code === 'string' && item.code, `Assertion ${index} requires code`);
    assert(
      Object.hasOwn(item, 'equals'),
      `Assertion ${item.name || index} requires an equals field`,
    );
  }

  const skillPacks = loadValidatedSkillPacks(skillPacksDir);
  const expectedPack = skillPacks.find(({ pack }) => pack.page === expectedSkillPage);
  assert(
    expectedPack,
    `BROWSER_BUSINESS_EXPECT_SKILL_PAGE "${expectedSkillPage}" was not found in ${skillPacksDir}`,
  );
  const expectedWorkflow = expectedPack.pack.workflows.find(
    (workflow) => workflow.intent === intent,
  );
  assert(
    expectedWorkflow,
    `BROWSER_BUSINESS_DEMO_INTENT "${intent}" was not found in skill page ${expectedSkillPage}`,
  );
  const firstRiskGateStep = expectedWorkflow.steps.find((step) => step.type === 'risk_gate');
  assert(firstRiskGateStep, `Workflow ${intent} must contain a risk_gate`);
  assert(
    riskGateMatches(firstRiskGateStep, expectedRiskAction),
    `BROWSER_BUSINESS_EXPECT_RISK_ACTION "${expectedRiskAction}" must match the first risk_gate in workflow ${intent}, got ${JSON.stringify(
      {
        id: firstRiskGateStep.id,
        risk: firstRiskGateStep.risk,
        riskAction: firstRiskGateStep.riskAction,
      },
    )}`,
  );

  const requiredInputKeys = collectRequiredInputKeys(expectedWorkflow);
  assertWorkflowInputsProvided(requiredInputKeys);

  return {
    firstRiskGateStep,
    requiredInputKeys,
    skillPack: expectedPack.pack,
    workflow: expectedWorkflow,
  };
}

function riskGateMatches(step, expected) {
  return step.id === expected || step.riskAction === expected || step.risk === expected;
}

function collectRequiredInputKeys(workflow) {
  return [
    ...new Set(
      workflow.steps
        .map((step) => step.action?.inputKey)
        .filter((inputKey) => typeof inputKey === 'string' && inputKey),
    ),
  ];
}

function assertWorkflowInputsProvided(requiredInputKeys) {
  const missingInputs = [];

  for (const inputKey of requiredInputKeys) {
    const value = inputs[inputKey];
    if (typeof value === 'string' && value.trim()) continue;

    missingInputs.push(inputKey);
  }

  assert(
    missingInputs.length === 0,
    `BROWSER_BUSINESS_DEMO_INPUTS is missing required workflow input(s): ${missingInputs.join(
      ', ',
    )}`,
  );
}

function writePreflightReport(configuration) {
  if (!preflightReportFile) return;

  const report = {
    assertionCount: assertions.length,
    expectedRiskAction,
    generatedAt: new Date().toISOString(),
    inputKeysProvided: Object.keys(inputs).sort(),
    passed: true,
    preflightOnly: true,
    requiredInputKeys: configuration.requiredInputKeys,
    riskGateStep: {
      id: configuration.firstRiskGateStep.id,
      risk: configuration.firstRiskGateStep.risk,
      riskAction: configuration.firstRiskGateStep.riskAction,
    },
    skillPack: {
      page: configuration.skillPack.page,
      site: configuration.skillPack.site,
    },
    targetAccessed: false,
    targetUrl,
    verifierVersion,
    workflow: {
      intent: configuration.workflow.intent,
      stepCount: configuration.workflow.steps.length,
    },
  };

  mkdirSync(path.dirname(preflightReportFile), { recursive: true });
  writeFileSync(preflightReportFile, `${JSON.stringify(report, null, 2)}\n`);
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
  assert(
    data.verifierVersion === verifierVersion,
    `Evidence verifierVersion must be ${verifierVersion}, got ${data.verifierVersion}`,
  );
  assert(typeof data.targetUrl === 'string' && data.targetUrl, 'Evidence targetUrl is required');
  assert(data.skillPack?.page, 'Evidence skillPack.page is required');
  assert(data.plan?.source === 'skill_pack', 'Evidence plan.source must be skill_pack');
  assert(
    data.riskGateStep?.type === 'risk_gate',
    `Evidence riskGateStep.type must be risk_gate, got ${data.riskGateStep?.type}`,
  );
  assert(
    data.riskGateStep?.id && data.riskGateStep.id === data.blockedRiskEvent?.id,
    `Evidence riskGateStep.id must match blockedRiskEvent.id, got ${JSON.stringify({
      blockedRiskEvent: data.blockedRiskEvent,
      riskGateStep: data.riskGateStep,
    })}`,
  );
  assert(
    data.authorizationGate?.taskState === 'waiting_user_authorization',
    `Evidence authorizationGate.taskState must be waiting_user_authorization, got ${data.authorizationGate?.taskState}`,
  );
  assert(
    data.authorizationGate?.executionState?.phase === 'waiting_authorization',
    `Evidence authorizationGate.executionState.phase must be waiting_authorization, got ${data.authorizationGate?.executionState?.phase}`,
  );
  assert(
    data.authorizationGate?.executionEvents?.some(
      (event) => event.id === 'authorization_required' && event.status === 'blocked',
    ),
    'Evidence authorizationGate must contain blocked authorization_required event',
  );
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
    data.sideEffectAssertionsRequired === true,
    'Evidence sideEffectAssertionsRequired must be true',
  );
  assert(
    data.assertionResults.length > 0,
    'Evidence must contain at least one side-effect assertion',
  );
  assert(
    data.assertionResults.every((item) => item?.passed === true),
    'Every evidence assertion must pass',
  );

  writeEvidenceSummary(data);

  console.log(
    `Browser business demo evidence verification passed for ${data.targetUrl} with skill pack ${data.skillPack.page}`,
  );
  if (evidenceSummaryFile) console.log(`Evidence summary written to ${evidenceSummaryFile}`);
}

function writeEvidenceSummary(data) {
  if (!evidenceSummaryFile) return;

  const completedEvents = data.executionEvents.filter((event) => event.status === 'completed');
  const blockedEvents = data.executionEvents.filter((event) => event.status === 'blocked');
  const summary = {
    assertionCount: data.assertionResults.length,
    authorizationGate: {
      phase: data.authorizationGate.executionState.phase,
      taskState: data.authorizationGate.taskState,
    },
    blockedEventCount: blockedEvents.length,
    blockedRiskEventId: data.blockedRiskEvent.id,
    completedEventCount: completedEvents.length,
    generatedAt: new Date().toISOString(),
    page: data.skillPack.page,
    passed: true,
    planSource: data.plan.source,
    riskGateStepId: data.riskGateStep.id,
    targetUrl: data.targetUrl,
    verifierVersion,
  };

  mkdirSync(path.dirname(evidenceSummaryFile), { recursive: true });
  writeFileSync(evidenceSummaryFile, `${JSON.stringify(summary, null, 2)}\n`);
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
  const riskGateStep = navigated.plan.steps.find((step) => step.type === 'risk_gate');
  assert(
    riskGateStep,
    `Expected skill-pack plan to contain a risk_gate, got ${JSON.stringify(navigated.plan.steps)}`,
  );
  assert(
    assertions.length > 0,
    'BROWSER_BUSINESS_ASSERTIONS must include at least one side-effect assertion',
  );

  const authorizationGate = await request(
    '/execute-plan',
    {
      inputs,
      intent,
      maxSteps,
    },
    sessionId,
  );
  assert(
    authorizationGate.taskState === 'waiting_user_authorization',
    `Expected execution without authorization to wait for user authorization, got ${JSON.stringify({
      executionEvents: authorizationGate.executionEvents,
      executionState: authorizationGate.executionState,
      taskState: authorizationGate.taskState,
    })}`,
  );
  assert(
    authorizationGate.executionState?.phase === 'waiting_authorization',
    `Expected waiting_authorization phase before approval, got ${JSON.stringify(
      authorizationGate.executionState,
    )}`,
  );

  const execution = await request(
    '/execute-plan',
    {
      authorized: true,
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
    authorizationGate: {
      executionEvents: authorizationGate.executionEvents,
      executionState: authorizationGate.executionState,
      taskState: authorizationGate.taskState,
    },
    blockedRiskEvent,
    executionEvents: execution.executionEvents,
    executionState: execution.executionState,
    generatedAt: new Date().toISOString(),
    inputs,
    plan: navigated.plan,
    riskGateStep,
    sideEffectAssertionsRequired: true,
    skillPack: navigated.skillPack,
    targetUrl,
    verifierVersion,
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
