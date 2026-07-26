'use client';

import { useEffect, useRef } from 'react';
import type { Difficulty } from '@/lib/difficulty';
import type { GameApi, GameCanvasProps } from '@/lib/games';
import { CHARACTERS, drawCharacterFace, type Character, type CharacterId } from '@/lib/characters';
import { playSound, unlockAudio } from '@/lib/sound';
import { useCanvasGame } from '@/lib/useCanvasGame';

/**
 * Memory Match - flip two cards, find the pair, clear the board.
 *
 * Everything above the component is pure: no canvas, no React, no Math.random.
 * `buildDeck`, `makeMatchState`, `canSelect`, `resolvePair`, `matchScore`,
 * `gridForPairs` and `pairsForLevel` are the real functions the game runs, and
 * scripts/check-memorymatch.ts drives them headlessly. The failures that quietly
 * ruin this genre are all invisible from the renderer, so each is proven rather
 * than hoped for:
 *
 *  1. A deck that is not made of honest pairs - an odd length, or a face that
 *     shows up an odd number of times - reads to a five-year-old as "the game is
 *     lying to me" the moment the last card has no partner.
 *  2. A shuffle that drops or duplicates a card. `shuffle` is a Fisher-Yates over
 *     the exact array handed in, and the checker asserts the multiset survives.
 *  3. A matched pair coming back into play. `resolvePair` throws if either index
 *     was already matched, so a caller bug (a second click sneaking through)
 *     fails loudly instead of quietly re-dealing a solved pair; `canSelect` is
 *     the gate the component actually checks before a tap is allowed to flip
 *     anything, and the checker asserts it refuses a matched, already-selected,
 *     or out-of-range card, and refuses a third selection.
 *  4. A dishonest "board clear". Clear is exactly `matchedCount === deck.length`,
 *     never a frame-count guess, and the checker plays full random games to
 *     confirm the flag flips on that exact card and never before.
 *
 * Card faces are the family avatars from lib/characters.ts, drawn with the
 * shared `drawCharacterFace` helper - the same hand-drawn art used on the
 * character picker and the celebration card, not a new set of assets. Early
 * levels (six to ten pairs) use one card per family member, so the board reads
 * as "find Dakota's other card" rather than an abstract icon; only once every
 * character is already in play does a level start reusing a face for a second
 * pair, which keeps the endless ramp honest without inventing new art.
 */

// --- faces -------------------------------------------------------------------

export type FaceId = CharacterId;

const FACE_IDS: FaceId[] = CHARACTERS.map((c) => c.id);
export const NUM_FACES = FACE_IDS.length;

function characterFor(face: FaceId): Character {
  return CHARACTERS.find((c) => c.id === face) ?? CHARACTERS[0];
}

// --- deck ----------------------------------------------------------------

/** Seeded LCG. Generation must never touch Math.random or nothing is provable. */
export function lcg(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Fisher-Yates over a copy. Never mutates the array handed in. */
export function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const t = out[i];
    out[i] = out[j];
    out[j] = t;
  }
  return out;
}

/**
 * `pairs` pairs, unshuffled: one card of each family member first, cycling back
 * through the roster (in the same order) for any pairs beyond the roster size.
 * Cycling rather than picking at random keeps every level's face set
 * deterministic from the seed alone, same as the shuffle that follows it.
 */
export function unshuffledDeck(pairs: number): FaceId[] {
  const out: FaceId[] = [];
  for (let i = 0; i < pairs; i += 1) {
    const face = FACE_IDS[i % FACE_IDS.length];
    out.push(face, face);
  }
  return out;
}

export function buildDeck(pairs: number, rng: () => number): FaceId[] {
  return shuffle(unshuffledDeck(pairs), rng);
}

// --- level ramp ------------------------------------------------------------

const PAIR_START = 6;
const PAIR_STEP = 2;
/** Caps the board at 60 cards - past this a bigger grid stops being readable on
 *  a phone, so the ramp holds here and the game just keeps dealing fresh 30-pair
 *  boards forever. */
export const PAIR_MAX = 30;

/** How many pairs a level deals. Non-decreasing, capped, and level 1 is always 6. */
export function pairsForLevel(level: number): number {
  const lv = Math.max(1, Math.floor(level));
  return Math.min(PAIR_MAX, PAIR_START + (lv - 1) * PAIR_STEP);
}

export type GridDims = { cols: number; rows: number };

