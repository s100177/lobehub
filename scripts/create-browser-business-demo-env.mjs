import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const defaultDemoPath = '/browser-business-demo/expense-approval';
const targetUrl = process.env.BROWSER_BUSINESS_DEMO_TARGET_URL || process.argv[2];
const outputDir = path.resolve(
  repoRoot,
  process.env.BROWSER_BUSINESS_DEMO_OUTPUT_DIR || '.omx/artifacts/browser-business-demo',
);

if (!targetUrl) {
  console.error(
    'Usage: node scripts/create-browser-business-demo-env.mjs http://host/browser-business-demo/expense-approval',
  );
  process.exit(1);
}

const url = new URL(targetUrl);
const skillPackSource = path.resolve(
  repoRoot,
  'examples/browser-skill-packs/expense-approval.json',
);
const skillPackDir = path.join(outputDir, 'skill-packs');
const envFile = path.join(outputDir, 'browser-business-demo.env');
const evidenceFile = path.join(outputDir, 'browser-business-demo.json');
const evidenceSummaryFile = path.join(outputDir, 'browser-business-demo-summary.json');
const preflightReportFile = path.join(outputDir, 'browser-business-demo-preflight.json');

if (!existsSync(skillPackSource)) {
  console.error(`Missing source skill pack: ${skillPackSource}`);
  process.exit(1);
}

if (!url.pathname.endsWith(defaultDemoPath)) {
  console.warn(
    `Target URL path is "${url.pathname}", expected it to end with "${defaultDemoPath}". The generated skill pack will still match the provided path.`,
  );
}

mkdirSync(skillPackDir, { recursive: true });

const skillPack = JSON.parse(readFileSync(skillPackSource, 'utf8'));
skillPack.site = url.hostname;
skillPack.match = {
  ...skillPack.match,
  paths: Array.from(new Set([url.pathname, ...(skillPack.match?.paths || [])])),
};
const expenseWorkflow = skillPack.workflows?.find((item) => item.intent === 'expense_approval');
if (expenseWorkflow?.layers?.execution?.inputPolicy) {
  expenseWorkflow.layers.execution.inputPolicy.reason = 'auto';
}

writeFileSync(
  path.join(skillPackDir, 'expense-approval.json'),
  `${JSON.stringify(skillPack, null, 2)}\n`,
);

const env = {
  BROWSER_BUSINESS_ASSERTIONS:
    '[{"name":"未提交审批","code":"document.body.dataset.submitted ?? null","equals":null},{"name":"部门已填写","code":"document.querySelector(\\"#department\\").value","equals":"研发部"}]',
  BROWSER_BUSINESS_DEMO_INPUTS: '{"department":"研发部","reason":"客户现场紧急支持"}',
  BROWSER_BUSINESS_DEMO_INTENT: 'expense_approval',
  BROWSER_BUSINESS_DEMO_URL: url.href,
  BROWSER_BUSINESS_EVIDENCE_FILE: path.relative(repoRoot, evidenceFile),
  BROWSER_BUSINESS_EVIDENCE_SUMMARY_FILE: path.relative(repoRoot, evidenceSummaryFile),
  BROWSER_BUSINESS_EXPECT_RISK_ACTION: 'risk_gate',
  BROWSER_BUSINESS_EXPECT_SKILL_PAGE: 'expense_approval_form',
  BROWSER_BUSINESS_PREFLIGHT_REPORT_FILE: path.relative(repoRoot, preflightReportFile),
  BROWSER_BUSINESS_SKILL_PACKS_DIR: path.relative(repoRoot, skillPackDir),
};

writeFileSync(
  envFile,
  `${Object.entries(env)
    .map(([key, value]) => `${key}='${value}'`)
    .join('\n')}\n`,
);

console.log(`Browser business demo env written to ${envFile}`);
console.log(`Skill pack written to ${path.join(skillPackDir, 'expense-approval.json')}`);
console.log(`Target URL: ${url.href}`);
