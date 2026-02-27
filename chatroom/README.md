# Chatroom - 临时云聊天室

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

## 🚀 快速开始

### 方式一：交互式菜单（推荐）

```bash
# 下载项目
git clone https://github.com/lemmomay/22-claw.git
cd 22-claw/chatroom

# 运行管理脚本（进入交互式菜单）
./chatroom.sh
```

**菜单界面：**
```
╔════════════════════════════════════════╗
║       Chatroom 管理面板                ║
╚════════════════════════════════════════╝

  服务状态: ● 运行中

  1. 安装服务
  2. 启动服务
  3. 停止服务
  4. 重启服务
  5. 查看状态
  6. 查看日志
  7. 检查依赖
  8. 卸载服务
  0. 退出

  请选择 [0-8]:
```

### 方式二：命令行模式

```bash
# 安装
./chatroom.sh install

# 指定端口安装
./chatroom.sh install 8080

# 管理服务
./chatroom.sh start      # 启动
./chatroom.sh stop       # 停止
./chatroom.sh restart    # 重启
./chatroom.sh status     # 状态
./chatroom.sh logs       # 日志
./chatroom.sh uninstall  # 卸载
```

### 方式三：Docker 部署

```bash
# 使用 docker-compose
docker-compose up -d

# 查看日志
docker-compose logs -f
```

详细配置请参考 [DOCKER.md](./DOCKER.md)

## 🔧 系统服务管理

安装后也可以使用系统命令：

**systemd (Ubuntu/Debian/CentOS):**
```bash
systemctl start chatroom
systemctl stop chatroom
systemctl restart chatroom
systemctl status chatroom
journalctl -u chatroom -f
```

**OpenRC (Alpine Linux):**
```bash
rc-service chatroom start
rc-service chatroom stop
rc-service chatroom restart
rc-service chatroom status
tail -f /var/log/chatroom.log
```

## ⚙️ 配置

### 环境变量

```bash
# 端口（默认 28881）
export PORT=28881

# 生产环境
export NODE_ENV=production
```

### 修改配置文件

编辑 `src/config.js`：

```javascript
module.exports = {
  PORT: process.env.PORT || 28881,
  GRACE_PERIOD_MS: 30 * 60 * 1000,  // 30 分钟
  MAX_FILE_SIZE: 30 * 1024 * 1024,  // 30MB
  MIN_DURATION_HOURS: 1,
  MAX_DURATION_HOURS: 72,
  // ... 更多配置
};
```

## 📊 资源占用

在 Alpine Linux (183MB RAM) 上的实际占用：

- **内存**: ~40-50MB
- **磁盘**: ~180MB (含 node_modules)
- **CPU**: 空闲时 <1%
- **脚本**: 几乎无占用（仅在执行时运行）

## 🔒 安全建议

### 1. 使用反向代理（推荐）

**Nginx 配置示例：**

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
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### 2. 配置防火墙

```bash
# UFW (Ubuntu/Debian)
ufw allow 28881/tcp

# iptables (Alpine)
iptables -A INPUT -p tcp --dport 28881 -j ACCEPT
```

### 3. 定期更新

```bash
cd /root/chatroom
git pull
npm install --production
./chatroom.sh restart
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

## 🐛 故障排查

### 服务无法启动

```bash
# 使用脚本检查
./chatroom.sh status

# 查看日志
./chatroom.sh logs

# 检查依赖
./chatroom.sh
# 然后选择 7 (检查依赖)
```

### 端口被占用

```bash
# 查看端口占用
ss -tlnp | grep 28881

# 或使用脚本重新安装并指定其他端口
./chatroom.sh install 8080
```

### 依赖问题

```bash
# 重新安装依赖
cd /root/chatroom
rm -rf node_modules package-lock.json
npm install --production

# 重启服务
./chatroom.sh restart
```

## 📚 更多文档

- [Docker 部署指南](./DOCKER.md) - 详细的 Docker 配置和优化
- [GitHub 仓库](https://github.com/lemmomay/22-claw)

## 📄 许可

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

_由 22 和 11 共同开发维护_ 🌸
