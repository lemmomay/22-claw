# api-test-site

临时 API 测试站：

- 输入 `baseUrl` 和可选 `apiKey`
- 如果没有 key：只做基础连通性测试
- 如果有 key：自动尝试获取模型列表，并允许选择模型做一次简单聊天测试
- 支持模式：`auto` / `openai` / `anthropic`
- 支持手动指定路径覆盖自动探测
- 支持 OpenAI `/chat/completions`、`/responses`，以及 Anthropic `/messages`
- 不做任何持久化存储，刷新页面即丢失状态（主题仅保留在当前 sessionStorage）

## 启动

```bash
npm install
PORT=28882 npm start
```

打开：`http://127.0.0.1:28882`

## 常用路径

- OpenAI 风格：`/models` + `/chat/completions` 或 `/responses`
- Anthropic 风格：`/models` + `/messages`

## 部署版本

- Node / systemd：当前 VPS 在跑的版本
- Docker：见 `DOCKER.md`
- Cloudflare Workers：见 `workers/README.md`
