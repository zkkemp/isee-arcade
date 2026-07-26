'use client';

import { useEffect, useRef } from 'react';
import type { Difficulty } from '@/lib/difficulty';
import type { GameCanvasProps } from '@/lib/games';
import { playSound, unlockAudio } from '@/lib/sound';
import { useCanvasGame } from '@/lib/useCanvasGame';

/**
 * Chess - a third 'board' control-scheme game, built the same way as
 * TicTacToe.tsx and Checkers.tsx: a pure rules-and-AI core with no
 * canvas/React in it, and a canvas component below that attaches its own
 * onPointerDown and runs its own turn logic. Two modes from an in-canvas
 * menu - two-player pass-and-play, or vs the computer (human is always White
 * in cpu mode - simplification, stated here and in the report).
 *
 * Board representation: a flat 64-cell row-major array, index = rank*8+file
 * (square 0 = a1, square 7 = h1, square 56 = a8, square 63 = h8 - the usual
 * "LERF" chess-programming layout). Piece encoding is a signed int: positive
 * = White, negative = Black; abs value 1=pawn 2=knight 3=bishop 4=rook
 * 5=queen 6=king.
 *
 * legalMoves() generates pseudo-legal moves per piece type (including
 * castling and en passant) and then filters out any move that would leave
 * the mover's own king in check - the single filter that also happens to
 * make pinned pieces, "you can't castle out of/through check", and "you
 * can't walk your king into check" all fall out for free, instead of being
 * three separate special cases.
 *
 * One simplification for this kids' app: pawns always auto-promote to a
 * queen (no under-promotion choice).
 *
 * The computer is a depth-limited negamax with alpha-beta pruning over
 * material + piece-square tables, with captures searched first for better
 * pruning. Difficulty scales both search depth and a seeded blunder chance,
 * same shape as TicTacToe's CPU_RANDOMNESS / Checkers' CPU_RANDOMNESS.
 *
 * scripts/check-chess.ts drives this exact core: perft from the starting
 * position (the standard brute-force move-count proof of correct move
 * generation), a known checkmate and a known stalemate, a pinned piece that
 * cannot move, castling legality (both the positive and the
 * blocked-by-attack negative case), and en passant (generated only
 * immediately after the enabling double push).
 */

// --- pure rules --------------------------------------------------------------

/** 1 = White to move/owns the piece, -1 = Black. */
export type Side = 1 | -1;

/** 0 empty; signed piece code, abs value 1=pawn 2=knight 3=bishop 4=rook 5=queen 6=king. */
export type PieceCode = number;

/** Flat 64-cell row-major board. Square = rank*8 + file (0 = a1, 63 = h8). */
export type ChessBoard = PieceCode[];

export const PIECE = { PAWN: 1, KNIGHT: 2, BISHOP: 3, ROOK: 4, QUEEN: 5, KING: 6 } as const;

export type CastlingRights = { wk: boolean; wq: boolean; bk: boolean; bq: boolean };

export type ChessState = {
  board: ChessBoard;
  side: Side;
  castling: CastlingRights;
  /** En-passant target square (where a capturing pawn would land), or -1. */
  ep: number;
  halfmove: number;
  fullmove: number;
};

export type MoveFlag = 'normal' | 'double' | 'ep' | 'castleK' | 'castleQ' | 'promotion';

export type Move = {
  from: number;
  to: number;
  /** The moving piece's signed code BEFORE any promotion. */
  piece: PieceCode;
  /** The captured piece's signed code, or 0. */
  captured: PieceCode;
  flag: MoveFlag;
  /** Signed code the pawn promotes to. Always a queen in this app. */
  promotion?: PieceCode;
};

function sideOf(p: PieceCode): Side {
  return p > 0 ? 1 : -1;
}

export function fileOf(sq: number): number {
  return sq % 8;
}
export function rankOf(sq: number): number {
  return Math.floor(sq / 8);
}
export function sqOf(file: number, rank: number): number {
  return rank * 8 + file;
}
function onBoard(file: number, rank: number): boolean {
  return file >= 0 && file < 8 && rank >= 0 && rank < 8;
}

export function algebraicFromSquare(sq: number): string {
  return String.fromCharCode(97 + fileOf(sq)) + String(rankOf(sq) + 1);
}
export function squareFromAlgebraic(s: string): number {
  const file = s.charCodeAt(0) - 97;
  const rank = Number(s[1]) - 1;
  return sqOf(file, rank);
}

