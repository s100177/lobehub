# s100177 LobeHub 版本维护与 Git 操作手册

本文档用于维护你自己的 LobeHub fork：

```text
https://github.com/s100177/lobehub
```

当前本地仓库路径：

```bash
/home/user/projects/lobehub_new/lobehub
```

## 1. 当前仓库约定

### 1.1 remote 约定

本地仓库使用两个 remote：

```text
origin   = 你的 fork，用于保存我们自己的代码
upstream = 官方 LobeHub 仓库，只用于拉取官方更新
```

当前配置应类似：

```bash
git remote -v
```

期望输出：

```text
origin   https://ghproxy.net/https://github.com/s100177/lobehub.git (fetch)
origin   https://ghproxy.net/https://github.com/s100177/lobehub.git (push)
upstream https://ghproxy.net/https://github.com/lobehub/lobehub.git (fetch)
upstream DISABLED (push)
```

`upstream` 的 push 地址被故意设置为 `DISABLED`，目的是避免误推官方仓库。

如果以后网络环境支持直连 GitHub，也可以把 `origin` 改回直连：

```bash
git remote set-url origin https://github.com/s100177/lobehub.git
```

不要恢复 `upstream` 的 push URL，除非你明确要向官方提交 PR。

### 1.2 分支约定

当前核心分支：

```text
canary                           = 跟随官方 upstream/canary
fix/premature-close-stream-error = 本次 DeepSeek + 远程设备修复分支
s100177/stable                   = 你自己的稳定部署分支
```

推荐职责：

```text
fix/* 或 feature/* = 开发、修复、试验
s100177/stable    = 只放已经验证可部署的代码
canary            = 官方基线，不直接在上面改业务代码
```

日常部署优先使用：

```text
s100177/stable
```

## 2. 本次修复内容说明

本次关键提交：

```text
2867349670 Restore remote device tool execution in DeepSeek chat
```

详细修复报告见：

```text
REMOTE_DEVICE_DEEPSEEK_FIX_REPORT.md
```

### 2.1 修复的问题

本次修复解决了三类连锁问题：

```text
DeepSeek SSE Premature close
-> 工具调用结果被误判失败
-> 聊天无法稳定查询在线设备
-> 激活设备后没有把 activeDeviceId 传给下一步
-> 模型退回 lobe-skills / lobe-cloud-sandbox
-> 出现 MARKET_AUTH_REQUIRED
```

修复后的预期链路：

```text
DeepSeek tool call
-> lobe-remote-device/listOnlineDevices
-> lobe-remote-device/activateDevice
-> RuntimeStepContext.activeDeviceId
-> 动态注入 lobe-local-system
-> Web client 经受限 device route
-> device gateway
-> user-H610-VH4-B 本地执行
```

### 2.2 重点改动文件

DeepSeek 流处理：

```text
packages/model-runtime/src/core/streams/protocol.ts
packages/model-runtime/src/core/streams/protocol.test.ts
```

远程设备查询和激活：

```text
src/store/tool/slices/builtin/executors/lobe-remote-device.ts
src/store/tool/slices/builtin/executors/index.ts
packages/builtin-tools/src/identifiers.ts
```

`activeDeviceId` 上下文传递：

```text
packages/types/src/stepContext.ts
packages/agent-runtime/src/utils/stepContextComputer.ts
src/store/chat/slices/message/selectors/dbMessage.ts
src/store/chat/slices/aiChat/actions/streamingExecutor.ts
src/store/chat/agents/createAgentExecutors.ts
```

Web 远程 Local System 执行：

```text
apps/server/src/routers/lambda/device.ts
src/services/device.ts
packages/builtin-tool-local-system/src/client/executor/index.ts
packages/builtin-tool-local-system/src/client/executor/index.test.ts
```

Docker 构建：

```text
Dockerfile
```

### 2.3 安全边界

`executeLocalSystemTool` 必须保持受限：

```text
只允许 LocalSystemApiName
固定 identifier = LocalSystemIdentifier
不能开放成任意 tool identifier 代理
```

原因：浏览器客户端可以调用该 route，如果允许代理任意工具，会扩大服务端到 device gateway 的执行面。

## 3. 每次操作前的安全检查

进入仓库：

```bash
cd /home/user/projects/lobehub_new/lobehub
```

查看当前分支和工作区：

```bash
git status --short --branch
```

工作区干净时通常类似：

```text
## s100177/stable...origin/s100177/stable
```

或：

```text
## fix/premature-close-stream-error...origin/fix/premature-close-stream-error
```

如果看到 `M`、`A`、`D`、`??`，说明有未提交改动。不要直接升级官方代码，先决定：

