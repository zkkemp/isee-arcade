'use client';

import { useEffect, useRef } from 'react';
import type { Difficulty } from '@/lib/difficulty';
import type { GameCanvasProps } from '@/lib/games';
import { playSound, unlockAudio } from '@/lib/sound';
import { useCanvasGame } from '@/lib/useCanvasGame';

/**
 * Dots & Boxes - the classic pencil game, built on the 'board' control scheme
 * (see components/games/TicTacToe.tsx, the reference for that scheme). Board
 * games are turn-based, so this component attaches its own pointer handler
 * straight to its canvas and runs its own turn logic rather than using the
 * swipe overlay or the dpad. It still respects `paused` and `restartToken`.
 *
 * Players take turns drawing one edge between two adjacent dots. Completing
 * the 4th side of a box claims that box (and grants the mover another turn);
 * whoever holds the most boxes when the grid is full wins. Two modes from an
 * in-canvas menu: two players pass-and-play, or one player against the
 * computer, plus a small size chooser (3x3 / 4x4 / 5x5 boxes).
 *
 * Everything above the component is pure - no canvas, no React - and
 * scripts/check-dotsboxes.ts drives the exact same edge model and CPU policy
 * the game runs, proving box-claiming, double completions, game-end, and the
 * computer's "take a free box, else do not give one away" policy all hold.
 */

// --- pure rules --------------------------------------------------------------

/** 0 = undrawn/unclaimed, 1/2 = drawn or claimed by that player. */
export type Cell = 0 | 1 | 2;
export type EdgeType = 'h' | 'v';
export type Edge = { type: EdgeType; r: number; c: number };

export type BoxState = {
  rows: number;
  cols: number;
  /** Horizontal edges: (rows+1) x cols. h[r][c] is the top edge of box (r,c). */
  h: Cell[][];
  /** Vertical edges: rows x (cols+1). v[r][c] is the left edge of box (r,c). */
  v: Cell[][];
  /** Box ownership: rows x cols. */
  boxes: Cell[][];
};

export function emptyBoxState(rows: number, cols: number): BoxState {
  const h: Cell[][] = [];
  for (let r = 0; r <= rows; r += 1) h.push(new Array<Cell>(cols).fill(0));
  const v: Cell[][] = [];
  for (let r = 0; r < rows; r += 1) v.push(new Array<Cell>(cols + 1).fill(0));
  const boxes: Cell[][] = [];
  for (let r = 0; r < rows; r += 1) boxes.push(new Array<Cell>(cols).fill(0));
  return { rows, cols, h, v, boxes };
}

export function totalEdgeCount(rows: number, cols: number): number {
  return (rows + 1) * cols + rows * (cols + 1);
}

export function drawnEdgeCount(s: BoxState): number {
  let n = 0;
  for (const row of s.h) for (const e of row) if (e !== 0) n += 1;
  for (const row of s.v) for (const e of row) if (e !== 0) n += 1;
  return n;
}

export function isEdgeDrawn(s: BoxState, e: Edge): boolean {
  return e.type === 'h' ? s.h[e.r][e.c] !== 0 : s.v[e.r][e.c] !== 0;
}

/** The box(es) (row,col) adjacent to an edge, within grid bounds - 1 or 2 of them. */
export function affectedBoxes(e: Edge, rows: number, cols: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  if (e.type === 'h') {
    if (e.r - 1 >= 0) out.push([e.r - 1, e.c]); // box above this edge
    if (e.r < rows) out.push([e.r, e.c]); // box below this edge
  } else {
    if (e.c - 1 >= 0) out.push([e.r, e.c - 1]); // box left of this edge
    if (e.c < cols) out.push([e.r, e.c]); // box right of this edge
  }
  return out;
}

/** How many of box (r,c)'s 4 edges are currently drawn (0..4). */
export function boxEdgeCount(s: BoxState, r: number, c: number): number {
  let n = 0;
  if (s.h[r][c] !== 0) n += 1;
  if (s.h[r + 1][c] !== 0) n += 1;
  if (s.v[r][c] !== 0) n += 1;
  if (s.v[r][c + 1] !== 0) n += 1;
  return n;
}

/** Box(es) that would newly complete if `e` were drawn right now (0, 1, or 2). */
export function wouldCompleteBoxes(s: BoxState, e: Edge): Array<[number, number]> {
  if (isEdgeDrawn(s, e)) return [];
  const out: Array<[number, number]> = [];
  for (const [r, c] of affectedBoxes(e, s.rows, s.cols)) {
    if (s.boxes[r][c] === 0 && boxEdgeCount(s, r, c) === 3) out.push([r, c]);
  }
  return out;
}

