'use client';

/**
 * Dash Run - an endless runner.
 *
 * Three things about this file are load-bearing and worth reading before
 * changing anything:
 *
 * 1. PHYSICS AND GENERATION ARE EXPORTED. `scripts/check-runner.ts` imports the
 *    real integrator (`stepPlayer`) and the real chunk generator
 *    (`generateChunk`) and proves by simulation that every chunk the game can
 *    produce is survivable at the speed it can appear at. The jump envelope the
 *    generator sizes gaps and obstacles from is PROBED from the integrator
 *    (`probeJump`) rather than written down, so retuning gravity or the impulse
 *    moves every limit with it and the proof still means something.
 *
 * 2. THE PROOF ASSUMES JUMP-ONLY PLAY. The game uses the `tapjump` control
 *    scheme: the whole screen is a jump button (tap to jump, tap again in the
 *    air to double-jump), and there is no lateral or down input on touch - so NO
 *    hazard may ever require ducking, and the small keyboard speed-nudge is not
 *    something the reachability proof is allowed to depend on. A tap fires
 *    press+release in one gesture, so `jumpHeld` is effectively false on touch:
 *    the TAP arc, not the held arc, is what everything is sized from. Holding a
 *    key only ever buys extra height. (This replaced the old `lanes` swipe-up
 *    jump, which was unreliable on the iPad - "the swipe is still not working".)
 *
 * 3. EVERY HAZARD IS ANSWERED BY ONE VERB: JUMP OVER IT. There used to be a
 *    second flavour - overhead beams (and high bobbing flies) that a runner was
 *    meant to pass UNDER - and it produced the game's worst real-world bug.
 *    The beam's fatal box hung ABOVE the tap arc with a slit of ground
 *    clearance below, and it rendered as a four-tile brick wall with chains to
 *    the top of the screen: at speed that reads as "a massive wall I can't
 *    jump over or run under". With the whole screen being a jump button, a
 *    kid's instinct at a wall is to tap, and tapping was precisely what killed
 *    them; arriving airborne (say, off a double jump over the gap before it)
 *    was just as fatal, even though the verifier could always thread SOME
 *    jump-free line through. So overhead hazards are gone as a class: every
 *    obstacle now sits ON the floor and tops out well inside the tap arc, the
 *    checker rejects any fatal box that floats off the ground OR pokes above
 *    the comfort cap, and it also measures the tap-timing window on every
 *    feature so sloppy timing clears it, not frame-perfect play. Coins arc
 *    over each obstacle as the signpost: coins always mean "jump here".
 */

import { useEffect, useRef } from 'react';
import { RAMP_SCALE, SPEED_SCALE, type Difficulty } from '@/lib/difficulty';
import type { GameCanvasProps } from '@/lib/games';
import { playSound } from '@/lib/sound';
import { animFrame, drawFrame, useSprites, type SpriteSet } from '@/lib/sprites';
import { useCanvasGame } from '@/lib/useCanvasGame';

// ===========================================================================
// 1. Physics
// ===========================================================================
// World units are pixels at zoom 1. The ground surface is y = 0 and up is
// negative, so nothing in the physics depends on the canvas size - the renderer
// alone decides where on screen y = 0 lands. `b.y` is the player's FEET.

export const TILE = 16;
export const PW = 12;
export const STAND_H = 20;
export const DUCK_H = 12;

export const GRAVITY = 1500;
export const JUMP_V = 520;
/** The second jump is weaker, so a double is a rescue rather than a free floor. */
export const DOUBLE_V = 470;
/** Rising speed is clipped to this once the button is released. */
export const JUMP_CUT = 200;
/**
 * Seconds of full-power rise granted regardless of the button. Without it a
 * touch flick (press and release inside one gesture) would be clipped on frame
 * one and barely leave the floor.
 */
export const MIN_RISE = 0.16;
export const MAX_FALL = 950;
export const COYOTE = 0.1;
export const JUMP_BUFFER = 0.14;
export const MAX_JUMPS = 2;
/** Falling this far below the floor is fatal - that is a pit, not a dip. */
export const FATAL_DEPTH = 3 * TILE;
/** How much of the footprint may hang over a void and still count as standing. */
export const SUPPORT_INSET = 2;
export const DT = 1 / 60;

// Speed ramp. One metre is one tile, which keeps the HUD number honest.
// SPEED_SCALE is applied outside the cap so hard genuinely outruns normal
// instead of both flattening at the same ceiling.
export const BASE_SPEED = 190;
export const SPEED_CAP = 440;
export const RAMP_PER_M = 0.2;
/** How far holding a side button bends the run speed. */
export const NUDGE = 0.1;

export function speedAt(metres: number, d: Difficulty): number {
  const raw = BASE_SPEED + Math.max(0, metres) * RAMP_PER_M * RAMP_SCALE[d];
  return SPEED_SCALE[d] * Math.min(SPEED_CAP, raw);
}

export type Span = { x0: number; x1: number };
export type SolidKind = 'crate' | 'ledge';
export type FatalKind = 'spike' | 'beam' | 'saw' | 'fly';

/** A landable box. `y` is its TOP; it extends `h` downward. */
export type Solid = { kind: SolidKind; x: number; y: number; w: number; h: number };

/**
 * A box that kills on contact. Movement is keyed on the PLAYER'S x rather than
 * on wall-clock time: the world only ever scrolls forward at run speed, so it
 * looks identical, and it makes a moving hazard a pure function of position -
 * which is what lets the verifier simulate movers exactly instead of guessing.
 */
export type Fatal = {
  kind: FatalKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Radians of phase per world pixel scrolled. 0 for a static hazard. */
  k: number;
  ampX: number;
  ampY: number;
  phase: number;
  /** Runtime only: this hazard has already paid out its near-miss bonus. */
  graze: boolean;
};

export type Coin = { x: number; y: number; taken: boolean };

export type Body = {
  x: number;
  y: number;
  vy: number;
  h: number;
  onGround: boolean;
  jumps: number;
  /** Seconds of guaranteed full-power rise left on the current jump. */
  rise: number;
};

export type Ctrl = { vx: number; jump: boolean; jumpHeld: boolean; duck: boolean };

export type World = {
  spans: Span[];
  solids: Solid[];
  fatals: Fatal[];
  /** Landing tolerance. Looser on easy, so clipping a crate's lip is a landing. */
  landTol: number;
  /** Fatal-box hitbox inset. Looser on easy, so a graze stays a graze. */
  inset: number;
};

export type StepOut = {
  /** Downward speed at touchdown, or 0 if no landing happened this frame. */
  landed: number;
  crashed: boolean;
  fell: boolean;
  bonked: boolean;
  leftGround: boolean;
};

export function fatalBox(f: Fatal, px: number): { x: number; y: number; w: number; h: number } {
  if (f.k === 0) return { x: f.x, y: f.y, w: f.w, h: f.h };
  const t = px * f.k + f.phase;
  return { x: f.x + Math.cos(t) * f.ampX, y: f.y + Math.sin(t) * f.ampY, w: f.w, h: f.h };
}

/** True while feet at `feetY` are resting on the ground or on a solid's top. */
export function supported(w: World, x: number, feetY: number): boolean {
  const a = x + SUPPORT_INSET;
  const b = x + PW - SUPPORT_INSET;
  if (Math.abs(feetY) < 0.75) {
    for (const s of w.spans) if (b > s.x0 && a < s.x1) return true;
  }
  for (const s of w.solids) {
    if (Math.abs(feetY - s.y) > 0.75) continue;
    if (b > s.x && a < s.x + s.w) return true;
  }
  return false;
}

/** Would a body of height `h` standing here have its head inside a solid? */
function headBlocked(w: World, x: number, feetY: number, h: number): boolean {
  for (const s of w.solids) {
    if (x + PW - SUPPORT_INSET <= s.x || x + SUPPORT_INSET >= s.x + s.w) continue;
    if (feetY - h >= s.y + s.h || feetY <= s.y) continue;
    return true;
  }
  return false;
}

/**
 * Advances the player one frame. The game and the verifier both call this, so
 * the reachability proof is a proof about the code that actually runs.
 */
