'use client';

import { useEffect, useRef } from 'react';
import type { Difficulty } from '@/lib/difficulty';
import type { GameApi, GameCanvasProps } from '@/lib/games';
import { playSound, unlockAudio } from '@/lib/sound';
import { useCanvasGame } from '@/lib/useCanvasGame';

/**
 * Tap Attack - a whack-a-mole reflex tapper. Friendly critters pop up out of a
 * 3x3 field of holes for a short window; tap one before it ducks back down to
 * score. A "grumpy" critter (a little cartoon bomb) shows up sometimes too -
 * tapping it costs a life instead of points.
 *
 * Everything above the component is pure: no canvas, no React, no Math.random.
 * `hitTest`, `schedulerStep`, `outcomeFor`, `scoreDeltaFor` and `livesDeltaFor`
 * are the real functions the game runs, and scripts/check-tapattack.ts drives
 * them headlessly. The failures that quietly ruin this genre are invisible
 * from the renderer, so each is proven rather than hoped for:
 *
 *  1. A tap that credits a hole that is not actually showing a critter right
 *     now. `hitTest` reports which hole a point lands on AND whether that hole
 *     currently holds an up critter (and which kind) as two separate facts, so
 *     a caller can never confuse "tapped the right square" with "tapped a live
 *     target".
 *  2. A scheduler that lets a critter overstay its own window, or shows more
 *     critters at once than the difficulty allows, or ever puts two critters in
 *     one hole. `schedulerStep` retracts every expired hole before it ever
 *     spawns a new one, and only spawns into a hole it just confirmed is empty.
 *  3. A scoring curve that rewards the wrong thing. `scoreDeltaFor` only ever
 *     pays out on a good hit, `livesDeltaFor` only ever costs a life on a bad
 *     hit, and neither can be talked into doing the other's job.
 *
 * Critters are simple hand-drawn shapes - a round blob body, big friendly eyes,
 * little ear bumps, a smile - drawn procedurally with no borrowed art. The
 * "don't tap" critter is a cartoon bomb: a dark round body, a lit fuse, and a
 * cross frown. No trademarked characters anywhere.
 */

// --- rng ---------------------------------------------------------------------

