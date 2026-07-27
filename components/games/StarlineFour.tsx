'use client';

import { useEffect, useMemo, useState } from 'react';
import type { GameCanvasProps } from '@/lib/games';
import { playSound } from '@/lib/sound';

export type FourCell = 0 | 1 | 2;
export const FOUR_COLS = 7;
export const FOUR_ROWS = 6;

export function newFourBoard(): FourCell[] {
  return Array<FourCell>(FOUR_COLS * FOUR_ROWS).fill(0);
}

export function dropFour(board: FourCell[], column: number, player: 1 | 2): FourCell[] | null {
  if (column < 0 || column >= FOUR_COLS) return null;
  for (let row = FOUR_ROWS - 1; row >= 0; row -= 1) {
    const index = row * FOUR_COLS + column;
    if (board[index] === 0) {
      const next = [...board];
      next[index] = player;
      return next;
    }
  }
  return null;
}

export function fourWinner(board: FourCell[]): FourCell {
  const directions = [[1, 0], [0, 1], [1, 1], [1, -1]] as const;
  for (let row = 0; row < FOUR_ROWS; row += 1) {
    for (let col = 0; col < FOUR_COLS; col += 1) {
      const player = board[row * FOUR_COLS + col];
      if (!player) continue;
      for (const [dx, dy] of directions) {
        let count = 1;
        for (let step = 1; step < 4; step += 1) {
          const x = col + dx * step;
          const y = row + dy * step;
          if (x < 0 || x >= FOUR_COLS || y < 0 || y >= FOUR_ROWS) break;
          if (board[y * FOUR_COLS + x] !== player) break;
          count += 1;
        }
        if (count === 4) return player;
      }
    }
  }
  return 0;
}

function chooseCpuColumn(board: FourCell[], hard: boolean): number {
  const legal = Array.from({ length: FOUR_COLS }, (_, column) => column).filter(
    (column) => dropFour(board, column, 2) !== null,
  );
  for (const column of legal) {
    const next = dropFour(board, column, 2);
    if (next && fourWinner(next) === 2) return column;
  }
  if (hard) {
    for (const column of legal) {
      const next = dropFour(board, column, 1);
      if (next && fourWinner(next) === 1) return column;
    }
  }
  return [...legal].sort((a, b) => Math.abs(3 - a) - Math.abs(3 - b))[0] ?? 0;
}

