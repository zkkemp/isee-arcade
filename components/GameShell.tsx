'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QuestionGate from './QuestionGate';
import TouchControls from './TouchControls';
import type { GameApi, GameComponent, GameMeta } from '@/lib/games';
import { InputController, bindKeyboard } from '@/lib/input';
import { pickQuestion } from '@/lib/questions';
import type { Question } from '@/lib/questions/types';
import {
  emptyProgress,
  loadProgress,
  recentAccuracy,
  recordAnswer,
  recordHighScore,
  saveProgress,
  type Progress,
} from '@/lib/progress';

/** Points for a correct gate answer. Deliberately large enough to beat grinding. */
const CORRECT_REWARD = 50;
/** Correct answers can push lives this far above the game's starting count. */
const BONUS_LIFE_HEADROOM = 2;

type GateMode = 'reward' | 'revive';
type GateState = { question: Question; label: string; mode: GateMode };

export default function GameShell({ meta, Game }: { meta: GameMeta; Game: GameComponent }) {
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(meta.startingLives);
  const [gate, setGate] = useState<GateState | null>(null);
  const [over, setOver] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [restartToken, setRestartToken] = useState(0);
  const [bonusToken, setBonusToken] = useState(0);
  const [asked, setAsked] = useState(0);
  const [gotRight, setGotRight] = useState(0);
  const [progress, setProgress] = useState<Progress>(emptyProgress);
  const [best, setBest] = useState(0);

  // Refs mirror state that the game API touches, so the API object can stay
  // stable for the lifetime of the mount without going stale.
  const livesRef = useRef(meta.startingLives);
  const scoreRef = useRef(0);
  const progressRef = useRef<Progress>(emptyProgress());
  const gateOpenRef = useRef(false);
  const overRef = useRef(false);
  const seenIdsRef = useRef<string[]>([]);
  const seenPassagesRef = useRef<string[]>([]);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // One controller for the lifetime of the mount. useState (not a lazily
  // initialized ref) so nothing is written during render.
  const [input] = useState(() => new InputController());

  const maxLives = meta.startingLives + BONUS_LIFE_HEADROOM;

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

  const flashStatus = useCallback((text: string | null, ms = 1600) => {
    setStatus(text);
    if (statusTimer.current) clearTimeout(statusTimer.current);
    if (text) statusTimer.current = setTimeout(() => setStatus(null), ms);
  }, []);

  const openGate = useCallback((label: string, mode: GateMode) => {
    if (gateOpenRef.current || overRef.current) return;
    const p = progressRef.current;
    const question = pickQuestion({
      recentIds: seenIdsRef.current,
      recentPassageIds: seenPassagesRef.current,
      missed: p.missed,
      recentAccuracy: recentAccuracy(p),
    });

    seenIdsRef.current = [...seenIdsRef.current, question.id].slice(-30);
    if (question.passageId) {
      seenPassagesRef.current = [...seenPassagesRef.current, question.passageId].slice(-12);
    }

    // Drop any held keys so the player does not resume mid-move after answering.
    input.clear();
    gateOpenRef.current = true;
    setGate({ question, label, mode });
  }, [input]);

  const endGame = useCallback(() => {
    overRef.current = true;
    setOver(true);
    const updated = recordHighScore(progressRef.current, meta.id, scoreRef.current);
    progressRef.current = updated;
    setProgress(updated);
    setBest(updated.highScores[meta.id] ?? 0);
    saveProgress(updated);
  }, [meta.id]);

  const api = useMemo<GameApi>(
    () => ({
      addScore: (delta) => {
        scoreRef.current += delta;
        setScore(scoreRef.current);
      },
      lifeLost: () => {
        const remaining = livesRef.current - 1;
        livesRef.current = remaining;
        setLives(remaining);
        if (remaining <= 0) {
          openGate('Last life — answer right to get back in', 'revive');
        } else {
          flashStatus(`Ouch! ${remaining} ${remaining === 1 ? 'life' : 'lives'} left`);
        }
      },
      gameOver: endGame,
      requestGate: (label) => openGate(label, 'reward'),
      setStatus: (text) => flashStatus(text),
    }),
    [endGame, flashStatus, openGate],
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
      if (correct) setGotRight((n) => n + 1);

      gateOpenRef.current = false;
      setGate(null);

      if (g.mode === 'revive') {
        if (correct) {
          livesRef.current = 1;
          setLives(1);
          flashStatus('Nice! You earned your way back in.', 2000);
        } else {
          endGame();
        }
        return;
      }

      if (correct) {
        scoreRef.current += CORRECT_REWARD;
        setScore(scoreRef.current);
        if (livesRef.current < maxLives) {
          livesRef.current += 1;
          setLives(livesRef.current);
          setBonusToken((t) => t + 1);
          flashStatus(`+${CORRECT_REWARD} and an extra life!`, 2000);
        } else {
          flashStatus(`+${CORRECT_REWARD} points!`, 2000);
        }
      }
    },
    [endGame, flashStatus, gate, maxLives],
  );

  const restart = useCallback(() => {
    scoreRef.current = 0;
    livesRef.current = meta.startingLives;
    gateOpenRef.current = false;
    overRef.current = false;
    setScore(0);
    setLives(meta.startingLives);
    setGate(null);
    setOver(false);
    setAsked(0);
    setGotRight(0);
    setStatus(null);
    input.clear();
    setRestartToken((t) => t + 1);
  }, [input, meta.startingLives]);

  const paused = gate !== null || over;
  const sessionAccuracy = asked === 0 ? null : Math.round((gotRight / asked) * 100);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-3 pb-4 pt-3">
      {/* HUD */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <Link
          href="/"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-white/70 transition hover:bg-white/10"
          aria-label="Back to game list"
        >
          ←
        </Link>

        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="truncate text-sm font-bold text-white">{meta.name}</span>
          <span className="flex-shrink-0 text-xs text-white/40">best {best}</span>
        </div>

        <div className="flex flex-shrink-0 items-center gap-3">
          <div className="text-right">
            <div className="text-lg font-bold leading-none" style={{ color: meta.accent }}>
              {score}
            </div>
            <div className="text-[10px] uppercase tracking-widest text-white/35">score</div>
          </div>
          <div className="flex items-center gap-0.5" aria-label={`${lives} lives left`}>
            {Array.from({ length: Math.max(lives, 0) }).map((_, i) => (
              <span key={i} className="text-sm">
                ❤️
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Stage */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black shadow-xl">
        <Game
          paused={paused}
          input={input}
          api={api}
          restartToken={restartToken}
          bonusToken={bonusToken}
        />

        {status && !gate && !over && (
          <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full border border-white/20 bg-black/75 px-4 py-1.5 text-xs font-semibold text-white shadow-lg">
            {status}
          </div>
        )}

        {gate && (
          <QuestionGate
            // Remounting per question resets the gate's own state, so it never
            // needs an effect to clear a previous answer.
            key={gate.question.id}
            question={gate.question}
            label={gate.label}
            reward={CORRECT_REWARD}
            grantsLife={gate.mode === 'reward' && lives < maxLives}
            onAnswered={handleAnswered}
          />
        )}

        {over && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/85 p-6 text-center backdrop-blur-sm">
            <div className="text-4xl">{meta.icon}</div>
            <div>
              <div className="text-xs uppercase tracking-widest text-white/40">Game over</div>
              <div className="text-4xl font-bold" style={{ color: meta.accent }}>
                {score}
              </div>
              {score >= best && score > 0 && (
                <div className="mt-1 text-xs font-bold text-amber-300">New best score!</div>
              )}
            </div>

            <div className="text-sm text-white/60">
              {asked === 0
                ? 'No questions this round.'
                : `${gotRight} of ${asked} questions right (${sessionAccuracy}%)`}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={restart}
                className="rounded-xl px-5 py-2.5 text-sm font-bold text-[#101020]"
                style={{ background: meta.accent }}
              >
                Play again
              </button>
              <Link
                href="/"
                className="rounded-xl border border-white/20 px-5 py-2.5 text-sm font-semibold text-white/80 transition hover:bg-white/10"
              >
                Pick another game
              </Link>
            </div>
          </div>
        )}
      </div>

      <TouchControls scheme={meta.controls} input={input} accent={meta.accent} />

      <p className="mt-3 hidden text-center text-xs text-white/30 md:block">
        {meta.controls === 'run-jump'
          ? 'Arrow keys or A / D to move · Space to jump'
          : 'Arrow keys or W A S D to move'}
        {' · 1–4 to answer a question'}
      </p>

      {asked > 0 && (
        <p className="mt-2 text-center text-xs text-white/35">
          This round: {gotRight}/{asked} correct
          {progress.totalSeen > 0 && ` · ${progress.totalSeen} questions all time`}
        </p>
      )}
    </div>
  );
}
