# Cloudflare Workers 版本

这版我重新整理成两种模式，其中 **模式 0** 是你说的那种最简单方案：

## 模式 0：直接复制代码到 Cloudflare Workers 后台，然后部署

这是最适合“不需要存储、只想快速上线”的方式。

### 步骤

1. 打开 Cloudflare Dashboard
2. 进入 **Workers & Pages**
3. 创建一个新的 Worker
4. 把 `workers/src/index.js` 的内容**整段复制进去**
5. 点击部署

如果你只需要 API 代理逻辑，这样就已经可以直接跑起来了。

### 但要注意

这个模式默认只适合：
- 你自己再配一个独立前端
- 或者你只先测试 `/api/probe`、`/api/chat`

因为当前这个项目的完整 UI 还在 `workers/public/` 里，不是单文件 HTML 内联。

---

## 模式 A：完整 Workers 项目（推荐）

这个模式包含：
- 前端静态资源
- `/api/probe`
- `/api/chat`

也就是当前仓库里的标准 Workers 版本。

### 文件

- `wrangler.toml`
- `src/index.js`
- `public/`

### 手动部署

```bash
npm install -g wrangler
cd workers
wrangler login
wrangler deploy
```

### 本地调试

```bash
wrangler dev
```

---

## 模式 B：前端静态托管，Workers 只做 API

如果你以后想把前端单独放：
- GitHub Pages
- Cloudflare Pages
- 任何静态站

那就可以只保留 Worker 的 `/api/*` 逻辑。

前端里把请求地址改成你的 Worker 域名即可，比如：

```js
https://your-worker.workers.dev/api/probe
https://your-worker.workers.dev/api/chat
```

---

## 我建议

如果你要：
- **最快上线** → 模式 0
- **完整使用当前界面** → 模式 A
- **以后还想继续换前端** → 模式 B

---

## 后续可继续优化

下一步还可以再做一个：
- **单文件 Workers Full 版**

也就是把：
- HTML
- CSS
- JS
- Worker API

全部塞进一个 `index.js`，这样就真的是“复制一份代码到 CF 后台直接 deploy”。

目前仓库里还没把 UI 内联成单文件，但如果你要，我下一轮可以专门继续收敛成这个版本。
