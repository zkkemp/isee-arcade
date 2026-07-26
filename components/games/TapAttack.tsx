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

// --- drawing -----------------------------------------------------------------

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

const BG_TOP = '#bfe89a';
const BG_BOTTOM = '#7fc25c';
const MOUND_COLOR = '#a9723f';
const MOUND_SHADE = '#8a5a30';
const HOLE_COLOR = '#3a2415';

/** A friendly critter: round blob body, big eyes, ear bumps, a smile. */
function drawGoodCritter(ctx: CanvasRenderingContext2D, size: number, color: string): void {
  const r = size / 2;
  // Ears.
  ctx.fillStyle = color;
  ellipse(ctx, -r * 0.62, -r * 0.68, r * 0.24, r * 0.24);
  ellipse(ctx, r * 0.62, -r * 0.68, r * 0.24, r * 0.24);
  // Body.
  ellipse(ctx, 0, r * 0.06, r * 0.92, r * 0.86);
  // Belly.
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ellipse(ctx, 0, r * 0.32, r * 0.5, r * 0.36);
  // Eyes.
  for (const sgn of [-1, 1]) {
    ctx.fillStyle = '#ffffff';
    ellipse(ctx, sgn * r * 0.34, -r * 0.06, r * 0.24, r * 0.27);
    ctx.fillStyle = '#2a2f3a';
    ellipse(ctx, sgn * r * 0.34, r * 0.0, r * 0.13, r * 0.15);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ellipse(ctx, sgn * r * 0.34 - r * 0.05, -r * 0.05, r * 0.05, r * 0.05);
  }
  // Cheeks.
  ctx.fillStyle = 'rgba(255,130,130,0.4)';
  ellipse(ctx, -r * 0.56, r * 0.24, r * 0.14, r * 0.09);
  ellipse(ctx, r * 0.56, r * 0.24, r * 0.14, r * 0.09);
  // Smile.
  ctx.strokeStyle = '#5c3b1e';
  ctx.lineWidth = Math.max(1.2, r * 0.08);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, r * 0.24, r * 0.32, 0.18 * Math.PI, 0.82 * Math.PI);
  ctx.stroke();
}

/** The "don't tap" critter: a round dark bomb with a lit fuse and an angry frown. */
function drawBadCritter(ctx: CanvasRenderingContext2D, size: number): void {
  const r = size / 2;
  // Fuse.
  ctx.strokeStyle = '#c9a25a';
  ctx.lineWidth = Math.max(1.5, r * 0.09);
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.9);
  ctx.quadraticCurveTo(r * 0.25, -r * 1.15, r * 0.12, -r * 1.35);
  ctx.stroke();
  ctx.fillStyle = '#ffb340';
  ellipse(ctx, r * 0.12, -r * 1.38, r * 0.09, r * 0.09);
  // Body.
  ctx.fillStyle = '#2b2b33';
  ellipse(ctx, 0, r * 0.06, r * 0.9, r * 0.86);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ellipse(ctx, -r * 0.28, -r * 0.2, r * 0.32, r * 0.22);
  // Angry brows.
  ctx.strokeStyle = '#ff5d5d';
  ctx.lineWidth = Math.max(1.2, r * 0.08);
  ctx.lineCap = 'round';
  for (const sgn of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(sgn * r * 0.16, -r * 0.14);
    ctx.lineTo(sgn * r * 0.46, -r * 0.3);
    ctx.stroke();
  }
  // Eyes.
  for (const sgn of [-1, 1]) {
    ctx.fillStyle = '#ffffff';
    ellipse(ctx, sgn * r * 0.32, r * 0.02, r * 0.15, r * 0.16);
    ctx.fillStyle = '#c92b2b';
    ellipse(ctx, sgn * r * 0.32, r * 0.02, r * 0.07, r * 0.08);
  }
  // Frown.
  ctx.strokeStyle = '#ff8f8f';
  ctx.lineWidth = Math.max(1.2, r * 0.07);
  ctx.beginPath();
  ctx.arc(0, r * 0.52, r * 0.26, 1.15 * Math.PI, 1.85 * Math.PI);
  ctx.stroke();
}

