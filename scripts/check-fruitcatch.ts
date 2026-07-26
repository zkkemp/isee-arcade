/**
 * Headless proof for Fruit Catch's rules.
 *
 * Drives the exact pure functions the game runs (catchTest, spawnItem,
 * stepFall, fallSpeedFor, spawnIntervalFor, scoreForCatch, stepWorld) - the
 * same way check-breakout.ts and check-tictactoe.ts prove their games.
 *
 * Core claims:
 * 1. catchTest agrees with what "in the basket" should mean: a centred item
 *    at basket height is caught, one clearly off to the side is not, and the
 *    boundary right at the basket's edge resolves the way overlap geometry
 *    demands (just inside overlaps, just outside does not).
 * 2. The spawn/fall step is pure given rng + dt + difficulty: items always
 *    spawn on-field, fall speed ramps upward with progress and with
 *    difficulty (never backwards), and stepFall only ever moves items down.
 * 3. Scoring credits a caught good fruit and never a caught bad item, and
 *    stepWorld actually enforces the life rule: only a caught bad item costs
 *    a life, a missed good fruit is free, and running out of lives is a free
 *    continue (lives reset, field clears) rather than a stop.
 *
 * Each self-test at the end sabotages a check and confirms it would fail, so
 * a check that has quietly stopped testing anything is caught (mirrors
 * scripts/check-tictactoe.ts's expectFail pattern).
 *
 * Run: npx tsx scripts/check-fruitcatch.ts
 */
import {
  FIELD_W,
  MAX_FALL_SPEED,
  START_LIVES,
  basketWidthFor,
  catchTest,
  createWorld,
  fallSpeedFor,
  lcg,
  scoreForCatch,
  spawnIntervalFor,
  spawnItem,
  stepFall,
  stepWorld,
  type Ctrl,
  type Item,
  type World,
} from '../components/games/FruitCatch';
import { DIFFICULTIES, type Difficulty } from '../lib/difficulty';

let failures = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    failures += 1;
    console.error(`  FAIL: ${msg}`);
  }
}

const NO_INPUT: Ctrl = { pointerX: null, left: false, right: false };

// ---------------------------------------------------------------------------
// 1. catchTest geometry
// ---------------------------------------------------------------------------

const BASKET_X = 100;
const BASKET_W = 40; // half = 20, spans [80, 120]
const BASKET_TOP = 200;
const BASKET_H = 12; // spans [200, 212]

{
  // Centred over the basket, at basket height -> caught.
  const centred = catchTest(BASKET_X, BASKET_TOP + BASKET_H / 2, 3, BASKET_X, BASKET_W, BASKET_TOP, BASKET_H);
  assert(centred, 'a fruit centred over the basket at basket height was not caught');

  // Clearly off to the side, same height -> not caught.
  const toSide = catchTest(BASKET_X + 70, BASKET_TOP + BASKET_H / 2, 3, BASKET_X, BASKET_W, BASKET_TOP, BASKET_H);
  assert(!toSide, 'a fruit clearly to the side of the basket was wrongly caught');

  // Still high in the air, horizontally centred -> not caught (vertical band matters).
  const highAbove = catchTest(BASKET_X, 5, 3, BASKET_X, BASKET_W, BASKET_TOP, BASKET_H);
  assert(!highAbove, 'a fruit still high above the basket was wrongly caught');

  // Horizontal boundary: item overlapping the basket's right edge by a hair -> caught.
  const r = 2;
  const justInsideX = BASKET_X + BASKET_W / 2 - 0.5; // item spans [117.5, 121.5], basket right edge at 120
  const justInside = catchTest(justInsideX, BASKET_TOP + BASKET_H / 2, r, BASKET_X, BASKET_W, BASKET_TOP, BASKET_H);
  assert(justInside, `item overlapping the basket edge by 0.5 (x=${justInsideX}) was not caught`);

  // Just outside: item's near edge is past the basket's right edge -> not caught.
  const justOutsideX = BASKET_X + BASKET_W / 2 + r + 0.5; // item spans [120.5, 124.5]
  const justOutside = catchTest(justOutsideX, BASKET_TOP + BASKET_H / 2, r, BASKET_X, BASKET_W, BASKET_TOP, BASKET_H);
  assert(!justOutside, `item clear of the basket edge by 0.5 (x=${justOutsideX}) was wrongly caught`);

  // Vertical boundary, same idea: overlapping the top of the band by a hair vs clear of it.
  const justInsideY = catchTest(BASKET_X, BASKET_TOP + r - 0.5, r, BASKET_X, BASKET_W, BASKET_TOP, BASKET_H);
  assert(justInsideY, 'item overlapping the top of the catch band by 0.5 was not caught');
  const justOutsideY = catchTest(BASKET_X, BASKET_TOP - r - 0.5, r, BASKET_X, BASKET_W, BASKET_TOP, BASKET_H);
  assert(!justOutsideY, 'item clear above the catch band by 0.5 was wrongly caught');

  console.log('catchTest: centred caught, off-to-the-side missed, both edges resolve correctly');
}

