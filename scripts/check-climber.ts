/**
 * Proves an endless climb in Sky Hopper can never dead-end.
 *
 * THE BUG THIS EXISTS TO PREVENT
 * -----------------------------
 * A vertical climber's signature failure is a gap taller than a bounce, or one
 * offset so far sideways that the airtime cannot cover it. The run then ends
 * through no fault of the player, and nothing in the type system, the renderer or
 * a geometry rule notices - an earlier level in this repo shipped with most of its
 * platforms physically unreachable, and it took a human playthrough to find out.
 *
 * So nothing here is checked against a hand-copied number. The bounce envelope is
 * DERIVED from the real constants (G, VB, SPRING_VB, TAP_IMPULSE, DRAG) and the
 * reachability claim is settled by running the game's own integrator `stepBody`
 * and its own landing test `lands`, with the game's own per-difficulty landing
 * tolerance `footHalf`. Retune the physics and this file re-derives; retune it
 * badly and this file fails.
 *
 * WHAT IS PROVEN, AND HOW CONSERVATIVELY
 * -------------------------------------
 * From every platform, launched by an ORDINARY bounce, some platform strictly
 * above is reachable using TAP-ONLY steering, without touching a hazard and
 * without landing on a crumbling platform. Each of those restrictions is
 * deliberate and each makes the claim stronger than the game needs:
 *
 *  - tap-only, because the touch controls only emit taps; holding a key on a
 *    keyboard reaches considerably further, so a keyboard player is strictly
 *    better off than what is proven here.
 *  - ordinary bounce even off a spring, which is what proves a spring is a bonus
 *    and can never be a required move.
 *  - no crumbling platform may be used, which is what proves a one-use platform
 *    is never the only route up (landing on the only way forward and having it
 *    disintegrate is an unavoidable death).
 *  - no hazard may be touched on the way, which is what proves a hazard is always
 *    avoidable - including across the horizontal wrap, since the simulation wraps
 *    x exactly the way the game does.
 *
 * The search under-reports rather than over-reports: it only ever counts a
 * platform as reached by physically simulating a landing on it.
 *
 * Run: npx tsx scripts/check-climber.ts
 */
import {
  CAM_ANCHOR,
  COIN_R,
  CORRIDOR_PAD,
  OVERSHOOT_PAD,
  DRAG,
  G,
  HAZ_R,
  MAX_RISE,
  METRE,
  MIN_VSEP,
  PH,
  PLAT_H,
  PLAT_W,
  PW,
  REACH_SAFETY,
  SPRING_RISE,
  SPRING_VB,
  TAP_IMPULSE,
  TUNE,
  VB,
  VIEW_H_MIN,
  VX_MAX,
  W,
  airtimeTo,
  circleHitsPlat,
  createWorld,
  dxBudget,
  dxWrap,
  extendTo,
  footHalf,
  genHorizon,
  generateWorld,
  hazardR,
  hazardX,
  lands,
  platX,
  stepBody,
  tapReach,
  wrapX,
  type Body,
  type Platform,
  type World,
} from '../components/games/Climber';
import { DIFFICULTIES, type Difficulty } from '../lib/difficulty';

/* ========================================================================== *
 * The derived bounce envelope. Everything downstream is measured against this.
 * ========================================================================== */

/** Height an ordinary bounce rises: v^2 / 2g, from the real G and VB. */
const RISE = (VB * VB) / (2 * G);
/** Height a spring rises. */
const SPRING_UP = (SPRING_VB * SPRING_VB) / (2 * G);
/** Seconds from an ordinary bounce until the feet are back at launch height. */
const HANG = (2 * VB) / G;
/**
 * The furthest sideways a single tap can carry the player in one whole bounce.
 * Integral of TAP_IMPULSE * exp(-DRAG t), which is what `stepBody` does.
 */
const TAP_SPAN = (TAP_IMPULSE / DRAG) * (1 - Math.exp(-DRAG * HANG));
/** Same, for a player holding a key: strictly further, hence not relied upon. */
const HOLD_SPAN = VX_MAX * HANG;

const DT = 1 / 60;
/** Frames per attempt. A full bounce is 51 at this dt; the rest is falling. */
const MAX_FRAMES = 150;
/** How far below the launch platform an attempt is abandoned as a miss. */
const FALL_GIVE_UP = 3 * RISE;

const errors: string[] = [];
const fail = (m: string) => errors.push(m);

/* ========================================================================== *
 * Tap plans
 * ========================================================================== */

/**
 * One thumb plan: `count` taps in direction `dir`, `spacing` frames apart,
 * beginning at frame `start`. `count: 0` is the do-nothing plan, which is how a
 * straight-up-and-down hop gets covered.
 *
 * The spacings are all 4 frames or more (about 66 ms), so no plan asks for a
 * tap rate a child could not physically produce.
 */
type Plan = { dir: -1 | 1; count: number; spacing: number; start: number };

const PLANS: Plan[] = [{ dir: 1, count: 0, spacing: 4, start: 0 }];
for (const dir of [1, -1] as Array<1 | -1>) {
  for (const count of [1, 2, 3, 4, 5]) {
    for (const spacing of [4, 9, 16]) {
      for (const start of [0, 7, 18, 30]) {
        PLANS.push({ dir, count, spacing, start });
      }
    }
  }
}

/** Summed tap impulse arriving on frame `f` under `plan`. */
function impulseAt(plan: Plan, f: number): number {
  if (plan.count === 0) return 0;
  const rel = f - plan.start;
  if (rel < 0) return 0;
  if (rel % plan.spacing !== 0) return 0;
  if (rel / plan.spacing >= plan.count) return 0;
  return plan.dir * TAP_IMPULSE;
}

/* ========================================================================== *
 * Simulation
 * ========================================================================== */

/** Platforms bucketed by y so a landing test looks at a handful, not all of them. */
type Buckets = Map<number, Platform[]>;
const BUCKET = 64;

function bucketize(plats: Platform[]): Buckets {
  const m: Buckets = new Map();
  for (const p of plats) {
    const k = Math.floor(p.y / BUCKET);
    const list = m.get(k);
    if (list) list.push(p);
    else m.set(k, [p]);
  }
  return m;
}

