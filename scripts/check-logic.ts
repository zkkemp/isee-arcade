/**
 * Headless checks for the parts of the game that are pure logic and could be
 * silently, unwinnably wrong: procedurally generated level geometry, and the
 * adaptive question picker.
 *
 * Run: npm run check:logic
 */
import {
  COLS,
  GROUND_TOP,
  MAX_PIT_WIDTH,
  MIN_PIT_GAP,
  ROWS,
  TILE,
  buildLevel,
  findPits,
  solidAt,
} from '../lib/platformerLevel';
import { ALL_QUESTIONS, pickQuestion } from '../lib/questions/index';
import { emptyProgress, recordAnswer } from '../lib/progress';
import type { Subject } from '../lib/questions/types';

const errors: string[] = [];
const fail = (msg: string) => errors.push(msg);

// --- Level geometry -------------------------------------------------------

const LEVELS_TO_CHECK = 30;
/** Horizontal distance clearable in one jump: 2 * (v/g) * runSpeed, in tiles. */
const JUMP_REACH_TILES = ((2 * (292 / 880)) * 118) / TILE;

let totalPits = 0;
let totalCoins = 0;
let totalEnemies = 0;

for (let level = 1; level <= LEVELS_TO_CHECK; level += 1) {
  const L = buildLevel(level);
  const at = `level ${level}`;

  // Grid shape
  if (L.tiles.length !== ROWS) fail(`${at}: expected ${ROWS} rows, got ${L.tiles.length}`);
  for (const row of L.tiles) {
    if (row.length !== COLS) fail(`${at}: a row has ${row.length} cols, expected ${COLS}`);
  }

  // Spawn must be in open air with ground beneath it.
  const sx = Math.floor(L.spawn.x / TILE);
  const sy = Math.floor(L.spawn.y / TILE);
  if (solidAt(L.tiles, sx, sy)) fail(`${at}: spawn is inside a solid tile`);
  let groundBelowSpawn = false;
  for (let y = sy; y < ROWS; y += 1) {
    if (solidAt(L.tiles, sx, y)) {
      groundBelowSpawn = true;
      break;
    }
  }
  if (!groundBelowSpawn) fail(`${at}: spawn has no ground beneath it — instant pit death`);

  // Pits must be jumpable and never merge into one wide gap.
  const pits = findPits(L.tiles);
  totalPits += pits.length;
  for (const [px, pw] of pits) {
    if (pw > MAX_PIT_WIDTH) fail(`${at}: pit at x=${px} is ${pw} tiles wide (max ${MAX_PIT_WIDTH})`);
    if (pw >= JUMP_REACH_TILES) {
      fail(`${at}: pit at x=${px} (${pw}) exceeds jump reach (${JUMP_REACH_TILES.toFixed(1)})`);
    }
  }
  for (let i = 1; i < pits.length; i += 1) {
    const gap = pits[i][0] - (pits[i - 1][0] + pits[i - 1][1]);
    if (gap < MIN_PIT_GAP) {
      fail(`${at}: only ${gap} tiles of ground between pits at x=${pits[i - 1][0]} and ${pits[i][0]}`);
    }
  }

  // The flag needs a solid landing pad, and the run must be completable:
  // every pit is jumpable and separated, so walking right always works.
  const flagCol = Math.floor(L.flagX / TILE);
  for (let i = -2; i <= 2; i += 1) {
    if (!solidAt(L.tiles, flagCol + i, GROUND_TOP)) {
      fail(`${at}: flag landing pad has a hole at x=${flagCol + i}`);
    }
  }
  if (flagCol >= COLS) fail(`${at}: flag at x=${flagCol} is outside the level`);

  // No coin may be embedded in a wall, and each must be within jump height of
  // some solid surface below it.
  totalCoins += L.coins.length;
  if (L.coins.length === 0) fail(`${at}: no coins — gates would never fire`);
  for (const c of L.coins) {
    const cx = Math.floor(c.x / TILE);
    const cy = Math.floor(c.y / TILE);
    if (solidAt(L.tiles, cx, cy)) {
      fail(`${at}: coin at tile (${cx},${cy}) is inside a solid tile`);
    }
    let support = -1;
    for (let y = cy + 1; y < ROWS; y += 1) {
      if (solidAt(L.tiles, cx, y)) {
        support = y;
        break;
      }
    }
    // 3 tiles is the apex of a full jump (v^2 / 2g = 48px).
    if (support !== -1 && support - cy > 4) {
      fail(`${at}: coin at (${cx},${cy}) floats ${support - cy} tiles above support`);
    }
  }

  // Enemies must stand on solid ground, not inside it.
  totalEnemies += L.enemies.length;
  for (const e of L.enemies) {
    const ex = Math.floor(e.x / TILE);
    const ey = Math.floor(e.y / TILE);
    if (solidAt(L.tiles, ex, ey)) fail(`${at}: enemy at (${ex},${ey}) is inside a solid tile`);
    if (!solidAt(L.tiles, ex, GROUND_TOP)) fail(`${at}: enemy at x=${ex} is standing over a pit`);
    if (e.vx === 0) fail(`${at}: enemy at x=${ex} has zero velocity`);
  }
}

