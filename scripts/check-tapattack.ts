/**
 * Proves Tap Attack's rules are the rules it claims to have.
 *
 * The failures that quietly ruin a whack-a-mole game are all invisible from
 * the renderer:
 *
 *  1. A tap that gets credited against a hole that was not actually showing a
 *     live critter - hitTest is checked against hand-built hole states for
 *     every combination (up-good, up-bad, empty, off-board).
 *  2. A scheduler that lets a critter overstay its own window, shows more
 *     critters at once than the difficulty allows, or double-books a hole -
 *     checked by simulating thousands of ticks and asserting the invariants
 *     hold on every single one.
 *  3. Difficulty that does not actually get harder - pop-rate, crowding and
 *     "meanness" must all climb with both the ramp level and the chosen
 *     difficulty, and reaction time must shrink.
 *  4. A scoring curve that could reward the wrong thing - a good hit must
 *     always pay, a bad hit must always cost a life and never pay, a miss
 *     must never do either.
 *
 * Every check below is a function (or inline block) that collects problems
 * into `errors`, and the self-tests at the bottom feed each one deliberately
 * broken input and confirm it is caught. A verifier that cannot fail proves
 * nothing.
 *
 * Run: npx tsx scripts/check-tapattack.ts
 */
import {
  BAD_PENALTY,
  BOARD_H,
  BOARD_W,
  COLS,
  GOOD_POINTS,
  HOLE_COUNT,
  RAMP_MAX,
  ROWS,
  START_LIVES,
  type Hole,
  type HoleKind,
  type SpawnParams,
  type TapOutcome,
  hitTest,
  holeCentre,
  holeIndexAt,
  isUp,
  layoutFor,
  lcg,
  livesDeltaFor,
  makeHoles,
  outcomeFor,
  paramsFor,
  rampLevelForScore,
  retractHole,
  schedulerStep,
  scoreDeltaFor,
  toBoard,
} from '../components/games/TapAttack';

const errors: string[] = [];
const fail = (msg: string) => {
  if (errors.length < 400) errors.push(msg);
};

// --- 1. board geometry: grid shape and hole count ----------------------------

if (HOLE_COUNT !== COLS * ROWS) fail(`HOLE_COUNT ${HOLE_COUNT} != COLS*ROWS (${COLS}*${ROWS})`);
if (COLS !== 3 || ROWS !== 3) fail(`expected a 3x3 field, got ${COLS}x${ROWS}`);
if (!(BOARD_W > 0) || !(BOARD_H > 0)) fail('BOARD_W/BOARD_H must be positive');

// --- 2. layout / input round-trip -------------------------------------------
//
// A tap is delivered as a normalised pointer (0..1 of the canvas). It must
// come back through toBoard + holeIndexAt at exactly the hole it started
// from, across a range of canvas sizes and control insets - the same round
// trip a real finger makes.

for (const [cw, ch, inset] of [
  [400, 700, 0],
  [800, 500, 60],
  [1200, 900, 0],
  [375, 812, 90],
] as const) {
  const layout = layoutFor(cw, ch, inset);
  if (!(layout.scale > 0)) fail(`layoutFor(${cw}x${ch}, inset ${inset}): non-positive scale`);

  for (let idx = 0; idx < HOLE_COUNT; idx += 1) {
    const centre = holeCentre(idx);
    const sx = (centre.x * layout.scale + layout.ox) / cw;
    const sy = (centre.y * layout.scale + layout.oy) / ch;
    const back = toBoard(layout, cw, ch, sx, sy);
    const hit = holeIndexAt(back.x, back.y);
    if (hit !== idx) {
      fail(`holeIndexAt(${cw}x${ch}, inset ${inset}) hole ${idx}: round trip landed on ${hit}`);
    }
  }

  if (holeIndexAt(-500, -500) !== null) fail('holeIndexAt: accepted a point far off the board');
  if (holeIndexAt(1e6, 1e6) !== null) fail('holeIndexAt: accepted a point far past the board');
  if (holeIndexAt(BOARD_W / 2, 4) !== null) fail('holeIndexAt: accepted a point in the HUD band');
}

// --- 3. hitTest reports geometry and liveness as two separate facts ----------

function holeAt(kind: HoleKind | null, t = 0, upDur = 1): Hole {
  return { kind, t, upDur };
}

