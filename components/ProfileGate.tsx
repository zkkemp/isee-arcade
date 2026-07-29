'use client';

import Link from 'next/link';
import AccountSignOutButton from '@/components/AccountSignOutButton';
import CharacterFace from '@/components/CharacterFace';
import { getCharacter } from '@/lib/characters';
import { GRADE_BAND_LABELS } from '@/lib/questions';
import { useActiveProfile } from '@/lib/profiles';
import { usePlayerMode } from '@/lib/playerMode';

export default function ProfileGate() {
  const active = useActiveProfile();
  const playerMode = usePlayerMode();

  return (
    <section
      aria-label="Signed-in account"
      className="flex min-h-20 flex-wrap items-center gap-3 rounded-2xl bg-[#151527] p-4 shadow-[0_18px_50px_rgba(0,0,0,.28)]"
    >
      {playerMode === 'parent' ? (
        <>
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-200/12 text-2xl">
            🧭
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-black text-white">Parent game mode</p>
            <p className="mt-0.5 text-xs font-bold text-amber-100/72">
              Play without changing a child’s progress
            </p>
          </div>
          <Link
            href="/parent"
            className="flex min-h-11 w-full items-center justify-center rounded-xl bg-amber-200 px-4 text-sm font-black text-[#211704] sm:w-auto"
          >
            Manage family &amp; account →
          </Link>
        </>
      ) : active ? (
        <>
          <CharacterFace
            character={getCharacter(active.avatarId)}
            size={52}
            className="rounded-xl"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-black text-white">{active.name}</p>
            <p className="mt-0.5 truncate text-xs font-bold text-cyan-100/72">
              @{active.username} · {GRADE_BAND_LABELS[active.band]}
            </p>
          </div>
          <AccountSignOutButton
            label="Sign out"
            className="min-h-11 rounded-xl bg-white/[.07] px-4 text-sm font-black text-white/72 transition hover:bg-white/10 hover:text-white"
          />
        </>
      ) : (
        <div className="flex-1 text-sm font-bold text-white/58">Loading your player…</div>
      )}
    </section>
  );
}
