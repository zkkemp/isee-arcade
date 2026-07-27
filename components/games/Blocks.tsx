'use client';

import { useEffect, useRef } from 'react';
import type { Difficulty } from '@/lib/difficulty';
import type { GameCanvasProps } from '@/lib/games';
import { playSound, unlockAudio } from '@/lib/sound';
import { useCanvasGame } from '@/lib/useCanvasGame';

/**
 * Block Drop - drag polyomino pieces onto a grid, fill a row or a column, it
 * clears.
 *
 * Everything above the component is pure: no canvas, no React, no Math.random.
 * `canPlace`, `place`, `clearLines`, `previewLines`, `anyFits`, `refillTray` and
 * the scoring functions are the real ones the game runs, and
 * scripts/check-blocks.ts drives them headlessly. The three failures that ruin
 * this genre are all invisible from the renderer, so all three are proven there
 * instead of hoped for:
 *
 *  1. A placement that quietly overwrites a filled cell. The board carries two
 *     representations - a colour per cell for drawing, and one bitmask per row
 *     that `canPlace` actually tests against. That is deliberate: a bitmask test
 *     is a genuinely different code path from a naive cell scan, so the checker
 *     cross-checking one against the other can catch a real desync rather than
 *     comparing an implementation with itself.
 *  2. Line clearing that removes the wrong cells. A row and a column can both be
 *     full at once and they share a cell, so clearing is a union, computed once,
 *     never "clear rows then recompute columns".
 *  3. A dishonest game over. Ending the run while a piece still fits somewhere is
 *     the single most infuriating bug in this genre, and ending it a placement
 *     late is just as bad. Game over here is exactly `!anyFits(board, tray)` and
 *     the checker brute-forces every piece at every position to confirm it.
 *
 * The art is drawn procedurally - rounded blocks with a gradient body, a glossy
 * cap, a diagonal bevel and a soft drop shadow, over a warm background whose hue
 * drifts as the level rises. No assets, nothing borrowed.
 */

// --- board -----------------------------------------------------------------

/**
 * 10x10 (Session: kids' feedback pass) - up from 8x8. More, smaller cells is
 * what makes the level-start pictures in the pattern section below actually
 * read as a smiley or a cat instead of a blur of four squares, while still
 * leaving every piece in the catalogue - the biggest is a 3x3 footprint -
 * comfortably drawable and droppable with a fingertip on an iPad.
 */
export const GRID = 10;
export const BOARD_SIZES = [10, 12, 14] as const;
export type BoardSize = (typeof BOARD_SIZES)[number];
/** All GRID columns occupied, as a bitmask. */
export const FULL_ROW = (1 << GRID) - 1;

export function fullRowFor(size: number): number {
  return (1 << size) - 1;
}

/**
 * A board is a colour per cell for drawing plus one column-bitmask per row for
 * collision. Both must always agree; `masksAgree` is what the checker holds them
 * to.
 */
export type Board = {
  /** Number of rows and columns. */
  size: number;
  /** Tone index per cell, row-major. -1 is empty. */
  cells: number[];
  /** Bit c of rows[r] is set when cell (r,c) is filled. */
  rows: number[];
};

export function makeBoard(size: number = GRID): Board {
  return {
    size,
    cells: new Array<number>(size * size).fill(-1),
    rows: new Array<number>(size).fill(0),
  };
}

export function cloneBoard(b: Board): Board {
  return { size: b.size, cells: b.cells.slice(), rows: b.rows.slice() };
}

/** True when the row bitmasks describe exactly the filled cells. */
export function masksAgree(b: Board): boolean {
  for (let r = 0; r < b.size; r += 1) {
    let mask = 0;
    for (let c = 0; c < b.size; c += 1) if (b.cells[r * b.size + c] >= 0) mask |= 1 << c;
    if (mask !== b.rows[r]) return false;
  }
  return true;
}

export function fillCount(b: Board): number {
  let n = 0;
  for (const v of b.cells) if (v >= 0) n += 1;
  return n;
}

// --- shapes ----------------------------------------------------------------

export type Offset = { dr: number; dc: number };

export type Shape = {
  /** Base id plus rotation index. Unique across the catalogue. */
  id: string;
  /** Occupied columns per shape row, as a bitmask. Length is h. */
  rowMasks: number[];
  /** Occupied cells, row-major. Length is size. */
  cells: Offset[];
  w: number;
  h: number;
  size: number;
};

export type BaseShape = {
  id: string;
  size: number;
  /** Distinct rotations only, so a square has one and a domino two. */
  rotations: Shape[];
  /** Relative frequency in the bag, per difficulty. 0 keeps it out entirely. */
  weight: Record<Difficulty, number>;
};

function padArt(art: string[]): string[] {
  const w = art.reduce((m, row) => Math.max(m, row.length), 0);
  return art.map((row) => row.padEnd(w, '.'));
}

function rotateArt(art: string[]): string[] {
  const rows = padArt(art);
  const h = rows.length;
  const w = rows[0].length;
  const out: string[] = [];
  for (let c = 0; c < w; c += 1) {
    let line = '';
    for (let r = h - 1; r >= 0; r -= 1) line += rows[r][c] === '#' ? '#' : '.';
    out.push(line);
  }
  return out;
}

function toShape(id: string, art: string[]): Shape {
  const rows = padArt(art);
  const cells: Offset[] = [];
  const rowMasks: number[] = [];
  for (let r = 0; r < rows.length; r += 1) {
    let mask = 0;
    for (let c = 0; c < rows[r].length; c += 1) {
      if (rows[r][c] !== '#') continue;
      mask |= 1 << c;
      cells.push({ dr: r, dc: c });
    }
    rowMasks.push(mask);
  }
  return { id, rowMasks, cells, w: rows[0].length, h: rows.length, size: cells.length };
}

function base(
  id: string,
  art: string[],
  weight: Record<Difficulty, number>,
): BaseShape {
  const seen = new Set<string>();
  const rotations: Shape[] = [];
  let cur = padArt(art);
  for (let i = 0; i < 4; i += 1) {
    const key = cur.join('/');
    if (!seen.has(key)) {
      seen.add(key);
      rotations.push(toShape(`${id}#${rotations.length}`, cur));
    }
    cur = rotateArt(cur);
  }
  return { id, size: rotations[0].size, rotations, weight };
}

const w = (easy: number, normal: number, hard: number): Record<Difficulty, number> => ({
  easy,
  normal,
  hard,
});

/**
 * The catalogue, ordered small to large. Weights are the whole difficulty curve:
 * easy is dominated by 1-3 cell shapes and never draws a pentomino, hard leans on
 * the awkward ones (the plus, the U, the S) that only fit a board you have kept
 * tidy. A five-year-old and a twelve-year-old are playing the same game with very
 * different bags.
 */
export const BASES: BaseShape[] = [
  base('single', ['#'], w(4, 2, 1)),
  base('domino', ['##'], w(11, 6, 3)),
  base('tri-i', ['###'], w(9, 7, 4)),
  base('tri-l', ['#.', '##'], w(11, 9, 5)),
  base('square', ['##', '##'], w(7, 7, 6)),
  base('quad-i', ['####'], w(4, 6, 6)),
  base('quad-l', ['#.', '#.', '##'], w(4, 6, 6)),
  base('quad-j', ['.#', '.#', '##'], w(4, 6, 6)),
  base('quad-t', ['###', '.#.'], w(3, 5, 5)),
  base('quad-s', ['.##', '##.'], w(0, 4, 5)),
  base('quad-z', ['##.', '.##'], w(0, 4, 5)),
  base('five-i', ['#####'], w(0, 2, 4)),
  base('five-l', ['#.', '#.', '#.', '##'], w(0, 2, 4)),
  base('five-p', ['##', '##', '#.'], w(0, 2, 4)),
  base('five-v', ['#..', '#..', '###'], w(0, 1, 3)),
  base('five-t', ['###', '.#.', '.#.'], w(0, 1, 3)),
  base('five-u', ['#.#', '###'], w(0, 1, 3)),
  base('five-plus', ['.#.', '###', '.#.'], w(0, 0, 3)),
  base('five-s', ['.##', '.#.', '##.'], w(0, 0, 3)),
];

const SINGLE = BASES[0].rotations[0];

const BAGS: Record<Difficulty, BaseShape[]> = {
  easy: BASES.filter((b) => b.weight.easy > 0),
  normal: BASES.filter((b) => b.weight.normal > 0),
  hard: BASES.filter((b) => b.weight.hard > 0),
};

/** The shapes that can actually be drawn at a difficulty. */
export function bagFor(d: Difficulty): BaseShape[] {
  return BAGS[d];
}

export const TONE_COUNT = 6;

/** One tray candidate: a shape in a fixed orientation plus its colour. */
export type Piece = { shape: Shape; tone: number };

// --- rules -----------------------------------------------------------------

/**
 * The one rule that decides everything. Tested against the row bitmasks, so a
 * piece overlapping any filled cell, or hanging off any edge, is rejected in at
 * most `h` operations. There is no rotation at play time - a tray piece is placed
 * exactly as it is shown, which is what keeps this playable one-handed.
 */
export function canPlace(b: Board, s: Shape, r: number, c: number): boolean {
  if (r < 0 || c < 0 || r + s.h > b.size || c + s.w > b.size) return false;
  for (let i = 0; i < s.h; i += 1) {
    if ((b.rows[r + i] & (s.rowMasks[i] << c)) !== 0) return false;
  }
  return true;
}

/** Writes a piece in. Callers must have checked `canPlace` first. */
export function place(b: Board, s: Shape, r: number, c: number, tone: number): void {
  for (const cell of s.cells) {
    const rr = r + cell.dr;
    const cc = c + cell.dc;
    b.cells[rr * b.size + cc] = tone;
    b.rows[rr] |= 1 << cc;
  }
}

export type Clear = {
  rows: number[];
  cols: number[];
  /** Every cell removed, with the tone it had, for the sweep animation. */
  cells: Array<{ r: number; c: number; tone: number }>;
};

/**
 * Clears every full row and every full column, simultaneously.
 *
 * Rows and columns are both worked out from the *pre-clear* board and then
 * removed as one union. Clearing rows first and re-reading columns afterwards
 * would find fewer columns - the shared cells would already be gone - and a
 * player who set up a cross would be quietly robbed of it.
 */
