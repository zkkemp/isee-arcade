'use client';

import { useEffect, useRef } from 'react';
import type { GameCanvasProps } from '@/lib/games';
import { playSound } from '@/lib/sound';
import { useCanvasGame } from '@/lib/useCanvasGame';

export type BgPlayer = 0 | 1;
export type BgBoard = number[];
export type BgState = {
  points: BgBoard;
  bar: [number, number];
  off: [number, number];
  turn: BgPlayer;
  dice: number[];
  remaining: number[];
};
export type BgMove = [from: number, to: number];
export type BgTurnMove = { from: number; to: number; die: number };
export const BG_CHECKERS = 15;
export const WHITE_BAR = 24;
export const INK_BAR = -1;
const NONE = -99;

const signFor = (player: BgPlayer) => player === 0 ? 1 : -1;
const barSource = (player: BgPlayer) => player === 0 ? WHITE_BAR : INK_BAR;
const rollDie = () => 1 + Math.floor(Math.random() * 6);
const rollDice = (): number[] => {
  const a = rollDie(); const b = rollDie();
  return a === b ? [a, a, a, a] : [a, b];
};

export function newBackgammon(dice: number[] = [1, 2], turn: BgPlayer = 0): BgState {
  const points = Array(24).fill(0);
  points[23] = 2; points[12] = 5; points[7] = 3; points[5] = 5;
  points[0] = -2; points[11] = -5; points[16] = -3; points[18] = -5;
  return { points, bar: [0, 0], off: [0, 0], turn, dice: [...dice], remaining: [...dice] };
}

function openingGame(): BgState {
  let ivory = rollDie(); let ink = rollDie();
  while (ivory === ink) { ivory = rollDie(); ink = rollDie(); }
  const turn: BgPlayer = ivory > ink ? 0 : 1;
  return newBackgammon([ivory, ink], turn);
}

export function allCheckersHome(s: BgState, player: BgPlayer): boolean {
  if (s.bar[player] > 0) return false;
  const sign = signFor(player);
  return s.points.every((value, point) => value * sign <= 0 || (player === 0 ? point <= 5 : point >= 18));
}

/** Exact rolls always bear off; overshoots require no checker on a farther point. */
export function canBearOff(s: BgState, player: BgPlayer, from: number, die: number): boolean {
  if (!allCheckersHome(s, player)) return false;
  const distance = player === 0 ? from + 1 : 24 - from;
  if (die === distance) return true;
  if (die < distance) return false;
  const sign = signFor(player);
  return player === 0
    ? !s.points.some((value, point) => value * sign > 0 && point > from)
    : !s.points.some((value, point) => value * sign > 0 && point < from);
}

export function bgLegalMoves(s: BgState, player: BgPlayer, die: number): BgMove[] {
  const sign = signFor(player);
  const source = barSource(player);
  const froms = s.bar[player] > 0
    ? [source]
    : s.points.flatMap((value, point) => value * sign > 0 ? [point] : []);
  return froms.flatMap((from) => {
    const to = from === source
      ? (player === 0 ? 24 - die : die - 1)
      : from + (player === 0 ? -die : die);
    if (to < 0 || to > 23) return canBearOff(s, player, from, die) ? [[from, to] as BgMove] : [];
    const target = s.points[to];
    return target * sign >= 0 || Math.abs(target) === 1 ? [[from, to] as BgMove] : [];
  });
}

function applyMove(s: BgState, player: BgPlayer, move: BgTurnMove): BgState {
  const sign = signFor(player);
  const next: BgState = {
    points: [...s.points],
    bar: [...s.bar] as [number, number],
    off: [...s.off] as [number, number],
    turn: s.turn,
    dice: [...s.dice],
    remaining: [...s.remaining],
  };
  if (move.from === barSource(player)) next.bar[player] -= 1;
  else next.points[move.from] -= sign;
  if (move.to < 0 || move.to > 23) next.off[player] += 1;
  else {
    if (next.points[move.to] * sign === -1) {
      next.points[move.to] = 0;
      next.bar[player === 0 ? 1 : 0] += 1;
    }
    next.points[move.to] += sign;
  }
  const dieIndex = next.remaining.indexOf(move.die);
  if (dieIndex >= 0) next.remaining.splice(dieIndex, 1);
  return next;
}

