# Docker 部署

## 构建并运行

```bash
docker build -t api-test-site .
docker run -d \
  --name api-test-site \
  -p 28884:28884 \
  -e PORT=28884 \
  --restart unless-stopped \
  api-test-site
```

## 或使用 docker compose

```bash
docker compose up -d --build
```

打开：`http://127.0.0.1:28884`

## 建议用法

- 小 VPS / 小鸡：优先 Docker，部署简单，迁移方便
- 已有反代：把 28884 挂到 nginx/caddy/traefik 后面
- 如果你不想长期占 VPS：优先看 `workers/README.md`
