'use client';

import { useEffect, useRef } from 'react';
import { SPEED_SCALE, type Difficulty } from '@/lib/difficulty';
import type { GameApi, GameCanvasProps } from '@/lib/games';
import { playSound, unlockAudio } from '@/lib/sound';
import { useCanvasGame } from '@/lib/useCanvasGame';

/**
 * Echo - four pads light up and chime in a pattern; the player repeats it
 * back. Every clean repeat, the pattern grows by one step and the pace
 * quickens a little. One wrong tap ends the run.
 *
 * Everything above the component is pure: no canvas, no React, no Math.random.
 * `generateSequence`, `appendStep`, `matchesPrefix` and `isRoundComplete` are
 * the real functions the game runs, and scripts/check-echo.ts drives them
 * headlessly. The failure that would quietly ruin this genre is the pattern
 * itself drifting from what was actually shown - a rebuilt sequence that drops
 * a step, an input check that accepts taps out of order, or a "round clear"
 * that fires at the wrong length - so each is proven rather than hoped for:
 *
 *  1. The generator is a pure function of a seeded stream, so the exact same
 *     seed always produces the exact same pattern - nothing about the
 *     component's timers or the player's pace can perturb it.
 *  2. `appendStep` only ever adds one value to the end and never rewrites the
 *     steps already shown, so a pattern a player has partly memorised never
 *     quietly changes underneath them.
 *  3. `matchesPrefix` is the one gate the component checks after every tap,
 *     and it is order-sensitive and length-guarded (an input longer than the
 *     target can never be a prefix of it). `isRoundComplete` is exactly
 *     "the input is a full-length, fully-matching prefix" - never a bare
 *     length check, which is the bug that would clear a round on four taps
 *     that happened to be the wrong four.
 *
 * Pads are drawn procedurally - a soft gradient body, a glass highlight, a
 * simple glyph per pad (circle / star / triangle / square) so the game does
 * not rely on colour alone - over a dim stage that keeps the light show
 * readable. No assets, nothing borrowed.
 */

// --- sequence ----------------------------------------------------------------

export const PAD_COUNT = 4;

/** Seeded LCG. Generation must never touch Math.random or nothing is provable. */
export function lcg(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** One pad index, 0..PAD_COUNT-1, drawn from the stream. */
export function randomPad(rng: () => number): number {
  return Math.floor(rng() * PAD_COUNT) % PAD_COUNT;
}

/**
 * A fresh pattern of the given length, drawn entirely from `rng`. Deterministic:
 * the same rng stream (i.e. the same seed, called this many times) always
 * produces the same sequence.
 */
export function generateSequence(rng: () => number, length: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < length; i += 1) out.push(randomPad(rng));
  return out;
}

/**
 * One round's worth of growth: a new array one step longer, with every prior
 * step preserved exactly as it was. Never mutates `seq`.
 */
export function appendStep(seq: number[], rng: () => number): number[] {
  return [...seq, randomPad(rng)];
}

/**
 * Whether the player's taps so far (`input`) agree with `target` at every
 * index supplied, in order. An input longer than the target can never be a
 * prefix of it - that is a mismatch, not an out-of-range read.
 */
export function matchesPrefix(target: number[], input: number[]): boolean {
  if (input.length > target.length) return false;
  for (let i = 0; i < input.length; i += 1) {
    if (input[i] !== target[i]) return false;
  }
  return true;
}

/**
 * True exactly when the player has reproduced the whole target, in order -
 * never a bare length check on its own, since a full-length input that is
 * wrong at even one step is not a clear.
 */
export function isRoundComplete(target: number[], input: number[]): boolean {
  return input.length === target.length && matchesPrefix(target, input);
}

// --- scoring -----------------------------------------------------------------

export const ROUND_BASE_SCORE = 20;
export const ROUND_STEP_SCORE = 8;

/**
 * Points for clearing one round. A flat base plus a per-step bonus, so a long
 * pattern is worth meaningfully more than a short one - strictly increasing in
 * `length`, which the checker holds it to.
 */
export function roundScore(length: number): number {
  return ROUND_BASE_SCORE + Math.max(0, length - 1) * ROUND_STEP_SCORE;
}