type HopOpts = {
  d: Difficulty;
  /** World time at launch. Sets every mover's and hazard's phase. */
  t0: number;
  /** Sideways speed the player arrives carrying. */
  vx0: number;
  plan: Plan;
  /** Crumbling platforms are excluded from the main proof. */
  allowCrumble: boolean;
  /** Launch speed. The main proof always uses VB, even off a spring. */
  launchV: number;
  /** Hazard contact aborts the attempt when true. */
  hazardsBlock: boolean;
};

type HopResult =
  | { kind: 'landed'; on: Platform; apex: number }
  | { kind: 'hazard' }
  | { kind: 'fell' }
  | { kind: 'timeout'; apex: number }
  | { kind: 'offWorld'; detail: string };

/**
 * Runs one bounce off `from` under one plan, using the game's own integrator and
 * landing test, and reports what it landed on.
 */
function hop(w: World, buckets: Buckets, from: Platform, o: HopOpts): HopResult {
  const b: Body = {
    x: platX(from, o.t0),
    y: from.y,
    vx: o.vx0,
    vy: -o.launchV,
  };
  const hr = hazardR(o.d);
  let apex = from.y;

  for (let f = 0; f < MAX_FRAMES; f += 1) {
    const prevFeet = b.y;
    stepBody(b, { impulse: impulseAt(o.plan, f), left: false, right: false }, DT);
    const time = o.t0 + (f + 1) * DT;
    if (b.y < apex) apex = b.y;

    // The cylinder must always keep x in range. A NaN or an escaped x here would
    // mean the wrap is broken and the player has left the world.
    if (!Number.isFinite(b.x) || b.x < 0 || b.x >= W) {
      return { kind: 'offWorld', detail: `x=${b.x}` };
    }
    if (!Number.isFinite(b.y)) return { kind: 'offWorld', detail: `y=${b.y}` };

    if (o.hazardsBlock) {
      const mid = b.y - PH / 2;
      for (const h of w.hazards) {
        if (Math.abs(h.y - mid) > hr + PH / 2) continue;
        if (Math.abs(dxWrap(hazardX(h, time), b.x)) > hr + PW / 2) continue;
        return { kind: 'hazard' };
      }
    }

    // Highest surface crossed this frame, exactly as the game picks it.
    let hit: Platform | null = null;
    const k = Math.floor(b.y / BUCKET);
    for (let kk = k - 2; kk <= k + 2; kk += 1) {
      const list = buckets.get(kk);
      if (!list) continue;
      for (const p of list) {
        if (p.kind === 'crumble' && !o.allowCrumble) continue;
        if (!lands(b, prevFeet, platX(p, time), p.y, footHalf(p, o.d))) continue;
        if (!hit || p.y < hit.y) hit = p;
      }
    }
    if (hit) return { kind: 'landed', on: hit, apex };
    if (b.y > from.y + FALL_GIVE_UP) return { kind: 'fell' };
  }
  return { kind: 'timeout', apex };
}

/**
 * Launch times to try. A mover's landing spot depends on its phase, so the
 * platform being launched from is sampled right across its own period; otherwise
 * a spread of absolute times covers the phases of any movers overhead.
 */
function launchTimes(from: Platform): number[] {
  if (from.amp > 0 && from.speed > 0) {
    const period = (2 * Math.PI * from.amp) / from.speed;
    return [0, 1, 2, 3, 4, 5].map((k) => (k * period) / 6);
  }
  return [0, 0.31, 0.74, 1.23, 1.87];
}

/**
 * Is a platform strictly above `from` reachable by an ordinary tap-steered bounce
 * that touches no hazard and uses no crumbling platform? Returns the plan that
 * worked, or null.
 */
function climbsFrom(
  w: World,
  buckets: Buckets,
  from: Platform,
  d: Difficulty,
  vx0: number,
  allowCrumble = false,
): { t0: number; plan: Plan } | null {
  let worst: { t0: number; plan: Plan } | null = null;
  for (const t0 of launchTimes(from)) {
    let found: Plan | null = null;
    for (const plan of PLANS) {
      const r = hop(w, buckets, from, {
        d,
        t0,
        vx0,
        plan,
        allowCrumble,
        launchV: VB,
        hazardsBlock: true,
      });
      if (r.kind === 'offWorld') {
        fail(`${d} seed ${w.seed}: player left the world (${r.detail}) from platform ${from.id}`);
        return null;
      }
      if (r.kind === 'landed' && r.on.y < from.y - 1) {
        found = plan;
        break;
      }
    }
    // Every sampled launch time has to work, not just a lucky one.
    if (!found) return null;
    worst = { t0, plan: found };
  }
  return worst;
}

/* ========================================================================== *
 * Static geometry checks
 * ========================================================================== */

/** Swept sideways half-extent of a platform: its width plus a mover's travel. */
function sweptHalf(p: Platform): number {
  return p.w / 2 + p.amp;
}

/** Do two platforms' swept x-ranges overlap anywhere on the cylinder? */
function sweepsOverlap(a: Platform, b: Platform): boolean {
  return Math.abs(dxWrap(a.x, b.x)) < sweptHalf(a) + sweptHalf(b);
}

type Stats = {
  plats: number;
  route: number;
  bonus: number;
  crumble: number;
  mover: number;
  spring: number;
  coins: number;
  hazards: number;
  gapSum: number;
  gapMax: number;
  gaps: number;
  minVsep: number;
};

function emptyStats(): Stats {
  return {
    plats: 0,
    route: 0,
    bonus: 0,
    crumble: 0,
    mover: 0,
    spring: 0,
    coins: 0,
    hazards: 0,
    gapSum: 0,
    gapMax: 0,
    gaps: 0,
    minVsep: Infinity,
  };
}

