'use client';

import { useEffect, useMemo, useState } from 'react';
import type { GameCanvasProps } from '@/lib/games';
import { playSound } from '@/lib/sound';

export type MancalaState = {
  pits: number[];
  stores: [number, number];
  turn: 0 | 1;
  over: boolean;
};

export function newMancala(): MancalaState {
  return { pits: Array(12).fill(4), stores: [0, 0], turn: 0, over: false };
}

function sideEmpty(pits: number[], player: 0 | 1): boolean {
  const start = player === 0 ? 0 : 6;
  return pits.slice(start, start + 6).every((stones) => stones === 0);
}

export function playMancalaPit(state: MancalaState, pit: number): MancalaState | null {
  if (state.over || pit < 0 || pit > 11) return null;
  if ((state.turn === 0 && pit > 5) || (state.turn === 1 && pit < 6) || state.pits[pit] === 0) {
    return null;
  }
  const next: MancalaState = {
    pits: [...state.pits],
    stores: [...state.stores] as [number, number],
    turn: state.turn,
    over: false,
  };
  let stones = next.pits[pit];
  next.pits[pit] = 0;
  let cursor = pit < 6 ? pit : pit + 1;
  let landedStore = false;

  while (stones > 0) {
    cursor = (cursor + 1) % 14;
    if (cursor === 6) {
      if (state.turn === 0) {
        next.stores[0] += 1;
        stones -= 1;
        landedStore = stones === 0;
      }
      continue;
    }
    if (cursor === 13) {
      if (state.turn === 1) {
        next.stores[1] += 1;
        stones -= 1;
        landedStore = stones === 0;
      }
      continue;
    }
    const boardPit = cursor < 6 ? cursor : cursor - 1;
    next.pits[boardPit] += 1;
    stones -= 1;
    if (
      stones === 0 &&
      ((state.turn === 0 && boardPit < 6) || (state.turn === 1 && boardPit >= 6)) &&
      next.pits[boardPit] === 1
    ) {
      const opposite = 11 - boardPit;
      if (next.pits[opposite] > 0) {
        next.stores[state.turn] += next.pits[opposite] + 1;
        next.pits[opposite] = 0;
        next.pits[boardPit] = 0;
      }
    }
  }

  if (sideEmpty(next.pits, 0) || sideEmpty(next.pits, 1)) {
    next.stores[0] += next.pits.slice(0, 6).reduce((sum, value) => sum + value, 0);
    next.stores[1] += next.pits.slice(6).reduce((sum, value) => sum + value, 0);
    next.pits.fill(0);
    next.over = true;
  } else if (!landedStore) {
    next.turn = state.turn === 0 ? 1 : 0;
  }
  return next;
}

function cpuPit(state: MancalaState, hard: boolean): number {
  const candidates = Array.from({ length: 6 }, (_, index) => index + 6).filter(
    (pit) => state.pits[pit] > 0,
  );
  let best = candidates[0] ?? 6;
  let bestValue = -Infinity;
  candidates.forEach((pit) => {
    const result = playMancalaPit(state, pit);
    if (!result) return;
    const extraTurn = result.turn === 1 && !result.over ? 8 : 0;
    const gain = result.stores[1] - state.stores[1];
    const value = gain * (hard ? 5 : 2) + extraTurn + state.pits[pit] * .04;
    if (value > bestValue) {
      best = pit;
      bestValue = value;
    }
  });
  return best;
}

