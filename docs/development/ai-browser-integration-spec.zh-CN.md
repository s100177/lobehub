# AI 浏览器业务系统接入规范

## 1. 目的

这份规范定义：如果你要把这套 KiKi 式交互模式迁移到自己的业务系统，业务系统需要提前提供什么信息，AI 才能完成：

- 任务理解。
- 多阶段规划。
- 页面交互补全信息。
- 安全边界内自动执行。
- 风险动作暂停确认。
- 人工干预后暂停并恢复。

核心原则：

- 信息越规范，AI 执行越稳定。
- 页面越结构化，AI 越能自动完成流程。
- 风险越明确，自动化越安全。

## 2. 接入对象

适用于以下类型页面：

- 云产品购买页。
- 控制台配置页。
- 表单审批页。
- 搜索结果页。
- 资源管理页。
- 业务流程工作台。

## 3. 必需提供的能力

### 3.1 页面技能包

每个核心页面应提供技能包，至少包含：

```json
{
  "ambiguityRules": ["什么时候必须问用户", "什么时候可以自动推荐"],
  "description": "页面说明",
  "entities": ["field1", "field2"],
  "page": "page_id",
  "riskActions": ["danger1", "danger2"],
  "safeActions": ["action1", "action2"],
  "site": "your-domain.com",
  "workflows": [
    {
      "intent": "user_goal_id",
      "steps": ["step1", "step2", "step3"]
    }
  ]
}
```

技能包必须说明：

- 页面里哪些字段重要。
- 哪些按钮安全。
- 哪些按钮危险。
- 哪些选择可以自动补。
- 哪些情况必须问用户。
- 常见意图如何拆步。

运行时接入方式：

- 将一个或多个 `.json` 技能包放入 `BROWSER_SKILL_PACKS_DIR` 指向的目录。
- 技能包通过 `site` + `match.paths` / `match.keywords` / `match.pageType` 匹配当前页面。
- 技能包只声明页面实体、风险边界和 workflow；不包含可执行脚本。
- workflow step 可以声明 `action.selector`、`action.inputKey`、`action.value`、`action.expectedText`。
- 运行时只按声明式 action 执行安全的 `fill`、`select`、`click`、`verify`；风险词命中的点击会被阻塞。
- 缺少 `inputKey` 对应用户输入时，执行暂停并要求用户补充，不猜测敏感字段。
- `executePlan` 必须显式传入 `authorized: true` 才会推进页面操作；未传或为 `false` 时，服务端返回 `waiting_user_authorization`，并记录 `authorization_required` 阻断事件。
- `executePlan` 会按 session 记录 `executionState.cursor` 和 `completedStepIds`；暂停后再次执行默认从阻塞步骤继续。
- 如果业务需要从头重跑 workflow，调用 `executePlan` 时显式传入 `restart: true`。
- 用户在接管态手动点击、滚动、输入或键盘操作时，运行时必须调用 `interrupt`，把 `executionState.phase` 写为 `paused_by_user_intervention`。
- `interrupt` 返回单次 `executionEvents`，并把同一事件追加进 session 级 `executionTimeline`，后续 `inspect` 仍应能看到这条审计记录。
- BrowserPanel 应展示 session 级 `executionTimeline`，作为用户可见的审计时间线；单次 `executionEvents` 仍只表示当前工具调用结果。
- 从 `paused_by_user_intervention` 恢复执行前，BrowserPanel 必须先调用 `inspect`，再调用 `executePlan`，不能基于旧页面状态继续。
- 服务端 `/execute-plan` 也会强制这个边界：如果 session 仍处于 `paused_by_user_intervention`，请求必须带 `inspectedAfterIntervention:true`，且服务端必须已经记录过覆盖当前人工干预版本的 `/inspect`；否则只返回 `inspect_required_after_intervention` 阻断事件，不推进 workflow。
- clarification 的 `field` 会作为 `executePlan.inputs[field]` 传回运行时，建议与 workflow step 的 `action.inputKey` 保持一致。
- 一个页面可以同时返回多个 clarification。BrowserPanel 会按队列逐项收集用户回答，展示已回答字段，并在用户确认继续规划后一次性传入 `executePlan.inputs`。
- 从 `paused_for_input` 恢复执行前，BrowserPanel 必须先调用 `inspect`，再调用 `executePlan({ inspectedAfterPause:true })`；服务端会记录输入暂停版本，只有 `/inspect` 覆盖当前暂停版本后才允许继续，不能只伪造客户端参数。
- 用户选择 `suggestedTasks` 后只会进入授权卡，不会直接执行。授权执行时可把 `suggestedTasks.intent` 作为 `executePlan.intent`，运行时优先选择匹配的 skill-pack workflow。

