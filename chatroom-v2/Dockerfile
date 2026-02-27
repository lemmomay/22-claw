# Use Alpine for minimal size
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production --no-optional && \
    npm cache clean --force

# Copy application files
COPY server.js ./
COPY src/ ./src/
COPY public/ ./public/

# Create uploads directory
RUN mkdir -p public/uploads && \
    chown -R node:node /app

# Use non-root user
USER node

# Expose port
EXPOSE 28881

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:28881/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start application
CMD ["node", "server.js"]
