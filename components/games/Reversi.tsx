'use client';

import { useEffect, useRef } from 'react';
import type { GameCanvasProps } from '@/lib/games';
import { useCanvasGame } from '@/lib/useCanvasGame';

export type Disc = 0 | 1 | 2;
export type ReversiBoard = Disc[];
export const R_SIZE = 8;
const DIRS = [-1, 0, 1].flatMap((dy) => [-1, 0, 1].filter((dx) => dx || dy).map((dx) => [dx, dy] as const));
const at = (x: number, y: number) => y * R_SIZE + x;
const inside = (x: number, y: number) => x >= 0 && x < R_SIZE && y >= 0 && y < R_SIZE;

export function newReversi(): ReversiBoard {
  const b: ReversiBoard = Array(R_SIZE * R_SIZE).fill(0) as ReversiBoard;
  b[at(3, 3)] = b[at(4, 4)] = 2; b[at(4, 3)] = b[at(3, 4)] = 1; return b;
}
export function flipsFor(b: ReversiBoard, player: 1 | 2, cell: number): number[] {
  if (b[cell]) return []; const x = cell % R_SIZE, y = Math.floor(cell / R_SIZE), other = player === 1 ? 2 : 1;
  const out: number[] = [];
  for (const [dx, dy] of DIRS) { const run: number[] = []; let xx = x + dx, yy = y + dy;
    while (inside(xx, yy) && b[at(xx, yy)] === other) { run.push(at(xx, yy)); xx += dx; yy += dy; }
    if (run.length && inside(xx, yy) && b[at(xx, yy)] === player) out.push(...run);
  } return out;
}
export function legalReversiMoves(b: ReversiBoard, p: 1 | 2): number[] { return b.map((_, i) => i).filter((i) => flipsFor(b, p, i).length); }
export function playReversi(b: ReversiBoard, p: 1 | 2, cell: number): ReversiBoard { const f = flipsFor(b, p, cell); if (!f.length) return b; const n = b.slice() as ReversiBoard; n[cell] = p; f.forEach((i) => n[i] = p); return n; }
export function chooseReversiCpu(b: ReversiBoard, p: 1 | 2): number | null { const m = legalReversiMoves(b, p); return m.sort((a, z) => flipsFor(b, p, z).length - flipsFor(b, p, a).length)[0] ?? null; }

type ReversiView = { b: ReversiBoard; turn: 1 | 2; cpu: number; message: string };
const freshReversiView = (): ReversiView => ({
  b: newReversi(),
  turn: 1,
  cpu: 0,
  message: 'Your turn: trap discs',
});

export default function Reversi({ paused, api, difficulty, restartToken }: GameCanvasProps) {
  const ref = useRef<ReversiView>(freshReversiView());
  useEffect(() => {
    ref.current = freshReversiView();
  }, [restartToken]);

  const finishRound = (board: ReversiBoard) => {
    const yours = board.filter((disc) => disc === 1).length;
    const theirs = board.filter((disc) => disc === 2).length;
    if (yours > theirs) api.addScore(50 + yours - theirs);
    ref.current = freshReversiView();
    api.requestGate(yours > theirs ? `Reversi won ${yours}–${theirs}!` : `Reversi round ${yours}–${theirs}`);
  };

  const tap = (x: number, y: number, w: number, h: number) => {
    const s = ref.current;
    if (paused || s.turn !== 1) return;
    const size = Math.min(w - 24, h - 76);
    const ox = (w - size) / 2;
    const oy = 54;
    const cx = Math.floor((x - ox) / (size / 8));
    const cy = Math.floor((y - oy) / (size / 8));
    if (!inside(cx, cy)) return;
    const i = at(cx, cy);
    const flips = flipsFor(s.b, 1, i);
    if (!flips.length) return;
    s.b = playReversi(s.b, 1, i);
    api.addScore(1 + flips.length);
    const cpuMoves = legalReversiMoves(s.b, 2);
    const yourMoves = legalReversiMoves(s.b, 1);
    if (!cpuMoves.length && !yourMoves.length) {
      finishRound(s.b);
    } else if (!cpuMoves.length) {
      s.message = 'Computer passes — play again!';
    } else {
      s.turn = 2;
      s.cpu = difficulty === 'easy' ? 1 : 0.45;
      s.message = 'Computer is thinking...';
    }
  };

  const { canvasRef } = useCanvasGame({
    active: true,
    step: (ctx, dt, w, h) => {
      const s = ref.current;
      if (!paused && s.turn === 2) {
        s.cpu -= dt;
        if (s.cpu <= 0) {
          const move = chooseReversiCpu(s.b, 2);
          if (move !== null) s.b = playReversi(s.b, 2, move);
          const yourMoves = legalReversiMoves(s.b, 1);
          const cpuMoves = legalReversiMoves(s.b, 2);
          if (!yourMoves.length && !cpuMoves.length) {
            finishRound(s.b);
          } else if (!yourMoves.length) {
            s.turn = 2;
            s.cpu = 0.55;
            s.message = 'No move for you — computer goes again';
          } else {
            s.turn = 1;
            s.message = 'Your turn: trap discs';
          }
        }
      }

      ctx.fillStyle = '#10241d';
      ctx.fillRect(0, 0, w, h);
      const z = Math.min(w - 24, h - 76);
      const ox = (w - z) / 2;
      const oy = 54;
      const c = z / 8;
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 18px system-ui';
      ctx.fillText('Reversi', 14, 28);
      ctx.font = '14px system-ui';
      ctx.fillText(s.message, 14, 47);
      const legal = new Set(s.turn === 1 ? legalReversiMoves(s.b, 1) : []);
      for (let i = 0; i < 64; i += 1) {
        const x = ox + (i % 8) * c;
        const y = oy + Math.floor(i / 8) * c;
        ctx.fillStyle = '#2b8c62';
        ctx.fillRect(x, y, c - 1, c - 1);
        if (legal.has(i)) {
          ctx.fillStyle = 'rgba(255,246,181,.28)';
          ctx.beginPath();
          ctx.arc(x + c / 2, y + c / 2, c * 0.12, 0, Math.PI * 2);
          ctx.fill();
        }
        if (s.b[i]) {
          ctx.beginPath();
          ctx.arc(x + c / 2, y + c / 2, c * 0.38, 0, Math.PI * 2);
          ctx.fillStyle = s.b[i] === 1 ? '#fff7df' : '#222';
          ctx.fill();
        }
      }
    },
  });
  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full touch-none"
      onPointerDown={(event) => {
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        tap(event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height);
      }}
    />
  );
}
