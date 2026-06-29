import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const preflightFile = resolveRequiredFile(
  'BROWSER_BUSINESS_PREFLIGHT_REPORT_FILE',
  process.env.BROWSER_BUSINESS_PREFLIGHT_REPORT_FILE,
);
const evidenceFile = resolveRequiredFile(
  'BROWSER_BUSINESS_EVIDENCE_FILE',
  process.env.BROWSER_BUSINESS_EVIDENCE_FILE,
);
const summaryFile = resolveRequiredFile(
  'BROWSER_BUSINESS_EVIDENCE_SUMMARY_FILE',
  process.env.BROWSER_BUSINESS_EVIDENCE_SUMMARY_FILE,
);

const preflight = readJson(preflightFile);
const evidence = readJson(evidenceFile);
const summary = readJson(summaryFile);

assert(preflight.passed === true, 'Preflight report must be passed');
assert(preflight.targetAccessed === false, 'Preflight report must prove targetAccessed:false');
assert(summary.passed === true, 'Evidence summary must be passed');

assert.equal(preflight.targetUrl, evidence.targetUrl, 'Preflight targetUrl must match evidence');
assert.equal(summary.targetUrl, evidence.targetUrl, 'Summary targetUrl must match evidence');
assert.equal(
  preflight.skillPack?.page,
  evidence.skillPack?.page,
  'Preflight page must match evidence',
);
assert.equal(summary.page, evidence.skillPack?.page, 'Summary page must match evidence');
assert.equal(
  preflight.workflow?.intent,
  evidence.plan?.intent,
  'Preflight workflow intent must match evidence plan',
);
assert.equal(evidence.plan?.source, 'skill_pack', 'Evidence plan.source must be skill_pack');
assert.equal(summary.planSource, 'skill_pack', 'Summary planSource must be skill_pack');
assert.equal(
  preflight.riskGateStep?.id,
  evidence.riskGateStep?.id,
  'Preflight risk gate must match evidence',
);
assert.equal(
  summary.riskGateStepId,
  evidence.riskGateStep?.id,
  'Summary risk gate must match evidence',
);
assert.equal(
  evidence.riskGateStep?.id,
  evidence.blockedRiskEvent?.id,
  'Evidence riskGateStep.id must match blockedRiskEvent.id',
);

const completedEventCount = evidence.executionEvents.filter(
  (event) => event.status === 'completed',
).length;
const blockedEventCount = evidence.executionEvents.filter(
  (event) => event.status === 'blocked',
).length;
assert.equal(
  summary.completedEventCount,
  completedEventCount,
  'Summary completedEventCount must match evidence',
);
assert.equal(
  summary.blockedEventCount,
  blockedEventCount,
  'Summary blockedEventCount must match evidence',
);
assert.equal(
  summary.assertionCount,
  evidence.assertionResults.length,
  'Summary assertionCount must match evidence',
);
assert.equal(
  preflight.assertionCount,
  evidence.assertionResults.length,
  'Preflight assertionCount must match evidence',
);

console.log(
  `Browser business evidence bundle verification passed for ${evidence.targetUrl} with skill pack ${evidence.skillPack.page}`,
);

function resolveRequiredFile(name, value) {
  assert(value, `${name} is required`);

  const file = path.resolve(repoRoot, value);
  assert(existsSync(file), `${name} does not exist: ${file}`);

  return file;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}