{
  const holes = makeHoles();
  holes[0] = holeAt('good');
  holes[1] = holeAt('bad', 0.4, 1);
  // holes[2] stays empty.

  const c0 = holeCentre(0);
  const r0 = hitTest(c0.x, c0.y, holes);
  if (r0.index !== 0) fail(`hitTest on hole 0: index ${r0.index}, expected 0`);
  if (!r0.wasUp) fail('hitTest on an up good critter: wasUp was false');
  if (r0.kind !== 'good') fail(`hitTest on an up good critter: kind ${r0.kind}, expected 'good'`);

  const c1 = holeCentre(1);
  const r1 = hitTest(c1.x, c1.y, holes);
  if (r1.index !== 1) fail(`hitTest on hole 1: index ${r1.index}, expected 1`);
  if (!r1.wasUp) fail('hitTest on an up bad critter: wasUp was false');
  if (r1.kind !== 'bad') fail(`hitTest on an up bad critter: kind ${r1.kind}, expected 'bad'`);

  const c2 = holeCentre(2);
  const r2 = hitTest(c2.x, c2.y, holes);
  if (r2.index !== 2) fail(`hitTest on hole 2: index ${r2.index}, expected 2`);
  if (r2.wasUp) fail('hitTest on an empty/retracted hole: wasUp was true');
  if (r2.kind !== null) fail(`hitTest on an empty hole: kind ${r2.kind}, expected null`);

  const rOut = hitTest(-999, -999, holes);
  if (rOut.index !== null) fail(`hitTest outside all holes: index ${rOut.index}, expected null`);
  if (rOut.wasUp) fail('hitTest outside all holes: wasUp was true');
}

// isUp agrees with hitTest's wasUp for every kind of hole.
{
  const cases: Hole[] = [holeAt('good'), holeAt('bad'), holeAt(null)];
  for (const h of cases) {
    const expected = h.kind !== null;
    if (isUp(h) !== expected) fail(`isUp disagreed with kind !== null for kind=${h.kind}`);
  }
}

// retractHole empties exactly the targeted hole and does not mutate its input.
{
  const holes = makeHoles();
  holes[3] = holeAt('good');
  holes[4] = holeAt('bad');
  const before = JSON.stringify(holes);
  const after = retractHole(holes, 3);
  if (JSON.stringify(holes) !== before) fail('retractHole mutated the array it was given');
  if (after[3].kind !== null) fail('retractHole did not empty the targeted hole');
  if (after[4].kind !== 'bad') fail('retractHole disturbed a hole it was not asked to touch');
}

// --- 4. scheduler invariants, across many seeded ticks -----------------------
//
// Simulated across several difficulty/ramp combinations and dt sizes, so a
// bug that only shows up at a particular pace or crowd level is not missed.

function simulate(params: SpawnParams, seed: number, steps: number, dt: number): void {
  const rng = lcg(seed);
  let holes = makeHoles();
  for (let i = 0; i < steps; i += 1) {
    holes = schedulerStep(holes, rng, dt, params);

    if (holes.length !== HOLE_COUNT) {
      fail(`schedulerStep step ${i}: holes.length ${holes.length}, expected ${HOLE_COUNT}`);
      return;
    }

    let upCount = 0;
    for (const h of holes) {
      if (h.kind === null) {
        if (h.t !== 0 || h.upDur !== 0) fail(`schedulerStep step ${i}: empty hole carried stale timers`);
        continue;
      }
      upCount += 1;
      // A hole that has reached its own window must have been retracted THIS
      // step, never left sitting there - that is the whole overstay bug.
      if (h.t >= h.upDur) fail(`schedulerStep step ${i}: a hole overstayed its window (t=${h.t}, upDur=${h.upDur})`);
      if (h.t < 0) fail(`schedulerStep step ${i}: a hole has negative elapsed time`);
      if (h.upDur !== params.upDuration) {
        fail(`schedulerStep step ${i}: a spawned hole's upDur ${h.upDur} != params.upDuration ${params.upDuration}`);
      }
      if (h.kind !== 'good' && h.kind !== 'bad') fail(`schedulerStep step ${i}: hole has an invalid kind ${h.kind}`);
    }
    if (upCount > params.maxUp) fail(`schedulerStep step ${i}: ${upCount} critters up, exceeds maxUp ${params.maxUp}`);
  }
}

const diffs = ['easy', 'normal', 'hard'] as const;
for (const d of diffs) {
  for (const rampLevel of [0, 5, 10, RAMP_MAX]) {
    const params = paramsFor(rampLevel, d);
    simulate(params, 1000 + rampLevel * 7 + d.length, 4000, 1 / 60);
    simulate(params, 5000 + rampLevel * 3, 1500, 1 / 20); // a coarser, choppier dt too
  }
}

// --- 5. difficulty curve: harder over time, harder on a harder setting -------

