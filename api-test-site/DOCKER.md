# Docker 部署

这个版本现在基于 **Node 原生 http 服务**，不再依赖 Express。

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
