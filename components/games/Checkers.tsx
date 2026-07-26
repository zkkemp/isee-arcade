'use client';

import { useEffect, useRef } from 'react';
import type { Difficulty } from '@/lib/difficulty';
import type { GameCanvasProps } from '@/lib/games';
import { playSound, unlockAudio } from '@/lib/sound';
import { useCanvasGame } from '@/lib/useCanvasGame';

/**
 * Checkers (American / English draughts) - a second 'board' control-scheme
 * game, built the same way as TicTacToe.tsx: a pure rules-and-AI core with no
 * canvas/React in it, and a canvas component below that attaches its own
 * onPointerDown and runs its own turn logic. Two modes from an in-canvas
 * menu - two-player pass-and-play, or vs the computer.
 *
 * Board representation: a flat 64-cell row-major array (only the 32 dark
 * squares are ever occupied). Piece encoding is a signed int: positive belongs
 * to player 1, negative to player 2; |1| = man, |2| = king. Player 1 starts at
 * the bottom (rows 5-7) and advances toward row 0; player 2 starts at the top
 * (rows 0-2) and advances toward row 7 - so in cpu mode the human's own pieces
 * are always the ones nearest their thumb.
 *
 * A "move" is a complete turn: a simple one-step slide, OR a full capture
 * chain recorded as a single atomic unit (`path` holds every square visited,
 * `captured` holds every jumped square, in order). Generating only *maximal*
 * capture chains (a chain is only emitted once no further jump is possible
 * from its landing square) is what makes mandatory multi-jump automatic:
 * legalMoves() simply never offers a shorter chain as an alternative when a
 * longer one exists. Mandatory capture itself is enforced by legalMoves()
 * returning ONLY capturing moves whenever at least one exists anywhere on the
 * board for the player to move.
 *
 * The computer is a depth-limited minimax with alpha-beta pruning over
 * material + king weight + advancement. Difficulty scales both search depth
 * and a seeded blunder chance, same shape as TicTacToe's CPU_RANDOMNESS.
 *
 * scripts/check-checkers.ts drives this exact core: forced capture, multi-jump
 * capture/landing correctness, kinging (including mid-jump kinging ending the
 * turn), applyMove's board-invariant safety, winnerOf/isGameOver agreement,
 * and that minimax prefers a capture over a non-capture.
 */

// --- pure rules --------------------------------------------------------------

/** 0 empty; +/-1 man, +/-2 king. Positive = player 1, negative = player 2. */
export type Piece = 0 | 1 | 2 | -1 | -2;
/** Flat 64-cell row-major board. Only dark squares ((r+c)%2===1) are ever used. */
export type Board = Piece[];
export type Player = 1 | 2;

export type Move = {
  from: number;
  to: number;
  /** Every square visited, in order, starting with `from`. Length 2 = simple move. */
  path: number[];
  /** Every jumped square, in order. Empty for a non-capturing move. */
  captured: number[];
  /** True if this move promotes the piece to a king (ends the turn immediately). */
  becomesKing: boolean;
};

export function opponent(p: Player): Player {
  return p === 1 ? 2 : 1;
}

export function pieceOwner(p: Piece): 0 | Player {
  if (p === 0) return 0;
  return p > 0 ? 1 : 2;
}

export function pieceIsKing(p: Piece): boolean {
  return p === 2 || p === -2;
}

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

export function idx(r: number, c: number): number {
  return r * 8 + c;
}

export function rowOf(sq: number): number {
  return Math.floor(sq / 8);
}

export function colOf(sq: number): number {
  return sq % 8;
}

export function isDarkSquare(r: number, c: number): boolean {
  return (r + c) % 2 === 1;
}

/** The row a man promotes on. Player 1 advances toward row 0, player 2 toward row 7. */
export const KING_ROW: Record<Player, number> = { 1: 0, 2: 7 };

const MAN_DIRS: Record<Player, ReadonlyArray<[number, number]>> = {
  1: [
    [-1, -1],
    [-1, 1],
  ],
  2: [
    [1, -1],
    [1, 1],
  ],
};
const KING_DIRS: ReadonlyArray<[number, number]> = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