/** The standard starting position, White to move, full castling rights. */
export function initialState(): ChessState {
  const board: ChessBoard = new Array<PieceCode>(64).fill(0);
  const backRank = [4, 2, 3, 5, 6, 3, 2, 4]; // R N B Q K B N R
  for (let f = 0; f < 8; f += 1) {
    board[sqOf(f, 0)] = backRank[f];
    board[sqOf(f, 1)] = 1;
    board[sqOf(f, 6)] = -1;
    board[sqOf(f, 7)] = -backRank[f];
  }
  return {
    board,
    side: 1,
    castling: { wk: true, wq: true, bk: true, bq: true },
    ep: -1,
    halfmove: 0,
    fullmove: 1,
  };
}

const LETTER_TO_TYPE: Record<string, number> = { p: 1, n: 2, b: 3, r: 4, q: 5, k: 6 };

/** Builds a ChessState from Forsyth-Edwards Notation. Used heavily by the checker. */
export function stateFromFEN(fen: string): ChessState {
  const parts = fen.trim().split(/\s+/);
  const [placement, activeColor, castlingPart, epPart, halfPart, fullPart] = parts;
  const board: ChessBoard = new Array<PieceCode>(64).fill(0);
  const ranks = placement.split('/'); // ranks[0] = rank 8 ... ranks[7] = rank 1
  for (let i = 0; i < 8; i += 1) {
    const rankIndex = 7 - i;
    let file = 0;
    for (const ch of ranks[i]) {
      if (ch >= '1' && ch <= '8') {
        file += Number(ch);
        continue;
      }
      const lower = ch.toLowerCase();
      const type = LETTER_TO_TYPE[lower];
      const side: Side = ch === lower ? -1 : 1;
      board[sqOf(file, rankIndex)] = side * type;
      file += 1;
    }
  }
  const side: Side = activeColor === 'b' ? -1 : 1;
  const castling: CastlingRights = {
    wk: castlingPart.includes('K'),
    wq: castlingPart.includes('Q'),
    bk: castlingPart.includes('k'),
    bq: castlingPart.includes('q'),
  };
  const ep = epPart && epPart !== '-' ? squareFromAlgebraic(epPart) : -1;
  const halfmove = halfPart ? Number(halfPart) : 0;
  const fullmove = fullPart ? Number(fullPart) : 1;
  return { board, side, castling, ep, halfmove, fullmove };
}

const KNIGHT_OFFSETS: ReadonlyArray<[number, number]> = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];
const DIAG_DIRS: ReadonlyArray<[number, number]> = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const STRAIGHT_DIRS: ReadonlyArray<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Is `sq` attacked by any piece belonging to `bySide`, on this raw board? */
export function isSquareAttacked(board: ChessBoard, sq: number, bySide: Side): boolean {
  const f = fileOf(sq);
  const r = rankOf(sq);

  // Pawn attacks: a bySide pawn one rank "behind" sq (relative to its own
  // forward direction) and one file over attacks sq.
  const pr = r - bySide;
  if (pr >= 0 && pr < 8) {
    for (const df of [-1, 1]) {
      const pf = f + df;
      if (pf >= 0 && pf < 8 && board[sqOf(pf, pr)] === bySide * PIECE.PAWN) return true;
    }
  }

  for (const [df, dr] of KNIGHT_OFFSETS) {
    const nf = f + df;
    const nr = r + dr;
    if (onBoard(nf, nr) && board[sqOf(nf, nr)] === bySide * PIECE.KNIGHT) return true;
  }

  for (let df = -1; df <= 1; df += 1) {
    for (let dr = -1; dr <= 1; dr += 1) {
      if (df === 0 && dr === 0) continue;
      const nf = f + df;
      const nr = r + dr;
      if (onBoard(nf, nr) && board[sqOf(nf, nr)] === bySide * PIECE.KING) return true;
    }
  }

  for (const [df, dr] of DIAG_DIRS) {
    let nf = f + df;
    let nr = r + dr;
    while (onBoard(nf, nr)) {
      const p = board[sqOf(nf, nr)];
      if (p !== 0) {
        const t = Math.abs(p);
        if (sideOf(p) === bySide && (t === PIECE.BISHOP || t === PIECE.QUEEN)) return true;
        break;
      }
      nf += df;
      nr += dr;
    }
  }
  for (const [df, dr] of STRAIGHT_DIRS) {
    let nf = f + df;
    let nr = r + dr;
    while (onBoard(nf, nr)) {
      const p = board[sqOf(nf, nr)];
      if (p !== 0) {
        const t = Math.abs(p);
        if (sideOf(p) === bySide && (t === PIECE.ROOK || t === PIECE.QUEEN)) return true;
        break;
      }
      nf += df;
      nr += dr;
    }
  }
  return false;
}

