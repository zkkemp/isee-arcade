'use client';

import { useEffect, useRef } from 'react';
import type { Difficulty } from '@/lib/difficulty';
import type { GameApi, GameCanvasProps } from '@/lib/games';
import { playSound, unlockAudio } from '@/lib/sound';
import { useCanvasGame } from '@/lib/useCanvasGame';
import type { Question } from '@/lib/questions/types';
import { VOCAB_AB } from '@/lib/questions/vocab/ab';
import { VOCAB_CD } from '@/lib/questions/vocab/cd';
import { VOCAB_EH } from '@/lib/questions/vocab/eh';
import { VOCAB_IM } from '@/lib/questions/vocab/im';
import { VOCAB_NR } from '@/lib/questions/vocab/nr';
import { VOCAB_SZ } from '@/lib/questions/vocab/sz';

/**
 * Spelling Zap - a spell-from-memory game built from the ISEE synonym vocabulary
 * bank, so spelling a word out loud (well, tile by tile) reinforces the same word
 * the study block quizzes on.
 *
 * There is no aggregate export of every vocab word (lib/questions/index.ts only
 * re-exports `./types`), so this file imports the six VOCAB_* range files
 * directly, same as index.ts does, and never copies the bank - it stays in sync
 * as words are added to ab.ts..sz.ts. (WordHunt.tsx does the same extraction
 * independently, since these two files are not allowed to share a new lib file.)
 *
 * The whole point of a spelling game is figuring out letters you do not already
 * see spelled out. An earlier version showed the vocab bank's `.explain`
 * definition as an on-screen "hint" while the child spelled - which, for a
 * concrete noun/verb like AGILE or NIMBLE, routinely just IS the word restated
 * in other words, so there was nothing left to figure out. This version never
 * shows word-identifying text at all:
 *
 *  1. Each word opens with a `flash` phase - the target word appears large and
 *     clear for FLASH_SECONDS with a "Memorize this word!" prompt, and the
 *     letter tiles are not drawn yet.
 *  2. The word then hides and the scrambled tiles appear. The child taps them
 *     in order, from memory, to rebuild the word.
 *  3. A "PEEK" button re-flashes the word for PEEK_SECONDS without touching any
 *     progress already made, capped at MAX_PEEKS_PER_WORD taps per word so a
 *     stuck kid always has a way forward without the game turning into "read
 *     the word, then copy it."
 *  4. No definition, category or defining text is ever shown. The only
 *     information on screen besides the flashed word itself is the tile count
 *     (which the scrambled tiles already reveal for free) and the running
 *     word/streak counters.
 *
 * Everything above the component is pure: no canvas, no React, no Math.random.
 * `shuffleLetters`, `buildLetterBank`, `matchesTargetPrefix`, `canTapTile`,
 * `resolveTap`, and the peek-button geometry/eligibility helpers are the real
 * functions the game runs, and scripts/check-spellingzap.ts drives them
 * headlessly to prove the things that quietly ruin this genre:
 *
 *  1. A scramble that is not an honest permutation - a dropped or duplicated
 *     letter reads as the game cheating the moment the child cannot make the
 *     tiles spell the word at all. `shuffleLetters` is checked as an exact
 *     multiset match against the target across many seeds and word lengths, and
 *     is asserted to differ from the answer's own order whenever that is
 *     possible (anything longer than one letter with not-all-identical letters).
 *  2. A prefix checker that accepts a letter out of order, or rejects the right
 *     one - which either lets a child "spell" nonsense or makes a correct tap
 *     buzz for no reason. `matchesTargetPrefix` is the one gate the component
 *     checks before a tap does anything, so every rule about what a tap can and
 *     cannot do lives in one testable place.
 *  3. A tile that gets consumed twice, or a completed word missing a letter -
 *     `resolveTap` throws on an illegal call, and the checker plays full random
 *     spellings (always tapping a legal next tile) across the whole vocab pool
 *     and proves every one lands on the exact target word with every tile used
 *     exactly once.
 *  4. A peek gate that lets a peek through when it should not (mid-flash,
 *     mid-peek, or with no peeks left) - `canUsePeek` is the one gate a peek tap
 *     is checked against, same discipline as the letter-tap gate.
 *
 * Art is drawn procedurally on canvas - no assets - laid out from the same pure
 * `boardSize`/`layoutFor`/`tileIndexAt` triple the checker exercises, so a
 * layout change cannot silently move the tiles (or the peek button) out from
 * under the input mapping.
 */

