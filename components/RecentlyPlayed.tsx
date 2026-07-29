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
      className="recently-played mb-9 p-4 sm:p-5"
    >
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <h2 id="recently-played-title" className="text-xl font-black tracking-[-0.02em] text-white sm:text-2xl">
            Recently played
          </h2>
          <div className="mt-1 text-xs text-cyan-100/50">Your quickest way back into the fun.</div>
        </div>
        {recent.length > 0 && (
          <span className="text-[11px] font-semibold text-white/45">
            {recent.length} recent {recent.length === 1 ? 'game' : 'games'}
          </span>
        )}
      </div>

      {recent.length === 0 ? (
        <div className="recently-played__empty flex min-h-20 items-center gap-3 px-1 text-sm text-white/45">
          <span aria-hidden="true" className="text-xl text-cyan-200/70">↗</span>
          Play any game and it will stay within easy reach here.
        </div>
      ) : (
        <div className="recent-games-grid grid auto-cols-[minmax(9.5rem,1fr)] grid-flow-col gap-3 overflow-x-auto pb-1 lg:grid-flow-row lg:grid-cols-6 lg:overflow-visible">
          {recent.map((id) => {
            const game = GAMES[id];
            return (
              <Link
                key={id}
                href={`/play/${id}`}
                className="recent-game-card game-card group min-w-0 overflow-hidden"
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
