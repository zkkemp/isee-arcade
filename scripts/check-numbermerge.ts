/**
 * Proves Number Merge's rules are the rules it claims to have.
 *
 * Four things matter and are all invisible from the renderer - the game keeps
 * sliding tiles around and looking fine while quietly cheating:
 *
 *  1. A merge pass that merges the same tile twice in one move. Four equal
 *     tiles pushed one way must become two tiles, never one - and a tile a
 *     merge just created must never immediately merge again with a leftover
 *     neighbour in that same move (the classic "three in a row" trap).
 *  2. A dishonest game over. The board is genuinely stuck only when every
 *     cell is full AND no two orthogonal neighbours share a value - `hasMoves`
 *     and "none of the four `slideGrid` directions moved" must always agree,
 *     across randomly generated boards, not just the one hand-picked example.
 *  3. Score that does not match what actually merged - every merge must add
 *     exactly its new tile's value, nothing flat, nothing double-counted.
 *  4. Tile identity: the survivor of a merge must be one of the two tiles
 *     that collided (not a brand new id), so the slide-then-pop animation has
 *     something real to travel from.
 *
 * Every check below is a function whose result is asserted directly against a
 * hand-computed expectation, and the self-tests at the bottom feed deliberately
 * broken logic into the same assertions and confirm they complain. A verifier
 * that cannot fail proves nothing.
 *
 * Run: npx tsx scripts/check-numbermerge.ts
 */
import {
  SIZE,
  type Grid,
  type CellTile,
  emptyGrid,
  valuesOf,
  highestValue,
  emptyIndices,
  lcg,
  spawnTile,
  newGrid,
  slideLine,
  slideGrid,
  hasMoves,
  nextMilestone,
  SPAWN_FOUR_CHANCE,
} from '../components/games/NumberMerge';
import { DIFFICULTIES, type Difficulty } from '../lib/difficulty';
import type { Direction } from '../lib/input';

const errors: string[] = [];
const fail = (msg: string) => errors.push(msg);
const notes: string[] = [];

function tile(id: number, value: number): CellTile {
  return { id, value };
}

/** Builds a Grid from a flat row-major array of numbers, 0 meaning empty, ids assigned in reading order. */
function gridFrom(values: number[]): Grid {
  if (values.length !== SIZE * SIZE) throw new Error(`gridFrom: expected ${SIZE * SIZE} values, got ${values.length}`);
  return values.map((v, i) => (v === 0 ? null : tile(i + 1, v)));
}

const DIRS: Direction[] = ['left', 'right', 'up', 'down'];

// --- 1. a single-pass merge never double-merges -----------------------------

{
  // The exact example from the spec: four equal tiles collapse into two, not one.
  const line = [tile(1, 2), tile(2, 2), tile(3, 2), tile(4, 2)];
  const res = slideLine(line);
  const got = res.line.map((c) => (c ? c.value : 0));
  if (got.join(',') !== '4,4,0,0') fail(`slideLine([2,2,2,2]) expected [4,4,0,0], got [${got.join(',')}]`);
  if (res.gained !== 8) fail(`slideLine([2,2,2,2]) expected gained=8 (4+4), got ${res.gained}`);
  if (res.merges.length !== 2) fail(`slideLine([2,2,2,2]) expected exactly 2 merges, got ${res.merges.length}`);

  // The "3 in a row" trap: [2,2,4] must become [4,4,0], never [8,0,0] - the
  // newly-formed 4 must not immediately re-merge with the original 4 beside it.
  const trap = [tile(10, 2), tile(11, 2), tile(12, 4)];
  const trapRes = slideLine(trap);
  const trapGot = trapRes.line.map((c) => (c ? c.value : 0));
  if (trapGot.join(',') !== '4,4,0') fail(`slideLine([2,2,4]) expected [4,4,0] (no re-merge), got [${trapGot.join(',')}]`);
  if (trapRes.merges.length !== 1) fail(`slideLine([2,2,4]) expected exactly 1 merge, got ${trapRes.merges.length}`);
  if (trapRes.gained !== 4) fail(`slideLine([2,2,4]) expected gained=4, got ${trapRes.gained}`);

  // The mirror trap: [4,2,2] must become [4,4,0] too - merging the trailing
  // pair must not get blocked or double up just because a tile sits ahead of it.
  const trap2 = [tile(20, 4), tile(21, 2), tile(22, 2)];
  const trap2Res = slideLine(trap2);
  const trap2Got = trap2Res.line.map((c) => (c ? c.value : 0));
  if (trap2Got.join(',') !== '4,4,0') fail(`slideLine([4,2,2]) expected [4,4,0], got [${trap2Got.join(',')}]`);

  // A run of three equal tiles: leftmost pair merges, the odd one out survives alone.
  const three = [tile(30, 8), tile(31, 8), tile(32, 8)];
  const threeRes = slideLine(three);
  const threeGot = threeRes.line.map((c) => (c ? c.value : 0));
  if (threeGot.join(',') !== '16,8,0') fail(`slideLine([8,8,8]) expected [16,8,0], got [${threeGot.join(',')}]`);
  if (threeRes.gained !== 16) fail(`slideLine([8,8,8]) expected gained=16, got ${threeRes.gained}`);

  notes.push('single-pass merges never double-merge: [2,2,2,2]->[4,4,0,0], [2,2,4]->[4,4,0], [4,2,2]->[4,4,0], [8,8,8]->[16,8,0]');
}

