'use client';

import { useEffect, useRef } from 'react';
import type { GameCanvasProps } from '@/lib/games';
import { RAMP_SCALE, SPEED_SCALE, type Difficulty } from '@/lib/difficulty';
import { drawFrame, useSprites, type SpriteSet } from '@/lib/sprites';
import { useCanvasGame } from '@/lib/useCanvasGame';

/**
 * Brick Buster.
 *
 * Everything above the component is pure: no canvas, no React, no Math.random.
 * `buildWall` and `stepWorld` are the real functions the game runs, and
 * scripts/check-breakout.ts drives them headlessly to prove the two classic
 * Breakout bugs are actually gone (tunnelling through a brick or the paddle at
 * speed, and balls stuck in a near-horizontal loop or wedged between bricks).
 *
 * Layout is derived from the canvas size every frame rather than baked in: the
 * playfield is FIELD_W logical units across and however many tall the current
 * aspect gives, so a rotate just re-lays the wall out.
 */

// --- constants ------------------------------------------------------------

/** Logical playfield width. Height comes from the canvas aspect each frame. */
export const FIELD_W = 240;
export const BALL_R = 3.4;

/**
 * Fraction of the ball's speed that must stay vertical. A ball creeping along
 * near-horizontally is the classic Breakout hang: it can bounce wall-to-wall
 * forever without ever reaching a brick or the paddle. 0.32 is about 18.7 degrees
 * off horizontal, shallow enough to still feel like a grazing shot.
 */
export const MIN_VY_FRAC = 0.32;

/** Hard ceiling on ball speed, so "the fastest the game can get" is a real number. */
export const MAX_SPEED = 210;

/** Widest angle off vertical the paddle can throw the ball, at its very edge. */
export const MAX_BOUNCE_ANGLE = (62 * Math.PI) / 180;

/**
 * Per-substep travel, as a fraction of the thinnest collider on the field. Below
 * 0.5 a collider can never be skipped: the ball needs at least two samples to
 * cross it. 0.35 leaves margin.
 */
export const SUBSTEP_FRAC = 0.35;

/**
 * Safety valve on substeps per frame. Normal play needs single digits; if this
 * ever binds, the ball is moving faster than the physics can honestly handle and
 * tunnelling becomes possible again. The checker asserts it never binds.
 */
export const MAX_SUBSTEPS = 64;

/** Seconds without breaking a brick before the ball gets an escape nudge. */
export const STALL_LIMIT = 5;

/** Seconds a parked ball ignores launch input, so a resume tap does not fire it. */
const SERVE_ARM = 0.35;
/** Seconds before a parked ball launches itself. Nobody gets softlocked. */
const SERVE_AUTO = 8;

const PADDLE_BASE_W: Record<Difficulty, number> = { easy: 56, normal: 46, hard: 38 };
const BASE_SPEED = 118;
/** Chance a destroyed brick drops a power-up. */
const POWER_CHANCE: Record<Difficulty, number> = { easy: 0.16, normal: 0.12, hard: 0.08 };
const DROP_SPEED = 58;
const PADDLE_KEY_SPEED = 190;
/** Cap on how fast the paddle chases the finger, so it cannot teleport. */
const PADDLE_FOLLOW = 1400;
const MAX_BALLS = 3;

// --- types ----------------------------------------------------------------

export type Rect = { x: number; y: number; w: number; h: number };
export type BrickTint = 'blue' | 'green' | 'red' | 'yellow' | 'planks' | 'strong';
export type Pattern = 'solid' | 'checker' | 'pyramid' | 'columns' | 'arch' | 'zigzag';
export type PowerKind = 'wide' | 'slow' | 'multi';

export type Brick = {
  row: number;
  col: number;
  hp: number;
  maxHp: number;
  tint: BrickTint;
  points: number;
};

export type Wall = {
  level: number;
  cols: number;
  rows: number;
  pattern: Pattern;
  bricks: Brick[];
  /** [row][col] lookup so collision only tests the cells under the ball. */
  grid: Array<Array<Brick | null>>;
};

export type Geom = {
  /** Playfield height in logical units (width is always FIELD_W). */
  h: number;
  /** Logical units -> CSS pixels. */
  scale: number;
  wallLeft: number;
  wallTop: number;
  brickW: number;
  brickH: number;
  gapX: number;
  gapY: number;
  paddleY: number;
  paddleH: number;
  /** Thinnest collider on the field. Sets the substep cap. */
  minCollider: number;
};

export type Ball = { x: number; y: number; vx: number; vy: number; r: number };
export type Drop = { x: number; y: number; kind: PowerKind };
type Spark = { x: number; y: number; vx: number; vy: number; life: number; tint: BrickTint };

export type World = {
  difficulty: Difficulty;
  level: number;
  wall: Wall;
  geom: Geom;
  paddle: { x: number; w: number; baseW: number };
  balls: Ball[];
  drops: Drop[];
  sparks: Spark[];
  /** Nominal ball speed this instant. Every ball is normalised to it. */
  speed: number;
  serving: boolean;
  serveT: number;
  combo: number;
  bestCombo: number;
  /** Bricks destroyed on this wall, which is what ramps the speed. */
  hits: number;
  stall: number;
  wideT: number;
  slowT: number;
  rng: number;
  time: number;
  /** Diagnostics the checker reads. */
  substepPeak: number;
  nudges: number;
};

