'use client';

import { usePathname, useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { addDailyUsage, loadDailyUsage, syncDailyUsageSoon } from '@/lib/dailyUsage';
import { setActiveProfile, useActiveProfile } from '@/lib/profiles';
import { usePlayerMode } from '@/lib/playerMode';

type DailyLimitContextValue = {
  limitReached: boolean;
  deferLock: (defer: boolean) => void;
  lockAtBoundary: () => boolean;
};

const DailyLimitContext = createContext<DailyLimitContextValue>({
  limitReached: false,
  deferLock: () => undefined,
  lockAtBoundary: () => false,
});

export function useDailyLimit(): DailyLimitContextValue {
  return useContext(DailyLimitContext);
}

export default function DailyLimitProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const profile = useActiveProfile();
  const playerMode = usePlayerMode();
  const parentSandbox = playerMode === 'parent';
  const [usedMs, setUsedMs] = useState(0);
  const [limitReached, setLimitReached] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const deferredRef = useRef(false);

  const limitMs = (profile?.dailyLimitMinutes ?? 30) * 60_000;
  const countsAsLearningTime =
    !parentSandbox && (pathname.startsWith('/play/') || pathname === '/prep');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!profile || parentSandbox) {
        setUsedMs(0);
        setLimitReached(false);
        setBlocked(false);
        return;
      }
      const current = loadDailyUsage(profile.id).activeMs;
      setUsedMs(current);
      const reached = current >= profile.dailyLimitMinutes * 60_000;
      setLimitReached(reached);
      setBlocked(reached && !deferredRef.current);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [parentSandbox, profile]);

  useEffect(() => {
    if (!profile || !countsAsLearningTime || blocked) return;
    let last = Date.now();
    let sinceSync = 0;
    const interval = window.setInterval(() => {
      const now = Date.now();
      const elapsed = now - last;
      last = now;
      if (document.visibilityState !== 'visible') return;
      const next = addDailyUsage(profile.id, elapsed);
      sinceSync += elapsed;
      setUsedMs(next.activeMs);
      if (sinceSync >= 30_000) {
        sinceSync = 0;
        syncDailyUsageSoon();
      }
      if (next.activeMs >= profile.dailyLimitMinutes * 60_000) {
        setLimitReached(true);
        if (!deferredRef.current) setBlocked(true);
      }
    }, 1000);
    return () => {
      window.clearInterval(interval);
      if (sinceSync > 0) syncDailyUsageSoon();
    };
  }, [blocked, countsAsLearningTime, profile]);

  const deferLock = useCallback((defer: boolean) => {
    deferredRef.current = defer;
    if (!defer) {
      setLimitReached((reached) => {
        if (reached) setBlocked(true);
        return reached;
      });
    }
  }, []);

  const lockAtBoundary = useCallback((): boolean => {
    if (!limitReached) return false;
    deferredRef.current = false;
    setBlocked(true);
    return true;
  }, [limitReached]);

  const value = useMemo(
    () => ({ limitReached, deferLock, lockAtBoundary }),
    [deferLock, limitReached, lockAtBoundary],
  );
  const remainingMinutes = Math.max(0, Math.ceil((limitMs - usedMs) / 60_000));

  return (
    <DailyLimitContext.Provider value={value}>
      {children}
      {blocked && profile && !parentSandbox && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#070914]/95 p-5 text-center backdrop-blur-xl">
          <section className="w-full max-w-md rounded-[2rem] border border-cyan-200/20 bg-[#12182a] p-7 shadow-[0_30px_90px_rgba(0,0,0,.65)]">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-cyan-200/10 text-4xl">
              🌙
            </div>
            <div className="mt-4 text-[10px] font-black uppercase tracking-[.2em] text-cyan-200/65">
              Daily goal complete
            </div>
            <h2 className="mt-1 text-3xl font-black tracking-tight text-white">
              Nice work, {profile.name}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-white/58">
              You used today&apos;s {profile.dailyLimitMinutes} minutes. Your progress is saved.
              A parent can add more time in the parent dashboard, or you can come back tomorrow.
            </p>
            <button
              type="button"
              onClick={async () => {
                await fetch('/api/auth/logout', { method: 'POST' });
                setActiveProfile(null);
                setBlocked(false);
                setLimitReached(false);
                router.replace('/');
                router.refresh();
              }}
              className="mt-6 min-h-14 w-full rounded-2xl bg-cyan-200 px-5 font-black text-[#071821]"
            >
              Return to sign in
            </button>
            <p className="mt-3 text-xs text-white/30">
              {remainingMinutes > 0 ? `${remainingMinutes} minutes remain.` : 'Timer resets tomorrow.'}
            </p>
          </section>
        </div>
      )}
    </DailyLimitContext.Provider>
  );
}
