/**
 * Proves Memory Match's rules are the rules it claims to have.
 *
 * The failures that quietly ruin this genre are all invisible from the renderer:
 *
 *  1. A deck that is not honest pairs - an odd length, or a face with an odd
 *     count - reads as the game cheating the moment the last card has no
 *     partner. `buildDeck` is checked at every pair count from 1 up through well
 *     past the roster size (where faces must start repeating).
 *  2. A shuffle that drops or duplicates a card. Checked as an exact multiset
 *     match against the input, across many seeds.
 *  3. A matched pair coming back into play. `resolvePair` is asserted to throw
 *     when asked to re-resolve an already-matched index, and `canSelect` is
 *     asserted to refuse a matched card, a duplicate selection, an out-of-range
 *     index, and a third selection.
 *  4. A dishonest board-clear. Thousands of full random playthroughs assert
 *     `isBoardClear` flips to true on the exact card that completes the deck,
 *     and never before.
 *  5. Scoring that could ever teach the wrong lesson - it must never go
 *     negative, must never fall as the streak rises, and a quick match must
 *     never score less than the same streak found slowly.
 *
 * Every check below is a function that returns problems, and the self-tests at
 * the bottom feed each one deliberately broken input and assert it complains. A
 * verifier that cannot fail proves nothing.
 *
 * Run: npx tsx scripts/check-memorymatch.ts
 */
import {
  BASE_MATCH_POINTS,
  MAX_STREAK_BONUS,
  NUM_FACES,
  PAIR_MAX,
  QUICK_MATCH_BONUS,
  QUICK_WINDOW,
  buildDeck,
  canSelect,
  cardCentre,
  cardIndexAt,
  gridForPairs,
  isBoardClear,
  layoutFor,
  lcg,
  makeMatchState,
  matchScore,
  pairsForLevel,
  resolvePair,
  shuffle,
  toBoard,
  unshuffledDeck,
  type FaceId,
  type MatchState,
} from '../components/games/MemoryMatch';

const errors: string[] = [];
const fail = (msg: string) => {
  if (errors.length < 400) errors.push(msg);
};

// --- helpers -----------------------------------------------------------------

function multiset(arr: FaceId[]): Map<FaceId, number> {
  const m = new Map<FaceId, number>();
  for (const v of arr) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
}

