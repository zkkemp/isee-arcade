'use client';

import { useEffect, useRef } from 'react';
import { RAMP_SCALE, SPEED_SCALE, type Difficulty } from '@/lib/difficulty';
import type { GameCanvasProps } from '@/lib/games';
import { playSound, unlockAudio } from '@/lib/sound';
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
 * (`lands`), the landing tolerance (`footHalf`) and the generator
 * (`createWorld` / `extendTo`) are pure, exported, and free of React and canvas.
 * `scripts/check-climber.ts` imports exactly what the game runs and simulates its
 * way from every platform to the next one up.
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
 *     distance shorter than that. The budget is derived from TAP reach, not from
 *     holding a key, because the touch controls only produce taps.
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
/** Height a spring rises. Only ever a bonus, never required. */
export const SPRING_RISE = (SPRING_VB * SPRING_VB) / (2 * G);
/** Seconds from a normal bounce until the feet are back at launch height. */
export const HANG_TIME = (2 * VB) / G;

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
 * Sideways room the player's own body needs along the path between two route
 * platforms. Hazards must clear this plus their own radius, so a hazard can never
 * touch a player travelling the route.
 */
export const CORRIDOR_PAD = PW / 2;

/**
 * Extra sideways margin a hazard must leave beyond the exact route path: one whole
 * player width of clear air.
 *
 * Clearing the exact path is not enough. A player who arrives at full sideways
 * speed sails past where the route wanted them, and with a hazard sitting exactly
 * on the boundary every option led into it - the simulated sweep found three such
 * spots on hard. This is what buys them somewhere to be.
 */
export const OVERSHOOT_PAD = PW;

/** Route platforms before the difficulty knobs reach full strength. */
export const RAMP_PLATFORMS = 30;

/**
 * Smallest number of world units of height the view will ever show. The old
 * layout fixed the view height instead, which pillarboxed away more than half
 * the width of an iPad in landscape; now the play column fills the canvas width
 * and this only kicks in on a screen so wide that filling it would zoom in past
 * legibility. `viewH >= VIEW_H_MIN` always holds, which is what makes the
 * generation headroom below a worst case rather than a guess.
 */
export const VIEW_H_MIN = W * 0.85;
/** Fraction of the view height that sits above the player. */
export const CAM_ANCHOR = 0.62;
/** Slack on the generation horizon, for the frame between landing and rising. */
export const GEN_PAD = 40;

/**
 * How high above the view generation must run. Derived from the SPRING rise, so
 * the fastest launch in the game cannot outrun the generator: retune SPRING_VB
 * and the horizon moves with it.
 */
export function genHorizon(camY: number, viewH: number): number {
  return camY - viewH - SPRING_RISE - GEN_PAD;
}

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
  /** Extra landing tolerance, in world units. Easy is deliberately magnetic. */
  footPad: number;
  /** Shrinks the hazard hitbox. Negative is kinder to the player. */
  hazPad: number;
  /** Strength of the one-per-bounce flick-up rescue, as a fraction of VB. */
  flapBoost: number;
  /** Seconds of grace after a respawn. */
  graceS: number;
};

/**
 * The difficulty knobs. Easy is the DEFAULT and the youngest player is about
 * five, so easy is genuinely easy rather than nominally easy: gaps barely over
 * half of hard's, five times the springs, no crumbling platforms at all, a
 * magnetic landing box, a stronger rescue flick, and no hazards for the first
 * 600 metres. Mover and hazard speeds ride the shared SPEED_SCALE on top of
 * this, and RAMP_SCALE stretches the warm-up (easy takes 60 route platforms to
 * reach full strength, normal 30, hard 21).
 */
export const TUNE: Record<Difficulty, Tune> = {
  easy: {
    gapMin: 16,
    gapMax: 28,
    dxMax: 22,
    springChance: 0.3,
    moverChance: 0.04,
    moverAmp: 7,
    moverSpeed: 14,
    bonusChance: 0.6,
    crumbleChance: 0.06,
    coinPlatChance: 0.55,
    coinFreeChance: 0.45,
    hazardFromM: 600,
    hazardChance: 0.04,
    hazardAmp: 10,
    hazardSpeed: 12,
    footPad: 5,
    hazPad: -3,
    flapBoost: 0.6,
    graceS: 2.2,
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
    footPad: 0,
    hazPad: 0,
    flapBoost: 0.45,
    graceS: 1.6,
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
    footPad: 0,
    hazPad: 0,
    flapBoost: 0.35,
    graceS: 1.4,
  },
};

/**
 * Landing tolerance for one platform. Exported because reachability is only
 * proven if the checker measures landings with the same box the game does.
 */
export function footHalf(p: Platform, d: Difficulty): number {
  return p.w / 2 + PW / 2 - FOOT_TRIM + TUNE[d].footPad;
}

/** Hazard contact radius. Easy gets a smaller one, in the player's favour. */
export function hazardR(d: Difficulty): number {
  return Math.max(3, HAZ_R + TUNE[d].hazPad);
}

/** How close the player's middle must get to a coin to collect it. */
export function coinReach(d: Difficulty): number {
  return COIN_R + PW / 2 + TUNE[d].footPad;
}

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

  // This step's flight band only becomes knowable now that both its platforms
  // exist, and it reaches a little BELOW `from` - so a hazard placed during an
  // earlier gap can turn out to sit in it. Dropping such a hazard is the honest
  // fix; fairness is worth more than hazard count.
  dropHazardsInBand(w, from, plat);

  decorate(w, from, plat, gap, ramp, t);
}

