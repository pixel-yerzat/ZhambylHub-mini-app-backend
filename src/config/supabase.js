import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { config } from './env.js';

// Polyfill WebSocket for Node.js environments
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = WebSocket;
}

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
      realtime: {
        transport: WebSocket,
      },
    });
    return supabaseInstance;
  }

  return null;
}

export const supabase = getSupabaseClient();
