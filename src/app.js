import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { config, validateEnv } from './config/env.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import applicationRoutes from './routes/applicationRoutes.js';
import winnerRoutes from './routes/winnerRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import { setupTelegramBot } from './bot/bot.js';

// 1. Validate environment
validateEnv();

// 2. Initialize Express
const app = express();

// Enable trust proxy for Railway / Cloudflare / reverse proxy environments
app.set('trust proxy', 1);

// 3. Security and Utility Middlewares
app.use(helmet());
app.use(
  cors({
    origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(','),
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(config.isDev ? 'dev' : 'combined'));

// 4. Rate Limiting on /api routes
app.use('/api', apiLimiter);

// 5. Health Check & Root Info
app.get('/', (req, res) => {
  res.json({
    service: 'Endpoint Hub Telegram Mini App Verification Service',
    status: 'online',
    version: '1.0.0',
    documentation: {
      submit_application: 'POST /api/applications/submit',
      my_applications: 'GET /api/applications/my',
      past_winners: 'GET /api/winners',
      admin_applications: 'GET /api/admin/applications',
    },
    features: [
      'Gemini AI Semantic Verification',
      'Supabase Database Integration',
      'Multi-Project Support per Participant',
      'Duplicate Prevention & Past Winners Shield',
      'Telegram Bot & Mini App Sync',
    ],
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// 6. Mount API Routes
app.use('/api/applications', applicationRoutes);
app.use('/api/winners', winnerRoutes);
app.use('/api/admin', adminRoutes);

// 7. Error Handling Middlewares
app.use(notFoundHandler);
app.use(errorHandler);

// 8. Start Telegram Bot
setupTelegramBot();

// 9. Start HTTP Server
const server = app.listen(config.port, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Hub Backend Service running on port ${config.port}`);
  console.log(`🌐 URL: http://localhost:${config.port}`);
  console.log(`⚡ Environment: ${config.nodeEnv}`);
  console.log(`======================================================\n`);
});

// Graceful Shutdown
function gracefulShutdown(signal) {
  console.log(`Received ${signal}. Gracefully shutting down HTTP server...`);
  server.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

export default app;
