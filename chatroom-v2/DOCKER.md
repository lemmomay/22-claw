# Docker 部署指南

## 快速开始

### 使用 docker-compose（推荐）

```bash
# 启动
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止
docker-compose down

# 重启
docker-compose restart
```

## docker-compose.yml 配置

```yaml
version: '3.8'

services:
  chatroom:
    build: .
    container_name: chatroom-v2
    restart: unless-stopped
    ports:
      - "28881:28881"
    environment:
      - NODE_ENV=production
      - PORT=28881
    volumes:
      # 持久化上传文件（可选）
      - ./uploads:/app/public/uploads
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:28881/health"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 5s
    # 资源限制（根据你的 VPS 调整）
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 128M
        reservations:
          cpus: '0.1'
          memory: 32M
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

## 可配置环境变量

在 `docker-compose.yml` 的 `environment` 部分添加：

```yaml
environment:
  # 端口配置
  - PORT=28881
  
  # 运行环境
  - NODE_ENV=production
  
  # 可选：自定义配置
  # - GRACE_PERIOD_MS=1800000    # 30分钟（毫秒）
  # - MAX_FILE_SIZE=31457280     # 30MB（字节）
```

## 资源限制调整

根据你的 VPS 配置调整资源限制：

### 小小鸡（64-128MB 内存）
```yaml
deploy:
  resources:
    limits:
      cpus: '0.3'
      memory: 64M
    reservations:
      cpus: '0.05'
      memory: 16M
```

### 标准配置（256MB+ 内存）
```yaml
deploy:
  resources:
    limits:
      cpus: '1.0'
      memory: 256M
    reservations:
      cpus: '0.2'
      memory: 64M
```

### 高性能（512MB+ 内存）
```yaml
deploy:
  resources:
    limits:
      cpus: '2.0'
      memory: 512M
    reservations:
      cpus: '0.5'
      memory: 128M
```

## 端口映射

修改对外暴露的端口：

```yaml
ports:
  - "8080:28881"  # 外部访问 8080，内部使用 28881
```

或者修改内部端口：

```yaml
ports:
  - "8080:8080"
environment:
  - PORT=8080
```

## 持久化存储

### 上传文件持久化

```yaml
volumes:
  - ./uploads:/app/public/uploads
```

### 日志持久化

```yaml
volumes:
  - ./uploads:/app/public/uploads
  - ./logs:/var/log
```

## 使用预构建镜像

如果不想本地构建，可以使用 Docker Hub 镜像（需要先推送）：

```yaml
services:
  chatroom:
    image: your-username/chatroom-v2:latest
    # ... 其他配置
```

## 多实例部署

运行多个实例（负载均衡）：

```yaml
version: '3.8'

services:
  chatroom-1:
    build: .
    container_name: chatroom-v2-1
    restart: unless-stopped
    ports:
      - "28881:28881"
    # ... 其他配置

  chatroom-2:
    build: .
    container_name: chatroom-v2-2
    restart: unless-stopped
    ports:
      - "28882:28881"
    # ... 其他配置
```

## 网络配置

### 自定义网络

```yaml
version: '3.8'

networks:
  chatroom-net:
    driver: bridge

services:
  chatroom:
    # ... 其他配置
    networks:
      - chatroom-net
```

### 与 Nginx 反向代理集成

```yaml
version: '3.8'

networks:
  web:
    external: true

services:
  chatroom:
    # ... 其他配置
    networks:
      - web
    expose:
      - "28881"
    # 不需要 ports 映射，通过 nginx 访问
```

## 健康检查

自定义健康检查：

```yaml
healthcheck:
  test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:28881/health"]
  interval: 30s      # 检查间隔
  timeout: 5s        # 超时时间
  retries: 3         # 重试次数
  start_period: 10s  # 启动等待时间
```

## 日志管理

### 限制日志大小

```yaml
logging:
  driver: "json-file"
  options:
    max-size: "10m"   # 单个日志文件最大 10MB
    max-file: "3"     # 保留 3 个日志文件
```

### 使用 syslog

```yaml
logging:
  driver: "syslog"
  options:
    syslog-address: "tcp://192.168.0.1:514"
```

## 常用命令

```bash
# 构建镜像
docker-compose build

# 后台启动
docker-compose up -d

# 查看日志
docker-compose logs -f

# 查看特定服务日志
docker-compose logs -f chatroom

# 进入容器
docker-compose exec chatroom sh

# 重启服务
docker-compose restart

# 停止服务
docker-compose stop

# 停止并删除容器
docker-compose down

# 停止并删除容器、网络、卷
docker-compose down -v

# 查看资源使用
docker stats chatroom-v2
```

## 故障排查

### 查看容器状态
```bash
docker-compose ps
```

### 查看详细日志
```bash
docker-compose logs --tail=100 chatroom
```

### 进入容器调试
```bash
docker-compose exec chatroom sh
# 在容器内
node --version
npm --version
ls -la /app
```

### 重新构建
```bash
docker-compose build --no-cache
docker-compose up -d
```

## 生产环境建议

1. **使用固定版本标签**
   ```yaml
   image: node:20-alpine
   ```

2. **启用健康检查**
   ```yaml
   healthcheck:
     test: ["CMD", "wget", ...]
   ```

3. **设置资源限制**
   ```yaml
   deploy:
     resources:
       limits: ...
   ```

4. **配置日志轮转**
   ```yaml
   logging:
     options:
       max-size: "10m"
       max-file: "3"
   ```

5. **使用环境变量文件**
   ```bash
   # .env 文件
   PORT=28881
   NODE_ENV=production
   ```
   
   ```yaml
   # docker-compose.yml
   env_file:
     - .env
   ```

6. **定期备份数据**
   ```bash
   # 备份上传文件
   tar czf uploads-backup-$(date +%Y%m%d).tar.gz uploads/
   ```

---

更多信息请参考主 [README.md](./README.md)