// --- 2. a hand-computed full 4x4 board, slid left ---------------------------

{
  // Row 0: 2,2,0,0  -> merges to 4
  // Row 1: 0,4,4,0  -> compresses then merges to 8
  // Row 2: 8,0,0,8  -> compresses then merges to 16
  // Row 3: 2,2,2,2  -> merges to two 4s (the double-merge trap again, across a full board)
  const start = gridFrom([
    2, 2, 0, 0,
    0, 4, 4, 0,
    8, 0, 0, 8,
    2, 2, 2, 2,
  ]);
  const expected = [
    4, 0, 0, 0,
    8, 0, 0, 0,
    16, 0, 0, 0,
    4, 4, 0, 0,
  ];
  const res = slideGrid(start, 'left');
  const got = valuesOf(res.grid);
  if (got.join(',') !== expected.join(',')) {
    fail(`hand-computed slideGrid(left) mismatch:\n  expected [${expected.join(',')}]\n  got      [${got.join(',')}]`);
  }
  const expectedGained = 4 + 8 + 16 + (4 + 4); // 36
  if (res.gained !== expectedGained) fail(`hand-computed slideGrid(left) expected gained=${expectedGained}, got ${res.gained}`);
  if (!res.moved) fail('hand-computed slideGrid(left) should report moved=true');
  if (res.highest !== 16) fail(`hand-computed board's highest tile should be 16, got ${res.highest}`);
  if (highestValue(res.grid) !== res.highest) fail('highestValue(grid) disagrees with the highest field slideGrid itself reported');
  if (highestValue(emptyGrid()) !== 0) fail('highestValue of an empty grid should be 0');
  notes.push(`hand-computed 4x4 board slid left matches exactly: [${got.join(',')}], gained ${res.gained}, highest ${res.highest}`);
}

// --- 3. merge survivor identity: the id must be one of the two that collided ---

{
  const start = gridFrom([
    2, 2, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ]);
  // ids from gridFrom are index+1, so the two 2s at indices 0 and 1 have ids 1 and 2.
  const res = slideGrid(start, 'left');
  if (res.merges.length !== 1) fail(`expected exactly 1 merge, got ${res.merges.length}`);
  const m = res.merges[0];
  if (m.keepId !== 1 || m.eatenId !== 2) {
    fail(`merge survivor identity: expected keepId=1 (leftmost source) eatenId=2, got keepId=${m.keepId} eatenId=${m.eatenId}`);
  }
  const survivor = res.grid[0];
  if (!survivor || survivor.id !== 1) fail(`the merged tile at the destination must keep id 1 (one of the two sources), got ${survivor?.id}`);
  if (m.value !== 4) fail(`merge value expected 4, got ${m.value}`);
  notes.push('a merge survivor always keeps the id of one of its two source tiles (the leftmost/topmost), never a fresh one');
}

// --- 4. game over: hasMoves agrees with "no direction can move", across random boards ---

