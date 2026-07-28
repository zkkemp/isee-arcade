'use client';

import { useEffect, useMemo, useState } from 'react';
import type { GameCanvasProps } from '@/lib/games';
import { playSound } from '@/lib/sound';

export type ConstellationStar = {
  id: number;
  x: number;
  y: number;
};

function seeded(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

/** Creates a repeatable star field with enough separation for reliable touch targets. */
export function createConstellation(count: number, seed: number): ConstellationStar[] {
  const random = seeded(seed || 1);
  const stars: ConstellationStar[] = [];
  for (let id = 1; id <= count; id += 1) {
    let candidate = { id, x: 16 + random() * 68, y: 18 + random() * 64 };
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const clear = stars.every(
        (star) => Math.hypot(star.x - candidate.x, star.y - candidate.y) >= 15,
      );
      if (clear) break;
      candidate = { id, x: 16 + random() * 68, y: 18 + random() * 64 };
    }
    stars.push(candidate);
  }
  return stars;
}

export function starCountForRound(round: number, difficulty: GameCanvasProps['difficulty']): number {
  const base = difficulty === 'easy' ? 4 : difficulty === 'normal' ? 5 : 6;
  return Math.min(10, base + Math.floor((round - 1) / 2));
}

export function timeForRound(round: number, difficulty: GameCanvasProps['difficulty']): number {
  const base = difficulty === 'easy' ? 15 : difficulty === 'normal' ? 12 : 10;
  return Math.max(7, base - Math.floor((round - 1) / 3));
}

export default function ConstellationConnect({
  paused,
  api,
  restartToken,
  difficulty,
}: GameCanvasProps) {
  const [round, setRound] = useState(1);
  const [nextStar, setNextStar] = useState(1);
  const [secondsLeft, setSecondsLeft] = useState(() => timeForRound(1, difficulty));
  const [finished, setFinished] = useState(false);
  const resetKey = `${restartToken}:${difficulty}`;
  const [seenResetKey, setSeenResetKey] = useState(resetKey);
  if (seenResetKey !== resetKey) {
    setSeenResetKey(resetKey);
    setRound(1);
    setNextStar(1);
    setSecondsLeft(timeForRound(1, difficulty));
    setFinished(false);
  }
  const count = starCountForRound(round, difficulty);
  const stars = useMemo(
    () => createConstellation(count, restartToken * 97 + round * 131 + count),
    [count, restartToken, round],
  );

  useEffect(() => {
    if (paused || finished) return;
    const timer = window.setInterval(() => {
      setSecondsLeft((current) => {
        if (current > 1) return current - 1;
        playSound('wrong');
        api.died('The constellation faded');
        setNextStar(1);
        return timeForRound(round, difficulty);
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [api, difficulty, finished, paused, round]);

  function choose(star: ConstellationStar) {
    if (paused || finished) return;
    if (star.id !== nextStar) {
      playSound('wrong');
      api.setStatus(`Find star ${nextStar}`);
      setSecondsLeft((current) => Math.max(1, current - 1));
      return;
    }

    playSound(star.id === count ? 'pass' : 'coin');
    if (star.id < count) {
      setNextStar(star.id + 1);
      api.addScore(5);
      return;
    }

    setFinished(true);
    api.addScore(30 + Math.round(secondsLeft * 2));
    const nextRound = round + 1;
    window.setTimeout(() => {
      if (round % 3 === 0) api.requestGate(`Three constellations connected!`);
      setRound(nextRound);
      setNextStar(1);
      setSecondsLeft(timeForRound(nextRound, difficulty));
      setFinished(false);
    }, 650);
  }

  const connected = stars.slice(0, Math.max(0, nextStar - 1));
  const linePoints = connected.map((star) => `${star.x},${star.y}`).join(' ');

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#070b23] text-white">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(96,165,250,.2),transparent_28%),radial-gradient(circle_at_78%_70%,rgba(192,132,252,.18),transparent_32%),linear-gradient(180deg,#11183f,#070b23)]"
      />
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 px-4 py-3">
        <span className="rounded-xl bg-[#080b22]/75 px-3 py-2 text-xs font-black text-cyan-100">
          Constellation {round}
        </span>
        <span
          className={`rounded-xl px-3 py-2 text-xs font-black tabular-nums ${
            secondsLeft <= 4 ? 'bg-rose-300 text-[#3a0a18]' : 'bg-amber-200 text-[#332207]'
          }`}
          aria-live="polite"
        >
          {secondsLeft}s
        </span>
      </div>

      <div className="absolute inset-x-3 bottom-3 top-14 sm:inset-x-7 sm:bottom-6">
        <svg
          viewBox="0 0 100 100"
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden="true"
          preserveAspectRatio="none"
        >
          <polyline
            points={linePoints}
            fill="none"
            stroke="#a5f3fc"
            strokeWidth="1.15"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {stars.map((star) => {
          const reached = star.id < nextStar;
          const current = star.id === nextStar;
          return (
            <button
              key={star.id}
              type="button"
              onClick={() => choose(star)}
              disabled={paused || finished}
              aria-label={`Star ${star.id}${current ? ', next star' : ''}`}
              className={`absolute flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-sm font-black outline-none transition focus-visible:ring-4 focus-visible:ring-amber-200 ${
                reached
                  ? 'scale-75 bg-cyan-200 text-[#08202a] shadow-[0_0_24px_rgba(165,243,252,.7)]'
                  : current
                    ? 'bg-amber-200 text-[#342107] shadow-[0_0_30px_rgba(253,230,138,.75)]'
                    : 'bg-white/10 text-white/72 ring-1 ring-white/25 hover:bg-white/18'
              }`}
              style={{ left: `${star.x}%`, top: `${star.y}%` }}
            >
              {star.id}
            </button>
          );
        })}
      </div>

      <p className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#080b22]/75 px-3 py-1.5 text-[10px] font-black text-white/75">
        Tap the stars in order
      </p>
    </div>
  );
}