export function clearLines(b: Board): Clear {
  const rows: number[] = [];
  const cols: number[] = [];
  const fullRow = fullRowFor(b.size);

  for (let r = 0; r < b.size; r += 1) if (b.rows[r] === fullRow) rows.push(r);

  // A column is full exactly when its bit survives an AND across every row.
  let colMask = fullRow;
  for (let r = 0; r < b.size; r += 1) colMask &= b.rows[r];
  for (let c = 0; c < b.size; c += 1) if ((colMask & (1 << c)) !== 0) cols.push(c);

  const cells: Clear['cells'] = [];
  if (rows.length === 0 && cols.length === 0) return { rows, cols, cells };

  const rowHit = new Array<boolean>(b.size).fill(false);
  const colHit = new Array<boolean>(b.size).fill(false);
  for (const r of rows) rowHit[r] = true;
  for (const c of cols) colHit[c] = true;

  for (let r = 0; r < b.size; r += 1) {
    for (let c = 0; c < b.size; c += 1) {
      if (!rowHit[r] && !colHit[c]) continue;
      const i = r * b.size + c;
      cells.push({ r, c, tone: b.cells[i] });
      b.cells[i] = -1;
      b.rows[r] &= ~(1 << c);
    }
  }
  return { rows, cols, cells };
}

/**
 * Which lines a placement would complete, without touching the board. Drives the
 * "these lines are about to go" glow under the ghost, which is how a kid learns
 * what the game wants from them.
 */
export function previewLines(
  b: Board,
  s: Shape,
  r: number,
  c: number,
): { rows: number[]; cols: number[] } {
  const after = b.rows.slice();
  const fullRow = fullRowFor(b.size);
  for (let i = 0; i < s.h; i += 1) after[r + i] |= s.rowMasks[i] << c;

  const rows: number[] = [];
  const cols: number[] = [];
  for (let i = 0; i < b.size; i += 1) if (after[i] === fullRow) rows.push(i);
  let colMask = fullRow;
  for (let i = 0; i < b.size; i += 1) colMask &= after[i];
  for (let i = 0; i < b.size; i += 1) if ((colMask & (1 << i)) !== 0) cols.push(i);
  return { rows, cols };
}

/** First legal anchor in row-major order, or null when the shape fits nowhere. */
export function firstFit(b: Board, s: Shape): { r: number; c: number } | null {
  for (let r = 0; r + s.h <= b.size; r += 1) {
    for (let c = 0; c + s.w <= b.size; c += 1) {
      if (canPlace(b, s, r, c)) return { r, c };
    }
  }
  return null;
}

/** Game over is exactly `!anyFits(board, whatever is still in the tray)`. */
export function anyFits(b: Board, shapes: Shape[]): boolean {
  for (const s of shapes) if (firstFit(b, s) !== null) return true;
  return false;
}

// --- scoring ---------------------------------------------------------------

const PLACE_POINTS_PER_CELL = 2;
/** Consecutive clearing placements that still raise the multiplier. */
export const MAX_STREAK = 8;

/** A small, certain reward for every placement, so a quiet turn still counts. */
export function placeScore(s: Shape): number {
  return s.size * PLACE_POINTS_PER_CELL;
}

/**
 * Quadratic in lines, so a double beats two singles by a mile and a cross is
 * worth setting up. Strictly increasing in lines and non-decreasing in streak -
 * the checker holds it to both, because a scoring table that ever went backwards
 * would teach exactly the wrong habit.
 */
export function clearScore(lines: number, streak: number): number {
  if (lines <= 0) return 0;
  const bonus = 1 + 0.2 * Math.min(Math.max(streak, 0), MAX_STREAK);
  return Math.round(50 * lines * (lines + 1) * bonus);
}

export const MAX_LEVEL = 99;

/**
 * Points from one level to the next. Rising early, then flat.
 *
 * The flat cap is the important half. A level is what opens a study question, and
 * on a purely quadratic curve a good run on easy eventually outruns the ladder and
 * stops being asked anything - which inverts the whole point of the app. Capping
 * the step keeps questions arriving at a steady rate no matter how long the run
 * goes on.
 */
const LEVEL_STEP_BASE = 400;
const LEVEL_STEP_MAX = 3000;

const THRESHOLDS: number[] = (() => {
  const out = [0, 0];
  for (let lv = 2; lv <= MAX_LEVEL; lv += 1) {
    out[lv] = out[lv - 1] + Math.min(LEVEL_STEP_MAX, LEVEL_STEP_BASE * (lv - 1));
  }
  return out;
})();

/** Score needed to reach a level. */
export function levelThreshold(level: number): number {
  if (level <= 1) return 0;
  return THRESHOLDS[level > MAX_LEVEL ? MAX_LEVEL : level];
}

export function levelForScore(score: number): number {
  let lv = 1;
  while (lv < MAX_LEVEL && score >= levelThreshold(lv + 1)) lv += 1;
  return lv;
}

// --- the bag ---------------------------------------------------------------

