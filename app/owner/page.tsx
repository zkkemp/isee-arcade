import Link from 'next/link';
import { redirect } from 'next/navigation';
import AccountSignOutButton from '@/components/AccountSignOutButton';
import OwnerAccountManager, {
  type ParentAccount,
} from '@/components/owner/OwnerAccountManager';
import { usernameFromAuthEmail } from '@/lib/accountUsername';
import { getOwnerSession } from '@/lib/ownerAccess';
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = {
  title: 'Parents · ISEE Arcade',
};

export const dynamic = 'force-dynamic';

export default async function OwnerPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = (await supabase?.auth.getUser()) ?? { data: { user: null } };

  if (!user) redirect('/account');

  const owner = await getOwnerSession();
  if (!owner) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-xl items-center px-5 py-12">
        <section className="w-full rounded-3xl border border-rose-200/15 bg-[#151527] p-7 text-center shadow-[0_28px_80px_rgba(0,0,0,.45)]">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-300/10 text-2xl">
            ⛌
          </div>
          <h1 className="mt-5 text-2xl font-black text-white">Owner access only</h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/55">
            Parent accounts can manage their own children, but only the ISEE Arcade owner can
            issue or change parent sign-ins.
          </p>
          <Link
            href="/parent"
            className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-violet-300 px-6 text-sm font-black text-[#171226]"
          >
            Open parent center
          </Link>
        </section>
      </main>
    );
  }

  const adminConfigured = isSupabaseAdminConfigured();
  const ownerUsername = usernameFromAuthEmail(owner.user.email) ?? 'owner';
  let initialParents: ParentAccount[] = [];
  if (adminConfigured) {
    const admin = getSupabaseAdminClient();
    const { data } = (await admin
      ?.from('parent_accounts')
      .select('user_id, username, account_role, status, created_at, updated_at')
      .eq('account_role', 'parent')
      .order('created_at', { ascending: false })) ?? { data: [] };
    initialParents = (data ?? []) as ParentAccount[];
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-6xl px-4 pb-16 pt-6 sm:px-8 sm:pt-10">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-5">
        <div>
          <Link href="/parent" className="text-sm font-bold text-violet-200/75 hover:text-white">
            ← Parent center
          </Link>
          <div className="mt-5 inline-flex rounded-full bg-fuchsia-300/12 px-3 py-1 text-[10px] font-black uppercase tracking-[.17em] text-fuchsia-200">
            Private owner console
          </div>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] text-white sm:text-5xl">
            Parents
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/58 sm:text-base">
            Create parent sign-ins, see everyone you have invited, and reset a forgotten password
            without opening another family’s records.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="rounded-xl bg-fuchsia-300/[0.09] px-4 py-3 text-right ring-1 ring-fuchsia-200/15">
            <p className="text-[10px] font-black text-fuchsia-200/65">SIGNED IN AS OWNER</p>
            <p className="mt-0.5 text-sm font-black text-white">@{ownerUsername}</p>
          </div>
          <Link
            href="/parent/account"
            className="inline-flex min-h-12 items-center rounded-xl bg-white/[0.06] px-4 text-sm font-black text-white/65 transition hover:bg-white/10 hover:text-white"
          >
            My account
          </Link>
          <AccountSignOutButton
            className="min-h-12 rounded-xl bg-white/[0.06] px-4 text-sm font-black text-white/65 transition hover:bg-white/10 hover:text-white disabled:opacity-45"
          />
        </div>
      </header>

      <OwnerAccountManager
        adminConfigured={adminConfigured}
        initialParents={initialParents}
      />
    </main>
  );
}
