'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { loadProgress, type Progress } from '@/lib/progress';

/**
 * All-time totals for the home screen. Renders nothing on the server pass so
 * localStorage-only data can never cause a hydration mismatch.
 */
export default function ProgressStrip() {
  const [p, setP] = useState<Progress | null>(null);

  useEffect(() => {
    setP(loadProgress());
  }, []);

  if (!p || p.totalSeen === 0) return null;

  const pct = Math.round((p.totalCorrect / p.totalSeen) * 100);
  const reviewCount = Object.keys(p.missed).length;

  return (
    <Link
      href="/progress"
      className="group flex items-center justify-between gap-3 overflow-hidden rounded-3xl border border-emerald-300/15 bg-gradient-to-r from-emerald-300/[0.08] to-violet-300/[0.06] px-4 py-3.5 shadow-xl transition hover:-translate-y-0.5 hover:border-emerald-300/30"
    >
      <div className="flex items-baseline gap-4">
        <div className="hidden h-11 w-11 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-300/10 text-xl sm:flex">
          🏆
        </div>
        <div>
          <div className="text-xl font-bold text-white">{p.totalSeen}</div>
          <div className="text-[10px] uppercase tracking-widest text-white/40">answered</div>
        </div>
        <div>
          <div className="text-xl font-bold text-emerald-300">{pct}%</div>
          <div className="text-[10px] uppercase tracking-widest text-white/40">correct</div>
        </div>
        {p.bestStreak > 1 && (
          <div>
            <div className="text-xl font-bold text-amber-300">{p.bestStreak}</div>
            <div className="text-[10px] uppercase tracking-widest text-white/40">best streak</div>
          </div>
        )}
      </div>
      <div className="text-right">
        {reviewCount > 0 && (
          <div className="text-xs text-white/50">{reviewCount} to review</div>
        )}
        <div className="text-xs font-bold text-white/75 transition group-hover:text-emerald-200">
          See progress →
        </div>
      </div>
    </Link>
  );
}
