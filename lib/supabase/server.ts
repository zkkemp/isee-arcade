import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabaseConfig } from './config';

export async function getSupabaseServerClient(): Promise<SupabaseClient | null> {
  if (!isSupabaseConfigured()) return null;
  const cookieStore = await cookies();
  const { url, publishableKey } = supabaseConfig();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot always write cookies. The root proxy
          // refreshes auth cookies on navigations where writes are allowed.
        }
      },
    },
  });
}
