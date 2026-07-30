import { NextResponse } from 'next/server';
import { createChildSession, childSessionCookie } from '@/lib/childSession';
import { constantTimeEqual, passwordHash, sha256Hex } from '@/lib/passcode';
import { getIseeDatabase } from '@/lib/supabase/database';

const attempts = new Map<string, { count: number; resetsAt: number }>();
const ATTEMPT_WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const DUMMY_SALT = 'isee-arcade-invalid-user-timing-salt';

function attemptKey(request: Request, username: string): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return `${forwarded || 'unknown'}:${username}`;
}

function recordAttempt(key: string): boolean {
  const now = Date.now();
  if (attempts.size > 5_000) {
    for (const [candidate, entry] of attempts) {
      if (entry.resetsAt <= now) attempts.delete(candidate);
    }
    if (attempts.size > 5_000) attempts.clear();
  }
  const current = attempts.get(key);
  if (!current || current.resetsAt <= now) {
    attempts.set(key, { count: 1, resetsAt: now + ATTEMPT_WINDOW_MS });
    return true;
  }
  if (current.count >= MAX_ATTEMPTS) return false;
  current.count += 1;
  return true;
}

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

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 4096) {
    return NextResponse.json({ error: 'Sign-in request is too large.' }, { status: 413 });
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
  if (username.length < 2 || password.length < 6 || password.length > 64) {
    return NextResponse.json({ error: 'That username or password did not match.' }, { status: 401 });
  }
  const key = attemptKey(request, username);
  if (!recordAttempt(key)) {
    return NextResponse.json(
      { error: 'Too many sign-in attempts. Wait five minutes and try again.' },
      { status: 429, headers: { 'Retry-After': '300' } },
    );
  }

  const learners = await sql<LearnerRow[]>`
    select id, household_id, local_profile_id, display_name, username, grade_band, avatar_id,
      password_hash, password_salt, daily_limit_minutes, question_block_size, smart_practice
    from public.learners
    where lower(username) = lower(${username})
    limit 2
  `;
  if (learners.length !== 1) {
    await passwordHash(password, DUMMY_SALT);
    return NextResponse.json({ error: 'That username or password did not match.' }, { status: 401 });
  }

  const learner = learners[0];
  const expected = learner.password_salt
    ? await passwordHash(password, learner.password_salt)
    : await sha256Hex(password);
  if (!learner.password_hash || !constantTimeEqual(expected, learner.password_hash)) {
    return NextResponse.json({ error: 'That username or password did not match.' }, { status: 401 });
  }
  attempts.delete(key);

  const snapshots = await sql`
    select progress, play_session, recent_games, painting_progress, settings
    from public.learner_snapshots
    where learner_id = ${learner.id}
    limit 1
  `;
  const snapshot = snapshots[0] ?? null;

  let sessionToken: string;
  try {
    sessionToken = await createChildSession(learner.id, learner.household_id);
  } catch {
    return NextResponse.json(
      { error: 'Child sign-in is temporarily unavailable. Please try again shortly.' },
      { status: 503 },
    );
  }

  // A successful child sign-in counts as household use even before the first
  // answer or game event has had a chance to sync a snapshot.
  try {
    await sql`
      update public.learners
      set updated_at = now()
      where id = ${learner.id}
    `;
  } catch {
    // Activity is informational and must never block a successful child login.
  }

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
    sessionToken,
    childSessionCookie.options,
  );
  return response;
}
