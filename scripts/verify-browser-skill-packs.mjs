import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultSkillPackDir = path.resolve(repoRoot, 'examples/browser-skill-packs');
const skillPackDir = process.env.BROWSER_SKILL_PACK_VERIFY_DIR || defaultSkillPackDir;

const allowedStepTypes = new Set([
  'ask',
  'click',
  'fill',
  'inspect',
  'risk_gate',
  'select',
  'verify',
]);
const riskyStepTypes = new Set(['risk_gate']);
const riskyWords = /购买|下单|订单|支付|付款|删除|释放|销毁|退订|注销|授权|提交|开通|续费/;

function listJsonFiles(dir) {
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => path.join(dir, file));
}

function assertStringArray(pack, field) {
  assert(Array.isArray(pack[field]), `${field} must be an array`);
  assert(
    pack[field].every((item) => typeof item === 'string' && item),
    `${field} must contain strings`,
  );
}

function validateStep(step, context) {
  assert(step && typeof step === 'object', `${context}: step must be an object`);
  assert(typeof step.id === 'string' && step.id, `${context}: step.id is required`);
  assert(typeof step.title === 'string' && step.title, `${context}: step.title is required`);
  assert(allowedStepTypes.has(step.type), `${context}: unsupported step.type ${step.type}`);

  if (step.gaps !== undefined) {
    assert(Array.isArray(step.gaps), `${context}: step.gaps must be an array`);
    assert(
      step.gaps.every((gap) => typeof gap === 'string' && gap),
      `${context}: step.gaps must contain strings`,
    );
  }

  if (step.action !== undefined) {
    assert(
      step.action && typeof step.action === 'object',
      `${context}: step.action must be an object`,
    );
    assert(
      typeof step.action.selector === 'string' && step.action.selector,
      `${context}: step.action.selector is required`,
    );
    for (const key of ['inputKey', 'value', 'expectedText']) {
      assert(
        step.action[key] === undefined || typeof step.action[key] === 'string',
        `${context}: step.action.${key} must be a string`,
      );
    }
  }

  if ((riskyWords.test(step.title) || step.risk) && !riskyStepTypes.has(step.type)) {
    throw new Error(`${context}: risky step "${step.title}" must use risk_gate`);
  }
}

function validateSkillPack(file) {
  const pack = JSON.parse(readFileSync(file, 'utf8'));
  const label = path.relative(repoRoot, file);

  assert(typeof pack.site === 'string' && pack.site, `${label}: site is required`);
  assert(typeof pack.page === 'string' && pack.page, `${label}: page is required`);
  assert(typeof pack.pageType === 'string' && pack.pageType, `${label}: pageType is required`);
  assert(
    typeof pack.description === 'string' && pack.description,
    `${label}: description is required`,
  );

  assertStringArray(pack, 'entities');
  assertStringArray(pack, 'safeActions');
  assertStringArray(pack, 'riskActions');
  assertStringArray(pack, 'ambiguityRules');

  assert(
    Array.isArray(pack.workflows) && pack.workflows.length > 0,
    `${label}: workflows are required`,
  );

  if (pack.fillGaps !== undefined) {
    assert(Array.isArray(pack.fillGaps), `${label}: fillGaps must be an array`);
    for (const gap of pack.fillGaps) {
      assert(typeof gap.field === 'string' && gap.field, `${label}: fillGaps.field is required`);
      assert(typeof gap.mode === 'string' && gap.mode, `${label}: fillGaps.mode is required`);
      assert(typeof gap.reason === 'string' && gap.reason, `${label}: fillGaps.reason is required`);
    }
  }

  for (const [workflowIndex, workflow] of pack.workflows.entries()) {
    const workflowLabel = `${label}: workflow[${workflowIndex}]`;
    assert(
      typeof workflow.intent === 'string' && workflow.intent,
      `${workflowLabel}: intent is required`,
    );
    assert(
      typeof workflow.goal === 'string' && workflow.goal,
      `${workflowLabel}: goal is required`,
    );
    assert(
      Array.isArray(workflow.steps) && workflow.steps.length > 0,
      `${workflowLabel}: steps are required`,
    );

    for (const [stepIndex, step] of workflow.steps.entries()) {
      validateStep(step, `${workflowLabel}.steps[${stepIndex}]`);
    }
  }
}

assert(statSync(skillPackDir).isDirectory(), `${skillPackDir} must be a directory`);

const files = listJsonFiles(skillPackDir);
assert(files.length > 0, `No skill packs found in ${skillPackDir}`);

for (const file of files) validateSkillPack(file);

console.log(
  `Browser skill pack verification passed for ${files.length} file(s) in ${skillPackDir}`,
);
