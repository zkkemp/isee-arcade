'use client';

import { useEffect, useRef } from 'react';
import type { Difficulty } from '@/lib/difficulty';
import type { GameCanvasProps } from '@/lib/games';
import { playSound, unlockAudio } from '@/lib/sound';
import { useCanvasGame } from '@/lib/useCanvasGame';

/**
 * Tic-Tac-Toe - the reference game for the 'board' control scheme.
 *
 * Board games are turn-based and DOM/canvas-driven rather than a real-time
 * arcade loop, so they do not use the swipe overlay or the dpad. Instead the
 * component attaches its own pointer handler straight to its canvas (see
 * onPointerDown on the returned element) and runs its own turn logic. The shell
 * still gates play behind a study block, still passes `paused` while a question
 * is up, and still hands `restartToken` for a fresh game - all respected below.
 *
 * Two modes, chosen from an in-canvas menu: two players pass-and-play on one
 * iPad, or one player against the computer. The computer plays a full minimax,
 * so on `hard` it is unbeatable and on easier settings it throws the occasional
 * random move to give a young child a real chance.
 *
 * Everything above the component is pure - no canvas, no React, no clock - and
 * scripts/check-tictactoe.ts drives the same `winnerOf`/`bestMove`/`minimax`
 * the game runs, proving the computer never loses from any position and that a
 * win and a block are always taken.
 */

// --- pure rules ------------------------------------------------------------

/** 0 empty, 1 first player (X), 2 second player (O). */
export type Cell = 0 | 1 | 2;
export type TttBoard = Cell[]; // length 9, row-major

