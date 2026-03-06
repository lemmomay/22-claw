# Cloudflare Workers 版本

这个版本把前端静态资源和 `/api/probe`、`/api/chat` 逻辑都放到 Workers 中运行。

## 适合什么场景

- 想节省 VPS 常驻资源
- 想保留这套“输入 baseUrl / key 临时测试”的体验
- 想解决纯 GitHub Pages 做不到的代理 / CORS 问题

## 文件结构

- `wrangler.toml`
- `src/index.js`
- `public/`

## 部署模式建议

### 模式 A：最省事，直接 Workers 托管前端 + API

这是当前仓库默认写法：
- 静态页面由 Workers assets 提供
- `/api/probe`、`/api/chat` 也由 Worker 处理

优点：
- 一个项目就够
- 不需要单独 VPS
- 不需要 GitHub Pages

### 模式 B：前端静态托管 + Workers 只做 API 代理

也可以把 `public/` 单独放到任意静态托管（Cloudflare Pages / GitHub Pages / 你自己的静态站），
然后把前端里的 `/api/*` 改成你的 Worker 域名，例如：

```js
https://your-worker.your-subdomain.workers.dev/api/probe
https://your-worker.your-subdomain.workers.dev/api/chat
```

优点：
- 前后端职责更清楚
- 以后更容易换 UI

缺点：
- 要多处理一层前端配置

## 手动部署教程

### 1. 安装 wrangler

```bash
npm install -g wrangler
```

### 2. 登录 Cloudflare

```bash
cd workers
wrangler login
```

浏览器会打开授权页面，确认即可。

### 3. 本地预览

```bash
wrangler dev
```

默认会给你一个本地调试地址。

### 4. 正式部署

```bash
wrangler deploy
```

部署成功后会返回一个类似：

```bash
https://api-test-site-worker.<subdomain>.workers.dev
```

### 5. 打开测试

如果你使用模式 A，直接打开返回的 workers 地址即可。

## 手动改名 / 改域名

编辑 `wrangler.toml`：

```toml
name = "api-test-site-worker"
main = "src/index.js"
compatibility_date = "2026-03-06"

[assets]
directory = "./public"
binding = "ASSETS"
```

你可以修改：
- `name`
- 自定义域名绑定（在 Cloudflare 控制台配置）

## 注意事项

- 不做持久化
- 用户输入的 `baseUrl` / `apiKey` 只在当前请求中使用
- 适合临时测试站，不建议当正式多用户业务后端
- 某些上游 API 如果有额外反爬 / 区域限制，Worker 可能仍会受限

## 我建议的最终方案

如果你要：
- **最省 VPS** → 直接用模式 A
- **以后前端还要大改** → 用模式 B
