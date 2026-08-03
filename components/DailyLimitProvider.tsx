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
import {
  foregroundElapsedMs,
  newForegroundClock,
  resetForegroundClock,
} from '@/lib/foregroundTimer';
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
  const [limitReached, setLimitReached] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const deferredRef = useRef(false);

  const countsAsLearningTime =
    !parentSandbox && (pathname.startsWith('/play/') || pathname === '/prep');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!profile || parentSandbox) {
        setLimitReached(false);
        setBlocked(false);
        return;
      }
      const current = loadDailyUsage(profile.id).activeMs;
      const reached = current >= profile.dailyLimitMinutes * 60_000;
      setLimitReached(reached);
      setBlocked(reached && !deferredRef.current);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [parentSandbox, profile]);

  useEffect(() => {
    if (!profile || !countsAsLearningTime || blocked) return;
    const clock = newForegroundClock(Date.now(), document.visibilityState === 'visible');
    let sinceSync = 0;
    const resetClock = () =>
      resetForegroundClock(clock, Date.now(), document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', resetClock);
    window.addEventListener('pageshow', resetClock);
    window.addEventListener('focus', resetClock);
    const interval = window.setInterval(() => {
      const now = Date.now();
      const elapsed = foregroundElapsedMs(clock, now, document.visibilityState === 'visible');
      if (elapsed <= 0) return;
      const next = addDailyUsage(profile.id, elapsed);
      sinceSync += elapsed;
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
      document.removeEventListener('visibilitychange', resetClock);
      window.removeEventListener('pageshow', resetClock);
      window.removeEventListener('focus', resetClock);
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

  return (
    <DailyLimitContext.Provider value={value}>
      {children}
      {blocked && profile && !parentSandbox && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#070914]/95 p-5 text-center backdrop-blur-xl">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="playtime-limit-title"
            aria-describedby="playtime-limit-message"
            className="w-full max-w-md rounded-3xl bg-[#12182a] p-6 shadow-[0_30px_90px_rgba(0,0,0,.65)] ring-1 ring-cyan-200/20 sm:p-8"
          >
            <div className="mx-auto flex h-18 w-18 items-center justify-center rounded-2xl bg-cyan-200/10 text-4xl">
              🌙
            </div>
            <h2
              id="playtime-limit-title"
              className="mt-5 text-4xl font-black leading-[1.02] tracking-[-.03em] text-white sm:text-5xl"
            >
              You&apos;re out of playtime
            </h2>
            <p className="mt-4 text-xl font-black text-cyan-100">
              Nice work, {profile.name}!
            </p>
            <p
              id="playtime-limit-message"
              className="mx-auto mt-3 max-w-sm text-base leading-relaxed text-white/72"
            >
              You used all {profile.dailyLimitMinutes} minutes for today. Your progress is saved.
              Ask a parent for more time, or come back tomorrow.
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
          </section>
        </div>
      )}
    </DailyLimitContext.Provider>
  );
}