/** Removes any hazard that reaches into the flight path of the step `a` -> `b`. */
function dropHazardsInBand(w: World, a: Platform, b: Platform): void {
  if (w.hazards.length === 0) return;
  const d = w.difficulty;
  const clear = CORRIDOR_PAD + OVERSHOOT_PAD + hazardR(d);
  const span = bounceSpan(a, b, d);
  const lateral = dxWrap(a.x, b.x);
  const mid = wrapX(a.x + lateral / 2);
  const half = Math.abs(lateral) / 2 + a.amp + b.amp;
  w.hazards = w.hazards.filter((h) => {
    if (h.y > span.low || h.y < span.high) return true;
    return Math.abs(dxWrap(mid, h.x)) - h.amp - half - clear >= 0;
  });
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
    const hy = from.y - gap / 2;
    // Antipode of this corridor's midpoint first, then a couple of fallbacks: as
    // far from the route as the cylinder allows.
    const antipode = from.x + lateral / 2 + W / 2;
    const kind: Hazard['kind'] = rnd(w) < 0.5 ? 'bee' : 'fly';
    const phase = rnd(w) * Math.PI * 2;
    for (const nudge of [0, W / 8, -W / 8]) {
      const hx = wrapX(antipode + nudge);
      const room = hazardRoom(w, hx, hy, w.difficulty);
      if (room < 4) continue;
      w.hazards.push({
        id: w.nextId++,
        kind,
        x: hx,
        y: hy,
        amp: Math.min(t.hazardAmp, room),
        speed: t.hazardSpeed * SPEED_SCALE[w.difficulty],
        phase,
      });
      break;
    }
  }
}

/**
 * Sideways room a hazard has at (hx, hy) before it would reach the path the player
 * takes on ANY route step whose bounce passes that height.
 *
 * Keeping a hazard out of its OWN corridor is not enough, and assuming otherwise
 * was a real bug the checker caught: a bounce rises MAX_RISE whether the player
 * wants it to or not, so a hazard two or three route steps up is still directly in
 * the flight path of someone launching from below. Every step whose bounce arc
 * spans this height therefore gets a say. A negative result means the spot cannot
 * be used at all.
 *
 * Only steps at or below `hy` matter, and only within one bounce of it, so every
 * platform this consults has already been generated.
 */
function hazardRoom(w: World, hx: number, hy: number, d: Difficulty): number {
  const clear = CORRIDOR_PAD + OVERSHOOT_PAD + hazardR(d);
  const route: Platform[] = [];
  for (const p of w.plats) if (p.route) route.push(p);

  let room = Infinity;
  for (let i = 0; i + 1 < route.length; i += 1) {
    const a = route[i];
    const b = route[i + 1];
    const span = bounceSpan(a, b, d);
    if (hy > span.low || hy < span.high) continue;
    // A single tap drifts the player monotonically from a to b, so the whole
    // flight stays between them - plus whatever either platform wanders.
    const lateral = dxWrap(a.x, b.x);
    const half = Math.abs(lateral) / 2 + a.amp + b.amp;
    room = Math.min(room, Math.abs(dxWrap(wrapX(a.x + lateral / 2), hx)) - half - clear);
  }
  return room;
}

/**
 * Vertical band over which one route step's flight path has to stay clear of
 * hazards, as `low` (largest y, the bottom) and `high` (smallest y, the top).
 *
 * Three separate things widen it beyond the obvious "one bounce above `a`", and
 * every one of them was a dead end the simulated sweep caught:
 *  - a bounce rises the full MAX_RISE whether the player aims that high or not;
 *  - an optional platform inside the gap is a launch pad too, and it sits up to a
 *    whole gap higher than `a`, so its bounce tops out that much higher again;
 *  - a hazard is a body, not a point, so its hitbox reaches beyond its centre.
 *
 * Exported so the checker can assert against the same band without importing the
 * placement logic that uses it.
 */
export function bounceSpan(a: Platform, b: Platform, d: Difficulty): { low: number; high: number } {
  const reach = hazardR(d) + PH / 2;
  const gap = a.y - b.y;
  return { low: a.y + reach, high: a.y - MAX_RISE - gap - reach };
}