/** 2. No platform may overlap another, and none may wall off the cylinder. */
function checkLayout(w: World, at: string, st: Stats): void {
  const sorted = [...w.plats].sort((a, b) => a.y - b.y);
  for (let i = 0; i < sorted.length; i += 1) {
    const p = sorted[i];
    st.plats += 1;
    if (p.route) st.route += 1;
    else st.bonus += 1;
    if (p.kind === 'crumble') st.crumble += 1;
    if (p.kind === 'mover') st.mover += 1;
    if (p.kind === 'spring') st.spring += 1;

    // The opening ground deliberately spans the whole cylinder so a brand new
    // player cannot miss it. Everything else must leave a way past.
    if (p.id !== 0) {
      if (sweptHalf(p) > W / 2 - (PW / 2 + 4)) {
        fail(
          `${at}: platform ${p.id} sweeps ${(sweptHalf(p) * 2).toFixed(1)} of ${W} units wide - ` +
            'it walls off the screen',
        );
      }
      if (p.w > W / 2) fail(`${at}: platform ${p.id} is ${p.w} units wide (world is ${W})`);
    }

    for (let j = i + 1; j < sorted.length; j += 1) {
      const q = sorted[j];
      const dy = q.y - p.y;
      // Sorted by y, so once the separation clears a slab's thickness plus the
      // MIN_VSEP claim there is nothing left to compare against.
      if (dy > MIN_VSEP + PLAT_H) break;
      if (!sweepsOverlap(p, q)) continue;
      st.minVsep = Math.min(st.minVsep, dy);
      if (dy < PLAT_H + 1) {
        fail(
          `${at}: platforms ${p.id} and ${q.id} overlap - only ${dy.toFixed(2)} units apart ` +
            `in y with sweeps that cross (slab is ${PLAT_H} thick)`,
        );
      }
      if (dy < MIN_VSEP - 0.001) {
        fail(
          `${at}: platforms ${p.id} and ${q.id} are ${dy.toFixed(2)} apart, under ` +
            `MIN_VSEP ${MIN_VSEP}`,
        );
      }
    }
  }
}

/** 3. Route gaps must sit inside the derived envelope before anything is run. */
function checkRouteEnvelope(w: World, at: string, st: Stats): void {
  const route = w.plats.filter((p) => p.route).sort((a, b) => b.y - a.y);
  for (let i = 1; i < route.length; i += 1) {
    const from = route[i - 1];
    const to = route[i];
    const gap = from.y - to.y;
    st.gapSum += gap;
    st.gaps += 1;
    st.gapMax = Math.max(st.gapMax, gap);

    // Against the MEASURED apex, which is a little under VB^2/2G because the
    // integrator loses energy per step. Sizing gaps against the algebra alone
    // would leave gaps the player cannot quite clear.
    if (gap > APEX) {
      fail(
        `${at}: route gap ${gap.toFixed(1)} above platform ${from.id} exceeds the measured ` +
          `bounce apex ${APEX.toFixed(1)} (closed form says ${RISE.toFixed(1)}, which is optimistic)`,
      );
    }
    // Worst case for both platforms' wander at once.
    const worstDx = Math.abs(dxWrap(from.x, to.x)) + from.amp + to.amp;
    const budget = dxBudget(gap);
    if (worstDx > budget + 0.001) {
      fail(
        `${at}: route step above platform ${from.id} needs ${worstDx.toFixed(1)} sideways at a ` +
          `${gap.toFixed(1)} gap, but the airtime only affords ${budget.toFixed(1)}`,
      );
    }
    if (to.kind === 'crumble') {
      fail(`${at}: route platform ${to.id} is a crumbling one - the route must be permanent`);
    }
  }
}

/** 4. Movers must stay inside their advertised travel, and inside the cylinder. */
function checkMovers(w: World, at: string): void {
  for (const p of w.plats) {
    if (p.amp === 0) {
      if (p.speed !== 0) fail(`${at}: platform ${p.id} has speed ${p.speed} but no amplitude`);
      continue;
    }
    if (!(p.speed > 0)) {
      fail(`${at}: mover ${p.id} has amplitude ${p.amp} but speed ${p.speed} - it never moves`);
      continue;
    }
    const period = (2 * Math.PI * p.amp) / p.speed;
    let peak = 0;
    let prev = platX(p, 0);
    // A whole period at 1 degree of phase per sample.
    for (let k = 1; k <= 360; k += 1) {
      const t = (k / 360) * period;
      const x = platX(p, t);
      if (!Number.isFinite(x) || x < 0 || x >= W) {
        fail(`${at}: mover ${p.id} leaves the cylinder at phase ${k} (x=${x})`);
        break;
      }
      if (Math.abs(dxWrap(p.x, x)) > p.amp + 1e-6) {
        fail(
          `${at}: mover ${p.id} wanders ${Math.abs(dxWrap(p.x, x)).toFixed(3)} from its centre, ` +
            `past its stated amplitude ${p.amp}`,
        );
        break;
      }
      peak = Math.max(peak, Math.abs(dxWrap(prev, x)) / (period / 360));
      prev = x;
    }
    // The angular rate is chosen so peak linear speed equals `speed`; if that
    // ever drifts, the amplitude subtracted from the reach budget is a lie.
    if (peak > p.speed * 1.02) {
      fail(
        `${at}: mover ${p.id} peaks at ${peak.toFixed(2)} units/s, above its stated ` +
          `${p.speed.toFixed(2)}`,
      );
    }
  }
}

/**
 * 5. A hazard must sit outside the flight path of EVERY route step whose bounce
 * reaches its height, at every phase of its own travel.
 *
 * Every route step, not just the one it lives in: a bounce rises the full
 * MAX_RISE whether the player wants it to or not, so a hazard two or three steps
 * overhead is still in the way of someone launching from below. That gap was a
 * real bug - the simulated sweep found the resulting dead ends before this static
 * rule was tightened to match. Distances are measured around the cylinder, so the
 * wrap cannot smuggle a hazard into a corridor from the far side.
 */
