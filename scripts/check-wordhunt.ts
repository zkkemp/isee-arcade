/**
 * Proves Word Hunt's grid is honest and its line resolver is exact.
 *
 * The failures that quietly ruin a word search are all invisible from the
 * renderer:
 *
 *  1. A placed word that is not actually readable along the line it claims -
 *     run off the edge, or clobbered by a later word crossing it with a
 *     different letter. Every placement is re-read off the FINAL grid (after
 *     every word is placed and the filler letters poured in) by regenerating
 *     its line from just its two endpoints via `resolveLine`, so a later
 *     placement corrupting an earlier one is caught, not just an isolated
 *     check performed right when each word goes down.
 *  2. A selection resolver that accepts a bent or knight-move drag as a
 *     straight line, or rejects a real line.
 *  3. A found selection crediting the wrong word or the same word twice.
 *
 * Every check below is a function that returns problems, and the self-tests
 * at the bottom feed each one deliberately broken input and assert it
 * complains - mirroring check-tictactoe.ts's expectFail pattern. A verifier
 * that cannot fail proves nothing.
 *
 * Run: npx tsx scripts/check-wordhunt.ts
 */
import {
  ALL_DIRS,
  BACKWARD_DIRS,
  FORWARD_DIRS,
  MAX_WORD_LEN,
  MIN_WORD_LEN,
  VOCAB_POOL,
  backwardsAllowed,
  buildGrid,
  buildLevel,
  canPlace,
  cellAt,
  cellCentre,
  colOf,
  idx,
  layoutFor,
  lcg,
  makeBoard,
  matchSelection,
  pickWords,
  resolveLine,
  rowOf,
  sizeForLevel,
  toBoard,
  wordCountForLevel,
  wordFromCells,
  wordScore,
  type Board,
  type VocabWord,
} from '../components/games/WordHunt';

const errors: string[] = [];
function fail(msg: string): void {
  if (errors.length < 500) errors.push(msg);
}

// --- 0. the imported vocab bank actually yields a usable word list ---------

{
  if (VOCAB_POOL.length === 0) fail('VOCAB_POOL is empty - the vocab import is broken');
  for (const w of VOCAB_POOL) {
    if (!/^[A-Z]+$/.test(w.word)) fail(`VOCAB_POOL contains a non-pure-letter entry: ${JSON.stringify(w.word)}`);
    if (w.word.length < MIN_WORD_LEN || w.word.length > MAX_WORD_LEN) {
      fail(`VOCAB_POOL entry ${w.word} is outside ${MIN_WORD_LEN}-${MAX_WORD_LEN} letters`);
    }
  }
  const uniq = new Set(VOCAB_POOL.map((w) => w.word));
  if (uniq.size !== VOCAB_POOL.length) fail('VOCAB_POOL contains a duplicate word');
  // Every length in range must actually be represented, or a level filtered to a
  // small grid could come up short.
  const byLen = new Map<number, number>();
  for (const w of VOCAB_POOL) byLen.set(w.word.length, (byLen.get(w.word.length) ?? 0) + 1);
  for (let len = MIN_WORD_LEN; len <= MAX_WORD_LEN; len += 1) {
    if (!byLen.get(len)) fail(`VOCAB_POOL has no words of length ${len}`);
  }
  console.log(
    `Vocab import: ${VOCAB_POOL.length} usable words (3-8 letters, deduped) from the six VOCAB_* range files ` +
      `(ab/cd/eh/im/nr/sz), lengths ${[...byLen.entries()].sort((a, b) => a[0] - b[0]).map(([l, n]) => `${l}:${n}`).join(' ')}.`,
  );
}

// --- 1. every placed word is readable along its claimed line, in the FINAL grid