/** Is `side`'s king (defaulting to the side to move) currently in check? */
export function inCheck(state: ChessState, side: Side = state.side): boolean {
  const kingVal = side * PIECE.KING;
  let kingSq = -1;
  for (let i = 0; i < 64; i += 1) {
    if (state.board[i] === kingVal) {
      kingSq = i;
      break;
    }
  }
  if (kingSq === -1) return false; // should never happen from a legal state
  return isSquareAttacked(state.board, kingSq, side === 1 ? -1 : 1);
}

function addPawnMove(
  from: number,
  to: number,
  side: Side,
  promoRank: number,
  captured: PieceCode,
  flag: MoveFlag,
  moves: Move[],
): void {
  if (rankOf(to) === promoRank) {
    moves.push({ from, to, piece: side * PIECE.PAWN, captured, flag: 'promotion', promotion: side * PIECE.QUEEN });
  } else {
    moves.push({ from, to, piece: side * PIECE.PAWN, captured, flag });
  }
}

function genPawnMoves(state: ChessState, sqi: number, side: Side, moves: Move[]): void {
  const board = state.board;
  const f = fileOf(sqi);
  const r = rankOf(sqi);
  const startRank = side === 1 ? 1 : 6;
  const promoRank = side === 1 ? 7 : 0;

  const oneR = r + side;
  if (oneR >= 0 && oneR < 8) {
    const oneStep = sqOf(f, oneR);
    if (board[oneStep] === 0) {
      addPawnMove(sqi, oneStep, side, promoRank, 0, 'normal', moves);
      if (r === startRank) {
        const twoR = r + side * 2;
        const twoStep = sqOf(f, twoR);
        if (board[twoStep] === 0) moves.push({ from: sqi, to: twoStep, piece: side * PIECE.PAWN, captured: 0, flag: 'double' });
      }
    }
  }

  for (const df of [-1, 1]) {
    const nf = f + df;
    const nr = r + side;
    if (nf < 0 || nf >= 8 || nr < 0 || nr >= 8) continue;
    const to = sqOf(nf, nr);
    const target = board[to];
    if (target !== 0 && sideOf(target) !== side) {
      addPawnMove(sqi, to, side, promoRank, target, 'normal', moves);
    } else if (target === 0 && to === state.ep) {
      const capturedSq = to - side * 8;
      moves.push({ from: sqi, to, piece: side * PIECE.PAWN, captured: board[capturedSq], flag: 'ep' });
    }
  }
}

function genCastles(state: ChessState, side: Side, moves: Move[]): void {
  const board = state.board;
  const opp: Side = side === 1 ? -1 : 1;
  if (side === 1) {
    if (state.castling.wk && board[4] === 6 && board[7] === 4 && board[5] === 0 && board[6] === 0) {
      if (!isSquareAttacked(board, 4, opp) && !isSquareAttacked(board, 5, opp) && !isSquareAttacked(board, 6, opp)) {
        moves.push({ from: 4, to: 6, piece: 6, captured: 0, flag: 'castleK' });
      }
    }
    if (state.castling.wq && board[4] === 6 && board[0] === 4 && board[1] === 0 && board[2] === 0 && board[3] === 0) {
      if (!isSquareAttacked(board, 4, opp) && !isSquareAttacked(board, 3, opp) && !isSquareAttacked(board, 2, opp)) {
        moves.push({ from: 4, to: 2, piece: 6, captured: 0, flag: 'castleQ' });
      }
    }
  } else {
    if (state.castling.bk && board[60] === -6 && board[63] === -4 && board[61] === 0 && board[62] === 0) {
      if (!isSquareAttacked(board, 60, opp) && !isSquareAttacked(board, 61, opp) && !isSquareAttacked(board, 62, opp)) {
        moves.push({ from: 60, to: 62, piece: -6, captured: 0, flag: 'castleK' });
      }
    }
    if (state.castling.bq && board[60] === -6 && board[56] === -4 && board[57] === 0 && board[58] === 0 && board[59] === 0) {
      if (!isSquareAttacked(board, 60, opp) && !isSquareAttacked(board, 59, opp) && !isSquareAttacked(board, 58, opp)) {
        moves.push({ from: 60, to: 58, piece: -6, captured: 0, flag: 'castleQ' });
      }
    }
  }
}

/** Every pseudo-legal move for the side to move: legal by piece movement rules,
 * but NOT yet filtered for leaving the mover's own king in check. */
