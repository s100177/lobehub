import { spawn } from 'node:child_process';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const defaultRealSmokeUrls = 'https://example.com/,https://www.iana.org/';
const includeBusinessEvidence = process.env.BROWSER_RELEASE_GATE_INCLUDE_BUSINESS_EVIDENCE === '1';
const includeDockerUiE2e = process.env.BROWSER_RELEASE_GATE_INCLUDE_DOCKER_E2E === '1';
const includeIframeExperience = process.env.BROWSER_RELEASE_GATE_INCLUDE_IFRAME_EXPERIENCE === '1';

const steps = [
  {
    args: ['scripts/verify-browser-skill-packs.mjs'],
    name: 'Browser skill-pack static validation',
  },
  {
    args: ['scripts/verify-browser-agent-product.mjs'],
    name: 'KiKi-style browser agent product verification',
  },
  {
    args: ['scripts/verify-browser-business-demo-local.mjs'],
    name: 'Local business-system demo evidence verification',
  },
  {
    args: ['scripts/verify-browser-real-smoke.mjs'],
    env: { BROWSER_REAL_SMOKE_URLS: process.env.BROWSER_REAL_SMOKE_URLS || defaultRealSmokeUrls },
    name: 'Real-site read-only browser smoke verification',
  },
];

if (includeDockerUiE2e) {
  steps.push({
    args: ['scripts/verify-browser-docker-ui-e2e.mjs'],
    name: 'Docker deployment browser UI E2E verification',
  });
}

if (includeIframeExperience) {
  steps.push({
    args: ['scripts/verify-browser-iframe-business-demo.mjs'],
    name: 'Deployed iframe interaction experience verification',
  });
}

if (includeBusinessEvidence) {
  steps.push({
    args: ['scripts/run-browser-business-demo-evidence.mjs'],
    name: 'User-provided real business-system evidence verification',
  });
}

function runStep(step) {
  return new Promise((resolve, reject) => {
    console.log(`\n[browser-release-gate] ${step.name}`);
    const child = spawn(process.execPath, step.args, {
      cwd: repoRoot,
      env: step.env ? { ...process.env, ...step.env } : process.env,
      stdio: 'inherit',
    });

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${step.name} failed with ${signal || `exit code ${code}`}`));
    });
  });
}

for (const step of steps) {
  await runStep(step);
}

const externalGates = [
  {
    enabled: includeDockerUiE2e,
    name: 'Docker UI E2E',
    setup:
      'Set BROWSER_RELEASE_GATE_INCLUDE_DOCKER_E2E=1 with BROWSER_DOCKER_E2E_BASE_URL and BROWSER_DOCKER_E2E_DATABASE_URL.',
  },
  {
    enabled: includeIframeExperience,
    name: 'iframe interaction experience',
    setup: 'Set BROWSER_RELEASE_GATE_INCLUDE_IFRAME_EXPERIENCE=1 with BROWSER_IFRAME_DEMO_URL.',
  },
  {
    enabled: includeBusinessEvidence,
    name: 'user-provided real business-system evidence',
    setup: 'Set BROWSER_RELEASE_GATE_INCLUDE_BUSINESS_EVIDENCE=1 with BROWSER_BUSINESS_ENV_FILE.',
  },
];
const passedExternalGates = externalGates.filter((gate) => gate.enabled);
const pendingExternalGates = externalGates.filter((gate) => !gate.enabled);

console.log(
  `\nBrowser release gate passed for non-deployment checks${
    passedExternalGates.length > 0
      ? ` and ${passedExternalGates.map((gate) => gate.name).join(', ')}`
      : ''
  }.`,
);
if (pendingExternalGates.length > 0) {
  console.log(
    `Remaining external gates: ${pendingExternalGates.map((gate) => gate.name).join(', ')}.`,
  );
  for (const gate of pendingExternalGates) console.log(gate.setup);
}
