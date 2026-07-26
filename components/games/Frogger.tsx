'use client';

import { useEffect, useRef } from 'react';
import { drawCharacterSprite, type Character } from '@/lib/characters';
import { RAMP_SCALE, SPEED_SCALE, type Difficulty } from '@/lib/difficulty';
import type { GameApi, GameCanvasProps } from '@/lib/games';
import { playSound } from '@/lib/sound';
import {
  CAR_NAMES,
  animFrame,
  drawFrame,
  drawRotated,
  useSprites,
  type SpriteSet,
} from '@/lib/sprites';
import { fitBoard, useCanvasGame } from '@/lib/useCanvasGame';

/**
 * Road Hopper - a Frogger-style crossing game.
 *
 * Every level is generated from a seeded LCG keyed on (level, difficulty, seed),
 * so `scripts/check-frogger.ts` can build the exact layout a player would get
 * and prove it is actually crossable, rather than trusting a hand-tuned lane
 * list to still be safe after every future tweak. The seed itself is picked
 * once per run (an effect, not the generator) so replays vary but a single
 * playthrough's levels are reproducible from that one number.
 *
 * The board keeps its classic shape - a river block, a road block, one
 * mandatory median between them - but the block sizes, directions, speeds,
 * gaps, lane kinds (log / turtle / lilypad / car) and any extra rest stops are
 * all drawn from the seed, and gently ramp with level. `buildLevel` is pure
 * data; `advanceLevel` is the one function that moves time forward, and it is
 * the same function the live game and the checker both call, so they can never
 * disagree about where an obstacle is.
 */

// ------------------------------------------------------------------ geometry

export const COLS = 13;
export const ROWS = 13;
export const CELL = 32;
const W = COLS * CELL;
const H = ROWS * CELL;

export const GOAL_ROW = 0;
export const START_ROW = ROWS - 1;
/** Rows strictly between the goal and the start. */
const INTERIOR = ROWS - 2;

/** Horizontal forgiveness on car collisions, in cells. Makes near misses feel fair. */
export const HITBOX_INSET = 0.22;

/** How many pads the home bank has. Purely a fill-progress display. */
export const GOAL_SLOTS = 5;

/**
 * Speed caps, cells per second. However far the level/difficulty ramp pushes a
 * lane, it is clamped here - both so the game stays survivable for a young
 * kid, and so a fast-moving 1-cell-wide obstacle can never cross a point
 * faster than the checker's simulation step can see it (see check-frogger.ts).
 */
export const MAX_ROAD_SPEED = 3.4;
export const MAX_RIVER_SPEED = 2.2;

/**
 * Each bank you reach re-themes the whole board, so progress is visible at a
 * glance rather than only in the counter.
 */
const BIOMES = ['grass', 'sand', 'snow', 'stone', 'dirt', 'purple'] as const;
type Biome = (typeof BIOMES)[number];

const THEME: Record<
  Biome,
  { water: [string, string]; road: string; dash: string; ripple: string }
> = {
  grass: { water: ['#2b7fd4', '#1f5fa8'], road: '#3b3b45', dash: 'rgba(255,255,255,0.28)', ripple: 'rgba(255,255,255,0.16)' },
  sand: { water: ['#2fa8c7', '#1d7f9c'], road: '#5c5346', dash: 'rgba(255,240,200,0.3)', ripple: 'rgba(255,255,255,0.2)' },
  snow: { water: ['#5fb3e0', '#3d86b8'], road: '#57606b', dash: 'rgba(255,255,255,0.4)', ripple: 'rgba(255,255,255,0.3)' },
  stone: { water: ['#3a6f96', '#274c69'], road: '#33333b', dash: 'rgba(210,220,235,0.3)', ripple: 'rgba(255,255,255,0.14)' },
  dirt: { water: ['#3f7f6a', '#2a5a4c'], road: '#453a30', dash: 'rgba(255,235,205,0.28)', ripple: 'rgba(255,255,255,0.15)' },
  purple: { water: ['#6a4fb0', '#472f82'], road: '#3a2f4a', dash: 'rgba(230,215,255,0.32)', ripple: 'rgba(255,255,255,0.18)' },
};

// ------------------------------------------------------------- level generation

export type LaneKind = 'car' | 'log' | 'turtle' | 'lilypad';
export type RowKind = 'goal' | 'start' | 'safe' | 'river' | 'road';
/** What buildRowPlan actually produces for an interior row - a subset of RowKind. */
type BlockKind = 'safe' | 'river' | 'road';

export type Obstacle = {
  x: number;
  len: number;
  /** False only for a submerged turtle at this instant; always true otherwise. */
  safe: boolean;
  /** A turtle's own offset into its duty cycle, so a lane never submerges as
   *  one solid block. Unused (0) for every other kind. */
  phase: number;
};