function checkHazards(w: World, at: string, st: Stats): void {
  const route = w.plats.filter((p) => p.route).sort((a, b) => b.y - a.y);
  const d = w.difficulty;
  const clear = CORRIDOR_PAD + OVERSHOOT_PAD + hazardR(d);

  for (const h of w.hazards) {
    st.hazards += 1;
    // Sample a whole period of the hazard's own travel.
    const period = h.amp > 0 && h.speed > 0 ? (2 * Math.PI * h.amp) / h.speed : 1;
    let bad = '';
    for (let k = 0; k <= 360 && !bad; k += 1) {
      const hx = hazardX(h, (k / 360) * period);
      if (!Number.isFinite(hx) || hx < 0 || hx >= W) {
        bad = `it leaves the cylinder (x=${hx})`;
        break;
      }
      for (let i = 0; i + 1 < route.length; i += 1) {
        const a = route[i];
        const b = route[i + 1];
        // Re-derived here rather than trusting the game's own band: the bounce
        // rise, the extra lift an optional platform inside the gap gives a
        // launch, and the hazard's own body radius.
        const reach = hazardR(d) + PH / 2;
        const gap = a.y - b.y;
        if (h.y > a.y + reach || h.y < a.y - RISE - gap - reach) continue;
        const lateral = dxWrap(a.x, b.x);
        const half = Math.abs(lateral) / 2 + a.amp + b.amp;
        const room = Math.abs(dxWrap(wrapX(a.x + lateral / 2), hx)) - half - clear;
        if (room < 0) {
          bad =
            `it reaches ${(-room).toFixed(1)} units into the flight path of the route step off ` +
            `platform ${a.id} (${(a.y - h.y).toFixed(0)} units below it, inside that step's ` +
            `${(RISE + gap + 2 * reach).toFixed(0)}-unit flight band) - unavoidable`;
          break;
        }
      }
    }
    if (bad) fail(`${at}: hazard ${h.id}: ${bad}`);
  }
  // A hazard that never moves is not much of a hazard, and amp is what the room
  // calculation is spending its budget on.
  for (const h of w.hazards) {
    if (h.amp <= 0 || h.speed <= 0) fail(`${at}: hazard ${h.id} never moves`);
  }
}

/** 6. Coins must never be buried inside a platform. */
function checkCoins(w: World, at: string, st: Stats): void {
  for (const c of w.coins) {
    st.coins += 1;
    for (const p of w.plats) {
      if (Math.abs(p.y - c.y) > PLAT_H + COIN_R + 4) continue;
      if (circleHitsPlat(c.x, c.y, COIN_R, p)) {
        fail(`${at}: coin ${c.id} is buried in platform ${p.id}`);
        break;
      }
    }
  }
}

/* ========================================================================== *
 * 1. The important one: simulated reachability from every platform
 * ========================================================================== */

type Reach = {
  checked: number;
  /** Skipped because the world simply stops above them (the game keeps going). */
  nearTop: number;
  dead: string[];
  /** Platforms that only became reachable once a crumbling one was allowed. */
  crumbleOnly: number;
  /** Platforms with no hazard-free landing at all at full sideways speed. */
  trapped: string[];
};

/**
 * At FULL sideways speed the player is not promised height - the sweep found real
 * platforms where arriving flat out costs you the hop, and that is correct game
 * feel, not a bug: you drop back and try again. What must never happen is being
 * left with no safe option at all, so this asks only for a hazard-free plan that
 * lands on something.
 *
 * Combined with the height guarantee at rest, this is what rules out an
 * unavoidable death: a fast arrival costs a retry, and drag bleeds the speed off
 * (a factor of exp(-DRAG * HANG) per bounce) until the at-rest guarantee applies.
 */
function survives(w: World, buckets: Buckets, from: Platform, d: Difficulty, vx0: number): boolean {
  for (const t0 of launchTimes(from)) {
    let ok = false;
    for (const plan of PLANS) {
      const r = hop(w, buckets, from, {
        d,
        t0,
        vx0,
        plan,
        allowCrumble: true,
        launchV: VB,
        hazardsBlock: true,
      });
      if (r.kind === 'landed') {
        ok = true;
        break;
      }
    }
    if (!ok) return false;
  }
  return true;
}

function checkReachable(w: World, at: string, vx0s: number[], surviveVx: number[]): Reach {
  const buckets = bucketize(w.plats);
  const d = w.difficulty;
  const r: Reach = { checked: 0, nearTop: 0, dead: [], crumbleOnly: 0, trapped: [] };

  for (const p of w.plats) {
    if (p.broken) continue;
    // A platform within one bounce of the generated ceiling has no complete set
    // of targets above it here, so a miss would say nothing. The game generates
    // further before the player can ever get there.
    if (p.y - w.top.y < RISE) {
      r.nearTop += 1;
      continue;
    }
    r.checked += 1;

    // No forced death, even flat out sideways.
    for (const vx0 of surviveVx) {
      if (survives(w, buckets, p, d, vx0)) continue;
      r.trapped.push(
        `${at}: TRAPPED on platform ${p.id} (${p.kind}) y=${p.y.toFixed(1)} ` +
          `(${(-p.y / METRE).toFixed(0)}m) - arriving at ${vx0.toFixed(0)} sideways leaves no ` +
          'hazard-free landing anywhere, which is an unavoidable death',
      );
    }

    let deadFor: number | null = null;
    for (const vx0 of vx0s) {
      if (!climbsFrom(w, buckets, p, d, vx0)) {
        deadFor = vx0;
        break;
      }
    }
    if (deadFor === null) continue;

    // Distinguish "nothing works" from "only a crumbling platform works", which
    // is a different and worse bug: a one-use platform as the sole route up.
    // Same rule, same phases - the only thing relaxed is the crumble ban.
    const viaCrumble = climbsFrom(w, buckets, p, d, deadFor, true) !== null;
    if (viaCrumble) r.crumbleOnly += 1;

    r.dead.push(
      `${at}: DEAD END at platform ${p.id} (${p.kind}${p.route ? ', route' : ', bonus'}) ` +
        `y=${p.y.toFixed(1)} (${(-p.y / METRE).toFixed(0)}m) - no tap-only bounce reaches ` +
        `anything above it at arrival vx ${deadFor.toFixed(0)}` +
        (viaCrumble ? ' (only a CRUMBLING platform would work, which is a death)' : ''),
    );
  }
  return r;
}

/* ========================================================================== *
 * 7. Springs must not outrun the generator or leave the world
 * ========================================================================== */

/**
 * A spring is the fastest launch in the game. The generator runs to
 * `genHorizon(camY, viewH)` above the camera, so this reproduces the worst case -
 * the smallest view the layout will ever use, a camera only just settled - and
 * checks that a real SPRING_VB launch neither passes the generated ceiling nor
 * ends up somewhere the world does not exist.
 */
