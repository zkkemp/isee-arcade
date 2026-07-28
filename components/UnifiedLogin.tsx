'use client';

import { useState, type FormEvent } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import CharacterFace from '@/components/CharacterFace';
import { getCharacter } from '@/lib/characters';
import { normalizeAccountUsername, usernameAuthEmail } from '@/lib/accountUsername';
import { setPlayerMode } from '@/lib/playerMode';
import { setActiveProfile } from '@/lib/profiles';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { restoreCloudFamily } from '@/lib/cloudSync';

type ChildResponse = {
  role?: 'child';
  profile?: Record<string, unknown> & { id: string };
  snapshot?: {
    progress?: unknown;
    play_session?: unknown;
    recent_games?: unknown;
    painting_progress?: { pictures?: unknown; finished?: unknown };
    settings?: Record<string, unknown>;
  } | null;
  error?: string;
};

function storeChild(data: ChildResponse) {
  if (!data.profile) return;
  const profile = data.profile;
  window.localStorage.setItem('isee-arcade:profiles', JSON.stringify([profile]));
  window.localStorage.setItem('isee-arcade:active-profile', profile.id);
  if (data.snapshot?.progress) {
    window.localStorage.setItem(`isee-arcade:v1::${profile.id}`, JSON.stringify(data.snapshot.progress));
  }
  if (data.snapshot?.play_session) {
    window.localStorage.setItem(
      `isee-arcade:play-session::${profile.id}`,
      JSON.stringify(data.snapshot.play_session),
    );
  }
  if (data.snapshot?.recent_games) {
    window.localStorage.setItem('isee-arcade:recent-games', JSON.stringify(data.snapshot.recent_games));
  }
  const paintings = data.snapshot?.painting_progress;
  if (paintings?.pictures) {
    window.localStorage.setItem(
      `isee-arcade:color-by-number:v1::${profile.id}`,
      JSON.stringify(paintings.pictures),
    );
  }
  if (paintings?.finished) {
    window.localStorage.setItem(
      `isee-arcade:color-by-number:finished:v1::${profile.id}`,
      JSON.stringify(paintings.finished),
    );
  }
  setActiveProfile(profile.id);
  setPlayerMode('learner');
}

export default function UnifiedLogin() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const cleanUsername = normalizeAccountUsername(username);
    if (cleanUsername.length < 2 || password.length < 6) {
      setError('Enter your username and password. Passwords have at least six characters.');
      return;
    }

    setBusy(true);
    setError('');

    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      const { data, error: parentError } = await supabase.auth.signInWithPassword({
        email: usernameAuthEmail(cleanUsername),
        password,
      });
      if (!parentError && data.user) {
        const { data: account } = await supabase
          .from('parent_accounts')
          .select('status')
          .eq('user_id', data.user.id)
          .maybeSingle();
        if (account?.status === 'active') {
          const restored = await restoreCloudFamily();
          if (!restored.ok) {
            setError(`Signed in, but the family could not load: ${restored.message}`);
            setBusy(false);
            return;
          }
          setActiveProfile(null);
          setPlayerMode('parent');
          router.replace('/parent');
          router.refresh();
          return;
        }
        await supabase.auth.signOut();
      }
    }

    const response = await fetch('/api/auth/child', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: cleanUsername, password }),
    });
    const result = (await response.json()) as ChildResponse;
    if (response.ok && result.role === 'child' && result.profile) {
      storeChild(result);
      router.replace('/');
      router.refresh();
      return;
    }

    setPassword('');
    setError(result.error ?? 'That username or password did not match an active account.');
    setBusy(false);
  }

  return (
    <main className="login-stage min-h-dvh px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto grid min-h-[calc(100dvh-3rem)] w-full max-w-6xl items-center gap-8 lg:grid-cols-[1.08fr_.92fr]">
        <section className="login-story px-1 py-5 sm:px-5">
          <div className="flex items-center gap-3">
            <Image
              src="/icon-192.png"
              width={64}
              height={64}
              alt=""
              priority
              className="h-16 w-16 rounded-2xl shadow-2xl"
            />
            <div>
              <p className="text-xs font-black text-cyan-200">STUDY. PLAY. LEVEL UP.</p>
              <h1 className="mt-1 text-4xl font-black tracking-[-.035em] text-white sm:text-6xl">
                ISEE Arcade
              </h1>
            </div>
          </div>
          <p className="mt-6 hidden max-w-xl text-lg leading-relaxed text-violet-100/72 sm:block sm:text-xl">
            One family sign-in. Kids go straight to their arcade. Parents open the dashboard and
            can jump into free play whenever they want.
          </p>
          <div className="mt-8 hidden -space-x-3 sm:flex" aria-hidden="true">
            {['dakota', 'scout', 'sunny', 'aria', 'maya'].map((id) => (
              <CharacterFace
                key={id}
                character={getCharacter(id)}
                size={62}
                className="rounded-2xl ring-4 ring-[#0b0b19]"
              />
            ))}
          </div>
          <p className="mt-4 hidden text-sm font-bold text-white/46 sm:block">
            Progress, learning level, play time, and avatars stay with each player.
          </p>
        </section>

        <section className="login-panel mx-auto w-full max-w-md rounded-2xl bg-[#151527] p-6 shadow-[0_30px_90px_rgba(0,0,0,.45)] sm:p-8">
          <p className="text-sm font-black text-cyan-100">Welcome back</p>
          <h2 className="mt-1 text-3xl font-black tracking-[-.025em] text-white">Sign in to play</h2>
          <p className="mt-2 text-sm leading-relaxed text-white/58">
            Use the username and password for your parent or child account. We’ll take you to the
            right place automatically.
          </p>

          <form onSubmit={(event) => void submit(event)} className="mt-7 space-y-5">
            <label className="block">
              <span className="mb-2 block text-sm font-black text-white/78">Username</span>
              <input
                type="text"
                value={username}
                onChange={(event) => setUsername(normalizeAccountUsername(event.target.value))}
                autoCapitalize="none"
                autoComplete="username"
                required
                className="min-h-14 w-full rounded-xl bg-white/[.075] px-4 text-lg font-bold text-white outline-none ring-1 ring-white/12 transition placeholder:text-white/30 focus:ring-2 focus:ring-cyan-200"
                placeholder="Your username"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-black text-white/78">Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value.slice(0, 64))}
                autoComplete="current-password"
                required
                className="min-h-14 w-full rounded-xl bg-white/[.075] px-4 text-lg font-bold text-white outline-none ring-1 ring-white/12 transition placeholder:text-white/30 focus:ring-2 focus:ring-cyan-200"
                placeholder="Your password"
              />
            </label>
            {error && (
              <p role="alert" className="rounded-xl bg-rose-300/10 px-4 py-3 text-sm font-bold text-rose-100">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="min-h-14 w-full rounded-xl bg-cyan-200 px-5 text-base font-black text-[#071821] shadow-[0_14px_34px_rgba(103,232,249,.2)] transition hover:bg-cyan-100 active:scale-[.99] disabled:opacity-50"
            >
              {busy ? 'Checking your account…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-5 text-center text-xs leading-relaxed text-white/42">
            Need a child password reset? Ask the parent account holder.
          </p>
        </section>
      </div>
    </main>
  );
}
