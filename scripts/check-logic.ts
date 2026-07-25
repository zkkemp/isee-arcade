/**
 * Headless checks for everything that is logic rather than text: procedurally
 * generated level geometry, the templated math generators, the adaptive picker,
 * and progress bookkeeping.
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
import { ALL_TEMPLATES, STATIC_QUESTIONS, pickQuestion } from '../lib/questions/index';
import { instantiate, mulberry32 } from '../lib/questions/templates';
import { emptyProgress, recordAnswer } from '../lib/progress';
import type { Subject } from '../lib/questions/types';

const errors: string[] = [];
const fail = (msg: string) => errors.push(msg);

// --- Level geometry -------------------------------------------------------

const LEVELS_TO_CHECK = 30;
/** Horizontal distance clearable in one jump, in tiles. */
const JUMP_REACH_TILES = (2 * (292 / 880) * 118) / TILE;

let totalPits = 0;
let totalCoins = 0;
let totalEnemies = 0;

for (let level = 1; level <= LEVELS_TO_CHECK; level += 1) {
  const L = buildLevel(level);
  const at = `level ${level}`;

  if (L.tiles.length !== ROWS) fail(`${at}: expected ${ROWS} rows, got ${L.tiles.length}`);
  for (const row of L.tiles) {
    if (row.length !== COLS) fail(`${at}: a row has ${row.length} cols, expected ${COLS}`);
  }

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
      fail(`${at}: only ${gap} tiles of ground between pits at x=${pits[i - 1][0]}`);
    }
  }

  const flagCol = Math.floor(L.flagX / TILE);
  for (let i = -2; i <= 2; i += 1) {
    if (!solidAt(L.tiles, flagCol + i, GROUND_TOP)) {
      fail(`${at}: flag landing pad has a hole at x=${flagCol + i}`);
    }
  }

  totalCoins += L.coins.length;
  if (L.coins.length === 0) fail(`${at}: no coins`);
  for (const c of L.coins) {
    const cx = Math.floor(c.x / TILE);
    const cy = Math.floor(c.y / TILE);
    if (solidAt(L.tiles, cx, cy)) fail(`${at}: coin at (${cx},${cy}) is inside a solid tile`);
    let support = -1;
    for (let y = cy + 1; y < ROWS; y += 1) {
      if (solidAt(L.tiles, cx, y)) {
        support = y;
        break;
      }
    }
    if (support !== -1 && support - cy > 4) {
      fail(`${at}: coin at (${cx},${cy}) floats ${support - cy} tiles above support`);
    }
  }

  totalEnemies += L.enemies.length;
  for (const e of L.enemies) {
    const ex = Math.floor(e.x / TILE);
    const ey = Math.floor(e.y / TILE);
    if (solidAt(L.tiles, ex, ey)) fail(`${at}: enemy at (${ex},${ey}) is inside a solid tile`);
    if (!solidAt(L.tiles, ex, GROUND_TOP)) fail(`${at}: enemy at x=${ex} stands over a pit`);
    if (e.vx === 0) fail(`${at}: enemy at x=${ex} has zero velocity`);
  }
}

if (JSON.stringify(buildLevel(7).tiles) !== JSON.stringify(buildLevel(7).tiles)) {
  fail('buildLevel is not deterministic');
}
if (JSON.stringify(buildLevel(1).tiles) === JSON.stringify(buildLevel(2).tiles)) {
  fail('levels 1 and 2 are identical — the seed is not varying');
}

console.log(
  `levels 1-${LEVELS_TO_CHECK}: ${totalPits} pits, ${totalCoins} coins, ${totalEnemies} enemies — geometry OK`,
);

// --- Templated questions -------------------------------------------------

/**
 * Parses a rendered choice into a number when it looks numeric, so two choices
 * that differ as text but are equal as values (1/7 vs 2/14) can be caught. One
 * of the template authors shipped exactly that bug before its own checks found
 * it; enforcing it here keeps it from coming back.
 */