export function pseudoMoves(state: ChessState): Move[] {
  const moves: Move[] = [];
  const board = state.board;
  const side = state.side;
  for (let sqi = 0; sqi < 64; sqi += 1) {
    const p = board[sqi];
    if (p === 0 || sideOf(p) !== side) continue;
    const type = Math.abs(p);
    const f = fileOf(sqi);
    const r = rankOf(sqi);

    if (type === PIECE.PAWN) {
      genPawnMoves(state, sqi, side, moves);
    } else if (type === PIECE.KNIGHT) {
      for (const [df, dr] of KNIGHT_OFFSETS) {
        const nf = f + df;
        const nr = r + dr;
        if (!onBoard(nf, nr)) continue;
        const to = sqOf(nf, nr);
        const target = board[to];
        if (target === 0 || sideOf(target) !== side) moves.push({ from: sqi, to, piece: p, captured: target, flag: 'normal' });
      }
    } else if (type === PIECE.KING) {
      for (let df = -1; df <= 1; df += 1) {
        for (let dr = -1; dr <= 1; dr += 1) {
          if (df === 0 && dr === 0) continue;
          const nf = f + df;
          const nr = r + dr;
          if (!onBoard(nf, nr)) continue;
          const to = sqOf(nf, nr);
          const target = board[to];
          if (target === 0 || sideOf(target) !== side) moves.push({ from: sqi, to, piece: p, captured: target, flag: 'normal' });
        }
      }
      genCastles(state, side, moves);
    } else {
      const dirs =
        type === PIECE.BISHOP ? DIAG_DIRS : type === PIECE.ROOK ? STRAIGHT_DIRS : [...DIAG_DIRS, ...STRAIGHT_DIRS];
      for (const [df, dr] of dirs) {
        let nf = f + df;
        let nr = r + dr;
        while (onBoard(nf, nr)) {
          const to = sqOf(nf, nr);
          const target = board[to];
          if (target === 0) {
            moves.push({ from: sqi, to, piece: p, captured: 0, flag: 'normal' });
          } else {
            if (sideOf(target) !== side) moves.push({ from: sqi, to, piece: p, captured: target, flag: 'normal' });
            break;
          }
          nf += df;
          nr += dr;
        }
      }
    }
  }
  return moves;
}

/** Applies `move` and returns a brand-new state (does not mutate `state`). */
export function applyMove(state: ChessState, move: Move): ChessState {
  const board = state.board.slice();
  const side = state.side;
  const moving = move.piece;
  const type = Math.abs(moving);

  if (move.flag === 'ep') {
    const capSq = move.to - side * 8;
    board[capSq] = 0;
  }

  board[move.from] = 0;
  board[move.to] = move.flag === 'promotion' && move.promotion !== undefined ? move.promotion : moving;

  if (move.flag === 'castleK') {
    if (side === 1) {
      board[7] = 0;
      board[5] = 4;
    } else {
      board[63] = 0;
      board[61] = -4;
    }
  } else if (move.flag === 'castleQ') {
    if (side === 1) {
      board[0] = 0;
      board[3] = 4;
    } else {
      board[56] = 0;
      board[59] = -4;
    }
  }

  const castling: CastlingRights = { ...state.castling };
  if (type === PIECE.KING) {
    if (side === 1) {
      castling.wk = false;
      castling.wq = false;
    } else {
      castling.bk = false;
      castling.bq = false;
    }
  }
  if (move.from === 0 || move.to === 0) castling.wq = false;
  if (move.from === 7 || move.to === 7) castling.wk = false;
  if (move.from === 56 || move.to === 56) castling.bq = false;
  if (move.from === 63 || move.to === 63) castling.bk = false;

  const ep = move.flag === 'double' ? (move.from + move.to) / 2 : -1;
  const halfmove = type === PIECE.PAWN || move.captured !== 0 ? 0 : state.halfmove + 1;
  const fullmove = side === -1 ? state.fullmove + 1 : state.fullmove;

  return { board, side: side === 1 ? -1 : 1, castling, ep, halfmove, fullmove };
}

/** All fully legal moves for the side to move: pseudo-legal, minus any that
 * would leave the mover's own king in check. This one filter is also what
 * makes pins, "can't castle through/out of check", and "can't walk into
 * check" all correct, without any of them being a separate special case. */
export function legalMoves(state: ChessState): Move[] {
  const pseudo = pseudoMoves(state);
  const legal: Move[] = [];
  for (const m of pseudo) {
    const next = applyMove(state, m);
    if (!inCheck(next, state.side)) legal.push(m);
  }
  return legal;
}