function checkSprings(seed: number, d: Difficulty): void {
  const at = `${d} seed ${seed} springs`;
  const viewH = VIEW_H_MIN;
  const probe = generateWorld(seed, d, 300);
  const springs = probe.plats.filter((p) => p.kind === 'spring' && p.y - probe.top.y > SPRING_UP);
  if (springs.length === 0) {
    if (TUNE[d].springChance > 0) fail(`${at}: no springs generated in 300 m`);
    return;
  }

  for (const s of springs.slice(0, 40)) {
    // Rebuild a world generated exactly as far as the game guarantees, no more.
    const w = createWorld(seed, d);
    const camY = s.y - CAM_ANCHOR * viewH;
    extendTo(w, genHorizon(camY, viewH));
    const live = w.plats.find((p) => p.id === s.id);
    if (!live) continue;
    const buckets = bucketize(w.plats);

    const r = hop(w, buckets, live, {
      d,
      t0: 0,
      vx0: 0,
      plan: { dir: 1, count: 0, spacing: 4, start: 0 },
      allowCrumble: true,
      launchV: SPRING_VB,
      hazardsBlock: false,
    });
    if (r.kind === 'offWorld') {
      fail(`${at}: a spring launch left the world (${r.detail})`);
      continue;
    }
    const apex = r.kind === 'landed' ? r.apex : r.kind === 'timeout' ? r.apex : live.y;
    if (apex < w.top.y) {
      fail(
        `${at}: a spring at y=${live.y.toFixed(1)} threw the player to ${apex.toFixed(1)}, past ` +
          `the generated ceiling ${w.top.y.toFixed(1)} - it outran the generator`,
      );
    }
    if (r.kind === 'fell' || r.kind === 'timeout') {
      fail(`${at}: after a spring launch the player never landed on anything (${r.kind})`);
    }
  }
}

/* ========================================================================== *
 * 8. Easy really is easier, and generation is deterministic
 * ========================================================================== */

function checkDifficultyOrdering(): void {
  const [e, n, h] = DIFFICULTIES.map((d) => TUNE[d]);
  if (!(e.gapMax < n.gapMax && n.gapMax < h.gapMax)) {
    fail(`easy/normal/hard gapMax are not increasing: ${e.gapMax}/${n.gapMax}/${h.gapMax}`);
  }
  if (!(e.gapMin <= n.gapMin && n.gapMin <= h.gapMin)) {
    fail(`easy/normal/hard gapMin are not non-decreasing`);
  }
  if (!(e.springChance > n.springChance && n.springChance > h.springChance)) {
    fail('easy does not have the most springs');
  }
  if (!(e.crumbleChance < n.crumbleChance && n.crumbleChance < h.crumbleChance)) {
    fail('easy does not have the fewest crumbling platforms');
  }
  if (!(e.hazardFromM > n.hazardFromM && n.hazardFromM > h.hazardFromM)) {
    fail('easy hazards do not start highest');
  }
  // Generous hitboxes on easy: a wider landing box and a smaller hazard box.
  if (!(e.footPad > n.footPad || e.footPad > h.footPad)) {
    fail(`easy landing tolerance (${e.footPad}) is not more generous than normal/hard`);
  }
  if (!(e.hazPad < 0)) fail('easy hazard hitbox is not shrunk');
  if (!(e.flapBoost > n.flapBoost && n.flapBoost > h.flapBoost)) {
    fail('easy rescue flick is not the strongest');
  }
  if (!(e.graceS > n.graceS && n.graceS > h.graceS)) fail('easy respawn grace is not the longest');
}

/**
 * Easy is the DEFAULT and the youngest player is about five, so it gets promises
 * of its own rather than just softer numbers: nothing on easy is ever one-use, and
 * nothing chases them for the first stretch of the climb.
 */
function checkEasyIsKind(): void {
  for (const seed of SEEDS) {
    const w = generateWorld(seed, 'easy', 300);
    const crumbles = w.plats.filter((p) => p.kind === 'crumble').length;
    if (crumbles > 0) {
      fail(`easy seed ${seed}: ${crumbles} crumbling platform(s) - easy must be all permanent`);
    }
    for (const h of w.hazards) {
      const m = -h.y / METRE;
      if (m < TUNE.easy.hazardFromM) {
        fail(`easy seed ${seed}: a hazard at ${m.toFixed(0)}m, under the ${TUNE.easy.hazardFromM}m floor`);
      }
    }
    // Landing on easy must be measurably more forgiving than on hard.
    const slab = w.plats[1];
    if (slab && footHalf(slab, 'easy') <= footHalf(slab, 'hard')) {
      fail('easy landing box is not wider than hard');
    }
  }
}

function checkDeterminism(): void {
  for (const d of DIFFICULTIES) {
    const a = JSON.stringify(generateWorld(4242, d, 120));
    const b = JSON.stringify(generateWorld(4242, d, 120));
    if (a !== b) fail(`generateWorld(4242, ${d}) is not deterministic`);
    if (JSON.stringify(generateWorld(4243, d, 120)) === a) {
      fail(`${d}: seeds 4242 and 4243 produce identical worlds`);
    }
  }
  if (
    JSON.stringify(generateWorld(9, 'easy', 120)) === JSON.stringify(generateWorld(9, 'hard', 120))
  ) {
    fail('easy and hard are identical - difficulty is not reaching generation');
  }
  // Growing a world in steps must match generating it in one go, or the game and
  // this checker are looking at different worlds.
  const stepwise = createWorld(77, 'normal');
  for (let m = 20; m <= 120; m += 20) extendTo(stepwise, -m * METRE);
  const oneShot = generateWorld(77, 'normal', 120);
  if (JSON.stringify(stepwise.plats) !== JSON.stringify(oneShot.plats)) {
    fail('growing a world incrementally does not match generating it in one call');
  }
}

/* ========================================================================== *
 * SELF-TESTS - a verifier that cannot fail proves nothing
 * ========================================================================== */

/** A minimal world: the full-width ground plus one platform at a chosen offset. */
function probeWorld(dy: number, dx: number, width = PLAT_W): World {
  const w = createWorld(1, 'normal');
  w.plats.push({
    id: 1,
    kind: 'solid',
    x: wrapX(W / 2 + dx),
    y: -dy,
    w: width,
    amp: 0,
    speed: 0,
    phase: 0,
    route: true,
    broken: false,
    breakT: 0,
    pop: 0,
  });
  w.top = w.plats[1];
  return w;
}