// --- pace ----------------------------------------------------------------

const START_FLASH = 0.62;
const MIN_FLASH = 0.24;
const FLASH_DECAY = 0.016;

/**
 * Seconds each step of the playback gets, at this pattern length and
 * difficulty. Shortens as the pattern grows (capped, so it never becomes
 * unreadable) and scales with the shared difficulty speed dial - hard is
 * faster, easy is slower, same knob every other game uses for hazard speed.
 */
export function flashDuration(length: number, difficulty: Difficulty): number {
  const raw = Math.max(MIN_FLASH, START_FLASH - Math.max(0, length - 1) * FLASH_DECAY);
  return raw / SPEED_SCALE[difficulty];
}

// --- layout ------------------------------------------------------------------

const MARGIN = 16;
const GAP = 14;
const HUD_H = 34;
const DOTS_H = 22;
const CELL = 150;

export const BOARD_W = MARGIN * 2 + CELL * 2 + GAP;
export const BOARD_H = HUD_H + DOTS_H + MARGIN * 2 + CELL * 2 + GAP;

export type Layout = { scale: number; ox: number; oy: number };

/** Fits the fixed board into whatever the canvas turned out to be, and centres it. */
export function layoutFor(cw: number, ch: number, inset: number): Layout {
  const usableH = Math.max(1, ch - inset);
  const scale = Math.min(cw / BOARD_W, usableH / BOARD_H);
  return { scale, ox: (cw - BOARD_W * scale) / 2, oy: (usableH - BOARD_H * scale) / 2 };
}

export type Rect = { x: number; y: number; w: number; h: number };

/** Board-space rectangle for pad `i` (0 top-left, 1 top-right, 2 bottom-left, 3 bottom-right). */
export function padRect(i: number): Rect {
  const col = i % 2;
  const row = i < 2 ? 0 : 1;
  return {
    x: MARGIN + col * (CELL + GAP),
    y: HUD_H + DOTS_H + MARGIN + row * (CELL + GAP),
    w: CELL,
    h: CELL,
  };
}

/** Which pad a board-space point falls on, or null when it hits neither. */
export function padAt(bx: number, by: number): number | null {
  for (let i = 0; i < PAD_COUNT; i += 1) {
    const r = padRect(i);
    if (bx >= r.x && bx <= r.x + r.w && by >= r.y && by <= r.y + r.h) return i;
  }
  return null;
}

