'use client';

import { useEffect, useRef } from 'react';
import { RAMP_SCALE, SPEED_SCALE, type Difficulty } from '@/lib/difficulty';
import type { GameCanvasProps } from '@/lib/games';
import { animFrame, drawFrame, useSprites, type SpriteSet } from '@/lib/sprites';
import { useCanvasGame } from '@/lib/useCanvasGame';

/**
 * Sky Hopper - endless vertical climber.
 *
 * The player never presses jump: landing on anything bounces them. All they do
 * is steer, so the whole game is "where do I want to come down". The camera
 * follows upward only; dropping below the bottom edge ends the run.
 *
 * WHY SO MUCH IS EXPORTED FROM A COMPONENT FILE
 * --------------------------------------------
 * The genre's classic bug is an unclimbable gap: generation puts a platform
 * higher above the last one than a bounce can rise, and the run ends through no
 * fault of the player. Guarding against that needs the *real* physics, not a
 * hand-copied constant, so the integrator (`stepBody`), the landing test
 * (`lands`) and the generator (`createWorld` / `extendTo`) are pure, exported,
 * and free of React and canvas. `scripts/check-climber.ts` imports exactly what
 * the game runs and simulates its way from every route platform to the next.
 *
 * HOW REACHABILITY IS GUARANTEED
 * ------------------------------
 * Generation builds a "route": a chain of platforms, each placed above the last,
 * that is the guaranteed way up. Three rules make it always climbable.
 *
 *  1. Vertical - the gap is capped well under MAX_RISE, the height one bounce
 *     rises (VB^2 / 2G). No gap can ever be taller than the bounce.
 *  2. Horizontal - a tall gap leaves less airtime, so the sideways offset is
 *     capped by `dxBudget(gap)`: what a single tap can actually cover before the
 *     player falls back past that height. Wrap-around only ever makes the real
 *     distance shorter than that.
 *  3. Permanence - route platforms are never the one-use crumbling kind, so a
 *     missed hop drops the player back onto the platform they launched from and
 *     they simply try again. Crumbling platforms appear only as optional
 *     stepping stones inside a gap the route already covers on its own.
 *
 * Springs launch much higher than a normal bounce, and generation deliberately
 * never leans on that: every gap is clearable by an ordinary bounce, so a spring
 * is pure bonus and can never be a required move.
 */

/* ========================================================================== *
 * World constants and physics. Pure - the checker imports all of this.
 * ========================================================================== */

/** World width in world units. The world is a cylinder: x wraps at W. */
export const W = 160;
/** World units per displayed metre. Height score is metres climbed. */
export const METRE = 20;

/** Player collision box. `y` is the feet; y grows downward. */
export const PW = 15;
export const PH = 19;

export const PLAT_W = 34;
export const PLAT_H = 8;

export const G = 900;
/** Upward speed granted by landing on a normal platform. */
export const VB = 380;
/** Springs, which exist to skip ahead - never to make a gap reachable. */
export const SPRING_VB = 640;

export const VX_MAX = 165;
/**
 * One tap is a sustained nudge, not a single-cell hop: it adds this much
 * sideways speed, which then decays. Tapping repeatedly is how you steer hard.
 */
export const TAP_IMPULSE = 108;
/** Keyboard steering acceleration, for holding a key rather than tapping. */
export const AX = 560;
/** Sideways drag per second, applied as exp(-DRAG * dt). */
export const DRAG = 1.25;

/** Height one bounce rises: the hard ceiling on any vertical gap. */
export const MAX_RISE = (VB * VB) / (2 * G);

/**
 * Fraction of the sideways distance a single tap could cover that generation is
 * allowed to actually use. The slack absorbs a player who taps late, taps the
 * wrong way first, or arrives carrying speed away from the target.
 */
export const REACH_SAFETY = 0.72;

/** Landing tolerance: how much of the foot must be over the platform. */
export const FOOT_TRIM = 3;
/** Minimum vertical separation between any two platforms. */
export const MIN_VSEP = 16;

export const COIN_R = 5;
/** Extra clearance demanded between a coin and any platform. */
export const COIN_PAD = 2;
export const HAZ_R = 8;

/**
 * Half-width of the corridor a player travels through between two route
 * platforms. Hazards are kept out of it, so a hazard is always avoidable.
 */
export const CORRIDOR_PAD = PLAT_W / 2 + PW;

/** Route platforms before the difficulty knobs reach full strength. */
export const RAMP_PLATFORMS = 30;

export function wrapX(x: number): number {
  return ((x % W) + W) % W;
}

/** Shortest signed distance from `from` to `to` around the cylinder. */
export function dxWrap(from: number, to: number): number {
  let d = (to - from) % W;
  if (d > W / 2) d -= W;
  if (d < -W / 2) d += W;
  return d;
}

