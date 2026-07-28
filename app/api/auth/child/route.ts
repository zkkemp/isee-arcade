import { NextResponse } from 'next/server';
import { createChildSession, childSessionCookie } from '@/lib/childSession';
import { passwordHash, sha256Hex } from '@/lib/passcode';
import { getIseeDatabase } from '@/lib/supabase/database';

type LearnerRow = {
  id: string;
  household_id: string;
  local_profile_id: string;
  display_name: string;
  username: string;
  grade_band: string;
  avatar_id: string;
  password_hash: string;
  password_salt: string;
  daily_limit_minutes: number;
  question_block_size: number;
  smart_practice: boolean;
};

export async function POST(request: Request) {
  const sql = getIseeDatabase();
  if (!sql) {
    return NextResponse.json({ error: 'Sign-in is not configured yet.' }, { status: 503 });
  }

  let body: { username?: unknown; password?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Enter a username and password.' }, { status: 400 });
  }

  const username =
    typeof body.username === 'string'
      ? body.username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24)
      : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (username.length < 2 || !/^[A-Za-z0-9]{6,64}$/.test(password)) {
    return NextResponse.json({ error: 'That username or password did not match.' }, { status: 401 });
  }

  const learners = await sql<LearnerRow[]>`
    select id, household_id, local_profile_id, display_name, username, grade_band, avatar_id,
      password_hash, password_salt, daily_limit_minutes, question_block_size, smart_practice
    from public.learners
    where lower(username) = lower(${username})
    limit 2
  `;
  if (learners.length !== 1) {
    return NextResponse.json({ error: 'That username or password did not match.' }, { status: 401 });
  }

  const learner = learners[0];
  const expected = learner.password_salt
    ? await passwordHash(password, learner.password_salt)
    : await sha256Hex(password);
  if (!learner.password_hash || expected !== learner.password_hash) {
    return NextResponse.json({ error: 'That username or password did not match.' }, { status: 401 });
  }

  const snapshots = await sql`
    select progress, play_session, recent_games, painting_progress, settings
    from public.learner_snapshots
    where learner_id = ${learner.id}
    limit 1
  `;
  const snapshot = snapshots[0] ?? null;

  const response = NextResponse.json({
    role: 'child',
    profile: {
      id: learner.local_profile_id,
      name: learner.display_name,
      username: learner.username,
      band: learner.grade_band,
      avatarId: learner.avatar_id,
      passcodeHash: learner.password_hash,
      passcodeSalt: learner.password_salt,
      dailyLimitMinutes: learner.daily_limit_minutes,
      questionBlockSize: learner.question_block_size,
      smartPractice: learner.smart_practice,
    },
    snapshot: snapshot ?? null,
  });
  response.cookies.set(
    childSessionCookie.name,
    await createChildSession(learner.id, learner.household_id),
    childSessionCookie.options,
  );
  return response;
}
