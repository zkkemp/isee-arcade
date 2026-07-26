'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Question } from '@/lib/questions/types';
import { SUBJECT_LABELS } from '@/lib/questions/types';
import { questionSpeech, speak, speechAvailable, stopSpeaking, toSpeakable } from '@/lib/speech';

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

const SUBJECT_ICONS: Record<Question['subject'], string> = {
  verbal: '💬',
  quantitative: '🔢',
  reading: '📚',
  math: '✦',
};

/** A no-reading-required number picture for the youngest learners. */
function NumberPicture({ choice }: { choice: string }) {
  const number = Number(choice.trim());
  if (!Number.isInteger(number) || number < 0 || number > 10) return null;
  if (number === 0) {
    return (
      <span
        aria-hidden="true"
        className="rounded-full border border-current px-2 py-0.5 text-[10px] font-black uppercase opacity-55"
      >
        none
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="grid w-9 grid-cols-5 place-items-center gap-0.5 opacity-80"
    >
      {Array.from({ length: number }, (_, dot) => (
        <span key={dot} className="h-1.5 w-1.5 rounded-full bg-current" />
      ))}
    </span>
  );
}

export type QuestionGateProps = {
  question: Question;
  /** Why play stopped, e.g. "You got squashed" or "Bank 2 reached". */
  headline: string;
  /** What happens next, e.g. "Answer one question to get back in." */
  subhead: string;
  reward: number;
  /** Show optional listening helpers for pre-reading kids (K / 1st grade). */
  narrate?: boolean;
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
  narrate = false,
  onAnswered,
}: QuestionGateProps) {
  const [picked, setPicked] = useState<number | null>(null);
  const [lock, setLock] = useState(0);
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  // Reading starts locked; every other kind is answerable immediately.
  const [readLock, setReadLock] = useState(
    question.kind === 'reading' ? READING_LOCK_SECONDS : 0,
  );
  const explainRef = useRef<HTMLDivElement | null>(null);

  const answered = picked !== null;
  const correct = picked === question.answer;
  const accent = SUBJECT_COLORS[question.subject];
  const speechLine = questionSpeech(question.prompt, question.choices);
  const canSpeak = speechAvailable();
  const subjectIcon = SUBJECT_ICONS[question.subject];

  const toggleSpeech = useCallback((key: string, line: string) => {
    if (speakingKey === key) {
      stopSpeaking();
      setSpeakingKey(null);
      return;
    }
    setSpeakingKey(key);
    speak(line, {
      onEnd: () => setSpeakingKey((current) => (current === key ? null : current)),
    });
  }, [speakingKey]);

  const choose = useCallback(
    (i: number) => {
      // The reading lock has to hold here too, not just disable the buttons, or a
      // keyboard 1-8 press would walk straight past it.
      if (picked !== null || readLock > 0) return;
      stopSpeaking();
      setSpeakingKey(null);
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

  // Never auto-play. Only stop speech when the question changes or closes.
  useEffect(() => {
    return () => stopSpeaking();
  }, [question.id]);

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
        className="flex-shrink-0 border-b border-white/10 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 shadow-[0_12px_40px_rgba(0,0,0,.2)]"
        style={{ background: `linear-gradient(180deg, ${accent}22, transparent)` }}
      >
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border text-xl shadow-lg"
              style={{ borderColor: `${accent}55`, background: `${accent}20` }}
              aria-hidden="true"
            >
              {subjectIcon}
            </div>
            <div className="min-w-0">
              <div className="truncate text-base font-black text-white">{headline}</div>
              <div className="truncate text-xs text-white/50">{subhead}</div>
            </div>
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

          {narrate && (
            <div
              className="mb-3 flex items-center gap-3 rounded-2xl border px-4 py-3"
              style={{ borderColor: `${accent}45`, background: `${accent}12` }}
            >
              <span className="text-2xl" aria-hidden="true">👂</span>
              <div className="min-w-0">
                <div className="text-sm font-black text-white">Read it or listen when you want</div>
                <div className="text-xs text-white/55">Tap a speaker to play. Tap it again to stop.</div>
              </div>
            </div>
          )}

          <div className="mb-4 flex items-start gap-3 rounded-3xl border border-white/10 bg-white/[0.04] p-4">
            <p className="flex-1 text-xl font-bold leading-snug text-white sm:text-2xl">{question.prompt}</p>
            {canSpeak && (
              <button
                type="button"
                onClick={() => toggleSpeech('question', speechLine)}
                aria-label={speakingKey === 'question' ? 'Stop reading the question' : 'Hear the question'}
                className={`flex flex-shrink-0 items-center gap-1.5 rounded-2xl border px-3 py-2 text-sm font-bold transition active:scale-95 ${
                  narrate ? 'border-current' : 'border-white/20 text-white/70'
                }`}
                style={narrate ? { color: accent, background: `${accent}1f` } : undefined}
              >
                <span className="text-lg">{speakingKey === 'question' ? '⏹' : '🔊'}</span>
                {narrate && <span>{speakingKey === 'question' ? 'Stop' : 'Hear it'}</span>}
              </button>
            )}
          </div>

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
                <div key={i} className={`grid ${narrate && canSpeak ? 'grid-cols-[1fr_auto]' : ''} gap-2`}>
                  <button
                    type="button"
                    onClick={() => choose(i)}
                    disabled={answered || readLock > 0}
                    className={`flex min-h-16 items-center gap-3 rounded-2xl border px-4 py-3 text-left text-[17px] font-semibold leading-snug transition disabled:cursor-not-allowed sm:text-lg ${cls}`}
                  >
                    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-current text-sm font-black opacity-80">
                      {LETTERS[i]}
                    </span>
                    <span className="flex-1">{choice}</span>
                    {narrate && <NumberPicture choice={choice} />}
                    {answered && isAnswer && <span className="text-lg">✓</span>}
                    {answered && isPicked && !isAnswer && <span className="text-lg">✕</span>}
                  </button>
                  {narrate && canSpeak && (
                    <button
                      type="button"
                      onClick={() => toggleSpeech(`choice-${i}`, `${LETTERS[i]}. ${toSpeakable(choice)}`)}
                      aria-label={
                        speakingKey === `choice-${i}`
                          ? `Stop reading answer ${LETTERS[i]}`
                          : `Hear answer ${LETTERS[i]}`
                      }
                      className={`flex min-h-16 w-14 items-center justify-center rounded-2xl border text-xl transition active:scale-95 ${
                        speakingKey === `choice-${i}`
                          ? 'border-amber-300/45 bg-amber-300/15 text-amber-200'
                          : 'border-white/15 bg-white/[0.055] text-white/75 hover:bg-white/10'
                      }`}
                    >
                      {speakingKey === `choice-${i}` ? '⏹' : '🔊'}
                    </button>
                  )}
                </div>
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