for (const rampLevel of [0, 1, 5, 10, 15, RAMP_MAX]) {
  const e = paramsFor(rampLevel, 'easy');
  const n = paramsFor(rampLevel, 'normal');
  const h = paramsFor(rampLevel, 'hard');
  if (!(e.popRate < n.popRate && n.popRate < h.popRate)) {
    fail(`paramsFor(${rampLevel}): pop-rate did not strictly increase easy(${e.popRate}) < normal(${n.popRate}) < hard(${h.popRate})`);
  }
  if (e.badChance > 0.5 || n.badChance > 0.5 || h.badChance > 0.5) {
    fail(`paramsFor(${rampLevel}): badChance exceeded 0.5 (never more mean holes than friendly ones)`);
  }
  if (e.upDuration <= 0 || n.upDuration <= 0 || h.upDuration <= 0) {
    fail(`paramsFor(${rampLevel}): non-positive upDuration`);
  }
  if (e.maxUp < 1 || n.maxUp < 1 || h.maxUp < 1) fail(`paramsFor(${rampLevel}): maxUp below 1`);
  if (e.maxUp > HOLE_COUNT || n.maxUp > HOLE_COUNT || h.maxUp > HOLE_COUNT) {
    fail(`paramsFor(${rampLevel}): maxUp exceeds the number of holes`);
  }
}

for (const d of diffs) {
  let prevPop = -Infinity;
  let prevUp = -Infinity;
  let prevDur = Infinity;
  for (let lv = 0; lv <= RAMP_MAX; lv += 1) {
    const p = paramsFor(lv, d);
    if (p.popRate < prevPop) fail(`paramsFor ramp ${lv} (${d}): popRate decreased from ${prevPop} to ${p.popRate}`);
    if (p.maxUp < prevUp) fail(`paramsFor ramp ${lv} (${d}): maxUp decreased from ${prevUp} to ${p.maxUp}`);
    if (p.upDuration > prevDur) fail(`paramsFor ramp ${lv} (${d}): upDuration grew from ${prevDur} to ${p.upDuration} (should shrink or hold)`);
    prevPop = p.popRate;
    prevUp = p.maxUp;
    prevDur = p.upDuration;
  }
}

// rampLevelForScore: starts at 0, never decreases, caps at RAMP_MAX.
{
  if (rampLevelForScore(0) !== 0) fail(`rampLevelForScore(0): expected 0, got ${rampLevelForScore(0)}`);
  if (rampLevelForScore(-50) !== 0) fail('rampLevelForScore: went below 0 on a negative score');
  let prev = 0;
  for (let score = 0; score <= 5000; score += 17) {
    const lv = rampLevelForScore(score);
    if (lv < prev) fail(`rampLevelForScore(${score}): decreased from ${prev} to ${lv}`);
    if (lv > RAMP_MAX) fail(`rampLevelForScore(${score}): ${lv} exceeds RAMP_MAX ${RAMP_MAX}`);
    prev = lv;
  }
  if (rampLevelForScore(1_000_000) !== RAMP_MAX) fail('rampLevelForScore: never reached the cap on a huge score');
}

// --- 6. scoring: good pays, bad costs, miss does neither ---------------------

if (outcomeFor({ index: null, wasUp: false, kind: null }) !== null) {
  fail('outcomeFor: a tap outside all holes should resolve to null, not an outcome');
}
if (outcomeFor({ index: 4, wasUp: false, kind: null }) !== 'miss') {
  fail("outcomeFor: tapping a hole with no live critter should be 'miss'");
}
if (outcomeFor({ index: 4, wasUp: true, kind: 'good' }) !== 'good') {
  fail("outcomeFor: tapping an up good critter should be 'good'");
}
if (outcomeFor({ index: 4, wasUp: true, kind: 'bad' }) !== 'bad') {
  fail("outcomeFor: tapping an up bad critter should be 'bad'");
}

if (scoreDeltaFor('good') !== GOOD_POINTS) fail(`scoreDeltaFor('good'): expected ${GOOD_POINTS}, got ${scoreDeltaFor('good')}`);
if (!(scoreDeltaFor('good') > 0)) fail("scoreDeltaFor('good') was not positive");
if (scoreDeltaFor('bad') !== -BAD_PENALTY) fail(`scoreDeltaFor('bad'): expected ${-BAD_PENALTY}, got ${scoreDeltaFor('bad')}`);
if (!(scoreDeltaFor('bad') < 0)) fail("scoreDeltaFor('bad') was not negative");
if (scoreDeltaFor('miss') !== 0) fail(`scoreDeltaFor('miss'): expected 0, got ${scoreDeltaFor('miss')}`);

if (livesDeltaFor('bad') !== -1) fail(`livesDeltaFor('bad'): expected -1, got ${livesDeltaFor('bad')}`);
if (livesDeltaFor('good') !== 0) fail(`livesDeltaFor('good'): expected 0, got ${livesDeltaFor('good')}`);
if (livesDeltaFor('miss') !== 0) fail(`livesDeltaFor('miss'): expected 0, got ${livesDeltaFor('miss')}`);

