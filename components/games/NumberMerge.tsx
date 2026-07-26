'use client';

import { useEffect, useRef } from 'react';
import type { Direction } from '@/lib/input';
import type { Difficulty } from '@/lib/difficulty';
import type { GameCanvasProps } from '@/lib/games';
import { playSound, unlockAudio } from '@/lib/sound';
import { useCanvasGame } from '@/lib/useCanvasGame';

/**
 * Number Merge - an original slide-and-combine puzzle. Four directions, one
 * rule: push every tile as far as it will go; two equal tiles that collide
 * become one tile worth double; a fresh 2 (mostly) or 4 appears after every
 * move that actually changed the board; play never ends on its own.
 *
 * Everything above the component is pure - no canvas, no React, no
 * Math.random - so scripts/check-numbermerge.ts can drive the real rules
 * headlessly. Three things matter most and are all invisible from the
 * renderer:
 *
 *  1. A single-pass merge that quietly merges twice. [2,2,2,2] pushed one way
 *     must become [4,4,0,0], never [8,0,0,0] - each tile may take part in at
 *     most one merge per move, and a tile a merge just created never merges
 *     again in that same move (the classic "3 in a row" trap: [2,2,4] must
 *     become [4,4,0], not [8,0,0]). `slideLine` walks left-to-right exactly
 *     once and never revisits a written cell.
 *  2. A dishonest game over. The board is genuinely stuck only when every
 *     cell is full AND no two orthogonal neighbours share a value - `hasMoves`
 *     tests that directly, and separately every one of the four `slideGrid`
 *     directions must agree by reporting `moved: false`. scripts/check-
 *     numbermerge.ts brute-forces random boards to hold those two independent
 *     answers to each other.
 *  3. Score that does not match what actually merged. Every merge adds
 *     exactly the new tile's value to the score for that move (2+2 -> +4),
 *     never a flat per-move bonus and never double-counted.
 *
 * Tiles carry a stable id purely so the renderer can animate a slide and a
 * merge smoothly - `slideLine`/`slideGrid` report which id moved from which
 * index to which, and which pair of ids merged into which survivor, but none
 * of that id bookkeeping affects the values a checker cares about.
 *
 * The art is original: rounded tiles, a soft vertical gradient keyed to
 * log2(value) so the palette sweeps smoothly from cool to warm as numbers
 * grow, a bounce-pop on merge, a scale-in pop on spawn, and a procedural
 * dotted backdrop - no assets, no borrowed layout or naming.
 */

// --- the grid ----------------------------------------------------------

export const SIZE = 4;

export type CellTile = { id: number; value: number };
/** Row-major, index r*SIZE+c. null is empty. */
export type Grid = Array<CellTile | null>;

export function emptyGrid(): Grid {
  return new Array<CellTile | null>(SIZE * SIZE).fill(null);
}

export function cloneGrid(g: Grid): Grid {
  return g.slice();
}

/** Values only, for comparisons and drawing - -1 has no meaning here, 0 is empty. */
export function valuesOf(grid: Grid): number[] {
  return grid.map((cell) => (cell ? cell.value : 0));
}

export function highestValue(grid: Grid): number {
  let hi = 0;
  for (const cell of grid) if (cell && cell.value > hi) hi = cell.value;
  return hi;
}

export function emptyIndices(grid: Grid): number[] {
  const out: number[] = [];
  for (let i = 0; i < grid.length; i += 1) if (!grid[i]) out.push(i);
  return out;
}

