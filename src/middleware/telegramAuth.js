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

  // Development bypass helper (for local testing, unit tests, Postman)
  if (config.isDev) {
    const devTelegramId = req.headers['x-telegram-user-id'] || req.body?.telegram_id;
    if (devTelegramId) {
      req.telegramUser = {
        id: parseInt(devTelegramId, 10),
        username: req.headers['x-telegram-username'] || req.body?.username || 'dev_user',
        first_name: req.headers['x-telegram-first-name'] || req.body?.first_name || 'Dev',
        last_name: req.headers['x-telegram-last-name'] || req.body?.last_name || 'User',
      };
      return next();
    }
  }

  if (!initData) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Missing x-telegram-init-data header or initData in request',
    });
  }

  if (!botToken) {
    // If bot token is not configured in dev, parse user JSON from initData if present
    try {
      const urlParams = new URLSearchParams(initData);
      const userJson = urlParams.get('user');
      if (userJson) {
        req.telegramUser = JSON.parse(userJson);
        return next();
      }
    } catch {
      // Fallback
    }

    if (config.isDev) {
      console.warn('[TelegramAuth] TELEGRAM_BOT_TOKEN not configured. Allowing in DEV mode.');
      req.telegramUser = { id: 999999999, username: 'anonymous_dev', first_name: 'Dev', last_name: 'Tester' };
      return next();
    }

    return res.status(500).json({
      success: false,
      error: 'Server misconfiguration: TELEGRAM_BOT_TOKEN is missing',
    });
  }

  const { isValid, user } = verifyTelegramInitData(initData, botToken);

  if (!isValid || !user) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid Telegram Mini App signature',
    });
  }

  req.telegramUser = user;
  next();
}
