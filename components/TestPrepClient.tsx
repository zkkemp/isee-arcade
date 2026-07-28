'use client';

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { ScratchPaper, shouldOfferScratch } from '@/components/QuestionGate';
import { useDailyLimit } from '@/components/DailyLimitProvider';
import {
  buildPracticeSection,
  essayPrompt,
  formatPracticeTime,
  ISEE_LEVEL_LABELS,
  ISEE_SECTIONS_BY_LEVEL,
  sectionById,
  type IseeLevel,
  type PracticeSectionId,
} from '@/lib/iseePractice';
import { loadProgress, recordAnswer, saveProgress } from '@/lib/progress';
import type { Question, Subject } from '@/lib/questions';
import { useParentContentState } from '@/lib/parentControls';
import { useActiveProfile } from '@/lib/profiles';

const LETTERS = ['A', 'B', 'C', 'D', 'E'];
const QUICK_COUNTS: Record<Subject, number> = {
  verbal: 12,
  quantitative: 12,
  reading: 10,
  math: 12,
};

type SectionResult = {
  level: IseeLevel;
  section: Subject;
  questions: Question[];
  answers: Array<number | null>;
  correct: number;
  plan: Subject[];
  quick: boolean;
};

type ActiveRun = {
  level: IseeLevel;
  section: Subject;
  questions: Question[];
  answers: Array<number | null>;
  index: number;
  remaining: number;
  fullMinutes: number;
  plan: Subject[];
  label: string;
  quick: boolean;
};

function scoreRun(run: ActiveRun): number {
  return run.questions.reduce(
    (score, question, index) => score + (run.answers[index] === question.answer ? 1 : 0),
    0,
  );
}

function sectionColor(section: PracticeSectionId): string {
  return {
    verbal: '#a78bfa',
    quantitative: '#38bdf8',
    reading: '#34d399',
    math: '#fbbf24',
    essay: '#fb7185',
  }[section];
}

