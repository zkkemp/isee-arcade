'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
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
  initialIsOwner: boolean;
};

async function accountStatus(
  supabase: SupabaseClient,
  userId: string,
): Promise<'active' | 'inactive' | 'unknown'> {
  const { data, error } = await supabase
    .from('parent_accounts')
    .select('status')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return 'unknown';
  return data.status === 'active' ? 'active' : 'inactive';
}

export default function CloudAccount({ configured, initialUsername, initialIsOwner }: Props) {
  const [username, setUsername] = useState(initialUsername ?? '');
  const [password, setPassword] = useState('');
  const [signedInUsername, setSignedInUsername] = useState(initialUsername);
  const [isOwner, setIsOwner] = useState(initialIsOwner);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<CloudSyncResult | null>(null);

  function enterParentCenter() {
    setActiveProfile(null);
    setPlayerMode('parent');
  }

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        setSignedInUsername(null);
        setIsOwner(false);
        return;
      }
      const status = await accountStatus(supabase, data.user.id);
      if (status === 'inactive') {
        await supabase.auth.signOut();
        setActiveProfile(null);
        setPlayerMode(null);
        setSignedInUsername(null);
        setIsOwner(false);
        setNotice({
          ok: false,
          message: 'This parent account is no longer active.',
          learners: 0,
        });
        return;
      }
      setSignedInUsername(usernameFromAuthEmail(data.user.email));
      if (status === 'unknown') {
        setNotice({
          ok: false,
          message: 'Cloud access could not be verified. Your local family data is still available.',
          learners: 0,
        });
        return;
      }
      const { data: owner } = await supabase.rpc('is_platform_admin');
      setIsOwner(owner === true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedInUsername(usernameFromAuthEmail(session?.user.email));
      if (!session) setIsOwner(false);
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
    const result = await supabase.auth.signInWithPassword({
      email: usernameAuthEmail(cleanUsername),
      password,
    });
    if (result.error) {
      setNotice({
        ok: false,
        message:
          result.error.code === 'user_banned'
            ? 'This parent account is suspended. Ask the ISEE Arcade owner to restore access.'
            : 'That username or password did not match an active parent account.',
        learners: 0,
      });
    } else if (!result.data.user) {
      setNotice({
        ok: false,
        message: 'That account could not be verified.',
        learners: 0,
      });
    } else {
      const status = await accountStatus(supabase, result.data.user.id);
      if (status === 'inactive') {
        await supabase.auth.signOut();
        setActiveProfile(null);
        setPlayerMode(null);
        setSignedInUsername(null);
        setNotice({
          ok: false,
          message: 'This parent account is not active.',
          learners: 0,
        });
      } else if (status === 'unknown') {
        setSignedInUsername(cleanUsername);
        setPassword('');
        setNotice({
          ok: false,
          message:
            'Cloud access could not be verified. Try syncing again when the connection returns.',
          learners: 0,
        });
      } else {
        setSignedInUsername(cleanUsername);
        setPassword('');
        enterParentCenter();
        const { data: owner } = await supabase.rpc('is_platform_admin');
        setIsOwner(owner === true);
        setNotice(await uploadDeviceState());
      }
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

  async function changePassword() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || busy) return;
    if (!/^[A-Za-z0-9]{6,64}$/.test(newPassword)) {
      setNotice({
        ok: false,
        message: 'Use 6–64 characters containing only letters or numbers.',
        learners: 0,
      });
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setNotice({
      ok: !error,
      message: error ? 'Your password could not be changed.' : 'Your new password is saved.',
      learners: 0,
    });
    if (!error) {
      setNewPassword('');
      setShowPasswordChange(false);
    }
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
          <button
            type="button"
            onClick={() => {
              setShowPasswordChange((current) => !current);
              setNewPassword('');
              setNotice(null);
            }}
            disabled={busy}
            className="min-h-14 rounded-xl bg-white/[0.07] px-5 text-sm font-black text-white/70 transition hover:bg-white/10 active:scale-[.98] disabled:opacity-45"
          >
            Change my password
          </button>
          {isOwner && (
            <Link
              href="/owner"
              className="flex min-h-14 items-center justify-center rounded-xl bg-fuchsia-300/16 px-5 text-center text-sm font-black text-fuchsia-100 transition hover:bg-fuchsia-300/22 active:scale-[.98]"
            >
              Manage parent access
            </Link>
          )}
        </div>

        {showPasswordChange && (
          <div className="mt-4 flex flex-wrap gap-2 rounded-xl bg-black/20 p-3">
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) =>
                setNewPassword(event.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 64))
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter') void changePassword();
              }}
              className="min-h-11 min-w-56 flex-1 rounded-lg bg-white/[0.07] px-3 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-300"
              placeholder="New password · 6+ letters or numbers"
            />
            <button
              type="button"
              onClick={() => void changePassword()}
              disabled={busy || !/^[A-Za-z0-9]{6,64}$/.test(newPassword)}
              className="min-h-11 rounded-lg bg-cyan-300 px-4 text-xs font-black text-[#0e1722] disabled:opacity-40"
            >
              Save password
            </button>
          </div>
        )}

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
      <div className="rounded-xl border border-cyan-200/12 bg-cyan-200/[0.05] px-4 py-3">
        <p className="text-sm font-black text-cyan-100">Private family access</p>
        <p className="mt-1 text-xs leading-relaxed text-white/52">
          Sign in with the username and password given to you by the ISEE Arcade owner.
          Accounts cannot be created from this page.
        </p>
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
            autoComplete="current-password"
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
        {busy ? 'Signing in…' : 'Sign in and sync'}
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