技能包提交前必须先做静态校验：

```bash
BROWSER_SKILL_PACK_VERIFY_DIR=/path/to/your/skill-packs pnpm test:browser-skill-packs
```

仓库示例：

```text
examples/browser-skill-packs/expense-approval.json
```

该示例覆盖费用审批业务表单，已经被自动化验收脚本复用；业务系统接入时应先复制这个结构，再替换 `site`、`match`、字段、风险动作和 workflow。

静态校验会强制技能包包含目标层、约束层和执行层：

- 目标层：每个 workflow 必须有 `intent` 与 `goal`。
- 约束层：每个 workflow 必须有 `constraints`，说明预算、范围、禁做项和确认边界。
- 执行层：可执行 step 必须有声明式 `action.selector`；`fill` / `select` 的输入必须在 `fillGaps` 中声明。
- 风险层：`risk_gate` 必须绑定 `riskActions` 中的 `riskAction` 和 `confirmationPoints` 中的 `confirmationPoint`。

生产技能包建议额外声明 `workflow.layers`，让三层输入成为机器可审计的显式契约：

- `layers.goal.intent` / `layers.goal.description` 必须与 `workflow.intent` / `workflow.goal` 一致。
- `layers.constraints.rules` 必须与 `workflow.constraints` 一致。
- `layers.execution.steps` 必须与 `workflow.steps[].id` 顺序一致。
- `layers.execution.inputPolicy` 用于声明字段由 AI 自动补齐、询问用户、仅人工填写或执行前确认。
- `layers.execution.resumePolicy` 推荐使用 `inspect_before_resume`，保证暂停或歧义恢复后不基于旧状态继续。

运行时会把 `workflow.layers` 透传到 `plan.layers`，供 BrowserPanel、审计证据和后续业务 planner 使用；旧字段仍用于兼容现有执行器。

真实业务系统演示用例：

开发回归可先跑仓库内置的本地业务页演示：

```bash
pnpm test:browser-business-demo-local
```

它会启动临时费用审批页面，复用 `examples/browser-skill-packs/expense-approval.json` 生成本地匹配技能包，并校验 evidence。该命令只证明本地可控业务页闭环，不能替代接入方真实业务 URL 验收。

真实业务系统建议先复制 env 模板，避免多行命令里漏字段：

```bash
cp examples/browser-business-demo/.env.example /path/to/browser-business-demo.env
```

填好真实 URL、技能包目录、workflow intent、输入和只读断言后，推荐用一条命令跑完整证据链：

```bash
BROWSER_BUSINESS_ENV_FILE=/path/to/browser-business-demo.env \
  pnpm test:browser-business-demo-evidence
```

该命令会依次执行不访问目标 URL 的预检、真实业务演示、evidence validate 和 evidence bundle 校验，并写出 preflight report、完整 evidence 和 summary。也可以分步执行，先跑预检：

```bash
BROWSER_BUSINESS_ENV_FILE=/path/to/browser-business-demo.env \
  BROWSER_BUSINESS_PREFLIGHT=1 \
  BROWSER_BUSINESS_PREFLIGHT_REPORT_FILE=.omx/artifacts/browser-business-demo-preflight.json \
  pnpm test:browser-business-demo
```

预检通过后再执行真实演示：

```bash
BROWSER_BUSINESS_ENV_FILE=/path/to/browser-business-demo.env \
  pnpm test:browser-business-demo
```

也可以直接通过命令行传环境变量：

```bash
BROWSER_BUSINESS_DEMO_URL=https://your-business-system.example/path \
  BROWSER_BUSINESS_SKILL_PACKS_DIR=/path/to/your/skill-packs \
  BROWSER_BUSINESS_DEMO_INPUTS='{"field":"value"}' \
  BROWSER_BUSINESS_DEMO_INTENT=your_workflow_intent \
  BROWSER_BUSINESS_EXPECT_SKILL_PAGE=your_page_id \
  BROWSER_BUSINESS_EXPECT_RISK_ACTION=your_risk_gate_step_id \
  BROWSER_BUSINESS_ASSERTIONS='[{"name":"未提交","code":"document.body.dataset.submitted","equals":null}]' \
  BROWSER_BUSINESS_EVIDENCE_FILE=.omx/artifacts/browser-business-demo.json \
  BROWSER_BUSINESS_PREFLIGHT=1 \
  pnpm test:browser-business-demo
```