/**
 * Rows and columns for a pair count, biased portrait (cols <= rows) to suit the
 * 3:4 canvas this game gets, and chosen from the exact divisors of the cell
 * count so the grid is always a perfect rectangle - never a dangling half row.
 */
export function gridForPairs(pairs: number): GridDims {
  const cells = Math.max(2, pairs * 2);
  const idealCols = Math.sqrt(cells * (3 / 4));
  let bestCols = 1;
  let bestDiff = Infinity;
  for (let cols = 1; cols * cols <= cells; cols += 1) {
    if (cells % cols !== 0) continue;
    const rows = cells / cols;
    if (cols > rows) continue;
    const diff = Math.abs(cols - idealCols);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestCols = cols;
    }
  }
  return { cols: bestCols, rows: cells / bestCols };
}

// --- match state -------------------------------------------------------------
//
// The real rules the component runs. No timers, no animation, no drawing - just
// which cards are matched and whether picking a given card is currently legal.

export type MatchState = {
  deck: FaceId[];
  matched: boolean[];
  matchedCount: number;
};

export function makeMatchState(deck: FaceId[]): MatchState {
  return { deck, matched: deck.map(() => false), matchedCount: 0 };
}

export function isBoardClear(s: MatchState): boolean {
  return s.deck.length > 0 && s.matchedCount === s.deck.length;
}

/**
 * Whether tapping `idx` right now is a legal flip: in range, not already
 * matched, not already one of the up-to-two cards currently selected, and only
 * while fewer than two are selected. This is the one gate the component checks
 * before a tap does anything, so every rule about what a tap can and cannot do
 * lives in one testable place.
 */
export function canSelect(s: MatchState, selected: readonly number[], idx: number): boolean {
  if (!Number.isInteger(idx) || idx < 0 || idx >= s.deck.length) return false;
  if (s.matched[idx]) return false;
  if (selected.includes(idx)) return false;
  if (selected.length >= 2) return false;
  return true;
}

export type FlipResult =
  | { kind: 'match'; a: number; b: number }
  | { kind: 'mismatch'; a: number; b: number };

/**
 * Resolves the two cards a player just picked. Throws on a caller bug rather
 * than silently doing the wrong thing - the one thing that must never happen is
 * an already-solved pair coming back into play, and a hard failure here means no
 * caller can do that by forgetting to check `canSelect` first.
 */
export function resolvePair(s: MatchState, a: number, b: number): FlipResult {
  if (a === b) throw new Error('resolvePair: a and b are the same card');
  if (a < 0 || a >= s.deck.length || b < 0 || b >= s.deck.length) {
    throw new Error('resolvePair: index out of range');
  }
  if (s.matched[a] || s.matched[b]) {
    throw new Error('resolvePair: a matched card was reselected');
  }
  if (s.deck[a] === s.deck[b]) {
    s.matched[a] = true;
    s.matched[b] = true;
    s.matchedCount += 2;
    return { kind: 'match', a, b };
  }
  return { kind: 'mismatch', a, b };
}

// --- scoring -----------------------------------------------------------------

export const BASE_MATCH_POINTS = 30;
export const QUICK_MATCH_BONUS = 20;
/** Seconds between the two flips of a pair that still counts as "quick". */
export const QUICK_WINDOW = 2.2;
export const STREAK_BONUS_STEP = 10;
/** Consecutive matches (no miss between them) that keep raising the bonus. */
export const MAX_STREAK_BONUS = 6;

/**
 * Points for one matched pair. A flat base so every match counts for something,
 * plus a quick-recall bonus for finding the partner fast, plus a streak bonus for
 * a run of matches with no miss between them. Never negative, non-decreasing in
 * streak, and a quick match is always worth at least as much as the same streak
 * found slowly - the checker holds all three.
 */
export function matchScore(streak: number, elapsedSinceFirstFlip: number): number {
  const quick = elapsedSinceFirstFlip <= QUICK_WINDOW ? QUICK_MATCH_BONUS : 0;
  const streakBonus = Math.min(Math.max(streak, 0), MAX_STREAK_BONUS) * STREAK_BONUS_STEP;
  return BASE_MATCH_POINTS + quick + streakBonus;
}

// --- layout ------------------------------------------------------------------

const CELL = 78;
const PAD = 10;
const HUD_H = 44;

export type Layout = { scale: number; ox: number; oy: number; boardW: number; boardH: number };

export function boardSize(cols: number, rows: number): { w: number; h: number } {
  return { w: cols * CELL + PAD * 2, h: HUD_H + rows * CELL + PAD * 2 };
}