// ------------------------------------------------------------------ vocabulary

export type VocabWord = { word: string };

const ALL_VOCAB: Question[] = [
  ...VOCAB_AB,
  ...VOCAB_CD,
  ...VOCAB_EH,
  ...VOCAB_IM,
  ...VOCAB_NR,
  ...VOCAB_SZ,
];

export const MIN_WORD_LEN = 3;
export const MAX_WORD_LEN = 8;

/**
 * Every vocab entry whose prompt is a bare A-Z word 3-8 letters long, deduped
 * and upper-cased. Only the word itself is kept - no definition, no explain
 * text - so there is nothing in this pool that could be shown as a giveaway.
 * Phrases, hyphenated words and anything with spaces are skipped.
 */
export function extractVocabWords(): VocabWord[] {
  const seen = new Set<string>();
  const out: VocabWord[] = [];
  for (const q of ALL_VOCAB) {
    const w = q.prompt.toUpperCase();
    if (!/^[A-Z]+$/.test(w)) continue;
    if (w.length < MIN_WORD_LEN || w.length > MAX_WORD_LEN) continue;
    if (seen.has(w)) continue;
    seen.add(w);
    out.push({ word: w });
  }
  return out;
}

export const VOCAB_POOL: VocabWord[] = extractVocabWords();

// ------------------------------------------------------------------------ rng