/** Apply one legal die move. Turn-order constraints are enforced by bgTurnOptions. */
export function playBg(s: BgState, player: BgPlayer, from: number, die: number): BgState {
  const move = bgLegalMoves(s, player, die).find(([source]) => source === from);
  return move ? applyMove(s, player, { from: move[0], to: move[1], die }) : s;
}

function enumerateSequences(s: BgState, player: BgPlayer, dice: number[]): BgTurnMove[][] {
  if (!dice.length) return [[]];
  const sequences: BgTurnMove[][] = [];
  for (const die of new Set(dice)) {
    const rest = [...dice]; rest.splice(rest.indexOf(die), 1);
    for (const [from, to] of bgLegalMoves(s, player, die)) {
      const move = { from, to, die };
      const next = applyMove({ ...s, remaining: [...dice] }, player, move);
      for (const tail of enumerateSequences(next, player, rest)) sequences.push([move, ...tail]);
    }
  }
  return sequences.length ? sequences : [[]];
}

/** Legal full-turn sequences, including mandatory maximum usage and higher-die priority. */
export function bgTurnSequences(s: BgState, player: BgPlayer, dice = s.remaining): BgTurnMove[][] {
  const all = enumerateSequences(s, player, dice);
  const maxLength = Math.max(...all.map((sequence) => sequence.length));
  let legal = all.filter((sequence) => sequence.length === maxLength);
  if (maxLength === 1 && new Set(dice).size > 1) {
    const largestPlayable = Math.max(...legal.map((sequence) => sequence[0].die));
    legal = legal.filter((sequence) => sequence[0].die === largestPlayable);
  }
  return legal;
}

export function bgTurnOptions(s: BgState, player: BgPlayer): BgTurnMove[] {
  const unique = new Map<string, BgTurnMove>();
  for (const sequence of bgTurnSequences(s, player)) {
    const move = sequence[0];
    if (move) unique.set(`${move.from}:${move.to}:${move.die}`, move);
  }
  return [...unique.values()];
}

function cpuSequence(s: BgState): BgTurnMove[] {
  const sequences = bgTurnSequences(s, 1);
  const score = (sequence: BgTurnMove[]) => {
    let board = s; let hits = 0;
    for (const move of sequence) {
      if (move.to >= 0 && move.to < 24 && board.points[move.to] === 1) hits += 1;
      board = applyMove(board, 1, move);
    }
    const madePoints = board.points.filter((value) => value <= -2).length;
    const exposed = board.points.filter((value) => value === -1).length;
    return board.off[1] * 100 + hits * 18 + madePoints * 3 - exposed * 2;
  };
  return [...sequences].sort((a, b) => score(b) - score(a))[0] ?? [];
}

type View = {
  s: BgState;
  selected: number;
  wait: number;
  notice: string;
  noticeT: number;
  cpuMoves: BgTurnMove[];
};

const playerName = (player: BgPlayer) => player === 0 ? 'Ivory' : 'Crimson';
const fresh = (): View => {
  const s = openingGame();
  return {
    s,
    selected: NONE,
    wait: s.turn === 1 ? 0.85 : 0,
    notice: `${playerName(s.turn)} won the opening roll: ${s.dice.join('–')}.`,
    noticeT: 3,
    cpuMoves: [],
  };
};

function beginTurn(s: BgState, player: BgPlayer): BgState {
  const dice = rollDice();
  return { ...s, turn: player, dice, remaining: [...dice] };
}

type BoardMetrics = {
  left: number; right: number; top: number; bottom: number; pointW: number; barGap: number; barLeft: number; barRight: number;
};

function metrics(w: number, h: number): BoardMetrics {
  const left = 14; const right = w - 14; const top = 94; const bottom = h - 38;
  const barGap = Math.max(24, Math.min(46, w * 0.075));
  const pointW = (right - left - barGap) / 12;
  const barLeft = left + pointW * 6;
  return { left, right, top, bottom, pointW, barGap, barLeft, barRight: barLeft + barGap };
}

function pointX(point: number, m: BoardMetrics): number {
  const slot = point <= 11 ? point : 23 - point;
  return m.left + slot * m.pointW + (slot >= 6 ? m.barGap : 0);
}

function pointAt(x: number, y: number, w: number, h: number): number | null {
  const m = metrics(w, h);
  if (y < m.top || y > m.bottom || x < m.left || x > m.right || (x >= m.barLeft && x <= m.barRight)) return null;
  const adjustedX = x > m.barRight ? x - m.barGap : x;
  const slot = Math.floor((adjustedX - m.left) / m.pointW);
  if (slot < 0 || slot > 11) return null;
  return y < (m.top + m.bottom) / 2 ? 23 - slot : slot;
}

