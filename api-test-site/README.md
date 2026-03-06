# api-test-site

临时 API 测试站：

- 输入 `baseUrl` 和可选 `apiKey`
- 如果没有 key：只做基础连通性测试
- 如果有 key：自动尝试获取模型列表，并允许选择模型做一次简单聊天测试
- 支持模式：`auto` / `openai` / `anthropic`
- 支持手动指定路径覆盖自动探测
- 支持 OpenAI `/chat/completions`、`/responses`，以及 Anthropic `/messages`
- 不做任何持久化存储，刷新页面即丢失状态（主题仅保留在当前 sessionStorage）

## 本地启动

```bash
npm install
PORT=28882 npm start
```

打开：`http://127.0.0.1:28882`

## 常用路径

- OpenAI 风格：`/models` + `/chat/completions` 或 `/responses`
- Anthropic 风格：`/models` + `/messages`

## 部署版本

- Node / systemd：适合普通 Ubuntu / Debian VPS
- Docker：见 `DOCKER.md`
- Cloudflare Workers：见 `workers/README.md`
- OpenRC：见 `openrc/`

## OpenRC 部署

适合 Alpine、Void（兼容场景）或使用 OpenRC 的机器。

### 1. 放置项目

```bash
mkdir -p /opt/api-test-site
cp -r ./* /opt/api-test-site/
cd /opt/api-test-site
npm install --omit=dev
```

### 2. 安装服务脚本

```bash
cp openrc/api-test-site /etc/init.d/api-test-site
chmod +x /etc/init.d/api-test-site
```

### 3. 启动并设为开机自启

```bash
rc-service api-test-site start
rc-update add api-test-site default
```

### 4. 自定义端口（可选）

```bash
API_TEST_PORT=28884 rc-service api-test-site restart
```