/** Seeded LCG. Generation must never touch Math.random or nothing is provable. */
export function lcg(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// --- holes ---------------------------------------------------------------------

export const COLS = 3;
export const ROWS = 3;
export const HOLE_COUNT = COLS * ROWS;

export type HoleKind = 'good' | 'bad';

/**
 * One hole's state. `kind` is null when the hole is empty; whenever it holds a
 * critter that critter is, by construction, currently up - `schedulerStep`
 * retracts (sets `kind` back to null) the instant `t` reaches `upDur`, in the
 * very same step that would otherwise let it overstay. There is no separate
 * "up but expired" state to get out of sync.
 */
export type Hole = {
  kind: HoleKind | null;
  /** Seconds since this critter appeared. Meaningless while `kind` is null. */
  t: number;
  /** Seconds this critter is allowed to stay up before it auto-retracts. */
  upDur: number;
};

export function makeHoles(): Hole[] {
  return Array.from({ length: HOLE_COUNT }, () => ({ kind: null, t: 0, upDur: 0 }));
}

/** True while a hole currently holds a critter that has not yet retracted. */
export function isUp(h: Hole): boolean {
  return h.kind !== null;
}

/** Empties one hole immediately - what a tap on an up critter does. */
export function retractHole(holes: Hole[], idx: number): Hole[] {
  const next = holes.map((h) => ({ ...h }));
  next[idx] = { kind: null, t: 0, upDur: 0 };
  return next;
}

// --- spawn scheduler ----------------------------------------------------------

export type SpawnParams = {
  /** Probability an empty hole spawns a critter, per second. */
  popRate: number;
  /** Seconds a spawned critter stays up before auto-retracting. */
  upDuration: number;
  /** Most critters allowed up at the same time. */
  maxUp: number;
  /** Probability a spawn is the "don't tap" critter rather than a friendly one. */
  badChance: number;
};

/** Score it takes to climb one ramp level. Ramp levels drive speed-up over time. */
export const RAMP_STEP = 40;
export const RAMP_MAX = 20;

/** How fast (and how crowded and how mean) the board gets as the score climbs. */
export function rampLevelForScore(score: number): number {
  return Math.min(RAMP_MAX, Math.floor(Math.max(0, score) / RAMP_STEP));
}

const DIFF_SPEED: Record<Difficulty, number> = { easy: 0.7, normal: 1, hard: 1.35 };

/**
 * The whole difficulty curve in one place. `popRate` and `maxUp` climb with
 * both the ramp level and the chosen difficulty; `upDuration` (how long a kid
 * has to react) shrinks the same way. `badChance` - how often a grumpy critter
 * shows up instead of a friendly one - climbs too, but is capped well under
 * half so a young player is never facing more bad holes than good ones.
 */
export function paramsFor(rampLevel: number, difficulty: Difficulty): SpawnParams {
  const speed = DIFF_SPEED[difficulty];
  const ramp = Math.min(1, Math.max(0, rampLevel) / RAMP_MAX);
  const popRate = (0.3 + ramp * 0.85) * speed;
  const upDuration = Math.max(0.5, 1.7 - ramp * 0.9 - (speed - 1) * 0.35);
  const maxUp = Math.min(4, 1 + Math.floor(ramp * 2.5) + (difficulty === 'hard' ? 1 : 0));
  const badChance = Math.min(0.42, 0.1 + ramp * 0.28);
  return { popRate, upDuration, maxUp, badChance };
}

/**
 * Advances every hole by `dt` seconds and rolls new spawns, given nothing but
 * the current holes, a seeded rng and the difficulty parameters for right now.
 * No React, no clock, no hidden state - the same call the checker drives.
 *
 * Order matters and is the whole safety story: every hole that has run out its
 * window is retracted FIRST, so the up-count used to cap new spawns already
 * reflects reality, and a spawn only ever lands in a hole this same step just
 * confirmed is empty.
 */
export function schedulerStep(
  holes: Hole[],
  rng: () => number,
  dt: number,
  params: SpawnParams,
): Hole[] {
  const next = holes.map((h) => ({ ...h }));

  for (let i = 0; i < next.length; i += 1) {
    const h = next[i];
    if (h.kind === null) continue;
    h.t += dt;
    if (h.t >= h.upDur) next[i] = { kind: null, t: 0, upDur: 0 };
  }

  let upCount = 0;
  for (const h of next) if (h.kind !== null) upCount += 1;

  for (let i = 0; i < next.length; i += 1) {
    if (upCount >= params.maxUp) break;
    if (next[i].kind !== null) continue;
    if (rng() >= params.popRate * dt) continue;
    const kind: HoleKind = rng() < params.badChance ? 'bad' : 'good';
    next[i] = { kind, t: 0, upDur: params.upDuration };
    upCount += 1;
  }

  return next;
}

// --- hit test ------------------------------------------------------------------

export type TapResult = {
  /** Which hole the point geometrically falls on, or null when it misses the whole board. */
  index: number | null;
  /** Whether that hole currently holds an up critter. */
  wasUp: boolean;
  /** The kind of critter that was up, or null if none was. */
  kind: HoleKind | null;
};

/**
 * Given a tap point (in board units) and the current hole states, reports
 * which hole was hit and, separately, whether that hole actually had a live
 * critter up at the moment of the tap. Keeping those two facts apart is the
 * point: a caller must never be able to mistake "tapped the right square" for
 * "tapped something that was actually there".
 */
export function hitTest(bx: number, by: number, holes: Hole[]): TapResult {
  const idx = holeIndexAt(bx, by);
  if (idx === null) return { index: null, wasUp: false, kind: null };
  const h = holes[idx];
  const up = isUp(h);
  return { index: idx, wasUp: up, kind: up ? h.kind : null };
}

// --- scoring -------------------------------------------------------------------

export const GOOD_POINTS = 10;
export const BAD_PENALTY = 6;
export const START_LIVES = 3;

export type TapOutcome = 'good' | 'bad' | 'miss';

/** What a tap amounted to, from the same TapResult hitTest just produced. */
export function outcomeFor(result: TapResult): TapOutcome | null {
  if (result.index === null) return null;
  if (!result.wasUp) return 'miss';
  return result.kind === 'bad' ? 'bad' : 'good';
}

/** Points to award. Only ever positive for a good hit, only ever negative for a bad one. */
export function scoreDeltaFor(outcome: TapOutcome): number {
  if (outcome === 'good') return GOOD_POINTS;
  if (outcome === 'bad') return -BAD_PENALTY;
  return 0;
}

/** Lives lost. Only ever a bad hit costs one. */
export function livesDeltaFor(outcome: TapOutcome): number {
  return outcome === 'bad' ? -1 : 0;
}

// --- layout ----------------------------------------------------------------

const CELL = 96;
const PAD = 16;
const HUD_H = 44;

export const BOARD_W = COLS * CELL + PAD * 2;
export const BOARD_H = HUD_H + ROWS * CELL + PAD * 2;

export type Layout = { scale: number; ox: number; oy: number };

export function layoutFor(cw: number, ch: number, inset: number): Layout {
  const usableH = Math.max(1, ch - inset);
  const scale = Math.min(cw / BOARD_W, usableH / BOARD_H);
  return { scale, ox: (cw - BOARD_W * scale) / 2, oy: (usableH - BOARD_H * scale) / 2 };
}

/** Normalised pointer (0..1 of the canvas) to board units - the inverse of the draw transform. */
export function toBoard(layout: Layout, cw: number, ch: number, px: number, py: number): { x: number; y: number } {
  return { x: (px * cw - layout.ox) / layout.scale, y: (py * ch - layout.oy) / layout.scale };
}

/** Centre of a hole, in board units. */
export function holeCentre(idx: number): { x: number; y: number } {
  const col = idx % COLS;
  const row = Math.floor(idx / COLS);
  return { x: PAD + (col + 0.5) * CELL, y: HUD_H + PAD + (row + 0.5) * CELL };
}

/** Which hole a board-space point falls on, or null when it is off the grid or in the HUD band. */
export function holeIndexAt(bx: number, by: number): number | null {
  const col = Math.floor((bx - PAD) / CELL);
  const row = Math.floor((by - HUD_H - PAD) / CELL);
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
  return row * COLS + col;
}

// --- visual state ------------------------------------------------------------
//
// Everything below is presentation only: timers, animation and drawing. The
// decisions themselves (which hole was hit, was it a live critter, what does a
// tap score) always go through the pure functions above.

type HoleView = {
  /** 0 fully underground .. 1 fully risen. Eases toward `target` every frame. */
  rise: number;
  target: number;
  /** Seconds remaining of a bad-hit shake. */
  shakeT: number;
  /** Scale bounce played once on a good hit. Settles back to 1. */
  popScale: number;
};

type Pop = { x: number; y: number; text: string; t: number; life: number; color: string };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string };

