'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import GameArtwork from './GameArtwork';
import { GAMES } from '@/lib/games';
import {
  getRecentGames,
  getRecentGamesServerSnapshot,
  subscribeRecentGames,
} from '@/lib/recentGames';

export default function RecentlyPlayed() {
  const recent = useSyncExternalStore(
    subscribeRecentGames,
    getRecentGames,
    getRecentGamesServerSnapshot,
  );

  return (
    <section
      aria-labelledby="recently-played-title"
      className="mb-8 rounded-[1.75rem] border border-cyan-300/15 bg-cyan-300/[0.045] p-4 shadow-xl sm:p-5"
    >
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <div className="text-[9px] font-extrabold uppercase tracking-[0.22em] text-cyan-300/65">
            Jump back in
          </div>
          <h2 id="recently-played-title" className="mt-0.5 text-xl font-black text-white sm:text-2xl">
            Recently played
          </h2>
        </div>
        <span className="text-[11px] font-semibold text-white/35">Last 6 games</span>
      </div>

      {recent.length === 0 ? (
        <div className="flex min-h-24 items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/10 px-5 text-center text-sm text-white/40">
          Games you play will appear here for one-tap access.
        </div>
      ) : (
        <div className="recent-games-grid grid auto-cols-[minmax(9.5rem,1fr)] grid-flow-col gap-3 overflow-x-auto pb-1 lg:grid-flow-row lg:grid-cols-6 lg:overflow-visible">
          {recent.map((id) => {
            const game = GAMES[id];
            return (
              <Link
                key={id}
                href={`/play/${id}`}
                className="recent-game-card game-card group min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.05] shadow-lg transition hover:-translate-y-1 hover:border-white/25"
                style={{ '--game-accent': game.accent } as React.CSSProperties}
              >
                <GameArtwork game={id} accent={game.accent} icon={game.icon} />
                <span className="flex items-center gap-2 p-3">
                  <span className="min-w-0 flex-1 truncate text-xs font-extrabold text-white sm:text-sm">
                    {game.name}
                  </span>
                  <span className="game-card__play flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[8px] text-white">
                    ▶
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
