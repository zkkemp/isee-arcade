'use client';

import { useEffect, useRef } from 'react';
import { RAMP_SCALE, type Difficulty } from '@/lib/difficulty';
import type { GameApi, GameCanvasProps } from '@/lib/games';
import { playSound, unlockAudio } from '@/lib/sound';
import { useCanvasGame } from '@/lib/useCanvasGame';

/**
 * Bubble Pop - an original bubble shooter. A launcher at the bottom aims where
 * the player drags, releasing fires a colour bubble up into a hanging cluster;
 * three or more same-colour bubbles touching pop, and anything left with no
 * path back to the ceiling falls. New rows creep in from the top over time, so
 * the game never truly "clears" - it is an endless survive-as-long-as-you-can.
 *
 * Everything above the component is pure: no canvas, no React, no Math.random.
 * `findCluster`, `findFloating`, `snapToGrid`, `applyLandedBubble`,
 * `shiftGridDown`, `reflectOffWalls` and `computeAimDir` are the real functions
 * the game runs, and scripts/check-bubblepop.ts drives them headlessly. The
 * failures that ruin this genre are all invisible from the renderer:
 *
 *  1. A cluster that pops at the wrong size (two bubbles popping, or four
 *     refusing to). `findCluster` is a plain flood fill and the only rule that
 *     decides a pop is `cluster.length >= POP_MIN`, tested directly.
 *  2. A bubble left floating with nothing under it, or a bubble that drops even
 *     though another path still ties it to the ceiling. `findFloating` is a
 *     fresh flood fill from row 0 on the board *after* a pop, so "anchored" and
 *     "floating" are answered by connectivity, never by guessing which cells a
 *     removal touched.
 *  3. A snapped bubble overlapping one already on the board. `snapToGrid` only
 *     ever returns a cell that reads empty at the moment it is asked, and the
 *     checker asserts the returned cell is a genuine neighbour of the hit point
 *     with no shared occupant.
 *  4. A shot that can be aimed sideways or downward, which turns the launcher
 *     into a way to skip the board entirely. `computeAimDir` clamps every input
 *     angle to a cone around straight up, and the checker feeds it a shot aimed
 *     dead level and dead down and confirms both still leave the board.
 *
 * The grid is square (not hex) - the contract allows either, and a square grid
 * means "shift every row down by one" and "which cell did this projectile
 * settle into" are both exact integer operations with no offset-row parity to
 * keep straight, which is where most from-scratch bubble shooters quietly
 * break. Art is drawn procedurally: radial-shaded circles, no assets.
 */

// --- grid -------------------------------------------------------------------

export const COLS = 8;
/** Total row capacity. Only the top portion is normally occupied; the rest is
 *  headroom the stack grows into before the danger line. */
export const ROWS = 14;
/** A filled cell at or below this row means bubbles have reached the bottom. */
export const DANGER_ROW = ROWS - 3;
/** Rows filled at the start of a run / after a death. */
const INITIAL_ROWS = 5;

export const NUM_COLORS = 5;
export const COLORS = ['#ff5464', '#4ea8ff', '#3ddc84', '#ffd75e', '#c77dff'];

/** Smallest same-colour connected group that pops. */
export const POP_MIN = 3;

export type Grid = { cells: Array<number | null> };

export function idx(r: number, c: number): number {
  return r * COLS + c;
}

export function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < ROWS && c >= 0 && c < COLS;
}

export function makeGrid(): Grid {
  return { cells: new Array<number | null>(ROWS * COLS).fill(null) };
}

export function cloneGrid(g: Grid): Grid {
  return { cells: g.cells.slice() };
}

/** Out of bounds reads back as empty - a flood fill never needs a separate
 *  bounds check once every neighbour has already been filtered by `inBounds`. */
export function cellAt(g: Grid, r: number, c: number): number | null {
  if (!inBounds(r, c)) return null;
  return g.cells[idx(r, c)];
}

