'use client';

import CharacterFace from './CharacterFace';
import { CHARACTERS, useCharacter } from '@/lib/characters';
import { playSound, unlockAudio } from '@/lib/sound';

/**
 * Pick who you play as. Applies to every game, and persists.
 *
 * Deliberately the first thing on the home screen: a four-year-old who cannot
 * read the game names can still find himself, and choosing your own face is a
 * reason to open the app at all.
 */
export default function CharacterPicker() {
  const [chosen, choose] = useCharacter();

  return (
    <section className="mb-5">
      <h2 className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white/35 sm:text-sm">
        Who are you today?
      </h2>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1.5 sm:gap-4">
        {CHARACTERS.map((c) => {
          const active = c.id === chosen.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                unlockAudio();
                playSound('click');
                choose(c.id);
              }}
              aria-pressed={active}
              className={`flex min-w-[5.2rem] flex-shrink-0 flex-col items-center gap-1 rounded-2xl border-2 px-2 py-2.5 transition active:scale-95 sm:min-w-[7.5rem] sm:gap-1.5 sm:rounded-3xl sm:py-4 ${
                active ? 'bg-white/10' : 'border-white/10 bg-white/[0.03]'
              }`}
              style={active ? { borderColor: c.accent } : undefined}
            >
              <CharacterFace character={c} size={52} className="sm:hidden" />
              <CharacterFace character={c} size={76} className="hidden sm:block" />
              <span
                className="text-xs font-bold leading-none sm:text-base"
                style={{ color: active ? c.accent : 'rgba(255,255,255,0.7)' }}
              >
                {c.name}
              </span>
              <span className="text-[10px] leading-none text-white/30 sm:text-xs">
                {c.age === null ? 'the dog' : `age ${c.age}`}
              </span>
            </button>
          );
        })}
      </div>

      <p className="px-1 text-[11px] text-white/25 sm:text-sm">{chosen.blurb}</p>
    </section>
  );
}
