import { config } from '../config/env.js';
import { getSupabaseClient } from '../config/supabase.js';

/**
 * Server-side Admin Authorization Middleware.
 * 
 * Verifies admin privileges using one of:
 * 1. Admin Secret Key header ('x-admin-secret-key') matching server configuration.
 * 2. Authenticated Telegram User whose ID matches TELEGRAM_ADMIN_CHAT_ID.
 * 3. Authenticated Telegram User whose role in public.profiles is 'admin' or 'moderator'.
 */
export async function requireAdmin(req, res, next) {
  // 1. Check Admin Secret Key (for server-to-server or secure web admin panel calls)
  const clientAdminKey = req.headers['x-admin-secret-key'];
  if (config.adminSecretKey && clientAdminKey && clientAdminKey === config.adminSecretKey) {
    req.isAdmin = true;
    req.adminIdentity = { type: 'secret_key' };
    return next();
  }

  // 2. Check authenticated Telegram User
  const telegramUser = req.telegramUser;
  if (!telegramUser || !telegramUser.id) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Authentication required to access administrative endpoints.',
    });
  }

  const userIdStr = String(telegramUser.id);
  const adminChatIdStr = config.telegram.adminChatId ? String(config.telegram.adminChatId) : null;

  // Check against configured TELEGRAM_ADMIN_CHAT_ID
  if (adminChatIdStr && userIdStr === adminChatIdStr) {
    req.isAdmin = true;
    req.adminIdentity = { type: 'telegram_admin', id: userIdStr };
    return next();
  }

  // Check role in Supabase profiles
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userIdStr)
        .single();

      if (profile && (profile.role === 'admin' || profile.role === 'moderator')) {
        req.isAdmin = true;
        req.adminIdentity = { type: 'profile_role', id: userIdStr, role: profile.role };
        return next();
      }
    } catch (err) {
      console.warn('[requireAdmin] Error checking profile role:', err.message);
    }
  }

  return res.status(403).json({
    success: false,
    error: 'Forbidden: You do not have administrator permissions.',
  });
}