type State = {
  difficulty: Difficulty;
  holes: Hole[];
  views: HoleView[];
  rng: () => number;
  fxRng: () => number;
  /** The game's own running total, same reason as every other game here: the
   *  shell's score also carries question rewards. */
  score: number;
  lives: number;
  time: number;
  pops: Pop[];
  particles: Particle[];
  shake: number;
  /** Seconds of grace after a life-loss reset before the board starts spawning again. */
  deadFor: number;
  /** Canvas size the frozen frame was painted at, so a resize repaints it. */
  dimAt: { w: number; h: number } | null;
};

const RISE_SPEED = 11;
const SHAKE_DUR = 0.3;
const POP_SCALE_PEAK = 1.4;
const POP_DECAY = 3.2;
const MAX_PARTICLES = 160;

const CRITTER_COLORS = ['#ffb84e', '#5ec8ff', '#ff8fbf', '#8be07a', '#c77dff', '#ffd75e'];

function freshViews(): HoleView[] {
  return Array.from({ length: HOLE_COUNT }, () => ({ rise: 0, target: 0, shakeT: 0, popScale: 1 }));
}

function freshState(difficulty: Difficulty, seed: number): State {
  return {
    difficulty,
    holes: makeHoles(),
    views: freshViews(),
    rng: lcg(seed),
    fxRng: lcg((seed ^ 0x9e3779b9) >>> 0),
    score: 0,
    lives: START_LIVES,
    time: 0,
    pops: [],
    particles: [],
    shake: 0,
    deadFor: 0,
    dimAt: null,
  };
}