/** Screen-normalised pointer to board units (the inverse of the draw transform). */
export function toBoard(layout: Layout, cw: number, ch: number, px: number, py: number): { x: number; y: number } {
  return { x: (px * cw - layout.ox) / layout.scale, y: (py * ch - layout.oy) / layout.scale };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// --- game state ------------------------------------------------------------

type Phase = 'intro' | 'showing' | 'input' | 'roundComplete';

const INTRO_DUR = 0.55;
const ROUND_PAUSE = 0.55;
const SHOW_ON_FRAC = 0.58;
const GLOW_SPEED = 14;
const TAP_FLASH_DUR = 0.22;

type Pop = { text: string; t: number; life: number; big: boolean };

type State = {
  difficulty: Difficulty;
  rng: () => number;
  target: number[];
  input: number[];
  phase: Phase;
  phaseT: number;
  showIdx: number;
  showStepT: number;
  activePad: number | null;
  padGlow: number[];
  padGlowTarget: number[];
  tapFlash: number[];
  round: number;
  score: number;
  time: number;
  pops: Pop[];
  shake: number;
  dimAt: { w: number; h: number } | null;
};

function freshState(difficulty: Difficulty, seed: number): State {
  const rng = lcg(seed);
  const target = generateSequence(rng, 1);
  return {
    difficulty,
    rng,
    target,
    input: [],
    phase: 'intro',
    phaseT: 0,
    showIdx: 0,
    showStepT: 0,
    activePad: null,
    padGlow: [0, 0, 0, 0],
    padGlowTarget: [0, 0, 0, 0],
    tapFlash: [0, 0, 0, 0],
    round: 0,
    score: 0,
    time: 0,
    pops: [],
    shake: 0,
    dimAt: null,
  };
}

/** Lights the first step of the current target and enters playback. */
function startShowing(s: State): void {
  s.phase = 'showing';
  s.phaseT = 0;
  s.showIdx = 0;
  s.showStepT = 0;
  s.input = [];
  const pad = s.target[0];
  s.activePad = pad;
  s.padGlowTarget[pad] = 1;
  playSound('coin', pad * 3);
}

/** One frame of the "watch the pattern" phase. */
function advanceShowing(s: State, dt: number): void {
  s.showStepT += dt;
  const stepDur = flashDuration(s.target.length, s.difficulty);
  const onDur = stepDur * SHOW_ON_FRAC;

  if (s.activePad !== null && s.showStepT >= onDur) {
    s.padGlowTarget[s.activePad] = 0;
    s.activePad = null;
  }

  if (s.showStepT < stepDur) return;
  s.showStepT = 0;
  s.showIdx += 1;
  if (s.showIdx >= s.target.length) {
    s.phase = 'input';
    s.phaseT = 0;
    s.input = [];
    return;
  }
  const pad = s.target[s.showIdx];
  s.activePad = pad;
  s.padGlowTarget[pad] = 1;
  playSound('coin', pad * 3);
}

/** A legal tap on `pad` during the player's turn. */
function handleTap(s: State, api: GameApi, pad: number): void {
  playSound('coin', pad * 3);
  s.tapFlash[pad] = TAP_FLASH_DUR;
  s.padGlowTarget[pad] = 1;

  const attempt = [...s.input, pad];
  if (!matchesPrefix(s.target, attempt)) {
    playSound('gameOver');
    api.died('Missed the sequence');
    // Dying is free - the shell handles the study gate. On this side, the run
    // simply continues from a fresh length-1 pattern, same rng stream.
    s.target = generateSequence(s.rng, 1);
    s.input = [];
    s.round = 0;
    s.phase = 'intro';
    s.phaseT = 0;
    api.setStatus('Missed it - watch again');
    return;
  }

  s.input = attempt;
  if (!isRoundComplete(s.target, attempt)) return;

  const clearedLength = s.target.length;
  s.round = clearedLength;
  const pts = roundScore(clearedLength);
  s.score += pts;
  api.addScore(pts);
  playSound('correct');
  s.pops.push({ text: `Round ${clearedLength}! +${pts}`, t: 0, life: 1.3, big: clearedLength % 5 === 0 });
  api.setStatus(`Round ${clearedLength} cleared! +${pts}`);

  s.target = appendStep(s.target, s.rng);
  s.input = [];
  s.phase = 'roundComplete';
  s.phaseT = 0;
}

function advanceEffects(s: State, dt: number): void {
  for (let i = 0; i < PAD_COUNT; i += 1) {
    if (s.tapFlash[i] > 0) {
      s.tapFlash[i] -= dt;
      if (s.tapFlash[i] <= 0) {
        s.tapFlash[i] = 0;
        s.padGlowTarget[i] = 0;
      }
    }
    s.padGlow[i] += (s.padGlowTarget[i] - s.padGlow[i]) * Math.min(1, dt * GLOW_SPEED);
  }
  for (const p of s.pops) p.t += dt;
  s.pops = s.pops.filter((p) => p.t < p.life);
  if (s.shake > 0) s.shake = Math.max(0, s.shake - dt * 5);
}

// --- component -------------------------------------------------------------

export default function Echo({
  paused,
  input,
  api,
  restartToken,
  difficulty,
  controlsInset,
}: GameCanvasProps) {
  const stateRef = useRef<State | null>(null);
  const seedRef = useRef(1);

  // A fresh run gets a fresh seed so the pattern is not identical every
  // session. State itself is built on the first frame, keeping generation out
  // of render entirely.
  useEffect(() => {
    seedRef.current = (Date.now() ^ Math.imul(restartToken + 1, 2654435761)) >>> 0 || 1;
    stateRef.current = null;
  }, [restartToken, difficulty]);

  // iOS will not start an AudioContext outside a real gesture, and a call from
  // inside the animation frame is too late - listen on window so the first tap
  // on the touch overlay still catches the gesture while it is live.
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
        // second behind a question. A tap that comes back is answering, not
        // still mid-sequence, so the phase and timers are untouched here.
        if (!s.dimAt || s.dimAt.w !== cw || s.dimAt.h !== ch) {
          s.dimAt = { w: cw, h: ch };
          draw(ctx, s, layout, cw, ch, true);
        }
        return;
      }
      s.dimAt = null;

      s.time += dt;
      advanceEffects(s, dt);

      // Pointer edges are drained every frame regardless of phase, so a press
      // during a non-interactive phase (the pattern playing back) never
      // leaks into the next interactive one.
      const pressed = input.consumePointerPress();
      input.consumePointerRelease();

      if (s.phase === 'intro') {
        s.phaseT += dt;
        if (s.phaseT >= INTRO_DUR) startShowing(s);
      } else if (s.phase === 'showing') {
        advanceShowing(s, dt);
      } else if (s.phase === 'roundComplete') {
        s.phaseT += dt;
        if (s.phaseT >= ROUND_PAUSE) startShowing(s);
      } else if (s.phase === 'input') {
        if (pressed && input.pointerX !== null && input.pointerY !== null) {
          const b = toBoard(layout, cw, ch, input.pointerX, input.pointerY);
          const pad = padAt(b.x, b.y);
          if (pad !== null) handleTap(s, api, pad);
        }
      }

      draw(ctx, s, layout, cw, ch, false);
    },
  });

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />;
}

