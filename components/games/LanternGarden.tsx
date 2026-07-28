'use client';

import { useMemo, useState } from 'react';
import type { GameCanvasProps } from '@/lib/games';
import { playSound } from '@/lib/sound';

export function toggleLanterns(cells: boolean[], size: number, index: number): boolean[] {
  const row = Math.floor(index / size);
  const col = index % size;
  const affected = new Set([
    index,
    row > 0 ? index - size : -1,
    row < size - 1 ? index + size : -1,
    col > 0 ? index - 1 : -1,
    col < size - 1 ? index + 1 : -1,
  ]);
  return cells.map((lit, cell) => (affected.has(cell) ? !lit : lit));
}

export function isGardenLit(cells: boolean[]): boolean {
  return cells.every(Boolean);
}

/** Starts from a solved garden and applies real moves, guaranteeing a solvable puzzle. */
export function createLanternPuzzle(size: number, seed: number): boolean[] {
  let cells = Array.from({ length: size * size }, () => true);
  let value = seed >>> 0;
  const moves = size + 3;
  for (let move = 0; move < moves; move += 1) {
    value = (Math.imul(value, 1103515245) + 12345) >>> 0;
    cells = toggleLanterns(cells, size, value % cells.length);
  }
  if (isGardenLit(cells)) cells = toggleLanterns(cells, size, Math.floor(cells.length / 2));
  return cells;
}

function sizeForDifficulty(difficulty: GameCanvasProps['difficulty']): number {
  return difficulty === 'easy' ? 3 : difficulty === 'normal' ? 4 : 5;
}

export default function LanternGarden({
  paused,
  api,
  restartToken,
  difficulty,
}: GameCanvasProps) {
  const size = sizeForDifficulty(difficulty);
  const [level, setLevel] = useState(1);
  const [moves, setMoves] = useState(0);
  const seed = restartToken * 101 + level * 937 + size;
  const initial = useMemo(() => createLanternPuzzle(size, seed), [seed, size]);
  const [cells, setCells] = useState(initial);
  const [celebrating, setCelebrating] = useState(false);
  const resetKey = `${restartToken}:${difficulty}`;
  const [seenResetKey, setSeenResetKey] = useState(resetKey);
  if (seenResetKey !== resetKey) {
    setSeenResetKey(resetKey);
    setLevel(1);
    setMoves(0);
    setCells(createLanternPuzzle(size, restartToken * 101 + 937 + size));
    setCelebrating(false);
  }

  function choose(index: number) {
    if (paused || celebrating) return;
    const next = toggleLanterns(cells, size, index);
    const nextMoves = moves + 1;
    setCells(next);
    setMoves(nextMoves);
    playSound(isGardenLit(next) ? 'levelClear' : 'click');
    if (!isGardenLit(next)) return;

    setCelebrating(true);
    api.addScore(Math.max(40, 160 - nextMoves * 4) + level * 10);
    window.setTimeout(() => {
      api.requestGate(`Lantern garden ${level} glowing!`);
      const nextLevel = level + 1;
      setLevel(nextLevel);
      setMoves(0);
      setCells(createLanternPuzzle(size, restartToken * 101 + nextLevel * 937 + size));
      setCelebrating(false);
    }, 700);
  }

  return (
    <div className="absolute inset-0 overflow-auto bg-[radial-gradient(circle_at_50%_0%,#324d6b,#182f46_48%,#081d2b)] p-4 text-white sm:p-7">
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-center">
        <header className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-black text-cyan-100/72">Moonlit puzzle</p>
            <h2 className="mt-1 text-3xl font-black tracking-[-0.03em] sm:text-4xl">
              Lantern Garden
            </h2>
            <p className="mt-1 max-w-md text-xs leading-relaxed text-white/68 sm:text-sm">
              Each lantern changes itself and its closest neighbors. Light the whole garden.
            </p>
          </div>
          <div className="text-right text-xs font-black text-white/72">
            <div>Garden {level}</div>
            <div className="mt-1 text-cyan-100">{moves} moves</div>
          </div>
        </header>

        <div
          className="mx-auto mt-5 grid w-full max-w-[31rem] gap-2 rounded-2xl bg-[#071824]/72 p-3 shadow-[0_22px_55px_rgba(0,0,0,.32)] sm:gap-3 sm:p-5"
          style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
          role="group"
          aria-label={`${size} by ${size} lantern garden`}
        >
          {cells.map((lit, index) => (
            <button
              key={index}
              type="button"
              onClick={() => choose(index)}
              disabled={paused || celebrating}
              aria-label={`Lantern ${index + 1}, ${lit ? 'lit' : 'dark'}`}
              aria-pressed={lit}
              className={`aspect-square min-h-12 rounded-xl outline-none transition duration-200 focus-visible:ring-4 focus-visible:ring-cyan-100 ${
                lit
                  ? 'bg-amber-200 text-[#3a2708] shadow-[0_8px_24px_rgba(253,230,138,.28)]'
                  : 'bg-[#18384a] text-white/35 shadow-[inset_0_3px_10px_rgba(0,0,0,.28)] hover:bg-[#214a60]'
              }`}
            >
              <span
                aria-hidden="true"
                className={`mx-auto block h-[42%] w-[42%] rounded-[35%_35%_48%_48%] ${
                  lit ? 'bg-white shadow-[0_0_18px_#fff8bf]' : 'bg-[#071824]'
                }`}
              />
            </button>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <p aria-live="polite" className="text-xs font-bold text-white/68">
            {celebrating
              ? 'Every lantern is glowing!'
              : `${cells.filter(Boolean).length} of ${cells.length} lanterns lit`}
          </p>
          <button
            type="button"
            onClick={() => {
              setCells(initial);
              setMoves(0);
              playSound('click');
            }}
            disabled={paused || celebrating}
            className="min-h-11 rounded-xl bg-white/10 px-4 text-xs font-black text-white/78 hover:bg-white/15 disabled:opacity-40"
          >
            Restart garden
          </button>
        </div>
      </div>
    </div>
  );
}