function asNumber(s: string): number | null {
  const t = s.trim().replace(/^\$/, '').replace(/,/g, '');
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  const frac = t.match(/^(-?\d+)\/(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  return null;
}

const SEEDS = 300;
let instancesChecked = 0;

for (const t of ALL_TEMPLATES) {
  for (let seed = 1; seed <= SEEDS; seed += 1) {
    let q;
    try {
      q = instantiate(t, mulberry32(seed));
    } catch (e) {
      fail(`${t.id} (${t.topic}) threw on seed ${seed}: ${(e as Error).message}`);
      break;
    }
    instancesChecked += 1;
    const at = `${t.id} seed ${seed}`;

    if (q.choices.length !== 4) fail(`${at}: ${q.choices.length} choices`);
    if (q.choices.some((c) => typeof c !== 'string' || c.trim() === '')) {
      fail(`${at}: an empty choice`);
    }
    if (new Set(q.choices.map((c) => c.trim())).size !== 4) {
      fail(`${at}: duplicate choice text — ${JSON.stringify(q.choices)}`);
    }

    // Numerically equal choices mean two right answers.
    const nums = q.choices.map(asNumber).filter((n): n is number => n !== null);
    if (new Set(nums).size !== nums.length) {
      fail(`${at}: two choices are numerically equal — ${JSON.stringify(q.choices)}`);
    }

    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) {
      fail(`${at}: bad answer index ${q.answer}`);
    }
    if (!q.explain || q.explain.trim().length < 8) fail(`${at}: explain missing`);
    if (q.id !== t.id) fail(`${at}: instance id ${q.id} does not match template ${t.id}`);
    if (!q.topic) fail(`${at}: instance lost its topic, so retries cannot match it`);

    const rendered = [q.prompt, ...q.choices, q.explain].join(' | ');
    if (/undefined|NaN|Infinity/.test(rendered)) {
      fail(`${at}: rendered "${rendered.slice(0, 120)}"`);
    }
    if (/[^\x20-\x7E]/.test(rendered)) fail(`${at}: non-ASCII in rendered text`);
  }

  // Regenerating must actually change the numbers, or memorization still works.
  const a = instantiate(t, mulberry32(1));
  const b = instantiate(t, mulberry32(999));
  if (a.prompt === b.prompt && a.choices.join() === b.choices.join()) {
    fail(`${t.id} (${t.topic}) produces identical output across seeds — not really templated`);
  }
}

console.log(
  `templates: ${ALL_TEMPLATES.length} families x ${SEEDS} seeds = ${instancesChecked} instances OK`,
);

// --- Question picker -----------------------------------------------------

{
  const recent: string[] = [];
  const passages: string[] = [];
  let dupes = 0;
  for (let i = 0; i < 250; i += 1) {
    const q = pickQuestion({ recentIds: recent, recentPassageIds: passages });
    if (recent.includes(q.id)) dupes += 1;
    recent.push(q.id);
    if (recent.length > 40) recent.shift();
    if (q.passageId) {
      passages.push(q.passageId);
      if (passages.length > 14) passages.shift();
    }
  }
  if (dupes > 0) fail(`picker repeated a question inside the recent window ${dupes} times`);
}

{
  for (let i = 0; i < 60; i += 1) {
    const q = pickQuestion({ subjects: ['math' as Subject] });
    if (q.subject !== 'math') fail(`picker returned ${q.subject} when filtered to math`);
  }
}

// The retry path is the core of the new loop: a wrong answer must lead to
// another question of the SAME kind, and for a template the same family with
// different numbers.
{
  const reading = STATIC_QUESTIONS.find((q) => q.kind === 'reading')!;
  for (let i = 0; i < 40; i += 1) {
    const retry = pickQuestion({ sameKindAs: reading });
    if (retry.kind !== 'reading') fail(`retry after a reading question gave ${retry.kind}`);
  }

  const templated = instantiate(ALL_TEMPLATES[0]);
  let changed = 0;
  for (let i = 0; i < 40; i += 1) {
    const retry = pickQuestion({ sameKindAs: templated });
    if (retry.id !== templated.id) fail(`templated retry left family ${templated.id}`);
    if (retry.prompt !== templated.prompt) changed += 1;
  }
  if (changed === 0) {
    fail('templated retry always produced identical numbers — she could just re-answer');
  }
  console.log(`retry path: templated retries changed the numbers ${changed}/40 times`);
}

{
  const hot = Array.from({ length: 40 }, () => pickQuestion({ recentAccuracy: 0.95 }).difficulty);
  const cold = Array.from({ length: 40 }, () => pickQuestion({ recentAccuracy: 0.2 }).difficulty);
  const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  if (avg(hot) <= avg(cold)) {
    fail(`adaptive difficulty inverted: hot=${avg(hot).toFixed(2)} cold=${avg(cold).toFixed(2)}`);
  }
  console.log(
    `adaptive difficulty: hot ${avg(hot).toFixed(2)} vs cold ${avg(cold).toFixed(2)}`,
  );
}

// --- Progress bookkeeping ------------------------------------------------

{
  let p = emptyProgress();
  const q = STATIC_QUESTIONS[0];

  p = recordAnswer(p, { id: q.id, subject: q.subject, correct: false });
  if (p.missed[q.id] !== 1) fail('a missed question was not added to the review pool');
  if (p.streak !== 0) fail('streak should reset on a wrong answer');

  p = recordAnswer(p, { id: q.id, subject: q.subject, correct: true });
  if (p.missed[q.id] !== undefined) fail('a corrected question was not cleared from review');
  if (!p.mastered.includes(q.id)) fail('a corrected question was not marked mastered');
  if (p.totalSeen !== 2 || p.totalCorrect !== 1) fail('totals are wrong');

  let q2 = emptyProgress();
  const t = STATIC_QUESTIONS[1];
  q2 = recordAnswer(q2, { id: t.id, subject: t.subject, correct: false });
  q2 = recordAnswer(q2, { id: t.id, subject: t.subject, correct: false });
  if (q2.missed[t.id] !== 2) fail('missing twice did not deepen the review debt');
  q2 = recordAnswer(q2, { id: t.id, subject: t.subject, correct: true });
  if (q2.missed[t.id] !== 1) fail('one correct answer should pay down only one unit of debt');

  console.log('progress bookkeeping: review pool, streaks, and totals OK');
}

// --- Report --------------------------------------------------------------

if (errors.length) {
  console.error(`\n${errors.length} FAILURE(S):`);
  for (const e of errors.slice(0, 30)) console.error(`  x ${e}`);
  if (errors.length > 30) console.error(`  … and ${errors.length - 30} more`);
  process.exit(1);
}
console.log('\nAll logic checks passed.');