/** Seeded LCG. Generation must never touch Math.random or nothing is provable. */
export function lcg(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// --------------------------------------------------------------------- scramble

/**
 * Fisher-Yates over the word's own letters. Guaranteed to differ from the
 * word's own order whenever that is possible - i.e. whenever the letters are
 * not all identical - by forcing one adjacent swap if the shuffle happened to
 * land back on the identity order. A word made of one repeated letter (not
 * present in this vocab bank, but handled rather than assumed away) simply
 * cannot differ from itself under any permutation, so it is left as is.
 */
export function shuffleLetters(word: string, rand: () => number): string[] {
  const arr = word.split('');
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  if (arr.length > 1 && arr.join('') === word) {
    const allSame = arr.every((c) => c === arr[0]);
    if (!allSame) {
      // Swap the first two letters that actually differ - guaranteed to exist
      // since not every letter is the same, and guaranteed to change the
      // string since positions 0 and that index hold different letters.
      const j = arr.findIndex((c) => c !== arr[0]);
      [arr[0], arr[j]] = [arr[j], arr[0]];
    }
  }
  return arr;
}

export type LetterTile = { letter: string; used: boolean };

export function buildLetterBank(word: string, rand: () => number): LetterTile[] {
  return shuffleLetters(word, rand).map((letter) => ({ letter, used: false }));
}

// --------------------------------------------------------------- prefix rules

/** Whether `tapped` (built up so far) is exactly the start of `target`. */
export function matchesTargetPrefix(tapped: string, target: string): boolean {
  if (tapped.length > target.length) return false;
  return target.slice(0, tapped.length) === tapped;
}

/** Whether appending `letter` to `built` would still match the target's prefix. */
export function acceptsNextLetter(built: string, letter: string, target: string): boolean {
  if (built.length >= target.length) return false;
  return matchesTargetPrefix(built + letter, target);
}

/**
 * Whether tapping tile `i` right now is legal: in range, not already used, and
 * its letter is the correct next letter toward `target`. This is the one gate
 * the component checks before a tap does anything.
 */
export function canTapTile(tiles: readonly LetterTile[], built: string, target: string, i: number): boolean {
  if (!Number.isInteger(i) || i < 0 || i >= tiles.length) return false;
  if (tiles[i].used) return false;
  return acceptsNextLetter(built, tiles[i].letter, target);
}

export type TapResult = { built: string; complete: boolean };

/**
 * Resolves a legal tap: consumes the tile and extends `built`. Throws on a
 * caller bug (an illegal tap sneaking through) rather than silently doing the
 * wrong thing, same discipline as MemoryMatch's resolvePair.
 */
export function resolveTap(tiles: LetterTile[], built: string, target: string, i: number): TapResult {
  if (!canTapTile(tiles, built, target, i)) {
    throw new Error('resolveTap: illegal tap');
  }
  tiles[i].used = true;
  const next = built + tiles[i].letter;
  return { built: next, complete: next === target };
}

// ------------------------------------------------------------------ word ramp

const DIFF_LEN_OFFSET: Record<Difficulty, number> = { easy: -1, normal: 0, hard: 1 };

/** Target word length for the Nth word of the run. Non-decreasing, capped. */
export function wordLenForIndex(index: number, difficulty: Difficulty): number {
  const n = Math.max(0, Math.floor(index));
  const base = Math.min(MAX_WORD_LEN, MIN_WORD_LEN + Math.floor(n / 2));
  return Math.max(MIN_WORD_LEN, Math.min(MAX_WORD_LEN, base + DIFF_LEN_OFFSET[difficulty]));
}

/**
 * Seeded pick of one word of exactly `len` letters if the pool has one,
 * otherwise the closest available length. Never throws and never returns
 * nothing, even for a pathologically small pool, so a broken import degrades
 * gracefully instead of crashing the game.
 */
export function pickWord(pool: readonly VocabWord[], len: number, rand: () => number): VocabWord {
  for (let delta = 0; delta <= MAX_WORD_LEN; delta += 1) {
    const lens = delta === 0 ? [len] : [len - delta, len + delta];
    for (const l of lens) {
      const candidates = pool.filter((w) => w.word.length === l);
      if (candidates.length > 0) {
        const i = Math.floor(rand() * candidates.length) % candidates.length;
        return candidates[i];
      }
    }
  }
  return { word: 'STUDY' };
}

// -------------------------------------------------------------------- scoring

export const BASE_WORD_POINTS = 25;
export const NO_MISS_BONUS = 15;
export const QUICK_BONUS = 20;
export const MILESTONE_WORDS = 5;

/** Seconds a word stays eligible for the quick bonus. Generous on purpose. */
export function quickWindowFor(len: number): number {
  return 4 + len * 1.6;
}

/**
 * Points for finishing one word. A flat base plus a length bonus (a longer
 * word is worth more), a no-miss bonus if every tap was correct, and a quick
 * bonus for finishing inside a generous window. Never negative.
 */
export function wordCompletionScore(len: number, mistakes: number, elapsed: number): number {
  const lenBonus = len * 4;
  const noMiss = mistakes === 0 ? NO_MISS_BONUS : 0;
  const quick = elapsed <= quickWindowFor(len) ? QUICK_BONUS : 0;
  return BASE_WORD_POINTS + lenBonus + noMiss + quick;
}

// ---------------------------------------------------------------- memorize/peek

/** How long the word is flashed at the start of each word. */
export const FLASH_SECONDS = 2.5;
/** How long a "Peek" re-flash lasts - short on purpose, a reminder not a copy. */
export const PEEK_SECONDS = 1.0;
/** Peeks available per word. Free, but capped so it never replaces memorizing. */
export const MAX_PEEKS_PER_WORD = 2;

/**
 * Whether a tap on the Peek button right now should do anything: only while
 * actively spelling (not mid-flash, not mid-complete-banner), only when not
 * already peeking, and only with peeks remaining. This is the one gate a peek
 * tap is checked against, same role as `canTapTile` for letter taps.
 */
export function canUsePeek(phase: string, peeking: boolean, peeksLeft: number): boolean {
  return phase === 'playing' && !peeking && peeksLeft > 0;
}

export type Rect = { x: number; y: number; w: number; h: number };

const PEEK_BTN_W = 104;
const PEEK_BTN_H = 28;

/** The Peek button's hitbox in board-space pixels, centred in its own row. */
export function peekButtonRect(boardW: number): Rect {
  return {
    x: boardW / 2 - PEEK_BTN_W / 2,
    y: HUD_H + (PEEK_ROW_H - PEEK_BTN_H) / 2,
    w: PEEK_BTN_W,
    h: PEEK_BTN_H,
  };
}

/** Whether board-space point (px, py) falls inside rect `r`. */
export function pointInRect(px: number, py: number, r: Rect): boolean {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

// -------------------------------------------------------------------- layout

const TILE = 46;
const GAP = 10;
const PAD = 14;
const HUD_H = 30;
const PEEK_ROW_H = 40;
const ROW_GAP = 16;

export type Layout = { scale: number; ox: number; oy: number; boardW: number; boardH: number };

export function boardSize(wordLen: number): { w: number; h: number } {
  const rowW = wordLen * TILE + (wordLen - 1) * GAP;
  const w = Math.max(rowW + PAD * 2, 280);
  const h = HUD_H + PEEK_ROW_H + TILE + ROW_GAP + TILE + PAD * 2;
  return { w, h };
}

/** Fits the fixed board into whatever the canvas turned out to be, and centres it. */
export function layoutFor(cw: number, ch: number, inset: number, wordLen: number): Layout {
  const { w: boardW, h: boardH } = boardSize(wordLen);
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

function slotRowY(): number {
  return HUD_H + PEEK_ROW_H + TILE / 2;
}
function tileRowY(): number {
  return HUD_H + PEEK_ROW_H + TILE + ROW_GAP + TILE / 2;
}
function colX(i: number): number {
  return PAD + i * (TILE + GAP) + TILE / 2;
}

export function tileCentre(i: number, wordLen: number): { x: number; y: number } {
  return { x: colX(Math.min(i, wordLen - 1)), y: tileRowY() };
}
export function slotCentre(i: number, wordLen: number): { x: number; y: number } {
  return { x: colX(Math.min(i, wordLen - 1)), y: slotRowY() };
}

/** Normalised canvas coordinates to board-space pixels - the inverse of the draw transform. */
export function toBoard(layout: Layout, cw: number, ch: number, px: number, py: number): { x: number; y: number } {
  return { x: (px * cw - layout.ox) / layout.scale, y: (py * ch - layout.oy) / layout.scale };
}

/** Which tile a board-space point falls on, or null if it is outside the tile row. */
export function tileIndexAt(bx: number, by: number, wordLen: number): number | null {
  const y = tileRowY();
  if (by < y - TILE / 2 || by > y + TILE / 2) return null;
  for (let i = 0; i < wordLen; i += 1) {
    const x = colX(i);
    if (bx >= x - TILE / 2 && bx <= x + TILE / 2) return i;
  }
  return null;
}

// ----------------------------------------------------------------- simulation
//
// Everything below is presentation only: timers, animation and drawing. Every
// decision that matters (is this tap legal, is the word complete, is a peek
// allowed) always goes through the pure functions above.

type Phase = 'flash' | 'playing' | 'complete';

type TileAnim = { placed: boolean; popT: number; shakeT: number };
type Popup = { x: number; y: number; text: string; t: number; life: number; color: string };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string };

export type Sim = {
  difficulty: Difficulty;
  wordIndex: number; // words completed so far this run
  target: VocabWord;
  tiles: LetterTile[];
  tileAnim: TileAnim[];
  built: string;
  mistakes: number;
  streak: number;
  phase: Phase;
  t: number;
  dur: number;
  wordStartTime: number;
  peeking: boolean;
  peekT: number;
  peeksLeft: number;
  popAnimT: number;
  shakeAll: number;
  rand: () => number;
  fx: () => number;
  particles: Particle[];
  popups: Popup[];
  time: number;
  dimmed: boolean;
  lastW: number;
  lastH: number;
};

function freshTileAnim(tiles: LetterTile[]): TileAnim[] {
  return tiles.map(() => ({ placed: false, popT: 1, shakeT: 0 }));
}

export function makeSim(difficulty: Difficulty, seed: number): Sim {
  const rand = lcg(seed);
  const target = pickWord(VOCAB_POOL, wordLenForIndex(0, difficulty), rand);
  const tiles = buildLetterBank(target.word, rand);
  return {
    difficulty,
    wordIndex: 0,
    target,
    tiles,
    tileAnim: freshTileAnim(tiles),
    built: '',
    mistakes: 0,
    streak: 0,
    phase: 'flash',
    t: 0,
    dur: FLASH_SECONDS,
    wordStartTime: 0,
    peeking: false,
    peekT: 0,
    peeksLeft: MAX_PEEKS_PER_WORD,
    popAnimT: 1,
    shakeAll: 0,
    rand,
    fx: lcg((seed ^ 0x1d872b41) >>> 0),
    particles: [],
    popups: [],
    time: 0,
    dimmed: false,
    lastW: 0,
    lastH: 0,
  };
}

function startNextWord(sim: Sim): void {
  const len = wordLenForIndex(sim.wordIndex, sim.difficulty);
  sim.target = pickWord(VOCAB_POOL, len, sim.rand);
  sim.tiles = buildLetterBank(sim.target.word, sim.rand);
  sim.tileAnim = freshTileAnim(sim.tiles);
  sim.built = '';
  sim.mistakes = 0;
  sim.peeking = false;
  sim.peekT = 0;
  sim.peeksLeft = MAX_PEEKS_PER_WORD;
  sim.popAnimT = 1;
  sim.phase = 'flash';
  sim.t = 0;
  sim.dur = FLASH_SECONDS;
}

function spawnZapParticles(sim: Sim, x: number, y: number, color: string): void {
  for (let k = 0; k < 8; k += 1) {
    if (sim.particles.length > 220) break;
    const a = sim.fx() * Math.PI * 2;
    const sp = 30 + sim.fx() * 60;
    sim.particles.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 20,
      life: 0.35 + sim.fx() * 0.25,
      max: 0.6,
      color,
    });
  }
}