export type Ctrl = {
  pointerX: number | null;
  left: boolean;
  right: boolean;
  launch: boolean;
};

export type Events = {
  score: number;
  destroyed: number;
  cleared: boolean;
  lost: boolean;
  caught: PowerKind | null;
};

// --- small helpers --------------------------------------------------------

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Seeded LCG. Generation must never touch Math.random so walls are reproducible. */
export function lcg(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** In-world randomness (nudges, drop rolls) drawn from the world's own state. */
function rand(w: World): number {
  w.rng = (Math.imul(w.rng, 1664525) + 1013904223) >>> 0;
  return w.rng / 4294967296;
}

// --- layout ---------------------------------------------------------------

/**
 * Derives the whole playfield from the canvas size. Called every frame, so a
 * rotate or a split-view resize simply re-lays everything out.
 */
export function makeGeom(
  cw: number,
  ch: number,
  controlsInset: number,
  cols: number,
  rows: number,
): Geom {
  const scale = cw / FIELD_W;
  // Screen pixels reserved for thumb controls are removed from the playfield, so
  // nothing important can ever sit under a hand. On top of any explicit inset we
  // hold back a fifth of the height as a thumb band below the paddle: the kids
  // asked to slide the paddle from underneath, so the paddle - and the ball's
  // death line, which is derived from the same reduced height - both move up and
  // leave clear space for a hand. Everything below is derived from `h`, so this
  // one subtraction keeps every collision invariant intact.
  const THUMB_BAND = 0.2;
  const usable = Math.max(0, ch - controlsInset) * (1 - THUMB_BAND);
  const h = Math.max(FIELD_W * 0.35, usable / scale);

  const paddleH = clamp(h * 0.022, 4, 7);
  const paddleY = h - clamp(h * 0.085, 12, 26) - paddleH;

  const gapX = 1.6;
  const gapY = 1.8;
  const wallLeft = 6;
  const brickW = (FIELD_W - wallLeft * 2 - gapX * (cols - 1)) / cols;

  // Reaction room: the wall never comes closer than this to the paddle.
  const free = Math.max(h * 0.28, 24);
  const region = Math.max(paddleY - free - clamp(h * 0.08, 8, 30), rows * 4);
  const brickH = clamp(Math.min(brickW * 0.82, region / rows - gapY), 2.5, 26);

  // On an absurdly short viewport the block above can still overflow; pulling the
  // wall up keeps the invariant "wall ends above the paddle" true everywhere.
  const pitch = brickH + gapY;
  const wallTop = clamp(
    Math.min(clamp(h * 0.08, 8, 30), paddleY - 8 - rows * pitch),
    2,
    30,
  );

  return {
    h,
    scale,
    wallLeft,
    wallTop,
    brickW,
    brickH,
    gapX,
    gapY,
    paddleY,
    paddleH,
    minCollider: Math.min(brickH, paddleH, BALL_R * 2),
  };
}

export function brickRect(g: Geom, b: { row: number; col: number }): Rect {
  return {
    x: g.wallLeft + b.col * (g.brickW + g.gapX),
    y: g.wallTop + b.row * (g.brickH + g.gapY),
    w: g.brickW,
    h: g.brickH,
  };
}

// --- wall generation ------------------------------------------------------

const PATTERNS: Pattern[] = ['solid', 'checker', 'pyramid', 'columns', 'arch', 'zigzag'];
const ROW_TINTS: BrickTint[] = ['red', 'yellow', 'green', 'blue', 'planks'];

export function wallShape(level: number, d: Difficulty): { cols: number; rows: number } {
  const cols = 7 + ((level - 1) % 3);
  const grow = Math.floor((level - 1) * 0.5 * RAMP_SCALE[d]);
  const rows = Math.min(3 + grow + (d === 'hard' ? 1 : 0), d === 'easy' ? 6 : 8);
  return { cols, rows };
}

function strongChance(level: number, d: Difficulty): number {
  const base = d === 'hard' ? 0.16 : d === 'normal' ? 0.05 : 0;
  return clamp(base + (level - 1) * 0.05 * RAMP_SCALE[d], 0, 0.4);
}

function cellExists(p: Pattern, row: number, col: number, rows: number, cols: number): boolean {
  switch (p) {
    case 'solid':
      return true;
    case 'checker':
      return (row + col) % 2 === 0;
    case 'pyramid': {
      // Narrow at the top, full width at the bottom.
      const inset = Math.floor((rows - 1 - row) / 2);
      return col >= inset && col < cols - inset;
    }
    case 'columns':
      return col % 3 !== 2;
    case 'arch':
      return !((row === 0 || row === rows - 1) && (col === 0 || col === cols - 1));
    case 'zigzag':
      return (col + row * 2) % 5 !== 0;
  }
}

/**
 * Builds one wall. Pure and seeded: the same (level, difficulty, seed) always
 * gives the same wall, and nothing here reads a clock or Math.random.
 */
export function buildWall(level: number, d: Difficulty, seed: number): Wall {
  const { cols, rows } = wallShape(level, d);
  // Mix the level in so one run seed still produces a different wall per level.
  const rnd = lcg((seed ^ Math.imul(level, 2654435761)) >>> 0);
  // Wall 1 is always the plain wall: the first thing a kid sees should be obvious.
  const pattern = level === 1 ? 'solid' : PATTERNS[Math.floor(rnd() * PATTERNS.length)];
  const pStrong = strongChance(level, d);
  /** Two-hit bricks stay in the upper half, the classic arrangement. */
  const strongRows = Math.max(1, Math.floor(rows / 2));

  const build = (p: Pattern): Brick[] => {
    const out: Brick[] = [];
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if (!cellExists(p, row, col, rows, cols)) continue;
        const strong = row < strongRows && rnd() < pStrong;
        out.push(
          strong
            ? { row, col, hp: 2, maxHp: 2, tint: 'strong', points: 25 }
            : {
                row,
                col,
                hp: 1,
                maxHp: 1,
                tint: ROW_TINTS[row % ROW_TINTS.length],
                points: 10 + (rows - 1 - row) * 2,
              },
        );
      }
    }
    return out;
  };

  let bricks = build(pattern);
  let used = pattern;
  // A pattern that gutted the wall is no fun to clear; fall back to solid.
  if (bricks.length < cols * 2) {
    used = 'solid';
    bricks = build('solid');
  }

  const grid: Array<Array<Brick | null>> = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => null),
  );
  for (const b of bricks) grid[b.row][b.col] = b;

  return { level, cols, rows, pattern: used, bricks, grid };
}