function barHit(x: number, y: number, w: number, h: number): boolean {
  const m = metrics(w, h);
  return x >= m.barLeft && x <= m.barRight && y >= m.top && y <= m.bottom;
}

function offHit(x: number, y: number, w: number): boolean {
  return x >= w - 112 && x <= w - 12 && y >= 48 && y <= 84;
}

function completeUserMove(view: View, move: BgTurnMove, api: GameCanvasProps['api']) {
  view.s = applyMove(view.s, 0, move);
  view.selected = NONE;
  api.addScore(move.to < 0 ? 5 : 2);
  playSound(move.to >= 0 && move.to < 24 ? 'land' : 'coin');
  if (view.s.off[0] >= BG_CHECKERS) {
    api.addScore(100);
    view.notice = 'Ivory bears off all 15 checkers!';
    view.noticeT = 3;
    api.requestGate('Backgammon won');
    return;
  }
  if (!view.s.remaining.length || !bgTurnOptions(view.s, 0).length) {
    view.s = beginTurn(view.s, 1);
    view.wait = 0.68;
    view.cpuMoves = [];
    view.notice = 'Crimson is thinking…';
    view.noticeT = 1.4;
  } else {
    view.notice = `${view.s.remaining.length} move${view.s.remaining.length === 1 ? '' : 's'} left.`;
    view.noticeT = 1.2;
  }
}

export default function Backgammon({ paused, api, difficulty, restartToken }: GameCanvasProps) {
  const ref = useRef<View>(fresh());
  useEffect(() => { ref.current = fresh(); }, [restartToken]);

  const tap = (x: number, y: number, w: number, h: number) => {
    const view = ref.current;
    if (paused || view.s.turn !== 0 || view.wait > 0 || view.s.off[0] >= BG_CHECKERS) return;
    const options = bgTurnOptions(view.s, 0);
    if (!options.length) {
      view.s = beginTurn(view.s, 1); view.wait = 0.65; view.notice = 'No legal play. Crimson rolls.'; view.noticeT = 1.5;
      return;
    }
    const tappedBar = barHit(x, y, w, h);
    const tappedOff = offHit(x, y, w);
    const point = tappedBar || tappedOff ? null : pointAt(x, y, w, h);
    if (view.selected === NONE) {
      const source = tappedBar ? WHITE_BAR : point;
      if (source !== null && options.some((move) => move.from === source)) {
        view.selected = source; view.notice = 'Now tap a glowing landing point.'; view.noticeT = 1.4; playSound('click');
      } else {
        view.notice = view.s.bar[0] ? 'You must enter the Ivory checker from the bar first.' : 'Choose an Ivory checker with a legal move.';
        view.noticeT = 1.5; playSound('wrong');
      }
      return;
    }
    const chosen = options.find((move) => move.from === view.selected && (
      (move.to >= 0 && move.to < 24 && move.to === point) ||
      ((move.to < 0 || move.to > 23) && tappedOff)
    ));
    if (chosen) {
      completeUserMove(view, chosen, api);
      return;
    }
    const source = tappedBar ? WHITE_BAR : point;
    if (source !== null && options.some((move) => move.from === source)) {
      view.selected = source; view.notice = 'Changed checker. Tap a glowing destination.'; view.noticeT = 1.2;
    } else {
      view.notice = 'That destination is blocked or would leave a required die unused.'; view.noticeT = 1.5; playSound('wrong');
    }
  };

  const { canvasRef } = useCanvasGame({ active: !paused, step: (ctx, dt, w, h) => {
    const view = ref.current;
    view.noticeT = Math.max(0, view.noticeT - dt);
    if (view.s.turn === 0 && view.s.off[0] < BG_CHECKERS && !bgTurnOptions(view.s, 0).length) {
      view.wait += dt;
      if (view.wait > 0.45) {
        view.s = beginTurn(view.s, 1); view.wait = difficulty === 'easy' ? 0.9 : 0.55; view.cpuMoves = [];
        view.notice = 'No legal play. Crimson rolls.'; view.noticeT = 1.5;
      }
    }
    if (view.s.turn === 1 && view.s.off[1] < BG_CHECKERS) {
      view.wait -= dt;
      if (view.wait <= 0) {
        if (!view.cpuMoves.length) view.cpuMoves = cpuSequence(view.s);
        const move = view.cpuMoves.shift();
        if (move) {
          view.s = applyMove(view.s, 1, move);
          view.wait = difficulty === 'easy' ? 0.72 : 0.38;
          if (view.s.off[1] >= BG_CHECKERS) {
            view.notice = 'Crimson bore off all 15 checkers.';
            view.noticeT = 3;
            view.wait = Number.POSITIVE_INFINITY;
            api.died('Crimson won the backgammon race');
          }
        }
        if (view.s.off[1] < BG_CHECKERS && (!move || !view.cpuMoves.length)) {
          view.s = beginTurn(view.s, 0);
          view.selected = NONE;
          view.notice = `Ivory rolls ${view.s.dice.length === 4 ? `${view.s.dice[0]}–${view.s.dice[0]}: four moves` : view.s.dice.join('–')}.`;
          view.noticeT = 2;
          view.wait = 0;
        }
      }
    }
    draw(ctx, view, w, h);
  } });

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full touch-none"
      aria-label="Backgammon — standard 24-point board"
      onPointerDown={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        tap(event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height);
      }}
    />
  );
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number, fill: string) {
  ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fill();
}

