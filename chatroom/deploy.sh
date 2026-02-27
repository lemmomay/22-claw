#!/bin/bash
set -e

echo "🚀 部署 Chatroom V2 到小鸡 (Alpine 兼容)..."

# 配置
SSH_HOST="194.156.162.243"
SSH_PORT="18880"
SSH_USER="root"
SSH_PASS="8d3&IIY^wiOVjjSG"
REMOTE_DIR="~/chatroom-v2"
LOCAL_DIR="/root/clawd/chatroom-v2"

# 打包
echo "📦 打包项目..."
cd /root/clawd
tar czf /tmp/chatroom-v2.tar.gz -C chatroom-v2 \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='*.log' \
  .

# 上传
echo "📤 上传到服务器..."
sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no -p $SSH_PORT $SSH_USER@$SSH_HOST \
  "mkdir -p $REMOTE_DIR"

sshpass -p "$SSH_PASS" scp -P $SSH_PORT /tmp/chatroom-v2.tar.gz $SSH_USER@$SSH_HOST:/tmp/

# 解压并安装
echo "📥 解压并安装依赖..."
sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no -p $SSH_PORT $SSH_USER@$SSH_HOST << 'ENDSSH'
cd ~/chatroom-v2
tar xzf /tmp/chatroom-v2.tar.gz
npm install --production --no-optional
rm /tmp/chatroom-v2.tar.gz
echo "✅ 依赖安装完成"
ENDSSH

# 重启服务
echo "🔄 重启服务..."
sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no -p $SSH_PORT $SSH_USER@$SSH_HOST << 'ENDSSH'
# 停止旧服务 (Alpine 使用 pkill)
pkill -f "node.*chatroom.*server.js" || true
pkill -f "node server.js" || true
sleep 2

# 备份旧的 chatroom
if [ -d ~/chatroom-old ]; then
  rm -rf ~/chatroom-old
fi
if [ -d ~/chatroom ]; then
  mv ~/chatroom ~/chatroom-old
  echo "📦 已备份旧版本到 ~/chatroom-old"
fi

# 启动新服务 (Alpine 使用 nohup)
cd ~/chatroom-v2
nohup node server.js > chatroom.log 2>&1 &
NEW_PID=$!
sleep 3

# 检查状态
if ps | grep -v grep | grep "$NEW_PID" > /dev/null; then
  echo "✅ 服务启动成功 (PID: $NEW_PID)"
  echo "📊 进程信息:"
  ps aux | grep "node server.js" | grep -v grep || true
  echo ""
  echo "📝 最近日志:"
  tail -20 chatroom.log
else
  echo "❌ 服务启动失败"
  echo "📝 错误日志:"
  cat chatroom.log
  exit 1
fi
ENDSSH

echo ""
echo "✨ 部署完成！"
echo "🌐 访问: http://$SSH_HOST:28881"
echo "📊 健康检查: http://$SSH_HOST:28881/health"

# 清理本地临时文件
rm /tmp/chatroom-v2.tar.gz

echo ""
echo "💡 提示: 查看日志 ssh -p $SSH_PORT root@$SSH_HOST 'tail -f ~/chatroom-v2/chatroom.log'"