/** Box(es) that would become 3-sided (a free box for the opponent) if `e` were drawn. */
export function givesAwayBoxes(s: BoxState, e: Edge): Array<[number, number]> {
  if (isEdgeDrawn(s, e)) return [];
  const out: Array<[number, number]> = [];
  for (const [r, c] of affectedBoxes(e, s.rows, s.cols)) {
    if (s.boxes[r][c] === 0 && boxEdgeCount(s, r, c) === 2) out.push([r, c]);
  }
  return out;
}

export function listUndrawnEdges(s: BoxState): Edge[] {
  const out: Edge[] = [];
  for (let r = 0; r <= s.rows; r += 1) {
    for (let c = 0; c < s.cols; c += 1) if (s.h[r][c] === 0) out.push({ type: 'h', r, c });
  }
  for (let r = 0; r < s.rows; r += 1) {
    for (let c = 0; c <= s.cols; c += 1) if (s.v[r][c] === 0) out.push({ type: 'v', r, c });
  }
  return out;
}

export type AddEdgeResult = { ok: boolean; completed: Array<[number, number]>; goAgain: boolean };

/**
 * Draws `e` for `mover`, claiming any box(es) it newly completes. `goAgain` is
 * true whenever at least one box was completed - the mover plays again. An
 * already-drawn edge is a no-op (`ok: false`), never mutated.
 */
export function addEdge(s: BoxState, e: Edge, mover: 1 | 2): AddEdgeResult {
  if (isEdgeDrawn(s, e)) return { ok: false, completed: [], goAgain: false };
  const completed = wouldCompleteBoxes(s, e);
  if (e.type === 'h') s.h[e.r][e.c] = mover;
  else s.v[e.r][e.c] = mover;
  for (const [r, c] of completed) s.boxes[r][c] = mover;
  return { ok: true, completed, goAgain: completed.length > 0 };
}

export function boxesCompletedBy(s: BoxState, player: 1 | 2): number {
  let n = 0;
  for (const row of s.boxes) for (const b of row) if (b === player) n += 1;
  return n;
}

export function isFull(s: BoxState): boolean {
  return drawnEdgeCount(s) === totalEdgeCount(s.rows, s.cols);
}

/** More boxes wins; 0 = tie. Only meaningful once the grid `isFull`. */
export function winnerOf(s: BoxState): Cell {
  const p1 = boxesCompletedBy(s, 1);
  const p2 = boxesCompletedBy(s, 2);
  if (p1 > p2) return 1;
  if (p2 > p1) return 2;
  return 0;
}

export const OTHER: Record<1 | 2, 1 | 2> = { 1: 2, 2: 1 };

/** Seeded LCG, so nothing here ever touches Math.random. */
export function lcg(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];
}

/**
 * Computer policy: always take a move that completes a box (preferring one
 * that completes two at once); otherwise, with probability `safeChance`,
 * avoid handing the opponent a free box; otherwise play a legal edge at
 * random. `safeChance` is the difficulty dial - a low-skill computer
 * sometimes hands away a box anyway. rng is injected so the checker can
 * drive it deterministically.
 */
export function chooseCpuEdge(s: BoxState, rng: () => number, safeChance = 1): Edge | null {
  const all = listUndrawnEdges(s);
  if (all.length === 0) return null;

  let bestCompleting: Edge | null = null;
  let bestN = 0;
  for (const e of all) {
    const n = wouldCompleteBoxes(s, e).length;
    if (n > bestN || (n > 0 && n === bestN && rng() < 0.5)) {
      bestN = n;
      bestCompleting = e;
    }
  }
  if (bestCompleting && bestN > 0) return bestCompleting;

  if (rng() < safeChance) {
    const safe = all.filter((e) => givesAwayBoxes(s, e).length === 0);
    if (safe.length > 0) return pick(rng, safe);
  }
  return pick(rng, all);
}

/** Chance the computer plays it safe (avoids gifting a box) when it can, per difficulty. */
export const CPU_SAFE_CHANCE: Record<Difficulty, number> = {
  easy: 0.3,
  normal: 0.7,
  hard: 1,
};

// --- layout / hit-testing -----------------------------------------------------

const TOP = 52; // top bar for the mode / score / turn readout

type Layout = { ox: number; oy: number; cell: number; rows: number; cols: number };