/** Orthogonal neighbours, filtered to the board. A square grid's whole appeal:
 *  no row-parity offset to keep in sync when a row gets inserted. */
export function neighborsOf(r: number, c: number): Array<{ r: number; c: number }> {
  const out = [
    { r, c: c - 1 },
    { r, c: c + 1 },
    { r: r - 1, c },
    { r: r + 1, c },
  ];
  return out.filter((n) => inBounds(n.r, n.c));
}

/** Every colour currently on the board, for drawing a shot that can actually
 *  make a match rather than one from a colour nowhere on the field. */
export function colorsPresent(g: Grid): number[] {
  const set = new Set<number>();
  for (const v of g.cells) if (v !== null) set.add(v);
  return Array.from(set).sort((a, b) => a - b);
}

export function pickColor(rng: () => number, g: Grid): number {
  const present = colorsPresent(g);
  const pool = present.length > 0 ? present : Array.from({ length: NUM_COLORS }, (_, i) => i);
  return pool[Math.floor(rng() * pool.length)] ?? pool[0];
}

/** Flood fill of same-colour orthogonal neighbours from (r, c). Includes the
 *  starting cell. Empty when (r, c) itself is empty. */
export function findCluster(g: Grid, r: number, c: number): Array<{ r: number; c: number }> {
  const color = cellAt(g, r, c);
  if (color === null) return [];
  const seen = new Set<number>([idx(r, c)]);
  const stack = [{ r, c }];
  const out: Array<{ r: number; c: number }> = [];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    out.push(cur);
    for (const n of neighborsOf(cur.r, cur.c)) {
      const key = idx(n.r, n.c);
      if (seen.has(key)) continue;
      if (cellAt(g, n.r, n.c) === color) {
        seen.add(key);
        stack.push(n);
      }
    }
  }
  return out;
}

/**
 * Every filled cell with no path back to row 0 (the ceiling), found by flooding
 * outward from row 0 across whatever is still filled and reporting what the
 * flood never reached. Call this AFTER removing a popped cluster - it answers
 * "floating right now", not "floating because of that specific removal", which
 * is what keeps a bubble anchored through a second path from dropping anyway.
 */
export function findFloating(g: Grid): Array<{ r: number; c: number }> {
  const reached = new Set<number>();
  const stack: Array<{ r: number; c: number }> = [];
  for (let c = 0; c < COLS; c += 1) {
    if (cellAt(g, 0, c) !== null) {
      reached.add(idx(0, c));
      stack.push({ r: 0, c });
    }
  }
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const n of neighborsOf(cur.r, cur.c)) {
      const key = idx(n.r, n.c);
      if (reached.has(key)) continue;
      if (cellAt(g, n.r, n.c) !== null) {
        reached.add(key);
        stack.push(n);
      }
    }
  }
  const floating: Array<{ r: number; c: number }> = [];
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      if (cellAt(g, r, c) !== null && !reached.has(idx(r, c))) floating.push({ r, c });
    }
  }
  return floating;
}

/** A filled cell at or past the danger line - bubbles have reached the bottom. */
export function bottomReached(g: Grid): boolean {
  for (let r = DANGER_ROW; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      if (cellAt(g, r, c) !== null) return true;
    }
  }
  return false;
}

/**
 * Shifts every row down by one and writes `newRow` in at row 0. Whatever was
 * sitting in the last row falls off the bottom of the array - `overflowed`
 * says whether that happened to an occupied cell, which is as unambiguous a
 * "the stack was already too tall" signal as `bottomReached` itself.
 */
