# api-test-site

一个轻量、临时、无持久化的 API 测试站。

适合用来测试：
- OpenAI 兼容接口
- OpenAI `/chat/completions`
- OpenAI `/responses`
- Anthropic `/messages`

## 项目目标

- 前端尽量简单
- 后端尽量轻：**Node 原生 http，无 Express 依赖**
- 不做数据库、不做本地持久化
- Workers 版本支持**直接复制代码到 Cloudflare Dashboard** 后部署

---

## 当前版本

### 1. Node 原生版

特点：
- 只依赖 Node 本身
- 无 Express
- 适合 VPS / systemd / OpenRC / Docker

启动：

```bash
node server.js
```

或：

```bash
PORT=28884 node server.js
```

---

### 2. Docker 版

见：`DOCKER.md`

---

### 3. Cloudflare Workers 版

见：`workers/README.md`

---

### 4. OpenRC 版

见：`openrc/`

---

## 支持的能力

- 输入 `baseUrl`
- 可选 `apiKey`
- 无 key 时做连通性测试
- 有 key 时自动拉模型
- 选模型后发一条聊天测试
- 支持手动覆盖路径
- 前端刷新即丢，不做存储

## 路径探测

### OpenAI 风格
- `/models`
- `/chat/completions`
- `/responses`

### Anthropic 风格
- `/models`
- `/messages`

## 目录结构

```text
api-test-site/
├── public/               # 前端
├── lib/provider.js       # 路径与请求体逻辑
├── server.js             # Node 原生 http 服务
├── workers/              # Workers 版本
├── openrc/               # OpenRC 启动脚本
├── Dockerfile
├── docker-compose.yml
└── test/
```
