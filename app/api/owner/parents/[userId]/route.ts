import { NextResponse } from 'next/server';
import { normalizeAccountUsername } from '@/lib/accountUsername';
import { getOwnerSession, hasSameOrigin, isSimplePassword } from '@/lib/ownerAccess';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getIseeDatabase } from '@/lib/supabase/database';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ userId: string }>;
};

async function getTarget(
  admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  userId: string,
) {
  return admin
    .from('parent_accounts')
    .select('user_id, username, account_role, status, created_at, updated_at')
    .eq('user_id', userId)
    .eq('account_role', 'parent')
    .maybeSingle();
}

export async function PATCH(request: Request, context: RouteContext) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: 'This request did not come from ISEE Arcade.' }, { status: 403 });
  }

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

  const { userId } = await context.params;
  const { data: target, error: targetError } = await getTarget(admin, userId);
  if (targetError || !target) {
    return NextResponse.json({ error: 'Parent account not found.' }, { status: 404 });
  }

  let body: { action?: unknown; password?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  if (body.action === 'reset_password') {
    if (!isSimplePassword(body.password)) {
      return NextResponse.json(
        { error: 'Use 6–64 characters containing only letters or numbers.' },
        { status: 400 },
      );
    }
    const { error } = await admin.auth.admin.updateUserById(userId, {
      password: body.password,
    });
    if (error) {
      return NextResponse.json({ error: 'The password could not be reset.' }, { status: 500 });
    }
    await admin.from('owner_account_audit').insert({
      actor_user_id: owner.user.id,
      target_user_id: userId,
      action: 'reset_password',
      target_username: target.username,
    });
    return NextResponse.json({ parent: target, message: 'Temporary password saved.' });
  }

  if (body.action !== 'suspend' && body.action !== 'activate') {
    return NextResponse.json({ error: 'Unknown account action.' }, { status: 400 });
  }

  const activating = body.action === 'activate';
  if (target.status === 'removed' && activating) {
    return NextResponse.json(
      { error: 'Removed access cannot be reactivated. Create a new parent account instead.' },
      { status: 409 },
    );
  }

  if (activating) {
    const { error: authError } = await admin.auth.admin.updateUserById(userId, {
      ban_duration: 'none',
    });
    if (authError) {
      return NextResponse.json({ error: 'The parent could not be reactivated.' }, { status: 500 });
    }
  }

  const nextStatus = activating ? 'active' : 'suspended';
  const { data: parent, error: statusError } = await admin
    .from('parent_accounts')
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .select('user_id, username, account_role, status, created_at, updated_at')
    .single();
  if (statusError) {
    return NextResponse.json({ error: 'The account status could not be changed.' }, { status: 500 });
  }

  if (!activating) {
    const { error: authError } = await admin.auth.admin.updateUserById(userId, {
      ban_duration: '876000h',
    });
    if (authError) {
      return NextResponse.json(
        {
          error:
            'Data access was suspended, but the sign-in ban needs attention. The parent still cannot read family data.',
          parent,
        },
        { status: 500 },
      );
    }
  }

  await admin.from('owner_account_audit').insert({
    actor_user_id: owner.user.id,
    target_user_id: userId,
    action: body.action,
    target_username: target.username,
  });

  return NextResponse.json({
    parent,
    message: activating ? 'Parent access restored.' : 'Parent access suspended.',
  });
}

export async function DELETE(request: Request, context: RouteContext) {
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
      { error: 'Secure parent-account deletion is not configured yet.' },
      { status: 503 },
    );
  }

  const { userId } = await context.params;
  const { data: target, error: targetError } = await getTarget(admin, userId);
  if (targetError || !target) {
    return NextResponse.json({ error: 'Parent account not found.' }, { status: 404 });
  }

  let body: { username?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Type the parent username to confirm deletion.' }, { status: 400 });
  }
  const confirmedUsername =
    typeof body.username === 'string' ? normalizeAccountUsername(body.username) : '';
  if (confirmedUsername !== target.username) {
    return NextResponse.json(
      { error: `Type ${target.username} exactly to confirm deletion.` },
      { status: 400 },
    );
  }

  await admin.from('owner_account_audit').insert({
    actor_user_id: owner.user.id,
    target_user_id: userId,
    action: 'remove',
    target_username: target.username,
  });

  const householdRows = await sql`
    select household_id
    from public.household_members
    where user_id = ${userId}::uuid
  `;
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    return NextResponse.json(
      { error: 'The parent account could not be deleted. Nothing else was removed.' },
      { status: 500 },
    );
  }

  const householdIds = householdRows.map((row) => String(row.household_id));
  if (householdIds.length > 0) {
    await sql`
      delete from public.households as household
      where household.id = any(${householdIds}::uuid[])
        and not exists (
          select 1
          from public.household_members as member
          where member.household_id = household.id
        )
    `;
  }

  return NextResponse.json({
    deletedUserId: userId,
    message: `@${target.username} and their family data were permanently deleted.`,
  });
}
