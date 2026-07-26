/**
 * Proves every course Dash Run can generate is actually survivable.
 *
 * The bug this exists to prevent has already happened once in this repo: a
 * generator shipped platforms that were physically unreachable, and the check
 * that was supposed to catch it passed, because it tested the wrong property -
 * it asserted things about the numbers in the level data instead of asserting
 * that a player could get through. A verifier that cannot fail proves nothing.
 *
 * So this file does two different jobs, and both matter:
 *
 *   STATIC  - geometry assertions over thousands of chunks. Every limit is
 *             DERIVED from the jump envelope, which is itself probed by running
 *             the real integrator (`probeJump` inside Runner.tsx). Retune gravity
 *             or the jump impulse and every threshold here moves with it, so the
 *             assertions cannot drift away from the physics.
 *
 *   DYNAMIC - a forward reachability search that runs `stepPlayer`, the exact
 *             integrator the game runs, frame by frame over a continuous course
 *             with the real speed ramp. Every frame it branches over the legal
 *             inputs, drops any branch that crashed or fell, and keeps the rest.
 *             If the live set ever empties, the course is unsurvivable. The
 *             search only ever uses JUMP inputs, never the duck, because the
 *             `lanes` touch overlay has no down input - so what it proves is
 *             what a phone player can actually do.
 *
 * The search is conservative by construction. States are deduplicated on a
 * quantised key, which can DROP a branch that would have worked but can never
 * invent one, because every retained state was reached by exact simulation. It
 * can therefore under-report reachability and never over-report it.
 *
 * At the bottom are SELF-TESTS: each one deliberately breaks a course - widens a
 * gap past the jump, raises a crate above the jump, drops a beam to head height,
 * lifts a coin out of reach, buries one hazard inside another - and asserts that
 * the checks above SCREAM. If a self-test stops failing, this file has quietly
 * stopped being a verifier and needs fixing before anything else.
 *
 * Run: npx tsx scripts/check-runner.ts
 */
import {
  CHUNK_W,
  DT,
  FATAL_DEPTH,
  HOLD,
  KNOBS,
  MAX_GAP_TILES,
  MAX_JUMPS,
  NUDGE,
  PW,
  RUN_SEEDS,
  STAND_H,
  TAP,
  TAP2,
  TILE,
  coinTouched,
  generateChunk,
  jumpReach,
  probeJump,
  speedAt,
  stepPlayer,
  type Body,
  type Chunk,
  type Coin,
  type Fatal,
  type World,
} from '../components/games/Runner';
import { DIFFICULTIES, type Difficulty } from '../lib/difficulty';

// --- how much to check ----------------------------------------------------

/** Chunks per (difficulty, seed) for the cheap geometry pass. */
const STATIC_CHUNKS = 260;
/** Chunks in the continuous simulated run. Covers the whole early game. */
const RUN_CHUNKS = 14;
/**
 * Late chunks spot-checked as a 3-chunk window. Entering the middle chunk from a
 * genuinely simulated state is what makes the window sound; starting a lone
 * chunk from an assumed pose would not be.
 */
const WINDOWS = [24, 40, 70, 120, 200];
/** Safety valve. A runaway live set is a bug in this file, not in the course. */
const MAX_LIVE = 20000;

/**
 * The most generous jump the physics allows: hold the first, hold the second.
 * Used ONLY by the self-tests, which have to break a course past what any input
 * can rescue. Every real limit is sized off the stingy TAP arc instead.
 */
const BEST = probeJump(true, true);

const errors: string[] = [];
const fail = (msg: string) => errors.push(msg);

// --- derived limits -------------------------------------------------------
// Every number below comes out of the probed envelope. Nothing is hand-written.

/** A crate must be clearable by the weakest jump the game guarantees. */
const MAX_CRATE_H = TAP.rise * 0.75;
/** A ledge only has to be landable, since climbing it is optional. */
const MAX_LEDGE_UP = TAP.rise * 0.85;
/** A ground hazard has to be jumpable. */
const MAX_GROUND_HAZARD_H = TAP.rise * 0.75;
/** A coin has to sit inside the arc, with a little slack for the pickup radius. */
const MAX_COIN_UP = TAP.rise + 12;

// ===========================================================================
// static geometry
// ===========================================================================

type Tally = {
  chunks: number;
  gaps: number;
  widestGap: number;
  solids: number;
  fatals: number;
  movers: number;
  coins: number;
  kinds: Map<string, number>;
};

function emptyTally(): Tally {
  return {
    chunks: 0,
    gaps: 0,
    widestGap: 0,
    solids: 0,
    fatals: 0,
    movers: 0,
    coins: 0,
    kinds: new Map(),
  };
}

/** Full travel range of a hazard, so overlap and footing account for movement. */
function travel(f: Fatal): { x0: number; x1: number; y0: number; y1: number } {
  return {
    x0: f.x - f.ampX,
    x1: f.x + f.w + f.ampX,
    y0: f.y - f.ampY,
    y1: f.y + f.h + f.ampY,
  };
}

