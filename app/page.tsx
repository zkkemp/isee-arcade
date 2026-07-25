import Link from 'next/link';
import ProgressStrip from '@/components/ProgressStrip';
import { GAME_LIST } from '@/lib/games';
import { ALL_QUESTIONS, countBySubject } from '@/lib/questions';
import { SUBJECT_LABELS, type Subject } from '@/lib/questions/types';

export default function Home() {
  const counts = countBySubject();
  const subjects = Object.keys(counts) as Subject[];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-10 pt-6">
      <header className="mb-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-white">
          ISEE <span className="text-[#a78bfa]">Arcade</span>
        </h1>
        <p className="mt-1 text-sm text-white/55">
          Real games that pause to quiz you. Get it right, earn points and a life.
        </p>
      </header>

      <div className="mb-6">
        <ProgressStrip />
      </div>

      <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-white/40">
        Pick a game
      </h2>

      <div className="mb-8 grid gap-3">
        {GAME_LIST.map((g) => (
          <Link
            key={g.id}
            href={`/play/${g.id}`}
            className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition hover:border-white/25 hover:bg-white/[0.08]"
          >
            <span
              className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl text-3xl"
              style={{ background: `${g.accent}1f`, border: `1px solid ${g.accent}44` }}
            >
              {g.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold text-white">{g.name}</span>
              <span className="block text-sm text-white/55">{g.tagline}</span>
              <span className="mt-1 block text-xs" style={{ color: g.accent }}>
                {g.gateNote}
              </span>
            </span>
            <span className="flex-shrink-0 text-white/30 transition group-hover:text-white/60">
              ▶
            </span>
          </Link>
        ))}
      </div>

      <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-white/40">
        What is in the question bank
      </h2>
      <div className="mb-8 grid grid-cols-2 gap-3">
        {subjects.map((s) => (
          <div key={s} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <div className="text-lg font-bold text-white">{counts[s]}</div>
            <div className="text-xs text-white/50">{SUBJECT_LABELS[s]}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <h3 className="mb-2 text-sm font-bold text-white">How it works</h3>
        <ul className="space-y-1.5 text-sm text-white/60">
          <li>· Play normally. Every so often the game freezes for one question.</li>
          <li>· Answer correctly for +50 points and an extra life.</li>
          <li>· Miss one and the explanation stays up for a few seconds. No skipping it.</li>
          <li>· Lose your last life and one right answer buys you back in.</li>
          <li>· Missed questions come back later until they stick.</li>
        </ul>
        <p className="mt-3 text-xs text-white/35">
          {ALL_QUESTIONS.length} ISEE Lower Level questions · progress saved on this device
        </p>
      </div>

      <p className="mt-6 text-center">
        <Link href="/progress" className="text-sm font-semibold text-[#a78bfa] hover:underline">
          View progress by subject
        </Link>
      </p>
    </main>
  );
}