/**
 * Time from launching at `launchV` until the player is `dy` above the launch
 * point again on the way DOWN - the moment a landing can happen. NaN when `dy`
 * is simply out of reach.
 */
export function airtimeTo(dy: number, launchV = VB): number {
  const disc = launchV * launchV - 2 * G * dy;
  if (disc < 0) return NaN;
  return (launchV + Math.sqrt(disc)) / G;
}

/** Sideways distance one tap covers in time `t`, given the drag. */
export function tapReach(t: number): number {
  return (TAP_IMPULSE / DRAG) * (1 - Math.exp(-DRAG * t));
}

/**
 * The most a platform may be offset sideways when it sits `dy` above the one
 * below it. Derived from the real airtime at that gap, never guessed.
 */
export function dxBudget(dy: number): number {
  const t = airtimeTo(dy);
  if (!Number.isFinite(t)) return 0;
  return REACH_SAFETY * tapReach(t);
}

export type Body = { x: number; y: number; vx: number; vy: number };

/** Per-frame controls. `impulse` is the summed tap nudge in units/second. */
export type Ctrl = { impulse: number; left: boolean; right: boolean };

/** One integration step. The game and the checker both call exactly this. */
export function stepBody(b: Body, c: Ctrl, dt: number): void {
  b.vx += c.impulse;
  if (c.left) b.vx -= AX * dt;
  if (c.right) b.vx += AX * dt;
  b.vx *= Math.exp(-DRAG * dt);
  if (b.vx > VX_MAX) b.vx = VX_MAX;
  else if (b.vx < -VX_MAX) b.vx = -VX_MAX;
  b.vy += G * dt;
  b.x = wrapX(b.x + b.vx * dt);
  b.y += b.vy * dt;
}

/**
 * Swept one-way landing test: the feet must have crossed the surface downward
 * during this frame. Swept rather than sampled because a full-speed fall covers
 * more than a platform's thickness in a single frame at the clamped dt.
 */
export function lands(
  b: Body,
  prevFeet: number,
  surfaceX: number,
  surfaceY: number,
  footHalf: number,
): boolean {
  if (b.vy <= 0) return false;
  if (prevFeet > surfaceY + 1) return false;
  if (b.y < surfaceY) return false;
  return Math.abs(dxWrap(surfaceX, b.x)) <= footHalf;
}

/* ========================================================================== *
 * Generation
 * ========================================================================== */

export type PlatKind = 'solid' | 'crumble' | 'mover' | 'spring';

export type Platform = {
  id: number;
  kind: PlatKind;
  /** Centre of the platform's travel. Live position is `platX(p, time)`. */
  x: number;
  /** World y of the top surface. */
  y: number;
  w: number;
  /** Sideways travel half-range. 0 for everything but movers. */
  amp: number;
  /** Peak sideways speed of a mover, units/second. */
  speed: number;
  phase: number;
  /** On the guaranteed climb route. Route platforms are never one-use. */
  route: boolean;
  broken: boolean;
  breakT: number;
  /** Spring animation timer. */
  pop: number;
};

export type Coin = { id: number; x: number; y: number; taken: boolean };

export type Hazard = {
  id: number;
  kind: 'bee' | 'fly';
  x: number;
  y: number;
  amp: number;
  speed: number;
  phase: number;
};

export type World = {
  seed: number;
  difficulty: Difficulty;
  plats: Platform[];
  coins: Coin[];
  hazards: Hazard[];
  /** Highest route platform generated so far. Never pruned. */
  top: Platform;
  routeCount: number;
  nextId: number;
  rngState: number;
};

type Tune = {
  gapMin: number;
  gapMax: number;
  /** Cap on the sideways offset, before the airtime budget is applied. */
  dxMax: number;
  springChance: number;
  moverChance: number;
  moverAmp: number;
  moverSpeed: number;
  /** Chance of an optional extra platform inside a gap. */
  bonusChance: number;
  /** Chance that an optional platform is the one-use crumbling kind. */
  crumbleChance: number;
  coinPlatChance: number;
  coinFreeChance: number;
  /** Metres of climbing before hazards can appear at all. */
  hazardFromM: number;
  hazardChance: number;
  hazardAmp: number;
  hazardSpeed: number;
};

/**
 * The difficulty knobs. Easy is the default and the player is ten, so easy is
 * genuinely easy: gaps a little over half of hard's, three times the springs,
 * hardly any crumbling platforms, and no hazards for the first 400 metres.
 * Mover and hazard speeds ride the shared SPEED_SCALE on top of this, and
 * RAMP_SCALE stretches the warm-up (easy takes 60 route platforms to reach full
 * strength, normal 30, hard 21).
 */