export default function TestPrepClient() {
  const { deferLock } = useDailyLimit();
  const activeProfile = useActiveProfile();
  const parentContent = useParentContentState();
  const excludedContentKeys = useMemo(
    () =>
      parentContent.disabled
        .filter(
          (item) => item.learnerId === null || item.learnerId === activeProfile?.id,
        )
        .map((item) => item.contentKey),
    [activeProfile?.id, parentContent.disabled],
  );
  const [level, setLevel] = useState<IseeLevel>('lower');
  const [active, setActive] = useState<ActiveRun | null>(null);
  const [sessionSeed] = useState(() => Date.now());
  const [result, setResult] = useState<SectionResult | null>(null);
  const [fullResults, setFullResults] = useState<SectionResult[]>([]);
  const [essay, setEssay] = useState<{ prompt: string; remaining: number; text: string } | null>(null);
  const hasActivePrep = Boolean(active || essay);

  useEffect(() => {
    deferLock(hasActivePrep);
    return () => deferLock(false);
  }, [deferLock, hasActivePrep]);

  function makeRun(
    section: Subject,
    plan: Subject[],
    quick = false,
    runLevel: IseeLevel = level,
  ): ActiveRun {
    const definition = sectionById(section, runLevel);
    const count = quick ? QUICK_COUNTS[section] : definition.questions;
    const minutes = quick
      ? Math.max(6, Math.ceil((definition.minutes * count) / definition.questions))
      : definition.minutes;
    const questions = buildPracticeSection(
      section,
      sessionSeed + section.length * 997 + fullResults.length * 7919,
      count,
      runLevel,
      excludedContentKeys,
    );
    return {
      level: runLevel,
      section,
      questions,
      answers: Array.from({ length: questions.length }, () => null),
      index: 0,
      remaining: minutes * 60,
      fullMinutes: minutes,
      plan,
      label: quick ? 'Quick diagnostic' : plan.length > 0 ? 'Full practice test' : 'Section practice',
      quick,
    };
  }

  function beginSection(section: Subject) {
    setResult(null);
    setFullResults([]);
    setEssay(null);
    setActive(makeRun(section, []));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function beginDiagnostic() {
    setResult(null);
    setFullResults([]);
    setEssay(null);
    setActive(makeRun('verbal', ['quantitative', 'reading', 'math'], true));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function beginFullTest() {
    setResult(null);
    setFullResults([]);
    setEssay(null);
    setActive(makeRun('verbal', ['quantitative', 'reading', 'math']));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function finishSection(run: ActiveRun) {
    const completed: SectionResult = {
      level: run.level,
      section: run.section,
      questions: run.questions,
      answers: run.answers,
      correct: scoreRun(run),
      plan: run.plan,
      quick: run.quick,
    };
    let progress = loadProgress();
    run.questions.forEach((question, index) => {
      const picked = run.answers[index];
      if (picked === null) return;
      progress = recordAnswer(progress, {
        id: question.id,
        subject: question.subject,
        correct: picked === question.answer,
        vocabulary: question.kind === 'synonym',
      });
    });
    saveProgress(progress);
    setFullResults((previous) => [...previous, completed]);
    setResult(completed);
    setActive(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      setActive((current) => {
        if (!current) return current;
        if (current.remaining <= 1) {
          window.clearInterval(timer);
          window.setTimeout(() => finishSection({ ...current, remaining: 0 }), 0);
          return null;
        }
        return { ...current, remaining: current.remaining - 1 };
      });
    }, 1000);
    return () => window.clearInterval(timer);
    // A new section gets a new timer. Updating the answer or index must not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.section, active?.fullMinutes]);

  const allResults = useMemo(
    () =>
      result && !fullResults.some((candidate) => candidate === result)
        ? [...fullResults, result]
        : fullResults,
    [fullResults, result],
  );

  if (essay) {
    return (
      <EssayPractice
        essay={essay}
        setEssay={setEssay}
        onExit={() => setEssay(null)}
      />
    );
  }

  if (active) {
    const question = active.questions[active.index];
    const picked = active.answers[active.index];
    const answeredCount = active.answers.filter((answer) => answer !== null).length;
    const definition = sectionById(active.section, active.level);
    return (
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#141426] shadow-2xl">
        <div className="sticky top-0 z-20 border-b border-white/10 bg-[#141426]/95 p-4 backdrop-blur sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
                {active.label}
              </div>
              <h2 className="text-xl font-black text-white">{definition.name}</h2>
            </div>
            <div
              className={`rounded-2xl border px-4 py-2 text-lg font-black tabular-nums ${
                active.remaining <= 120
                  ? 'border-rose-400/40 bg-rose-400/10 text-rose-200'
                  : 'border-white/15 bg-black/20 text-white'
              }`}
              aria-label={`${formatPracticeTime(active.remaining)} remaining`}
            >
              {formatPracticeTime(active.remaining)}
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-white/45">
            <span>Question {active.index + 1} of {active.questions.length}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${((active.index + 1) / active.questions.length) * 100}%`,
                  background: sectionColor(active.section),
                }}
              />
            </div>
            <span>{answeredCount} answered</span>
          </div>
        </div>

        <div className="p-4 sm:p-7">
          {question.passage && (
            <article className="mb-5 max-h-[42vh] overflow-y-auto rounded-3xl border border-emerald-300/20 bg-[#f8fbf5] p-5 text-[17px] leading-8 text-slate-800 shadow-inner sm:p-7 sm:text-lg">
              {question.passage}
            </article>
          )}

          <div
            className="mb-2 text-[10px] font-black uppercase tracking-[0.18em]"
            style={{ color: sectionColor(active.section) }}
          >
            {question.topic ?? definition.shortName}
          </div>
          <h3 className="mb-5 text-xl font-black leading-relaxed text-white sm:text-2xl">
            {question.prompt}
          </h3>

          <div className="grid gap-3">
            {question.choices.map((choice, index) => (
              <button
                key={`${question.id}-${index}`}
                type="button"
                onClick={() =>
                  setActive((current) => {
                    if (!current) return current;
                    const answers = [...current.answers];
                    answers[current.index] = index;
                    return { ...current, answers };
                  })
                }
                className={`flex min-h-16 items-center gap-3 rounded-2xl border px-4 py-3 text-left text-base font-bold transition active:scale-[.99] sm:text-lg ${
                  picked === index
                    ? 'border-sky-300/60 bg-sky-300/15 text-white'
                    : 'border-white/12 bg-white/[.045] text-white/80 hover:border-white/25 hover:bg-white/[.08]'
                }`}
              >
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-current text-sm font-black">
                  {LETTERS[index]}
                </span>
                {choice}
              </button>
            ))}
          </div>

          {shouldOfferScratch(question) && <ScratchPaper key={question.id} />}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setActive((current) => current && { ...current, index: Math.max(0, current.index - 1) })}
              disabled={active.index === 0}
              className="rounded-2xl border border-white/15 px-4 py-3 font-bold text-white/70 disabled:opacity-30"
            >
              ← Previous
            </button>
            <div className="flex gap-2">
              {active.index < active.questions.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setActive((current) => current && { ...current, index: current.index + 1 })}
                  className="rounded-2xl bg-white px-5 py-3 font-black text-[#17172b]"
                >
                  {picked === null ? 'Skip for now' : 'Next'} →
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => finishSection(active)}
                  className="rounded-2xl bg-emerald-300 px-5 py-3 font-black text-[#10251d]"
                >
                  Finish section
                </button>
              )}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-1.5" aria-label="Question navigator">
            {active.questions.map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => setActive((current) => current && { ...current, index })}
                aria-label={`Go to question ${index + 1}`}
                className={`h-8 min-w-8 rounded-lg border text-xs font-black ${
                  index === active.index
                    ? 'border-white bg-white text-[#17172b]'
                    : active.answers[index] !== null
                      ? 'border-emerald-300/35 bg-emerald-300/12 text-emerald-200'
                      : 'border-white/10 bg-white/[.03] text-white/35'
                }`}
              >
                {index + 1}
              </button>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (result) {
    const definition = sectionById(result.section, result.level);
    const pct = Math.round((result.correct / result.questions.length) * 100);
    const nextSection = result.plan[0];
    return (
      <section className="rounded-[2rem] border border-white/10 bg-white/[.04] p-5 sm:p-8">
        <div className="text-[10px] font-black uppercase tracking-[.2em] text-emerald-300/70">
          Section complete
        </div>
        <h2 className="mt-1 text-3xl font-black text-white">{definition.name}</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <ResultStat label="Correct" value={`${result.correct}/${result.questions.length}`} />
          <ResultStat label="Practice accuracy" value={`${pct}%`} />
          <ResultStat label="Unanswered" value={String(result.answers.filter((answer) => answer === null).length)} />
        </div>
        <p className="mt-4 text-sm leading-relaxed text-white/55">
          This is a practice percentage, not an ISEE scaled score or stanine. Review the reasoning
          below; the real score report compares performance with other students in the same grade.
        </p>

        <div className="mt-7 space-y-3">
          {result.questions.map((question, index) => {
            const picked = result.answers[index];
            const correct = picked === question.answer;
            return (
              <details
                key={`${question.id}-${index}`}
                className={`rounded-2xl border p-4 ${
                  correct
                    ? 'border-emerald-300/15 bg-emerald-300/[.035]'
                    : 'border-amber-300/25 bg-amber-300/[.055]'
                }`}
              >
                <summary className="cursor-pointer list-none font-bold text-white/90">
                  <span className={correct ? 'text-emerald-300' : 'text-amber-300'}>
                    {correct ? '✓' : 'Review'}
                  </span>{' '}
                  {index + 1}. {question.prompt}
                </summary>
                <div className="mt-3 border-t border-white/10 pt-3 text-sm leading-relaxed text-white/65">
                  <p><strong className="text-white">Correct answer:</strong> {question.choices[question.answer]}</p>
                  {picked !== null && !correct && (
                    <p className="mt-1"><strong className="text-white">Your answer:</strong> {question.choices[picked]}</p>
                  )}
                  {picked === null && <p className="mt-1 text-amber-200">This one was unanswered.</p>}
                  <p className="mt-2 whitespace-pre-line text-white/80">{question.explain}</p>
                </div>
              </details>
            );
          })}
        </div>

        <div className="mt-7 flex flex-wrap gap-3">
          {nextSection && (
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setActive(
                  makeRun(nextSection, result.plan.slice(1), result.quick, result.level),
                );
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="rounded-2xl bg-emerald-300 px-5 py-3 font-black text-[#10251d]"
            >
              Continue to {sectionById(nextSection, result.level).shortName} →
            </button>
          )}
          {!nextSection && !result.quick && fullResults.length === 4 && (
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setEssay({ prompt: essayPrompt(), remaining: 30 * 60, text: '' });
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="rounded-2xl bg-rose-300 px-5 py-3 font-black text-[#311722]"
            >
              Finish with the 30-minute Essay →
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setResult(null);
              setFullResults([]);
            }}
            className="rounded-2xl border border-white/15 px-5 py-3 font-bold text-white/75"
          >
            Back to prep center
          </button>
        </div>
        {allResults.length > 1 && (
          <p className="mt-4 text-xs text-white/35">
            Full practice progress: {allResults.length} of 4 scored sections completed.
          </p>
        )}
      </section>
    );
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] border border-cyan-200/15 bg-cyan-200/[.035] p-4 sm:p-5">
        <div className="text-[10px] font-black uppercase tracking-[.2em] text-cyan-200/65">
          Choose the exam
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3" role="group" aria-label="ISEE level">
          {(['lower', 'middle', 'upper'] as IseeLevel[]).map((candidate) => (
            <button
              key={candidate}
              type="button"
              aria-pressed={level === candidate}
              onClick={() => {
                setLevel(candidate);
                setResult(null);
                setFullResults([]);
              }}
              className={`rounded-2xl border px-4 py-3 text-left transition ${
                level === candidate
                  ? 'border-cyan-200/55 bg-cyan-200/12'
                  : 'border-white/10 bg-black/15 hover:border-white/25'
              }`}
            >
              <span className="block text-sm font-black capitalize text-white">{candidate} Level</span>
              <span className="mt-1 block text-[11px] leading-relaxed text-white/48">
                {candidate === 'lower'
                  ? 'Applying to Fifth or Sixth Grade'
                  : candidate === 'middle'
                    ? 'Applying to Seventh or Eighth Grade'
                    : 'Applying to Ninth through Twelfth Grade'}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs font-bold text-cyan-100/65">{ISEE_LEVEL_LABELS[level]}</p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <button
          type="button"
          onClick={beginFullTest}
          className="group rounded-[2rem] border border-violet-300/25 bg-gradient-to-br from-violet-400/15 to-sky-400/5 p-6 text-left shadow-xl transition hover:-translate-y-1 hover:border-violet-300/45"
        >
          <span className="text-[10px] font-black uppercase tracking-[.22em] text-violet-200/70">
            Most realistic
          </span>
          <span className="mt-1 block text-2xl font-black capitalize text-white">
            Full {level} Level practice
          </span>
          <span className="mt-2 block text-sm leading-relaxed text-white/55">
            All four scored sections in official order and at official time limits, with a review
            after each section. Add the Essay Lab afterward for the complete{' '}
            {level === 'lower' ? '2-hour-20-minute' : '2-hour-40-minute'} format.
          </span>
          <span className="mt-5 inline-flex rounded-full bg-violet-300 px-4 py-2 text-sm font-black text-[#1d1730]">
            Begin Verbal Reasoning →
          </span>
        </button>

        <button
          type="button"
          onClick={beginDiagnostic}
          className="group rounded-[2rem] border border-sky-300/20 bg-gradient-to-br from-sky-400/12 to-emerald-400/5 p-6 text-left shadow-xl transition hover:-translate-y-1 hover:border-sky-300/40"
        >
          <span className="text-[10px] font-black uppercase tracking-[.22em] text-sky-200/70">
            Find the gaps
          </span>
          <span className="mt-1 block text-2xl font-black text-white">Quick four-section diagnostic</span>
          <span className="mt-2 block text-sm leading-relaxed text-white/55">
            A shorter, timed tour through every scored section. Use the review to decide which full
            sections deserve the most practice next.
          </span>
          <span className="mt-5 inline-flex rounded-full bg-sky-300 px-4 py-2 text-sm font-black text-[#102434]">
            Start diagnostic →
          </span>
        </button>
      </section>

      <section>
        <div className="mb-4">
          <div className="text-[10px] font-black uppercase tracking-[.22em] text-white/35">
            Official {level} Level blueprint
          </div>
          <h2 className="mt-1 text-2xl font-black text-white">Practice one complete section</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {ISEE_SECTIONS_BY_LEVEL[level]
            .filter((section) => section.id !== 'essay')
            .map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => beginSection(section.id as Subject)}
                className="rounded-3xl border border-white/10 bg-white/[.035] p-5 text-left transition hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[.06]"
              >
                <span
                  className="text-[10px] font-black uppercase tracking-[.18em]"
                  style={{ color: sectionColor(section.id) }}
                >
                  {section.questions} questions · {section.minutes} minutes
                </span>
                <span className="mt-1 block text-xl font-black text-white">{section.name}</span>
                <span className="mt-2 block text-sm leading-relaxed text-white/50">
                  {section.description}
                </span>
                <span className="mt-4 flex flex-wrap gap-1.5">
                  {section.skills.map((skill) => (
                    <span
                      key={skill}
                      className="rounded-full border border-white/10 bg-black/15 px-2.5 py-1 text-[10px] font-bold text-white/50"
                    >
                      {skill}
                    </span>
                  ))}
                </span>
              </button>
            ))}
        </div>
      </section>

      <section className="rounded-[2rem] border border-rose-300/20 bg-rose-300/[.05] p-5 sm:p-6">
        <div className="text-[10px] font-black uppercase tracking-[.2em] text-rose-200/70">
          30-minute writing practice
        </div>
        <h2 className="mt-1 text-2xl font-black text-white">Essay Lab</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/55">
          Practice planning, writing specific details, and leaving time to revise. The essay is not
          scored, but schools receive it as a writing sample.
        </p>
        <button
          type="button"
          onClick={() => setEssay({ prompt: essayPrompt(), remaining: 30 * 60, text: '' })}
          className="mt-4 rounded-2xl bg-rose-300 px-5 py-3 font-black text-[#311722]"
        >
          Get a fresh prompt →
        </button>
      </section>
    </div>
  );
}

function ResultStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/15 p-4 text-center">
      <div className="text-2xl font-black text-white">{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-white/35">{label}</div>
    </div>
  );
}

function EssayPractice({
  essay,
  setEssay,
  onExit,
}: {
  essay: { prompt: string; remaining: number; text: string };
  setEssay: Dispatch<SetStateAction<{ prompt: string; remaining: number; text: string } | null>>;
  onExit: () => void;
}) {
  useEffect(() => {
    if (essay.remaining <= 0) return;
    const timer = window.setInterval(
      () =>
        setEssay((current) =>
          current ? { ...current, remaining: Math.max(0, current.remaining - 1) } : current,
        ),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [essay.remaining, setEssay]);

  return (
    <section className="rounded-[2rem] border border-rose-300/20 bg-[#171425] p-5 sm:p-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[.2em] text-rose-200/70">Essay Lab</div>
          <h2 className="text-2xl font-black text-white">Write in your own voice</h2>
        </div>
        <div className="rounded-2xl border border-white/15 bg-black/20 px-4 py-2 text-lg font-black tabular-nums text-white">
          {formatPracticeTime(essay.remaining)}
        </div>
      </div>
      <div className="mt-5 rounded-3xl bg-[#fffdf4] p-5 text-lg font-black leading-relaxed text-slate-800 sm:p-7 sm:text-xl">
        {essay.prompt}
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-5">
        {['Plan first', 'Clear beginning', 'Specific details', 'Paragraphs', 'Review ending'].map((step, index) => (
          <div key={step} className="rounded-xl border border-white/10 bg-white/[.04] px-3 py-2 text-xs font-bold text-white/60">
            <span className="mr-1 text-rose-300">{index + 1}.</span> {step}
          </div>
        ))}
      </div>
      <textarea
        value={essay.text}
        onChange={(event) => setEssay((current) => current && { ...current, text: event.target.value })}
        placeholder="Use this space to practice typing, or write on lined paper to match a paper test…"
        className="mt-4 min-h-[45vh] w-full rounded-3xl border border-white/15 bg-white px-5 py-4 text-lg leading-8 text-slate-900 outline-none focus:border-rose-300"
      />
      <div className="mt-4 flex flex-wrap justify-between gap-3">
        <span className="text-xs text-white/35">{essay.text.trim() ? essay.text.trim().split(/\s+/).length : 0} words</span>
        <button type="button" onClick={onExit} className="rounded-2xl bg-rose-300 px-5 py-3 font-black text-[#311722]">
          Finish essay practice
        </button>
      </div>
    </section>
  );
}
