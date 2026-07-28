import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function DELETE(
  _request: NextRequest,
  context: RouteContext<'/api/parent/children/[localId]'>,
) {
  const supabase = await getSupabaseServerClient();
  const { data } = (await supabase?.auth.getClaims()) ?? { data: null };
  if (typeof data?.claims?.sub !== 'string') {
    return NextResponse.json({ error: 'Parent access required.' }, { status: 401 });
  }
  const { localId } = await context.params;
  const { error } = (await supabase
    ?.from('learners')
    .delete()
    .eq('local_profile_id', localId)) ?? { error: new Error('Cloud unavailable.') };
  if (error) return NextResponse.json({ error: 'The child account could not be removed.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