function drawDie(ctx: CanvasRenderingContext2D, x: number, y: number, value: number, active: boolean) {
  roundedRect(ctx, x, y, 28, 28, 7, active ? '#fff5d8' : 'rgba(255,245,216,.24)');
  const dots: Record<number, Array<[number, number]>> = {
    1: [[14, 14]], 2: [[8, 8], [20, 20]], 3: [[8, 8], [14, 14], [20, 20]],
    4: [[8, 8], [20, 8], [8, 20], [20, 20]], 5: [[8, 8], [20, 8], [14, 14], [8, 20], [20, 20]],
    6: [[8, 7], [20, 7], [8, 14], [20, 14], [8, 21], [20, 21]],
  };
  ctx.fillStyle = active ? '#352533' : 'rgba(255,255,255,.4)';
  for (const [dx, dy] of dots[value]) { ctx.beginPath(); ctx.arc(x + dx, y + dy, 2.2, 0, Math.PI * 2); ctx.fill(); }
}

function drawChecker(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, ivory: boolean, selected: boolean, target = false) {
  ctx.save();
  ctx.shadowColor = target ? '#6ff3df' : 'rgba(0,0,0,.35)'; ctx.shadowBlur = target ? 12 : 5; ctx.shadowOffsetY = 2;
  ctx.fillStyle = ivory ? '#fff2d2' : '#a52d47'; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; ctx.strokeStyle = selected ? '#ffe36b' : ivory ? '#c39a68' : '#641c35'; ctx.lineWidth = selected ? 3.5 : 2; ctx.stroke();
  ctx.strokeStyle = ivory ? 'rgba(120,75,40,.22)' : 'rgba(255,220,220,.23)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, radius * .62, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function draw(ctx: CanvasRenderingContext2D, view: View, w: number, h: number) {
  const { s } = view; const m = metrics(w, h); const midY = (m.top + m.bottom) / 2;
  const options = s.turn === 0 ? bgTurnOptions(s, 0) : [];
  const selectedTargets = options.filter((move) => move.from === view.selected);
  const boardGradient = ctx.createLinearGradient(0, 0, w, h);
  boardGradient.addColorStop(0, '#26191d'); boardGradient.addColorStop(1, '#120f18');
  ctx.fillStyle = boardGradient; ctx.fillRect(0, 0, w, h);
  roundedRect(ctx, 7, 7, w - 14, h - 14, 18, '#5f3327');
  roundedRect(ctx, 12, m.top - 5, w - 24, m.bottom - m.top + 10, 10, '#d5a568');
  ctx.fillStyle = '#3c221f'; ctx.fillRect(m.barLeft, m.top - 5, m.barGap, m.bottom - m.top + 10);

  for (let point = 0; point < 24; point += 1) {
    const x = pointX(point, m); const topRow = point >= 12; const tipY = topRow ? midY - 8 : midY + 8;
    const baseY = topRow ? m.top : m.bottom; const alternating = (point + (topRow ? 1 : 0)) % 2;
    ctx.fillStyle = alternating ? '#9e3542' : '#ead095';
    ctx.beginPath(); ctx.moveTo(x, baseY); ctx.lineTo(x + m.pointW, baseY); ctx.lineTo(x + m.pointW / 2, tipY); ctx.closePath(); ctx.fill();
    if (selectedTargets.some((move) => move.to === point)) {
      ctx.fillStyle = 'rgba(79,235,211,.52)'; ctx.beginPath(); ctx.arc(x + m.pointW / 2, topRow ? midY - 19 : midY + 19, 7, 0, Math.PI * 2); ctx.fill();
    }
  }

  const checkerRadius = Math.max(7, Math.min(23, m.pointW * .39, (m.bottom - m.top) / 24));
  for (let point = 0; point < 24; point += 1) {
    const value = s.points[point]; const count = Math.abs(value); if (!count) continue;
    const topRow = point >= 12; const visible = Math.min(5, count); const x = pointX(point, m) + m.pointW / 2;
    for (let index = 0; index < visible; index += 1) {
      const y = topRow ? m.top + checkerRadius + 3 + index * checkerRadius * 1.62 : m.bottom - checkerRadius - 3 - index * checkerRadius * 1.62;
      drawChecker(ctx, x, y, checkerRadius, value > 0, view.selected === point && index === visible - 1);
      if (index === visible - 1 && count > visible) {
        ctx.fillStyle = value > 0 ? '#503928' : '#fff0da'; ctx.font = `900 ${Math.max(9, checkerRadius * .8)}px system-ui`; ctx.textAlign = 'center'; ctx.fillText(String(count), x, y + 3);
      }
    }
  }

  const barX = (m.barLeft + m.barRight) / 2;
  const barRadius = Math.min(checkerRadius, m.barGap * .35);
  for (const player of [0, 1] as const) {
    const count = s.bar[player]; const visible = Math.min(4, count);
    for (let index = 0; index < visible; index += 1) {
      const y = player === 0 ? midY - barRadius - 5 - index * barRadius * 1.45 : midY + barRadius + 5 + index * barRadius * 1.45;
      drawChecker(ctx, barX, y, barRadius, player === 0, view.selected === barSource(player) && index === visible - 1);
    }
    if (count > visible) {
      ctx.fillStyle = '#fff6dd'; ctx.font = '900 10px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(String(count), barX, player === 0 ? m.top + 13 : m.bottom - 7);
    }
  }

  ctx.fillStyle = '#fff3d1'; ctx.textAlign = 'left'; ctx.font = `900 ${w < 430 ? 12 : 18}px ui-rounded,system-ui`; ctx.fillText('BACKGAMMON', 17, 29);
  if (w >= 540) {
    ctx.fillStyle = '#e7c698'; ctx.font = '700 11px system-ui'; ctx.fillText('15 CHECKERS · 24 POINTS · STANDARD PLAY', 17, 45);
  }
  const dice = s.dice.length === 4 ? s.dice.slice(0, 2) : s.dice;
  dice.forEach((die, index) => drawDie(ctx, w / 2 - 31 + index * 34, 17, die, s.remaining.includes(die)));
  if (s.dice.length === 4) {
    ctx.fillStyle = '#ffe891'; ctx.font = '900 10px system-ui'; ctx.textAlign = 'center'; ctx.fillText('DOUBLES ×4', w / 2, 58);
  }
  roundedRect(ctx, w - 112, 48, 100, 36, 9, selectedTargets.some((move) => move.to < 0 || move.to > 23) ? '#187b70' : '#3a2425');
  ctx.fillStyle = '#fff1d2'; ctx.font = `900 ${w < 430 ? 9 : 11}px system-ui`; ctx.textAlign = 'center'; ctx.fillText(`BEAR OFF  ${s.off[0]}/15`, w - 62, 70);
  ctx.fillStyle = '#fff1d2'; ctx.font = '800 10px system-ui'; ctx.textAlign = 'right'; ctx.fillText(w < 430 ? `CRIMSON ${s.off[1]}/15` : `CRIMSON OFF ${s.off[1]}/15`, w - 14, 31);
  ctx.fillStyle = s.turn === 0 ? '#baf9ed' : '#ffd0d8'; ctx.textAlign = 'left'; ctx.fillText(s.turn === 0 ? 'IVORY TURN' : 'CRIMSON TURN', 17, 67);
  ctx.textAlign = 'center'; ctx.fillStyle = view.noticeT > 0 ? '#fff5bd' : 'rgba(255,245,189,.62)'; ctx.font = `700 ${w < 430 ? 10 : 12}px system-ui`;
  ctx.fillText(view.noticeT > 0 ? view.notice : 'Ivory moves toward point 1  ·  Crimson moves toward point 24', w / 2, h - 12);
  ctx.textAlign = 'left';
}
