'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { setActiveProfile } from '@/lib/profiles';
import { setPlayerMode, usePlayerMode } from '@/lib/playerMode';

const NAV = [
  { href: '/parent', label: 'Overview', icon: '⌂' },
  { href: '/parent/reports', label: 'Reports', icon: '↗' },
  { href: '/parent/curriculum', label: 'Curriculum', icon: '▤' },
  { href: '/parent/controls', label: 'Controls', icon: '⚙' },
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
  const mode = usePlayerMode();

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
      checking = false;
      if (disposed || error || !account || account.status === 'active') return;

      await cloudClient.auth.signOut();
      setActiveProfile(null);
      setPlayerMode(null);
      router.replace('/account');
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

  if (mode !== 'parent') {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-xl items-center px-5 py-12">
        <section className="w-full rounded-2xl bg-[#151527] p-7 text-center shadow-[0_28px_80px_rgba(0,0,0,.45)]">
          <div className="text-4xl">🔒</div>
          <h1 className="mt-4 text-2xl font-black text-white">Parent access required</h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/55">
            Open Parent settings from the arcade and enter the parent password. This keeps
            reports and learning controls away from child accounts.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-amber-300 px-6 text-sm font-black text-[#211704]"
          >
            Return to the arcade
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-6xl px-4 pb-16 pt-5 sm:px-8 sm:pt-9">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/" className="text-sm font-bold text-violet-200/75 hover:text-white">
            ← Arcade
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
        <Link
          href="/"
          className="rounded-xl border border-amber-200/20 bg-amber-200/[0.07] px-4 py-3 text-sm font-black text-amber-100"
        >
          ∞ Parent free play
        </Link>
      </header>

      <nav
        aria-label="Parent center"
        className="mb-7 grid grid-cols-4 gap-1 rounded-2xl bg-black/25 p-1.5"
      >
        {NAV.map((item) => {
          const active =
            item.href === '/parent' ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-2 text-xs font-black transition sm:text-sm ${
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
