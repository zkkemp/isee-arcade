'use client';

import { useEffect, useRef } from 'react';
import type { GameCanvasProps } from '@/lib/games';
import type { Difficulty } from '@/lib/difficulty';
import { SPEED_SCALE, RAMP_SCALE } from '@/lib/difficulty';
import { useCanvasGame } from '@/lib/useCanvasGame';

/**
 * Falling Blocks - an original falling-polyomino stacking game. Seven
 * four-cell pieces drop down a 10-wide well; a completed row clears and
 * everything above it settles down one step; the well speeds up as rows
 * clear. This is an original implementation: original piece geometry helper
 * functions, an original scoring/leveling curve, and an original palette -
 * it shares only the generic, decades-old falling-block genre mechanic with
 * any other game in this space, the same way countless "block stacking"
 * games do.
 *
 * Everything above the component is pure - no canvas, no React, no
 * Math.random - so scripts/check-tetra.ts can drive the real rules headlessly.
 * Three things matter most and are all invisible from the renderer:
 *
 *  1. A rotation that does not actually cycle through 4 states back to where
 *     it started. `rotateCells` is a single generic 90-degree turn inside a
 *     fixed NxN box; applying it 4 times returns to the exact original cells
 *     for every piece, by construction (a property of the rotation itself,
 *     not something special-cased per shape).
 *  2. A line clear that drops the wrong rows, or drops them the wrong
 *     distance. `clearFullRows` rebuilds the well from scratch out of the
 *     surviving rows, in order, with fresh empty rows only at the top - it
 *     is never "zero out the full rows and hope the rest is still right".
 *  3. A piece sliding through a wall or the floor. `canPlace` is the single
 *     source of truth every move (`tryMove`, `tryDrop`, `tryRotate`) is
 *     tested against, so a bad move can never silently take effect.
 *
 * Dying here is free (core rule of this app): topping out clears the well and
 * play resumes immediately with the score and level intact - it never asks a
 * question. A question only opens every LINES_PER_LEVEL rows cleared, via
 * `api.requestGate`.
 */

// --- pieces ------------------------------------------------------------

export type PieceId = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