/** Can the ground reach the single platform above it in `w`? */
function probeReaches(w: World): boolean {
  const ground = w.plats[0];
  const buckets = bucketize(w.plats);
  for (const t0 of [0]) {
    for (const plan of PLANS) {
      const r = hop(w, buckets, ground, {
        d: 'normal',
        t0,
        vx0: 0,
        plan,
        allowCrumble: false,
        launchV: VB,
        hazardsBlock: true,
      });
      if (r.kind === 'landed' && r.on.id === 1) return true;
    }
  }
  return false;
}

/** Landing tolerance for a slab of width `w`, matching `footHalf` minus the pad. */
const FOOT_TRIM_LOCAL = 3;

/**
 * Height an ordinary bounce ACTUALLY rises, stepped at the game's own dt.
 *
 * This is not VB^2/2G. Semi-implicit Euler loses a little energy per step, so the
 * closed-form rise is optimistic by a few per cent, and a gap sized against the
 * closed form alone would be a gap the player cannot quite clear. Measuring it is
 * the only honest way to know, and the route ceiling below is checked against
 * THIS number rather than the algebra.
 */
function measureApex(): number {
  const b: Body = { x: W / 2, y: 0, vx: 0, vy: -VB };
  let apex = 0;
  for (let f = 0; f < MAX_FRAMES; f += 1) {
    stepBody(b, { impulse: 0, left: false, right: false }, DT);
    apex = Math.min(apex, b.y);
    if (b.y > 0) break;
  }
  return -apex;
}

const APEX = measureApex();

/**
 * The furthest sideways any plan in the set can drag the player and STILL land on
 * a surface `dy` above the launch point.
 *
 * Measured through `lands` itself rather than by finding the crossing frame,
 * because the landing test tolerates the feet being up to a unit under the surface
 * - so it stays true for several frames near the top of the arc, and the drift
 * keeps growing the whole time. An earlier version of this measured the first
 * crossing only and under-reported by two units, which made the self-test below
 * report a false failure. Under-reporting a bound is how a checker lies.
 */
function measureDrift(dy: number): number {
  let best = 0;
  for (const plan of PLANS) {
    const b: Body = { x: W / 2, y: 0, vx: 0, vy: -VB };
    for (let f = 0; f < MAX_FRAMES; f += 1) {
      const prev = b.y;
      stepBody(b, { impulse: impulseAt(plan, f), left: false, right: false }, DT);
      // Infinite foot: asking only "would a surface here accept a landing now".
      if (lands(b, prev, W / 2, -dy, Infinity)) {
        best = Math.max(best, Math.abs(dxWrap(W / 2, b.x)));
      }
      if (b.y > 0) break;
    }
  }
  return best;
}

const selfTests: string[] = [];

