import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const envFile = process.env.BROWSER_BUSINESS_ENV_FILE;
const verifier = path.resolve(repoRoot, 'scripts/verify-browser-business-demo.mjs');

assert(envFile, 'BROWSER_BUSINESS_ENV_FILE is required');

const envFilePath = path.resolve(repoRoot, envFile);
assert(existsSync(envFilePath), `BROWSER_BUSINESS_ENV_FILE does not exist: ${envFilePath}`);

const fileEnv = readEnvFile(envFilePath);
const evidenceFile =
  process.env.BROWSER_BUSINESS_EVIDENCE_FILE || fileEnv.BROWSER_BUSINESS_EVIDENCE_FILE;
assert(evidenceFile, 'BROWSER_BUSINESS_EVIDENCE_FILE is required in env or env file');

await runVerifier('Preflight browser business demo configuration', {
  BROWSER_BUSINESS_PREFLIGHT: '1',
});

await runVerifier('Run browser business demo and write evidence', {});

await runVerifier('Validate browser business demo evidence', {
  BROWSER_BUSINESS_EVIDENCE_VALIDATE_FILE: evidenceFile,
});

console.log(`Browser business demo evidence pipeline passed for ${envFilePath}`);

function readEnvFile(file) {
  const result = {};

  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separatorIndex = line.indexOf('=');
    assert(separatorIndex > 0, `${file}:${index + 1} must use KEY=value syntax`);

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1);
    assert(/^[A-Z0-9_]+$/.test(key), `${file}:${index + 1} has invalid key "${key}"`);
    result[key] = unquoteEnvValue(rawValue.trim());
  }

  return result;
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

function runVerifier(name, env) {
  return new Promise((resolve, reject) => {
    console.log(`\n[browser-business-demo-evidence] ${name}`);
    const child = spawn(process.execPath, [verifier], {
      cwd: repoRoot,
      env: {
        ...process.env,
        BROWSER_BUSINESS_ENV_FILE: envFilePath,
        ...env,
      },
      stdio: 'inherit',
    });

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${name} failed with ${signal || `exit code ${code}`}`));
    });
  });
}