export const TUNE: Record<Difficulty, Tune> = {
  easy: {
    gapMin: 18,
    gapMax: 30,
    dxMax: 26,
    springChance: 0.2,
    moverChance: 0.05,
    moverAmp: 8,
    moverSpeed: 16,
    bonusChance: 0.6,
    crumbleChance: 0.12,
    coinPlatChance: 0.5,
    coinFreeChance: 0.4,
    hazardFromM: 400,
    hazardChance: 0.05,
    hazardAmp: 10,
    hazardSpeed: 14,
  },
  normal: {
    gapMin: 20,
    gapMax: 40,
    dxMax: 34,
    springChance: 0.12,
    moverChance: 0.14,
    moverAmp: 12,
    moverSpeed: 24,
    bonusChance: 0.45,
    crumbleChance: 0.35,
    coinPlatChance: 0.42,
    coinFreeChance: 0.32,
    hazardFromM: 120,
    hazardChance: 0.12,
    hazardAmp: 14,
    hazardSpeed: 22,
  },
  hard: {
    gapMin: 22,
    gapMax: 50,
    dxMax: 42,
    springChance: 0.06,
    moverChance: 0.22,
    moverAmp: 16,
    moverSpeed: 32,
    bonusChance: 0.35,
    crumbleChance: 0.5,
    coinPlatChance: 0.34,
    coinFreeChance: 0.26,
    hazardFromM: 40,
    hazardChance: 0.2,
    hazardAmp: 18,
    hazardSpeed: 30,
  },
};

/** Numerical Recipes LCG. Deterministic everywhere; no Math.random anywhere. */
function rnd(w: World): number {
  w.rngState = (Math.imul(w.rngState, 1664525) + 1013904223) >>> 0;
  return w.rngState / 4294967296;
}

function makePlat(w: World, over: Partial<Platform> & { x: number; y: number }): Platform {
  return {
    id: w.nextId++,
    kind: 'solid',
    w: PLAT_W,
    amp: 0,
    speed: 0,
    phase: 0,
    route: false,
    broken: false,
    breakT: 0,
    pop: 0,
    ...over,
  };
}

/** Live sideways position of a platform at `time` seconds. */
export function platX(p: Platform, time: number): number {
  if (p.amp === 0) return p.x;
  // Angular rate chosen so the peak linear speed is exactly `speed`.
  return wrapX(p.x + p.amp * Math.sin(p.phase + (time * p.speed) / p.amp));
}

/** Closest-point test between a circle and a platform's swept rectangle. */
export function circleHitsPlat(cx: number, cy: number, r: number, p: Platform): boolean {
  const half = p.w / 2 + p.amp;
  const nx = Math.max(0, Math.abs(dxWrap(p.x, cx)) - half);
  const ny = cy < p.y ? p.y - cy : cy > p.y + PLAT_H ? cy - (p.y + PLAT_H) : 0;
  return nx * nx + ny * ny < r * r;
}

function coinClear(plats: Platform[], cx: number, cy: number): boolean {
  for (const p of plats) {
    // Nothing further away than this in y can possibly reach the coin.
    if (Math.abs(p.y - cy) > PLAT_H + COIN_R + COIN_PAD + 2) continue;
    if (circleHitsPlat(cx, cy, COIN_R + COIN_PAD, p)) return false;
  }
  return true;
}

export function createWorld(seed: number, difficulty: Difficulty): World {
  // The ground spans the whole cylinder, so the opening hop cannot be missed and
  // a brand new player has somewhere to stand while they find the controls.
  const ground: Platform = {
    id: 0,
    kind: 'solid',
    x: W / 2,
    y: 0,
    w: W,
    amp: 0,
    speed: 0,
    phase: 0,
    route: true,
    broken: false,
    breakT: 0,
    pop: 0,
  };
  return {
    seed: seed >>> 0,
    difficulty,
    plats: [ground],
    coins: [],
    hazards: [],
    top: ground,
    routeCount: 1,
    nextId: 1,
    rngState: (seed >>> 0) || 0x9e3779b9,
  };
}

/** Generates upward until the route reaches `minY` (up is negative). */
export function extendTo(w: World, minY: number): void {
  // gapMin is always positive, so this always terminates.
  while (w.top.y > minY) addRouteStep(w);
}