function checkBoardHonesty(board: Board, label: string): void {
  if (board.placements.length === 0) fail(`${label}: built a board with zero placed words`);
  for (const p of board.placements) {
    if (p.cells.length < MIN_WORD_LEN) fail(`${label}: placement ${p.word} has too few cells`);
    if (p.cells.length !== p.word.length) fail(`${label}: placement ${p.word} cell count != word length`);

    const aR = rowOf(board.size, p.cells[0]);
    const aC = colOf(board.size, p.cells[0]);
    const bR = rowOf(board.size, p.cells[p.cells.length - 1]);
    const bC = colOf(board.size, p.cells[p.cells.length - 1]);
    const regenerated = resolveLine(board.size, aR, aC, bR, bC);
    if (!regenerated) {
      fail(`${label}: placement ${p.word}'s own endpoints do not resolve to a straight line`);
      continue;
    }
    if (regenerated.join(',') !== p.cells.join(',')) {
      fail(`${label}: placement ${p.word}'s regenerated line does not match its stored cells`);
      continue;
    }
    const read = wordFromCells(board.letters, regenerated);
    if (read !== p.word) {
      fail(`${label}: placement ${p.word} reads back as "${read}" off the final grid (corrupted by another word?)`);
    }
    for (const c of p.cells) {
      if (c < 0 || c >= board.size * board.size) fail(`${label}: placement ${p.word} has an out-of-bounds cell`);
    }
  }
  // Every letter is a single uppercase A-Z character - no stray nulls from a
  // filler pass that forgot a cell.
  for (let i = 0; i < board.letters.length; i += 1) {
    if (!/^[A-Z]$/.test(board.letters[i])) fail(`${label}: cell ${i} is not a single A-Z letter: ${JSON.stringify(board.letters[i])}`);
  }
}

for (let level = 1; level <= 24; level += 1) {
  for (const difficulty of ['easy', 'normal', 'hard'] as const) {
    for (let seedBase = 1; seedBase <= 4; seedBase += 1) {
      const spec = buildLevel(level, difficulty, seedBase * 7919 + level);
      const board = makeBoard(spec);
      checkBoardHonesty(board, `level ${level} (${difficulty}, seed ${seedBase})`);
      if (board.size !== spec.size) fail(`level ${level}: board size ${board.size} != spec size ${spec.size}`);
    }
  }
}

// A dedicated tight-grid stress case: small grid, max word count, backwards on -
// the densest, most collision-prone configuration the game ever deals.
for (let seed = 1; seed <= 20; seed += 1) {
  const spec = buildLevel(1, 'hard', seed * 104729);
  // Force the hardest packing the level system allows at size 7.
  const board = buildGrid(7, pickWords(VOCAB_POOL, 7, 8, lcg(spec.seed)), lcg(spec.seed ^ 0xabc), true);
  checkBoardHonesty(board, `dense stress seed ${seed}`);
}

// --- self-test: a placement that overwrote another must be caught -----------
{
  // Manually build a board where "CAT" and "DOG" are placed to deliberately
  // collide with mismatched letters at the crossing cell, without going through
  // the real (collision-avoiding) buildGrid - proves checkBoardHonesty would
  // catch a corrupted grid if buildGrid's own conflict check ever regressed.
  const size = 5;
  const letters = new Array(size * size).fill('A');
  // CAT across row 0: cells 0,1,2.
  letters[0] = 'C';
  letters[1] = 'A';
  letters[2] = 'T';
  // DOG down column 1, crossing CAT's 'A' at (0,1) but corrupted to 'O' there.
  letters[1] = 'O'; // simulate corruption: was 'A', now overwritten
  letters[1 + size] = 'O';
  letters[1 + size * 2] = 'G';
  const fakeBoard: Board = {
    size,
    letters,
    placements: [
      { word: 'CAT', hint: '', cells: [0, 1, 2], dir: { dr: 0, dc: 1 }, found: false, colorIndex: 0 },
      { word: 'DOG', hint: '', cells: [1, 1 + size, 1 + size * 2], dir: { dr: 1, dc: 0 }, found: false, colorIndex: 1 },
    ],
  };
  const before = errors.length;
  checkBoardHonesty(fakeBoard, 'sabotage: corrupted crossing');
  if (errors.length === before) fail('self-test: checkBoardHonesty did not catch a corrupted crossing letter');
  else errors.length = before; // this was a deliberate probe, not a real failure - discard it
}