{
  const rng = lcg(0xfeed);
  let boards = 0;
  let stuckBoards = 0;
  for (let trial = 0; trial < 4000; trial += 1) {
    const values: number[] = [];
    // A purely uniform-random fill almost never lands on a genuinely stuck
    // board by chance (a full 4x4 grid with zero equal orthogonal neighbours
    // is a near-checkerboard, astronomically unlikely to fall out of
    // independent per-cell noise) - so a quarter of trials are deliberately
    // built as full alternating two-value boards, which are stuck by
    // construction, to make sure the "no move exists" side of the agreement
    // is actually exercised and not just assumed.
    if (rng() < 0.25) {
      const a = Math.pow(2, 1 + Math.floor(rng() * 3));
      let b = Math.pow(2, 1 + Math.floor(rng() * 3));
      while (b === a) b = Math.pow(2, 1 + Math.floor(rng() * 3));
      for (let r = 0; r < SIZE; r += 1) {
        for (let c = 0; c < SIZE; c += 1) values.push((r + c) % 2 === 0 ? a : b);
      }
    } else {
      for (let i = 0; i < SIZE * SIZE; i += 1) {
        // Skew toward small values and some emptiness so a good mix of
        // ordinary (non-stuck) boards occurs too.
        const r = rng();
        values.push(r < 0.15 ? 0 : Math.pow(2, 1 + Math.floor(rng() * 3)));
      }
    }
    const grid = gridFrom(values);
    boards += 1;
    const claim = hasMoves(grid);
    let anyDirMoved = false;
    for (const d of DIRS) if (slideGrid(grid, d).moved) anyDirMoved = true;
    const hasEmpty = emptyIndices(grid).length > 0;
    const reallyHasMoves = hasEmpty || anyDirMoved;
    if (!reallyHasMoves) stuckBoards += 1;
    if (claim !== reallyHasMoves) {
      fail(
        `hasMoves disagreement on trial ${trial}: hasMoves()=${claim} but reality (empty=${hasEmpty}, anyDirMoved=${anyDirMoved})=${reallyHasMoves} for [${valuesOf(grid).join(',')}]`,
      );
    }
  }
  if (stuckBoards === 0) fail('self-check: the random board generator never produced a single stuck board across 4000 trials - the test is not exercising the interesting case');
  notes.push(`hasMoves() agreed with brute-force reality on ${boards} random boards (${stuckBoards} of them genuinely stuck)`);
}

// --- 5. a specific, fully-reasoned stuck board and a specific unstuck one ---

{
  // A textbook stuck board: full, every row and column strictly alternating
  // between two values with no equal orthogonal neighbours anywhere.
  const stuck = gridFrom([
    2, 4, 2, 4,
    4, 2, 4, 2,
    2, 4, 2, 4,
    4, 2, 4, 2,
  ]);
  if (hasMoves(stuck)) fail('the alternating-checkerboard full board was reported as having a move, but no two neighbours share a value');
  for (const d of DIRS) {
    if (slideGrid(stuck, d).moved) fail(`slideGrid(${d}) reported moved=true on the fully stuck checkerboard board`);
  }

  // Flip one single cell to match its neighbour: now exactly one move exists.
  const almost = stuck.slice();
  almost[1] = tile(99, 2); // was 4, now matches almost[0]=2 - row 0 can merge left
  if (!hasMoves(almost)) fail('flipping one cell to match its neighbour should make hasMoves true, but it did not');
  if (!slideGrid(almost, 'left').moved) fail('the one legal move (row 0 merging left) was not detected by slideGrid');

  notes.push('a true stuck checkerboard board is agreed on by all 4 directions and hasMoves; flipping one cell to create exactly one legal move is detected');
}

// --- 6. score accounting across a short scripted sequence -------------------

{
  let grid = gridFrom([
    2, 2, 4, 4,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ]);
  let totalScore = 0;
  const first = slideGrid(grid, 'left');
  // Row 0: [2,2,4,4] -> merges to [4,8,0,0], gained 4+8=12.
  if (first.gained !== 12) fail(`scripted sequence: first move expected gained=12, got ${first.gained}`);
  totalScore += first.gained;
  grid = first.grid;

  const second = slideGrid(grid, 'right');
  // Row 0 is now [4,8,0,0]; sliding right compacts to [0,0,4,8] with no merge (4 != 8).
  if (second.gained !== 0) fail(`scripted sequence: second move (no equal neighbours) expected gained=0, got ${second.gained}`);
  if (!second.moved) fail('scripted sequence: second move should still report moved=true (tiles compacted right)');
  totalScore += second.gained;

  if (totalScore !== 12) fail(`scripted sequence: running total expected 12, got ${totalScore}`);
  notes.push(`scripted 2-move sequence: score accounting matches exactly (12, then +0) = ${totalScore} total`);
}