/** Seeded LCG. Generation must never touch Math.random or nothing is provable. */
export function lcg(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A well-mixed, deterministic opening picture for a seed. */
export function openingPatternOffset(seed: number): number {
  let x = seed >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return (x >>> 0) % PATTERN_NAMES.length;
}

/**
 * Pick the next opening picture while guaranteeing it differs from the previous
 * run. The seed still chooses among the other five, so restarts do not merely
 * march through an obvious fixed loop.
 */
export function nextPatternOffset(seed: number, previous: number | null): number {
  const proposed = openingPatternOffset(seed);
  if (previous === null || proposed !== previous) return proposed;
  return (proposed + 1 + ((seed >>> 8) % (PATTERN_NAMES.length - 1))) % PATTERN_NAMES.length;
}

function drawShape(rng: () => number, d: Difficulty): Shape {
  const bag = bagFor(d);
  let total = 0;
  for (const b of bag) total += b.weight[d];
  let t = rng() * total;
  for (const b of bag) {
    t -= b.weight[d];
    if (t <= 0) return b.rotations[Math.floor(rng() * b.rotations.length)];
  }
  // Only reachable on a floating point edge; still a shape from this bag.
  const last = bag[bag.length - 1];
  return last.rotations[0];
}

export function drawPiece(rng: () => number, d: Difficulty): Piece {
  return { shape: drawShape(rng, d), tone: Math.floor(rng() * TONE_COUNT) };
}

/**
 * Whether a refill is allowed to hand out three pieces that all fit nowhere.
 * Easy and normal are not: the youngest player is about five, and a tray that is
 * dead on arrival reads as the game cheating rather than as a mistake they made.
 * Hard is, which is most of what makes it hard.
 */
export const GUARANTEE_FIT: Record<Difficulty, boolean> = {
  easy: true,
  normal: true,
  hard: false,
};

/** A shape that fits the board right now, weighted like the normal bag. */
function fittingShape(b: Board, rng: () => number, d: Difficulty): Shape {
  const candidates: Array<{ shape: Shape; weight: number }> = [];
  let total = 0;
  for (const bs of bagFor(d)) {
    for (const rot of bs.rotations) {
      if (firstFit(b, rot) === null) continue;
      // Split the base weight across its rotations, so a four-rotation shape is
      // not four times as likely as a square.
      const wt = bs.weight[d] / bs.rotations.length;
      candidates.push({ shape: rot, weight: wt });
      total += wt;
    }
  }
  // A board with no room for a single cell cannot occur after a clear (see the
  // never-full invariant in `settle`), but if it ever did, honest game over is
  // the right answer, not a shape that lies about fitting.
  if (candidates.length === 0) return SINGLE;
  let t = rng() * total;
  for (const c of candidates) {
    t -= c.weight;
    if (t <= 0) return c.shape;
  }
  return candidates[candidates.length - 1].shape;
}

/**
 * Three fresh candidates. On easy and normal, if none of the three fits, one of
 * them is swapped for a shape that does - so a refill is never an instant loss.
 * That guarantee is about the moment of refill only; running the tray down into a
 * corner afterwards is still a genuine, honest way to lose.
 */
export function refillTray(b: Board, rng: () => number, d: Difficulty): Piece[] {
  const out = [drawPiece(rng, d), drawPiece(rng, d), drawPiece(rng, d)];
  if (!GUARANTEE_FIT[d]) return out;
  if (anyFits(b, out.map((p) => p.shape))) return out;
  const slot = Math.floor(rng() * out.length);
  out[slot] = { shape: fittingShape(b, rng, d), tone: out[slot].tone };
  return out;
}

// --- level patterns ----------------------------------------------------------
//
// A level opens with the board seeded from a picture instead of starting empty,
// so a kid recognises what level they are on before making a single move, and
// clearing the picture through ordinary play is exactly what a normal game does
// anyway - the pattern is just colour on cells that count like any other.
//
// Every mask below is built from a formula (a circle, a rhombus, an implicit
// heart curve, a star polygon, an ellipse) and combined with union/subtract,
// never hand-typed row by row. That means a mask can never be malformed or
// sized wrong for the grid - every cell it touches comes from a loop bounded by
// GRID - and the only hand-picked numbers are which small handful of cells read
// as eyes, ears or a grin. scripts/check-blocks.ts still holds every mask to a
// density band (a "picture" that is 95% full or 2% full is not a picture) and
// to the same fit-guarantee the rest of the game promises: refilling the tray
// against a freshly seeded board must never hand out a dead deal.

/** Shared centre coordinate: exactly between the two middle cells on any GRID. */
const MID = (GRID - 1) / 2;

function emptyMask(): boolean[] {
  return new Array<boolean>(GRID * GRID).fill(false);
}

function setMaskCell(mask: boolean[], r: number, c: number, v: boolean): void {
  if (r < 0 || r >= GRID || c < 0 || c >= GRID) return;
  mask[r * GRID + c] = v;
}

function maskWhere(pred: (row: number, col: number) => boolean): boolean[] {
  const out = emptyMask();
  for (let r = 0; r < GRID; r += 1) {
    for (let c = 0; c < GRID; c += 1) if (pred(r, c)) out[r * GRID + c] = true;
  }
  return out;
}

function circleMask(cy: number, cx: number, r: number): boolean[] {
  return maskWhere((row, col) => (row - cy) ** 2 + (col - cx) ** 2 <= r * r);
}

function ellipseMask(cy: number, cx: number, ry: number, rx: number): boolean[] {
  return maskWhere((row, col) => ((row - cy) / ry) ** 2 + ((col - cx) / rx) ** 2 <= 1);
}

function diamondMask(cy: number, cx: number, r: number): boolean[] {
  return maskWhere((row, col) => Math.abs(row - cy) + Math.abs(col - cx) <= r);
}

/** The classic implicit heart curve (x^2+y^2-1)^3 <= x^2*y^3, scaled to the grid. */
function heartMask(cy: number, cx: number, scale: number): boolean[] {
  return maskWhere((row, col) => {
    const x = (col - cx) / scale;
    const y = -(row - cy) / scale + 0.2;
    const a = x * x + y * y - 1;
    return a * a * a - x * x * y * y * y <= 0;
  });
}

function pointInPolygon(poly: Array<[number, number]>, px: number, py: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** A point-up n-pointed star. Polygon vertices are stored as [x, y] (col, row). */
function starMask(cy: number, cx: number, rOuter: number, rInner: number, points = 5): boolean[] {
  const poly: Array<[number, number]> = [];
  for (let i = 0; i < points * 2; i += 1) {
    const rad = i % 2 === 0 ? rOuter : rInner;
    const ang = -Math.PI / 2 + (i * Math.PI) / points;
    poly.push([cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad]);
  }
  return maskWhere((row, col) => pointInPolygon(poly, col, row));
}

function triangleMask(a: [number, number], b: [number, number], c: [number, number]): boolean[] {
  const poly: Array<[number, number]> = [[a[1], a[0]], [b[1], b[0]], [c[1], c[0]]];
  return maskWhere((row, col) => pointInPolygon(poly, col, row));
}

function unionMasks(...masks: boolean[][]): boolean[] {
  const out = emptyMask();
  for (const m of masks) for (let i = 0; i < out.length; i += 1) if (m[i]) out[i] = true;
  return out;
}

/** Reflects a mask left-right, for a pair of ears drawn once and mirrored. */
function mirrorMask(mask: boolean[]): boolean[] {
  const out = emptyMask();
  for (let r = 0; r < GRID; r += 1) {
    for (let c = 0; c < GRID; c += 1) {
      if (mask[r * GRID + c]) out[r * GRID + (GRID - 1 - c)] = true;
    }
  }
  return out;
}

function withHoles(mask: boolean[], holes: Array<[number, number]>): boolean[] {
  const out = mask.slice();
  for (const [r, c] of holes) setMaskCell(out, r, c, false);
  return out;
}

function buildSmiley(): boolean[] {
  const face = circleMask(MID, MID, GRID * 0.435);
  return withHoles(face, [
    [3, 3],
    [3, 6],
    [7, 3],
    [8, 4],
    [8, 5],
    [7, 6],
  ]);
}

function buildHeart(): boolean[] {
  // The implicit curve alone reads as a rounded blob at 10 cells across - the
  // top lobes need the notch between them carved out by hand to read as a
  // heart rather than an egg.
  const heart = heartMask(MID, MID, GRID * 0.315);
  return withHoles(heart, [
    [2, 4],
    [2, 5],
  ]);
}

function buildCat(): boolean[] {
  const face = circleMask(MID + 0.7, MID, GRID * 0.36);
  const leftEar = triangleMask([0, MID - 3.2], [2.4, MID - 4.6], [2.4, MID - 1.4]);
  const rightEar = mirrorMask(leftEar);
  const whole = unionMasks(face, leftEar, rightEar);
  // Eyes sit a row below the ears, where the face circle is at its widest, so
  // punching them out leaves a clean cheek on either side instead of slicing
  // into the ear seam. The nose/mouth gap sits lower, on its own row.
  return withHoles(whole, [
    [5, 3],
    [5, 6],
    [7, 4],
    [7, 5],
  ]);
}

function buildDog(): boolean[] {
  const face = circleMask(MID + 1.0, MID, GRID * 0.27);
  const leftEar = ellipseMask(MID - 0.9, 1.0, GRID * 0.16, GRID * 0.115);
  const rightEar = mirrorMask(leftEar);
  const whole = unionMasks(face, leftEar, rightEar);
  return withHoles(whole, [
    [5, 3],
    [5, 6],
    [7, 4],
    [7, 5],
  ]);
}

function buildStar(): boolean[] {
  return starMask(MID, MID, GRID * 0.49, GRID * 0.16, 5);
}

function buildDiamond(): boolean[] {
  return diamondMask(MID, MID, GRID * 0.44);
}

/** Name, mask builder. Order is the cycle order levels advance through. */
const PATTERN_BUILDERS: Array<{ name: string; build: () => boolean[] }> = [
  { name: 'smiley', build: buildSmiley },
  { name: 'heart', build: buildHeart },
  { name: 'cat', build: buildCat },
  { name: 'star', build: buildStar },
  { name: 'dog', build: buildDog },
  { name: 'diamond', build: buildDiamond },
];

export const PATTERN_NAMES: string[] = PATTERN_BUILDERS.map((p) => p.name);
const PATTERN_MASKS: boolean[][] = PATTERN_BUILDERS.map((p) => p.build());

export function patternIndexForLevel(level: number): number {
  const n = PATTERN_MASKS.length;
  return ((Math.max(1, Math.floor(level)) - 1) % n + n) % n;
}

export function patternNameForLevel(level: number): string {
  return PATTERN_NAMES[patternIndexForLevel(level)];
}

const RESIZED_PATTERNS = new Map<string, boolean[]>();

/**
 * Scale the hand-tuned 10x10 stencil to a larger board with nearest-neighbour
 * sampling. This keeps the same recognisable art while giving the 12x12 and
 * 14x14 modes genuinely more room to play around it.
 */
export function patternMaskForLevel(level: number, size: number = GRID): boolean[] {
  const index = patternIndexForLevel(level);
  if (size === GRID) return PATTERN_MASKS[index].slice();
  const key = `${index}:${size}`;
  const cached = RESIZED_PATTERNS.get(key);
  if (cached) return cached.slice();

  const source = PATTERN_MASKS[index];
  const scaled = new Array<boolean>(size * size).fill(false);
  for (let r = 0; r < size; r += 1) {
    const sr = Math.min(GRID - 1, Math.floor(((r + 0.5) * GRID) / size));
    for (let c = 0; c < size; c += 1) {
      const sc = Math.min(GRID - 1, Math.floor(((c + 0.5) * GRID) / size));
      scaled[r * size + c] = source[sr * GRID + sc];
    }
  }
  RESIZED_PATTERNS.set(key, scaled);
  return scaled.slice();
}

/** The tone every cell of a level's picture is drawn in - one flat colour, so it reads as a stencil rather than a jumble. */
export function patternToneForLevel(level: number): number {
  return patternIndexForLevel(level) % TONE_COUNT;
}

/** A fresh board seeded from the level's picture, masks and colour cells in sync. */
export function patternBoard(level: number, size: number = GRID): Board {
  const mask = patternMaskForLevel(level, size);
  const tone = patternToneForLevel(level);
  const b = makeBoard(size);
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (!mask[r * size + c]) continue;
      b.cells[r * size + c] = tone;
      b.rows[r] |= 1 << c;
    }
  }
  return b;
}

export type Applied = {
  cleared: Clear;
  lines: number;
  placePoints: number;
  clearPoints: number;
  /** Consecutive clearing placements after this one. */
  streak: number;
  refilled: boolean;
};

/**
 * Everything a legal drop does, with no State, no canvas and no clock: write the
 * piece, clear whatever it completed, score it, refill an emptied tray. The
 * component calls this and then only decorates the result with sound and
 * particles, so scripts/check-blocks.ts is driving the same code the player is
 * rather than a second copy of the rules.
 *
 * Throwing on an illegal drop is deliberate. The one thing that must never happen
 * is a piece landing on top of another, and a hard failure here means no caller
 * can do it by forgetting a check.
 */
export function applyPlacement(
  board: Board,
  tray: Array<Piece | null>,
  slot: number,
  r: number,
  c: number,
  streak: number,
  rng: () => number,
  d: Difficulty,
): Applied {
  const piece = tray[slot];
  if (!piece) throw new Error(`applyPlacement: slot ${slot} is empty`);
  if (!canPlace(board, piece.shape, r, c)) {
    throw new Error(`applyPlacement: ${piece.shape.id} does not fit at ${r},${c}`);
  }

  place(board, piece.shape, r, c, piece.tone);
  tray[slot] = null;

  const cleared = clearLines(board);
  const lines = cleared.rows.length + cleared.cols.length;
  // The multiplier is the streak going in, so the first clear of a chain is a
  // plain one and the reward builds from there.
  const clearPoints = clearScore(lines, streak);

  let refilled = false;
  // Not `tray.every(p => p === null)`: that narrows the array to null[] and the
  // refill below stops type-checking.
  if (!tray.some((p) => p !== null)) {
    const fresh = refillTray(board, rng, d);
    for (let i = 0; i < tray.length; i += 1) tray[i] = fresh[i];
    refilled = true;
  }

  return {
    cleared,
    lines,
    placePoints: placeScore(piece.shape),
    clearPoints,
    streak: lines > 0 ? streak + 1 : 0,
    refilled,
  };
}

// --- layout ----------------------------------------------------------------
//
// Fixed logical board, scaled to fit and centred. The proportions are chosen for
// the 3/4 canvas this game gets: the grid takes the top two thirds and the tray
// sits in a band under it, well clear of where a hand rests.

// 24 rather than the old 30: the grid grew from 8x8 to 10x10 in the same
// footprint, so cells shrank proportionally - BOARD_W below still comes out to
// exactly what it was, and every downstream layout number (tray, HUD, drag
// lift) still derives from CELL and GRID rather than a hard-coded pixel count.
const CELL = 24;
const PLAY_PIXELS = GRID * CELL;
export function cellForSize(size: number): number {
  return PLAY_PIXELS / size;
}
const PAD = 6;
const HUD_H = 26;
export const BOARD_W = PLAY_PIXELS + PAD * 2;
const GRID_X = PAD;
const GRID_Y = HUD_H + PAD;
const GRID_BOX = PLAY_PIXELS + PAD * 2;
const TRAY_Y = HUD_H + GRID_BOX + 8;
const TRAY_H = 78;
export const BOARD_H = TRAY_Y + TRAY_H;

const SLOT_GAP = 6;
const SLOT_W = (BOARD_W - SLOT_GAP * 4) / 3;
const SLOT_H = TRAY_H - SLOT_GAP * 2;

/**
 * How far above the fingertip the dragged piece floats, in cells. On a
 * touchscreen a piece drawn under the finger is a piece you cannot see, and a
 * one-cell piece is completely hidden by a thumb - so short pieces get lifted
 * further.
 */
const LIFT = CELL * 0.95;
const SHORT_LIFT = CELL * 0.4;

