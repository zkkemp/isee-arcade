'use client';

import { useEffect, useRef } from 'react';
import type { Difficulty } from '@/lib/difficulty';
import type { GameApi, GameCanvasProps } from '@/lib/games';
import type { InputController } from '@/lib/input';
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
 * Word Hunt - a word search built directly from the ISEE synonym vocabulary bank,
 * so finding a word doubles as seeing it in print one more time.
 *
 * There is no aggregate export of every vocab word (checked lib/questions/index.ts -
 * it re-exports only `./types`), so this file imports the six VOCAB_* range files
 * directly, same as index.ts itself does, and never copies the bank - it stays in
 * sync automatically as words are added to ab.ts..sz.ts.
 *
 * Everything above the component is pure: no canvas, no React, no Math.random.
 * `buildGrid`, `resolveLine`, `wordFromCells` and `matchSelection` are the real
 * functions the game runs, and scripts/check-wordhunt.ts drives them headlessly to
 * prove the three things that quietly ruin a word search:
 *
 *  1. A placed word that is not actually readable along the line it claims - off
 *     the edge of the grid, or clobbered by a later word crossing it with a
 *     different letter. The checker regenerates every placement's line from just
 *     its two endpoints via `resolveLine` and reads it back off the FINAL grid
 *     (after every word has been placed and the filler letters poured in), so any
 *     corruption from a later placement is caught, not just an isolated check of
 *     one word in isolation.
 *  2. A selection resolver that accepts a bent or knight-move drag as a straight
 *     line. `resolveLine` only accepts the 8 directions a real line can take
 *     (dr and dc equal, or either one zero) and returns null for anything else.
 *  3. A found selection crediting the wrong word, or crediting one twice.
 *     `matchSelection` checks a selection (read either direction, since a player
 *     may drag from either end of a placed word) against only the words not yet
 *     found, so a found word can never be re-credited.
 *
 * Art is drawn procedurally on canvas - no assets - and the grid, word list and
 * definitions banner are all laid out from the same pure `boardSize`/`layoutFor`
 * pair the checker exercises, so a layout change cannot silently move the board
 * out from under the input mapping.
 */

// ------------------------------------------------------------------ vocabulary

export type VocabWord = { word: string; hint: string };

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
 * Every vocab entry whose prompt is a bare A-Z word 3-8 letters long, deduped and
 * upper-cased, paired with its `.explain` as an optional definition/hint. Phrases,
 * hyphenated words and anything with spaces are skipped, exactly as instructed.
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
    out.push({ word: w, hint: q.explain });
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

// -------------------------------------------------------------------- geometry

export function idx(size: number, r: number, c: number): number {
  return r * size + c;
}
export function rowOf(size: number, i: number): number {
  return Math.floor(i / size);
}
export function colOf(size: number, i: number): number {
  return i % size;
}

export type Dir = { dr: number; dc: number };

/** Left-to-right, top-to-bottom, and the two diagonals that read the same way. */
export const FORWARD_DIRS: Dir[] = [
  { dr: 0, dc: 1 }, // E
  { dr: 1, dc: 0 }, // S
  { dr: 1, dc: 1 }, // SE
  { dr: -1, dc: 1 }, // NE
];

/** The reverse of each forward direction. Only used once a level unlocks them. */
export const BACKWARD_DIRS: Dir[] = FORWARD_DIRS.map((d) => ({ dr: -d.dr, dc: -d.dc }));

export const ALL_DIRS: Dir[] = [...FORWARD_DIRS, ...BACKWARD_DIRS];

export function hasAlphabetRun(letters: string[], size: number, length = 5): boolean {
  for (let r = 0; r < size; r += 1) for (let c = 0; c < size; c += 1) for (const dir of FORWARD_DIRS) {
    const chars: string[] = [];
    for (let i = 0; i < length; i += 1) {
      const rr = r + dir.dr * i; const cc = c + dir.dc * i;
      if (rr < 0 || rr >= size || cc < 0 || cc >= size) break;
      chars.push(letters[idx(size, rr, cc)]);
    }
    if (chars.length === length && chars.every((letter, i) => i === 0 || letter.charCodeAt(0) === chars[i - 1].charCodeAt(0) + 1)) return true;
  }
  return false;
}

