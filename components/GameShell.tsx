'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QuestionGate from './QuestionGate';
import TouchOverlay from './TouchOverlay';
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

/** Points for answering a gate question correctly. */
const CORRECT_REWARD = 50;

/** Why the game stopped to ask. */
type GateReason = 'death' | 'level';

type Gate = {
  question: Question;
  reason: GateReason;
  label: string;
  /** 1 for the first question, 2 after one wrong answer, and so on. */
  attempt: number;
};

export default function GameShell({ meta, Game }: { meta: GameMeta; Game: GameComponent }) {
  const [score, setScore] = useState(0);
  const [gate, setGate] = useState<Gate | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [restartToken, setRestartToken] = useState(0);
  const [asked, setAsked] = useState(0);
  const [gotRight, setGotRight] = useState(0);
  const [progress, setProgress] = useState<Progress>(emptyProgress);
  const [best, setBest] = useState(0);

  // Refs mirror what the game API touches, so the API object stays stable for
  // the lifetime of the mount without going stale.
  const scoreRef = useRef(0);
  const progressRef = useRef<Progress>(emptyProgress());
  const gateOpenRef = useRef(false);
  const seenIdsRef = useRef<string[]>([]);
  const seenPassagesRef = useRef<string[]>([]);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [input] = useState(() => new InputController());

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

  /** Draws a question, recording it so the same one is not served twice in a row. */
  const draw = useCallback((sameKindAs: Question | null = null) => {
    const p = progressRef.current;
    const question = pickQuestion({
      recentIds: seenIdsRef.current,
      recentPassageIds: seenPassagesRef.current,
      missed: p.missed,
      recentAccuracy: recentAccuracy(p),
      sameKindAs,
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
      died: (label = 'You crashed') => openGate('death', label),
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
      if (correct) setGotRight((n) => n + 1);

      if (!correct) {
        // Stay on it. Another question of the same kind — for templated math that
        // is the same shape with new numbers, so there is no way through except
        // actually doing it.
        setGate({
          question: draw(g.question),
          reason: g.reason,
          label: g.label,
          attempt: g.attempt + 1,
        });
        return;
      }

      scoreRef.current += CORRECT_REWARD;
      setScore(scoreRef.current);

      const banked = recordHighScore(progressRef.current, meta.id, scoreRef.current);
      progressRef.current = banked;
      setProgress(banked);
      setBest(banked.highScores[meta.id] ?? 0);
      saveProgress(banked);

      gateOpenRef.current = false;
      setGate(null);
      flashStatus(
        g.reason === 'death' ? `+${CORRECT_REWARD} — back in!` : `+${CORRECT_REWARD} — next level!`,
        1800,
      );
    },
    [draw, flashStatus, gate, meta.id],
  );

  const restart = useCallback(() => {
    scoreRef.current = 0;
    gateOpenRef.current = false;
    setScore(0);
    setGate(null);
    setAsked(0);
    setGotRight(0);
    setStatus(null);
    input.clear();
    setRestartToken((t) => t + 1);
  }, [input]);

  const paused = gate !== null;
  const sessionAccuracy = asked === 0 ? null : Math.round((gotRight / asked) * 100);

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden">
      {/* HUD */}
      <header className="flex flex-shrink-0 items-center gap-3 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
        <Link
          href="/"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-white/70 transition active:scale-95"
          aria-label="Back to game list"
        >
          ←
        </Link>

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold leading-tight text-white">{meta.name}</div>
          <div className="text-[11px] leading-tight text-white/40">
            best {best}
            {asked > 0 && ` · ${gotRight}/${asked} right`}
          </div>
        </div>

        <div className="flex-shrink-0 text-right">
          <div className="text-xl font-bold leading-none" style={{ color: meta.accent }}>
            {score}
          </div>
          <div className="text-[10px] uppercase tracking-widest text-white/35">score</div>
        </div>

        <button
          type="button"
          onClick={restart}
          className="flex h-9 flex-shrink-0 items-center rounded-xl border border-white/15 bg-white/5 px-3 text-xs font-semibold text-white/70 transition active:scale-95"
        >
          Restart
        </button>
      </header>

      {/* Stage — grows to fill whatever is left, canvas scales to fit inside it */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2">
        <div
          className="relative overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl"
          style={{
            aspectRatio: `${meta.aspect}`,
            maxWidth: '100%',
            maxHeight: '100%',
          }}
        >
          <Game
            paused={paused}
            input={input}
            api={api}
            restartToken={restartToken}
            bonusToken={0}
          />

          <TouchOverlay
            scheme={meta.controls}
            input={input}
            accent={meta.accent}
            disabled={paused}
          />

          {status && !gate && (
            <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full border border-white/20 bg-black/75 px-4 py-1.5 text-xs font-semibold text-white shadow-lg">
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
              headline={gate.reason === 'death' ? gate.label : gate.label}
              subhead={
                gate.attempt === 1
                  ? gate.reason === 'death'
                    ? 'Answer one question to get back in.'
                    : 'Answer one question to move on.'
                  : `Try another one — attempt ${gate.attempt}.`
              }
              reward={CORRECT_REWARD}
              onAnswered={handleAnswered}
            />
          )}
        </div>
      </div>


      <p className="hidden flex-shrink-0 pb-2 text-center text-xs text-white/25 md:block">
        {meta.controls === 'run-jump'
          ? 'Arrow keys or A / D to move · Space to jump'
          : 'Arrow keys or W A S D to move'}
        {' · 1–4 to answer'}
      </p>

      {progress.totalSeen > 0 && (
        <p className="flex-shrink-0 pb-[max(0.25rem,env(safe-area-inset-bottom))] text-center text-[11px] text-white/20">
          {progress.totalSeen} questions answered all time
          {sessionAccuracy !== null && ` · ${sessionAccuracy}% this run`}
        </p>
      )}
    </div>
  );
}