/** Live sideways position of a hazard at `time` seconds. */
export function hazardX(h: Hazard, time: number): number {
  return wrapX(h.x + h.amp * Math.sin(h.phase + (time * h.speed) / h.amp));
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

const TAU = Math.PI * 2;

/** Metres per altitude band. A band change is the climber's "level cleared". */
const BIOME_M = 200;
/** Fraction of a band spent cross-fading into the next one. */
const XFADE = 0.42;

const SQUASH_T = 0.18;
const STRETCH_T = 0.24;
/** Fall speed at which the player starts leaving motion streaks. */
const STREAK_VY = 320;

type Rgb = [number, number, number];

function rgbOf(h: string): Rgb {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * The blended sky as two endpoint colours. Sampling it is what lets an opaque
 * backdrop be feathered into the sky at any height without leaving a tone step.
 */
type Sky = { top: Rgb; bot: Rgb };

function mixedSky(mix: Mix): Sky {
  const k = 1 - mix.dark;
  const at = (a: Rgb, b: Rgb): Rgb => [
    lerp(a[0], b[0], mix.t) * k,
    lerp(a[1], b[1], mix.t) * k,
    lerp(a[2], b[2], mix.t) * k,
  ];
  return { top: at(mix.a.skyTop, mix.b.skyTop), bot: at(mix.a.skyBot, mix.b.skyBot) };
}

/** The sky's own colour at fraction `f` down the canvas, at a given alpha. */
function skyCss(sky: Sky, f: number, alpha = 1): string {
  const g = Math.max(0, Math.min(1, f));
  const r = Math.round(lerp(sky.top[0], sky.bot[0], g));
  const gr = Math.round(lerp(sky.top[1], sky.bot[1], g));
  const b = Math.round(lerp(sky.top[2], sky.bot[2], g));
  return alpha >= 1 ? `rgb(${r},${gr},${b})` : `rgba(${r},${gr},${b},${alpha})`;
}

/** Deterministic 0..1 from an integer. Low-discrepancy, so it looks scattered. */
function frac(i: number, k: number): number {
  const v = i * k;
  return v - Math.floor(v);
}

type Biome = {
  name: string;
  skyTop: Rgb;
  skyBot: Rgb;
  /**
   * Bottom-anchored horizon art, or '' once there is no ground left to see.
   * Drawn once rather than tiled, so it can never show a repeat seam.
   */
  horizon: string;
  /**
   * How cloudy this altitude is, 0..1. Drives the two parallax cloud layers, which
   * thin out as the stars come in - so the climb reads grass, then cloud, then
   * empty high air, then space.
   */
  clouds: number;
  plat: [string, string, string];
  /** Particle and glow colour. */
  accent: string;
  /** 0..1 star field strength. */
  stars: number;
};

/**
 * The altitude ladder: meadow, treeline, cloudbank, thin air, aurora, space.
 * Adjacent entries CROSS-FADE (sky colour, parallax layers and even the platform
 * art) across the top of each band, so the world visibly becomes the next place
 * instead of snapping to a different flat colour at a threshold.
 *
 * The last entry is terminal and simply deepens forever, because coming back
 * round to a grass meadow at 3000 metres would undo the whole sense of height.
 */
const BIOMES: Biome[] = [
  {
    name: 'Meadow',
    skyTop: rgbOf('#6fc3f2'),
    skyBot: rgbOf('#dff4ff'),
    horizon: 'background_fade_hills',
    clouds: 0.55,
    plat: ['terrain_grass_cloud_left', 'terrain_grass_cloud_middle', 'terrain_grass_cloud_right'],
    accent: '#c8f08a',
    stars: 0,
  },
  {
    name: 'Treeline',
    skyTop: rgbOf('#63c8d8'),
    skyBot: rgbOf('#e6f8ec'),
    horizon: 'background_fade_trees',
    clouds: 0.8,
    plat: ['terrain_grass_cloud_left', 'terrain_grass_cloud_middle', 'terrain_grass_cloud_right'],
    accent: '#a8e8c0',
    stars: 0,
  },
  {
    name: 'Cloudbank',
    skyTop: rgbOf('#8ec9f7'),
    skyBot: rgbOf('#fbfdff'),
    horizon: '',
    clouds: 1,
    plat: ['terrain_snow_cloud_left', 'terrain_snow_cloud_middle', 'terrain_snow_cloud_right'],
    accent: '#ffffff',
    stars: 0.08,
  },
  {
    name: 'Thin air',
    skyTop: rgbOf('#2f66b8'),
    skyBot: rgbOf('#bcd8f2'),
    horizon: '',
    clouds: 0.45,
    plat: ['terrain_stone_cloud_left', 'terrain_stone_cloud_middle', 'terrain_stone_cloud_right'],
    accent: '#cfe4ff',
    stars: 0.42,
  },
  {
    name: 'Aurora',
    skyTop: rgbOf('#231a5c'),
    skyBot: rgbOf('#6f56b8'),
    horizon: '',
    clouds: 0.12,
    plat: [
      'terrain_purple_cloud_left',
      'terrain_purple_cloud_middle',
      'terrain_purple_cloud_right',
    ],
    accent: '#c9a6ff',
    stars: 0.8,
  },
  {
    name: 'Deep space',
    skyTop: rgbOf('#05061a'),
    skyBot: rgbOf('#1d1b44'),
    horizon: '',
    clouds: 0,
    plat: ['terrain_dirt_cloud_left', 'terrain_dirt_cloud_middle', 'terrain_dirt_cloud_right'],
    accent: '#8fd8ff',
    stars: 1,
  },
];

type Mix = { a: Biome; b: Biome; t: number; dark: number; stars: number; clouds: number };

/**
 * Which two biomes are on screen and how far between them we are. The blend runs
 * over the TOP of each band, so most of a band looks settled and the change
 * happens as a visible transition rather than a jump cut.
 */
function biomeMix(metres: number): Mix {
  const f = Math.max(0, metres) / BIOME_M;
  const last = BIOMES.length - 1;
  const i = Math.min(last, Math.floor(f));
  const j = Math.min(last, i + 1);
  const local = f - Math.floor(f);
  const t = i === j ? 0 : Math.max(0, (local - (1 - XFADE)) / XFADE);
  // Past the top band there is nowhere further to go, so space just gets deeper.
  const beyond = Math.max(0, f - last);
  return {
    a: BIOMES[i],
    b: BIOMES[j],
    t,
    dark: Math.min(0.45, beyond * 0.12),
    stars: Math.min(1, lerp(BIOMES[i].stars, BIOMES[j].stars, t) + beyond * 0.05),
    clouds: Math.max(0, lerp(BIOMES[i].clouds, BIOMES[j].clouds, t) - beyond * 0.1),
  };
}

function biomeAt(metres: number): Biome {
  return BIOMES[Math.min(BIOMES.length - 1, Math.floor(Math.max(0, metres) / BIOME_M))];
}

/** Bounce dust, coin sparks, break debris. Presentation only. */
type Dust = { x: number; y: number; vx: number; vy: number; life: number; max: number; r: number; c: string };
/** Floating score text. */
type Pop = { x: number; y: number; life: number; text: string };
/** One frame of the high-speed motion trail. */
type Ghost = { x: number; y: number; life: number; rising: boolean };

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
  stretch: number;
  invuln: number;
  dust: Dust[];
  pops: Pop[];
  ghosts: Ghost[];
  /** Screen shake magnitude, in world units. Decays. */
  shake: number;
  /** White flash strength, 0..1. Decays. */
  flash: number;
  /** Expanding impact ring: world position plus age. */
  ringT: number;
  ringX: number;
  ringY: number;
  /** Altitude milestone flourish timer and its caption. */
  flourish: number;
  flourishText: string;
  /** Coins collected without falling, so a streak rises in pitch. */
  combo: number;
  comboT: number;
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
    stretch: 0,
    invuln: 0,
    dust: [],
    pops: [],
    ghosts: [],
    shake: 0,
    flash: 0,
    ringT: 99,
    ringX: 0,
    ringY: 0,
    flourish: 0,
    flourishText: '',
    combo: 0,
    comboT: 0,
  };
}