// ------------------------------------------------------------------- placement

export type Placement = {
  word: string;
  hint: string;
  /** Cell indices in placement order (start to end). */
  cells: number[];
  dir: Dir;
  found: boolean;
  /** Stable index into the highlight palette, assigned once at placement time. */
  colorIndex: number;
};

export type Board = {
  size: number;
  /** Row-major, length size*size, every cell an uppercase A-Z letter. */
  letters: string[];
  placements: Placement[];
};

/** Would `word` fit starting at (r0,c0) heading `dir`, with no letter conflict? */
export function canPlace(
  cells: (string | null)[],
  size: number,
  word: string,
  r0: number,
  c0: number,
  dir: Dir,
): boolean {
  for (let i = 0; i < word.length; i += 1) {
    const r = r0 + dir.dr * i;
    const c = c0 + dir.dc * i;
    if (r < 0 || r >= size || c < 0 || c >= size) return false;
    const existing = cells[idx(size, r, c)];
    if (existing !== null && existing !== word[i]) return false;
  }
  return true;
}

/**
 * Deals a complete, seeded word-search board. Each deal retries the whole layout
 * rather than quietly dropping a target word, so the visible target list is
 * always exactly the set of words hidden in the grid.
 */
export function buildGrid(
  size: number,
  words: VocabWord[],
  rand: () => number,
  allowBackwards: boolean,
): Board {
  const dirs = allowBackwards ? ALL_DIRS : FORWARD_DIRS;
  let best: { cells: (string | null)[]; placements: Placement[] } | null = null;
  for (let deal = 0; deal < 192; deal += 1) {
    const cells: (string | null)[] = new Array(size * size).fill(null);
    const ordered = [...words];
    for (let i = ordered.length - 1; i > 0; i -= 1) { const j = Math.floor(rand() * (i + 1)); [ordered[i], ordered[j]] = [ordered[j], ordered[i]]; }
    ordered.sort((a, b) => b.word.length - a.word.length);
    const placements: Placement[] = [];
    for (const w of ordered) {
      const candidates: Array<{ r: number; c: number; dir: Dir }> = [];
      for (const dir of dirs) for (let r = 0; r < size; r += 1) for (let c = 0; c < size; c += 1) {
        if (canPlace(cells, size, w.word, r, c, dir)) candidates.push({ r, c, dir });
      }
      if (!candidates.length) break;
      const pick = candidates[Math.floor(rand() * candidates.length)];
      const placedCells: number[] = [];
      for (let i = 0; i < w.word.length; i += 1) { const at = idx(size, pick.r + pick.dir.dr * i, pick.c + pick.dir.dc * i); cells[at] = w.word[i]; placedCells.push(at); }
      placements.push({ word: w.word, hint: w.hint, cells: placedCells, dir: pick.dir, found: false, colorIndex: placements.length });
    }
    if (!best || placements.length > best.placements.length) best = { cells, placements };
    if (placements.length === words.length) {
      const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const letters: string[] = [];
      for (let at = 0; at < cells.length; at += 1) {
        const existing = cells[at];
        if (existing !== null) { letters.push(existing); continue; }
        let letter = 'Q';
        for (let pick = 0; pick < 20; pick += 1) {
          letter = ALPHA[Math.floor(rand() * ALPHA.length)];
          letters.push(letter);
          const alphabetic = hasAlphabetRun(letters.concat(cells.slice(at + 1).map((v) => v ?? 'Z')), size);
          letters.pop();
          if (!alphabetic) break;
        }
        letters.push(letter);
      }
      return { size, letters, placements };
    }
  }
  // Custom callers can request an impossible packing. Keep the board valid,
  // but production level specs are checked to always reach this branch's full-deal return.
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return { size, letters: best!.cells.map((c) => c ?? ALPHA[Math.floor(rand() * ALPHA.length)]), placements: best!.placements };
}

// --------------------------------------------------------------------- levels

export type LevelSpec = {
  level: number;
  size: number;
  wordCount: number;
  allowBackwards: boolean;
  seed: number;
};

const START_SIZE = 7;
const MAX_SIZE = 13;

/** Grows one row/column every two levels, capped so it always reads on a phone. */
export function sizeForLevel(level: number): number {
  const lv = Math.max(1, Math.floor(level));
  return Math.min(MAX_SIZE, START_SIZE + Math.floor((lv - 1) / 2));
}