export function shiftGridDown(
  g: Grid,
  newRow: Array<number | null>,
): { grid: Grid; overflowed: boolean } {
  let overflowed = false;
  for (let c = 0; c < COLS; c += 1) if (cellAt(g, ROWS - 1, c) !== null) overflowed = true;
  const cells = new Array<number | null>(ROWS * COLS).fill(null);
  for (let r = 0; r < ROWS - 1; r += 1) {
    for (let c = 0; c < COLS; c += 1) cells[idx(r + 1, c)] = g.cells[idx(r, c)];
  }
  for (let c = 0; c < COLS; c += 1) cells[idx(0, c)] = newRow[c] ?? null;
  return { grid: { cells }, overflowed };
}

export function makeRandomRow(rng: () => number, g: Grid): Array<number | null> {
  const row = new Array<number | null>(COLS).fill(null);
  for (let c = 0; c < COLS; c += 1) row[c] = pickColor(rng, g);
  return row;
}

/** A fresh board: the top INITIAL_ROWS rows solid, everything below empty.
 *  Every cell in those rows is filled, so the rectangle is trivially all one
 *  connected component - a fresh board can never open with a floater. */
export function seedInitialGrid(rng: () => number): Grid {
  const g = makeGrid();
  for (let r = 0; r < INITIAL_ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      g.cells[idx(r, c)] = Math.floor(rng() * NUM_COLORS);
    }
  }
  return g;
}

// --- landing a shot ----------------------------------------------------------

/** Points for popping a cluster. Combo-weighted: a streak of clearing shots in
 *  a row is worth steadily more, same shape as every other game's streak bonus. */
export function popScore(clusterSize: number, streak: number): number {
  return clusterSize * 10 + streak * 15;
}

/** Bonus for bubbles that fell because their support popped out from under
 *  them - the free reward that makes chasing a big drop worthwhile. */
export function floatScore(count: number): number {
  return count * 25;
}

export type LandResult = {
  grid: Grid;
  popped: Array<{ r: number; c: number }>;
  floaters: Array<{ r: number; c: number }>;
  popScoreGained: number;
  floatScoreGained: number;
  newStreak: number;
};

/**
 * Everything a landed bubble does to the board, with no rng, no clock, no
 * side effects: write it in, pop the cluster it completed (if any), drop
 * whatever that pop left floating, score both. Returns a new grid; `g` is
 * never mutated, so a caller can always compare before and after.
 */
export function applyLandedBubble(
  g: Grid,
  r: number,
  c: number,
  color: number,
  streak: number,
): LandResult {
  const grid = cloneGrid(g);
  grid.cells[idx(r, c)] = color;

  const cluster = findCluster(grid, r, c);
  if (cluster.length < POP_MIN) {
    return { grid, popped: [], floaters: [], popScoreGained: 0, floatScoreGained: 0, newStreak: 0 };
  }

  for (const cell of cluster) grid.cells[idx(cell.r, cell.c)] = null;
  const newStreak = streak + 1;
  const floaters = findFloating(grid);
  for (const f of floaters) grid.cells[idx(f.r, f.c)] = null;

  return {
    grid,
    popped: cluster,
    floaters,
    popScoreGained: popScore(cluster.length, newStreak),
    floatScoreGained: floatScore(floaters.length),
    newStreak,
  };
}

// --- layout ------------------------------------------------------------------

/** Logical cell size, board units. */
export const CELL = 24;
const PAD = 8;
export const BOARD_W = PAD * 2 + COLS * CELL;
/** Room below the grid for the launcher and the current/next preview. */
const LAUNCH_ZONE = 64;
export const BOARD_H = PAD * 2 + ROWS * CELL + LAUNCH_ZONE;

const TOP_Y = PAD;
export const LAUNCHER_X = BOARD_W / 2;
export const LAUNCHER_Y = PAD + ROWS * CELL + LAUNCH_ZONE * 0.5;

/** Bubble drawing radius. Deliberately smaller than half a cell so adjacent
 *  bubbles read as distinct circles rather than a solid slab. */
const DRAW_R = CELL * 0.44;

export function cellCenter(r: number, c: number): { x: number; y: number } {
  return { x: PAD + CELL / 2 + c * CELL, y: PAD + CELL / 2 + r * CELL };
}

