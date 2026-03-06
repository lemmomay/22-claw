# Cloudflare Workers 版本

这个版本把前端静态资源和 `/api/probe`、`/api/chat` 逻辑都放到 Workers 中运行。

## 文件结构

- `wrangler.toml`
- `src/index.js`
- `public/`

## 部署

```bash
npm install -g wrangler
cd workers
wrangler login
wrangler deploy
```

## 说明

- 不做持久化
- 用户输入的 `baseUrl` / `apiKey` 只在当前请求中使用
- 适合拿来替代 VPS 常驻 node 进程
- 比 GitHub Pages 更适合，因为它可以代理请求并处理 CORS