/** Seeded LCG, same pattern used across every game in this app - generation must never touch Math.random. */
export function lcg(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Chance a spawned tile is a 4 rather than a 2. Hard leans on more 4s, which is genuinely harder to plan around. */
export const SPAWN_FOUR_CHANCE: Record<Difficulty, number> = {
  easy: 0.05,
  normal: 0.1,
  hard: 0.18,
};

export type SpawnResult = { grid: Grid; at: number | null; value: number };

/**
 * Drops one new tile into a random empty cell. Pure: the caller supplies both
 * the rng draw and the id to stamp on the new tile, so this can never reach
 * for Math.random or a mutable counter of its own.
 */
export function spawnTile(grid: Grid, rng: () => number, id: number, fourChance = 0.1): SpawnResult {
  const empties = emptyIndices(grid);
  if (empties.length === 0) return { grid, at: null, value: 0 };
  const at = empties[Math.floor(rng() * empties.length)];
  const value = rng() < fourChance ? 4 : 2;
  const out = grid.slice();
  out[at] = { id, value };
  return { grid: out, at, value };
}

/** A fresh board: two starting tiles, the classic opening deal. */
export function newGrid(rng: () => number, startId: number, fourChance = 0.1): { grid: Grid; nextId: number } {
  let nextId = startId;
  let grid = emptyGrid();
  const first = spawnTile(grid, rng, nextId, fourChance);
  grid = first.grid;
  nextId += 1;
  const second = spawnTile(grid, rng, nextId, fourChance);
  grid = second.grid;
  nextId += 1;
  return { grid, nextId };
}

// --- sliding one line ----------------------------------------------------

export type LineMove = { id: number; from: number; to: number };
export type LineMerge = { keepId: number; eatenId: number; index: number; value: number };

export type LineResult = {
  line: Array<CellTile | null>;
  gained: number;
  moves: LineMove[];
  merges: LineMerge[];
};

/**
 * Slides one line (already extracted in the direction of travel, so "toward
 * index 0" is always the rule here) and merges as it goes.
 *
 * Single left-to-right pass over the present tiles only: a tile that was just
 * written as a merge survivor is never reconsidered, which is exactly what
 * stops a run of three or four equal tiles from cascading into one giant
 * merge. `present` preserves original order and original index (`from`), so
 * every reported move and merge id can be traced back to a real source tile.
 */
export function slideLine(line: Array<CellTile | null>): LineResult {
  const n = line.length;
  const present: Array<{ cell: CellTile; from: number }> = [];
  for (let i = 0; i < n; i += 1) {
    const cell = line[i];
    if (cell) present.push({ cell, from: i });
  }

  const out: Array<CellTile | null> = new Array(n).fill(null);
  const moves: LineMove[] = [];
  const merges: LineMerge[] = [];
  let gained = 0;
  let write = 0;
  let i = 0;

  while (i < present.length) {
    const cur = present[i];
    const next = present[i + 1];
    if (next && next.cell.value === cur.cell.value) {
      const value = cur.cell.value * 2;
      out[write] = { id: cur.cell.id, value };
      gained += value;
      if (cur.from !== write) moves.push({ id: cur.cell.id, from: cur.from, to: write });
      // The consumed tile always genuinely travels here: it sat strictly to
      // the right of `cur` in the original line, and `write` never exceeds
      // `cur.from`, so `next.from > write` always holds.
      moves.push({ id: next.cell.id, from: next.from, to: write });
      merges.push({ keepId: cur.cell.id, eatenId: next.cell.id, index: write, value });
      i += 2;
    } else {
      out[write] = { id: cur.cell.id, value: cur.cell.value };
      if (cur.from !== write) moves.push({ id: cur.cell.id, from: cur.from, to: write });
      i += 1;
    }
    write += 1;
  }

  return { line: out, gained, moves, merges };
}

// --- sliding the whole grid ------------------------------------------------

/** The SIZE grid indices for row/column `k`, in travel order for `dir`. */
function lineIndices(dir: Direction, k: number): number[] {
  const idx: number[] = [];
  for (let i = 0; i < SIZE; i += 1) {
    if (dir === 'left') idx.push(k * SIZE + i);
    else if (dir === 'right') idx.push(k * SIZE + (SIZE - 1 - i));
    else if (dir === 'up') idx.push(i * SIZE + k);
    else idx.push((SIZE - 1 - i) * SIZE + k);
  }
  return idx;
}

export type GridMove = { id: number; from: number; to: number };
export type GridMerge = { keepId: number; eatenId: number; index: number; value: number };

export type GridResult = {
  grid: Grid;
  /** True the instant anything actually changed - a tile sliding OR a merge. */
  moved: boolean;
  gained: number;
  moves: GridMove[];
  merges: GridMerge[];
  highest: number;
};

/** Slides and merges every row (left/right) or column (up/down) at once. */
export function slideGrid(grid: Grid, dir: Direction): GridResult {
  const out = grid.slice();
  let gained = 0;
  const moves: GridMove[] = [];
  const merges: GridMerge[] = [];

  for (let k = 0; k < SIZE; k += 1) {
    const idx = lineIndices(dir, k);
    const line = idx.map((i) => grid[i]);
    const res = slideLine(line);
    gained += res.gained;
    for (let i = 0; i < SIZE; i += 1) out[idx[i]] = res.line[i];
    for (const m of res.moves) moves.push({ id: m.id, from: idx[m.from], to: idx[m.to] });
    for (const m of res.merges) merges.push({ ...m, index: idx[m.index] });
  }

  return { grid: out, moved: moves.length > 0, gained, moves, merges, highest: highestValue(out) };
}

/**
 * The board is stuck only when every cell is full AND no two orthogonal
 * neighbours share a value. Deliberately independent of `slideGrid` - it
 * never slides anything, just tests the two conditions directly, so the
 * checker can hold it to agreement with "none of the four directions moved"
 * rather than comparing the same code path with itself.
 */
export function hasMoves(grid: Grid): boolean {
  for (let i = 0; i < grid.length; i += 1) if (!grid[i]) return true;
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      const cur = grid[r * SIZE + c] as CellTile; // safe: the loop above found no nulls
      if (c + 1 < SIZE && (grid[r * SIZE + c + 1] as CellTile).value === cur.value) return true;
      if (r + 1 < SIZE && (grid[(r + 1) * SIZE + c] as CellTile).value === cur.value) return true;
    }
  }
  return false;
}