export type LaneSpec = {
  row: number;
  kind: LaneKind;
  dir: 1 | -1;
  speed: number;
  len: number;
  gap: number;
  /** Car sprite name, for road lanes. */
  car?: string;
  /** Turtle duty cycle, seconds. Present only for kind 'turtle'. */
  subUp?: number;
  subDown?: number;
};

export type Lane = LaneSpec & { obstacles: Obstacle[]; span: number };

export type Coin = { row: number; x: number; risky: boolean; collected: boolean };

export type LevelPlan = {
  level: number;
  difficulty: Difficulty;
  seed: number;
  /** rows[r] describes row r, for every r in 0..ROWS-1. */
  rows: RowKind[];
  lanes: Lane[];
  coins: Coin[];
  biome: Biome;
  elapsed: number;
};

/**
 * Seeded LCG. Deliberately not Math.random in this path: a verifier cannot
 * prove anything about a level it is not able to reproduce.
 */
function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  if (state === 0) state = 0x9e3779b9;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const DIFFICULTY_SALT: Record<Difficulty, number> = {
  easy: 0x7c3a9d21,
  normal: 0x4e1bf0a5,
  hard: 0x2a6dc317,
};

function mod(a: number, b: number): number {
  return ((a % b) + b) % b;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * The 11 interior rows, in order from the goal side to the start side: a river
 * block, one mandatory median, a road block, plus - increasingly at low
 * levels, rarely at high ones - a few extra rest stops dropped in at random
 * positions. Block sizes come from a target that grows gently with level and
 * caps at 5, so the board never gets denser than the classic 5-river/5-road
 * split it started from; it can, however, start much sparser than that.
 */
function buildRowPlan(level: number, rng: () => number): BlockKind[] {
  const target = Math.min(5, 3 + Math.floor((level - 1) / 3));
  const jitter = () => {
    const r = rng();
    return r < 0.3 ? -1 : r < 0.6 ? 0 : 1;
  };

  let riverN = clamp(target + jitter(), 2, 7);
  let roadN = clamp(target + jitter(), 2, 7);
  let overflow = riverN + roadN - 10;
  if (overflow > 0) {
    const takeRiver = Math.min(overflow, riverN - 2);
    riverN -= takeRiver;
    overflow -= takeRiver;
    if (overflow > 0) roadN -= Math.min(overflow, roadN - 2);
  }
  const extraSafe = Math.max(0, INTERIOR - 1 - riverN - roadN);

  const tokens: BlockKind[] = [
    ...Array<BlockKind>(riverN).fill('river'),
    'safe',
    ...Array<BlockKind>(roadN).fill('road'),
  ];
  for (let i = 0; i < extraSafe; i += 1) {
    const at = Math.min(tokens.length, Math.floor(rng() * (tokens.length + 1)));
    tokens.splice(at, 0, 'safe');
  }
  breakLongRuns(tokens);
  return tokens;
}

/**
 * No more than MAX_CHAIN consecutive hazard rows without a place to stand.
 * A short river or road block is easy to prove crossable by timing alone; a
 * long unbroken one asks a player (and the checker) to line up several
 * independent, differently-timed lanes all at once, which can take an
 * unreasonably long wait even when it is technically possible. Capping the
 * chain length is what keeps every crossing provable AND quick, not just one
 * or the other. riverN/roadN never exceed 7, so a single split per run always
 * suffices.
 */
const MAX_CHAIN = 4;
function breakLongRuns(tokens: BlockKind[]): void {
  let i = 0;
  while (i < tokens.length) {
    if (tokens[i] === 'safe') {
      i += 1;
      continue;
    }
    let j = i;
    while (j < tokens.length && tokens[j] === tokens[i]) j += 1;
    if (j - i > MAX_CHAIN) tokens[i + Math.floor((j - i) / 2)] = 'safe';
    i = j;
  }
}

function finishLane(spec: LaneSpec, rng: () => number): Lane {
  const period = spec.len + spec.gap;
  const count = Math.ceil((COLS + period) / period) + 1;
  const span = count * period;
  const start = -period + rng() * period;
  const cycle = (spec.subUp ?? 1) + (spec.subDown ?? 1);
  const obstacles: Obstacle[] = Array.from({ length: count }, (_, i) => ({
    x: start + i * period,
    len: spec.len,
    safe: true,
    phase: spec.kind === 'turtle' ? rng() * cycle : 0,
  }));
  return { ...spec, obstacles, span };
}

function buildLane(
  row: number,
  block: 'river' | 'road',
  level: number,
  difficulty: Difficulty,
  rng: () => number,
  prevDir: 1 | -1 | null,
): Lane {
  // Adjacent lanes always face opposite ways. Classic Frogger does this for
  // readability, but it is load-bearing here too: two neighbouring river
  // lanes moving the same way at nearly the same speed drift in and out of
  // phase with each other so slowly that a joint safe moment - riding one
  // AND finding the other clear at the same column - can take an
  // unreasonably long wait to ever occur. Opposite directions make the
  // relative drift fast (their speeds add rather than subtract), which keeps
  // that alignment showing up often.
  const dir: 1 | -1 = prevDir === null ? (rng() < 0.5 ? 1 : -1) : prevDir === 1 ? -1 : 1;
  // Gentle, capped ramp: speed climbs a little every level, then stops
  // climbing, so a level 20 crossing is a bit brisker than level 1 but never
  // frantic.
  const speedRamp = Math.min(1.7, 1 + (level - 1) * 0.045 * RAMP_SCALE[difficulty]);

  if (block === 'road') {
    const len = 1 + Math.floor(rng() * 2) + (rng() < 0.12 ? 1 : 0);
    const gap = len + 2 + Math.floor(rng() * 3);
    const base = 1.2 + rng() * 1.0;
    const speed = Math.min(MAX_ROAD_SPEED, base * speedRamp * SPEED_SCALE[difficulty]);
    const car = CAR_NAMES[Math.floor(rng() * CAR_NAMES.length)];
    return finishLane({ row, kind: 'car', dir, speed, len, gap, car }, rng);
  }

  // River lane: log (rideable, drifts), lilypad (rideable, drifts slowly -
  // the gentlest option) or turtle (drifts, and periodically dives). Turtles
  // only start appearing from level 3, so a first-timer never meets one cold.
  const roll = rng();
  const turtleChance =
    level < 3 ? 0 : difficulty === 'hard' ? 0.24 : difficulty === 'easy' ? 0.08 : 0.15;
  const lilypadChance = 0.28;
  const kind: LaneKind =
    roll < turtleChance ? 'turtle' : roll < turtleChance + lilypadChance ? 'lilypad' : 'log';
  const len = 2 + Math.floor(rng() * 3);
  const gap = len + 2 + Math.floor(rng() * 2);

  // Lily pads are the calm option, not a stationary one: a platform that
  // never moves would only ever cover the same handful of columns forever,
  // which can leave no reachable path at all when it neighbours another
  // fixed-phase lane. Drifting slowly keeps every column reachable given a
  // moment's wait - the same guarantee a log gives, just gentler.
  const base = kind === 'lilypad' ? 0.5 + rng() * 0.5 : 0.7 + rng() * 0.9;
  const speed = Math.min(MAX_RIVER_SPEED, base * speedRamp * SPEED_SCALE[difficulty]);
  if (kind === 'turtle') {
    const subUp = 2.0 + rng() * 1.4;
    const subDown = 0.8 + rng() * 0.7;
    return finishLane({ row, kind, dir, speed, len, gap, subUp, subDown }, rng);
  }
  return finishLane({ row, kind, dir, speed, len, gap }, rng);
}

function buildCoins(
  rows: RowKind[],
  lanes: Lane[],
  difficulty: Difficulty,
  rng: () => number,
): Coin[] {
  const coins: Coin[] = [];
  const safeRows: number[] = [];
  for (let r = 1; r < ROWS - 1; r += 1) if (rows[r] === 'safe') safeRows.push(r);

  // A coin or two on every rest stop and the median - always collectible,
  // since those rows are safe by construction.
  const safeCount = Math.min(safeRows.length * 2, 6);
  for (let i = 0; i < safeCount; i += 1) {
    const row = safeRows[i % safeRows.length];
    const x = 1 + Math.floor(rng() * (COLS - 2));
    coins.push({ row, x, risky: false, collected: false });
  }

  // A coin sitting on a lilypad - safe once you are there, a small reward for
  // taking the gentler river lane.
  const pads = lanes.filter((l) => l.kind === 'lilypad');
  for (const pad of pads.slice(0, 2)) {
    if (pad.obstacles.length === 0) continue;
    const o = pad.obstacles[Math.floor(rng() * pad.obstacles.length)];
    const x = Math.round(o.x + o.len / 2);
    if (x >= 0 && x < COLS) coins.push({ row: pad.row, x, risky: false, collected: false });
  }

  // One bonus coin out on a hazard lane, for a kid who wants the extra risk.
  // Never required to clear the level.
  const riskyChance = difficulty === 'easy' ? 0.5 : 0.8;
  const hazardLanes = lanes.filter((l) => l.kind === 'car' || l.kind === 'log' || l.kind === 'turtle');
  if (hazardLanes.length > 0 && rng() < riskyChance) {
    const lane = hazardLanes[Math.floor(rng() * hazardLanes.length)];
    const x = 1 + Math.floor(rng() * (COLS - 2));
    coins.push({ row: lane.row, x, risky: true, collected: false });
  }
  return coins;
}

/**
 * Builds one level. Pure: the same (level, difficulty, seed) always yields the
 * same rows, lanes and coins.
 */
export function buildLevel(level: number, difficulty: Difficulty, seed: number): LevelPlan {
  const rng = makeRng((seed ^ DIFFICULTY_SALT[difficulty] ^ Math.imul(level, 0x9e3779b1)) >>> 0);
  const plan = buildRowPlan(level, rng);

  const rows: RowKind[] = new Array(ROWS);
  rows[GOAL_ROW] = 'goal';
  rows[START_ROW] = 'start';
  for (let i = 0; i < INTERIOR; i += 1) rows[1 + i] = plan[i];

  const lanes: Lane[] = [];
  let prevDir: 1 | -1 | null = null;
  for (let i = 0; i < INTERIOR; i += 1) {
    const kind = plan[i];
    if (kind === 'safe') {
      prevDir = null;
      continue;
    }
    const lane = buildLane(1 + i, kind, level, difficulty, rng, prevDir);
    lanes.push(lane);
    prevDir = lane.dir;
  }

  const coins = buildCoins(rows, lanes, difficulty, rng);
  const biome = BIOMES[(level - 1) % BIOMES.length];
  return { level, difficulty, seed, rows, lanes, coins, biome, elapsed: 0 };
}

function goalSlotCenter(i: number): number {
  return (i + 0.5) * (COLS / GOAL_SLOTS);
}

// ------------------------------------------------------- shared with the checker

/**
 * Moves every obstacle forward by `dt` and updates turtle submersion. This is
 * the ONE function that advances time in a level, and both the live game and
 * `scripts/check-frogger.ts` call it, so a level can never behave differently
 * under simulation than it does on screen.
 */
export function advanceLevel(level: LevelPlan, dt: number): void {
  level.elapsed += dt;
  for (const lane of level.lanes) {
    for (const o of lane.obstacles) {
      if (lane.speed > 0) {
        o.x += lane.dir * lane.speed * dt;
        if (lane.dir > 0 && o.x > COLS) o.x -= lane.span;
        else if (lane.dir < 0 && o.x + o.len < 0) o.x += lane.span;
      }
      if (lane.kind === 'turtle') {
        const cycle = (lane.subUp ?? 1) + (lane.subDown ?? 1);
        o.safe = mod(level.elapsed + o.phase, cycle) < (lane.subUp ?? 1);
      }
    }
  }
}

/** True if a car on this lane currently overlaps column x (an integer cell). */
export function carHit(lane: Lane, x: number): boolean {
  return lane.obstacles.some((o) => o.x < x + 1 - HITBOX_INSET && o.x + o.len > x + HITBOX_INSET);
}

/** The obstacle currently safe to stand on at this river lane's centreX, if any. */
export function rideObstacle(lane: Lane, centerX: number): Obstacle | undefined {
  return lane.obstacles.find((o) => o.safe && o.x <= centerX && centerX <= o.x + o.len);
}

export function laneAt(level: LevelPlan, row: number): Lane | undefined {
  return level.lanes.find((l) => l.row === row);
}

// ---------------------------------------------------------------- game state

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
};

