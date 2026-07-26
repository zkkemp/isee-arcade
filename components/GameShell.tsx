'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CelebrationCard from './CelebrationCard';
import DPad from './DPad';
import QuestionGate from './QuestionGate';
import RunJumpBar from './RunJumpBar';
import TouchOverlay from './TouchOverlay';
import { HOW_TO, type GameApi, type GameComponent, type GameMeta } from '@/lib/games';
import { useCharacter } from '@/lib/characters';
import { useDifficulty } from '@/lib/difficulty';
import { clearPendingGate, loadPendingGate, savePendingGate } from '@/lib/pendingGate';
import { InputController, bindKeyboard } from '@/lib/input';
import { pickQuestion } from '@/lib/questions';
import type { Question, QuestionKind } from '@/lib/questions/types';
import { useActiveProfile } from '@/lib/profiles';
import { playSound, unlockAudio, useMuted } from '@/lib/sound';
import {
  COIN_BONUS_MS,
  COIN_STEP,
  LEVEL_BONUS_MS,
  MAX_BONUS_MS,
  PLAY_WINDOW_MS,
  blockComplete,
  emptySession,
  formatClock,
  loadSession,
  newBlock,
  questionsLeft,
  saveSession,
  type PlaySession,
  type StudyBlock,
} from '@/lib/playSession';
import {
  emptyProgress,
  loadProgress,
  recentAccuracy,
  recordAnswer,
  recordHighScore,
  saveProgress,
  type Progress,
} from '@/lib/progress';

/** Points for answering a study question correctly. */
const CORRECT_REWARD = 50;
/** Wrong answers in a row that add one extra question to the block. */
const WRONG_STREAK_PENALTY = 3;
/**
 * Questions added to the block for MISSING the reading passage. The reading
 * question is not a shortcut and getting it right earns nothing special - the
 * incentive to actually read is that skimming it and guessing wrong costs two
 * extra questions, more than any other miss.
 */
const READING_MISS_PENALTY = 2;

/**
 * Odds that a freshly drawn question is a reading passage. About one in eight, on
 * request: passages are long, so they should turn up now and then rather than
 * lead every block. At most one reading question per block, and nailing it is the
 * shortcut that ends the block early.
 */
const READING_CHANCE = 1 / 8;

/**
 * The run/jump buttons used to sit on top of the canvas, so games reserved a band
 * at the bottom to stay clear of them. That pushed the whole playfield down to
 * thumb level and wasted the top half of the screen on sky. The buttons now have
 * their own strip below the canvas, so nothing needs reserving.
 */
const RUN_JUMP_INSET = 0;

/** How often the play clock ticks. Frequent enough to look live, cheap enough to ignore. */
const TICK_MS = 250;

type Gate = {
  question: Question;
  /** 1 for the first question of the block, incrementing per question served. */
  attempt: number;
  /** Set when this question is a retry of one just missed. */
  isRetry: boolean;
};

