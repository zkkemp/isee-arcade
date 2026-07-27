import Link from 'next/link';
import TestPrepClient from '@/components/TestPrepClient';

export const metadata = {
  title: 'ISEE Test Prep · ISEE Arcade',
  description: 'Realistic Lower Level ISEE section practice, diagnostics, and essay preparation.',
};

export default function PrepPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-6 sm:px-8 sm:pt-10">
      <header className="mb-7 flex items-start gap-4">
        <Link
          href="/"
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/5 text-lg text-white/70 transition hover:bg-white/10"
          aria-label="Back to arcade"
        >
          ←
        </Link>
        <div>
          <div className="text-[10px] font-black uppercase tracking-[.22em] text-violet-300/70">
            ERB Lower Level blueprint
          </div>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-white sm:text-5xl">
            ISEE Test Prep Center
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/55 sm:text-base">
            Learn through the arcade, then rehearse the real test shape here. Timed sections do not
            reveal answers until the section ends, so learners practice pacing, skipping, returning,
            and reviewing—not just recognizing answers.
          </p>
        </div>
      </header>
      <TestPrepClient />

      <section className="mt-10 rounded-[2rem] border border-white/10 bg-white/[.03] p-5 sm:p-8">
        <div className="text-[10px] font-black uppercase tracking-[.22em] text-sky-300/65">
          What test day feels like
        </div>
        <h2 className="mt-1 text-2xl font-black text-white">Know the rhythm before test day</h2>
        <div className="mt-5 grid gap-2 md:grid-cols-7">
          {[
            ['Verbal', '20 min', '34'],
            ['Quantitative', '35 min', '38'],
            ['Break', '5–10 min', 'reset'],
            ['Reading', '25 min', '25'],
            ['Math', '30 min', '30'],
            ['Break', '5–10 min', 'reset'],
            ['Essay', '30 min', '1 prompt'],
          ].map(([name, time, count], index) => (
            <div
              key={`${name}-${index}`}
              className={`rounded-2xl border p-3 ${
                name === 'Break'
                  ? 'border-emerald-300/15 bg-emerald-300/[.045]'
                  : 'border-white/10 bg-black/15'
              }`}
            >
              <div className="text-xs font-black text-white">{name}</div>
              <div className="mt-1 text-[11px] text-white/45">{time}</div>
              <div className="text-[10px] text-white/30">{count}</div>
            </div>
          ))}
        </div>

        <div className="mt-7 grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl border border-amber-300/15 bg-amber-300/[.04] p-5">
            <h3 className="font-black text-white">The pacing rule to rehearse</h3>
            <ol className="mt-3 space-y-2 text-sm leading-relaxed text-white/60">
              <li><strong className="text-amber-200">1.</strong> Read the whole question before looking for shortcuts.</li>
              <li><strong className="text-amber-200">2.</strong> Answer it in your head first when possible, then inspect the choices.</li>
              <li><strong className="text-amber-200">3.</strong> Eliminate choices that cannot work.</li>
              <li><strong className="text-amber-200">4.</strong> If stuck, move on and return before time ends.</li>
              <li><strong className="text-amber-200">5.</strong> Never leave a final blank: wrong and omitted answers count the same.</li>
            </ol>
          </div>
          <div className="rounded-3xl border border-violet-300/15 bg-violet-300/[.04] p-5">
            <h3 className="font-black text-white">Important differences between sections</h3>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-white/60">
              <li><strong className="text-violet-200">Quantitative:</strong> reason first; many problems need little calculation.</li>
              <li><strong className="text-violet-200">Math Achievement:</strong> computation and math vocabulary matter.</li>
              <li><strong className="text-violet-200">Reading:</strong> return to the passage and prove the answer with text.</li>
              <li><strong className="text-violet-200">Verbal:</strong> use roots, sentence clues, and word tone when a word is unfamiliar.</li>
              <li><strong className="text-violet-200">Essay:</strong> it is not scored, but schools receive the writing sample.</li>
            </ul>
          </div>
        </div>
        <p className="mt-5 text-xs leading-relaxed text-white/35">
          Online and paper tests use the same question counts and timing. Online essays are typed;
          paper essays are handwritten. Test sites provide scratch paper for online testing, while
          paper testers may use blank booklet space.
        </p>
      </section>
    </main>
  );
}