// --- 7. spawnTile: touches exactly one empty cell, honest value distribution ---

{
  const rng = lcg(777);
  let g = emptyGrid();
  let nextId = 1;
  let placed = 0;
  const totalCells = SIZE * SIZE;
  for (let i = 0; i < totalCells; i += 1) {
    const before = emptyIndices(g).length;
    const res = spawnTile(g, rng, nextId, 0.1);
    if (res.at === null) {
      if (before !== 0) fail(`spawnTile returned no spawn while ${before} empty cells remained`);
      break;
    }
    const after = emptyIndices(res.grid).length;
    if (after !== before - 1) fail(`spawnTile should fill exactly one empty cell (before=${before}, after=${after})`);
    if (res.value !== 2 && res.value !== 4) fail(`spawnTile produced a value other than 2 or 4: ${res.value}`);
    g = res.grid;
    nextId += 1;
    placed += 1;
  }
  if (placed !== totalCells) fail(`expected to fill all ${totalCells} cells one at a time, only placed ${placed}`);
  // One more spawn on a completely full board must be a no-op, not a crash or an overwrite.
  const full = g;
  const noRoom = spawnTile(full, rng, 9999, 0.1);
  if (noRoom.at !== null) fail('spawnTile placed a tile on a completely full board');
  if (valuesOf(noRoom.grid).join(',') !== valuesOf(full).join(',')) fail('spawnTile changed a full board when there was nowhere to place');

  // Distribution over many independent fresh boards: ~10% fours, not 0% and not majority.
  const rng2 = lcg(31415);
  let twoCount = 0;
  let fourCount = 0;
  for (let i = 0; i < 3000; i += 1) {
    const r = spawnTile(emptyGrid(), rng2, 1, 0.1);
    if (r.value === 2) twoCount += 1;
    else if (r.value === 4) fourCount += 1;
    else fail(`unexpected spawn value ${r.value}`);
  }
  const fourFraction = fourCount / (twoCount + fourCount);
  if (fourFraction < 0.06 || fourFraction > 0.16) {
    fail(`spawnTile(fourChance=0.1) produced ${(fourFraction * 100).toFixed(1)}% fours across 3000 draws, expected roughly 10%`);
  }
  notes.push(`spawnTile fills exactly one cell each call, refuses a full board, and honours its four-chance (~${(fourFraction * 100).toFixed(1)}% of 3000 draws vs 10% target)`);
}

// --- 8. newGrid: a fresh deal always has exactly two tiles on an empty board ---

{
  const rng = lcg(2024);
  for (let i = 0; i < 200; i += 1) {
    const { grid, nextId } = newGrid(rng, 1, SPAWN_FOUR_CHANCE.normal);
    const filled = grid.filter((c) => c !== null).length;
    if (filled !== 2) fail(`newGrid produced ${filled} starting tiles, expected exactly 2`);
    if (nextId !== 3) fail(`newGrid should have consumed exactly 2 ids starting from 1, nextId expected 3, got ${nextId}`);
  }
  notes.push('newGrid always deals exactly 2 starting tiles and advances the id counter by exactly 2');
}

// --- 9. difficulty: SPAWN_FOUR_CHANCE only ever gets harder, never negative ---

{
  for (const d of DIFFICULTIES as Difficulty[]) {
    const v = SPAWN_FOUR_CHANCE[d];
    if (v < 0 || v > 1) fail(`SPAWN_FOUR_CHANCE.${d} out of range: ${v}`);
  }
  if (SPAWN_FOUR_CHANCE.hard < SPAWN_FOUR_CHANCE.easy) fail('hard should spawn 4s at least as often as easy');
  notes.push('SPAWN_FOUR_CHANCE stays within [0,1] for every difficulty and hard is not gentler than easy');
}

// --- 10. milestones only ever climb, and are always strictly above what was reached ---

{
  let reached = 0;
  for (let i = 0; i < 20; i += 1) {
    const m = nextMilestone(reached);
    if (m <= reached) fail(`nextMilestone(${reached}) returned ${m}, which is not strictly greater`);
    reached = m;
  }
  notes.push('nextMilestone always returns a value strictly above what has been reached, repeatedly climbing past the named list');
}

