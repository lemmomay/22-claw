# Chatroom V2 - 临时云聊天室

轻量级临时聊天室，支持实时通讯和文件分享。专为低资源环境优化，可在 64MB+ 内存的 VPS 上稳定运行。

## ✨ 特性

- ⏱️ **临时房间** - 1-72 小时自动过期
- 🔒 **密码保护** - 可选的房间密码
- 👥 **实时成员列表** - 查看在线用户
- 📸 **图片上传分享** - 支持拖拽和粘贴
- 🛡️ **管理员命令** - 踢人、清屏、设置密码
- 🔄 **断线重连保护** - 30分钟 grace period
- 🔔 **浏览器通知** - 新消息提醒
- 🎨 **现代 UI** - 渐变背景、平滑动画
- 🐧 **Alpine 兼容** - 支持小小鸡部署

## 📦 部署方式

### 方式 1: 一键安装脚本（推荐）

自动检测系统类型（systemd/OpenRC），安装依赖并配置服务：

```bash
# 下载项目
git clone https://github.com/lemmomay/22-claw.git
cd 22-claw/chatroom-v2

# 运行安装脚本
chmod +x install.sh
./install.sh
```

脚本会自动：
- 检测并安装 Node.js（如果需要）
- 安装项目依赖
- 配置系统服务（systemd 或 OpenRC）
- 可选：立即启动服务

### 方式 2: Docker 部署

适合容器化环境：

```bash
# 使用 docker-compose（推荐）
docker-compose up -d

# 或使用 docker 命令
docker build -t chatroom-v2 .
docker run -d \
  --name chatroom \
  -p 28881:28881 \
  --restart unless-stopped \
  chatroom-v2
```

查看日志：
```bash
docker-compose logs -f
# 或
docker logs -f chatroom
```

### 方式 3: 手动部署

```bash
# 安装依赖
npm install --production

# 启动服务
node server.js

# 或后台运行
nohup node server.js > chatroom.log 2>&1 &
```

## 🔧 系统服务管理

### systemd (Ubuntu/Debian/CentOS)

```bash
# 启动
systemctl start chatroom

# 停止
systemctl stop chatroom

# 重启
systemctl restart chatroom

# 查看状态
systemctl status chatroom

# 查看日志
journalctl -u chatroom -f

# 开机自启
systemctl enable chatroom
```

### OpenRC (Alpine Linux)

```bash
# 启动
rc-service chatroom start

# 停止
rc-service chatroom stop

# 重启
rc-service chatroom restart

# 查看状态
rc-service chatroom status

# 查看日志
tail -f /var/log/chatroom.log

# 开机自启
rc-update add chatroom default
```

## ⚙️ 配置

### 环境变量

```bash
# 端口（默认 28881）
export PORT=28881

# 生产环境
export NODE_ENV=production
```

### 修改配置

编辑 `src/config.js`：

```javascript
module.exports = {
  PORT: process.env.PORT || 28881,
  GRACE_PERIOD_MS: 30 * 60 * 1000,  // 30 分钟
  MAX_FILE_SIZE: 30 * 1024 * 1024,  // 30MB
  // ... 更多配置
};
```

## 📊 资源占用

在 Alpine Linux (183MB RAM) 上的实际占用：

- **内存**: ~40-50MB
- **磁盘**: ~180MB (含 node_modules)
- **CPU**: 空闲时 <1%

## 🔒 安全建议

1. **反向代理**: 使用 Nginx/Caddy 添加 HTTPS
2. **防火墙**: 限制端口访问
3. **文件大小**: 根据需求调整 `MAX_FILE_SIZE`
4. **定期清理**: 自动清理 24 小时前的上传文件

### Nginx 反向代理示例

```nginx
server {
    listen 80;
    server_name chat.example.com;
    
    location / {
        proxy_pass http://localhost:28881;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 🐛 故障排查

### 服务无法启动

```bash
# 检查端口占用
netstat -tlnp | grep 28881
# 或
ss -tlnp | grep 28881

# 检查日志
tail -50 /var/log/chatroom.log

# 检查 Node.js 版本（需要 18+）
node --version
```

### 内存不足

编辑 systemd service 文件，增加内存限制：
```ini
MemoryMax=256M
```

或在 docker-compose.yml 中调整：
```yaml
deploy:
  resources:
    limits:
      memory: 256M
```

## 📝 管理员命令

在聊天框中输入（仅房间创建者可用）：

- `/clear` - 清空聊天记录
- `/kick @昵称` - 踢出指定用户
- `/pass [密码]` - 设置或取消房间密码
- `/help` - 查看帮助

## 🔗 API

### 健康检查

```bash
curl http://localhost:28881/health
```

返回：
```json
{
  "status": "ok",
  "rooms": 2,
  "clients": 5,
  "uptime": 3600.5
}
```

### WebSocket 连接

```
ws://host:port/?room=<roomId>&name=<name>&pass=<password>&durationHours=<hours>&device=<deviceId>&color=<color>
```

## 📄 许可

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

_由 22 和 11 共同开发维护_ 🌸