export type Layout = { scale: number; ox: number; oy: number };

export function layoutFor(cw: number, ch: number, inset: number): Layout {
  const usableH = Math.max(1, ch - inset);
  const scale = Math.min(cw / BOARD_W, usableH / BOARD_H);
  return { scale, ox: (cw - BOARD_W * scale) / 2, oy: (usableH - BOARD_H * scale) / 2 };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Nearest grid cell to a continuous board position, clamped to the board. */
export function nearestCell(x: number, y: number): { r: number; c: number } {
  const c = clamp(Math.round((x - PAD - CELL / 2) / CELL), 0, COLS - 1);
  const r = clamp(Math.round((y - PAD - CELL / 2) / CELL), 0, ROWS - 1);
  return { r, c };
}

/**
 * Where a bubble arriving at (x, y) settles. Starts at the nearest cell; if
 * that cell already has an occupant (the projectile stopped just outside it,
 * which is the ordinary case), breadth-first searches outward through the
 * grid graph for the closest cell that reads empty right now. Never returns
 * an occupied cell, and null only when the entire board is somehow full.
 */
export function snapToGrid(g: Grid, x: number, y: number): { r: number; c: number } | null {
  const start = nearestCell(x, y);
  if (cellAt(g, start.r, start.c) === null) return start;

  const seen = new Set<number>([idx(start.r, start.c)]);
  let frontier = [start];
  while (frontier.length > 0) {
    const next: Array<{ r: number; c: number }> = [];
    for (const cell of frontier) {
      for (const n of neighborsOf(cell.r, cell.c)) {
        const key = idx(n.r, n.c);
        if (seen.has(key)) continue;
        seen.add(key);
        if (cellAt(g, n.r, n.c) === null) return n;
        next.push(n);
      }
    }
    frontier = next;
  }
  return null;
}

// --- shot physics --------------------------------------------------------

/** How far off straight-up a shot is allowed to point. 75 degrees leaves a
 *  shot that grazes the walls but can never be level or aimed downward. */
export const MAX_AIM_FROM_VERTICAL = (75 * Math.PI) / 180;

/**
 * A unit direction from a launcher-relative offset, clamped into the upward
 * cone. `dy` is board-space (down is positive), so "the pointer is below the
 * launcher" is dy > 0 - that and dead-level both get clamped to the edge of
 * the cone rather than let through, so the result is always at least
 * `cos(MAX_AIM_FROM_VERTICAL)` of the way to straight up.
 */
export function computeAimDir(dx: number, dy: number): { vx: number; vy: number } {
  // A tap directly on the launcher has no meaningful angle. Treat it as a
  // friendly straight shot instead of Math.atan2(0, -0)'s surprising pi.
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return { vx: 0, vy: -1 };
  let angle = Math.atan2(dx, -dy);
  if (angle > MAX_AIM_FROM_VERTICAL) angle = MAX_AIM_FROM_VERTICAL;
  if (angle < -MAX_AIM_FROM_VERTICAL) angle = -MAX_AIM_FROM_VERTICAL;
  return { vx: Math.sin(angle), vy: -Math.cos(angle) };
}

/** Reflects a travelling bubble off the left/right walls, clamping it back
 *  inside them. Independent of everything else here - a one-line physics
 *  fact, easy to sabotage-test in isolation. */
export function reflectOffWalls(
  x: number,
  vx: number,
  radius: number,
  boardW: number,
): { x: number; vx: number } {
  if (x - radius < 0) return { x: radius, vx: Math.abs(vx) };
  if (x + radius > boardW) return { x: boardW - radius, vx: -Math.abs(vx) };
  return { x, vx };
}

/** Seeded LCG - generation must never touch Math.random or nothing is provable. */
export function lcg(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const PROJECTILE_SPEED = 320;
/** Seconds between a fresh row creeping in from the top, before difficulty
 *  scaling. Harder settings ramp faster - see `RAMP_SCALE`. */
const ROW_INTERVAL_BASE = 13;

// --- game state ----------------------------------------------------------

type Projectile = { x: number; y: number; vx: number; vy: number; color: number };
type Aim = { x: number; y: number };

type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: number;
};

type Drop = { x: number; y: number; vx: number; vy: number; color: number; t: number; life: number };

type Pop = { x: number; y: number; text: string; t: number; life: number; big: boolean };

type State = {
  difficulty: Difficulty;
  grid: Grid;
  rng: () => number;
  fxRng: () => number;
  current: number;
  next: number;
  projectile: Projectile | null;
  aim: Aim | null;
  streak: number;
  rowInterval: number;
  rowTimer: number;
  score: number;
  shake: number;
  flash: number;
  sparks: Spark[];
  drops: Drop[];
  pops: Pop[];
  time: number;
  dimAt: { w: number; h: number } | null;
};

function freshState(difficulty: Difficulty, seed: number): State {
  const rng = lcg(seed);
  const grid = seedInitialGrid(rng);
  const rowInterval = ROW_INTERVAL_BASE / RAMP_SCALE[difficulty];
  return {
    difficulty,
    grid,
    rng,
    fxRng: lcg((seed ^ 0x9e3779b9) >>> 0),
    current: pickColor(rng, grid),
    next: pickColor(rng, grid),
    projectile: null,
    // A persistent, vertical aim line means keyboard players get useful
    // feedback before their first arrow press, and touch has a safe default.
    aim: { x: LAUNCHER_X, y: LAUNCHER_Y - 120 },
    streak: 0,
    rowInterval,
    rowTimer: rowInterval,
    score: 0,
    shake: 0,
    flash: 0,
    sparks: [],
    drops: [],
    pops: [],
    time: 0,
    dimAt: null,
  };
}

/** Dying is free: the board resets, score and difficulty survive. */
function resetBoard(s: State): void {
  s.grid = seedInitialGrid(s.rng);
  s.projectile = null;
  s.aim = { x: LAUNCHER_X, y: LAUNCHER_Y - 120 };
  s.streak = 0;
  s.rowTimer = s.rowInterval;
  s.current = pickColor(s.rng, s.grid);
  s.next = pickColor(s.rng, s.grid);
  s.flash = 0.5;
}

function award(s: State, api: GameApi, n: number): void {
  if (n <= 0) return;
  s.score += n;
  api.addScore(n);
}

function pushSpark(s: State, x: number, y: number, color: number): void {
  const ang = s.fxRng() * Math.PI * 2;
  const speed = 30 + s.fxRng() * 70;
  s.sparks.push({
    x,
    y,
    vx: Math.cos(ang) * speed,
    vy: Math.sin(ang) * speed - 20,
    life: 0.4 + s.fxRng() * 0.2,
    max: 0.6,
    color,
  });
  if (s.sparks.length > 200) s.sparks.splice(0, s.sparks.length - 200);
}

function triggerDeath(s: State, api: GameApi): void {
  playSound('gameOver');
  api.died('Bubbles reached the bottom');
  resetBoard(s);
}

function fireShot(s: State): void {
  if (s.projectile || !s.aim) return;
  const dir = computeAimDir(s.aim.x - LAUNCHER_X, s.aim.y - LAUNCHER_Y);
  s.projectile = {
    x: LAUNCHER_X,
    y: LAUNCHER_Y,
    vx: dir.vx * PROJECTILE_SPEED,
    vy: dir.vy * PROJECTILE_SPEED,
    color: s.current,
  };
  s.current = s.next;
  s.next = pickColor(s.rng, s.grid);
  playSound('click');
}

/** Lands a travelling bubble at (x, y): finds its cell, applies the pure
 *  landing rules, then decorates the result with sound, particles and score. */
function stick(s: State, api: GameApi, p: Projectile, x: number, y: number): void {
  s.projectile = null;
  const cell = snapToGrid(s.grid, x, y);
  if (!cell) {
    triggerDeath(s, api);
    return;
  }

  const before = s.grid;
  const res = applyLandedBubble(before, cell.r, cell.c, p.color, s.streak);

  if (res.popped.length === 0) {
    s.streak = 0;
    s.grid = res.grid;
    playSound('land');
  } else {
    s.streak = res.newStreak;
    s.grid = res.grid;
    award(s, api, res.popScoreGained);
    playSound('coin', Math.min(10, s.streak * 2));
    for (const cell2 of res.popped) {
      const pt = cellCenter(cell2.r, cell2.c);
      pushSpark(s, pt.x, pt.y, p.color);
    }
    s.shake = Math.min(3, 0.8 + res.popped.length * 0.25);

    if (res.floaters.length > 0) {
      award(s, api, res.floatScoreGained);
      for (const f of res.floaters) {
        const from = cellCenter(f.r, f.c);
        const color = before.cells[idx(f.r, f.c)] ?? 0;
        s.drops.push({
          x: from.x,
          y: from.y,
          vx: (s.fxRng() - 0.5) * 30,
          vy: 20,
          color,
          t: 0,
          life: 1.1,
        });
      }
      playSound(res.floaters.length >= 5 ? 'powerup' : 'brick', res.floaters.length);
    }

    const total = res.popScoreGained + res.floatScoreGained;
    s.pops.push({
      x: LAUNCHER_X,
      y: cellCenter(cell.r, cell.c).y,
      text: res.floaters.length > 0 ? `+${total} combo!` : `+${total}`,
      t: 0,
      life: 1,
      big: res.popped.length >= 5 || res.floaters.length > 0,
    });
    api.setStatus(`${res.popped.length} popped${res.floaters.length > 0 ? ` +${res.floaters.length} dropped` : ''}`);
  }

  if (bottomReached(s.grid)) triggerDeath(s, api);
}

// --- component -------------------------------------------------------------

export default function BubblePop({
  paused,
  input,
  api,
  restartToken,
  difficulty,
  controlsInset,
}: GameCanvasProps) {
  const stateRef = useRef<State | null>(null);
  const seedRef = useRef(1);

  useEffect(() => {
    seedRef.current = (Date.now() ^ Math.imul(restartToken + 1, 2654435761)) >>> 0 || 1;
    stateRef.current = null;
  }, [restartToken, difficulty]);

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
          s.aim = null;
          s.dimAt = { w: cw, h: ch };
          draw(ctx, s, layout, cw, ch, true);
        }
        return;
      }
      s.dimAt = null;

      s.time += dt;
      if (s.shake > 0) s.shake = Math.max(0, s.shake - dt * 4);
      if (s.flash > 0) s.flash = Math.max(0, s.flash - dt * 2);
      advanceFx(s, dt);

      // --- input: touch fires on press, not release --------------------------
      // A very quick tap may begin and end between animation frames. The old
      // release-only flow then saw no pointer coordinates and silently lost the
      // whole shot. Press edges retain their coordinates, so every tap now both
      // chooses an angle and fires. Dragging still steers the next available
      // shot, while keyboard players use Left/Right then Space/Up to fire.
      const pressed = input.consumePointerPress();
      input.consumePointerRelease();
      const px = input.pointerX;
      const py = input.pointerY;
      const bx = px === null ? null : (px * cw - layout.ox) / layout.scale;
      const by = py === null ? null : (py * ch - layout.oy) / layout.scale;

      if (!s.projectile) {
        if ((input.pointerDown || pressed) && bx !== null && by !== null) {
          s.aim = { x: bx, y: by };
        }
        if (input.held.left || input.held.right) {
          const current = s.aim ?? { x: LAUNCHER_X, y: LAUNCHER_Y - 120 };
          const nudge = (input.held.right ? 1 : 0) - (input.held.left ? 1 : 0);
          s.aim = {
            x: clamp(current.x + nudge * dt * 155, LAUNCHER_X - 180, LAUNCHER_X + 180),
            y: Math.min(current.y, LAUNCHER_Y - 42),
          };
        }
        if (pressed || input.consumeJump()) fireShot(s);
      }
      // Consume a keyboard fire edge even while a shot is travelling so it
      // cannot unexpectedly launch a second bubble later.
      else input.consumeJump();

      // --- projectile flight, substepped so a fast shot cannot tunnel ---
      if (s.projectile) {
        const dist = Math.hypot(s.projectile.vx, s.projectile.vy) * dt;
        const steps = Math.max(1, Math.ceil(dist / (CELL * 0.4)));
        const stepDt = dt / steps;
        for (let i = 0; i < steps && s.projectile; i += 1) {
          const p = s.projectile;
          p.x += p.vx * stepDt;
          p.y += p.vy * stepDt;
          const bounced = reflectOffWalls(p.x, p.vx, DRAW_R, BOARD_W);
          p.x = bounced.x;
          p.vx = bounced.vx;

          if (p.y - DRAW_R <= TOP_Y) {
            stick(s, api, p, p.x, TOP_Y + CELL / 2);
            break;
          }
          if (p.y >= LAUNCHER_Y - CELL * 0.5) {
            stick(s, api, p, p.x, p.y);
            break;
          }

          const near = nearestCell(p.x, p.y);
          let hit = false;
          for (const cand of [near, ...neighborsOf(near.r, near.c)]) {
            if (cellAt(s.grid, cand.r, cand.c) === null) continue;
            const cc = cellCenter(cand.r, cand.c);
            if (Math.hypot(p.x - cc.x, p.y - cc.y) < CELL * 0.92) {
              hit = true;
              break;
            }
          }
          if (hit) {
            stick(s, api, p, p.x, p.y);
            break;
          }
        }
      }

      // --- the endless creep: a new row every so often ---
      s.rowTimer -= dt;
      if (s.rowTimer <= 0) {
        s.rowTimer += s.rowInterval;
        const newRow = makeRandomRow(s.rng, s.grid);
        const { grid, overflowed } = shiftGridDown(s.grid, newRow);
        s.grid = grid;
        if (overflowed || bottomReached(s.grid)) {
          triggerDeath(s, api);
        }
      }

      draw(ctx, s, layout, cw, ch, false);
    },
  });

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />;
}