/**
 * Board units above the tray band that still count as grabbing a tray piece, and
 * cells of slack around the grid that still count as aiming at it. Both are pure
 * generosity for small fingers.
 */
const GRAB_REACH = 10;
const NEAR_SLACK = 1.6;

/** Fraction of the board filled before the danger pulse starts. */
const DANGER_FILL = 0.62;

const CLEAR_DUR = 0.26;
/** Seconds of delay per cell of distance from the impact, for the sweep. */
const SWEEP_SPACING = 0.028;
const MAX_SPARKS = 240;

/**
 * Smoothness pass (kids' feedback: "needs to run smoother"). Three things used
 * to happen in a single frame with no transition at all: a level's picture
 * appeared fully solid the instant it was seeded, a placed piece was full size
 * the instant it landed, and a refilled tray just materialised. All three now
 * ease in instead of popping, matching the polish level of Match3's intro deal
 * and landing squash.
 */
/** Total seconds the level-start picture takes to finish rippling in. */
const REVEAL_TOTAL = 1.3;
/** How long each individual cell takes to fade/pop in, once its delay elapses. */
const REVEAL_DUR = 0.46;
/** Seconds of delay per cell of distance from the board's centre, for the reveal wave. */
const REVEAL_SPACING = 0.05;
/** Seconds a just-placed piece takes to settle from a small pop to full size. */
const LAND_DUR = 0.16;
/** Seconds a freshly refilled tray slot takes to scale in from empty. */
const TRAY_SPAWN_DUR = 0.32;
/** Seconds the background hue takes to catch up to a level change, so a jump in
 *  level eases the palette across rather than snapping it. */
const PALETTE_EASE = 3.2;

/** Overshoot-and-settle easing - the "pop" behind every entrance in this file. */
function easeOutBack(t: number): number {
  const k = clamp(t, 0, 1);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

export type Layout = { scale: number; ox: number; oy: number };

export function layoutFor(cw: number, ch: number, inset: number): Layout {
  const usableH = Math.max(1, ch - inset);
  const scale = Math.min(cw / BOARD_W, usableH / BOARD_H);
  return { scale, ox: (cw - BOARD_W * scale) / 2, oy: (usableH - BOARD_H * scale) / 2 };
}

function slotRect(i: number): { x: number; y: number; w: number; h: number } {
  return {
    x: SLOT_GAP + i * (SLOT_W + SLOT_GAP),
    y: TRAY_Y + SLOT_GAP,
    w: SLOT_W,
    h: SLOT_H,
  };
}

const SETUP_CARD_Y = 108;
const SETUP_CARD_H = 116;
const SETUP_CARD_GAP = 7;
const SETUP_CARD_W = (BOARD_W - PAD * 2 - SETUP_CARD_GAP * 2) / 3;
const SETUP_PLAY = { x: 26, y: 258, w: BOARD_W - 52, h: 54 };

function setupCardRect(i: number): { x: number; y: number; w: number; h: number } {
  return {
    x: PAD + i * (SETUP_CARD_W + SETUP_CARD_GAP),
    y: SETUP_CARD_Y,
    w: SETUP_CARD_W,
    h: SETUP_CARD_H,
  };
}

/** Pure hit target shared by touch input and the headless iPad checks. */
export function setupChoiceAt(bx: number, by: number): BoardSize | null {
  for (let i = 0; i < BOARD_SIZES.length; i += 1) {
    const r = setupCardRect(i);
    if (bx >= r.x && bx <= r.x + r.w && by >= r.y && by <= r.y + r.h) {
      return BOARD_SIZES[i];
    }
  }
  return null;
}

export function setupPlayAt(bx: number, by: number): boolean {
  return (
    bx >= SETUP_PLAY.x &&
    bx <= SETUP_PLAY.x + SETUP_PLAY.w &&
    by >= SETUP_PLAY.y &&
    by <= SETUP_PLAY.y + SETUP_PLAY.h
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// --- game state ------------------------------------------------------------

type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  tone: number;
};

type Pop = { x: number; y: number; text: string; t: number; life: number; big: boolean };

type ClearFx = { r: number; c: number; tone: number; delay: number; sparked: boolean };

type Drag = {
  slot: number;
  /** Fingertip, in board units. */
  x: number;
  y: number;
};

type Snap = { r: number; c: number; w: number; h: number; t: number };

/** A cell mid-pop, either the level's picture rippling in or a just-placed piece settling. */
type CellPop = { r: number; c: number; t: number; dur: number };

type GameApi = GameCanvasProps['api'];

type State = {
  difficulty: Difficulty;
  board: Board;
  /** Run-scoped rotation of the picture cycle, randomized at each new game. */
  patternOffset: number;
  /** null once a piece has been played out of that slot. */
  tray: Array<Piece | null>;
  /** Drives the piece bag only. */
  rng: () => number;
  /** Drives particles. Separate so eye candy cannot shift the piece sequence. */
  fxRng: () => number;
  /** The game's own running total. See the note in `award`. */
  score: number;
  lines: number;
  level: number;
  /** Smoothed toward `level` every frame, so the background hue eases across a
   *  level change instead of snapping - see `paletteFor`. */
  displayLevel: number;
  /** The level's picture, shown next to LEVEL in the HUD. */
  patternName: string;
  /** Seconds since this level's picture was seeded, for the reveal wave. */
  levelT: number;
  /** True for a cell that belongs to the level's picture, as seeded - consulted
   *  only while `levelT` is inside the reveal window. */
  isPatternCell: boolean[];
  /** Per-cell reveal delay, seconds, indexed like `board.cells`. */
  reveal: number[];
  /** Cells still popping in from a placement, board-space, oldest first. */
  landCells: CellPop[];
  /** Countdown per tray slot for the scale-in after a refill. 0 is settled. */
  traySpawn: number[];
  /** Consecutive clearing placements. Resets on a placement that clears nothing. */
  streak: number;
  drag: Drag | null;
  /** Slot flashing red because a drop was refused, seconds remaining. */
  reject: { slot: number; t: number } | null;
  clears: ClearFx[];
  clearT: number;
  sparks: Spark[];
  pops: Pop[];
  snap: Snap | null;
  shake: number;
  time: number;
  /** Seconds of the "drag a block" hint left. */
  hint: number;
  /** Blocks a second game over on the frame after the first. */
  deadFor: number;
  /**
   * Set whenever the board or tray changes. Game over is only re-tested then,
   * because scanning every anchor on every one of 60 frames a second to re-answer
   * a question nothing has changed the answer to is pure waste.
   */
  dirty: boolean;
  /** Canvas size the frozen frame was painted at, so a resize repaints it. */
  dimAt: { w: number; h: number } | null;
};

/** Per-cell delay for the level-start reveal wave: rings outward from the board's centre. */
function computeReveal(mask: boolean[], size: number): number[] {
  const out = new Array<number>(size * size).fill(0);
  const mid = (size - 1) / 2;
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const i = r * size + c;
      if (!mask[i]) continue;
      out[i] = Math.hypot(r - mid, c - mid) * REVEAL_SPACING;
    }
  }
  return out;
}

/**
 * Seeds the board from a level's picture: fresh tray, run-scoped effects
 * cleared, the reveal wave armed. Used both at the very start of a run (level
 * 1's picture) and every time the level advances - and, deliberately, every
 * time the board dies mid-level, so retrying a level shows the same picture
 * again rather than a blank grid (see `resetBoard`).
 */
function seedLevel(s: State, level: number): void {
  const pictureLevel = level + s.patternOffset;
  const mask = patternMaskForLevel(pictureLevel, s.board.size);
  s.level = level;
  s.board = patternBoard(pictureLevel, s.board.size);
  s.tray = refillTray(s.board, s.rng, s.difficulty);
  s.patternName = patternNameForLevel(pictureLevel);
  s.isPatternCell = mask;
  s.reveal = computeReveal(mask, s.board.size);
  s.levelT = 0;
  s.landCells = [];
  s.traySpawn = [1, 1, 1];
  s.streak = 0;
  s.drag = null;
  s.reject = null;
  s.clears = [];
  s.clearT = 0;
  s.snap = null;
  s.shake = 0;
  s.dirty = true;
}

function freshState(
  difficulty: Difficulty,
  seed: number,
  boardSize: BoardSize,
  patternOffset: number,
): State {
  const rng = lcg(seed);
  const pictureLevel = 1 + patternOffset;
  const mask = patternMaskForLevel(pictureLevel, boardSize);
  const board = patternBoard(pictureLevel, boardSize);
  return {
    difficulty,
    board,
    patternOffset,
    tray: refillTray(board, rng, difficulty),
    rng,
    fxRng: lcg((seed ^ 0x9e3779b9) >>> 0),
    score: 0,
    lines: 0,
    level: 1,
    displayLevel: 1,
    patternName: patternNameForLevel(pictureLevel),
    levelT: 0,
    isPatternCell: mask,
    reveal: computeReveal(mask, boardSize),
    landCells: [],
    traySpawn: [1, 1, 1],
    streak: 0,
    drag: null,
    reject: null,
    clears: [],
    clearT: 0,
    sparks: [],
    pops: [],
    snap: null,
    shake: 0,
    time: 0,
    hint: 6,
    deadFor: 0,
    dirty: true,
    dimAt: null,
  };
}

/**
 * The board after a death: the CURRENT level's picture again (not empty) - a
 * kid trying to clear "the cat" who jams the board gets the cat back, not a
 * blank slate, because the picture is the point of the level. Score, lines and
 * level are all untouched.
 */
function resetBoard(s: State): void {
  seedLevel(s, s.level);
  s.deadFor = 0.5;
}

function remainingShapes(s: State): Shape[] {
  const out: Shape[] = [];
  for (const p of s.tray) if (p) out.push(p.shape);
  return out;
}

const CLEAR_LABEL = ['', '', 'Double!', 'Triple!', 'Quad!', 'Incredible!'];

function clearLabel(lines: number): string {
  return CLEAR_LABEL[Math.min(lines, CLEAR_LABEL.length - 1)];
}

// --- component -------------------------------------------------------------

