'use client';

import { useMemo, useState } from 'react';
import CharacterFace from '@/components/CharacterFace';
import { CHARACTERS, type CharacterId } from '@/lib/characters';

type AvatarKind = 'all' | 'people' | 'fantastic';

const FILTERS: Array<{ id: AvatarKind; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'people', label: 'People' },
  { id: 'fantastic', label: 'Fantastic friends' },
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
  const selectedCharacter = CHARACTERS.find((character) => character.id === value);
  const [filter, setFilter] = useState<AvatarKind>(
    selectedCharacter?.group === 'fantastic' ? 'fantastic' : 'people',
  );
  const [query, setQuery] = useState('');
  const counts = useMemo(
    () => ({
      all: CHARACTERS.length,
      people: CHARACTERS.filter((character) => character.group !== 'fantastic').length,
      fantastic: CHARACTERS.filter((character) => character.group === 'fantastic').length,
    }),
    [],
  );
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return CHARACTERS.filter((character) => {
      if (filter === 'people' && character.group === 'fantastic') return false;
      if (filter === 'fantastic' && character.group !== 'fantastic') return false;
      return !needle || `${character.name} ${character.blurb}`.toLowerCase().includes(needle);
    });
  }, [filter, query]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Avatar type">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={filter === item.id}
            onClick={() => setFilter(item.id)}
            className={`min-h-11 rounded-xl px-3 text-xs font-black transition ${
              filter === item.id
                ? 'bg-cyan-200 text-[#08202a]'
                : 'bg-white/[0.055] text-white/64 hover:bg-white/[0.09] hover:text-white'
            }`}
          >
            {item.label} <span className="opacity-65">{counts[item.id]}</span>
          </button>
        ))}
      </div>

      {!compact && (
        <label className="relative block">
          <span className="sr-only">Search avatars</span>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-white/45"
          >
            ⌕
          </span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value.slice(0, 32))}
            placeholder="Search avatar styles"
            className="min-h-11 w-full rounded-xl bg-white/[0.055] pl-9 pr-4 text-sm font-bold text-white outline-none ring-1 ring-white/10 placeholder:text-white/42 focus:ring-2 focus:ring-cyan-200"
          />
        </label>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black text-white/78">
          {filter === 'fantastic' ? 'Fantastic friends' : filter === 'people' ? 'People' : 'Every avatar'}
        </p>
        <p aria-live="polite" className="text-[11px] text-white/55">
          {matches.length} {matches.length === 1 ? 'choice' : 'choices'}
        </p>
      </div>

      {matches.length > 0 ? (
        <div
          className={`grid ${
            compact
              ? 'grid-cols-5 gap-1.5 sm:grid-cols-8'
              : 'max-h-[32rem] grid-cols-4 gap-2 overflow-y-auto overscroll-contain pr-1 sm:grid-cols-6 lg:grid-cols-8'
          }`}
        >
          {matches.map((character) => {
            const selected = character.id === value;
            return (
              <button
                key={character.id}
                type="button"
                aria-pressed={selected}
                aria-label={`Choose ${character.name}: ${character.blurb}`}
                onClick={() => onChange(character.id)}
                className={`group relative flex min-w-0 items-center justify-center rounded-xl p-2 text-center outline-none transition focus-visible:ring-2 focus-visible:ring-cyan-200 ${
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
      ) : (
        <div className="rounded-xl bg-white/[0.04] px-4 py-8 text-center">
          <p className="text-sm font-black text-white">No avatars match “{query}”</p>
          <button
            type="button"
            onClick={() => setQuery('')}
            className="mt-3 min-h-11 rounded-xl bg-white/[0.08] px-4 text-xs font-black text-cyan-100"
          >
            Clear search
          </button>
        </div>
      )}
    </div>
  );
}
