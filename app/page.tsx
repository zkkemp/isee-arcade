import Link from 'next/link';
import ProfileGate from '@/components/ProfileGate';
import DifficultyPicker from '@/components/DifficultyPicker';
import ProgressStrip from '@/components/ProgressStrip';
import GameArtwork from '@/components/GameArtwork';
import RecentlyPlayed from '@/components/RecentlyPlayed';
import StableGameCategory from '@/components/StableGameCategory';
import { GAMES, type GameId } from '@/lib/games';
import { TEMPLATE_COUNT, TOTAL_FAMILIES, countBySubject } from '@/lib/questions';
import { SUBJECT_LABELS, type Subject } from '@/lib/questions/types';

const GAME_SECTIONS: Array<{
  eyebrow: string;
  title: string;
  icon: string;
  accent: string;
  ids: GameId[];
}> = [
  {
    eyebrow: 'Run · jump · dodge',
    title: 'Fast & fearless',
    icon: '⚡',
    accent: '#fb7185',
    ids: ['platformer3', 'platformer2', 'platformer', 'paperroute', 'pyramidhop', 'snake2', 'runner', 'frogger', 'climber', 'breakout'],
  },
  {
    eyebrow: 'Beloved rules · fresh worlds',
    title: 'Classics Reimagined',
    icon: '★',
    accent: '#38bdf8',
    ids: ['maze', 'seabattle', 'paddleduel', 'asteroids', 'stardefender', 'starfall', 'lunarlander', 'diamond'],
  },
  {
    eyebrow: 'Match · stack · solve',
    title: 'Puzzle power',
    icon: '◆',
    accent: '#a78bfa',
    ids: ['colorbynumber', 'match3', 'blocks', 'tetris', 'merge', 'bubble', 'memory', 'skystack'],
  },
  {
    eyebrow: 'Boards · cards · strategy',
    title: 'Tabletop classics',
    icon: '♟',
    accent: '#34d399',
    ids: ['reversi', 'backgammon', 'chess', 'checkers', 'mancala', 'starlinefour', 'tictactoe', 'dots', 'sudoku', 'cards', 'diceroyale'],
  },
  {
    eyebrow: 'Remember · react · discover',
    title: 'Quick thinkers',
    icon: '☄',
    accent: '#fb923c',
    ids: ['mysteryfaces', 'gemcode', 'hangman', 'wordscramble', 'echo', 'fruit2', 'fruit', 'tapattack2', 'tapattack', 'wordhunt', 'spelling', 'firefly'],
  },
];

const NEW_GAME_IDS = new Set<GameId>([
  'platformer3',
  'diamond',
  'paperroute',
  'pyramidhop',
  'reversi',
  'backgammon',
  'seabattle',
  'paddleduel',
  'asteroids',
  'stardefender',
  'lunarlander',
  'skystack',
  'starfall',
  'firefly',
  'mysteryfaces',
  'colorbynumber',
  'hangman',
  'wordscramble',
  'diceroyale',
  'starlinefour',
  'mancala',
  'gemcode',
]);

