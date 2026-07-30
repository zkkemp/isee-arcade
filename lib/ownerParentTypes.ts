import type { CharacterId } from './characters';
import type { GradeBand } from './questions';

export type OwnerChildSummary = {
  id: string;
  display_name: string;
  username: string;
  grade_band: GradeBand;
  avatar_id: CharacterId;
  created_at: string;
  last_used_at: string | null;
};

export type OwnerParentAccount = {
  user_id: string;
  username: string;
  account_role: 'parent';
  status: 'active' | 'suspended' | 'removed';
  created_at: string;
  updated_at: string;
  /** Latest parent sign-in or cloud activity from any child in the household. */
  last_used_at: string | null;
  children: OwnerChildSummary[];
};

export function latestActivityDate(values: Array<string | null>): string | null {
  let newest: string | null = null;
  let newestTime = -Infinity;
  for (const value of values) {
    if (!value) continue;
    const time = Date.parse(value);
    if (Number.isFinite(time) && time > newestTime) {
      newest = value;
      newestTime = time;
    }
  }
  return newest;
}
