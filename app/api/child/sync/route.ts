import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { childSessionCookie, verifyChildSession } from '@/lib/childSession';
import { getIseeDatabase } from '@/lib/supabase/database';

export async function POST(request: Request) {
  const sql = getIseeDatabase();
  if (!sql) {
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

  const learners = await sql`
    select id from public.learners
    where id = ${session.learnerId} and household_id = ${session.householdId}
    limit 1
  `;
  if (!learners[0]) return NextResponse.json({ error: 'This child account is no longer active.' }, { status: 403 });

  const progress = JSON.stringify(body.progress ?? {});
  const playSession = JSON.stringify(body.playSession ?? {});
  const recentGames = JSON.stringify(Array.isArray(body.recentGames) ? body.recentGames : []);
  const paintingProgress = JSON.stringify({
    pictures: body.paintings ?? {},
    finished: body.finishedPaintings ?? [],
  });
  const settings = JSON.stringify({ ...(body.settings ?? {}), dailyUsage: body.dailyUsage ?? {} });
  await sql`
    insert into public.learner_snapshots (
      learner_id, progress, play_session, recent_games, painting_progress, settings, updated_at
    ) values (
      ${session.learnerId}, ${progress}::jsonb, ${playSession}::jsonb, ${recentGames}::jsonb,
      ${paintingProgress}::jsonb, ${settings}::jsonb, now()
    )
    on conflict (learner_id) do update set
      progress = excluded.progress,
      play_session = excluded.play_session,
      recent_games = excluded.recent_games,
      painting_progress = excluded.painting_progress,
      settings = excluded.settings,
      updated_at = now()
  `;
  return NextResponse.json({ ok: true });
}
