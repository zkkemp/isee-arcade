'use client';

import { useEffect, useRef } from 'react';
import type { GameCanvasProps } from '@/lib/games';
import { RAMP_SCALE, SPEED_SCALE, type Difficulty } from '@/lib/difficulty';
import { playSound } from '@/lib/sound';
import { useCanvasGame } from '@/lib/useCanvasGame';

/**
 * Fruit Catch - the easiest game in the arcade, built for a four-year-old.
 *
 * Slide a basket left/right along the bottom. Fruit falls from the top; catch
 * it to score. Once in a while something to avoid (a rotten apple or a bug)
 * falls too - the whole point is that a MISSED good fruit costs nothing, so a
 * slow or wandering toddler never feels punished, but a CAUGHT bad item costs
 * a life. That asymmetry (forgiving on the thing you want them to do, gentle
 * on the one thing to avoid) is what keeps a four-year-old playing.
 *
 * Everything above the component is pure: no canvas, no React, no
 * Math.random. scripts/check-fruitcatch.ts drives catchTest, the spawn/fall
 * step, and the scoring rules headlessly, the same way check-breakout.ts
 * drives Breakout's physics.
 */

// --- constants --------------------------------------------------------------

/** Logical playfield width. Height comes from the canvas aspect each frame. */
export const FIELD_W = 200;

export const START_LIVES = 3;

const BASKET_BASE_W: Record<Difficulty, number> = { easy: 92, normal: 74, hard: 60 };
/** How fast the basket can chase the finger, so it never teleports across the field. */
const BASKET_FOLLOW = 900;
/** Keyboard left/right speed, logical units/second. */
const BASKET_KEY_SPEED = 150;

/** Starting fall speed, logical units/second, at the gentlest setting. */
const BASE_FALL_SPEED = 34;
/** Hard ceiling on fall speed - "gets slightly faster", never a blur. */
export const MAX_FALL_SPEED = 108;
/** Rotten fruit and bugs drop a little quicker than good fruit, so avoiding them takes notice. */
const BAD_SPEED_MULT = 1.18;

/** Chance a spawn is something to avoid, by difficulty. Kept low even on hard. */
const BAD_CHANCE: Record<Difficulty, number> = { easy: 0.14, normal: 0.19, hard: 0.24 };

/** Seconds between spawns, before the gentle ramp shrinks it. */
const SPAWN_INTERVAL_BASE = 1.35;
/** Nobody ever waits longer than this or shorter than this between fruit. */
const SPAWN_INTERVAL_MIN = 0.55;
const SPAWN_INTERVAL_MAX = 1.9;

const GOOD_R_MIN = 8;
const GOOD_R_MAX = 11;
const BAD_R = 8.5;

/** Points for a caught good fruit. Catching the bad thing scores nothing (it costs a life instead). */
export const GOOD_POINTS = 10;

const GOOD_VARIANTS = ['apple', 'orange', 'grape', 'melon'] as const;
export type GoodVariant = (typeof GOOD_VARIANTS)[number];
const BAD_VARIANTS = ['rotten', 'bug'] as const;
export type BadVariant = (typeof BAD_VARIANTS)[number];

// --- types -------------------------------------------------------------------

export type Item = {
  x: number;
  y: number;
  r: number;
  vy: number;
  good: boolean;
  variant: GoodVariant | BadVariant;
};

export type Basket = { x: number; w: number };

export type Geom = {
  /** Playfield height in logical units (width is always FIELD_W). */
  h: number;
  /** Logical units -> CSS pixels. */
  scale: number;
  /** Top of the basket's catch band. */
  basketY: number;
  basketH: number;
};

export type World = {
  difficulty: Difficulty;
  geom: Geom;
  basket: Basket;
  items: Item[];
  lives: number;
  goodCaught: number;
  badCaught: number;
  missedGood: number;
  spawnTimer: number;
  rng: number;
  time: number;
};

