'use client';

import { useEffect, useRef } from 'react';
import type { GameCanvasProps } from '@/lib/games';
import { playSound } from '@/lib/sound';
import { useCanvasGame } from '@/lib/useCanvasGame';

/** A compact, single-die 12-point backgammon race. White travels 0→11; ink travels 11→0. */
export type BgBoard = number[];
export type BgState = { points: BgBoard; bar: [number, number]; off: [number, number]; turn: 0 | 1; die: number };
export type BgMove = [from: number, to: number];
export const BG_CHECKERS = 5;
const NONE = -99;

export function newBackgammon(): BgState {
  const points = Array(12).fill(0); points[0] = 3; points[3] = 2; points[8] = -2; points[11] = -3;
  return { points, bar: [0, 0], off: [0, 0], turn: 0, die: 1 };
}
export function allCheckersHome(s: BgState, player: 0 | 1): boolean {
  if (s.bar[player] > 0) return false;
  const sign = player === 0 ? 1 : -1;
  return s.points.every((value, point) => value * sign <= 0 || (player === 0 ? point >= 9 : point <= 2));
}
/** Overshooting is legal only for the checker furthest from the bearing-off edge. */
export function canBearOff(s: BgState, player: 0 | 1, from: number, die = s.die): boolean {
  if (!allCheckersHome(s, player)) return false;
  const target = from + (player === 0 ? die : -die);
  if (target >= 0 && target <= 11) return false;
  // An exact roll always bears off. The "furthest checker" rule applies only
  // when the die is larger than the checker's exact distance from the edge.
  if (player === 0 && target === 12) return true;
  if (player === 1 && target === -1) return true;
  if (player === 0 && target > 12) return !s.points.some((n, point) => n > 0 && point < from);
  if (player === 1 && target < -1) return !s.points.some((n, point) => n < 0 && point > from);
  return false;
}
export function bgLegalMoves(s: BgState, player: 0 | 1, die = s.die): BgMove[] {
  const sign = player === 0 ? 1 : -1;
  const froms = s.bar[player] ? [player === 0 ? -1 : 12] : s.points.flatMap((n, point) => n * sign > 0 ? [point] : []);
  return froms.flatMap((from) => {
    const to = from + sign * die;
    if (to < 0 || to > 11) return canBearOff(s, player, from, die) ? [[from, to] as BgMove] : [];
    const target = s.points[to];
    return target * sign >= 0 || Math.abs(target) === 1 ? [[from, to] as BgMove] : [];
  });
}
export function playBg(s: BgState, player: 0 | 1, from: number, die = s.die): BgState {
  const move = bgLegalMoves(s, player, die).find(([source]) => source === from);
  if (!move) return s;
  const [, to] = move; const sign = player === 0 ? 1 : -1;
  const next: BgState = { points: [...s.points], bar: [...s.bar] as [number, number], off: [...s.off] as [number, number], turn: s.turn, die: s.die };
  if (from < 0 || from > 11) next.bar[player] -= 1; else next.points[from] -= sign;
  if (to < 0 || to > 11) next.off[player] += 1;
  else {
    if (next.points[to] * sign < 0) next.bar[player === 0 ? 1 : 0] += 1;
    next.points[to] = sign;
  }
  return next;
}
export function chooseBgCpu(s: BgState): number | null {
  const moves = bgLegalMoves(s, 1);
  // Prefer a hit, then a bearing-off move, then the checker already nearest home.
  moves.sort((a, b) => {
    const score = ([, to]: BgMove) => (to < 0 ? 30 : s.points[to] > 0 ? 20 : 0) - to;
    return score(b) - score(a);
  });
  return moves[0]?.[0] ?? null;
}

type View = { s: BgState; selected: number; wait: number; notice: string; noticeT: number };
const fresh = (): View => ({ s: newBackgammon(), selected: NONE, wait: 0, notice: 'White moves left to right. Tap a white checker, then a glowing point.', noticeT: 3 });
const roll = () => 1 + Math.floor(Math.random() * 6);