/** Base word count before the difficulty offset. Non-decreasing, capped at 8. */
export function wordCountForLevel(level: number): number {
  const lv = Math.max(1, Math.floor(level));
  return Math.min(8, 3 + Math.floor((lv - 1) / 3));
}

const DIFF_WORD_OFFSET: Record<Difficulty, number> = { easy: -1, normal: 0, hard: 1 };
const DIFF_BACKWARDS_LEVEL: Record<Difficulty, number> = { easy: 6, normal: 4, hard: 2 };

export function backwardsAllowed(level: number, difficulty: Difficulty): boolean {
  return level >= DIFF_BACKWARDS_LEVEL[difficulty];
}

export function buildLevel(level: number, difficulty: Difficulty, seed: number): LevelSpec {
  const lv = Math.max(1, Math.floor(level));
  const size = sizeForLevel(lv);
  const wordCount = Math.max(3, Math.min(8, wordCountForLevel(lv) + DIFF_WORD_OFFSET[difficulty]));
  return {
    level: lv,
    size,
    wordCount,
    allowBackwards: backwardsAllowed(lv, difficulty),
    seed: (Math.imul(seed || 1, 2246822519) ^ Math.imul(lv, 0x9e3779b1)) >>> 0 || 1,
  };
}

/** Seeded pick of `count` distinct words no longer than `size`, from `pool`. */
export function pickWords(pool: VocabWord[], size: number, count: number, rand: () => number): VocabWord[] {
  const eligible = pool.filter((w) => w.word.length <= size);
  const arr = [...eligible];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr.slice(0, Math.min(count, arr.length));
}

export function makeBoard(spec: LevelSpec, pool: VocabWord[] = VOCAB_POOL): Board {
  const rand = lcg(spec.seed);
  const words = pickWords(pool, spec.size, spec.wordCount, rand);
  return buildGrid(spec.size, words, rand, spec.allowBackwards);
}

// ---------------------------------------------------------------- resolving

/**
 * Given two grid cells, the straight 8-direction line between them (inclusive),
 * or null if they are not on one of those 8 lines (a bent path or a knight move).
 */
export function resolveLine(size: number, aR: number, aC: number, bR: number, bC: number): number[] | null {
  if (aR === bR && aC === bC) return null;
  const dr = bR - aR;
  const dc = bC - aC;
  const straight = dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc);
  if (!straight) return null;

  const steps = Math.max(Math.abs(dr), Math.abs(dc));
  const stepR = Math.sign(dr);
  const stepC = Math.sign(dc);
  const cells: number[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const r = aR + stepR * i;
    const c = aC + stepC * i;
    if (r < 0 || r >= size || c < 0 || c >= size) return null;
    cells.push(idx(size, r, c));
  }
  return cells;
}

export function wordFromCells(letters: string[], cells: number[]): string {
  return cells.map((i) => letters[i]).join('');
}

/**
 * Whether `word` (read forwards or backwards, since a player may drag from
 * either end of a placed word) equals one of the still-outstanding targets.
 * Returns that target, or null. Callers pass only the not-yet-found words, so a
 * match can never point at a word that was already credited.
 */
export function matchSelection(word: string, remaining: readonly string[]): string | null {
  if (word.length < MIN_WORD_LEN) return null;
  const rev = word.split('').reverse().join('');
  for (const w of remaining) {
    if (w === word || w === rev) return w;
  }
  return null;
}

export function wordScore(word: string): number {
  return 20 + word.length * 8;
}

// -------------------------------------------------------------------- layout

const CELL = 34;
const PAD = 10;
const HUD_H = 40;
const WORD_ROW_H = 20;
const WORDS_PER_ROW = 2;
const LIST_PAD = 18;
const CAPTION_H = 34;

export type Layout = { scale: number; ox: number; oy: number; boardW: number; boardH: number };

/** Fixed board pixel size for a level's grid size and word count. */
export function boardSize(size: number, wordCount: number): { w: number; h: number } {
  const gridPx = size * CELL;
  const rows = Math.ceil(wordCount / WORDS_PER_ROW);
  const listH = rows * WORD_ROW_H + LIST_PAD;
  const w = Math.max(gridPx + PAD * 2, 250);
  const h = HUD_H + gridPx + PAD * 2 + listH + CAPTION_H;
  return { w, h };
}