export function stepPlayer(w: World, b: Body, c: Ctrl, dt: number): StepOut {
  const out: StepOut = { landed: 0, crashed: false, fell: false, bonked: false, leftGround: false };

  const wantH = c.duck && b.onGround ? DUCK_H : STAND_H;
  if (wantH !== b.h && (wantH < b.h || !headBlocked(w, b.x, b.y, wantH))) b.h = wantH;

  if (c.jump && b.jumps < MAX_JUMPS) {
    b.vy = -(b.jumps === 0 ? JUMP_V : DOUBLE_V);
    b.jumps += 1;
    b.rise = MIN_RISE;
    b.onGround = false;
    b.h = STAND_H;
  }
  if (b.rise > 0) b.rise -= dt;
  if (b.rise <= 0 && !c.jumpHeld && b.vy < -JUMP_CUT) b.vy = -JUMP_CUT;

  b.vy = Math.min(b.vy + GRAVITY * dt, MAX_FALL);
  const fallSpeed = b.vy;

  b.x += c.vx * dt;
  // Running off a lip can only be detected after the horizontal move.
  if (b.onGround && !supported(w, b.x, b.y)) {
    b.onGround = false;
    out.leftGround = true;
  }

  const prevFeet = b.y;
  const ny = b.y + b.vy * dt;
  let landTop: number | null = null;
  let bonkBottom: number | null = null;
  let sideHit = false;

  for (const s of w.solids) {
    if (b.x + PW - SUPPORT_INSET <= s.x || b.x + SUPPORT_INSET >= s.x + s.w) continue;
    const bottom = s.y + s.h;
    // A clean pass above the top or below the bottom leaves nothing to resolve.
    if (ny - b.h >= bottom || ny <= s.y) continue;
    if (b.vy >= 0 && prevFeet <= s.y + w.landTol) {
      landTop = landTop === null ? s.y : Math.min(landTop, s.y);
    } else if (b.vy < 0 && bottom < -2 && bottom + b.h <= 0) {
      // Rising into the UNDERSIDE of a floating ledge is a head clonk, never
      // fatal: a kid mashing jump under a platform should not die for it. A crate
      // resting on the floor has no underside to clonk - resolving that as a bonk
      // shoved the player below the ground, where they could keep running and
      // then jump back up through the floor. Rising into a crate is a face-first
      // hit on its side, which is a crash.
      bonkBottom = bonkBottom === null ? bottom : Math.max(bonkBottom, bottom);
    } else {
      sideHit = true;
    }
  }
  // Landing on the FLOOR is considered only when nothing was hit side-on.
  // Checking it first let the floor under a crate cancel the crate's own side
  // hit, so a runner walked straight through solid boxes - the self-test in
  // scripts/check-runner.ts is what surfaced that.
  const floorLand =
    landTop === null &&
    !sideHit &&
    b.vy >= 0 &&
    prevFeet <= w.landTol &&
    ny >= 0 &&
    supported(w, b.x, 0);

  if (landTop !== null || floorLand) {
    const wasAir = !b.onGround;
    b.y = landTop ?? 0;
    b.vy = 0;
    b.rise = 0;
    b.jumps = 0;
    b.onGround = true;
    if (wasAir) out.landed = fallSpeed;
  } else if (bonkBottom !== null) {
    b.y = bonkBottom + b.h;
    b.vy = 0;
    b.onGround = false;
    out.bonked = true;
  } else {
    b.y = ny;
    b.onGround = false;
    if (sideHit) out.crashed = true;
  }

  const rx = b.x + w.inset;
  const ry = b.y - b.h + w.inset;
  const rw = PW - w.inset * 2;
  const rh = b.h - w.inset * 2;
  for (const f of w.fatals) {
    const box = fatalBox(f, b.x);
    if (rx + rw <= box.x || rx >= box.x + box.w) continue;
    if (ry + rh <= box.y || ry >= box.y + box.h) continue;
    out.crashed = true;
    break;
  }
  if (b.y > FATAL_DEPTH) out.fell = true;
  return out;
}

export function coinTouched(b: Body, c: Coin): boolean {
  return Math.abs(c.x - (b.x + PW / 2)) < 11 && Math.abs(c.y - (b.y - b.h / 2)) < 12;
}

// --- the jump envelope, probed from the integrator above -------------------

const FLAT: World = {
  spans: [{ x0: -1e7, x1: 1e7 }],
  solids: [],
  fatals: [],
  landTol: 6,
  inset: 0,
};

export type Envelope = { rise: number; air: number };

/**
 * Measures a jump by running the real integrator over empty flat ground.
 * Nothing downstream hard-codes a height or a hang time, so retuning the
 * constants above automatically resizes every gap and obstacle generated.
 */
export function probeJump(hold: boolean, second: boolean): Envelope {
  const b: Body = { x: 0, y: 0, vy: 0, h: STAND_H, onGround: true, jumps: 0, rise: 0 };
  stepPlayer(FLAT, b, { vx: 0, jump: true, jumpHeld: hold, duck: false }, DT);
  let top = b.y;
  let frames = 1;
  let fired = !second;
  for (let i = 0; i < 900; i += 1) {
    const now = !fired && b.vy >= 0;
    if (now) fired = true;
    stepPlayer(FLAT, b, { vx: 0, jump: now, jumpHeld: hold, duck: false }, DT);
    frames += 1;
    if (b.y < top) top = b.y;
    if (b.onGround) break;
  }
  return { rise: -top, air: frames * DT };
}

/** One press, released at once. EVERY limit in the generator is sized from this. */
export const TAP: Envelope = probeJump(false, false);
/** Holding the button. Strictly more height and hang time than TAP. */
export const HOLD: Envelope = probeJump(true, false);
/** Tap, then tap again at the apex. Pure forgiveness margin. */
export const TAP2: Envelope = probeJump(false, true);

/** Horizontal ground covered by a tap jump at this speed. */
export function jumpReach(speed: number): number {
  return TAP.air * speed;
}

// ===========================================================================
// 2. Chunk generation
// ===========================================================================

export const CHUNK_TILES = 40;
export const CHUNK_W = CHUNK_TILES * TILE;
/**
 * Feature-free margin at each end of a chunk. It is at least this wide, but
 * scales with the chunk's own spacing: a chunk knows nothing about its
 * neighbours, so the only way to guarantee two features never crowd each other
 * ACROSS a seam is for each chunk to reserve over half a spacing at both ends.
 * The two halves then add up to more than one spacing however the seam falls.
 */
export const MARGIN_MIN = 5 * TILE;
export const MARGIN_FACTOR = 0.55;
/** Readability cap: a wider gap is unreadable even when it is jumpable. */
export const MAX_GAP_TILES = 7;

export type ChunkKind =
  | 'flat'
  | 'gaps'
  | 'crates'
  | 'spikes'
  | 'ledges'
  | 'beams'
  | 'saws'
  | 'flyers'
  | 'mix';

export type FeatureKind = 'gap' | 'crate' | 'spike' | 'beam' | 'saw' | 'flyer' | 'ledge';

export type Chunk = {
  i: number;
  x0: number;
  x1: number;
  /** Metre mark at x0. */
  m0: number;
  /** Difficulty ramp value used, 0..1. */
  t: number;
  kind: ChunkKind;
  spans: Span[];
  solids: Solid[];
  fatals: Fatal[];
  coins: Coin[];
  /** Occupied x-ranges including hazard travel, for the overlap assertion. */
  slots: Array<{ kind: FeatureKind; x0: number; x1: number }>;
  /** Clear ground demanded between features here. */
  spacing: number;
  /** Feature-free margin reserved at BOTH ends of this chunk. */
  margin: number;
};

type Knobs = {
  /** Fraction of the tap jump's reach a gap is allowed to use. */
  gapSafety: number;
  /** Clear ground between features, in tap-jump lengths. */
  spacing: number;
  landTol: number;
  inset: number;
  /** Every Nth chunk is a breather. 0 disables. */
  breather: number;
  /** Leading chunks that are always flat. */
  intro: number;
  coinMul: number;
  maxFeatures: number;
  /** Metres of running before the hazard ramp is at full tilt. */
  rampM: number;
};

export const KNOBS: Record<Difficulty, Knobs> = {
  // Easy is the default and the five-year-old's setting: half the hazards, twice
  // the room between them, gaps at well under half the jump, fat hitbox slack.
  easy: {
    gapSafety: 0.45,
    spacing: 1.8,
    landTol: 9,
    inset: 3,
    breather: 2,
    intro: 2,
    coinMul: 1.4,
    maxFeatures: 3,
    rampM: 2800,
  },
  normal: {
    gapSafety: 0.56,
    spacing: 1.25,
    landTol: 7,
    inset: 2,
    breather: 3,
    intro: 1,
    coinMul: 1,
    maxFeatures: 4,
    rampM: 1400,
  },
  hard: {
    gapSafety: 0.64,
    spacing: 1,
    landTol: 5,
    inset: 1,
    breather: 5,
    intro: 1,
    coinMul: 0.8,
    maxFeatures: 5,
    rampM: 1000,
  },
};

/**
 * The only seeds the game ever runs. Fixing the set lets the verifier prove
 * EVERY world the game can produce instead of a sample of them, while a fresh
 * seed per run still means a kid is not replaying one memorised course.
 */
export const RUN_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

const DIFF_SALT: Record<Difficulty, number> = { easy: 0, normal: 7717, hard: 15551 };