function puff(s: State, x: number, y: number, n: number, speed: number, colour: string): void {
  for (let i = 0; i < n; i += 1) {
    // Fanned sideways and slightly up: dust kicked out from under the feet.
    const a = Math.PI + (i / Math.max(1, n - 1)) * Math.PI;
    const v = speed * (0.55 + Math.random() * 0.7);
    s.dust.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v * 0.5 - speed * 0.25,
      life: 0.4 + Math.random() * 0.25,
      max: 0.65,
      r: 1 + Math.random() * 1.8,
      c: colour,
    });
  }
  if (s.dust.length > 120) s.dust.splice(0, s.dust.length - 120);
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

  // The step closure is captured per frame, but the inset can change on rotation,
  // so read it through a ref updated after commit.
  const insetRef = useRef(controlsInset);
  useEffect(() => {
    insetRef.current = controlsInset;
  }, [controlsInset]);

  const { canvasRef } = useCanvasGame({
    active: !paused,
    step: (ctx, dt, cw, ch) => {
      const s = stateRef.current;
      const t = TUNE[difficulty];
      // Thumb controls own the bottom band, when there is one; gameplay stays
      // above it. Everything else is laid out from the live canvas size.
      const ph = Math.max(1, ch - insetRef.current);
      // Fill the canvas WIDTH with the play column. Only a screen wide enough
      // that filling it would zoom past VIEW_H_MIN pillarboxes at all, and even
      // then the sides get live scenery rather than a dead bar.
      const scale = Math.min(cw / W, ph / VIEW_H_MIN);
      const viewH = ph / scale;
      s.time += dt;

      if (!s.camInit) {
        // Open with the ground just above the bottom edge.
        s.camY = Math.min(PLAT_H + 14 - viewH, s.p.y - viewH * CAM_ANCHOR);
        s.camInit = true;
      }

      // Keep enough world generated above the view that even a spring cannot
      // outrun the generator.
      extendTo(s.world, genHorizon(s.camY, viewH));

      // --- steering -------------------------------------------------------
      // Every queued tap counts, so a fast double tap steers twice as hard.
      let impulse = 0;
      for (let tap = input.consumeTap(); tap !== null; tap = input.consumeTap()) {
        // The shell unlocks audio on a pointer down, which never happens for
        // someone playing on a keyboard. No-op after the first call.
        unlockAudio();
        if (tap === 'left') impulse -= TAP_IMPULSE;
        else if (tap === 'right') impulse += TAP_IMPULSE;
      }
      // Optional flick-up rescue: one small extra lift per bounce. It can only
      // ever help, so it cannot invalidate anything generation guarantees.
      if (input.consumeJump() && s.flap) {
        s.p.vy = Math.min(s.p.vy, -VB * t.flapBoost);
        s.flap = false;
        s.flapFx = 0.3;
        s.stretch = STRETCH_T;
        puff(s, s.p.x, s.p.y, 5, 34, '#ffffff');
        playSound('jump');
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
        if (!lands(s.p, prevFeet, platX(p, s.time), p.y, footHalf(p, difficulty))) continue;
        if (!hit || p.y < hit.y) hit = p;
      }
      if (hit) {
        const impact = s.p.vy;
        const mix = biomeMix(Math.floor(-s.bestY / METRE));
        s.p.y = hit.y;
        s.p.vy = hit.kind === 'spring' ? -SPRING_VB : -VB;
        s.flap = true;
        s.squash = SQUASH_T;
        s.stretch = 0;
        s.ringT = 0;
        s.ringX = s.p.x;
        s.ringY = hit.y;
        s.ghosts.length = 0;

        if (hit.kind === 'spring') {
          hit.pop = 0.3;
          // A spring is the biggest thing that happens in the game, so it gets
          // the full treatment: a kick of shake, a flash, and a wide burst.
          s.shake = 3.2;
          s.flash = 0.4;
          puff(s, s.p.x, hit.y, 16, 108, '#ffe98a');
          playSound('powerup');
        } else if (hit.kind === 'crumble') {
          hit.broken = true;
          hit.breakT = 0;
          puff(s, s.p.x, hit.y, 10, 52, '#c79a63');
          playSound('land');
        } else {
          puff(s, s.p.x, hit.y, 7, 42, mix.a.accent);
          playSound('jump');
          // A long drop lands with a thump as well as a boing.
          if (impact > 300) {
            s.shake = Math.min(1.8, (impact - 300) / 190);
            playSound('land');
          }
        }
      }

      for (const p of s.world.plats) {
        if (p.pop > 0) p.pop -= dt;
        if (p.broken) p.breakT += dt;
      }
      if (s.squash > 0) s.squash -= dt;
      if (s.stretch > 0) s.stretch -= dt;
      if (s.flapFx > 0) s.flapFx -= dt;
      if (s.shake > 0) s.shake = Math.max(0, s.shake - dt * 9);
      if (s.flash > 0) s.flash = Math.max(0, s.flash - dt * 1.7);
      if (s.flourish > 0) s.flourish -= dt;
      if (s.comboT > 0) {
        s.comboT -= dt;
        if (s.comboT <= 0) s.combo = 0;
      }
      s.ringT += dt;

      // --- motion trail ---------------------------------------------------
      // Only at speed, and only every other frame, so it reads as a streak
      // rather than a solid smear.
      if (Math.abs(s.p.vy) > STREAK_VY && Math.floor(s.time * 60) % 2 === 0) {
        s.ghosts.push({ x: s.p.x, y: s.p.y, life: 0.16, rising: s.p.vy < 0 });
        if (s.ghosts.length > 7) s.ghosts.shift();
      }
      for (const g of s.ghosts) g.life -= dt;
      s.ghosts = s.ghosts.filter((g) => g.life > 0);

      for (const d of s.dust) {
        d.life -= dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.vy += 190 * dt;
        d.vx *= 0.94;
      }
      s.dust = s.dust.filter((d) => d.life > 0);
      for (const pop of s.pops) {
        pop.life -= dt;
        pop.y -= 26 * dt;
      }
      s.pops = s.pops.filter((pop) => pop.life > 0);

      // --- coins ----------------------------------------------------------
      const midY = s.p.y - PH / 2;
      const grab = coinReach(difficulty);
      for (const c of s.world.coins) {
        if (c.taken) continue;
        if (Math.abs(c.y - midY) > grab) continue;
        if (Math.abs(dxWrap(c.x, s.p.x)) > grab) continue;
        c.taken = true;
        s.combo += 1;
        s.comboT = 2.6;
        s.pops.push({ x: c.x, y: c.y, life: 0.7, text: `+${10 * Math.min(5, s.combo)}` });
        puff(s, c.x, c.y, 8, 46, '#ffd75e');
        playSound('coin', s.combo - 1);
        api.addScore(10 * Math.min(5, s.combo));
      }

      // --- hazards --------------------------------------------------------
      if (s.invuln > 0) {
        s.invuln -= dt;
      } else {
        const hr = hazardR(difficulty);
        for (const h of s.world.hazards) {
          if (Math.abs(h.y - midY) > hr + PH / 2) continue;
          if (Math.abs(dxWrap(hazardX(h, s.time), s.p.x)) > hr + PW / 2) continue;
          puff(s, s.p.x, midY, 12, 70, '#ff8d8d');
          respawn(s, viewH, difficulty);
          // The shell plays the failure sound from `died` itself, so playing one
          // here as well would just double it up.
          api.died('A bug got you');
          break;
        }
      }

      // --- camera, score, falling -----------------------------------------
      const target = s.p.y - viewH * CAM_ANCHOR;
      if (target < s.camY) s.camY = target;
      if (s.p.y < s.bestY) s.bestY = s.p.y;

      const metres = Math.floor(-s.bestY / METRE);
      if (metres > s.scoredM) {
        api.addScore(metres - s.scoredM);
        s.scoredM = metres;
      }
      const band = Math.floor(metres / BIOME_M);
      if (band > s.band) {
        s.band = band;
        s.flourish = 1.5;
        s.flourishText = `${band * BIOME_M} m`;
        s.flash = 0.5;
        s.shake = 2.4;
        puff(s, s.p.x, s.p.y - PH / 2, 20, 90, biomeAt(metres).accent);
        api.setStatus(`${band * BIOME_M} m - ${biomeAt(metres).name}`);
        // `requestGate` is what tops up the play clock, and the shell plays the
        // fanfare from it - hence no `levelClear` call of our own here.
        api.requestGate(`${band * BIOME_M} m climbed`);
      }

      if (s.p.y > s.camY + viewH) {
        // Respawn BEFORE telling the shell, so the very next frame keeps running
        // whatever the shell decides to do about the death.
        respawn(s, viewH, difficulty);
        api.died('You fell');
      }

      pruneWorld(s.world, s.camY + viewH + 260);
      draw(ctx, s, spritesRef.current, difficulty, cw, ch, ph, scale, viewH);
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
function respawn(s: State, viewH: number, d: Difficulty): void {
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
  s.combo = 0;
  s.ghosts.length = 0;
  s.invuln = TUNE[d].graceS;
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

function draw(
  ctx: CanvasRenderingContext2D,
  s: State,
  sp: SpriteSet | null,
  d: Difficulty,
  cw: number,
  ch: number,
  ph: number,
  scale: number,
  viewH: number,
) {
  const metres = Math.floor(-s.bestY / METRE);
  const mix = biomeMix(metres);

  // --- sky and parallax, in SCREEN space across the WHOLE canvas ---
  // Screen space rather than world space on purpose: anchoring these to the world
  // is what left a visible seam where the backdrop ran out (the same bug that had
  // to be fixed in Platformer). Covering the whole canvas rather than just the
  // play column is what keeps a wide screen's margins alive instead of dead.
  const sky = mixedSky(mix);
  const grad = ctx.createLinearGradient(0, 0, 0, ch);
  grad.addColorStop(0, skyCss(sky, 0));
  grad.addColorStop(1, skyCss(sky, 1));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, cw, ch);

  drawStars(ctx, cw, ch, s.camY, scale, mix.stars, s.time);

  if (sp) {
    // Two cloud bands at different rates. The near one is bigger and faster, so
    // height reads as parallax separation rather than as a moving texture.
    drawCloudBand(ctx, sp, cw, ch, s.camY, scale, mix, sky, 0.18, ch * 0.34, ch * 0.95, 0.5);
    drawCloudBand(ctx, sp, cw, ch, s.camY, scale, mix, sky, 0.42, ch * 0.5, ch * 1.5, 0.34);
    drawHorizon(ctx, sp, cw, ch, s.camY, scale, mix, sky);
  }

  // --- world, in the play column ---
  const colW = W * scale;
  const ox = (cw - colW) / 2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, 0, colW, ph);
  ctx.clip();
  // Shake the world layer only. Shaking the altitude readout as well just makes
  // it hard to read at the exact moment it changes.
  const sx = s.shake > 0 ? Math.sin(s.time * 61) * s.shake : 0;
  const sy = s.shake > 0 ? Math.sin(s.time * 47) * s.shake * 0.7 : 0;
  ctx.translate(ox + sx * scale, sy * scale);
  ctx.scale(scale, scale);
  ctx.translate(0, -s.camY);
  drawWorld(ctx, s, sp, mix, viewH, d);
  ctx.restore();

  // --- column edges ---
  // A soft inner shadow, not a black bar: the scenery keeps going past the
  // column so nothing on screen is dead, but the playable width stays obvious.
  if (ox > 1) {
    const fade = Math.min(ox, colW * 0.14);
    const l = ctx.createLinearGradient(ox, 0, ox + fade, 0);
    l.addColorStop(0, 'rgba(6,8,22,0.5)');
    l.addColorStop(1, 'rgba(6,8,22,0)');
    ctx.fillStyle = l;
    ctx.fillRect(ox, 0, fade, ph);
    const r = ctx.createLinearGradient(cw - ox, 0, cw - ox - fade, 0);
    r.addColorStop(0, 'rgba(6,8,22,0.5)');
    r.addColorStop(1, 'rgba(6,8,22,0)');
    ctx.fillStyle = r;
    ctx.fillRect(cw - ox - fade, 0, fade, ph);
  }
  if (ph < ch - 0.5) {
    ctx.fillStyle = 'rgba(8,10,26,0.45)';
    ctx.fillRect(0, ph, cw, ch - ph);
  }

  if (!sp) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.font = 'bold 13px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('loading art', cw / 2, ph / 2);
    ctx.textAlign = 'left';
  }

  drawHud(ctx, s, sp, mix, metres, cw, ch, ph, ox);

  // --- milestone flourish and flashes, over everything ---
  if (s.flourish > 0) drawFlourish(ctx, s, mix, cw, ph);
  if (s.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(0.55, s.flash)})`;
    ctx.fillRect(0, 0, cw, ch);
  }
}

/**
 * Procedural star field, tiled vertically in screen space. Procedural because a
 * star is two pixels and an atlas lookup per star would cost more than the maths.
 */
function drawStars(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  camY: number,
  scale: number,
  strength: number,
  time: number,
) {
  if (strength <= 0.02) return;
  const band = 560;
  const scroll = -camY * 0.06 * scale;
  const n0 = Math.floor((-band - scroll) / band);
  const n1 = Math.ceil((ch - scroll) / band);
  ctx.fillStyle = '#ffffff';
  for (let n = n0; n <= n1; n += 1) {
    const base = n * band + scroll;
    for (let i = 0; i < 34; i += 1) {
      const k = n * 34 + i;
      const y = base + frac(k, 0.5698402909) * band;
      if (y < -3 || y > ch + 3) continue;
      const twinkle = 0.55 + 0.45 * Math.sin(time * 2.3 + k);
      ctx.globalAlpha = strength * twinkle * (0.35 + 0.65 * frac(k, 0.3247));
      ctx.beginPath();
      ctx.arc(frac(k, 0.7548776662) * cw, y, 0.7 + 1.5 * frac(k, 0.1149), 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

/**
 * One layer of cloud, as full-width strata scrolling in SCREEN space.
 *
 * Every frame in the backgrounds atlas is fully OPAQUE - measured, not assumed -
 * so scattered cloud sprites can only ever show their own rectangular edges.
 * Instead each stratum spans the whole width (no vertical edges to see) and is
 * feathered top and bottom with the sky's own colour at that exact height (no
 * horizontal edges either). What is left reads as layers of cloud the player
 * climbs up through.
 *
 * Screen space, not world space: anchoring parallax to the world is what left a
 * visible seam where the backdrop ran out, the same bug Platformer had to fix.
 */
function drawCloudBand(
  ctx: CanvasRenderingContext2D,
  sp: SpriteSet,
  cw: number,
  ch: number,
  camY: number,
  scale: number,
  mix: Mix,
  sky: Sky,
  factor: number,
  bandH: number,
  period: number,
  alpha: number,
) {
  const a = alpha * mix.clouds;
  if (a <= 0.01 || bandH <= 2) return;
  const f = sp.backgrounds.frames['background_clouds'];
  if (!f) return;
  const tileW = bandH * (f[2] / f[3]);
  if (tileW <= 1) return;

  const scroll = -camY * factor * scale;
  const n0 = Math.floor((-bandH - scroll) / period);
  const n1 = Math.ceil((ch - scroll) / period);
  for (let n = n0; n <= n1; n += 1) {
    const y = n * period + scroll;
    if (y > ch || y + bandH < 0) continue;
    // Each stratum is offset by its own stable amount, so the layers do not line
    // up into an obvious repeat as they scroll.
    const off = -frac(n, 0.7548776662) * tileW;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y, cw, bandH);
    ctx.clip();
    ctx.globalAlpha = a;
    for (let x = off; x < cw; x += tileW) {
      drawFrame(ctx, sp.backgrounds, 'background_clouds', x, y, tileW, bandH);
    }
    ctx.globalAlpha = 1;
    // Feather both edges back into the sky, sampled at the real height so the
    // blend leaves no tone step.
    const veil = ctx.createLinearGradient(0, y, 0, y + bandH);
    veil.addColorStop(0, skyCss(sky, y / ch, 1));
    veil.addColorStop(0.42, skyCss(sky, (y + bandH * 0.42) / ch, 0));
    veil.addColorStop(0.58, skyCss(sky, (y + bandH * 0.58) / ch, 0));
    veil.addColorStop(1, skyCss(sky, (y + bandH) / ch, 1));
    ctx.fillStyle = veil;
    ctx.fillRect(0, y, cw, bandH);
    ctx.restore();
  }
}

/**
 * The ground far below, drawn ONCE and bottom-anchored so it slides away as the
 * climb starts. Its top edge is hidden under a gradient back to the sky colour,
 * because these frames are opaque and would otherwise cut a hard line.
 */
function drawHorizon(
  ctx: CanvasRenderingContext2D,
  sp: SpriteSet,
  cw: number,
  ch: number,
  camY: number,
  scale: number,
  mix: Mix,
  sky: Sky,
) {
  const name = mix.t > 0.5 ? mix.b.horizon : mix.a.horizon;
  if (!name) return;
  const f = sp.backgrounds.frames[name];
  if (!f) return;
  const h = ch * 0.52;
  const top = ch - h + -camY * 0.035 * scale;
  if (top > ch) return;
  const tileW = h * (f[2] / f[3]);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, top, cw, ch - top);
  ctx.clip();
  for (let x = 0; x < cw; x += tileW) {
    drawFrame(ctx, sp.backgrounds, name, x, top, tileW, h);
  }
  // Sampled at the strip's own top, not at the bottom of the sky: using the sky's
  // end colour here left a hard full-width tone step exactly at the strip edge.
  const g = ctx.createLinearGradient(0, top, 0, top + h * 0.5);
  g.addColorStop(0, skyCss(sky, top / ch, 1));
  g.addColorStop(1, skyCss(sky, (top + h * 0.5) / ch, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, top, cw, h * 0.5);
  ctx.restore();
}

function drawWorld(
  ctx: CanvasRenderingContext2D,
  s: State,
  sp: SpriteSet | null,
  mix: Mix,
  viewH: number,
  d: Difficulty,
) {
  const top = s.camY;
  const bottom = s.camY + viewH;

  // --- platforms ---
  for (const p of s.world.plats) {
    if (p.y < top - 40 || p.y > bottom + 40) continue;
    const live = platX(p, s.time);
    // A broken platform tumbles away rather than vanishing, so the player can
    // see what happened to it.
    const fallY = p.broken ? p.breakT * p.breakT * 420 : 0;
    const alpha = p.broken ? Math.max(0, 1 - p.breakT * 1.6) : 1;
    if (alpha <= 0) continue;
    for (const x of seamXs(live, p.w / 2 + 4)) {
      ctx.globalAlpha = alpha;
      drawPlatform(ctx, sp, p, x, p.y + fallY, mix.a, s.time);
      if (mix.t > 0.01) {
        ctx.globalAlpha = alpha * mix.t;
        drawPlatform(ctx, sp, p, x, p.y + fallY, mix.b, s.time);
      }
    }
    ctx.globalAlpha = 1;
  }

  // --- impact ring ---
  if (s.ringT < 0.36) {
    const k = s.ringT / 0.36;
    ctx.globalAlpha = (1 - k) * 0.7;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4 * (1 - k) + 0.4;
    ctx.beginPath();
    ctx.ellipse(s.ringX, s.ringY + 1, 8 + k * 26, 2.5 + k * 7, 0, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // --- coins, with a sparkle ---
  if (sp) {
    const frame = animFrame(['coin_gold', 'coin_gold', 'coin_gold_side', 'coin_gold'], s.time, 7);
    const dia = COIN_R * 2 + 3;
    for (const c of s.world.coins) {
      if (c.taken || c.y < top - 20 || c.y > bottom + 20) continue;
      const bob = Math.sin(s.time * 3 + c.id) * 1.1;
      for (const x of seamXs(c.x, COIN_R + 6)) {
        // The glint pulses on its own phase per coin, so a row of them shimmers
        // rather than blinking in unison.
        const glint = Math.max(0, Math.sin(s.time * 4 + c.id * 1.7));
        if (glint > 0.02) {
          ctx.globalAlpha = glint * 0.85;
          ctx.strokeStyle = '#fff6c8';
          ctx.lineWidth = 0.7;
          const r = 5 + glint * 4;
          ctx.beginPath();
          ctx.moveTo(x - r, c.y + bob);
          ctx.lineTo(x + r, c.y + bob);
          ctx.moveTo(x, c.y + bob - r);
          ctx.lineTo(x, c.y + bob + r);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        drawFrame(ctx, sp.tiles, frame, x - dia / 2, c.y + bob - dia / 2, dia, dia);
      }
    }
  }

  // --- hazards ---
  const hr = hazardR(d);
  for (const h of s.world.hazards) {
    if (h.y < top - 20 || h.y > bottom + 20) continue;
    const hx = hazardX(h, s.time);
    const names = h.kind === 'bee' ? ['bee_a', 'bee_b'] : ['fly_a', 'fly_b'];
    const dia = (hr + 3) * 2;
    for (const x of seamXs(hx, hr + 3)) {
      if (sp) {
        drawFrame(ctx, sp.enemies, animFrame(names, s.time, 12), x - dia / 2, h.y - dia / 2, dia, dia);
      } else {
        ctx.fillStyle = '#ff5d5d';
        ctx.beginPath();
        ctx.arc(x, h.y, hr, 0, TAU);
        ctx.fill();
      }
    }
  }

  // --- motion streaks, behind the player ---
  for (const g of s.ghosts) {
    const a = Math.max(0, g.life / 0.16) * 0.28;
    ctx.globalAlpha = a;
    ctx.fillStyle = g.rising ? '#ffffff' : '#bfe4ff';
    for (const x of seamXs(g.x, 8)) {
      ctx.beginPath();
      ctx.ellipse(x, g.y - PH / 2, 4.5, PH * 0.55, 0, 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  drawPlayer(ctx, s, sp);

  // --- dust and score pops, in front ---
  for (const dp of s.dust) {
    ctx.globalAlpha = Math.max(0, dp.life / dp.max) * 0.9;
    ctx.fillStyle = dp.c;
    ctx.beginPath();
    ctx.arc(dp.x, dp.y, dp.r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (s.pops.length > 0) {
    ctx.font = 'bold 7px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const pop of s.pops) {
      ctx.globalAlpha = Math.min(1, pop.life / 0.35);
      ctx.fillStyle = '#fff3c4';
      ctx.fillText(pop.text, pop.x, pop.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }
}

function drawPlayer(ctx: CanvasRenderingContext2D, s: State, sp: SpriteSet | null) {
  // Squash on the bounce, stretch on the way up. The bounce is the only thing the
  // player does, so it is worth the few lines to make it feel springy.
  const sq = s.squash > 0 ? s.squash / SQUASH_T : 0;
  const st = s.stretch > 0 ? s.stretch / STRETCH_T : 0;
  const rise = Math.min(1, Math.max(0, -s.p.vy / VB));
  const stretch = Math.max(st, rise * 0.5);
  const bw = 26 * (1 + sq * 0.3 - stretch * 0.16);
  const bh = 26 * (1 - sq * 0.26 + stretch * 0.2);

  let name: string;
  if (s.invuln > 0) name = 'character_green_hit';
  else if (s.p.vy < -40) name = 'character_green_jump';
  else if (s.p.vy < 60) name = 'character_green_idle';
  else name = animFrame(['character_green_walk_a', 'character_green_walk_b'], s.time, 11);

  // Blink through the post-respawn grace period so it reads as temporary.
  const hidden = s.invuln > 0 && Math.floor(s.time * 12) % 2 === 0;
  if (hidden) return;

  for (const x of seamXs(s.p.x, bw / 2 + 2)) {
    if (s.flapFx > 0) {
      ctx.fillStyle = `rgba(255,255,255,${s.flapFx})`;
      ctx.beginPath();
      ctx.ellipse(x, s.p.y + 2, bw * 0.55, 4, 0, 0, TAU);
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

function drawPlatform(
  ctx: CanvasRenderingContext2D,
  sp: SpriteSet | null,
  p: Platform,
  cx: number,
  y: number,
  biome: Biome,
  time: number,
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

  // A soft shadow under the slab. Cheap, and it lifts the platforms off the sky
  // so the column reads as depth rather than as stickers on a gradient.
  ctx.globalAlpha *= 0.9;
  ctx.fillStyle = 'rgba(20,26,54,0.18)';
  ctx.beginPath();
  ctx.ellipse(cx, y + PLAT_H + 1.5, half * 0.9, 2.6, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha /= 0.9;

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
    const pop = p.pop > 0;
    if (pop) {
      // A charged spring glows for a moment, so the launch has a cause on screen.
      ctx.fillStyle = 'rgba(255,232,138,0.5)';
      ctx.beginPath();
      ctx.arc(cx, y - 2, 11, 0, TAU);
      ctx.fill();
    }
    drawFrame(ctx, sp.tiles, pop ? 'spring_out' : 'spring', cx - sz / 2, y - sz + 1, sz, sz);
  } else if (p.kind === 'mover') {
    // Little chevrons, so a moving platform is legible before it moves. They lean
    // the way it is travelling right now.
    const dir = p.amp > 0 && Math.cos(p.phase + (time * p.speed) / p.amp) >= 0 ? 1 : -1;
    ctx.fillStyle = 'rgba(20,30,60,0.5)';
    for (const s2 of [-1, 1]) {
      const lit = s2 === dir;
      ctx.globalAlpha *= lit ? 1 : 0.4;
      ctx.beginPath();
      ctx.moveTo(cx + s2 * (half - 3), y + 4);
      ctx.lineTo(cx + s2 * (half - 8), y + 1.5);
      ctx.lineTo(cx + s2 * (half - 8), y + 6.5);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha /= lit ? 1 : 0.4;
    }
  }
}

/**
 * Altitude readout plus a slim gauge up the side. The gauge earns its keep on a
 * wide screen, where it gives the margin something to be.
 */
function drawHud(
  ctx: CanvasRenderingContext2D,
  s: State,
  sp: SpriteSet | null,
  mix: Mix,
  metres: number,
  cw: number,
  ch: number,
  ph: number,
  ox: number,
) {
  const pad = ox > 34 ? Math.min(ox, 44) / 2 : 8;

  ctx.fillStyle = 'rgba(10,14,32,0.36)';
  ctx.fillRect(pad, 6, 88, 36);
  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  ctx.font = 'bold 19px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`${metres} m`, pad + 7, 28);
  ctx.font = 'bold 9px ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.62)';
  ctx.fillText((mix.t > 0.5 ? mix.b.name : mix.a.name).toUpperCase(), pad + 7, 39);

  if (s.combo > 1 && sp) {
    const bx = pad + 96;
    drawFrame(ctx, sp.tiles, 'hud_coin', bx, 12, 18, 18);
    ctx.fillStyle = 'rgba(255,231,138,0.95)';
    ctx.font = 'bold 13px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(`x${Math.min(5, s.combo)}`, bx + 21, 26);
  }

  // --- altitude gauge: this band's progress, right edge ---
  const gx = cw - pad - 5;
  const gTop = 54;
  const gBot = ph - 26;
  if (gBot - gTop > 40) {
    ctx.fillStyle = 'rgba(10,14,32,0.3)';
    ctx.fillRect(gx - 2, gTop, 5, gBot - gTop);
    const within = (metres % BIOME_M) / BIOME_M;
    const fillH = (gBot - gTop) * within;
    ctx.fillStyle = mix.t > 0.5 ? mix.b.accent : mix.a.accent;
    ctx.fillRect(gx - 2, gBot - fillH, 5, fillH);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = 'bold 8px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${(Math.floor(metres / BIOME_M) + 1) * BIOME_M}`, gx - 6, gTop + 8);
    ctx.textAlign = 'left';
  }
  void ch;
}

/** The milestone celebration: an expanding ring and a caption, screen space. */
function drawFlourish(
  ctx: CanvasRenderingContext2D,
  s: State,
  mix: Mix,
  cw: number,
  ph: number,
) {
  const k = 1 - s.flourish / 1.5;
  const cy = ph * 0.34;
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - k * 1.15);
  ctx.strokeStyle = mix.t > 0.5 ? mix.b.accent : mix.a.accent;
  ctx.lineWidth = 6 * (1 - k) + 1;
  for (const delay of [0, 0.18]) {
    const kk = Math.max(0, k - delay);
    if (kk <= 0) continue;
    ctx.beginPath();
    ctx.arc(cw / 2, cy, kk * Math.min(cw, ph) * 0.55, 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = Math.max(0, 1 - k * 1.4);
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.font = 'bold 40px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(s.flourishText, cw / 2 + 2, cy + 14);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(s.flourishText, cw / 2, cy + 12);
  ctx.font = 'bold 12px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText('KEEP CLIMBING', cw / 2, cy + 32);
  ctx.restore();
  ctx.textAlign = 'left';
}


