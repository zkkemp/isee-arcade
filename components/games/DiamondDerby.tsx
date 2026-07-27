'use client';

import { useEffect, useRef } from 'react';
import { RAMP_SCALE, SPEED_SCALE, type Difficulty } from '@/lib/difficulty';
import type { GameCanvasProps } from '@/lib/games';
import { playSound } from '@/lib/sound';
import { useCanvasGame } from '@/lib/useCanvasGame';

/** A tiny, deterministic baseball rules engine. Canvas code only draws this state. */
export type Bases = [boolean, boolean, boolean];
export type HitKind = 'single' | 'double' | 'triple' | 'homer';
export type PlateOutcome = 'ball' | 'strike' | 'foul' | 'out' | 'walk' | HitKind;
export type PitchKind = 'BREEZE' | 'CURVE' | 'ZIP';
export type RunnerMotion = { from: number; to: number; t: number };

const PITCH_INFO: Record<
  PitchKind,
  {
    name: string;
    callout: string;
    description: string;
    accent: string;
    dark: string;
    speed: 1 | 2 | 3;
    control: 1 | 2 | 3;
  }
> = {
  BREEZE: {
    name: 'CHANGEUP',
    callout: 'OFF-SPEED',
    description: 'Aim low · best control',
    accent: '#72e6c2',
    dark: '#123d45',
    speed: 1,
    control: 3,
  },
  CURVE: {
    name: 'CURVEBALL',
    callout: 'BREAK',
    description: 'Paint corners · weak contact',
    accent: '#8fc8ff',
    dark: '#183962',
    speed: 2,
    control: 2,
  },
  ZIP: {
    name: 'FASTBALL',
    callout: 'HEAT',
    description: 'Aim high · chase strikeouts',
    accent: '#ffb86b',
    dark: '#5c2d25',
    speed: 3,
    control: 1,
  },
};

export type CountState = { balls: number; strikes: number; outs: number; bases: Bases; runs: number };
export type PlateResult = {
  state: CountState;
  runsScored: number;
  inningOver: boolean;
  points: number;
};