function addRouteStep(w: World): void {
  const t = TUNE[w.difficulty];
  const from = w.top;

  // Warm-up. The first stretch is deliberately near-unfailable: smallest gaps,
  // no movers, no crumbling platforms, no hazards.
  const rampLen = Math.max(1, Math.round(RAMP_PLATFORMS / RAMP_SCALE[w.difficulty]));
  const ramp = Math.min(1, w.routeCount / rampLen);

  const gapCap = t.gapMin + (t.gapMax - t.gapMin) * ramp;
  const gap = t.gapMin + rnd(w) * (gapCap - t.gapMin);

  // What the airtime at this gap actually affords sideways, minus the worst-case
  // wander of the platform being launched from.
  const rawBudget = Math.min(t.dxMax, dxBudget(gap)) - from.amp;

  let kind: PlatKind = 'solid';
  const roll = rnd(w);
  if (roll < t.springChance) {
    kind = 'spring';
  } else if (
    roll < t.springChance + t.moverChance * ramp &&
    // Only make it a mover if there is still room to offset it afterwards,
    // otherwise the route degenerates into a vertical stack.
    rawBudget - t.moverAmp >= 12
  ) {
    kind = 'mover';
  }

  const amp = kind === 'mover' ? t.moverAmp : 0;
  // BOTH platforms' wander is subtracted, so the bound holds for every position
  // either of them can be in - never just for their resting centres.
  const dxLimit = Math.max(0, rawBudget - amp);
  const dx = (rnd(w) * 2 - 1) * dxLimit;

  const plat = makePlat(w, {
    kind,
    x: wrapX(from.x + dx),
    y: from.y - gap,
    amp,
    speed: amp > 0 ? t.moverSpeed * SPEED_SCALE[w.difficulty] : 0,
    phase: rnd(w) * Math.PI * 2,
    route: true,
  });
  w.plats.push(plat);
  w.routeCount += 1;
  w.top = plat;

  decorate(w, from, plat, gap, ramp, t);
}

/**
 * Fills in the gap that was just closed: an optional stepping stone, coins, and
 * possibly a hazard. Everything here is optional by construction - the route is
 * already complete without any of it.
 *
 * Runs only once both platforms bounding the gap exist, which is what lets the
 * coin clearance test see every platform that could swallow a coin.
 */
function decorate(
  w: World,
  from: Platform,
  to: Platform,
  gap: number,
  ramp: number,
  t: Tune,
): void {
  const lateral = dxWrap(from.x, to.x);

  let bonus: Platform | null = null;
  if (gap >= 2 * MIN_VSEP && rnd(w) < t.bonusChance) {
    // Kept at least MIN_VSEP from both neighbours, which is why no two platforms
    // can ever overlap: every pair ends up separated in y by more than PLAT_H.
    const slack = gap / 2 - MIN_VSEP;
    const by = from.y - gap / 2 + (rnd(w) * 2 - 1) * slack;
    // Crumbling platforms live here and only here. Landing on one still gives a
    // full bounce - it just cannot be used twice - so it is a shortcut rather
    // than a trap, and never something the route depends on.
    const crumble = rnd(w) < t.crumbleChance * ramp;
    const bx = wrapX(from.x + lateral * (0.35 + rnd(w) * 0.3));
    bonus = makePlat(w, { kind: crumble ? 'crumble' : 'solid', x: bx, y: by });
    w.plats.push(bonus);
  }

  const wanted: Array<[number, number]> = [];
  // A coin sitting on the platform below, now that the one above it is placed.
  if (from.kind !== 'mover' && rnd(w) < t.coinPlatChance) {
    wanted.push([from.x, from.y - COIN_R - 4]);
  }
  if (bonus && rnd(w) < t.coinPlatChance) {
    wanted.push([bonus.x, bonus.y - COIN_R - 4]);
  }
  // A coin floating in the corridor, to reward steering along the route.
  if (rnd(w) < t.coinFreeChance) {
    const f = 0.34 + rnd(w) * 0.32;
    wanted.push([wrapX(from.x + lateral * f), from.y - gap * f]);
  }
  for (const [cx, cy] of wanted) {
    if (coinClear(w.plats, cx, cy)) {
      w.coins.push({ id: w.nextId++, x: cx, y: cy, taken: false });
    }
  }

  const heightM = -to.y / METRE;
  if (ramp >= 1 && heightM >= t.hazardFromM && rnd(w) < t.hazardChance) {
    // A hazard is only fair if it can be gone around, so it is confined to the
    // arc of the cylinder the route does NOT pass through.
    const free = W - (Math.abs(lateral) + 2 * CORRIDOR_PAD);
    const ampRoom = (free - PW - 12) / 2;
    if (ampRoom >= 4) {
      w.hazards.push({
        id: w.nextId++,
        kind: rnd(w) < 0.5 ? 'bee' : 'fly',
        // Antipode of the corridor's midpoint: as far from the route as possible.
        x: wrapX(from.x + lateral / 2 + W / 2),
        y: from.y - gap / 2,
        amp: Math.min(t.hazardAmp, ampRoom),
        speed: t.hazardSpeed * SPEED_SCALE[w.difficulty],
        phase: rnd(w) * Math.PI * 2,
      });
    }
  }
}

/** Drops everything well below the view. Never touches `top` or generation. */
export function pruneWorld(w: World, belowY: number): void {
  if (w.plats.length > 24) w.plats = w.plats.filter((p) => p.y <= belowY);
  if (w.coins.length > 24) w.coins = w.coins.filter((c) => c.y <= belowY);
  if (w.hazards.length > 12) w.hazards = w.hazards.filter((h) => h.y <= belowY);
}

