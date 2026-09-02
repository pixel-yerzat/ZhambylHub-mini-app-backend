import { createClient } from '@supabase/supabase-js';
import { config } from './env.js';

let supabaseInstance = null;

export function getSupabaseClient() {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  if (config.supabase.url && config.supabase.key) {
    supabaseInstance = createClient(config.supabase.url, config.supabase.key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    return supabaseInstance;
  }

  return null;
}

export const supabase = getSupabaseClient();
