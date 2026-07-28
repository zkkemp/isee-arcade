import 'server-only';

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export type OwnerSession = {
  user: User;
  client: SupabaseClient;
};

export async function getOwnerSession(): Promise<OwnerSession | null> {
  const client = await getSupabaseServerClient();
  if (!client) return null;

  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser();
  if (userError || !user) return null;

  const { data: isOwner, error: ownerError } = await client.rpc('is_platform_admin');
  if (ownerError || isOwner !== true) return null;

  return { user, client };
}

export function hasSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function isSimplePassword(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9]{6,64}$/.test(value);
}
