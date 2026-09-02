# Production Dockerfile for Railway / Container Environments
FROM node:20-alpine AS base

WORKDIR /app

# Install dependencies only when package.json changes
COPY package*.json ./
RUN npm ci --only=production

# Copy application source code
COPY . .

# Environment Defaults
ENV NODE_ENV=production
ENV PORT=4000

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-4000}/health || exit 1

# Start command
CMD ["npm", "start"]