export default function Home() {
  const counts = countBySubject();
  const subjects = Object.keys(counts) as Subject[];

  return (
    <main className="arcade-home mx-auto w-full max-w-6xl px-4 pb-16 pt-5 sm:px-8 sm:pt-9">
      <header className="arcade-masthead mb-7 sm:mb-9">
        <div>
          <div className="arcade-kicker mb-3 inline-flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.19em] text-violet-100/70">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-300 shadow-[0_0_12px_#fde68a]" />
            Study. Play. Level up.
          </div>
          <h1 className="arcade-logo text-4xl font-black tracking-[-0.035em] text-white sm:text-6xl">
            ISEE <span>Arcade</span>
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/65 sm:text-base">
            Big adventures powered by a little practice. Finish a short study block, then spend
            your earned play time anywhere in the arcade.
          </p>
        </div>
        <div className="hidden items-center gap-2 sm:flex">
          <Link
            href="/account"
            className="arcade-action px-4 py-3 text-sm font-bold text-white/80"
          >
            Family cloud <span className="ml-1 text-cyan-200">☁</span>
          </Link>
          <Link
            href="/progress"
            className="arcade-action px-4 py-3 text-sm font-bold text-white/80"
          >
            View progress <span className="ml-1 text-violet-300">↗</span>
          </Link>
        </div>
      </header>

      <Link
        href="/account"
        className="arcade-action mb-4 flex min-h-11 items-center justify-between px-4 text-sm font-bold text-white/80 sm:hidden"
      >
        <span>Family cloud</span>
        <span className="text-cyan-200">Set up sync ☁</span>
      </Link>

      <div className="mb-4">
        <ProgressStrip />
      </div>

      <Link
        href="/prep"
        className="prep-launch mb-6 flex items-center justify-between gap-4 p-4 sm:p-5"
      >
        <span>
          <span className="text-[10px] font-black uppercase tracking-[.18em] text-violet-100/65">
            Complete ISEE preparation
          </span>
          <span className="mt-0.5 block text-lg font-black text-white sm:text-xl">
            ISEE Test Prep Center
          </span>
          <span className="mt-1 block max-w-3xl text-xs leading-relaxed text-white/58 sm:text-sm">
            Full timed sections, a four-part diagnostic, skill review, and a 30-minute Essay Lab.
          </span>
        </span>
        <span className="prep-launch__arrow flex h-11 w-11 flex-shrink-0 items-center justify-center text-lg font-black text-[#171126]">
          →
        </span>
      </Link>

      <div className="mb-6 grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
        <ProfileGate />
        <div className="self-start">
          <DifficultyPicker />
        </div>
      </div>

      <RecentlyPlayed />

      <section aria-labelledby="game-library-title">
        <div className="mb-5 flex items-end justify-between gap-4 px-1">
          <div>
            <h2 id="game-library-title" className="text-2xl font-black tracking-[-0.025em] text-white sm:text-3xl">
              Browse the arcade
            </h2>
            <p className="mt-1 text-sm text-white/48">Five shelves. Forty-nine ways to play.</p>
          </div>
          <span className="hidden text-xs font-semibold text-white/35 sm:block">
            Tap a category to explore
          </span>
        </div>

        <div className="game-library space-y-3">
          {GAME_SECTIONS.map((section) => (
            <StableGameCategory
              key={section.title}
              accent={section.accent}
              initiallyOpen={section.title === 'Fast & fearless'}
            >
              <summary className="game-category__summary">
                <span className="game-category__icon" aria-hidden="true">
                  {section.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[9px] font-extrabold uppercase tracking-[0.2em] text-white/40 sm:text-[10px]">
                    {section.eyebrow}
                  </span>
                  <span className="mt-0.5 block truncate text-lg font-black tracking-tight text-white sm:text-xl">
                    {section.title}
                  </span>
                </span>
                <span className="game-category__count">{section.ids.length} games</span>
                <span className="game-category__chevron" aria-hidden="true">
                  ↓
                </span>
              </summary>

              <div className="game-category__content">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                  {section.ids.map((id) => {
                    const g = GAMES[id];
                    const edition =
                      id === 'platformer3'
                        ? 'V3'
                        : id.endsWith('2')
                          ? 'V2'
                          : id === 'platformer'
                            ? 'Original'
                            : null;
                    const isNewGame = NEW_GAME_IDS.has(id);
                    return (
                      <Link
                        key={g.id}
                        href={`/play/${g.id}`}
                        className="game-card group overflow-hidden"
                        style={{ '--game-accent': g.accent } as React.CSSProperties}
                      >
                        <GameArtwork game={g.id} accent={g.accent} icon={g.icon} />
                        <span className="block p-3.5 sm:p-4">
                          <span className="flex items-center justify-between gap-2">
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-black text-white sm:text-base">
                                {g.name}
                              </span>
                              {edition && (
                                <span className="mt-0.5 block text-[9px] font-black uppercase tracking-[0.14em] text-amber-300">
                                  {edition === 'Original'
                                    ? 'Original edition'
                                    : `${edition} · Original preserved`}
                                </span>
                              )}
                              {isNewGame && (
                                <span className="mt-0.5 block text-[9px] font-black uppercase tracking-[0.14em] text-cyan-200">
                                  New game
                                </span>
                              )}
                            </span>
                            <span className="game-card__play flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] text-white">
                              ▶
                            </span>
                          </span>
                          <span className="mt-1 line-clamp-2 min-h-8 text-xs leading-relaxed text-white/52 sm:text-sm">
                            {g.tagline}
                          </span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </StableGameCategory>
          ))}
        </div>
      </section>

      <section className="mt-14 grid gap-4 lg:grid-cols-[.8fr_1.2fr]">
        <div className="arcade-info-panel p-5">
          <h2 className="text-xl font-black text-white">A deep practice bank</h2>
          <p className="mt-1 text-sm text-white/48">Fresh combinations keep study sessions from feeling repetitive.</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {subjects.map((s, index) => (
              <div key={s} className="practice-stat p-3" data-index={index}>
                <div className="text-xl font-black tabular-nums text-white">{counts[s]}</div>
                <div className="text-[11px] text-white/52">{SUBJECT_LABELS[s]}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="arcade-info-panel p-5">
          <h2 className="text-xl font-black text-white">Practice buys play time</h2>
          <p className="mt-1 text-sm text-white/48">One simple loop keeps learning and play in balance.</p>
          <div className="how-it-works mt-5 grid gap-4 text-sm text-white/64 sm:grid-cols-3">
            <div>
              <span className="how-it-works__number">1</span>
              Answer <strong className="text-white/90">8 questions</strong>.
            </div>
            <div>
              <span className="how-it-works__number">2</span>
              Earn <strong className="text-white/85">6 minutes</strong> of play.
            </div>
            <div>
              <span className="how-it-works__number">3</span>
              Scores and levels add bonus time.
            </div>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-white/30">
            {TOTAL_FAMILIES} question families · {TEMPLATE_COUNT} generate fresh numbers · progress
            stays on this device
          </p>
        </div>
      </section>

      <p className="mt-7 text-center sm:hidden">
        <Link href="/progress" className="text-sm font-bold text-violet-300 hover:underline">
          View progress by subject →
        </Link>
      </p>
    </main>
  );
}