export default function Blocks({
  paused,
  input,
  api,
  restartToken,
  difficulty,
  controlsInset,
}: GameCanvasProps) {
  const stateRef = useRef<State | null>(null);
  const seedRef = useRef(1);
  const selectedSizeRef = useRef<BoardSize>(GRID);
  const openingOffsetRef = useRef<number | null>(null);

  // A fresh run gets a fresh seed so the bag is not identical every session. The
  // state itself is built on the first frame, which keeps generation out of
  // render entirely.
  useEffect(() => {
    seedRef.current = (Date.now() ^ Math.imul(restartToken + 1, 2654435761)) >>> 0 || 1;
    openingOffsetRef.current = nextPatternOffset(seedRef.current, openingOffsetRef.current);
    stateRef.current = null;
  }, [restartToken, difficulty]);

  // Nothing else in the app has unlocked audio yet, and iOS will not start an
  // AudioContext outside a real gesture - a call from inside the animation frame
  // is too late. Listening on window catches the first tap on the touch overlay
  // while the gesture is still live.
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
    // The loop keeps running while paused so the freeze can be painted dimmed
    // once and then idle, rather than leaving the last live frame on screen.
    active: true,
    step: (ctx, dt, cw, ch) => {
      const s = stateRef.current;
      const layout = layoutFor(cw, ch, controlsInset);
      if (!s) {
        const pressed = input.consumePointerPress();
        input.consumePointerRelease();
        const px = input.pointerX;
        const py = input.pointerY;
        const bx = px === null ? null : (px * cw - layout.ox) / layout.scale;
        const by = py === null ? null : (py * ch - layout.oy) / layout.scale;
        if (!paused && pressed && bx !== null && by !== null) {
          const choice = setupChoiceAt(bx, by);
          if (choice !== null) {
            selectedSizeRef.current = choice;
            playSound('click');
          } else if (setupPlayAt(bx, by)) {
            const offset =
              openingOffsetRef.current ?? openingPatternOffset(seedRef.current);
            stateRef.current = freshState(
              difficulty,
              seedRef.current,
              selectedSizeRef.current,
              offset,
            );
            playSound('powerup');
          }
        }
        drawSetup(ctx, layout, cw, ch, selectedSizeRef.current, paused);
        return;
      }
      if (s.difficulty !== difficulty) {
        stateRef.current = null;
        return;
      }

      if (paused) {
        // Painted once and then left alone, rather than burning a frame a second
        // behind a question. Repainted if the canvas resizes, because a resize
        // clears the backing store and would leave a blank rectangle.
        if (!s.dimAt || s.dimAt.w !== cw || s.dimAt.h !== ch) {
          // A drag interrupted by a question is dropped, not resumed: the finger
          // that comes back is answering, not still holding a block.
          s.drag = null;
          s.dimAt = { w: cw, h: ch };
          draw(ctx, s, layout, cw, ch, true);
        }
        return;
      }
      s.dimAt = null;

      s.time += dt;
      if (s.hint > 0) s.hint -= dt;
      if (s.deadFor > 0) s.deadFor -= dt;
      if (s.levelT < REVEAL_TOTAL) s.levelT += dt;
      // Eases the background palette toward the real level instead of snapping
      // to it the instant the score crosses a threshold - see `paletteFor`.
      s.displayLevel += (s.level - s.displayLevel) * Math.min(1, dt * PALETTE_EASE);
      advanceEffects(s, dt);

      // --- input ---
      const pressed = input.consumePointerPress();
      const released = input.consumePointerRelease();
      const px = input.pointerX;
      const py = input.pointerY;
      const bx = px === null ? null : (px * cw - layout.ox) / layout.scale;
      const by = py === null ? null : (py * ch - layout.oy) / layout.scale;

      if (pressed && bx !== null && by !== null && !s.drag) {
        const slot = slotAt(s, bx, by);
        if (slot !== null) {
          s.drag = { slot, x: bx, y: by };
          s.hint = 0;
          playSound('click');
        }
      }
      if (s.drag && bx !== null && by !== null) {
        s.drag.x = bx;
        s.drag.y = by;
      }
      if (released && s.drag) {
        drop(s, api);
        s.drag = null;
      } else if (s.drag && !input.pointerDown) {
        // The overlay unmounts mid-drag when a gate opens; do not keep holding.
        s.drag = null;
      }

      // --- level and game over ---
      const want = levelForScore(s.score);
      if (want > s.level) {
        // Filling in a picture (or just placing enough on top of it) is what
        // pushes the score across the threshold, so levelling up and seeding
        // the next picture are one and the same event - see `seedLevel`.
        seedLevel(s, want);
        playSound('levelClear');
        s.pops.push({
          x: GRID_X + PLAY_PIXELS / 2,
          y: GRID_Y + PLAY_PIXELS / 2,
          text: `Level ${want}! ${capitalize(s.patternName)}`,
          t: 0,
          life: 1.8,
          big: true,
        });
        api.requestGate(`Level ${want}!`);
      }
      if (s.dirty && s.deadFor <= 0) {
        s.dirty = false;
        if (!anyFits(s.board, remainingShapes(s))) {
          playSound('gameOver');
          api.died('No room left');
          // The shell does not reset anything, and a free pass means play resumes
          // immediately, so clear the board here for both cases.
          resetBoard(s);
        }
      }

      draw(ctx, s, layout, cw, ch, false);
    },
  });

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />;
}

/**
 * Which tray slot a press at this board position grabs, ignoring whether that slot
 * still holds a piece. Deliberately generous: anything from a little above the
 * tray band downward counts, and the band is split into equal thirds rather than
 * tested against the drawn piece, so a five-year-old aiming at a single 15px block
 * still picks it up.
 */
export function slotIndexAt(bx: number, by: number): number | null {
  if (by < TRAY_Y - GRAB_REACH) return null;
  return clamp(Math.floor((bx / BOARD_W) * 3), 0, 2);
}

function slotAt(s: State, bx: number, by: number): number | null {
  const i = slotIndexAt(bx, by);
  return i !== null && s.tray[i] ? i : null;
}

/**
 * Top-left of the dragged piece, in board units, lifted clear of the finger.
 *
 * The lift is the single most important number on a touchscreen. A piece drawn
 * centred on the fingertip is a piece hidden under a thumb, and a one-cell piece
 * disappears completely - so short pieces get lifted further. The checker asserts
 * the whole piece ends up strictly above the fingertip for those.
 */
export function dragOrigin(
  shape: Shape,
  fx: number,
  fy: number,
  boardSize: number = GRID,
): { x: number; y: number } {
  const cell = cellForSize(boardSize);
  const lift = LIFT + (shape.h <= 2 ? SHORT_LIFT : 0);
  return {
    x: fx - (shape.w * cell) / 2,
    y: fy - lift - (shape.h * cell) / 2,
  };
}

export type Aim = { ar: number; ac: number; near: boolean; valid: boolean };

/**
 * Where a piece held at this fingertip would land. The anchor is clamped into the
 * grid rather than rejected at the edges, so nudging a piece past the left wall
 * slides it against the wall instead of refusing the drop - the forgiving
 * behaviour a kid expects. `near` is what separates "changed my mind" from
 * "aimed at an occupied square".
 */
export function aimAt(b: Board, shape: Shape, fx: number, fy: number): Aim {
  const cell = cellForSize(b.size);
  const o = dragOrigin(shape, fx, fy, b.size);
  const fr = (o.y - GRID_Y) / cell;
  const fc = (o.x - GRID_X) / cell;
  const ar = clamp(Math.round(fr), 0, b.size - shape.h);
  const ac = clamp(Math.round(fc), 0, b.size - shape.w);
  const near =
    fr > -NEAR_SLACK &&
    fr < b.size - shape.h + NEAR_SLACK &&
    fc > -NEAR_SLACK &&
    fc < b.size - shape.w + NEAR_SLACK;
  return { ar, ac, near, valid: near && canPlace(b, shape, ar, ac) };
}

function aimFor(s: State, shape: Shape, d: Drag): Aim {
  return aimAt(s.board, shape, d.x, d.y);
}

/** Screen coords (canvas pixels) to board units. The inverse of the draw transform. */
export function toBoard(layout: Layout, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - layout.ox) / layout.scale, y: (sy - layout.oy) / layout.scale };
}

/** Centre of a grid cell, in board units. */
export function cellCentre(r: number, c: number, boardSize: number = GRID): { x: number; y: number } {
  const cell = cellForSize(boardSize);
  return { x: GRID_X + (c + 0.5) * cell, y: GRID_Y + (r + 0.5) * cell };
}

function award(s: State, api: GameApi, n: number): void {
  // The game keeps its own total because the shell's score also carries question
  // rewards, and levels should come from playing, not from answering.
  s.score += n;
  api.addScore(n);
}

function drop(s: State, api: GameApi): void {
  const d = s.drag;
  if (!d) return;
  const piece = s.tray[d.slot];
  if (!piece) return;

  const shape = piece.shape;
  const aim = aimFor(s, shape, d);
  if (!aim.near) {
    // Let go nowhere near the board: that is a change of mind, not a mistake, so
    // it goes back in the tray silently. Only a drop that was genuinely aimed at
    // an occupied spot gets told off.
    return;
  }
  if (!aim.valid) {
    s.reject = { slot: d.slot, t: 0.32 };
    playSound('click');
    return;
  }

  // Everything that changes the board happens in this one call. Note the
  // invariant it leaves behind: a placement that filled the board completely also
  // filled every row, so the clear inside emptied it. The board is therefore
  // never completely full afterwards, which is what lets the easy-mode fit
  // guarantee fall back on a single cell and still be telling the truth.
  const res = applyPlacement(
    s.board,
    s.tray,
    d.slot,
    aim.ar,
    aim.ac,
    s.streak,
    s.rng,
    s.difficulty,
  );
  s.streak = res.streak;
  s.dirty = true;
  award(s, api, res.placePoints + res.clearPoints);

  s.snap = { r: aim.ar, c: aim.ac, w: shape.w, h: shape.h, t: 0 };
  s.shake = Math.max(s.shake, 0.9);
  landDust(s, shape, aim.ar, aim.ac);
  playSound('land');

  // Every cell the piece just filled gets a quick settle-in pop instead of
  // appearing at full size the instant it lands - the placement half of the
  // "smoother" pass, matched to the same overshoot used for the level reveal.
  for (const cell of shape.cells) {
    s.landCells.push({ r: aim.ar + cell.dr, c: aim.ac + cell.dc, t: 0, dur: LAND_DUR });
  }
  // A tray that just emptied gets a fresh set of pieces - scale them in rather
  // than having them appear mid-frame.
  if (res.refilled) s.traySpawn = [1, 1, 1];

  if (res.lines === 0) return;

  s.lines += res.lines;
  startSweep(s, res.cleared, aim.ar + shape.h / 2, aim.ac + shape.w / 2);
  s.shake = Math.min(3.2, 1.1 + res.lines * 0.7);

  const label = clearLabel(res.lines);
  s.pops.push({
    x: GRID_X + PLAY_PIXELS / 2,
    y: GRID_Y + PLAY_PIXELS / 2,
    text: label ? `${label} +${res.clearPoints}` : `+${res.clearPoints}`,
    t: 0,
    life: res.lines > 1 ? 1.4 : 1,
    big: res.lines > 1,
  });

  // Each line in the burst is a step up the scale, and the streak keeps pushing
  // it, so a chain of clears audibly builds.
  for (let i = 0; i < res.lines; i += 1) {
    playSound('brick', Math.min(12, i * 3 + s.streak));
  }
  if (res.lines >= 3 || s.streak >= 3) playSound('powerup');

  api.setStatus(
    `${label ? `${label} · ` : ''}Level ${levelForScore(s.score)} · ${s.lines} lines`,
  );
}