真实执行：

```bash
BROWSER_BUSINESS_DEMO_URL=https://your-business-system.example/path \
  BROWSER_BUSINESS_SKILL_PACKS_DIR=/path/to/your/skill-packs \
  BROWSER_BUSINESS_DEMO_INPUTS='{"field":"value"}' \
  BROWSER_BUSINESS_DEMO_INTENT=your_workflow_intent \
  BROWSER_BUSINESS_EXPECT_SKILL_PAGE=your_page_id \
  BROWSER_BUSINESS_EXPECT_RISK_ACTION=your_risk_gate_step_id \
  BROWSER_BUSINESS_ASSERTIONS='[{"name":"未提交","code":"document.body.dataset.submitted","equals":null}]' \
  BROWSER_BUSINESS_EVIDENCE_FILE=.omx/artifacts/browser-business-demo.json \
  pnpm test:browser-business-demo
```

```bash
BROWSER_BUSINESS_EVIDENCE_VALIDATE_FILE=.omx/artifacts/browser-business-demo.json \
  BROWSER_BUSINESS_EVIDENCE_SUMMARY_FILE=.omx/artifacts/browser-business-demo-summary.json \
  pnpm test:browser-business-demo
```

单独校验三份证据文件是否一致：

```bash
BROWSER_BUSINESS_PREFLIGHT_REPORT_FILE=.omx/artifacts/browser-business-demo-preflight.json \
  BROWSER_BUSINESS_EVIDENCE_FILE=.omx/artifacts/browser-business-demo.json \
  BROWSER_BUSINESS_EVIDENCE_SUMMARY_FILE=.omx/artifacts/browser-business-demo-summary.json \
  pnpm test:browser-business-evidence-bundle
```

这个脚本不会默认跑本地 fixture。它要求接入方提供真实 URL 和技能包目录，验证技能包匹配、计划生成、安全步骤执行和风险门阻塞。`BROWSER_BUSINESS_PREFLIGHT=1` 只校验环境变量、技能包目录、期望 page、workflow intent、首个 risk gate、断言结构，以及 workflow 中所有 `action.inputKey` 是否都能在 `BROWSER_BUSINESS_DEMO_INPUTS` 找到非空字符串，不启动浏览器、不访问真实业务系统。预检时如果提供 `BROWSER_BUSINESS_PREFLIGHT_REPORT_FILE`，脚本会写出机器可读报告，包含目标 URL、技能包 page、workflow intent、首个风险门、输入 key、断言数和 `targetAccessed:false`。`BROWSER_BUSINESS_EXPECT_RISK_ACTION` 必须匹配 workflow 中第一个 `risk_gate` 的 `id`、`riskAction` 或 `risk`，因为真实执行会在第一个风险门停止。`BROWSER_BUSINESS_ASSERTIONS` 是真实 evidence 的必填只读 JS 断言数组，用于证明风险门后页面没有出现提交、购买、支付、删除等副作用。可选的 `BROWSER_BUSINESS_EVIDENCE_FILE` 会写入结构化 JSON 证据，包含 `verifierVersion`、`authorizationGate`、`riskGateStep`、执行事件和断言结果，便于审计真实业务演示。可选的 `BROWSER_BUSINESS_EVIDENCE_VALIDATE_FILE` 只校验证据文件，不启动浏览器。校验证据时如果提供 `BROWSER_BUSINESS_EVIDENCE_SUMMARY_FILE`，脚本会额外写出机器可读摘要，包含目标 URL、技能包 page、计划来源、风险门 id、完成 / 阻断事件数、断言数和 `passed: true`。`pnpm test:browser-business-evidence-bundle` 会校验 preflight report、完整 evidence 和 summary 的目标 URL、技能包 page、workflow、风险门、事件数和断言数一致。

### 3.2 页面状态 inspect

每个页面至少要能返回：