/** Standard 12-per-side starting position. */
export function initialBoard(): Board {
  const b: Board = new Array<Piece>(64).fill(0);
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      if (!isDarkSquare(r, c)) continue;
      if (r <= 2) b[idx(r, c)] = -1;
      else if (r >= 5) b[idx(r, c)] = 1;
    }
  }
  return b;
}

function simpleMovesFrom(board: Board, square: number, player: Player): Move[] {
  const piece = board[square];
  if (pieceOwner(piece) !== player) return [];
  const r = rowOf(square);
  const c = colOf(square);
  const dirs = pieceIsKing(piece) ? KING_DIRS : MAN_DIRS[player];
  const moves: Move[] = [];
  for (const [dr, dc] of dirs) {
    const nr = r + dr;
    const nc = c + dc;
    if (!inBounds(nr, nc)) continue;
    const to = idx(nr, nc);
    if (board[to] !== 0) continue;
    const becomesKing = !pieceIsKing(piece) && nr === KING_ROW[player];
    moves.push({ from: square, to, path: [square, to], captured: [], becomesKing });
  }
  return moves;
}

/**
 * Every maximal capture chain starting at `square`. Recursion only stops (and
 * records a Move) when no further jump is available from the current landing
 * square, OR the piece just kinged - both are the standard rule: continuation
 * is mandatory while a jump exists, and kinging ends the turn on the spot even
 * mid-chain.
 */
function captureSequencesFrom(board: Board, square: number, player: Player): Move[] {
  const startPiece = board[square];
  if (pieceOwner(startPiece) !== player) return [];
  const results: Move[] = [];

  const dfs = (curBoard: Board, curSquare: number, curPiece: Piece, path: number[], captured: number[]): void => {
    const r = rowOf(curSquare);
    const c = colOf(curSquare);
    const dirs = pieceIsKing(curPiece) ? KING_DIRS : MAN_DIRS[player];
    let extended = false;
    for (const [dr, dc] of dirs) {
      const mr = r + dr;
      const mc = c + dc;
      const jr = r + 2 * dr;
      const jc = c + 2 * dc;
      if (!inBounds(jr, jc)) continue;
      const midSq = idx(mr, mc);
      if (pieceOwner(curBoard[midSq]) !== opponent(player)) continue;
      const landSq = idx(jr, jc);
      if (curBoard[landSq] !== 0) continue;

      const willKing = !pieceIsKing(curPiece) && jr === KING_ROW[player];
      const landingPiece: Piece = willKing ? (curPiece > 0 ? 2 : -2) : curPiece;
      extended = true;

      if (willKing) {
        // Kinging ends the turn immediately, even if another jump would have
        // been possible from the landing square.
        results.push({
          from: square,
          to: landSq,
          path: [...path, landSq],
          captured: [...captured, midSq],
          becomesKing: true,
        });
        continue;
      }

      const nextBoard = curBoard.slice();
      nextBoard[curSquare] = 0;
      nextBoard[midSq] = 0;
      nextBoard[landSq] = landingPiece;
      dfs(nextBoard, landSq, landingPiece, [...path, landSq], [...captured, midSq]);
    }
    if (!extended && captured.length > 0) {
      results.push({ from: square, to: curSquare, path: [...path], captured: [...captured], becomesKing: false });
    }
  };

  dfs(board, square, startPiece, [square], []);
  return results;
}

/**
 * All legal moves for `player`. If ANY capture exists anywhere on the board
 * for this player, only capturing moves are returned (mandatory capture);
 * otherwise every simple slide is returned.
 */
export function legalMoves(board: Board, player: Player): Move[] {
  const captures: Move[] = [];
  for (let sq = 0; sq < 64; sq += 1) {
    if (pieceOwner(board[sq]) === player) captures.push(...captureSequencesFrom(board, sq, player));
  }
  if (captures.length > 0) return captures;

  const simples: Move[] = [];
  for (let sq = 0; sq < 64; sq += 1) {
    if (pieceOwner(board[sq]) === player) simples.push(...simpleMovesFrom(board, sq, player));
  }
  return simples;
}

