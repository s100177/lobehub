import { spawn } from 'node:child_process';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const defaultRealSmokeUrls = 'https://example.com/,https://www.iana.org/';

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

console.log('\nBrowser release gate passed for non-deployment checks.');
console.log(
  'Remaining external gates: Docker UI E2E and user-provided real business-system evidence.',
);
