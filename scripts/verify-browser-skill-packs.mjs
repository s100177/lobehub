import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
const executableStepTypes = new Set(['click', 'fill', 'select', 'verify']);
const inputStepTypes = new Set(['fill', 'select']);
const executionPolicyModes = new Set(['auto', 'ask_user', 'manual_only', 'confirm_before']);

function listJsonFiles(dir) {
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => path.join(dir, file));
}

function assertStringArray(owner, field, context) {
  assert(Array.isArray(owner[field]), `${context}: ${field} must be an array`);
  assert(
    owner[field].every((item) => typeof item === 'string' && item),
    `${context}: ${field} must contain strings`,
  );
}

function validateObjectArray(items, context, validateItem) {
  assert(Array.isArray(items), `${context} must be an array`);
  for (const [index, item] of items.entries()) validateItem(item, `${context}[${index}]`);
}

function validateStep(step, context, packContext) {
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
    for (const gap of step.gaps) {
      assert(
        packContext.fillGapFields.has(gap),
        `${context}: gap "${gap}" must be declared in fillGaps`,
      );
    }
  }

  if (executableStepTypes.has(step.type)) {
    assert(step.action !== undefined, `${context}: ${step.type} step requires action`);
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

    if (step.action.inputKey !== undefined) {
      assert(
        inputStepTypes.has(step.type),
        `${context}: step.action.inputKey is only supported on fill/select steps`,
      );
      assert(
        packContext.fillGapFields.has(step.action.inputKey),
        `${context}: action.inputKey "${step.action.inputKey}" must be declared in fillGaps`,
      );
    }
  }

  if (step.type === 'verify') {
    assert(
      typeof step.action?.expectedText === 'string' && step.action.expectedText,
      `${context}: verify step requires action.expectedText`,
    );
  }

  if (step.type === 'risk_gate') {
    assert(typeof step.risk === 'string' && step.risk, `${context}: risk_gate requires risk`);
    assert(
      typeof step.riskAction === 'string' && step.riskAction,
      `${context}: risk_gate requires riskAction`,
    );
    assert(
      packContext.riskActions.has(step.riskAction),
      `${context}: riskAction "${step.riskAction}" must be declared in riskActions`,
    );
    assert(
      typeof step.confirmationPoint === 'string' && step.confirmationPoint,
      `${context}: risk_gate requires confirmationPoint`,
    );
    assert(
      packContext.confirmationPointIds.has(step.confirmationPoint),
      `${context}: confirmationPoint "${step.confirmationPoint}" must be declared in confirmationPoints`,
    );
  }

  if ((riskyWords.test(step.title) || step.risk) && !riskyStepTypes.has(step.type)) {
    throw new Error(`${context}: risky step "${step.title}" must use risk_gate`);
  }
}

function validateWorkflowLayers(workflow, workflowLabel) {
  if (workflow.layers === undefined) return;

  assert(
    workflow.layers && typeof workflow.layers === 'object' && !Array.isArray(workflow.layers),
    `${workflowLabel}: layers must be an object`,
  );

  const { constraints, execution, goal } = workflow.layers;
  assert(goal && typeof goal === 'object', `${workflowLabel}: layers.goal is required`);
  assert(
    typeof goal.intent === 'string' && goal.intent,
    `${workflowLabel}: layers.goal.intent is required`,
  );
  assert(
    typeof goal.description === 'string' && goal.description,
    `${workflowLabel}: layers.goal.description is required`,
  );
  assert.equal(
    goal.intent,
    workflow.intent,
    `${workflowLabel}: layers.goal.intent must match workflow.intent`,
  );
  assert.equal(
    goal.description,
    workflow.goal,
    `${workflowLabel}: layers.goal.description must match workflow.goal`,
  );

  assert(
    constraints && typeof constraints === 'object',
    `${workflowLabel}: layers.constraints is required`,
  );
  assertStringArray(constraints, 'rules', `${workflowLabel}: layers.constraints`);
  assert.deepEqual(
    constraints.rules,
    workflow.constraints,
    `${workflowLabel}: layers.constraints.rules must match workflow.constraints`,
  );
  if (constraints.forbiddenActions !== undefined) {
    assertStringArray(constraints, 'forbiddenActions', `${workflowLabel}: layers.constraints`);
  }
  if (constraints.riskActions !== undefined) {
    assertStringArray(constraints, 'riskActions', `${workflowLabel}: layers.constraints`);
  }

  assert(
    execution && typeof execution === 'object',
    `${workflowLabel}: layers.execution is required`,
  );
  if (execution.inputPolicy !== undefined) {
    assert(
      execution.inputPolicy &&
        typeof execution.inputPolicy === 'object' &&
        !Array.isArray(execution.inputPolicy),
      `${workflowLabel}: layers.execution.inputPolicy must be an object`,
    );
    for (const [field, mode] of Object.entries(execution.inputPolicy)) {
      assert(
        typeof field === 'string' && field,
        `${workflowLabel}: layers.execution.inputPolicy field is required`,
      );
      assert(
        executionPolicyModes.has(mode),
        `${workflowLabel}: layers.execution.inputPolicy.${field} has unsupported mode ${mode}`,
      );
    }
  }
  if (execution.resumePolicy !== undefined) {
    assert(
      typeof execution.resumePolicy === 'string' && execution.resumePolicy,
      `${workflowLabel}: layers.execution.resumePolicy must be a string`,
    );
  }
  if (execution.steps !== undefined) {
    assertStringArray(execution, 'steps', `${workflowLabel}: layers.execution`);
    assert.deepEqual(
      execution.steps,
      workflow.steps.map((step) => step.id),
      `${workflowLabel}: layers.execution.steps must match workflow step ids`,
    );
  }
}