function selfTest(): void {
  // (a) Inside the envelope: must be reachable, or the whole search is broken and
  //     every pass above is meaningless.
  const inside = probeWorld(APEX * 0.7, 0);
  if (!probeReaches(inside)) {
    fail(
      'SELF-TEST: a platform at 70% of the derived bounce rise directly overhead read as ' +
        'UNREACHABLE, so the search cannot find anything and its passes mean nothing',
    );
  } else {
    selfTests.push(`a platform ${(APEX * 0.7).toFixed(1)} up (70% of the measured apex) is reachable`);
  }

  // (b) One nudge past the derived vertical envelope: must be caught.
  const tooHigh = probeWorld(APEX * 1.04, 0);
  if (probeReaches(tooHigh)) {
    fail(
      `SELF-TEST: a platform at ${(APEX * 1.04).toFixed(1)} units, just past the measured bounce ` +
        `apex of ${APEX.toFixed(1)}, still read as reachable - the envelope is not being enforced`,
    );
  } else {
    selfTests.push(
      `a platform ${(APEX * 1.04).toFixed(1)} up (104% of the measured apex) is correctly caught ` +
        'as unreachable',
    );
  }

  // (c) The SIDEWAYS rule.
  //
  //     Finding worth writing down: on a cylinder only ${W} units around, the
  //     horizontal envelope never binds. The plan set is measured below, and a few
  //     taps carry the player further than half the world, so ANY x is reachable
  //     within one bounce. What actually keeps the game fair sideways is therefore
  //     not physics but generation's own `dxBudget` rule - so that is what gets a
  //     failable test, by pushing one real route step past its budget and
  //     asserting the static check notices.
  const tallGap = APEX * 0.98;
  const drift = measureDrift(tallGap);
  // Widest slab whose landing box still fits inside what the cylinder can express.
  // Derived, because picking it by hand is how the earlier version of this test
  // ended up unable to fail at all.
  const margin = 1.5;
  const maxFoot = W / 2 - drift - margin;
  const width = Math.floor(2 * (maxFoot - PW / 2 + FOOT_TRIM_LOCAL));
  if (width < 1) {
    fail(
      `SELF-TEST cannot be set up: measured drift ${drift.toFixed(1)} leaves only ` +
        `${maxFoot.toFixed(1)} of landing box inside half a ${W}-wide world, so the sideways ` +
        'envelope cannot be probed and is going unverified',
    );
  } else {
    const foot = width / 2 + PW / 2 - FOOT_TRIM_LOCAL;
    const beyond = drift + foot + margin;
    if (probeReaches(probeWorld(tallGap, beyond, width))) {
      fail(
        `SELF-TEST: a ${width}-wide platform ${beyond.toFixed(1)} units sideways at a ` +
          `${tallGap.toFixed(1)} gap still read as reachable, though the plan set was measured to ` +
          `drift at most ${drift.toFixed(1)} in that airtime - the sideways envelope is not enforced`,
      );
    } else {
      selfTests.push(
        `a ${width}-wide platform ${beyond.toFixed(1)} sideways at a ${tallGap.toFixed(1)} gap is ` +
          `correctly caught (measured max drift ${drift.toFixed(1)}, landing box ${foot.toFixed(1)})`,
      );
    }
  }
  {
    const bw = generateWorld(616, 'hard', 120);
    const route = bw.plats.filter((p) => p.route).sort((a, b) => b.y - a.y);
    const a = route[6];
    const b = route[7];
    const before = errors.length;
    if (a && b) {
      const gap = a.y - b.y;
      const over = dxBudget(gap) * 2.2;
      const shoved: World = {
        ...bw,
        plats: bw.plats.map((p) => (p.id === b.id ? { ...p, x: wrapX(a.x + over) } : p)),
      };
      const st = emptyStats();
      checkRouteEnvelope(shoved, 'self-test', st);
      if (errors.length === before) {
        fail(
          `SELF-TEST: shoving a route platform ${over.toFixed(1)} sideways at a ` +
            `${gap.toFixed(1)} gap - ${(2.2).toFixed(1)}x the ${dxBudget(gap).toFixed(1)} the ` +
            'airtime affords - was NOT caught by the reach-budget check',
        );
      } else {
        errors.length = before;
        selfTests.push(
          `shoving a route step to ${over.toFixed(1)} sideways (2.2x its ` +
            `${dxBudget(gap).toFixed(1)} budget) is correctly caught`,
        );
      }
    }
  }

  // (d) The same mutation on a REAL generated world, through the real sweep. One
  //     route platform is lifted just past the bounce envelope and everything else
  //     in that stretch removed, so the dead end has nowhere to hide.
  const w = generateWorld(31337, 'normal', 160);
  const route = w.plats.filter((p) => p.route).sort((a, b) => b.y - a.y);
  const from = route[Math.floor(route.length / 2)];
  const to = route[Math.floor(route.length / 2) + 1];
  const lifted = -1;
  if (!from || !to) {
    fail('SELF-TEST: could not find a route pair to mutate');
  } else {
    const mutated: World = {
      ...w,
      // Drop everything that sits in the stretch above `from`, then put the next
      // route platform back just out of reach.
      plats: w.plats
        .filter((p) => p.id === from.id || p.y >= from.y || p.y < from.y - APEX * 1.3)
        .map((p) => (p.id === to.id ? { ...p, y: from.y - APEX * 1.06, x: from.x } : p)),
    };
    // `to` was filtered out above, so add the out-of-reach version back in.
    mutated.plats.push({ ...to, y: from.y - APEX * 1.06, x: from.x });
    const r = checkReachable(mutated, 'self-test', [0], []);
    const caught = r.dead.some((m) => m.includes(`platform ${from.id} `));
    if (!caught) {
      fail(
        `SELF-TEST: lifting the platform above route platform ${from.id} to ` +
          `${(APEX * 1.06).toFixed(1)} units (106% of the measured apex) did NOT register as a ` +
          'dead end in the real sweep',
      );
    } else {
      selfTests.push(
        `lifting one real route platform to 106% of the measured apex is caught by the full sweep`,
      );
    }
  }
  void lifted;

  // (e) The overlap check must fire on a deliberate overlap.
  {
    const ow = generateWorld(5, 'normal', 60);
    const a = ow.plats[3];
    const before = errors.length;
    const clash: World = {
      ...ow,
      plats: [...ow.plats, { ...a, id: 99999, y: a.y + 2 }],
    };
    checkLayout(clash, 'self-test', emptyStats());
    if (errors.length === before) {
      fail('SELF-TEST: two platforms 2 units apart at the same x did not register as overlapping');
    } else {
      // Swallow the deliberate failures - they were the point.
      errors.length = before;
      selfTests.push('two platforms stacked 2 units apart are correctly caught as overlapping');
    }
  }

  // (f) The crumble rule must fire when the only way up is a crumbling platform.
  {
    const cw = generateWorld(808, 'hard', 160);
    const route = cw.plats.filter((p) => p.route).sort((a, b) => b.y - a.y);
    const base = route[8];
    const next = route[9];
    if (base && next) {
      const only: World = {
        ...cw,
        plats: cw.plats
          .filter((p) => p.y >= base.y || p.y < base.y - APEX * 1.4)
          .concat([
            // The only thing above `base` within reach, and it is one-use.
            { ...next, kind: 'crumble', route: false, y: base.y - APEX * 0.55, x: base.x },
          ]),
      };
      const r = checkReachable(only, 'self-test', [0], []);
      const flagged = r.dead.some((m) => m.includes('CRUMBLING'));
      if (!flagged) {
        fail(
          'SELF-TEST: making a crumbling platform the ONLY route above a platform was not ' +
            'reported as a crumble-only dead end',
        );
      } else {
        selfTests.push('a crumbling platform as the only route up is correctly reported');
      }
    }
  }

  // (g) The hazard rule must fire when a hazard is parked in the corridor.
  {
    const hw = generateWorld(1234, 'hard', 400);
    const route = hw.plats.filter((p) => p.route).sort((a, b) => b.y - a.y);
    const from2 = route[20];
    const to2 = route[21];
    const before = errors.length;
    if (from2 && to2) {
      const parked: World = {
        ...hw,
        hazards: [
          {
            id: 77777,
            kind: 'bee',
            x: wrapX(from2.x + dxWrap(from2.x, to2.x) / 2),
            y: (from2.y + to2.y) / 2,
            amp: 6,
            speed: 12,
            phase: 0,
          },
        ],
      };
      checkHazards(parked, 'self-test', emptyStats());
      if (errors.length === before) {
        fail('SELF-TEST: a hazard parked in the middle of the route corridor was not caught');
      } else {
        errors.length = before;
        selfTests.push('a hazard parked in the route corridor is correctly caught');
      }
    }
  }

  // (h) The spring horizon check must fire if the generator falls behind. A world
  //     grown only a little way above a spring must be reported as outrun.
  {
    const before = errors.length;
    const sw = createWorld(4, 'easy');
    extendTo(sw, -60);
    const spring = sw.plats.find((p) => p.kind === 'spring') ?? sw.plats[1];
    const stunted: World = { ...spring ? sw : sw };
    const buckets = bucketize(stunted.plats);
    const r = hop(stunted, buckets, stunted.plats[0], {
      d: 'easy',
      t0: 0,
      vx0: 0,
      plan: { dir: 1, count: 0, spacing: 4, start: 0 },
      allowCrumble: true,
      launchV: SPRING_VB,
      hazardsBlock: false,
    });
    const apex = r.kind === 'landed' || r.kind === 'timeout' ? r.apex : 0;
    if (apex >= stunted.top.y) {
      fail(
        `SELF-TEST: a SPRING_VB launch in a world grown only ${(-stunted.top.y).toFixed(0)} units ` +
          `high reached only ${apex.toFixed(1)}, so the "outran the generator" check can never ` +
          'trigger and proves nothing',
      );
    } else {
      selfTests.push(
        `a spring launch does clear a deliberately stunted ceiling (${apex.toFixed(0)} vs ` +
          `${stunted.top.y.toFixed(0)}), so the horizon check is live`,
      );
      errors.length = before;
    }
  }
}