function spawnBurst(s: State, cx: number, cy: number, color: string): void {
  for (let i = 0; i < 12; i += 1) {
    if (s.particles.length >= MAX_PARTICLES) break;
    const a = (i / 12) * Math.PI * 2 + s.fxRng() * 0.4;
    const speed = 55 + s.fxRng() * 80;
    s.particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed - 30,
      life: 0.5 + s.fxRng() * 0.25,
      max: 0.5 + s.fxRng() * 0.25,
      color,
    });
  }
}

function advanceEffects(s: State, dt: number): void {
  for (const p of s.pops) p.t += dt;
  s.pops = s.pops.filter((p) => p.t < p.life);
  for (const pt of s.particles) {
    pt.life -= dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vy += 200 * dt;
  }
  s.particles = s.particles.filter((pt) => pt.life > 0);
  if (s.shake > 0) s.shake = Math.max(0, s.shake - dt * 6);
}

function resetBoard(s: State): void {
  s.holes = makeHoles();
  s.views = freshViews();
  s.deadFor = 0.6;
}

// --- component -------------------------------------------------------------

export default function TapAttack({
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

  // iOS will not start an AudioContext outside a real gesture - a call from
  // inside the animation frame is too late. Listening on window catches the
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
    active: true,
    step: (ctx, dt, cw, ch) => {
      let s = stateRef.current;
      if (!s || s.difficulty !== difficulty) {
        s = freshState(difficulty, seedRef.current);
        stateRef.current = s;
      }
      const layout = layoutFor(cw, ch, controlsInset);

      if (paused) {
        // Painted once and then left alone, rather than burning a frame a
        // second behind a question. No critter timer, spawn or life advances
        // while paused - the scheduler simply is not called below.
        if (!s.dimAt || s.dimAt.w !== cw || s.dimAt.h !== ch) {
          s.dimAt = { w: cw, h: ch };
          draw(ctx, s, layout, cw, ch, true);
        }
        return;
      }
      s.dimAt = null;

      s.time += dt;
      if (s.deadFor > 0) s.deadFor -= dt;
      advanceEffects(s, dt);

      for (let i = 0; i < s.views.length; i += 1) {
        const v = s.views[i];
        v.target = s.holes[i].kind !== null ? 1 : 0;
        v.rise += (v.target - v.rise) * Math.min(1, dt * RISE_SPEED);
        if (v.shakeT > 0) v.shakeT = Math.max(0, v.shakeT - dt);
        if (v.popScale > 1) v.popScale = Math.max(1, v.popScale - dt * POP_DECAY);
      }

      // --- input ---
      const pressed = input.consumePointerPress();
      if (pressed && input.pointerX !== null && input.pointerY !== null) {
        const b = toBoard(layout, cw, ch, input.pointerX, input.pointerY);
        const result = hitTest(b.x, b.y, s.holes);
        const outcome = outcomeFor(result);
        if (outcome !== null && result.index !== null) {
          handleTap(s, api, result.index, outcome);
        }
      }

      // --- lives ---
      if (s.lives <= 0 && s.deadFor <= 0) {
        playSound('gameOver');
        api.died('Out of lives');
        // The shell does not reset anything on its own, and a free pass means
        // play resumes immediately, so reset lives and the board here.
        s.lives = START_LIVES;
        resetBoard(s);
      }

      // --- scheduler ---
      // Paused already returned above; the grace beat after a reset is the only
      // other time the board is deliberately left alone.
      if (s.deadFor <= 0) {
        const params = paramsFor(rampLevelForScore(s.score), difficulty);
        s.holes = schedulerStep(s.holes, s.rng, dt, params);
      }

      draw(ctx, s, layout, cw, ch, false);
    },
  });

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />;
}

