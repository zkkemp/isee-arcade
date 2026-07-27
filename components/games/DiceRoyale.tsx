'use client';

import { useEffect, useRef } from 'react';
import type { GameCanvasProps } from '@/lib/games';
import { playSound, unlockAudio } from '@/lib/sound';
import { fitBoard, useCanvasGame } from '@/lib/useCanvasGame';

// ---------------------------------------------------------------------------
// Pure rules. The focused checker imports everything in this section.

export const DICE_CATEGORIES = [
  'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
  'threeKind', 'fourKind', 'fullHouse', 'smallStraight',
  'largeStraight', 'chance', 'fiveKind',
] as const;
export type DiceCategory = (typeof DICE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<DiceCategory, string> = {
  ones: 'Ones',
  twos: 'Twos',
  threes: 'Threes',
  fours: 'Fours',
  fives: 'Fives',
  sixes: 'Sixes',
  threeKind: '3 of a Kind',
  fourKind: '4 of a Kind',
  fullHouse: 'Full House',
  smallStraight: 'Small Straight',
  largeStraight: 'Large Straight',
  chance: 'Chance',
  fiveKind: 'Five of a Kind',
};

const UPPER: DiceCategory[] = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
const UPPER_FACE: Partial<Record<DiceCategory, number>> = {
  ones: 1, twos: 2, threes: 3, fours: 4, fives: 5, sixes: 6,
};

export type Die = 1 | 2 | 3 | 4 | 5 | 6;
export type ScoreCard = Record<DiceCategory, number | null>;
export type DicePlayer = { name: string; cpu: boolean; scores: ScoreCard };
export type DiceRoyaleState = {
  players: DicePlayer[];
  current: number;
  dice: Die[];
  held: boolean[];
  rollsUsed: number;
  phase: 'play' | 'result';
};

export function emptyScoreCard(): ScoreCard {
  return Object.fromEntries(DICE_CATEGORIES.map((category) => [category, null])) as ScoreCard;
}

export function newDiceRoyale(cpuSeats: boolean[]): DiceRoyaleState {
  if (cpuSeats.length < 1 || cpuSeats.length > 4 || cpuSeats.every(Boolean)) {
    throw new Error('Dice Royale needs 1-4 seats and at least one human.');
  }
  return {
    players: cpuSeats.map((cpu, index) => ({
      name: cpu ? `CPU ${index + 1}` : `Player ${index + 1}`,
      cpu,
      scores: emptyScoreCard(),
    })),
    current: 0,
    dice: [1, 1, 1, 1, 1],
    held: [false, false, false, false, false],
    rollsUsed: 0,
    phase: 'play',
  };
}

function countsOf(dice: readonly Die[]): number[] {
  const counts = Array<number>(7).fill(0);
  for (const die of dice) counts[die] += 1;
  return counts;
}

export function scoreDice(category: DiceCategory, dice: readonly Die[]): number {
  if (dice.length !== 5 || dice.some((die) => die < 1 || die > 6)) return 0;
  const counts = countsOf(dice);
  const sum = dice.reduce<number>((total, die) => total + die, 0);
  const upperFace = UPPER_FACE[category];
  if (upperFace) return counts[upperFace] * upperFace;
  const groups = counts.slice(1).filter(Boolean).sort((a, b) => b - a);
  const unique = new Set(dice);
  switch (category) {
    case 'threeKind': return groups[0] >= 3 ? sum : 0;
    case 'fourKind': return groups[0] >= 4 ? sum : 0;
    case 'fullHouse': return groups[0] === 3 && groups[1] === 2 ? 25 : 0;
    case 'smallStraight': {
      const has = (values: number[]) => values.every((value) => unique.has(value as Die));
      return has([1, 2, 3, 4]) || has([2, 3, 4, 5]) || has([3, 4, 5, 6]) ? 30 : 0;
    }
    case 'largeStraight':
      return unique.size === 5 &&
        ([1, 2, 3, 4, 5].every((value) => unique.has(value as Die)) ||
          [2, 3, 4, 5, 6].every((value) => unique.has(value as Die))) ? 40 : 0;
    case 'chance': return sum;
    case 'fiveKind': return groups[0] === 5 ? 50 : 0;
    default: return 0;
  }
}

export function upperSubtotal(card: ScoreCard): number {
  return UPPER.reduce((total, category) => total + (card[category] ?? 0), 0);
}

export function upperBonus(card: ScoreCard): number {
  return upperSubtotal(card) >= 63 ? 35 : 0;
}

export function cardTotal(card: ScoreCard): number {
  return DICE_CATEGORIES.reduce((total, category) => total + (card[category] ?? 0), 0) +
    upperBonus(card);
}

export function cardComplete(card: ScoreCard): boolean {
  return DICE_CATEGORIES.every((category) => card[category] !== null);
}

export function rollDice(
  state: DiceRoyaleState,
  rng: () => number = Math.random,
): DiceRoyaleState {
  if (state.phase !== 'play' || state.rollsUsed >= 3) return state;
  const dice = state.dice.map((die, index) =>
    state.rollsUsed > 0 && state.held[index]
      ? die
      : (Math.floor(rng() * 6) + 1) as Die,
  );
  return { ...state, dice, rollsUsed: state.rollsUsed + 1 };
}

export function toggleDieHold(state: DiceRoyaleState, index: number): DiceRoyaleState {
  if (state.phase !== 'play' || state.rollsUsed === 0 || state.rollsUsed >= 3) return state;
  if (index < 0 || index >= 5 || state.players[state.current].cpu) return state;
  const held = [...state.held];
  held[index] = !held[index];
  return { ...state, held };
}

export function scoreTurn(state: DiceRoyaleState, category: DiceCategory): DiceRoyaleState {
  if (state.phase !== 'play' || state.rollsUsed === 0) return state;
  const player = state.players[state.current];
  if (player.scores[category] !== null) return state;
  const players = state.players.map((candidate, index) =>
    index === state.current
      ? { ...candidate, scores: { ...candidate.scores, [category]: scoreDice(category, state.dice) } }
      : candidate,
  );
  const finished = players.every((candidate) => cardComplete(candidate.scores));
  return {
    ...state,
    players,
    current: finished ? state.current : (state.current + 1) % players.length,
    dice: [1, 1, 1, 1, 1],
    held: [false, false, false, false, false],
    rollsUsed: 0,
    phase: finished ? 'result' : 'play',
  };
}

function bestStraightMask(dice: readonly Die[], large: boolean): boolean[] {
  const runs = large
    ? [[1, 2, 3, 4, 5], [2, 3, 4, 5, 6]]
    : [[1, 2, 3, 4], [2, 3, 4, 5], [3, 4, 5, 6]];
  let best = runs[0];
  let bestCount = -1;
  for (const run of runs) {
    const count = run.filter((value) => dice.includes(value as Die)).length;
    if (count > bestCount) {
      best = run;
      bestCount = count;
    }
  }
  const used = new Set<number>();
  return dice.map((die) => {
    if (!best.includes(die) || used.has(die)) return false;
    used.add(die);
    return true;
  });
}

type HoldPlan = { value: number; mask: boolean[] };

/**
 * Chooses a promising scoring family, then holds only dice that help it.
 * Straights preserve one copy of each useful value; groups preserve the most
 * common face; full houses preserve pairs/triples. This is deterministic so it
 * can be fuzzed headlessly and does not "peek" at future rolls.
 */
export function chooseCpuHolds(dice: readonly Die[], card: ScoreCard): boolean[] {
  const counts = countsOf(dice);
  const maxFace = [1, 2, 3, 4, 5, 6].sort(
    (a, b) => counts[b] - counts[a] || b - a,
  )[0] as Die;
  const groupMask = dice.map((die) => die === maxFace);
  const plans: HoldPlan[] = [];
  const open = (category: DiceCategory) => card[category] === null;
  const maxCount = counts[maxFace];

  if (open('fiveKind')) plans.push({ value: maxCount * 12 + maxFace, mask: groupMask });
  if (open('fourKind')) plans.push({ value: maxCount * 9 + maxFace, mask: groupMask });
  if (open('threeKind')) plans.push({ value: maxCount * 7 + maxFace, mask: groupMask });
  const upper = UPPER[maxFace - 1];
  if (open(upper)) plans.push({ value: maxCount * (5 + maxFace), mask: groupMask });

  if (open('largeStraight')) {
    const mask = bestStraightMask(dice, true);
    plans.push({ value: mask.filter(Boolean).length * 11, mask });
  }
  if (open('smallStraight')) {
    const mask = bestStraightMask(dice, false);
    plans.push({ value: mask.filter(Boolean).length * 8, mask });
  }
  if (open('fullHouse')) {
    const pairFaces = [1, 2, 3, 4, 5, 6].filter((face) => counts[face] >= 2);
    const mask = dice.map((die) => pairFaces.includes(die));
    const value = counts.some((count) => count === 3) && counts.some((count) => count === 2)
      ? 100
      : pairFaces.length >= 2 ? 39 : maxCount >= 3 ? 35 : maxCount === 2 ? 24 : 5;
    plans.push({ value, mask: mask.some(Boolean) ? mask : groupMask });
  }
  if (open('chance')) {
    const mask = dice.map((die) => die >= 5);
    plans.push({ value: mask.reduce((total, held, index) => total + (held ? dice[index] : 0), 0), mask });
  }

  plans.sort((a, b) => b.value - a.value || b.mask.filter(Boolean).length - a.mask.filter(Boolean).length);
  return plans[0]?.mask ?? [false, false, false, false, false];
}

/** Chooses the best place to record the final roll while protecting rare boxes. */
export function chooseCpuCategory(dice: readonly Die[], card: ScoreCard): DiceCategory {
  const upperBefore = upperSubtotal(card);
  const opportunity: Record<DiceCategory, number> = {
    ones: 1, twos: 2, threes: 3, fours: 4, fives: 5, sixes: 6,
    threeKind: 8, fourKind: 11, fullHouse: 12, smallStraight: 13,
    largeStraight: 17, chance: 15, fiveKind: 20,
  };
  const open = DICE_CATEGORIES.filter((category) => card[category] === null);
  open.sort((a, b) => {
    const value = (category: DiceCategory) => {
      const raw = scoreDice(category, dice);
      const face = UPPER_FACE[category];
      const bonusPush = face && upperBefore < 63 && upperBefore + raw >= 63 ? 35 : 0;
      return raw + bonusPush - (raw === 0 ? opportunity[category] : 0);
    };
    return value(b) - value(a) || DICE_CATEGORIES.indexOf(a) - DICE_CATEGORIES.indexOf(b);
  });
  return open[0];
}

export function winningPlayers(state: DiceRoyaleState): number[] {
  const totals = state.players.map((player) => cardTotal(player.scores));
  const best = Math.max(...totals);
  return totals.flatMap((total, index) => total === best ? [index] : []);
}

// ---------------------------------------------------------------------------
// Canvas UI

const LOGICAL_W = 600;
const LOGICAL_H = 900;
const TABLE_TOP = 328;
const TABLE_BOTTOM = 812;

type View = {
  mode: 'setup' | 'match';
  seats: boolean[];
  state: DiceRoyaleState | null;
  cpuTimer: number;
  rollGlow: number;
  notice: string;
  noticeT: number;
  finishedNotified: boolean;
  time: number;
};

function freshView(): View {
  return {
    mode: 'setup',
    seats: [false, true],
    state: null,
    cpuTimer: 0,
    rollGlow: 0,
    notice: 'Choose 1-4 seats. Tap each seat to switch Human or CPU.',
    noticeT: 99,
    finishedNotified: false,
    time: 0,
  };
}

function logicalPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect();
  const scale = Math.min(rect.width / LOGICAL_W, rect.height / LOGICAL_H);
  const left = (rect.width - LOGICAL_W * scale) / 2;
  const top = (rect.height - LOGICAL_H * scale) / 2;
  return { x: (clientX - rect.left - left) / scale, y: (clientY - rect.top - top) / scale };
}

