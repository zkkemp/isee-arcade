'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CelebrationCard from './CelebrationCard';
import { useDailyLimit } from './DailyLimitProvider';
import DPad from './DPad';
import QuestionGate from './QuestionGate';
import RunJumpBar from './RunJumpBar';
import TouchOverlay from './TouchOverlay';
import { HOW_TO, type GameApi, type GameComponent, type GameMeta } from '@/lib/games';
import { useCharacter } from '@/lib/characters';
import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  type Difficulty,
  useGameDifficulty,
} from '@/lib/difficulty';
import { clearPendingGate, loadPendingGate, savePendingGate } from '@/lib/pendingGate';
import { InputController, bindKeyboard } from '@/lib/input';
import { bandHasReading, bandNeedsNarration, pickQuestion } from '@/lib/questions';
import type { Question, QuestionKind } from '@/lib/questions/types';
import { useActiveProfile } from '@/lib/profiles';
import { usePlayerMode } from '@/lib/playerMode';
import { useParentContentState } from '@/lib/parentControls';
import { smartFocusForProgress } from '@/lib/adaptivePractice';
import {
  playSound,
  unlockAudio,
  useGameMusic,
  useMusicEnabled,
  useMuted,
} from '@/lib/sound';
import {
  COIN_BONUS_MS,
  COIN_STEP,
  LEVEL_BONUS_MS,
  MAX_BONUS_MS,
  MAX_BLOCK_SIZE,
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
const READING_MISS_PENALTY = 5;

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

export default function GameShell({
  meta,
  Game,
  parentAccount = false,
}: {
  meta: GameMeta;
  Game: GameComponent;
  parentAccount?: boolean;
}) {
  const [difficulty, setDifficulty] = useGameDifficulty(meta.id);
  const [character] = useCharacter();
  const [muted, setMuted] = useMuted();
  const [musicEnabled, setMusicEnabled] = useMusicEnabled();
  const { deferLock, lockAtBoundary } = useDailyLimit();
  // Which learner is signed in decides which question bank the study block draws
  // from, so a kindergartner never gets a 5th-grade ISEE question.
  const activeProfile = useActiveProfile();
  const playerMode = usePlayerMode();
  const parentContent = useParentContentState();
  const parentSandbox = parentAccount || playerMode === 'parent';
  const band = activeProfile?.band ?? 'isee';
  const excludedContentKeys = useMemo(
    () =>
      parentContent.disabled
        .filter(
          (item) => item.learnerId === null || item.learnerId === activeProfile?.id,
        )
        .map((item) => item.contentKey),
    [activeProfile?.id, parentContent.disabled],
  );

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
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
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
  /** Level-clear card: the active learner's avatar and a congratulations. */
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

  // A game or question block should never disappear mid-action when the daily
  // clock reaches zero. The provider waits; a death, level/round completion, or
  // completed study block below is the safe boundary that activates the lock.
  useEffect(() => {
    if (parentSandbox) {
      deferLock(false);
      return;
    }
    deferLock(true);
    return () => deferLock(false);
  }, [deferLock, parentSandbox]);

  const controlsInset = meta.controls === 'run-jump' ? RUN_JUMP_INSET : 0;

  const flashStatus = useCallback((text: string | null, ms = 1700) => {
    setStatus(text);
    if (statusTimer.current) clearTimeout(statusTimer.current);
    if (text) statusTimer.current = setTimeout(() => setStatus(null), ms);
  }, []);

  const celebrate = useCallback((headline: string, note: string | null, ms = 2800) => {
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
    const focus =
      activeProfile?.smartPractice !== false && !retryOf
        ? smartFocusForProgress(p)
        : null;
    // Smart Practice is deliberately a nudge, not a takeover: at most three in
    // ten normal draws focus the weakest proven lane. The remaining mix stays
    // broad, and the existing adaptive difficulty keeps weak-lane questions
    // approachable.
    const useFocus = Boolean(focus && Math.random() < 0.3);
    // Reading turns up about one draw in eight, at most once per block, and never
    // on a retry. Only the ISEE bank has reading passages - the younger grade
    // banks are all short templated questions, so skip the reading logic there.
    const hasReading = bandHasReading(band);
    const wantReading =
      hasReading && !retryOf && !b.readingServed && Math.random() < READING_CHANCE;
    const avoid: QuestionKind[] = [];
    if (!wantReading && !retryOf) {
      if (hasReading) avoid.push('reading');
      if (lastKindRef.current) avoid.push(lastKindRef.current);
    }

    const question = pickQuestion({
      band,
      subjects: useFocus && focus ? [focus.subject] : undefined,
      recentIds: seenIdsRef.current,
      recentPassageIds: seenPassagesRef.current,
      missed: p.missed,
      recentAccuracy: recentAccuracy(p),
      vocabulary: p.vocabulary,
      vocabularyClock: p.totalSeen,
      sameKindAs: retryOf,
      forceKind: wantReading ? 'reading' : null,
      ...(useFocus && focus?.kind && !wantReading ? { forceKind: focus.kind } : {}),
      focusTopic: useFocus ? focus?.topic : null,
      targetDifficulty:
        useFocus && focus
          ? focus.accuracy < 0.5
            ? 1
            : 2
          : undefined,
      avoidKind: avoid.length > 0 ? avoid : null,
      excludedContentKeys,
    });

    // Keep enough history to cover the largest grade bank so the least-recently-
    // used picker can cycle the whole curriculum before a family repeats.
    seenIdsRef.current = [...seenIdsRef.current, question.id].slice(-1600);
    if (question.passageId) {
      seenPassagesRef.current = [...seenPassagesRef.current, question.passageId].slice(-14);
    }
    return question;
    },
    [activeProfile?.smartPractice, band, excludedContentKeys],
  );

  /** Opens the study block. Idempotent, so a tick and a death cannot double-fire it. */
  const openStudy = useCallback(
    (restored?: { question: Question; attempt: number }) => {
      if (parentSandbox) return;
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
    [drawFor, input, parentSandbox, persist],
  );

  // Hydrate progress and the play session, then either restore an owed question
  // or hand back whatever play time is left.
  useEffect(() => {
    const p = loadProgress();
    progressRef.current = p;
    setProgress(p);
    setBest(p.highScores[meta.id] ?? 0);

    if (parentSandbox) {
      gateOpenRef.current = false;
      setGate(null);
      setBlock(null);
      setMsLeft(0);
      return;
    }

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
  }, [meta.id, parentSandbox]);

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

  const paused = gate !== null || manualPause || rotate || infoOpen || mobileToolsOpen;
  useGameMusic(meta.music, !paused, musicEnabled, muted);

  /**
   * The play clock. Runs only while actually playing - not while a question is up,
   * not while paused, and not while the tab is hidden, since a backgrounded iPad
   * should not silently burn a window the kid never got to use.
   */
  useEffect(() => {
    if (paused || parentSandbox) return;
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
  }, [parentSandbox, paused, openStudy, persist]);

  /** Adds play time, respecting the per-window bonus ceiling. Returns what was granted. */
  const grantBonus = useCallback(
    (ms: number): number => {
      if (parentSandbox) return 0;
      const s = sessionRef.current;
      const room = Math.max(0, MAX_BONUS_MS - s.bonusMs);
      const give = Math.min(ms, room);
      if (give <= 0) return 0;
      sessionRef.current = { ...s, msLeft: s.msLeft + give, bonusMs: s.bonusMs + give };
      setMsLeft(sessionRef.current.msLeft);
      persist();
      return give;
    },
    [parentSandbox, persist],
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
        if (parentSandbox) {
          playSound('gameOver');
          flashStatus(`${label} - keep going`, 1500);
          return;
        }
        if (lockAtBoundary()) return;
        playSound('gameOver');
        flashStatus(`${label} - keep going`, 1500);
      },
      // Clearing a level tops the clock up instead of interrupting with a question.
      requestGate: (label) => {
        if (parentSandbox) {
          playSound('levelClear');
          celebrate(label, 'Parent free play');
          return;
        }
        if (lockAtBoundary()) return;
        playSound('levelClear');
        const given = grantBonus(LEVEL_BONUS_MS);
        celebrate(label, given > 0 ? `+${Math.round(given / 1000)} seconds of play time` : null);
      },
      setStatus: (text) => flashStatus(text),
    }),
    [celebrate, flashStatus, grantBonus, lockAtBoundary, parentSandbox],
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
        vocabulary: g.question.kind === 'synonym',
      });
      progressRef.current = updated;
      setProgress(updated);
      saveProgress(updated);

      setAsked((n) => n + 1);
      lastKindRef.current = g.question.kind;
      const wasReading = g.question.kind === 'reading';

      if (!correct) {
        correctStreakRef.current = 0;
        setCorrectStreak(0);
        wrongStreakRef.current += 1;

        let next = b;
        // Missing the reading passage is the expensive miss: it adds two
        // questions. This is what makes reading carefully worth it, in place of
        // the old "get it right and skip the block" shortcut.
        if (wasReading) {
          next = {
            ...next,
            penalty: Math.min(
              MAX_BLOCK_SIZE - next.target,
              next.penalty + READING_MISS_PENALTY,
            ),
          };
          flashStatus(
            `Missed the reading - ${READING_MISS_PENALTY} more questions added.`,
            2800,
          );
        } else if (wrongStreakRef.current >= WRONG_STREAK_PENALTY) {
          // Three wrong in a row adds a question. The bar lives on the block so a
          // restart cannot shake it off.
          wrongStreakRef.current = 0;
          next = {
            ...next,
            penalty: Math.min(MAX_BLOCK_SIZE - next.target, next.penalty + 1),
          };
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
      if (lockAtBoundary()) return;
      playSound('pass');
      flashStatus(
        `Study block done - ${Math.round(PLAY_WINDOW_MS / 60_000)} minutes of play!`,
        2800,
      );
    },
    [drawFor, flashStatus, gate, lockAtBoundary, meta.id, persist],
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

  const changeDifficulty = useCallback(
    (next: Difficulty) => {
      if (next === difficulty || gateOpenRef.current) return;
      restart();
      setDifficulty(next);
      flashStatus(`${DIFFICULTY_LABELS[next]} level — fresh start`, 2200);
    },
    [difficulty, flashStatus, restart, setDifficulty],
  );

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
  const gameListHref = parentSandbox ? '/?play=parent' : '/';

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
      data-game-shell
      className="relative flex h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-full flex-col overflow-hidden select-none"
      style={{ WebkitUserSelect: 'none', WebkitTouchCallout: 'none', userSelect: 'none' }}
      onPointerDown={unlockAudio}
    >
      {/* Phone play gets one compact row so the game begins near the top of the
          screen. Secondary tools move behind one clearly labelled menu. Wider
          screens keep the roomy two-row HUD. */}
      <header
        className="relative z-40 flex flex-shrink-0 flex-col border-b border-white/8 px-2 pt-1.5 pb-1.5 shadow-xl sm:gap-1.5 sm:px-5 sm:pt-2 sm:pb-3"
        style={{
          background: `radial-gradient(circle at 72% -30%, ${meta.accent}24, transparent 48%), linear-gradient(180deg, rgba(25,22,43,.98), rgba(12,11,22,.96))`,
        }}
      >
        <div className="flex items-center gap-1.5 sm:hidden">
          <Link
            href={gameListHref}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/[0.07] text-white/75 shadow-lg transition active:scale-95"
            aria-label="Back to game list"
          >
            ←
          </Link>

          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <span
              className="hidden h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border text-base shadow-lg min-[350px]:flex"
              style={{ borderColor: `${meta.accent}4d`, background: `${meta.accent}1f` }}
              aria-hidden="true"
            >
              {meta.icon}
            </span>
            <div className="truncate text-sm font-black leading-tight text-white">
              {meta.name}
            </div>
          </div>

          {!gate && (
            <div
              className={`flex h-11 min-w-11 flex-shrink-0 items-center justify-center rounded-xl border px-1.5 shadow-lg ${
                clockLow
                  ? 'animate-pulse border-amber-400/50 bg-amber-400/15'
                  : 'border-emerald-400/40 bg-emerald-400/10'
              }`}
              title={parentSandbox ? 'Parent free play has no time limit.' : 'Play time left. Answer questions to earn more.'}
            >
              <span
                className={`text-sm font-black leading-none tabular-nums ${
                  clockLow ? 'text-amber-300' : 'text-emerald-300'
                }`}
              >
                {parentSandbox ? '∞' : formatClock(msLeft)}
              </span>
            </div>
          )}

          <div className="flex h-11 min-w-11 flex-shrink-0 flex-col items-center justify-center rounded-xl bg-black/20 px-1">
            <div className="text-lg font-bold leading-none" style={{ color: meta.accent }}>
              {score}
            </div>
            <div className="text-[7px] font-bold uppercase tracking-wider text-white/35">score</div>
          </div>

          <button
            type="button"
            onClick={() => setMobileToolsOpen((open) => !open)}
            aria-label="Game tools"
            aria-expanded={mobileToolsOpen}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-lg font-black tracking-widest text-white/75 transition active:scale-95"
          >
            •••
          </button>
        </div>

        {mobileToolsOpen && (
          <>
            <button
              type="button"
              aria-label="Close game tools"
              className="fixed inset-0 z-40 cursor-default bg-transparent"
              onClick={() => setMobileToolsOpen(false)}
            />
            <div className="absolute right-2 top-full z-50 mt-2 max-h-[calc(100dvh-5.5rem)] w-72 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-2xl border border-white/15 bg-[#171528] p-2 text-sm text-white shadow-2xl">
              <div className="flex min-h-11 items-center justify-between rounded-xl bg-white/[0.055] px-3 text-white/60">
                <span>Best score</span>
                <strong className="text-white">{best}</strong>
              </div>
              <div className="mt-1 rounded-xl bg-white/[0.055] p-2.5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-semibold text-white/80">Game level</span>
                  <strong style={{ color: meta.accent }}>
                    {DIFFICULTY_LABELS[difficulty]}
                  </strong>
                </div>
                <div className="grid grid-cols-3 gap-1" role="group" aria-label="Game level">
                  {DIFFICULTIES.map((level) => {
                    const selected = level === difficulty;
                    return (
                      <button
                        key={level}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => {
                          changeDifficulty(level);
                          if (!selected) setMobileToolsOpen(false);
                        }}
                        className={`min-h-11 rounded-lg border px-1 text-xs font-bold transition active:scale-95 ${
                          selected
                            ? 'border-white/30 bg-white/15 text-white'
                            : 'border-white/10 bg-black/15 text-white/70 active:bg-white/10'
                        }`}
                        style={selected ? { borderColor: `${meta.accent}99`, color: meta.accent } : undefined}
                      >
                        {DIFFICULTY_LABELS[level]}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[11px] leading-tight text-white/70">
                  Saved for {meta.name}. Changing it restarts this game.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setInfoOpen(true);
                  setMobileToolsOpen(false);
                }}
                className="mt-1 flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left font-semibold text-white/80 active:bg-white/10"
              >
                <span aria-hidden="true">ⓘ</span> How to play
              </button>
              <button
                type="button"
                onClick={() => {
                  setMuted(!muted);
                  setMobileToolsOpen(false);
                }}
                className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left font-semibold text-white/80 active:bg-white/10"
              >
                <span aria-hidden="true">{muted ? '🔇' : '🔊'}</span>
                {muted ? 'Turn all audio on' : 'Mute all audio'}
              </button>
              {meta.music && (
                <button
                  type="button"
                  onClick={() => setMusicEnabled(!musicEnabled)}
                  disabled={muted}
                  className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left font-semibold text-white/80 active:bg-white/10 disabled:text-white/30"
                >
                  <span aria-hidden="true">♫</span>
                  {musicEnabled ? 'Turn music off' : 'Turn music on'}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setManualPause((value) => !value);
                  setMobileToolsOpen(false);
                }}
                className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left font-semibold text-white/80 active:bg-white/10"
              >
                <span aria-hidden="true">{manualPause ? '▶' : '❚❚'}</span>
                {manualPause ? 'Resume game' : 'Pause game'}
              </button>
              <button
                type="button"
                onClick={() => {
                  restart();
                  setMobileToolsOpen(false);
                }}
                className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left font-semibold text-white/80 active:bg-white/10"
              >
                <span aria-hidden="true">↻</span> Restart game
              </button>
            </div>
          </>
        )}

        <div className="hidden items-center gap-3 sm:flex">
          <Link
            href={gameListHref}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.07] text-lg text-white/75 shadow-lg transition hover:bg-white/10 active:scale-95"
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
              <div className="truncate text-xl font-black leading-tight text-white">{meta.name}</div>
              {isRemaster && (
                <div className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-300">
                  New edition · original preserved
                </div>
              )}
            </div>
          </div>

          {!gate && (
            <div
              className={`flex flex-shrink-0 items-center gap-1.5 rounded-2xl border px-3.5 py-1.5 shadow-lg ${
                clockLow
                  ? 'animate-pulse border-amber-400/50 bg-amber-400/15'
                  : 'border-emerald-400/40 bg-emerald-400/10'
              }`}
              title={parentSandbox ? 'Parent free play has no time limit.' : 'Play time left. Answer questions to earn more.'}
            >
              <span className="text-base font-black">{parentSandbox ? '∞' : '⏱'}</span>
              <span className="text-right">
                <span className="block text-[8px] font-bold uppercase tracking-widest text-white/45">
                  {parentSandbox ? 'parent mode' : 'play time'}
                </span>
                <span
                  className={`block text-lg font-black leading-none tabular-nums ${
                    clockLow ? 'text-amber-300' : 'text-emerald-300'
                  }`}
                >
                  {parentSandbox ? 'Unlimited' : formatClock(msLeft)}
                </span>
              </span>
            </div>
          )}

          <div className="flex-shrink-0 rounded-xl bg-black/20 px-2 py-1 text-right">
            <div className="text-3xl font-bold leading-none" style={{ color: meta.accent }}>
              {score}
            </div>
            <div className="text-xs uppercase tracking-widest text-white/35">score</div>
          </div>
        </div>

        <div className="hidden items-center gap-2 pt-0.5 sm:flex">
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

          <label className="flex h-11 flex-shrink-0 items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-2 text-xs font-semibold text-white/60">
            <span className="hidden lg:inline">Level</span>
            <select
              value={difficulty}
              onChange={(event) => changeDifficulty(event.target.value as Difficulty)}
              aria-label={`Game level for ${meta.name}`}
              className="min-w-0 bg-transparent font-bold text-white outline-none"
              style={{ colorScheme: 'dark' }}
            >
              {DIFFICULTIES.map((level) => (
                <option key={level} value={level}>
                  {DIFFICULTY_LABELS[level]}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => setInfoOpen((v) => !v)}
            aria-label="How to play"
            className="flex h-11 flex-shrink-0 items-center gap-1 rounded-xl border border-white/15 bg-white/5 px-2.5 text-xs font-semibold text-white/75 transition hover:bg-white/10 active:scale-95 sm:text-sm"
          >
            ⓘ How to play
          </button>

          <button
            type="button"
            onClick={() => setMuted(!muted)}
            aria-label={muted ? 'Unmute' : 'Mute'}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-sm text-white/75 transition hover:bg-white/10 active:scale-95"
          >
            {muted ? '🔇' : '🔊'}
          </button>

          {meta.music && (
            <button
              type="button"
              onClick={() => setMusicEnabled(!musicEnabled)}
              disabled={muted}
              aria-label={musicEnabled ? 'Turn music off' : 'Turn music on'}
              title={musicEnabled ? 'Turn music off' : 'Turn music on'}
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-lg text-white/75 transition hover:bg-white/10 active:scale-95 disabled:text-white/25"
            >
              {musicEnabled ? '♫' : '♩'}
            </button>
          )}

          <button
            type="button"
            onClick={() => setManualPause((v) => !v)}
            aria-label={manualPause ? 'Resume' : 'Pause'}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-sm text-white/75 transition hover:bg-white/10 active:scale-95"
          >
            {manualPause ? '▶' : '❚❚'}
          </button>

          <button
            type="button"
            onClick={restart}
            className="flex h-11 flex-shrink-0 items-center rounded-xl border border-white/15 bg-white/5 px-2.5 text-xs font-semibold text-white/70 transition hover:bg-white/10 active:scale-95 sm:px-4 sm:text-sm"
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
          role="application"
          aria-label={`${meta.name} game`}
          aria-describedby={`game-instructions-${meta.id}`}
          style={{
            borderColor: `${meta.accent}4d`,
            boxShadow: `0 24px 70px rgba(0,0,0,.5), 0 0 36px ${meta.accent}18, inset 0 1px rgba(255,255,255,.12)`,
          }}
        >
          <p id={`game-instructions-${meta.id}`} className="sr-only">
            {meta.tagline} {controlsHelp}
          </p>
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
                {parentSandbox
                  ? 'Parent free play — no questions or time limit'
                  : `Clock stopped - ${formatClock(msLeft)} of play left`}
              </div>
              <button
                type="button"
                onClick={() => setManualPause(false)}
                className="rounded-2xl px-8 py-4 text-base font-bold text-[#101020] sm:px-12 sm:py-5 sm:text-xl"
                style={{ background: meta.accent }}
              >
                Resume
              </button>
              <Link
                href={gameListHref}
                className="text-xs font-semibold text-white/50 underline sm:text-sm"
              >
                Quit to menu
              </Link>
            </div>
          )}

          {celebration && !gate && !manualPause && (
            <CelebrationCard
              headline={celebration.headline}
              note={celebration.note}
              accent={meta.accent}
              character={character}
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
              narrate={bandNeedsNarration(band)}
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
        <p className="flex-shrink-0 pb-1 text-center text-[11px] text-white/20 sm:text-sm">
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
              {parentSandbox
                ? 'Parent free play is active. Play as long as you want; no questions, time limits, or child progress are used.'
                : 'Answer a short study block to earn play time. Dying is free until the clock runs out. Tap an answer, or press its number key, to answer a question.'}
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