/** Fits the fixed board into whatever the canvas turned out to be, and centres it. */
export function layoutFor(
  cw: number,
  ch: number,
  inset: number,
  size: number,
  wordCount: number,
): Layout {
  const { w: boardW, h: boardH } = boardSize(size, wordCount);
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

function gridX(): number {
  return PAD;
}
function gridY(): number {
  return HUD_H + PAD;
}
function cellX(c: number): number {
  return gridX() + c * CELL + CELL / 2;
}
function cellY(r: number): number {
  return gridY() + r * CELL + CELL / 2;
}

/** Normalised canvas coordinates to board-space pixels - the inverse of the draw transform. */
export function toBoard(layout: Layout, cw: number, ch: number, px: number, py: number): { x: number; y: number } {
  return { x: (px * cw - layout.ox) / layout.scale, y: (py * ch - layout.oy) / layout.scale };
}

/** Which grid cell a board-space point falls on, or null when it is off the grid. */
export function cellAt(bx: number, by: number, size: number): number | null {
  const col = Math.floor((bx - gridX()) / CELL);
  const row = Math.floor((by - gridY()) / CELL);
  if (row < 0 || row >= size || col < 0 || col >= size) return null;
  return idx(size, row, col);
}

/** Centre of a cell, in board units - the inverse of `cellAt`. */
export function cellCentre(index: number, size: number): { x: number; y: number } {
  return { x: cellX(colOf(size, index)), y: cellY(rowOf(size, index)) };
}

// ----------------------------------------------------------------- simulation
//
// Everything below is presentation only: timers, drag tracking, particles and
// drawing. Every decision that matters (is this a straight line, does it match a
// target word, has it already been found) always goes through the pure functions
// above.

type Phase = 'intro' | 'playing' | 'clear';

type Flash = { cells: number[]; ok: boolean; t: number };
type Popup = { x: number; y: number; text: string; t: number; life: number; color: string };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string };

export type Sim = {
  spec: LevelSpec;
  difficulty: Difficulty;
  board: Board;
  fx: () => number;
  remaining: Set<string>;
  phase: Phase;
  t: number;
  dur: number;
  dragStart: number;
  dragEnd: number;
  flash: Flash | null;
  popups: Popup[];
  particles: Particle[];
  captionText: string;
  captionT: number;
  time: number;
  dimmed: boolean;
  lastW: number;
  lastH: number;
};

export function makeSim(level: number, difficulty: Difficulty, seed: number): Sim {
  const spec = buildLevel(level, difficulty, seed);
  const board = makeBoard(spec);
  return {
    spec,
    difficulty,
    board,
    fx: lcg(spec.seed ^ 0x1d872b41),
    remaining: new Set(board.placements.map((p) => p.word)),
    phase: 'intro',
    t: 0,
    dur: 0.4,
    dragStart: -1,
    dragEnd: -1,
    flash: null,
    popups: [],
    particles: [],
    captionText: '',
    captionT: 0,
    time: 0,
    dimmed: false,
    lastW: 0,
    lastH: 0,
  };
}

const PALETTE = ['#ff6fb5', '#5ec8ff', '#ffd75e', '#63c637', '#9a5cf0', '#ff8f5d', '#28d2b2', '#f2415f'];

function placementColor(p: Placement): string {
  return PALETTE[p.colorIndex % PALETTE.length];
}

function computeCandidateCell(
  sim: Sim,
  layout: Layout,
  cw: number,
  ch: number,
  input: InputController,
): number | null {
  if (input.pointerX === null || input.pointerY === null) return null;
  const b = toBoard(layout, cw, ch, input.pointerX, input.pointerY);
  return cellAt(b.x, b.y, sim.board.size);
}

function spawnFoundParticles(sim: Sim, cells: number[], color: string): void {
  const size = sim.board.size;
  for (const i of cells) {
    const x = cellX(colOf(size, i));
    const y = cellY(rowOf(size, i));
    for (let k = 0; k < 4; k += 1) {
      if (sim.particles.length > 260) break;
      const a = sim.fx() * Math.PI * 2;
      const sp = 20 + sim.fx() * 50;
      sim.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 20,
        life: 0.4 + sim.fx() * 0.3,
        max: 0.7,
        color,
      });
    }
  }
}