// --- milestones --------------------------------------------------------
//
// A "level" here is reaching a new highest tile at or above a milestone -
// each one opens the study gate, the same way clearing a picture or a set of
// lines does in this app's other grid games. Endless: the list just keeps
// doubling past its last named entry.

const NAMED_MILESTONES = [64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768];

/** The next milestone strictly above `highest so far reached` - doubles forever once past the named list. */
export function nextMilestone(reached: number): number {
  for (const m of NAMED_MILESTONES) if (m > reached) return m;
  let m = NAMED_MILESTONES[NAMED_MILESTONES.length - 1];
  while (m <= reached) m *= 2;
  return m;
}

// --- layout --------------------------------------------------------------

const CELL = 78;
const GAP = 8;
const PAD = 14;
const HUD_H = 44;
export const BOARD_W = SIZE * CELL + (SIZE - 1) * GAP + PAD * 2;
const GRID_X = PAD;
const GRID_Y = HUD_H + PAD;
export const BOARD_H = GRID_Y + SIZE * CELL + (SIZE - 1) * GAP + PAD;

export type Layout = { scale: number; ox: number; oy: number };

export function layoutFor(cw: number, ch: number, inset: number): Layout {
  const usableH = Math.max(1, ch - inset);
  const scale = Math.min(cw / BOARD_W, usableH / BOARD_H);
  return { scale, ox: (cw - BOARD_W * scale) / 2, oy: (usableH - BOARD_H * scale) / 2 };
}