function validateSkillPackData(pack, label) {
  assert(typeof pack.site === 'string' && pack.site, `${label}: site is required`);
  assert(typeof pack.page === 'string' && pack.page, `${label}: page is required`);
  assert(typeof pack.pageType === 'string' && pack.pageType, `${label}: pageType is required`);
  assert(
    typeof pack.description === 'string' && pack.description,
    `${label}: description is required`,
  );

  assertStringArray(pack, 'entities', label);
  assertStringArray(pack, 'safeActions', label);
  assertStringArray(pack, 'riskActions', label);
  assertStringArray(pack, 'ambiguityRules', label);

  assert(
    Array.isArray(pack.workflows) && pack.workflows.length > 0,
    `${label}: workflows are required`,
  );

  const confirmationPointIds = new Set();
  if (pack.confirmationPoints !== undefined) {
    validateObjectArray(
      pack.confirmationPoints,
      `${label}: confirmationPoints`,
      (point, context) => {
        assert(
          point && typeof point === 'object',
          `${context}: confirmation point must be an object`,
        );
        assert(typeof point.id === 'string' && point.id, `${context}: id is required`);
        assert(typeof point.title === 'string' && point.title, `${context}: title is required`);
        assert(typeof point.reason === 'string' && point.reason, `${context}: reason is required`);
        confirmationPointIds.add(point.id);
      },
    );
  }

  if (pack.riskActions.length > 0) {
    assert(
      confirmationPointIds.size > 0,
      `${label}: riskActions require at least one confirmationPoint`,
    );
  }

  const fillGapFields = new Set();
  if (pack.fillGaps !== undefined) {
    validateObjectArray(pack.fillGaps, `${label}: fillGaps`, (gap, context) => {
      assert(typeof gap.field === 'string' && gap.field, `${context}: field is required`);
      assert(typeof gap.mode === 'string' && gap.mode, `${context}: mode is required`);
      assert(typeof gap.reason === 'string' && gap.reason, `${context}: reason is required`);
      fillGapFields.add(gap.field);
    });
  }

  if (pack.match !== undefined) {
    assert(pack.match && typeof pack.match === 'object', `${label}: match must be an object`);
    if (pack.match.keywords !== undefined)
      assertStringArray(pack.match, 'keywords', `${label}: match`);
    if (pack.match.paths !== undefined) assertStringArray(pack.match, 'paths', `${label}: match`);
    assert(
      pack.match.keywords !== undefined ||
        pack.match.paths !== undefined ||
        typeof pack.match.pageType === 'string',
      `${label}: match requires keywords, paths, or pageType`,
    );
  }

  const riskActions = new Set(pack.riskActions);
  const packContext = { confirmationPointIds, fillGapFields, riskActions };

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
    assertStringArray(workflow, 'constraints', workflowLabel);
    assert(
      Array.isArray(workflow.steps) && workflow.steps.length > 0,
      `${workflowLabel}: steps are required`,
    );
    validateWorkflowLayers(workflow, workflowLabel);

    for (const [stepIndex, step] of workflow.steps.entries()) {
      validateStep(step, `${workflowLabel}.steps[${stepIndex}]`, packContext);
    }
  }
}

