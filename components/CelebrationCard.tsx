'use client';

import CharacterFace from './CharacterFace';
import { getCharacter } from '@/lib/characters';

/**
 * The level-clear moment: Marty's face and a congratulations.
 *
 * Always the dog rather than the selected character - he was asked for by name
 * for exactly this ("show his cute little face and say congratulations"), and a
 * familiar face every single time is what makes it feel like a reward rather than
 * just another banner.
 *
 * Purely decorative and pointer-transparent: it appears over live gameplay and
 * must never eat a tap meant for the game.
 */
export default function CelebrationCard({
  headline,
  note,
  accent,
}: {
  headline: string;
  note: string | null;
  accent: string;
}) {
  const marty = getCharacter('marty');

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-4">
      <div
        className="flex animate-[pop_320ms_cubic-bezier(0.34,1.56,0.64,1)] flex-col items-center gap-2 rounded-3xl border-2 bg-[#12121e]/92 px-7 py-5 text-center shadow-2xl backdrop-blur-sm sm:gap-3 sm:px-12 sm:py-8"
        style={{ borderColor: accent }}
      >
        <div
          className="rounded-full p-1.5"
          style={{ background: `radial-gradient(circle, ${accent}44, transparent 70%)` }}
        >
          <CharacterFace character={marty} size={92} className="sm:hidden" />
          <CharacterFace character={marty} size={140} className="hidden sm:block" />
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
          0%   { transform: scale(0.72) translateY(14px); opacity: 0; }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
