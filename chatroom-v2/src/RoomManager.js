const WebSocket = require('ws');
const config = require('./config');

class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  createRoom(roomId, adminName, password, durationMin) {
    const expiresAt = Date.now() + durationMin * 60 * 1000;
    const room = {
      id: roomId,
      adminName,
      password: password || '',
      hasPassword: !!password,
      clients: new Set(),
      ghosts: new Map(),
      expiresAt,
      createdAt: Date.now(),
      timer: null,
      ghostCleanupTimers: new Map(),
    };
    
    room.timer = setTimeout(() => this.expireRoom(roomId), durationMin * 60 * 1000);
    this.rooms.set(roomId, room);
    return room;
  }

  expireRoom(roomId) {
    const room = this.getRoom(roomId);
    if (!room) return;

    this.broadcast(roomId, { 
      type: 'system', 
      text: '房间已到期，自动清理', 
      ts: Date.now() 
    });
    
    this.broadcast(roomId, { 
      type: 'room_expired', 
      ts: Date.now() 
    });

    // Close all connections
    for (const ws of room.clients) {
      try {
        ws.close(4001, 'room expired');
      } catch (e) {
        console.error('Error closing websocket:', e);
      }
    }

    // Clear timers
    if (room.timer) clearTimeout(room.timer);
    for (const timer of room.ghostCleanupTimers.values()) {
      clearTimeout(timer);
    }

    this.rooms.delete(roomId);
  }

  send(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(data));
      } catch (e) {
        console.error('Error sending message:', e);
      }
    }
  }

  broadcast(roomId, data) {
    const room = this.getRoom(roomId);
    if (!room) return;
    
    for (const ws of room.clients) {
      this.send(ws, data);
    }
  }

  broadcastMembers(roomId) {
    const room = this.getRoom(roomId);
    if (!room) return;

    const list = [];
    const activeDevices = new Set();

    // Add active clients
    for (const ws of room.clients) {
      list.push({ 
        name: ws.name, 
        color: ws.color || config.DEFAULT_COLOR 
      });
      if (ws.deviceId) activeDevices.add(ws.deviceId);
    }

    // Add ghosts (disconnected but within grace period)
    if (room.ghosts) {
      for (const [deviceId, ghost] of room.ghosts.entries()) {
        if (activeDevices.has(deviceId)) continue;
        if (this.isGhostActive(room, deviceId)) {
          list.push({ 
            name: ghost.name, 
            color: ghost.color || config.DEFAULT_COLOR 
          });
        }
      }
    }

    this.broadcast(roomId, { 
      type: 'members', 
      members: list, 
      ts: Date.now() 
    });
  }

  isGhostActive(room, deviceId) {
    if (!room.ghosts) return false;
    const ghost = room.ghosts.get(deviceId);
    if (!ghost) return false;
    
    if (Date.now() - ghost.ts > config.GRACE_PERIOD_MS) {
      room.ghosts.delete(deviceId);
      return false;
    }
    
    return true;
  }

  handleDisconnect(ws) {
    const room = this.getRoom(ws.roomId);
    if (!room) return;

    room.clients.delete(ws);

    // If device has ID, add to ghosts for grace period
    if (ws.deviceId) {
      const now = Date.now();
      room.ghosts.set(ws.deviceId, { 
        name: ws.name, 
        color: ws.color, 
        ts: now 
      });

      // Clear any existing timer for this device
      const existingTimer = room.ghostCleanupTimers.get(ws.deviceId);
      if (existingTimer) clearTimeout(existingTimer);

      // Set new cleanup timer
      const timer = setTimeout(() => {
        const ghost = room.ghosts.get(ws.deviceId);
        if (ghost && Date.now() - ghost.ts >= config.GRACE_PERIOD_MS) {
          room.ghosts.delete(ws.deviceId);
          room.ghostCleanupTimers.delete(ws.deviceId);
          this.broadcast(ws.roomId, { 
            type: 'system', 
            text: `${ws.name} 离开了房间`, 
            ts: Date.now() 
          });
          this.broadcastMembers(ws.roomId);
        }
      }, config.GRACE_PERIOD_MS + 1000);

      room.ghostCleanupTimers.set(ws.deviceId, timer);
      return;
    }

    // No device ID, announce immediately
    this.broadcast(ws.roomId, { 
      type: 'system', 
      text: `${ws.name} 离开了房间`, 
      ts: Date.now() 
    });
    this.broadcastMembers(ws.roomId);
  }

  validatePassword(room, providedPassword) {
    // If room has password, user must provide correct password
    if (room.hasPassword) {
      return providedPassword === room.password;
    }
    // No password required
    return true;
  }

  findClientByName(room, name) {
    for (const client of room.clients) {
      if (client.name === name) return client;
    }
    return null;
  }

  findClientByDevice(room, deviceId) {
    for (const client of room.clients) {
      if (client.deviceId === deviceId) return client;
    }
    return null;
  }
}

module.exports = RoomManager;