function diceRects() {
  return Array.from({ length: 5 }, (_, index) => ({ x: 40 + index * 106, y: 146, w: 88, h: 88 }));
}

function scoreRowAt(y: number): DiceCategory | null {
  if (y < TABLE_TOP || y >= TABLE_BOTTOM) return null;
  const rowH = (TABLE_BOTTOM - TABLE_TOP) / DICE_CATEGORIES.length;
  const index = Math.floor((y - TABLE_TOP) / rowH);
  return DICE_CATEGORIES[index] ?? null;
}

export default function DiceRoyale({ paused, api, restartToken }: GameCanvasProps) {
  const viewRef = useRef<View>(freshView());
  useEffect(() => {
    viewRef.current = freshView();
  }, [restartToken]);

  const rollForCurrent = () => {
    const view = viewRef.current;
    if (!view.state || view.state.phase !== 'play') return;
    view.state = rollDice(view.state);
    view.rollGlow = 0.36;
    playSound('brick', view.state.rollsUsed);
  };

  const commitScore = (category: DiceCategory) => {
    const view = viewRef.current;
    const state = view.state;
    if (!state) return;
    const points = scoreDice(category, state.dice);
    const playerName = state.players[state.current].name;
    view.state = scoreTurn(state, category);
    view.notice = `${playerName} scored ${points} in ${CATEGORY_LABELS[category]}.`;
    view.noticeT = 2.2;
    view.cpuTimer = view.state.phase === 'play' && view.state.players[view.state.current].cpu ? 0.7 : 0;
    api.addScore(points);
    playSound(points >= 25 ? 'powerup' : points > 0 ? 'coin' : 'wrong');
  };

  const tap = (x: number, y: number) => {
    const view = viewRef.current;
    unlockAudio();
    if (paused) return;
    if (view.mode === 'setup') {
      if (y >= 118 && y <= 180) {
        if (x < 205 && view.seats.length > 1) view.seats = view.seats.slice(0, -1);
        else if (x > 395 && view.seats.length < 4) view.seats = [...view.seats, true];
        playSound('click');
        return;
      }
      for (let index = 0; index < view.seats.length; index += 1) {
        const top = 222 + index * 66;
        if (y >= top && y <= top + 52) {
          if (!view.seats[index] && view.seats.filter((cpu) => !cpu).length === 1) {
            view.notice = 'Keep at least one human player.';
            view.noticeT = 2;
            playSound('wrong');
          } else {
            view.seats[index] = !view.seats[index];
            view.notice = `Seat ${index + 1} is now ${view.seats[index] ? 'CPU' : 'Human'}.`;
            view.noticeT = 1.5;
            playSound('click');
          }
          return;
        }
      }
      if (y >= 540 && y <= 612) {
        view.state = newDiceRoyale(view.seats);
        view.mode = 'match';
        view.notice = 'Roll the dice, tap dice to hold, then choose a score row.';
        view.noticeT = 4;
        view.cpuTimer = view.state.players[0].cpu ? 0.7 : 0;
        playSound('levelClear');
      }
      return;
    }

    const state = view.state;
    if (!state) return;
    if (state.phase === 'result') {
      if (y >= 690 && y <= 760) {
        viewRef.current = freshView();
        playSound('click');
      }
      return;
    }
    if (state.players[state.current].cpu || view.cpuTimer > 0) return;

    for (const [index, rect] of diceRects().entries()) {
      if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) {
        view.state = toggleDieHold(state, index);
        playSound('click');
        return;
      }
    }
    if (x >= 170 && x <= 430 && y >= 248 && y <= 307 && state.rollsUsed < 3) {
      rollForCurrent();
      return;
    }
    const category = scoreRowAt(y);
    if (category && state.rollsUsed > 0 && state.players[state.current].scores[category] === null) {
      commitScore(category);
    }
  };

  const { canvasRef } = useCanvasGame({
    active: !paused,
    step: (ctx, dt, w, h) => {
      const view = viewRef.current;
      view.time += dt;
      view.noticeT = Math.max(0, view.noticeT - dt);
      view.rollGlow = Math.max(0, view.rollGlow - dt);
      const state = view.state;

      if (view.mode === 'match' && state?.phase === 'play' && state.players[state.current].cpu) {
        view.cpuTimer -= dt;
        if (view.cpuTimer <= 0) {
          if (state.rollsUsed < 3) {
            view.state = rollDice(state);
            view.rollGlow = 0.3;
            playSound('brick', view.state.rollsUsed);
            const immediate = view.state.dice;
            const card = view.state.players[view.state.current].scores;
            if (
              scoreDice('fiveKind', immediate) === 50 ||
              scoreDice('largeStraight', immediate) === 40 ||
              (view.state.rollsUsed >= 2 && scoreDice('fullHouse', immediate) === 25)
            ) {
              commitScore(chooseCpuCategory(immediate, card));
            } else if (view.state.rollsUsed < 3) {
              view.state = { ...view.state, held: chooseCpuHolds(immediate, card) };
              view.cpuTimer = 0.62;
            } else {
              commitScore(chooseCpuCategory(immediate, card));
            }
          } else {
            commitScore(chooseCpuCategory(state.dice, state.players[state.current].scores));
          }
        }
      }

      if (view.state?.phase === 'result' && !view.finishedNotified) {
        view.finishedNotified = true;
        const winners = winningPlayers(view.state);
        const humanWon = winners.some((index) => !view.state!.players[index].cpu);
        playSound(humanWon ? 'levelClear' : 'gameOver');
        if (humanWon) api.addScore(100);
        api.requestGate(humanWon ? 'Dice Royale champion!' : 'Dice Royale match complete');
      }

      ctx.save();
      fitBoard(ctx, w, h, LOGICAL_W, LOGICAL_H);
      drawGame(ctx, view);
      ctx.restore();
    },
  });

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full touch-none"
      aria-label="Dice Royale scorecard and dice game"
      onPointerDown={(event) => {
        const point = logicalPoint(event.currentTarget, event.clientX, event.clientY);
        tap(point.x, point.y);
      }}
    />
  );
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
}