/* ========================================================================== *
 * Run
 * ========================================================================== */

const SEEDS = [1, 2, 7, 19, 41, 97, 404, 1729, 8675, 31337, 60013, 99991];
/** Metres of climb generated per world. */
const METRES = 300;
/**
 * Arrival sideways speeds the claim must hold for. 0 is the settled state a bounce
 * leaves you in; the rest is an adversarial player who arrives already moving away
 * from where they need to go, up to the game's top speed. Holding the claim at
 * full VX_MAX is what REACH_SAFETY buys, and it means a fast arrival can never
 * cost the run - only, at worst, a retry.
 */
const ARRIVAL_VX = [0, VX_MAX * 0.5, -VX_MAX * 0.5];
/** Speeds at which the player must at least SURVIVE, height not required. */
const SURVIVE_VX = [VX_MAX, -VX_MAX];

const started = Date.now();

console.log('derived from the real physics constants (nothing below is hard-coded):');
console.log(
  `  G=${G} VB=${VB} SPRING_VB=${SPRING_VB} TAP_IMPULSE=${TAP_IMPULSE} DRAG=${DRAG} ` +
    `VX_MAX=${VX_MAX}`,
);
console.log(
  `  bounce rise ${RISE.toFixed(2)} units (${(RISE / METRE).toFixed(2)} m), hang ` +
    `${HANG.toFixed(3)} s, spring rise ${SPRING_UP.toFixed(2)}`,
);
console.log(
  `  MEASURED apex at the game's own dt: ${APEX.toFixed(2)} units - ${(RISE - APEX).toFixed(2)} ` +
    `less than the algebra, because the integrator loses energy per step. Route gaps are ` +
    'checked against this, not against VB^2/2G.',
);
console.log(
  `  tap-only sideways span per bounce ${TAP_SPAN.toFixed(2)}; holding a key would give ` +
    `${HOLD_SPAN.toFixed(2)} (not relied on)`,
);
console.log(
  `  reach budget at the biggest gap in the game (${TUNE.hard.gapMax}): ` +
    `${dxBudget(TUNE.hard.gapMax).toFixed(2)} units, safety factor ${REACH_SAFETY}`,
);
console.log(
  `  ${PLANS.length} tap plans x up to 6 launch phases x ${ARRIVAL_VX.length} arrival speeds for ` +
    `the height guarantee, plus ${SURVIVE_VX.length} at full speed for the survival guarantee\n`,
);

// The module's own constants must agree with the derivation, or the game is
// running physics this file is not checking.
if (Math.abs(MAX_RISE - RISE) > 1e-9) fail(`MAX_RISE ${MAX_RISE} does not match VB^2/2G ${RISE}`);
if (Math.abs(SPRING_RISE - SPRING_UP) > 1e-9) fail('SPRING_RISE does not match SPRING_VB^2/2G');
if (Math.abs(tapReach(HANG) - TAP_SPAN) > 1e-9) fail('tapReach disagrees with the drag integral');
if (!Number.isFinite(airtimeTo(RISE * 0.999))) fail('airtimeTo cannot solve inside its own rise');
if (Number.isFinite(airtimeTo(RISE * 1.001))) fail('airtimeTo claims a height above the rise');
if (HAZ_R <= 0 || PLAT_W <= 0 || PLAT_H <= 0) fail('a core size constant is not positive');

checkDifficultyOrdering();
checkEasyIsKind();
checkDeterminism();

// The knobs themselves must fit under the apex the integrator really delivers,
// with room to spare - a gap at 99% of the apex is one a player cannot land on.
for (const d of DIFFICULTIES) {
  const headroom = APEX / TUNE[d].gapMax;
  if (headroom < 1.25) {
    fail(
      `${d}: biggest possible gap ${TUNE[d].gapMax} is ${(headroom * 100 - 100).toFixed(0)}% under ` +
        `the measured apex ${APEX.toFixed(1)} - too tight to land reliably`,
    );
  }
}

for (const d of DIFFICULTIES) {
  const st = emptyStats();
  let checked = 0;
  let nearTop = 0;
  for (const seed of SEEDS) {
    const w = generateWorld(seed, d, METRES);
    const at = `${d} seed ${seed}`;
    checkLayout(w, at, st);
    checkRouteEnvelope(w, at, st);
    checkMovers(w, at);
    checkHazards(w, at, st);
    checkCoins(w, at, st);
    const r = checkReachable(w, at, ARRIVAL_VX, SURVIVE_VX);
    checked += r.checked;
    nearTop += r.nearTop;
    for (const m of r.dead) fail(m);
    for (const m of r.trapped) fail(m);
  }
  checkSprings(SEEDS[0], d);
  checkSprings(SEEDS[5], d);
  console.log(
    `${d.padEnd(6)} ${SEEDS.length} worlds x ${METRES}m: ${st.plats} platforms ` +
      `(${st.route} route, ${st.bonus} bonus, ${st.spring} spring, ${st.mover} mover, ` +
      `${st.crumble} crumble), ${st.coins} coins, ${st.hazards} hazards`,
  );
  console.log(
    `       gaps: mean ${(st.gapSum / Math.max(1, st.gaps)).toFixed(1)}, max ` +
      `${st.gapMax.toFixed(1)} of ${RISE.toFixed(1)} allowed; closest pair ` +
      `${st.minVsep === Infinity ? 'n/a' : st.minVsep.toFixed(1)} (min ${MIN_VSEP})`,
  );
  console.log(`       simulated a climb out of ${checked} platforms (${nearTop} near the ceiling, skipped)`);
}

console.log('');
selfTest();
for (const line of selfTests) console.log(`self-test: ${line}`);

console.log(`\nfinished in ${Date.now() - started}ms`);

if (errors.length > 0) {
  console.error(`\n${errors.length} PROBLEM(S):`);
  for (const e of errors.slice(0, 30)) console.error(`  x ${e}`);
  if (errors.length > 30) console.error(`  ... and ${errors.length - 30} more`);
  process.exit(1);
}
console.log(
  'Every platform can reach one above it by an ordinary tap-steered bounce; no overlaps, no ' +
    'wall-offs, no forced crumble, no unavoidable hazard, springs stay inside the generated world.',
);