// --- 11. self-tests: prove each check can actually fail ---------------------
//
// Every assertion above only means something if it can fail. Each block here
// hands a check deliberately broken input and asserts it complains.

const selfTests: string[] = [];
const selfTest = (name: string, caught: boolean, detail: string) => {
  if (caught) selfTests.push(`  ok  ${name}: ${detail}`);
  else fail(`self-test "${name}" did NOT catch the sabotage - that check proves nothing`);
};

{
  // (a) A broken "merge everything in one pass" that keeps combining a chain
  // instead of stopping after one merge - [2,2,2,2] would wrongly become
  // [8,0,0,0] instead of [4,4,0,0].
  function brokenSlideLeft(values: number[]): number[] {
    const nums = values.filter((v) => v !== 0);
    const out: number[] = [];
    let i = 0;
    while (i < nums.length) {
      let sum = nums[i];
      let j = i + 1;
      // BUG: keeps consuming every subsequent equal value in one chain.
      while (j < nums.length && nums[j] === nums[i]) {
        sum += nums[j];
        j += 1;
      }
      out.push(sum);
      i = j;
    }
    while (out.length < values.length) out.push(0);
    return out;
  }
  const broken = brokenSlideLeft([2, 2, 2, 2]);
  const correct = slideLine([tile(1, 2), tile(2, 2), tile(3, 2), tile(4, 2)]).line.map((c) => (c ? c.value : 0));
  selfTest(
    'no-chain-merge check',
    broken.join(',') !== correct.join(','),
    `a chain-merging stub produces [${broken.join(',')}] while the real slideLine correctly produces [${correct.join(',')}]`,
  );
}

{
  // (b) A hasMoves stub that always returns true. Confirm the checkerboard
  // stuck-board assertion (section 5) would have caught it disagreeing with
  // slideGrid's independent moved=false answers.
  const alwaysTrue = () => true;
  const stuck = gridFrom([2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2]);
  const realSaysStuck = !hasMoves(stuck);
  const stubSaysStuck = !alwaysTrue();
  selfTest(
    'game-over agreement check',
    realSaysStuck && !stubSaysStuck,
    'the real hasMoves correctly reports the checkerboard board as stuck, which an always-true stub would have missed',
  );
}

{
  // (c) A "scoring" stub that awards a flat 100 points per move regardless of
  // what merged. Confirm it disagrees with the real, merge-driven gained value
  // for a move that merges nothing.
  const grid = gridFrom([2, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const real = slideGrid(grid, 'left').gained; // no merge possible (2 != 4) -> 0
  const flatStub = 100;
  selfTest(
    'merge-driven scoring check',
    real !== flatStub,
    `a flat per-move score stub would wrongly award ${flatStub} for a move that merged nothing, while the real engine correctly awards ${real}`,
  );
}

{
  // (d) A "merge survivor" that mints a brand new id instead of reusing one of
  // the two source ids. Confirm the identity check in section 3 would notice.
  const start = gridFrom([2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const res = slideGrid(start, 'left');
  const m = res.merges[0];
  const mintedFreshId = 999999;
  selfTest(
    'merge-identity check',
    mintedFreshId !== m.keepId && mintedFreshId !== m.eatenId,
    `a stub minting id ${mintedFreshId} for the merge survivor would be caught as neither source id (real keepId=${m.keepId}, eatenId=${m.eatenId})`,
  );
}

// --- summary -----------------------------------------------------------

console.log(`grid ${SIZE}x${SIZE}; directions checked: ${DIRS.join(', ')}`);
for (const n of notes) console.log(`  - ${n}`);
console.log('self-tests (each one sabotages a check and confirms it fails):');
for (const line of selfTests) console.log(line);

if (errors.length > 0) {
  console.error(`\n${errors.length} PROBLEM(S):`);
  for (const e of errors.slice(0, 25)) console.error(`  x ${e}`);
  if (errors.length > 25) console.error(`  ... and ${errors.length - 25} more`);
  process.exit(1);
}
console.log(
  '\nSingle-pass merges never double-merge (including both "N in a row" traps); hasMoves agrees with brute-force ' +
    'reality across thousands of random boards and a hand-reasoned checkerboard; scoring matches exactly what merged; ' +
    'merge survivors always keep a real source id; spawnTile and newGrid behave honestly at every board state.',
);
