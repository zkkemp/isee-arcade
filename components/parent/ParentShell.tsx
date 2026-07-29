'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import AccountSignOutButton from '@/components/AccountSignOutButton';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { setActiveProfile } from '@/lib/profiles';
import { setPlayerMode } from '@/lib/playerMode';
import { prepareParentDeviceState } from '@/lib/accountDeviceScope';
import { refreshCloudFamily } from '@/lib/cloudSync';

const NAV = [
  { href: '/parent', label: 'Overview', icon: '⌂' },
  { href: '/parent/children', label: 'Children', icon: '☺' },
  { href: '/parent/reports', label: 'Reports', icon: '↗' },
  { href: '/parent/curriculum', label: 'Curriculum', icon: '▤' },
  { href: '/parent/controls', label: 'Controls', icon: '⚙' },
  { href: '/parent/account', label: 'My account', icon: '◇' },
] as const;

export default function ParentShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const cloudClient = supabase;

    let checking = false;
    let disposed = false;
    async function validateCloudAccess() {
      if (checking || disposed) return;
      checking = true;
      const { data } = await cloudClient.auth.getUser();
      if (!data.user) {
        checking = false;
        return;
      }
      const { data: account, error } = await cloudClient
        .from('parent_accounts')
        .select('status')
        .eq('user_id', data.user.id)
        .maybeSingle();
      if (disposed || error || !account) {
        checking = false;
        return;
      }
      if (account.status === 'active') {
        const accountChanged = prepareParentDeviceState(data.user.id);
        if (accountChanged) {
          await refreshCloudFamily();
          if (!disposed) router.refresh();
        }
        const { data: owner } = await cloudClient.rpc('is_platform_admin');
        if (!disposed) setIsOwner(owner === true);
        checking = false;
        return;
      }

      await cloudClient.auth.signOut();
      setActiveProfile(null);
      setPlayerMode(null);
      router.replace('/');
    }

    void validateCloudAccess();
    const interval = window.setInterval(() => void validateCloudAccess(), 30_000);
    const validateWhenVisible = () => {
      if (document.visibilityState === 'visible') void validateCloudAccess();
    };
    window.addEventListener('focus', validateWhenVisible);
    document.addEventListener('visibilitychange', validateWhenVisible);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', validateWhenVisible);
      document.removeEventListener('visibilitychange', validateWhenVisible);
    };
  }, [router]);

  const navItems = isOwner
    ? [...NAV, { href: '/owner', label: 'Parents', icon: '♙' } as const]
    : NAV;

  return (
    <main className="mx-auto min-h-dvh w-full max-w-6xl px-4 pb-16 pt-5 sm:px-8 sm:pt-9">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/?play=parent"
            className="inline-flex min-h-11 items-center text-sm font-bold text-violet-200/75 hover:text-white"
          >
            ← Parent free play
          </Link>
          <div className="mt-4 inline-flex rounded-full bg-amber-300/12 px-3 py-1 text-[10px] font-black uppercase tracking-[.16em] text-amber-200">
            Parent center
          </div>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.035em] text-white sm:text-5xl">
            {title}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/58 sm:text-base">
            {description}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/?play=parent"
            className="rounded-xl border border-amber-200/20 bg-amber-200/[0.07] px-4 py-3 text-sm font-black text-amber-100"
          >
            Play games
          </Link>
          <AccountSignOutButton
            className="rounded-xl bg-white/[0.06] px-4 py-3 text-sm font-black text-white/65 transition hover:bg-white/10 hover:text-white disabled:opacity-45"
          />
        </div>
      </header>

      <nav
        aria-label="Parent center"
        className={`mb-7 grid grid-cols-3 gap-1 rounded-2xl bg-black/25 p-1.5 sm:grid-cols-4 ${
          isOwner ? 'lg:grid-cols-7' : 'lg:grid-cols-6'
        }`}
      >
        {navItems.map((item) => {
          const active =
            item.href === '/parent' ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[11px] font-black leading-none transition sm:flex-row sm:gap-2 sm:px-3 sm:text-sm ${
                active
                  ? 'bg-violet-300 text-[#171226]'
                  : 'text-white/52 hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              <span aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      {children}
    </main>
  );
}
