import 'server-only';

import { getIseeDatabase } from './supabase/database';

export type OwnerParentAccountRecord = {
  user_id: string;
  username: string;
  account_role: 'parent';
  status: 'active' | 'suspended' | 'removed';
  created_at: string;
  updated_at: string;
};

function serializeParent(row: Record<string, unknown>): OwnerParentAccountRecord {
  const createdAt = row.created_at;
  const updatedAt = row.updated_at;
  return {
    user_id: String(row.user_id),
    username: String(row.username),
    account_role: 'parent',
    status: row.status as OwnerParentAccountRecord['status'],
    created_at: createdAt instanceof Date ? createdAt.toISOString() : String(createdAt),
    updated_at: updatedAt instanceof Date ? updatedAt.toISOString() : String(updatedAt),
  };
}

export async function listOwnerParentAccounts(): Promise<OwnerParentAccountRecord[]> {
  const sql = getIseeDatabase();
  if (!sql) throw new Error('The isolated ISEE Arcade database is not configured.');

  const rows = await sql`
    select user_id, username, account_role, status, created_at, updated_at
    from public.parent_accounts
    where account_role = 'parent'
    order by created_at desc, username asc
  `;
  return rows.map((row) => serializeParent(row));
}

export async function findOwnerParentAccount(
  userId: string,
): Promise<OwnerParentAccountRecord | null> {
  const sql = getIseeDatabase();
  if (!sql) throw new Error('The isolated ISEE Arcade database is not configured.');

  const rows = await sql`
    select user_id, username, account_role, status, created_at, updated_at
    from public.parent_accounts
    where user_id = ${userId}::uuid
      and account_role = 'parent'
    limit 1
  `;
  return rows[0] ? serializeParent(rows[0]) : null;
}