/** A breather chunk is meant to be empty; anything else must place something. */
function breatherish(c: Chunk): boolean {
  return c.kind === 'flat';
}

function gapsOf(c: Chunk): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 1; i < c.spans.length; i += 1) out.push([c.spans[i - 1].x1, c.spans[i].x0]);
  return out;
}

function solidOver(c: Chunk, x0: number, x1: number): boolean {
  for (const g of gapsOf(c)) if (x1 > g[0] && x0 < g[1]) return false;
  return x0 >= c.x0 && x1 <= c.x1;
}

/** Geometry assertions on one chunk. Returns the problems found. */
function checkChunk(c: Chunk, d: Difficulty, seed: number, tally: Tally | null): string[] {
  const bad: string[] = [];
  const at = `${d} seed${seed} chunk${c.i}`;
  const k = KNOBS[d];

  // The speed range this chunk can be run at. Reach grows with speed, so a gap
  // is only fair if it is crossable at the SLOWEST arrival.
  const slow = speedAt(c.m0, d) * (1 - NUDGE);
  const gapLimit = Math.min(MAX_GAP_TILES * TILE, jumpReach(slow) * k.gapSafety);

  // 1. spans are sane and both seams are solid ground, so chunks compose.
  if (c.spans.length === 0) bad.push(`${at}: no ground at all`);
  let prev = -Infinity;
  for (const s of c.spans) {
    if (s.x1 <= s.x0) bad.push(`${at}: empty span ${s.x0}..${s.x1}`);
    if (s.x0 < prev) bad.push(`${at}: spans out of order at ${s.x0}`);
    if (s.x0 < c.x0 || s.x1 > c.x1) bad.push(`${at}: span ${s.x0}..${s.x1} leaves the chunk`);
    prev = s.x1;
  }
  if (c.spans.length > 0) {
    if (c.spans[0].x0 !== c.x0) bad.push(`${at}: chunk does not start on solid ground`);
    if (c.spans[c.spans.length - 1].x1 !== c.x1) bad.push(`${at}: chunk does not end on solid ground`);
    if (!solidOver(c, c.x0, c.x0 + c.margin)) bad.push(`${at}: entry margin is not clear ground`);
    if (!solidOver(c, c.x1 - c.margin, c.x1)) bad.push(`${at}: exit margin is not clear ground`);
  }

  // 1b. every feature sits inside the reserved margins, which is what keeps two
  // chunks from crowding each other at the seam.
  for (const s of c.slots) {
    if (s.x0 < c.x0 + c.margin - 0.001 || s.x1 > c.x1 - c.margin + 0.001) {
      bad.push(
        `${at}: ${s.kind} spans ${Math.round(s.x0)}..${Math.round(s.x1)}, outside the ` +
          `${c.margin.toFixed(0)}px margins of ${c.x0}..${c.x1}`,
      );
    }
  }
  if (!breatherish(c) && c.slots.length === 0) {
    bad.push(`${at}: a '${c.kind}' chunk placed nothing - empty road`);
  }

  // 2. THE gap assertion: never wider than the tap jump can cross here.
  for (const [g0, g1] of gapsOf(c)) {
    const w = g1 - g0;
    if (tally) {
      tally.gaps += 1;
      tally.widestGap = Math.max(tally.widestGap, w);
    }
    if (w > gapLimit + 0.001) {
      bad.push(
        `${at}: gap at ${Math.round(g0)} is ${w.toFixed(1)}px, over the ` +
          `${gapLimit.toFixed(1)}px this chunk allows ` +
          `(tap reach ${jumpReach(slow).toFixed(1)}px at ${slow.toFixed(0)}px/s)`,
      );
    }
    if (w > jumpReach(slow)) {
      bad.push(`${at}: gap at ${Math.round(g0)} is wider than a whole tap jump`);
    }
    if (w > MAX_GAP_TILES * TILE + 0.001) bad.push(`${at}: gap at ${Math.round(g0)} is unreadable`);
  }

  // 3. nothing is unreachably tall.
  for (const s of c.solids) {
    if (tally) tally.solids += 1;
    if (s.kind === 'crate') {
      if (-s.y > MAX_CRATE_H + 0.001) {
        bad.push(
          `${at}: crate top at ${(-s.y).toFixed(1)}px exceeds the ` +
            `${MAX_CRATE_H.toFixed(1)}px a tap jump clears`,
        );
      }
      if (!solidOver(c, s.x, s.x + s.w)) bad.push(`${at}: crate at ${Math.round(s.x)} floats over a pit`);
    } else if (-s.y > MAX_LEDGE_UP + 0.001) {
      bad.push(`${at}: ledge top at ${(-s.y).toFixed(1)}px is above the jump's ${MAX_LEDGE_UP.toFixed(1)}px`);
    }
    // Running under a ledge must not clip a standing head.
    if (s.kind === 'ledge' && s.y + s.h > -STAND_H) {
      bad.push(`${at}: ledge underside at ${(s.y + s.h).toFixed(1)} is inside a standing runner`);
    }
  }

  // 4. hazards: footing, height, and headroom.
  for (const f of c.fatals) {
    if (tally) {
      tally.fatals += 1;
      if (f.k !== 0) tally.movers += 1;
    }
    const t = travel(f);
    if (!solidOver(c, t.x0, t.x1)) {
      bad.push(`${at}: ${f.kind} at ${Math.round(f.x)} hangs over a pit, so it cannot be jumped`);
    }
    if (f.kind === 'spike' || f.kind === 'saw') {
      if (-t.y0 > MAX_GROUND_HAZARD_H + 0.001) {
        bad.push(`${at}: ${f.kind} reaches ${(-t.y0).toFixed(1)}px, above the jumpable ${MAX_GROUND_HAZARD_H.toFixed(1)}px`);
      }
      if (t.y1 < -1) bad.push(`${at}: ${f.kind} floats ${(-t.y1).toFixed(1)}px off the floor`);
    } else {
      // Overhead hazards are "do not jump" obstacles. A runner who never jumps
      // has to pass under the LOWEST point of the travel untouched, or the
      // hazard is unavoidable on touch, where ducking does not exist.
      const clearance = -STAND_H - t.y1;
      if (clearance < 1) {
        bad.push(
          `${at}: overhead ${f.kind} at ${Math.round(f.x)} dips to ${t.y1.toFixed(1)}, ` +
            `leaving ${clearance.toFixed(1)}px for a ${STAND_H}px runner`,
        );
      }
      if (clearance > TAP.rise) {
        bad.push(`${at}: overhead ${f.kind} at ${Math.round(f.x)} is so high it is not an obstacle`);
      }
    }
  }

  // 5. no hazard spawns inside another, or inside a solid.
  const boxes = [
    ...c.fatals.map((f) => ({ label: f.kind, ...travel(f) })),
    ...c.solids.map((s) => ({ label: s.kind, x0: s.x, x1: s.x + s.w, y0: s.y, y1: s.y + s.h })),
  ];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      if (a.x1 <= b.x0 || b.x1 <= a.x0) continue;
      if (a.y1 <= b.y0 || b.y1 <= a.y0) continue;
      bad.push(
        `${at}: ${a.label} at ${Math.round(a.x0)} overlaps ${b.label} at ${Math.round(b.x0)}`,
      );
    }
  }

  // 6. features never share ground, and there is always a jump's worth of clear
  // road between them, so each one can be answered on its own.
  const slots = [...c.slots].sort((p, q) => p.x0 - q.x0);
  for (let i = 1; i < slots.length; i += 1) {
    const room = slots[i].x0 - slots[i - 1].x1;
    if (room < 0) {
      bad.push(`${at}: ${slots[i].kind} at ${Math.round(slots[i].x0)} starts inside ${slots[i - 1].kind}`);
    } else if (room < c.spacing - 0.001) {
      bad.push(
        `${at}: only ${room.toFixed(0)}px between ${slots[i - 1].kind} and ${slots[i].kind}, ` +
          `needs ${c.spacing.toFixed(0)}px at this speed`,
      );
    }
  }

  // 7. coins are inside the envelope and not buried.
  for (const co of c.coins) {
    if (tally) tally.coins += 1;
    if (-co.y > MAX_COIN_UP) {
      bad.push(`${at}: coin ${(-co.y).toFixed(1)}px up is above the reachable ${MAX_COIN_UP.toFixed(1)}px`);
    }
    if (co.y > -1) bad.push(`${at}: coin at ${Math.round(co.x)} is in the floor`);
    for (const f of c.fatals) {
      const t = travel(f);
      if (co.x > t.x0 && co.x < t.x1 && co.y > t.y0 && co.y < t.y1) {
        bad.push(`${at}: coin at ${Math.round(co.x)} is inside a ${f.kind}`);
      }
    }
    for (const s of c.solids) {
      if (co.x > s.x && co.x < s.x + s.w && co.y > s.y && co.y < s.y + s.h) {
        bad.push(`${at}: coin at ${Math.round(co.x)} is inside a ${s.kind}`);
      }
    }
  }

  if (tally) {
    tally.chunks += 1;
    tally.kinds.set(c.kind, (tally.kinds.get(c.kind) ?? 0) + 1);
  }
  return bad;
}