export const PIECE_IDS: PieceId[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

export type Cell = { dr: number; dc: number };

export type PieceShape = { cells: Cell[]; box: number };

export type PieceDef = {
  id: PieceId;
  box: number;
  /** Exactly 4 rotation states, index 0 = spawn orientation. */
  rotations: PieceShape[];
};

/**
 * One generic clockwise quarter-turn inside a fixed box x box grid:
 * (r, c) -> (c, box - 1 - r). Applying this four times to any cell returns it
 * to (r, c) exactly, for any box size - it is a property of rotating a square
 * 360 degrees, not something that needs proving per shape.
 */
export function rotateCells(cells: Cell[], box: number): Cell[] {
  return cells.map(({ dr, dc }) => ({ dr: dc, dc: box - 1 - dr }));
}

function buildPiece(id: PieceId, box: number, base: Cell[]): PieceDef {
  const rotations: PieceShape[] = [];
  let cur = base;
  for (let i = 0; i < 4; i += 1) {
    rotations.push({ cells: cur, box });
    cur = rotateCells(cur, box);
  }
  return { id, box, rotations };
}

const c = (dr: number, dc: number): Cell => ({ dr, dc });

/**
 * Base (spawn) orientation for each of the seven pieces, in the smallest box
 * that can hold all four of its rotations. Geometry only - the shapes a
 * falling-block piece can be are a handful of small polyominoes, the same
 * mathematical objects countless unrelated games (and puzzles, and
 * wallpaper) use; nothing here is copied from any single game's assets or
 * source.
 */
export const PIECES: Record<PieceId, PieceDef> = {
  I: buildPiece('I', 4, [c(1, 0), c(1, 1), c(1, 2), c(1, 3)]),
  O: buildPiece('O', 2, [c(0, 0), c(0, 1), c(1, 0), c(1, 1)]),
  T: buildPiece('T', 3, [c(0, 1), c(1, 0), c(1, 1), c(1, 2)]),
  S: buildPiece('S', 3, [c(0, 1), c(0, 2), c(1, 0), c(1, 1)]),
  Z: buildPiece('Z', 3, [c(0, 0), c(0, 1), c(1, 1), c(1, 2)]),
  J: buildPiece('J', 3, [c(0, 0), c(1, 0), c(1, 1), c(1, 2)]),
  L: buildPiece('L', 3, [c(0, 2), c(1, 0), c(1, 1), c(1, 2)]),
};

// --- the well ------------------------------------------------------------

export const WELL_W = 10;
export const WELL_H = 20;
const FULL_ROW = (1 << WELL_W) - 1;

/**
 * A well is a tone per cell for drawing (-1 empty, else an index into
 * PIECE_IDS recording which piece left it there) plus one column-bitmask per
 * row, exactly the two-representation approach used elsewhere in this app for
 * grid placement games - it lets a checker cross-examine one against the
 * other instead of comparing an implementation with itself.
 */
export type Well = { cells: number[]; rows: number[] };

export function makeWell(): Well {
  return { cells: new Array<number>(WELL_W * WELL_H).fill(-1), rows: new Array<number>(WELL_H).fill(0) };
}

export function cloneWell(w: Well): Well {
  return { cells: w.cells.slice(), rows: w.rows.slice() };
}

export type Active = { id: PieceId; rot: number; row: number; col: number };

/** Spawn position: centred horizontally, box top-left at row 0. */
export function spawnActive(id: PieceId): Active {
  return { id, rot: 0, row: 0, col: Math.floor((WELL_W - PIECES[id].box) / 2) };
}

/**
 * The one rule every move is tested against. A cell above the well (rr < 0)
 * never happens in play (every spawn starts at row 0), but is treated as open
 * rather than a wall so a checker can probe it without special-casing.
 */
export function canPlace(well: Well, id: PieceId, rot: number, row: number, col: number): boolean {
  const shape = PIECES[id].rotations[((rot % 4) + 4) % 4];
  for (const cell of shape.cells) {
    const rr = row + cell.dr;
    const cc = col + cell.dc;
    if (cc < 0 || cc >= WELL_W || rr >= WELL_H) return false;
    if (rr < 0) continue;
    if (well.cells[rr * WELL_W + cc] >= 0) return false;
  }
  return true;
}

export function tryMove(well: Well, active: Active, dcol: number): Active | null {
  const col = active.col + dcol;
  return canPlace(well, active.id, active.rot, active.row, col) ? { ...active, col } : null;
}

export function tryDrop(well: Well, active: Active): Active | null {
  const row = active.row + 1;
  return canPlace(well, active.id, active.rot, row, active.col) ? { ...active, row } : null;
}

/** Small, kid-forgiving wall kicks: straight rotation first, then a nudge either way. */
const KICKS = [0, -1, 1, -2, 2];

export function tryRotate(well: Well, active: Active): Active | null {
  const rot = (active.rot + 1) % 4;
  for (const k of KICKS) {
    const col = active.col + k;
    if (canPlace(well, active.id, rot, active.row, col)) return { ...active, rot, col };
  }
  return null;
}

/** Writes a resting piece into the well. Callers must have checked `canPlace` first. */
export function lockPiece(well: Well, active: Active, tone: number): Well {
  const out = cloneWell(well);
  const shape = PIECES[active.id].rotations[active.rot];
  for (const cell of shape.cells) {
    const rr = active.row + cell.dr;
    const cc = active.col + cell.dc;
    if (rr < 0 || rr >= WELL_H) continue;
    out.cells[rr * WELL_W + cc] = tone;
    out.rows[rr] |= 1 << cc;
  }
  return out;
}

export type ClearOutcome = { well: Well; cleared: number[] };

/**
 * Clears every full row and drops everything above it down to fill the gap.
 * Rebuilt from scratch out of the surviving rows, in their original order,
 * with fresh empty rows only at the top - not "zero the full rows in place",
 * which would leave the rest of the stack floating over a hole.
 */
export function clearFullRows(well: Well): ClearOutcome {
  const cleared: number[] = [];
  const keep: number[] = [];
  for (let r = 0; r < WELL_H; r += 1) {
    if (well.rows[r] === FULL_ROW) cleared.push(r);
    else keep.push(r);
  }
  if (cleared.length === 0) return { well: cloneWell(well), cleared: [] };

  const cells = new Array<number>(WELL_W * WELL_H).fill(-1);
  const rows = new Array<number>(WELL_H).fill(0);
  const offset = cleared.length; // this many fresh empty rows land on top
  for (let i = 0; i < keep.length; i += 1) {
    const src = keep[i];
    const dst = offset + i;
    for (let col = 0; col < WELL_W; col += 1) cells[dst * WELL_W + col] = well.cells[src * WELL_W + col];
    rows[dst] = well.rows[src];
  }
  return { well: { cells, rows }, cleared };
}

// --- scoring & level -------------------------------------------------------

/** Index 0 unused; 1-4 lines. Quadratic-ish so a multi-clear is worth chasing. */
export const LINE_SCORES = [0, 100, 300, 500, 800];

export function lineScore(lines: number, level: number): number {
  if (lines <= 0) return 0;
  return LINE_SCORES[Math.min(lines, 4)] * level;
}

export const LINES_PER_LEVEL = 10;

export function levelForLines(totalLines: number): number {
  return Math.floor(totalLines / LINES_PER_LEVEL) + 1;
}

const BASE_GRAVITY = 0.8;
const MIN_GRAVITY = 0.11;
const GRAVITY_STEP = 0.05;

/** Seconds per row of fall. Ramps down with level, scaled by the difficulty setting. */
export function gravityFor(level: number, difficulty: Difficulty): number {
  const raw = BASE_GRAVITY - (level - 1) * GRAVITY_STEP * RAMP_SCALE[difficulty];
  return Math.max(MIN_GRAVITY, raw) / SPEED_SCALE[difficulty];
}

// --- the bag ---------------------------------------------------------------

/** Seeded LCG, self-contained so piece generation never touches Math.random. */
export function lcg(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A shuffled full set of all 7 pieces - "the bag" - so a run is never starved of a shape. */
export function shuffledBag(rng: () => number): PieceId[] {
  const out = PIECE_IDS.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/** Where the piece lands if it fell straight down from here - the ghost outline. */
export function ghostRow(well: Well, active: Active): number {
  let cur = active;
  for (let i = 0; i < WELL_H + 4; i += 1) {
    const next = tryDrop(well, cur);
    if (!next) return cur.row;
    cur = next;
  }
  return cur.row;
}

// --- layout ------------------------------------------------------------
//
// Fixed logical board, scaled to fit and centred, same approach as every
// other grid game in this app.

const CELL = 24;
const PAD = 6;
const HUD_H = 40;
const WELL_PIX_W = WELL_W * CELL;
const WELL_PIX_H = WELL_H * CELL;
export const BOARD_W = WELL_PIX_W + PAD * 2;
const GRID_X = PAD;
const GRID_Y = HUD_H + PAD;
export const BOARD_H = GRID_Y + WELL_PIX_H + PAD;

const NEXT_CELL = 9;
const NEXT_DIM = 4 * NEXT_CELL;
const NEXT_X = BOARD_W - PAD - NEXT_DIM;
const NEXT_Y = 4;

export type Layout = { scale: number; ox: number; oy: number };

export function layoutFor(cw: number, ch: number, inset: number): Layout {
  const usableH = Math.max(1, ch - inset);
  const scale = Math.min(cw / BOARD_W, usableH / BOARD_H);
  return { scale, ox: (cw - BOARD_W * scale) / 2, oy: (usableH - BOARD_H * scale) / 2 };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// --- palette ---------------------------------------------------------------
//
// A deliberately original, deliberately scrambled hue assignment - none of
// the seven pieces keeps the color the genre's best-known implementation
// uses for the same shape (I is not cyan, O is not yellow, T is not purple,
// S is not green, Z is not red, J is not blue, L is not orange).

const TONE_HUES: Record<PieceId, number> = {
  I: 262, // violet
  O: 168, // teal
  T: 336, // magenta
  S: 24, // orange
  Z: 200, // sky blue
  J: 46, // gold
  L: 300, // purple-pink
};

/** Comma hsl() syntax - older iOS Safari does not parse the modern space form. */
function hsl(h: number, s: number, l: number, a = 1): string {
  const hh = ((h % 360) + 360) % 360;
  return a >= 1 ? `hsl(${hh}, ${s}%, ${l}%)` : `hsla(${hh}, ${s}%, ${l}%, ${a})`;
}

type Tone = { light: string; base: string; dark: string };

function toneFor(id: PieceId): Tone {
  const h = TONE_HUES[id];
  return { light: hsl(h, 85, 74), base: hsl(h, 72, 54), dark: hsl(h, 62, 34) };
}

const TONES: Tone[] = PIECE_IDS.map(toneFor);

// --- game state --------------------------------------------------------

type ClearFx = { rows: number[]; t: number; label: string };
type Pop = { text: string; t: number };

type State = {
  well: Well;
  active: Active;
  nextId: PieceId;
  queue: PieceId[];
  rng: () => number;
  score: number;
  lines: number;
  level: number;
  tickAccum: number;
  time: number;
  shake: number;
  clearFx: ClearFx | null;
  pop: Pop | null;
};

function drawNextId(s: Pick<State, 'queue' | 'rng'>): PieceId {
  if (s.queue.length === 0) s.queue.push(...shuffledBag(s.rng));
  const id = s.queue.shift() as PieceId;
  if (s.queue.length === 0) s.queue.push(...shuffledBag(s.rng));
  return id;
}

function spawnNext(s: State): void {
  const id = drawNextId(s);
  s.active = spawnActive(id);
  s.nextId = s.queue[0];
}

function freshState(seed: number): State {
  const rng = lcg(seed);
  const s: State = {
    well: makeWell(),
    active: spawnActive('T'),
    nextId: 'T',
    queue: [],
    rng,
    score: 0,
    lines: 0,
    level: 1,
    tickAccum: 0,
    time: 0,
    shake: 0,
    clearFx: null,
    pop: null,
  };
  spawnNext(s);
  return s;
}

const CLEAR_LABEL = ['', 'Single!', 'Double!', 'Triple!', 'Quad!'];
const CLEAR_FX_DUR = 0.4;

function award(s: State, api: GameCanvasProps['api'], n: number): void {
  s.score += n;
  api.addScore(n);
}

function lockCurrentPiece(s: State, api: GameCanvasProps['api']): void {
  const tone = PIECE_IDS.indexOf(s.active.id);
  const locked = lockPiece(s.well, s.active, tone);
  const { well: afterClear, cleared } = clearFullRows(locked);

  if (cleared.length > 0) {
    const pts = lineScore(cleared.length, s.level);
    award(s, api, pts);
    s.lines += cleared.length;
    s.shake = Math.min(3, 1 + cleared.length * 0.6);
    s.clearFx = { rows: cleared, t: 0, label: CLEAR_LABEL[Math.min(cleared.length, 4)] };
    s.pop = { text: `${CLEAR_LABEL[Math.min(cleared.length, 4)]} +${pts}`, t: 0 };
    api.setStatus(`${CLEAR_LABEL[Math.min(cleared.length, 4)]} +${pts} - ${s.lines} lines`);

    const newLevel = levelForLines(s.lines);
    if (newLevel > s.level) {
      s.level = newLevel;
      api.requestGate(`Level ${newLevel} cleared!`);
    }
  }

  s.well = afterClear;
  spawnNext(s);

  // Top out: the fresh piece has nowhere to go. Dying is free in this app -
  // clear the well and keep going, never gate on death.
  if (!canPlace(s.well, s.active.id, s.active.rot, s.active.row, s.active.col)) {
    api.died('Stack topped out');
    s.well = makeWell();
    s.active = spawnActive(s.active.id);
  }
}

// --- component -------------------------------------------------------------

export default function Tetra({
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

  const { canvasRef } = useCanvasGame({
    active: !paused,
    step: (ctx, dt, cw, ch) => {
      let s = stateRef.current;
      if (!s) {
        s = freshState(seedRef.current);
        stateRef.current = s;
      }

      s.time += dt;
      if (s.shake > 0) s.shake = Math.max(0, s.shake - dt * 6);
      if (s.clearFx) {
        s.clearFx.t += dt;
        if (s.clearFx.t >= CLEAR_FX_DUR) s.clearFx = null;
      }
      if (s.pop) {
        s.pop.t += dt;
        if (s.pop.t >= 1.1) s.pop = null;
      }

      // --- input: discrete taps, exactly like every other dpad game here ---
      let tap = input.consumeTap();
      while (tap) {
        if (tap === 'left') {
          const next = tryMove(s.well, s.active, -1);
          if (next) s.active = next;
        } else if (tap === 'right') {
          const next = tryMove(s.well, s.active, 1);
          if (next) s.active = next;
        } else if (tap === 'up') {
          const next = tryRotate(s.well, s.active);
          if (next) s.active = next;
        } else if (tap === 'down') {
          const next = tryDrop(s.well, s.active);
          if (next) {
            s.active = next;
            award(s, api, 1);
            s.tickAccum = 0;
          } else {
            lockCurrentPiece(s, api);
          }
        }
        tap = input.consumeTap();
      }

      // --- gravity ---
      const tick = gravityFor(s.level, difficulty);
      s.tickAccum += dt;
      if (s.tickAccum >= tick) {
        s.tickAccum -= tick;
        const next = tryDrop(s.well, s.active);
        if (next) s.active = next;
        else lockCurrentPiece(s, api);
      }

      draw(ctx, s, layoutFor(cw, ch, controlsInset), cw, ch, character.accent);
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

function drawBlock(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, tone: Tone, alpha = 1): void {
  if (alpha <= 0.01 || size <= 0.5) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const r = size * 0.22;

  const body = ctx.createLinearGradient(x, y, x, y + size);
  body.addColorStop(0, tone.light);
  body.addColorStop(0.5, tone.base);
  body.addColorStop(1, tone.dark);
  ctx.fillStyle = body;
  roundRect(ctx, x, y, size, size, r);
  ctx.fill();

  const cap = ctx.createLinearGradient(x, y, x, y + size * 0.42);
  cap.addColorStop(0, 'rgba(255,255,255,0.55)');
  cap.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = cap;
  roundRect(ctx, x + size * 0.08, y + size * 0.08, size * 0.84, size * 0.32, r * 0.7);
  ctx.fill();

  ctx.strokeStyle = 'rgba(0,0,0,0.32)';
  ctx.lineWidth = Math.max(0.6, size * 0.05);
  roundRect(ctx, x + ctx.lineWidth / 2, y + ctx.lineWidth / 2, size - ctx.lineWidth, size - ctx.lineWidth, r * 0.9);
  ctx.stroke();
  ctx.restore();
}

function draw(
  ctx: CanvasRenderingContext2D,
  s: State,
  layout: Layout,
  cw: number,
  ch: number,
  accent: string,
): void {
  const bgHue = 224 + (s.level - 1) * 6;
  const bg = ctx.createLinearGradient(0, 0, 0, ch);
  bg.addColorStop(0, hsl(bgHue, 32, 14));
  bg.addColorStop(1, hsl(bgHue + 12, 36, 7));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, cw, ch);

  ctx.save();
  ctx.translate(layout.ox, layout.oy);
  ctx.scale(layout.scale, layout.scale);
  if (s.shake > 0) {
    ctx.translate(Math.sin(s.time * 61) * s.shake, Math.cos(s.time * 47) * s.shake * 0.6);
  }

  drawHud(ctx, s, accent);
  drawWell(ctx, s);
  drawGhost(ctx, s);
  drawActive(ctx, s);
  drawNextBox(ctx, s, accent);
  drawClearFx(ctx, s);
  if (s.pop) drawPop(ctx, s.pop);

  ctx.restore();
}

function drawHud(ctx: CanvasRenderingContext2D, s: State, accent: string): void {
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 12px ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.textAlign = 'left';
  ctx.fillText(`SCORE ${s.score}`, PAD, 12);
  ctx.fillText(`LEVEL ${s.level}`, PAD, 28);
  ctx.textAlign = 'right';
  ctx.fillStyle = accent;
  ctx.fillText(`${s.lines} LINES`, NEXT_X - 6, 12);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function drawWell(ctx: CanvasRenderingContext2D, s: State): void {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  roundRect(ctx, GRID_X - 2, GRID_Y - 2, WELL_PIX_W + 4, WELL_PIX_H + 4, 10);
  ctx.fill();

  for (let r = 0; r < WELL_H; r += 1) {
    for (let col = 0; col < WELL_W; col += 1) {
      const x = GRID_X + col * CELL;
      const y = GRID_Y + r * CELL;
      const tone = s.well.cells[r * WELL_W + col];
      if (tone < 0) {
        ctx.fillStyle = (r + col) % 2 === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.018)';
        ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
      } else {
        drawBlock(ctx, x + 1, y + 1, CELL - 2, TONES[tone]);
      }
    }
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1.4;
  roundRect(ctx, GRID_X - 2, GRID_Y - 2, WELL_PIX_W + 4, WELL_PIX_H + 4, 10);
  ctx.stroke();
}

function drawGhost(ctx: CanvasRenderingContext2D, s: State): void {
  const row = ghostRow(s.well, s.active);
  if (row === s.active.row) return; // already resting; the live piece covers it
  const shape = PIECES[s.active.id].rotations[s.active.rot];
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.6;
  for (const cell of shape.cells) {
    const x = GRID_X + (s.active.col + cell.dc) * CELL;
    const y = GRID_Y + (row + cell.dr) * CELL;
    roundRect(ctx, x + 2, y + 2, CELL - 4, CELL - 4, 4);
    ctx.stroke();
  }
  ctx.restore();
}

function drawActive(ctx: CanvasRenderingContext2D, s: State): void {
  const shape = PIECES[s.active.id].rotations[s.active.rot];
  const tone = TONES[PIECE_IDS.indexOf(s.active.id)];
  for (const cell of shape.cells) {
    const x = GRID_X + (s.active.col + cell.dc) * CELL;
    const y = GRID_Y + (s.active.row + cell.dr) * CELL;
    if (y + CELL < GRID_Y) continue;
    drawBlock(ctx, x + 1, y + 1, CELL - 2, tone);
  }
}

function drawNextBox(ctx: CanvasRenderingContext2D, s: State, accent: string): void {
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  roundRect(ctx, NEXT_X, NEXT_Y, NEXT_DIM, NEXT_DIM, 6);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 1.4;
  roundRect(ctx, NEXT_X, NEXT_Y, NEXT_DIM, NEXT_DIM, 6);
  ctx.stroke();
  ctx.globalAlpha = 1;

  const shape = PIECES[s.nextId].rotations[0];
  const tone = TONES[PIECE_IDS.indexOf(s.nextId)];
  const box = PIECES[s.nextId].box;
  const size = (NEXT_DIM * 0.72) / Math.max(box, 2);
  const ox = NEXT_X + (NEXT_DIM - box * size) / 2;
  const oy = NEXT_Y + (NEXT_DIM - box * size) / 2;
  for (const cell of shape.cells) {
    drawBlock(ctx, ox + cell.dc * size, oy + cell.dr * size, size - 1, tone);
  }
}

function drawClearFx(ctx: CanvasRenderingContext2D, s: State): void {
  const fx = s.clearFx;
  if (!fx) return;
  const k = clamp(fx.t / CLEAR_FX_DUR, 0, 1);
  const alpha = (1 - k) * 0.75;
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  for (const r of fx.rows) {
    ctx.fillRect(GRID_X, GRID_Y + r * CELL, WELL_PIX_W, CELL);
  }
}

function drawPop(ctx: CanvasRenderingContext2D, pop: Pop): void {
  const k = clamp(pop.t / 1.1, 0, 1);
  ctx.save();
  ctx.globalAlpha = clamp(1 - Math.max(0, k - 0.6) / 0.4, 0, 1);
  ctx.font = 'bold 16px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  const x = GRID_X + WELL_PIX_W / 2;
  const y = GRID_Y + WELL_PIX_H / 2 - pop.t * 24;
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(10,8,20,0.75)';
  ctx.strokeText(pop.text, x, y);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(pop.text, x, y);
  ctx.restore();
}
