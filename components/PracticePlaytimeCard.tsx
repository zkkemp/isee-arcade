'use client';

import { useActiveProfile } from '@/lib/profiles';
import { BLOCK_SIZE } from '@/lib/playSession';

export default function PracticePlaytimeCard() {
  const profile = useActiveProfile();
  const questions = profile?.questionBlockSize ?? BLOCK_SIZE;
  const minutes = profile?.playWindowMinutes ?? 6;
  const perfectBonus = profile?.perfectBlockBonusMinutes ?? 0;

  return (
    <section className="arcade-info-panel p-5">
      <h2 className="text-xl font-black text-white">Studying earns playtime</h2>
      <p className="mt-1 text-sm leading-relaxed text-white/55">
        Finish one short practice block, then play without interruptions until the timer ends.
      </p>

      <div className="mt-5 grid items-stretch gap-2 sm:grid-cols-[1fr_auto_1fr]">
        <div className="flex min-h-24 flex-col justify-center rounded-xl bg-violet-300/[0.08] px-4 py-3 text-center">
          <strong className="text-3xl font-black tabular-nums text-violet-100">{questions}</strong>
          <span className="mt-1 text-xs font-bold text-violet-100/65">
            correct answer{questions === 1 ? '' : 's'}
          </span>
        </div>
        <div
          className="flex items-center justify-center text-xl font-black text-white/35"
          aria-hidden="true"
        >
          <span className="sm:hidden">↓</span>
          <span className="hidden sm:inline">→</span>
        </div>
        <div className="flex min-h-24 flex-col justify-center rounded-xl bg-amber-200/[0.09] px-4 py-3 text-center">
          <strong className="text-3xl font-black tabular-nums text-amber-100">
            {minutes} minute{minutes === 1 ? '' : 's'}
          </strong>
          <span className="mt-1 text-xs font-bold text-amber-100/65">of uninterrupted play</span>
        </div>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-white/64">
        Scores, coins, and level wins never add time.{' '}
        {perfectBonus > 0
          ? `Get every study answer right on the first try to earn ${perfectBonus} extra minute${perfectBonus === 1 ? '' : 's'}.`
          : 'This profile has no bonus time.'}
      </p>
    </section>
  );
}
