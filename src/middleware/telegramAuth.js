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
  if (!initData || !botToken) {
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
 * Strictly verifies cryptographic HMAC signature using TELEGRAM_BOT_TOKEN.
 * Does NOT generate fake/mock users or permit unauthenticated bypasses.
 */
export function telegramAuthMiddleware(req, res, next) {
  const botToken = config.telegram.botToken;
  if (!botToken) {
    return res.status(503).json({
      success: false,
      error: 'Telegram authentication service is unavailable: TELEGRAM_BOT_TOKEN is not configured.',
    });
  }

  const initData = req.headers['x-telegram-init-data'] || req.query?.initData || req.body?.initData;
  if (!initData) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Missing x-telegram-init-data header.',
    });
  }

  const { isValid, user } = verifyTelegramInitData(initData, botToken);
  if (!isValid || !user || !user.id) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid Telegram initData signature or missing user identity.',
    });
  }

  req.telegramUser = user;
  return next();
}