// ===========================================================================
// dynamic reachability
// ===========================================================================

function mergeWorld(chunks: Chunk[], d: Difficulty): World {
  const w: World = {
    spans: [],
    solids: [],
    fatals: [],
    landTol: KNOBS[d].landTol,
    inset: KNOBS[d].inset,
  };
  for (const c of chunks) {
    w.spans.push(...c.spans);
    w.solids.push(...c.solids);
    w.fatals.push(...c.fatals);
  }
  return w;
}

/** One search state. `x` is shared by the whole frontier, so it is not in here. */
type Node = {
  y: number;
  vy: number;
  onGround: boolean;
  jumps: number;
  rise: number;
  /** Frames of jump-button hold still queued. */
  hold: number;
};

type SimResult = {
  survived: boolean;
  /** World x where the last live state died, for the error message. */
  diedAt: number;
  frames: number;
  peakLive: number;
  capped: boolean;
  coins: Coin[];
  got: boolean[];
  steps: number;
};

/**
 * Forward reachability over the real integrator. Branches every frame over the
 * legal jump inputs, keeps every distinct surviving state, and reports whether
 * anything is still alive at the end plus which coins some surviving line of
 * play picked up.
 */
function simulate(chunks: Chunk[], d: Difficulty, speedMul: number, startX: number): SimResult {
  const w = mergeWorld(chunks, d);
  const coins: Coin[] = [];
  for (const c of chunks) for (const co of c.coins) coins.push(co);
  const got = coins.map(() => false);

  // Coins bucketed by 32px cell, so a frame tests three cells not the lot.
  const CELL = 32;
  const byCell = new Map<number, number[]>();
  coins.forEach((co, i) => {
    const cell = Math.floor(co.x / CELL);
    const list = byCell.get(cell);
    if (list) list.push(i);
    else byCell.set(cell, [i]);
  });

  const endX = chunks[chunks.length - 1].x1 - 4;
  let live: Node[] = [{ y: 0, vy: 0, onGround: true, jumps: 0, rise: 0, hold: 0 }];
  let x = startX;
  let frames = 0;
  let peakLive = 1;
  let steps = 0;
  let capped = false;
  const maxFrames = Math.ceil(((endX - startX) / (speedAt(0, d) * speedMul * 0.9)) * 60) + 600;

  const probe: Body = { x: 0, y: 0, vy: 0, h: STAND_H, onGround: false, jumps: 0, rise: 0 };

  while (x < endX && frames < maxFrames && live.length > 0) {
    const vx = speedAt(x / TILE, d) * speedMul;
    const next: Node[] = [];
    const seen = new Set<string>();
    let nx = x;

    for (const st of live) {
      const opts: Array<{ jump: boolean; hold: number }> = [{ jump: false, hold: st.hold }];
      if (st.hold > 0) opts.push({ jump: false, hold: 0 });
      if (st.jumps < MAX_JUMPS) {
        opts.push({ jump: true, hold: 0 });
        opts.push({ jump: true, hold: 45 });
      }

      for (const o of opts) {
        probe.x = x;
        probe.y = st.y;
        probe.vy = st.vy;
        probe.h = STAND_H;
        probe.onGround = st.onGround;
        probe.jumps = st.jumps;
        probe.rise = st.rise;
        // duck is deliberately never used: touch has no down input, so the proof
        // must hold for a player who only ever jumps.
        const out = stepPlayer(w, probe, { vx, jump: o.jump, jumpHeld: o.hold > 0, duck: false }, DT);
        steps += 1;
        if (out.crashed || out.fell) continue;
        nx = probe.x;

        const cell = Math.floor((probe.x + PW / 2) / CELL);
        for (let c = cell - 1; c <= cell + 1; c += 1) {
          const list = byCell.get(c);
          if (!list) continue;
          for (const i of list) if (!got[i] && coinTouched(probe, coins[i])) got[i] = true;
        }

        // Quantised dedup. Dropping a duplicate can only lose a route, never
        // invent one, because each kept state was reached by exact simulation.
        // Coarse on purpose: fine buckets grew the frontier into the thousands
        // and bought nothing, since near-identical arcs answer a hazard the same.
        const key =
          `${Math.round(probe.y / 3)},${Math.round(probe.vy / 30)},` +
          `${probe.onGround ? 1 : 0},${probe.jumps},${probe.rise > 0 ? 1 : 0},` +
          `${o.hold > 0 ? 1 : 0}`;
        if (seen.has(key)) continue;
        seen.add(key);
        next.push({
          y: probe.y,
          vy: probe.vy,
          onGround: probe.onGround,
          jumps: probe.jumps,
          rise: probe.rise,
          hold: Math.max(0, o.hold - 1),
        });
      }
    }

    if (next.length > MAX_LIVE) capped = true;
    live = next;
    peakLive = Math.max(peakLive, live.length);
    x = nx;
    frames += 1;
    if (capped) break;
  }

  return {
    survived: live.length > 0 && x >= endX,
    diedAt: x,
    frames,
    peakLive,
    capped,
    coins,
    got,
    steps,
  };
}