function layoutFor(cw: number, ch: number, inset: number, rows: number, cols: number): Layout {
  const availH = Math.max(1, ch - inset - TOP);
  const cell = Math.max(1, Math.min((cw * 0.86) / cols, (availH * 0.86) / rows));
  const gw = cell * cols;
  const gh = cell * rows;
  return { ox: (cw - gw) / 2, oy: TOP + (availH - gh) / 2, cell, rows, cols };
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  const qx = x1 + t * dx;
  const qy = y1 + t * dy;
  return Math.hypot(px - qx, py - qy);
}

/** The nearest edge to a canvas-space point, or null if nothing is close enough. */
export function edgeAtPoint(l: Layout, x: number, y: number): Edge | null {
  let best: Edge | null = null;
  let bestD = Infinity;

  for (let r = 0; r <= l.rows; r += 1) {
    for (let c = 0; c < l.cols; c += 1) {
      const x1 = l.ox + c * l.cell;
      const y1 = l.oy + r * l.cell;
      const d = distToSegment(x, y, x1, y1, x1 + l.cell, y1);
      if (d < bestD) {
        bestD = d;
        best = { type: 'h', r, c };
      }
    }
  }
  for (let r = 0; r < l.rows; r += 1) {
    for (let c = 0; c <= l.cols; c += 1) {
      const x1 = l.ox + c * l.cell;
      const y1 = l.oy + r * l.cell;
      const d = distToSegment(x, y, x1, y1, x1, y1 + l.cell);
      if (d < bestD) {
        bestD = d;
        best = { type: 'v', r, c };
      }
    }
  }

  const threshold = l.cell * 0.38;
  return best && bestD <= threshold ? best : null;
}

// --- state -------------------------------------------------------------------

type Mode = 'cpu' | '2p';
type Phase = 'menu' | 'play' | 'over';
const SIZES = [3, 4, 5] as const;
type Size = (typeof SIZES)[number];
const SIZE_LABELS: Record<Size, string> = { 3: 'Small', 4: 'Medium', 5: 'Large' };

type State = {
  mode: Mode;
  phase: Phase;
  size: Size;
  /** Chosen on the menu before a match starts; the running match keeps `size`. */
  sizeChoice: Size;
  box: BoxState;
  turn: 1 | 2;
  /** The human's mark in cpu mode. Alternates each new match. */
  human: 1 | 2;
  /** Seconds until the computer plays, so its move is not instant. */
  cpuWait: number;
  /** Per-box claim pop, seconds since claimed (>=99 means settled/unclaimed). */
  boxPop: number[][];
  resultMsg: string;
  overT: number;
  time: number;
};

function freshGame(s: State): void {
  s.size = s.sizeChoice;
  s.box = emptyBoxState(s.size, s.size);
  s.turn = 1;
  s.cpuWait = 0;
  s.overT = 0;
  s.resultMsg = '';
  s.boxPop = Array.from({ length: s.size }, () => new Array<number>(s.size).fill(99));
}

function startMatch(s: State, mode: Mode): void {
  s.mode = mode;
  s.phase = 'play';
  freshGame(s);
  if (mode === 'cpu') {
    // Alternate who is player 1 (moves first), so the computer opens every
    // other game and the child is not always reacting.
    s.human = s.human === 1 ? 2 : 1;
    if (s.human === 2) s.cpuWait = 0.5; // computer is player 1, opens
  }
}

function initialState(): State {
  const size: Size = 4;
  return {
    mode: 'cpu',
    phase: 'menu',
    size,
    sizeChoice: size,
    box: emptyBoxState(size, size),
    turn: 1,
    human: 2, // so the first cpu match flips to human = 1 (child opens)
    cpuWait: 0,
    boxPop: Array.from({ length: size }, () => new Array<number>(size).fill(99)),
    resultMsg: '',
    overT: 0,
    time: 0,
  };
}

// --- component -----------------------------------------------------------------

type GameApi = GameCanvasProps['api'];

const P1 = '#5ec8ff';
const P2 = '#ff8f5d';

type Rect = { x: number; y: number; w: number; h: number };