function addPopup(sim: Sim, x: number, y: number, text: string, color: string): void {
  sim.popups.push({ x, y, text, t: 0, life: 0.8, color });
}

function handleTap(sim: Sim, api: GameApi, i: number): void {
  if (sim.phase !== 'playing' || sim.peeking) return;
  const target = sim.target.word;

  if (!canTapTile(sim.tiles, sim.built, target, i)) {
    sim.mistakes += 1;
    sim.tileAnim[i].shakeT = 0.0001;
    sim.shakeAll = Math.max(sim.shakeAll, 3);
    playSound('wrong');
    return;
  }

  const pos = sim.built.length;
  const res = resolveTap(sim.tiles, sim.built, target, i);
  sim.built = res.built;
  sim.tileAnim[i].placed = true;
  sim.tileAnim[i].popT = 0;
  sim.popAnimT = 0;
  playSound('click');

  const c = slotCentre(pos, target.length);
  spawnZapParticles(sim, c.x, c.y, '#ffe86a');

  if (res.complete) {
    if (sim.mistakes === 0) sim.streak += 1;
    else sim.streak = 0;

    const elapsed = sim.time - sim.wordStartTime;
    const gained = wordCompletionScore(target.length, sim.mistakes, elapsed);
    api.addScore(gained);
    playSound('coin', Math.min(sim.streak, 8));
    addPopup(sim, boardSize(target.length).w / 2, slotRowY() - TILE * 0.7, `${target} +${gained}`, '#ffe86a');
    playSound('powerup');

    sim.wordIndex += 1;
    if (sim.wordIndex % MILESTONE_WORDS === 0) {
      sim.phase = 'complete';
      sim.t = 0;
      sim.dur = 1.0;
      playSound('levelClear');
    } else {
      startNextWord(sim);
    }
  }
}