// --- world ----------------------------------------------------------------

export function baseSpeedFor(level: number, d: Difficulty, g: Geom): number {
  const ramp = 1 + (level - 1) * 0.07 * RAMP_SCALE[d];
  // A short viewport (landscape) means less distance to cover, so hold the time
  // it takes to cross the field roughly constant instead of the raw speed.
  const shape = clamp(g.h / 320, 0.6, 1.15);
  return Math.min(MAX_SPEED, BASE_SPEED * SPEED_SCALE[d] * ramp * shape);
}

export function paddleWidthFor(level: number, d: Difficulty): number {
  const shrink = Math.max(0.72, 1 - (level - 1) * 0.03 * RAMP_SCALE[d]);
  return PADDLE_BASE_W[d] * shrink;
}

function rampSpeed(w: World): number {
  // Breaking bricks speeds the ball up within a wall, capped so the physics stay
  // inside the substep budget.
  const ramp = 1 + w.hits * 0.004 * RAMP_SCALE[w.difficulty];
  return Math.min(MAX_SPEED, baseSpeedFor(w.level, w.difficulty, w.geom) * ramp);
}

export function createWorld(opts: {
  level: number;
  difficulty: Difficulty;
  seed: number;
  cw: number;
  ch: number;
  inset?: number;
}): World {
  const { level, difficulty, seed, cw, ch } = opts;
  const wall = buildWall(level, difficulty, seed);
  const geom = makeGeom(cw, ch, opts.inset ?? 0, wall.cols, wall.rows);
  const baseW = paddleWidthFor(level, difficulty);

  const w: World = {
    difficulty,
    level,
    wall,
    geom,
    paddle: { x: FIELD_W / 2, w: baseW, baseW },
    balls: [],
    drops: [],
    sparks: [],
    speed: 0,
    serving: true,
    serveT: 0,
    combo: 0,
    bestCombo: 0,
    hits: 0,
    stall: 0,
    wideT: 0,
    slowT: 0,
    rng: (seed ^ 0x9e3779b9) >>> 0 || 1,
    time: 0,
    substepPeak: 0,
    nudges: 0,
  };
  w.speed = rampSpeed(w);
  serve(w);
  return w;
}

/** Parks a single ball on the paddle, waiting to be launched. */
function serve(w: World): void {
  w.serving = true;
  w.serveT = 0;
  w.combo = 0;
  w.drops = [];
  w.wideT = 0;
  w.slowT = 0;
  w.paddle.w = w.paddle.baseW;
  w.balls = [
    { x: w.paddle.x, y: w.geom.paddleY - BALL_R - 0.6, vx: 0, vy: 0, r: BALL_R },
  ];
}

function launch(w: World): void {
  const b = w.balls[0];
  if (!b) return;
  w.serving = false;
  w.stall = 0;
  // Always upward, leaning a random way so the opening shot is not a fixed line.
  const ang = (0.22 + rand(w) * 0.3) * (rand(w) < 0.5 ? -1 : 1);
  const sp = targetSpeed(w);
  b.vx = Math.sin(ang) * sp;
  b.vy = -Math.cos(ang) * sp;
}

function targetSpeed(w: World): number {
  return w.speed * (w.slowT > 0 ? 0.72 : 1);
}

/**
 * Re-derives geometry after a resize or rotate. Only the height can change (the
 * width is always FIELD_W), so positions scale on y and the wall re-lays itself
 * out for free because brick rects are computed from geometry, never stored.
 */
export function relayout(w: World, cw: number, ch: number, inset: number): void {
  const g = makeGeom(cw, ch, inset, w.wall.cols, w.wall.rows);
  const old = w.geom;
  if (g.h === old.h && g.scale === old.scale) return;
  const ky = g.h / old.h;
  w.geom = g;
  for (const b of w.balls) {
    b.y = clamp(b.y * ky, b.r, g.h - b.r);
    b.x = clamp(b.x, b.r, FIELD_W - b.r);
  }
  for (const d of w.drops) d.y *= ky;
  w.speed = rampSpeed(w);
  if (w.serving) serve(w);
}

