module.exports = {
  PORT: process.env.PORT || 28881,
  GRACE_PERIOD_MS: 30 * 60 * 1000, // 30 minutes
  MAX_FILE_SIZE: 30 * 1024 * 1024, // 30MB
  ALLOWED_FILE_TYPES: /\.(jpg|jpeg|png|gif|webp|mp4|mov|pdf|zip|txt|md)$/i,
  MIN_DURATION_HOURS: 1,
  MAX_DURATION_HOURS: 72,
  MIN_DURATION_MINUTES: 5,
  MAX_DURATION_MINUTES: 1440,
  DEFAULT_COLOR: '#2f80ed',
};
