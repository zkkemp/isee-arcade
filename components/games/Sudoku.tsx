'use client';

import { useEffect, useRef } from 'react';
import type { Difficulty } from '@/lib/difficulty';
import type { GameCanvasProps } from '@/lib/games';
import { playSound, unlockAudio } from '@/lib/sound';
import { useCanvasGame } from '@/lib/useCanvasGame';

/**
 * Kid Sudoku - the 'board' control scheme, gentle edition.
 *
 * 4x4 (2x2 boxes) to start; 6x6 (2x3 boxes) unlocks once the child has cleared
 * a few puzzles. Fill every row, column, and box with each symbol exactly once.
 * There is no way to lose: a wrong entry just glows softly until it is fixed,
 * never a hard fail, matching Memory Match's tone rather than Tic-Tac-Toe's.
 *
 * Everything above the component is pure - no canvas, no React, no Math.random,
 * only the seeded `lcg` (same generator as TicTacToe/MemoryMatch). Three things
 * have to be true for this genre to not quietly cheat a kid, and each is proved
 * headlessly by scripts/check-sudoku.ts rather than hoped for:
 *
 *  1. Every generated SOLVED grid is a genuine Latin-square-plus-boxes: each
 *     row, column, and box a permutation of 1..n. `generateSolvedGrid` builds
 *     one by backtracking with an rng-shuffled candidate order per cell.
 *  2. Every generated PUZZLE (a solved grid with cells removed) has EXACTLY
 *     ONE solution. `countSolutions` is a capped backtracking solver
 *     (stops counting once it finds 2), and `makePuzzle` only accepts a
 *     removal when the puzzle it leaves behind still solves to exactly 1.
 *  3. `conflicts`/`conflictMask` (the "does this placement break a row/col/box"
 *     checker) and `isSolved` (full AND conflict-free - a half-empty board
 *     must never read as solved) are exactly what the component runs to
 *     highlight mistakes and to decide when to celebrate.
 *
 * Interaction: tap a cell to select it (givens - the starting clues - are
 * locked and drawn distinct), then tap a symbol in the palette along the
 * bottom to fill it; tapping an already-selected cell again cycles its value
 * without the palette, for a fast fill. A cell that conflicts with a peer
 * glows a soft warm color - informational, never blocking, never a death.
 * Solving the grid -> playSound('levelClear'), api.addScore, a short
 * api.requestGate, then a fresh (harder, and eventually bigger) puzzle deals.
 */

// --- pure rules --------------------------------------------------------------

export type Grid = number[]; // length n*n, row-major, 0 = empty, 1..n = filled
export type Size = 4 | 6;

/** Box height/width in cells. 4x4 uses 2x2 boxes; 6x6 uses 2-row x 3-col boxes. */
export function boxDims(n: Size): { bh: number; bw: number } {
  return n === 4 ? { bh: 2, bw: 2 } : { bh: 2, bw: 3 };
}

export function rowOf(n: Size, i: number): number {
  return Math.floor(i / n);
}
export function colOf(n: Size, i: number): number {
  return i % n;
}
export function boxOf(n: Size, i: number): number {
  const { bh, bw } = boxDims(n);
  const r = rowOf(n, i);
  const c = colOf(n, i);
  const boxCols = n / bw;
  return Math.floor(r / bh) * boxCols + Math.floor(c / bw);
}

export function emptyGrid(n: Size): Grid {
  return new Array(n * n).fill(0);
}

/** Every other cell sharing this cell's row, column, or box. */
export function peersOf(n: Size, i: number): number[] {
  const row = rowOf(n, i);
  const col = colOf(n, i);
  const box = boxOf(n, i);
  const out: number[] = [];
  const total = n * n;
  for (let j = 0; j < total; j += 1) {
    if (j === i) continue;
    if (rowOf(n, j) === row || colOf(n, j) === col || boxOf(n, j) === box) out.push(j);
  }
  return out;
}

/**
 * Does placing `value` at `index` conflict with a peer that already holds it?
 * The one legality check the whole game runs - the puzzle generator, the
 * solver, and the on-screen conflict glow all call this exact function.
 */
export function conflicts(grid: Grid, n: Size, index: number, value: number): boolean {
  if (value === 0) return false;
  for (const p of peersOf(n, index)) {
    if (grid[p] === value) return true;
  }
  return false;
}