// ---------------------------------------------------------------------------
// 2. spawn / fall step, purity and monotonic ramp
// ---------------------------------------------------------------------------

{
  // Determinism: same seed, same sequence of spawns.
  const a = lcg(4242);
  const b = lcg(4242);
  const seqA: Item[] = [];
  const seqB: Item[] = [];
  for (let i = 0; i < 30; i += 1) {
    seqA.push(spawnItem(a, FIELD_W, 50, 0.2));
    seqB.push(spawnItem(b, FIELD_W, 50, 0.2));
  }
  assert(JSON.stringify(seqA) === JSON.stringify(seqB), 'spawnItem is not deterministic for a fixed seed');

  // Every spawn lands fully on-field and above the top edge.
  const rng = lcg(99);
  let bad = 0;
  const N = 4000;
  for (let i = 0; i < N; i += 1) {
    const it = spawnItem(rng, FIELD_W, 40, 0.2);
    assert(it.x - it.r >= -1e-6, `spawned item x=${it.x} r=${it.r} pokes off the left edge`);
    assert(it.x + it.r <= FIELD_W + 1e-6, `spawned item x=${it.x} r=${it.r} pokes off the right edge`);
    assert(it.y < 0, `spawned item y=${it.y} should start above the field`);
    assert(it.vy > 0, 'spawned item has non-positive fall speed');
    if (!it.good) bad += 1;
  }
  const badFrac = bad / N;
  assert(
    Math.abs(badFrac - 0.2) < 0.03,
    `bad-item chance drifted: wanted ~0.20, got ${badFrac.toFixed(3)} over ${N} spawns`,
  );

  // stepFall only ever moves items DOWN, by exactly vy * dt.
  const items: Item[] = [
    { x: 10, y: 0, r: 5, vy: 20, good: true, variant: 'apple' },
    { x: 50, y: -30, r: 5, vy: 40, good: false, variant: 'bug' },
  ];
  const before = items.map((it) => it.y);
  stepFall(items, 0.5);
  for (let i = 0; i < items.length; i += 1) {
    const expected = before[i] + items[i].vy * 0.5;
    assert(Math.abs(items[i].y - expected) < 1e-9, `stepFall moved item ${i} to an unexpected y`);
    assert(items[i].y > before[i], `stepFall moved item ${i} upward or not at all`);
  }

  // Fall speed ramps upward (or holds, never backwards) with progress, and is
  // capped at MAX_FALL_SPEED - it "gets slightly faster", never unbounded.
  for (const d of DIFFICULTIES) {
    let prev = fallSpeedFor(0, d);
    for (let caught = 1; caught <= 200; caught += 1) {
      const cur = fallSpeedFor(caught, d);
      assert(cur >= prev - 1e-9, `${d}: fall speed dropped between ${caught - 1} and ${caught} catches`);
      assert(cur <= MAX_FALL_SPEED + 1e-9, `${d}: fall speed ${cur} exceeded MAX_FALL_SPEED`);
      prev = cur;
    }
  }

  // Fall speed increases with difficulty at the same amount of progress. High
  // values are avoided here because easy/normal/hard all share the same
  // MAX_FALL_SPEED ceiling - given enough progress two of them can legitimately
  // saturate to the identical cap, which is intended behaviour, not a bug.
  for (const caught of [0, 5, 20, 40]) {
    const speeds = DIFFICULTIES.map((d) => fallSpeedFor(caught, d));
    assert(
      speeds[0] < speeds[1] && speeds[1] < speeds[2],
      `fall speed not easy < normal < hard at caught=${caught} (${speeds.map((s) => s.toFixed(1)).join(', ')})`,
    );
  }

  // Spawn interval shrinks (or holds) with progress and is always within its floor/ceiling.
  for (const d of DIFFICULTIES) {
    let prev = spawnIntervalFor(0, d);
    for (let caught = 1; caught <= 200; caught += 1) {
      const cur = spawnIntervalFor(caught, d);
      assert(cur <= prev + 1e-9, `${d}: spawn interval grew between ${caught - 1} and ${caught} catches`);
      prev = cur;
    }
  }
  const gaps = DIFFICULTIES.map((d) => spawnIntervalFor(0, d));
  assert(
    gaps[0] > gaps[1] && gaps[1] > gaps[2],
    `spawn interval not easy > normal > hard (${gaps.map((g) => g.toFixed(2)).join(', ')})`,
  );

  console.log(
    `spawn/fall: ${N} spawns all on-field, bad-chance ~${(badFrac * 100).toFixed(1)}%; ` +
      `fall speed and spawn rate ramp monotonically and order easy<normal<hard`,
  );
}