export const LINES: number[][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export function emptyBoard(): TttBoard {
  return [0, 0, 0, 0, 0, 0, 0, 0, 0];
}

export function emptyCells(b: TttBoard): number[] {
  const out: number[] = [];
  for (let i = 0; i < 9; i += 1) if (b[i] === 0) out.push(i);
  return out;
}

export function isFull(b: TttBoard): boolean {
  for (let i = 0; i < 9; i += 1) if (b[i] === 0) return false;
  return true;
}

/** The winning player and line, or { player: 0, line: null } for none. */
export function winnerOf(b: TttBoard): { player: Cell; line: number[] | null } {
  for (const line of LINES) {
    const [a, c, d] = line;
    if (b[a] !== 0 && b[a] === b[c] && b[a] === b[d]) return { player: b[a], line };
  }
  return { player: 0, line: null };
}

export const OTHER: Record<1 | 2, 1 | 2> = { 1: 2, 2: 1 };

/**
 * Minimax score for `me` to move, from `me`'s point of view: +10 (minus depth)
 * for a win, -10 (plus depth) for a loss, 0 for a draw. Depth pushes the engine
 * to win sooner and lose later, which reads as competent rather than robotic.
 */
export function minimax(b: TttBoard, me: 1 | 2, toMove: 1 | 2, depth = 0): number {
  const w = winnerOf(b).player;
  if (w === me) return 10 - depth;
  if (w !== 0) return depth - 10;
  const moves = emptyCells(b);
  if (moves.length === 0) return 0;

  if (toMove === me) {
    let best = -Infinity;
    for (const m of moves) {
      b[m] = toMove;
      best = Math.max(best, minimax(b, me, OTHER[toMove], depth + 1));
      b[m] = 0;
    }
    return best;
  }
  let best = Infinity;
  for (const m of moves) {
    b[m] = toMove;
    best = Math.min(best, minimax(b, me, OTHER[toMove], depth + 1));
    b[m] = 0;
  }
  return best;
}

/** The optimal move for `me` to play now. -1 only if the board is already done. */
export function bestMove(b: TttBoard, me: 1 | 2): number {
  const moves = emptyCells(b);
  if (moves.length === 0) return -1;
  let best = -Infinity;
  let pick = moves[0];
  for (const m of moves) {
    b[m] = me;
    const score = minimax(b, me, OTHER[me], 1);
    b[m] = 0;
    if (score > best) {
      best = score;
      pick = m;
    }
  }
  return pick;
}

/**
 * What the computer actually plays. `randomness` (0..1) is the chance it throws
 * an arbitrary legal move instead of the optimal one - the difficulty dial that
 * lets a five-year-old sometimes win. rng is injected so the checker can drive
 * it deterministically.
 */
export function cpuMove(b: TttBoard, me: 1 | 2, randomness: number, rng: () => number): number {
  const moves = emptyCells(b);
  if (moves.length === 0) return -1;
  if (rng() < randomness) return moves[Math.floor(rng() * moves.length)];
  return bestMove(b, me);
}

/** Chance the computer blunders, per difficulty. Hard is perfect and unbeatable. */
export const CPU_RANDOMNESS: Record<Difficulty, number> = {
  easy: 0.45,
  normal: 0.18,
  hard: 0,
};

/** Seeded LCG, so nothing here ever touches Math.random. */
export function lcg(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// --- layout ----------------------------------------------------------------

type Mode = 'cpu' | '2p';
type Phase = 'menu' | 'play' | 'over';

const TOP = 52; // top bar for the mode / turn readout

type Layout = { ox: number; oy: number; size: number; cell: number };

function layoutFor(cw: number, ch: number, inset: number): Layout {
  const avail = Math.max(1, Math.min(cw, ch - inset - TOP) * 0.92);
  const size = avail;
  const cell = size / 3;
  return { ox: (cw - size) / 2, oy: TOP + (ch - inset - TOP - size) / 2, size, cell };
}

/** Which cell (0..8) a canvas-space point hits, or -1. */
export function cellAtPoint(l: Layout, x: number, y: number): number {
  if (x < l.ox || x > l.ox + l.size || y < l.oy || y > l.oy + l.size) return -1;
  const col = Math.min(2, Math.max(0, Math.floor((x - l.ox) / l.cell)));
  const row = Math.min(2, Math.max(0, Math.floor((y - l.oy) / l.cell)));
  return row * 3 + col;
}

// --- state -----------------------------------------------------------------

type State = {
  mode: Mode;
  phase: Phase;
  board: TttBoard;
  turn: 1 | 2;
  /** The human's mark in cpu mode. Alternates each new match so nobody always starts. */
  human: 1 | 2;
  win: { player: Cell; line: number[] | null };
  /** Seconds until the computer plays, so its move is not instant. */
  cpuWait: number;
  /** Per-cell placement pop, seconds since placed (>=99 means settled/empty). */
  placed: number[];
  overT: number;
  winFlash: number;
  time: number;
};

function freshBoard(s: State): void {
  s.board = emptyBoard();
  s.win = { player: 0, line: null };
  s.placed = new Array<number>(9).fill(99);
  s.cpuWait = 0;
  s.overT = 0;
  s.winFlash = 0;
}

function startMatch(s: State, mode: Mode): void {
  s.mode = mode;
  s.phase = 'play';
  freshBoard(s);
  if (mode === 'cpu') {
    // Alternate who is X (X always moves first), so the computer opens every
    // other game and the child is not always reacting.
    s.human = s.human === 1 ? 2 : 1;
    s.turn = 1;
    if (s.human === 2) s.cpuWait = 0.5; // computer is X, opens
  } else {
    s.turn = 1;
  }
}

function initialState(): State {
  const s: State = {
    mode: 'cpu',
    phase: 'menu',
    board: emptyBoard(),
    turn: 1,
    human: 2, // so the first cpu match flips to human = 1 (child opens)
    win: { player: 0, line: null },
    cpuWait: 0,
    placed: new Array<number>(9).fill(99),
    overT: 0,
    winFlash: 0,
    time: 0,
  };
  return s;
}

// --- component -------------------------------------------------------------

type GameApi = GameCanvasProps['api'];

const P1 = '#5ec8ff';
const P2 = '#ff8f5d';

export default function TicTacToe({
  paused,
  api,
  restartToken,
  difficulty,
  controlsInset,
}: GameCanvasProps) {
  const stateRef = useRef<State>(initialState());
  const layoutRef = useRef<Layout>({ ox: 0, oy: 0, size: 1, cell: 1 });
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

  const place = (s: State, cell: number, player: 1 | 2, api: GameApi): void => {
    s.board[cell] = player;
    s.placed[cell] = 0;
    playSound('click');
    const w = winnerOf(s.board);
    if (w.player !== 0) {
      s.win = w;
      s.phase = 'over';
      s.overT = 0;
      s.winFlash = 0;
      resolveResult(s, w.player, api);
    } else if (isFull(s.board)) {
      s.phase = 'over';
      s.overT = 0;
      resolveResult(s, 0, api);
    } else {
      s.turn = OTHER[player];
      if (s.mode === 'cpu' && s.turn !== s.human) s.cpuWait = 0.45;
    }
  };

  const resolveResult = (s: State, winner: Cell, api: GameApi): void => {
    if (s.mode === 'cpu') {
      if (winner === s.human) {
        playSound('levelClear');
        api.addScore(50);
        api.setStatus('You win!');
      } else if (winner === 0) {
        playSound('pass');
        api.addScore(10);
        api.setStatus('A draw!');
      } else {
        api.died('Computer wins');
      }
    } else {
      if (winner === 0) {
        playSound('pass');
        api.addScore(10);
        api.setStatus('A draw!');
      } else {
        playSound('levelClear');
        api.addScore(40);
        api.setStatus(`Player ${winner} wins!`);
      }
    }
  };

  const onTap = (sx: number, sy: number, cw: number): void => {
    const s = stateRef.current;
    if (paused) return;
    unlockAudio();

    if (s.phase === 'menu') {
      // Two big buttons split the screen: left = 2 players, right = vs computer.
      if (sx < cw / 2) startMatch(s, '2p');
      else startMatch(s, 'cpu');
      playSound('powerup');
      return;
    }

    if (s.phase === 'over') {
      // A tap on the small "Menu" chip top-left returns to the picker; anywhere
      // else replays the same mode.
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
    const cell = cellAtPoint(l, sx, sy);
    if (cell < 0 || s.board[cell] !== 0) return;
    place(s, cell, s.turn, api);
  };

  const { canvasRef } = useCanvasGame({
    active: true,
    step: (ctx, dt, cw, ch) => {
      const s = stateRef.current;
      const l = layoutFor(cw, ch, controlsInset);
      layoutRef.current = l;

      if (!paused) {
        s.time += dt;
        for (let i = 0; i < 9; i += 1) if (s.placed[i] < 99) s.placed[i] += dt;
        if (s.phase === 'over') s.overT += dt;
        if (s.win.line) s.winFlash += dt;

        // The computer's move, after a short beat so it does not feel instant.
        if (s.phase === 'play' && s.mode === 'cpu' && s.turn !== s.human && s.cpuWait > 0) {
          s.cpuWait -= dt;
          if (s.cpuWait <= 0) {
            const cpu = s.turn;
            const move = cpuMove(s.board, cpu, CPU_RANDOMNESS[difficulty], rngRef.current);
            if (move >= 0 && s.board[move] === 0) place(s, move, cpu, api);
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
        onTap(e.clientX - r.left, e.clientY - r.top, r.width);
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
    drawMenu(ctx, cw, ch);
    if (paused) dim(ctx, cw, ch);
    return;
  }

  drawTopBar(ctx, s, cw);
  drawGrid(ctx, s, l);
  for (let i = 0; i < 9; i += 1) {
    if (s.board[i] === 0) continue;
    const r = Math.floor(i / 3);
    const c = i % 3;
    const cx = l.ox + (c + 0.5) * l.cell;
    const cy = l.oy + (r + 0.5) * l.cell;
    const pop = s.placed[i] < 0.18 ? 0.6 + 0.4 * (s.placed[i] / 0.18) : 1;
    const won = s.win.line?.includes(i) ?? false;
    drawMark(ctx, s.board[i], cx, cy, l.cell * 0.3 * pop, won ? 0.5 + 0.5 * Math.sin(s.winFlash * 8) : 1);
  }

  if (s.win.line) drawWinLine(ctx, s, l);
  if (s.phase === 'over') drawOver(ctx, s, cw, ch);
  if (paused) dim(ctx, cw, ch);
}

function drawMenu(ctx: CanvasRenderingContext2D, cw: number, ch: number): void {
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${Math.min(44, cw * 0.11)}px system-ui, sans-serif`;
  ctx.fillText('Tic-Tac-Toe', cw / 2, ch * 0.18);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `600 ${Math.min(18, cw * 0.045)}px system-ui, sans-serif`;
  ctx.fillText('Pick how to play', cw / 2, ch * 0.18 + 34);

  const bw = Math.min(cw * 0.4, 260);
  const bh = Math.min(ch * 0.32, 220);
  const by = ch * 0.5 - bh / 2;
  drawMenuButton(ctx, cw / 2 - bw - 12, by, bw, bh, '2 Players', 'Pass and play', P1);
  drawMenuButton(ctx, cw / 2 + 12, by, bw, bh, 'vs Computer', 'Beat the bot', P2);

  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = `600 ${Math.min(15, cw * 0.038)}px system-ui, sans-serif`;
  ctx.fillText('Tap a side to start', cw / 2, by + bh + 40);
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
  ctx.font = `bold ${Math.min(26, w * 0.15)}px system-ui, sans-serif`;
  ctx.fillText(title, x + w / 2, y + h / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = `600 ${Math.min(15, w * 0.09)}px system-ui, sans-serif`;
  ctx.fillText(sub, x + w / 2, y + h / 2 + 28);
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

  ctx.textAlign = 'right';
  if (s.phase === 'play') {
    const cpuTurn = s.mode === 'cpu' && s.turn !== s.human;
    const label = cpuTurn
      ? 'Computer thinking...'
      : s.mode === 'cpu'
        ? 'Your turn'
        : `Player ${s.turn}'s turn`;
    ctx.fillStyle = s.turn === 1 ? P1 : P2;
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillText(label, cw - 16, TOP / 2 + 1);
  }
}

function drawGrid(ctx: CanvasRenderingContext2D, s: State, l: Layout): void {
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  for (let i = 1; i < 3; i += 1) {
    ctx.beginPath();
    ctx.moveTo(l.ox + i * l.cell, l.oy + 8);
    ctx.lineTo(l.ox + i * l.cell, l.oy + l.size - 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(l.ox + 8, l.oy + i * l.cell);
    ctx.lineTo(l.ox + l.size - 8, l.oy + i * l.cell);
    ctx.stroke();
  }
  void s;
}

function drawMark(
  ctx: CanvasRenderingContext2D,
  player: Cell,
  cx: number,
  cy: number,
  r: number,
  alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineWidth = Math.max(5, r * 0.28);
  ctx.lineCap = 'round';
  if (player === 1) {
    ctx.strokeStyle = P1;
    ctx.beginPath();
    ctx.moveTo(cx - r, cy - r);
    ctx.lineTo(cx + r, cy + r);
    ctx.moveTo(cx + r, cy - r);
    ctx.lineTo(cx - r, cy + r);
    ctx.stroke();
  } else {
    ctx.strokeStyle = P2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawWinLine(ctx: CanvasRenderingContext2D, s: State, l: Layout): void {
  if (!s.win.line) return;
  const [a, , c] = s.win.line;
  const p = (i: number) => ({
    x: l.ox + ((i % 3) + 0.5) * l.cell,
    y: l.oy + (Math.floor(i / 3) + 0.5) * l.cell,
  });
  const from = p(a);
  const to = p(c);
  ctx.strokeStyle = s.win.player === 1 ? P1 : P2;
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawOver(ctx: CanvasRenderingContext2D, s: State, cw: number, ch: number): void {
  const msg =
    s.win.player === 0
      ? "It's a draw!"
      : s.mode === 'cpu'
        ? s.win.player === s.human
          ? 'You win!'
          : 'Computer wins'
        : `Player ${s.win.player} wins!`;
  ctx.textAlign = 'center';
  const y = ch - 46;
  roundRect(ctx, cw / 2 - 150, y - 26, 300, 52, 16);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillText(msg, cw / 2, y - 2);
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