/** Which filled cells currently conflict with at least one peer. */
export function conflictMask(grid: Grid, n: Size): boolean[] {
  const mask = new Array(grid.length).fill(false) as boolean[];
  for (let i = 0; i < grid.length; i += 1) {
    if (grid[i] !== 0 && conflicts(grid, n, i, grid[i])) mask[i] = true;
  }
  return mask;
}

/** No row/col/box has a duplicate value (empties are ignored). */
export function isValidGrid(grid: Grid, n: Size): boolean {
  return conflictMask(grid, n).every((v) => !v);
}

/** Full AND conflict-free - i.e. every row/col/box is a genuine permutation of 1..n. */
export function isSolved(grid: Grid, n: Size): boolean {
  return grid.length === n * n && grid.every((v) => v !== 0) && isValidGrid(grid, n);
}

/**
 * Counts solutions to `grid`, stopping once it reaches `cap` (default 2 - the
 * puzzle generator only ever needs to know "exactly one" vs "more than one").
 * Never mutates the array handed in.
 */
export function countSolutions(grid: Grid, n: Size, cap = 2): number {
  const g = grid.slice();
  const total = n * n;
  let count = 0;

  const firstEmpty = (): number => {
    for (let i = 0; i < total; i += 1) if (g[i] === 0) return i;
    return -1;
  };

  const solve = (): void => {
    if (count >= cap) return;
    const idx = firstEmpty();
    if (idx === -1) {
      count += 1;
      return;
    }
    for (let v = 1; v <= n; v += 1) {
      if (count >= cap) return;
      if (!conflicts(g, n, idx, v)) {
        g[idx] = v;
        solve();
        g[idx] = 0;
      }
    }
  };
  solve();
  return count;
}

