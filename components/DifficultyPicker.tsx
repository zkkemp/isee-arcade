'use client';

import {
  DIFFICULTIES,
  DIFFICULTY_BLURBS,
  DIFFICULTY_LABELS,
  useDifficulty,
} from '@/lib/difficulty';

/** Skill setting. Defaults to Easy, and applies to all three games. */
export default function DifficultyPicker() {
  const [difficulty, setDifficulty] = useDifficulty();

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-widest text-white/40">
          Skill level
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
              className={`rounded-xl border px-3 py-2.5 text-sm font-bold transition active:scale-95 ${
                active
                  ? 'border-[#a78bfa] bg-[#a78bfa]/20 text-white'
                  : 'border-white/12 bg-white/[0.03] text-white/55 hover:bg-white/[0.07]'
              }`}
            >
              {DIFFICULTY_LABELS[d]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
