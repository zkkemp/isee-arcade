import Link from 'next/link';
import ProfileGate from '@/components/ProfileGate';
import DifficultyPicker from '@/components/DifficultyPicker';
import ProgressStrip from '@/components/ProgressStrip';
import GameArtwork from '@/components/GameArtwork';
import { GAMES, type GameId } from '@/lib/games';
import { TEMPLATE_COUNT, TOTAL_FAMILIES, countBySubject } from '@/lib/questions';
import { SUBJECT_LABELS, type Subject } from '@/lib/questions/types';

const GAME_SECTIONS: Array<{ eyebrow: string; title: string; ids: GameId[] }> = [
  {
    eyebrow: 'Brand-new adventures',
    title: 'Fresh from the workshop',
    ids: ['skystack', 'starfall', 'firefly'],
  },
  {
    eyebrow: 'Run · jump · dodge',
    title: 'Fast & fearless',
    ids: ['platformer2', 'platformer', 'snake2', 'snake', 'runner', 'frogger', 'climber', 'breakout'],
  },
  {
    eyebrow: 'Match · stack · solve',
    title: 'Puzzle power',
    ids: ['match3', 'blocks', 'tetris', 'merge', 'bubble', 'memory'],
  },
  {
    eyebrow: 'Plan · challenge · win',
    title: 'Tabletop legends',
    ids: ['chess', 'checkers', 'tictactoe', 'dots', 'sudoku', 'cards'],
  },
  {
    eyebrow: 'Remember · react · discover',
    title: 'Quick thinkers',
    ids: ['maze', 'echo', 'fruit2', 'fruit', 'tapattack2', 'tapattack', 'wordhunt', 'spelling'],
  },
];

export default function Home() {
  const counts = countBySubject();
  const subjects = Object.keys(counts) as Subject[];
  const featured = GAMES.platformer2;

  return (
    <main className="arcade-home mx-auto w-full max-w-6xl px-4 pb-14 pt-5 sm:px-8 sm:pt-9">
      <header className="arcade-masthead mb-5 sm:mb-7">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-violet-300/10 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.22em] text-violet-200/85">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-300 shadow-[0_0_12px_#fde68a]" />
            Study. Play. Level up.
          </div>
          <h1 className="arcade-logo text-4xl font-black tracking-[-0.055em] text-white sm:text-6xl">
            ISEE <span>Arcade</span>
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/60 sm:text-base">
            Big adventures powered by a little practice. Finish a short study block, then spend
            your earned play time anywhere in the arcade.
          </p>
        </div>
        <Link
          href="/progress"
          className="hidden rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-3 text-sm font-bold text-white/75 shadow-lg transition hover:-translate-y-0.5 hover:border-violet-300/35 hover:bg-white/[0.09] sm:block"
        >
          View progress <span className="ml-1 text-violet-300">↗</span>
        </Link>
      </header>

      <div className="mb-4">
        <ProgressStrip />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
        <ProfileGate />
        <div className="self-start">
          <DifficultyPicker />
        </div>
      </div>

      <Link
        href={`/play/${featured.id}`}
        className="featured-game group mb-10 grid overflow-hidden rounded-[1.75rem] border border-amber-200/20 bg-[#17152b] shadow-2xl transition hover:-translate-y-1 hover:border-amber-200/40 md:grid-cols-[1.05fr_.95fr]"
      >
        <GameArtwork
          game={featured.id}
          accent={featured.accent}
          icon={featured.icon}
          featured
        />
        <span className="relative flex flex-col justify-center p-6 sm:p-8">
          <span className="mb-3 text-[10px] font-black uppercase tracking-[0.24em] text-amber-300">
            Featured adventure
          </span>
          <span className="text-3xl font-black tracking-tight text-white sm:text-4xl">
            {featured.name}
          </span>
          <span className="mt-2 max-w-md text-sm leading-relaxed text-white/60 sm:text-base">
            A separate storybook remaster with richer worlds, warmer light and your own family
            hero. The original Coin Runner is still here too.
          </span>
          <span className="mt-6 inline-flex w-fit items-center gap-2 rounded-full bg-amber-300 px-5 py-2.5 text-sm font-black text-[#21152b] shadow-[0_10px_30px_rgba(251,191,36,.25)] transition group-hover:gap-3">
            Start the adventure <span>→</span>
          </span>
        </span>
      </Link>

      <div className="space-y-10">
        {GAME_SECTIONS.map((section) => (
          <section key={section.title}>
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-violet-300/70">
                  {section.eyebrow}
                </div>
                <h2 className="mt-1 text-xl font-black tracking-tight text-white sm:text-2xl">
                  {section.title}
                </h2>
              </div>
              <span className="text-xs font-semibold text-white/30">{section.ids.length} games</span>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {section.ids.map((id) => {
                const g = GAMES[id];
                const isNewEdition = id.endsWith('2');
                const isNewGame = id === 'skystack' || id === 'starfall' || id === 'firefly';
                return (
                  <Link
                    key={g.id}
                    href={`/play/${g.id}`}
                    className="game-card group overflow-hidden rounded-3xl border border-white/10 bg-white/[0.045] shadow-lg transition hover:-translate-y-1 hover:border-white/25 hover:bg-white/[0.075]"
                    style={{ '--game-accent': g.accent } as React.CSSProperties}
                  >
                    <GameArtwork game={g.id} accent={g.accent} icon={g.icon} />
                    <span className="block p-3.5 sm:p-4">
                      <span className="flex items-center justify-between gap-2">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-extrabold text-white sm:text-base">
                            {g.name}
                          </span>
                          {isNewEdition && (
                            <span className="mt-0.5 block text-[9px] font-black uppercase tracking-[0.18em] text-amber-300">
                              V2 · Original preserved
                            </span>
                          )}
                          {isNewGame && (
                            <span className="mt-0.5 block text-[9px] font-black uppercase tracking-[0.18em] text-cyan-300">
                              New game
                            </span>
                          )}
                        </span>
                        <span className="game-card__play flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] text-white">
                          ▶
                        </span>
                      </span>
                      <span className="mt-1 line-clamp-2 min-h-8 text-xs leading-relaxed text-white/45 sm:text-sm">
                        {g.tagline}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <section className="mt-12 grid gap-4 lg:grid-cols-[.8fr_1.2fr]">
        <div className="rounded-3xl border border-violet-300/15 bg-violet-300/[0.055] p-5">
          <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-violet-300/70">
            Practice bank
          </div>
          <h2 className="mt-1 text-xl font-black text-white">Always something fresh</h2>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {subjects.map((s) => (
              <div key={s} className="rounded-2xl border border-white/8 bg-black/15 p-3">
                <div className="text-xl font-black text-white">{counts[s]}</div>
                <div className="text-[11px] text-white/45">{SUBJECT_LABELS[s]}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
          <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-amber-300/70">
            How it works
          </div>
          <h2 className="mt-1 text-xl font-black text-white">Practice buys play time</h2>
          <div className="mt-4 grid gap-3 text-sm text-white/60 sm:grid-cols-3">
            <div className="rounded-2xl bg-black/15 p-3">
              <span className="mb-2 block text-2xl">✦</span>
              Answer <strong className="text-white/85">8 questions</strong>.
            </div>
            <div className="rounded-2xl bg-black/15 p-3">
              <span className="mb-2 block text-2xl">⏱</span>
              Earn <strong className="text-white/85">6 minutes</strong> of play.
            </div>
            <div className="rounded-2xl bg-black/15 p-3">
              <span className="mb-2 block text-2xl">★</span>
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