export type Ctrl = { pointerX: number | null; left: boolean; right: boolean };

export type Events = {
  score: number;
  caughtGood: boolean;
  caughtBad: boolean;
  missedGood: boolean;
  lostLife: boolean;
  outOfLives: boolean;
};

// --- small helpers ------------------------------------------------------------

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Seeded LCG. Spawning must never touch Math.random so a run is reproducible. */
export function lcg(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** In-world randomness (which fruit, where) drawn from the world's own state. */
function rand(w: World): number {
  w.rng = (Math.imul(w.rng, 1664525) + 1013904223) >>> 0;
  return w.rng / 4294967296;
}

// --- layout --------------------------------------------------------------------

/**
 * Derives the whole playfield from the canvas size. Called every frame, so a
 * rotate or a split-view resize simply re-lays everything out.
 */
export function makeGeom(cw: number, ch: number, controlsInset: number): Geom {
  const scale = cw / FIELD_W;
  const usable = Math.max(0, ch - controlsInset);
  const h = Math.max(FIELD_W * 0.9, usable / scale);
  const basketH = clamp(h * 0.05, 7, 14);
  // Lift the basket well clear of the bottom edge and reserve a thick ground band
  // beneath it, so a thumb dragging along the bottom rests ON the ground below
  // the basket instead of covering it (the grass strip in draw() fills this band).
  const basketY = h - clamp(h * 0.2, 64, 150) - basketH;
  return { h, scale, basketY, basketH };
}

// --- difficulty ramp -------------------------------------------------------------

/**
 * Fall speed for the next spawn. Ramps gently with how much good fruit has
 * been caught so far (progress within a run), scaled by the difficulty knob.
 * Always clamped, so "gets slightly faster" never becomes "gets impossible."
 */
export function fallSpeedFor(goodCaught: number, d: Difficulty): number {
  const ramp = 1 + goodCaught * 0.028 * RAMP_SCALE[d];
  return Math.min(MAX_FALL_SPEED, BASE_FALL_SPEED * SPEED_SCALE[d] * ramp);
}

/** Seconds until the next spawn. Shrinks gently with progress, floored so it never becomes a hail storm. */
export function spawnIntervalFor(goodCaught: number, d: Difficulty): number {
  const shrink = 1 - goodCaught * 0.015 * RAMP_SCALE[d];
  const raw = (SPAWN_INTERVAL_BASE / SPEED_SCALE[d]) * Math.max(0.5, shrink);
  return clamp(raw, SPAWN_INTERVAL_MIN, SPAWN_INTERVAL_MAX);
}

export function basketWidthFor(d: Difficulty): number {
  return BASKET_BASE_W[d];
}

// --- the catch test ----------------------------------------------------------

/**
 * Does a falling item centred at (itemX, itemY) with radius itemR land in a
 * basket whose catch band spans [basketX - basketW/2, basketX + basketW/2]
 * horizontally and [basketTop, basketTop + basketH] vertically? A plain
 * circle-vs-rect overlap test, with a hair of epsilon so a item exactly
 * tangent to an edge (touching, not overlapping) reads as a miss rather than
 * a coin-flip on floating point.
 */
export function catchTest(
  itemX: number,
  itemY: number,
  itemR: number,
  basketX: number,
  basketW: number,
  basketTop: number,
  basketH: number,
): boolean {
  const eps = 1e-9;
  const halfW = basketW / 2;
  const withinX = itemX + itemR > basketX - halfW + eps && itemX - itemR < basketX + halfW - eps;
  const withinY = itemY + itemR > basketTop + eps && itemY - itemR < basketTop + basketH - eps;
  return withinX && withinY;
}

// --- scoring -------------------------------------------------------------------

/** Points for one catch. Good fruit scores; the bad thing never does - it costs a life instead. */
export function scoreForCatch(good: boolean): number {
  return good ? GOOD_POINTS : 0;
}

// --- spawn / fall step ---------------------------------------------------------

/**
 * One new item. Pure given the rng draw, the field width, the fall speed for
 * this moment, and how often bad things should appear - nothing here reads a
 * clock or a global.
 */
export function spawnItem(rng: () => number, fieldW: number, speed: number, badChance: number): Item {
  const bad = rng() < badChance;
  const r = bad ? BAD_R : GOOD_R_MIN + rng() * (GOOD_R_MAX - GOOD_R_MIN);
  const x = clamp(r + rng() * (fieldW - 2 * r), r, fieldW - r);
  const variant: GoodVariant | BadVariant = bad
    ? BAD_VARIANTS[Math.floor(rng() * BAD_VARIANTS.length) % BAD_VARIANTS.length]
    : GOOD_VARIANTS[Math.floor(rng() * GOOD_VARIANTS.length) % GOOD_VARIANTS.length];
  return { x, y: -r, r, vy: speed * (bad ? BAD_SPEED_MULT : 1), good: !bad, variant };
}

/** Advances every item straight down. Pure: no clock, no randomness, just dt. */
export function stepFall(items: Item[], dt: number): void {
  for (const it of items) it.y += it.vy * dt;
}

// --- world ---------------------------------------------------------------------

export function createWorld(opts: {
  difficulty: Difficulty;
  seed: number;
  cw: number;
  ch: number;
  inset?: number;
}): World {
  const { difficulty, seed, cw, ch } = opts;
  const geom = makeGeom(cw, ch, opts.inset ?? 0);
  return {
    difficulty,
    geom,
    basket: { x: FIELD_W / 2, w: basketWidthFor(difficulty) },
    items: [],
    lives: START_LIVES,
    goodCaught: 0,
    badCaught: 0,
    missedGood: 0,
    spawnTimer: 0.4,
    rng: (seed ^ 0x9e3779b9) >>> 0 || 1,
    time: 0,
  };
}

/**
 * Re-derives geometry after a resize or rotate. Only the height can change
 * (the width is always FIELD_W), so item y positions scale proportionally and
 * the basket is simply re-clamped into the new width.
 */
export function relayout(w: World, cw: number, ch: number, inset: number): void {
  const g = makeGeom(cw, ch, inset);
  const old = w.geom;
  w.geom = g;
  if (g.h === old.h) return;
  const ky = g.h / old.h;
  for (const it of w.items) it.y *= ky;
  const half = w.basket.w / 2;
  w.basket.x = clamp(w.basket.x, half, FIELD_W - half);
}

function moveBasket(w: World, dt: number, c: Ctrl): void {
  const half = w.basket.w / 2;
  if (c.pointerX !== null) {
    // Follow the finger, but at a finite rate so the basket cannot jump clean
    // across a falling fruit in a single frame.
    const target = clamp(c.pointerX * FIELD_W, half, FIELD_W - half);
    const d = target - w.basket.x;
    const max = BASKET_FOLLOW * dt;
    w.basket.x += Math.abs(d) <= max ? d : Math.sign(d) * max;
  } else {
    const dir = (c.right ? 1 : 0) - (c.left ? 1 : 0);
    w.basket.x += dir * BASKET_KEY_SPEED * dt;
  }
  w.basket.x = clamp(w.basket.x, half, FIELD_W - half);
}

/**
 * Advances the whole world one frame. This is the function both the game loop
 * and the checker call, so anything proven headlessly is proven about the
 * real game.
 */
export function stepWorld(w: World, dtRaw: number, c: Ctrl): Events {
  const ev: Events = {
    score: 0,
    caughtGood: false,
    caughtBad: false,
    missedGood: false,
    lostLife: false,
    outOfLives: false,
  };
  // The shell already clamps dt; repeated here because the checker calls directly.
  const dt = clamp(dtRaw, 0, 1 / 20);
  w.time += dt;

  moveBasket(w, dt, c);

  const speed = fallSpeedFor(w.goodCaught, w.difficulty);
  stepFall(w.items, dt);

  w.spawnTimer -= dt;
  if (w.spawnTimer <= 0) {
    w.spawnTimer += spawnIntervalFor(w.goodCaught, w.difficulty);
    w.items.push(spawnItem(() => rand(w), FIELD_W, speed, BAD_CHANCE[w.difficulty]));
  }

  const g = w.geom;
  for (let i = w.items.length - 1; i >= 0; i -= 1) {
    const it = w.items[i];
    if (catchTest(it.x, it.y, it.r, w.basket.x, w.basket.w, g.basketY, g.basketH)) {
      w.items.splice(i, 1);
      if (it.good) {
        w.goodCaught += 1;
        ev.score += scoreForCatch(true);
        ev.caughtGood = true;
      } else {
        // Only catching the bad thing costs a life. Missing a good fruit is
        // free - the whole design point for the youngest players.
        w.badCaught += 1;
        ev.caughtBad = true;
        ev.lostLife = true;
        w.lives -= 1;
        if (w.lives <= 0) ev.outOfLives = true;
      }
      continue;
    }
    if (it.y - it.r > g.h) {
      w.items.splice(i, 1);
      if (it.good) {
        w.missedGood = w.missedGood + 1;
        ev.missedGood = true;
      }
      // A missed bad item is the desired outcome - nothing to record.
    }
  }

  if (ev.outOfLives) {
    // Free continue: reset lives and clear the field rather than stopping play.
    w.lives = START_LIVES;
    w.items = [];
    w.spawnTimer = Math.max(w.spawnTimer, 0.6);
  }

  return ev;
}

// --- component -----------------------------------------------------------------

const GOOD_COLORS: Record<GoodVariant, { fill: string; dark: string }> = {
  apple: { fill: '#ff6b6b', dark: '#c23a3a' },
  orange: { fill: '#ffa94d', dark: '#d97e1e' },
  grape: { fill: '#9c6dd9', dark: '#6f45ad' },
  melon: { fill: '#8ce06a', dark: '#5aa53a' },
};

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

function drawFace(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.fillStyle = 'rgba(20,10,10,0.75)';
  ctx.beginPath();
  ctx.arc(x - r * 0.32, y - r * 0.05, r * 0.09, 0, Math.PI * 2);
  ctx.arc(x + r * 0.32, y - r * 0.05, r * 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y + r * 0.22, r * 0.28, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.strokeStyle = 'rgba(20,10,10,0.75)';
  ctx.lineWidth = Math.max(0.6, r * 0.09);
  ctx.stroke();
}

function drawGoodFruit(ctx: CanvasRenderingContext2D, it: Item): void {
  const c = GOOD_COLORS[it.variant as GoodVariant] ?? GOOD_COLORS.apple;
  const grad = ctx.createRadialGradient(
    it.x - it.r * 0.35,
    it.y - it.r * 0.35,
    it.r * 0.15,
    it.x,
    it.y,
    it.r,
  );
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.35, c.fill);
  grad.addColorStop(1, c.dark);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(it.x, it.y, it.r, 0, Math.PI * 2);
  ctx.fill();

  // Stem and a little leaf - the detail that reads "fruit" at a glance.
  ctx.strokeStyle = '#6b4a2b';
  ctx.lineWidth = Math.max(0.8, it.r * 0.14);
  ctx.beginPath();
  ctx.moveTo(it.x, it.y - it.r * 0.92);
  ctx.lineTo(it.x + it.r * 0.08, it.y - it.r * 1.25);
  ctx.stroke();
  ctx.fillStyle = '#6bbf59';
  ctx.beginPath();
  ctx.ellipse(
    it.x + it.r * 0.42,
    it.y - it.r * 1.05,
    it.r * 0.32,
    it.r * 0.16,
    -0.5,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  drawFace(ctx, it.x, it.y, it.r);
}

function drawBadItem(ctx: CanvasRenderingContext2D, it: Item): void {
  if (it.variant === 'bug') {
    // A round, friendly-cartoon beetle - clearly "not food" without being scary.
    ctx.fillStyle = '#3a3550';
    ctx.beginPath();
    ctx.ellipse(it.x, it.y, it.r * 0.95, it.r * 0.78, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#211d33';
    ctx.lineWidth = Math.max(0.6, it.r * 0.09);
    ctx.beginPath();
    ctx.moveTo(it.x, it.y - it.r * 0.7);
    ctx.lineTo(it.x, it.y + it.r * 0.7);
    ctx.stroke();
    for (const side of [-1, 1]) {
      for (const s of [-0.55, 0, 0.55]) {
        ctx.beginPath();
        ctx.moveTo(it.x + side * it.r * 0.1, it.y + s * it.r * 0.6);
        ctx.lineTo(it.x + side * it.r * 1.15, it.y + s * it.r * 0.85);
        ctx.stroke();
      }
    }
    ctx.fillStyle = '#ff5d5d';
    ctx.beginPath();
    ctx.arc(it.x - it.r * 0.3, it.y - it.r * 0.75, it.r * 0.12, 0, Math.PI * 2);
    ctx.arc(it.x + it.r * 0.3, it.y - it.r * 0.75, it.r * 0.12, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  // Rotten fruit: dull olive with brown blotches and a sagging, sad face.
  const grad = ctx.createRadialGradient(
    it.x - it.r * 0.3,
    it.y - it.r * 0.3,
    it.r * 0.15,
    it.x,
    it.y,
    it.r,
  );
  grad.addColorStop(0, '#9aa15a');
  grad.addColorStop(1, '#5e5a2e');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(it.x, it.y, it.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(60,45,20,0.55)';
  for (const [dx, dy, rr] of [
    [-0.3, 0.25, 0.28],
    [0.35, -0.1, 0.22],
    [0.05, 0.4, 0.18],
  ] as const) {
    ctx.beginPath();
    ctx.arc(it.x + dx * it.r, it.y + dy * it.r, rr * it.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#3a3520';
  ctx.lineWidth = Math.max(0.8, it.r * 0.12);
  ctx.beginPath();
  ctx.moveTo(it.x, it.y - it.r * 0.9);
  ctx.lineTo(it.x, it.y - it.r * 1.2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(20,15,5,0.7)';
  ctx.beginPath();
  ctx.arc(it.x - it.r * 0.3, it.y - it.r * 0.05, it.r * 0.09, 0, Math.PI * 2);
  ctx.arc(it.x + it.r * 0.3, it.y - it.r * 0.05, it.r * 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(it.x, it.y + it.r * 0.45, it.r * 0.24, 1.1 * Math.PI, 1.9 * Math.PI);
  ctx.stroke();
}

function drawBasket(ctx: CanvasRenderingContext2D, w: World): void {
  const g = w.geom;
  const half = w.basket.w / 2;
  const x0 = w.basket.x - half;
  const y0 = g.basketY;
  const h = g.basketH;

  // Woven-basket body.
  const grad = ctx.createLinearGradient(0, y0, 0, y0 + h);
  grad.addColorStop(0, '#d7a15c');
  grad.addColorStop(1, '#a06a2e');
  ctx.fillStyle = grad;
  roundRect(ctx, x0, y0, w.basket.w, h, h * 0.4);
  ctx.fill();

  ctx.strokeStyle = 'rgba(80,50,15,0.55)';
  ctx.lineWidth = Math.max(0.6, h * 0.1);
  const weaves = 4;
  for (let i = 1; i < weaves; i += 1) {
    const wx = x0 + (w.basket.w * i) / weaves;
    ctx.beginPath();
    ctx.moveTo(wx, y0 + h * 0.15);
    ctx.lineTo(wx, y0 + h * 0.95);
    ctx.stroke();
  }

  // Rim.
  ctx.fillStyle = '#8a5726';
  roundRect(ctx, x0 - w.basket.w * 0.03, y0 - h * 0.22, w.basket.w * 1.06, h * 0.32, h * 0.16);
  ctx.fill();
}

function drawHearts(ctx: CanvasRenderingContext2D, lives: number): void {
  const r = 4.2;
  for (let i = 0; i < START_LIVES; i += 1) {
    const cx = 10 + i * (r * 2.6);
    const cy = 10;
    const filled = i < lives;
    ctx.fillStyle = filled ? '#ff6b8a' : 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.moveTo(cx, cy + r * 0.7);
    ctx.bezierCurveTo(cx - r * 1.3, cy - r * 0.4, cx - r * 0.5, cy - r * 1.3, cx, cy - r * 0.35);
    ctx.bezierCurveTo(cx + r * 0.5, cy - r * 1.3, cx + r * 1.3, cy - r * 0.4, cx, cy + r * 0.7);
    ctx.closePath();
    ctx.fill();
  }
}

function draw(ctx: CanvasRenderingContext2D, w: World, cw: number, ch: number): void {
  const g = w.geom;
  ctx.fillStyle = '#0a0a16';
  ctx.fillRect(0, 0, cw, ch);

  ctx.save();
  ctx.scale(g.scale, g.scale);

  const sky = ctx.createLinearGradient(0, 0, 0, g.h);
  sky.addColorStop(0, '#bdeaff');
  sky.addColorStop(1, '#eafff0');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, FIELD_W, g.h);

  // A soft sun, purely decorative.
  ctx.fillStyle = 'rgba(255,230,150,0.9)';
  ctx.beginPath();
  ctx.arc(FIELD_W * 0.82, g.h * 0.1, FIELD_W * 0.08, 0, Math.PI * 2);
  ctx.fill();

  // Grass strip the basket sits on.
  const grassY = g.basketY + g.basketH * 0.55;
  ctx.fillStyle = '#7ccf6b';
  ctx.fillRect(0, grassY, FIELD_W, g.h - grassY);
  ctx.fillStyle = '#5fae4f';
  ctx.fillRect(0, grassY, FIELD_W, Math.max(1.2, g.h * 0.012));

  for (const it of w.items) {
    if (it.good) drawGoodFruit(ctx, it);
    else drawBadItem(ctx, it);
  }

  drawBasket(ctx, w);
  drawHearts(ctx, w.lives);

  ctx.restore();
}

export default function FruitCatch({
  paused,
  input,
  api,
  restartToken,
  difficulty,
  controlsInset,
}: GameCanvasProps) {
  const worldRef = useRef<World | null>(null);
  const seedRef = useRef(1);

  // A fresh run gets a fresh seed, so fruit does not fall in an identical
  // pattern every session. The world itself is built on the first frame, once
  // the canvas size is known.
  useEffect(() => {
    seedRef.current = (Date.now() ^ Math.imul(restartToken + 1, 2654435761)) >>> 0 || 1;
    worldRef.current = null;
  }, [restartToken, difficulty]);

  const { canvasRef } = useCanvasGame({
    active: !paused,
    step: (ctx, dt, cw, ch) => {
      let w = worldRef.current;
      if (!w) {
        w = createWorld({ difficulty, seed: seedRef.current, cw, ch, inset: controlsInset });
        worldRef.current = w;
      } else {
        relayout(w, cw, ch, controlsInset);
      }

      const ev = stepWorld(w, dt, {
        pointerX: input.pointerX,
        left: input.held.left,
        right: input.held.right,
      });

      if (ev.caughtGood) {
        api.addScore(ev.score);
        playSound('coin', Math.min(w.goodCaught, 8));
      }
      if (ev.caughtBad) {
        playSound('wrong');
        api.setStatus('Oops! That one is not for eating.');
      }
      if (ev.outOfLives) {
        playSound('gameOver');
        api.died('That bad one got you');
      }

      draw(ctx, w, cw, ch);
    },
  });

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />;
}