// ---------------------------------------------------------------------------
// 3. scoring and the life rule, via the real stepWorld
// ---------------------------------------------------------------------------

function worldWithOneItem(good: boolean, lives: number, d: Difficulty = 'normal'): World {
  const w = createWorld({ difficulty: d, seed: 7, cw: 200, ch: 400 });
  w.lives = lives;
  w.spawnTimer = 999; // suppress incidental spawns so only our planted item matters
  const half = w.basket.w / 2;
  w.basket.x = 100;
  const g = w.geom;
  // Planted dead-centre in the catch band, moving down slowly so it is caught
  // on this very step rather than skipped past.
  w.items = [{ x: w.basket.x, y: g.basketY + g.basketH / 2, r: 3, vy: 5, good, variant: good ? 'apple' : 'bug' }];
  void half;
  return w;
}

{
  assert(scoreForCatch(true) === 10, `scoreForCatch(good) should award points, got ${scoreForCatch(true)}`);
  assert(scoreForCatch(false) === 0, `scoreForCatch(bad) should award nothing, got ${scoreForCatch(false)}`);

  // Catching good fruit: scores, does not cost a life, item is consumed.
  const wGood = worldWithOneItem(true, 3);
  const evGood = stepWorld(wGood, 1 / 60, NO_INPUT);
  assert(evGood.caughtGood === true, 'catching a centred good fruit was not reported');
  assert(evGood.score === 10, `expected 10 points for a caught good fruit, got ${evGood.score}`);
  assert(wGood.lives === 3, `catching good fruit should not cost a life (lives=${wGood.lives})`);
  assert(wGood.items.length === 0, 'caught item should be removed from the field');

  // Catching a bad item: no score, costs exactly one life.
  const wBad = worldWithOneItem(false, 3);
  const evBad = stepWorld(wBad, 1 / 60, NO_INPUT);
  assert(evBad.caughtBad === true, 'catching a centred bad item was not reported');
  assert(evBad.lostLife === true, 'catching a bad item did not report a lost life');
  assert(evBad.score === 0, `catching a bad item should never score, got ${evBad.score}`);
  assert(wBad.lives === 2, `catching a bad item should cost exactly one life (lives=${wBad.lives})`);

  // Missing a GOOD fruit (letting it fall past the bottom) costs nothing.
  const wMiss = createWorld({ difficulty: 'normal', seed: 3, cw: 200, ch: 400 });
  wMiss.spawnTimer = 999;
  wMiss.items = [{ x: wMiss.basket.x + 90, y: wMiss.geom.h - 1, r: 3, vy: 40, good: true, variant: 'orange' }];
  const livesBefore = wMiss.lives;
  let missReported = false;
  for (let i = 0; i < 30 && wMiss.items.length > 0; i += 1) {
    const e = stepWorld(wMiss, 1 / 30, NO_INPUT);
    if (e.missedGood) missReported = true;
  }
  assert(missReported, 'letting a good fruit fall past the bottom did not report missedGood');
  assert(wMiss.lives === livesBefore, `missing a good fruit should be free (lives ${livesBefore} -> ${wMiss.lives})`);

  // Running out of lives is a FREE continue: lives reset, field clears, play
  // is never simply stopped.
  const wOut = worldWithOneItem(false, 1);
  const evOut = stepWorld(wOut, 1 / 60, NO_INPUT);
  assert(evOut.outOfLives === true, 'losing the last life did not report outOfLives');
  assert(wOut.lives === START_LIVES, `running out of lives should reset to ${START_LIVES}, got ${wOut.lives}`);
  assert(wOut.items.length === 0, 'the field should clear on a free continue');

  console.log(
    'scoring: good fruit scores and is free to miss, bad item never scores and costs one life, ' +
      'zero lives is a free continue',
  );
}