export function isCheckmate(state: ChessState): boolean {
  return inCheck(state, state.side) && legalMoves(state).length === 0;
}
export function isStalemate(state: ChessState): boolean {
  return !inCheck(state, state.side) && legalMoves(state).length === 0;
}

/** Leaf-node count of the legal-move tree to `depth` plies - the standard
 * brute-force proof that move generation (incl. castling/en passant/promotion/
 * check filtering) is correct, since the counts from the start position are
 * well-known constants. */
export function perft(state: ChessState, depth: number): number {
  if (depth <= 0) return 1;
  let nodes = 0;
  for (const m of legalMoves(state)) nodes += perft(applyMove(state, m), depth - 1);
  return nodes;
}

// --- evaluation + search -----------------------------------------------------

const PIECE_VALUE: Record<number, number> = { 1: 100, 2: 320, 3: 330, 4: 500, 5: 900, 6: 0 };

// Standard "simplified evaluation function" piece-square tables (White's point
// of view, listed rank 8 -> rank 1, file a -> h). Mirrored for Black in pst().
const PAWN_PST = [
  0, 0, 0, 0, 0, 0, 0, 0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
  5, 5, 10, 25, 25, 10, 5, 5,
  0, 0, 0, 20, 20, 0, 0, 0,
  5, -5, -10, 0, 0, -10, -5, 5,
  5, 10, 10, -20, -20, 10, 10, 5,
  0, 0, 0, 0, 0, 0, 0, 0,
];
const KNIGHT_PST = [
  -50, -40, -30, -30, -30, -30, -40, -50,
  -40, -20, 0, 0, 0, 0, -20, -40,
  -30, 0, 10, 15, 15, 10, 0, -30,
  -30, 5, 15, 20, 20, 15, 5, -30,
  -30, 0, 15, 20, 20, 15, 0, -30,
  -30, 5, 10, 15, 15, 10, 5, -30,
  -40, -20, 0, 5, 5, 0, -20, -40,
  -50, -40, -30, -30, -30, -30, -40, -50,
];
const BISHOP_PST = [
  -20, -10, -10, -10, -10, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 10, 10, 5, 0, -10,
  -10, 5, 5, 10, 10, 5, 5, -10,
  -10, 0, 10, 10, 10, 10, 0, -10,
  -10, 10, 10, 10, 10, 10, 10, -10,
  -10, 5, 0, 0, 0, 0, 5, -10,
  -20, -10, -10, -10, -10, -10, -10, -20,
];
const ROOK_PST = [
  0, 0, 0, 0, 0, 0, 0, 0,
  5, 10, 10, 10, 10, 10, 10, 5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  0, 0, 0, 5, 5, 0, 0, 0,
];
const QUEEN_PST = [
  -20, -10, -10, -5, -5, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 5, 5, 5, 0, -10,
  -5, 0, 5, 5, 5, 5, 0, -5,
  0, 0, 5, 5, 5, 5, 0, -5,
  -10, 5, 5, 5, 5, 5, 0, -10,
  -10, 0, 5, 0, 0, 0, 0, -10,
  -20, -10, -10, -5, -5, -10, -10, -20,
];
const KING_PST = [
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -20, -30, -30, -40, -40, -30, -30, -20,
  -10, -20, -20, -20, -20, -20, -20, -10,
  20, 20, 0, 0, 0, 0, 20, 20,
  20, 30, 10, 0, 0, 10, 30, 20,
];
const PST: Record<number, number[]> = { 1: PAWN_PST, 2: KNIGHT_PST, 3: BISHOP_PST, 4: ROOK_PST, 5: QUEEN_PST, 6: KING_PST };

function pstValue(table: number[], sq: number, side: Side): number {
  const file = fileOf(sq);
  const rank = rankOf(sq);
  const idx = side === 1 ? (7 - rank) * 8 + file : rank * 8 + file;
  return table[idx];
}

/** Material + piece-square positioning, from White's point of view (positive = good for White). */
export function evaluate(state: ChessState): number {
  let score = 0;
  for (let sq = 0; sq < 64; sq += 1) {
    const p = state.board[sq];
    if (p === 0) continue;
    const side = sideOf(p);
    const type = Math.abs(p);
    score += side * (PIECE_VALUE[type] + pstValue(PST[type], sq, side));
  }
  return score;
}

function moveOrderScore(m: Move): number {
  if (m.captured !== 0) return 10 * PIECE_VALUE[Math.abs(m.captured)] - PIECE_VALUE[Math.abs(m.piece)];
  if (m.flag === 'promotion') return 500;
  return 0;
}
function orderedMoves(state: ChessState): Move[] {
  return legalMoves(state).sort((a, b) => moveOrderScore(b) - moveOrderScore(a));
}

