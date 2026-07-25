'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QuestionGate from './QuestionGate';
import TouchOverlay from './TouchOverlay';
import type { GameApi, GameComponent, GameMeta } from '@/lib/games';
import { useDifficulty } from '@/lib/difficulty';
import { InputController, bindKeyboard } from '@/lib/input';
import { pickQuestion } from '@/lib/questions';
import type { Question, QuestionKind } from '@/lib/questions/types';
import {
  emptyProgress,
  loadProgress,
  recentAccuracy,
  recordAnswer,
  recordHighScore,
  saveProgress,
  type Progress,
} from '@/lib/progress';

/** Points for answering a gate question correctly. */
const CORRECT_REWARD = 50;

/**
 * Free passes granted for getting a READING question right. A passage is long, so
 * it earns more than a synonym does — otherwise the rational move is to guess on
 * reading and hope for something short next time.
 */
const READING_PASSES = 2;
/** Correct answers in a row that earn one free pass. */
const STREAK_FOR_PASS = 3;
/**
 * Correct answers required before play resumes. Two rather than one, because the
 * point of this app is the studying, not the game. They do NOT have to be
 * consecutive - a wrong answer in between costs another question of that kind but
 * does not reset progress toward the two.
 */
const OWED_BASE = 2;
/** Wrong answers in a row after which one extra correct answer is required. */
const WRONG_STREAK_PENALTY = 3;

/** Screen pixels the run/jump buttons occupy. Games keep gameplay above this. */
const RUN_JUMP_INSET = 118;

type GateReason = 'death' | 'level';

type Gate = {
  question: Question;
  reason: GateReason;
  label: string;
  /** 1 for the first question, 2 after one wrong answer, and so on. */
  attempt: number;
};