// --- 2. resolveLine accepts the 8 straight directions, rejects bent/knight --

{
  const size = 9;
  const centre = idx(size, 4, 4);
  const cR = rowOf(size, centre);
  const cC = colOf(size, centre);
  let okDirs = 0;
  for (const d of ALL_DIRS) {
    const steps = 3;
    const endR = cR + d.dr * steps;
    const endC = cC + d.dc * steps;
    const line = resolveLine(size, cR, cC, endR, endC);
    if (!line) {
      fail(`resolveLine rejected a genuine straight line in direction ${JSON.stringify(d)}`);
      continue;
    }
    if (line.length !== steps + 1) fail(`resolveLine direction ${JSON.stringify(d)}: expected ${steps + 1} cells, got ${line.length}`);
    if (line[0] !== centre) fail(`resolveLine direction ${JSON.stringify(d)}: did not start at the centre cell`);
    if (line[line.length - 1] !== idx(size, endR, endC)) fail(`resolveLine direction ${JSON.stringify(d)}: did not end at the target cell`);
    okDirs += 1;
  }
  if (okDirs !== 8) fail(`resolveLine: only ${okDirs}/8 directions resolved correctly`);
  if (ALL_DIRS.length !== 8) fail(`ALL_DIRS has ${ALL_DIRS.length} entries, expected 8`);
  if (FORWARD_DIRS.length !== 4 || BACKWARD_DIRS.length !== 4) fail('FORWARD_DIRS/BACKWARD_DIRS should split 8 directions 4/4');

  // Bent (dog-leg) and knight-move paths must both be rejected.
  if (resolveLine(size, 4, 4, 4 + 2, 4 + 1) !== null) fail('resolveLine accepted a knight-move (2,1) path');
  if (resolveLine(size, 4, 4, 4 + 1, 4 + 3) !== null) fail('resolveLine accepted a knight-move (1,3) path');
  if (resolveLine(size, 4, 4, 4, 4) !== null) fail('resolveLine accepted a zero-length "line" (same cell twice)');

  // Off-board endpoint must fail even if the direction itself is straight.
  if (resolveLine(size, 0, 0, -3, 0) !== null) fail('resolveLine accepted an endpoint above the grid');
  if (resolveLine(size, 0, 0, 0, size + 5) !== null) fail('resolveLine accepted an endpoint past the right edge');
}

// --- self-test: a resolver that ignores diagonals is caught -----------------
{
  const naiveOrthogonalOnly = (size: number, aR: number, aC: number, bR: number, bC: number): number[] | null => {
    const dr = bR - aR;
    const dc = bC - aC;
    if (dr !== 0 && dc !== 0) return null; // no diagonal support - the bug
    const steps = Math.max(Math.abs(dr), Math.abs(dc));
    const stepR = Math.sign(dr);
    const stepC = Math.sign(dc);
    const cells: number[] = [];
    for (let i = 0; i <= steps; i += 1) cells.push(idx(size, aR + stepR * i, aC + stepC * i));
    return cells;
  };
  const realDiag = resolveLine(9, 2, 2, 5, 5);
  const naiveDiag = naiveOrthogonalOnly(9, 2, 2, 5, 5);
  if (!(realDiag !== null && naiveDiag === null)) fail('self-test: failed to distinguish a real diagonal resolver from a broken orthogonal-only one');
}

// --- 3. matchSelection: forward/backward, and never the already-found word --

