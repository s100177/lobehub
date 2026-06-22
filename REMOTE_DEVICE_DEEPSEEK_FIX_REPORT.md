# DeepSeek 与远程设备工具调用修复报告

## 背景

本次闭环的是三类连锁问题：

1. DeepSeek 已经返回了有效 `tool_calls`，但 SSE 末尾抛出 `Premature close`，前端把它当成失败，导致工具调用结果被中断。
2. 聊天里无法稳定查询在线设备，因为 `lobe-remote-device` 只有 manifest/identifier，没有注册可执行的客户端 executor。
3. 激活 `user-H610-VH4-B` 后，后续模型步骤没有拿到 `activeDeviceId`，也没有暴露 `lobe-local-system`，模型退回到了 `lobe-skills` / `lobe-cloud-sandbox`，于是出现 `MARKET_AUTH_REQUIRED`。

## 根因

### 1. DeepSeek `Premature close` 属于流结束噪声

DeepSeek 兼容 OpenAI 的流式响应在已经交付有效 chunk 后，底层 undici/stream 可能抛出 `Premature close`。原逻辑在 `readableFromAsyncIterable` 和 `convertIterableToStream` 中把该异常继续抛给下游，`createFirstErrorHandleTransformer` 会生成错误 chunk，最终表现为一次实际成功的工具调用被标记失败。

### 2. 远程设备工具没有客户端执行器

`lobe-remote-device` 的 manifest 已存在，但没有注册到内置工具 executor 列表。模型即使选择了 `listOnlineDevices` / `activateDevice`，客户端侧也没有对应执行实现，因此无法从聊天查询在线设备并写入已激活设备状态。

### 3. 激活设备状态没有进入后续 LLM step context

`activateDevice` 的结果需要在下一次 LLM step 中变成 `RuntimeStepContext.activeDeviceId`。修复前 step context 不包含这个字段，`createAgentExecutors` 也不会根据已激活设备动态注入 `lobe-local-system`，所以模型看不到正确的本地系统工具。

### 4. Web 客户端不能走 Electron IPC

`lobe-local-system` 客户端 executor 原本只面向 Electron IPC。浏览器里激活远程设备后，必须经服务端受限代理转发到 device gateway，不能继续调用本机 Electron IPC，也不能开放任意工具标识转发。

## 修复内容

### DeepSeek 流处理

- 在 `packages/model-runtime/src/core/streams/protocol.ts` 中增加 `isPrematureCloseError`。
- 在 `readableFromAsyncIterable` 与 `convertIterableToStream` 的 pull/start 错误路径里，遇到 `Premature close` 时正常 `close()`，保留此前已收到的 text/tool_calls/usage chunk。
- 在 `packages/model-runtime/src/core/streams/protocol.test.ts` 增加 Premature close 回归测试。

### 在线设备查询与激活

- 新增 `src/store/tool/slices/builtin/executors/lobe-remote-device.ts`。
- 在 `src/store/tool/slices/builtin/executors/index.ts` 注册 `remoteDeviceExecutor`。
- 在 `packages/builtin-tools/src/identifiers.ts` 纳入 `RemoteDeviceManifest.identifier`。
- `listOnlineDevices` 通过 `deviceService.listDevices()` 返回在线设备列表。
- `activateDevice` 校验目标设备在线后，在 tool state 中写入 `metadata.activeDeviceId`。

### 激活设备上下文传递

- 在 `packages/types/src/stepContext.ts` 为 `RuntimeStepContext` 增加 `activeDeviceId`。
- 在 `packages/agent-runtime/src/utils/stepContextComputer.ts` 支持计算并携带该字段。
- 在 `src/store/chat/slices/message/selectors/dbMessage.ts` 增加 `selectActiveDeviceIdFromMessages`，从最近的 `lobe-remote-device` tool message 中恢复 active device。
- 在 `src/store/chat/slices/aiChat/actions/streamingExecutor.ts` 将 active device 写入 runtime step context。
- 在 `src/store/chat/agents/createAgentExecutors.ts` 中从 step context 或历史 tool message 恢复 `activeDeviceId`，并动态注入 `lobe-local-system`。