function drawHole(ctx: CanvasRenderingContext2D, s: State, idx: number, cx: number, cy: number): void {
  const h = s.holes[idx];
  const v = s.views[idx];
  const mouthRx = CELL * 0.36;
  const mouthRy = CELL * 0.18;

  // Dirt mound behind the hole opening.
  ctx.fillStyle = MOUND_SHADE;
  ellipse(ctx, cx, cy + 4, mouthRx * 1.28, mouthRy * 1.5);
  ctx.fillStyle = MOUND_COLOR;
  ellipse(ctx, cx, cy, mouthRx * 1.22, mouthRy * 1.4);

  // Critter, clipped so it only shows above the hole's mouth line - the part
  // still "underground" is simply never drawn.
  if (h.kind !== null || v.rise > 0.01) {
    const critterSize = CELL * 0.62;
    const shakeX = v.shakeT > 0 ? Math.sin(v.shakeT * 70) * critterSize * 0.05 : 0;
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - critterSize, cy - critterSize * 2, critterSize * 2, critterSize * 2 + mouthRy * 0.35);
    ctx.clip();
    ctx.translate(cx + shakeX, cy - v.rise * critterSize * 0.95);
    ctx.scale(v.popScale, v.popScale);
    const kind = h.kind ?? 'good';
    if (kind === 'bad') drawBadCritter(ctx, critterSize);
    else drawGoodCritter(ctx, critterSize, CRITTER_COLORS[idx % CRITTER_COLORS.length]);
    ctx.restore();
  }

  // Hole opening, drawn last so it reads as in front of a critter still rising.
  ctx.fillStyle = HOLE_COLOR;
  ellipse(ctx, cx, cy, mouthRx, mouthRy);
}

function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, filled: boolean): void {
  ctx.fillStyle = filled ? '#ff5d7a' : 'rgba(255,255,255,0.28)';
  ctx.beginPath();
  const r = size * 0.28;
  ctx.arc(x - r, y - r * 0.4, r, Math.PI, 0);
  ctx.arc(x + r, y - r * 0.4, r, Math.PI, 0);
  ctx.lineTo(x, y + r * 1.3);
  ctx.closePath();
  ctx.fill();
}

function draw(ctx: CanvasRenderingContext2D, s: State, layout: Layout, cw: number, ch: number, dimmed: boolean): void {
  ctx.save();
  ctx.clearRect(0, 0, cw, ch);

  const shakeOx = s.shake > 0 ? (s.fxRng() - 0.5) * s.shake * 4 : 0;
  const bg = ctx.createLinearGradient(0, 0, 0, ch);
  bg.addColorStop(0, BG_TOP);
  bg.addColorStop(1, BG_BOTTOM);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, cw, ch);

  ctx.translate(layout.ox + shakeOx, layout.oy);
  ctx.scale(layout.scale, layout.scale);

  // HUD.
  ctx.fillStyle = 'rgba(20,30,15,0.85)';
  ctx.font = `700 ${HUD_H * 0.42}px ui-rounded, system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(`Score ${s.score}`, PAD, HUD_H / 2 + 2);

  const heartSize = HUD_H * 0.5;
  for (let i = 0; i < START_LIVES; i += 1) {
    drawHeart(
      ctx,
      BOARD_W - PAD - heartSize * 0.75 - i * heartSize * 0.85,
      HUD_H / 2 + 1,
      heartSize,
      i < s.lives,
    );
  }

  // Holes and critters.
  for (let i = 0; i < HOLE_COUNT; i += 1) {
    const c = holeCentre(i);
    drawHole(ctx, s, i, c.x, c.y);
  }

  // Particles (hit bursts).
  for (const p of s.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Popup text (+points / -points).
  for (const p of s.pops) {
    const t = p.t / p.life;
    ctx.globalAlpha = Math.max(0, 1 - t);
    ctx.fillStyle = p.color;
    ctx.font = `800 ${HUD_H * 0.4}px ui-rounded, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(p.text, p.x, p.y - t * 20 - CELL * 0.3);
  }
  ctx.globalAlpha = 1;

  ctx.restore();

  if (dimmed) {
    ctx.fillStyle = 'rgba(10,6,20,0.45)';
    ctx.fillRect(0, 0, cw, ch);
  }
}