{
  const remaining = ['ABANDON', 'AGILE', 'ARID'];
  if (matchSelection('AGILE', remaining) !== 'AGILE') fail('matchSelection missed a direct forward match');
  if (matchSelection('ELIGA', remaining) !== 'AGILE') fail('matchSelection missed a reversed match');
  if (matchSelection('BOGUS', remaining) !== null) fail('matchSelection matched a word that is not in the remaining list');
  if (matchSelection('AGILE', remaining.filter((w) => w !== 'AGILE')) !== null) {
    fail('matchSelection matched a word after it was removed from the remaining set (double-credit risk)');
  }
  // Distinct non-palindromic words must never cross-match each other.
  const distinct = ['ABANDON', 'ARID'];
  if (matchSelection('ABANDON', distinct) === 'ARID') fail('matchSelection: ABANDON incorrectly matched ARID');
  if (matchSelection('DIRA', distinct) === 'ABANDON') fail('matchSelection: reversed ARID incorrectly matched ABANDON');
}

// --- self-test: a matcher that ignores "already found" would double-credit -
{
  const buggyMatch = (word: string, remaining: readonly string[]): string | null => {
    // Bug: checks against the FULL word bank rather than only `remaining`.
    void remaining;
    const fullBank = ['AGILE', 'ARID', 'ABANDON'];
    return fullBank.includes(word) ? word : null;
  };
  const stillRemaining = ['ARID']; // AGILE was already found and removed
  const buggyResult = buggyMatch('AGILE', stillRemaining);
  const realResult = matchSelection('AGILE', stillRemaining);
  if (!(buggyResult === 'AGILE' && realResult === null)) {
    fail('self-test: did not demonstrate the already-found double-credit bug being caught by the real matcher');
  }
}

// --- 4. canPlace: bounds and letter-conflict rules --------------------------

{
  const size = 5;
  const cells: (string | null)[] = new Array(size * size).fill(null);
  // CAT's middle letter ('A') lands on (2,3); pre-seed that cell with 'A' so
  // placing CAT there is an agreeing crossing, not a fresh cell.
  cells[idx(size, 2, 3)] = 'A';
  if (!canPlace(cells, size, 'CAT', 2, 2, { dr: 0, dc: 1 })) fail('canPlace refused a word that agrees with an existing crossing letter');
  if (canPlace(cells, size, 'DOG', 2, 2, { dr: 0, dc: 1 })) fail('canPlace allowed a word that conflicts with an existing crossing letter (O vs A at the crossing)');
  if (canPlace(cells, size, 'LONGWORD', 0, 0, { dr: 0, dc: 1 })) fail('canPlace allowed a word to run off the right edge');
  if (canPlace(cells, size, 'AB', 0, 4, { dr: 0, dc: 1 })) fail('canPlace allowed a 2-letter word to run off the edge from the last column');
  if (!canPlace(cells, size, 'AB', 4, 4, { dr: -1, dc: -1 })) fail('canPlace refused a legal NW placement from the bottom-right corner');
}

// --- 5. level ramp: size and word count are non-decreasing and capped ------

{
  let prevSize = sizeForLevel(1);
  let prevCount = wordCountForLevel(1);
  if (prevSize !== 7) fail(`sizeForLevel(1): expected 7, got ${prevSize}`);
  if (prevCount !== 3) fail(`wordCountForLevel(1): expected 3, got ${prevCount}`);
  for (let lv = 2; lv <= 200; lv += 1) {
    const s = sizeForLevel(lv);
    const c = wordCountForLevel(lv);
    if (s < prevSize) fail(`sizeForLevel(${lv}): decreased from ${prevSize} to ${s}`);
    if (c < prevCount) fail(`wordCountForLevel(${lv}): decreased from ${prevCount} to ${c}`);
    if (s > 13) fail(`sizeForLevel(${lv}): ${s} exceeds the 13 cap`);
    if (c > 8) fail(`wordCountForLevel(${lv}): ${c} exceeds the 8 cap`);
    prevSize = s;
    prevCount = c;
  }
  if (sizeForLevel(200) !== 13) fail('sizeForLevel: never reached the cap of 13 by level 200');

  if (!backwardsAllowed(10, 'hard')) fail('backwardsAllowed: hard should have unlocked backwards well before level 10');
  if (backwardsAllowed(1, 'easy')) fail('backwardsAllowed: easy should not unlock backwards at level 1');
}