/** Whole-world generation in one call, for the checker. */
export function generateWorld(seed: number, difficulty: Difficulty, metres: number): World {
  const w = createWorld(seed, difficulty);
  extendTo(w, -metres * METRE);
  return w;
}

/* ========================================================================== *
 * Presentation
 * ========================================================================== */

/** World units of height on screen. Wide screens pillarbox rather than zoom. */
const VIEW_H_TARGET = W * 1.35;
/** Metres between background changes. Cosmetic only - never a gate. */
const MILESTONE_M = 150;

type Biome = {
  name: string;
  sky: [string, string];
  bg: string;
  plat: [string, string, string];
};

const BIOMES: Biome[] = [
  {
    name: 'Meadow',
    sky: ['#8fd3ff', '#e4f4ff'],
    bg: 'background_color_hills',
    plat: ['terrain_grass_cloud_left', 'terrain_grass_cloud_middle', 'terrain_grass_cloud_right'],
  },
  {
    name: 'Dunes',
    sky: ['#f3c078', '#fff0d6'],
    bg: 'background_color_desert',
    plat: ['terrain_sand_cloud_left', 'terrain_sand_cloud_middle', 'terrain_sand_cloud_right'],
  },
  {
    name: 'Snowline',
    sky: ['#a8c8e4', '#eef6fd'],
    bg: 'background_color_trees',
    plat: ['terrain_snow_cloud_left', 'terrain_snow_cloud_middle', 'terrain_snow_cloud_right'],
  },
  {
    name: 'Crags',
    sky: ['#7f93ab', '#d3dfec'],
    bg: 'background_color_mushrooms',
    plat: ['terrain_stone_cloud_left', 'terrain_stone_cloud_middle', 'terrain_stone_cloud_right'],
  },
  {
    name: 'Nightfall',
    sky: ['#3d2f74', '#9186cd'],
    bg: 'background_color_mushrooms',
    plat: [
      'terrain_purple_cloud_left',
      'terrain_purple_cloud_middle',
      'terrain_purple_cloud_right',
    ],
  },
  {
    name: 'Outer sky',
    sky: ['#141433', '#454a7d'],
    bg: 'background_color_hills',
    plat: ['terrain_dirt_cloud_left', 'terrain_dirt_cloud_middle', 'terrain_dirt_cloud_right'],
  },
];

type State = {
  world: World;
  p: Body;
  facing: 1 | -1;
  /** World y of the top of the view. Only ever decreases during play. */
  camY: number;
  camInit: boolean;
  time: number;
  /** Highest point reached, for the height score. */
  bestY: number;
  scoredM: number;
  band: number;
  /** One rescue nudge per bounce, spent by a flick up. */
  flap: boolean;
  flapFx: number;
  squash: number;
  invuln: number;
};

function freshState(seed: number, difficulty: Difficulty): State {
  return {
    world: createWorld(seed, difficulty),
    // Starts a hair above the ground, falling, so frame one is a bounce.
    p: { x: W / 2, y: -1, vx: 0, vy: 12 },
    facing: 1,
    camY: 0,
    camInit: false,
    time: 0,
    bestY: 0,
    scoredM: 0,
    band: 0,
    flap: false,
    flapFx: 0,
    squash: 0,
    invuln: 0,
  };
}