/** Fits the level's board into whatever the canvas turned out to be, and centres it. */
export function layoutFor(cw: number, ch: number, inset: number, cols: number, rows: number): Layout {
  const { w: boardW, h: boardH } = boardSize(cols, rows);
  const usableH = Math.max(1, ch - inset);
  const scale = Math.min(cw / boardW, usableH / boardH);
  return {
    scale,
    ox: (cw - boardW * scale) / 2,
    oy: (usableH - boardH * scale) / 2,
    boardW,
    boardH,
  };
}

/** Screen-normalised pointer to board units (the inverse of the draw transform). */
export function toBoard(layout: Layout, cw: number, ch: number, px: number, py: number): { x: number; y: number } {
  return { x: (px * cw - layout.ox) / layout.scale, y: (py * ch - layout.oy) / layout.scale };
}

/** Which card a board-space point falls on, or null when it is off the grid or in the HUD band. */
export function cardIndexAt(bx: number, by: number, cols: number, rows: number): number | null {
  const col = Math.floor((bx - PAD) / CELL);
  const row = Math.floor((by - HUD_H - PAD) / CELL);
  if (col < 0 || col >= cols || row < 0 || row >= rows) return null;
  return row * cols + col;
}

/** Centre of a card, in board units. */
export function cardCentre(idx: number, cols: number): { x: number; y: number } {
  const col = idx % cols;
  const row = Math.floor(idx / cols);
  return { x: PAD + (col + 0.5) * CELL, y: HUD_H + PAD + (row + 0.5) * CELL };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// --- easing ------------------------------------------------------------------

function easeOutBack(t: number): number {
  const k = clamp(t, 0, 1);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
}

// --- visual state ------------------------------------------------------------
//
// Everything below is presentation only: timers, animation and drawing. The
// decisions themselves (can this tap flip that card, did these two match, is the
// board clear) always go through the pure functions above.

type CardView = {
  /** 0 face down .. 1 face up. Eases toward `target` every frame. */
  flip: number;
  target: number;
  /** Scale bounce played once when a card is confirmed matched. */
  pop: number;
  popT: number;
  /** Seconds remaining of the little shake a mismatched card gets. */
  shakeT: number;
};

type Pop = { x: number; y: number; text: string; t: number; life: number; big: boolean };

type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string };

type State = {
  difficulty: Difficulty;
  level: number;
  pairs: number;
  cols: number;
  rows: number;
  match: MatchState;
  views: CardView[];
  rng: () => number;
  fxRng: () => number;
  /** Cards currently flipped and not yet resolved as a match or a miss. Length 0-2. */
  selected: number[];
  /** Game time the first of the currently-selected cards was flipped, for the quick bonus. */
  firstFlipTime: number;
  /** Counts down while a mismatched pair sits face up before flipping back. */
  resolveTimer: number;
  streak: number;
  time: number;
  levelBannerT: number;
  pops: Pop[];
  particles: Particle[];
  shake: number;
  /** Canvas size the frozen frame was painted at, so a resize repaints it. */
  dimAt: { w: number; h: number } | null;
};

const FLIP_SPEED = 9;
const MISMATCH_DELAY = 0.85;
const POP_DUR = 0.4;
const SHAKE_DUR = 0.3;
const MAX_PARTICLES = 160;

function freshViews(deck: FaceId[]): CardView[] {
  return deck.map(() => ({ flip: 0, target: 0, pop: 1, popT: POP_DUR, shakeT: 0 }));
}

/** Deals a fresh board for `level`, in place, reusing the run's own rng. */
function seedLevel(s: State, level: number): void {
  s.level = level;
  s.pairs = pairsForLevel(level);
  const { cols, rows } = gridForPairs(s.pairs);
  s.cols = cols;
  s.rows = rows;
  const deck = buildDeck(s.pairs, s.rng);
  s.match = makeMatchState(deck);
  s.views = freshViews(deck);
  s.selected = [];
  s.firstFlipTime = 0;
  s.resolveTimer = 0;
  s.streak = 0;
  s.levelBannerT = 1.1;
  s.pops = [];
  s.particles = [];
  s.shake = 0;
}

