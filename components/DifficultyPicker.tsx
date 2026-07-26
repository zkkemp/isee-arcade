'use client';

import {
  DIFFICULTIES,
  DIFFICULTY_BLURBS,
  DIFFICULTY_LABELS,
  useDifficulty,
} from '@/lib/difficulty';

const DIFFICULTY_ICONS = {
  easy: '🌱',
  normal: '⭐',
  hard: '🚀',
} as const;

/** Game-speed setting. Defaults to Easy and applies across the arcade. */
export default function DifficultyPicker() {
  const [difficulty, setDifficulty] = useDifficulty();

  return (
    <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.025] p-4 shadow-xl">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-widest text-white/40">
          Game speed
        </span>
        <span className="text-[11px] text-white/40">{DIFFICULTY_BLURBS[difficulty]}</span>
      </div>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Skill level">
        {DIFFICULTIES.map((d) => {
          const active = d === difficulty;
          return (
            <button
              key={d}
              type="button"
              aria-pressed={active}
              onClick={() => setDifficulty(d)}
              className={`flex flex-col items-center rounded-2xl border px-2 py-2.5 text-sm font-bold transition active:scale-95 ${
                active
                  ? 'border-[#a78bfa] bg-[#a78bfa]/20 text-white shadow-[0_8px_24px_rgba(167,139,250,.16)]'
                  : 'border-white/12 bg-white/[0.03] text-white/55 hover:bg-white/[0.07]'
              }`}
            >
              <span className="mb-0.5 text-lg" aria-hidden="true">{DIFFICULTY_ICONS[d]}</span>
              <span>{DIFFICULTY_LABELS[d]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
