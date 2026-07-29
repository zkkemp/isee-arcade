import { NextResponse } from 'next/server';
import { normalizeAccountUsername, usernameAuthEmail } from '@/lib/accountUsername';
import { getOwnerSession, hasSameOrigin, isSimplePassword } from '@/lib/ownerAccess';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getIseeDatabase } from '@/lib/supabase/database';

export const runtime = 'nodejs';

const ACCOUNT_FIELDS =
  'user_id, username, account_role, status, created_at, updated_at';

export async function GET() {
  const owner = await getOwnerSession();
  if (!owner) {
    return NextResponse.json({ error: 'Owner access required.' }, { status: 403 });
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: 'The server-only ISEE Arcade admin key is not configured yet.' },
      { status: 503 },
    );
  }

  const { data, error } = await admin
    .from('parent_accounts')
    .select(ACCOUNT_FIELDS)
    .eq('account_role', 'parent')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'Parent accounts could not be loaded.' }, { status: 500 });
  }

  return NextResponse.json({ parents: data ?? [] });
}

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: 'This request did not come from ISEE Arcade.' }, { status: 403 });
  }

  const owner = await getOwnerSession();
  if (!owner) {
    return NextResponse.json({ error: 'Owner access required.' }, { status: 403 });
  }

  const admin = getSupabaseAdminClient();
  const sql = getIseeDatabase();
  if (!admin || !sql) {
    return NextResponse.json(
      { error: 'Secure parent-account creation is not configured yet.' },
      { status: 503 },
    );
  }

  let body: { username?: unknown; password?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const username =
    typeof body.username === 'string' ? normalizeAccountUsername(body.username) : '';
  if (username.length < 3) {
    return NextResponse.json(
      { error: 'Use a username with at least 3 letters or numbers.' },
      { status: 400 },
    );
  }
  if (!isSimplePassword(body.password)) {
    return NextResponse.json(
      { error: 'Use 6–64 characters containing only letters or numbers.' },
      { status: 400 },
    );
  }

  const { data: existing } = await admin
    .from('parent_accounts')
    .select('user_id')
    .eq('username', username)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: 'That username is already in use.' }, { status: 409 });
  }

  const authEmail = usernameAuthEmail(username);
  let inviteId: string;
  try {
    // This row is an internal, short-lived authorization token for the database
    // trigger. It is not an emailed invitation and the parent never sees it.
    // Using the pinned ISEE database connection avoids PostgREST/RLS ambiguity
    // while preserving the database boundary against public account creation.
    await sql`
      delete from public.parent_account_invites
      where lower(auth_email) = lower(${authEmail})
        and consumed_at is null
    `;
    const rows = await sql`
      insert into public.parent_account_invites (
        username, auth_email, account_role, created_by
      ) values (
        ${username}, ${authEmail}, 'parent', ${owner.user.id}::uuid
      )
      returning id
    `;
    inviteId = String(rows[0]?.id ?? '');
  } catch (error) {
    const duplicate =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === '23505';
    return NextResponse.json(
      {
        error: duplicate
          ? 'That username is already in use.'
          : 'The parent sign-in could not be prepared. Please try again.',
      },
      { status: duplicate ? 409 : 500 },
    );
  }
  if (!inviteId) {
    return NextResponse.json(
      { error: 'The parent sign-in could not be prepared. Please try again.' },
      { status: 500 },
    );
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: authEmail,
    password: body.password,
    email_confirm: true,
    user_metadata: { username, account_type: 'parent' },
  });

  if (createError || !created.user) {
    await sql`
      delete from public.parent_account_invites
      where id = ${inviteId}::uuid and consumed_at is null
    `;
    const duplicate = createError?.message.toLowerCase().includes('already');
    return NextResponse.json(
      { error: duplicate ? 'That username is already in use.' : 'The parent account could not be created.' },
      { status: duplicate ? 409 : 500 },
    );
  }

  await admin.from('owner_account_audit').insert({
    actor_user_id: owner.user.id,
    target_user_id: created.user.id,
    action: 'create',
    target_username: username,
  });

  const { data: loadedParent } = await admin
    .from('parent_accounts')
    .select(ACCOUNT_FIELDS)
    .eq('user_id', created.user.id)
    .single();

  const now = new Date().toISOString();
  const parent =
    loadedParent ??
    {
      user_id: created.user.id,
      username,
      account_role: 'parent',
      status: 'active',
      created_at: created.user.created_at ?? now,
      updated_at: now,
    };

  return NextResponse.json({ parent }, { status: 201 });
}