export default function GameShell({ meta, Game }: { meta: GameMeta; Game: GameComponent }) {
  const [difficulty] = useDifficulty();
  const [character] = useCharacter();
  const [muted, setMuted] = useMuted();
  // Which learner is signed in decides which question bank the study block draws
  // from, so a kindergartner never gets a 5th-grade ISEE question.
  const activeProfile = useActiveProfile();
  const band = activeProfile?.band ?? 'isee';

  const [score, setScore] = useState(0);
  const [gate, setGate] = useState<Gate | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [restartToken, setRestartToken] = useState(0);
  const [asked, setAsked] = useState(0);
  const [gotRight, setGotRight] = useState(0);
  const [progress, setProgress] = useState<Progress>(emptyProgress);
  const [best, setBest] = useState(0);
  const [correctStreak, setCorrectStreak] = useState(0);
  const [manualPause, setManualPause] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  // The games are laid out for portrait. On a touch device held sideways they
  // squash unusably, so we pause and ask for a rotate. Gated on `pointer: coarse`
  // so a desktop in a wide window (which plays fine) never sees the nag.
  const [rotate, setRotate] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(orientation: landscape) and (pointer: coarse)');
    const update = () => setRotate(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Show the how-to-play card automatically the first time each game is opened on
  // this device, so a kid who has never seen it knows the goal before playing.
  useEffect(() => {
    const key = `isee-arcade:howto-seen:${meta.id}`;
    try {
      if (!window.localStorage.getItem(key)) {
        setInfoOpen(true);
        window.localStorage.setItem(key, '1');
      }
    } catch {
      // Private browsing: they just do not get the auto-open. The ⓘ button remains.
    }
  }, [meta.id]);
  /** Level-clear card: Marty's face and a congratulations. */
  const [celebration, setCelebration] = useState<{ headline: string; note: string | null } | null>(
    null,
  );

  /** Mirrors the persisted session so the HUD can render it. */
  const [msLeft, setMsLeft] = useState(0);
  const [block, setBlock] = useState<StudyBlock | null>(null);

  // Refs mirror what the game API and the clock touch, so the API object stays
  // stable for the lifetime of the mount without going stale.
  const scoreRef = useRef(0);
  const progressRef = useRef<Progress>(emptyProgress());
  const sessionRef = useRef<PlaySession>(emptySession());
  const gateOpenRef = useRef(false);
  const correctStreakRef = useRef(0);
  const wrongStreakRef = useRef(0);
  const seenIdsRef = useRef<string[]>([]);
  const seenPassagesRef = useRef<string[]>([]);
  /** Kind of the last question answered, so the next one rotates away from it. */
  const lastKindRef = useRef<QuestionKind | null>(null);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const celebrateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [input] = useState(() => new InputController());

  const controlsInset = meta.controls === 'run-jump' ? RUN_JUMP_INSET : 0;

  const flashStatus = useCallback((text: string | null, ms = 1700) => {
    setStatus(text);
    if (statusTimer.current) clearTimeout(statusTimer.current);
    if (text) statusTimer.current = setTimeout(() => setStatus(null), ms);
  }, []);

  const celebrate = useCallback((headline: string, note: string | null, ms = 1000) => {
    setCelebration({ headline, note });
    if (celebrateTimer.current) clearTimeout(celebrateTimer.current);
    celebrateTimer.current = setTimeout(() => setCelebration(null), ms);
  }, []);

  const persist = useCallback(() => {
    saveSession(sessionRef.current);
  }, []);

  /**
   * Draws a question for the block.
   *
   * `retryOf` keeps them on something they just missed - for templated maths that
   * is the same shape with new numbers, so there is no way through but to do it.
   * Otherwise the reading question is served first and once, and every later
   * question in the block avoids reading (one passage per block) and rotates away
   * from whatever was just answered.
   */
  const drawFor = useCallback(
    (b: StudyBlock, retryOf: Question | null): Question => {
    const p = progressRef.current;
    // Reading turns up about one draw in eight, at most once per block, and never
    // on a retry. Only the ISEE bank has reading passages - the younger grade
    // banks are all short templated questions, so skip the reading logic there.
    const wantReading =
      band === 'isee' && !retryOf && !b.readingServed && Math.random() < READING_CHANCE;
    const avoid: QuestionKind[] = [];
    if (!wantReading && !retryOf) {
      if (band === 'isee') avoid.push('reading');
      if (lastKindRef.current) avoid.push(lastKindRef.current);
    }

    const question = pickQuestion({
      band,
      recentIds: seenIdsRef.current,
      recentPassageIds: seenPassagesRef.current,
      missed: p.missed,
      recentAccuracy: recentAccuracy(p),
      sameKindAs: retryOf,
      forceKind: wantReading ? 'reading' : null,
      avoidKind: avoid.length > 0 ? avoid : null,
    });

    // Keep a deep history (larger than the biggest bank) so the least-recently-
    // used picker in pickQuestion cycles the WHOLE bank before any family repeats.
    seenIdsRef.current = [...seenIdsRef.current, question.id].slice(-300);
    if (question.passageId) {
      seenPassagesRef.current = [...seenPassagesRef.current, question.passageId].slice(-14);
    }
    return question;
    },
    [band],
  );

  /** Opens the study block. Idempotent, so a tick and a death cannot double-fire it. */
  const openStudy = useCallback(
    (restored?: { question: Question; attempt: number }) => {
      if (gateOpenRef.current) return;
      // Drop held keys so play does not resume mid-move after answering.
      input.clear();
      gateOpenRef.current = true;

      const s = sessionRef.current;
      const b = s.study ?? newBlock();
      sessionRef.current = { ...s, msLeft: 0, study: b };
      setBlock(b);
      setMsLeft(0);
      persist();

      const q = restored?.question ?? drawFor(b, null);
      if (q.kind === 'reading' && !restored) {
        // Mark it served the moment it is shown, not when it is answered. A kid
        // who reads the passage and force quits should not be handed a second one.
        const served = { ...b, readingServed: true };
        sessionRef.current = { ...sessionRef.current, study: served };
        setBlock(served);
        persist();
      }
      setGate({ question: q, attempt: restored?.attempt ?? 1, isRetry: false });
    },
    [drawFor, input, persist],
  );

  // Hydrate progress and the play session, then either restore an owed question
  // or hand back whatever play time is left.
  useEffect(() => {
    const p = loadProgress();
    progressRef.current = p;
    setProgress(p);
    setBest(p.highScores[meta.id] ?? 0);

    const s = loadSession();
    sessionRef.current = s;
    setMsLeft(s.msLeft);
    setBlock(s.study);

    // A question owed from a previous session is restored before play can start,
    // including when it was owed in a different game. Quitting is not an escape,
    // and the exact question is restored so quitting cannot reroll a long passage
    // into a short synonym.
    const pending = loadPendingGate();
    if (s.study && !blockComplete(s.study)) {
      openStudy(pending ? { question: pending.question, attempt: pending.attempt } : undefined);
    } else if (s.msLeft <= 0) {
      openStudy();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot hydration; openStudy is stable and re-running would reopen the gate
  }, [meta.id]);

  useEffect(() => bindKeyboard(input), [input]);

  useEffect(
    () => () => {
      if (statusTimer.current) clearTimeout(statusTimer.current);
      if (celebrateTimer.current) clearTimeout(celebrateTimer.current);
    },
    [],
  );

  // Mirror the live question to storage so a reload cannot shake it off.
  useEffect(() => {
    if (!gate) return;
    const b = sessionRef.current.study;
    savePendingGate({
      gameId: meta.id,
      reason: 'time',
      label: 'Study time',
      attempt: gate.attempt,
      owed: b ? questionsLeft(b) : 1,
      wrongStreak: wrongStreakRef.current,
      question: gate.question,
    });
  }, [gate, meta.id]);

  const paused = gate !== null || manualPause || rotate;

  /**
   * The play clock. Runs only while actually playing - not while a question is up,
   * not while paused, and not while the tab is hidden, since a backgrounded iPad
   * should not silently burn a window the kid never got to use.
   */
  useEffect(() => {
    if (paused) return;
    let last = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      const dt = now - last;
      last = now;
      if (document.visibilityState === 'hidden') return;

      const s = sessionRef.current;
      if (s.study && !blockComplete(s.study)) return;

      const next = Math.max(0, s.msLeft - dt);
      sessionRef.current = { ...s, msLeft: next };
      setMsLeft(next);

      if (next <= 0) {
        persist();
        playSound('gameOver');
        openStudy();
      } else if (Math.floor(next / 2000) !== Math.floor(s.msLeft / 2000)) {
        // Persisted every couple of seconds rather than every tick: often enough
        // that a force quit cannot bank much free time, cheap enough to ignore.
        persist();
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [paused, openStudy, persist]);

  /** Adds play time, respecting the per-window bonus ceiling. Returns what was granted. */
  const grantBonus = useCallback(
    (ms: number): number => {
      const s = sessionRef.current;
      const room = Math.max(0, MAX_BONUS_MS - s.bonusMs);
      const give = Math.min(ms, room);
      if (give <= 0) return 0;
      sessionRef.current = { ...s, msLeft: s.msLeft + give, bonusMs: s.bonusMs + give };
      setMsLeft(sessionRef.current.msLeft);
      persist();
      return give;
    },
    [persist],
  );

  const api = useMemo<GameApi>(
    () => ({
      addScore: (delta) => {
        scoreRef.current += delta;
        setScore(scoreRef.current);

        // Playing well buys time. This is the "more coins means more play" lever:
        // every COIN_STEP points is another minute, capped per window.
        const s = sessionRef.current;
        if (scoreRef.current - s.bonusAtScore >= COIN_STEP && s.bonusMs < MAX_BONUS_MS) {
          const steps = Math.floor((scoreRef.current - s.bonusAtScore) / COIN_STEP);
          sessionRef.current = {
            ...sessionRef.current,
            bonusAtScore: s.bonusAtScore + steps * COIN_STEP,
          };
          const given = grantBonus(steps * COIN_BONUS_MS);
          if (given > 0) {
            playSound('powerup');
            flashStatus(`+${Math.round(given / 60_000)} min of play time!`, 2200);
          }
        }
      },
      // Dying is free inside a window. That is the point of the redesign: a kid
      // who dies a lot used to face a question every few seconds.
      died: (label = 'You crashed') => {
        playSound('gameOver');
        flashStatus(`${label} - keep going`, 1500);
      },
      // Clearing a level tops the clock up instead of interrupting with a question.
      requestGate: (label) => {
        playSound('levelClear');
        const given = grantBonus(LEVEL_BONUS_MS);
        celebrate(label, given > 0 ? `+${Math.round(given / 1000)} seconds of play time` : null);
      },
      setStatus: (text) => flashStatus(text),
    }),
    [celebrate, flashStatus, grantBonus],
  );

  const handleAnswered = useCallback(
    (correct: boolean) => {
      const g = gate;
      const b = sessionRef.current.study;
      if (!g || !b) return;

      const updated = recordAnswer(progressRef.current, {
        id: g.question.id,
        subject: g.question.subject,
        correct,
      });
      progressRef.current = updated;
      setProgress(updated);
      saveProgress(updated);

      setAsked((n) => n + 1);
      lastKindRef.current = g.question.kind;
      const wasReading = g.question.kind === 'reading';

      if (!correct) {
        playSound('wrong');
        correctStreakRef.current = 0;
        setCorrectStreak(0);
        wrongStreakRef.current += 1;

        let next = b;
        // Missing the reading passage is the expensive miss: it adds two
        // questions. This is what makes reading carefully worth it, in place of
        // the old "get it right and skip the block" shortcut.
        if (wasReading) {
          next = { ...next, penalty: next.penalty + READING_MISS_PENALTY };
          flashStatus(
            `Missed the reading - ${READING_MISS_PENALTY} more questions added.`,
            2800,
          );
        } else if (wrongStreakRef.current >= WRONG_STREAK_PENALTY) {
          // Three wrong in a row adds a question. The bar lives on the block so a
          // restart cannot shake it off.
          wrongStreakRef.current = 0;
          next = { ...next, penalty: next.penalty + 1 };
          flashStatus('Three missed - one extra question added.', 2600);
        }
        sessionRef.current = { ...sessionRef.current, study: next };
        setBlock(next);
        persist();

        // A missed passage does NOT hand out another passage. The rest of the
        // block is short questions, because three long passages in a row is how
        // you teach a kid to hate reading. Everything else retries its own kind.
        setGate({
          question: drawFor(next, wasReading ? null : g.question),
          attempt: g.attempt + 1,
          isRetry: !wasReading,
        });
        return;
      }

      // --- correct ---
      playSound('correct');
      setGotRight((n) => n + 1);
      wrongStreakRef.current = 0;
      correctStreakRef.current += 1;
      setCorrectStreak(correctStreakRef.current);

      scoreRef.current += CORRECT_REWARD;
      setScore(scoreRef.current);

      // A correct reading answer counts as one question like any other - the
      // reading incentive is the miss penalty, not a reward here.
      const next: StudyBlock = { ...b, correct: b.correct + 1 };
      sessionRef.current = { ...sessionRef.current, study: next };
      setBlock(next);

      if (!blockComplete(next)) {
        persist();
        setGate({ question: drawFor(next, null), attempt: g.attempt + 1, isRetry: false });
        return;
      }

      // --- block done: buy the window ---
      const banked = recordHighScore(progressRef.current, meta.id, scoreRef.current);
      progressRef.current = banked;
      setProgress(banked);
      setBest(banked.highScores[meta.id] ?? 0);
      saveProgress(banked);

      sessionRef.current = {
        msLeft: PLAY_WINDOW_MS,
        bonusMs: 0,
        bonusAtScore: scoreRef.current,
        blocksDone: sessionRef.current.blocksDone + 1,
        study: null,
      };
      setMsLeft(PLAY_WINDOW_MS);
      setBlock(null);
      persist();

      gateOpenRef.current = false;
      setGate(null);
      clearPendingGate();
      playSound('pass');
      flashStatus(
        `Study block done - ${Math.round(PLAY_WINDOW_MS / 60_000)} minutes of play!`,
        2800,
      );
    },
    [drawFor, flashStatus, gate, meta.id, persist],
  );

  const restart = useCallback(() => {
    // Deliberately does NOT clear an owed block or refill the clock: restarting
    // would otherwise be a one-tap way out of studying.
    if (gateOpenRef.current) return;
    scoreRef.current = 0;
    correctStreakRef.current = 0;
    wrongStreakRef.current = 0;
    lastKindRef.current = null;
    setScore(0);
    setAsked(0);
    setGotRight(0);
    setStatus(null);
    setCelebration(null);
    setCorrectStreak(0);
    setManualPause(false);
    input.clear();
    setRestartToken((t) => t + 1);
  }, [input]);

  const sessionAccuracy = asked === 0 ? null : Math.round((gotRight / asked) * 100);
  const left = block ? questionsLeft(block) : 0;

  const headline = (() => {
    if (!gate) return '';
    if (gate.question.kind === 'reading') return 'Reading question';
    return `Study block - ${left} to go`;
  })();

  const subhead = (() => {
    if (!gate || !block) return '';
    if (gate.question.kind === 'reading') {
      return `Read carefully. Miss it and ${READING_MISS_PENALTY} more questions get added to the block.`;
    }
    if (gate.isRetry) return 'Same kind again, since that one was missed.';
    if (left === 1) return 'Last one, then 6 minutes of play.';
    return `${left} more, then 6 minutes of play. They do not have to be in a row.`;
  })();

  const clockLow = msLeft > 0 && msLeft < 60_000;
  const isRemaster = meta.id.endsWith('2') || meta.id === 'platformer3';

  // Controls help lives behind an info button now, not as fixed text under the
  // canvas. On iPad that text sat right under the jump button and iOS kept
  // selecting it into a blue bubble on every mis-tap.
  const controlsHelp = (() => {
    switch (meta.controls) {
      case 'run-jump':
        return 'Tap the right half of the screen to jump, or use the Run and Jump buttons below. Keyboard: arrows or A / D to move, Space to jump.';
      case 'lanes':
        return 'Tap the left or right side to move. Swipe up anywhere to jump. Keyboard: arrows to move, Space or Up to jump.';
      case 'tapjump':
        return 'Tap anywhere on the screen to jump. Tap again in the air for a double jump. Keyboard: Space or Up.';
      case 'paddle':
        return 'Drag anywhere to slide the paddle. Keyboard: left / right arrows.';
      case 'grid':
        return 'Tap and drag on the board. Keyboard: arrows or W A S D.';
      case 'board':
        return 'Tap a square, card, or piece to play. Follow the message at the top for the current turn and available move.';
      default:
        return 'Swipe up, down, left, or right anywhere on the board, or press the arrow pad below. Keyboard: arrows or W A S D.';
    }
  })();

  return (
    <div
      className="relative flex h-dvh w-full flex-col overflow-hidden select-none"
      style={{ WebkitUserSelect: 'none', WebkitTouchCallout: 'none', userSelect: 'none' }}
      onPointerDown={unlockAudio}
    >
      {/* HUD - two rows so a long game name and the stats never fight the
          buttons for space. Row 1: back, title, clock, score. Row 2: stats and
          the action buttons. */}
      <header
        className="relative flex flex-shrink-0 flex-col gap-1 overflow-hidden border-b border-white/8 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 shadow-xl sm:gap-1.5 sm:px-5 sm:pb-3"
        style={{
          background: `radial-gradient(circle at 72% -30%, ${meta.accent}24, transparent 48%), linear-gradient(180deg, rgba(25,22,43,.98), rgba(12,11,22,.96))`,
        }}
      >
        <div className="flex items-center gap-2.5 sm:gap-3">
          <Link
            href="/"
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.07] text-white/75 shadow-lg transition hover:bg-white/10 active:scale-95 sm:h-11 sm:w-11 sm:text-lg"
            aria-label="Back to game list"
          >
            ←
          </Link>

          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl border text-lg shadow-lg"
              style={{ borderColor: `${meta.accent}4d`, background: `${meta.accent}1f` }}
              aria-hidden="true"
            >
              {meta.icon}
            </span>
            <div className="min-w-0">
              <div className="truncate text-base font-black leading-tight text-white sm:text-xl">
                {meta.name}
              </div>
              {isRemaster && (
                <div className="text-[8px] font-black uppercase tracking-[0.2em] text-amber-300 sm:text-[9px]">
                  New edition · original preserved
                </div>
              )}
            </div>
          </div>

          {/* Play clock. The one thing that ends a window, so it is never hidden. */}
          {!gate && (
            <div
              className={`flex flex-shrink-0 items-center gap-1.5 rounded-2xl border px-2.5 py-1 shadow-lg sm:px-3.5 sm:py-1.5 ${
                clockLow
                  ? 'animate-pulse border-amber-400/50 bg-amber-400/15'
                  : 'border-emerald-400/40 bg-emerald-400/10'
              }`}
              title="Play time left. Answer questions to earn more."
            >
              <span className="text-sm sm:text-base">⏱</span>
              <span className="text-right">
                <span className="block text-[8px] font-bold uppercase tracking-widest text-white/45">
                  play time
                </span>
                <span
                  className={`block text-sm font-black leading-none tabular-nums sm:text-lg ${
                    clockLow ? 'text-amber-300' : 'text-emerald-300'
                  }`}
                >
                  {formatClock(msLeft)}
                </span>
              </span>
            </div>
          )}

          <div className="flex-shrink-0 rounded-xl bg-black/20 px-2 py-1 text-right">
            <div className="text-xl font-bold leading-none sm:text-3xl" style={{ color: meta.accent }}>
              {score}
            </div>
            <div className="text-[10px] uppercase tracking-widest text-white/35 sm:text-xs">
              score
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-0.5">
          <div className="flex min-w-0 flex-1 items-center gap-3 truncate text-[11px] leading-tight text-white/40 sm:text-sm">
            <span className="rounded-full bg-white/[0.055] px-2 py-1">🏆 best {best}</span>
            {asked > 0 && (
              <span className="rounded-full bg-white/[0.055] px-2 py-1">✓ {gotRight}/{asked} right</span>
            )}
            {correctStreak > 1 && (
              <span className="rounded-full bg-amber-300/10 px-2 py-1 text-amber-300/90">
                🔥 {correctStreak} streak
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setInfoOpen((v) => !v)}
            aria-label="How to play"
            className="flex h-8 flex-shrink-0 items-center gap-1 rounded-xl border border-white/15 bg-white/5 px-2.5 text-xs font-semibold text-white/75 transition active:scale-95 sm:h-9 sm:text-sm"
          >
            ⓘ How to play
          </button>

          <button
            type="button"
            onClick={() => setMuted(!muted)}
            aria-label={muted ? 'Unmute' : 'Mute'}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-sm text-white/75 transition active:scale-95 sm:h-9 sm:w-9"
          >
            {muted ? '🔇' : '🔊'}
          </button>

          <button
            type="button"
            onClick={() => setManualPause((v) => !v)}
            aria-label={manualPause ? 'Resume' : 'Pause'}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-sm text-white/75 transition active:scale-95 sm:h-9 sm:w-9"
          >
            {manualPause ? '▶' : '❚❚'}
          </button>

          <button
            type="button"
            onClick={restart}
            className="flex h-8 flex-shrink-0 items-center rounded-xl border border-white/15 bg-white/5 px-2.5 text-xs font-semibold text-white/70 transition active:scale-95 sm:h-9 sm:px-4 sm:text-sm"
          >
            Restart
          </button>
        </div>
      </header>

      {/* Stage. The canvas fills everything above the control strip; a portrait
          screen cannot show both a useful view width and little sky, so games lay
          out against the size they are given rather than a fixed aspect. */}
      <div className="relative flex min-h-0 flex-1 flex-col px-2 pb-1 sm:px-5 sm:pb-3">
        <div
          className="game-stage relative w-full flex-1 overflow-hidden rounded-3xl border bg-black shadow-2xl sm:rounded-[2rem]"
          data-game={meta.id}
          style={{
            borderColor: `${meta.accent}4d`,
            boxShadow: `0 24px 70px rgba(0,0,0,.5), 0 0 36px ${meta.accent}18, inset 0 1px rgba(255,255,255,.12)`,
          }}
        >
          <Game
            paused={paused}
            input={input}
            api={api}
            restartToken={restartToken}
            difficulty={difficulty}
            character={character}
            controlsInset={controlsInset}
          />

          <TouchOverlay scheme={meta.controls} input={input} disabled={paused} />
          <div className="game-stage__finish pointer-events-none absolute inset-0 z-[12]" aria-hidden="true" />

          {manualPause && !gate && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/70 backdrop-blur-sm">
              <div className="text-sm font-bold uppercase tracking-widest text-white/60 sm:text-lg">
                Paused
              </div>
              <div className="text-xs text-white/40 sm:text-base">
                Clock stopped - {formatClock(msLeft)} of play left
              </div>
              <button
                type="button"
                onClick={() => setManualPause(false)}
                className="rounded-2xl px-8 py-4 text-base font-bold text-[#101020] sm:px-12 sm:py-5 sm:text-xl"
                style={{ background: meta.accent }}
              >
                Resume
              </button>
              <Link href="/" className="text-xs font-semibold text-white/50 underline sm:text-sm">
                Quit to menu
              </Link>
            </div>
          )}

          {celebration && !gate && !manualPause && (
            <CelebrationCard
              headline={celebration.headline}
              note={celebration.note}
              accent={meta.accent}
            />
          )}

          {status && !gate && !manualPause && !celebration && (
            <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full border border-white/20 bg-black/75 px-4 py-1.5 text-center text-xs font-semibold text-white shadow-lg sm:top-5 sm:px-6 sm:py-2.5 sm:text-base">
              {status}
            </div>
          )}

          {gate && (
            <QuestionGate
              // Remounting per question resets the gate's own state, and the
              // attempt number is part of the key because a templated retry
              // reuses the same question id.
              key={`${gate.question.id}-${gate.attempt}`}
              question={gate.question}
              headline={headline}
              subhead={subhead}
              reward={CORRECT_REWARD}
              // Offer on-demand listening support for the pre-reading grades.
              narrate={band === 'k' || band === 'grade1'}
              onAnswered={handleAnswered}
            />
          )}
        </div>

        {meta.controls === 'run-jump' && (
          <div className="pt-2 sm:pt-3">
            <RunJumpBar input={input} accent={meta.accent} disabled={paused} />
          </div>
        )}

        {meta.controls === 'dpad' && (
          <div className="pt-2 sm:pt-3">
            <DPad input={input} accent={meta.accent} disabled={paused} />
          </div>
        )}
      </div>

      {progress.totalSeen > 0 && (
        <p className="flex-shrink-0 pb-[max(0.2rem,env(safe-area-inset-bottom))] text-center text-[11px] text-white/20 sm:text-sm">
          {progress.totalSeen} answered all time
          {sessionAccuracy !== null && ` · ${sessionAccuracy}% this run`}
        </p>
      )}

      {rotate && (
        <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center gap-5 bg-[#0b0b14] p-8 text-center">
          <div className="text-6xl" style={{ animation: 'none' }}>
            📱↻
          </div>
          <div className="text-2xl font-extrabold text-white">Turn your screen up and down</div>
          <p className="max-w-xs text-sm text-white/60">
            These games play best held tall (portrait). Rotate your device to keep playing.
          </p>
        </div>
      )}

      {infoOpen && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
          onClick={() => setInfoOpen(false)}
        >
          <div
            className="max-h-[85dvh] w-full max-w-sm overflow-y-auto rounded-[2rem] border-2 bg-[#12121e] px-6 py-6 text-center shadow-2xl"
            style={{ borderColor: meta.accent }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-3xl border text-3xl shadow-xl"
              style={{ color: meta.accent, borderColor: `${meta.accent}55`, background: `${meta.accent}1b` }}
            >
              {meta.icon}
            </div>
            <div className="text-2xl font-extrabold" style={{ color: meta.accent }}>
              {meta.name}
            </div>
            <div className="mt-0.5 text-xs font-bold uppercase tracking-widest text-white/40">
              How to play
            </div>
            <p className="mt-4 text-sm leading-relaxed text-white/80 sm:text-base">
              {HOW_TO[meta.id]}
            </p>
            <p className="mt-3 text-xs leading-relaxed text-white/45">
              <span className="font-semibold text-white/60">Controls: </span>
              {controlsHelp}
            </p>
            <p className="mt-3 text-xs leading-relaxed text-white/40">
              Answer a short study block to earn play time. Dying is free until the clock runs out.
              Tap an answer, or press its number key, to answer a question.
            </p>
            <button
              type="button"
              onClick={() => setInfoOpen(false)}
              className="mt-5 rounded-2xl px-8 py-3 text-base font-bold text-[#101020]"
              style={{ background: meta.accent }}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
