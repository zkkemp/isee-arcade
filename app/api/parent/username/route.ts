import { NextResponse } from 'next/server';
import { normalizeAccountUsername } from '@/lib/accountUsername';
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const supabase = await getSupabaseServerClient();
  const { data } = (await supabase?.auth.getClaims()) ?? { data: null };
  const userId = typeof data?.claims?.sub === 'string' ? data.claims.sub : null;
  if (!userId || !isSupabaseAdminConfigured()) {
    return NextResponse.json({ error: 'Parent access required.' }, { status: 401 });
  }
  const { data: account } = (await supabase
    ?.from('parent_accounts')
    .select('status')
    .eq('user_id', userId)
    .maybeSingle()) ?? { data: null };
  if (account?.status !== 'active') {
    return NextResponse.json({ error: 'Parent access required.' }, { status: 403 });
  }

  const url = new URL(request.url);
  const username = normalizeAccountUsername(url.searchParams.get('username') ?? '');
  const exclude = url.searchParams.get('exclude') ?? '';
  if (username.length < 2) return NextResponse.json({ available: false });

  let query = getSupabaseAdminClient()!
    .from('learners')
    .select('local_profile_id')
    .ilike('username', username)
    .limit(1);
  if (exclude) query = query.neq('local_profile_id', exclude);
  const { data: learner } = await query.maybeSingle();

  const { data: parent } = await getSupabaseAdminClient()!
    .from('parent_accounts')
    .select('user_id')
    .ilike('username', username)
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ available: !learner && !parent });
}