/** Moves available from one particular square (used by the UI to filter for a tap). */
export function movesFrom(board: Board, player: Player, square: number): Move[] {
  return legalMoves(board, player).filter((m) => m.from === square);
}

/** Applies a complete move (simple or full jump chain) and returns a NEW board. */
export function applyMove(board: Board, move: Move): Board {
  const b = board.slice();
  const piece = b[move.from];
  b[move.from] = 0;
  for (const cap of move.captured) b[cap] = 0;
  b[move.to] = move.becomesKing ? (piece > 0 ? 2 : -2) : piece;
  return b;
}

export function isGameOver(board: Board, toMove: Player): boolean {
  return legalMoves(board, toMove).length === 0;
}

/** The winner, or 0 if the game is not over. A side with zero legal moves loses. */
export function winnerOf(board: Board, toMove: Player): 0 | Player {
  return legalMoves(board, toMove).length === 0 ? opponent(toMove) : 0;
}

// --- evaluation + search -----------------------------------------------------

const MAN_VALUE = 3;
const KING_VALUE = 5;
const ADVANCE_WEIGHT = 0.08;

/** Material + king weight + a small bonus for men advanced toward promotion. */
export function evaluate(board: Board, player: Player): number {
  let score = 0;
  for (let sq = 0; sq < 64; sq += 1) {
    const p = board[sq];
    if (p === 0) continue;
    const owner = pieceOwner(p);
    const king = pieceIsKing(p);
    let value: number = king ? KING_VALUE : MAN_VALUE;
    if (!king) {
      const r = rowOf(sq);
      value += ADVANCE_WEIGHT * (owner === 1 ? 7 - r : r);
    }
    score += owner === player ? value : -value;
  }
  return score;
}

const WIN_SCORE = 10000;

/**
 * Minimax with alpha-beta pruning, scored from `player`'s point of view.
 * `toMove` alternates each ply; a side with no legal moves loses outright.
 */
export function minimax(
  board: Board,
  player: Player,
  toMove: Player,
  depth: number,
  alpha = -Infinity,
  beta = Infinity,
): number {
  const moves = legalMoves(board, toMove);
  if (moves.length === 0) {
    // toMove is stuck and loses. Add remaining depth so a faster forced win
    // (more depth left over) scores higher than a slower one.
    return toMove === player ? -(WIN_SCORE + depth) : WIN_SCORE + depth;
  }
  if (depth <= 0) return evaluate(board, player);

  let a = alpha;
  let b = beta;
  if (toMove === player) {
    let best = -Infinity;
    for (const m of moves) {
      const score = minimax(applyMove(board, m), player, opponent(toMove), depth - 1, a, b);
      if (score > best) best = score;
      if (best > a) a = best;
      if (a >= b) break;
    }
    return best;
  }
  let best = Infinity;
  for (const m of moves) {
    const score = minimax(applyMove(board, m), player, opponent(toMove), depth - 1, a, b);
    if (score < best) best = score;
    if (best < b) b = best;
    if (a >= b) break;
  }
  return best;
}

/** The optimal move for `player`, or null if none are available (game over). */
export function bestMove(board: Board, player: Player, depth: number): Move | null {
  const moves = legalMoves(board, player);
  if (moves.length === 0) return null;
  let best = -Infinity;
  let pick = moves[0];
  let alpha = -Infinity;
  for (const m of moves) {
    const score = minimax(applyMove(board, m), player, opponent(player), depth - 1, alpha, Infinity);
    if (score > best) {
      best = score;
      pick = m;
    }
    if (best > alpha) alpha = best;
  }
  return pick;
}

/** Search depth per difficulty. */
export const CPU_DEPTH: Record<Difficulty, number> = { easy: 2, normal: 4, hard: 6 };
/** Chance the computer plays an arbitrary legal move instead of the best one. */
export const CPU_RANDOMNESS: Record<Difficulty, number> = { easy: 0.35, normal: 0.14, hard: 0 };

