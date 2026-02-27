class CommandHandler {
  constructor(roomManager) {
    this.roomManager = roomManager;
  }

  handle(ws, text) {
    const cmd = text.toLowerCase();
    
    if (!ws.isAdmin) {
      return this.roomManager.send(ws, { 
        type: 'system', 
        text: '只有管理员可以使用命令', 
        ts: Date.now() 
      });
    }

    if (cmd === '/clear') {
      return this.handleClear(ws);
    }
    
    if (cmd.startsWith('/kick')) {
      return this.handleKick(ws, text);
    }
    
    if (cmd.startsWith('/pass')) {
      return this.handlePassword(ws, text);
    }
    
    if (cmd === '/help') {
      return this.handleHelp(ws);
    }

    // Unknown command
    this.roomManager.send(ws, { 
      type: 'system', 
      text: '未知命令。输入 /help 查看帮助', 
      ts: Date.now() 
    });
  }

  handleClear(ws) {
    this.roomManager.broadcast(ws.roomId, { 
      type: 'clear', 
      by: ws.name, 
      ts: Date.now() 
    });
    
    this.roomManager.broadcast(ws.roomId, { 
      type: 'system', 
      text: '管理员已清空聊天', 
      ts: Date.now() 
    });
  }

  handleKick(ws, text) {
    const match = text.match(/^\/kick\s+@?(.+)$/i);
    
    if (!match) {
      return this.roomManager.send(ws, { 
        type: 'system', 
        text: '用法：/kick @昵称', 
        ts: Date.now() 
      });
    }

    const targetName = match[1].trim();
    if (!targetName) return;

    const room = this.roomManager.getRoom(ws.roomId);
    if (!room) return;

    const kicked = [];
    for (const client of room.clients) {
      if (client.name === targetName) {
        this.roomManager.send(client, { 
          type: 'kicked', 
          text: '你已被管理员踢出', 
          ts: Date.now() 
        });
        
        try {
          client.close(4002, 'kicked');
        } catch (e) {
          console.error('Error kicking client:', e);
        }
        
        kicked.push(client);
      }
    }

    if (kicked.length === 0) {
      return this.roomManager.send(ws, { 
        type: 'system', 
        text: `未找到用户：${targetName}`, 
        ts: Date.now() 
      });
    }

    this.roomManager.broadcast(ws.roomId, { 
      type: 'system', 
      text: `管理员踢出了 ${targetName}`, 
      ts: Date.now() 
    });
  }

  handlePassword(ws, text) {
    const match = text.match(/^\/pass\s*(.*)$/i);
    const newPassword = (match ? match[1] : '').trim();

    const room = this.roomManager.getRoom(ws.roomId);
    if (!room) return;

    room.password = newPassword;
    room.hasPassword = !!newPassword;

    this.roomManager.broadcast(ws.roomId, { 
      type: 'system', 
      text: newPassword 
        ? '管理员已设置房间密码' 
        : '管理员已取消房间密码', 
      ts: Date.now() 
    });
  }

  handleHelp(ws) {
    const room = this.roomManager.getRoom(ws.roomId);
    if (!room) return;

    this.roomManager.send(ws, { 
      type: 'admin_help', 
      text: '管理员命令：/clear 清空聊天，/kick @昵称 踢人，/pass [密码] 设置密码（可留空取消），/help 查看帮助', 
      expiresAt: room.expiresAt, 
      ts: Date.now() 
    });
  }
}

module.exports = CommandHandler;