function handleTap(s: State, api: GameApi, idx: number, outcome: TapOutcome): void {
  if (outcome !== 'miss') s.holes = retractHole(s.holes, idx);

  const scoreDelta = scoreDeltaFor(outcome);
  const livesDelta = livesDeltaFor(outcome);
  if (scoreDelta !== 0) {
    s.score += scoreDelta;
    api.addScore(scoreDelta);
  }
  if (livesDelta !== 0) s.lives += livesDelta;

  const c = holeCentre(idx);
  if (outcome === 'good') {
    playSound('coin');
    s.views[idx].popScale = POP_SCALE_PEAK;
    spawnBurst(s, c.x, c.y, CRITTER_COLORS[idx % CRITTER_COLORS.length]);
    s.pops.push({ x: c.x, y: c.y, text: `+${scoreDelta}`, t: 0, life: 0.6, color: '#ffffff' });
  } else if (outcome === 'bad') {
    playSound('wrong');
    s.views[idx].shakeT = SHAKE_DUR;
    s.shake = Math.max(s.shake, 1.1);
    spawnBurst(s, c.x, c.y, '#e05252');
    s.pops.push({ x: c.x, y: c.y, text: `${scoreDelta}`, t: 0, life: 0.6, color: '#ffc2c2' });
  } else {
    playSound('click');
  }
}

// --- Critter Carnival drawing -------------------------------------------------

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