// --- effects ---------------------------------------------------------------

function startSweep(s: State, cleared: Clear, originR: number, originC: number): void {
  s.clears = cleared.cells.map((cell) => ({
    r: cell.r,
    c: cell.c,
    tone: cell.tone < 0 ? 0 : cell.tone,
    // Delay by distance from the impact, so the clear reads as a wave leaving
    // the block that caused it rather than as everything blinking out at once.
    delay: Math.hypot(cell.r + 0.5 - originR, cell.c + 0.5 - originC) * SWEEP_SPACING,
    sparked: false,
  }));
  s.clearT = 0;
}

function landDust(s: State, shape: Shape, ar: number, ac: number): void {
  const cellSize = cellForSize(s.board.size);
  for (const cell of shape.cells) {
    // Only the bottom edge of the piece throws dust, so the puff reads as impact.
    if (shape.cells.some((o) => o.dc === cell.dc && o.dr === cell.dr + 1)) continue;
    const x = GRID_X + (ac + cell.dc + 0.5) * cellSize;
    const y = GRID_Y + (ar + cell.dr + 1) * cellSize;
    for (let i = 0; i < 3; i += 1) {
      pushSpark(s, {
        x: x + (s.fxRng() - 0.5) * cellSize * 0.7,
        y,
        vx: (s.fxRng() - 0.5) * 40,
        vy: -18 - s.fxRng() * 30,
        life: 0.28,
        max: 0.28,
        size: 1.4 + s.fxRng() * 1.4,
        tone: -1,
      });
    }
  }
}

function pushSpark(s: State, sp: Spark): void {
  if (s.sparks.length >= MAX_SPARKS) return;
  s.sparks.push(sp);
}

function burst(s: State, r: number, c: number, tone: number): void {
  const cell = cellForSize(s.board.size);
  const x = GRID_X + (c + 0.5) * cell;
  const y = GRID_Y + (r + 0.5) * cell;
  for (let i = 0; i < 6; i += 1) {
    const a = s.fxRng() * Math.PI * 2;
    const sp = 55 + s.fxRng() * 115;
    pushSpark(s, {
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 40,
      life: 0.4 + s.fxRng() * 0.35,
      max: 0.75,
      size: 1.6 + s.fxRng() * 2.4,
      tone,
    });
  }
}

function advanceEffects(s: State, dt: number): void {
  s.shake *= Math.pow(0.0016, dt);
  if (s.shake < 0.02) s.shake = 0;

  if (s.snap) {
    s.snap.t += dt;
    if (s.snap.t > 0.34) s.snap = null;
  }
  if (s.reject) {
    s.reject.t -= dt;
    if (s.reject.t <= 0) s.reject = null;
  }

  if (s.clears.length > 0) {
    s.clearT += dt;
    let alive = false;
    for (const fx of s.clears) {
      const p = s.clearT - fx.delay;
      if (p >= 0 && !fx.sparked) {
        fx.sparked = true;
        burst(s, fx.r, fx.c, fx.tone);
      }
      if (p < CLEAR_DUR) alive = true;
    }
    if (!alive) s.clears = [];
  }

  for (let i = s.sparks.length - 1; i >= 0; i -= 1) {
    const sp = s.sparks[i];
    sp.life -= dt;
    sp.x += sp.vx * dt;
    sp.y += sp.vy * dt;
    sp.vy += 340 * dt;
    sp.vx *= Math.pow(0.2, dt);
    if (sp.life <= 0) s.sparks.splice(i, 1);
  }

  for (let i = s.pops.length - 1; i >= 0; i -= 1) {
    const p = s.pops[i];
    p.t += dt;
    if (p.t >= p.life) s.pops.splice(i, 1);
  }

  for (let i = s.landCells.length - 1; i >= 0; i -= 1) {
    const lc = s.landCells[i];
    lc.t += dt;
    if (lc.t >= lc.dur) s.landCells.splice(i, 1);
  }

  for (let i = 0; i < s.traySpawn.length; i += 1) {
    if (s.traySpawn[i] > 0) s.traySpawn[i] = Math.max(0, s.traySpawn[i] - dt / TRAY_SPAWN_DUR);
  }
}

// --- palette ---------------------------------------------------------------

type Tone = { light: string; base: string; dark: string };

type Palette = {
  bgTop: string;
  bgBot: string;
  glow: string;
  frame: string;
  frameEdge: string;
  well: string;
  slot: string;
  ink: string;
  tones: Tone[];
};

/**
 * Comma syntax rather than the modern `hsl(h s% l% / a)` form, which older iOS
 * Safari does not parse - and a colour string canvas cannot parse is silently
 * ignored, which would show up as a black board on exactly the device this app is
 * for.
 */
function hsl(h: number, s: number, l: number, a = 1): string {
  const hh = ((h % 360) + 360) % 360;
  return a >= 1 ? `hsl(${hh}, ${s}%, ${l}%)` : `hsla(${hh}, ${s}%, ${l}%, ${a})`;
}

/** Hue wheel for the blocks: rose, tangerine, gold, leaf, sky, violet. */
const TONE_HUES = [352, 26, 46, 142, 200, 268];

/**
 * Level 1 is warm - amber, like a wooden board under a lamp. Each level rotates
 * the whole palette, background and blocks together, so climbing feels like
 * moving into a new room rather than getting a recoloured HUD.
 */
function paletteFor(level: number): Palette {
  const step = level - 1;
  const bgHue = 28 + step * 26;
  const shift = step * 13;
  return {
    bgTop: hsl(bgHue, 34, 15),
    bgBot: hsl(bgHue + 14, 38, 8),
    glow: hsl(bgHue + 8, 60, 42, 0.16),
    frame: hsl(bgHue, 26, 21),
    frameEdge: hsl(bgHue + 10, 40, 34),
    well: hsl(bgHue - 4, 30, 11),
    slot: hsl(bgHue, 24, 18),
    ink: hsl(bgHue + 30, 30, 88),
    tones: TONE_HUES.map((h) => ({
      light: hsl(h + shift, 88, 74),
      base: hsl(h + shift, 78, 56),
      dark: hsl(h + shift, 68, 36),
    })),
  };
}

// --- drawing ---------------------------------------------------------------

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * One block. Five passes, cheap enough to run 64 times a frame: body gradient,
 * glossy cap, diagonal bevel, specular dot, dark rim. The bevel is a single
 * stroke with a corner-to-corner gradient, which is what makes the block read as
 * lit from the top-left without any per-edge geometry.
 */
function drawBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  tone: Tone,
  opts: { alpha?: number; shadow?: number; flash?: number } = {},
): void {
  const alpha = opts.alpha ?? 1;
  if (alpha <= 0.01 || size <= 0.5) return;
  const r = size * 0.23;

  ctx.save();
  ctx.globalAlpha = alpha;

  if (opts.shadow) {
    ctx.shadowColor = `rgba(0,0,0,${0.45 * alpha})`;
    ctx.shadowBlur = size * 0.4 * opts.shadow;
    ctx.shadowOffsetY = size * 0.2 * opts.shadow;
  }
  const body = ctx.createLinearGradient(x, y, x, y + size);
  body.addColorStop(0, tone.light);
  body.addColorStop(0.44, tone.base);
  body.addColorStop(1, tone.dark);
  ctx.fillStyle = body;
  roundRect(ctx, x, y, size, size, r);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  const inset = size * 0.1;
  const capH = size * 0.4;
  const cap = ctx.createLinearGradient(x, y + inset, x, y + inset + capH);
  cap.addColorStop(0, 'rgba(255,255,255,0.5)');
  cap.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = cap;
  roundRect(ctx, x + inset, y + inset, size - inset * 2, capH, r * 0.7);
  ctx.fill();

  const lw = Math.max(0.5, size * 0.07);
  const bevel = ctx.createLinearGradient(x, y, x + size, y + size);
  bevel.addColorStop(0, 'rgba(255,255,255,0.4)');
  bevel.addColorStop(0.5, 'rgba(255,255,255,0)');
  bevel.addColorStop(1, 'rgba(0,0,0,0.32)');
  ctx.strokeStyle = bevel;
  ctx.lineWidth = lw;
  roundRect(ctx, x + lw / 2, y + lw / 2, size - lw, size - lw, r * 0.86);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.ellipse(
    x + size * 0.32,
    y + size * 0.25,
    size * 0.13,
    size * 0.085,
    -0.5,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = Math.max(0.4, size * 0.035);
  roundRect(ctx, x, y, size, size, r);
  ctx.stroke();

  if (opts.flash) {
    ctx.fillStyle = `rgba(255,255,255,${clamp(opts.flash, 0, 1)})`;
    roundRect(ctx, x, y, size, size, r);
    ctx.fill();
  }
  ctx.restore();
}

function drawSetup(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  cw: number,
  ch: number,
  selected: BoardSize,
  dim: boolean,
): void {
  ctx.clearRect(0, 0, cw, ch);
  const bg = ctx.createLinearGradient(0, 0, 0, ch);
  bg.addColorStop(0, '#182454');
  bg.addColorStop(0.55, '#22144a');
  bg.addColorStop(1, '#100a26');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, cw, ch);

  ctx.save();
  ctx.translate(layout.ox, layout.oy);
  ctx.scale(layout.scale, layout.scale);

  ctx.fillStyle = 'rgba(10,8,30,0.82)';
  roundRect(ctx, 0, 0, BOARD_W, BOARD_H, 18);
  ctx.fill();
  ctx.strokeStyle = 'rgba(153,210,255,0.28)';
  ctx.lineWidth = 1.2;
  roundRect(ctx, 0.6, 0.6, BOARD_W - 1.2, BOARD_H - 1.2, 18);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 24px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText('BLOCK DROP', BOARD_W / 2, 30);
  ctx.fillStyle = '#a9cfff';
  ctx.font = '700 11px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText('CHOOSE YOUR BOARD', BOARD_W / 2, 55);
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = '600 9px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText('Bigger boards give you more room and longer games.', BOARD_W / 2, 75);

  const labels = ['CLASSIC', 'GRAND', 'ROYAL'];
  for (let i = 0; i < BOARD_SIZES.length; i += 1) {
    const size = BOARD_SIZES[i];
    const card = setupCardRect(i);
    const active = size === selected;
    const cardFill = ctx.createLinearGradient(card.x, card.y, card.x, card.y + card.h);
    cardFill.addColorStop(0, active ? '#2f7de1' : 'rgba(55,61,101,0.82)');
    cardFill.addColorStop(1, active ? '#6945c7' : 'rgba(26,28,59,0.9)');
    ctx.fillStyle = cardFill;
    roundRect(ctx, card.x, card.y, card.w, card.h, 11);
    ctx.fill();
    ctx.strokeStyle = active ? '#9fe8ff' : 'rgba(255,255,255,0.14)';
    ctx.lineWidth = active ? 2.4 : 1;
    roundRect(ctx, card.x + 0.7, card.y + 0.7, card.w - 1.4, card.h - 1.4, 11);
    ctx.stroke();

    // A tiny board preview makes the density difference obvious before a child
    // has to read the size label.
    const previewSize = 44;
    const previewX = card.x + (card.w - previewSize) / 2;
    const previewY = card.y + 13;
    const previewCell = previewSize / size;
    ctx.fillStyle = 'rgba(4,9,30,0.7)';
    roundRect(ctx, previewX - 2, previewY - 2, previewSize + 4, previewSize + 4, 4);
    ctx.fill();
    ctx.fillStyle = active ? 'rgba(186,238,255,0.7)' : 'rgba(174,181,224,0.52)';
    for (let n = 0; n < size; n += 1) {
      const row = (n * 7 + i * 3) % size;
      ctx.fillRect(
        previewX + n * previewCell + 0.4,
        previewY + row * previewCell + 0.4,
        Math.max(1, previewCell - 0.8),
        Math.max(1, previewCell - 0.8),
      );
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 19px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(`${size}×${size}`, card.x + card.w / 2, card.y + 76);
    ctx.fillStyle = active ? '#d8f7ff' : 'rgba(255,255,255,0.66)';
    ctx.font = '800 8px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(labels[i], card.x + card.w / 2, card.y + 98);
  }

  const play = ctx.createLinearGradient(
    SETUP_PLAY.x,
    SETUP_PLAY.y,
    SETUP_PLAY.x,
    SETUP_PLAY.y + SETUP_PLAY.h,
  );
  play.addColorStop(0, '#59d4ff');
  play.addColorStop(1, '#3471df');
  ctx.fillStyle = play;
  roundRect(ctx, SETUP_PLAY.x, SETUP_PLAY.y, SETUP_PLAY.w, SETUP_PLAY.h, 18);
  ctx.fill();
  ctx.strokeStyle = 'rgba(220,250,255,0.85)';
  ctx.lineWidth = 1.5;
  roundRect(
    ctx,
    SETUP_PLAY.x + 0.8,
    SETUP_PLAY.y + 0.8,
    SETUP_PLAY.w - 1.6,
    SETUP_PLAY.h - 1.6,
    18,
  );
  ctx.stroke();
  ctx.fillStyle = '#07152e';
  ctx.font = '900 17px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(`PLAY ${selected}×${selected}`, BOARD_W / 2, SETUP_PLAY.y + 22);
  ctx.font = '800 8px ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(7,21,46,0.72)';
  ctx.fillText('A NEW PICTURE + NEW BLOCKS EVERY GAME', BOARD_W / 2, SETUP_PLAY.y + 39);
  ctx.restore();

  if (dim) {
    ctx.fillStyle = 'rgba(4,2,10,0.55)';
    ctx.fillRect(0, 0, cw, ch);
  }
}

function draw(
  ctx: CanvasRenderingContext2D,
  s: State,
  layout: Layout,
  cw: number,
  ch: number,
  dim: boolean,
): void {
  // Eased toward the real level (see `displayLevel`'s update in the step loop)
  // rather than read straight off it, so a level-up recolours the room over
  // about a third of a second instead of snapping on the frame the score
  // crossed the threshold.
  const p = paletteFor(s.displayLevel);

  const bg = ctx.createLinearGradient(0, 0, 0, ch);
  bg.addColorStop(0, p.bgTop);
  bg.addColorStop(1, p.bgBot);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, cw, ch);

  // A soft pool of light behind the board, so the frame is not floating on flat
  // colour.
  const halo = ctx.createRadialGradient(cw / 2, ch * 0.36, 0, cw / 2, ch * 0.36, cw * 0.85);
  halo.addColorStop(0, p.glow);
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, cw, ch);

  ctx.save();
  ctx.translate(layout.ox, layout.oy);
  ctx.scale(layout.scale, layout.scale);
  if (s.shake > 0) {
    ctx.translate(
      Math.sin(s.time * 71) * s.shake,
      Math.cos(s.time * 53) * s.shake * 0.7,
    );
  }

  drawHud(ctx, s, p);
  drawGrid(ctx, s, p);
  drawPlaced(ctx, s, p);
  drawClearing(ctx, s, p);
  drawGhost(ctx, s, p);
  drawTray(ctx, s, p);
  drawDragged(ctx, s, p);
  drawSparks(ctx, s, p);
  drawPops(ctx, s, p);
  drawDanger(ctx, s);
  if (s.hint > 0) drawHint(ctx, s, p);

  ctx.restore();

  if (dim) {
    ctx.fillStyle = 'rgba(4,2,10,0.55)';
    ctx.fillRect(0, 0, cw, ch);
  }
}