- 当前 URL。
- 页面标题。
- 页面类型。
- 当前选中项。
- 可填写字段。
- 可点击按钮。
- 价格 / 结果 / 摘要。
- 风险提示。
- 当前页面是否已登录。

建议结构：

```json
{
  "fields": [{ "label": "地域", "value": "南京", "options": ["北京", "上海", "南京"] }],
  "pageType": "form",
  "prices": [{ "label": "配置费用", "value": "¥114.36" }],
  "primaryActions": [{ "text": "提交订单", "risk": "submit" }],
  "selectedOptions": ["2核4GB"],
  "suggestedTasks": [
    {
      "intent": "configure_before_purchase",
      "reason": "页面存在配置字段和购买风险动作",
      "risk": "medium",
      "title": "配置一套合适方案，但停在下单前"
    }
  ],
  "summary": "当前配置适合个人建站",
  "title": "...",
  "url": "...",
  "warnings": ["提交后不可撤销"]
}
```

### 3.3 风险规则

必须显式定义以下风险类别：

- `purchase`
- `payment`
- `submit`
- `delete`
- `release`
- `authorize`
- `login_sensitive`
- `modify_sensitive`
- `create_resource`

业务系统应给出：

- 命中条件。
- 拦截后的提示文案。
- 是否允许 “本次授权”。
- 是否必须手动点击。

### 3.4 确认点

业务系统必须说明哪些节点一定要停：

- 提交前。
- 支付前。
- 购买前。
- 删除前。
- 开通前。
- 授权前。

每个确认点应提供：

- 确认标题。
- 确认原因。
- 继续按钮文案。
- 取消按钮文案。

### 3.5 缺口补全点

业务流程中，如果信息不足，系统应允许 AI 或用户补齐：

- 选择下拉项。
- 单选。
- 多选。
- 输入文本。
- 选择日期。
- 选择地域。
- 选择规格。

必须明确哪些字段：

- 可由 AI 自动补。
- 需要用户确认。
- 需要用户手动输入。

## 4. 规范化输入模板

建议用户在开始前提供三层信息：

### 4.1 目标层

回答 “我要完成什么”。

示例：

- 帮我配置一台个人建站服务器。
- 帮我完成域名解析。
- 帮我提交这个工单。

### 4.2 约束层

回答 “不要做什么” 和 “边界是什么”。

示例：

- 不要下单。
- 预算 100 元 / 月以内。
- 优先北京或上海。
- 只允许自动执行安全操作。

### 4.3 执行层

回答 “执行中怎么补信息”。

示例：

- 遇到多个候选项时请询问我。
- 遇到登录先暂停。
- 遇到提交 / 支付必须停下。
- 如果页面已有默认推荐，可以直接使用。

## 5. AI 执行协议

业务系统接入后，AI 的执行顺序应固定为：

```text
读取页面状态
-> 匹配页面技能包
-> 判断信息是否足够
-> 不够则询问 / 补全
-> 生成计划
-> 请求用户授权
-> 调用 executePlan({ authorized: true, ... })
-> 进入接管态
-> 自动推进到确认前
-> 风险动作暂停
-> 用户干预暂停
-> 继续前重新 inspect
-> 完成后交还控制权
```

## 6. 最小接入验收

接入一套业务系统，至少要通过以下场景：

1. 目标层 + 约束层足够时，AI 能生成计划并请求授权。
2. AI 能在安全边界内自动完成常规填写、选择和导航。
3. AI 在缺信息时会主动询问，而不是猜。
4. AI 在风险动作前会拦截并要求确认。
5. 用户手动干预后，AI 会暂停并在继续前重新读取页面。
6. 业务系统切换到新的页面技能包后，AI 仍能复用同一套协议。
7. 业务技能包目录通过 `pnpm test:browser-skill-packs` 静态校验。

## 7. 推荐实施顺序

1. 先做页面技能包。
2. 再做 inspect。
3. 再做风险规则。
4. 再做确认点。
5. 再做缺口补全点。
6. 最后把流程接入 BrowserPanel 的执行协议。

## 8. 结论

如果你的业务系统能提供足够规范化的信息，AI 就能像 KiKi 一样：

- 先理解目标。
- 再生成计划。
- 再通过网页交互收集缺失信息。
- 再在安全边界内自动执行。
- 最后在风险点前停下交给用户确认。