/** Tries a Peek tap. No-ops (silently) when `canUsePeek` says no. */
function handlePeekTap(sim: Sim): void {
  if (!canUsePeek(sim.phase, sim.peeking, sim.peeksLeft)) return;
  sim.peeking = true;
  sim.peekT = 0;
  sim.peeksLeft -= 1;
  playSound('click');
}

function advanceEffects(sim: Sim, dt: number): void {
  for (const a of sim.tileAnim) {
    if (a.shakeT > 0) {
      a.shakeT += dt;
      if (a.shakeT > 0.26) a.shakeT = 0;
    }
    if (a.placed && a.popT < 1) a.popT = Math.min(1, a.popT + dt / 0.26);
  }
  sim.popAnimT = Math.min(1, sim.popAnimT + dt / 0.3);
  if (sim.shakeAll > 0) sim.shakeAll = Math.max(0, sim.shakeAll - dt * 12);

  for (const p of sim.particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 180 * dt;
  }
  sim.particles = sim.particles.filter((p) => p.life > 0);

  for (const p of sim.popups) {
    p.t += dt;
    p.y -= 16 * dt;
  }
  sim.popups = sim.popups.filter((p) => p.t < p.life);
}

/** One frame of game logic. Mutates and returns the same sim - no board to swap. */
export function update(
  sim: Sim,
  dt: number,
  input: { pointerX: number | null; pointerY: number | null; consumePointerPress: () => boolean },
  api: GameApi,
  layout: Layout,
  cw: number,
  ch: number,
): Sim {
  sim.time += dt;
  advanceEffects(sim, dt);

  switch (sim.phase) {
    case 'flash': {
      input.consumePointerPress(); // drain taps while memorizing - nothing to tap yet
      sim.t += dt;
      if (sim.t >= sim.dur) {
        sim.phase = 'playing';
        sim.wordStartTime = sim.time;
        api.setStatus('Spell it from memory!');
      }
      break;
    }

    case 'playing': {
      if (sim.peeking) {
        input.consumePointerPress(); // drain taps while the peek overlay is up
        sim.peekT += dt;
        if (sim.peekT >= PEEK_SECONDS) {
          sim.peeking = false;
          sim.peekT = 0;
        }
        break;
      }
      if (input.consumePointerPress() && input.pointerX !== null && input.pointerY !== null) {
        const b = toBoard(layout, cw, ch, input.pointerX, input.pointerY);
        if (pointInRect(b.x, b.y, peekButtonRect(layout.boardW))) {
          handlePeekTap(sim);
        } else {
          const i = tileIndexAt(b.x, b.y, sim.tiles.length);
          if (i !== null) handleTap(sim, api, i);
        }
      }
      break;
    }

    case 'complete': {
      input.consumePointerPress(); // drain taps during the milestone banner
      sim.t += dt;
      if (sim.t >= sim.dur) {
        api.requestGate(`${sim.wordIndex} words spelled!`);
        startNextWord(sim);
      }
      break;
    }
  }
  return sim;
}

