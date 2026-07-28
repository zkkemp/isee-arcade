import 'server-only';

import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function requireActiveParent(): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const { data } = (await supabase?.auth.getClaims()) ?? { data: null };
  const userId = typeof data?.claims?.sub === 'string' ? data.claims.sub : null;
  if (!userId) redirect('/');
  const { data: account } = (await supabase
    ?.from('parent_accounts')
    .select('status')
    .eq('user_id', userId)
    .maybeSingle()) ?? { data: null };
  if (account?.status !== 'active') redirect('/');
}