/** Top-left, in board units, of grid cell (r, c). */
export function cellRect(r: number, c: number): { x: number; y: number } {
  return { x: GRID_X + c * (CELL + GAP), y: GRID_Y + r * (CELL + GAP) };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// --- palette ---------------------------------------------------------------
//
// An original sweep, not a lookup table copied from any one game: hue slides
// smoothly from a cool teal at 2 toward warm gold as log2(value) climbs, and
// wraps back through a second, brighter sweep for anything beyond 2048 so an
// endless run never runs out of colour.

/** Comma hsl() syntax - older iOS Safari does not parse the modern space form. */
function hsl(h: number, s: number, l: number, a = 1): string {
  const hh = ((h % 360) + 360) % 360;
  return a >= 1 ? `hsl(${hh}, ${s}%, ${l}%)` : `hsla(${hh}, ${s}%, ${l}%, ${a})`;
}

type Tone = { light: string; base: string; dark: string; text: string };

function toneForValue(value: number): Tone {
  const step = Math.max(0, Math.log2(Math.max(2, value)) - 1); // 2->0, 4->1, 8->2, ...
  const lap = Math.floor(step / 10);
  const within = step % 10;
  // 168 (teal) sweeping down to -12 (warm coral) across ten steps, each lap
  // brightening the saturation a touch so a run that goes past 2048 still
  // visibly keeps climbing rather than repeating an identical colour.
  const hue = 168 - within * 18 + lap * 24;
  const sat = 62 + Math.min(lap, 3) * 8;
  const light = value <= 4 ? 84 : 60;
  return {
    light: hsl(hue, sat, Math.min(92, light + 14)),
    base: hsl(hue, sat, light),
    dark: hsl(hue, sat, Math.max(18, light - 30)),
    text: value <= 4 ? hsl(hue, sat, 20) : '#fdfdff',
  };
}

// --- game state ------------------------------------------------------------

type AnimTile = {
  id: number;
  value: number;
  /** Board-unit top-left, current and travel endpoints during a slide. */
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  /** Consumed by a merge - fades out and is removed once the slide settles. */
  dying: boolean;
  /** 0..1, drives the merge bounce or the spawn scale-in. 1 means settled. */
  pop: number;
  /** True while `pop` is animating a just-merged bump rather than a fresh spawn. */
  popMerge: boolean;
};

type Phase = 'idle' | 'sliding';

type GameApi = GameCanvasProps['api'];

type State = {
  difficulty: Difficulty;
  grid: Grid;
  nextId: number;
  rng: () => number;
  fxRng: () => number;
  score: number;
  moves: number;
  highest: number;
  milestone: number;
  tiles: Map<number, AnimTile>;
  phase: Phase;
  phaseT: number;
  pending: GridResult | null;
  time: number;
  shake: number;
  pop: { text: string; t: number } | null;
  deadFlash: number;
  dimAt: { w: number; h: number } | null;
};

function tilesFromGrid(grid: Grid): Map<number, AnimTile> {
  const out = new Map<number, AnimTile>();
  for (let i = 0; i < grid.length; i += 1) {
    const cell = grid[i];
    if (!cell) continue;
    const r = Math.floor(i / SIZE);
    const c = i % SIZE;
    const { x, y } = cellRect(r, c);
    out.set(cell.id, { id: cell.id, value: cell.value, x, y, fromX: x, fromY: y, toX: x, toY: y, dying: false, pop: 1, popMerge: false });
  }
  return out;
}

function freshState(difficulty: Difficulty, seed: number): State {
  const rng = lcg(seed);
  const { grid, nextId } = newGrid(rng, 1, SPAWN_FOUR_CHANCE[difficulty]);
  return {
    difficulty,
    grid,
    nextId,
    rng,
    fxRng: lcg((seed ^ 0x9e3779b9) >>> 0),
    score: 0,
    moves: 0,
    highest: highestValue(grid),
    milestone: nextMilestone(highestValue(grid)),
    tiles: tilesFromGrid(grid),
    phase: 'idle',
    phaseT: 0,
    pending: null,
    time: 0,
    shake: 0,
    pop: null,
    deadFlash: 0,
    dimAt: null,
  };
}

/** Free restart after a stuck board - fresh deal, score and highest tile carry over. */
function reseed(s: State): void {
  const { grid, nextId } = newGrid(s.rng, s.nextId, SPAWN_FOUR_CHANCE[s.difficulty]);
  s.grid = grid;
  s.nextId = nextId;
  s.tiles = tilesFromGrid(grid);
  s.phase = 'idle';
  s.phaseT = 0;
  s.pending = null;
  s.deadFlash = 0.5;
}

const MOVE_DUR = 0.11;
const POP_DUR = 0.22;
const SPAWN_DUR = 0.22;

function award(s: State, api: GameApi, n: number): void {
  s.score += n;
  api.addScore(n);
}

/** Kicks off a slide: computes the pure result, arms every animated tile toward its destination. */
function beginMove(s: State, dir: Direction): void {
  if (s.phase !== 'idle') return;
  const result = slideGrid(s.grid, dir);
  if (!result.moved) return;

  for (const move of result.moves) {
    const t = s.tiles.get(move.id);
    if (!t) continue;
    const r = Math.floor(move.to / SIZE);
    const c = move.to % SIZE;
    const { x, y } = cellRect(r, c);
    t.fromX = t.x;
    t.fromY = t.y;
    t.toX = x;
    t.toY = y;
  }
  for (const merge of result.merges) {
    const eaten = s.tiles.get(merge.eatenId);
    if (eaten) eaten.dying = true;
  }

  s.pending = result;
  s.phase = 'sliding';
  s.phaseT = 0;
  playSound('click');
}

/** Applies the merges the slide finished carrying out, spawns the next tile, checks for the game ending. */
function settleMove(s: State, api: GameApi): void {
  const result = s.pending;
  s.pending = null;
  s.phase = 'idle';
  s.phaseT = 0;
  if (!result) return;

  s.grid = result.grid;
  s.moves += 1;
  award(s, api, result.gained);

  for (const merge of result.merges) {
    const keep = s.tiles.get(merge.keepId);
    const eaten = s.tiles.get(merge.eatenId);
    if (eaten) s.tiles.delete(merge.eatenId);
    if (keep) {
      keep.value = merge.value;
      keep.pop = 0;
      keep.popMerge = true;
      const r = Math.floor(merge.index / SIZE);
      const c = merge.index % SIZE;
      const { x, y } = cellRect(r, c);
      keep.x = x;
      keep.y = y;
      keep.toX = x;
      keep.toY = y;
    }
  }
  // Anything that moved but did not merge: snap to its resting spot exactly
  // (the interpolation already got it there; this just removes any drift).
  for (const move of result.moves) {
    const t = s.tiles.get(move.id);
    if (!t) continue;
    t.x = t.toX;
    t.y = t.toY;
  }

  if (result.merges.length > 0) {
    const n = result.merges.length;
    for (let i = 0; i < n; i += 1) playSound('brick', i * 3);
    if (n >= 2) playSound('coin', n);
    s.shake = Math.min(2.4, 0.8 + n * 0.5);
    s.pop = { text: `+${result.gained}`, t: 0 };
  }

  if (result.highest > s.highest) {
    s.highest = result.highest;
    if (result.highest >= s.milestone) {
      s.milestone = nextMilestone(result.highest);
      playSound('powerup');
      api.setStatus(`${result.highest} tile!`);
      api.requestGate(`Reached ${result.highest}!`);
    }
  }

  const spawn = spawnTile(s.grid, s.rng, s.nextId, SPAWN_FOUR_CHANCE[s.difficulty]);
  if (spawn.at !== null) {
    const newId = s.nextId;
    s.nextId += 1;
    s.grid = spawn.grid;
    const r = Math.floor(spawn.at / SIZE);
    const c = spawn.at % SIZE;
    const { x, y } = cellRect(r, c);
    s.tiles.set(newId, {
      id: newId,
      value: spawn.value,
      x,
      y,
      fromX: x,
      fromY: y,
      toX: x,
      toY: y,
      dying: false,
      pop: 0,
      popMerge: false,
    });
  }

  if (!hasMoves(s.grid)) {
    playSound('gameOver');
    api.died('No moves left');
    // Dying is free in this app: a fresh, playable deal appears immediately
    // rather than a blank or a locked board.
    reseed(s);
  }
}

// --- component -------------------------------------------------------------

export default function NumberMerge({
  paused,
  input,
  api,
  restartToken,
  difficulty,
  character,
  controlsInset,
}: GameCanvasProps) {
  const stateRef = useRef<State | null>(null);
  const seedRef = useRef(1);

  useEffect(() => {
    seedRef.current = (Date.now() ^ Math.imul(restartToken + 1, 2654435761)) >>> 0 || 1;
    stateRef.current = null;
  }, [restartToken, difficulty]);

  // iOS will not start an AudioContext outside a user gesture; catch the
  // first tap on the touch overlay while the gesture is still live.
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const { canvasRef } = useCanvasGame({
    // Kept alive through a pause so the freeze can be painted dimmed once,
    // matching Block Drop rather than leaving the last live frame on screen.
    active: true,
    step: (ctx, dt, cw, ch) => {
      let s = stateRef.current;
      if (!s || s.difficulty !== difficulty) {
        s = freshState(difficulty, seedRef.current);
        stateRef.current = s;
      }
      const layout = layoutFor(cw, ch, controlsInset);

      if (paused) {
        if (!s.dimAt || s.dimAt.w !== cw || s.dimAt.h !== ch) {
          s.dimAt = { w: cw, h: ch };
          draw(ctx, s, layout, cw, ch, character.accent, true);
        }
        return;
      }
      s.dimAt = null;

      s.time += dt;
      if (s.shake > 0) s.shake = Math.max(0, s.shake - dt * 6);
      if (s.deadFlash > 0) s.deadFlash -= dt;
      if (s.pop) {
        s.pop.t += dt;
        if (s.pop.t > 0.9) s.pop = null;
      }

      // --- input: one discrete slide per idle frame ---
      if (s.phase === 'idle') {
        const tap = input.consumeTap();
        if (tap) beginMove(s, tap);
      }

      // --- animate the current phase ---
      if (s.phase === 'sliding') {
        s.phaseT += dt;
        const k = Math.min(1, s.phaseT / MOVE_DUR);
        const eased = 1 - (1 - k) * (1 - k);
        for (const t of s.tiles.values()) {
          t.x = t.fromX + (t.toX - t.fromX) * eased;
          t.y = t.fromY + (t.toY - t.fromY) * eased;
        }
        if (s.phaseT >= MOVE_DUR) settleMove(s, api);
      }

      // Pop / spawn easing, independent of the slide phase so a merge that
      // resolves right as the next slide begins still finishes its bounce.
      for (const t of s.tiles.values()) {
        if (t.pop < 1) t.pop = Math.min(1, t.pop + dt / (t.popMerge ? POP_DUR : SPAWN_DUR));
      }

      draw(ctx, s, layout, cw, ch, character.accent, false);
    },
  });

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />;
}

// --- drawing -----------------------------------------------------------

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Overshoot-and-settle easing for the merge bounce and the spawn pop. */
function easeOutBack(t: number): number {
  const k = clamp(t, 0, 1);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
}

function fontSizeFor(value: number): number {
  if (value < 100) return 28;
  if (value < 1000) return 24;
  if (value < 10000) return 20;
  return 16;
}

function drawTile(ctx: CanvasRenderingContext2D, t: AnimTile): void {
  const scale = t.dying ? 1 - clamp(t.pop, 0, 1) : easeOutBack(t.pop);
  if (scale <= 0.02) return;
  const tone = toneForValue(t.value);
  const size = CELL * clamp(scale, 0, 1.15);
  const cx = t.x + CELL / 2;
  const cy = t.y + CELL / 2;
  const x = cx - size / 2;
  const y = cy - size / 2;
  const r = size * 0.16;

  ctx.save();
  if (t.dying) ctx.globalAlpha = clamp(1 - t.pop, 0, 1);

  const body = ctx.createLinearGradient(x, y, x, y + size);
  body.addColorStop(0, tone.light);
  body.addColorStop(1, tone.base);
  ctx.fillStyle = body;
  roundRect(ctx, x, y, size, size, r);
  ctx.fill();

  ctx.strokeStyle = tone.dark;
  ctx.lineWidth = Math.max(1, size * 0.035);
  roundRect(ctx, x + ctx.lineWidth / 2, y + ctx.lineWidth / 2, size - ctx.lineWidth, size - ctx.lineWidth, r * 0.9);
  ctx.stroke();

  if (!t.dying) {
    ctx.fillStyle = tone.text;
    ctx.font = `bold ${fontSizeFor(t.value) * clamp(scale, 0.3, 1)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(t.value), cx, cy + 1);
  }
  ctx.restore();
}

function drawBoard(ctx: CanvasRenderingContext2D, s: State): void {
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  const w = SIZE * CELL + (SIZE - 1) * GAP;
  roundRect(ctx, GRID_X - 6, GRID_Y - 6, w + 12, w + 12, 16);
  ctx.fill();

  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      const { x, y } = cellRect(r, c);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      roundRect(ctx, x, y, CELL, CELL, CELL * 0.16);
      ctx.fill();
    }
  }

  // Dying tiles first (they sit visually beneath the survivor sliding onto
  // the same cell), then everything else, sorted so a currently-sliding tile
  // never draws under one that has already settled.
  const list = Array.from(s.tiles.values());
  list.sort((a, b) => Number(b.dying) - Number(a.dying) || a.pop - b.pop);
  for (const t of list) drawTile(ctx, t);
}

function drawHud(ctx: CanvasRenderingContext2D, s: State, accent: string): void {
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 13px ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.textAlign = 'left';
  ctx.fillText(`SCORE ${s.score}`, PAD, 14);
  ctx.fillStyle = accent;
  ctx.fillText(`BEST TILE ${s.highest}`, PAD, 30);
  ctx.textAlign = 'right';
  const w = SIZE * CELL + (SIZE - 1) * GAP;
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText(`NEXT ${s.milestone}`, GRID_X + w, 14);
  ctx.fillText(`${s.moves} moves`, GRID_X + w, 30);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function drawPop(ctx: CanvasRenderingContext2D, s: State): void {
  if (!s.pop) return;
  const k = clamp(s.pop.t / 0.9, 0, 1);
  ctx.save();
  ctx.globalAlpha = clamp(1 - Math.max(0, k - 0.55) / 0.45, 0, 1);
  ctx.font = 'bold 18px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  const w = SIZE * CELL + (SIZE - 1) * GAP;
  const x = GRID_X + w / 2;
  const y = GRID_Y - 8 - s.pop.t * 20;
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(10,8,20,0.75)';
  ctx.strokeText(s.pop.text, x, y);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(s.pop.text, x, y);
  ctx.restore();
}

function draw(
  ctx: CanvasRenderingContext2D,
  s: State,
  layout: Layout,
  cw: number,
  ch: number,
  accent: string,
  dimmed: boolean,
): void {
  const bgHue = 250 + Math.min(Math.log2(Math.max(2, s.highest)), 14) * 3;
  const bg = ctx.createLinearGradient(0, 0, 0, ch);
  bg.addColorStop(0, hsl(bgHue, 30, 15));
  bg.addColorStop(1, hsl(bgHue + 14, 34, 8));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, cw, ch);

  ctx.save();
  ctx.translate(layout.ox, layout.oy);
  ctx.scale(layout.scale, layout.scale);
  if (s.shake > 0) {
    ctx.translate(Math.sin(s.time * 61) * s.shake, Math.cos(s.time * 47) * s.shake * 0.6);
  }
  if (s.deadFlash > 0) {
    ctx.globalAlpha = 0.55 + 0.45 * (1 - clamp(s.deadFlash / 0.5, 0, 1));
  }

  drawHud(ctx, s, accent);
  drawBoard(ctx, s);
  drawPop(ctx, s);

  ctx.restore();

  if (dimmed) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, 0, cw, ch);
  }
}