// --- physics --------------------------------------------------------------

/**
 * Forces a minimum vertical component, keeping the speed unchanged. Without this
 * a ball can settle into a near-horizontal wall-to-wall loop and the level never
 * ends. A ball travelling exactly horizontally is nudged upward, which gives the
 * player a chance rather than dooming them.
 */
export function enforceMinVy(b: Ball): void {
  const sp = Math.hypot(b.vx, b.vy);
  if (sp <= 0) return;
  const minVy = sp * MIN_VY_FRAC;
  if (Math.abs(b.vy) >= minVy) return;
  const sy = b.vy === 0 ? -1 : Math.sign(b.vy);
  const vy = minVy * sy;
  const vxMag = Math.sqrt(Math.max(0, sp * sp - vy * vy));
  b.vx = (b.vx === 0 ? 1 : Math.sign(b.vx)) * vxMag;
  b.vy = vy;
}

function setSpeed(b: Ball, sp: number): void {
  const cur = Math.hypot(b.vx, b.vy);
  if (cur <= 0) return;
  const k = sp / cur;
  b.vx *= k;
  b.vy *= k;
}

function damage(w: World, brick: Brick, ev: Events): void {
  brick.hp -= 1;
  w.stall = 0;
  if (brick.hp > 0) {
    ev.score += 5;
    addSparks(w, brick, 3);
    return;
  }
  w.combo += 1;
  w.bestCombo = Math.max(w.bestCombo, w.combo);
  // Combo: consecutive bricks without touching the paddle. Rewards a rally that
  // digs into the wall instead of pinging one brick at a time.
  ev.score += brick.points + 5 * Math.min(w.combo - 1, 8);
  ev.destroyed += 1;
  w.hits += 1;
  w.speed = rampSpeed(w);
  addSparks(w, brick, 7);
  if (rand(w) < POWER_CHANCE[w.difficulty]) {
    const r = rand(w);
    const kind: PowerKind = r < 0.4 ? 'wide' : r < 0.7 ? 'slow' : 'multi';
    const rect = brickRect(w.geom, brick);
    w.drops.push({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2, kind });
  }
}

function addSparks(w: World, brick: Brick, n: number): void {
  if (w.sparks.length > 70) return;
  const r = brickRect(w.geom, brick);
  for (let i = 0; i < n; i += 1) {
    w.sparks.push({
      x: r.x + r.w * rand(w),
      y: r.y + r.h * rand(w),
      vx: (rand(w) - 0.5) * 60,
      vy: (rand(w) - 0.5) * 60,
      life: 0.25 + rand(w) * 0.25,
      tint: brick.tint,
    });
  }
}

/** Cells whose rects could overlap the ball. O(1) instead of scanning the wall. */
function candidates(w: World, b: Ball, out: Brick[]): void {
  out.length = 0;
  const g = w.geom;
  const pitchX = g.brickW + g.gapX;
  const pitchY = g.brickH + g.gapY;
  const c0 = Math.floor((b.x - b.r - g.wallLeft) / pitchX);
  const c1 = Math.floor((b.x + b.r - g.wallLeft) / pitchX);
  const r0 = Math.floor((b.y - b.r - g.wallTop) / pitchY);
  const r1 = Math.floor((b.y + b.r - g.wallTop) / pitchY);
  for (let row = r0; row <= r1; row += 1) {
    if (row < 0 || row >= w.wall.rows) continue;
    for (let col = c0; col <= c1; col += 1) {
      if (col < 0 || col >= w.wall.cols) continue;
      const brick = w.wall.grid[row][col];
      if (brick && brick.hp > 0) out.push(brick);
    }
  }
}

const scratch: Brick[] = [];

/**
 * Resolves brick overlaps for one substep.
 *
 * Two rules keep a wedged ball from jittering: the shallowest overlap is
 * resolved first, and each axis may only flip once per substep. Without the
 * second rule a ball squeezed between two bricks flips the same axis twice, the
 * flips cancel, and it grinds along inside the wall.
 */