function addPopup(sim: Sim, x: number, y: number, text: string, color: string): void {
  sim.popups.push({ x, y, text, t: 0, life: 0.9, color });
}

function releaseSelection(sim: Sim, api: GameApi): void {
  const size = sim.board.size;
  if (sim.dragStart >= 0 && sim.dragEnd >= 0 && sim.dragStart !== sim.dragEnd) {
    const cells = resolveLine(
      size,
      rowOf(size, sim.dragStart),
      colOf(size, sim.dragStart),
      rowOf(size, sim.dragEnd),
      colOf(size, sim.dragEnd),
    );
    if (cells) {
      const word = wordFromCells(sim.board.letters, cells);
      const matched = matchSelection(word, [...sim.remaining]);
      if (matched) {
        sim.remaining.delete(matched);
        const placement = sim.board.placements.find((p) => p.word === matched);
        const color = placement ? placementColor(placement) : '#ffffff';
        if (placement) placement.found = true;

        const gained = wordScore(matched);
        api.addScore(gained);
        playSound('correct');
        sim.flash = { cells, ok: true, t: 0 };
        spawnFoundParticles(sim, cells, color);

        const cx = cells.reduce((s, i) => s + cellX(colOf(size, i)), 0) / cells.length;
        const cy = cells.reduce((s, i) => s + cellY(rowOf(size, i)), 0) / cells.length;
        addPopup(sim, cx, cy - CELL * 0.5, `+${gained}`, '#ffe86a');

        if (placement?.hint) {
          sim.captionText = `${matched} — ${placement.hint}`;
          sim.captionT = 4.5;
        }
      } else {
        playSound('wrong');
        sim.flash = { cells, ok: false, t: 0 };
      }
    }
  }
  sim.dragStart = -1;
  sim.dragEnd = -1;
}

function advanceEffects(sim: Sim, dt: number): void {
  if (sim.flash) {
    sim.flash.t += dt;
    if (sim.flash.t > 0.5) sim.flash = null;
  }
  for (const p of sim.popups) {
    p.t += dt;
    p.y -= 18 * dt;
  }
  sim.popups = sim.popups.filter((p) => p.t < p.life);
  for (const p of sim.particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 200 * dt;
  }
  sim.particles = sim.particles.filter((p) => p.life > 0);
  if (sim.captionT > 0) sim.captionT = Math.max(0, sim.captionT - dt);
}

/**
 * One frame of game logic. Returns the sim to use next frame - a fresh, bigger
 * one once the "level cleared" banner finishes, same pattern Match3 uses so the
 * next board is dealt already waiting behind the study gate.
 */
export function update(
  sim: Sim,
  dt: number,
  input: InputController,
  api: GameApi,
  layout: Layout,
  cw: number,
  ch: number,
  difficulty: Difficulty,
  seed: number,
): Sim {
  sim.time += dt;
  advanceEffects(sim, dt);

  switch (sim.phase) {
    case 'intro': {
      sim.t += dt;
      if (sim.t >= sim.dur) {
        sim.phase = 'playing';
        api.setStatus(`Level ${sim.spec.level} — find ${sim.board.placements.length} words`);
      }
      break;
    }

    case 'playing': {
      const pressed = input.consumePointerPress();
      const released = input.consumePointerRelease();
      if (pressed) {
        const cell = computeCandidateCell(sim, layout, cw, ch, input);
        if (cell !== null) {
          sim.dragStart = cell;
          sim.dragEnd = cell;
          playSound('click');
        }
      }
      if (sim.dragStart >= 0 && (input.pointerDown || released)) {
        const cand = computeCandidateCell(sim, layout, cw, ch, input);
        if (cand !== null) {
          const size = sim.board.size;
          const isLine =
            cand === sim.dragStart ||
            resolveLine(size, rowOf(size, sim.dragStart), colOf(size, sim.dragStart), rowOf(size, cand), colOf(size, cand)) !==
              null;
          if (isLine) sim.dragEnd = cand;
        }
      }

      if (released && sim.dragStart >= 0) {
        releaseSelection(sim, api);
      }

      if (sim.remaining.size === 0) {
        sim.phase = 'clear';
        sim.t = 0;
        sim.dur = 1.1;
        playSound('levelClear');
      }
      break;
    }

    case 'clear': {
      sim.t += dt;
      if (sim.t >= sim.dur) {
        const cleared = sim.spec.level;
        const found = sim.board.placements.length;
        api.requestGate(`Level ${cleared} cleared — ${found} word${found === 1 ? '' : 's'} found!`);
        return makeSim(cleared + 1, difficulty, seed);
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

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
      if (lines.length >= maxLines - 1) break;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) lines.length = maxLines;
  return lines;
}

function paintBackdrop(ctx: CanvasRenderingContext2D, cw: number, ch: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, ch);
  g.addColorStop(0, '#3a1e08');
  g.addColorStop(0.55, '#241206');
  g.addColorStop(1, '#160b03');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cw, ch);
}

