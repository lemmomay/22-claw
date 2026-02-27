const fs = require('fs');
const path = require('path');
const config = require('./config');

class StorageManager {
  constructor(uploadsDir) {
    this.uploadsDir = uploadsDir;
    this.roomStorage = new Map(); // roomId -> total bytes
  }

  // 获取房间已用存储
  getRoomStorage(roomId) {
    return this.roomStorage.get(roomId) || 0;
  }

  // 获取全局已用存储
  getTotalStorage() {
    let total = 0;
    for (const size of this.roomStorage.values()) {
      total += size;
    }
    return total;
  }

  // 检查是否可以上传
  canUpload(roomId, fileSize) {
    // 检查单文件大小
    if (fileSize > config.MAX_FILE_SIZE) {
      return { 
        ok: false, 
        reason: `文件太大，最大 ${this.formatSize(config.MAX_FILE_SIZE)}` 
      };
    }

    // 检查房间存储
    const roomUsed = this.getRoomStorage(roomId);
    if (roomUsed + fileSize > config.MAX_ROOM_STORAGE) {
      return { 
        ok: false, 
        reason: `房间存储已满（${this.formatSize(roomUsed)}/${this.formatSize(config.MAX_ROOM_STORAGE)}）` 
      };
    }

    // 检查全局存储
    const totalUsed = this.getTotalStorage();
    if (totalUsed + fileSize > config.MAX_TOTAL_STORAGE) {
      return { 
        ok: false, 
        reason: '服务器存储空间不足' 
      };
    }

    return { ok: true };
  }

  // 记录文件上传
  recordUpload(roomId, fileSize) {
    const current = this.getRoomStorage(roomId);
    this.roomStorage.set(roomId, current + fileSize);
  }

  // 清理房间文件
  cleanupRoom(roomId) {
    try {
      const files = fs.readdirSync(this.uploadsDir);
      let cleaned = 0;
      
      for (const file of files) {
        if (file.startsWith(`${roomId}_`)) {
          const filePath = path.join(this.uploadsDir, file);
          try {
            fs.unlinkSync(filePath);
            cleaned++;
          } catch (e) {
            console.error(`Failed to delete ${file}:`, e);
          }
        }
      }
      
      // 清除存储记录
      this.roomStorage.delete(roomId);
      
      return cleaned;
    } catch (e) {
      console.error('Cleanup error:', e);
      return 0;
    }
  }

  // 获取房间文件列表
  getRoomFiles(roomId) {
    try {
      const files = fs.readdirSync(this.uploadsDir);
      const roomFiles = [];
      
      for (const file of files) {
        if (file.startsWith(`${roomId}_`)) {
          const filePath = path.join(this.uploadsDir, file);
          const stats = fs.statSync(filePath);
          roomFiles.push({
            name: file,
            size: stats.size,
            created: stats.mtimeMs
          });
        }
      }
      
      return roomFiles;
    } catch (e) {
      console.error('Get files error:', e);
      return [];
    }
  }

  // 格式化文件大小
  formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  // 获取存储统计
  getStats() {
    const roomStats = [];
    for (const [roomId, size] of this.roomStorage.entries()) {
      roomStats.push({
        roomId,
        size,
        formatted: this.formatSize(size)
      });
    }

    return {
      total: this.getTotalStorage(),
      totalFormatted: this.formatSize(this.getTotalStorage()),
      maxTotal: config.MAX_TOTAL_STORAGE,
      maxTotalFormatted: this.formatSize(config.MAX_TOTAL_STORAGE),
      rooms: roomStats
    };
  }

  // 定期清理过期文件（24小时前的孤儿文件）
  cleanupOrphanFiles(activeRoomIds) {
    try {
      const files = fs.readdirSync(this.uploadsDir);
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      let cleaned = 0;

      for (const file of files) {
        // 跳过 .gitkeep
        if (file === '.gitkeep') continue;

        const filePath = path.join(this.uploadsDir, file);
        const stats = fs.statSync(filePath);
        
        // 提取房间 ID
        const roomId = file.split('_')[0];
        
        // 如果房间不存在且文件超过 24 小时，删除
        if (!activeRoomIds.has(roomId) && now - stats.mtimeMs > maxAge) {
          try {
            fs.unlinkSync(filePath);
            cleaned++;
          } catch (e) {
            console.error(`Failed to delete orphan ${file}:`, e);
          }
        }
      }

      if (cleaned > 0) {
        console.log(`Cleaned up ${cleaned} orphan files`);
      }

      return cleaned;
    } catch (e) {
      console.error('Orphan cleanup error:', e);
      return 0;
    }
  }
}

module.exports = StorageManager;