const HIT_POINTS: Record<HitKind, number> = { single: 12, double: 20, triple: 32, homer: 48 };
const HIT_LABEL: Record<HitKind, string> = {
  single: 'BASE HIT!',
  double: 'A TWO-BAGGER!',
  triple: 'TRIPLE!',
  homer: 'HOME RUN!',
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Kept for the small legacy arcade smoke-check; the game itself uses judgeSwing. */
export const SWING_SWEET_SPOT = 0.1;
export function hitQuality(ballX: number): 'miss' | 'single' | 'homer' {
  const distance = Math.abs(ballX - 0.5);
  return distance > 0.22 ? 'miss' : distance <= SWING_SWEET_SPOT ? 'homer' : 'single';
}

/** Seeded randomness makes a pitch sequence repeatable and testable. */
export function nextRandom(seed: number): [number, number] {
  const value = (Math.imul(seed >>> 0, 1664525) + 1013904223) >>> 0;
  return [value, value / 4294967296];
}

export function emptyCount(): CountState {
  return { balls: 0, strikes: 0, outs: 0, bases: [false, false, false], runs: 0 };
}

/** Advance every existing runner and the batter exactly `basesTaken` bases. */
export function advanceRunners(bases: Bases, basesTaken: 1 | 2 | 3 | 4): { bases: Bases; runs: number } {
  const next: Bases = [false, false, false];
  let runs = 0;
  for (let base = 2; base >= 0; base -= 1) {
    if (!bases[base]) continue;
    const destination = base + basesTaken;
    if (destination >= 3) runs += 1;
    else next[destination] = true;
  }
  if (basesTaken >= 4) runs += 1;
  else next[basesTaken - 1] = true;
  return { bases: next, runs };
}

/** A walk only pushes runners that are forced by the runner directly behind them. */
export function forceWalk(bases: Bases): { bases: Bases; runs: number } {
  const next: Bases = [false, false, false];
  let runs = 0;
  if (bases[2]) {
    if (bases[1] && bases[0]) runs += 1;
    else next[2] = true;
  }
  if (bases[1]) {
    if (bases[0]) next[2] = true;
    else next[1] = true;
  }
  if (bases[0]) next[1] = true;
  next[0] = true;
  return { bases: next, runs };
}

/** Applies one completed plate appearance without any UI timing. */
export function applyPlateOutcome(current: CountState, outcome: PlateOutcome): PlateResult {
  const state: CountState = { ...current, bases: [...current.bases] as Bases };
  let runsScored = 0;
  let points = 0;
  if (outcome === 'ball') {
    state.balls += 1;
    if (state.balls < 4) return { state, runsScored, inningOver: false, points };
    const walked = forceWalk(state.bases);
    state.bases = walked.bases;
    state.runs += walked.runs;
    runsScored = walked.runs;
    points = 8 + walked.runs * 14;
    state.balls = 0;
    state.strikes = 0;
    return { state, runsScored, inningOver: false, points };
  }
  if (outcome === 'strike' || outcome === 'foul') {
    // A foul is a strike unless the batter already has two; no cheap third-strike fouls.
    if (outcome === 'strike' || state.strikes < 2) state.strikes += 1;
    if (state.strikes < 3) return { state, runsScored, inningOver: false, points };
    state.outs += 1;
    state.balls = 0;
    state.strikes = 0;
    return { state, runsScored, inningOver: state.outs >= 3, points };
  }
  if (outcome === 'out') {
    state.outs += 1;
    state.balls = 0;
    state.strikes = 0;
    return { state, runsScored, inningOver: state.outs >= 3, points };
  }
  if (outcome === 'walk') {
    const walked = forceWalk(state.bases);
    state.bases = walked.bases;
    state.runs += walked.runs;
    state.balls = 0;
    state.strikes = 0;
    return { state, runsScored: walked.runs, inningOver: false, points: 8 + walked.runs * 14 };
  }
  const basesTaken = outcome === 'single' ? 1 : outcome === 'double' ? 2 : outcome === 'triple' ? 3 : 4;
  const advanced = advanceRunners(state.bases, basesTaken);
  state.bases = advanced.bases;
  state.runs += advanced.runs;
  state.balls = 0;
  state.strikes = 0;
  runsScored = advanced.runs;
  points = HIT_POINTS[outcome] + advanced.runs * 16;
  return { state, runsScored, inningOver: false, points };
}

export function runnerMotions(before: Bases, basesTaken: 1 | 2 | 3 | 4): RunnerMotion[] {
  const moves: RunnerMotion[] = [];
  before.forEach((occupied, base) => {
    if (occupied) moves.push({ from: base + 1, to: Math.min(4, base + 1 + basesTaken), t: 0 });
  });
  moves.push({ from: 0, to: Math.min(4, basesTaken), t: 0 });
  return moves;
}

export type PitchPlan = { kind: PitchKind; targetX: number; targetY: number; inZone: boolean; speed: number; seed: number };

export function makePitch(level: number, difficulty: Difficulty, seed: number): PitchPlan {
  let r: number;
  [seed, r] = nextRandom(seed);
  const kind: PitchKind = r < 0.34 ? 'BREEZE' : r < 0.69 ? 'CURVE' : 'ZIP';
  [seed, r] = nextRandom(seed);
  const outsideChance: Record<Difficulty, number> = { easy: 0.3, normal: 0.22, hard: 0.15 };
  const inZone = r > outsideChance[difficulty];
  [seed, r] = nextRandom(seed);
  const targetX = inZone ? (r - 0.5) * 0.72 : (r < 0.5 ? -0.7 : 0.7) + (r - 0.5) * 0.18;
  [seed, r] = nextRandom(seed);
  const targetY = inZone ? (r - 0.5) * 0.55 : r < 0.5 ? -0.52 : 0.52;
  const base = kind === 'ZIP' ? 0.76 : kind === 'CURVE' ? 1.08 : 0.93;
  const speed = base * SPEED_SCALE[difficulty] * (1 + Math.min(0.42, (level - 1) * 0.045 * RAMP_SCALE[difficulty]));
  return { kind, targetX, targetY, inZone, speed, seed };
}

export function judgeSwing(
  plan: PitchPlan,
  progress: number,
  aimX: number,
  difficulty: Difficulty,
  level: number,
  roll: number,
): 'miss' | 'foul' | 'out' | HitKind {
  const reaction: Record<Difficulty, number> = { easy: 0.21, normal: 0.16, hard: 0.12 };
  const timing = Math.abs(progress - 0.88);
  const location = Math.abs(aimX - plan.targetX);
  const window = reaction[difficulty] / (1 + Math.min(0.3, level * 0.022));
  if (!plan.inZone && location > 0.4) return 'miss';
  if (timing > window * 1.75 || location > 0.6) return 'miss';
  if (timing > window || location > 0.34) return 'foul';
  const quality = 1 - (timing / window + location / 0.34) / 2;
  // Fair but weak contact is playable by the defence. Centre-field and extreme
  // pull shots are easier reads, and later/harder innings tighten the gloves.
  // This preserves a generous reward for crisp contact while giving the visible
  // fielders a meaningful job and making three outs an earned game state.
  const baseOut: Record<Difficulty, number> = { easy: 0.12, normal: 0.23, hard: 0.35 };
  const lanePenalty = Math.abs(aimX) < 0.17 ? 0.13 : Math.abs(aimX) > 0.62 ? 0.07 : 0;
  const fieldingChance = clamp(baseOut[difficulty] + lanePenalty + (0.5 - quality) * 0.74 + (level - 1) * 0.012, 0, 0.78);
  if (quality < 0.5 && roll < fieldingChance) return 'out';
  if (quality > 0.82 && roll > 0.48) return 'homer';
  if (quality > 0.58 && roll > 0.28) return 'triple';
  if (quality > 0.32 && roll > 0.12) return 'double';
  return 'single';
}

/** The computer batter reads your pitch selection; corners and changing speed matter. */
export function judgeOpponentAtBat(plan: PitchPlan, difficulty: Difficulty, level: number, roll: number): PlateOutcome {
  const pitcherCommand = plan.kind === 'ZIP' ? 0.72 : plan.kind === 'CURVE' ? 0.66 : 0.58;
  const corner = Math.max(Math.abs(plan.targetX), Math.abs(plan.targetY));
  const rivalSkill: Record<Difficulty, number> = { easy: 0.04, normal: 0.09, hard: 0.15 };
  // Each pitch now has a teachable location: changeups down, fastballs up, and
  // curveballs on an edge. Following the catcher earns visibly better outcomes.
  const pitchFit =
    plan.kind === 'CURVE'
      ? corner > 0.3
        ? 0.07
        : -0.035
      : plan.kind === 'ZIP'
        ? plan.targetY < 0
          ? 0.055
          : -0.015
        : plan.targetY > 0
          ? 0.055
          : -0.015;
  const strikeBand = clamp(
    0.26 +
      pitcherCommand * 0.31 +
      corner * 0.15 +
      pitchFit -
      rivalSkill[difficulty] -
      level * 0.005,
    0.2,
    0.58,
  );
  if (roll < strikeBand) return 'strike';
  const ballBand = clamp(strikeBand + 0.17 - corner * 0.1, 0.35, 0.64);
  if (roll < ballBand) return 'ball';
  // Once a rival makes contact, a well-placed curve or corner is more likely to
  // be a routine play; centre-cut breeze pitches invite extra-base damage.
  const outBand = clamp(
    ballBand +
      0.29 +
      corner * 0.18 +
      Math.max(0, pitchFit) +
      (plan.kind === 'CURVE' ? 0.045 : 0) -
      rivalSkill[difficulty] * 0.3,
    0.64,
    0.94,
  );
  if (roll < outBand) return 'out';
  if (roll > 0.965 - rivalSkill[difficulty] * 0.12) return 'homer';
  if (roll > 0.91) return 'triple';
  if (roll > 0.82) return 'double';
  return 'single';
}

type Phase = 'ready' | 'windup' | 'pitch' | 'in-play' | 'result' | 'pitch-select' | 'target-select' | 'defend-pitch' | 'series';
type State = {
  count: CountState;
  inning: number;
  level: number;
  score: number;
  playerScore: number;
  rivalScore: number;
  defending: boolean;
  phase: Phase;
  phaseT: number;
  pitch: PitchPlan;
  pitchProgress: number;
  aimX: number;
  ball: { x: number; y: number; flight: number; direction: number };
  runners: RunnerMotion[];
  message: string;
  detail: string;
  flash: number;
  seed: number;
  lastHit: HitKind | null;
  pendingOut: PlateResult | null;
  selectedPitch: PitchKind;
  targetIndex: number;
  halfOver: boolean;
};

function fresh(difficulty: Difficulty): State {
  const first = makePitch(1, difficulty, 714025);
  return {
    count: emptyCount(), inning: 1, level: 1, score: 0, playerScore: 0, rivalScore: 0, defending: true, phase: 'pitch-select', phaseT: 0.75,
    pitch: first, pitchProgress: 0, aimX: 0, ball: { x: 0, y: 0, flight: 0, direction: 0 },
    runners: [], message: 'TOP 1 — TAKE THE MOUND!', detail: 'Pick a pitch, then paint a target.',
    flash: 0, seed: first.seed, lastHit: null, pendingOut: null, selectedPitch: 'BREEZE', targetIndex: 4, halfOver: false,
  };
}

function newPitch(s: State, difficulty: Difficulty): void {
  const plan = makePitch(s.level, difficulty, s.seed);
  s.pitch = plan;
  s.seed = plan.seed;
  s.pitchProgress = 0;
  s.phase = 'windup';
  s.phaseT = 0.58;
  s.message = `${PITCH_INFO[plan.kind].name} COMING`;
  s.detail = plan.inZone ? 'Watch the plate and swing on time!' : 'It may miss the zone — be patient.';
}

function targetFor(index: number): { x: number; y: number } {
  return { x: (index % 3 - 1) * 0.46, y: (Math.floor(index / 3) - 1) * 0.38 };
}

function newDefensePitch(s: State, difficulty: Difficulty): void {
  const target = targetFor(s.targetIndex);
  const base = s.selectedPitch === 'ZIP' ? 0.78 : s.selectedPitch === 'CURVE' ? 0.96 : 0.88;
  s.pitch = { kind: s.selectedPitch, targetX: target.x, targetY: target.y, inZone: true, speed: base * SPEED_SCALE[difficulty] * (1 + (s.level - 1) * 0.035), seed: s.seed };
  s.pitchProgress = 0;
  s.phase = 'defend-pitch';
  const row = ['HIGH', 'MIDDLE', 'LOW'][Math.floor(s.targetIndex / 3)];
  const column = ['INSIDE', 'MIDDLE', 'OUTSIDE'][s.targetIndex % 3];
  s.message = `${PITCH_INFO[s.selectedPitch].name} · ${row} ${column}`;
  s.detail = 'Your catcher sets the target...';
}

type PitchCardLayout = { x: number; y: number; width: number; height: number };

function pitchCardLayouts(w: number, h: number): PitchCardLayout[] {
  const margin = clamp(w * 0.028, 10, 18);
  const gap = clamp(w * 0.018, 7, 12);
  const width = (w - margin * 2 - gap * 2) / 3;
  const height = clamp(h * 0.205, 104, 148);
  const y = h - height - clamp(h * 0.025, 10, 18);
  return [0, 1, 2].map((index) => ({
    x: margin + index * (width + gap),
    y,
    width,
    height,
  }));
}

function pitchCardAt(x: number, y: number, w: number, h: number): number | null {
  const cards = pitchCardLayouts(w, h);
  const hit = cards.findIndex(
    (card) =>
      x >= card.x &&
      x <= card.x + card.width &&
      y >= card.y &&
      y <= card.y + card.height,
  );
  return hit < 0 ? null : hit;
}

function targetGridLayout(w: number, h: number): { cell: number; left: number; top: number } {
  const cell = Math.min(w * 0.19, h * 0.09, 84);
  const grid = cell * 3;
  return {
    cell,
    left: w / 2 - grid / 2,
    top: Math.min(h * 0.61, h - grid - 26),
  };
}

function targetAt(x: number, y: number, w: number, h: number): number | null {
  const { cell, left, top } = targetGridLayout(w, h);
  if (x < left || x >= left + cell * 3 || y < top || y >= top + cell * 3) return null;
  return Math.floor((x - left) / cell) + Math.floor((y - top) / cell) * 3;
}

function countText(count: CountState): string {
  return `${'●'.repeat(count.balls)}${'○'.repeat(4 - count.balls)}  /  ${'●'.repeat(count.strikes)}${'○'.repeat(3 - count.strikes)}`;
}

function resolvePlate(s: State, result: PlateResult, label: string, detail: string, api: GameCanvasProps['api']): void {
  s.count = result.state;
  if (s.defending) s.rivalScore += result.runsScored;
  else {
    s.playerScore += result.runsScored;
    s.score += result.points;
    if (result.points) api.addScore(result.points);
  }
  s.message = label;
  s.detail = detail;
  s.flash = 0.5;
  s.phase = 'result';
  s.phaseT = result.inningOver ? 1.3 : 0.85;
  s.halfOver = result.inningOver;
  if (result.inningOver) {
    playSound('levelClear');
    s.message = s.defending ? 'SIDE RETIRED!' : 'THREE OUTS!';
    s.detail = s.defending ? 'Your defence gets the job done.' : 'Jog back out to the field.';
  } else if (label.includes('OUT') || label.includes('STRIKE')) playSound('wrong');
  else if (label.includes('HIT') || label.includes('RUN') || label.includes('WALK')) playSound('coin', s.level);
}

function startNextHalf(s: State, api: GameCanvasProps['api']): void {
  s.count = emptyCount();
  s.runners = [];
  s.ball.flight = 0;
  s.halfOver = false;
  if (s.defending) {
    s.defending = false;
    s.phase = 'ready';
    s.phaseT = 0.35;
    s.message = `BOTTOM ${s.inning} — YOUR BATS`;
    s.detail = 'Tap to see a pitch. Aim left or right, then swing on time.';
    return;
  }
  // A three-inning cup gives a complete win/loss arc, while a tie earns an
  // extra inning instead of an arbitrary draw.
  if (s.inning >= 3 && s.playerScore !== s.rivalScore) {
    s.phase = 'series';
    s.message = s.playerScore > s.rivalScore ? 'HARBOR CUP WON!' : 'COMETS TAKE THE CUP';
    s.detail = `${s.playerScore}–${s.rivalScore}. Tap after your question to start a fresh cup.`;
    api.requestGate(`Diamond Derby final: Harbor ${s.playerScore}, Comets ${s.rivalScore}.`);
    return;
  }
  s.inning += 1;
  s.level += 1;
  s.defending = true;
  s.phase = 'pitch-select';
  s.message = s.inning > 3 ? `EXTRA INNING ${s.inning}!` : `TOP ${s.inning} — DEFEND THE LEAD`;
  s.detail = 'Pick a pitch and target after the quick question.';
  api.requestGate(`Diamond Derby: inning ${s.inning - 1} complete. Harbor ${s.playerScore}, Comets ${s.rivalScore}.`);
}

export default function DiamondDerby({ paused, input, api, restartToken, difficulty, controlsInset }: GameCanvasProps) {
  const state = useRef(fresh(difficulty));
  useEffect(() => { state.current = fresh(difficulty); }, [restartToken, difficulty]);

  const { canvasRef } = useCanvasGame({
    active: !paused,
    step: (ctx, dt, cw, ch) => {
      const s = state.current;
      const h = Math.max(220, ch - controlsInset);
      s.flash = Math.max(0, s.flash - dt);

      const dir = input.consumeTap();
      const tapped = input.consumePointerPress();
      // Up is both a legacy jump key and a directional key. A directional tap
      // must move the pitch target, not accidentally throw the ball.
      const action = (input.consumeJump() || tapped) && dir === null;
      if (s.phase === 'series') {
        if (action) state.current = fresh(difficulty);
      } else if (s.phase === 'pitch-select') {
        if (dir === 'left') s.selectedPitch = s.selectedPitch === 'BREEZE' ? 'ZIP' : s.selectedPitch === 'CURVE' ? 'BREEZE' : 'CURVE';
        if (dir === 'right') s.selectedPitch = s.selectedPitch === 'BREEZE' ? 'CURVE' : s.selectedPitch === 'CURVE' ? 'ZIP' : 'BREEZE';
        if (tapped && input.pointerX !== null && input.pointerY !== null) {
          const picked = pitchCardAt(input.pointerX * cw, input.pointerY * h, cw, h);
          if (picked !== null) {
            s.selectedPitch = (['BREEZE', 'CURVE', 'ZIP'] as const)[picked];
            s.phase = 'target-select';
            s.message = `${PITCH_INFO[s.selectedPitch].name} — PICK A TARGET`;
            s.detail = PITCH_INFO[s.selectedPitch].description;
            playSound('click');
          }
        } else if (!tapped && action) {
          s.phase = 'target-select';
          s.message = `${PITCH_INFO[s.selectedPitch].name} — PICK A TARGET`;
          s.detail = `${PITCH_INFO[s.selectedPitch].description}. Use arrows, then Space.`;
        }
      } else if (s.phase === 'target-select') {
        if (dir === 'left') s.targetIndex = s.targetIndex % 3 === 0 ? s.targetIndex + 2 : s.targetIndex - 1;
        if (dir === 'right') s.targetIndex = s.targetIndex % 3 === 2 ? s.targetIndex - 2 : s.targetIndex + 1;
        if (dir === 'up') s.targetIndex = s.targetIndex < 3 ? s.targetIndex + 6 : s.targetIndex - 3;
        if (dir === 'down') s.targetIndex = s.targetIndex > 5 ? s.targetIndex - 6 : s.targetIndex + 3;
        if (tapped && input.pointerX !== null && input.pointerY !== null) {
          const picked = targetAt(input.pointerX * cw, input.pointerY * h, cw, h);
          if (picked !== null) {
            s.targetIndex = picked;
            newDefensePitch(s, difficulty);
          }
        } else if (!tapped && action) newDefensePitch(s, difficulty);
      } else if (s.phase === 'defend-pitch') {
        s.pitchProgress += dt * s.pitch.speed;
        if (s.pitchProgress >= 1.04) {
          let roll: number; [s.seed, roll] = nextRandom(s.seed);
          const outcome = judgeOpponentAtBat(s.pitch, difficulty, s.level, roll);
          if (outcome === 'out') {
            s.pendingOut = applyPlateOutcome(s.count, 'out'); s.ball = { x: 0, y: 0, flight: 0, direction: clamp(s.pitch.targetX + roll - 0.5, -0.8, 0.8) };
            s.message = Math.abs(s.ball.direction) < 0.22 ? 'POP-UP! CATCH IT!' : 'GROUND BALL! THROW TO FIRST!'; s.detail = 'Your fielder closes in.'; s.phase = 'in-play'; s.phaseT = 1.05; playSound('click');
          } else if (outcome === 'single' || outcome === 'double' || outcome === 'triple' || outcome === 'homer') {
            const taken = outcome === 'single' ? 1 : outcome === 'double' ? 2 : outcome === 'triple' ? 3 : 4; const before = s.count.bases; const r = applyPlateOutcome(s.count, outcome);
            s.count = r.state; s.rivalScore += r.runsScored; s.runners = runnerMotions(before, taken); s.ball = { x: 0, y: 0, flight: 0, direction: clamp(s.pitch.targetX + roll - 0.5, -0.8, 0.8) };
            s.message = outcome === 'homer' ? 'RIVAL HOME RUN!' : `RIVAL ${outcome.toUpperCase()}!`; s.detail = r.runsScored ? `${r.runsScored} run${r.runsScored === 1 ? '' : 's'} score.` : 'Get the ball back to the infield!'; s.phase = 'in-play'; s.phaseT = outcome === 'homer' ? 1.45 : 1.05; playSound('wrong');
          } else {
            const r = applyPlateOutcome(s.count, outcome); resolvePlate(s, r, outcome === 'ball' && r.state.balls === 0 ? 'WALKED A BATTER' : outcome === 'ball' ? `BALL ${r.state.balls}` : r.inningOver ? 'STRIKEOUT — SIDE RETIRED!' : `STRIKE ${r.state.strikes}`, outcome === 'ball' ? 'Try a corner or a curve.' : 'Great pitch!', api);
          }
        }
      } else if (s.phase === 'ready') {
        if (dir === 'left') s.aimX = clamp(s.aimX - 0.11, -0.8, 0.8);
        if (dir === 'right') s.aimX = clamp(s.aimX + 0.11, -0.8, 0.8);
        if (tapped && input.pointerX !== null) s.aimX = clamp((input.pointerX - 0.5) * 1.7, -0.8, 0.8);
        s.phaseT -= dt;
        if (action || s.phaseT <= 0) newPitch(s, difficulty);
      } else if (s.phase === 'windup') {
        s.phaseT -= dt;
        if (s.phaseT <= 0) { s.phase = 'pitch'; s.phaseT = 0; s.message = 'HERE IT COMES!'; s.detail = 'Swing as the ball reaches the bright plate.'; }
      } else if (s.phase === 'pitch') {
        if (dir === 'left') s.aimX = clamp(s.aimX - 0.11, -0.8, 0.8);
        if (dir === 'right') s.aimX = clamp(s.aimX + 0.11, -0.8, 0.8);
        if (tapped && input.pointerX !== null) s.aimX = clamp((input.pointerX - 0.5) * 1.7, -0.8, 0.8);
        s.pitchProgress += dt * s.pitch.speed;
        if (action && s.pitchProgress > 0.16) {
          let roll: number;
          [s.seed, roll] = nextRandom(s.seed);
          const judged = judgeSwing(s.pitch, s.pitchProgress, s.aimX, difficulty, s.level, roll);
          if (judged === 'miss') {
            const r = applyPlateOutcome(s.count, 'strike');
            resolvePlate(s, r, r.inningOver ? 'STRIKEOUT!' : `SWING AND MISS — STRIKE ${r.state.strikes}`, 'Wait for the ball to meet home plate.', api);
          } else if (judged === 'foul') {
            const r = applyPlateOutcome(s.count, 'foul');
            resolvePlate(s, r, 'FOUL TIP!', r.state.strikes === 2 ? 'Two strikes — protect the plate!' : `Strike ${r.state.strikes}.`, api);
          } else if (judged === 'out') {
            s.pendingOut = applyPlateOutcome(s.count, 'out');
            s.ball = { x: 0, y: 0, flight: 0, direction: clamp((s.aimX - s.pitch.targetX) * 0.75 + roll - 0.5, -0.8, 0.8) };
            s.message = Math.abs(s.ball.direction) < 0.24 ? 'HIGH POP-UP!' : 'SLOW ROLLER!';
            s.detail = 'A fielder is racing over...';
            s.phase = 'in-play';
            s.phaseT = 1.08;
            playSound('click');
          } else {
            const taken = judged === 'single' ? 1 : judged === 'double' ? 2 : judged === 'triple' ? 3 : 4;
            const before = s.count.bases;
            const r = applyPlateOutcome(s.count, judged);
            s.count = r.state;
            s.runners = runnerMotions(before, taken as 1 | 2 | 3 | 4);
            s.lastHit = judged;
            s.ball = { x: 0, y: 0, flight: 0, direction: clamp((s.aimX - s.pitch.targetX) * 0.75 + roll - 0.5, -0.8, 0.8) };
            s.playerScore += r.runsScored; s.score += r.points;
            if (r.points) api.addScore(r.points);
            s.message = HIT_LABEL[judged];
            s.detail = r.runsScored ? `${r.runsScored} RUN${r.runsScored === 1 ? '' : 'S'} SCORE!` : 'Send those runners flying!';
            s.flash = 0.7;
            s.phase = 'in-play';
            s.phaseT = judged === 'homer' ? 1.55 : 1.15;
            playSound(judged === 'homer' ? 'powerup' : 'coin', s.level);
          }
        } else if (s.pitchProgress >= 1.12) {
          const outcome: PlateOutcome = s.pitch.inZone ? 'strike' : 'ball';
          const r = applyPlateOutcome(s.count, outcome);
          resolvePlate(s, r, outcome === 'ball' && r.state.balls === 0 ? 'TAKE YOUR BASE!' : outcome === 'ball' ? `BALL ${r.state.balls}` : r.inningOver ? 'CALLED STRIKEOUT!' : `CALLED STRIKE ${r.state.strikes}`, outcome === 'ball' ? 'Good eye — let the wild one go.' : 'The umpire rings it up.', api);
        }
      } else if (s.phase === 'in-play') {
        s.phaseT -= dt;
        s.ball.flight = clamp(s.ball.flight + dt / 1.25, 0, 1);
        s.runners.forEach((runner) => { runner.t = clamp(runner.t + dt * 0.86, 0, 1); });
        if (s.phaseT <= 0) {
          if (s.pendingOut) {
            const pending = s.pendingOut;
            s.pendingOut = null;
            resolvePlate(s, pending, pending.inningOver ? 'CAUGHT! THREE OUTS!' : 'CAUGHT — THAT\'S AN OUT!', pending.inningOver ? 'The inning is over.' : 'Find a gap on the next swing.', api);
          } else { s.phase = 'result'; s.phaseT = 0.7; }
        }
      } else if (s.phase === 'result') {
        s.phaseT -= dt;
        if (s.phaseT <= 0) {
          s.runners = [];
          s.ball.flight = 0;
          s.lastHit = null;
          s.pendingOut = null;
          if (s.halfOver) startNextHalf(s, api);
          else {
            s.phase = s.defending ? 'pitch-select' : 'ready';
            s.phaseT = 0.45;
            s.message = s.defending ? 'CALL THE NEXT PITCH' : `BOTTOM ${s.inning} · BATTER UP`;
            s.detail = s.defending
              ? 'Changeup low · fastball high · curveball to a corner.'
              : 'Tap to call the next pitch.';
          }
        }
      }
      draw(ctx, s, cw, h);
    },
  });
  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" aria-label="Diamond Derby baseball game" />;
}

type Pt = { x: number; y: number };
function diamondPoint(cx: number, cy: number, size: number, base: number): Pt {
  const points: Pt[] = [
    { x: cx, y: cy + size * 0.32 }, { x: cx + size * 0.34, y: cy }, { x: cx, y: cy - size * 0.32 }, { x: cx - size * 0.34, y: cy }, { x: cx, y: cy + size * 0.32 },
  ];
  const a = Math.floor(base); const b = Math.min(4, a + 1); const t = base - a;
  return { x: points[a].x + (points[b].x - points[a].x) * t, y: points[a].y + (points[b].y - points[a].y) * t };
}

function person(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, shirt: string, facing = 1, swing = 0): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale * facing, scale);
  ctx.fillStyle = 'rgba(7,21,42,.22)';
  ctx.beginPath();
  ctx.ellipse(0, 13, 11, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#eef5ff';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-4, -1);
  ctx.lineTo(-7, 12);
  ctx.moveTo(4, -1);
  ctx.lineTo(8, 12);
  ctx.stroke();
  ctx.fillStyle = '#263a5b';
  ctx.beginPath();
  ctx.roundRect(-8, -3, 16, 7, 3);
  ctx.fill();
  ctx.fillStyle = shirt;
  ctx.beginPath();
  ctx.roundRect(-10, -17, 20, 17, 6);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.78)';
  ctx.fillRect(-2, -16, 4, 15);
  ctx.fillStyle = '#f1b17f';
  ctx.beginPath();
  ctx.arc(0, -24, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#173456';
  ctx.beginPath();
  ctx.arc(0, -27, 8.5, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-9, -28, 18, 3);
  ctx.strokeStyle = '#d9a85d';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(7, -13);
  ctx.lineTo(17 + swing * 12, -27 - swing * 14);
  ctx.stroke();
  ctx.fillStyle = '#7a492b';
  ctx.beginPath();
  ctx.ellipse(-11, -11, 5, 7, -.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function ball(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.save(); ctx.fillStyle = '#fffdf2'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#dc5654'; ctx.lineWidth = Math.max(1, r * 0.13); ctx.beginPath(); ctx.arc(x, y, r * 0.72, -1.1, 0.85); ctx.stroke(); ctx.restore();
}

function meter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  value: 1 | 2 | 3,
  color: string,
): void {
  const gap = 3;
  const segment = (width - gap * 2) / 3;
  for (let index = 0; index < 3; index += 1) {
    ctx.fillStyle = index < value ? color : 'rgba(255,255,255,.13)';
    ctx.roundRect(x + index * (segment + gap), y, segment, 4, 2);
    ctx.fill();
  }
}

function pitchTrail(
  ctx: CanvasRenderingContext2D,
  kind: PitchKind,
  x: number,
  y: number,
  width: number,
  color: string,
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.moveTo(x - width * 0.35, y);
  if (kind === 'CURVE') ctx.bezierCurveTo(x - width * 0.05, y - 12, x + width * 0.08, y + 13, x + width * 0.34, y);
  else if (kind === 'ZIP') ctx.lineTo(x + width * 0.34, y);
  else ctx.bezierCurveTo(x - width * 0.02, y + 4, x + width * 0.12, y + 4, x + width * 0.34, y);
  ctx.stroke();
  ball(ctx, x + width * 0.34, y, 6);
  ctx.restore();
}

function draw(ctx: CanvasRenderingContext2D, s: State, w: number, h: number): void {
  const sky = ctx.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#73cdf2'); sky.addColorStop(0.52, '#d8f0ef'); sky.addColorStop(0.53, '#4da76d'); sky.addColorStop(1, '#1d6949');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
  const cx = w / 2; const cy = h * 0.63; const size = Math.min(w * 1.34, h * 1.18);
  // Crowd, lights, and striped field make the stadium feel alive without copied art.
  ctx.fillStyle = '#2b5675'; ctx.fillRect(0, h * 0.23, w, h * 0.13);
  for (let x = 8; x < w; x += 16) { ctx.fillStyle = x % 32 ? '#f3d46e' : '#ee7e76'; ctx.beginPath(); ctx.arc(x, h * (0.27 + ((x * 7) % 9) / 260), 4, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = 'rgba(255,255,220,.72)'; [w * 0.08, w * 0.92].forEach((x) => { ctx.fillRect(x - 2, h * 0.1, 4, h * 0.18); ctx.beginPath(); ctx.arc(x, h * 0.1, 11, 0, Math.PI * 2); ctx.fill(); });
  ctx.save(); ctx.beginPath(); ctx.moveTo(cx, cy - size * 0.42); ctx.lineTo(cx + size * 0.58, cy + size * 0.1); ctx.lineTo(cx, cy + size * 0.55); ctx.lineTo(cx - size * 0.58, cy + size * 0.1); ctx.closePath(); ctx.clip();
  for (let i = -3; i < 5; i += 1) { ctx.fillStyle = i % 2 ? '#3d9c5d' : '#58b96d'; ctx.fillRect(0, cy - size * 0.45 + i * size * 0.11, w, size * 0.11); }
  ctx.restore();
  ctx.fillStyle = '#ca8953'; ctx.beginPath(); ctx.moveTo(cx, cy + size * 0.34); ctx.lineTo(cx + size * 0.37, cy); ctx.lineTo(cx, cy - size * 0.34); ctx.lineTo(cx - size * 0.37, cy); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#fff5cc'; ctx.lineWidth = Math.max(2, w * 0.006); ctx.beginPath(); ctx.moveTo(cx, cy + size * 0.34); ctx.lineTo(cx + size * 0.37, cy); ctx.lineTo(cx, cy - size * 0.34); ctx.lineTo(cx - size * 0.37, cy); ctx.closePath(); ctx.stroke();
  const home = diamondPoint(cx, cy, size, 0); const first = diamondPoint(cx, cy, size, 1); const second = diamondPoint(cx, cy, size, 2); const third = diamondPoint(cx, cy, size, 3);
  [home, first, second, third].forEach((p) => { ctx.fillStyle = '#fffbe6'; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.PI / 4); ctx.fillRect(-7, -7, 14, 14); ctx.restore(); });
  // Fielders move toward a hit's direction; otherwise they form a real defensive shape.
  const fielders = [ { x: cx - size * 0.24, y: cy + size * 0.04 }, { x: cx + size * 0.25, y: cy + size * 0.04 }, { x: cx, y: cy - size * 0.06 }, { x: cx - size * 0.35, y: cy - size * 0.22 }, { x: cx, y: cy - size * 0.32 }, { x: cx + size * 0.35, y: cy - size * 0.22 } ];
  const fieldColor = s.defending ? '#5b67bd' : '#e65855'; const runnerColor = s.defending ? '#e65855' : '#f3aa37';
  fielders.forEach((p, i) => { const chase = s.phase === 'in-play' && i === (s.ball.direction < -0.25 ? 3 : s.ball.direction > 0.25 ? 5 : 4); person(ctx, p.x + (chase ? s.ball.direction * size * 0.11 * s.ball.flight : 0), p.y - (chase ? size * 0.05 * s.ball.flight : 0), 1.2, fieldColor, -1); });
  person(ctx, cx, cy - size * 0.015, 1.48, s.defending ? '#5b67bd' : '#e65855', 1);
  person(ctx, home.x - 20, home.y - 5, 1.52, runnerColor, 1, s.phase === 'pitch' && s.pitchProgress > 0.73 ? 1 : 0);
  // Existing runners plus animated runners during a play.
  if (s.runners.length === 0) s.count.bases.forEach((occupied, i) => { if (occupied) { const p = diamondPoint(cx, cy, size, i + 1); person(ctx, p.x, p.y - 4, 1.08, runnerColor, 1); } });
  s.runners.forEach((runner) => { const p = diamondPoint(cx, cy, size, runner.from + (runner.to - runner.from) * runner.t); person(ctx, p.x, p.y - 5, 1.08, runnerColor, 1); });
  // Pitch visual uses a little curve drift, then a high fly-ball path after contact.
  if (s.phase === 'pitch' || s.phase === 'defend-pitch') {
    const p = clamp(s.pitchProgress, 0, 1); const curve = s.pitch.kind === 'CURVE' ? Math.sin(p * Math.PI) * 0.13 : 0;
    const bx = cx + (s.pitch.targetX + curve) * size * 0.31 * p; const by = cy - size * 0.02 + p * size * 0.31 + s.pitch.targetY * size * 0.1 * p;
    ball(ctx, bx, by, clamp(8 - p * 2, 5, 8));
  }
  if (s.phase === 'in-play') {
    const t = s.ball.flight; const bx = cx + s.ball.direction * size * (0.15 + 0.46 * t); const by = home.y - size * (0.1 + Math.sin(t * Math.PI) * 0.38) - t * size * 0.16;
    ball(ctx, bx, by, clamp(8 - t * 3, 4, 8));
  }
  // Strike-zone guide and aim cursor are deliberate feedback, not decoration.
  const zoneX = home.x; const zoneY = home.y - size * 0.11; const zoneW = size * 0.19; const zoneH = size * 0.19;
  ctx.strokeStyle = 'rgba(255,255,255,.58)'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.strokeRect(zoneX - zoneW / 2, zoneY - zoneH / 2, zoneW, zoneH); ctx.setLineDash([]);
  const cursorX = zoneX + s.aimX * zoneW * 0.72; ctx.strokeStyle = '#ffe86a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cursorX - 8, zoneY + zoneH / 2 + 15); ctx.lineTo(cursorX + 8, zoneY + zoneH / 2 + 15); ctx.stroke();
  // HUD stays compact enough for a phone but makes the baseball situation legible.
  ctx.fillStyle = 'rgba(12,34,69,.88)'; ctx.roundRect(10, 10, w - 20, 47, 13); ctx.fill();
  ctx.fillStyle = '#fff8d2'; ctx.font = '800 12px system-ui'; ctx.textBaseline = 'middle'; ctx.fillText(`HARBOR ${s.playerScore}  —  COMETS ${s.rivalScore}   ${s.defending ? '▲' : '▼'} ${s.inning}`, 19, 27);
  ctx.textAlign = 'right'; ctx.fillText(`OUTS ${'●'.repeat(s.count.outs)}${'○'.repeat(3 - s.count.outs)}`, w - 19, 27);
  ctx.font = '700 11px system-ui'; ctx.fillStyle = '#b9e7ff'; ctx.fillText(`BALLS / STRIKES  ${countText(s.count)}`, w - 19, 45); ctx.textAlign = 'left';
  ctx.fillStyle = s.flash ? '#fff07d' : '#ffffff'; ctx.font = '900 18px ui-rounded, system-ui'; ctx.textAlign = 'center'; ctx.fillText(s.message, cx, h * 0.11);
  ctx.fillStyle = 'rgba(8,27,52,.82)'; ctx.font = '700 12px system-ui'; ctx.fillText(s.detail, cx, h * 0.15); ctx.textAlign = 'left';
  // Built-in touch controls: card selection followed by a large nine-square
  // catcher target. Keyboard users get the same flow with arrows and Space.
  if (s.phase === 'pitch-select') {
    const names: PitchKind[] = ['BREEZE', 'CURVE', 'ZIP'];
    const cards = pitchCardLayouts(w, h);
    const panelTop = cards[0].y - clamp(h * 0.085, 44, 58);
    const panel = ctx.createLinearGradient(0, panelTop, 0, h);
    panel.addColorStop(0, 'rgba(5,24,48,.18)');
    panel.addColorStop(0.22, 'rgba(5,24,48,.9)');
    panel.addColorStop(1, 'rgba(3,14,31,.98)');
    ctx.fillStyle = panel;
    ctx.fillRect(0, panelTop, w, h - panelTop);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${clamp(w * 0.035, 14, 20)}px "Avenir Next", system-ui`;
    ctx.fillText('CHOOSE YOUR PITCH', w / 2, panelTop + 22);
    ctx.fillStyle = '#b9d8ec';
    ctx.font = `700 ${clamp(w * 0.022, 9, 12)}px "Avenir Next", system-ui`;
    ctx.fillText('Changeup low  ·  Fastball high  ·  Curveball to a corner', w / 2, panelTop + 39);

    names.forEach((kind, index) => {
      const card = cards[index];
      const info = PITCH_INFO[kind];
      const selected = s.selectedPitch === kind;
      ctx.save();
      ctx.shadowColor = selected ? info.accent : 'rgba(0,0,0,.35)';
      ctx.shadowBlur = selected ? 18 : 9;
      ctx.shadowOffsetY = 7;
      const cardFill = ctx.createLinearGradient(card.x, card.y, card.x, card.y + card.height);
      cardFill.addColorStop(0, selected ? info.dark : '#102b49');
      cardFill.addColorStop(1, '#07182d');
      ctx.fillStyle = cardFill;
      ctx.roundRect(card.x, card.y, card.width, card.height, 13);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.lineWidth = selected ? 3 : 1.5;
      ctx.strokeStyle = selected ? info.accent : 'rgba(255,255,255,.14)';
      ctx.roundRect(card.x, card.y, card.width, card.height, 13);
      ctx.stroke();

      ctx.fillStyle = info.accent;
      ctx.roundRect(card.x + 8, card.y + 8, card.width - 16, 4, 2);
      ctx.fill();
      pitchTrail(ctx, kind, card.x + card.width / 2, card.y + 27, card.width * 0.52, info.accent);

      ctx.fillStyle = info.accent;
      ctx.font = `900 ${clamp(card.width * 0.085, 8, 10)}px "Avenir Next", system-ui`;
      ctx.fillText(info.callout, card.x + card.width / 2, card.y + 49);
      ctx.fillStyle = '#ffffff';
      ctx.font = `900 ${clamp(card.width * 0.11, 10, 14)}px "Avenir Next", system-ui`;
      ctx.fillText(info.name, card.x + card.width / 2, card.y + 66);
      ctx.fillStyle = 'rgba(235,247,255,.86)';
      ctx.font = `700 ${clamp(card.width * 0.073, 8, 10)}px "Avenir Next", system-ui`;
      ctx.fillText(info.description, card.x + card.width / 2, card.y + 81);

      const meterWidth = Math.min(card.width * 0.28, 38);
      const meterX = card.x + card.width - meterWidth - 9;
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,.52)';
      ctx.font = `800 ${clamp(card.width * 0.06, 7, 9)}px "Avenir Next", system-ui`;
      ctx.fillText('SPEED', card.x + 9, card.y + card.height - 25);
      meter(ctx, meterX, card.y + card.height - 29, meterWidth, info.speed, info.accent);
      ctx.fillText('CONTROL', card.x + 9, card.y + card.height - 10);
      meter(ctx, meterX, card.y + card.height - 14, meterWidth, info.control, info.accent);
      ctx.restore();
      ctx.textAlign = 'center';
    });
    ctx.textAlign = 'left';
  }
  if (s.phase === 'target-select') {
    const info = PITCH_INFO[s.selectedPitch];
    const { cell, left, top } = targetGridLayout(w, h);
    const wash = ctx.createLinearGradient(0, top - 66, 0, h);
    wash.addColorStop(0, 'rgba(4,22,42,.16)');
    wash.addColorStop(0.2, 'rgba(4,22,42,.88)');
    wash.addColorStop(1, 'rgba(2,13,28,.98)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, top - 66, w, h - top + 66);

    ctx.textAlign = 'center';
    ctx.fillStyle = info.accent;
    ctx.font = `900 ${clamp(w * 0.025, 10, 13)}px "Avenir Next", system-ui`;
    ctx.fillText(`${info.name} · ${info.callout}`, cx, top - 42);
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${clamp(w * 0.037, 15, 21)}px "Avenir Next", system-ui`;
    ctx.fillText('PAINT YOUR SPOT', cx, top - 21);
    ctx.fillStyle = 'rgba(226,242,252,.66)';
    ctx.font = `700 ${clamp(w * 0.021, 9, 12)}px "Avenir Next", system-ui`;
    ctx.fillText(info.description, cx, top - 5);

    for (let index = 0; index < 9; index += 1) {
      const x = left + (index % 3) * cell;
      const y = top + Math.floor(index / 3) * cell;
      const selected = s.targetIndex === index;
      const corner = index === 0 || index === 2 || index === 6 || index === 8;
      ctx.fillStyle = selected
        ? info.dark
        : corner
          ? 'rgba(25,72,92,.94)'
          : 'rgba(13,45,76,.94)';
      ctx.roundRect(x + 3, y + 3, cell - 6, cell - 6, Math.min(12, cell * 0.16));
      ctx.fill();
      ctx.lineWidth = selected ? 3 : 1.5;
      ctx.strokeStyle = selected ? info.accent : corner ? 'rgba(114,230,194,.3)' : 'rgba(255,255,255,.13)';
      ctx.roundRect(x + 3, y + 3, cell - 6, cell - 6, Math.min(12, cell * 0.16));
      ctx.stroke();
      if (selected) {
        ctx.strokeStyle = info.accent;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + cell / 2 - 10, y + cell / 2);
        ctx.lineTo(x + cell / 2 + 10, y + cell / 2);
        ctx.moveTo(x + cell / 2, y + cell / 2 - 10);
        ctx.lineTo(x + cell / 2, y + cell / 2 + 10);
        ctx.stroke();
        ball(ctx, x + cell / 2, y + cell / 2, clamp(cell * 0.1, 5, 8));
      } else if (index === 4) {
        ctx.fillStyle = 'rgba(255,184,107,.7)';
        ctx.font = `900 ${clamp(cell * 0.12, 7, 10)}px "Avenir Next", system-ui`;
        ctx.fillText('RISK', x + cell / 2, y + cell / 2 + 3);
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,.46)';
    ctx.font = `800 ${clamp(w * 0.018, 8, 10)}px "Avenir Next", system-ui`;
    ctx.fillText('HIGH', left - 22, top + cell / 2 + 3);
    ctx.fillText('LOW', left - 22, top + cell * 2.5 + 3);
    ctx.textAlign = 'left';
  }
}
