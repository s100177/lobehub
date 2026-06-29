# AI 浏览器业务系统接入检查清单

## 1. 目标

在把 KiKi 式浏览器代理迁移到你的业务系统前，用这份清单检查页面、流程、风险和交互是否准备充分。

## 2. 页面基础

- [ ] 每个核心页面都有唯一 `page_id`。
- [ ] 每个核心页面都有可读标题和页面类型。
- [ ] 每个核心页面都能做 `inspect`。
- [ ] 每个核心页面都能识别当前选中项、输入值和主要按钮。
- [ ] 每个核心页面都能返回风险提示。
- [ ] 每个核心页面都能判断是否登录。

## 3. 页面技能包

- [ ] 每个核心页面都有技能包。
- [ ] 技能包包含 `site`。
- [ ] 技能包包含 `page`。
- [ ] 技能包包含 `entities`。
- [ ] 技能包包含 `safeActions`。
- [ ] 技能包包含 `riskActions`。
- [ ] 技能包包含 `ambiguityRules`。
- [ ] 技能包包含至少一个 `workflow`。
- [ ] 技能包能覆盖你最常见的用户目标。
- [ ] 技能包能区分 “可自动执行” 和 “必须确认”。

## 4. 规范化输入

- [ ] 目标层能明确告诉 AI 要做什么。
- [ ] 约束层能明确预算、范围、禁做项。
- [ ] 执行层能明确缺信息时如何补齐。
- [ ] 用户开始前能一次性提供足够信息。
- [ ] 用户也能选择只给目标，让 AI 追问。

## 5. 页面状态 inspect

- [ ] 能返回 URL。
- [ ] 能返回标题。
- [ ] 能返回页面类型。
- [ ] 能返回当前字段值。
- [ ] 能返回可选项。
- [ ] 能返回价格或业务结果。
- [ ] 能返回警告。
- [ ] 能返回主要动作按钮。
- [ ] 能返回当前登录态。

## 6. 风险边界

- [ ] 已定义购买风险。
- [ ] 已定义支付风险。
- [ ] 已定义提交风险。
- [ ] 已定义删除风险。
- [ ] 已定义释放风险。
- [ ] 已定义授权风险。
- [ ] 已定义修改敏感信息风险。
- [ ] 风险动作默认拦截。
- [ ] 风险动作必须弹确认卡。
- [ ] 风险动作支持人工手动接管。

## 7. 确认点

- [ ] 所有购买前节点都标了确认点。
- [ ] 所有支付前节点都标了确认点。
- [ ] 所有提交前节点都标了确认点。
- [ ] 所有删除前节点都标了确认点。
- [ ] 所有开通前节点都标了确认点。
- [ ] 确认点有明确标题。
- [ ] 确认点有继续 / 取消按钮。

## 8. 缺口补全点

- [ ] 下拉选择可由 AI 补全。
- [ ] 单选可由 AI 补全。
- [ ] 多选可由 AI 补全。
- [ ] 文本输入可由 AI 补全。
- [ ] 日期可由 AI 补全。
- [ ] 地域可由 AI 补全。
- [ ] 规格可由 AI 补全。
- [ ] 无法可靠推断的字段会主动问用户。

## 9. 交互式执行

- [x] AI 能先生成计划。
- [x] AI 能请求用户授权后再执行。
- [x] `/execute-plan` 服务端入口会拒绝缺少 `authorized: true` 的直接执行请求。
- [x] AI 能在页面内自动收集 / 填写 / 选择信息。
- [x] AI 能在歧义时暂停询问。
- [x] AI 能在人工干预后暂停。
- [x] AI 能在继续前重新 inspect。
- [x] AI 能在面板中明确展示问答 / 审阅 / 界面 / 接管模式。

## 10. 视觉状态

- [x] 初始助手态有推荐任务。
- [x] 授权前有明确的计划和开始按钮。
- [x] 接管时有动态边框。
- [x] 操作目标有高亮。
- [x] 歧义时有结构化询问卡。
- [x] 风险时有确认卡。
- [x] 人工干预时边框变为暂停态。
- [x] 审计时间线能展示跨调用的中断、恢复、风险和完成记录。

## 11. 自动化测试

- [x] 有本地可控测试页。
- [x] 有 Playwright 验收脚本。
- [x] 有真实网站冒烟场景。
- [x] 能覆盖授权、接管、高亮、歧义、风险、人工干预。

当前自动化证据：