function resolveBricks(w: World, b: Ball, ev: Events): boolean {
  let flippedX = false;
  let flippedY = false;
  let any = false;
  let iter = 0;

  for (; iter < 4; iter += 1) {
    candidates(w, b, scratch);
    let best: Brick | null = null;
    let bestPen = Infinity;
    let bdx = 0;
    let bdy = 0;
    let bpx = 0;
    let bpy = 0;

    for (const brick of scratch) {
      const r = brickRect(w.geom, brick);
      const dx = b.x - (r.x + r.w / 2);
      const dy = b.y - (r.y + r.h / 2);
      const px = r.w / 2 + b.r - Math.abs(dx);
      const py = r.h / 2 + b.r - Math.abs(dy);
      if (px <= 0 || py <= 0) continue;
      const pen = Math.min(px, py);
      if (pen < bestPen) {
        best = brick;
        bestPen = pen;
        bdx = dx;
        bdy = dy;
        bpx = px;
        bpy = py;
      }
    }
    if (!best) break;
    any = true;

    // Push out along the shallower axis and send the ball away from the brick.
    // Using the push-out direction rather than negating the velocity means a ball
    // that somehow started inside always leaves.
    if (bpx < bpy) {
      const s = bdx === 0 ? 1 : Math.sign(bdx);
      b.x += s * bpx;
      if (!flippedX) {
        b.vx = s * Math.abs(b.vx);
        flippedX = true;
      }
    } else {
      const s = bdy === 0 ? -1 : Math.sign(bdy);
      b.y += s * bpy;
      if (!flippedY) {
        b.vy = s * Math.abs(b.vy);
        flippedY = true;
      }
    }
    damage(w, best, ev);
  }

  if (iter >= 4) {
    // Still tangled after four passes: shove it out along its own heading. This
    // is the escape hatch for a genuinely wedged ball.
    const sp = Math.hypot(b.vx, b.vy) || 1;
    b.x += (b.vx / sp) * b.r * 2;
    b.y += (b.vy / sp) * b.r * 2;
    w.nudges += 1;
  }
  return any;
}

/**
 * Paddle collision, swept in y.
 *
 * The paddle is the thinnest thing on the field, so an overlap test alone would
 * let a fast ball step over it. Instead the ball's bottom edge is tested against
 * the paddle's top plane across the whole substep, which cannot be skipped at any
 * speed. The overlap block underneath is only there for the case where the player
 * drags the paddle into a ball sideways.
 */
function paddleCollide(w: World, b: Ball, px: number, py: number): boolean {
  const g = w.geom;
  const top = g.paddleY;
  const bottom = g.paddleY + g.paddleH;
  const half = w.paddle.w / 2;

  const prevBottom = py + b.r;
  const nowBottom = b.y + b.r;
  if (b.vy > 0 && prevBottom <= top && nowBottom >= top) {
    const denom = nowBottom - prevBottom;
    const t = denom > 0 ? (top - prevBottom) / denom : 0;
    const xAt = px + (b.x - px) * t;
    if (xAt > w.paddle.x - half - b.r && xAt < w.paddle.x + half + b.r) {
      bounceOffPaddle(w, b, xAt);
      return true;
    }
  }

  const dxp = b.x - w.paddle.x;
  const penX = half + b.r - Math.abs(dxp);
  if (penX > 0 && b.y + b.r > top && b.y - b.r < bottom) {
    const penUp = b.y + b.r - top;
    const penDown = bottom - (b.y - b.r);
    if (penUp <= penDown && penUp <= penX) {
      bounceOffPaddle(w, b, b.x);
      return true;
    }
    if (penX < penDown) {
      const s = dxp === 0 ? 1 : Math.sign(dxp);
      b.x += s * penX;
      b.vx = s * Math.abs(b.vx);
      return true;
    }
    // Caught under the paddle: let it fall out rather than teleport it up.
    b.y = bottom + b.r;
    b.vy = Math.abs(b.vy);
  }
  return false;
}

/**
 * Where the ball hits the paddle sets the outgoing angle: dead centre goes
 * straight up, the very edge leaves at MAX_BOUNCE_ANGLE. This is what makes the
 * game a skill instead of a coin flip. cos(62 deg) = 0.47, comfortably above
 * MIN_VY_FRAC, so a paddle bounce can never create a shallow ball.
 */
function bounceOffPaddle(w: World, b: Ball, xAt: number): void {
  const half = w.paddle.w / 2;
  const off = clamp((xAt - w.paddle.x) / half, -1, 1);
  const ang = off * MAX_BOUNCE_ANGLE;
  const sp = Math.max(Math.hypot(b.vx, b.vy), targetSpeed(w) * 0.6);
  b.y = w.geom.paddleY - b.r - 0.01;
  b.vx = Math.sin(ang) * sp;
  b.vy = -Math.cos(ang) * sp;
  w.combo = 0;
}

/** One substep. Returns false when the ball has left the bottom of the field. */
function substep(w: World, b: Ball, dt: number, ev: Events): boolean {
  const g = w.geom;
  const px = b.x;
  const py = b.y;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  let bounced = false;

  if (b.x - b.r < 0) {
    b.x = b.r;
    b.vx = Math.abs(b.vx);
    bounced = true;
  } else if (b.x + b.r > FIELD_W) {
    b.x = FIELD_W - b.r;
    b.vx = -Math.abs(b.vx);
    bounced = true;
  }
  if (b.y - b.r < 0) {
    b.y = b.r;
    b.vy = Math.abs(b.vy);
    bounced = true;
  }

  if (resolveBricks(w, b, ev)) bounced = true;
  if (paddleCollide(w, b, px, py)) bounced = true;

  if (b.y - b.r > g.h) return false;
  if (bounced) enforceMinVy(b);
  return true;
}

/**
 * Advances one ball. The frame is cut into substeps short enough that the ball
 * can never step over a collider, which is the whole tunnelling fix.
 */
function stepBall(w: World, b: Ball, dt: number, ev: Events): boolean {
  const maxStep = Math.max(0.25, SUBSTEP_FRAC * w.geom.minCollider);
  const dist = Math.hypot(b.vx, b.vy) * dt;
  const n = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(dist / maxStep)));
  if (n > w.substepPeak) w.substepPeak = n;
  const sdt = dt / n;
  for (let i = 0; i < n; i += 1) {
    if (!substep(w, b, sdt, ev)) return false;
  }
  enforceMinVy(b);
  setSpeed(b, targetSpeed(w));
  return true;
}