function drawDie(ctx: CanvasRenderingContext2D, die: Die, x: number, y: number, size: number, held: boolean) {
  ctx.save();
  ctx.shadowColor = held ? '#ffd86b' : 'rgba(0,0,0,.42)';
  ctx.shadowBlur = held ? 18 : 8;
  ctx.shadowOffsetY = 5;
  roundedRect(ctx, x, y, size, size, 18);
  const gradient = ctx.createLinearGradient(x, y, x, y + size);
  gradient.addColorStop(0, held ? '#fff4b5' : '#fffdf7');
  gradient.addColorStop(1, held ? '#f4bd3d' : '#dbe8ff');
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = held ? '#8b5b09' : '#7587a9';
  ctx.lineWidth = 3;
  ctx.stroke();

  const pip = (px: number, py: number) => {
    ctx.beginPath();
    ctx.arc(x + px * size, y + py * size, size * 0.075, 0, Math.PI * 2);
    ctx.fillStyle = held ? '#592f05' : '#14213d';
    ctx.fill();
  };
  const positions: Record<Die, [number, number][]> = {
    1: [[.5, .5]],
    2: [[.28, .28], [.72, .72]],
    3: [[.28, .28], [.5, .5], [.72, .72]],
    4: [[.28, .28], [.72, .28], [.28, .72], [.72, .72]],
    5: [[.28, .28], [.72, .28], [.5, .5], [.28, .72], [.72, .72]],
    6: [[.28, .25], [.72, .25], [.28, .5], [.72, .5], [.28, .75], [.72, .75]],
  };
  positions[die].forEach(([px, py]) => pip(px, py));
  ctx.restore();
}

