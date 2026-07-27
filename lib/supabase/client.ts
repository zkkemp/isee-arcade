'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabaseConfig } from './config';

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (browserClient) return browserClient;
  const { url, publishableKey } = supabaseConfig();
  browserClient = createBrowserClient(url, publishableKey);
  return browserClient;
}