```bash
git diff
git status
```

如果改动要保留，就提交；如果只是临时改动，可以 stash：

```bash
git stash push -m "temporary local changes before upstream sync"
```

恢复 stash：

```bash
git stash list
git stash pop
```

## 4. 同步官方代码

### 4.1 推荐流程

先确认干净：

```bash
git status --short --branch
```

拉取官方最新代码：

```bash
git fetch upstream
git fetch origin
```

创建备份分支：

```bash
git checkout fix/premature-close-stream-error
git branch backup/remote-device-fix-$(date +%Y%m%d)
```

把我们的修复重新叠到官方最新 `canary` 上：

```bash
git rebase upstream/canary
```

如果没有冲突，推送到 fork：

```bash
git push --force-with-lease origin fix/premature-close-stream-error
```

验证通过后，更新稳定分支：

```bash
git checkout s100177/stable
git merge --ff-only fix/premature-close-stream-error
git push origin s100177/stable
```

### 4.2 为什么用 rebase

官方代码会持续更新。我们的分支只保留自己额外的修复提交，用 rebase 可以让历史保持为：

```text
官方最新提交
-> 我们的修复提交
```

这样后续排查、升级、对比官方差异都更清楚。

### 4.3 什么时候不用 rebase

如果一个分支已经多人协作且其他人基于它继续开发，强行 rebase 会改写历史。此时应使用 merge：

```bash
git merge upstream/canary
git push origin 分支名
```

当前你的维护方式以个人 fork 为主，推荐继续使用 rebase。

## 5. 冲突处理

rebase 时如果出现冲突，Git 会提示冲突文件。

查看冲突：

```bash
git status
```

打开冲突文件，会看到类似：

```text
<<<<<<< HEAD
官方代码
=======
我们的代码
>>>>>>> commit message
```

处理原则：

```text
如果官方已经实现等价修复，优先保留官方实现
如果官方没有实现我们的链路，保留我们的逻辑
不要删除 activeDeviceId 传递链路
不要把 executeLocalSystemTool 放开成任意工具代理
不要恢复会导致 MARKET_AUTH_REQUIRED 的云端沙箱 fallback
```

处理完每个文件后：

```bash
git add 冲突文件路径
git rebase --continue
```

如果发现 rebase 方向错了或冲突太乱，可以中止：

```bash
git rebase --abort
```

中止后回到 rebase 前状态。之前创建的备份分支也可以兜底：

```bash
git checkout backup/remote-device-fix-YYYYMMDD
```

## 6. 新功能开发流程

不要直接在 `s100177/stable` 上开发新功能。

### 6.1 从稳定分支创建功能分支

```bash
git checkout s100177/stable
git pull --ff-only origin s100177/stable
git checkout -b feature/功能英文名
```

例子：

```bash
git checkout -b feature/device-python-demo
```

### 6.2 开发期间常用命令

查看改动：

```bash
git status
git diff
```

暂存改动：

```bash
git add 文件路径
```

提交：

```bash
git commit
```

提交信息建议使用本仓库的 Lore Commit Protocol：

```text
为什么要做这个改动

说明背景、约束、方案选择。

Constraint: 影响方案的外部约束
Rejected: 放弃的方案 | 放弃原因
Confidence: high
Scope-risk: narrow
Tested: 做过的验证
Not-tested: 没做的验证
```

短小改动也可以写简化版，但至少要说明为什么改。

### 6.3 推送功能分支

```bash
git push -u origin feature/功能英文名
```

验证通过后合并到稳定分支：

```bash
git checkout s100177/stable
git pull --ff-only origin s100177/stable
git merge --ff-only feature/功能英文名
git push origin s100177/stable
```

如果 `--ff-only` 失败，说明稳定分支和功能分支历史不再是简单前进关系。先不要强行 merge，检查：

```bash
git log --oneline --graph --decorate --all -20
```

## 7. Bug 修复流程

从稳定分支创建 bugfix 分支：

```bash
git checkout s100177/stable
git pull --ff-only origin s100177/stable
git checkout -b fix/问题英文名
```

修复后至少跑相关测试：

```bash
pnpm exec vitest run --silent='passed-only' 相关测试文件
git diff --check
```

提交并推送：

```bash
git add 修复文件 测试文件
git commit
git push -u origin fix/问题英文名
```

验证通过后合并：

```bash
git checkout s100177/stable
git merge --ff-only fix/问题英文名
git push origin s100177/stable
```

## 8. 本项目推荐验证命令

### 8.1 本次远程设备修复相关测试

