'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Question } from '@/lib/questions/types';
import { SUBJECT_LABELS } from '@/lib/questions/types';

/** Seconds the Continue button stays locked after a wrong answer. */
const EXPLAIN_LOCK_SECONDS = 4;

const LETTERS = ['A', 'B', 'C', 'D'] as const;

const SUBJECT_COLORS: Record<Question['subject'], string> = {
  verbal: '#a78bfa',
  quantitative: '#4ea8ff',
  reading: '#3ddc84',
  math: '#ffb84e',
};

export type QuestionGateProps = {
  question: Question;
  /** Why the gate opened, e.g. "Level 2 clear". */
  label: string;
  /** Points awarded for a correct answer, shown in the reward line. */
  reward: number;
  /** True when a correct answer will hand back a life. */
  grantsLife: boolean;
  onAnswered: (correct: boolean) => void;
};

export default function QuestionGate({
  question,
  label,
  reward,
  grantsLife,
  onAnswered,
}: QuestionGateProps) {
  const [picked, setPicked] = useState<number | null>(null);
  const [lock, setLock] = useState(0);

  const answered = picked !== null;
  const correct = picked === question.answer;
  const accent = SUBJECT_COLORS[question.subject];

  const choose = useCallback(
    (i: number) => {
      if (picked !== null) return;
      setPicked(i);
      // A wrong answer holds the explanation on screen. This is the whole point of
      // the app: you do not get to button-mash past the thing you just missed.
      if (i !== question.answer) setLock(EXPLAIN_LOCK_SECONDS);
    },
    [picked, question.answer],
  );

  useEffect(() => {
    if (lock <= 0) return;
    const t = setTimeout(() => setLock((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [lock]);

  const canContinue = answered && lock <= 0;

  // Keyboard play: 1-4 or A-D to answer, Enter to continue.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!answered) {
        const byNumber = ['1', '2', '3', '4'].indexOf(e.key);
        if (byNumber >= 0) {
          e.preventDefault();
          choose(byNumber);
          return;
        }
        const byLetter = ['a', 'b', 'c', 'd'].indexOf(e.key.toLowerCase());
        if (byLetter >= 0) {
          e.preventDefault();
          choose(byLetter);
        }
        return;
      }
      if (e.key === 'Enter' && canContinue) {
        e.preventDefault();
        onAnswered(correct);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [answered, canContinue, choose, correct, onAnswered]);

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm">
      <div className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#141425] shadow-2xl">
        {/* Header */}
        <div
          className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3"
          style={{ background: `linear-gradient(90deg, ${accent}22, transparent)` }}
        >
          <div className="min-w-0">
            <div
              className="text-[11px] font-bold uppercase tracking-widest"
              style={{ color: accent }}
            >
              {SUBJECT_LABELS[question.subject]}
            </div>
            <div className="truncate text-xs text-white/50">{label}</div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1">
            {[1, 2, 3].map((d) => (
              <span
                key={d}
                title={`Difficulty ${question.difficulty} of 3`}
                className="h-2 w-4 rounded-full"
                style={{
                  background: d <= question.difficulty ? accent : 'rgba(255,255,255,0.15)',
                }}
              />
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {question.passage && (
            <p className="mb-4 whitespace-pre-line rounded-xl border border-white/10 bg-black/30 p-3 text-[15px] leading-relaxed text-white/80">
              {question.passage}
            </p>
          )}

          <p className="mb-4 text-lg font-semibold leading-snug text-white">{question.prompt}</p>

          <div className="grid gap-2">
            {question.choices.map((choice, i) => {
              const isAnswer = i === question.answer;
              const isPicked = i === picked;

              let cls =
                'border-white/15 bg-white/5 text-white/90 active:scale-[0.99] hover:border-white/30 hover:bg-white/10';
              if (answered) {
                if (isAnswer) cls = 'border-emerald-400/70 bg-emerald-400/15 text-emerald-100';
                else if (isPicked) cls = 'border-rose-400/70 bg-rose-400/15 text-rose-100';
                else cls = 'border-white/10 bg-white/[0.02] text-white/35';
              }

              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => choose(i)}
                  disabled={answered}
                  className={`flex items-start gap-3 rounded-xl border px-3 py-3 text-left text-[15px] leading-snug transition ${cls}`}
                >
                  <span className="mt-[1px] flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg border border-current text-xs font-bold opacity-80">
                    {LETTERS[i]}
                  </span>
                  <span className="flex-1">{choice}</span>
                  {answered && isAnswer && <span className="text-sm">✓</span>}
                  {answered && isPicked && !isAnswer && <span className="text-sm">✕</span>}
                </button>
              );
            })}
          </div>

          {answered && (
            <div
              className={`mt-4 rounded-xl border p-3 ${
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
              <p className="text-[15px] leading-relaxed text-white/85">{question.explain}</p>
              {correct && (
                <p className="mt-2 text-xs font-semibold text-emerald-200/90">
                  +{reward} points{grantsLife ? ' and an extra life' : ''}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
          <span className="text-xs text-white/40">
            {answered ? 'Read the explanation, then keep playing.' : 'Answer to keep playing.'}
          </span>
          <button
            type="button"
            onClick={() => onAnswered(correct)}
            disabled={!canContinue}
            className="rounded-xl px-5 py-2.5 text-sm font-bold text-[#101020] transition disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: canContinue ? accent : 'rgba(255,255,255,0.25)' }}
          >
            {!answered ? 'Pick an answer' : lock > 0 ? `Continue in ${lock}` : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