### Web 远程 Local System 执行

- 在 `apps/server/src/routers/lambda/device.ts` 增加 `executeLocalSystemTool` mutation。
- 该接口只允许 `LocalSystemApiName`，并固定 `identifier: LocalSystemIdentifier`，避免浏览器代理任意工具。
- 在 `src/services/device.ts` 增加 client wrapper。
- 在 `packages/builtin-tool-local-system/src/client/executor/index.ts` 中，当 `ctx.stepContext.activeDeviceId` 存在时通过 device gateway 执行；否则保留 Electron IPC 路径。
- 补充 `packages/builtin-tool-local-system/src/client/executor/index.test.ts`，验证 `runCommand` 会转发到激活的远程设备。

### Docker 构建修复

- `Dockerfile` 为 CN mirror 构建补充 `FFMPEG_BINARIES_URL`。
- runtime 镜像 COPY 使用 `--chown=1001:1001`，减少最终阶段递归 `chown`，避免 scratch/distroless 组合下权限问题。

## 已验证

自动化验证：

- `pnpm exec vitest run --silent='passed-only' src/store/chat/slices/message/selectors/dbMessage.test.ts src/store/chat/agents/__tests__/createAgentExecutors/call-llm.test.ts`
  - 通过：60 tests
- `pnpm exec vitest run --config .tmp/vitest-packages.mts --silent='passed-only' packages/builtin-tool-local-system/src/client/executor/index.test.ts`
  - 通过：5 tests
- `git diff --check`
  - 通过

构建与运行验证：

- `docker compose build --build-arg USE_CN_MIRROR=true lobe`
  - 通过，生成镜像 `lobehub/lobehub:premature-close-fixed`
- `docker compose up -d lobe`
  - 已启动容器 `lobehub`
- `curl -fsS http://localhost:3211/api/version`
  - 返回 `{"version":"2.2.6"}`
- 容器内经 `DEVICE_GATEWAY_URL` 查询设备成功：
  - `hostname`: `user-H610-VH4-B`
  - `deviceId`: `47061849f55ad5c0449a90652664be91`
  - `platform`: `linux`

类型检查状态：

- `pnpm exec tsc --noEmit --pretty false --skipLibCheck` 未得到类型错误，但进程因 Node heap OOM 终止。因此本次不能声称完整 typecheck 已通过。

## 手动端到端验证步骤

在浏览器打开当前 Docker 服务：

```text
http://localhost:3211
```

新建空白话题，选择 DeepSeek 模型，发送：

```text
在设备 user-H610-VH4-B 上运行一段 Python demo，输出 hostname、platform、当前工作目录和 Python 版本。
```

期望工具链路：

1. 调用 `lobe-remote-device/listOnlineDevices`，能看到 `user-H610-VH4-B` 在线。
2. 调用 `lobe-remote-device/activateDevice`，激活该设备。
3. 后续调用 `lobe-local-system/runCommand`，在该设备上运行 Python。
4. SSE 不应再出现导致前端失败的 `Premature close`。
5. 不应再调用 `lobe-skills` 或 `lobe-cloud-sandbox`。
6. 不应再出现 `MARKET_AUTH_REQUIRED`。

如果验证成功，聊天回复应包含设备侧命令输出，例如 hostname、Linux platform、当前目录和 Python 版本。

## 结论

问题不是必须使用 LobeHub 市场 / 云端沙箱才能执行，而是原先客户端没有把远程设备工具、激活状态、Local System 远程执行三段链路接起来。修复后链路变为：

```text
DeepSeek tool call
-> lobe-remote-device 查询/激活设备
-> RuntimeStepContext.activeDeviceId
-> 动态注入 lobe-local-system
-> Web client 经受限 device lambda route
-> device gateway
-> user-H610-VH4-B 本地执行
```

云端 device gateway 仍是当前 Web 版本的中继边界，但不再需要走 `lobe-skills` / `lobe-cloud-sandbox`，也不应触发市场认证错误。