function pointAt(x: number, w: number): number | null {
  const margin = 12; const pointW = (w - margin * 2) / 12; const point = Math.floor((x - margin) / pointW);
  return point >= 0 && point < 12 ? point : null;
}
function barHit(x: number, y: number, w: number): boolean { return y < 88 && x >= w / 2 - 27 && x <= w / 2 + 27; }
function offHit(x: number, y: number, w: number): boolean { return y < 88 && x >= w - 70; }

export default function Backgammon({ paused, api, difficulty, restartToken }: GameCanvasProps) {
  const ref = useRef<View>(fresh());
  useEffect(() => { ref.current = fresh(); }, [restartToken]);
  const tap = (x: number, y: number, w: number) => {
    const view = ref.current;
    if (paused || view.s.turn !== 0 || view.wait > 0) return;
    const moves = bgLegalMoves(view.s, 0);
    if (!moves.length) { view.s.turn = 1; view.wait = difficulty === 'easy' ? 1.05 : .55; view.notice = 'No legal move — passing to ink.'; view.noticeT = 1.4; return; }
    const tappedBar = barHit(x, y, w); const tappedOff = offHit(x, y, w); const point = tappedBar || tappedOff ? null : pointAt(x, w);
    if (view.selected === NONE) {
      const source = tappedBar ? -1 : point;
      if (source !== null && moves.some(([from]) => from === source)) { view.selected = source; view.notice = 'Now tap a glowing landing point.'; view.noticeT = 1.5; playSound('click'); }
      else { view.notice = view.s.bar[0] ? 'Enter your bar checker first.' : 'Choose a white checker with a glowing move.'; view.noticeT = 1.3; playSound('wrong'); }
      return;
    }
    const chosen = moves.find(([from, to]) => from === view.selected && ((to >= 0 && to <= 11 && to === point) || ((to < 0 || to > 11) && tappedOff)));
    if (!chosen) {
      const source = tappedBar ? -1 : point;
      if (source !== null && moves.some(([from]) => from === source)) { view.selected = source; view.notice = 'Changed checker. Tap its glowing landing point.'; view.noticeT = 1.2; }
      else { view.notice = 'That is not a legal landing point.'; view.noticeT = 1.2; playSound('wrong'); }
      return;
    }
    view.s = playBg(view.s, 0, chosen[0]); view.selected = NONE; api.addScore(2); playSound('land');
    if (view.s.off[0] >= BG_CHECKERS) { api.addScore(50); ref.current = fresh(); api.requestGate('Backgammon race won!'); return; }
    view.s.turn = 1; view.wait = difficulty === 'easy' ? 1 : .42; view.notice = 'Ink is thinking…'; view.noticeT = 1;
  };
  const { canvasRef } = useCanvasGame({ active: !paused, step: (ctx, dt, w, h) => {
    const view = ref.current; view.noticeT = Math.max(0, view.noticeT - dt);
    if (view.s.turn === 0 && !view.wait && bgLegalMoves(view.s, 0).length === 0) { view.s.turn = 1; view.wait = difficulty === 'easy' ? 1.05 : .55; view.notice = 'No legal move — passing to ink.'; view.noticeT = 1.4; }
    if (view.s.turn === 1) {
      view.wait -= dt;
      if (view.wait <= 0) {
        const from = chooseBgCpu(view.s);
        if (from !== null) view.s = playBg(view.s, 1, from);
        if (view.s.off[1] >= BG_CHECKERS) { ref.current = fresh(); api.died('Ink bore off every checker'); }
        else { view.s.turn = 0; view.s.die = roll(); view.notice = from === null ? 'Ink passes. Your turn!' : `Your die is ${view.s.die}.`; view.noticeT = 1.7; }
      }
    }
    draw(ctx, ref.current, w, h);
  } });
  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" aria-label="Mini Backgammon game" onPointerDown={(event) => { const rect = event.currentTarget.getBoundingClientRect(); tap(event.clientX - rect.left, event.clientY - rect.top, rect.width); }} />;
}

