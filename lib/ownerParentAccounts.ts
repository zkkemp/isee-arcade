import 'server-only';

import {
  latestActivityDate,
  type OwnerChildSummary,
  type OwnerParentAccount,
} from './ownerParentTypes';
import { getIseeDatabase } from './supabase/database';

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function isoOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : iso(value);
}

export async function listOwnerParentAccounts(): Promise<OwnerParentAccount[]> {
  const sql = getIseeDatabase();
  if (!sql) throw new Error('The isolated ISEE Arcade database is not configured.');

  const parentRows = await sql`
    select
      account.user_id,
      account.username,
      account.account_role,
      account.status,
      account.created_at,
      account.updated_at,
      member.household_id,
      auth_user.last_sign_in_at
    from public.parent_accounts as account
    left join lateral (
      select household_id
      from public.household_members
      where user_id = account.user_id
      order by joined_at
      limit 1
    ) as member on true
    left join auth.users as auth_user on auth_user.id = account.user_id
    where account.account_role = 'parent'
    order by account.created_at desc, account.username asc
  `;

  const householdIds = parentRows.flatMap((row) =>
    row.household_id ? [String(row.household_id)] : [],
  );
  const childrenByHousehold = new Map<string, OwnerChildSummary[]>();
  const preferenceActivity = new Map<string, string>();

  if (householdIds.length > 0) {
    const childRows = await sql`
      select
        learner.id,
        learner.household_id,
        learner.display_name,
        learner.username,
        learner.grade_band,
        learner.avatar_id,
        learner.created_at,
        greatest(
          learner.updated_at,
          snapshot.updated_at,
          latest_answer.answered_at
        ) as last_used_at
      from public.learners as learner
      left join public.learner_snapshots as snapshot
        on snapshot.learner_id = learner.id
      left join lateral (
        select max(answered_at) as answered_at
        from public.question_attempts
        where learner_id = learner.id
      ) as latest_answer on true
      where learner.household_id = any(${householdIds}::uuid[])
      order by learner.created_at, learner.display_name
    `;
    for (const row of childRows) {
      const householdId = String(row.household_id);
      const children = childrenByHousehold.get(householdId) ?? [];
      children.push({
        id: String(row.id),
        display_name: String(row.display_name),
        username: String(row.username),
        grade_band: row.grade_band as OwnerChildSummary['grade_band'],
        avatar_id: row.avatar_id as OwnerChildSummary['avatar_id'],
        created_at: iso(row.created_at),
        last_used_at: isoOrNull(row.last_used_at),
      });
      childrenByHousehold.set(householdId, children);
    }

    const preferenceRows = await sql`
      select household_id, updated_at
      from public.parent_preferences
      where household_id = any(${householdIds}::uuid[])
    `;
    for (const row of preferenceRows) {
      preferenceActivity.set(String(row.household_id), iso(row.updated_at));
    }
  }

  return parentRows.map((row) => {
    const householdId = row.household_id ? String(row.household_id) : null;
    const children = householdId ? childrenByHousehold.get(householdId) ?? [] : [];
    return {
      user_id: String(row.user_id),
      username: String(row.username),
      account_role: 'parent',
      status: row.status as OwnerParentAccount['status'],
      created_at: iso(row.created_at),
      updated_at: iso(row.updated_at),
      last_used_at: latestActivityDate([
        isoOrNull(row.last_sign_in_at),
        householdId ? preferenceActivity.get(householdId) ?? null : null,
        ...children.map((child) => child.last_used_at),
      ]),
      children,
    };
  });
}

export async function findOwnerParentAccount(
  userId: string,
): Promise<OwnerParentAccount | null> {
  const parents = await listOwnerParentAccounts();
  return parents.find((parent) => parent.user_id === userId) ?? null;
}
