'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import GameArtwork from '@/components/GameArtwork';
import StableGameCategory from '@/components/StableGameCategory';
import { GAMES, type GameId } from '@/lib/games';

type GameSection = {
  id: string;
  eyebrow: string;
  title: string;
  icon: string;
  accent: string;
  ids: GameId[];
};

export const GAME_SECTIONS: GameSection[] = [
  { id: 'action', eyebrow: 'Run · jump · dodge', title: 'Fast & fearless', icon: '⚡', accent: '#fb7185', ids: ['platformer3', 'platformer2', 'platformer', 'paperroute', 'pyramidhop', 'snake2', 'runner', 'frogger', 'climber', 'breakout'] },
  { id: 'arcade', eyebrow: 'Beloved rules · fresh worlds', title: 'Classics Reimagined', icon: '★', accent: '#38bdf8', ids: ['maze', 'seabattle', 'paddleduel', 'asteroids', 'stardefender', 'starfall', 'lunarlander', 'diamond'] },
  { id: 'puzzles', eyebrow: 'Match · stack · solve', title: 'Puzzle power', icon: '◆', accent: '#a78bfa', ids: ['lanterns', 'colorbynumber', 'match3', 'blocks', 'tetris', 'merge', 'bubble', 'memory', 'skystack'] },
  { id: 'tabletop', eyebrow: 'Boards · cards · strategy', title: 'Tabletop classics', icon: '♟', accent: '#34d399', ids: ['reversi', 'backgammon', 'chess', 'checkers', 'mancala', 'starlinefour', 'tictactoe', 'dots', 'sudoku', 'cards', 'diceroyale'] },
  { id: 'quick', eyebrow: 'Remember · react · discover', title: 'Quick thinkers', icon: '☄', accent: '#fb923c', ids: ['constellation', 'mysteryfaces', 'gemcode', 'hangman', 'wordscramble', 'echo', 'fruit2', 'fruit', 'tapattack2', 'tapattack', 'wordhunt', 'spelling', 'firefly'] },
];

const NEW_GAME_IDS = new Set<GameId>([
  'platformer3', 'diamond', 'paperroute', 'pyramidhop', 'reversi', 'backgammon',
  'seabattle', 'paddleduel', 'asteroids', 'stardefender', 'lunarlander', 'skystack',
  'starfall', 'firefly', 'mysteryfaces', 'colorbynumber', 'hangman', 'wordscramble',
  'diceroyale', 'starlinefour', 'mancala', 'gemcode', 'constellation', 'lanterns',
]);

function GameCard({ id }: { id: GameId }) {
  const game = GAMES[id];
  const edition =
    id === 'platformer3' ? 'V3' : id.endsWith('2') ? 'V2' : id === 'platformer' ? 'Original' : null;
  return (
    <Link
      href={`/play/${game.id}`}
      className="game-card group overflow-hidden"
      style={{ '--game-accent': game.accent } as CSSProperties}
    >
      <GameArtwork game={game.id} accent={game.accent} icon={game.icon} />
      <span className="block p-3.5 sm:p-4">
        <span className="flex items-center justify-between gap-2">
          <span className="min-w-0">
            <span className="block truncate text-sm font-black text-white sm:text-base">{game.name}</span>
            {edition && (
              <span className="mt-0.5 block text-[9px] font-black uppercase tracking-[0.14em] text-amber-300">
                {edition === 'Original' ? 'Original edition' : `${edition} · Original preserved`}
              </span>
            )}
            {NEW_GAME_IDS.has(id) && (
              <span className="mt-0.5 block text-[9px] font-black uppercase tracking-[0.14em] text-cyan-200">
                New game
              </span>
            )}
          </span>
          <span className="game-card__play flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[10px] text-white">▶</span>
        </span>
        <span className="mt-1 line-clamp-2 min-h-8 text-xs leading-relaxed text-white/62 sm:text-sm">
          {game.tagline}
        </span>
      </span>
    </Link>
  );
}

