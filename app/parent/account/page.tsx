import ParentAccountSettings from '@/components/parent/ParentAccountSettings';
import ParentShell from '@/components/parent/ParentShell';
import { usernameFromAuthEmail } from '@/lib/accountUsername';
import { getOwnerSession } from '@/lib/ownerAccess';
import { requireActiveParent } from '@/lib/parentAccess';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = { title: 'My Account · Parent Center' };

export default async function ParentAccountPage() {
  await requireActiveParent();
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = (await supabase?.auth.getUser()) ?? { data: { user: null } };
  const username = usernameFromAuthEmail(user?.email) ?? 'parent';
  const owner = await getOwnerSession();

  return (
    <ParentShell
      title="My account"
      description="Change the password for your own parent sign-in without changing any child accounts."
    >
      <ParentAccountSettings username={username} isOwner={Boolean(owner)} />
    </ParentShell>
  );
}