function lcg(seed: number) {
  let s = (Math.abs(Math.floor(seed)) * 1103515245 + 12345) & 0x7fffffff;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function pickKind(rand: () => number, t: number): ChunkKind {
  const pool: Array<[ChunkKind, number]> = [
    ['gaps', 1],
    ['crates', 0.95],
    ['spikes', t > 0.12 ? 0.85 : 0],
    ['ledges', t > 0.2 ? 0.75 : 0],
    ['beams', t > 0.32 ? 0.85 : 0],
    ['saws', t > 0.45 ? 0.75 : 0],
    ['flyers', t > 0.55 ? 0.75 : 0],
    ['mix', t > 0.65 ? 1.3 : 0],
  ];
  let total = 0;
  for (const [, wt] of pool) total += wt;
  let r = rand() * total;
  for (const [kind, wt] of pool) {
    r -= wt;
    if (r <= 0 && wt > 0) return kind;
  }
  return 'gaps';
}

const PRIMARY: Record<ChunkKind, FeatureKind[]> = {
  flat: [],
  gaps: ['gap'],
  crates: ['crate'],
  spikes: ['spike'],
  ledges: ['ledge'],
  beams: ['beam'],
  saws: ['saw'],
  flyers: ['flyer'],
  mix: ['gap', 'crate', 'spike', 'beam', 'saw', 'flyer', 'ledge'],
};

/** Always-safe fallbacks, unlocked from the first metre. */
const BASICS: FeatureKind[] = ['gap', 'crate'];

type Gen = {
  chunk: Chunk;
  rand: () => number;
  k: Knobs;
  gaps: Array<[number, number]>;
  gapMax: number;
  crateMax: number;
  /** Nominal traversal speed mid-chunk, for coin arcs and hazard bob rates. */
  nominal: number;
};

function coin(g: Gen, x: number, y: number) {
  g.chunk.coins.push({ x, y, taken: false });
}

/**
 * The body-centre path of a tap jump taken at `takeoffX`, by running the real
 * integrator. Coin arcs are sampled from THIS rather than from a hand-drawn
 * curve: a sine that merely looked like a jump left coins the arc never actually
 * passed through, which the verifier correctly reported as uncollectable.
 */
function tapArcPath(takeoffX: number, speed: number): Array<{ x: number; y: number }> {
  const b: Body = { x: takeoffX, y: 0, vy: 0, h: STAND_H, onGround: true, jumps: 0, rise: 0 };
  const path: Array<{ x: number; y: number }> = [];
  stepPlayer(FLAT, b, { vx: speed, jump: true, jumpHeld: false, duck: false }, DT);
  for (let i = 0; i < 400; i += 1) {
    path.push({ x: b.x + PW / 2, y: b.y - STAND_H / 2 });
    stepPlayer(FLAT, b, { vx: speed, jump: false, jumpHeld: false, duck: false }, DT);
    if (b.onGround) break;
  }
  return path;
}

/**
 * Coins strung along the jump a player has to make anyway, from just before the
 * obstacle to just after it. Signposting: an arc of coins means "jump here".
 */
function arcCoins(g: Gen, x0: number, x1: number, n: number, takeoffBack = 14) {
  const count = Math.max(1, Math.round(n * g.k.coinMul));
  // The takeoff has to be a spot the player can actually stand on. For a solid
  // or a hazard that is a body-width clear of it, because the footprint starts
  // colliding before the sprite does; for a gap it is the lip itself. Anchoring
  // the arc inside the crash zone put coins on a jump nobody could take.
  const path = tapArcPath(x0 - takeoffBack, g.nominal).filter(
    (p) => p.x >= x0 - takeoffBack && p.x <= x1 + 12 && p.y < -8,
  );
  if (path.length === 0) return;
  // Only the apex stretch of the arc. Near the ends the trajectory is steep -
  // 500px/s vertical against 200px/s horizontal - so a jump taken two frames
  // early misses a coin there by 20px. The apex is flat, so any jump that clears
  // the obstacle passes through it whatever the exact timing.
  const lo = 0.22;
  const hi = 0.78;
  for (let i = 0; i < count; i += 1) {
    const f = count === 1 ? 0.5 : lo + ((hi - lo) * i) / (count - 1);
    const p = path[Math.min(path.length - 1, Math.round(f * (path.length - 1)))];
    coin(g, p.x, p.y);
  }
}

/** Emits one feature starting at `x`. Returns the x-width it occupies. */
function emit(g: Gen, kind: FeatureKind, x: number): number {
  const r = g.rand;
  switch (kind) {
    case 'gap': {
      const w = Math.max(1.7 * TILE, g.gapMax * (0.55 + 0.45 * r()));
      g.gaps.push([x, x + w]);
      arcCoins(g, x, x + w, 4, 4);
      return w;
    }
    case 'crate': {
      const rows = 1 + Math.floor(r() * g.crateMax);
      const cols = 1 + Math.floor(r() * 2.6);
      const h = rows * TILE;
      g.chunk.solids.push({ kind: 'crate', x, y: -h, w: cols * TILE, h });
      arcCoins(g, x, x + cols * TILE, 3);
      return cols * TILE;
    }
    case 'spike': {
      const cols = 1 + Math.floor(r() * 2);
      const h = 0.55 * TILE;
      g.chunk.fatals.push({
        kind: 'spike',
        x,
        y: -h,
        w: cols * TILE,
        h,
        k: 0,
        ampX: 0,
        ampY: 0,
        phase: 0,
        graze: false,
      });
      arcCoins(g, x, x + cols * TILE, 3);
      return cols * TILE;
    }
    case 'saw': {
      // Slides along the floor. The wavelength is set from the nominal speed so
      // the sweep reads at roughly 1.1 Hz however fast the world is moving. The
      // sweep is kept short so the whole travel zone still fits comfortably
      // under one tap arc - a wide sweep shrank the safe-takeoff window.
      const amp = (1.0 + r() * 1.0) * TILE;
      g.chunk.fatals.push({
        kind: 'saw',
        x: x + amp,
        y: -TILE,
        w: TILE,
        h: TILE,
        k: (Math.PI * 2) / Math.max(90, g.nominal * 0.9),
        ampX: amp,
        ampY: 0,
        phase: r() * Math.PI * 2,
        graze: false,
      });
      arcCoins(g, x, x + amp * 2 + TILE, 4);
      return amp * 2 + TILE;
    }
    case 'beam': {
      // A GROUNDED spiked pillar, jumped over like everything else. This used
      // to be an overhead beam the player had to run UNDER - the source of the
      // "massive wall I can't jump over or run under" bug (see the header):
      // with tap-anywhere controls, tapping at it was fatal. Nothing may hang
      // in the air any more, so it stands on the floor, two tiles tall - well
      // inside the tap arc, same as a crate, but lethal to touch.
      const w = TILE;
      const h = 2 * TILE;
      g.chunk.fatals.push({
        kind: 'beam',
        x,
        y: -h,
        w,
        h,
        k: 0,
        ampX: 0,
        ampY: 0,
        phase: 0,
        graze: false,
      });
      arcCoins(g, x, x + w, 3);
      return w;
    }
    case 'flyer': {
      // One fly, buzzing LOW: it bobs between brushing the floor and about two
      // tiles up, so a tap arc sails over it with room to spare. It used to
      // hover above head height as a "do not jump" hazard - the same airborne
      // blocker class as the old beam, removed for the same reason.
      const w = 1.1 * TILE;
      const amp = 0.5 * TILE;
      g.chunk.fatals.push({
        kind: 'fly',
        x,
        y: -(amp + w),
        w,
        h: w,
        k: (Math.PI * 2) / Math.max(90, g.nominal * 0.85),
        ampX: 0,
        ampY: amp,
        phase: r() * Math.PI * 2,
        graze: false,
      });
      arcCoins(g, x, x + w, 3);
      return w;
    }
    case 'ledge': {
      const cols = 3 + Math.floor(r() * 4);
      const w = cols * TILE;
      // The top is a fraction of the measured rise, so it is always landable.
      // The floor of 3 rows guarantees a standing runner passes UNDERNEATH with
      // headroom - a ledge is the one optional platform, never a wall: bonking
      // its underside is harmless and running under it must always be safe.
      const rows = Math.max(3, Math.floor((TAP.rise * 0.7) / TILE));
      const top = -rows * TILE;
      g.chunk.solids.push({ kind: 'ledge', x, y: top, w, h: TILE });
      for (let i = 0; i < cols; i += 1) coin(g, x + i * TILE + TILE / 2, top - 0.85 * TILE);
      return w;
    }
  }
}

export function generateChunk(index: number, d: Difficulty, seed: number): Chunk {
  const k = KNOBS[d];
  const x0 = index * CHUNK_W;
  const x1 = x0 + CHUNK_W;
  const m0 = x0 / TILE;
  const t = Math.min(1, m0 / k.rampM);
  const rand = lcg(seed * 7919 + index * 104729 + DIFF_SALT[d] + 1);

  const chunk: Chunk = {
    i: index,
    x0,
    x1,
    m0,
    t,
    kind: 'flat',
    spans: [],
    solids: [],
    fatals: [],
    coins: [],
    slots: [],
    spacing: 0,
    margin: MARGIN_MIN,
  };

  const breather = index < k.intro || (k.breather > 0 && index % k.breather === k.breather - 1);
  chunk.kind = breather ? 'flat' : pickKind(rand, t);

  // The two speeds that matter. Reach scales WITH speed, so gaps are sized off
  // the slowest this chunk can be run at; reaction room shrinks with speed, so
  // spacing is sized off the fastest.
  const slow = speedAt(m0, d) * (1 - NUDGE);
  const fast = speedAt(m0 + CHUNK_TILES, d) * (1 + NUDGE);

  const g: Gen = {
    chunk,
    rand,
    k,
    gaps: [],
    gapMax: Math.min(MAX_GAP_TILES * TILE, jumpReach(slow) * k.gapSafety),
    crateMax: Math.max(1, Math.floor((TAP.rise * 0.55) / TILE)),
    nominal: speedAt(m0 + CHUNK_TILES / 2, d),
  };

  const spacing = Math.max(jumpReach(fast) * k.spacing, 3 * TILE);
  const margin = Math.max(MARGIN_MIN, spacing * MARGIN_FACTOR);
  chunk.spacing = spacing;
  chunk.margin = margin;
  const room = CHUNK_W - margin * 2;
  const wanted = breather ? 0 : 1 + Math.floor(rand() * k.maxFeatures);
  // At full speed one spacing is most of a chunk, so the count collapses toward
  // one. It must never collapse to ZERO, or a fast run turns into empty road.
  const slots = breather ? 0 : Math.max(1, Math.min(wanted, Math.floor(room / spacing)));

  // A breather with nothing in it is dead road. Give it a line of coins to run
  // through, which is the reward for the stretch where nothing is chasing you.
  if (breather) {
    const n = Math.round(6 * k.coinMul);
    for (let i = 0; i < n; i += 1) {
      chunk.coins.push({
        x: x0 + margin + ((CHUNK_W - margin * 2) * i) / (n - 1),
        y: -0.85 * TILE,
        taken: false,
      });
    }
  }

  let cx = x0 + margin;
  for (let i = 0; i < slots; i += 1) {
    const primary = PRIMARY[chunk.kind];
    const pool = rand() < 0.75 && primary.length > 0 ? primary : BASICS;
    let kind = pool[Math.floor(rand() * pool.length) % pool.length];
    // A gap needs the envelope to actually allow one; early easy chunks do not.
    if (kind === 'gap' && g.gapMax < 1.7 * TILE) kind = 'crate';
    const start = cx + rand() * TILE * 1.5;
    // Widest thing `emit` can produce. Checked BEFORE emitting, so no feature
    // ever spills into the reserved margin and across a seam.
    const widest = Math.max(g.gapMax, 8 * TILE);
    if (start + widest > x1 - margin) break;
    const w = emit(g, kind, start);
    chunk.slots.push({ kind, x0: start, x1: start + w });
    cx = start + w + spacing;
    if (cx > x1 - margin) break;
  }

  // Ground is everything that is not a gap.
  g.gaps.sort((a, b) => a[0] - b[0]);
  let cursor = x0;
  for (const [gx0, gx1] of g.gaps) {
    if (gx0 > cursor) chunk.spans.push({ x0: cursor, x1: gx0 });
    cursor = Math.max(cursor, gx1);
  }
  if (cursor < x1) chunk.spans.push({ x0: cursor, x1 });

  // A coin that landed over a void or inside something is dropped rather than
  // left as bait the verifier would rightly reject.
  chunk.coins = chunk.coins.filter((c) => {
    if (c.x < x0 + 2 || c.x > x1 - 2) return false;
    if (c.y > -0.4 * TILE) return false;
    for (const [gx0, gx1] of g.gaps) if (c.x > gx0 - 10 && c.x < gx1 + 10 && c.y > -TILE) return false;
    for (const s of chunk.solids) {
      if (c.x > s.x - 6 && c.x < s.x + s.w + 6 && c.y > s.y - 7 && c.y < s.y + s.h + 7) return false;
    }
    for (const f of chunk.fatals) {
      const lo = f.x - f.ampX - 8;
      const hi = f.x + f.w + f.ampX + 8;
      const top = f.y - f.ampY - 8;
      const bot = f.y + f.h + f.ampY + 8;
      if (c.x > lo && c.x < hi && c.y > top && c.y < bot) return false;
    }
    return true;
  });

  return chunk;
}

// ===========================================================================
// 3. Presentation tables
// ===========================================================================
// Sprite names are written as literals rather than composed, so
// `npm run check:sprites` (which scans this file for quoted names) can see them.

export type Biome = 'grass' | 'sand' | 'stone' | 'snow' | 'purple' | 'dirt';

const BIOME_ORDER: Biome[] = ['grass', 'sand', 'stone', 'snow', 'purple', 'dirt'];
/** Metres per biome. A shift every few hundred metres keeps a long run moving. */
export const BIOME_M = 380;

export function biomeAt(metres: number): Biome {
  const i = Math.floor(Math.max(0, metres) / BIOME_M) % BIOME_ORDER.length;
  return BIOME_ORDER[i];
}

type TerrainSet = {
  top: string;
  topLeft: string;
  topRight: string;
  center: string;
  ledgeLeft: string;
  ledgeMid: string;
  ledgeRight: string;
};

const TERRAIN: Record<Biome, TerrainSet> = {
  grass: {
    top: 'terrain_grass_block_top',
    topLeft: 'terrain_grass_block_top_left',
    topRight: 'terrain_grass_block_top_right',
    center: 'terrain_grass_block_center',
    ledgeLeft: 'terrain_grass_horizontal_left',
    ledgeMid: 'terrain_grass_horizontal_middle',
    ledgeRight: 'terrain_grass_horizontal_right',
  },
  sand: {
    top: 'terrain_sand_block_top',
    topLeft: 'terrain_sand_block_top_left',
    topRight: 'terrain_sand_block_top_right',
    center: 'terrain_sand_block_center',
    ledgeLeft: 'terrain_sand_horizontal_left',
    ledgeMid: 'terrain_sand_horizontal_middle',
    ledgeRight: 'terrain_sand_horizontal_right',
  },
  stone: {
    top: 'terrain_stone_block_top',
    topLeft: 'terrain_stone_block_top_left',
    topRight: 'terrain_stone_block_top_right',
    center: 'terrain_stone_block_center',
    ledgeLeft: 'terrain_stone_horizontal_left',
    ledgeMid: 'terrain_stone_horizontal_middle',
    ledgeRight: 'terrain_stone_horizontal_right',
  },
  snow: {
    top: 'terrain_snow_block_top',
    topLeft: 'terrain_snow_block_top_left',
    topRight: 'terrain_snow_block_top_right',
    center: 'terrain_snow_block_center',
    ledgeLeft: 'terrain_snow_horizontal_left',
    ledgeMid: 'terrain_snow_horizontal_middle',
    ledgeRight: 'terrain_snow_horizontal_right',
  },
  purple: {
    top: 'terrain_purple_block_top',
    topLeft: 'terrain_purple_block_top_left',
    topRight: 'terrain_purple_block_top_right',
    center: 'terrain_purple_block_center',
    ledgeLeft: 'terrain_purple_horizontal_left',
    ledgeMid: 'terrain_purple_horizontal_middle',
    ledgeRight: 'terrain_purple_horizontal_right',
  },
  dirt: {
    top: 'terrain_dirt_block_top',
    topLeft: 'terrain_dirt_block_top_left',
    topRight: 'terrain_dirt_block_top_right',
    center: 'terrain_dirt_block_center',
    ledgeLeft: 'terrain_dirt_horizontal_left',
    ledgeMid: 'terrain_dirt_horizontal_middle',
    ledgeRight: 'terrain_dirt_horizontal_right',
  },
};

const BACKDROP: Record<Biome, { far: string; near: string }> = {
  grass: { far: 'background_fade_hills', near: 'background_color_hills' },
  sand: { far: 'background_fade_desert', near: 'background_color_desert' },
  stone: { far: 'background_fade_trees', near: 'background_color_trees' },
  snow: { far: 'background_fade_hills', near: 'background_color_hills' },
  purple: { far: 'background_fade_mushrooms', near: 'background_color_mushrooms' },
  dirt: { far: 'background_fade_trees', near: 'background_color_trees' },
};

const SKY: Record<Biome, [string, string]> = {
  grass: ['#5ab9f0', '#d9f3ff'],
  sand: ['#f7b45c', '#ffeccc'],
  stone: ['#8fa6c4', '#e2ecf6'],
  snow: ['#a8d8f5', '#f4fcff'],
  purple: ['#8f6ede', '#e6dbff'],
  dirt: ['#e0a06a', '#ffeadb'],
};

const SUN_COLOR: Record<Biome, string> = {
  grass: '#fff4ad',
  sand: '#ffd36a',
  stone: '#f2f5ff',
  snow: '#ffffff',
  purple: '#d9e5ff',
  dirt: '#ffbd7a',
};

const BIOME_LABEL: Record<Biome, string> = {
  grass: 'GREENWAY',
  sand: 'SUN DUNES',
  stone: 'OLD RIDGE',
  snow: 'FROST RUN',
  purple: 'MOON GARDEN',
  dirt: 'AUTUMN TRAIL',
};

const DECOR: Record<Biome, string[]> = {
  grass: ['bush', 'mushroom_red', 'rock'],
  sand: ['cactus', 'rock', 'hill'],
  stone: ['rock', 'fence_broken', 'mushroom_brown'],
  snow: ['rock', 'fence', 'bush'],
  purple: ['mushroom_red', 'mushroom_brown', 'grass_purple'],
  dirt: ['mushroom_brown', 'rock', 'bush'],
};

// ===========================================================================
// 4. The component
// ===========================================================================

/** Tiles of ground body kept below the surface. Any more is a wall of dirt. */
const GROUND_ROWS = 2.6;
/** Bounds on where the surface can sit, as a fraction of the play height. */
const GROUND_MIN = 0.6;
const GROUND_MAX = 0.84;

/**
 * Where to put the ground line. A phone in portrait is far taller than a runner
 * needs, so the surface slides DOWN on a tall canvas: reserving a fixed fraction
 * for the ground body turned 40% of the screen into flat dirt.
 */
function groundLine(playH: number, zoom: number): number {
  const want = 1 - (GROUND_ROWS * TILE * zoom) / playH;
  return Math.round(playH * Math.min(GROUND_MAX, Math.max(GROUND_MIN, want)));
}
/**
 * World width we aim to show. A runner has to see what is coming, but a phone in
 * portrait is so narrow that showing 22 tiles renders the character at a few
 * pixels. Narrow canvases therefore show fewer tiles, zoomed in, and put the
 * player further left so the LOOKAHEAD in seconds barely changes.
 */
const VIEW_TILES_WIDE = 22;
const VIEW_TILES_TALL = 15;

function viewTiles(cw: number, playH: number): number {
  return cw / playH < 0.9 ? VIEW_TILES_TALL : VIEW_TILES_WIDE;
}

function camFrac(cw: number, playH: number): number {
  return cw / playH < 0.9 ? 0.22 : 0.3;
}
const MILESTONE_M = 250;
const STATUS_M = 100;

/**
 * Camera x for a player position. Clamped at zero because the world begins at
 * x = 0: without the clamp the first second of every run showed a strip of empty
 * backdrop to the left of where the ground starts.
 */
function cameraFor(px: number, viewW: number, frac: number): number {
  return Math.max(0, px - viewW * frac);
}

type Puff = { x: number; y: number; vx: number; vy: number; life: number; max: number; r: number };
type Spark = { x: number; y: number; vx: number; vy: number; life: number; color: string };
type Note = { x: number; y: number; life: number; text: string };
/** Ambient weather flecks (snow, sand, leaves, spores). Screen space, capped. */
type Amb = { x: number; y: number; vx: number; vy: number; sway: number; r: number; color: string };

/** What falls out of the sky in each biome. Pure decoration, Math.random is fine. */
const WEATHER: Record<Biome, { color: string[]; fall: number; drift: number; rate: number }> = {
  grass: { color: ['#8fd977', '#d8ef86', '#f2f7bd'], fall: 26, drift: 22, rate: 5 },
  sand: { color: ['#f2d38c', '#e8bd6d'], fall: 8, drift: 85, rate: 7 },
  stone: { color: ['#cdd9e4', '#aebccb'], fall: 14, drift: 18, rate: 3 },
  snow: { color: ['#ffffff', '#eaf6ff'], fall: 34, drift: 26, rate: 12 },
  purple: { color: ['#e3b6ff', '#b98cf5', '#ffd6f2'], fall: -12, drift: 16, rate: 6 },
  dirt: { color: ['#d9a066', '#b07945'], fall: 12, drift: 30, rate: 3 },
};

/** Confetti palette for milestones and speed-ups. */
const PARTY = ['#ff5d5d', '#5dff8a', '#5db8ff', '#ffd75e', '#e58cff'];

const TIER_NOTES = ['ZOOM!', 'TURBO!', 'BLAZING!', 'MAX SPEED!'];

type State = {
  seed: number;
  b: Body;
  chunks: Chunk[];
  world: World;
  next: number;
  metres: number;
  coins: number;
  combo: number;
  comboTimer: number;
  coyote: number;
  buffer: number;
  /** Positive squashes on landing, negative stretches on takeoff. */
  squash: number;
  /** 1..0 while the double-jump somersault plays out. */
  spin: number;
  nudge: number;
  animTime: number;
  puffs: Puff[];
  sparks: Spark[];
  notes: Note[];
  ambient: Amb[];
  slowmo: number;
  flash: number;
  hurt: number;
  nextMilestone: number;
  nextStatus: number;
  /** Speed tier already celebrated, so each one fires exactly once. */
  tier: number;
  /** 1..0 scale pop on the combo counter when a coin lands. */
  comboPop: number;
  debt: number;
  speed: number;
};

function emptyWorld(d: Difficulty): World {
  return { spans: [], solids: [], fatals: [], landTol: KNOBS[d].landTol, inset: KNOBS[d].inset };
}

function rebuild(s: State, d: Difficulty) {
  const w = emptyWorld(d);
  for (const c of s.chunks) {
    for (const sp of c.spans) w.spans.push(sp);
    for (const so of c.solids) w.solids.push(so);
    for (const f of c.fatals) w.fatals.push(f);
  }
  s.world = w;
}

function freshState(d: Difficulty, run: number): State {
  const seed = RUN_SEEDS[Math.abs(run) % RUN_SEEDS.length];
  const s: State = {
    seed,
    b: { x: 2 * TILE, y: 0, vy: 0, h: STAND_H, onGround: true, jumps: 0, rise: 0 },
    chunks: [],
    world: emptyWorld(d),
    next: 0,
    metres: 0,
    coins: 0,
    combo: 0,
    comboTimer: 0,
    coyote: 0,
    buffer: 0,
    squash: 0,
    spin: 0,
    nudge: 0,
    animTime: 0,
    puffs: [],
    sparks: [],
    notes: [],
    ambient: [],
    slowmo: 0,
    flash: 0,
    hurt: 0,
    nextMilestone: MILESTONE_M,
    nextStatus: STATUS_M,
    tier: 0,
    comboPop: 0,
    debt: 0,
    speed: speedAt(0, d),
  };
  for (let i = 0; i < 4; i += 1) s.chunks.push(generateChunk(i, d, seed));
  s.next = 4;
  rebuild(s, d);
  return s;
}

function puff(s: State, x: number, y: number, n: number, power: number) {
  for (let i = 0; i < n; i += 1) {
    const a = Math.PI + Math.random() * Math.PI;
    s.puffs.push({
      x,
      y,
      vx: Math.cos(a) * power * (0.4 + Math.random()) - 20,
      vy: Math.sin(a) * power * 0.5,
      life: 0.42,
      max: 0.42,
      r: 2 + Math.random() * 3,
    });
  }
  if (s.puffs.length > 90) s.puffs.splice(0, s.puffs.length - 90);
}

function sparkle(s: State, x: number, y: number, n: number, color = '#fff4bf', life = 0.4) {
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    s.sparks.push({
      x,
      y,
      vx: Math.cos(a) * 60 * (0.4 + Math.random()),
      vy: Math.sin(a) * 60 * (0.4 + Math.random()) - 30,
      life,
      color,
    });
  }
  if (s.sparks.length > 120) s.sparks.splice(0, s.sparks.length - 120);
}

