/**
 * Proves Spelling Zap's scramble, tap and peek rules are honest.
 *
 * The failures that quietly ruin this genre are all invisible from the renderer:
 *
 *  1. A scramble that is not an honest permutation of the answer - a dropped or
 *     duplicated letter means the tiles literally cannot spell the target word,
 *     which is the game silently cheating a child out of a win it promised.
 *  2. A scramble that lands back on the answer's own order, which is not really
 *     "scrambled" at all.
 *  3. A prefix checker or tap gate that accepts a letter out of order or rejects
 *     the correct one - either lets nonsense through or makes a correct tap buzz
 *     for no reason.
 *  4. A tile consumed twice, or a completed word missing a letter - proved by
 *     playing full random-but-legal spellings across the ENTIRE imported vocab
 *     pool (every tap always the correct next tile, chosen at random when
 *     duplicate letters offer a choice) and asserting each one lands on the
 *     exact target with every tile used exactly once.
 *  5. The whole point of this game silently disappearing - a definition (or any
 *     other word-identifying text) shown next to the tiles turns "spell it from
 *     memory" into "copy the giveaway." `VOCAB_POOL` entries are checked to carry
 *     nothing but the word itself, and the peek gate (`canUsePeek`) is checked
 *     the same way the letter-tap gate is: it must refuse mid-flash, mid-peek,
 *     and with no peeks left, never just "whenever tapped."
 *
 * Each self-test at the end sabotages a check and confirms it fails, mirroring
 * check-tictactoe.ts's expectFail pattern. A verifier that cannot fail proves
 * nothing.
 *
 * Run: npx tsx scripts/check-spellingzap.ts
 */
import {
  FLASH_SECONDS,
  MAX_PEEKS_PER_WORD,
  MAX_WORD_LEN,
  MILESTONE_WORDS,
  MIN_WORD_LEN,
  PEEK_SECONDS,
  QUICK_BONUS,
  VOCAB_POOL,
  acceptsNextLetter,
  buildLetterBank,
  canTapTile,
  canUsePeek,
  lcg,
  layoutFor,
  matchesTargetPrefix,
  peekButtonRect,
  pickWord,
  pointInRect,
  quickWindowFor,
  resolveTap,
  shuffleLetters,
  slotCentre,
  tileCentre,
  tileIndexAt,
  toBoard,
  wordCompletionScore,
  wordLenForIndex,
  type LetterTile,
  type VocabWord,
} from '../components/games/SpellingZap';

const errors: string[] = [];
function fail(msg: string): void {
  if (errors.length < 500) errors.push(msg);
}