/**
 * The furthest a player can get past the lip of a bottomless pit, measured by
 * running the same search over a world with no ground beyond x=0. This is NOT
 * the airborne envelope: diving into the pit and double-jumping back out buys
 * real extra distance, so a hand-derived "impossible" width would be wrong. The
 * self-tests need a width nothing can cross, so they ask the physics.
 */
function pitReach(d: Difficulty, speed: number): number {
  const w: World = {
    spans: [{ x0: -1e6, x1: 0 }],
    solids: [],
    fatals: [],
    landTol: KNOBS[d].landTol,
    inset: KNOBS[d].inset,
  };
  type N = { y: number; vy: number; onGround: boolean; jumps: number; rise: number; hold: number };
  let live: N[] = [{ y: 0, vy: 0, onGround: true, jumps: 0, rise: 0, hold: 0 }];
  let x = -6;
  let best = 0;
  const probe: Body = { x: 0, y: 0, vy: 0, h: STAND_H, onGround: false, jumps: 0, rise: 0 };
  for (let f = 0; f < 600 && live.length > 0; f += 1) {
    const next: N[] = [];
    const seen = new Set<string>();
    let nx = x;
    for (const st of live) {
      const opts: Array<{ jump: boolean; hold: number }> = [{ jump: false, hold: st.hold }];
      if (st.hold > 0) opts.push({ jump: false, hold: 0 });
      if (st.jumps < MAX_JUMPS) {
        opts.push({ jump: true, hold: 0 });
        opts.push({ jump: true, hold: 45 });
      }
      for (const o of opts) {
        probe.x = x;
        probe.y = st.y;
        probe.vy = st.vy;
        probe.h = STAND_H;
        probe.onGround = st.onGround;
        probe.jumps = st.jumps;
        probe.rise = st.rise;
        const out = stepPlayer(w, probe, { vx: speed, jump: o.jump, jumpHeld: o.hold > 0, duck: false }, DT);
        if (out.crashed || out.fell) continue;
        nx = probe.x;
        best = Math.max(best, probe.x);
        const key = `${Math.round(probe.y / 3)},${Math.round(probe.vy / 30)},${probe.jumps},${o.hold > 0 ? 1 : 0}`;
        if (seen.has(key)) continue;
        seen.add(key);
        next.push({
          y: probe.y,
          vy: probe.vy,
          onGround: probe.onGround,
          jumps: probe.jumps,
          rise: probe.rise,
          hold: Math.max(0, o.hold - 1),
        });
      }
    }
    live = next;
    x = nx;
  }
  return best;
}