// -------------------------------------------------------------------- drawing

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function easeOutBack(t: number): number {
  const k = Math.max(0, Math.min(1, t));
  const c1 = 1.7;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
}

/** Fade in, hold, fade out - used for both the opening flash and a peek. */
function flashAlpha(t: number, dur: number): number {
  const fadeIn = Math.min(1, t / 0.2);
  const fadeOut = Math.min(1, Math.max(0, dur - t) / 0.2);
  return Math.max(0, Math.min(fadeIn, fadeOut));
}

function paintBackdrop(ctx: CanvasRenderingContext2D, cw: number, ch: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, ch);
  g.addColorStop(0, '#062e28');
  g.addColorStop(0.55, '#04211c');
  g.addColorStop(1, '#021410');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cw, ch);
}

function drawHud(ctx: CanvasRenderingContext2D, sim: Sim, boardW: number): void {
  ctx.font = '700 14px ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.fillText(`Words: ${sim.wordIndex}`, PAD, 20);
  ctx.textAlign = 'right';
  ctx.fillStyle = sim.streak >= 2 ? '#ffe86a' : 'rgba(255,255,255,0.75)';
  ctx.fillText(sim.streak >= 2 ? `Streak x${sim.streak}` : 'No streak yet', boardW - PAD, 20);
  ctx.textAlign = 'left';
}