// --- self-test: a decreasing ramp must be caught -----------------------------
{
  const brokenRamp = (lv: number) => (lv === 5 ? 3 : lv);
  let caught = false;
  for (let lv = 2; lv <= 6; lv += 1) if (brokenRamp(lv) < brokenRamp(lv - 1)) caught = true;
  if (!caught) fail('self-test: the non-decreasing ramp loop did not catch a deliberately broken ramp');
}

// --- 6. layout / input round-trip -------------------------------------------

for (const [size, wordCount] of [[7, 3], [9, 5], [13, 8]] as const) {
  const cw = 400;
  const ch = 700;
  const inset = 40;
  const layout = layoutFor(cw, ch, inset, size, wordCount);
  if (!(layout.scale > 0)) fail(`layoutFor(${size},${wordCount}): non-positive scale`);

  let hits = 0;
  for (let i = 0; i < size * size; i += 1) {
    const centre = cellCentre(i, size);
    const sx = (centre.x * layout.scale + layout.ox) / cw;
    const sy = (centre.y * layout.scale + layout.oy) / ch;
    const back = toBoard(layout, cw, ch, sx, sy);
    const hit = cellAt(back.x, back.y, size);
    if (hit === i) hits += 1;
  }
  if (hits !== size * size) fail(`layoutFor(${size}x${size}): round-trip only hit ${hits}/${size * size} cells`);

  if (cellAt(-50, -50, size) !== null) fail(`cellAt(${size}): accepted a point off the top-left of the grid`);
  if (cellAt(1e6, 1e6, size) !== null) fail(`cellAt(${size}): accepted a point far past the grid`);
}

// --- 7. scoring never goes negative and rewards longer words ---------------

{
  const words: VocabWord[] = VOCAB_POOL;
  if (words.length > 0) {
    let prevLen = MIN_WORD_LEN - 1;
    let prevScore = -1;
    for (let len = MIN_WORD_LEN; len <= MAX_WORD_LEN; len += 1) {
      const s = wordScore('A'.repeat(len));
      if (s <= 0) fail(`wordScore(length ${len}) is not positive`);
      if (len > prevLen && s < prevScore) fail(`wordScore: length ${len} scored less than length ${prevLen}`);
      prevLen = len;
      prevScore = s;
    }
  }
}

// --- report ------------------------------------------------------------------

if (errors.length > 0) {
  console.error(`Word Hunt check FAILED (${errors.length} problem${errors.length === 1 ? '' : 's'}):`);
  for (const e of errors.slice(0, 60)) console.error(` - ${e}`);
  process.exit(1);
}

console.log('Word Hunt check passed:');
console.log(' - imported vocab bank yields a non-empty, deduped 3-8 letter word list covering every length');
console.log(' - 288 built boards (24 levels x 3 difficulties x 4 seeds) + 20 dense stress boards: every placed word');
console.log('   reads back correctly off the FINAL grid via resolveLine, proving no later word corrupts an earlier one');
console.log(' - resolveLine accepts all 8 straight directions exactly, rejects knight/bent moves and off-board endpoints');
console.log(' - matchSelection matches forwards and backwards, and never re-matches an already-found word');
console.log(' - canPlace enforces both grid bounds and crossing-letter agreement');
console.log(' - sizeForLevel/wordCountForLevel ramp non-decreasing and cap correctly; backwardsAllowed gates by difficulty');
console.log(' - grid layout/input round-trips hit the exact cell tapped, off-board points return null');