export default function GameShell({ meta, Game }: { meta: GameMeta; Game: GameComponent }) {
  const [difficulty] = useDifficulty();

  const [score, setScore] = useState(0);
  const [gate, setGate] = useState<Gate | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [restartToken, setRestartToken] = useState(0);
  const [asked, setAsked] = useState(0);
  const [gotRight, setGotRight] = useState(0);
  const [progress, setProgress] = useState<Progress>(emptyProgress);
  const [best, setBest] = useState(0);

  /** Deaths that can be shrugged off without a question. */
  const [passes, setPasses] = useState(0);
  const [correctStreak, setCorrectStreak] = useState(0);
  /** Correct answers still required before play resumes. */
  const [owed, setOwed] = useState(OWED_BASE);
  /** Manual pause, separate from a question gate. */
  const [manualPause, setManualPause] = useState(false);

  // Refs mirror what the game API and callbacks touch, so the API object stays
  // stable for the lifetime of the mount without going stale.
  const scoreRef = useRef(0);
  const progressRef = useRef<Progress>(emptyProgress());
  const gateOpenRef = useRef(false);
  const passesRef = useRef(0);
  const correctStreakRef = useRef(0);
  const wrongStreakRef = useRef(0);
  const owedRef = useRef(OWED_BASE);
  const seenIdsRef = useRef<string[]>([]);
  const seenPassagesRef = useRef<string[]>([]);
  /** Kind of the last question answered, so the next one rotates away from it. */
  const lastKindRef = useRef<QuestionKind | null>(null);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [input] = useState(() => new InputController());

  const controlsInset = meta.controls === 'run-jump' ? RUN_JUMP_INSET : 0;

  useEffect(() => {
    const p = loadProgress();
    progressRef.current = p;
    setProgress(p);
    setBest(p.highScores[meta.id] ?? 0);
  }, [meta.id]);

  useEffect(() => bindKeyboard(input), [input]);

  useEffect(
    () => () => {
      if (statusTimer.current) clearTimeout(statusTimer.current);
    },
    [],
  );

  const flashStatus = useCallback((text: string | null, ms = 1700) => {
    setStatus(text);
    if (statusTimer.current) clearTimeout(statusTimer.current);
    if (text) statusTimer.current = setTimeout(() => setStatus(null), ms);
  }, []);

  /**
   * Draws a question. `sameKindAs` keeps them on something they just missed;
   * otherwise the last kind answered is avoided so sections rotate.
   */
  const draw = useCallback((sameKindAs: Question | null = null) => {
    const p = progressRef.current;
    const question = pickQuestion({
      recentIds: seenIdsRef.current,
      recentPassageIds: seenPassagesRef.current,
      missed: p.missed,
      recentAccuracy: recentAccuracy(p),
      sameKindAs,
      avoidKind: sameKindAs ? null : lastKindRef.current,
    });
    seenIdsRef.current = [...seenIdsRef.current, question.id].slice(-40);
    if (question.passageId) {
      seenPassagesRef.current = [...seenPassagesRef.current, question.passageId].slice(-14);
    }
    return question;
  }, []);

  const openGate = useCallback(
    (reason: GateReason, label: string) => {
      if (gateOpenRef.current) return;
      // Drop held keys so the player does not resume mid-move after answering.
      input.clear();
      gateOpenRef.current = true;
      owedRef.current = OWED_BASE;
      setOwed(OWED_BASE);
      setGate({ question: draw(null), reason, label, attempt: 1 });
    },
    [draw, input],
  );

  const api = useMemo<GameApi>(
    () => ({
      addScore: (delta) => {
        scoreRef.current += delta;
        setScore(scoreRef.current);
      },
      died: (label = 'You crashed') => {
        // A free pass, earned by a reading answer or a 3-answer streak, lets the
        // death slide without a question.
        if (passesRef.current > 0) {
          passesRef.current -= 1;
          setPasses(passesRef.current);
          flashStatus(
            `Free pass used - ${passesRef.current} left`,
            1900,
          );
          return;
        }
        openGate('death', label);
      },
      requestGate: (label) => openGate('level', label),
      setStatus: (text) => flashStatus(text),
    }),
    [flashStatus, openGate],
  );

  const handleAnswered = useCallback(
    (correct: boolean) => {
      const g = gate;
      if (!g) return;

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

      if (!correct) {
        correctStreakRef.current = 0;
        setCorrectStreak(0);
        wrongStreakRef.current += 1;

        // Three wrong in a row raises the bar: two correct answers to resume.
        let note = '';
        if (
          wrongStreakRef.current >= WRONG_STREAK_PENALTY &&
          owedRef.current < OWED_BASE + 1
        ) {
          owedRef.current = OWED_BASE + 1;
          setOwed(owedRef.current);
          note = `${owedRef.current} right answers needed now.`;
        }
        if (note) flashStatus(note.trim(), 2600);

        // Same kind again — for templated math that is the same shape with new
        // numbers, so there is no way through but to actually do it.
        setGate({
          question: draw(g.question),
          reason: g.reason,
          label: g.label,
          attempt: g.attempt + 1,
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

      let earned = 0;
      const rewards: string[] = [];
      if (g.question.kind === 'reading') {
        earned += READING_PASSES;
        rewards.push(`+${READING_PASSES} free passes for the reading`);
      }
      if (correctStreakRef.current % STREAK_FOR_PASS === 0) {
        earned += 1;
        rewards.push(`${correctStreakRef.current} in a row - +1 free pass`);
      }
      if (earned > 0) {
        passesRef.current += earned;
        setPasses(passesRef.current);
      }

      owedRef.current -= 1;
      setOwed(Math.max(0, owedRef.current));

      if (owedRef.current > 0) {
        // Still owed one — rotate to a different kind rather than repeating.
        setGate({
          question: draw(null),
          reason: g.reason,
          label: g.label,
          attempt: g.attempt + 1,
        });
        return;
      }

      const banked = recordHighScore(progressRef.current, meta.id, scoreRef.current);
      progressRef.current = banked;
      setProgress(banked);
      setBest(banked.highScores[meta.id] ?? 0);
      saveProgress(banked);

      gateOpenRef.current = false;
      setGate(null);
      flashStatus(
        rewards.length > 0
          ? rewards.join(' - ')
          : g.reason === 'death'
            ? `+${CORRECT_REWARD} - back in!`
            : `+${CORRECT_REWARD} - next level!`,
        rewards.length > 0 ? 2600 : 1800,
      );
    },
    [draw, flashStatus, gate, meta.id],
  );

  const restart = useCallback(() => {
    scoreRef.current = 0;
    gateOpenRef.current = false;
    passesRef.current = 0;
    correctStreakRef.current = 0;
    wrongStreakRef.current = 0;
    owedRef.current = OWED_BASE;
    lastKindRef.current = null;
    setScore(0);
    setGate(null);
    setAsked(0);
    setGotRight(0);
    setStatus(null);
    setPasses(0);
    setCorrectStreak(0);
    setOwed(OWED_BASE);
    setManualPause(false);
    input.clear();
    setRestartToken((t) => t + 1);
  }, [input]);

  const paused = gate !== null || manualPause;
  const sessionAccuracy = asked === 0 ? null : Math.round((gotRight / asked) * 100);

  const subhead = (() => {
    if (!gate) return '';
    if (owed > 1) return `${owed} more to go - they do not have to be in a row.`;
    if (gate.attempt > 1) return 'Last one. Same kind, since that one was missed.';
    return 'One more to go.';
  })();

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden">
      {/* HUD */}
      <header className="flex flex-shrink-0 items-center gap-2.5 px-3 pt-[max(0.4rem,env(safe-area-inset-top))] pb-1.5">
        <Link
          href="/"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-white/70 transition active:scale-95"
          aria-label="Back to game list"
        >
          ←
        </Link>

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold leading-tight text-white">{meta.name}</div>
          <div className="flex items-center gap-2 text-[11px] leading-tight text-white/40">
            <span>best {best}</span>
            {asked > 0 && <span>{gotRight}/{asked} right</span>}
            {correctStreak > 1 && (
              <span className="text-amber-300/90">{correctStreak} streak</span>
            )}
          </div>
        </div>

        {passes > 0 && (
          <div
            className="flex flex-shrink-0 items-center gap-1 rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-2 py-1"
            title="Free passes: a death costs one of these instead of a question"
          >
            <span className="text-sm">🛡️</span>
            <span className="text-sm font-bold text-emerald-300">{passes}</span>
          </div>
        )}

        <div className="flex-shrink-0 text-right">
          <div className="text-xl font-bold leading-none" style={{ color: meta.accent }}>
            {score}
          </div>
          <div className="text-[10px] uppercase tracking-widest text-white/35">score</div>
        </div>

        <button
          type="button"
          onClick={() => setManualPause((v) => !v)}
          aria-label={manualPause ? 'Resume' : 'Pause'}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-sm text-white/75 transition active:scale-95"
        >
          {manualPause ? '▶' : '❚❚'}
        </button>

        <button
          type="button"
          onClick={restart}
          className="flex h-9 flex-shrink-0 items-center rounded-xl border border-white/15 bg-white/5 px-2.5 text-xs font-semibold text-white/70 transition active:scale-95"
        >
          Restart
        </button>
      </header>

      {/* Stage — fills every pixel left over. Each game decides what to do with
          the space: the platformer widens its view, the grid games centre a board. */}
      <div className="relative min-h-0 flex-1 px-2 pb-2">
        <div className="relative h-full w-full overflow-hidden rounded-2xl bg-black shadow-2xl">
          <Game
            paused={paused}
            input={input}
            api={api}
            restartToken={restartToken}
            difficulty={difficulty}
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
              <div className="text-sm font-bold uppercase tracking-widest text-white/60">
                Paused
              </div>
              <button
                type="button"
                onClick={() => setManualPause(false)}
                className="rounded-2xl px-8 py-4 text-base font-bold text-[#101020]"
                style={{ background: meta.accent }}
              >
                Resume
              </button>
              <Link href="/" className="text-xs font-semibold text-white/50 underline">
                Quit to menu
              </Link>
            </div>
          )}

          {status && !gate && !manualPause && (
            <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full border border-white/20 bg-black/75 px-4 py-1.5 text-center text-xs font-semibold text-white shadow-lg">
              {status}
            </div>
          )}

          {gate && (
            <QuestionGate
              // Remounting per attempt resets the gate's own state, and the
              // attempt number is part of the key because a templated retry
              // reuses the same question id.
              key={`${gate.question.id}-${gate.attempt}`}
              question={gate.question}
              headline={gate.label}
              subhead={subhead}
              reward={CORRECT_REWARD}
              onAnswered={handleAnswered}
            />
          )}
        </div>
      </div>

      <p className="hidden flex-shrink-0 pb-1 text-center text-xs text-white/25 md:block">
        {meta.controls === 'run-jump'
          ? 'Arrow keys or A / D to move · Space to jump'
          : 'Arrow keys or W A S D to move'}
        {' · 1–4 to answer'}
      </p>

      {progress.totalSeen > 0 && (
        <p className="flex-shrink-0 pb-[max(0.2rem,env(safe-area-inset-bottom))] text-center text-[11px] text-white/20">
          {progress.totalSeen} answered all time
          {sessionAccuracy !== null && ` · ${sessionAccuracy}% this run`}
        </p>
      )}
    </div>
  );
}