function drawGrid(ctx: CanvasRenderingContext2D, sim: Sim): void {
  const size = sim.board.size;
  const gx = gridX();
  const gy = gridY();

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  roundRect(ctx, gx - 4, gy - 4, size * CELL + 8, size * CELL + 8, 12);
  ctx.fill();

  // Tile backdrop.
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      ctx.fillStyle = (r + c) % 2 === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)';
      roundRect(ctx, gx + c * CELL + 1, gy + r * CELL + 1, CELL - 2, CELL - 2, 5);
      ctx.fill();
    }
  }

  // Found-word highlight bands, drawn under the letters.
  for (const p of sim.board.placements) {
    if (!p.found) continue;
    const color = placementColor(p);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = CELL * 0.62;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cellX(colOf(size, p.cells[0])), cellY(rowOf(size, p.cells[0])));
    ctx.lineTo(cellX(colOf(size, p.cells[p.cells.length - 1])), cellY(rowOf(size, p.cells[p.cells.length - 1])));
    ctx.stroke();
    ctx.restore();
  }

  // Live drag preview.
  if (sim.dragStart >= 0 && sim.dragEnd >= 0) {
    const line = resolveLine(size, rowOf(size, sim.dragStart), colOf(size, sim.dragStart), rowOf(size, sim.dragEnd), colOf(size, sim.dragEnd));
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = CELL * 0.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cellX(colOf(size, sim.dragStart)), cellY(rowOf(size, sim.dragStart)));
    const end = line ? sim.dragEnd : sim.dragStart;
    ctx.lineTo(cellX(colOf(size, end)), cellY(rowOf(size, end)));
    ctx.stroke();
    ctx.restore();
  }

  // Flash for the just-resolved selection.
  if (sim.flash) {
    const k = Math.max(0, 1 - sim.flash.t / 0.5);
    ctx.save();
    ctx.strokeStyle = sim.flash.ok ? 'rgba(120,255,150,0.9)' : 'rgba(255,120,120,0.75)';
    ctx.globalAlpha = k;
    ctx.lineWidth = CELL * 0.66;
    ctx.lineCap = 'round';
    const a = sim.flash.cells[0];
    const b = sim.flash.cells[sim.flash.cells.length - 1];
    ctx.beginPath();
    ctx.moveTo(cellX(colOf(size, a)), cellY(rowOf(size, a)));
    ctx.lineTo(cellX(colOf(size, b)), cellY(rowOf(size, b)));
    ctx.stroke();
    ctx.restore();
  }

  // Letters on top.
  ctx.font = `700 ${CELL * 0.48}px ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < sim.board.letters.length; i += 1) {
    const r = rowOf(size, i);
    const c = colOf(size, i);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillText(sim.board.letters[i], cellX(c), cellY(r) + 1);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

function drawWordList(ctx: CanvasRenderingContext2D, sim: Sim, listY: number, boardW: number): void {
  const words = [...sim.board.placements].sort((a, b) => a.word.localeCompare(b.word));
  const colW = (boardW - PAD * 2) / WORDS_PER_ROW;
  ctx.font = `600 13px ui-sans-serif, system-ui, sans-serif`;
  words.forEach((p, i) => {
    const col = i % WORDS_PER_ROW;
    const row = Math.floor(i / WORDS_PER_ROW);
    const x = PAD + col * colW;
    const y = listY + row * WORD_ROW_H + 14;
    ctx.fillStyle = p.found ? 'rgba(255,255,255,0.4)' : placementColor(p);
    ctx.fillText(p.word, x, y);
    if (p.found) {
      const w = ctx.measureText(p.word).width;
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x - 2, y - 4);
      ctx.lineTo(x + w + 2, y - 4);
      ctx.stroke();
    }
  });
}

function drawHud(ctx: CanvasRenderingContext2D, sim: Sim, boardW: number): void {
  const found = sim.board.placements.filter((p) => p.found).length;
  ctx.font = `700 15px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.fillText(`Level ${sim.spec.level}`, PAD, 24);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(`${found} / ${sim.board.placements.length} found`, boardW - PAD, 24);
  ctx.textAlign = 'left';
}