function nudge(w: World, b: Ball): void {
  const sp = Math.hypot(b.vx, b.vy);
  if (sp <= 0) return;
  const a =
    Math.atan2(b.vy, b.vx) + (0.05 + rand(w) * 0.11) * (rand(w) < 0.5 ? -1 : 1);
  b.vx = Math.cos(a) * sp;
  b.vy = Math.sin(a) * sp;
  enforceMinVy(b);
}

function movePaddle(w: World, dt: number, c: Ctrl): void {
  w.paddle.w = Math.min(w.paddle.baseW * (w.wideT > 0 ? 1.45 : 1), FIELD_W * 0.5);
  const half = w.paddle.w / 2;
  if (c.pointerX !== null) {
    // Follow the finger, but at a finite rate so the paddle cannot jump across
    // the ball in one frame.
    const target = clamp(c.pointerX * FIELD_W, half, FIELD_W - half);
    const d = target - w.paddle.x;
    const max = PADDLE_FOLLOW * dt;
    w.paddle.x += Math.abs(d) <= max ? d : Math.sign(d) * max;
  } else {
    const dir = (c.right ? 1 : 0) - (c.left ? 1 : 0);
    w.paddle.x += dir * PADDLE_KEY_SPEED * dt;
  }
  w.paddle.x = clamp(w.paddle.x, half, FIELD_W - half);
}

/**
 * Advances the whole world one frame. This is the function both the game loop and
 * the checker call, so anything proven headlessly is proven about the real game.
 */
export function stepWorld(w: World, dtRaw: number, c: Ctrl): Events {
  const ev: Events = { score: 0, destroyed: 0, cleared: false, lost: false, caught: null };
  // The shell already clamps dt; repeated here because the checker calls directly.
  const dt = clamp(dtRaw, 0, 1 / 20);
  w.time += dt;
  w.speed = rampSpeed(w);

  movePaddle(w, dt, c);

  if (w.wideT > 0) w.wideT = Math.max(0, w.wideT - dt);
  if (w.slowT > 0) w.slowT = Math.max(0, w.slowT - dt);

  if (w.serving) {
    w.serveT += dt;
    const b = w.balls[0];
    if (b) {
      b.x = w.paddle.x;
      b.y = w.geom.paddleY - b.r - 0.6;
    }
    if ((c.launch && w.serveT > SERVE_ARM) || w.serveT > SERVE_AUTO) launch(w);
  } else {
    for (let i = w.balls.length - 1; i >= 0; i -= 1) {
      if (!stepBall(w, w.balls[i], dt, ev)) w.balls.splice(i, 1);
    }
    w.stall += dt;
    if (w.stall > STALL_LIMIT) {
      // No progress for a while: tilt every ball slightly. Small enough to be
      // invisible, enough to break any repeating orbit.
      w.stall = 0;
      w.nudges += 1;
      for (const b of w.balls) nudge(w, b);
    }
  }

  // --- power-up drops ---
  const g = w.geom;
  for (let i = w.drops.length - 1; i >= 0; i -= 1) {
    const d = w.drops[i];
    d.y += DROP_SPEED * dt;
    const caught =
      d.y > g.paddleY - 2 &&
      d.y < g.paddleY + g.paddleH + 3 &&
      Math.abs(d.x - w.paddle.x) < w.paddle.w / 2 + 3;
    if (caught) {
      w.drops.splice(i, 1);
      ev.caught = d.kind;
      ev.score += 25;
      if (d.kind === 'wide') w.wideT = 15;
      else if (d.kind === 'slow') w.slowT = 12;
      else spawnExtraBalls(w);
    } else if (d.y > g.h + 6) {
      w.drops.splice(i, 1);
    }
  }

  for (let i = w.sparks.length - 1; i >= 0; i -= 1) {
    const s = w.sparks[i];
    s.life -= dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vy += 120 * dt;
    if (s.life <= 0) w.sparks.splice(i, 1);
  }

  if (w.wall.bricks.every((b) => b.hp <= 0)) {
    ev.cleared = true;
  } else if (!w.serving && w.balls.length === 0) {
    ev.lost = true;
    serve(w);
  }
  return ev;
}

function spawnExtraBalls(w: World): void {
  const src = w.balls[0];
  if (!src) return;
  const sp = Math.hypot(src.vx, src.vy) || targetSpeed(w);
  for (const off of [-0.6, 0.6]) {
    if (w.balls.length >= MAX_BALLS) break;
    const a = Math.atan2(src.vy, src.vx) + off;
    const b: Ball = {
      x: src.x,
      y: src.y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      r: src.r,
    };
    enforceMinVy(b);
    w.balls.push(b);
  }
}

export function bricksLeft(w: World): number {
  let n = 0;
  for (const b of w.wall.bricks) if (b.hp > 0) n += 1;
  return n;
}

// --- component ------------------------------------------------------------

const POWER_LABEL: Record<PowerKind, string> = {
  wide: 'Wider paddle!',
  slow: 'Slow ball!',
  multi: 'Multi-ball!',
};

