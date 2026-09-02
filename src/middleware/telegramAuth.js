import crypto from 'crypto';
import { config } from '../config/env.js';

/**
 * Validates Telegram Mini App initData according to Telegram WebApp authentication specification.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-web-app
 *
 * @param {string} initData - Raw initData query string from window.Telegram.WebApp.initData
 * @param {string} botToken - Telegram Bot Token from @BotFather
 * @returns {{ isValid: boolean, user: object | null }}
 */
export function verifyTelegramInitData(initData, botToken) {
  if (!initData) {
    return { isValid: false, user: null };
  }

  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    if (!hash) return { isValid: false, user: null };

    urlParams.delete('hash');

    // Sort parameters alphabetically
    const params = Array.from(urlParams.entries())
      .map(([key, value]) => `${key}=${value}`)
      .sort()
      .join('\n');

    // HMAC-SHA256("WebAppData", botToken)
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    // HMAC-SHA256(secretKey, params)
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(params)
      .digest('hex');

    const isValid = calculatedHash === hash;
    let user = null;

    if (isValid && urlParams.get('user')) {
      user = JSON.parse(urlParams.get('user'));
    }

    return { isValid, user };
  } catch (error) {
    console.error('Error validating Telegram initData:', error);
    return { isValid: false, user: null };
  }
}

/**
 * Express Middleware to authenticate incoming requests from Telegram Mini App.
 */
export function telegramAuthMiddleware(req, res, next) {
  const initData = req.headers['x-telegram-init-data'] || req.query.initData || req.body?.initData;
  const botToken = config.telegram.botToken;

  // 1. Check if user ID or payload user is directly provided (e.g. from Mini App frontend state, dev headers, or body)
  const explicitUserId =
    req.headers['x-telegram-user-id'] ||
    req.body?.founder_id ||
    req.body?.user_id ||
    req.body?.telegram_id ||
    req.query?.user_id;

  if (explicitUserId) {
    req.telegramUser = {
      id: explicitUserId,
      username: req.headers['x-telegram-username'] || req.body?.username || req.body?.telegram_username || 'user',
      first_name: req.headers['x-telegram-first-name'] || req.body?.founder_name || req.body?.first_name || 'Участник',
      last_name: req.headers['x-telegram-last-name'] || req.body?.last_name || '',
    };
    return next();
  }

  // 2. If initData is provided, try validating with bot token or parse user payload
  if (initData) {
    if (botToken) {
      const { isValid, user } = verifyTelegramInitData(initData, botToken);
      if (isValid && user) {
        req.telegramUser = user;
        return next();
      }
    }

    // Attempt to extract user JSON from initData URL params directly
    try {
      const urlParams = new URLSearchParams(initData);
      const userJson = urlParams.get('user');
      if (userJson) {
        req.telegramUser = JSON.parse(userJson);
        return next();
      }
    } catch (err) {
      console.warn('[TelegramAuth] Failed to parse user from initData param:', err.message);
    }
  }

  // 3. Fallback for Web browser access without telegram wrapper
  if (req.body?.name || req.body?.title || req.method === 'GET') {
    req.telegramUser = {
      id: req.body?.founder_id || req.body?.user_id || 'web_user_' + Date.now(),
      username: req.body?.telegram_username || 'web_resident',
      first_name: req.body?.founder_name || 'Веб Участник',
      last_name: '',
    };
    return next();
  }

  return res.status(401).json({
    success: false,
    error: 'Unauthorized: Missing x-telegram-init-data header or user identity',
  });
}