export default function Mancala({ paused, api, restartToken, difficulty }: GameCanvasProps) {
  const [state, setState] = useState<MancalaState>(newMancala);
  const [players, setPlayers] = useState<1 | 2 | null>(null);
  const [seenRestart, setSeenRestart] = useState(restartToken);
  if (seenRestart !== restartToken) {
    setSeenRestart(restartToken);
    setState(newMancala());
    setPlayers(null);
  }

  const winner = useMemo(
    () => (state.over ? (state.stores[0] === state.stores[1] ? -1 : state.stores[0] > state.stores[1] ? 0 : 1) : null),
    [state],
  );

  function play(pit: number) {
    if (paused || state.over) return;
    const next = playMancalaPit(state, pit);
    if (!next) {
      playSound('wrong');
      api.setStatus('Choose a bowl on your side that has stones.');
      return;
    }
    setState(next);
    playSound(next.turn === state.turn && !next.over ? 'powerup' : 'coin');
    if (next.over) {
      const playerWon = next.stores[0] > next.stores[1];
      api.addScore(playerWon ? 220 : 80);
      api.requestGate(playerWon ? 'Mancala garden won!' : 'Mancala round complete');
      playSound('levelClear');
    }
  }

  useEffect(() => {
    if (players !== 1 || state.turn !== 1 || state.over || paused) return;
    const timer = window.setTimeout(() => {
      const pit = cpuPit(state, difficulty !== 'easy');
      const next = playMancalaPit(state, pit);
      if (next) {
        setState(next);
        playSound('coin');
        if (next.over) {
          api.addScore(next.stores[0] > next.stores[1] ? 220 : 80);
          api.requestGate('Mancala round complete');
        }
      }
    }, 560);
    return () => window.clearTimeout(timer);
  }, [api, difficulty, paused, players, state]);

  function start(mode: 1 | 2) {
    setPlayers(mode);
    setState(newMancala());
    playSound('click');
  }

  const top = [11, 10, 9, 8, 7, 6];
  const bottom = [0, 1, 2, 3, 4, 5];

  if (players === null) {
    return (
      <div className="absolute inset-0 flex items-center justify-center overflow-auto bg-[radial-gradient(circle_at_50%_0%,#235e52,#132e32_55%,#091a20)] p-5 text-center text-white">
        <div className="max-w-xl">
          <div className="text-6xl" aria-hidden="true">🪨</div>
          <h2 className="mt-4 text-3xl font-black tracking-[-0.03em] text-amber-200 sm:text-5xl">Mancala Garden</h2>
          <p className="mt-3 text-sm leading-relaxed text-emerald-50/70 sm:text-base">
            Sow every stone from one bowl around the board. Capture across from an empty bowl and
            finish with the most stones in your store.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => start(1)} className="min-h-16 rounded-2xl bg-amber-300 px-5 font-black text-[#1b2d28] transition hover:bg-amber-200 active:scale-[.98]">
              1 player<span className="mt-1 block text-xs opacity-65">Play the garden keeper</span>
            </button>
            <button type="button" onClick={() => start(2)} className="min-h-16 rounded-2xl bg-emerald-300/15 px-5 font-black text-emerald-50 transition hover:bg-emerald-300/22 active:scale-[.98]">
              2 players<span className="mt-1 block text-xs opacity-65">Share this screen</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const pitButton = (pit: number) => {
    const playable = !paused && !state.over && (
      (state.turn === 0 && pit < 6) || (state.turn === 1 && pit >= 6)
    );
    return (
      <button
        key={pit}
        type="button"
        disabled={!playable || (players === 1 && state.turn === 1)}
        onClick={() => play(pit)}
        aria-label={`Bowl ${pit + 1}, ${state.pits[pit]} stones`}
        className="relative aspect-square min-h-12 rounded-full bg-[radial-gradient(circle_at_42%_35%,#845d38,#4a2e20_65%,#251611)] shadow-[inset_0_7px_16px_rgba(0,0,0,.58),0_4px_9px_rgba(0,0,0,.22)] transition enabled:hover:brightness-110 enabled:active:scale-95 disabled:opacity-70 sm:min-h-20"
      >
        <span className="text-base font-black text-amber-100 sm:text-2xl">{state.pits[pit]}</span>
        <span className="pointer-events-none absolute inset-[22%] rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff1ad,#df9d36_50%,#754421)] opacity-55" />
      </button>
    );
  };

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-auto bg-[radial-gradient(circle_at_50%_0%,#286659,#132f34_58%,#091a20)] p-3 text-white sm:p-7">
      <div className="w-full max-w-4xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[.16em] text-emerald-100/50">
              {state.over ? 'Harvest complete' : state.turn === 0 ? 'Your garden' : players === 1 ? 'Keeper thinking' : 'Top garden'}
            </p>
            <h2 className="text-2xl font-black text-amber-100 sm:text-3xl">Sow the stones</h2>
          </div>
          <button type="button" onClick={() => start(players)} className="min-h-11 rounded-xl bg-white/10 px-4 text-sm font-black text-white/75 hover:bg-white/15">New round</button>
        </div>

        <div className="grid grid-cols-[.62fr_4fr_.62fr] gap-2 rounded-[2rem] bg-[linear-gradient(145deg,#a86a36,#6d4028_55%,#45271d)] p-3 shadow-[0_24px_55px_rgba(0,0,0,.4)] sm:gap-4 sm:p-5">
          <div className="flex items-center justify-center rounded-full bg-[#382117] shadow-[inset_0_8px_18px_rgba(0,0,0,.55)]">
            <span className="text-xl font-black text-rose-200 sm:text-4xl">{state.stores[1]}</span>
          </div>
          <div className="grid gap-2 sm:gap-4">
            <div className="grid grid-cols-6 gap-1.5 sm:gap-3">{top.map(pitButton)}</div>
            <div className="h-px bg-amber-100/20" />
            <div className="grid grid-cols-6 gap-1.5 sm:gap-3">{bottom.map(pitButton)}</div>
          </div>
          <div className="flex items-center justify-center rounded-full bg-[#382117] shadow-[inset_0_8px_18px_rgba(0,0,0,.55)]">
            <span className="text-xl font-black text-amber-200 sm:text-4xl">{state.stores[0]}</span>
          </div>
        </div>

        {state.over && (
          <p role="status" className="mt-5 rounded-2xl bg-white/10 px-5 py-4 text-center text-lg font-black text-amber-100">
            {winner === -1 ? 'Perfect tie!' : winner === 0 ? 'Your garden wins!' : players === 1 ? 'The keeper wins this harvest.' : 'Top garden wins!'}
          </p>
        )}
      </div>
    </div>
  );
}