/** The big word reveal, used both for the opening memorize flash and a Peek. */
function drawWordFlash(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
  boardW: number,
  boardH: number,
  caption: string,
  alpha: number,
): void {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;

  const top = HUD_H + 4;
  const panelH = boardH - top - PAD;
  ctx.fillStyle = 'rgba(2,20,16,0.94)';
  roundRect(ctx, PAD, top, boardW - PAD * 2, panelH, 16);
  ctx.fill();
  ctx.strokeStyle = 'rgba(63,214,176,0.85)';
  ctx.lineWidth = 2;
  roundRect(ctx, PAD, top, boardW - PAD * 2, panelH, 16);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '700 13px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(caption, boardW / 2, top + 24);

  const word = sim.target.word;
  const maxWidth = boardW - PAD * 2 - 20;
  let fontSize = 46;
  ctx.font = `800 ${fontSize}px ui-monospace, monospace`;
  while (fontSize > 16 && ctx.measureText(word).width > maxWidth) {
    fontSize -= 2;
    ctx.font = `800 ${fontSize}px ui-monospace, monospace`;
  }
  ctx.fillStyle = '#ffe86a';
  ctx.textBaseline = 'middle';
  ctx.fillText(word, boardW / 2, top + panelH / 2 + 10);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.restore();
}

/** The PEEK button - only live while actively spelling. */
function drawPeekButton(ctx: CanvasRenderingContext2D, sim: Sim, boardW: number): void {
  if (sim.phase !== 'playing') return;
  const r = peekButtonRect(boardW);
  const enabled = canUsePeek(sim.phase, sim.peeking, sim.peeksLeft);

  ctx.save();
  ctx.fillStyle = enabled ? 'rgba(63,214,176,0.22)' : 'rgba(255,255,255,0.06)';
  roundRect(ctx, r.x, r.y, r.w, r.h, 10);
  ctx.fill();
  ctx.strokeStyle = enabled ? 'rgba(63,214,176,0.85)' : 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 1.6;
  roundRect(ctx, r.x, r.y, r.w, r.h, 10);
  ctx.stroke();

  ctx.fillStyle = enabled ? '#3fd6b0' : 'rgba(255,255,255,0.4)';
  ctx.font = '700 13px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label = sim.peeksLeft > 0 ? `PEEK  x${sim.peeksLeft}` : 'PEEK';
  ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 1);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