/** Seeded LCG - nothing in this file ever touches Math.random. */
export function lcg(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Fisher-Yates shuffle of 0..count-1. */
export function shuffledIndices(count: number, rng: () => number): number[] {
  const arr = Array.from({ length: count }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

/** A complete, valid n x n grid, built by backtracking with a shuffled candidate order. */
export function generateSolvedGrid(n: Size, rng: () => number): Grid {
  const total = n * n;
  const g: Grid = new Array(total).fill(0);

  const shuffledSymbols = (): number[] => {
    const arr = Array.from({ length: n }, (_, i) => i + 1);
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  };

  const fill = (pos: number): boolean => {
    if (pos >= total) return true;
    for (const v of shuffledSymbols()) {
      if (!conflicts(g, n, pos, v)) {
        g[pos] = v;
        if (fill(pos + 1)) return true;
        g[pos] = 0;
      }
    }
    return false;
  };

  fill(0);
  return g;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export type LevelConfig = { size: Size; givens: number };

/**
 * Grid size and clue count for a level. Levels 1-5 are 4x4 (10 givens down to
 * a floor of 6, out of 16 cells); level 6 onward is 6x6 (20 givens down to a
 * floor of 12, out of 36 cells) - "introduce 6x6 at higher levels". `bias`
 * shifts givens up (easier) or down (harder) per the difficulty setting, and
 * is always clamped to a safe range so the generator never has to search for
 * an unreasonably sparse puzzle.
 */
export function configForLevel(level: number, bias = 0): LevelConfig {
  const lv = Math.max(1, Math.floor(level));
  if (lv <= 5) {
    const total = 16;
    const base = 10 - (lv - 1);
    return { size: 4, givens: clamp(base + bias, 5, total - 1) };
  }
  const lv6 = lv - 5;
  const total = 36;
  const base = 20 - (lv6 - 1) * 2;
  return { size: 6, givens: clamp(base + bias, 9, total - 1) };
}

/** Per-difficulty shift applied to the givens count - more clues on easy, fewer on hard. */
export const GIVENS_BIAS: Record<Difficulty, number> = {
  easy: 2,
  normal: 0,
  hard: -2,
};

export type Puzzle = {
  size: Size;
  level: number;
  solution: Grid;
  givenMask: boolean[];
  grid: Grid;
};

/**
 * Builds a puzzle for `level`: a fresh solved grid, then cells removed one at
 * a time (in an rng-shuffled order) as long as the remainder still solves to
 * exactly one solution. If uniqueness would break before hitting the target
 * givens count, removal simply stops early - the puzzle is always solvable
 * and always unique, even if a little easier than the level's target.
 */
export function makePuzzle(level: number, rng: () => number, bias = 0): Puzzle {
  const { size, givens } = configForLevel(level, bias);
  const solution = generateSolvedGrid(size, rng);
  const total = size * size;
  const order = shuffledIndices(total, rng);
  const givenMask = new Array(total).fill(true) as boolean[];
  const grid = solution.slice();
  const targetRemoved = total - givens;
  let removed = 0;

  for (const idx of order) {
    if (removed >= targetRemoved) break;
    const backup = grid[idx];
    grid[idx] = 0;
    givenMask[idx] = false;
    if (countSolutions(grid, size, 2) === 1) {
      removed += 1;
    } else {
      grid[idx] = backup;
      givenMask[idx] = true;
    }
  }

  return { size, level: Math.max(1, Math.floor(level)), solution, givenMask, grid };
}

// --- layout ------------------------------------------------------------------

const TOP = 44;
const PALETTE_H = 76;
const GAP = 10;

type Layout = {
  ox: number;
  oy: number;
  size: number; // board pixel size (square)
  cell: number;
  n: Size;
  cw: number;
  paletteY: number;
  paletteH: number;
};

function layoutFor(cw: number, ch: number, inset: number, n: Size): Layout {
  const usableH = Math.max(1, ch - inset);
  const boardAreaH = Math.max(1, usableH - TOP - PALETTE_H - GAP);
  const size = Math.max(60, Math.min(cw * 0.94, boardAreaH * 0.98));
  return {
    ox: (cw - size) / 2,
    oy: TOP + Math.max(0, (boardAreaH - size) / 2),
    size,
    cell: size / n,
    n,
    cw,
    paletteY: TOP + Math.max(0, (boardAreaH - size) / 2) + size + GAP,
    paletteH: PALETTE_H,
  };
}

/** Which board cell (0..n*n-1) a canvas-space point hits, or -1. */
export function cellAtPoint(l: Layout, x: number, y: number): number {
  if (x < l.ox || x > l.ox + l.size || y < l.oy || y > l.oy + l.size) return -1;
  const col = Math.min(l.n - 1, Math.max(0, Math.floor((x - l.ox) / l.cell)));
  const row = Math.min(l.n - 1, Math.max(0, Math.floor((y - l.oy) / l.cell)));
  return row * l.n + col;
}

const PALETTE_MARGIN = 12;
const PALETTE_GAP = 8;

function paletteButtonRect(l: Layout, i: number, count: number): { x: number; y: number; w: number; h: number } {
  const totalW = l.cw - PALETTE_MARGIN * 2;
  const w = (totalW - PALETTE_GAP * (count - 1)) / count;
  return { x: PALETTE_MARGIN + i * (w + PALETTE_GAP), y: l.paletteY + 6, w, h: l.paletteH - 12 };
}

/** Which palette button (0..n-1 symbols, n = eraser) a point hits, or -1. */
function paletteIndexAt(l: Layout, x: number, y: number, count: number): number {
  if (y < l.paletteY || y > l.paletteY + l.paletteH) return -1;
  for (let i = 0; i < count; i += 1) {
    const r = paletteButtonRect(l, i, count);
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
  }
  return -1;
}

// --- state -------------------------------------------------------------------

type State = {
  difficulty: Difficulty;
  rng: () => number;
  puzzle: Puzzle;
  selected: number;
  time: number;
  solvedFlashT: number;
};

function freshState(difficulty: Difficulty, seed: number): State {
  const rng = lcg(seed);
  const puzzle = makePuzzle(1, rng, GIVENS_BIAS[difficulty]);
  return { difficulty, rng, puzzle, selected: -1, time: 0, solvedFlashT: 0 };
}

function dealNext(s: State): void {
  s.puzzle = makePuzzle(s.puzzle.level + 1, s.rng, GIVENS_BIAS[s.difficulty]);
  s.selected = -1;
}

// --- component -----------------------------------------------------------------

const SYMBOL_COLORS: Record<number, string> = {
  1: '#5ec8ff',
  2: '#ff8f5d',
  3: '#7dd490',
  4: '#ff6a9e',
  5: '#ffd75e',
  6: '#c77dff',
};

export default function Sudoku({ paused, api, restartToken, difficulty, controlsInset }: GameCanvasProps) {
  const stateRef = useRef<State | null>(null);
  const layoutRef = useRef<Layout>({
    ox: 0,
    oy: 0,
    size: 1,
    cell: 1,
    n: 4,
    cw: 1,
    paletteY: 0,
    paletteH: PALETTE_H,
  });
  const seedRef = useRef(1);

  useEffect(() => {
    seedRef.current = (Date.now() ^ Math.imul(restartToken + 1, 2654435761)) >>> 0 || 1;
    stateRef.current = null;
  }, [restartToken]);

  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  const applyValue = (s: State, cell: number, value: number): void => {
    if (s.puzzle.givenMask[cell]) return;
    s.puzzle.grid[cell] = value;

    if (value === 0) {
      playSound('click');
      return;
    }

    const bad = conflicts(s.puzzle.grid, s.puzzle.size, cell, value);
    playSound(bad ? 'wrong' : 'correct');
    if (!bad) api.addScore(2);

    if (isSolved(s.puzzle.grid, s.puzzle.size)) {
      const clearedLevel = s.puzzle.level;
      playSound('levelClear');
      api.addScore(50 + clearedLevel * 5);
      s.solvedFlashT = 1;
      dealNext(s);
      api.requestGate('Puzzle solved!');
    }
  };

  const onTap = (sx: number, sy: number): void => {
    if (paused) return;
    unlockAudio();
    const s = stateRef.current;
    if (!s) return;
    const l = layoutRef.current;
    const count = s.puzzle.size + 1; // n symbols + 1 eraser

    const pIdx = paletteIndexAt(l, sx, sy, count);
    if (pIdx >= 0) {
      if (s.selected < 0 || s.puzzle.givenMask[s.selected]) return;
      const value = pIdx === count - 1 ? 0 : pIdx + 1;
      applyValue(s, s.selected, value);
      return;
    }

    const cell = cellAtPoint(l, sx, sy);
    if (cell < 0) return;
    if (s.puzzle.givenMask[cell]) {
      playSound('click');
      s.selected = cell;
      return;
    }
    if (s.selected === cell) {
      const next = (s.puzzle.grid[cell] + 1) % (s.puzzle.size + 1);
      applyValue(s, cell, next);
    } else {
      s.selected = cell;
      playSound('click');
    }
  };

  const { canvasRef } = useCanvasGame({
    active: true,
    step: (ctx, dt, cw, ch) => {
      let s = stateRef.current;
      if (!s || s.difficulty !== difficulty) {
        s = freshState(difficulty, seedRef.current);
        stateRef.current = s;
      }
      const l = layoutFor(cw, ch, controlsInset, s.puzzle.size);
      layoutRef.current = l;

      if (!paused) {
        s.time += dt;
        if (s.solvedFlashT > 0) s.solvedFlashT = Math.max(0, s.solvedFlashT - dt);
      }

      draw(ctx, s, l, cw, ch, paused);
    },
  });

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full touch-none"
      onPointerDown={(e) => {
        e.preventDefault();
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        onTap(e.clientX - r.left, e.clientY - r.top);
      }}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}

// --- drawing -----------------------------------------------------------------

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function draw(
  ctx: CanvasRenderingContext2D,
  s: State,
  l: Layout,
  cw: number,
  ch: number,
  paused: boolean,
): void {
  ctx.clearRect(0, 0, cw, ch);
  const bg = ctx.createLinearGradient(0, 0, 0, ch);
  bg.addColorStop(0, '#141426');
  bg.addColorStop(1, '#0d0d1a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, cw, ch);

  drawTopBar(ctx, s, cw);
  drawBoard(ctx, s, l);
  drawPalette(ctx, s, l);

  if (s.solvedFlashT > 0) {
    ctx.fillStyle = `rgba(90,220,140,${0.22 * s.solvedFlashT})`;
    ctx.fillRect(0, 0, cw, ch);
  }
  if (paused) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, cw, ch);
  }
}

function drawTopBar(ctx: CanvasRenderingContext2D, s: State, cw: number): void {
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.fillText(`Level ${s.puzzle.level}`, 16, TOP / 2 + 6);

  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '600 15px system-ui, sans-serif';
  ctx.fillText(`${s.puzzle.size} x ${s.puzzle.size}`, cw - 16, TOP / 2 + 6);
}

function drawBoard(ctx: CanvasRenderingContext2D, s: State, l: Layout): void {
  const n = s.puzzle.size;
  const { bh, bw } = boxDims(n);
  const mask = conflictMask(s.puzzle.grid, n);
  const pulse = 0.55 + 0.35 * Math.sin(s.time * 4);

  // Board backdrop.
  roundRect(ctx, l.ox, l.oy, l.size, l.size, 14);
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fill();

  for (let i = 0; i < n * n; i += 1) {
    const r = Math.floor(i / n);
    const c = i % n;
    const x = l.ox + c * l.cell;
    const y = l.oy + r * l.cell;
    const given = s.puzzle.givenMask[i];
    const selected = s.selected === i;
    const conflict = mask[i];

    if (given) {
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(x, y, l.cell, l.cell);
    }
    if (conflict) {
      ctx.fillStyle = `rgba(255,111,93,${0.28 * pulse})`;
      ctx.fillRect(x, y, l.cell, l.cell);
    }
    if (selected) {
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 1.5, y + 1.5, l.cell - 3, l.cell - 3);
    }

    const v = s.puzzle.grid[i];
    if (v !== 0) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${given ? 'bold' : '700'} ${l.cell * 0.5}px system-ui, sans-serif`;
      ctx.fillStyle = given ? '#ffffff' : conflict ? '#ff8f7d' : SYMBOL_COLORS[v] ?? '#ffffff';
      ctx.fillText(String(v), x + l.cell / 2, y + l.cell / 2 + 1);
    }
  }

  // Grid lines: thin between cells, thick between boxes.
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1.5;
  for (let i = 1; i < n; i += 1) {
    ctx.beginPath();
    ctx.moveTo(l.ox + i * l.cell, l.oy);
    ctx.lineTo(l.ox + i * l.cell, l.oy + l.size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(l.ox, l.oy + i * l.cell);
    ctx.lineTo(l.ox + l.size, l.oy + i * l.cell);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 3;
  for (let i = bw; i < n; i += bw) {
    ctx.beginPath();
    ctx.moveTo(l.ox + i * l.cell, l.oy);
    ctx.lineTo(l.ox + i * l.cell, l.oy + l.size);
    ctx.stroke();
  }
  for (let i = bh; i < n; i += bh) {
    ctx.beginPath();
    ctx.moveTo(l.ox, l.oy + i * l.cell);
    ctx.lineTo(l.ox + l.size, l.oy + i * l.cell);
    ctx.stroke();
  }
  ctx.lineWidth = 3;
  ctx.strokeRect(l.ox + 1.5, l.oy + 1.5, l.size - 3, l.size - 3);
}

function drawPalette(ctx: CanvasRenderingContext2D, s: State, l: Layout): void {
  const n = s.puzzle.size;
  const count = n + 1;
  const canFill = s.selected >= 0 && !s.puzzle.givenMask[s.selected];

  for (let i = 0; i < count; i += 1) {
    const r = paletteButtonRect(l, i, count);
    const isEraser = i === count - 1;
    const value = isEraser ? 0 : i + 1;
    const color = isEraser ? 'rgba(255,255,255,0.5)' : SYMBOL_COLORS[value] ?? '#ffffff';

    roundRect(ctx, r.x, r.y, r.w, r.h, 12);
    ctx.fillStyle = isEraser ? 'rgba(255,255,255,0.08)' : `${color}22`;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = canFill ? `${isEraser ? 'rgba(255,255,255,0.4)' : color}` : 'rgba(255,255,255,0.12)';
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = canFill ? color : 'rgba(255,255,255,0.3)';
    ctx.font = `bold ${Math.min(24, r.h * 0.5)}px system-ui, sans-serif`;
    ctx.fillText(isEraser ? String.fromCharCode(0x2715) : String(value), r.x + r.w / 2, r.y + r.h / 2 + 1);
  }
}