function menuLayout(cw: number, ch: number): { chips: (Rect & { size: Size })[]; buttons: (Rect & { mode: Mode })[] } {
  const chipW = Math.min(cw * 0.26, 130);
  const chipH = Math.min(ch * 0.09, 60);
  const gap = 14;
  const totalW = chipW * 3 + gap * 2;
  const startX = cw / 2 - totalW / 2;
  const chipY = ch * 0.34;
  const chips = SIZES.map((size, i) => ({
    x: startX + i * (chipW + gap),
    y: chipY,
    w: chipW,
    h: chipH,
    size,
  }));

  const bw = Math.min(cw * 0.4, 260);
  const bh = Math.min(ch * 0.28, 200);
  const by = ch * 0.54;
  const buttons: (Rect & { mode: Mode })[] = [
    { x: cw / 2 - bw - 12, y: by, w: bw, h: bh, mode: '2p' },
    { x: cw / 2 + 12, y: by, w: bw, h: bh, mode: 'cpu' },
  ];
  return { chips, buttons };
}

function inRect(x: number, y: number, r: Rect): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export default function DotsBoxes({
  paused,
  api,
  restartToken,
  difficulty,
  controlsInset,
}: GameCanvasProps) {
  const stateRef = useRef<State>(initialState());
  const layoutRef = useRef<Layout>({ ox: 0, oy: 0, cell: 1, rows: 4, cols: 4 });
  const rngRef = useRef<() => number>(lcg(1));

  useEffect(() => {
    rngRef.current = lcg((Date.now() ^ Math.imul(restartToken + 1, 2654435761)) >>> 0 || 1);
    stateRef.current = initialState();
  }, [restartToken]);

  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  const resolveResult = (s: State, api: GameApi): void => {
    const p1 = boxesCompletedBy(s.box, 1);
    const p2 = boxesCompletedBy(s.box, 2);

    if (s.mode === 'cpu') {
      const cpuPlayer = OTHER[s.human];
      const humanB = s.human === 1 ? p1 : p2;
      const cpuB = cpuPlayer === 1 ? p1 : p2;
      if (humanB > cpuB) {
        const margin = humanB - cpuB;
        playSound('levelClear');
        api.addScore(Math.round(25 + margin * 8));
        s.resultMsg = 'You win!';
        api.setStatus(s.resultMsg);
      } else if (humanB === cpuB) {
        playSound('pass');
        api.addScore(15);
        s.resultMsg = "It's a tie!";
        api.setStatus(s.resultMsg);
      } else {
        s.resultMsg = 'Computer wins';
        api.died('Computer wins');
      }
    } else if (p1 === p2) {
      playSound('pass');
      api.addScore(15);
      s.resultMsg = "It's a tie!";
      api.setStatus(s.resultMsg);
    } else {
      const winner = p1 > p2 ? 1 : 2;
      const margin = Math.abs(p1 - p2);
      playSound('levelClear');
      api.addScore(Math.round(30 + margin * 5));
      s.resultMsg = `Player ${winner} wins!`;
      api.setStatus(s.resultMsg);
    }
  };

  const place = (s: State, e: Edge, mover: 1 | 2, api: GameApi): void => {
    const res = addEdge(s.box, e, mover);
    if (!res.ok) return;
    for (const [r, c] of res.completed) s.boxPop[r][c] = 0;
    playSound(res.completed.length > 0 ? 'coin' : 'click', res.completed.length);

    if (isFull(s.box)) {
      s.phase = 'over';
      s.overT = 0;
      resolveResult(s, api);
      return;
    }
    if (!res.goAgain) s.turn = OTHER[mover];
    if (s.mode === 'cpu' && s.turn !== s.human) s.cpuWait = res.goAgain ? 0.55 : 0.45;
  };

  const onTap = (sx: number, sy: number, cw: number, ch: number): void => {
    const s = stateRef.current;
    if (paused) return;
    unlockAudio();

    if (s.phase === 'menu') {
      const { chips, buttons } = menuLayout(cw, ch);
      for (const chip of chips) {
        if (inRect(sx, sy, chip)) {
          s.sizeChoice = chip.size;
          playSound('click');
          return;
        }
      }
      for (const btn of buttons) {
        if (inRect(sx, sy, btn)) {
          startMatch(s, btn.mode);
          playSound('powerup');
          return;
        }
      }
      return;
    }

    if (s.phase === 'over') {
      // A tap on the small "Menu" chip top-left returns to the picker; anywhere
      // else replays the same mode and size.
      if (sx < 96 && sy < TOP) {
        s.phase = 'menu';
        playSound('click');
      } else {
        startMatch(s, s.mode);
        playSound('powerup');
      }
      return;
    }

    // phase play
    if (sx < 96 && sy < TOP) {
      s.phase = 'menu';
      playSound('click');
      return;
    }
    if (s.mode === 'cpu' && s.turn !== s.human) return; // not your turn
    const l = layoutRef.current;
    const e = edgeAtPoint(l, sx, sy);
    if (!e || isEdgeDrawn(s.box, e)) return;
    place(s, e, s.turn, api);
  };

  const { canvasRef } = useCanvasGame({
    active: true,
    step: (ctx, dt, cw, ch) => {
      const s = stateRef.current;
      const l = layoutFor(cw, ch, controlsInset, s.size, s.size);
      layoutRef.current = l;

      if (!paused) {
        s.time += dt;
        for (let r = 0; r < s.size; r += 1) {
          for (let c = 0; c < s.size; c += 1) if (s.boxPop[r][c] < 99) s.boxPop[r][c] += dt;
        }
        if (s.phase === 'over') s.overT += dt;

        // The computer's move, after a short beat so it does not feel instant.
        // It keeps moving (with the same short beat) while it keeps completing
        // boxes, since goAgain leaves the turn on the computer.
        if (s.phase === 'play' && s.mode === 'cpu' && s.turn !== s.human && s.cpuWait > 0) {
          s.cpuWait -= dt;
          if (s.cpuWait <= 0) {
            const cpu = s.turn;
            const e = chooseCpuEdge(s.box, rngRef.current, CPU_SAFE_CHANCE[difficulty]);
            if (e && !isEdgeDrawn(s.box, e)) place(s, e, cpu, api);
          }
        }
      }

      draw(ctx, s, l, cw, ch, paused);
    },
  });

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full touch-none"
      onPointerDown={(e) => {
        e.preventDefault();
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        onTap(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
      }}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}

// --- drawing ---------------------------------------------------------------

function draw(
  ctx: CanvasRenderingContext2D,
  s: State,
  l: Layout,
  cw: number,
  ch: number,
  paused: boolean,
): void {
  ctx.clearRect(0, 0, cw, ch);
  const bg = ctx.createLinearGradient(0, 0, 0, ch);
  bg.addColorStop(0, '#141426');
  bg.addColorStop(1, '#0d0d1a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, cw, ch);

  if (s.phase === 'menu') {
    drawMenu(ctx, cw, ch, s.sizeChoice);
    if (paused) dim(ctx, cw, ch);
    return;
  }

  drawTopBar(ctx, s, cw);
  drawBoard(ctx, s, l);
  if (s.phase === 'over') drawOver(ctx, s, cw, ch);
  if (paused) dim(ctx, cw, ch);
}

function drawMenu(ctx: CanvasRenderingContext2D, cw: number, ch: number, sizeChoice: Size): void {
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${Math.min(38, cw * 0.1)}px system-ui, sans-serif`;
  ctx.fillText('Dots & Boxes', cw / 2, ch * 0.16);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `600 ${Math.min(17, cw * 0.042)}px system-ui, sans-serif`;
  ctx.fillText('Pick a size, then how to play', cw / 2, ch * 0.16 + 32);

  const { chips, buttons } = menuLayout(cw, ch);
  for (const chip of chips) {
    const selected = chip.size === sizeChoice;
    roundRect(ctx, chip.x, chip.y, chip.w, chip.h, 14);
    ctx.fillStyle = selected ? '#5ec8ff33' : 'rgba(255,255,255,0.06)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = selected ? '#5ec8ffcc' : 'rgba(255,255,255,0.18)';
    ctx.stroke();
    ctx.fillStyle = selected ? '#5ec8ff' : 'rgba(255,255,255,0.65)';
    ctx.font = `bold ${Math.min(16, chip.w * 0.14)}px system-ui, sans-serif`;
    ctx.fillText(SIZE_LABELS[chip.size], chip.x + chip.w / 2, chip.y + chip.h / 2 - 3);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = `600 ${Math.min(12, chip.w * 0.1)}px system-ui, sans-serif`;
    ctx.fillText(`${chip.size}x${chip.size}`, chip.x + chip.w / 2, chip.y + chip.h / 2 + 14);
  }

  for (const btn of buttons) {
    const title = btn.mode === '2p' ? '2 Players' : 'vs Computer';
    const sub = btn.mode === '2p' ? 'Pass and play' : 'Beat the bot';
    const color = btn.mode === '2p' ? P1 : P2;
    drawMenuButton(ctx, btn.x, btn.y, btn.w, btn.h, title, sub, color);
  }

  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = `600 ${Math.min(15, cw * 0.038)}px system-ui, sans-serif`;
  ctx.fillText('Tap a size, then tap a side to start', cw / 2, buttons[0].y + buttons[0].h + 38);
}

function drawMenuButton(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  sub: string,
  color: string,
): void {
  roundRect(ctx, x, y, w, h, 22);
  ctx.fillStyle = `${color}22`;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = `${color}aa`;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.font = `bold ${Math.min(24, w * 0.14)}px system-ui, sans-serif`;
  ctx.fillText(title, x + w / 2, y + h / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = `600 ${Math.min(15, w * 0.09)}px system-ui, sans-serif`;
  ctx.fillText(sub, x + w / 2, y + h / 2 + 26);
}

function drawTopBar(ctx: CanvasRenderingContext2D, s: State, cw: number): void {
  // "Menu" chip top-left.
  roundRect(ctx, 12, 10, 72, TOP - 20, 12);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '600 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Menu', 48, TOP / 2 + 1);

  const p1 = boxesCompletedBy(s.box, 1);
  const p2 = boxesCompletedBy(s.box, 2);
  const scoreLabel =
    s.mode === 'cpu'
      ? `You ${s.human === 1 ? p1 : p2} - ${OTHER[s.human] === 1 ? p1 : p2} CPU`
      : `P1 ${p1} - ${p2} P2`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillText(scoreLabel, cw / 2, TOP / 2 + 1);

  ctx.textAlign = 'right';
  if (s.phase === 'play') {
    const cpuTurn = s.mode === 'cpu' && s.turn !== s.human;
    const label = cpuTurn
      ? 'Computer thinking...'
      : s.mode === 'cpu'
        ? 'Your turn'
        : `Player ${s.turn}'s turn`;
    ctx.fillStyle = s.turn === 1 ? P1 : P2;
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillText(label, cw - 14, TOP / 2 + 1);
  }
}

function drawBoard(ctx: CanvasRenderingContext2D, s: State, l: Layout): void {
  const { rows, cols, cell } = l;

  // Faint guide lines for every undrawn edge, so a child can see where to tap.
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (let r = 0; r <= rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (s.box.h[r][c] !== 0) continue;
      const x1 = l.ox + c * cell;
      const y1 = l.oy + r * cell;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 + cell, y1);
      ctx.stroke();
    }
  }
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c <= cols; c += 1) {
      if (s.box.v[r][c] !== 0) continue;
      const x1 = l.ox + c * cell;
      const y1 = l.oy + r * cell;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1, y1 + cell);
      ctx.stroke();
    }
  }

  // Claimed boxes, with a quick pop-in scale from the centre.
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const owner = s.box.boxes[r][c];
      if (owner === 0) continue;
      const t = Math.min(1, s.boxPop[r][c] / 0.22);
      const grow = 0.4 + 0.6 * t;
      const size = cell * grow * 0.86;
      const cx = l.ox + (c + 0.5) * cell;
      const cy = l.oy + (r + 0.5) * cell;
      ctx.fillStyle = owner === 1 ? `${P1}33` : `${P2}33`;
      ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
    }
  }

  // Drawn edges, bold and colored by whoever drew them.
  ctx.lineCap = 'round';
  ctx.lineWidth = 6;
  for (let r = 0; r <= rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const owner = s.box.h[r][c];
      if (owner === 0) continue;
      const x1 = l.ox + c * cell;
      const y1 = l.oy + r * cell;
      ctx.strokeStyle = owner === 1 ? P1 : P2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 + cell, y1);
      ctx.stroke();
    }
  }
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c <= cols; c += 1) {
      const owner = s.box.v[r][c];
      if (owner === 0) continue;
      const x1 = l.ox + c * cell;
      const y1 = l.oy + r * cell;
      ctx.strokeStyle = owner === 1 ? P1 : P2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1, y1 + cell);
      ctx.stroke();
    }
  }

  // Dots on top.
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  const r0 = Math.max(3, cell * 0.07);
  for (let r = 0; r <= rows; r += 1) {
    for (let c = 0; c <= cols; c += 1) {
      ctx.beginPath();
      ctx.arc(l.ox + c * cell, l.oy + r * cell, r0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawOver(ctx: CanvasRenderingContext2D, s: State, cw: number, ch: number): void {
  ctx.textAlign = 'center';
  const y = ch - 46;
  roundRect(ctx, cw / 2 - 150, y - 26, 300, 52, 16);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillText(s.resultMsg, cw / 2, y - 2);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillText('Tap to play again', cw / 2, y + 16);
}

function dim(ctx: CanvasRenderingContext2D, cw: number, ch: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, 0, cw, ch);
}

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