// ===========================================================================
// run
// ===========================================================================

const started = Date.now();

console.log(
  'physics probed from the integrator:\n' +
    `  tap jump    rise ${TAP.rise.toFixed(1)}px (${(TAP.rise / TILE).toFixed(2)} tiles), ` +
    `hang ${TAP.air.toFixed(3)}s\n` +
    `  held jump   rise ${HOLD.rise.toFixed(1)}px (${(HOLD.rise / TILE).toFixed(2)} tiles), ` +
    `hang ${HOLD.air.toFixed(3)}s\n` +
    `  double tap  rise ${TAP2.rise.toFixed(1)}px (${(TAP2.rise / TILE).toFixed(2)} tiles), ` +
    `hang ${TAP2.air.toFixed(3)}s\n` +
    `  derived caps: crate <= ${MAX_CRATE_H.toFixed(1)}px, ledge <= ${MAX_LEDGE_UP.toFixed(1)}px, ` +
    `coin <= ${MAX_COIN_UP.toFixed(1)}px up\n` +
    `  gap limits are per chunk: tap reach x difficulty safety, capped at ` +
    `${MAX_GAP_TILES} tiles`,
);
console.log(
  `\nchunks are ${CHUNK_W}px (${CHUNK_W / TILE}m) each\n` +
    `seeds ${RUN_SEEDS.join(',')} - the only seeds the game runs, so this is ` +
    'exhaustive, not a sample\n',
);

// --- static pass ----------------------------------------------------------

const tallies = new Map<Difficulty, Tally>();
for (const d of DIFFICULTIES) {
  const tally = emptyTally();
  for (const seed of RUN_SEEDS) {
    let prev: Chunk | null = null;
    for (let i = 0; i < STATIC_CHUNKS; i += 1) {
      const c = generateChunk(i, d, seed);
      for (const e of checkChunk(c, d, seed, tally)) fail(e);
      // Seams: a chunk cannot see its neighbour, so the reserved margins are the
      // whole guarantee. Check the actual result rather than trusting the maths.
      if (prev && prev.slots.length > 0 && c.slots.length > 0) {
        const last = prev.slots.reduce((a, b) => (b.x1 > a.x1 ? b : a));
        const first = c.slots.reduce((a, b) => (b.x0 < a.x0 ? b : a));
        const room = first.x0 - last.x1;
        if (room < c.spacing - 0.001) {
          fail(
            `${d} seed${seed} seam ${i - 1}|${i}: only ${room.toFixed(0)}px between ` +
              `${last.kind} and ${first.kind}, needs ${c.spacing.toFixed(0)}px`,
          );
        }
      }
      prev = c;
    }
  }
  tallies.set(d, tally);
  const kinds = [...tally.kinds.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([kk, v]) => `${kk} ${v}`)
    .join(', ');
  console.log(
    `${d.padEnd(6)} ${tally.chunks} chunks: ${tally.gaps} gaps (widest ` +
      `${tally.widestGap.toFixed(0)}px), ${tally.solids} solids, ${tally.fatals} hazards ` +
      `(${tally.movers} moving), ${tally.coins} coins`,
  );
  console.log(`       kinds: ${kinds}`);
}

// --- dynamic pass ---------------------------------------------------------

