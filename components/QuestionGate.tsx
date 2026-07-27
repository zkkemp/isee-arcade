'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CountingPictureItem, Question, QuestionVisual } from '@/lib/questions/types';
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

const COUNTING_EMOJI: Partial<Record<CountingPictureItem, string>> = {
  apple: '🍎',
  balloon: '🎈',
  bee: '🐝',
  bird: '🐦',
  block: '🧊',
  cat: '🐱',
  cookie: '🍪',
  crayon: '🖍️',
  dog: '🐶',
  duck: '🦆',
  fish: '🐠',
  frog: '🐸',
  pig: '🐷',
};

const PICTURE_COLORS = [
  ['#fff7b3', '#f59e0b'],
  ['#dbeafe', '#3b82f6'],
  ['#dcfce7', '#22c55e'],
  ['#fce7f3', '#ec4899'],
] as const;

/** One large illustrated counter; no number is printed, so it cannot reveal the answer. */
function CountingObject({ item, index }: { item: CountingPictureItem; index: number }) {
  const colors = PICTURE_COLORS[index % PICTURE_COLORS.length];
  const common =
    'flex aspect-square min-h-12 items-center justify-center rounded-2xl border-2 shadow-[0_5px_0_rgba(0,0,0,.2),inset_0_1px_0_rgba(255,255,255,.8)] sm:min-h-14';

  if (item === 'star') {
    return (
      <span
        aria-hidden="true"
        className={common}
        style={{ borderColor: '#fbbf24', background: 'linear-gradient(145deg,#fff9c2,#fde68a)' }}
      >
        <svg viewBox="0 0 64 64" className="h-10 w-10 drop-shadow-md sm:h-11 sm:w-11">
          <path
            d="M32 5 39.2 21.5 57 23.2 43.6 35 47.5 52.5 32 43.4 16.5 52.5 20.4 35 7 23.2 24.8 21.5Z"
            fill="#facc15"
            stroke="#b45309"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <path d="M25 22.5 32 10l2.8 12.8Z" fill="#fff8a6" opacity=".9" />
        </svg>
      </span>
    );
  }

  if (item === 'circle' || item === 'dot') {
    return (
      <span
        aria-hidden="true"
        className={common}
        style={{ borderColor: colors[1], background: `linear-gradient(145deg,${colors[0]},#ffffff)` }}
      >
        <span
          className={`${item === 'dot' ? 'h-7 w-7' : 'h-9 w-9'} rounded-full border-[3px] border-white/90 shadow-[0_4px_0_rgba(0,0,0,.18),inset_0_4px_7px_rgba(255,255,255,.65)]`}
          style={{ background: `linear-gradient(145deg,${colors[0]},${colors[1]})` }}
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`${common} text-[29px] leading-none sm:text-[34px]`}
      style={{
        borderColor: colors[1],
        background: `linear-gradient(145deg,${colors[0]},#ffffff)`,
        transform: `rotate(${index % 2 === 0 ? -2 : 2}deg)`,
      }}
    >
      {COUNTING_EMOJI[item]}
    </span>
  );
}

/** A five-across phone layout and ten-frame-like iPad layout for counting pictures. */
export function CountingPicture({ visual }: { visual: QuestionVisual }) {
  const multiple = visual.groups.length > 1;
  return (
    <section
      data-counting-picture
      aria-label="Pictures to count"
      className={`mb-4 grid gap-3 ${multiple ? 'sm:grid-cols-2' : ''}`}
    >
      {visual.groups.map((group, groupIndex) => (
        <div
          key={`${group.item}-${groupIndex}`}
          className="rounded-3xl border-2 border-sky-200/25 bg-gradient-to-b from-sky-300/15 to-indigo-300/5 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,.12)] sm:p-4"
        >
          {group.label && (
            <div className="mb-3 text-center text-sm font-black uppercase tracking-wider text-sky-100">
              {group.label}
            </div>
          )}
          <div
            className={`grid justify-center gap-2.5 sm:gap-3 ${
              multiple ? 'grid-cols-5' : 'grid-cols-5 sm:grid-cols-10'
            }`}
          >
            {Array.from({ length: group.count }, (_, index) => (
              <CountingObject key={index} item={group.item} index={index + groupIndex} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

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

/** Scratch paper appears for multi-step math, never as a calculator or answer hint. */
export function shouldOfferScratch(question: Question): boolean {
  const numberWork = question.subject === 'math' || question.subject === 'quantitative';
  return (
    numberWork &&
    (question.difficulty >= 2 ||
      /\b\d+\/\d+\b|\b(?:x|×)\b|\bdivide|fraction|percent|two-step/i.test(question.prompt))
  );
}

export function ScratchPaper() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = ref.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * canvas.width) / rect.width,
      y: ((event.clientY - rect.top) * canvas.height) / rect.height,
    };
  };
  const stroke = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#243652';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  };

  return (
    <div className="mt-4 rounded-2xl border border-sky-200/25 bg-sky-100/10 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-black text-sky-100">✎ Scratch paper</span>
        <button
          type="button"
          onClick={() => {
            const canvas = ref.current;
            const ctx = canvas?.getContext('2d');
            if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
          }}
          className="rounded-lg border border-white/20 px-2 py-1 text-xs font-bold text-white/75"
        >
          Clear
        </button>
      </div>
      <canvas
        ref={ref}
        width={1200}
        height={720}
        aria-label="Finger-drawing scratch paper"
        className="h-[min(42vh,30rem)] min-h-56 w-full touch-none rounded-xl bg-[#fffdf4] shadow-inner"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          drawing.current = true;
          last.current = point(event);
          stroke(last.current, last.current);
        }}
        onPointerMove={(event) => {
          if (!drawing.current || !last.current) return;
          const next = point(event);
          stroke(last.current, next);
          last.current = next;
        }}
        onPointerUp={() => {
          drawing.current = false;
          last.current = null;
        }}
        onPointerCancel={() => {
          drawing.current = false;
          last.current = null;
        }}
      />
    </div>
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

          {question.visual?.kind === 'counting' && <CountingPicture visual={question.visual} />}

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
                      onClick={() => toggleSpeech(`choice-${i}`, `Choice ${LETTERS[i]}. ${toSpeakable(choice)}`)}
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

          {shouldOfferScratch(question) && <ScratchPaper key={question.id} />}

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
              {question.explain.includes('\n') ? (
                <ol className="mt-3 grid gap-2">
                  {question.explain.split(/\n+/).map((step, index) => (
                    <li
                      key={step}
                      className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/10 px-3 py-2.5 text-[16px] leading-relaxed text-white/90"
                    >
                      <span
                        className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-black text-[#101020]"
                        style={{ background: accent }}
                      >
                        {index + 1}
                      </span>
                      <span>{step.replace(/^\d+[.)]\s*/, '')}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-[16px] leading-relaxed text-white/85">{question.explain}</p>
              )}
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