function drawBackground(ctx: CanvasRenderingContext2D) {
  const gradient = ctx.createLinearGradient(0, 0, 600, 900);
  gradient.addColorStop(0, '#111a3d');
  gradient.addColorStop(.5, '#22144a');
  gradient.addColorStop(1, '#071a30');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
  for (let index = 0; index < 42; index += 1) {
    const x = (index * 137) % 600;
    const y = (index * 83) % 900;
    ctx.fillStyle = `rgba(255,220,120,${.04 + (index % 4) * .018})`;
    ctx.beginPath();
    ctx.arc(x, y, 2 + (index % 3), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSetup(ctx: CanvasRenderingContext2D, view: View) {
  drawBackground(ctx);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffe28a';
  ctx.font = '900 48px system-ui';
  ctx.fillText('DICE ROYALE', 300, 72);
  ctx.fillStyle = '#d9e5ff';
  ctx.font = '700 16px system-ui';
  ctx.fillText('A royal scorecard showdown', 300, 101);

  roundedRect(ctx, 76, 118, 448, 62, 24);
  ctx.fillStyle = 'rgba(255,255,255,.09)';
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 23px system-ui';
  ctx.fillText(`${view.seats.length} SEAT${view.seats.length === 1 ? '' : 'S'}`, 300, 157);
  ctx.font = '900 38px system-ui';
  ctx.fillStyle = view.seats.length > 1 ? '#8ee9ff' : 'rgba(255,255,255,.22)';
  ctx.fillText('−', 162, 159);
  ctx.fillStyle = view.seats.length < 4 ? '#8ee9ff' : 'rgba(255,255,255,.22)';
  ctx.fillText('+', 438, 159);

  for (let index = 0; index < view.seats.length; index += 1) {
    const y = 222 + index * 66;
    roundedRect(ctx, 78, y, 444, 52, 18);
    const gradient = ctx.createLinearGradient(78, y, 522, y);
    gradient.addColorStop(0, view.seats[index] ? '#552886' : '#0d6d78');
    gradient.addColorStop(1, view.seats[index] ? '#8a3f92' : '#11948b');
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.font = '900 18px system-ui';
    ctx.fillText(`SEAT ${index + 1}`, 101, y + 33);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fff7ba';
    ctx.fillText(view.seats[index] ? 'CPU  ◉' : 'HUMAN  ●', 500, y + 33);
  }

  roundedRect(ctx, 96, 540, 408, 72, 24);
  const startGradient = ctx.createLinearGradient(96, 540, 504, 612);
  startGradient.addColorStop(0, '#ffd85b');
  startGradient.addColorStop(1, '#ff8a47');
  ctx.fillStyle = startGradient;
  ctx.fill();
  ctx.fillStyle = '#2b1734';
  ctx.textAlign = 'center';
  ctx.font = '1000 24px system-ui';
  ctx.fillText('START THE MATCH', 300, 585);

  ctx.fillStyle = '#c7d5f3';
  ctx.font = '600 15px system-ui';
  ctx.fillText('Tap a seat to switch Human or CPU.', 300, 654);
  ctx.font = '700 13px system-ui';
  ctx.fillStyle = '#fff1ac';
  ctx.fillText(view.notice, 300, 679);
  ctx.fillStyle = '#91a5cc';
  ctx.font = '600 13px system-ui';
  ctx.fillText('13 categories · 3 rolls per turn · +35 upper bonus', 300, 716);
  ctx.textAlign = 'left';
}

function drawMatch(ctx: CanvasRenderingContext2D, view: View, state: DiceRoyaleState) {
  drawBackground(ctx);
  const player = state.players[state.current];
  ctx.fillStyle = '#ffe28a';
  ctx.font = '900 30px system-ui';
  ctx.fillText('DICE ROYALE', 24, 44);
  ctx.textAlign = 'right';
  ctx.fillStyle = player.cpu ? '#ffb8f4' : '#90f5e7';
  ctx.font = '900 17px system-ui';
  ctx.fillText(`${player.name.toUpperCase()} · ROLL ${state.rollsUsed}/3`, 576, 42);
  ctx.textAlign = 'left';

  const chipW = Math.min(132, 536 / state.players.length);
  const chipsWidth = chipW * state.players.length;
  const chipStart = (600 - chipsWidth) / 2;
  state.players.forEach((candidate, index) => {
    const x = chipStart + index * chipW;
    roundedRect(ctx, x + 3, 66, chipW - 6, 52, 15);
    ctx.fillStyle = index === state.current ? '#f9c94d' : 'rgba(255,255,255,.08)';
    ctx.fill();
    ctx.fillStyle = index === state.current ? '#25163e' : '#dce6ff';
    ctx.textAlign = 'center';
    ctx.font = '800 12px system-ui';
    ctx.fillText(candidate.cpu ? `CPU ${index + 1}` : `PLAYER ${index + 1}`, x + chipW / 2, 86);
    ctx.font = '900 16px system-ui';
    ctx.fillText(String(cardTotal(candidate.scores)), x + chipW / 2, 107);
  });

  diceRects().forEach((rect, index) => {
    const wobble = view.rollGlow > 0 ? Math.sin(view.time * 46 + index * 2) * 3 : 0;
    drawDie(ctx, state.dice[index], rect.x, rect.y + wobble, rect.w, state.held[index]);
    if (state.held[index]) {
      ctx.fillStyle = '#fff0a2';
      ctx.textAlign = 'center';
      ctx.font = '900 11px system-ui';
      ctx.fillText('HELD', rect.x + rect.w / 2, rect.y + rect.h + 16);
    }
  });

  roundedRect(ctx, 170, 248, 260, 59, 19);
  const canRoll = state.rollsUsed < 3;
  ctx.fillStyle = canRoll ? '#35d6b1' : 'rgba(255,255,255,.12)';
  ctx.fill();
  ctx.fillStyle = canRoll ? '#082b36' : '#8c96ad';
  ctx.textAlign = 'center';
  ctx.font = '900 19px system-ui';
  ctx.fillText(
    player.cpu ? 'CPU IS THINKING...' : state.rollsUsed === 0 ? 'ROLL DICE' : canRoll ? 'ROLL AGAIN' : 'CHOOSE A SCORE',
    300,
    285,
  );

  drawScorecard(ctx, state);
  ctx.fillStyle = view.noticeT > 0 ? '#fff4be' : '#91a5cc';
  ctx.font = '700 12px system-ui';
  ctx.fillText(view.noticeT > 0 ? view.notice : 'Tap a glowing score to end your turn.', 300, 878);
  ctx.textAlign = 'left';

  if (state.phase === 'result') drawResults(ctx, state);
}

function drawScorecard(ctx: CanvasRenderingContext2D, state: DiceRoyaleState) {
  const labelW = 188;
  const scoreW = (560 - labelW) / state.players.length;
  const x0 = 20;
  const rowH = (TABLE_BOTTOM - TABLE_TOP) / DICE_CATEGORIES.length;
  roundedRect(ctx, x0, TABLE_TOP - 28, 560, TABLE_BOTTOM - TABLE_TOP + 72, 18);
  ctx.fillStyle = 'rgba(5,12,34,.84)';
  ctx.fill();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#9fb2d8';
  ctx.font = '800 11px system-ui';
  ctx.fillText('SCORECARD', x0 + 10, TABLE_TOP - 10);
  state.players.forEach((player, index) => {
    ctx.textAlign = 'center';
    ctx.fillStyle = index === state.current ? '#ffe16e' : '#afc0e1';
    ctx.fillText(player.cpu ? `C${index + 1}` : `P${index + 1}`, x0 + labelW + scoreW * (index + .5), TABLE_TOP - 10);
  });

  DICE_CATEGORIES.forEach((category, row) => {
    const y = TABLE_TOP + row * rowH;
    const currentCard = state.players[state.current].scores;
    const preview = state.rollsUsed > 0 && currentCard[category] === null
      ? scoreDice(category, state.dice)
      : null;
    if (row % 2 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,.045)';
      ctx.fillRect(x0, y, 560, rowH);
    }
    if (preview !== null && !state.players[state.current].cpu) {
      ctx.fillStyle = 'rgba(53,214,177,.12)';
      ctx.fillRect(x0, y, 560, rowH);
    }
    ctx.strokeStyle = 'rgba(255,255,255,.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, y + rowH);
    ctx.lineTo(x0 + 560, y + rowH);
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#edf3ff';
    ctx.font = `800 ${rowH < 34 ? 12 : 13}px system-ui`;
    ctx.fillText(CATEGORY_LABELS[category], x0 + 10, y + rowH * .67);

    state.players.forEach((player, index) => {
      const stored = player.scores[category];
      const showPreview = index === state.current && preview !== null;
      ctx.textAlign = 'center';
      ctx.fillStyle = showPreview ? '#72f0d2' : stored === null ? '#576783' : '#ffffff';
      ctx.font = showPreview ? '900 15px system-ui' : '800 14px system-ui';
      ctx.fillText(showPreview ? `+${preview}` : stored === null ? '·' : String(stored), x0 + labelW + scoreW * (index + .5), y + rowH * .68);
    });
  });

  const totalY = TABLE_BOTTOM + 8;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffe18a';
  ctx.font = '900 12px system-ui';
  ctx.fillText('TOTAL  (BONUS)', x0 + 10, totalY + 23);
  state.players.forEach((player, index) => {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe18a';
    ctx.font = '900 14px system-ui';
    ctx.fillText(
      `${cardTotal(player.scores)}  (+${upperBonus(player.scores)})`,
      x0 + labelW + scoreW * (index + .5),
      totalY + 23,
    );
  });
}

function drawResults(ctx: CanvasRenderingContext2D, state: DiceRoyaleState) {
  ctx.fillStyle = 'rgba(4,8,24,.9)';
  ctx.fillRect(0, 0, 600, 900);
  const winners = winningPlayers(state);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffe27c';
  ctx.font = '900 42px system-ui';
  ctx.fillText(winners.length > 1 ? 'ROYAL TIE!' : 'ROYAL CHAMPION!', 300, 150);
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 25px system-ui';
  ctx.fillText(winners.map((index) => state.players[index].name).join(' & '), 300, 193);
  state.players
    .map((player, index) => ({ player, index, total: cardTotal(player.scores) }))
    .sort((a, b) => b.total - a.total)
    .forEach((entry, rank) => {
      roundedRect(ctx, 105, 250 + rank * 82, 390, 62, 18);
      ctx.fillStyle = winners.includes(entry.index) ? 'rgba(255,211,84,.24)' : 'rgba(255,255,255,.08)';
      ctx.fill();
      ctx.textAlign = 'left';
      ctx.fillStyle = '#eaf1ff';
      ctx.font = '800 17px system-ui';
      ctx.fillText(`${rank + 1}. ${entry.player.name}`, 130, 288 + rank * 82);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffe27c';
      ctx.font = '900 22px system-ui';
      ctx.fillText(String(entry.total), 470, 290 + rank * 82);
    });
  roundedRect(ctx, 145, 690, 310, 70, 22);
  ctx.fillStyle = '#3ad8b2';
  ctx.fill();
  ctx.fillStyle = '#082b36';
  ctx.font = '900 20px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('NEW MATCH', 300, 733);
  ctx.textAlign = 'left';
}

function drawGame(ctx: CanvasRenderingContext2D, view: View) {
  if (view.mode === 'setup' || !view.state) drawSetup(ctx, view);
  else drawMatch(ctx, view, view.state);
}
