# s100177 修复版 Docker 部署

这个目录用于部署 `s100177/lobehub` fork 中的修复版，而不是拉取官方 `lobehub/lobehub` 镜像。

修复版包含：

- DeepSeek SSE `Premature close` 容错。
- `lobe-remote-device` 在线设备查询和激活。
- 激活设备后的 `activeDeviceId` 上下文传递。
- Web 端经 device gateway 执行 `lobe-local-system`，避免错误退回 `lobe-skills` / `lobe-cloud-sandbox` 导致 `MARKET_AUTH_REQUIRED`。

## 使用方式

从 fork 拉代码：

```bash
git clone https://github.com/s100177/lobehub.git
cd lobehub
git checkout s100177/stable
```

准备环境变量：

```bash
cd docker-compose/s100177
cp .env.example .env
```

编辑 `.env`，至少替换：

```text
APP_URL
KEY_VAULTS_SECRET
AUTH_SECRET
POSTGRES_PASSWORD
RUSTFS_SECRET_KEY
DEVICE_GATEWAY_SERVICE_TOKEN
JWKS_KEY
DEVICE_GATEWAY_JWKS_PUBLIC_KEY
```

随机密钥可以用：

```bash
openssl rand -base64 32
```

构建并启动：

```bash
docker compose build lobe device-gateway
docker compose up -d
```

检查：

```bash
docker compose ps
curl -fsS http://localhost:${LOBE_PORT:-3211}/api/version
```

## 为什么不能直接用官方 deploy compose

官方 compose 中 `lobe` 服务通常是：

```yaml
image: lobehub/lobehub
```

这会拉取官方镜像，不包含 `s100177/lobehub` fork 里的修复。

本目录的 compose 明确使用：

```yaml
image: s100177/lobehub:local
build:
  context: ../..
```

所以部署内容来自当前 clone 的 fork 代码。

## Device Gateway

远程设备能力需要 `device-gateway` 服务。本 compose 固定使用上游 gateway 提交：

```text
7052a333d6effd11634683d0615b08fe686fc897
```

并用 `dockerfile_inline` 修正构建上下文路径，避免上游 Dockerfile 路径与子目录构建上下文不匹配。

## 手动验证远程设备修复

打开 LobeChat 后新建空白话题，选择 DeepSeek 模型，发送：

```text
在设备 user-H610-VH4-B 上运行一段 Python demo，输出 hostname、platform、当前工作目录和 Python 版本。
```

期望工具链路：

```text
lobe-remote-device/listOnlineDevices
-> lobe-remote-device/activateDevice
-> lobe-local-system/runCommand
```

不应出现：

```text
lobe-skills
lobe-cloud-sandbox
MARKET_AUTH_REQUIRED
```

## 注意

- `.env` 不能提交到 Git。
- 如果你改了代码，必须重新执行 `docker compose build lobe` 后再 `docker compose up -d lobe`。
- 如果只改文档，不需要重建镜像。
