# Pages 版说明

这是一个**纯前端**的 API 测试页，适合直接部署到 **GitHub Pages**。

## 特点

- 纯 HTML/CSS/JS
- 不需要 Node / Workers / Docker
- 浏览器直接请求目标 API
- 不写 localStorage / sessionStorage / IndexedDB
- 刷新即丢
- 支持：
  - OpenAI 兼容 `/models`
  - OpenAI `/chat/completions`
  - OpenAI `/responses`
  - Anthropic `/messages`

## 重要限制

### 1. 受 CORS 限制
如果目标 API 不允许浏览器跨域访问，这个 Pages 版会失败。

这不一定代表接口坏了，可能只是：
- 没有放开 `Access-Control-Allow-Origin`
- 不允许 `Authorization` / `anthropic-version` 这类 header
- 不允许浏览器预检请求（OPTIONS）

这类情况请改用 **Workers 版**。

### 2. Key 在浏览器环境中使用
这个版本不会把 key 发给你的服务器，但 key 仍会存在于当前浏览器页面运行时内存里。

所以它的安全模型是：
- **比自建中转后端更轻、更少暴露面**
- **但不是“绝对隐藏 key”**

## 使用方式

### 方式一：直接放 GitHub Pages
把 `pages/` 目录内容作为静态站点发布即可。

### 方式二：本地直接打开
可以直接双击 `index.html` 打开。

但注意：
- 某些浏览器在 `file://` 场景会更严格
- 更推荐用静态托管（例如 GitHub Pages）

## 交互逻辑

### 无 API Key
- 只做连通性测试
- 尝试常见路径
- 不发聊天请求

### 有 API Key
- 优先尝试 `/models`
- 若成功，自动填充模型下拉框
- 若失败，可手动输入模型名继续测试

### 聊天测试
自动尝试：
- OpenAI: `/chat/completions`、`/responses`
- Anthropic: `/messages`

也可以手动填路径覆盖。

## 推荐定位

- **Pages 版**：最轻、零后端、适合支持浏览器直连的接口
- **Workers 版**：更稳、更广兼容、适合正式使用