// Determinism: the same level number must generate identically every time.
const a = buildLevel(7);
const b = buildLevel(7);
if (JSON.stringify(a.tiles) !== JSON.stringify(b.tiles)) {
  fail('buildLevel(7) is not deterministic — replays would differ');
}
if (JSON.stringify(buildLevel(1).tiles) === JSON.stringify(buildLevel(2).tiles)) {
  fail('levels 1 and 2 are identical — the seed is not varying');
}

console.log(
  `levels 1-${LEVELS_TO_CHECK}: ${totalPits} pits, ${totalCoins} coins, ${totalEnemies} enemies — geometry checked`,
);

// --- Question picker -----------------------------------------------------

// 1. Never repeats a question while it is still in the recent window.
{
  const recent: string[] = [];
  const passages: string[] = [];
  let dupes = 0;
  for (let i = 0; i < 200; i += 1) {
    const q = pickQuestion({ recentIds: recent, recentPassageIds: passages });
    if (recent.includes(q.id)) dupes += 1;
    recent.push(q.id);
    if (recent.length > 30) recent.shift();
    if (q.passageId) {
      passages.push(q.passageId);
      if (passages.length > 12) passages.shift();
    }
  }
  if (dupes > 0) fail(`picker repeated a question inside the recent window ${dupes} times`);
}

// 2. Honors a subject filter.
{
  const only: Subject[] = ['math'];
  for (let i = 0; i < 50; i += 1) {
    const q = pickQuestion({ subjects: only });
    if (q.subject !== 'math') fail(`picker returned ${q.subject} when filtered to math`);
  }
}

// 3. Resurfaces missed questions. With one question owed, it should come back
//    well above chance over many draws.
{
  const target = ALL_QUESTIONS[42];
  let hits = 0;
  const draws = 600;
  for (let i = 0; i < draws; i += 1) {
    const q = pickQuestion({ missed: { [target.id]: 1 } });
    if (q.id === target.id) hits += 1;
  }
  const rate = hits / draws;
  // 35% of draws go to the review pool; with a single reviewable item that
  // item should win roughly a third of the time.
  if (rate < 0.2) fail(`spaced repetition too weak: missed question resurfaced ${(rate * 100).toFixed(1)}% of draws`);
  console.log(`spaced repetition: missed question resurfaced ${(rate * 100).toFixed(1)}% of draws`);
}

// 4. Adaptive difficulty shifts with recent accuracy.
{
  const hot = Array.from({ length: 40 }, () => pickQuestion({ recentAccuracy: 0.95 }).difficulty);
  const cold = Array.from({ length: 40 }, () => pickQuestion({ recentAccuracy: 0.2 }).difficulty);
  const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  if (avg(hot) <= avg(cold)) {
    fail(`adaptive difficulty inverted: hot=${avg(hot).toFixed(2)} cold=${avg(cold).toFixed(2)}`);
  }
  console.log(
    `adaptive difficulty: hot streak avg ${avg(hot).toFixed(2)} vs cold streak avg ${avg(cold).toFixed(2)}`,
  );
}

// --- Progress bookkeeping ------------------------------------------------

{
  let p = emptyProgress();
  const q = ALL_QUESTIONS[0];

  p = recordAnswer(p, { id: q.id, subject: q.subject, correct: false });
  if (p.missed[q.id] !== 1) fail('a missed question was not added to the review pool');
  if (p.streak !== 0) fail('streak should reset on a wrong answer');

  p = recordAnswer(p, { id: q.id, subject: q.subject, correct: true });
  if (p.missed[q.id] !== undefined) fail('a corrected question was not cleared from review');
  if (!p.mastered.includes(q.id)) fail('a corrected question was not marked mastered');
  if (p.streak !== 1) fail('streak should increment on a correct answer');
  if (p.totalSeen !== 2 || p.totalCorrect !== 1) fail('totals are wrong');
  if (p.bySubject[q.subject].seen !== 2) fail('per-subject counts are wrong');

  // Missing it twice should deepen the debt so one correct answer is not enough.
  let q2 = emptyProgress();
  const t = ALL_QUESTIONS[1];
  q2 = recordAnswer(q2, { id: t.id, subject: t.subject, correct: false });
  q2 = recordAnswer(q2, { id: t.id, subject: t.subject, correct: false });
  if (q2.missed[t.id] !== 2) fail('missing twice did not deepen the review debt');
  q2 = recordAnswer(q2, { id: t.id, subject: t.subject, correct: true });
  if (q2.missed[t.id] !== 1) fail('one correct answer should only pay down one unit of debt');

  console.log('progress bookkeeping: review pool, streaks, and totals behave correctly');
}

// --- Report --------------------------------------------------------------

if (errors.length) {
  console.error(`\n${errors.length} FAILURE(S):`);
  for (const e of errors) console.error(`  x ${e}`);
  process.exit(1);
}
console.log('\nAll logic checks passed.');
