import { NextResponse } from 'next/server';
import { hasSameOrigin } from '@/lib/ownerAccess';
import { getIseeDatabase } from '@/lib/supabase/database';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/** Records a real parent visit without changing any family settings. */
export async function POST(request: Request) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json(
      { error: 'This request did not come from ISEE Arcade.' },
      { status: 403 },
    );
  }
  const supabase = await getSupabaseServerClient();
  const { data } = (await supabase?.auth.getClaims()) ?? { data: null };
  const userId = typeof data?.claims?.sub === 'string' ? data.claims.sub : null;
  const sql = getIseeDatabase();
  if (!userId || !sql) {
    return NextResponse.json({ error: 'Active parent access required.' }, { status: 401 });
  }

  const rows = await sql`
    select member.household_id
    from public.household_members as member
    join public.parent_accounts as account on account.user_id = member.user_id
    where member.user_id = ${userId}::uuid
      and account.status = 'active'
    order by member.joined_at
    limit 1
  `;
  const householdId = rows[0]?.household_id;
  if (!householdId) {
    return NextResponse.json({ error: 'Active parent access required.' }, { status: 403 });
  }

  await sql`
    insert into public.parent_preferences (household_id, updated_at)
    values (${String(householdId)}::uuid, now())
    on conflict (household_id) do update
    set updated_at = excluded.updated_at
  `;
  return NextResponse.json({ ok: true });
}