type State = {
  plan: LevelPlan;
  seed: number;
  /** Player column as a float so it can drift while riding a log. */
  x: number;
  row: number;
  /** Highest row (lowest index) reached this life, for forward-progress points. */
  bestRow: number;
  /** Counts down a short hop animation. */
  hop: number;
  dying: number;
  splash: { x: number; y: number } | null;
  animTime: number;
  particles: Particle[];
  coinStreak: number;
  /** How many home-bank pads are lit, carried across levels within a run. */
  slotsFilled: number;
};

function freshLevelState(
  level: number,
  difficulty: Difficulty,
  seed: number,
  slotsFilled: number,
): State {
  return {
    plan: buildLevel(level, difficulty, seed),
    seed,
    x: Math.floor(COLS / 2),
    row: START_ROW,
    bestRow: START_ROW,
    hop: 0,
    dying: 0,
    splash: null,
    animTime: 0,
    particles: [],
    coinStreak: 0,
    slotsFilled,
  };
}

function freshRun(difficulty: Difficulty): State {
  // A fresh seed per run/restart - real randomness only enters here, in an
  // effect, never inside buildLevel itself, which is what keeps the generator
  // provable.
  const seed = Math.floor(Math.random() * 0x7fffffff);
  return freshLevelState(1, difficulty, seed, 0);
}