const MATE_SCORE = 1_000_000;

function negamax(state: ChessState, depth: number, alpha: number, beta: number): number {
  const moves = orderedMoves(state);
  if (moves.length === 0) return inCheck(state, state.side) ? -MATE_SCORE : 0;
  if (depth <= 0) return state.side === 1 ? evaluate(state) : -evaluate(state);

  let a = alpha;
  let best = -Infinity;
  for (const m of moves) {
    const score = -negamax(applyMove(state, m), depth - 1, -beta, -a);
    if (score > best) best = score;
    if (best > a) a = best;
    if (a >= beta) break;
  }
  return best;
}

/** The engine's chosen move at `depth` plies, or null if there is none (game over). */
export function searchBestMove(state: ChessState, depth: number): Move | null {
  const moves = orderedMoves(state);
  if (moves.length === 0) return null;
  let best = -Infinity;
  let pick = moves[0];
  let alpha = -Infinity;
  for (const m of moves) {
    const score = -negamax(applyMove(state, m), depth - 1, -Infinity, -alpha);
    if (score > best) {
      best = score;
      pick = m;
    }
    if (best > alpha) alpha = best;
  }
  return pick;
}

/** Search depth per difficulty. Depth 3 (hard) is 3 plies of full alpha-beta
 * search with capture-first move ordering - fast (well under a second) on a
 * mid iPad from any midgame position. */
export const CPU_DEPTH: Record<Difficulty, number> = { easy: 1, normal: 2, hard: 3 };
/** Chance the computer plays an arbitrary legal move instead of the best one. */
export const CPU_BLUNDER: Record<Difficulty, number> = { easy: 0.35, normal: 0.12, hard: 0 };