/** A bright, smiling carnival critter. A clear open smile identifies a safe tap. */
function drawGoodCritter(ctx: CanvasRenderingContext2D, size: number, color: string): void {
  const r = size / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(51, 32, 20, 0.3)';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = color;
  ellipse(ctx, -r * 0.64, -r * 0.66, r * 0.24, r * 0.25);
  ellipse(ctx, r * 0.64, -r * 0.66, r * 0.24, r * 0.25);
  const body = ctx.createRadialGradient(-r * 0.3, -r * 0.45, r * 0.1, 0, 0, r * 1.1);
  body.addColorStop(0, '#fff7c7');
  body.addColorStop(0.16, color);
  body.addColorStop(1, '#66422d');
  ctx.fillStyle = body;
  ellipse(ctx, 0, r * 0.04, r * 0.92, r * 0.86);
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = 'rgba(255,255,255,0.31)';
  ellipse(ctx, -r * 0.21, r * 0.3, r * 0.47, r * 0.31);
  for (const sign of [-1, 1]) {
    ctx.fillStyle = '#fffdf1';
    ellipse(ctx, sign * r * 0.34, -r * 0.09, r * 0.24, r * 0.28);
    ctx.fillStyle = '#244050';
    ellipse(ctx, sign * r * 0.34, -r * 0.03, r * 0.12, r * 0.15);
    ctx.fillStyle = '#fff';
    ellipse(ctx, sign * r * 0.29, -r * 0.09, r * 0.045, r * 0.055);
  }
  ctx.fillStyle = 'rgba(255,116,126,0.42)';
  ellipse(ctx, -r * 0.57, r * 0.27, r * 0.13, r * 0.08);
  ellipse(ctx, r * 0.57, r * 0.27, r * 0.13, r * 0.08);
  ctx.strokeStyle = '#573521';
  ctx.lineWidth = Math.max(1.3, r * 0.075);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, r * 0.19, r * 0.3, 0.13 * Math.PI, 0.87 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

/** A charcoal grump with red brows, frown, and warning pennant: never tap it. */
function drawBadCritter(ctx: CanvasRenderingContext2D, size: number): void {
  const r = size / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(35, 8, 14, 0.55)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 3;
  const body = ctx.createRadialGradient(-r * 0.3, -r * 0.38, r * 0.1, 0, 0, r);
  body.addColorStop(0, '#687281');
  body.addColorStop(0.45, '#313b4a');
  body.addColorStop(1, '#121d2b');
  ctx.fillStyle = body;
  ellipse(ctx, 0, r * 0.08, r * 0.9, r * 0.87);
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#f36c5e';
  ctx.lineWidth = Math.max(1.8, r * 0.1);
  ctx.lineCap = 'round';
  for (const sign of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(sign * r * 0.13, -r * 0.16);
    ctx.lineTo(sign * r * 0.5, -r * 0.31);
    ctx.stroke();
    ctx.fillStyle = '#fff3df';
    ellipse(ctx, sign * r * 0.32, r * 0.02, r * 0.15, r * 0.17);
    ctx.fillStyle = '#ef514e';
    ellipse(ctx, sign * r * 0.32, r * 0.02, r * 0.067, r * 0.082);
  }
  ctx.strokeStyle = '#ff9a87';
  ctx.lineWidth = Math.max(1.4, r * 0.08);
  ctx.beginPath();
  ctx.arc(0, r * 0.57, r * 0.28, 1.16 * Math.PI, 1.84 * Math.PI);
  ctx.stroke();
  // Tiny warning horn makes its silhouette visibly different from friendlies.
  ctx.fillStyle = '#f4c557';
  ctx.beginPath();
  ctx.moveTo(-r * 0.13, -r * 0.84);
  ctx.lineTo(r * 0.04, -r * 1.2);
  ctx.lineTo(r * 0.21, -r * 0.84);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawHole(ctx: CanvasRenderingContext2D, s: State, idx: number, cx: number, cy: number): void {
  const h = s.holes[idx];
  const v = s.views[idx];
  const rx = CELL * 0.355;
  const ry = CELL * 0.18;
  ctx.save();
  ctx.shadowColor = 'rgba(45, 25, 13, 0.34)';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 4;
  const mound = ctx.createLinearGradient(cx, cy - 24, cx, cy + 25);
  mound.addColorStop(0, '#e5a95f');
  mound.addColorStop(0.5, '#b7733c');
  mound.addColorStop(1, '#764125');
  ctx.fillStyle = mound;
  ellipse(ctx, cx, cy + 1, rx * 1.3, ry * 1.72);
  ctx.restore();
  ctx.fillStyle = 'rgba(255,226,154,0.24)';
  ellipse(ctx, cx - rx * 0.2, cy - ry * 0.65, rx * 0.78, ry * 0.34);

  if (h.kind !== null || v.rise > 0.01) {
    const critterSize = CELL * 0.64;
    const shakeX = v.shakeT > 0 ? Math.sin(v.shakeT * 70) * critterSize * 0.055 : 0;
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - critterSize, cy - critterSize * 2, critterSize * 2, critterSize * 2 + ry * 0.28);
    ctx.clip();
    ctx.translate(cx + shakeX, cy - v.rise * critterSize * 0.96);
    ctx.scale(v.popScale, v.popScale);
    if ((h.kind ?? 'good') === 'bad') drawBadCritter(ctx, critterSize);
    else drawGoodCritter(ctx, critterSize, CRITTER_COLORS[idx % CRITTER_COLORS.length]);
    ctx.restore();
  }

  const hole = ctx.createRadialGradient(cx - rx * 0.22, cy - ry * 0.33, 2, cx, cy, rx);
  hole.addColorStop(0, '#6a3b27');
  hole.addColorStop(0.55, '#3b211b');
  hole.addColorStop(1, '#1c1420');
  ctx.fillStyle = hole;
  ellipse(ctx, cx, cy, rx, ry);
  ctx.strokeStyle = 'rgba(67, 34, 20, 0.9)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, filled: boolean): void {
  ctx.fillStyle = filled ? '#ff6579' : 'rgba(255,238,204,0.24)';
  ctx.beginPath();
  const r = size * 0.28;
  ctx.arc(x - r, y - r * 0.4, r, Math.PI, 0);
  ctx.arc(x + r, y - r * 0.4, r, Math.PI, 0);
  ctx.lineTo(x, y + r * 1.3);
  ctx.closePath();
  ctx.fill();
  if (filled) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ellipse(ctx, x - r * 0.45, y - r * 0.56, r * 0.25, r * 0.16);
  }
}

