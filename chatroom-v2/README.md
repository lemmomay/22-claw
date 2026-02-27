# Chatroom V2 - 重构版

## 主要改进

### 1. 🐛 Bug 修复
- **密码验证漏洞**：修复了当房间设置密码但用户不提供密码时仍能进入的问题
- **内存泄漏**：优化了 ghost cleanup timers 的管理，避免定时器累积
- **错误处理**：添加了完善的错误处理和日志记录

### 2. 🏗️ 架构重构
- **模块化设计**：将代码拆分为多个职责单一的模块
  - `config.js` - 配置管理
  - `RoomManager.js` - 房间管理
  - `CommandHandler.js` - 命令处理
  - `ConnectionHandler.js` - 连接处理
- **更好的可维护性**：每个模块独立，易于测试和扩展

### 3. 🔒 安全增强
- **文件类型验证**：限制上传文件类型
- **文件大小限制**：明确的 30MB 限制
- **输入验证**：房间 ID、昵称等参数的严格验证
- **消息长度限制**：防止超长消息攻击

### 4. 🎯 功能优化
- **自动清理**：每小时自动清理 24 小时前的上传文件
- **健康检查增强**：`/health` 端点返回更多信息（房间数、客户端数、运行时间）
- **优雅关闭**：支持 SIGTERM/SIGINT 信号的优雅关闭
- **更好的日志**：关键操作都有日志记录

### 5. 📝 代码质量
- **一致的错误码**：统一的错误代码系统
- **更清晰的命名**：变量和函数名更具描述性
- **注释和文档**：关键逻辑都有注释说明

## 文件结构

```
chatroom-v2/
├── server.js                 # 主服务器文件
├── package.json              # 依赖配置
├── src/
│   ├── config.js            # 配置常量
│   ├── RoomManager.js       # 房间管理逻辑
│   ├── CommandHandler.js    # 命令处理逻辑
│   └── ConnectionHandler.js # WebSocket 连接处理
└── public/
    ├── index.html           # 前端页面
    └── uploads/             # 上传文件目录
```

## 部署

### 本地测试
```bash
cd /root/clawd/chatroom-v2
npm install
npm start
```

### 部署到小鸡
```bash
# 打包
cd /root/clawd
tar czf chatroom-v2.tar.gz chatroom-v2/

# 上传并部署
sshpass -p '8d3&IIY^wiOVjjSG' ssh -p 18880 root@194.156.162.243 'cd ~ && tar xzf -' < chatroom-v2.tar.gz
sshpass -p '8d3&IIY^wiOVjjSG' ssh -p 18880 root@194.156.162.243 'cd ~/chatroom-v2 && npm install && pm2 stop chatroom && pm2 start server.js --name chatroom'
```

## 配置

所有配置都在 `src/config.js` 中，可以通过环境变量覆盖：

- `PORT` - 服务器端口（默认 28881）
- 其他配置见 config.js

## API

### WebSocket 连接
```
ws://host:port/?room=<roomId>&name=<name>&pass=<password>&durationHours=<hours>&device=<deviceId>&color=<color>
```

### 文件上传
```
POST /upload?room=<roomId>&name=<name>&color=<color>
Content-Type: multipart/form-data
```

### 健康检查
```
GET /health
```

## 下一步优化建议

1. **持久化**：添加 Redis 支持，实现跨进程房间共享
2. **监控**：集成 Prometheus metrics
3. **测试**：添加单元测试和集成测试
4. **限流**：添加 rate limiting 防止滥用
5. **日志**：集成结构化日志（如 winston）