function spawnBurst(s: State, x: number, y: number, color: string, count = 14): void {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 60;
    s.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 30,
      life: 0.4 + Math.random() * 0.3,
      maxLife: 0.55,
      color,
      size: 2 + Math.random() * 2.5,
    });
  }
  // A cap keeps a streak of quick deaths or coins from growing the array
  // forever on a long session.
  if (s.particles.length > 160) s.particles.splice(0, s.particles.length - 160);
}

function updateParticles(s: State, dt: number): void {
  for (const p of s.particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 200 * dt;
  }
  if (s.particles.some((p) => p.life <= 0)) {
    s.particles = s.particles.filter((p) => p.life > 0);
  }
}

function die(s: State, api: GameApi, reason: string): void {
  s.dying = 0.5;
  s.splash = { x: s.x, y: s.row };
  playSound('gameOver');
  api.died(reason);
  spawnBurst(s, s.x * CELL + CELL / 2, s.row * CELL + CELL / 2, '#8fd6ff', 10);
}

export default function Frogger({
  paused,
  input,
  api,
  restartToken,
  difficulty,
  character,
}: GameCanvasProps) {
  const stateRef = useRef<State>(freshRun(difficulty));
  const sprites = useSprites();
  const spritesRef = useRef<SpriteSet | null>(null);
  useEffect(() => {
    spritesRef.current = sprites;
  }, [sprites]);

  const characterRef = useRef<Character>(character);
  useEffect(() => {
    characterRef.current = character;
  }, [character]);

  // Changing the skill setting mid-run rebuilds from level 1 with a fresh seed.
  useEffect(() => {
    stateRef.current = freshRun(difficulty);
  }, [restartToken, difficulty]);

  const { canvasRef } = useCanvasGame({
    active: !paused,
    step: (ctx, dt, cw, ch) => {
      const s = stateRef.current;
      s.animTime += dt;
      advanceLevel(s.plan, dt);
      updateParticles(s, dt);

      if (s.dying > 0) {
        s.dying -= dt;
        if (s.dying <= 0) {
          s.x = Math.floor(COLS / 2);
          s.row = START_ROW;
          s.bestRow = START_ROW;
          s.splash = null;
          s.coinStreak = 0;
        }
      } else {
        // Hops are discrete, one queued tap per frame.
        let moved = false;
        const tap = input.consumeTap();
        if (tap) {
          if (tap === 'up' && s.row > 0) {
            s.row -= 1;
            s.x = Math.round(s.x);
            s.hop = 0.14;
            moved = true;
          } else if (tap === 'down' && s.row < START_ROW) {
            s.row += 1;
            s.x = Math.round(s.x);
            s.hop = 0.14;
            moved = true;
          } else if (tap === 'left') {
            s.x = Math.max(0, Math.round(s.x) - 1);
            s.hop = 0.14;
            moved = true;
          } else if (tap === 'right') {
            s.x = Math.min(COLS - 1, Math.round(s.x) + 1);
            s.hop = 0.14;
            moved = true;
          }
          if (moved) {
            playSound('jump');
            // Award forward progress once per row, not per hop back and forth.
            if (s.row < s.bestRow) {
              s.bestRow = s.row;
              api.addScore(10);
            }
          }
        }

        if (s.hop > 0) s.hop -= dt;

        // Coins are collected on plain overlap, whenever the hopper happens
        // to be sitting on their cell - no separate physics needed.
        for (const coin of s.plan.coins) {
          if (coin.collected) continue;
          if (coin.row === s.row && Math.round(s.x) === coin.x) {
            coin.collected = true;
            s.coinStreak += 1;
            api.addScore(coin.risky ? 50 : 20);
            playSound('coin', s.coinStreak);
            spawnBurst(
              s,
              coin.x * CELL + CELL / 2,
              coin.row * CELL + CELL / 2,
              coin.risky ? '#ff6fb5' : '#ffd75e',
              10,
            );
          }
        }

        const kind = s.plan.rows[s.row];
        const lane = laneAt(s.plan, s.row);
        const center = s.x + 0.5;

        if (kind === 'goal') {
          const clearedLevel = s.plan.level;
          api.addScore(100);
          playSound('levelClear');
          let slotsFilled = s.slotsFilled + 1;
          if (slotsFilled >= GOAL_SLOTS) {
            api.addScore(150);
            api.setStatus('Bank full!');
            slotsFilled = 0;
          }
          stateRef.current = freshLevelState(clearedLevel + 1, difficulty, s.seed, slotsFilled);
          api.requestGate(`Level ${clearedLevel} cleared`);
        } else if (kind === 'river' && lane) {
          const ride = rideObstacle(lane, center);
          if (ride) {
            if (moved) playSound('land');
            if (lane.speed > 0) {
              s.x += lane.dir * lane.speed * dt;
              if (s.x < -0.4 || s.x > COLS - 0.6) {
                die(
                  s,
                  api,
                  lane.kind === 'turtle' ? 'The turtle dove and left you behind' : 'You drifted off the log',
                );
              }
            }
          } else {
            die(s, api, 'You fell in the water');
          }
        } else if (kind === 'road' && lane) {
          if (carHit(lane, s.x)) {
            die(s, api, 'You got squashed');
          } else if (moved) {
            playSound('land');
          }
        } else if (moved) {
          playSound('land');
        }
      }

      draw(ctx, stateRef.current, spritesRef.current, cw, ch, characterRef.current);
    },
  });

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />;
}

