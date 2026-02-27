const config = require('./config');

class ConnectionHandler {
  constructor(roomManager, commandHandler) {
    this.roomManager = roomManager;
    this.commandHandler = commandHandler;
  }

  handleConnection(ws, req) {
    try {
      const params = this.parseConnectionParams(req);
      const validation = this.validateConnection(params);
      
      if (!validation.valid) {
        this.roomManager.send(ws, { 
          type: 'error', 
          code: validation.code, 
          message: validation.message, 
          ts: Date.now() 
        });
        return ws.close(4000, validation.message);
      }

      let room = this.roomManager.getRoom(params.roomId);

      if (!room) {
        room = this.handleRoomCreation(ws, params);
        if (!room) return; // Error already sent
      } else {
        const joinResult = this.handleRoomJoin(ws, room, params);
        if (!joinResult.success) return; // Error already sent
      }

      this.setupClient(ws, room, params);
      this.setupEventHandlers(ws);
      
    } catch (e) {
      console.error('Connection error:', e);
      this.roomManager.send(ws, { 
        type: 'error', 
        code: 'internal_error', 
        message: '服务器错误', 
        ts: Date.now() 
      });
      ws.close(4000, 'internal error');
    }
  }

  parseConnectionParams(req) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const params = url.searchParams;

    const roomId = params.get('room') || 'lobby';
    const name = params.get('name') || '匿名';
    const password = params.get('pass') || '';
    const color = params.get('color') || config.DEFAULT_COLOR;
    const deviceId = params.get('device') || '';
    
    const durationHours = parseFloat(params.get('durationHours') || '0');
    const durationMinParam = parseInt(params.get('duration') || '0', 10);

    let durationMin = 0;
    if (durationHours && !Number.isNaN(durationHours)) {
      durationMin = Math.round(durationHours * 60);
    } else if (durationMinParam && !Number.isNaN(durationMinParam)) {
      durationMin = durationMinParam;
    }