export default function Climber({
  paused,
  input,
  api,
  restartToken,
  difficulty,
  controlsInset,
}: GameCanvasProps) {
  const stateRef = useRef<State>(freshState(1, difficulty));
  const sprites = useSprites();
  const spritesRef = useRef<SpriteSet | null>(null);
  useEffect(() => {
    spritesRef.current = sprites;
  }, [sprites]);

  // A fresh run gets a fresh seed. Generation itself stays pure and seeded - it
  // is only the choice of seed that varies between runs.
  useEffect(() => {
    const seed = (Date.now() ^ Math.imul(restartToken + 1, 2654435761)) >>> 0;
    stateRef.current = freshState(seed, difficulty);
  }, [restartToken, difficulty]);

  const { canvasRef } = useCanvasGame({
    active: !paused,
    step: (ctx, dt, cw, ch) => {
      const s = stateRef.current;
      // Thumb controls own the bottom band; gameplay stays above it.
      const ph = Math.max(1, ch - controlsInset);
      const scale = Math.min(cw / W, ph / VIEW_H_TARGET);
      const viewH = ph / scale;
      s.time += dt;

      if (!s.camInit) {
        // Open with the ground just above the bottom edge.
        s.camY = Math.min(PLAT_H + 14 - viewH, s.p.y - viewH * 0.62);
        s.camInit = true;
      }

      // Keep a full screen of world generated above the view.
      extendTo(s.world, s.camY - viewH);

      // --- steering -------------------------------------------------------
      // Every queued tap counts, so a fast double tap steers twice as hard.
      let impulse = 0;
      for (let tap = input.consumeTap(); tap !== null; tap = input.consumeTap()) {
        if (tap === 'left') impulse -= TAP_IMPULSE;
        else if (tap === 'right') impulse += TAP_IMPULSE;
      }
      // Optional flick-up rescue: one small extra lift per bounce. It can only
      // ever help, so it cannot invalidate anything generation guarantees.
      if (input.consumeJump() && s.flap) {
        s.p.vy = Math.min(s.p.vy, -VB * 0.45);
        s.flap = false;
        s.flapFx = 0.3;
      }

      const prevFeet = s.p.y;
      stepBody(s.p, { impulse, left: input.held.left, right: input.held.right }, dt);

      if (impulse < 0) s.facing = -1;
      else if (impulse > 0) s.facing = 1;
      else if (Math.abs(s.p.vx) > 10) s.facing = s.p.vx < 0 ? -1 : 1;

      // --- landing --------------------------------------------------------
      // The feet sweep downward, so of everything crossed this frame the highest
      // surface (smallest y) is the one actually hit.
      let hit: Platform | null = null;
      for (const p of s.world.plats) {
        if (p.broken) continue;
        if (Math.abs(p.y - s.p.y) > 90) continue;
        const footHalf = p.w / 2 + PW / 2 - FOOT_TRIM;
        if (!lands(s.p, prevFeet, platX(p, s.time), p.y, footHalf)) continue;
        if (!hit || p.y < hit.y) hit = p;
      }
      if (hit) {
        s.p.y = hit.y;
        s.p.vy = hit.kind === 'spring' ? -SPRING_VB : -VB;
        s.flap = true;
        s.squash = 0.16;
        if (hit.kind === 'spring') hit.pop = 0.3;
        if (hit.kind === 'crumble') {
          hit.broken = true;
          hit.breakT = 0;
        }
      }

      for (const p of s.world.plats) {
        if (p.pop > 0) p.pop -= dt;
        if (p.broken) p.breakT += dt;
      }
      if (s.squash > 0) s.squash -= dt;
      if (s.flapFx > 0) s.flapFx -= dt;

      // --- coins ----------------------------------------------------------
      const midY = s.p.y - PH / 2;
      for (const c of s.world.coins) {
        if (c.taken) continue;
        if (Math.abs(c.y - midY) > COIN_R + PH / 2) continue;
        if (Math.abs(dxWrap(c.x, s.p.x)) > COIN_R + PW / 2) continue;
        c.taken = true;
        api.addScore(10);
      }

      // --- hazards --------------------------------------------------------
      if (s.invuln > 0) {
        s.invuln -= dt;
      } else {
        for (const h of s.world.hazards) {
          if (Math.abs(h.y - midY) > HAZ_R + PH / 2) continue;
          const hx = wrapX(h.x + h.amp * Math.sin(h.phase + (s.time * h.speed) / h.amp));
          if (Math.abs(dxWrap(hx, s.p.x)) > HAZ_R + PW / 2) continue;
          respawn(s, viewH);
          api.died('A bug got you');
          break;
        }
      }

      // --- camera, score, falling -----------------------------------------
      const target = s.p.y - viewH * 0.62;
      if (target < s.camY) s.camY = target;
      if (s.p.y < s.bestY) s.bestY = s.p.y;

      const metres = Math.floor(-s.bestY / METRE);
      if (metres > s.scoredM) {
        api.addScore(metres - s.scoredM);
        s.scoredM = metres;
      }
      const band = Math.floor(metres / MILESTONE_M);
      if (band > s.band) {
        s.band = band;
        api.setStatus(`${band * MILESTONE_M} m - ${BIOMES[band % BIOMES.length].name}`);
      }

      if (s.p.y > s.camY + viewH) {
        // Respawn BEFORE telling the shell: with a free pass in hand `died`
        // returns without pausing, and the very next frame keeps running.
        respawn(s, viewH);
        api.died('You fell');
      }

      pruneWorld(s.world, s.camY + viewH + 260);
      draw(ctx, s, spritesRef.current, cw, ch, ph, scale, viewH);
    },
  });

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />;
}

/**
 * Puts the player back on a permanent platform near where they were, not on the
 * ground. Losing a whole climb to one awkward layout is how a kid decides the
 * game is unfair and stops playing - and the questions are the point here, so
 * the run has to stay alive.
 *
 * The route's gaps are capped far below the height of the view, so there are
 * always several route platforms on screen to choose from.
 */
