import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { childSessionCookie, verifyChildSession } from '@/lib/childSession';
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ error: 'Sync is unavailable.' }, { status: 503 });
  }
  const cookieStore = await cookies();
  const session = await verifyChildSession(cookieStore.get(childSessionCookie.name)?.value);
  if (!session) return NextResponse.json({ error: 'Child sign-in required.' }, { status: 401 });

  let body: {
    progress?: unknown;
    playSession?: unknown;
    recentGames?: unknown;
    paintings?: unknown;
    finishedPaintings?: unknown;
    dailyUsage?: unknown;
    settings?: Record<string, string>;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid sync payload.' }, { status: 400 });
  }

  const admin = getSupabaseAdminClient()!;
  const { data: learner } = await admin
    .from('learners')
    .select('id')
    .eq('id', session.learnerId)
    .eq('household_id', session.householdId)
    .maybeSingle();
  if (!learner) return NextResponse.json({ error: 'This child account is no longer active.' }, { status: 403 });

  const { error } = await admin.from('learner_snapshots').upsert(
    {
      learner_id: session.learnerId,
      progress: body.progress ?? {},
      play_session: body.playSession ?? {},
      recent_games: Array.isArray(body.recentGames) ? body.recentGames : [],
      painting_progress: {
        pictures: body.paintings ?? {},
        finished: body.finishedPaintings ?? [],
      },
      settings: { ...(body.settings ?? {}), dailyUsage: body.dailyUsage ?? {} },
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'learner_id' },
  );
  if (error) return NextResponse.json({ error: 'Progress could not be synced.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