/** A burst of multi-coloured confetti sparks around the player. */
function confetti(s: State, x: number, y: number, n: number) {
  for (let i = 0; i < n; i += 1) {
    sparkle(s, x + (Math.random() - 0.5) * 26, y - Math.random() * 24, 4, PARTY[i % PARTY.length], 0.7);
  }
}

export default function Runner({
  paused,
  input,
  api,
  restartToken,
  difficulty,
  controlsInset,
}: GameCanvasProps) {
  const runRef = useRef(0);
  const stateRef = useRef<State>(freshState(difficulty, 0));
  const sprites = useSprites();
  const spritesRef = useRef<SpriteSet | null>(null);
  useEffect(() => {
    spritesRef.current = sprites;
  }, [sprites]);

  // Difficulty rewrites the geometry, so it rebuilds rather than rescales.
  useEffect(() => {
    runRef.current += 1;
    stateRef.current = freshState(difficulty, runRef.current);
  }, [restartToken, difficulty]);

  const insetRef = useRef(controlsInset);
  useEffect(() => {
    insetRef.current = controlsInset;
  }, [controlsInset]);

  const { canvasRef } = useCanvasGame({
    active: !paused,
    step: (ctx, rawDt, cw, ch) => {
      const s = stateRef.current;
      const b = s.b;
      const k = KNOBS[difficulty];

      // --- view ---
      const playH = Math.max(80, ch - insetRef.current);
      const zoom = Math.max(1, Math.min(4, cw / (viewTiles(cw, playH) * TILE)));
      const viewW = cw / zoom;
      const groundY = groundLine(playH, zoom);

      // --- time ---
      // Slow motion after a near miss. It only ever hands the player MORE time,
      // so the verifier's full-speed reachability proof still holds.
      if (s.slowmo > 0) s.slowmo = Math.max(0, s.slowmo - rawDt);
      const dt = rawDt * (s.slowmo > 0 ? 0.45 : 1);
      s.animTime += dt;
      if (s.flash > 0) s.flash = Math.max(0, s.flash - rawDt * 3);
      if (s.hurt > 0) s.hurt = Math.max(0, s.hurt - rawDt * 1.6);
      if (s.squash !== 0) {
        s.squash -= Math.sign(s.squash) * Math.min(Math.abs(s.squash), dt * 4.5);
      }
      if (s.spin > 0) s.spin = Math.max(0, s.spin - dt * 2.2);
      if (s.comboPop > 0) s.comboPop = Math.max(0, s.comboPop - dt * 3);
      if (s.comboTimer > 0) {
        s.comboTimer -= dt;
        if (s.comboTimer <= 0) s.combo = 0;
      }

      // --- input ---
      if (input.consumeJump()) s.buffer = JUMP_BUFFER;
      // Keyboards and the dpad overlay also deliver 'up' as a queued tap; a side
      // tap is a speed nudge, which is the whole of the `lanes` scheme on touch.
      for (let i = 0; i < 3; i += 1) {
        const tap = input.consumeTap();
        if (!tap) break;
        if (tap === 'up') s.buffer = JUMP_BUFFER;
        else if (tap === 'left') s.nudge = -1;
        else if (tap === 'right') s.nudge = 1;
      }
      if (s.buffer > 0) s.buffer -= dt;
      if (s.coyote > 0) s.coyote -= dt;
      if (s.nudge !== 0) s.nudge -= Math.sign(s.nudge) * Math.min(Math.abs(s.nudge), dt * 2.4);

      const canJump = b.onGround || s.coyote > 0 || b.jumps < MAX_JUMPS;
      const firing = s.buffer > 0 && canJump;
      if (firing) {
        // The second jump gets a full somersault plus a sparkle ring - the
        // rescue move should feel like the coolest thing in the game.
        if (!b.onGround && b.jumps >= 1) {
          s.spin = 1;
          sparkle(s, b.x + PW / 2, b.y - b.h / 2, 8, '#bfe8ff', 0.35);
        }
        s.buffer = 0;
        s.coyote = 0;
        s.squash = -0.7;
        puff(s, b.x + PW / 2, b.y, 4, 45);
        playSound('jump');
      }

      s.speed = speedAt(s.metres, difficulty);
      const held = (input.held.right ? NUDGE : 0) - (input.held.left ? NUDGE : 0);
      const bend = Math.max(-NUDGE, Math.min(NUDGE, held + s.nudge * NUDGE));

      const before = b.x;
      const out = stepPlayer(
        s.world,
        b,
        { vx: s.speed * (1 + bend), jump: firing, jumpHeld: input.jumpHeld, duck: input.held.down },
        dt,
      );
      if (out.leftGround && b.vy >= 0) s.coyote = COYOTE;
      if (b.onGround) s.spin = 0;
      if (out.landed > 150) {
        s.squash = Math.min(1, out.landed / 600);
        puff(s, b.x + PW / 2, b.y, 6, 55);
        playSound('land');
      }
      if (out.bonked) puff(s, b.x + PW / 2, b.y - b.h, 4, 35);

      // --- distance and score ---
      const advanced = (b.x - before) / TILE;
      s.metres += advanced;
      s.debt += advanced;
      // Batched, because addScore is a React setState and this runs every frame.
      while (s.debt >= 10) {
        s.debt -= 10;
        api.addScore(10);
      }

      // --- speed tiers ---
      // The ramp is continuous, so mark the moments it crosses a quarter of the
      // range: a named celebration makes "it is getting faster" a reward rather
      // than a creeping threat.
      const hotNow = Math.max(0, Math.min(1, (s.speed - BASE_SPEED) / (SPEED_CAP - BASE_SPEED)));
      const tierNow = Math.min(4, Math.floor(hotNow * 4));
      if (tierNow > s.tier) {
        s.tier = tierNow;
        s.notes.push({
          x: b.x + PW / 2,
          y: b.y - b.h - 18,
          life: 1.1,
          text: TIER_NOTES[Math.min(tierNow, TIER_NOTES.length) - 1],
        });
        confetti(s, b.x + PW / 2, b.y - b.h, 4);
        s.flash = 0.5;
        playSound('powerup');
      }

      // --- streaming ---
      const camX = cameraFor(b.x, viewW, camFrac(cw, playH));
      let dirty = false;
      while (s.next * CHUNK_W < camX + viewW + CHUNK_W * 1.5) {
        s.chunks.push(generateChunk(s.next, difficulty, s.seed));
        s.next += 1;
        dirty = true;
      }
      while (s.chunks.length > 0 && s.chunks[0].x1 < camX - CHUNK_W * 0.5) {
        s.chunks.shift();
        dirty = true;
      }
      if (dirty) rebuild(s, difficulty);

      // --- coins ---
      for (const c of s.chunks) {
        for (const co of c.coins) {
          if (co.taken) continue;
          if (co.x < b.x - 40 || co.x > b.x + 60) continue;
          if (!coinTouched(b, co)) continue;
          co.taken = true;
          s.coins += 1;
          s.combo += 1;
          s.comboTimer = 1.6;
          s.comboPop = 1;
          sparkle(s, co.x, co.y, 6);
          api.addScore(10 + Math.min(s.combo, 10));
          playSound('coin', s.combo - 1);
        }
      }

      // --- near miss ---
      // Rewards threading a hazard rather than over-jumping everything, and the
      // slow-motion beat is the best-looking moment in the game.
      const rx = b.x + k.inset;
      const ry = b.y - b.h + k.inset;
      const rw = PW - k.inset * 2;
      const rh = b.h - k.inset * 2;
      for (const f of s.world.fatals) {
        if (f.graze) continue;
        const box = fatalBox(f, b.x);
        if (box.x + box.w < b.x - 30 || box.x > b.x + 30) continue;
        const dx = Math.max(box.x - (rx + rw), rx - (box.x + box.w));
        const dy = Math.max(box.y - (ry + rh), ry - (box.y + box.h));
        const clearance = Math.max(dx, dy);
        if (clearance >= 0 && clearance < 7) {
          f.graze = true;
          s.slowmo = 0.26;
          s.flash = 1;
          s.notes.push({ x: b.x, y: b.y - b.h - 12, life: 0.85, text: 'NICE!' });
          api.addScore(15);
        }
      }

      // --- ambient weather ---
      // A handful of biome-coloured flecks drifting through the screen: snow in
      // the snow band, blowing sand in the desert, rising spores in the purple
      // night. Screen-space, hard-capped, pure decoration (Math.random is fine
      // here - nothing the verifier replays depends on it).
      {
        const wx = WEATHER[biomeAt(s.metres)];
        if (s.ambient.length < 46 && Math.random() < wx.rate * dt) {
          const down = wx.fall >= 0;
          s.ambient.push({
            x: Math.random() * (cw + 60) - 20,
            y: down ? -8 : playH + 6,
            vx: -(wx.drift + s.speed * zoom * 0.14) * (0.6 + Math.random() * 0.8),
            vy: wx.fall * (0.6 + Math.random() * 0.8),
            sway: Math.random() * Math.PI * 2,
            r: 1.4 + Math.random() * 1.4,
            color: wx.color[Math.floor(Math.random() * wx.color.length)],
          });
        }
        for (const a of s.ambient) {
          a.x += a.vx * dt;
          a.y += (a.vy + Math.sin(s.animTime * 2 + a.sway) * 9) * dt;
        }
        s.ambient = s.ambient.filter((a) => a.x > -30 && a.y < playH + 12 && a.y > -32);
      }

      // --- effects ---
      for (const p of s.puffs) {
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy -= 40 * dt;
      }
      s.puffs = s.puffs.filter((p) => p.life > 0);
      for (const p of s.sparks) {
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 220 * dt;
      }
      s.sparks = s.sparks.filter((p) => p.life > 0);
      for (const n of s.notes) {
        n.life -= dt;
        n.y -= 26 * dt;
      }
      s.notes = s.notes.filter((n) => n.life > 0);

      // --- milestones ---
      if (s.metres >= s.nextStatus) {
        const at = Math.floor(s.metres / STATUS_M) * STATUS_M;
        s.nextStatus = at + STATUS_M;
        if (at % MILESTONE_M !== 0) api.setStatus(`${at} m`);
      }
      if (s.metres >= s.nextMilestone) {
        const at = s.nextMilestone;
        s.nextMilestone = at + MILESTONE_M;
        confetti(s, b.x + PW / 2, b.y - b.h, 6);
        s.flash = 0.6;
        playSound('levelClear');
        api.requestGate(`${at} m!`);
        draw(ctx, s, spritesRef.current, cw, ch, playH, zoom, viewW, groundY);
        return;
      }

      // --- death ---
      // api.died may be absorbed by a free pass and never pause anything, so the
      // run has to reset itself either way. A new run means a new seed.
      if (out.crashed || out.fell) {
        playSound('gameOver');
        api.died(out.fell ? 'You fell in' : 'You crashed');
        runRef.current += 1;
        const fresh = freshState(difficulty, runRef.current);
        fresh.hurt = 1;
        stateRef.current = fresh;
        draw(ctx, fresh, spritesRef.current, cw, ch, playH, zoom, viewW, groundY);
        return;
      }

      draw(ctx, s, spritesRef.current, cw, ch, playH, zoom, viewW, groundY);
    },
  });

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />;
}

