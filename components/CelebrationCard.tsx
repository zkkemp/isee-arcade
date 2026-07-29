'use client';

import CharacterFace from './CharacterFace';
import type { Character } from '@/lib/characters';

/**
 * The level-clear moment: the active learner's exact avatar and a congratulations.
 *
 * Purely decorative and pointer-transparent: it appears over live gameplay and
 * must never eat a tap meant for the game.
 */
export default function CelebrationCard({
  headline,
  note,
  accent,
  character,
}: {
  headline: string;
  note: string | null;
  accent: string;
  character: Character;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-4">
      <div
        className="flex animate-[pop_360ms_cubic-bezier(0.16,1,0.3,1)] flex-col items-center gap-2 rounded-3xl border-2 bg-[#12121e]/92 px-7 py-5 text-center shadow-2xl backdrop-blur-sm sm:gap-3 sm:px-12 sm:py-8"
        style={{ borderColor: accent }}
      >
        <div
          className="rounded-full p-1.5"
          style={{ background: `radial-gradient(circle, ${accent}44, transparent 70%)` }}
        >
          <CharacterFace character={character} size={92} className="sm:hidden" />
          <CharacterFace character={character} size={140} className="hidden sm:block" />
        </div>

        <div className="text-xl font-extrabold tracking-tight text-white sm:text-4xl">
          Congratulations!
        </div>
        <div className="text-sm font-semibold sm:text-xl" style={{ color: accent }}>
          {headline}
        </div>
        {note && <div className="text-xs text-white/55 sm:text-base">{note}</div>}
      </div>

      <style>{`
        @keyframes pop {
          0%   { transform: scale(0.86) translateY(14px); filter: blur(5px); opacity: 0.2; }
          100% { transform: scale(1) translateY(0); filter: blur(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