function respawn(s: State, viewH: number): void {
  const wantY = s.camY + viewH * 0.6;
  let best: Platform | null = null;
  for (const p of s.world.plats) {
    if (!p.route || p.broken) continue;
    if (p.y < s.camY + viewH * 0.12 || p.y > s.camY + viewH * 0.95) continue;
    if (!best || Math.abs(p.y - wantY) < Math.abs(best.y - wantY)) best = p;
  }
  if (!best) {
    // Belt and braces: should be unreachable, because the route is denser than
    // the view is tall. Take the nearest route platform anywhere and pan to it.
    for (const p of s.world.plats) {
      if (!p.route || p.broken) continue;
      if (!best || Math.abs(p.y - wantY) < Math.abs(best.y - wantY)) best = p;
    }
    if (!best) return;
    s.camY = best.y - viewH * 0.6;
  }
  s.p.x = platX(best, s.time);
  s.p.y = best.y - 2;
  s.p.vx = 0;
  s.p.vy = 12;
  s.flap = false;
  s.invuln = 1.6;
}

/* ========================================================================== *
 * Drawing
 * ========================================================================== */

/**
 * Every x position the cylinder makes visible for one object: the object itself
 * plus its ghost across the seam, so something halfway off the left edge is
 * already halfway on at the right.
 */
function seamXs(x: number, half: number): number[] {
  if (x - half < 0) return [x, x + W];
  if (x + half > W) return [x, x - W];
  return [x];
}

function biomeAt(metres: number): Biome {
  return BIOMES[Math.floor(Math.max(0, metres) / MILESTONE_M) % BIOMES.length];
}

function draw(
  ctx: CanvasRenderingContext2D,
  s: State,
  sp: SpriteSet | null,
  cw: number,
  ch: number,
  ph: number,
  scale: number,
  viewH: number,
) {
  const metres = Math.floor(-s.bestY / METRE);
  const biome = biomeAt(metres);

  const sky = ctx.createLinearGradient(0, 0, 0, ph);
  sky.addColorStop(0, biome.sky[0]);
  sky.addColorStop(1, biome.sky[1]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, cw, ch);

  const colW = W * scale;
  const ox = (cw - colW) / 2;

  ctx.save();
  ctx.translate(ox, 0);
  ctx.beginPath();
  ctx.rect(0, 0, colW, ph);
  ctx.clip();
  ctx.scale(scale, scale);
  ctx.translate(0, -s.camY);
  drawWorld(ctx, s, sp, biome, viewH);
  ctx.restore();

  // Pillarbox on a wide screen. The play column is a fixed number of world units
  // wide so the game is identical in portrait and landscape; the leftover sides
  // get darkened rather than left as a bright unreachable margin.
  if (ox > 0.5) {
    ctx.fillStyle = 'rgba(8,10,26,0.55)';
    ctx.fillRect(0, 0, ox, ph);
    ctx.fillRect(cw - ox, 0, ox, ph);
  }
  if (ph < ch - 0.5) {
    ctx.fillStyle = 'rgba(8,10,26,0.75)';
    ctx.fillRect(0, ph, cw, ch - ph);
  }

  // --- altitude readout ---
  ctx.fillStyle = 'rgba(10,14,32,0.34)';
  ctx.fillRect(ox + 6, 6, 76, 32);
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.font = 'bold 17px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`${metres} m`, ox + 12, 26);
  ctx.font = 'bold 9px ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText(biome.name.toUpperCase(), ox + 12, 35);
}