// --- effects -----------------------------------------------------------------

function advanceFx(s: State, dt: number): void {
  for (let i = s.sparks.length - 1; i >= 0; i -= 1) {
    const sp = s.sparks[i];
    sp.life -= dt;
    sp.x += sp.vx * dt;
    sp.y += sp.vy * dt;
    sp.vy += 90 * dt;
    if (sp.life <= 0) s.sparks.splice(i, 1);
  }
  for (let i = s.drops.length - 1; i >= 0; i -= 1) {
    const d = s.drops[i];
    d.t += dt;
    d.vy += 260 * dt;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    if (d.t >= d.life) s.drops.splice(i, 1);
  }
  for (let i = s.pops.length - 1; i >= 0; i -= 1) {
    const p = s.pops[i];
    p.t += dt;
    if (p.t >= p.life) s.pops.splice(i, 1);
  }
}

// --- drawing -----------------------------------------------------------------

function drawBubble(ctx: CanvasRenderingContext2D, x: number, y: number, color: number, r: number): void {
  const hex = COLORS[color] ?? '#999';
  const grad = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.15, x, y, r);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.25, hex);
  grad.addColorStop(1, hex);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.1);
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.stroke();
}

function draw(
  ctx: CanvasRenderingContext2D,
  s: State,
  layout: Layout,
  cw: number,
  ch: number,
  dimmed: boolean,
): void {
  ctx.save();
  ctx.clearRect(0, 0, cw, ch);

  const bg = ctx.createLinearGradient(0, 0, 0, ch);
  bg.addColorStop(0, '#1b1440');
  bg.addColorStop(1, '#2c1c56');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, cw, ch);

  ctx.translate(layout.ox, layout.oy);
  const shakeX = s.shake > 0 ? (Math.random() - 0.5) * s.shake * 3 : 0;
  const shakeY = s.shake > 0 ? (Math.random() - 0.5) * s.shake * 3 : 0;
  ctx.translate(shakeX, shakeY);
  ctx.scale(layout.scale, layout.scale);

  // board panel
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(0, 0, BOARD_W, BOARD_H);

  // danger line
  const dangerY = PAD + DANGER_ROW * CELL;
  ctx.strokeStyle = 'rgba(255,90,90,0.55)';
  ctx.setLineDash([6, 5]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, dangerY);
  ctx.lineTo(BOARD_W, dangerY);
  ctx.stroke();
  ctx.setLineDash([]);

  // grid bubbles
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const color = cellAt(s.grid, r, c);
      if (color === null) continue;
      const p = cellCenter(r, c);
      drawBubble(ctx, p.x, p.y, color, DRAW_R);
    }
  }

  // dropping bubbles (already removed from the grid, still falling visually)
  for (const d of s.drops) {
    const alpha = clamp(1 - d.t / d.life, 0, 1);
    ctx.globalAlpha = alpha;
    drawBubble(ctx, d.x, d.y, d.color, DRAW_R * 0.9);
    ctx.globalAlpha = 1;
  }

  // pop sparks
  for (const sp of s.sparks) {
    const alpha = clamp(sp.life / sp.max, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = COLORS[sp.color] ?? '#fff';
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // aim guide
  if (s.aim && !s.projectile) {
    const dir = computeAimDir(s.aim.x - LAUNCHER_X, s.aim.y - LAUNCHER_Y);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 6]);
    ctx.beginPath();
    ctx.moveTo(LAUNCHER_X, LAUNCHER_Y);
    ctx.lineTo(LAUNCHER_X + dir.vx * 200, LAUNCHER_Y + dir.vy * 200);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // launcher + current/next preview
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.arc(LAUNCHER_X, LAUNCHER_Y, DRAW_R * 1.6, 0, Math.PI * 2);
  ctx.fill();
  drawBubble(ctx, LAUNCHER_X, LAUNCHER_Y, s.current, DRAW_R);
  drawBubble(ctx, LAUNCHER_X + CELL * 1.6, LAUNCHER_Y, s.next, DRAW_R * 0.7);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = `${10}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('next', LAUNCHER_X + CELL * 1.6, LAUNCHER_Y + DRAW_R + 12);

  // travelling bubble
  if (s.projectile) drawBubble(ctx, s.projectile.x, s.projectile.y, s.projectile.color, DRAW_R);

  // score pops
  for (const p of s.pops) {
    const t = p.t / p.life;
    ctx.globalAlpha = clamp(1 - t, 0, 1);
    ctx.fillStyle = p.big ? '#ffd75e' : '#ffffff';
    ctx.font = `bold ${p.big ? 16 : 12}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(p.text, p.x, p.y - t * 24);
    ctx.globalAlpha = 1;
  }

  // HUD
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`Score ${s.score}`, 8, 16);
  if (s.streak > 1) {
    ctx.fillStyle = '#ffd75e';
    ctx.textAlign = 'right';
    ctx.fillText(`Streak x${s.streak}`, BOARD_W - 8, 16);
  }

  if (dimmed) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, 0, BOARD_W, BOARD_H);
  }
  if (s.flash > 0) {
    ctx.fillStyle = `rgba(255,60,60,${s.flash * 0.35})`;
    ctx.fillRect(0, 0, BOARD_W, BOARD_H);
  }

  ctx.restore();
}