export default function Breakout({
  paused,
  input,
  api,
  restartToken,
  difficulty,
  controlsInset,
}: GameCanvasProps) {
  const worldRef = useRef<World | null>(null);
  const seedRef = useRef(1);
  const levelRef = useRef(1);
  const pointerDownRef = useRef(false);

  const sprites = useSprites();
  const spritesRef = useRef<SpriteSet | null>(null);
  useEffect(() => {
    spritesRef.current = sprites;
  }, [sprites]);

  // A fresh run gets a fresh seed, so the walls are not identical every session.
  // The world itself is built on the first frame, once the canvas size is known.
  useEffect(() => {
    seedRef.current = (Date.now() ^ Math.imul(restartToken + 1, 2654435761)) >>> 0 || 1;
    levelRef.current = 1;
    worldRef.current = null;
    pointerDownRef.current = false;
  }, [restartToken, difficulty]);

  const { canvasRef } = useCanvasGame({
    active: !paused,
    step: (ctx, dt, cw, ch) => {
      let w = worldRef.current;
      if (!w) {
        w = createWorld({
          level: levelRef.current,
          difficulty,
          seed: seedRef.current,
          cw,
          ch,
          inset: controlsInset,
        });
        worldRef.current = w;
      } else {
        relayout(w, cw, ch, controlsInset);
      }

      // Launch on finger-lift (so the ball can be aimed by dragging first) or on
      // space / up. SERVE_ARM keeps the first frame after a question from firing.
      const down = input.pointerX !== null;
      const lifted = pointerDownRef.current && !down;
      pointerDownRef.current = down;
      const keyLaunch = input.consumeJump() || input.held.up;

      const ev = stepWorld(w, dt, {
        pointerX: input.pointerX,
        left: input.held.left,
        right: input.held.right,
        launch: lifted || keyLaunch,
      });

      if (ev.score > 0) api.addScore(ev.score);
      if (ev.caught) api.setStatus(POWER_LABEL[ev.caught]);

      if (ev.cleared) {
        const label = `Wall ${w.level} cleared`;
        api.addScore(100);
        levelRef.current = w.level + 1;
        // Build the next wall now; it takes over on the frame after the question.
        worldRef.current = createWorld({
          level: levelRef.current,
          difficulty,
          seed: seedRef.current,
          cw,
          ch,
          inset: controlsInset,
        });
        api.requestGate(label);
      } else if (ev.lost) {
        api.died('You lost the ball');
      }

      draw(ctx, w, spritesRef.current, cw, ch);
    },
  });

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />;
}

// --- rendering ------------------------------------------------------------

const BACKGROUNDS = [
  'background_color_hills',
  'background_color_trees',
  'background_color_mushrooms',
  'background_color_desert',
];

const BRICK_SPRITE: Record<BrickTint, string> = {
  blue: 'block_blue',
  green: 'block_green',
  red: 'block_red',
  yellow: 'block_yellow',
  planks: 'block_planks',
  strong: 'block_strong_coin',
};
const STRONG_CRACKED = 'block_strong_empty';

const BRICK_COLOR: Record<BrickTint, string> = {
  blue: '#4ea8ff',
  green: '#5fd07a',
  red: '#ff6b6b',
  yellow: '#ffd75e',
  planks: '#c98f4a',
  strong: '#b9bec9',
};