function freshState(difficulty: Difficulty, seed: number): State {
  const rng = lcg(seed);
  const fxRng = lcg((seed ^ 0x9e3779b9) >>> 0);
  const level = 1;
  const pairs = pairsForLevel(level);
  const { cols, rows } = gridForPairs(pairs);
  const deck = buildDeck(pairs, rng);
  return {
    difficulty,
    level,
    pairs,
    cols,
    rows,
    match: makeMatchState(deck),
    views: freshViews(deck),
    rng,
    fxRng,
    selected: [],
    firstFlipTime: 0,
    resolveTimer: 0,
    streak: 0,
    time: 0,
    levelBannerT: 1.1,
    pops: [],
    particles: [],
    shake: 0,
    dimAt: null,
  };
}

function award(s: State, api: GameApi, n: number): void {
  api.addScore(n);
}

function spawnBurst(s: State, cx: number, cy: number, color: string): void {
  for (let i = 0; i < 14; i += 1) {
    if (s.particles.length >= MAX_PARTICLES) break;
    const a = (i / 14) * Math.PI * 2 + s.fxRng() * 0.4;
    const speed = 60 + s.fxRng() * 90;
    s.particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed - 30,
      life: 0.55 + s.fxRng() * 0.3,
      max: 0.55 + s.fxRng() * 0.3,
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
    pt.vy += 220 * dt;
  }
  s.particles = s.particles.filter((pt) => pt.life > 0);
  if (s.shake > 0) s.shake = Math.max(0, s.shake - dt * 6);
}

/** Handles a legal tap on card `idx`: flips it, and resolves the pair once two are up. */
function selectCard(s: State, api: GameApi, idx: number): void {
  const view = s.views[idx];
  view.target = 1;
  s.selected.push(idx);
  playSound('click');

  if (s.selected.length === 1) {
    s.firstFlipTime = s.time;
    return;
  }

  const [a, b] = s.selected;
  const res = resolvePair(s.match, a, b);
  if (res.kind === 'match') {
    s.streak += 1;
    const elapsed = s.time - s.firstFlipTime;
    award(s, api, matchScore(s.streak, elapsed));
    for (const i of [a, b]) {
      s.views[i].pop = 1.35;
      s.views[i].popT = 0;
    }
    const ca = cardCentre(a, s.cols);
    const cb = cardCentre(b, s.cols);
    const accent = characterFor(s.match.deck[a]).accent;
    spawnBurst(s, (ca.x + cb.x) / 2, (ca.y + cb.y) / 2, accent);
    playSound('coin', Math.min(8, s.streak));
    s.selected = [];

    if (isBoardClear(s.match)) {
      const cleared = s.level;
      playSound('levelClear');
      s.pops.push({
        x: boardSize(s.cols, s.rows).w / 2,
        y: HUD_H / 2 + 6,
        text: `Level ${cleared} cleared!`,
        t: 0,
        life: 1.8,
        big: true,
      });
      seedLevel(s, s.level + 1);
      api.requestGate(`Level ${cleared} cleared`);
    }
    return;
  }

  // Mismatch: both stay face up for a beat so a kid can actually look at them,
  // then flip back. The streak resets, gently - no penalty beyond that.
  s.streak = 0;
  s.resolveTimer = MISMATCH_DELAY;
  s.views[a].shakeT = SHAKE_DUR;
  s.views[b].shakeT = SHAKE_DUR;
  playSound('wrong');
}

// --- component -------------------------------------------------------------

export default function MemoryMatch({
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
      const layout = layoutFor(cw, ch, controlsInset, s.cols, s.rows);

      if (paused) {
        if (!s.dimAt || s.dimAt.w !== cw || s.dimAt.h !== ch) {
          s.dimAt = { w: cw, h: ch };
          draw(ctx, s, layout, cw, ch, true);
        }
        return;
      }
      s.dimAt = null;

      s.time += dt;
      if (s.levelBannerT > 0) s.levelBannerT -= dt;
      advanceEffects(s, dt);

      for (const v of s.views) {
        v.flip += (v.target - v.flip) * Math.min(1, dt * FLIP_SPEED);
        if (v.popT < POP_DUR) {
          v.popT = Math.min(POP_DUR, v.popT + dt);
          v.pop = 1 + (1.35 - 1) * (1 - easeOutBack(v.popT / POP_DUR));
        }
        if (v.shakeT > 0) v.shakeT = Math.max(0, v.shakeT - dt);
      }

      if (s.resolveTimer > 0) {
        s.resolveTimer -= dt;
        if (s.resolveTimer <= 0) {
          for (const i of s.selected) s.views[i].target = 0;
          s.selected = [];
        }
      } else if (input.consumePointerPress() && input.pointerX !== null && input.pointerY !== null) {
        const b = toBoard(layout, cw, ch, input.pointerX, input.pointerY);
        const idx = cardIndexAt(b.x, b.y, s.cols, s.rows);
        if (idx !== null && canSelect(s.match, s.selected, idx)) {
          selectCard(s, api, idx);
        }
      }

      draw(ctx, s, layout, cw, ch, false);
    },
  });

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />;
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
  ctx.fill();
}