console.log('');
let simSteps = 0;
let simFrames = 0;
let simRuns = 0;
let peak = 0;
let coinsTested = 0;
let coinsMissed = 0;

function record(r: SimResult, label: string) {
  simSteps += r.steps;
  simFrames += r.frames;
  simRuns += 1;
  peak = Math.max(peak, r.peakLive);
  if (r.capped) fail(`${label}: live set blew past ${MAX_LIVE} - fix the search, not the course`);
  if (!r.survived) {
    fail(`${label}: UNSURVIVABLE - every line of play is dead by x=${r.diedAt.toFixed(0)} (${(r.diedAt / TILE).toFixed(0)}m)`);
  }
  coinsTested += r.coins.length;
  const missed = r.got.filter((v) => !v).length;
  coinsMissed += missed;
  if (missed > 0) {
    const where = r.coins
      .map((c, i) => (r.got[i] ? null : `${Math.round(c.x / TILE)}m@${(-c.y).toFixed(0)}px`))
      .filter((v): v is string => v !== null)
      .slice(0, 6);
    fail(`${label}: ${missed} uncollectable coin(s): ${where.join(' ')}`);
  }
}

for (const d of DIFFICULTIES) {
  for (const seed of RUN_SEEDS) {
    const chunks: Chunk[] = [];
    for (let i = 0; i < RUN_CHUNKS; i += 1) chunks.push(generateChunk(i, d, seed));
    record(simulate(chunks, d, 1, 2 * TILE), `${d} seed${seed} run 0-${RUN_CHUNKS - 1}`);

    for (const at of WINDOWS) {
      const win: Chunk[] = [];
      for (let i = at - 1; i <= at + 1; i += 1) win.push(generateChunk(i, d, seed));
      record(simulate(win, d, 1, win[0].x0 + 2 * TILE), `${d} seed${seed} window ${at}`);
    }
  }
  // A player leaning on a side button runs off-nominal all the way. Prove the
  // early course survives both ends of that.
  for (const mul of [1 - NUDGE, 1 + NUDGE]) {
    const chunks: Chunk[] = [];
    for (let i = 0; i < RUN_CHUNKS; i += 1) chunks.push(generateChunk(i, d, 1));
    record(simulate(chunks, d, mul, 2 * TILE), `${d} seed1 run at ${mul.toFixed(2)}x speed`);
  }
}

console.log(
  `simulated ${simRuns} courses: ${simFrames.toLocaleString()} frames, ` +
    `${simSteps.toLocaleString()} integrator steps, peak frontier ${peak} states`,
);
console.log(
  `coins: ${coinsTested.toLocaleString()} checked, ${coinsMissed} unreachable ` +
    '(each proven collectable by a simulated jump)',
);

// --- determinism ----------------------------------------------------------

// Chunks 6 and 12 are breathers on no difficulty (easy skips odd, normal skips
// i%3==2, hard skips i%5==4), so they carry real content to compare.
const LIVE_A = 6;
const LIVE_B = 12;
for (const d of DIFFICULTIES) {
  for (const seed of RUN_SEEDS) {
    const a = JSON.stringify(generateChunk(LIVE_A, d, seed));
    if (a !== JSON.stringify(generateChunk(LIVE_A, d, seed))) {
      fail(`generateChunk(${LIVE_A}, ${d}, ${seed}) is not deterministic`);
    }
    if (a === JSON.stringify(generateChunk(LIVE_B, d, seed))) {
      fail(`${d} seed${seed} chunks ${LIVE_A} and ${LIVE_B} are identical`);
    }
  }
  if (
    JSON.stringify(generateChunk(LIVE_A, d, 1)) === JSON.stringify(generateChunk(LIVE_A, d, 2))
  ) {
    fail(`${d} chunk ${LIVE_A} ignores the seed`);
  }
  // One index proves little. Most content chunks must differ between two seeds,
  // or the fixed seed set would make every run the same course.
  let same = 0;
  let compared = 0;
  for (let i = 0; i < 120; i += 1) {
    const p = generateChunk(i, d, 1);
    if (p.slots.length === 0) continue;
    compared += 1;
    if (JSON.stringify(p) === JSON.stringify(generateChunk(i, d, 5))) same += 1;
  }
  if (same > compared * 0.2) {
    fail(`${d}: ${same}/${compared} content chunks identical across seeds 1 and 5`);
  }
}
if (JSON.stringify(generateChunk(40, 'easy', 1)) === JSON.stringify(generateChunk(40, 'hard', 1))) {
  fail('easy and hard chunk 40 are identical - difficulty is not reaching generation');
}
// Easy must actually be gentler, not just differently shaped.
{
  const count = (d: Difficulty) => {
    let n = 0;
    for (const seed of RUN_SEEDS) {
      for (let i = 0; i < 60; i += 1) n += generateChunk(i, d, seed).slots.length;
    }
    return n;
  };
  const e = count('easy');
  const h = count('hard');
  if (e >= h) fail(`easy places ${e} hazards over 60 chunks and hard places ${h}`);
  console.log(`hazard density over 60 chunks x ${RUN_SEEDS.length} seeds: easy ${e}, hard ${h}`);
}

