'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { restoreCloudFamily, uploadDeviceState, type CloudSyncResult } from '@/lib/cloudSync';
import {
  normalizeAccountUsername,
  usernameAuthEmail,
  usernameFromAuthEmail,
} from '@/lib/accountUsername';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { setActiveProfile } from '@/lib/profiles';
import { setPlayerMode } from '@/lib/playerMode';

type Props = {
  configured: boolean;
  initialUsername: string | null;
};

export default function CloudAccount({ configured, initialUsername }: Props) {
  const [username, setUsername] = useState(initialUsername ?? '');
  const [password, setPassword] = useState('');
  const [signedInUsername, setSignedInUsername] = useState(initialUsername);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<CloudSyncResult | null>(null);

  function enterParentCenter() {
    setActiveProfile(null);
    setPlayerMode('parent');
  }

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    void supabase.auth.getUser().then(({ data }) => {
      setSignedInUsername(usernameFromAuthEmail(data.user?.email));
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedInUsername(usernameFromAuthEmail(session?.user.email));
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!configured) {
    return (
      <section className="rounded-2xl bg-[#151527] p-5 shadow-[0_18px_50px_rgba(0,0,0,.3)] sm:p-7">
        <h2 className="text-xl font-black text-white">Ready for a separate ISEE Arcade project</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/60">
          The secure tables, family permissions, offline migration, and sync code are installed.
          Cloud login turns on after the new project’s URL and publishable key are added.
        </p>
        <ol className="mt-5 space-y-3 text-sm leading-relaxed text-white/75">
          <li>
            <strong className="text-cyan-200">1.</strong> Create a brand-new Supabase project with
            “ISEE Arcade” in its name.
          </li>
          <li>
            <strong className="text-cyan-200">2.</strong> Run the included ISEE Arcade migration in
            that new project.
          </li>
          <li>
            <strong className="text-cyan-200">3.</strong> Add its URL and publishable key locally and
            to the separate ISEE Arcade Vercel project.
          </li>
        </ol>
        <p className="mt-5 rounded-xl bg-amber-300/10 px-4 py-3 text-xs font-bold leading-relaxed text-amber-100">
          KEMPCO/FSM projects and credentials are explicitly excluded.
        </p>
      </section>
    );
  }

  async function submitAuth() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || busy) return;
    const cleanUsername = normalizeAccountUsername(username);
    if (cleanUsername.length < 3 || password.length < 6) {
      setNotice({
        ok: false,
        message: 'Use a username with at least 3 characters and a password with at least 6.',
        learners: 0,
      });
      return;
    }
    setBusy(true);
    setNotice(null);
    const result =
      mode === 'signup'
        ? await supabase.auth.signUp({
            email: usernameAuthEmail(cleanUsername),
            password,
            options: { data: { username: cleanUsername, account_type: 'parent' } },
          })
        : await supabase.auth.signInWithPassword({
            email: usernameAuthEmail(cleanUsername),
            password,
          });
    if (result.error) {
      setNotice({ ok: false, message: result.error.message, learners: 0 });
    } else if (mode === 'signup' && !result.data.session) {
      setNotice({
        ok: false,
        message:
          'Username-only login needs Confirm email turned off in Supabase Authentication settings. Turn it off, then create this parent again.',
        learners: 0,
      });
    } else {
      setSignedInUsername(cleanUsername);
      setPassword('');
      enterParentCenter();
      setNotice(await uploadDeviceState());
    }
    setBusy(false);
  }

  async function runSync(kind: 'upload' | 'restore') {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    const result = kind === 'upload' ? await uploadDeviceState() : await restoreCloudFamily();
    setNotice(result);
    setBusy(false);
    if (kind === 'restore' && result.ok && result.learners > 0) {
      window.setTimeout(() => window.location.reload(), 900);
    }
  }

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || busy) return;
    setBusy(true);
    await supabase.auth.signOut();
    setActiveProfile(null);
    setPlayerMode(null);
    setSignedInUsername(null);
    setNotice({ ok: true, message: 'Signed out. Local play still works normally.', learners: 0 });
    setBusy(false);
  }

  if (signedInUsername) {
    return (
      <section className="rounded-2xl bg-[#151527] p-5 shadow-[0_18px_50px_rgba(0,0,0,.3)] sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="inline-flex rounded-full bg-emerald-300/12 px-3 py-1 text-xs font-black text-emerald-200">
              Cloud connected
            </span>
            <h2 className="mt-3 text-xl font-black text-white">@{signedInUsername}</h2>
            <p className="mt-1 text-sm text-white/55">
              Changes sync automatically after local saves.
            </p>
          </div>
          <button
            type="button"
            onClick={signOut}
            disabled={busy}
            className="min-h-11 rounded-xl bg-white/[0.07] px-4 text-sm font-bold text-white/70 transition hover:bg-white/10 disabled:opacity-45"
          >
            Sign out
          </button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link
            href="/parent"
            onClick={enterParentCenter}
            className="flex min-h-14 items-center justify-center rounded-xl bg-amber-300 px-5 text-center text-sm font-black text-[#211704] shadow-[0_12px_28px_rgba(251,191,36,.18)] transition hover:bg-amber-200 active:scale-[.98]"
          >
            Open parent center
          </Link>
          <button
            type="button"
            onClick={() => runSync('upload')}
            disabled={busy}
            className="min-h-14 rounded-xl bg-cyan-300 px-5 text-sm font-black text-[#101523] shadow-[0_12px_28px_rgba(34,211,238,.2)] transition hover:bg-cyan-200 active:scale-[.98] disabled:opacity-45"
          >
            {busy ? 'Working…' : 'Sync this device'}
          </button>
          <button
            type="button"
            onClick={() => runSync('restore')}
            disabled={busy}
            className="min-h-14 rounded-xl bg-violet-300/16 px-5 text-sm font-black text-violet-100 transition hover:bg-violet-300/22 active:scale-[.98] disabled:opacity-45"
          >
            Restore cloud family
          </button>
        </div>

        {notice && (
          <p
            role="status"
            className={`mt-4 rounded-xl px-4 py-3 text-sm font-semibold ${
              notice.ok ? 'bg-emerald-300/10 text-emerald-100' : 'bg-rose-300/10 text-rose-100'
            }`}
          >
            {notice.message}
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-2xl bg-[#151527] p-5 shadow-[0_18px_50px_rgba(0,0,0,.3)] sm:p-7">
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-black/20 p-1" role="tablist">
        {(['signin', 'signup'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={mode === tab}
            onClick={() => {
              setMode(tab);
              setNotice(null);
            }}
            className={`min-h-11 rounded-lg px-4 text-sm font-black transition ${
              mode === tab ? 'bg-violet-300 text-[#171226]' : 'text-white/55 hover:text-white'
            }`}
          >
            {tab === 'signin' ? 'Sign in' : 'Create parent account'}
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-bold text-white/75">Parent username</span>
          <input
            type="text"
            autoCapitalize="none"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(normalizeAccountUsername(event.target.value))}
            className="min-h-12 w-full rounded-xl bg-white/[0.07] px-4 text-base text-white outline-none ring-1 ring-white/10 transition placeholder:text-white/28 focus:ring-2 focus:ring-cyan-300"
            placeholder="familyname"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-bold text-white/75">Password</span>
          <input
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void submitAuth();
            }}
            className="min-h-12 w-full rounded-xl bg-white/[0.07] px-4 text-base text-white outline-none ring-1 ring-white/10 transition placeholder:text-white/28 focus:ring-2 focus:ring-cyan-300"
            placeholder="At least 6 characters"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={() => void submitAuth()}
        disabled={busy}
        className="mt-5 min-h-14 w-full rounded-xl bg-cyan-300 px-5 text-sm font-black text-[#101523] shadow-[0_12px_28px_rgba(34,211,238,.2)] transition hover:bg-cyan-200 active:scale-[.99] disabled:opacity-45"
      >
        {busy ? 'Working…' : mode === 'signin' ? 'Sign in and sync' : 'Create account'}
      </button>

      {notice && (
        <p
          role="status"
          className={`mt-4 rounded-xl px-4 py-3 text-sm font-semibold ${
            notice.ok ? 'bg-emerald-300/10 text-emerald-100' : 'bg-rose-300/10 text-rose-100'
          }`}
        >
          {notice.message}
        </p>
      )}
    </section>
  );
}
