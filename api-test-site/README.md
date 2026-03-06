# api-test-site

一个轻量、临时、无持久化的 API 测试站。

适合快速测试：
- OpenAI 兼容接口
- OpenAI `/chat/completions`
- OpenAI `/responses`
- Anthropic `/messages`

## 设计原则

- **不存储**：不做数据库、不写本地会话
- **尽量少依赖**：Node 版使用原生 `http`
- **部署方式简单**：Workers 支持单文件直接部署
- **保留当前功能**：不牺牲现有探测 / 模型获取 / 聊天测试能力

---

## 推荐使用方式

### 1. 最简单：Cloudflare Workers 单文件版

如果你要的是：
- 上线最快
- 不想装 wrangler
- 不想维护 Node 环境
- 不需要存储

优先看：

- `workers/dashboard-single-file.js`
- `workers/README.md`

这是当前最推荐的极简部署方式。

---

### 2. 本机 / VPS：Node 原生零依赖版

特点：
- 无 Express
- 无第三方运行时依赖
- 只要 Node 够新即可运行

启动：

```bash
node server.js
```

指定端口：

```bash
PORT=28884 node server.js
```

---

### 3. 自托管稳定部署：Docker / OpenRC

- Docker：见 `DOCKER.md`
- OpenRC：见 `openrc/`

---

## 功能

- 输入 `baseUrl`
- 可选 `apiKey`
- 无 key 时做连通性测试
- 有 key 时获取模型列表
- 选择模型后发起聊天测试
- 支持手动覆盖路径
- 刷新即丢，不做持久化

---

## 支持的接口路径

### OpenAI 风格
- `/models`
- `/chat/completions`
- `/responses`

### Anthropic 风格
- `/models`
- `/messages`

---

## 目录结构

```text
api-test-site/
├── public/                         # Node 版前端
├── lib/provider.js                 # 公共路径/请求体逻辑
├── server.js                       # Node 原生 http 服务
├── workers/
│   ├── dashboard-single-file.js    # 可直接粘贴到 CF Dashboard 的完整单文件版
│   ├── src/index.js                # 标准 Workers 项目入口
│   ├── public/                     # 标准 Workers 静态资源
│   └── README.md
├── openrc/
├── Dockerfile
├── docker-compose.yml
└── test/
```