// ===========================================================================
// 5. Rendering
// ===========================================================================

function mixHex(a: string, b: string, t: number): string {
  const pa = [
    parseInt(a.slice(1, 3), 16),
    parseInt(a.slice(3, 5), 16),
    parseInt(a.slice(5, 7), 16),
  ];
  const pb = [
    parseInt(b.slice(1, 3), 16),
    parseInt(b.slice(3, 5), 16),
    parseInt(b.slice(5, 7), 16),
  ];
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Cheap stable hash, so scenery placed by column never flickers. */
function hash(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function draw(
  ctx: CanvasRenderingContext2D,
  s: State,
  sp: SpriteSet | null,
  cw: number,
  ch: number,
  playH: number,
  zoom: number,
  viewW: number,
  groundY: number,
) {
  const b = s.b;
  const camX = cameraFor(b.x, viewW, camFrac(cw, playH));
  const m = s.metres;

  // Biome cross-fade: the sky lerps across the last stretch of each band, so the
  // change arrives as weather rather than as a cut.
  const here = biomeAt(m);
  const soon = biomeAt(m + BIOME_M);
  const into = (Math.max(0, m) % BIOME_M) / BIOME_M;
  const fade = into > 0.82 ? (into - 0.82) / 0.18 : 0;

  const sky = ctx.createLinearGradient(0, 0, 0, playH);
  sky.addColorStop(0, mixHex(SKY[here][0], SKY[soon][0], fade));
  sky.addColorStop(1, mixHex(SKY[here][1], SKY[soon][1], fade));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, cw, ch);

  if (!sp) {
    ctx.fillStyle = '#3f7a3f';
    ctx.fillRect(0, groundY, cw, ch - groundY);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.font = 'bold 13px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('loading art', cw / 2, playH / 2);
    ctx.textAlign = 'left';
    return;
  }

  // --- parallax, in SCREEN space ---------------------------------------
  // Anchoring these to the world leaves a hard seam where the backdrop stops and
  // raw sky begins (the bug that bit Platformer). Each band is clipped to the
  // strip its scenery lives in, and the sky gradient is multiplied over the lot
  // afterwards, which turns the art's own white sky and every gap between bands
  // into the same graded sky. No seams, and each biome gets its own light.
  const band = (name: string, factor: number, alpha: number, top: number, bottom: number) => {
    const f = sp.backgrounds.frames[name];
    if (!f) return;
    const y0 = playH * top;
    const bandH = playH * bottom - y0;
    if (bandH <= 0) return;
    // Tile width and step are rounded, and each copy is drawn one pixel wide of
    // its slot. Fractional positions left a visible 1px seam scrolling across the
    // sky where two copies met.
    const w = Math.max(2, Math.round(playH * (f[2] / f[3])));
    const off = -(((Math.round(camX * factor * zoom) % w) + w) % w) - w;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y0, cw, bandH);
    ctx.clip();
    ctx.globalAlpha = alpha;
    for (let x = off; x < cw + w; x += w) {
      drawFrame(ctx, sp.backgrounds, name, x, 0, w + 1, playH);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  };

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cw, playH);
  band(BACKDROP[here].far, 0.1, 1, 0, 1);
  if (fade > 0) band(BACKDROP[soon].far, 0.1, fade, 0, 1);
  band('background_clouds', 0.24, 0.42, 0, 0.5);
  // The near band starts at the half-way line, which is where this art's own
  // hilltops fall. Clipping it lower cuts the hilltops off and leaves a flat
  // green rectangle with a ruler-straight top edge.
  band(BACKDROP[here].near, 0.42, 1, 0.5, 1);
  if (fade > 0) band(BACKDROP[soon].near, 0.42, fade, 0.5, 1);

  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, cw, playH);
  ctx.globalCompositeOperation = 'source-over';

  // The atlas backdrops are opaque, so stacking more of them to fill a tall
  // portrait sky just paints over the ones behind. These are drawn instead:
  // a sun and two parallax cloud layers, both procedural, both above the
  // backdrop's own horizon, which is where the empty band was.
  const skyH = groundY;
  ctx.fillStyle = SUN_COLOR[here];
  ctx.shadowColor = SUN_COLOR[here];
  ctx.shadowBlur = Math.max(16, skyH * 0.08);
  ctx.globalAlpha = here === 'purple' ? 0.72 : 0.5;
  ctx.beginPath();
  ctx.arc(cw * 0.78, skyH * 0.16, Math.max(14, skyH * 0.055), 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.1;
  ctx.beginPath();
  ctx.arc(cw * 0.78, skyH * 0.16, Math.max(26, skyH * 0.11), 0, Math.PI * 2);
  ctx.fill();

  // The purple biome is the game's "night": a field of twinkling stars above
  // the horizon, fading in with the biome cross-fade.
  const starA = here === 'purple' ? 1 - fade : soon === 'purple' ? fade : 0;
  if (starA > 0.02) {
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 26; i += 1) {
      const sx = hash(i * 53 + 9) * cw;
      const sy = hash(i * 29 + 3) * groundY * 0.55;
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(s.animTime * 1.7 + i * 1.9));
      ctx.globalAlpha = starA * tw * 0.85;
      ctx.fillRect(sx, sy, 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  for (const layer of [0, 1]) {
    const factor = layer === 0 ? 0.09 : 0.19;
    const spanW = cw + 320;
    ctx.globalAlpha = layer === 0 ? 0.3 : 0.46;
    for (let i = 0; i < 7; i += 1) {
      const seedX = hash(i * 97 + layer * 31) * spanW;
      const x = ((seedX - camX * factor * zoom) % spanW + spanW) % spanW - 160;
      const y = skyH * (0.05 + hash(i * 41 + layer * 17) * (layer === 0 ? 0.38 : 0.5));
      const r = Math.max(9, skyH * (0.028 + hash(i * 13 + layer) * 0.035));
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.arc(x + r * 0.9, y + r * 0.15, r * 0.78, 0, Math.PI * 2);
      ctx.arc(x - r * 0.85, y + r * 0.2, r * 0.66, 0, Math.PI * 2);
      ctx.arc(x + r * 0.2, y - r * 0.5, r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // A soft cinematic grade binds the sprite layers together and makes each
  // biome feel like its own chapter rather than a palette swap.
  const grade = ctx.createLinearGradient(0, 0, cw, playH);
  grade.addColorStop(0, here === 'purple' ? 'rgba(100,75,180,.13)' : 'rgba(255,235,175,.08)');
  grade.addColorStop(0.55, 'rgba(255,255,255,0)');
  grade.addColorStop(1, here === 'snow' ? 'rgba(150,215,255,.08)' : 'rgba(36,20,82,.08)');
  ctx.fillStyle = grade;
  ctx.fillRect(0, 0, cw, playH);

  // --- world ------------------------------------------------------------
  // Whole screen pixels, so the tile grid does not shimmer as it scrolls.
  ctx.save();
  ctx.translate(-Math.round(camX * zoom), groundY);
  ctx.scale(zoom, zoom);

  const left = camX - TILE;
  const right = camX + viewW + TILE;
  const col0 = Math.floor(left / TILE);
  const col1 = Math.ceil(right / TILE);
  // Rows needed to reach the bottom of the canvas. The ground body fills
  // everything under the surface, so there is never an empty band down there.
  const belowRows = Math.ceil((ch - groundY) / zoom / TILE) + 1;

  const solidCol = (tx: number) => {
    const cx = tx * TILE + TILE / 2;
    for (const span of s.world.spans) if (cx > span.x0 && cx < span.x1) return true;
    return false;
  };

  // Pit interiors first: a dark shaft with a spiked floor, so a gap reads as
  // lethal rather than decorative.
  for (const c of s.chunks) {
    for (let i = 1; i < c.spans.length; i += 1) {
      const gx0 = c.spans[i - 1].x1;
      const gx1 = c.spans[i].x0;
      if (gx1 < left || gx0 > right) continue;
      ctx.fillStyle = 'rgba(8,10,24,0.9)';
      ctx.fillRect(gx0, 0, gx1 - gx0, belowRows * TILE);
      for (let x = gx0; x < gx1 - 1; x += TILE) {
        drawFrame(ctx, sp.tiles, 'spikes', x, FATAL_DEPTH - TILE * 0.6, TILE, TILE);
      }
    }
  }

  for (let tx = col0; tx <= col1; tx += 1) {
    if (!solidCol(tx)) continue;
    const t = TERRAIN[biomeAt(tx)];
    const topName = !solidCol(tx - 1) ? t.topLeft : !solidCol(tx + 1) ? t.topRight : t.top;
    drawFrame(ctx, sp.tiles, topName, tx * TILE, 0, TILE, TILE);
    for (let r = 1; r < belowRows; r += 1) {
      drawFrame(ctx, sp.tiles, t.center, tx * TILE, r * TILE, TILE, TILE);
    }
  }
  // Depth: the ground body darkens the further below the surface it goes.
  // Buried rocks and gems, so a deep ground body reads as underground rather
  // than as one tile repeated.
  for (let tx = col0; tx <= col1; tx += 1) {
    for (let r = 2; r < belowRows; r += 1) {
      const hv = hash(tx * 733 + r * 51);
      if (hv > 0.07 || !solidCol(tx)) continue;
      ctx.globalAlpha = 0.5;
      drawFrame(
        ctx,
        sp.tiles,
        hv < 0.02 ? 'gem_blue' : 'rock',
        tx * TILE + 2,
        r * TILE + 2,
        TILE - 4,
        TILE - 4,
      );
      ctx.globalAlpha = 1;
    }
  }
  const shade = ctx.createLinearGradient(0, TILE, 0, belowRows * TILE);
  shade.addColorStop(0, 'rgba(10,6,26,0)');
  shade.addColorStop(1, 'rgba(10,6,26,0.8)');
  ctx.fillStyle = shade;
  ctx.fillRect(camX - TILE, TILE, viewW + TILE * 2, belowRows * TILE);

  // Scenery along the surface line.
  for (let tx = col0; tx <= col1; tx += 1) {
    if (hash(tx * 31 + 7) > 0.13 || !solidCol(tx)) continue;
    let clear = true;
    for (const so of s.world.solids) {
      if (tx * TILE + TILE > so.x - 4 && tx * TILE < so.x + so.w + 4) clear = false;
    }
    for (const f of s.world.fatals) {
      // Every hazard sits on the ground now, so scenery keeps clear of them all.
      if (tx * TILE + TILE > f.x - f.ampX - 6 && tx * TILE < f.x + f.w + f.ampX + 6) clear = false;
    }
    if (!clear) continue;
    const list = DECOR[biomeAt(tx)];
    drawFrame(
      ctx,
      sp.tiles,
      list[Math.floor(hash(tx * 977) * list.length) % list.length],
      tx * TILE,
      -TILE,
      TILE,
      TILE,
    );
  }

  for (const so of s.world.solids) {
    if (so.x + so.w < left || so.x > right) continue;
    const t = TERRAIN[biomeAt(so.x / TILE)];
    const cols = Math.max(1, Math.round(so.w / TILE));
    if (so.kind === 'ledge') {
      for (let i = 0; i < cols; i += 1) {
        const name = i === 0 ? t.ledgeLeft : i === cols - 1 ? t.ledgeRight : t.ledgeMid;
        drawFrame(ctx, sp.tiles, name, so.x + i * TILE, so.y, TILE, TILE);
      }
      continue;
    }
    const rows = Math.max(1, Math.round(so.h / TILE));
    for (let cx = 0; cx < cols; cx += 1) {
      for (let cy = 0; cy < rows; cy += 1) {
        drawFrame(
          ctx,
          sp.tiles,
          cy === 0 ? 'block_planks' : 'brick_brown',
          so.x + cx * TILE,
          so.y + cy * TILE,
          TILE,
          TILE,
        );
      }
    }
  }

  for (const f of s.world.fatals) {
    const box = fatalBox(f, b.x);
    if (box.x + box.w < left || box.x > right) continue;
    const cols = Math.max(1, Math.round(box.w / TILE));
    if (f.kind === 'spike') {
      for (let i = 0; i < cols; i += 1) {
        drawFrame(ctx, sp.tiles, 'spikes', box.x + i * TILE, box.y - TILE * 0.45, TILE, TILE);
      }
    } else if (f.kind === 'beam') {
      // A grounded pillar: spiked cap on top, brick below. Reads as "hop me".
      const rows = Math.max(1, Math.round(box.h / TILE));
      for (let i = 0; i < cols; i += 1) {
        for (let r = 0; r < rows; r += 1) {
          drawFrame(
            ctx,
            sp.tiles,
            r === 0 ? 'block_spikes' : 'brick_grey',
            box.x + i * TILE,
            box.y + r * TILE,
            TILE,
            TILE,
          );
        }
      }
    } else if (f.kind === 'saw') {
      ctx.save();
      ctx.translate(box.x + box.w / 2, box.y + box.h / 2);
      ctx.rotate(b.x * 0.06);
      drawFrame(
        ctx,
        sp.enemies,
        animFrame(['saw_a', 'saw_b'], s.animTime, 16),
        -box.w / 2 - 2,
        -box.h / 2 - 2,
        box.w + 4,
        box.h + 4,
      );
      ctx.restore();
    } else {
      drawFrame(
        ctx,
        sp.enemies,
        animFrame(['fly_a', 'fly_b'], s.animTime, 14),
        box.x - 2,
        box.y - 2,
        box.w + 4,
        box.h + 4,
      );
    }
  }

  const coinName = animFrame(
    ['coin_gold', 'coin_gold', 'coin_gold_side', 'coin_gold_side'],
    s.animTime,
    7,
  );
  for (const c of s.chunks) {
    for (const co of c.coins) {
      if (co.taken || co.x < left || co.x > right) continue;
      const bob = Math.sin(s.animTime * 3.4 + co.x * 0.06) * 1.6;
      drawFrame(ctx, sp.tiles, coinName, co.x - 6, co.y - 6 + bob, 12, 12);
    }
  }

  // Player: squash on landing, stretch on takeoff, lean with vertical speed.
  // The character frames are SQUARE, so the destination box has to be square too
  // or the little guy renders as a stretched blob.
  const sq = s.squash;
  const side = b.h * 1.4;
  const dw = side * (1 + Math.max(0, sq) * 0.3 - Math.max(0, -sq) * 0.18);
  const dh = side * (1 - Math.max(0, sq) * 0.26 + Math.max(0, -sq) * 0.2);
  let frame = animFrame(['character_beige_walk_a', 'character_beige_walk_b'], s.animTime, 13);
  if (!b.onGround) frame = 'character_beige_jump';
  else if (b.h < STAND_H) frame = 'character_beige_duck';
  ctx.save();
  ctx.translate(b.x + PW / 2, b.y - (s.spin > 0 ? dh / 2 : 0));
  // Lean with vertical speed; a double jump overrides that with a full forward
  // somersault around the body centre.
  ctx.rotate(
    s.spin > 0
      ? (1 - s.spin) * Math.PI * 2
      : Math.max(-0.16, Math.min(0.16, b.vy / 2600)),
  );
  drawFrame(ctx, sp.characters, frame, -dw / 2, s.spin > 0 ? -dh / 2 : -dh, dw, dh);
  ctx.restore();

  for (const p of s.puffs) {
    ctx.globalAlpha = Math.max(0, p.life / p.max) * 0.7;
    ctx.fillStyle = '#f4efe2';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * (1.6 - p.life / p.max), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const p of s.sparks) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 0.4));
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - 1.2, p.y - 1.2, 2.6, 2.6);
  }
  ctx.globalAlpha = 1;

  ctx.font = 'bold 9px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff0a8';
  for (const n of s.notes) {
    ctx.globalAlpha = Math.max(0, n.life / 0.85);
    ctx.fillText(n.text, n.x, n.y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';

  ctx.restore();

  // --- screen-space juice ----------------------------------------------
  for (const a of s.ambient) {
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = a.color;
    ctx.fillRect(a.x, a.y, a.r, a.r);
  }
  ctx.globalAlpha = 1;

  const hot = Math.max(0, Math.min(1, (s.speed - BASE_SPEED) / (SPEED_CAP - BASE_SPEED)));
  if (hot > 0.05) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 16; i += 1) {
      const y = hash(i * 13 + 5) * playH;
      const len = 40 + hash(i * 29) * 130 * hot;
      const x = cw - ((s.animTime * (300 + hot * 900) + hash(i * 71) * cw * 2) % (cw + len));
      ctx.globalAlpha = 0.05 + hot * 0.16;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + len, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  if (s.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${s.flash * 0.3})`;
    ctx.fillRect(0, 0, cw, ch);
  }
  if (s.hurt > 0) {
    const vig = ctx.createRadialGradient(cw / 2, ch / 2, ch * 0.2, cw / 2, ch / 2, ch * 0.78);
    vig.addColorStop(0, 'rgba(180,20,20,0)');
    vig.addColorStop(1, `rgba(150,10,10,${s.hurt * 0.75})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, cw, ch);
  }

  // --- HUD across the top. The shell's status banner owns the centre. ---
  ctx.fillStyle = 'rgba(0,0,0,0.24)';
  ctx.fillRect(0, 0, cw, 26);
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.font = 'bold 13px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(`${Math.floor(s.metres)} m`, 10, 18);
  ctx.textAlign = 'right';
  ctx.fillText(`${s.coins} coins`, cw - 10, 18);
  // Combo counter: pops when a coin lands, heats up as the chain grows. The
  // rising coin pitch is the ear's half; this is the eye's half.
  if (s.combo >= 3) {
    const pop = 1 + s.comboPop * 0.45;
    ctx.fillStyle = s.combo >= 8 ? '#ffb066' : '#ffd75e';
    ctx.font = `bold ${Math.round(11 * pop)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillText(`COMBO x${s.combo}`, cw - 10, 40);
    ctx.font = 'bold 13px ui-sans-serif, system-ui, sans-serif';
  }
  ctx.textAlign = 'left';

  ctx.fillStyle = 'rgba(255,255,255,.62)';
  ctx.font = '900 8px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(BIOME_LABEL[here], 78, 18);

  // Speed meter, so the ramp is something the player can watch coming. Kept
  // top-LEFT: the shell floats its own status banner across the top centre.
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fillRect(10, 21, 62, 3);
  ctx.fillStyle = hot > 0.72 ? '#ff8f5d' : '#ffd75e';
  ctx.fillRect(10, 21, 62 * Math.max(0.05, hot), 3);

  const vignette = ctx.createRadialGradient(
    cw / 2,
    playH * 0.44,
    playH * 0.22,
    cw / 2,
    playH * 0.44,
    Math.max(cw, playH) * 0.72,
  );
  vignette.addColorStop(0, 'rgba(8,6,20,0)');
  vignette.addColorStop(1, 'rgba(8,6,20,.16)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, cw, playH);
}