function drawCaption(ctx: CanvasRenderingContext2D, sim: Sim, y: number, boardW: number): void {
  if (sim.captionT <= 0 || !sim.captionText) return;
  const alpha = Math.min(1, sim.captionT / 0.6);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `500 11px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.textAlign = 'center';
  const lines = wrapLines(ctx, sim.captionText, boardW - PAD * 2, 2);
  lines.forEach((line, i) => ctx.fillText(line, boardW / 2, y + 12 + i * 14));
  ctx.textAlign = 'left';
  ctx.restore();
}

function drawBanner(ctx: CanvasRenderingContext2D, sim: Sim, boardW: number, gridBottom: number): void {
  if (sim.phase !== 'clear') return;
  const p = Math.min(1, sim.t / (sim.dur * 0.5));
  const cy = gridY() + (gridBottom - gridY()) / 2;
  ctx.save();
  ctx.globalAlpha = Math.min(1, p * 1.4);
  ctx.fillStyle = 'rgba(20,12,4,0.78)';
  roundRect(ctx, PAD, cy - 34, boardW - PAD * 2, 68, 14);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,224,106,0.8)';
  ctx.lineWidth = 2;
  roundRect(ctx, PAD, cy - 34, boardW - PAD * 2, 68, 14);
  ctx.stroke();
  ctx.fillStyle = '#ffe86a';
  ctx.font = '700 18px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ALL WORDS FOUND!', boardW / 2, cy + 6);
  ctx.textAlign = 'left';
  ctx.restore();
}

function draw(ctx: CanvasRenderingContext2D, sim: Sim, layout: Layout, cw: number, ch: number, dimmed: boolean): void {
  paintBackdrop(ctx, cw, ch);

  ctx.save();
  ctx.translate(layout.ox, layout.oy);
  ctx.scale(layout.scale, layout.scale);
  ctx.globalAlpha = sim.phase === 'intro' ? sim.t / sim.dur : 1;

  drawHud(ctx, sim, layout.boardW);
  drawGrid(ctx, sim);

  const listY = gridY() + sim.board.size * CELL + PAD;
  drawWordList(ctx, sim, listY, layout.boardW);

  const rows = Math.ceil(sim.board.placements.length / WORDS_PER_ROW);
  const captionY = listY + rows * WORD_ROW_H + 6;
  drawCaption(ctx, sim, captionY, layout.boardW);

  drawBanner(ctx, sim, layout.boardW, gridY() + sim.board.size * CELL);

  for (const p of sim.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
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
    ctx.fillStyle = 'rgba(6,3,1,0.6)';
    ctx.fillRect(0, 0, cw, ch);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '700 15px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', cw / 2, ch / 2);
    ctx.textAlign = 'left';
  }
}

// ------------------------------------------------------------------ component

export default function WordHunt({ paused, input, api, restartToken, difficulty, controlsInset }: GameCanvasProps) {
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
        sim = makeSim(1, difficulty, seedRef.current);
        simRef.current = sim;
      }
      const layout = layoutFor(cw, ch, controlsInset, sim.board.size, sim.board.placements.length);

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
      const next = update(sim, dt, input, api, layout, cw, ch, difficulty, seedRef.current);
      simRef.current = next;
      draw(ctx, next, layoutFor(cw, ch, controlsInset, next.board.size, next.board.placements.length), cw, ch, false);
    },
  });

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />;
}
