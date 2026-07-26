'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Question } from '@/lib/questions/types';
import { SUBJECT_LABELS } from '@/lib/questions/types';

/** Seconds the advance button stays locked after a wrong answer. */
const EXPLAIN_LOCK_SECONDS = 3;

/**
 * Seconds the answer buttons stay locked on a reading question before they can
 * be touched. A reading right answer skips the rest of the study block, so this
 * forces the passage to actually be sat with rather than tapped through blind.
 */
const READING_LOCK_SECONDS = 10;

const LETTERS = ['A', 'B', 'C', 'D', 'E'] as const;

const SUBJECT_COLORS: Record<Question['subject'], string> = {
  verbal: '#a78bfa',
  quantitative: '#4ea8ff',
  reading: '#3ddc84',
  math: '#ffb84e',
};

export type QuestionGateProps = {
  question: Question;
  /** Why play stopped, e.g. "You got squashed" or "Bank 2 reached". */
  headline: string;
  /** What happens next, e.g. "Answer one question to get back in." */
  subhead: string;
  reward: number;
  onAnswered: (correct: boolean) => void;
};

/**
 * Takes the whole screen rather than sitting inside the game box: reading
 * passages need the room, and on a phone a modal inside a short canvas is
 * unreadable.
 */
export default function QuestionGate({
  question,
  headline,
  subhead,
  reward,
  onAnswered,
}: QuestionGateProps) {
  const [picked, setPicked] = useState<number | null>(null);
  const [lock, setLock] = useState(0);
  // Reading starts locked; every other kind is answerable immediately.
  const [readLock, setReadLock] = useState(
    question.kind === 'reading' ? READING_LOCK_SECONDS : 0,
  );
  const explainRef = useRef<HTMLDivElement | null>(null);

  const answered = picked !== null;
  const correct = picked === question.answer;
  const accent = SUBJECT_COLORS[question.subject];

  const choose = useCallback(
    (i: number) => {
      // The reading lock has to hold here too, not just disable the buttons, or a
      // keyboard 1-8 press would walk straight past it.
      if (picked !== null || readLock > 0) return;
      setPicked(i);
      // A wrong answer holds the explanation on screen. There is no skipping it,
      // and the next question will be the same kind.
      if (i !== question.answer) setLock(EXPLAIN_LOCK_SECONDS);
    },
    [picked, question.answer, readLock],
  );

  useEffect(() => {
    if (lock <= 0) return;
    const t = setTimeout(() => setLock((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [lock]);

  useEffect(() => {
    if (readLock <= 0) return;
    const t = setTimeout(() => setReadLock((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [readLock]);

  // Bring the explanation into view once answered. After a reading question the
  // passage has pushed it well below the fold, so without this the feedback for
  // the answer you just got wrong is off-screen and simply never read.
  useEffect(() => {
    if (picked === null) return;
    const el = explainRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() =>
      el.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    );
    return () => cancelAnimationFrame(id);
  }, [picked]);

  const canAdvance = answered && lock <= 0;

  // Keyboard play: 1-4 or A-D to answer, Enter to advance.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!answered) {
        const byNumber = ['1', '2', '3', '4', '5'].indexOf(e.key);
        if (byNumber >= 0 && byNumber < question.choices.length) {
          e.preventDefault();
          choose(byNumber);
          return;
        }
        const byLetter = ['a', 'b', 'c', 'd', 'e'].indexOf(e.key.toLowerCase());
        if (byLetter >= 0 && byLetter < question.choices.length) {
          e.preventDefault();
          choose(byLetter);
        }
        return;
      }
      if (e.key === 'Enter' && canAdvance) {
        e.preventDefault();
        onAnswered(correct);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [answered, canAdvance, choose, correct, onAnswered, question.choices.length]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0b0b16]/97 backdrop-blur-md">
      {/* Header */}
      <div
        className="flex-shrink-0 border-b border-white/10 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3"
        style={{ background: `linear-gradient(180deg, ${accent}22, transparent)` }}
      >
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-base font-bold text-white">{headline}</div>
            <div className="truncate text-xs text-white/50">{subhead}</div>
          </div>
          <div className="flex-shrink-0 text-right">
            <div
              className="text-[10px] font-bold uppercase tracking-widest"
              style={{ color: accent }}
            >
              {SUBJECT_LABELS[question.subject]}
            </div>
            <div className="mt-1 flex justify-end gap-1">
              {[1, 2, 3].map((d) => (
                <span
                  key={d}
                  className="h-1.5 w-4 rounded-full"
                  style={{
                    background: d <= question.difficulty ? accent : 'rgba(255,255,255,0.18)',
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto w-full max-w-2xl">
          {question.passage && (
            <p className="mb-4 whitespace-pre-line rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-[16px] leading-relaxed text-white/80">
              {question.passage}
            </p>
          )}

          <p className="mb-4 text-xl font-semibold leading-snug text-white">{question.prompt}</p>

          {readLock > 0 && (
            <div
              className="mb-3 flex items-center gap-3 rounded-2xl border border-white/15 bg-white/[0.05] px-4 py-3"
              role="status"
            >
              <span
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-[#101020]"
                style={{ background: accent }}
              >
                {readLock}
              </span>
              <span className="text-sm text-white/70">
                Take a moment to read. Answers unlock in {readLock} second
                {readLock === 1 ? '' : 's'}.
              </span>
            </div>
          )}

          <div className="grid gap-2.5">
            {question.choices.map((choice, i) => {
              const isAnswer = i === question.answer;
              const isPicked = i === picked;

              let cls =
                'border-white/15 bg-white/[0.06] text-white/90 active:scale-[0.99] hover:border-white/30 hover:bg-white/[0.1]';
              if (answered) {
                if (isAnswer) cls = 'border-emerald-400/70 bg-emerald-400/15 text-emerald-100';
                else if (isPicked) cls = 'border-rose-400/70 bg-rose-400/15 text-rose-100';
                else cls = 'border-white/10 bg-white/[0.02] text-white/35';
              } else if (readLock > 0) {
                // Dimmed and untouchable until the reading timer runs out.
                cls = 'border-white/10 bg-white/[0.02] text-white/40';
              }

              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => choose(i)}
                  disabled={answered || readLock > 0}
                  className={`flex items-start gap-3 rounded-2xl border px-4 py-4 text-left text-[17px] leading-snug transition disabled:cursor-not-allowed ${cls}`}
                >
                  <span className="mt-[2px] flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-xl border border-current text-xs font-bold opacity-75">
                    {LETTERS[i]}
                  </span>
                  <span className="flex-1">{choice}</span>
                  {answered && isAnswer && <span className="text-base">✓</span>}
                  {answered && isPicked && !isAnswer && <span className="text-base">✕</span>}
                </button>
              );
            })}
          </div>

          {answered && (
            <div
              ref={explainRef}
              className={`mt-4 rounded-2xl border p-4 ${
                correct
                  ? 'border-emerald-400/40 bg-emerald-400/10'
                  : 'border-amber-400/40 bg-amber-400/10'
              }`}
            >
              <div
                className={`mb-1 text-sm font-bold ${
                  correct ? 'text-emerald-300' : 'text-amber-300'
                }`}
              >
                {correct ? 'Correct!' : 'Not quite — here is why'}
              </div>
              <p className="text-[16px] leading-relaxed text-white/85">{question.explain}</p>
              {correct ? (
                <p className="mt-2 text-xs font-semibold text-emerald-200/90">+{reward} points</p>
              ) : (
                <p className="mt-2 text-xs font-semibold text-amber-200/90">
                  You will get another one like this.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 border-t border-white/10 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-2xl">
          <button
            type="button"
            onClick={() => onAnswered(correct)}
            disabled={!canAdvance}
            className="w-full rounded-2xl px-5 py-4 text-base font-bold text-[#101020] transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: canAdvance ? accent : 'rgba(255,255,255,0.22)' }}
          >
            {!answered
              ? readLock > 0
                ? `Read the passage… ${readLock}`
                : 'Pick an answer'
              : lock > 0
                ? `Read the explanation… ${lock}`
                : correct
                  ? 'Keep playing'
                  : 'Next question'}
          </button>
        </div>
      </div>
    </div>
  );
}