function drawHud(ctx: CanvasRenderingContext2D, s: State, p: Palette): void {
  ctx.font = 'bold 11px ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = p.ink;
  ctx.globalAlpha = 0.85;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(`LEVEL ${s.level} · ${capitalize(s.patternName)}`, PAD + 1, HUD_H / 2 + 1);
  ctx.textAlign = 'right';
  ctx.fillText(`${s.lines} LINES`, BOARD_W - PAD - 1, HUD_H / 2 + 1);
  ctx.globalAlpha = 1;

  if (s.streak > 1) {
    // Pulsing, because the streak multiplier is the one number worth chasing.
    const pulse = 0.75 + Math.sin(s.time * 9) * 0.25;
    ctx.textAlign = 'center';
    ctx.fillStyle = p.tones[2].light;
    ctx.globalAlpha = pulse;
    ctx.fillText(`${s.streak} IN A ROW`, BOARD_W / 2, HUD_H / 2 + 1);
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function drawGrid(ctx: CanvasRenderingContext2D, s: State, p: Palette): void {
  const grid = s.board.size;
  const cell = cellForSize(grid);
  ctx.fillStyle = p.frame;
  roundRect(ctx, 0, HUD_H, BOARD_W, GRID_BOX, 14);
  ctx.fill();
  ctx.strokeStyle = p.frameEdge;
  ctx.lineWidth = 1.2;
  roundRect(ctx, 0.6, HUD_H + 0.6, BOARD_W - 1.2, GRID_BOX - 1.2, 14);
  ctx.stroke();

  // Lines that a legal ghost would complete get their wells lit, which is the
  // clearest possible way to say "put it here".
  const lit = ghostLines(s);

  for (let r = 0; r < grid; r += 1) {
    for (let c = 0; c < grid; c += 1) {
      const x = GRID_X + c * cell;
      const y = GRID_Y + r * cell;
      const hot = lit.rows.has(r) || lit.cols.has(c);
      ctx.fillStyle = p.well;
      roundRect(ctx, x + 1.2, y + 1.2, cell - 2.4, cell - 2.4, cell * 0.2);
      ctx.fill();

      // Inner top shadow: makes each cell read as a recess, not a flat tile.
      const sh = ctx.createLinearGradient(x, y, x, y + cell * 0.5);
      sh.addColorStop(0, 'rgba(0,0,0,0.34)');
      sh.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sh;
      roundRect(ctx, x + 1.2, y + 1.2, cell - 2.4, cell - 2.4, cell * 0.2);
      ctx.fill();

      if (hot) {
        ctx.fillStyle = 'rgba(255,255,255,0.13)';
        roundRect(ctx, x + 1.2, y + 1.2, cell - 2.4, cell - 2.4, cell * 0.2);
        ctx.fill();
      }
    }
  }
}

function ghostLines(s: State): { rows: Set<number>; cols: Set<number> } {
  const rows = new Set<number>();
  const cols = new Set<number>();
  const d = s.drag;
  if (!d) return { rows, cols };
  const piece = s.tray[d.slot];
  if (!piece) return { rows, cols };
  const aim = aimFor(s, piece.shape, d);
  if (!aim.valid) return { rows, cols };
  const pv = previewLines(s.board, piece.shape, aim.ar, aim.ac);
  for (const r of pv.rows) rows.add(r);
  for (const c of pv.cols) cols.add(c);
  return { rows, cols };
}

/**
 * A cell's entrance state: 0 alpha/scale is invisible, 1/1 is fully settled.
 * Two independent sources of "just arrived", checked in order because a cell
 * can only be one or the other: the level's picture rippling in (checked while
 * `levelT` is inside the reveal window) and a piece the player just placed
 * settling from a small pop to full size.
 */
function cellAnim(s: State, r: number, c: number): { alpha: number; scale: number } {
  const i = r * s.board.size + c;
  if (s.levelT < REVEAL_TOTAL && s.isPatternCell[i]) {
    const local = clamp((s.levelT - s.reveal[i]) / REVEAL_DUR, 0, 1);
    return { alpha: local, scale: easeOutBack(local) };
  }
  for (const lc of s.landCells) {
    if (lc.r === r && lc.c === c) {
      const local = clamp(lc.t / lc.dur, 0, 1);
      return { alpha: 1, scale: 0.55 + 0.45 * easeOutBack(local) };
    }
  }
  return { alpha: 1, scale: 1 };
}

function drawPlaced(ctx: CanvasRenderingContext2D, s: State, p: Palette): void {
  const grid = s.board.size;
  const cell = cellForSize(grid);
  for (let r = 0; r < grid; r += 1) {
    for (let c = 0; c < grid; c += 1) {
      const tone = s.board.cells[r * grid + c];
      if (tone < 0) continue;
      const anim = cellAnim(s, r, c);
      if (anim.alpha <= 0.01 || anim.scale <= 0.02) continue;
      const base = cell - 2;
      const size = base * anim.scale;
      const off = (base - size) / 2;
      drawBlock(
        ctx,
        GRID_X + c * cell + 1 + off,
        GRID_Y + r * cell + 1 + off,
        size,
        p.tones[tone % p.tones.length],
        { shadow: 0.5, alpha: anim.alpha },
      );
    }
  }

  if (s.snap) {
    // A ring snapping shut over the footprint: the "it landed" confirmation.
    const k = clamp(s.snap.t / 0.34, 0, 1);
    const grow = (1 - k) * cell * 0.5;
    ctx.strokeStyle = `rgba(255,255,255,${0.55 * (1 - k)})`;
    ctx.lineWidth = 2 + (1 - k) * 2;
    roundRect(
      ctx,
      GRID_X + s.snap.c * cell - grow,
      GRID_Y + s.snap.r * cell - grow,
      s.snap.w * cell + grow * 2,
      s.snap.h * cell + grow * 2,
      cell * 0.28 + grow,
    );
    ctx.stroke();
  }
}

function drawClearing(ctx: CanvasRenderingContext2D, s: State, p: Palette): void {
  const cell = cellForSize(s.board.size);
  for (const fx of s.clears) {
    const t = s.clearT - fx.delay;
    if (t < 0 || t >= CLEAR_DUR) continue;
    const k = t / CLEAR_DUR;
    // Flare white, swell, then shrink away.
    const grow = Math.sin(k * Math.PI) * cell * 0.16;
    const size = (cell - 2) * (1 - k * 0.75) + grow;
    const off = (cell - size) / 2;
    drawBlock(
      ctx,
      GRID_X + fx.c * cell + off,
      GRID_Y + fx.r * cell + off,
      size,
      p.tones[fx.tone % p.tones.length],
      { alpha: 1 - k * 0.85, flash: 0.7 * (1 - k) },
    );
  }
}

function drawGhost(ctx: CanvasRenderingContext2D, s: State, p: Palette): void {
  const d = s.drag;
  if (!d) return;
  const piece = s.tray[d.slot];
  if (!piece) return;
  const aim = aimFor(s, piece.shape, d);
  if (!aim.near) return;

  const good = aim.valid;
  const wash = good ? 'rgba(104,222,132,0.30)' : 'rgba(240,96,96,0.34)';
  const rim = good ? 'rgba(150,255,180,0.95)' : 'rgba(255,140,140,0.95)';
  const pulse = 0.82 + Math.sin(s.time * 11) * 0.18;
  const cellSize = cellForSize(s.board.size);

  for (const cell of piece.shape.cells) {
    const x = GRID_X + (aim.ac + cell.dc) * cellSize;
    const y = GRID_Y + (aim.ar + cell.dr) * cellSize;
    if (good) {
      drawBlock(ctx, x + 1, y + 1, cellSize - 2, p.tones[piece.tone % p.tones.length], {
        alpha: 0.4,
      });
    }
    ctx.fillStyle = wash;
    roundRect(ctx, x + 1, y + 1, cellSize - 2, cellSize - 2, cellSize * 0.22);
    ctx.fill();
    ctx.strokeStyle = rim;
    ctx.globalAlpha = pulse;
    ctx.lineWidth = 1.8;
    roundRect(ctx, x + 1.9, y + 1.9, cellSize - 3.8, cellSize - 3.8, cellSize * 0.2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawTray(ctx: CanvasRenderingContext2D, s: State, p: Palette): void {
  for (let i = 0; i < 3; i += 1) {
    const slot = slotRect(i);
    const rejecting = s.reject?.slot === i;
    ctx.fillStyle = rejecting ? 'rgba(200,70,70,0.35)' : p.slot;
    roundRect(ctx, slot.x, slot.y, slot.w, slot.h, 12);
    ctx.fill();
    ctx.strokeStyle = rejecting ? 'rgba(255,140,140,0.8)' : 'rgba(255,255,255,0.09)';
    ctx.lineWidth = 1;
    roundRect(ctx, slot.x + 0.5, slot.y + 0.5, slot.w - 1, slot.h - 1, 12);
    ctx.stroke();

    const piece = s.tray[i];
    if (!piece) continue;
    // The piece being dragged is drawn at the finger, not in its slot.
    if (s.drag?.slot === i) continue;
    drawPreview(ctx, piece, slot, p, s.time + i, s.traySpawn[i]);
  }
}

function drawPreview(
  ctx: CanvasRenderingContext2D,
  piece: Piece,
  slot: { x: number; y: number; w: number; h: number },
  p: Palette,
  phase: number,
  spawn: number,
): void {
  const shape = piece.shape;
  const size = Math.min(
    (slot.w * 0.84) / shape.w,
    (slot.h * 0.84) / shape.h,
    CELL * 0.62,
  );
  // A slow bob, so the tray looks alive and invites a grab.
  const bob = Math.sin(phase * 1.7) * 0.8;
  const ox = slot.x + (slot.w - shape.w * size) / 2;
  const oy = slot.y + (slot.h - shape.h * size) / 2 + bob;
  const tone = p.tones[piece.tone % p.tones.length];
  // A freshly refilled slot scales in from nothing rather than appearing
  // whole - `spawn` counts down from 1 (just arrived) to 0 (settled).
  const settle = 1 - clamp(spawn, 0, 1);
  const scale = 0.3 + 0.7 * easeOutBack(settle);
  const alpha = clamp(settle * 1.6, 0, 1);
  const cx = ox + (shape.w * size) / 2;
  const cy = oy + (shape.h * size) / 2;
  for (const cell of shape.cells) {
    const bx = ox + cell.dc * size;
    const by = oy + cell.dr * size;
    const sx = cx + (bx - cx) * scale;
    const sy = cy + (by - cy) * scale;
    drawBlock(ctx, sx, sy, (size - 1) * scale, tone, {
      shadow: 0.7,
      alpha,
    });
  }
}

function drawDragged(ctx: CanvasRenderingContext2D, s: State, p: Palette): void {
  const d = s.drag;
  if (!d) return;
  const piece = s.tray[d.slot];
  if (!piece) return;
  const cellSize = cellForSize(s.board.size);
  const o = dragOrigin(piece.shape, d.x, d.y, s.board.size);
  const tone = p.tones[piece.tone % p.tones.length];

  // A pointer line from the fingertip to the piece, so the offset never reads as
  // the game losing track of the finger.
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 1.4;
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(d.x, d.y);
  ctx.lineTo(o.x + (piece.shape.w * cellSize) / 2, o.y + piece.shape.h * cellSize);
  ctx.stroke();
  ctx.setLineDash([]);

  for (const cell of piece.shape.cells) {
    drawBlock(
      ctx,
      o.x + cell.dc * cellSize + 1,
      o.y + cell.dr * cellSize + 1,
      cellSize - 2,
      tone,
      { shadow: 1.6 },
    );
  }
}

function drawSparks(ctx: CanvasRenderingContext2D, s: State, p: Palette): void {
  for (const sp of s.sparks) {
    const a = clamp(sp.life / sp.max, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = sp.tone < 0 ? 'rgba(255,240,220,0.7)' : p.tones[sp.tone % p.tones.length].light;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, sp.size * (0.4 + a * 0.6), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawPops(ctx: CanvasRenderingContext2D, s: State, p: Palette): void {
  ctx.textAlign = 'center';
  for (const pop of s.pops) {
    const k = pop.t / pop.life;
    // Overshoot then settle, so the number lands with some weight.
    const grow = Math.min(1, pop.t / 0.14);
    const scale = 1 + (1 - grow) * 0.5;
    const size = (pop.big ? 17 : 13) * scale;
    ctx.globalAlpha = clamp(1 - Math.max(0, k - 0.55) / 0.45, 0, 1);
    ctx.font = `bold ${size}px ui-sans-serif, system-ui, sans-serif`;
    ctx.lineWidth = 3.2;
    ctx.strokeStyle = 'rgba(20,10,4,0.7)';
    const y = pop.y - k * 34;
    ctx.strokeText(pop.text, pop.x, y);
    ctx.fillStyle = pop.big ? p.tones[2].light : '#ffffff';
    ctx.fillText(pop.text, pop.x, y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

/**
 * The board getting full is the only threat in this game, and it creeps up
 * silently, so it gets a heartbeat: a warm rim inside the frame that pulses
 * faster and brighter the closer the board is to jammed.
 */
function drawDanger(ctx: CanvasRenderingContext2D, s: State): void {
  const fill = fillCount(s.board) / (s.board.size * s.board.size);
  if (fill < DANGER_FILL) return;
  const heat = clamp((fill - DANGER_FILL) / (1 - DANGER_FILL), 0, 1);
  const beat = 0.5 + 0.5 * Math.sin(s.time * (5 + heat * 7));
  const a = 0.16 + heat * 0.42 * beat;

  const rim = ctx.createLinearGradient(0, HUD_H, 0, HUD_H + GRID_BOX);
  rim.addColorStop(0, `rgba(255,110,90,${a})`);
  rim.addColorStop(0.5, `rgba(255,110,90,${a * 0.25})`);
  rim.addColorStop(1, `rgba(255,110,90,${a})`);
  ctx.strokeStyle = rim;
  ctx.lineWidth = 3 + heat * 3;
  roundRect(ctx, 2, HUD_H + 2, BOARD_W - 4, GRID_BOX - 4, 13);
  ctx.stroke();
}

function drawHint(ctx: CanvasRenderingContext2D, s: State, p: Palette): void {
  // Sat low inside the board, on a pill, so it reads over an empty grid and does
  // not fight the tray for the 8px gap between them.
  const text = 'drag a block onto the board';
  ctx.globalAlpha = clamp(s.hint / 1.5, 0, 1);
  ctx.font = 'bold 11px ui-sans-serif, system-ui, sans-serif';
  const width = ctx.measureText(text).width + 18;
  const cx = BOARD_W / 2;
  const cy = GRID_Y + PLAY_PIXELS - cellForSize(s.board.size) * 1.1;
  ctx.fillStyle = 'rgba(12,6,2,0.7)';
  roundRect(ctx, cx - width / 2, cy - 10, width, 20, 10);
  ctx.fill();
  ctx.fillStyle = p.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy + 0.5);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = 1;
}