// --- drawing -----------------------------------------------------------------

function hsl(h: number, sat: number, l: number, a = 1): string {
  const hh = ((h % 360) + 360) % 360;
  return a >= 1 ? `hsl(${hh}, ${sat}%, ${l}%)` : `hsla(${hh}, ${sat}%, ${l}%, ${a})`;
}

type Tone = { light: string; base: string; dark: string };

/** Red, gold, sky, leaf - four hues chosen for contrast rather than proximity. */
const PAD_HUES = [352, 44, 205, 142];
const PAD_TONES: Tone[] = PAD_HUES.map((h) => ({
  light: hsl(h, 88, 76),
  base: hsl(h, 74, 54),
  dark: hsl(h, 62, 32),
}));

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

/** A simple glyph per pad, so the game never leans on colour alone to tell pads apart. */
function drawGlyph(ctx: CanvasRenderingContext2D, i: number, cx: number, cy: number, size: number, color: string): void {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.14;
  ctx.beginPath();
  if (i === 0) {
    // Circle.
    ctx.arc(cx, cy, size * 0.4, 0, Math.PI * 2);
    ctx.fill();
  } else if (i === 1) {
    // Star.
    const pts = 5;
    const rOuter = size * 0.46;
    const rInner = size * 0.2;
    for (let k = 0; k < pts * 2; k += 1) {
      const rad = k % 2 === 0 ? rOuter : rInner;
      const ang = -Math.PI / 2 + (k * Math.PI) / pts;
      const x = cx + Math.cos(ang) * rad;
      const y = cy + Math.sin(ang) * rad;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  } else if (i === 2) {
    // Triangle.
    const r = size * 0.46;
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r * 0.87, cy + r * 0.5);
    ctx.lineTo(cx - r * 0.87, cy + r * 0.5);
    ctx.closePath();
    ctx.fill();
  } else {
    // Square.
    const r = size * 0.34;
    roundRect(ctx, cx - r, cy - r, r * 2, r * 2, r * 0.28);
    ctx.fill();
  }
}

