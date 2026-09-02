import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  
  supabase: {
    url: process.env.SUPABASE_URL || '',
    key: process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },
  
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
  },
  
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    adminChatId: process.env.TELEGRAM_ADMIN_CHAT_ID ? parseInt(process.env.TELEGRAM_ADMIN_CHAT_ID, 10) : null,
    webAppUrl: process.env.TELEGRAM_WEBAPP_URL || '',
  },
  
  thresholds: {
    rejectSimilarity: parseFloat(process.env.MAX_DUPLICATE_SIMILARITY_THRESHOLD || '80'),
    reviewSimilarity: parseFloat(process.env.MANUAL_REVIEW_SIMILARITY_THRESHOLD || '60'),
  },
  
  isDev: (process.env.NODE_ENV || 'development') === 'development',
};

// Check critical configuration and warn on startup if missing
export function validateEnv() {
  const warnings = [];
  if (!config.supabase.url || !config.supabase.key) {
    warnings.push('⚠️  SUPABASE_URL or SUPABASE_KEY is not set. Database operations will use fallback/mock mode if Supabase is offline.');
  }
  if (!config.gemini.apiKey) {
    warnings.push('⚠️  GEMINI_API_KEY is not set. Gemini AI verification will require an API key in production.');
  }
  if (!config.telegram.botToken) {
    warnings.push('⚠️  TELEGRAM_BOT_TOKEN is not set. Telegram Bot alerts and initData HMAC validation will run in development bypass mode.');
  }
  
  if (warnings.length > 0) {
    console.log('\n--- Configuration Warnings ---');
    warnings.forEach((w) => console.warn(w));
    console.log('------------------------------\n');
  }
}