    return { roomId, name, password, color, deviceId, durationMin, durationHours };
  }

  validateConnection(params) {
    // Validate room ID
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(params.roomId)) {
      return { 
        valid: false, 
        code: 'invalid_room_id', 
        message: '房间 ID 只能包含字母、数字、下划线和连字符，长度 1-32' 
      };
    }

    // Validate name
    if (!params.name || params.name.length > 20) {
      return { 
        valid: false, 
        code: 'invalid_name', 
        message: '昵称长度需在 1-20 字符之间' 
      };
    }

    return { valid: true };
  }

  handleRoomCreation(ws, params) {
    if (!params.durationMin) {
      this.roomManager.send(ws, { 
        type: 'error', 
        code: 'bad_duration', 
        message: '创建房间需要指定时长', 
        ts: Date.now() 
      });
      ws.close(4000, 'need duration');
      return null;
    }

    // Validate duration
    if (params.durationHours) {
      if (params.durationHours < config.MIN_DURATION_HOURS || 
          params.durationHours > config.MAX_DURATION_HOURS) {
        this.roomManager.send(ws, { 
          type: 'error', 
          code: 'bad_duration', 
          message: `时长需在 ${config.MIN_DURATION_HOURS}-${config.MAX_DURATION_HOURS} 小时之间`, 
          ts: Date.now() 
        });
        ws.close(4000, 'bad duration');
        return null;
      }
    } else {
      if (params.durationMin < config.MIN_DURATION_MINUTES || 
          params.durationMin > config.MAX_DURATION_MINUTES) {
        this.roomManager.send(ws, { 
          type: 'error', 
          code: 'bad_duration', 
          message: `时长需在 ${config.MIN_DURATION_MINUTES}-${config.MAX_DURATION_MINUTES} 分钟之间`, 
          ts: Date.now() 
        });
        ws.close(4000, 'bad duration');
        return null;
      }
    }

    const room = this.roomManager.createRoom(
      params.roomId, 
      params.name, 
      params.password, 
      params.durationMin
    );
    
    ws.isAdmin = true;
    return room;
  }

  handleRoomJoin(ws, room, params) {
    // Check if room expired
    if (room.expiresAt <= Date.now()) {
      this.roomManager.expireRoom(params.roomId);
      this.roomManager.send(ws, { 
        type: 'error', 
        code: 'expired', 
        message: '房间已过期，请重新创建', 
        ts: Date.now() 
      });
      ws.close(4001, 'expired');
      return { success: false };
    }

    // Validate password - FIXED: Now properly checks password
    if (!this.roomManager.validatePassword(room, params.password)) {
      this.roomManager.send(ws, { 
        type: 'error', 
        code: 'wrong_password', 
        message: '密码错误或需要密码', 
        ts: Date.now() 
      });
      ws.close(4000, 'wrong password');
      return { success: false };
    }

    // Check for duplicate name
    const existingClient = this.roomManager.findClientByName(room, params.name);
    if (existingClient) {
      this.roomManager.send(ws, { 
        type: 'error', 
        code: 'duplicate_name', 
        message: '该昵称已在线，请换一个', 
        ts: Date.now() 
      });
      ws.close(4003, 'duplicate name');
      return { success: false };
    }

    // Handle device-based reconnection/rename
    if (params.deviceId) {
      // 如果设备在 ghost 列表中，说明是断线重连，应该允许并清除 ghost
      if (this.roomManager.isGhostActive(room, params.deviceId)) {
        // 清除 ghost 状态
        room.ghosts.delete(params.deviceId);
        const timer = room.ghostCleanupTimers.get(params.deviceId);
        if (timer) {
          clearTimeout(timer);
          room.ghostCleanupTimers.delete(params.deviceId);
        }
        // 继续正常连接流程
      }

      const deviceClient = this.roomManager.findClientByDevice(room, params.deviceId);
      if (deviceClient) {
        if (deviceClient.name === params.name) {
          this.roomManager.send(ws, { 
            type: 'error', 
            code: 'duplicate_device', 
            message: '该设备已在线，请勿重复进入', 
            ts: Date.now() 
          });
          ws.close(4004, 'duplicate device');
          return { success: false };
        }

        // Rename existing connection
        const oldName = deviceClient.name;
        deviceClient.name = params.name;
        deviceClient.color = params.color;
        
        if (room.adminName === oldName) {
          room.adminName = params.name;
        }

        this.roomManager.broadcast(params.roomId, { 
          type: 'system', 
          text: `${oldName} 改名为 ${params.name}`, 
          ts: Date.now() 
        });
        this.roomManager.broadcastMembers(params.roomId);
        ws.close(4005, 'renamed');
        return { success: false };
      }
    }

    // Check if user is admin
    if (room.adminName === params.name) {
      ws.isAdmin = true;
    }

    return { success: true };
  }

  setupClient(ws, room, params) {
    ws.roomId = params.roomId;
    ws.name = params.name;
    ws.color = params.color;
    ws.deviceId = params.deviceId;

    room.clients.add(ws);

    // Send room info
    this.roomManager.send(ws, { 
      type: 'room_info', 
      admin: room.adminName, 
      expiresAt: room.expiresAt, 
      ts: Date.now() 
    });

    // Send admin help if newly created room
    if (ws.isAdmin && room.createdAt + 5000 > Date.now()) {
      this.roomManager.send(ws, { 
        type: 'admin_help', 
        text: '你是管理员。命令：/clear 清空聊天，/kick @昵称 踢人，/pass [密码] 设置密码（可留空取消），/help 查看帮助', 
        expiresAt: room.expiresAt, 
        ts: Date.now() 
      });
      
      this.roomManager.send(ws, { 
        type: 'set_pass', 
        ts: Date.now(), 
        hasPass: room.hasPassword 
      });
    }

    // Announce join
    this.roomManager.broadcast(params.roomId, { 
      type: 'system', 
      text: `${params.name} 进入了房间`, 
      ts: Date.now() 
    });
    
    this.roomManager.broadcastMembers(params.roomId);
  }

  setupEventHandlers(ws) {
    ws.on('message', (msg) => this.handleMessage(ws, msg));
    ws.on('close', () => this.roomManager.handleDisconnect(ws));
    ws.on('error', (err) => console.error('WebSocket error:', err));
  }

  handleMessage(ws, msg) {
    try {
      const data = JSON.parse(msg.toString());
      
      if (data.type !== 'chat') return;
      
      const text = String(data.text || '').trim();
      if (!text) return;

      // Handle commands
      if (text.startsWith('/')) {
        return this.commandHandler.handle(ws, text);
      }

      // Handle regular chat message
      const replyTo = data.replyTo && typeof data.replyTo === 'object'
        ? {
            name: String(data.replyTo.name || '').slice(0, 40),
            text: String(data.replyTo.text || '').slice(0, 200)
          }
        : null;

      this.roomManager.broadcast(ws.roomId, {
        type: 'chat',
        name: ws.name,
        color: ws.color,
        text: text.slice(0, 2000), // Limit message length
        replyTo,
        ts: Date.now()
      });
      
    } catch (e) {
      console.error('Message handling error:', e);
    }
  }
}

module.exports = ConnectionHandler;