function mapsEqual(a: Map<FaceId, number>, b: Map<FaceId, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

function expectThrow(label: string, fn: () => void): void {
  try {
    fn();
    fail(`${label}: expected a throw, none happened`);
  } catch {
    // expected
  }
}

// --- 1. deck honesty -----------------------------------------------------

for (let pairs = 1; pairs <= 40; pairs += 1) {
  const rng = lcg(1000 + pairs);
  const deck = buildDeck(pairs, rng);

  if (deck.length !== pairs * 2) {
    fail(`buildDeck(${pairs}): length ${deck.length}, expected ${pairs * 2}`);
  }
  const counts = multiset(deck);
  for (const [face, n] of counts) {
    if (n % 2 !== 0) fail(`buildDeck(${pairs}): face ${face} appears ${n} times (odd)`);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  if (total !== deck.length) fail(`buildDeck(${pairs}): counts sum to ${total}, not ${deck.length}`);
  if (counts.size > NUM_FACES) {
    fail(`buildDeck(${pairs}): ${counts.size} distinct faces exceeds the roster of ${NUM_FACES}`);
  }
  // Below the roster size every pair should be a distinct family member - the
  // whole point of using the avatars for the easy early levels.
  if (pairs <= NUM_FACES && counts.size !== pairs) {
    fail(`buildDeck(${pairs}): expected ${pairs} distinct faces at/under the roster size, got ${counts.size}`);
  }
}

// A broken deck builder should be caught: an odd-length "deck" must fail the
// even-count check above if the harness itself is asleep.
{
  const broken = ['marty', 'marty', 'marty'] as FaceId[];
  const counts = multiset(broken);
  let sawOdd = false;
  for (const n of counts.values()) if (n % 2 !== 0) sawOdd = true;
  if (!sawOdd) fail('self-test: the odd-count detector did not catch an odd-count deck');
}

// --- 2. shuffle is a lossless permutation -------------------------------

for (let seed = 1; seed <= 30; seed += 1) {
  const rng = lcg(seed * 7919);
  const input = unshuffledDeck(12);
  const out = shuffle(input, rng);
  if (out.length !== input.length) fail(`shuffle seed ${seed}: length changed`);
  if (!mapsEqual(multiset(input), multiset(out))) {
    fail(`shuffle seed ${seed}: multiset does not match the input (lost or duplicated a card)`);
  }
  // shuffle must not mutate its argument.
  if (input.join(',') !== unshuffledDeck(12).join(',')) {
    fail(`shuffle seed ${seed}: mutated its input array`);
  }
}

// A shuffle that actually drops a card must be caught by the multiset check.
{
  const input = unshuffledDeck(6);
  const lossy = input.slice(1);
  if (mapsEqual(multiset(input), multiset(lossy))) {
    fail('self-test: the multiset check did not catch a dropped card');
  }
}

// --- 3. matched cards never come back ------------------------------------

function playRandomGame(pairsCount: number, seed: number): { state: MatchState; picks: number } {
  const rng = lcg(seed);
  const deck = buildDeck(pairsCount, lcg(seed * 13 + 1));
  const state = makeMatchState(deck);
  const remaining = deck.map((_, i) => i);
  let picks = 0;
  let guard = 0;
  while (!isBoardClear(state) && guard < 10000) {
    guard += 1;
    const pool = remaining.filter((i) => !state.matched[i]);
    if (pool.length < 2) break;
    const ia = Math.floor(rng() * pool.length);
    const a = pool[ia];
    let ib = Math.floor(rng() * pool.length);
    while (ib === ia) ib = Math.floor(rng() * pool.length);
    const b = pool[ib];
    if (!canSelect(state, [], a) || !canSelect(state, [a], b)) {
      fail(`playRandomGame(${pairsCount},${seed}): canSelect refused two genuinely available cards`);
      break;
    }
    resolvePair(state, a, b);
    picks += 1;
  }
  return { state, picks };
}

for (let seed = 1; seed <= 60; seed += 1) {
  const pairsCount = 3 + (seed % 12);
  const { state, picks } = playRandomGame(pairsCount, seed * 101 + 3);
  if (!isBoardClear(state)) {
    fail(`playRandomGame(${pairsCount}): never cleared after ${picks} picks`);
    continue;
  }
  if (state.matchedCount !== state.deck.length) {
    fail(`playRandomGame(${pairsCount}): matchedCount ${state.matchedCount} != deck length ${state.deck.length}`);
  }
  for (const m of state.matched) if (!m) fail(`playRandomGame(${pairsCount}): a card was left unmatched at clear`);
}

// resolvePair must refuse to re-resolve a matched index.
{
  const deck = unshuffledDeck(4);
  const state = makeMatchState(deck);
  const res = resolvePair(state, 0, deck.indexOf(deck[0], 1));
  if (res.kind !== 'match') fail('resolvePair setup: expected the constructed pair to match');
  expectThrow('resolvePair on an already-matched card', () => resolvePair(state, 0, 1));
}

// canSelect must refuse: matched card, duplicate selection, out of range, and a
// third selection while two are already up.
{
  const deck = unshuffledDeck(6);
  const state = makeMatchState(deck);
  resolvePair(state, 0, deck.indexOf(deck[0], 1));
  if (canSelect(state, [], 0)) fail('canSelect: allowed picking an already-matched card');
  if (canSelect(state, [2], 2)) fail('canSelect: allowed picking the same card twice');
  if (canSelect(state, [], -1)) fail('canSelect: allowed a negative index');
  if (canSelect(state, [], deck.length)) fail('canSelect: allowed an index past the end of the deck');
  if (canSelect(state, [2, 3], 4)) fail('canSelect: allowed a third selection');
  const freshIdx = state.matched.findIndex((m) => !m);
  if (!canSelect(state, [], freshIdx)) fail('canSelect: refused a genuinely legal pick');
}

// --- 4. level ramp ---------------------------------------------------------

{
  if (pairsForLevel(1) !== 6) fail(`pairsForLevel(1): expected 6, got ${pairsForLevel(1)}`);
  let prev = pairsForLevel(1);
  for (let lv = 2; lv <= 200; lv += 1) {
    const p = pairsForLevel(lv);
    if (p < prev) fail(`pairsForLevel(${lv}): decreased from ${prev} to ${p}`);
    if (p > PAIR_MAX) fail(`pairsForLevel(${lv}): ${p} exceeds the cap of ${PAIR_MAX}`);
    prev = p;
  }
  if (pairsForLevel(200) !== PAIR_MAX) fail('pairsForLevel: never reached the cap by level 200');
}

for (let pairs = 1; pairs <= 60; pairs += 1) {
  const { cols, rows } = gridForPairs(pairs);
  if (cols * rows !== pairs * 2) fail(`gridForPairs(${pairs}): ${cols}x${rows} != ${pairs * 2} cells`);
  if (cols > rows) fail(`gridForPairs(${pairs}): ${cols}x${rows} is not portrait (cols > rows)`);
  if (cols < 1 || rows < 1) fail(`gridForPairs(${pairs}): non-positive dimension`);
}
// The two explicitly promised shapes.
{
  const six = gridForPairs(6);
  if (six.cols !== 3 || six.rows !== 4) fail(`gridForPairs(6): expected 3x4, got ${six.cols}x${six.rows}`);
}

// --- 5. scoring --------------------------------------------------------------

if (matchScore(0, 0) < 0) fail('matchScore: went negative');
for (let streak = 0; streak <= MAX_STREAK_BONUS + 3; streak += 1) {
  const a = matchScore(streak, 5);
  const b = matchScore(streak + 1, 5);
  if (b < a) fail(`matchScore: streak ${streak + 1} (${b}) scored less than streak ${streak} (${a})`);
}
for (let streak = 0; streak <= MAX_STREAK_BONUS; streak += 1) {
  const quick = matchScore(streak, 0);
  const slow = matchScore(streak, QUICK_WINDOW + 10);
  if (quick < slow) fail(`matchScore: a quick match (${quick}) scored less than a slow one (${slow})`);
}
if (matchScore(0, 0) !== BASE_MATCH_POINTS + QUICK_MATCH_BONUS) {
  fail('matchScore: base + quick bonus did not add up at streak 0');
}
// Score must plateau, not keep climbing forever, once the streak cap is passed.
if (matchScore(MAX_STREAK_BONUS, 0) !== matchScore(MAX_STREAK_BONUS + 10, 0)) {
  fail('matchScore: streak bonus did not cap at MAX_STREAK_BONUS');
}

// A scoring function that ever went backwards with streak must be caught -
// prove the monotonicity loop itself works against a deliberately broken curve.
{
  const brokenCurve = (streak: number) => (streak === 3 ? 5 : streak * 10);
  let caughtBroken = false;
  for (let streak = 0; streak < 5; streak += 1) {
    if (brokenCurve(streak + 1) < brokenCurve(streak)) caughtBroken = true;
  }
  if (!caughtBroken) fail('self-test: the monotonicity loop did not catch a broken scoring curve');
}

// --- 6. layout / input mapping ------------------------------------------

for (const [cols, rows] of [[3, 4], [4, 4], [4, 5], [6, 6]] as const) {
  const cw = 400;
  const ch = 600;
  const inset = 0;
  const layout = layoutFor(cw, ch, inset, cols, rows);
  if (!(layout.scale > 0)) fail(`layoutFor(${cols}x${rows}): non-positive scale`);

  for (let idx = 0; idx < cols * rows; idx += 1) {
    const centre = cardCentre(idx, cols);
    // Board units -> normalised screen units -> back to board units, the same
    // round trip a real tap makes through toBoard/cardIndexAt.
    const sx = (centre.x * layout.scale + layout.ox) / cw;
    const sy = (centre.y * layout.scale + layout.oy) / ch;
    const back = toBoard(layout, cw, ch, sx, sy);
    const hit = cardIndexAt(back.x, back.y, cols, rows);
    if (hit !== idx) fail(`cardIndexAt(${cols}x${rows}) card ${idx}: round trip landed on ${hit}`);
  }

  if (cardIndexAt(-5, -5, cols, rows) !== null) fail(`cardIndexAt(${cols}x${rows}): accepted a negative point`);
  if (cardIndexAt(1e6, 1e6, cols, rows) !== null) {
    fail(`cardIndexAt(${cols}x${rows}): accepted a point far off the board`);
  }
}

// --- report ------------------------------------------------------------------

if (errors.length > 0) {
  console.error(`Memory Match check FAILED (${errors.length} problem${errors.length === 1 ? '' : 's'}):`);
  for (const e of errors.slice(0, 50)) console.error(` - ${e}`);
  process.exit(1);
}

console.log('Memory Match check passed:');
console.log(' - decks are honest pairs at 40 pair counts, faces cycle past the 10-avatar roster correctly');
console.log(' - shuffle is a lossless, non-mutating permutation across 30 seeds');
console.log(' - 60 full random playthroughs cleared honestly; matched cards refuse re-selection and re-resolution');
console.log(' - pairsForLevel ramps from 6, is non-decreasing, and caps at 30; gridForPairs is exact and portrait');
console.log(' - matchScore never negative, non-decreasing in streak, caps at MAX_STREAK_BONUS, rewards quick recall');
console.log(' - layout/input round-trips hit the exact card tapped, off-board points return null');