function draw(ctx: CanvasRenderingContext2D, view: View, w: number, h: number) {
  const { s } = view; const top = 96; const bottom = h - 20; const margin = 12; const pointW = (w - margin * 2) / 12; const legal = s.turn === 0 ? bgLegalMoves(s, 0) : [];
  ctx.fillStyle = '#1f1010'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#5e3024'; ctx.fillRect(7, 7, w - 14, h - 14); ctx.fillStyle = '#d9a86f'; ctx.fillRect(12, top, w - 24, bottom - top);
  for (let point = 0; point < 12; point += 1) {
    const x = margin + point * pointW; const selected = view.selected === point; const target = legal.some(([from, to]) => from === view.selected && to === point);
    ctx.fillStyle = point % 2 ? '#b64f42' : '#f1d08b'; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x + pointW, top); ctx.lineTo(x + pointW / 2, bottom); ctx.closePath(); ctx.fill();
    if (selected || target) { ctx.strokeStyle = selected ? '#fff6a8' : '#63eddb'; ctx.lineWidth = target ? 4 : 3; ctx.stroke(); }
    const n = s.points[point]; const count = Math.abs(n);
    for (let k = 0; k < count; k += 1) { const y = n > 0 ? bottom - 17 - k * 22 : top + 17 + k * 22; ctx.beginPath(); ctx.arc(x + pointW / 2, y, 9.5, 0, Math.PI * 2); ctx.fillStyle = n > 0 ? '#fff7df' : '#24223a'; ctx.fill(); ctx.strokeStyle = n > 0 ? '#b88962' : '#090916'; ctx.lineWidth = 1.5; ctx.stroke(); }
  }
  const barX = w / 2; ctx.fillStyle = '#3d2021'; ctx.fillRect(barX - 24, 12, 48, 34); ctx.fillStyle = '#fff3ca'; ctx.font = '800 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText(`BAR ${s.bar[0]}`, barX, 34); ctx.fillStyle = '#3d2021'; ctx.fillRect(w - 64, 12, 52, 34); ctx.fillStyle = '#fff3ca'; ctx.fillText(`OFF ${s.off[0]}`, w - 38, 34);
  if (view.selected === -1) { ctx.strokeStyle = '#fff6a8'; ctx.lineWidth = 3; ctx.strokeRect(barX - 24, 12, 48, 34); }
  if (legal.some(([from, to]) => from === view.selected && (to < 0 || to > 11))) { ctx.strokeStyle = '#63eddb'; ctx.lineWidth = 3; ctx.strokeRect(w - 64, 12, 52, 34); }
  ctx.fillStyle = '#fff5d7'; ctx.font = '900 17px system-ui'; ctx.textAlign = 'left'; ctx.fillText('MINI BACKGAMMON', 15, 31); ctx.font = '700 12px system-ui'; ctx.fillStyle = s.turn === 0 ? '#bffaf3' : '#ffd2dc'; ctx.fillText(s.turn === 0 ? `YOUR DIE: ${s.die}` : 'INK TURN', 15, 51); ctx.textAlign = 'right'; ctx.fillStyle = '#fff5d7'; ctx.fillText(`WHITE ${s.off[0]}  ·  INK ${s.off[1]}`, w - 14, 71);
  ctx.textAlign = 'center'; ctx.fillStyle = view.noticeT > 0 ? '#fff7c4' : 'rgba(255,247,196,.6)'; ctx.font = '700 12px system-ui'; ctx.fillText(view.noticeT > 0 ? view.notice : 'White moves →  ·  Ink moves ←', w / 2, h - 4); ctx.textAlign = 'left';
}
