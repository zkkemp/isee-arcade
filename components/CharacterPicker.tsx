'use client';

import CharacterFace from './CharacterFace';
import { CHARACTERS, useCharacter, useCharacterName } from '@/lib/characters';
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
  const [customName, setCustomName] = useCharacterName();
  const displayName = customName.trim() || chosen.name;

  return (
    <section className="mb-5">
      <h2 className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white/35 sm:text-sm">
        Who are you today?
      </h2>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1.5 sm:gap-4">
        {CHARACTERS.map((c) => {
          const active = c.id === chosen.id;
          const label = active ? displayName : c.name;
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
                className="max-w-full truncate text-xs font-bold leading-none sm:text-base"
                style={{ color: active ? c.accent : 'rgba(255,255,255,0.7)' }}
              >
                {label}
              </span>
              <span className="text-[10px] leading-none text-white/30 sm:text-xs">
                {c.age === null ? 'the dog' : `age ${c.age}`}
              </span>
            </button>
          );
        })}
      </div>

      <p className="px-1 text-[11px] text-white/25 sm:text-sm">{chosen.blurb}</p>

      <div className="mt-2.5 flex items-center gap-2 px-1">
        <label
          htmlFor="character-name"
          className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/35 sm:text-sm"
        >
          Your name
        </label>
        <input
          id="character-name"
          type="text"
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
          onBlur={() => setCustomName(customName.trim())}
          maxLength={16}
          placeholder={chosen.name}
          autoComplete="off"
          className="w-32 rounded-xl border-2 border-white/10 bg-white/[0.03] px-2.5 py-1 text-sm font-bold text-white placeholder:text-white/25 focus:border-white/30 focus:outline-none sm:w-40"
        />
      </div>
    </section>
  );
}