function drawPennants(ctx: CanvasRenderingContext2D): void {
  const colors = ['#f16d5c', '#ffd15a', '#55bdae', '#8e73d7', '#f58bb1'];
  ctx.strokeStyle = 'rgba(95, 58, 42, 0.7)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(7, 9);
  ctx.quadraticCurveTo(BOARD_W / 2, 20, BOARD_W - 7, 9);
  ctx.stroke();
  for (let i = 0; i < 7; i += 1) {
    const x = 16 + i * 45;
    const y = 11 + Math.sin((i / 6) * Math.PI) * 7;
    ctx.fillStyle = colors[i % colors.length];
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 18, y + 2);
    ctx.lineTo(x + 9, y + 20);
    ctx.closePath();
    ctx.fill();
  }
}

function draw(ctx: CanvasRenderingContext2D, s: State, layout: Layout, cw: number, ch: number, dimmed: boolean): void {
  ctx.save();
  ctx.clearRect(0, 0, cw, ch);
  const sky = ctx.createLinearGradient(0, 0, 0, ch);
  sky.addColorStop(0, '#563c73');
  sky.addColorStop(0.47, '#d07b69');
  sky.addColorStop(1, '#f3c36f');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, cw, ch);
  const lantern = ctx.createRadialGradient(cw * 0.5, ch * 0.22, 5, cw * 0.5, ch * 0.22, Math.max(cw, ch) * 0.56);
  lantern.addColorStop(0, 'rgba(255, 244, 182, 0.42)');
  lantern.addColorStop(1, 'rgba(255, 244, 182, 0)');
  ctx.fillStyle = lantern;
  ctx.fillRect(0, 0, cw, ch);

  const shakeOx = s.shake > 0 ? (s.fxRng() - 0.5) * s.shake * 4 : 0;
  ctx.translate(layout.ox + shakeOx, layout.oy);
  ctx.scale(layout.scale, layout.scale);
  ctx.save();
  ctx.shadowColor = 'rgba(45, 20, 20, 0.35)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = '#704431';
  rounded(ctx, 2, 3, BOARD_W - 4, BOARD_H - 6, 18);
  ctx.restore();
  const turf = ctx.createLinearGradient(0, HUD_H, BOARD_W, BOARD_H);
  turf.addColorStop(0, '#7ebd65');
  turf.addColorStop(1, '#417d50');
  ctx.fillStyle = turf;
  rounded(ctx, 7, 7, BOARD_W - 14, BOARD_H - 14, 14);
  drawPennants(ctx);

  // Carnival ticket header remains legible without duplicating the shell score.
  ctx.fillStyle = 'rgba(54, 39, 55, 0.88)';
  rounded(ctx, 12, 21, BOARD_W - 24, 31, 11);
  ctx.fillStyle = '#fff4cd';
  ctx.font = `800 ${HUD_H * 0.34}px ui-rounded, system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(`CARNIVAL ${s.score}`, PAD + 6, HUD_H / 2 + 17);
  const heartSize = HUD_H * 0.5;
  for (let i = 0; i < START_LIVES; i += 1) {
    drawHeart(ctx, BOARD_W - PAD - heartSize * 0.75 - i * heartSize * 0.85, HUD_H / 2 + 17, heartSize, i < s.lives);
  }

  for (let i = 0; i < HOLE_COUNT; i += 1) {
    const c = holeCentre(i);
    drawHole(ctx, s, i, c.x, c.y);
  }

  // Confetti and starbursts keep hit feedback lively while remaining bounded by MAX_PARTICLES.
  for (const p of s.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate((1 - p.life / p.max) * 5);
    ctx.fillStyle = p.color;
    ctx.fillRect(-2.5, -2.5, 5, 5);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  for (const p of s.pops) {
    const t = p.t / p.life;
    ctx.globalAlpha = Math.max(0, 1 - t);
    ctx.fillStyle = p.color;
    ctx.font = `900 ${HUD_H * 0.42}px ui-rounded, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(p.text, p.x, p.y - t * 20 - CELL * 0.3);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  if (dimmed) {
    ctx.fillStyle = 'rgba(20, 12, 35, 0.5)';
    ctx.fillRect(0, 0, cw, ch);
  }
}