function drawWorld(
  ctx: CanvasRenderingContext2D,
  s: State,
  sp: SpriteSet | null,
  biome: Biome,
  viewH: number,
) {
  const top = s.camY;
  const bottom = s.camY + viewH;

  if (!sp) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.font = 'bold 9px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('loading art...', W / 2, top + viewH / 2);
    ctx.textAlign = 'left';
  }

  // --- parallax backdrop: drifts at a third of the climb ---
  if (sp) {
    const tile = 128;
    const par = s.camY * 0.34;
    ctx.globalAlpha = 0.28;
    for (let y = Math.floor((top - par) / tile) * tile; y < bottom - par + tile; y += tile) {
      for (let x = 0; x < W; x += tile) {
        drawFrame(ctx, sp.backgrounds, biome.bg, x, y + par, tile, tile);
      }
    }
    ctx.globalAlpha = 0.2;
    const cpar = s.camY * 0.55;
    for (let y = Math.floor((top - cpar) / 96) * 96; y < bottom - cpar + 96; y += 96) {
      const offset = (Math.abs(Math.round(y / 96)) % 2) * 68;
      drawFrame(ctx, sp.backgrounds, 'background_clouds', offset, y + cpar, 96, 96);
    }
    ctx.globalAlpha = 1;
  }

  // --- platforms ---
  for (const p of s.world.plats) {
    if (p.y < top - 40 || p.y > bottom + 40) continue;
    const live = platX(p, s.time);
    // A broken platform tumbles away rather than vanishing, so the player can
    // see what happened to it.
    const fallY = p.broken ? p.breakT * p.breakT * 420 : 0;
    const alpha = p.broken ? Math.max(0, 1 - p.breakT * 1.6) : 1;
    if (alpha <= 0) continue;
    ctx.globalAlpha = alpha;
    for (const x of seamXs(live, p.w / 2 + 4)) {
      drawPlatform(ctx, sp, p, x, p.y + fallY, biome);
    }
    ctx.globalAlpha = 1;
  }

  // --- coins ---
  if (sp) {
    const frame = animFrame(['coin_gold', 'coin_gold', 'coin_gold_side', 'coin_gold'], s.time, 7);
    const d = COIN_R * 2 + 3;
    for (const c of s.world.coins) {
      if (c.taken || c.y < top - 20 || c.y > bottom + 20) continue;
      for (const x of seamXs(c.x, COIN_R + 2)) {
        drawFrame(ctx, sp.tiles, frame, x - d / 2, c.y - d / 2, d, d);
      }
    }
  }

  // --- hazards ---
  for (const h of s.world.hazards) {
    if (h.y < top - 20 || h.y > bottom + 20) continue;
    const hx = wrapX(h.x + h.amp * Math.sin(h.phase + (s.time * h.speed) / h.amp));
    const names = h.kind === 'bee' ? ['bee_a', 'bee_b'] : ['fly_a', 'fly_b'];
    const d = (HAZ_R + 3) * 2;
    for (const x of seamXs(hx, HAZ_R + 3)) {
      if (sp) {
        drawFrame(ctx, sp.enemies, animFrame(names, s.time, 12), x - d / 2, h.y - d / 2, d, d);
      } else {
        ctx.fillStyle = '#ff5d5d';
        ctx.beginPath();
        ctx.arc(x, h.y, HAZ_R, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // --- player ---
  const squash = s.squash > 0 ? s.squash / 0.16 : 0;
  const bw = 26 * (1 + squash * 0.2);
  const bh = 26 * (1 - squash * 0.18);
  const name = s.p.vy < 0
    ? 'character_green_jump'
    : animFrame(['character_green_walk_a', 'character_green_walk_b'], s.time, 9);
  // Blink through the post-respawn grace period so it reads as temporary.
  const hidden = s.invuln > 0 && Math.floor(s.time * 12) % 2 === 0;
  if (!hidden) {
    for (const x of seamXs(s.p.x, bw / 2 + 2)) {
      if (s.flapFx > 0) {
        ctx.fillStyle = `rgba(255,255,255,${s.flapFx})`;
        ctx.beginPath();
        ctx.ellipse(x, s.p.y + 2, bw * 0.55, 4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (sp) {
        drawFrame(ctx, sp.characters, name, x - bw / 2, s.p.y - bh + 3, bw, bh, s.facing < 0);
      } else {
        ctx.fillStyle = '#7ec8ff';
        ctx.fillRect(x - PW / 2, s.p.y - PH, PW, PH);
      }
    }
  }
}

function drawPlatform(
  ctx: CanvasRenderingContext2D,
  sp: SpriteSet | null,
  p: Platform,
  cx: number,
  y: number,
  biome: Biome,
) {
  const half = p.w / 2;
  if (!sp) {
    ctx.fillStyle = p.kind === 'crumble' ? '#a9763f' : '#4f9d5d';
    ctx.fillRect(cx - half, y, p.w, PLAT_H);
    return;
  }

  if (p.kind === 'crumble') {
    // Planks read as "this will not hold", which is exactly the message.
    drawFrame(ctx, sp.tiles, 'block_planks', cx - half, y - 1, p.w, PLAT_H + 4);
    return;
  }

  // Three-slice from the cloud terrain tiles. The art carries a little fluff
  // above its surface, so it is nudged up to line that surface up with `y`.
  const seg = p.w / 3;
  const drawH = 15;
  const top = y - 3;
  drawFrame(ctx, sp.tiles, biome.plat[0], cx - half, top, seg, drawH);
  drawFrame(ctx, sp.tiles, biome.plat[1], cx - half + seg, top, seg, drawH);
  drawFrame(ctx, sp.tiles, biome.plat[2], cx - half + seg * 2, top, seg, drawH);

  if (p.kind === 'spring') {
    const sz = 13;
    drawFrame(ctx, sp.tiles, p.pop > 0 ? 'spring_out' : 'spring', cx - sz / 2, y - sz + 1, sz, sz);
  } else if (p.kind === 'mover') {
    // Little chevrons, so a moving platform is legible before it moves.
    ctx.fillStyle = 'rgba(20,30,60,0.45)';
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + dir * (half - 3), y + 4);
      ctx.lineTo(cx + dir * (half - 8), y + 1.5);
      ctx.lineTo(cx + dir * (half - 8), y + 6.5);
      ctx.closePath();
      ctx.fill();
    }
  }
}