// -------------------------------------------------------------------- drawing

function drawGrassRow(
  ctx: CanvasRenderingContext2D,
  sp: SpriteSet,
  row: number,
  frame: string,
): void {
  for (let c = 0; c < COLS; c += 1) {
    drawFrame(ctx, sp.tiles, frame, c * CELL, row * CELL, CELL, CELL);
  }
}

function drawLog(ctx: CanvasRenderingContext2D, px: number, y: number, pw: number): void {
  // Drawn rather than tiled: a repeating bridge tile left thin gaps and did
  // not read as something you could stand on.
  const top = y + 2;
  const hgt = CELL - 4;
  const grad = ctx.createLinearGradient(0, top, 0, top + hgt);
  grad.addColorStop(0, '#a9763f');
  grad.addColorStop(0.5, '#8a5a2b');
  grad.addColorStop(1, '#6b4420');
  ctx.fillStyle = grad;
  const r = 7;
  ctx.beginPath();
  ctx.moveTo(px + r, top);
  ctx.arcTo(px + pw, top, px + pw, top + hgt, r);
  ctx.arcTo(px + pw, top + hgt, px, top + hgt, r);
  ctx.arcTo(px, top + hgt, px, top, r);
  ctx.arcTo(px, top, px + pw, top, r);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.13)';
  ctx.lineWidth = 1.5;
  for (const fy of [0.32, 0.62]) {
    ctx.beginPath();
    ctx.moveTo(px + 6, top + hgt * fy);
    ctx.lineTo(px + pw - 6, top + hgt * fy);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  for (const cx of [px + 3, px + pw - 6]) {
    ctx.beginPath();
    ctx.ellipse(cx + 1.5, top + hgt / 2, 2.5, hgt / 2 - 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawLilypad(ctx: CanvasRenderingContext2D, px: number, y: number, pw: number, t: number): void {
  const cy = y + CELL / 2;
  const bob = Math.sin(t * 1.4 + px * 0.05) * 1.2;
  const leaves = Math.max(1, Math.round(pw / CELL));
  for (let i = 0; i < leaves; i += 1) {
    const cx = px + (i + 0.5) * (pw / leaves);
    const r = CELL * 0.42;
    ctx.fillStyle = '#3fae5a';
    ctx.beginPath();
    ctx.arc(cx, cy + bob, r, 0.35, Math.PI * 2 - 0.35);
    ctx.lineTo(cx, cy + bob);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.arc(cx - r * 0.25, cy + bob - r * 0.25, r * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,90,45,0.5)';
    ctx.lineWidth = 1;
    for (const a of [0.6, 1.4, 2.2]) {
      ctx.beginPath();
      ctx.moveTo(cx, cy + bob);
      ctx.lineTo(cx + Math.cos(a) * r * 0.8, cy + bob + Math.sin(a) * r * 0.8);
      ctx.stroke();
    }
  }
}

function drawTurtle(
  ctx: CanvasRenderingContext2D,
  px: number,
  y: number,
  pw: number,
  safe: boolean,
  t: number,
  dir: number,
): void {
  const cx = px + pw / 2;
  const cy = y + CELL / 2;
  if (!safe) {
    // Submerged: just ripples, so the danger reads as "gone under" rather
    // than "vanished".
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    for (const r of [6, 11]) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, r + Math.sin(t * 3) * 1.5, r * 0.4, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    return;
  }
  const rx = pw / 2 - 3;
  const ry = CELL * 0.32;
  ctx.fillStyle = '#2f6b3c';
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4d9257';
  ctx.beginPath();
  ctx.ellipse(cx, cy - 1, rx * 0.8, ry * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(20,50,25,0.4)';
  ctx.lineWidth = 1;
  for (let i = -1; i <= 1; i += 1) {
    ctx.beginPath();
    ctx.moveTo(cx + i * rx * 0.4, cy - ry * 0.6);
    ctx.lineTo(cx + i * rx * 0.4, cy + ry * 0.6);
    ctx.stroke();
  }
  ctx.fillStyle = '#4d9257';
  ctx.beginPath();
  ctx.arc(cx + dir * rx * 0.9, cy, ry * 0.45, 0, Math.PI * 2);
  ctx.fill();
}

function drawLane(ctx: CanvasRenderingContext2D, s: State, lane: Lane, sp: SpriteSet): void {
  const y = lane.row * CELL;
  for (const o of lane.obstacles) {
    const px = o.x * CELL;
    const pw = o.len * CELL;
    if (px > W || px + pw < 0) continue;

    if (lane.kind === 'car') {
      const img = lane.car ? sp.cars[lane.car] : undefined;
      if (img) {
        // Car art points up; a quarter turn makes it face along the lane.
        const angle = lane.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        drawRotated(ctx, img, px + pw / 2, y + CELL / 2, CELL - 6, pw - 6, angle);
        // Headlights/tail lights make direction readable before the car reaches
        // the player, especially on the darker stone and purple roads.
        const nose = lane.dir > 0 ? px + pw - 4 : px + 4;
        const tail = lane.dir > 0 ? px + 4 : px + pw - 4;
        ctx.fillStyle = 'rgba(255,244,168,.9)';
        ctx.shadowColor = '#fff0a0';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(nose, y + CELL * 0.32, 1.8, 0, Math.PI * 2);
        ctx.arc(nose, y + CELL * 0.68, 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,80,90,.8)';
        ctx.fillRect(tail - 1.5, y + CELL * 0.27, 3, 3);
        ctx.fillRect(tail - 1.5, y + CELL * 0.64, 3, 3);
      }
    } else if (lane.kind === 'log') {
      drawLog(ctx, px, y, pw);
    } else if (lane.kind === 'lilypad') {
      drawLilypad(ctx, px, y, pw, s.animTime);
    } else {
      drawTurtle(ctx, px, y, pw, o.safe, s.animTime, lane.dir);
    }
  }
}

function drawCoin(ctx: CanvasRenderingContext2D, s: State, coin: Coin): void {
  const cx = coin.x * CELL + CELL / 2;
  const bob = Math.sin(s.animTime * 5 + coin.x * 1.3) * 2;
  const cy = coin.row * CELL + CELL / 2 + bob;
  const r = coin.risky ? 8 : 6.5;
  const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 1, cx, cy, r);
  if (coin.risky) {
    grad.addColorStop(0, '#ffe1f0');
    grad.addColorStop(1, '#ff6fb5');
  } else {
    grad.addColorStop(0, '#fff3c4');
    grad.addColorStop(1, '#f5a800');
  }
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = coin.risky ? 'rgba(150,20,80,0.6)' : 'rgba(140,90,0,0.6)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawParticles(ctx: CanvasRenderingContext2D, s: State): void {
  for (const p of s.particles) {
    const t = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = t;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawHomeBank(ctx: CanvasRenderingContext2D, s: State, sp: SpriteSet): void {
  const y = GOAL_ROW * CELL;
  for (let i = 0; i < GOAL_SLOTS; i += 1) {
    const cx = goalSlotCenter(i) * CELL;
    const filled = i < s.slotsFilled;
    const name = filled ? animFrame(['flag_green_a', 'flag_green_b'], s.animTime, 4) : 'flag_off';
    ctx.globalAlpha = filled ? 1 : 0.55;
    drawFrame(ctx, sp.tiles, name, cx - CELL / 2, y - 6, CELL, CELL);
    ctx.globalAlpha = 1;
  }
}

function drawPlayer(ctx: CanvasRenderingContext2D, s: State, character: Character): void {
  if (s.dying > 0 && s.splash) {
    const t = 1 - s.dying / 0.5;
    ctx.strokeStyle = `rgba(255,255,255,${1 - t})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(s.splash.x * CELL + CELL / 2, s.splash.y * CELL + CELL / 2, 6 + t * 18, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }

  // Whoever is selected, drawn rather than a stock frog. A hop lifts and
  // stretches them, which reads as a jump at this size far better than a
  // second sprite frame would.
  const hopping = s.hop > 0;
  const lift = hopping ? 6 : 0;
  const size = CELL - 2;
  const squash = hopping ? 1.12 : 1;

  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(
    s.x * CELL + CELL / 2,
    s.row * CELL + CELL - 2,
    size * (hopping ? 0.22 : 0.3),
    size * 0.1,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  drawCharacterSprite(
    ctx,
    character,
    s.x * CELL + (CELL - size) / 2,
    s.row * CELL + (CELL - size) - lift,
    size,
    size,
    { frame: 0, facing: 1, squash, airborne: hopping },
  );
}

/**
 * The board is inherently square, so it is scaled to fit and centred. The
 * surrounding area is painted in a matching colour rather than left black, so
 * a tall screen still looks intentional.
 */
function draw(
  ctx: CanvasRenderingContext2D,
  s: State,
  sp: SpriteSet | null,
  cw: number,
  ch: number,
  character: Character,
): void {
  const surround = ctx.createRadialGradient(cw / 2, ch * 0.42, 20, cw / 2, ch * 0.45, Math.max(cw, ch) * 0.7);
  surround.addColorStop(0, '#244f68');
  surround.addColorStop(0.62, '#102f4f');
  surround.addColorStop(1, '#09182f');
  ctx.fillStyle = surround;
  ctx.fillRect(0, 0, cw, ch);
  ctx.save();
  fitBoard(ctx, cw, ch, W, H);
  drawBoard(ctx, s, sp, character);
  ctx.restore();
}

function drawBoard(
  ctx: CanvasRenderingContext2D,
  s: State,
  sp: SpriteSet | null,
  character: Character,
): void {
  const plan = s.plan;

  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, W, H);

  if (!sp) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = 'bold 12px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('loading art...', W / 2, H / 2);
    ctx.textAlign = 'left';
    return;
  }

  const theme = THEME[plan.biome];
  const bank = `terrain_${plan.biome}_block_top`;

  // Every row paints its own background, so a rest stop reads as a strip of
  // grass dropped into a hazard block rather than a seam in a fixed layout.
  for (let r = 0; r < ROWS; r += 1) {
    const kind = plan.rows[r];
    const y = r * CELL;
    if (kind === 'goal' || kind === 'start' || kind === 'safe') {
      drawGrassRow(ctx, sp, r, bank);
      // Tiny deterministic flowers/pebbles break up the repeated bank tile.
      for (let c = 0; c < COLS; c += 1) {
        if ((c * 5 + r * 3 + plan.level) % 7 !== 0) continue;
        ctx.fillStyle = (c + r) % 2 === 0 ? 'rgba(255,236,139,.8)' : 'rgba(255,155,205,.75)';
        ctx.beginPath();
        ctx.arc(c * CELL + CELL * 0.76, y + CELL * 0.3, 2.1, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (kind === 'river') {
      const grad = ctx.createLinearGradient(0, y, 0, y + CELL);
      grad.addColorStop(0, theme.water[0]);
      grad.addColorStop(1, theme.water[1]);
      ctx.fillStyle = grad;
      ctx.fillRect(0, y, W, CELL);
      ctx.strokeStyle = theme.ripple;
      ctx.lineWidth = 2;
      const drift = (s.animTime * 22 * (r % 2 === 0 ? 1 : -1)) % 40;
      for (let x = -40; x < W + 40; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x + drift, y + CELL * 0.35);
        ctx.lineTo(x + drift + 14, y + CELL * 0.35);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,.09)';
      for (let x = (r * 31 + Math.floor(s.animTime * 12)) % 53; x < W; x += 53) {
        ctx.fillRect(x, y + CELL * 0.72, 11, 1.3);
      }
    } else if (kind === 'road') {
      ctx.fillStyle = theme.road;
      ctx.fillRect(0, y, W, CELL);
      if (plan.rows[r + 1] === 'road') {
        ctx.strokeStyle = theme.dash;
        ctx.lineWidth = 2;
        ctx.setLineDash([12, 14]);
        ctx.beginPath();
        ctx.moveTo(0, y + CELL);
        ctx.lineTo(W, y + CELL);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  drawHomeBank(ctx, s, sp);

  for (const lane of plan.lanes) drawLane(ctx, s, lane, sp);

  for (const coin of plan.coins) {
    if (!coin.collected) drawCoin(ctx, s, coin);
  }

  drawPlayer(ctx, s, character);
  drawParticles(ctx, s);

  const boardGrade = ctx.createLinearGradient(0, 0, W, H);
  boardGrade.addColorStop(0, 'rgba(255,255,255,.055)');
  boardGrade.addColorStop(0.45, 'rgba(255,255,255,0)');
  boardGrade.addColorStop(1, 'rgba(9,8,32,.12)');
  ctx.fillStyle = boardGrade;
  ctx.fillRect(0, 0, W, H);

  // --- HUD ---
  ctx.fillStyle = 'rgba(0,0,0,0.34)';
  ctx.fillRect(0, H - 18, W, 18);
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.font = 'bold 10px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`BANK ${s.slotsFilled}/${GOAL_SLOTS}`, 6, H - 6);
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,.58)';
  ctx.font = '900 7px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(`${plan.biome.toUpperCase()} CROSSING`, W / 2, H - 6);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.font = 'bold 10px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(`LEVEL ${plan.level}`, W - 6, H - 6);
  ctx.textAlign = 'left';
}
