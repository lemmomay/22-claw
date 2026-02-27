const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');
const multer = require('multer');
const fs = require('fs');
const config = require('./src/config');
const RoomManager = require('./src/RoomManager');
const CommandHandler = require('./src/CommandHandler');
const ConnectionHandler = require('./src/ConnectionHandler');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Initialize managers
const roomManager = new RoomManager();
const commandHandler = new CommandHandler(roomManager);
const connectionHandler = new ConnectionHandler(roomManager, commandHandler);

// Setup uploads directory
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

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

      const fileUrl = `/uploads/${newName}`;
      const original = req.file.originalname || 'file';
      const mime = req.file.mimetype || '';

      // Broadcast to room
      roomManager.broadcast(roomId, {
        type: 'image',
        name,
        color,
        url: fileUrl,
        original,
        mime,
        ts: Date.now()
      });

      res.json({ ok: true, url: fileUrl });
      
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

// Cleanup old uploads periodically (every hour)
setInterval(() => {
  try {
    const files = fs.readdirSync(uploadsDir);
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const file of files) {
      const filePath = path.join(uploadsDir, file);
      const stats = fs.statSync(filePath);
      
      if (now - stats.mtimeMs > maxAge) {
        fs.unlinkSync(filePath);
        console.log(`Cleaned up old file: ${file}`);
      }
    }
  } catch (e) {
    console.error('Cleanup error:', e);
  }
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

  res.json({ 
    status: 'ok', 
    rooms: roomCount, 
    clients: totalClients,
    uptime: process.uptime()
  });
});

// Start server
server.listen(config.PORT, () => {
  console.log(`✨ Chatroom v2 running on port ${config.PORT}`);
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
