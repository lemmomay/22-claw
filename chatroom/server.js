const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');
const multer = require('multer');
const fs = require('fs');
const config = require('./src/config');
const StorageManager = require('./src/StorageManager');
const RoomManager = require('./src/RoomManager');
const CommandHandler = require('./src/CommandHandler');
const ConnectionHandler = require('./src/ConnectionHandler');

const app = express();
const server = http.createServer(app);

// 增加并发连接数限制
server.maxConnections = 0; // 0 表示无限制
server.timeout = 120000; // 2分钟超时（上传大文件需要）

const wss = new WebSocket.Server({ 
  server,
  // WebSocket 配置
  perMessageDeflate: false, // 禁用压缩以减少 CPU 占用
  maxPayload: 100 * 1024 * 1024 // 100MB WebSocket 消息限制
});

// Setup uploads directory
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Initialize managers
const storageManager = new StorageManager(uploadsDir);
const roomManager = new RoomManager(storageManager);
const commandHandler = new CommandHandler(roomManager);
const connectionHandler = new ConnectionHandler(roomManager, commandHandler);

// Configure multer for file uploads
const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: config.MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!config.ALLOWED_FILE_TYPES.test(ext)) {
      return cb(new Error('不支持的文件类型'));
    }
    cb(null, true);
  }
});

// File upload endpoint
app.post('/upload', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: '文件太大，最大 30MB' });
      }
      return res.status(400).json({ error: err.message });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: '没有文件' });
    }

        try {
      const roomId = (req.query.room || '').toString();
      const name = (req.query.name || '').toString();
      const color = (req.query.color || config.DEFAULT_COLOR).toString();

      // 检查存储限制
      const canUpload = storageManager.canUpload(roomId, req.file.size);
      if (!canUpload.ok) {
        try { fs.unlinkSync(req.file.path); } catch (e) {}
        return res.status(400).json({ error: canUpload.reason });
      }

      // Sanitize room ID
      const safeRoom = roomId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'room';
      
      // Generate safe filename
      const ext = path.extname(req.file.originalname || '') || '.jpg';
      const timestamp = Date.now();
      const random = Math.random().toString(36).slice(2, 8);
      const newName = `${safeRoom}_${timestamp}_${random}${ext}`;
      const newPath = path.join(uploadsDir, newName);

      // Rename uploaded file
      fs.renameSync(req.file.path, newPath);

      // Record upload
      storageManager.recordUpload(roomId, req.file.size);

      const fileUrl = `/uploads/${newName}`;
      const original = req.file.originalname || 'file';
      const mime = req.file.mimetype || '';

      // Broadcast to room
      let msgType = 'file';
      if (/^image\//i.test(mime)) {
        msgType = 'image';
      } else if (/^video\//i.test(mime)) {
        msgType = 'video';
      } else if (/^audio\//i.test(mime)) {
        msgType = 'audio';
      }
      
      roomManager.broadcast(roomId, {
        type: msgType,
        name,
        color,
        url: fileUrl,
        original,
        mime,
        size: req.file.size,
        sizeFormatted: storageManager.formatSize(req.file.size),
        ts: Date.now()
      });

      res.json({ 
        ok: true, 
        url: fileUrl, 
        size: req.file.size,
        sizeFormatted: storageManager.formatSize(req.file.size)
      });
      
    } catch (e) {
      console.error('Upload error:', e);
      
      // Clean up file on error
      if (req.file && req.file.path && fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (cleanupErr) {
          console.error('Cleanup error:', cleanupErr);
        }
      }
      
      res.status(500).json({ error: '上传失败' });
    }
  });
});

// Cleanup orphan files periodically (every hour)
setInterval(() => {
  const activeRoomIds = new Set(roomManager.rooms.keys());
  storageManager.cleanupOrphanFiles(activeRoomIds);
}, 60 * 60 * 1000);

// WebSocket connection handler
wss.on('connection', (ws, req) => {
  connectionHandler.handleConnection(ws, req);
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/health', (req, res) => {
  const roomCount = roomManager.rooms.size;
  let totalClients = 0;
  
  for (const room of roomManager.rooms.values()) {
    totalClients += room.clients.size;
  }

  const storageStats = storageManager.getStats();

  res.json({ 
    status: 'ok', 
    rooms: roomCount, 
    clients: totalClients,
    uptime: process.uptime(),
    storage: {
      used: storageStats.totalFormatted,
      max: storageStats.maxTotalFormatted
    }
  });
});

// Configure HTTP Keep-Alive for better connection reuse
server.keepAliveTimeout = 65000; // 65 seconds
server.headersTimeout = 66000; // Slightly more than keepAliveTimeout

// Start server
server.listen(config.PORT, () => {
  console.log(`✨ Chatroom running on port ${config.PORT}`);
  console.log(`📊 Health check: http://localhost:${config.PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