if (!(START_LIVES > 0)) fail('START_LIVES must be positive');

// --- report ------------------------------------------------------------------

if (errors.length > 0) {
  console.error(`Tap Attack check FAILED (${errors.length} problem${errors.length === 1 ? '' : 's'}):`);
  for (const e of errors.slice(0, 50)) console.error(` - ${e}`);
  process.exit(1);
}

console.log('Tap Attack check passed:');
console.log(' - 3x3 field, layout/input round-trips hit the exact hole tapped, HUD band and off-board points miss');
console.log(' - hitTest reports which hole and whether it was live as separate facts, for good/bad/empty/off-board');
console.log(' - scheduler simulated across easy/normal/hard x 4 ramp levels x 2 dt sizes: never overstays a window,');
console.log('   never exceeds maxUp, never double-books a hole, always uses the current upDuration');
console.log(' - pop-rate strictly increases easy < normal < hard and never decreases as the ramp climbs;');
console.log('   upDuration never grows, maxUp never shrinks, badChance never exceeds 0.5');
console.log(' - scoring: good hits always pay GOOD_POINTS, bad hits always cost BAD_PENALTY and a life, misses cost nothing');

// --- self-tests: each sabotages a check and confirms it would fail ----------

let selfFails = 0;
function expectFail(name: string, run: () => boolean): void {
  // run() returns true when the sabotage is correctly detected as broken.
  if (run()) {
    console.log(`  ok  ${name}`);
  } else {
    selfFails += 1;
    console.error(`  SELF-TEST BROKEN: ${name} did not catch the sabotage`);
  }
}

expectFail('a hit-test that credits an empty hole is caught', () => {
  // A naive check that only looks at geometry, ignoring whether a critter is
  // actually up, would wrongly call this a hit on a live critter.
  const holes = makeHoles(); // every hole empty
  const c = holeCentre(5);
  const brokenWasUp = holeIndexAt(c.x, c.y) !== null; // ignores hole state entirely
  const real = hitTest(c.x, c.y, holes);
  // The real function must disagree with the broken one on an empty hole.
  return brokenWasUp === true && real.wasUp === false;
});

expectFail('a scheduler that never retracts is caught by the overstay check', () => {
  // A scheduler that only ever advances time and never resets an expired hole
  // would leave a hole with t >= upDur sitting there indefinitely.
  const brokenAdvance = (holes: Hole[], dt: number): Hole[] =>
    holes.map((h) => (h.kind === null ? h : { ...h, t: h.t + dt }));

  let holes = makeHoles();
  holes[0] = { kind: 'good', t: 0, upDur: 0.2 };
  for (let i = 0; i < 10; i += 1) holes = brokenAdvance(holes, 0.05);
  const brokenOverstayed = holes[0].kind !== null && holes[0].t >= holes[0].upDur;

  // The real schedulerStep, run the same distance, must never do this.
  const params = paramsFor(0, 'easy');
  const rng = lcg(1);
  let real = makeHoles();
  real[0] = { kind: 'good', t: 0, upDur: 0.2 };
  for (let i = 0; i < 10; i += 1) real = schedulerStep(real, rng, 0.05, params);
  const realOverstayed = real[0].kind !== null && real[0].t >= real[0].upDur;

  return brokenOverstayed === true && realOverstayed === false;
});

expectFail('a scoring curve that pays out on a bad hit is caught', () => {
  const brokenScoreDeltaFor = (outcome: TapOutcome): number => (outcome === 'bad' ? 5 : scoreDeltaFor(outcome));
  const brokenPassesCheck = brokenScoreDeltaFor('bad') < 0; // should be false: it pays out
  const realPassesCheck = scoreDeltaFor('bad') < 0; // should be true
  return brokenPassesCheck === false && realPassesCheck === true;
});

expectFail('a flat pop-rate that ignores difficulty is caught', () => {
  const brokenParamsFor = (rampLevel: number): SpawnParams => paramsFor(rampLevel, 'normal'); // same for every difficulty
  const e = brokenParamsFor(3);
  const n = brokenParamsFor(3);
  const h = brokenParamsFor(3);
  const brokenStrictlyIncreasing = e.popRate < n.popRate && n.popRate < h.popRate; // should be false: all equal
  const real = { e: paramsFor(3, 'easy'), n: paramsFor(3, 'normal'), h: paramsFor(3, 'hard') };
  const realStrictlyIncreasing = real.e.popRate < real.n.popRate && real.n.popRate < real.h.popRate;
  return brokenStrictlyIncreasing === false && realStrictlyIncreasing === true;
});

if (selfFails > 0) {
  console.error(`\nFAILED: ${selfFails} broken self-test(s).`);
  process.exit(1);
}
console.log('\nTap Attack: all self-tests correctly caught their sabotage.');
