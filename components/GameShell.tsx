'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CelebrationCard from './CelebrationCard';
import QuestionGate from './QuestionGate';
import RunJumpBar from './RunJumpBar';
import TouchOverlay from './TouchOverlay';
import type { GameApi, GameComponent, GameMeta } from '@/lib/games';
import { useCharacter } from '@/lib/characters';
import { useDifficulty } from '@/lib/difficulty';
import { clearPendingGate, loadPendingGate, savePendingGate } from '@/lib/pendingGate';
import { InputController, bindKeyboard } from '@/lib/input';
import { pickQuestion } from '@/lib/questions';
import type { Question, QuestionKind } from '@/lib/questions/types';
import { playSound, unlockAudio, useMuted } from '@/lib/sound';
import {
  BLOCK_SIZE,
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

  const celebrate = useCallback((headline: string, note: string | null, ms = 2400) => {
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
  const drawFor = useCallback((b: StudyBlock, retryOf: Question | null): Question => {
    const p = progressRef.current;
    // Reading turns up about one draw in eight, at most once per block, and never
    // on a retry. Everything else rotates away from reading and from the last
    // kind answered, so passages stay rare and sections keep changing.
    const wantReading = !retryOf && !b.readingServed && Math.random() < READING_CHANCE;
    const avoid: QuestionKind[] = [];
    if (!wantReading && !retryOf) {
      avoid.push('reading');
      if (lastKindRef.current) avoid.push(lastKindRef.current);
    }

    const question = pickQuestion({
      recentIds: seenIdsRef.current,
      recentPassageIds: seenPassagesRef.current,
      missed: p.missed,
      recentAccuracy: recentAccuracy(p),
      sameKindAs: retryOf,
      forceKind: wantReading ? 'reading' : null,
      avoidKind: avoid.length > 0 ? avoid : null,
    });

    seenIdsRef.current = [...seenIdsRef.current, question.id].slice(-40);
    if (question.passageId) {
      seenPassagesRef.current = [...seenPassagesRef.current, question.passageId].slice(-14);
    }
    return question;
  }, []);

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

  const paused = gate !== null || manualPause;

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
        // Three wrong in a row adds a question. The bar lives on the block so a
        // restart cannot shake it off.
        if (wrongStreakRef.current >= WRONG_STREAK_PENALTY) {
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

      const next: StudyBlock = {
        ...b,
        correct: b.correct + 1,
        readingWon: b.readingWon || wasReading,
      };
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
        next.readingWon && wasReading
          ? `Nailed the reading - ${Math.round(PLAY_WINDOW_MS / 60_000)} minutes of play!`
          : `Study block done - ${Math.round(PLAY_WINDOW_MS / 60_000)} minutes of play!`,
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
      return `Get this one right and you are straight back in - no other questions. Otherwise it is ${BLOCK_SIZE} short ones.`;
    }
    if (gate.isRetry) return 'Same kind again, since that one was missed.';
    if (left === 1) return 'Last one, then 6 minutes of play.';
    return `${left} more, then 6 minutes of play. They do not have to be in a row.`;
  })();

  const clockLow = msLeft > 0 && msLeft < 60_000;

  return (
    <div
      className="flex h-dvh w-full flex-col overflow-hidden"
      onPointerDown={unlockAudio}
    >
      {/* HUD. Sizes step up on iPad, where the phone-sized bar looked lost. */}
      <header className="flex flex-shrink-0 items-center gap-2.5 px-3 pt-[max(0.4rem,env(safe-area-inset-top))] pb-1.5 sm:gap-3 sm:px-5 sm:pb-2.5">
        <Link
          href="/"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-white/70 transition active:scale-95 sm:h-11 sm:w-11 sm:text-lg"
          aria-label="Back to game list"
        >
          ←
        </Link>

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold leading-tight text-white sm:text-lg">
            {meta.name}
          </div>
          <div className="flex items-center gap-2 text-[11px] leading-tight text-white/40 sm:gap-3 sm:text-sm">
            <span>best {best}</span>
            {asked > 0 && (
              <span>
                {gotRight}/{asked} right
              </span>
            )}
            {correctStreak > 1 && (
              <span className="text-amber-300/90">{correctStreak} streak</span>
            )}
          </div>
        </div>

        {/* Play clock. The one thing that ends a window, so it is never hidden. */}
        {!gate && (
          <div
            className={`flex flex-shrink-0 items-center gap-1.5 rounded-xl border px-2.5 py-1 sm:px-3.5 sm:py-1.5 ${
              clockLow
                ? 'animate-pulse border-amber-400/50 bg-amber-400/15'
                : 'border-emerald-400/40 bg-emerald-400/10'
            }`}
            title="Play time left. Answer questions to earn more."
          >
            <span className="text-sm sm:text-base">⏱</span>
            <span
              className={`text-sm font-bold tabular-nums sm:text-lg ${
                clockLow ? 'text-amber-300' : 'text-emerald-300'
              }`}
            >
              {formatClock(msLeft)}
            </span>
          </div>
        )}

        <div className="flex-shrink-0 text-right">
          <div
            className="text-xl font-bold leading-none sm:text-3xl"
            style={{ color: meta.accent }}
          >
            {score}
          </div>
          <div className="text-[10px] uppercase tracking-widest text-white/35 sm:text-xs">
            score
          </div>
        </div>

        <button
          type="button"
          onClick={() => setMuted(!muted)}
          aria-label={muted ? 'Unmute' : 'Mute'}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-sm text-white/75 transition active:scale-95 sm:h-11 sm:w-11 sm:text-base"
        >
          {muted ? '🔇' : '🔊'}
        </button>

        <button
          type="button"
          onClick={() => setManualPause((v) => !v)}
          aria-label={manualPause ? 'Resume' : 'Pause'}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-sm text-white/75 transition active:scale-95 sm:h-11 sm:w-11 sm:text-base"
        >
          {manualPause ? '▶' : '❚❚'}
        </button>

        <button
          type="button"
          onClick={restart}
          className="flex h-9 flex-shrink-0 items-center rounded-xl border border-white/15 bg-white/5 px-2.5 text-xs font-semibold text-white/70 transition active:scale-95 sm:h-11 sm:px-4 sm:text-sm"
        >
          Restart
        </button>
      </header>

      {/* Stage. The canvas fills everything above the control strip; a portrait
          screen cannot show both a useful view width and little sky, so games lay
          out against the size they are given rather than a fixed aspect. */}
      <div className="relative flex min-h-0 flex-1 flex-col px-2 pb-1 sm:px-5 sm:pb-3">
        <div className="relative w-full flex-1 overflow-hidden rounded-2xl bg-black shadow-2xl sm:rounded-3xl">
          <Game
            paused={paused}
            input={input}
            api={api}
            restartToken={restartToken}
            difficulty={difficulty}
            character={character}
            controlsInset={controlsInset}
          />

          <TouchOverlay
            scheme={meta.controls}
            input={input}
            accent={meta.accent}
            disabled={paused}
          />

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
              onAnswered={handleAnswered}
            />
          )}
        </div>

        {meta.controls === 'run-jump' && (
          <div className="pt-2 sm:pt-3">
            <RunJumpBar input={input} accent={meta.accent} disabled={paused} />
          </div>
        )}
      </div>

      <p className="hidden flex-shrink-0 pb-1 text-center text-xs text-white/25 md:block">
        {meta.controls === 'run-jump'
          ? 'Arrow keys or A / D to move · Space to jump'
          : meta.controls === 'grid'
            ? 'Tap and drag on the board'
            : 'Arrow keys or W A S D to move'}
        {' · 1–4 to answer'}
      </p>

      {progress.totalSeen > 0 && (
        <p className="flex-shrink-0 pb-[max(0.2rem,env(safe-area-inset-bottom))] text-center text-[11px] text-white/20 sm:text-sm">
          {progress.totalSeen} answered all time
          {sessionAccuracy !== null && ` · ${sessionAccuracy}% this run`}
        </p>
      )}
    </div>
  );
}