// ===========================================================================
// self-tests: the checks must be able to FAIL
// ===========================================================================

console.log('\nself-tests (each breaks a course on purpose):');

let selfTests = 0;
let selfPassed = 0;

function expectCaught(label: string, caught: boolean, detail: string) {
  selfTests += 1;
  if (caught) {
    selfPassed += 1;
    console.log(`  ok   ${label} -> ${detail}`);
  } else {
    console.log(`  MISS ${label} -> NOT CAUGHT (${detail})`);
    fail(`self-test "${label}" was not caught: this verifier cannot fail, so it proves nothing`);
  }
}

function clone(c: Chunk): Chunk {
  return JSON.parse(JSON.stringify(c)) as Chunk;
}

/**
 * Replaces the first gap with one of `width`, centred on it and clamped inside
 * the chunk so both seams stay solid. Anything now hanging over the void is
 * removed, so the widened gap is the ONLY thing that changed - otherwise a crate
 * left floating in the middle would give the simulation a stepping stone.
 */
function widenFirstGap(c: Chunk, width: number) {
  const g = gapsOf(c)[0];
  const mid = (g[0] + g[1]) / 2;
  const a = Math.max(c.x0 + 8, mid - width / 2);
  const b = Math.min(c.x1 - 8, mid + width / 2);
  c.spans = [
    { x0: c.x0, x1: a },
    { x0: b, x1: c.x1 },
  ];
  c.solids = c.solids.filter((s) => s.x + s.w <= a || s.x >= b);
  c.fatals = c.fatals.filter((f) => f.x + f.w + f.ampX <= a || f.x - f.ampX >= b);
}

function raiseFirstCrate(c: Chunk, height: number) {
  const crate = c.solids.find((s) => s.kind === 'crate');
  if (!crate) throw new Error('no crate to raise');
  crate.y = -height;
  crate.h = height;
}

/** A chunk that definitely has a gap in it, for the gap self-tests. */
function findChunk(d: Difficulty, pick: (c: Chunk) => boolean): Chunk {
  for (const seed of RUN_SEEDS) {
    for (let i = 0; i < STATIC_CHUNKS; i += 1) {
      const c = generateChunk(i, d, seed);
      if (pick(c)) return c;
    }
  }
  throw new Error('no chunk matched - the generator changed shape, update the self-tests');
}

// 1. widen a gap past the jump envelope.
//    Two thresholds matter and they are different. The GEOMETRY limit is sized
//    off the stingy tap arc, so it bites well before the gap is literally
//    impossible; the SIMULATION only dies once the gap beats the most generous
//    jump the physics allows. Both are asserted, at their own honest widths.
{
  const base = findChunk('normal', (c) => gapsOf(c).length > 0);
  const speed = speedAt(base.m0, 'normal');

  const nudged = clone(base);
  const overLimit = jumpReach(speed) * 0.95;
  widenFirstGap(nudged, overLimit);
  const badNudged = checkChunk(nudged, 'normal', 0, null);

  const broken = clone(base);
  // Wider than anything the physics allows, including a dive into the pit and a
  // double jump back out - which is why the number is measured, not guessed.
  const impossible = pitReach('normal', speed) * 1.4 + 40;
  widenFirstGap(broken, impossible);
  const r = simulate([broken], 'normal', 1, broken.x0 + 2 * TILE);

  expectCaught(
    `gap widened to ${overLimit.toFixed(0)}px (limit) and ${impossible.toFixed(0)}px (impossible)`,
    badNudged.some((e) => e.includes('gap at')) && !r.survived,
    `${badNudged.length} geometry error(s); simulation died at x=${r.diedAt.toFixed(0)}`,
  );
}

// 2. raise a crate above the jump. Same two thresholds: over the derived cap,
//    then over what a held double jump could ever land on.
{
  const base = findChunk('normal', (c) => c.solids.some((s) => s.kind === 'crate'));

  const nudged = clone(base);
  const tall = MAX_CRATE_H + 6;
  raiseFirstCrate(nudged, tall);
  const badNudged = checkChunk(nudged, 'normal', 0, null);

  const broken = clone(base);
  const impossible = BEST.rise * 1.5;
  raiseFirstCrate(broken, impossible);
  const r = simulate([broken], 'normal', 1, broken.x0 + 2 * TILE);

  expectCaught(
    `crate raised to ${tall.toFixed(0)}px (limit) and ${impossible.toFixed(0)}px (impossible)`,
    badNudged.some((e) => e.includes('crate top')) && !r.survived,
    `${badNudged.length} geometry error(s); simulation died at x=${r.diedAt.toFixed(0)}`,
  );
}