/** Seeded LCG - nothing in the pure core ever touches Math.random. */
export function lcg(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** What the computer actually plays: a blunder with probability `randomness`, else bestMove. */
export function cpuMove(board: Board, player: Player, randomness: number, depth: number, rng: () => number): Move | null {
  const moves = legalMoves(board, player);
  if (moves.length === 0) return null;
  if (rng() < randomness) return moves[Math.floor(rng() * moves.length)];
  return bestMove(board, player, depth);
}

// --- layout ------------------------------------------------------------------

type Mode = 'cpu' | '2p';
type Phase = 'menu' | 'play' | 'over';

const TOP = 52;

type Layout = { ox: number; oy: number; size: number; cell: number };

function layoutFor(cw: number, ch: number, inset: number): Layout {
  const avail = Math.max(1, Math.min(cw, ch - inset - TOP) * 0.94);
  return { ox: (cw - avail) / 2, oy: TOP + (ch - inset - TOP - avail) / 2, size: avail, cell: avail / 8 };
}

/** Which square (0..63) a canvas-space point hits, or -1 if outside the board. */
export function squareAtPoint(l: Layout, x: number, y: number): number {
  if (x < l.ox || x > l.ox + l.size || y < l.oy || y > l.oy + l.size) return -1;
  const c = Math.min(7, Math.max(0, Math.floor((x - l.ox) / l.cell)));
  const r = Math.min(7, Math.max(0, Math.floor((y - l.oy) / l.cell)));
  return idx(r, c);
}

// --- state ---------------------------------------------------------------

type State = {
  mode: Mode;
  phase: Phase;
  board: Board;
  turn: Player;
  /** The human's colour in cpu mode. Alternates each new match. */
  human: Player;
  /** Currently selected square, or -1. */
  selected: number;
  /** The move candidates matching the taps so far (all share the tapped prefix). */
  pending: Move[];
  /** Squares tapped so far this turn (starts as [selected] once a piece is picked). */
  pendingPath: number[];
  winner: 0 | Player;
  cpuWait: number;
  overT: number;
  time: number;
};

function freshBoard(s: State): void {
  s.board = initialBoard();
  s.turn = 1;
  s.selected = -1;
  s.pending = [];
  s.pendingPath = [];
  s.winner = 0;
  s.cpuWait = 0;
  s.overT = 0;
}

function startMatch(s: State, mode: Mode): void {
  s.mode = mode;
  s.phase = 'play';
  freshBoard(s);
  if (mode === 'cpu') {
    // Alternate who is player 1, so the computer opens every other game.
    s.human = s.human === 1 ? 2 : 1;
    if (s.human === 2) s.cpuWait = 0.5;
  }
}

function initialState(): State {
  return {
    mode: 'cpu',
    phase: 'menu',
    board: initialBoard(),
    turn: 1,
    human: 2, // so the first cpu match flips to human = 1 (child moves first)
    selected: -1,
    pending: [],
    pendingPath: [],
    winner: 0,
    cpuWait: 0,
    overT: 0,
    time: 0,
  };
}

// --- component ---------------------------------------------------------------

type GameApi = GameCanvasProps['api'];

const P1_COLOR = '#e63946'; // player 1 - red, starts near the bottom
const P2_COLOR = '#2b2d3a'; // player 2 - near-black, starts near the top
const P2_RING = '#8a8fa3';

export default function Checkers({ paused, api, restartToken, difficulty, controlsInset }: GameCanvasProps) {
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

  const endTurnCheck = (s: State, api: GameApi): void => {
    const next = opponent(s.turn);
    s.turn = next;
    s.selected = -1;
    s.pending = [];
    s.pendingPath = [];
    const w = winnerOf(s.board, next);
    if (w !== 0) {
      s.phase = 'over';
      s.overT = 0;
      s.winner = w;
      resolveResult(s, w, api);
      return;
    }
    if (s.mode === 'cpu' && next !== s.human) s.cpuWait = 0.5;
  };

  const resolveResult = (s: State, winner: Player, api: GameApi): void => {
    if (s.mode === 'cpu') {
      if (winner === s.human) {
        playSound('levelClear');
        api.addScore(80);
        api.setStatus('You win!');
      } else {
        playSound('gameOver');
        api.died('Computer wins');
      }
    } else {
      playSound('levelClear');
      api.addScore(40);
      api.setStatus(`Player ${winner} wins!`);
    }
  };

  /** Applies one already-chosen full Move (used for the computer's turn). */
  const playMove = (s: State, move: Move, api: GameApi): void => {
    s.board = applyMove(s.board, move);
    playSound(move.captured.length > 0 ? 'brick' : 'click');
    endTurnCheck(s, api);
  };

  /** Human tap during play: select a piece, or continue/finish a move. */
  const handlePlayTap = (s: State, square: number, api: GameApi): void => {
    if (s.mode === 'cpu' && s.turn !== s.human) return; // computer's turn

    if (s.selected < 0) {
      const options = movesFrom(s.board, s.turn, square);
      if (options.length === 0) return; // no legal move from this square right now
      s.selected = square;
      s.pending = options;
      s.pendingPath = [square];
      playSound('click');
      return;
    }

    const step = s.pendingPath.length; // index of the next square in each candidate's path
    const matching = s.pending.filter((m) => m.path.length > step && m.path[step] === square);
    if (matching.length === 0) {
      // Not a legal next tap. Allow re-selecting a different one of the
      // player's own pieces (only when not mid-forced-jump, i.e. no capture
      // has happened yet in this pending sequence).
      if (s.pendingPath.length === 1 && pieceOwner(s.board[square]) === s.turn) {
        const options = movesFrom(s.board, s.turn, square);
        if (options.length > 0) {
          s.selected = square;
          s.pending = options;
          s.pendingPath = [square];
          playSound('click');
        }
      }
      return;
    }

    const newPath = [...s.pendingPath, square];
    const leaf = matching.filter((m) => m.path.length === newPath.length);
    if (leaf.length > 0) {
      playMove(s, leaf[0], api);
      return;
    }
    // Still mid chain: a further jump is mandatory, so lock onto it.
    s.pending = matching;
    s.pendingPath = newPath;
    playSound('brick');
  };

  const onTap = (sx: number, sy: number, cw: number): void => {
    const s = stateRef.current;
    if (paused) return;
    unlockAudio();

    if (s.phase === 'menu') {
      if (sx < cw / 2) startMatch(s, '2p');
      else startMatch(s, 'cpu');
      playSound('powerup');
      return;
    }

    if (s.phase === 'over') {
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
    const l = layoutRef.current;
    const square = squareAtPoint(l, sx, sy);
    if (square < 0) return;
    handlePlayTap(s, square, api);
  };

  const { canvasRef } = useCanvasGame({
    active: true,
    step: (ctx, dt, cw, ch) => {
      const s = stateRef.current;
      const l = layoutFor(cw, ch, controlsInset);
      layoutRef.current = l;

      if (!paused) {
        s.time += dt;
        if (s.phase === 'over') s.overT += dt;

        if (s.phase === 'play' && s.mode === 'cpu' && s.turn !== s.human && s.cpuWait > 0) {
          s.cpuWait -= dt;
          if (s.cpuWait <= 0) {
            const move = cpuMove(s.board, s.turn, CPU_RANDOMNESS[difficulty], CPU_DEPTH[difficulty], rngRef.current);
            if (move) playMove(s, move, api);
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

// --- drawing -------------------------------------------------------------

function draw(ctx: CanvasRenderingContext2D, s: State, l: Layout, cw: number, ch: number, paused: boolean): void {
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
  drawBoard(ctx, s, l);
  drawPieces(ctx, s, l);
  if (s.phase === 'over') drawOver(ctx, s, cw, ch);
  if (paused) dim(ctx, cw, ch);
}

function drawMenu(ctx: CanvasRenderingContext2D, cw: number, ch: number): void {
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${Math.min(40, cw * 0.1)}px system-ui, sans-serif`;
  ctx.fillText('Checkers', cw / 2, ch * 0.18);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `600 ${Math.min(18, cw * 0.045)}px system-ui, sans-serif`;
  ctx.fillText('Pick how to play', cw / 2, ch * 0.18 + 34);

  const bw = Math.min(cw * 0.4, 260);
  const bh = Math.min(ch * 0.32, 220);
  const by = ch * 0.5 - bh / 2;
  drawMenuButton(ctx, cw / 2 - bw - 12, by, bw, bh, '2 Players', 'Pass and play', P1_COLOR);
  drawMenuButton(ctx, cw / 2 + 12, by, bw, bh, 'vs Computer', 'Beat the bot', P2_RING);

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
    ctx.fillStyle = s.turn === 1 ? P1_COLOR : P2_RING;
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.fillText(label, cw - 16, TOP / 2 + 1);
  }
}

function drawBoard(ctx: CanvasRenderingContext2D, s: State, l: Layout): void {
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const x = l.ox + c * l.cell;
      const y = l.oy + r * l.cell;
      ctx.fillStyle = isDarkSquare(r, c) ? '#3a3550' : '#efe8db';
      ctx.fillRect(x, y, l.cell, l.cell);
    }
  }

  // Selected square + legal destinations for the current pending move.
  if (s.selected >= 0) {
    highlightSquare(ctx, l, s.selected, 'rgba(255,255,255,0.35)');
    const step = s.pendingPath.length;
    const seen = new Set<number>();
    for (const m of s.pending) {
      if (m.path.length > step) seen.add(m.path[step]);
    }
    for (const sq of seen) drawDot(ctx, l, sq);
  }

  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(l.ox, l.oy, l.size, l.size);
}

function highlightSquare(ctx: CanvasRenderingContext2D, l: Layout, sq: number, color: string): void {
  const r = rowOf(sq);
  const c = colOf(sq);
  ctx.fillStyle = color;
  ctx.fillRect(l.ox + c * l.cell, l.oy + r * l.cell, l.cell, l.cell);
}

function drawDot(ctx: CanvasRenderingContext2D, l: Layout, sq: number): void {
  const r = rowOf(sq);
  const c = colOf(sq);
  const cx = l.ox + (c + 0.5) * l.cell;
  const cy = l.oy + (r + 0.5) * l.cell;
  ctx.beginPath();
  ctx.arc(cx, cy, l.cell * 0.16, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,214,0,0.85)';
  ctx.fill();
}

function drawPieces(ctx: CanvasRenderingContext2D, s: State, l: Layout): void {
  for (let sq = 0; sq < 64; sq += 1) {
    const p = s.board[sq];
    if (p === 0) continue;
    const r = rowOf(sq);
    const c = colOf(sq);
    const cx = l.ox + (c + 0.5) * l.cell;
    const cy = l.oy + (r + 0.5) * l.cell;
    const rad = l.cell * 0.38;
    const owner = pieceOwner(p);
    const king = pieceIsKing(p);

    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fillStyle = owner === 1 ? P1_COLOR : P2_COLOR;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = owner === 1 ? '#ffd0d5' : P2_RING;
    ctx.stroke();

    if (king) {
      ctx.fillStyle = owner === 1 ? '#ffe9a8' : '#ffe9a8';
      ctx.font = `bold ${Math.round(rad * 1.1)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('★', cx, cy + 1);
      ctx.textBaseline = 'alphabetic';
    }

    if (sq === s.selected) {
      ctx.beginPath();
      ctx.arc(cx, cy, rad + 4, 0, Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.stroke();
    }
  }
}

function drawOver(ctx: CanvasRenderingContext2D, s: State, cw: number, ch: number): void {
  const msg = s.mode === 'cpu' ? (s.winner === s.human ? 'You win!' : 'Computer wins') : `Player ${s.winner} wins!`;
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