```bash
pnpm exec vitest run --silent='passed-only' \
  src/store/chat/slices/message/selectors/dbMessage.test.ts \
  src/store/chat/agents/__tests__/createAgentExecutors/call-llm.test.ts
```

```bash
pnpm exec vitest run --silent='passed-only' \
  packages/builtin-tool-local-system/src/client/executor/index.test.ts
```

如果 package 级 Vitest 受 monorepo config 影响，可以参考历史做法使用临时 Vitest config。

### 8.2 通用检查

```bash
git diff --check
```

```bash
pnpm exec tsc --noEmit --pretty false --skipLibCheck
```

注意：本机曾出现过 `tsc` 因 Node heap OOM 终止的情况。遇到 OOM 不等于发现类型错误，但也不能宣称完整 typecheck 通过。

可尝试增加 Node 内存：

```bash
NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit --pretty false --skipLibCheck
```

### 8.3 Docker 构建和启动

```bash
docker compose build --build-arg USE_CN_MIRROR=true lobe
docker compose up -d lobe
curl -fsS http://localhost:3211/api/version
```

如果要确认容器：

```bash
docker ps --filter name=lobehub
```

## 9. 本次功能的手动端到端验证

打开：

```text
http://localhost:3211
```

新建空白话题，选择 DeepSeek 模型，发送：

```text
在设备 user-H610-VH4-B 上运行一段 Python demo，输出 hostname、platform、当前工作目录和 Python 版本。
```

期望看到：

```text
lobe-remote-device/listOnlineDevices
-> lobe-remote-device/activateDevice
-> lobe-local-system/runCommand
```

不应该看到：

```text
lobe-skills
lobe-cloud-sandbox
MARKET_AUTH_REQUIRED
```

如果又出现 `MARKET_AUTH_REQUIRED`，优先排查：

```text
activeDeviceId 是否进入 RuntimeStepContext
lobe-local-system 是否被动态注入
Local System executor 是否走 deviceService.executeLocalSystemTool
服务端 executeLocalSystemTool route 是否还限制为 LocalSystemIdentifier
```

## 10. 回滚策略

### 10.1 回滚最后一次提交

如果提交已经推送，不推荐 `reset --hard`。使用 revert：

```bash
git revert HEAD
git push origin 当前分支
```

### 10.2 回滚到某个稳定提交

先查看历史：

```bash
git log --oneline --decorate -20
```

创建临时恢复分支：

```bash
git checkout -b recovery/回滚原因 提交号
```

验证没问题后，再决定是否把 `s100177/stable` 指过去。

如果必须强制更新稳定分支：

```bash
git checkout s100177/stable
git reset --hard 目标提交号
git push --force-with-lease origin s100177/stable
```

这一步会改写远端历史，只有在你明确知道影响时再做。

## 11. 常见问题

### 11.1 push 卡住

如果直连 GitHub 卡住，可以使用 ghproxy：

```bash
git remote set-url origin https://ghproxy.net/https://github.com/s100177/lobehub.git
```

如果 ghproxy push 要求认证，先重新登录 GitHub CLI：

```bash
gh auth login -h github.com
```

然后重试：

```bash
git push
```

### 11.2 不小心在 stable 上改了代码

如果还没提交，先新建分支把改动带走：

```bash
git checkout -b fix/临时问题名
```

然后正常提交。

如果已经在 `s100177/stable` 上提交，但还没推送，可以创建分支保存：

```bash
git branch fix/临时问题名
git reset --hard origin/s100177/stable
```

注意：`reset --hard` 会丢弃当前分支未保存的工作区改动。执行前必须确认已经用分支或 commit 保存。

### 11.3 rebase 后 push 被拒绝

rebase 会改写提交历史，所以普通 push 可能被拒绝。使用：

```bash
git push --force-with-lease origin 当前分支
```

不要用无保护的：

```bash
git push --force
```

`--force-with-lease` 会检查远端是否被别人更新过，更安全。

## 12. 推荐日常命令速查

查看状态：

```bash
git status --short --branch
```

查看分支：

```bash
git branch -vv
```

查看 remote：

```bash
git remote -v
```

拉官方：

```bash
git fetch upstream
```

拉自己的 fork：

```bash
git fetch origin
```

推当前分支：

```bash
git push
```

创建功能分支：

```bash
git checkout s100177/stable
git checkout -b feature/name
```

同步官方并重放修复：

```bash
git checkout fix/premature-close-stream-error
git fetch upstream
git rebase upstream/canary
git push --force-with-lease origin fix/premature-close-stream-error
```

更新稳定分支：

```bash
git checkout s100177/stable
git merge --ff-only fix/premature-close-stream-error
git push origin s100177/stable
```