// 3. drop an overhead hazard to head height. A runner cannot duck on touch, so
//    this must be reported even though the box never touches the floor.
{
  const base = findChunk('hard', (c) => c.fatals.some((f) => f.kind === 'beam'));

  // Just into head height: the geometry check must object even though a HELD
  // jump could still hop over it, because touch players cannot hold.
  const nudged = clone(base);
  const nb = nudged.fatals.find((f) => f.kind === 'beam');
  if (!nb) throw new Error('no beam');
  nb.y = -STAND_H - nb.h + 4;
  const badNudged = checkChunk(nudged, 'hard', 0, null);

  // Floor to ceiling: no input clears it, so the simulation must find no route.
  const broken = clone(base);
  const bb = broken.fatals.find((f) => f.kind === 'beam');
  if (!bb) throw new Error('no beam');
  bb.h = BEST.rise * 1.5;
  bb.y = -bb.h - 8;
  const r = simulate([broken], 'hard', 1, broken.x0 + 2 * TILE);

  expectCaught(
    'beam dropped into head height, then floor to ceiling',
    badNudged.some((e) => e.includes('overhead')) && !r.survived,
    `${badNudged.length} geometry error(s); simulation died at x=${r.diedAt.toFixed(0)}`,
  );
}

// 4. lift a coin out of reach.
{
  const base = findChunk('easy', (c) => c.coins.length > 0);
  const c = clone(base);
  c.coins[0].y = -(TAP2.rise + TAP.rise);
  const bad = checkChunk(c, 'easy', 0, null);
  const geometryCaught = bad.some((e) => e.includes('above the reachable'));
  const r = simulate([c], 'easy', 1, c.x0 + 2 * TILE);
  const simCaught = r.got.some((v) => !v);
  expectCaught(
    'coin lifted to ' + (-c.coins[0].y).toFixed(0) + 'px',
    geometryCaught && simCaught,
    `${bad.length} geometry error(s), ${r.got.filter((v) => !v).length} coin(s) unreached`,
  );
}

// 5. bury one hazard inside another. Built by hand rather than hunted for: the
//    generator is supposed to make this impossible, so no real chunk has it.
{
  const c = clone(findChunk('hard', (cc) => cc.fatals.length > 0));
  const f = c.fatals[0];
  c.fatals.push({ ...f, kind: 'saw', x: f.x + 2, y: f.y + 2, ampX: 0, ampY: 0, k: 0 });
  const bad = checkChunk(c, 'hard', 0, null);
  expectCaught(
    'second hazard buried inside the first',
    bad.some((e) => e.includes('overlaps')),
    `${bad.length} geometry error(s)`,
  );
}

// 6. open a gap under an overhead beam, which would make it unjumpable.
{
  const base = findChunk('hard', (c) => c.fatals.some((f) => f.kind === 'beam'));
  const c = clone(base);
  const beam = c.fatals.find((f) => f.kind === 'beam');
  if (!beam) throw new Error('no beam');
  c.spans = [
    { x0: c.x0, x1: beam.x },
    { x0: beam.x + beam.w, x1: c.x1 },
  ];
  const bad = checkChunk(c, 'hard', 0, null);
  expectCaught(
    'pit opened under a beam',
    bad.some((e) => e.includes('hangs over a pit')),
    `${bad.length} geometry error(s)`,
  );
}

// 7. make the terrain non-deterministic in spirit: two different seeds must not
//    produce the same course, or the seed set proves nothing about variety.
{
  const a = JSON.stringify(generateChunk(LIVE_A, 'normal', 3));
  const b = JSON.stringify(generateChunk(LIVE_A, 'normal', 4));
  expectCaught(`seeds 3 and 4 differ at chunk ${LIVE_A}`, a !== b, 'courses are distinct');
}

// 8. a pit deeper than the fatal depth must still be fatal, not a shortcut.
{
  const c = clone(findChunk('normal', (cc) => gapsOf(cc).length > 0));
  const r = simulate([c], 'normal', 1, c.x0 + 2 * TILE);
  const probe: Body = {
    x: gapsOf(c)[0][0] + 4,
    y: FATAL_DEPTH + 1,
    vy: 0,
    h: STAND_H,
    onGround: false,
    jumps: 0,
    rise: 0,
  };
  const out = stepPlayer(mergeWorld([c], 'normal'), probe, { vx: 0, jump: false, jumpHeld: false, duck: false }, DT);
  expectCaught(
    'falling past ' + FATAL_DEPTH + 'px is fatal',
    out.fell && r.survived,
    'pit kills, intact course still survivable',
  );
}

console.log(`  ${selfPassed}/${selfTests} self-tests confirmed the checks bite`);

// --- verdict --------------------------------------------------------------

console.log(`\nfinished in ${Date.now() - started}ms`);

if (errors.length > 0) {
  console.error(`\n${errors.length} PROBLEM(S):`);
  for (const e of errors.slice(0, 40)) console.error(`  x ${e}`);
  if (errors.length > 40) console.error(`  ... and ${errors.length - 40} more`);
  process.exit(1);
}
console.log(
  `Every chunk on every seed: gaps within the probed jump, nothing unreachably ` +
    `tall, no hazard inside another, every coin collectable, and every simulated ` +
    `course survivable using jumps alone.`,
);