const POWER_COLOR: Record<PowerKind, string> = {
  wide: '#ffd75e',
  slow: '#7ec8ff',
  multi: '#ff8f5d',
};
const POWER_GLYPH: Record<PowerKind, string> = { wide: 'W', slow: 'S', multi: '+' };

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
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
  w: World,
  sp: SpriteSet | null,
  cw: number,
  ch: number,
): void {
  const g = w.geom;
  ctx.fillStyle = '#0a0a16';
  ctx.fillRect(0, 0, cw, ch);

  ctx.save();
  ctx.scale(g.scale, g.scale);

  // --- backdrop ---
  if (sp) {
    drawFrame(
      ctx,
      sp.backgrounds,
      BACKGROUNDS[(w.level - 1) % BACKGROUNDS.length],
      0,
      0,
      FIELD_W,
      g.h,
    );
    // Knocked back so the bricks and ball read clearly on top of the art.
    ctx.fillStyle = 'rgba(9,7,26,0.5)';
    ctx.fillRect(0, 0, FIELD_W, g.h);
  } else {
    const bg = ctx.createLinearGradient(0, 0, 0, g.h);
    bg.addColorStop(0, '#1d1b3a');
    bg.addColorStop(1, '#0d0c1c');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, FIELD_W, g.h);
  }

  // --- side rails, so the bounce surfaces are visible ---
  const railHue = ['#69d8ff', '#ff79bb', '#ffd75e', '#7ee29a'][(w.level - 1) % 4];
  ctx.fillStyle = railHue;
  ctx.shadowColor = railHue;
  ctx.shadowBlur = 6;
  ctx.globalAlpha = 0.45;
  ctx.fillRect(0, 0, 1.4, g.h);
  ctx.fillRect(FIELD_W - 1.4, 0, 1.4, g.h);
  ctx.fillRect(0, 0, FIELD_W, 1.4);
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;

  // --- bricks ---
  for (const brick of w.wall.bricks) {
    if (brick.hp <= 0) continue;
    const r = brickRect(g, brick);
    ctx.save();
    ctx.shadowColor = BRICK_COLOR[brick.tint];
    ctx.shadowBlur = brick.tint === 'strong' ? 3 : 5;
    if (sp) {
      const name =
        brick.tint === 'strong' && brick.hp < brick.maxHp
          ? STRONG_CRACKED
          : BRICK_SPRITE[brick.tint];
      drawFrame(ctx, sp.tiles, name, r.x, r.y, r.w, r.h);
    } else {
      ctx.fillStyle = BRICK_COLOR[brick.tint];
      roundRect(ctx, r.x, r.y, r.w, r.h, 1.6);
      ctx.fill();
    }
    ctx.restore();
    if (brick.tint === 'strong' && brick.hp > 1) {
      // Two-hitters get a rim so they are obvious at a glance.
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 0.7;
      roundRect(ctx, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, 1.4);
      ctx.stroke();
    }
  }

  // --- sparks ---
  for (const s of w.sparks) {
    ctx.globalAlpha = Math.max(0, Math.min(1, s.life * 3));
    ctx.fillStyle = BRICK_COLOR[s.tint];
    ctx.fillRect(s.x - 0.7, s.y - 0.7, 1.6, 1.6);
  }
  ctx.globalAlpha = 1;

  // --- drops ---
  for (const d of w.drops) {
    ctx.fillStyle = POWER_COLOR[d.kind];
    roundRect(ctx, d.x - 5, d.y - 3.2, 10, 6.4, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(20,16,8,0.9)';
    ctx.font = 'bold 5px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(POWER_GLYPH[d.kind], d.x, d.y + 0.2);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // --- paddle ---
  const half = w.paddle.w / 2;
  const pgrad = ctx.createLinearGradient(0, g.paddleY, 0, g.paddleY + g.paddleH);
  pgrad.addColorStop(0, '#fff0b8');
  pgrad.addColorStop(0.45, '#ffd75e');
  pgrad.addColorStop(1, '#c8901c');
  ctx.fillStyle = pgrad;
  roundRect(ctx, w.paddle.x - half, g.paddleY, w.paddle.w, g.paddleH, g.paddleH / 2);
  ctx.fill();
  // Centre notch: a visual cue that the middle sends the ball straight up.
  ctx.fillStyle = 'rgba(90,55,0,0.35)';
  ctx.fillRect(w.paddle.x - 0.5, g.paddleY + g.paddleH * 0.25, 1, g.paddleH * 0.5);

  // --- balls ---
  for (const b of w.balls) {
    const speed = Math.max(1, Math.hypot(b.vx, b.vy));
    const tx = (b.vx / speed) * 12;
    const ty = (b.vy / speed) * 12;
    const trail = ctx.createLinearGradient(b.x, b.y, b.x - tx, b.y - ty);
    trail.addColorStop(0, 'rgba(255,239,164,.65)');
    trail.addColorStop(1, 'rgba(255,239,164,0)');
    ctx.strokeStyle = trail;
    ctx.lineWidth = b.r * 1.15;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - tx, b.y - ty);
    ctx.stroke();
    const gr = ctx.createRadialGradient(
      b.x - b.r * 0.35,
      b.y - b.r * 0.35,
      b.r * 0.2,
      b.x,
      b.y,
      b.r,
    );
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(0.55, '#ffe9a8');
    gr.addColorStop(1, '#e0a52c');
    ctx.fillStyle = gr;
    ctx.shadowColor = '#ffe58c';
    ctx.shadowBlur = 7;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // --- serve prompt ---
  if (w.serving) {
    const b = w.balls[0];
    ctx.fillStyle = 'rgba(8,7,24,.68)';
    roundRect(ctx, FIELD_W / 2 - 68, g.paddleY - 25, 136, 14, 7);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.font = 'bold 7px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('DRAG TO AIM · LIFT TO LAUNCH', FIELD_W / 2, g.paddleY - 16);
    if (b) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 0.8;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(b.x, b.y - b.r);
      ctx.lineTo(b.x, b.y - b.r - 10);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.textAlign = 'left';
  }

  // --- HUD ---
  ctx.fillStyle = 'rgba(8,7,24,.58)';
  roundRect(ctx, 3, 3, FIELD_W - 6, 13, 6);
  ctx.fill();
  ctx.font = '900 8px ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillText(`WALL ${w.level}`, 8, 12);
  ctx.textAlign = 'right';
  ctx.fillText(`${bricksLeft(w)} LEFT`, FIELD_W - 8, 12);
  ctx.textAlign = 'left';

  if (w.combo > 1) {
    ctx.fillStyle = '#ffd75e';
    ctx.textAlign = 'center';
    ctx.fillText(`×${w.combo} COMBO`, FIELD_W / 2, 12);
    ctx.textAlign = 'left';
  }

  const chips: string[] = [];
  if (w.wideT > 0) chips.push(`wide ${Math.ceil(w.wideT)}s`);
  if (w.slowT > 0) chips.push(`slow ${Math.ceil(w.slowT)}s`);
  if (chips.length > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = 'bold 6px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(chips.join('  '), 4, g.h - 4);
  }

  ctx.restore();
}