export default function GameLibrary() {
  const [sectionId, setSectionId] = useState('all');
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const matchedIds = useMemo(() => {
    const allIds = GAME_SECTIONS.flatMap((section) => section.ids);
    if (!needle) {
      return sectionId === 'all'
        ? allIds
        : GAME_SECTIONS.find((section) => section.id === sectionId)?.ids ?? [];
    }
    return allIds.filter((id) => {
      const game = GAMES[id];
      const section = GAME_SECTIONS.find((candidate) => candidate.ids.includes(id));
      return `${game.name} ${game.tagline} ${section?.title ?? ''} ${section?.eyebrow ?? ''}`
        .toLowerCase()
        .includes(needle);
    });
  }, [needle, sectionId]);
  const showFilteredGrid = sectionId !== 'all' || Boolean(needle);

  return (
    <section aria-labelledby="game-library-title">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4 px-1">
        <div>
          <h2 id="game-library-title" className="text-2xl font-black tracking-[-0.025em] text-white sm:text-3xl">
            Browse the arcade
          </h2>
          <p className="mt-1 text-sm text-white/62">Five shelves. Fifty-one ways to play.</p>
        </div>
        <span className="hidden text-xs font-semibold text-white/55 sm:block">Search or choose a shelf</span>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <label className="relative block">
          <span className="sr-only">Search games</span>
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-white/55">⌕</span>
          <input
            type="search"
            value={query}
            onChange={(event) => {
              const nextQuery = event.target.value.slice(0, 48);
              setQuery(nextQuery);
              if (nextQuery.trim()) setSectionId('all');
            }}
            placeholder="Search games — try “word,” “space,” or “puzzle”"
            className="min-h-12 w-full rounded-xl bg-white/[0.055] pl-9 pr-4 text-base font-bold text-white outline-none ring-1 ring-white/10 placeholder:text-white/45 focus:ring-2 focus:ring-cyan-200 sm:text-sm"
          />
        </label>
        {(query || sectionId !== 'all') && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setSectionId('all');
            }}
            className="min-h-12 rounded-xl bg-white/[0.065] px-4 text-xs font-black text-white/72 hover:bg-white/10"
          >
            Clear filters
          </button>
        )}
      </div>

      <div
        className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
        role="group"
        aria-label="Game shelf"
      >
        <button
          type="button"
          aria-pressed={sectionId === 'all'}
          onClick={() => setSectionId('all')}
          className={`min-h-12 rounded-xl px-3 text-xs font-black transition ${
            sectionId === 'all' ? 'bg-cyan-200 text-[#08202a]' : 'bg-white/[0.055] text-white/68 hover:bg-white/10'
          }`}
        >
          <span className="block text-sm">All games</span>
          <span className="mt-0.5 block text-[10px] opacity-65">51 games</span>
        </button>
        {GAME_SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            aria-pressed={sectionId === section.id}
            onClick={() => setSectionId(section.id)}
            className={`min-h-12 rounded-xl px-2 py-2 text-xs font-black leading-tight transition ${
              sectionId === section.id ? 'bg-cyan-200 text-[#08202a]' : 'bg-white/[0.055] text-white/68 hover:bg-white/10'
            }`}
          >
            <span className="block">{section.icon} {section.title}</span>
            <span className="mt-0.5 block text-[10px] opacity-60">{section.ids.length} games</span>
          </button>
        ))}
      </div>

      {showFilteredGrid ? (
        <>
          <p aria-live="polite" className="mb-3 px-1 text-xs font-bold text-white/62">
            {matchedIds.length} {matchedIds.length === 1 ? 'game' : 'games'} found
          </p>
          {matchedIds.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {matchedIds.map((id) => <GameCard key={id} id={id} />)}
            </div>
          ) : (
            <div className="rounded-2xl bg-white/[0.04] px-5 py-12 text-center ring-1 ring-white/[0.08]">
              <div aria-hidden="true" className="text-4xl">🕹️</div>
              <h3 className="mt-3 text-lg font-black text-white">No games match “{query}”</h3>
              <p className="mt-1 text-sm text-white/58">Try a shorter word or a different game name.</p>
            </div>
          )}
        </>
      ) : (
        <div className="game-library space-y-3">
          {GAME_SECTIONS.map((section) => (
            <StableGameCategory key={section.id} accent={section.accent} initiallyOpen={section.id === 'action'}>
              <summary className="game-category__summary">
                <span className="game-category__icon" aria-hidden="true">{section.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[9px] font-extrabold uppercase tracking-[0.2em] text-white/55 sm:text-[10px]">{section.eyebrow}</span>
                  <span className="mt-0.5 block truncate text-lg font-black tracking-tight text-white sm:text-xl">{section.title}</span>
                </span>
                <span className="game-category__count">{section.ids.length} games</span>
                <span className="game-category__chevron" aria-hidden="true">↓</span>
              </summary>
              <div className="game-category__content">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                  {section.ids.map((id) => <GameCard key={id} id={id} />)}
                </div>
              </div>
            </StableGameCategory>
          ))}
        </div>
      )}
    </section>
  );
}
