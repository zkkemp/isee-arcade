'use client';

import CharacterFace from '@/components/CharacterFace';
import {
  CHARACTERS,
  type CharacterGroup,
  type CharacterId,
} from '@/lib/characters';

const GROUPS: Array<{
  id: CharacterGroup;
  label: string;
  note: string;
}> = [
  { id: 'crew', label: 'Arcade crew', note: 'Friendly everyday players' },
  { id: 'creatures', label: 'Bold spirits', note: 'Playful personalities' },
  { id: 'cosmic', label: 'Adventure team', note: 'Curious explorers' },
  { id: 'powerups', label: 'All-stars', note: 'Confident challengers' },
  { id: 'fantastic', label: 'Fantastic friends', note: 'Aliens, robots, creatures, and emoji-like buddies' },
];

export default function AvatarPicker({
  value,
  onChange,
  compact = false,
}: {
  value: CharacterId;
  onChange: (id: CharacterId) => void;
  compact?: boolean;
}) {
  return (
    <div className="space-y-4">
      {GROUPS.map((group) => {
        const characters = CHARACTERS.filter((character) => character.group === group.id);
        return (
          <section key={group.id} aria-labelledby={`avatar-group-${group.id}`}>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h4
                id={`avatar-group-${group.id}`}
                className="text-xs font-black text-white/78"
              >
                {group.label}
              </h4>
              {!compact && <p className="text-[11px] text-white/38">{group.note}</p>}
            </div>
            <div
              className={`grid ${
                compact
                  ? 'grid-cols-5 gap-1.5 sm:grid-cols-8'
                  : 'grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8'
              }`}
            >
              {characters.map((character) => {
                const selected = character.id === value;
                return (
                  <button
                    key={character.id}
                    type="button"
                    aria-pressed={selected}
                    aria-label={`Choose ${character.name}: ${character.blurb}`}
                    onClick={() => onChange(character.id)}
                    className={`group relative flex min-h-20 min-w-0 flex-col items-center rounded-xl px-1.5 py-2 text-center outline-none transition focus-visible:ring-2 focus-visible:ring-cyan-200 ${
                      selected
                        ? 'bg-white/[0.12] shadow-[0_10px_28px_rgba(0,0,0,.24)] ring-2 ring-cyan-200'
                        : 'bg-white/[0.035] ring-1 ring-white/[0.08] hover:bg-white/[0.075] hover:ring-white/20'
                    }`}
                  >
                    <CharacterFace
                      character={character}
                      size={compact ? 38 : 48}
                      className="rounded-lg transition duration-200 group-hover:scale-105"
                    />
                    <span
                      className={`mt-1.5 max-w-full truncate text-[10px] font-black ${
                        selected ? 'text-cyan-100' : 'text-white/55'
                      }`}
                    >
                      {character.name}
                    </span>
                    {selected && (
                      <span
                        aria-hidden="true"
                        className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-cyan-200 text-[9px] font-black text-[#08202a]"
                      >
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