export function readSkillPack(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function validateSkillPack(file) {
  const pack = JSON.parse(readFileSync(file, 'utf8'));
  validateSkillPackData(pack, path.relative(repoRoot, file));
}

function createValidPack(overrides = {}) {
  return {
    ambiguityRules: ['字段缺失时询问用户'],
    confirmationPoints: [{ id: 'before_submit', reason: '提交后进入流程', title: '提交前确认' }],
    description: '测试业务表单',
    entities: ['department', 'reason'],
    fillGaps: [{ field: 'department', mode: 'ask_user', reason: '影响业务流转' }],
    page: 'test_form',
    pageType: 'form',
    riskActions: ['submit_form'],
    safeActions: ['inspect_form'],
    site: 'example.test',
    workflows: [
      {
        constraints: ['提交前必须等待用户确认'],
        goal: '补齐表单并停在提交前',
        intent: 'submit_test_form',
        layers: {
          constraints: {
            forbiddenActions: ['submit_form'],
            riskActions: ['submit_form'],
            rules: ['提交前必须等待用户确认'],
          },
          execution: {
            inputPolicy: { department: 'ask_user' },
            resumePolicy: 'inspect_before_resume',
            steps: ['inspect', 'select_department', 'risk_gate'],
          },
          goal: {
            description: '补齐表单并停在提交前',
            intent: 'submit_test_form',
          },
        },
        steps: [
          { id: 'inspect', title: '读取页面状态', type: 'inspect' },
          {
            action: { inputKey: 'department', selector: '#department' },
            gaps: ['department'],
            id: 'select_department',
            title: '选择部门',
            type: 'select',
          },
          {
            confirmationPoint: 'before_submit',
            id: 'risk_gate',
            risk: 'submit',
            riskAction: 'submit_form',
            title: '提交前等待用户确认',
            type: 'risk_gate',
          },
        ],
      },
    ],
    ...overrides,
  };
}

function expectInvalid(pack, pattern, label) {
  try {
    validateSkillPackData(pack, label);
  } catch (error) {
    assert(
      pattern.test(error instanceof Error ? error.message : String(error)),
      `${label}: expected ${pattern}, got ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }

  throw new Error(`${label}: expected validation failure`);
}

function runSelfTests() {
  validateSkillPackData(createValidPack(), 'self-test: valid pack');
  expectInvalid(
    createValidPack({
      workflows: [
        {
          goal: '缺少约束层',
          intent: 'missing_constraints',
          steps: [{ id: 'inspect', title: '读取页面状态', type: 'inspect' }],
        },
      ],
    }),
    /constraints/,
    'self-test: missing constraints',
  );
  expectInvalid(
    createValidPack({
      workflows: [
        {
          constraints: ['提交前必须确认'],
          goal: '错误风险点击',
          intent: 'risky_click',
          steps: [
            {
              action: { selector: '#submit' },
              id: 'submit',
              title: '提交审批',
              type: 'click',
            },
          ],
        },
      ],
    }),
    /must use risk_gate/,
    'self-test: risky click',
  );
  expectInvalid(
    createValidPack({
      workflows: [
        {
          constraints: ['提交前必须确认'],
          goal: '风险门缺少确认点',
          intent: 'missing_confirmation',
          steps: [
            {
              id: 'risk_gate',
              risk: 'submit',
              riskAction: 'submit_form',
              title: '提交前等待用户确认',
              type: 'risk_gate',
            },
          ],
        },
      ],
    }),
    /confirmationPoint/,
    'self-test: missing confirmation point',
  );
  expectInvalid(
    createValidPack({
      workflows: [
        {
          constraints: ['缺字段时必须询问'],
          goal: '引用未声明缺口',
          intent: 'unknown_gap',
          steps: [
            {
              action: { inputKey: 'budget', selector: '#budget' },
              gaps: ['budget'],
              id: 'fill_budget',
              title: '填写预算',
              type: 'fill',
            },
          ],
        },
      ],
    }),
    /must be declared in fillGaps/,
    'self-test: undeclared input gap',
  );
  expectInvalid(
    createValidPack({
      workflows: [
        {
          constraints: ['提交前必须确认'],
          goal: '层级目标漂移',
          intent: 'layer_drift',
          layers: {
            constraints: {
              rules: ['提交前必须确认'],
            },
            execution: {
              steps: ['inspect'],
            },
            goal: {
              description: '另一个目标',
              intent: 'layer_drift',
            },
          },
          steps: [{ id: 'inspect', title: '读取页面状态', type: 'inspect' }],
        },
      ],
    }),
    /layers\.goal\.description must match workflow\.goal/,
    'self-test: layers goal drift',
  );
  expectInvalid(
    createValidPack({
      workflows: [
        {
          constraints: ['提交前必须确认'],
          goal: '层级步骤漂移',
          intent: 'layer_step_drift',
          layers: {
            constraints: {
              rules: ['提交前必须确认'],
            },
            execution: {
              steps: ['inspect', 'missing_step'],
            },
            goal: {
              description: '层级步骤漂移',
              intent: 'layer_step_drift',
            },
          },
          steps: [{ id: 'inspect', title: '读取页面状态', type: 'inspect' }],
        },
      ],
    }),
    /layers\.execution\.steps must match workflow step ids/,
    'self-test: layers execution drift',
  );
}

export function validateSkillPackDirectory(directory = skillPackDir) {
  runSelfTests();

  assert(statSync(directory).isDirectory(), `${directory} must be a directory`);

  const files = listJsonFiles(directory);
  assert(files.length > 0, `No skill packs found in ${directory}`);

  for (const file of files) validateSkillPack(file);

  return files;
}

export function loadValidatedSkillPacks(directory = skillPackDir) {
  const files = validateSkillPackDirectory(directory);
  return files.map((file) => ({ file, pack: readSkillPack(file) }));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = validateSkillPackDirectory(skillPackDir);
  console.log(
    `Browser skill pack verification passed for ${files.length} file(s) in ${skillPackDir}`,
  );
}
