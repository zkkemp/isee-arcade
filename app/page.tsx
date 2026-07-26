import Link from 'next/link';
import ProfileGate from '@/components/ProfileGate';
import DifficultyPicker from '@/components/DifficultyPicker';
import ProgressStrip from '@/components/ProgressStrip';
import { GAME_LIST } from '@/lib/games';
import { TEMPLATE_COUNT, TOTAL_FAMILIES, countBySubject } from '@/lib/questions';
import { SUBJECT_LABELS, type Subject } from '@/lib/questions/types';

export default function Home() {
  const counts = countBySubject();
  const subjects = Object.keys(counts) as Subject[];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-10 pt-6 sm:max-w-5xl sm:px-8 sm:pt-10">
      <header className="mb-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-white">
          ISEE <span className="text-[#a78bfa]">Arcade</span>
        </h1>
        <p className="mt-1 text-sm text-white/55">
          Real games. Answer a short study block to earn play time, then play - dying is free
          until the clock runs out.
        </p>
      </header>

      <div className="mb-4">
        <ProgressStrip />
      </div>

      <div className="mb-6">
        <ProfileGate />

        <DifficultyPicker />
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
          <li>
            · Answer a study block of <strong className="text-white/80">8 questions</strong> to earn{' '}
            <strong className="text-white/80">6 minutes</strong> of play.
          </li>
          <li>· Inside your play time, dying is free — questions never break up a run.</li>
          <li>· Score points and clear levels to add bonus minutes to the clock.</li>
          <li>
            · About one question in eight is a <strong className="text-white/80">reading passage</strong>.
            Read it carefully — missing it adds 2 more questions to the block.
          </li>
          <li>· 3 wrong in a row adds one more question, so it pays to slow down.</li>
          <li>· Questions rotate between sections — never two long passages back to back.</li>
          <li>· Math builds new numbers every time, so there is nothing to memorize.</li>
        </ul>
        <p className="mt-3 text-xs text-white/35">
          {TOTAL_FAMILIES} ISEE Lower Level question families · {TEMPLATE_COUNT} of them generate
          fresh numbers each time · progress saved on this device
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