function drawPad(ctx: CanvasRenderingContext2D, i: number, rect: Rect, glow: number): void {
  const tone = PAD_TONES[i];
  const g = clamp(glow, 0, 1);
  // A lit pad grows very slightly and lifts off the stage - the pop reads as
  // "this one" even to a kid glancing at the board, not just the colour.
  const grow = rect.w * 0.035 * g;
  const x = rect.x - grow;
  const y = rect.y - grow;
  const w = rect.w + grow * 2;
  const h = rect.h + grow * 2;
  const r = w * 0.16;

  ctx.save();
  if (g > 0.02) {
    ctx.shadowColor = tone.light;
    ctx.shadowBlur = 26 * g;
  }
  const body = ctx.createLinearGradient(x, y, x, y + h);
  body.addColorStop(0, tone.light);
  body.addColorStop(0.5, tone.base);
  body.addColorStop(1, tone.dark);
  ctx.fillStyle = body;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Glass highlight band.
  const cap = ctx.createLinearGradient(x, y, x, y + h * 0.42);
  cap.addColorStop(0, 'rgba(255,255,255,0.4)');
  cap.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = cap;
  roundRect(ctx, x + w * 0.06, y + h * 0.07, w * 0.88, h * 0.32, r * 0.6);
  ctx.fill();

  // Bright-when-lit overlay.
  if (g > 0.01) {
    ctx.fillStyle = `rgba(255,255,255,${0.32 * g})`;
    roundRect(ctx, x, y, w, h, r);
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(0,0,0,0.24)';
  ctx.lineWidth = Math.max(1, w * 0.02);
  roundRect(ctx, x, y, w, h, r);
  ctx.stroke();

  const glyphColor = g > 0.35 ? 'rgba(30,20,10,0.82)' : 'rgba(255,255,255,0.75)';
  drawGlyph(ctx, i, x + w / 2, y + h / 2, Math.min(w, h) * 0.55, glyphColor);
  ctx.restore();
}

const PHASE_LABEL: Record<Phase, string> = {
  intro: 'Get ready...',
  showing: 'Watch...',
  input: 'Your turn!',
  roundComplete: 'Nice!',
};

function draw(ctx: CanvasRenderingContext2D, s: State, layout: Layout, cw: number, ch: number, dimmed: boolean): void {
  ctx.save();
  ctx.clearRect(0, 0, cw, ch);

  const shakeOx = s.shake > 0.01 ? (s.showStepT % 0.05 < 0.025 ? 1 : -1) * s.shake : 0;
  const bg = ctx.createLinearGradient(0, 0, 0, ch);
  bg.addColorStop(0, '#1b1430');
  bg.addColorStop(1, '#0d0a1a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, cw, ch);

  ctx.translate(layout.ox + shakeOx, layout.oy);
  ctx.scale(layout.scale, layout.scale);

  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = `700 ${HUD_H * 0.44}px ui-rounded, system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText(`Round ${Math.max(1, s.target.length)}`, MARGIN, HUD_H / 2 + 2);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.font = `600 ${HUD_H * 0.38}px ui-rounded, system-ui, sans-serif`;
  ctx.fillText(PHASE_LABEL[s.phase], BOARD_W - MARGIN, HUD_H / 2 + 2);

  // Progress dots: one per step of the current pattern, showing what has been
  // shown/repeated so far.
  const dotY = HUD_H + DOTS_H / 2;
  const dotR = 5;
  const dotGap = 16;
  const dotsW = (s.target.length - 1) * dotGap;
  const dotStartX = BOARD_W / 2 - dotsW / 2;
  for (let i = 0; i < s.target.length; i += 1) {
    const filled =
      (s.phase === 'showing' && i <= s.showIdx) ||
      (s.phase === 'input' && i < s.input.length) ||
      s.phase === 'roundComplete';
    ctx.fillStyle = filled ? 'rgba(255,214,90,0.95)' : 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.arc(dotStartX + i * dotGap, dotY, dotR, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < PAD_COUNT; i += 1) {
    drawPad(ctx, i, padRect(i), s.padGlow[i]);
  }

  for (const p of s.pops) {
    const t = p.t / p.life;
    ctx.globalAlpha = Math.max(0, 1 - t);
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${p.big ? HUD_H * 0.6 : HUD_H * 0.46}px ui-rounded, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(p.text, BOARD_W / 2, BOARD_H - 14 - t * 16);
  }
  ctx.globalAlpha = 1;

  ctx.restore();

  if (dimmed) {
    ctx.fillStyle = 'rgba(10,6,20,0.45)';
    ctx.fillRect(0, 0, cw, ch);
  }
}