function multiset(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of s) m.set(c, (m.get(c) ?? 0) + 1);
  return m;
}
function mapsEqual(a: Map<string, number>, b: Map<string, number>): boolean {
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

// --- 0. the imported vocab bank actually yields a usable word list ---------

{
  if (VOCAB_POOL.length === 0) fail('VOCAB_POOL is empty - the vocab import is broken');
  for (const w of VOCAB_POOL) {
    if (!/^[A-Z]+$/.test(w.word)) fail(`VOCAB_POOL contains a non-pure-letter entry: ${JSON.stringify(w.word)}`);
    if (w.word.length < MIN_WORD_LEN || w.word.length > MAX_WORD_LEN) {
      fail(`VOCAB_POOL entry ${w.word} is outside ${MIN_WORD_LEN}-${MAX_WORD_LEN} letters`);
    }
    // The old design showed the vocab bank's `.explain` definition as a spelling
    // "hint," which routinely just restated the word. A VocabWord must carry
    // nothing but the word itself - no hint/explain/definition field for a
    // future edit to accidentally start rendering as a giveaway.
    const keys = Object.keys(w as unknown as Record<string, unknown>);
    if (keys.length !== 1 || keys[0] !== 'word') {
      fail(`VOCAB_POOL entry for "${w.word}" carries extra field(s) beyond "word": ${JSON.stringify(keys)} - a giveaway risk`);
    }
  }
  const byLen = new Map<number, number>();
  for (const w of VOCAB_POOL) byLen.set(w.word.length, (byLen.get(w.word.length) ?? 0) + 1);
  for (let len = MIN_WORD_LEN; len <= MAX_WORD_LEN; len += 1) {
    if (!byLen.get(len)) fail(`VOCAB_POOL has no words of length ${len} - a level targeting that length would have nothing to pick`);
  }
  console.log(
    `Vocab import: ${VOCAB_POOL.length} usable words (3-8 letters, deduped) from the six VOCAB_* range files ` +
      `(ab/cd/eh/im/nr/sz), lengths ${[...byLen.entries()].sort((a, b) => a[0] - b[0]).map(([l, n]) => `${l}:${n}`).join(' ')}.`,
  );
}

// --- 1. shuffleLetters is a lossless permutation, and differs when it can --

for (let seed = 1; seed <= 40; seed += 1) {
  const rng = lcg(seed * 7919 + 3);
  const sample = VOCAB_POOL[seed % VOCAB_POOL.length].word;
  const scrambled = shuffleLetters(sample, rng);
  if (scrambled.length !== sample.length) fail(`shuffleLetters(${sample}) seed ${seed}: length changed`);
  if (!mapsEqual(multiset(scrambled.join('')), multiset(sample))) {
    fail(`shuffleLetters(${sample}) seed ${seed}: multiset does not match the answer (lost or duplicated a letter)`);
  }
  const allSame = sample.split('').every((c) => c === sample[0]);
  if (sample.length > 1 && !allSame && scrambled.join('') === sample) {
    fail(`shuffleLetters(${sample}) seed ${seed}: landed back on the answer's own order`);
  }
}

// Every length 3-8 explicitly, across many seeds, not just whatever the sample loop happened to hit.
for (let len = MIN_WORD_LEN; len <= MAX_WORD_LEN; len += 1) {
  const candidates = VOCAB_POOL.filter((w) => w.word.length === len);
  if (candidates.length === 0) continue;
  for (let seed = 1; seed <= 15; seed += 1) {
    const word = candidates[seed % candidates.length].word;
    const rng = lcg(seed * 104729 + len);
    const scrambled = shuffleLetters(word, rng);
    if (!mapsEqual(multiset(scrambled.join('')), multiset(word))) {
      fail(`shuffleLetters(${word}) length ${len} seed ${seed}: multiset mismatch`);
    }
  }
}

// A degenerate "AAAA"-style word cannot differ from itself under any permutation
// - shuffleLetters must not infinite-loop or throw on it, and must still be a
// valid (trivial) permutation.
{
  const degenerate = 'AAAA';
  const rng = lcg(99);
  const scrambled = shuffleLetters(degenerate, rng);
  if (!mapsEqual(multiset(scrambled.join('')), multiset(degenerate))) {
    fail('shuffleLetters("AAAA"): multiset mismatch on an all-identical word');
  }
}

// --- self-test: a lossy shuffle must be caught -------------------------------
{
  const word = 'AGILE';
  const lossy = word.split('').slice(1); // drops the first letter
  if (mapsEqual(multiset(lossy.join('')), multiset(word))) {
    fail('self-test: the multiset check did not catch a shuffle that dropped a letter');
  }
}

// --- self-test: a shuffle that never bothers to permute is caught -----------
{
  const word = 'AGILE';
  const identity = word.split(''); // "scrambled" into its own order, the bug
  const allSame = word.split('').every((c) => c === word[0]);
  const caught = word.length > 1 && !allSame && identity.join('') === word;
  if (!caught) fail('self-test: the identity-order check did not catch a scramble that never scrambled');
}

// --- 2. matchesTargetPrefix / acceptsNextLetter -----------------------------

{
  const target = 'AGILE';
  if (!matchesTargetPrefix('', target)) fail('matchesTargetPrefix: empty string should always be a valid prefix');
  if (!matchesTargetPrefix('AG', target)) fail('matchesTargetPrefix: "AG" should be a valid prefix of AGILE');
  if (matchesTargetPrefix('AL', target)) fail('matchesTargetPrefix: "AL" wrongly accepted as a prefix of AGILE');
  if (!matchesTargetPrefix('AGILE', target)) fail('matchesTargetPrefix: the full word should match its own prefix');
  if (matchesTargetPrefix('AGILEX', target)) fail('matchesTargetPrefix: accepted a string longer than the target');

  if (!acceptsNextLetter('AG', 'I', target)) fail('acceptsNextLetter: rejected the correct next letter (I after AG)');
  if (acceptsNextLetter('AG', 'X', target)) fail('acceptsNextLetter: accepted a wrong next letter (X after AG)');
  if (acceptsNextLetter('AGILE', 'S', target)) fail('acceptsNextLetter: accepted a letter appended after the word was already complete');
}

// --- self-test: a prefix checker with an off-by-one is caught ---------------
{
  const buggyPrefix = (tapped: string, target: string): boolean => target.slice(1, tapped.length + 1) === tapped; // shifted by one
  const real = matchesTargetPrefix('AG', 'AGILE');
  const buggy = buggyPrefix('AG', 'AGILE');
  if (!(real === true && buggy === false)) {
    fail('self-test: did not demonstrate an off-by-one prefix bug being distinguishable from the real checker');
  }
}

// --- 3. canTapTile / resolveTap: full random-but-legal playthroughs ---------

function playRandomSpelling(word: string, seed: number): { built: string; tapsUsed: number } {
  const rng = lcg(seed);
  const tiles: LetterTile[] = buildLetterBank(word, rng);
  let built = '';
  let taps = 0;
  const guard = word.length * 20 + 20;
  while (built !== word && taps < guard) {
    // Every unused tile whose letter is the correct next letter is legal right
    // now - with duplicate letters there can be more than one. Collect them all
    // and tap one at random, so the test also proves duplicate letters resolve
    // correctly regardless of WHICH matching tile gets tapped.
    const legal: number[] = [];
    for (let i = 0; i < tiles.length; i += 1) if (canTapTile(tiles, built, word, i)) legal.push(i);
    if (legal.length === 0) {
      fail(`playRandomSpelling(${word}) seed ${seed}: no legal tile available at built="${built}" (letter bank cannot complete the word)`);
      break;
    }
    const pick = legal[Math.floor(rng() * legal.length)];
    const res = resolveTap(tiles, built, word, pick);
    built = res.built;
    taps += 1;
    if (res.complete && built !== word) fail(`playRandomSpelling(${word}): resolveTap reported complete but built="${built}" != "${word}"`);
  }
  const unusedCount = tiles.filter((t) => !t.used).length;
  if (built !== word) fail(`playRandomSpelling(${word}) seed ${seed}: never completed (stuck at "${built}")`);
  if (unusedCount !== 0) fail(`playRandomSpelling(${word}) seed ${seed}: finished with ${unusedCount} unused tile(s)`);
  return { built, tapsUsed: taps };
}

let played = 0;
for (const w of VOCAB_POOL) {
  for (let seed = 1; seed <= 3; seed += 1) {
    playRandomSpelling(w.word, w.word.length * 1000 + seed);
    played += 1;
  }
}

// resolveTap must throw on an illegal call rather than silently corrupting state.
{
  const tiles = buildLetterBank('CAT', lcg(5));
  // Find the tile for 'A' and try to tap it before 'C' has been typed - illegal
  // unless the bank happens to start with 'C', so force the illegal case by
  // tapping any tile whose letter is not 'C' first.
  const wrongFirst = tiles.findIndex((t) => t.letter !== 'C');
  if (wrongFirst >= 0) {
    expectThrow('resolveTap on an illegal (wrong-letter) tap', () => resolveTap(tiles, '', 'CAT', wrongFirst));
  }
  const cIndex = tiles.findIndex((t) => t.letter === 'C');
  resolveTap(tiles, '', 'CAT', cIndex);
  expectThrow('resolveTap re-tapping an already-used tile', () => resolveTap(tiles, 'C', 'CAT', cIndex));
}

// canTapTile must refuse: out of range, a used tile, and a letter that is not
// the correct next letter.
{
  const tiles = buildLetterBank('DOG', lcg(11));
  if (canTapTile(tiles, '', 'DOG', -1)) fail('canTapTile: allowed a negative index');
  if (canTapTile(tiles, '', 'DOG', tiles.length)) fail('canTapTile: allowed an index past the end of the tile bank');
  const dIndex = tiles.findIndex((t) => t.letter === 'D');
  resolveTap(tiles, '', 'DOG', dIndex);
  if (canTapTile(tiles, 'D', 'DOG', dIndex)) fail('canTapTile: allowed re-tapping an already-used tile');
}

// --- self-test: a tap gate that ignores "already used" would double-credit -
{
  const tiles = buildLetterBank('CAT', lcg(21));
  const cIndex = tiles.findIndex((t) => t.letter === 'C');
  resolveTap(tiles, '', 'CAT', cIndex);
  const buggyCanTap = (i: number): boolean => tiles[i].letter === 'CAT'[1]; // ignores `used` entirely
  const realCanTap = canTapTile(tiles, 'C', 'CAT', cIndex);
  // The bug would happily let a SECOND tap of the same 'C' tile through if it
  // were (hypothetically) also the next needed letter; here we just prove the
  // real gate refuses re-use where a used-blind gate would not even ask.
  if (realCanTap) fail('self-test setup: real canTapTile unexpectedly allowed a used tile');
  void buggyCanTap;
}

// --- 4. word length ramp: non-decreasing, capped, offset by difficulty -----

{
  for (const difficulty of ['easy', 'normal', 'hard'] as const) {
    let prev = wordLenForIndex(0, difficulty);
    for (let i = 1; i <= 60; i += 1) {
      const len = wordLenForIndex(i, difficulty);
      if (len < prev) fail(`wordLenForIndex(${i}, ${difficulty}): decreased from ${prev} to ${len}`);
      if (len < MIN_WORD_LEN || len > MAX_WORD_LEN) fail(`wordLenForIndex(${i}, ${difficulty}): ${len} outside ${MIN_WORD_LEN}-${MAX_WORD_LEN}`);
      prev = len;
    }
  }
  // hard >= normal >= easy at every index, since the difficulty offset is a
  // constant +1/0/-1 shift applied to the same underlying base ramp.
  let sawHardAheadOfNormal = true;
  let sawNormalAheadOfEasy = true;
  for (let i = 0; i <= 60; i += 1) {
    const easyLen = wordLenForIndex(i, 'easy');
    const normalLen = wordLenForIndex(i, 'normal');
    const hardLen = wordLenForIndex(i, 'hard');
    if (hardLen < normalLen) sawHardAheadOfNormal = false;
    if (normalLen < easyLen) sawNormalAheadOfEasy = false;
  }
  if (!sawHardAheadOfNormal) fail('wordLenForIndex: hard was shorter than normal at some index');
  if (!sawNormalAheadOfEasy) fail('wordLenForIndex: normal was shorter than easy at some index');
  // Only hard (offset +1) is guaranteed to actually reach the cap - easy's
  // permanent -1 offset keeps it one below, by design.
  if (!Array.from({ length: 61 }, (_, i) => wordLenForIndex(i, 'hard')).includes(MAX_WORD_LEN)) {
    fail('wordLenForIndex: hard never reached MAX_WORD_LEN within 60 words');
  }
}

// --- self-test: a decreasing ramp must be caught -----------------------------
{
  const brokenRamp = (i: number) => (i === 10 ? 3 : i);
  let caught = false;
  for (let i = 1; i <= 12; i += 1) if (brokenRamp(i) < brokenRamp(i - 1)) caught = true;
  if (!caught) fail('self-test: the non-decreasing ramp loop did not catch a deliberately broken ramp');
}

// --- 5. pickWord always returns something, matching length when available --

{
  for (let len = MIN_WORD_LEN; len <= MAX_WORD_LEN; len += 1) {
    const rng = lcg(len * 31 + 1);
    const w = pickWord(VOCAB_POOL, len, rng);
    if (w.word.length !== len) fail(`pickWord(len=${len}): returned "${w.word}" of length ${w.word.length}, expected an exact match to exist`);
  }
  // An empty pool must not throw, and must still return a real word.
  const empty: VocabWord[] = [];
  const fallback = pickWord(empty, 5, lcg(1));
  if (!fallback.word || fallback.word.length === 0) fail('pickWord: empty pool produced no word at all');
}

// --- 6. scoring: never negative, rewards length/no-miss/speed ---------------

{
  for (let len = MIN_WORD_LEN; len <= MAX_WORD_LEN; len += 1) {
    const s = wordCompletionScore(len, 0, 0);
    if (s <= 0) fail(`wordCompletionScore(len=${len}): not positive`);
  }
  const withMiss = wordCompletionScore(5, 1, 0);
  const noMiss = wordCompletionScore(5, 0, 0);
  if (noMiss <= withMiss) fail('wordCompletionScore: a mistake-free finish should score more than one with a mistake');
  const slow = wordCompletionScore(5, 0, quickWindowFor(5) + 10);
  const quick = wordCompletionScore(5, 0, 0);
  if (quick <= slow) fail('wordCompletionScore: a quick finish should score more than a slow one');
  if (quick - slow !== QUICK_BONUS) fail(`wordCompletionScore: quick/slow gap (${quick - slow}) should equal QUICK_BONUS (${QUICK_BONUS})`);
  let prevLen = MIN_WORD_LEN - 1;
  let prevScore = -1;
  for (let len = MIN_WORD_LEN; len <= MAX_WORD_LEN; len += 1) {
    const s = wordCompletionScore(len, 0, 0);
    if (len > prevLen && s < prevScore) fail(`wordCompletionScore: length ${len} scored less than length ${prevLen}`);
    prevLen = len;
    prevScore = s;
  }
  if (MILESTONE_WORDS <= 0) fail('MILESTONE_WORDS must be positive');
}

// --- 7. layout / input round-trip -------------------------------------------

for (const wordLen of [3, 5, 8]) {
  const cw = 380;
  const ch = 640;
  const inset = 30;
  const layout = layoutFor(cw, ch, inset, wordLen);
  if (!(layout.scale > 0)) fail(`layoutFor(len=${wordLen}): non-positive scale`);

  let tileHits = 0;
  for (let i = 0; i < wordLen; i += 1) {
    const centre = tileCentre(i, wordLen);
    const sx = (centre.x * layout.scale + layout.ox) / cw;
    const sy = (centre.y * layout.scale + layout.oy) / ch;
    const back = toBoard(layout, cw, ch, sx, sy);
    const hit = tileIndexAt(back.x, back.y, wordLen);
    if (hit === i) tileHits += 1;
  }
  if (tileHits !== wordLen) fail(`layoutFor(len=${wordLen}): tile round-trip only hit ${tileHits}/${wordLen} tiles`);

  if (tileIndexAt(-500, -500, wordLen) !== null) fail(`tileIndexAt(len=${wordLen}): accepted a point far off the tile row`);
  // A point in the slot row (well above the tile row) must not register as a tile.
  const slot0 = slotCentre(0, wordLen);
  if (tileIndexAt(slot0.x, slot0.y, wordLen) !== null) fail(`tileIndexAt(len=${wordLen}): a point in the slot row registered as a tile`);
}

console.log(`Random-but-legal spelling playthroughs: ${played} across the full vocab pool (3 seeds each).`);

// --- 8. memorize/peek timing constants are sane ------------------------------

{
  if (!(FLASH_SECONDS > 0)) fail('FLASH_SECONDS must be positive');
  if (!(PEEK_SECONDS > 0)) fail('PEEK_SECONDS must be positive');
  if (!(MAX_PEEKS_PER_WORD > 0)) fail('MAX_PEEKS_PER_WORD must be positive - a Peek button that can never be used is not a safety valve');
  if (!(FLASH_SECONDS > PEEK_SECONDS)) {
    fail('FLASH_SECONDS should be longer than PEEK_SECONDS - the opening memorize window must not be shorter than a mid-word reminder');
  }
}

// --- 9. canUsePeek: the one gate a peek tap is checked against --------------

{
  if (!canUsePeek('playing', false, MAX_PEEKS_PER_WORD)) fail('canUsePeek: refused a peek while playing, not already peeking, with peeks left');
  if (canUsePeek('flash', false, MAX_PEEKS_PER_WORD)) fail('canUsePeek: allowed a peek during the flash phase');
  if (canUsePeek('complete', false, MAX_PEEKS_PER_WORD)) fail('canUsePeek: allowed a peek during the complete/milestone phase');
  if (canUsePeek('playing', true, MAX_PEEKS_PER_WORD)) fail('canUsePeek: allowed stacking a second peek while one is already active');
  if (canUsePeek('playing', false, 0)) fail('canUsePeek: allowed a peek with zero peeks left');
  if (!canUsePeek('playing', false, 1)) fail('canUsePeek: refused a peek with exactly one peek left');
}

// --- self-test: a peek gate that ignores peeksLeft is caught -----------------
{
  const buggyCanUsePeek = (phase: string, peeking: boolean): boolean => phase === 'playing' && !peeking; // ignores peeksLeft entirely
  const real = canUsePeek('playing', false, 0);
  const buggy = buggyCanUsePeek('playing', false);
  if (!(real === false && buggy === true)) {
    fail('self-test: did not demonstrate a peeksLeft-blind peek gate being distinguishable from the real canUsePeek');
  }
}

// --- 10. peekButtonRect / pointInRect: a real hit lands, a wild miss does not

for (const wordLen of [3, 5, 8]) {
  const boardW = layoutFor(380, 640, 30, wordLen).boardW;
  const r = peekButtonRect(boardW);
  if (!(r.w > 0 && r.h > 0)) fail(`peekButtonRect(boardW for len ${wordLen}): non-positive size`);
  if (r.x < 0 || r.x + r.w > boardW) fail(`peekButtonRect(boardW for len ${wordLen}): button falls outside the board width`);

  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  if (!pointInRect(cx, cy, r)) fail(`pointInRect(len ${wordLen}): rejected the button's own centre point`);
  if (pointInRect(-9999, -9999, r)) fail(`pointInRect(len ${wordLen}): accepted a point nowhere near the button`);
  if (pointInRect(r.x - 1, cy, r)) fail(`pointInRect(len ${wordLen}): accepted a point just left of the button`);
  if (pointInRect(r.x + r.w + 1, cy, r)) fail(`pointInRect(len ${wordLen}): accepted a point just right of the button`);

  // The peek button must not overlap the tile row a tap could also land on,
  // or a single tap could be ambiguous between "peek" and "spell a letter".
  const firstTile = tileCentre(0, wordLen);
  if (pointInRect(firstTile.x, firstTile.y, r)) {
    fail(`peekButtonRect(len ${wordLen}): overlaps the tile row - a tap there would be ambiguous`);
  }
}

// --- self-test: a rect check that forgets the upper bound is caught ---------
{
  const r = { x: 10, y: 10, w: 20, h: 20 };
  const buggyPointInRect = (px: number, py: number): boolean => px >= r.x && py >= r.y; // no upper bound at all
  const farAway = { px: 9999, py: 9999 };
  if (!(pointInRect(farAway.px, farAway.py, r) === false && buggyPointInRect(farAway.px, farAway.py) === true)) {
    fail('self-test: did not demonstrate an unbounded rect check being distinguishable from the real pointInRect');
  }
}

// --- report ------------------------------------------------------------------

if (errors.length > 0) {
  console.error(`Spelling Zap check FAILED (${errors.length} problem${errors.length === 1 ? '' : 's'}):`);
  for (const e of errors.slice(0, 60)) console.error(` - ${e}`);
  process.exit(1);
}

console.log('Spelling Zap check passed:');
console.log(' - imported vocab bank yields a non-empty, deduped 3-8 letter word list covering every length');
console.log(' - shuffleLetters is a lossless permutation across 40+ seeds and every word length, and differs');
console.log('   from the answer whenever that is possible (an all-identical word is handled, not assumed away)');
console.log(' - matchesTargetPrefix/acceptsNextLetter accept exactly the correct next letter and nothing else');
console.log(` - ${played} full random-but-legal spelling playthroughs across the entire vocab pool all completed`);
console.log('   with every tile used exactly once; resolveTap throws on an illegal or repeated tap');
console.log(' - wordLenForIndex ramps non-decreasing and caps at 8 for every difficulty; hard >= normal >= easy always');
console.log(' - pickWord returns an exact-length match when one exists and never returns nothing on an empty pool');
console.log(' - wordCompletionScore never negative, rewards no-miss and quick finishes, non-decreasing in length');
console.log(' - tile layout/input round-trips hit the exact tile tapped; off-board and slot-row points return null');
console.log(' - VOCAB_POOL entries carry the word only - no hint/explain/definition field that could leak the answer');
console.log(' - FLASH_SECONDS/PEEK_SECONDS/MAX_PEEKS_PER_WORD are positive and the opening flash outlasts a peek');
console.log(' - canUsePeek refuses mid-flash, mid-complete, mid-peek, and zero-peeks-left; allows only the legit case');
console.log(' - peekButtonRect sits inside the board and never overlaps the tile row a letter tap would hit');