export default function StarlineFour({
  paused,
  api,
  restartToken,
  difficulty,
}: GameCanvasProps) {
  const [board, setBoard] = useState<FourCell[]>(newFourBoard);
  const [players, setPlayers] = useState<1 | 2 | null>(null);
  const [turn, setTurn] = useState<1 | 2>(1);
  const [winner, setWinner] = useState<FourCell>(0);
  const [settled, setSettled] = useState(false);
  const [seenRestart, setSeenRestart] = useState(restartToken);
  if (seenRestart !== restartToken) {
    setSeenRestart(restartToken);
    setBoard(newFourBoard());
    setPlayers(null);
    setTurn(1);
    setWinner(0);
    setSettled(false);
  }

  const full = useMemo(() => board.every(Boolean), [board]);

  function finish(next: FourCell[]) {
    const won = fourWinner(next);
    setWinner(won);
    if (won) {
      playSound('levelClear');
      api.addScore(won === 1 ? 180 : 60);
      api.requestGate(won === 1 ? 'Starline connected!' : 'Round complete');
    } else if (next.every(Boolean)) {
      playSound('click');
      api.addScore(80);
      api.requestGate('A clever draw');
    }
  }

  function playColumn(column: number, player = turn) {
    if (paused || winner || full || settled) return;
    const next = dropFour(board, column, player);
    if (!next) {
      playSound('wrong');
      api.setStatus('That column is full.');
      return;
    }
    setSettled(true);
    setBoard(next);
    playSound('coin');
    finish(next);
    const won = fourWinner(next);
    if (!won && !next.every(Boolean)) setTurn(player === 1 ? 2 : 1);
    window.setTimeout(() => setSettled(false), 210);
  }

  useEffect(() => {
    if (players !== 1 || turn !== 2 || winner || full || paused || settled) return;
    const timer = window.setTimeout(() => {
      playColumn(chooseCpuColumn(board, difficulty !== 'easy'), 2);
    }, 460);
    return () => window.clearTimeout(timer);
    // playColumn intentionally reads the latest rendered board.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, difficulty, full, paused, players, settled, turn, winner]);

  function start(mode: 1 | 2) {
    setPlayers(mode);
    setBoard(newFourBoard());
    setTurn(1);
    setWinner(0);
    playSound('click');
  }

  return (
    <div className="absolute inset-0 overflow-auto bg-[radial-gradient(circle_at_50%_0%,#1e4d88,#101733_58%,#090d1d)] p-4 text-white sm:p-7">
      {players === null ? (
        <div className="mx-auto flex min-h-full max-w-xl flex-col items-center justify-center text-center">
          <div className="text-6xl" aria-hidden="true">🌠</div>
          <h2 className="mt-4 text-3xl font-black tracking-[-0.03em] text-amber-200 sm:text-5xl">
            Starline Four
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-blue-100/70 sm:text-base">
            Drop glowing stars into the observatory grid. Connect four across, down, or diagonally
            before your rival does.
          </p>
          <div className="mt-8 grid w-full max-w-md gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => start(1)}
              className="min-h-16 rounded-2xl bg-amber-300 px-5 font-black text-[#17213d] shadow-[0_14px_35px_rgba(0,0,0,.3)] transition hover:bg-amber-200 active:scale-[.98]"
            >
              1 player
              <span className="mt-1 block text-xs font-bold opacity-65">Challenge the stargazer</span>
            </button>
            <button
              type="button"
              onClick={() => start(2)}
              className="min-h-16 rounded-2xl bg-cyan-300/16 px-5 font-black text-cyan-100 transition hover:bg-cyan-300/24 active:scale-[.98]"
            >
              2 players
              <span className="mt-1 block text-xs font-bold opacity-65">Share this screen</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center">
          <div className="mb-4 flex w-full items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[.16em] text-blue-100/50">
                {winner ? 'Round complete' : turn === 1 ? 'Gold’s turn' : players === 1 ? 'Stargazer thinking' : 'Coral’s turn'}
              </p>
              <h2 className="text-2xl font-black text-white sm:text-3xl">Connect four stars</h2>
            </div>
            <button
              type="button"
              onClick={() => start(players)}
              className="min-h-11 rounded-xl bg-white/10 px-4 text-sm font-black text-white/75 hover:bg-white/15"
            >
              New round
            </button>
          </div>

          <div className="w-full rounded-[1.5rem] bg-[#1d66b7] p-2.5 shadow-[0_20px_45px_rgba(0,0,0,.38)] sm:p-4">
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2.5">
              {board.map((cell, index) => {
                const column = index % FOUR_COLS;
                return (
                  <button
                    key={index}
                    type="button"
                    aria-label={
                      cell
                        ? `${cell === 1 ? 'Gold' : 'Coral'} star`
                        : `Drop in column ${column + 1}`
                    }
                    disabled={paused || Boolean(winner) || settled || (players === 1 && turn === 2)}
                    onClick={() => playColumn(column)}
                    className="aspect-square min-h-10 rounded-full bg-[#0a1530] p-[10%] shadow-[inset_0_5px_12px_rgba(0,0,0,.55)] transition active:scale-90 disabled:cursor-default sm:min-h-14"
                  >
                    <span
                      className={`block h-full w-full rounded-full transition duration-200 ${
                        cell === 1
                          ? 'bg-[radial-gradient(circle_at_34%_26%,#fff8bc,#f7bf37_52%,#c56b19)] shadow-[0_0_16px_rgba(251,191,36,.55)]'
                          : cell === 2
                            ? 'bg-[radial-gradient(circle_at_34%_26%,#ffd0cd,#fb7185_52%,#b52f55)] shadow-[0_0_16px_rgba(251,113,133,.45)]'
                            : 'bg-[#0b1430]'
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {(winner || full) && (
            <div
              role="status"
              className="mt-5 w-full rounded-2xl bg-white/10 px-5 py-4 text-center shadow-[0_14px_30px_rgba(0,0,0,.25)]"
            >
              <strong className="text-xl text-amber-200">
                {winner === 1 ? 'Gold connected the sky!' : winner === 2 ? 'Coral connected the sky!' : 'The sky is full — draw!'}
              </strong>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