/** Seeded LCG - nothing in the pure core ever touches Math.random. */
export function lcg(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** What the computer actually plays: a blunder with probability `randomness`, else the search result. */
export function cpuMove(state: ChessState, depth: number, randomness: number, rng: () => number): Move | null {
  const moves = legalMoves(state);
  if (moves.length === 0) return null;
  if (rng() < randomness) return moves[Math.floor(rng() * moves.length)];
  return searchBestMove(state, depth);
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

/** Which square (0..63) a canvas-space point hits, or -1 if outside the board.
 * White sits at the bottom of the screen always (board orientation is fixed
 * for both modes - simplification, stated in the report). */
export function squareAtPoint(l: Layout, x: number, y: number): number {
  if (x < l.ox || x > l.ox + l.size || y < l.oy || y > l.oy + l.size) return -1;
  const col = Math.min(7, Math.max(0, Math.floor((x - l.ox) / l.cell)));
  const row = Math.min(7, Math.max(0, Math.floor((y - l.oy) / l.cell)));
  const file = col;
  const rank = 7 - row;
  return sqOf(file, rank);
}

function pointForSquare(l: Layout, sq: number): { x: number; y: number } {
  const col = fileOf(sq);
  const row = 7 - rankOf(sq);
  return { x: l.ox + (col + 0.5) * l.cell, y: l.oy + (row + 0.5) * l.cell };
}

// --- state ---------------------------------------------------------------

type UIState = {
  mode: Mode;
  phase: Phase;
  chess: ChessState;
  /** The human's colour in cpu mode. Always White (simplification, stated in the report). */
  human: Side;
  selected: number;
  legalTargets: Move[];
  resultText: string;
  lastMove: Move | null;
  cpuWait: number;
  overT: number;
  time: number;
};

function startMatch(s: UIState, mode: Mode): void {
  s.mode = mode;
  s.phase = 'play';
  s.chess = initialState();
  s.human = 1;
  s.selected = -1;
  s.legalTargets = [];
  s.resultText = '';
  s.lastMove = null;
  s.cpuWait = 0;
  s.overT = 0;
}

function initialUIState(): UIState {
  return {
    mode: 'cpu',
    phase: 'menu',
    chess: initialState(),
    human: 1,
    selected: -1,
    legalTargets: [],
    resultText: '',
    lastMove: null,
    cpuWait: 0,
    overT: 0,
    time: 0,
  };
}

// --- component ---------------------------------------------------------------

type GameApi = GameCanvasProps['api'];

const WHITE_COLOR = '#f2f2f2';
const BLACK_COLOR = '#2b2d3a';

export default function Chess({ paused, api, restartToken, difficulty, controlsInset }: GameCanvasProps) {
  const stateRef = useRef<UIState>(initialUIState());
  const layoutRef = useRef<Layout>({ ox: 0, oy: 0, size: 1, cell: 1 });
  const rngRef = useRef<() => number>(lcg(1));

  useEffect(() => {
    rngRef.current = lcg((Date.now() ^ Math.imul(restartToken + 1, 2654435761)) >>> 0 || 1);
    stateRef.current = initialUIState();
  }, [restartToken]);

  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  const resolveResult = (s: UIState, kind: 'checkmate' | 'stalemate', winner: Side | 0, api: GameApi): void => {
    if (kind === 'stalemate') {
      playSound('pass');
      api.addScore(20);
      s.resultText = 'Stalemate - a draw!';
      api.setStatus(s.resultText);
      return;
    }
    if (s.mode === 'cpu') {
      if (winner === s.human) {
        playSound('levelClear');
        api.addScore(100);
        s.resultText = 'Checkmate - you win!';
        api.setStatus(s.resultText);
      } else {
        s.resultText = 'Checkmate - computer wins';
        api.died(s.resultText);
      }
    } else {
      playSound('levelClear');
      api.addScore(80);
      s.resultText = `Checkmate - ${winner === 1 ? 'White' : 'Black'} wins!`;
      api.setStatus(s.resultText);
    }
  };

  /** Applies one already-chosen legal Move, checks for game end, and arms the
   * computer's reply timer if it is now its turn. */
  const makeMove = (s: UIState, move: Move, api: GameApi): void => {
    const capturing = move.captured !== 0;
    const moverSide = s.chess.side;
    s.chess = applyMove(s.chess, move);
    s.lastMove = move;
    s.selected = -1;
    s.legalTargets = [];
    playSound(capturing ? 'brick' : 'click');

    if (isCheckmate(s.chess)) {
      s.phase = 'over';
      s.overT = 0;
      resolveResult(s, 'checkmate', moverSide, api);
    } else if (isStalemate(s.chess)) {
      s.phase = 'over';
      s.overT = 0;
      resolveResult(s, 'stalemate', 0, api);
    } else if (s.mode === 'cpu' && s.chess.side !== s.human) {
      s.cpuWait = 0.5;
    }
  };

  const handlePlayTap = (s: UIState, sq: number, api: GameApi): void => {
    if (s.mode === 'cpu' && s.chess.side !== s.human) return; // computer's turn

    if (s.selected < 0) {
      const piece = s.chess.board[sq];
      if (piece !== 0 && sideOf(piece) === s.chess.side) {
        s.selected = sq;
        s.legalTargets = legalMoves(s.chess).filter((m) => m.from === sq);
        playSound('click');
      }
      return;
    }

    if (sq === s.selected) {
      s.selected = -1;
      s.legalTargets = [];
      return;
    }

    const found = s.legalTargets.find((m) => m.to === sq);
    if (found) {
      makeMove(s, found, api);
      return;
    }

    const piece = s.chess.board[sq];
    if (piece !== 0 && sideOf(piece) === s.chess.side) {
      s.selected = sq;
      s.legalTargets = legalMoves(s.chess).filter((m) => m.from === sq);
      playSound('click');
    } else {
      s.selected = -1;
      s.legalTargets = [];
    }
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
    const sq = squareAtPoint(l, sx, sy);
    if (sq < 0) return;
    handlePlayTap(s, sq, api);
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

        if (s.phase === 'play' && s.mode === 'cpu' && s.chess.side !== s.human && s.cpuWait > 0) {
          s.cpuWait -= dt;
          if (s.cpuWait <= 0) {
            const move = cpuMove(s.chess, CPU_DEPTH[difficulty], CPU_BLUNDER[difficulty], rngRef.current);
            if (move) makeMove(s, move, api);
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

function glyphFor(piece: PieceCode): string {
  // Unicode escapes (not literal glyphs) so this source file stays ASCII-only.
  switch (piece) {
    case 1:
      return '\u2659'; // white pawn
    case 2:
      return '\u2658'; // white knight
    case 3:
      return '\u2657'; // white bishop
    case 4:
      return '\u2656'; // white rook
    case 5:
      return '\u2655'; // white queen
    case 6:
      return '\u2654'; // white king
    case -1:
      return '\u265F'; // black pawn
    case -2:
      return '\u265E'; // black knight
    case -3:
      return '\u265D'; // black bishop
    case -4:
      return '\u265C'; // black rook
    case -5:
      return '\u265B'; // black queen
    case -6:
      return '\u265A'; // black king
    default:
      return '';
  }
}

function draw(ctx: CanvasRenderingContext2D, s: UIState, l: Layout, cw: number, ch: number, paused: boolean): void {
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
  ctx.fillText('Chess', cw / 2, ch * 0.18);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `600 ${Math.min(18, cw * 0.045)}px system-ui, sans-serif`;
  ctx.fillText('Pick how to play', cw / 2, ch * 0.18 + 34);

  const bw = Math.min(cw * 0.4, 260);
  const bh = Math.min(ch * 0.32, 220);
  const by = ch * 0.5 - bh / 2;
  drawMenuButton(ctx, cw / 2 - bw - 12, by, bw, bh, '2 Players', 'Pass and play', '#5ec8ff');
  drawMenuButton(ctx, cw / 2 + 12, by, bw, bh, 'vs Computer', 'Beat the bot', '#ffd75e');

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

function drawTopBar(ctx: CanvasRenderingContext2D, s: UIState, cw: number): void {
  roundRect(ctx, 12, 10, 72, TOP - 20, 12);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '600 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Menu', 48, TOP / 2 + 1);

  ctx.textAlign = 'right';
  if (s.phase === 'play') {
    const cpuTurn = s.mode === 'cpu' && s.chess.side !== s.human;
    const check = inCheck(s.chess) ? ' - Check!' : '';
    const label = cpuTurn
      ? 'Computer thinking...'
      : (s.mode === 'cpu' ? 'Your turn' : `${s.chess.side === 1 ? 'White' : 'Black'}'s turn`) + check;
    ctx.fillStyle = s.chess.side === 1 ? WHITE_COLOR : '#c8c8ff';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText(label, cw - 16, TOP / 2 + 1);
  }
}

function drawBoard(ctx: CanvasRenderingContext2D, s: UIState, l: Layout): void {
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const x = l.ox + col * l.cell;
      const y = l.oy + row * l.cell;
      ctx.fillStyle = (row + col) % 2 === 0 ? '#efe4cf' : '#7c5a3a';
      ctx.fillRect(x, y, l.cell, l.cell);
    }
  }

  if (s.lastMove) {
    highlightSquare(ctx, l, s.lastMove.from, 'rgba(255,215,0,0.25)');
    highlightSquare(ctx, l, s.lastMove.to, 'rgba(255,215,0,0.25)');
  }

  if (s.selected >= 0) {
    highlightSquare(ctx, l, s.selected, 'rgba(255,255,255,0.35)');
    for (const m of s.legalTargets) {
      if (m.captured !== 0) highlightSquare(ctx, l, m.to, 'rgba(230,57,70,0.35)');
      else drawDot(ctx, l, m.to);
    }
  }

  if (inCheck(s.chess)) {
    const kingVal = s.chess.side * PIECE.KING;
    for (let i = 0; i < 64; i += 1) {
      if (s.chess.board[i] === kingVal) {
        highlightSquare(ctx, l, i, 'rgba(230,57,70,0.45)');
        break;
      }
    }
  }

  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(l.ox, l.oy, l.size, l.size);
}

function highlightSquare(ctx: CanvasRenderingContext2D, l: Layout, sq: number, color: string): void {
  const p = pointForSquare(l, sq);
  ctx.fillStyle = color;
  ctx.fillRect(p.x - l.cell / 2, p.y - l.cell / 2, l.cell, l.cell);
}

function drawDot(ctx: CanvasRenderingContext2D, l: Layout, sq: number): void {
  const p = pointForSquare(l, sq);
  ctx.beginPath();
  ctx.arc(p.x, p.y, l.cell * 0.16, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(94,200,255,0.85)';
  ctx.fill();
}

function drawPieces(ctx: CanvasRenderingContext2D, s: UIState, l: Layout): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let sq = 0; sq < 64; sq += 1) {
    const piece = s.chess.board[sq];
    if (piece === 0) continue;
    const p = pointForSquare(l, sq);
    ctx.font = `${Math.round(l.cell * 0.72)}px "Apple Symbols", "Segoe UI Symbol", system-ui, sans-serif`;
    ctx.fillStyle = piece > 0 ? WHITE_COLOR : BLACK_COLOR;
    ctx.strokeStyle = piece > 0 ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    const glyph = glyphFor(piece);
    ctx.strokeText(glyph, p.x, p.y + 2);
    ctx.fillText(glyph, p.x, p.y + 2);
  }
  ctx.textBaseline = 'alphabetic';
}

function drawOver(ctx: CanvasRenderingContext2D, s: UIState, cw: number, ch: number): void {
  ctx.textAlign = 'center';
  const y = ch - 46;
  roundRect(ctx, cw / 2 - 160, y - 26, 320, 52, 16);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 19px system-ui, sans-serif';
  ctx.fillText(s.resultText, cw / 2, y - 2);
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
