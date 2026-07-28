import { NextResponse } from 'next/server';
import { normalizeAccountUsername } from '@/lib/accountUsername';
import { getIseeDatabase } from '@/lib/supabase/database';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const supabase = await getSupabaseServerClient();
  const { data } = (await supabase?.auth.getClaims()) ?? { data: null };
  const userId = typeof data?.claims?.sub === 'string' ? data.claims.sub : null;
  const sql = getIseeDatabase();
  if (!userId || !sql) {
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

  const matches = await sql`
    select username from public.learners
      where lower(username) = lower(${username})
        and (${exclude} = '' or local_profile_id <> ${exclude})
    union all
    select username from public.parent_accounts
      where lower(username) = lower(${username})
    limit 1
  `;
  return NextResponse.json({ available: matches.length === 0 });
}