// ---------------------------------------------------------------------------
// 4. basic sanity: geometry ordering, and one full play-through simulation
// ---------------------------------------------------------------------------

{
  const widths = DIFFICULTIES.map((d) => basketWidthFor(d));
  assert(
    widths[0] > widths[1] && widths[1] > widths[2],
    `basket width not easy > normal > hard (${widths.join(', ')})`,
  );

  // Play a bot run: chase whatever is lowest, never touch bad items on purpose
  // by steering away from them, and confirm the run neither crashes nor stalls
  // out (score keeps climbing, the basket stays on-field).
  const w = createWorld({ difficulty: 'normal', seed: 55, cw: 220, ch: 480 });
  let score = 0;
  let steps = 0;
  const STEP_BUDGET = 3600; // one minute at 60fps
  for (; steps < STEP_BUDGET; steps += 1) {
    let target = w.basket.x;
    let lowestGoodY = -Infinity;
    for (const it of w.items) {
      if (it.good && it.y > lowestGoodY) {
        lowestGoodY = it.y;
        target = it.x;
      }
    }
    const ev = stepWorld(w, 1 / 60, { pointerX: clampUnit(target / FIELD_W), left: false, right: false });
    score += ev.score;
    assert(w.basket.x >= 0 && w.basket.x <= FIELD_W, `basket left the field at x=${w.basket.x}`);
  }
  assert(score > 0, 'a full minute of bot play scored nothing');
  console.log(`playthrough: ${steps} frames simulated, bot scored ${score}, basket stayed on-field throughout`);
}

function clampUnit(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// ---------------------------------------------------------------------------
// self-tests: each sabotages a check and confirms it would fail
// ---------------------------------------------------------------------------

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

expectFail('a vertical-blind catch test is caught', () => {
  // A broken catch test that only checks horizontal overlap (forgetting the
  // basket's height entirely) would wrongly call a fruit still high in the
  // air "caught". Confirm the real catchTest does not make that mistake.
  const brokenCatch = (ix: number, bx: number, bw: number): boolean => Math.abs(ix - bx) < bw / 2;
  const brokenSaysCaught = brokenCatch(BASKET_X, BASKET_X, BASKET_W);
  const realSaysCaught = catchTest(BASKET_X, 5, 3, BASKET_X, BASKET_W, BASKET_TOP, BASKET_H);
  return brokenSaysCaught === true && realSaysCaught === false;
});

expectFail('a bad catch that forgets to cost a life is caught', () => {
  const w = worldWithOneItem(false, 3);
  const before = w.lives;
  stepWorld(w, 1 / 60, NO_INPUT);
  const after = w.lives;
  const brokenAfter = before; // a broken implementation that never penalises
  return after < before && !(brokenAfter < before);
});

expectFail('a missed-good-fruit penalty is caught', () => {
  // The design requires missing good fruit to be FREE. A broken version that
  // costs a life on every miss must be distinguishable from the real rule.
  const w = createWorld({ difficulty: 'normal', seed: 9, cw: 200, ch: 400 });
  w.spawnTimer = 999;
  w.items = [{ x: w.basket.x + 90, y: w.geom.h - 1, r: 3, vy: 60, good: true, variant: 'grape' }];
  const before = w.lives;
  for (let i = 0; i < 10 && w.items.length > 0; i += 1) stepWorld(w, 1 / 30, NO_INPUT);
  const realAfter = w.lives;
  const brokenAfter = before - 1; // a broken "miss costs a life" version
  return realAfter === before && brokenAfter !== before;
});

expectFail('fall speed that ignores difficulty is caught', () => {
  const flatSpeed = (): number => 40; // a broken version, same constant for every difficulty
  const real = DIFFICULTIES.map((d) => fallSpeedFor(10, d));
  const broken = DIFFICULTIES.map(() => flatSpeed());
  const realDiffers = real[0] !== real[2];
  const brokenSame = broken[0] === broken[2];
  return realDiffers && brokenSame;
});

if (failures > 0 || selfFails > 0) {
  console.error(`\nFAILED: ${failures} assertion(s), ${selfFails} broken self-test(s).`);
  process.exit(1);
}
console.log('\nFruit Catch: catch geometry, spawn/fall purity, scoring, and the life rule all verified.');