- `scripts/verify-browser-agent-product.mjs` 覆盖本地可控页面、技能包计划、未授权 `executePlan` 阻断、授权后执行、接管视觉、高亮、歧义询问、风险拦截、人工干预 `interrupt`、remote viewer `/input` 中断审计和恢复前 inspect。
- `scripts/verify-browser-real-smoke.mjs` 覆盖真实站点 remote navigate、inspect、标题 / URL /viewport 和不触发风险动作；可通过 `BROWSER_REAL_SMOKE_URLS` 扩展真实站点列表。
- `scripts/verify-browser-docker-ui-e2e.mjs` 覆盖 Docker 部署后的真实登录、`/browser-e2e` 测试路由、真实 `BrowserPortal`、browser-service `navigate`/`inspect`/`execute-plan`、授权卡、计划卡、proxy iframe、风险拦截卡和审计时间线。
- `scripts/verify-browser-skill-packs.mjs` 覆盖 `examples/browser-skill-packs` 或 `BROWSER_SKILL_PACK_VERIFY_DIR` 指向目录里的业务技能包静态结构和风险步骤约束。
- `scripts/verify-browser-business-demo-local.mjs` 覆盖内置费用审批业务页，自动生成本地技能包副本，调用真实业务 demo verifier，并校验 evidence 文件。
- `scripts/verify-browser-business-demo.mjs` 覆盖指定真实业务系统 URL + 外部技能包目录的端到端演示入口，要求匹配技能包、生成计划、先证明未授权阻断，再完成安全步骤，并停在风险门。
- `src/features/Conversation/Messages/AssistantGroup/Tool/BrowserPanel.test.tsx` 覆盖 BrowserPanel 授权卡、暂停卡、clarification、suggestedTasks、问答 / 审阅 / 界面 / 接管模式、审计时间线、remote/iframe 视图和继续前 inspect。

## 12. 发布门槛

提交前先跑非部署浏览器门禁：

```bash
pnpm test:browser-release-gate
```

该命令顺序覆盖技能包静态校验、KiKi 式浏览器代理产品验证、本地业务系统 demo evidence 校验和真实站点只读 smoke。默认不覆盖 Docker 部署 UI E2E，也不能替代指定业务系统真实页面 evidence。

上线前可把 Docker UI E2E 纳入同一条 release gate：

```bash
BROWSER_RELEASE_GATE_INCLUDE_DOCKER_E2E=1 \
  BROWSER_DOCKER_E2E_BASE_URL=http://192.168.1.36:3211 \
  BROWSER_DOCKER_E2E_DATABASE_URL='postgresql://postgres:<password>@127.0.0.1:5435/lobechat' \
  pnpm test:browser-release-gate
```

开启后，release gate 会在非部署检查之后继续跑 `scripts/verify-browser-docker-ui-e2e.mjs`。`BROWSER_DOCKER_E2E_BASE_URL` 必须匹配部署容器信任的 `APP_URL` origin。

上线前至少满足：

- [x] 本地可控测试全通过。
- [x] 页面技能包静态校验通过。
- [x] 自动化脚本全通过。
- [x] 真实网站冒烟无阻塞问题。
- [ ] 指定业务系统真实页面完成一轮人工确认的端到端演示。
- [x] 风险动作不会被自动执行。
- [x] 用户能随时接管。

仍未闭环：

- [x] Docker 镜像部署后的真实 UI E2E 通过。
- [ ] 指定业务系统真实页面完成一轮人工确认的端到端演示。

Docker UI E2E 证据：

- 部署环境：`ENABLE_BROWSER_E2E_TEST_PANEL=1 docker compose up -d --no-build lobe browser-service`。
- Lobe 镜像：`ghcr.io/s100177/lobehub:s100177-stable`，本次验证容器镜像 digest 为 `sha256:7f679d15f7a681e38e130a560b8df4e6395f77e679c91ee92c523e9899f63df3`。
- Browser service 镜像：`lobehub-browser-service`，本次验证容器镜像 digest 为 `sha256:7be4c382ccb1cf5dee3aaf9d5c3f2b926f22777f1d19b4055f35d7cc377689a4`。
- 验证命令：`BROWSER_DOCKER_E2E_BASE_URL=http://192.168.1.36:3211 BROWSER_DOCKER_E2E_DATABASE_URL=postgresql://postgres:<password>@127.0.0.1:5435/lobechat pnpm test:browser-docker-ui-e2e`。
- 验证结果：`Browser Docker UI E2E passed at http://192.168.1.36:3211`。
- 注意：部署用的父目录 `docker-compose.yml` 必须把 `browser-service.build.context` 指向 `./lobehub/browser-service`，否则会启动旧版 browser-service，缺少 `/execute-plan` 路由，右侧 UI 会无法完成风险门验证。
