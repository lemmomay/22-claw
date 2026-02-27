module.exports = {
  PORT: process.env.PORT || 28881,
  GRACE_PERIOD_MS: 30 * 60 * 1000, // 30 minutes
  
  // 文件上传限制
  MAX_FILE_SIZE: 200 * 1024 * 1024, // 200MB 单文件最大
  MAX_ROOM_STORAGE: 500 * 1024 * 1024, // 500MB 每个房间总存储
  MAX_TOTAL_STORAGE: 2 * 1024 * 1024 * 1024, // 2GB 全局总存储（留点余量）
  
  // 允许的文件类型（图片 + 常见文件）
  ALLOWED_FILE_TYPES: /\.(jpg|jpeg|png|gif|webp|bmp|svg|mp4|mov|avi|mkv|pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|7z|tar|gz|txt|md|json|xml|csv|log)$/i,
  
  // 房间设置
  MIN_DURATION_HOURS: 1,
  MAX_DURATION_HOURS: 72,
  MIN_DURATION_MINUTES: 5,
  MAX_DURATION_MINUTES: 1440,
  DEFAULT_COLOR: '#2f80ed',
};
