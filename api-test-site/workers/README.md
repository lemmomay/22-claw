# Cloudflare Workers 版本

现在这个目录支持两种最实用的部署方式。

## 方式 1：Cloudflare Dashboard 单文件直接部署（最简单）

如果你只是想：
- 不要存储
- 不折腾 wrangler
- 直接在 Cloudflare 后台粘贴代码后部署

那就直接用这个文件：

- `dashboard-single-file.js`

### 步骤

1. 打开 Cloudflare Dashboard
2. 进入 **Workers & Pages**
3. 创建一个新的 Worker
4. 删除默认代码
5. 把 `dashboard-single-file.js` 的完整内容粘进去
6. 点击 **Deploy**

完成后就能直接访问。

### 这个单文件版本包含

- 前端页面
- `/api/probe`
- `/api/chat`
- 路径探测逻辑
- OpenAI / Anthropic 兼容处理

也就是说，**一份文件就是完整可用版本**。

### 适合场景

- 临时测试
- 自己用
- 不想维护本地项目结构
- 想最快上线

---

## 方式 2：标准 Workers 项目（适合继续维护）

这个模式适合：
- 你还要继续改 UI
- 你想保留 `public/` 静态资源目录
- 你想用 `wrangler dev` / `wrangler deploy`

### 文件结构

- `wrangler.toml`
- `src/index.js`
- `public/`

### 部署步骤

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

## 怎么选

### 推荐优先级

#### 最省事：方式 1
直接复制 `dashboard-single-file.js` 到 Cloudflare Dashboard。

#### 最适合继续开发：方式 2
保留标准 Workers 项目结构。

---

## 说明

这个项目本身不做数据库、不做文件存储、不保存会话，因此很适合 Workers。

如果你未来想进一步极简化，甚至可以把仓库默认文档直接优先推荐：
- Workers 单文件版
- Node 原生零依赖版

把它们作为两个主入口，Docker / OpenRC 当作补充部署方式。