function drawSlots(ctx: CanvasRenderingContext2D, sim: Sim): void {
  const len = sim.target.word.length;
  for (let i = 0; i < len; i += 1) {
    const c = slotCentre(i, len);
    const filled = i < sim.built.length;
    const isNewest = filled && i === sim.built.length - 1;
    const bump = isNewest ? 1 + (1 - easeOutBack(sim.popAnimT)) * 0.35 : 1;

    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.scale(bump, bump);
    ctx.fillStyle = filled ? 'rgba(255,232,106,0.16)' : 'rgba(255,255,255,0.06)';
    roundRect(ctx, -TILE / 2, -TILE / 2, TILE, TILE, 8);
    ctx.fill();
    ctx.strokeStyle = filled ? 'rgba(255,232,106,0.85)' : 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 2;
    roundRect(ctx, -TILE / 2, -TILE / 2, TILE, TILE, 8);
    ctx.stroke();

    if (filled) {
      ctx.fillStyle = '#ffe86a';
      ctx.font = `700 ${TILE * 0.5}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(sim.built[i], 0, 1);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
    ctx.restore();
  }
}

function drawTiles(ctx: CanvasRenderingContext2D, sim: Sim): void {
  const len = sim.tiles.length;
  for (let i = 0; i < len; i += 1) {
    const tile = sim.tiles[i];
    const anim = sim.tileAnim[i];
    if (anim.placed && anim.popT >= 1) continue; // fully zapped away

    const c = tileCentre(i, len);
    let x = c.x;
    const shakeK = anim.shakeT > 0 ? Math.sin(anim.shakeT * 70) * (1 - anim.shakeT / 0.26) : 0;
    x += shakeK * (TILE * 0.14);

    let scale = 1;
    let alpha = 1;
    if (anim.placed) {
      // Shrinks and fades as it "flies" into its answer slot.
      scale = 1 - anim.popT * 0.7;
      alpha = 1 - anim.popT;
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, c.y);
    ctx.scale(scale, scale);

    const overallShake = sim.shakeAll > 0 ? Math.sin(sim.time * 40) * sim.shakeAll : 0;
    ctx.translate(overallShake, 0);

    const g = ctx.createLinearGradient(0, -TILE / 2, 0, TILE / 2);
    g.addColorStop(0, '#3fd6b0');
    g.addColorStop(1, '#1f9e83');
    ctx.fillStyle = g;
    roundRect(ctx, -TILE / 2, -TILE / 2, TILE, TILE, 9);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.6;
    roundRect(ctx, -TILE / 2, -TILE / 2, TILE, TILE, 9);
    ctx.stroke();

    ctx.fillStyle = '#08221c';
    ctx.font = `700 ${TILE * 0.5}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tile.letter, 0, 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }
}

function drawBanner(ctx: CanvasRenderingContext2D, sim: Sim, boardW: number, boardH: number): void {
  if (sim.phase !== 'complete') return;
  const p = Math.min(1, sim.t / (sim.dur * 0.5));
  const cy = boardH / 2;
  ctx.save();
  ctx.globalAlpha = Math.min(1, p * 1.4);
  ctx.fillStyle = 'rgba(2,20,16,0.82)';
  roundRect(ctx, PAD, cy - 36, boardW - PAD * 2, 72, 14);
  ctx.fill();
  ctx.strokeStyle = 'rgba(63,214,176,0.85)';
  ctx.lineWidth = 2;
  roundRect(ctx, PAD, cy - 36, boardW - PAD * 2, 72, 14);
  ctx.stroke();
  ctx.fillStyle = '#3fd6b0';
  ctx.font = '700 18px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${sim.wordIndex} WORDS SPELLED!`, boardW / 2, cy + 6);
  ctx.textAlign = 'left';
  ctx.restore();
}

function draw(ctx: CanvasRenderingContext2D, sim: Sim, layout: Layout, cw: number, ch: number, dimmed: boolean): void {
  paintBackdrop(ctx, cw, ch);

  ctx.save();
  ctx.translate(layout.ox, layout.oy);
  ctx.scale(layout.scale, layout.scale);

  drawHud(ctx, sim, layout.boardW);

  if (sim.phase === 'flash') {
    drawWordFlash(ctx, sim, layout.boardW, layout.boardH, 'Memorize this word!', flashAlpha(sim.t, sim.dur));
  } else {
    drawPeekButton(ctx, sim, layout.boardW);
    drawSlots(ctx, sim);
    drawTiles(ctx, sim);
    drawBanner(ctx, sim, layout.boardW, layout.boardH);
    if (sim.peeking) {
      drawWordFlash(ctx, sim, layout.boardW, layout.boardH, 'Peek!', flashAlpha(sim.peekT, PEEK_SECONDS));
    }
  }

  for (const p of sim.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (const p of sim.popups) {
    ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
    ctx.fillStyle = p.color;
    ctx.font = '700 14px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(p.text, p.x, p.y);
    ctx.textAlign = 'left';
  }
  ctx.globalAlpha = 1;

  ctx.restore();

  if (dimmed) {
    ctx.fillStyle = 'rgba(1,10,8,0.6)';
    ctx.fillRect(0, 0, cw, ch);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '700 15px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', cw / 2, ch / 2);
    ctx.textAlign = 'left';
  }
}

// ------------------------------------------------------------------ component

export default function SpellingZap({ paused, input, api, restartToken, difficulty, controlsInset }: GameCanvasProps) {
  const simRef = useRef<Sim | null>(null);
  const seedRef = useRef(1);

  useEffect(() => {
    seedRef.current = (Date.now() ^ Math.imul(restartToken + 1, 2654435761)) >>> 0 || 1;
    simRef.current = null;
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
      let sim = simRef.current;
      if (!sim || sim.difficulty !== difficulty) {
        sim = makeSim(difficulty, seedRef.current);
        simRef.current = sim;
      }
      const layout = layoutFor(cw, ch, controlsInset, sim.tiles.length);

      if (paused) {
        if (!sim.dimmed || sim.lastW !== cw || sim.lastH !== ch) {
          draw(ctx, sim, layout, cw, ch, true);
          sim.dimmed = true;
          sim.lastW = cw;
          sim.lastH = ch;
        }
        return;
      }

      sim.dimmed = false;
      sim.lastW = cw;
      sim.lastH = ch;
      const next = update(sim, dt, input, api, layout, cw, ch);
      simRef.current = next;
      draw(ctx, next, layoutFor(cw, ch, controlsInset, next.tiles.length), cw, ch, false);
    },
  });

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />;
}