const BACK_TOP = '#7a4fd1';
const BACK_BOTTOM = '#4f2e9e';
const BOARD_BG_TOP = '#241a3d';
const BOARD_BG_BOTTOM = '#150f26';

function drawCardBack(ctx: CanvasRenderingContext2D, size: number): void {
  const r = size * 0.14;
  const g = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
  g.addColorStop(0, BACK_TOP);
  g.addColorStop(1, BACK_BOTTOM);
  ctx.fillStyle = g;
  roundRect(ctx, -size / 2, -size / 2, size, size, r);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = Math.max(1, size * 0.035);
  ctx.stroke();
  // A simple star mark, so a face-down card still looks like something rather
  // than a blank tile.
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  const pts = 5;
  const rOuter = size * 0.2;
  const rInner = size * 0.085;
  for (let i = 0; i < pts * 2; i += 1) {
    const rad = i % 2 === 0 ? rOuter : rInner;
    const ang = -Math.PI / 2 + (i * Math.PI) / pts;
    const x = Math.cos(ang) * rad;
    const y = Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function drawCardFront(ctx: CanvasRenderingContext2D, size: number, face: FaceId, matched: boolean): void {
  const r = size * 0.14;
  ctx.fillStyle = matched ? '#e9f9ee' : '#faf8ff';
  roundRect(ctx, -size / 2, -size / 2, size, size, r);
  const character = characterFor(face);
  ctx.strokeStyle = matched ? '#3fbf6f' : character.accent;
  ctx.lineWidth = Math.max(1.5, size * 0.045);
  ctx.stroke();
  drawCharacterFace(ctx, character, 0, size * 0.02, size * 0.74);
}

function drawCard(
  ctx: CanvasRenderingContext2D,
  s: State,
  idx: number,
  x: number,
  y: number,
  size: number,
): void {
  const v = s.views[idx];
  const shakeX = v.shakeT > 0 ? Math.sin(v.shakeT * 60) * size * 0.045 : 0;
  const angle = v.flip * Math.PI;
  const sx = Math.cos(angle);

  ctx.save();
  ctx.translate(x + size / 2 + shakeX, y + size / 2);
  ctx.scale(Math.max(0.04, Math.abs(sx)) * v.pop, v.pop);

  if (v.flip < 0.5) drawCardBack(ctx, size);
  else drawCardFront(ctx, size, s.match.deck[idx], s.match.matched[idx]);

  ctx.restore();
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

  const shakeOx = s.shake > 0 ? (s.fxRng() - 0.5) * s.shake * 4 : 0;
  const bg = ctx.createLinearGradient(0, 0, 0, ch);
  bg.addColorStop(0, BOARD_BG_TOP);
  bg.addColorStop(1, BOARD_BG_BOTTOM);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, cw, ch);

  ctx.translate(layout.ox + shakeOx, layout.oy);
  ctx.scale(layout.scale, layout.scale);

  // HUD.
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = `700 ${HUD_H * 0.4}px ui-rounded, system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(`Level ${s.level}`, PAD, HUD_H / 2 + 2);
  ctx.textAlign = 'right';
  const found = s.match.matchedCount / 2;
  ctx.fillText(`${found}/${s.pairs} pairs`, layout.boardW - PAD, HUD_H / 2 + 2);

  // Cards.
  const inset = CELL * 0.06;
  for (let i = 0; i < s.match.deck.length; i += 1) {
    const c = cardCentre(i, s.cols);
    drawCard(ctx, s, i, c.x - CELL / 2 + inset / 2, c.y - CELL / 2 + inset / 2, CELL - inset);
  }

  // Particles (match sparkle burst).
  for (const p of s.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Popup text (match/level banners).
  for (const p of s.pops) {
    const t = p.t / p.life;
    ctx.globalAlpha = Math.max(0, 1 - t);
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${p.big ? HUD_H * 0.55 : HUD_H * 0.4}px ui-rounded, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(p.text, p.x, p.y - t * 18);
  }
  ctx.globalAlpha = 1;

  ctx.restore();

  if (dimmed) {
    ctx.fillStyle = 'rgba(10,6,20,0.45)';
    ctx.fillRect(0, 0, cw, ch);
  }
}
