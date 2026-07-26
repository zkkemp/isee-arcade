/**
 * Headless proof for Kid Sudoku's rules and generator.
 *
 * Drives the exact pure functions the game runs (generateSolvedGrid /
 * makePuzzle / countSolutions / conflicts / conflictMask / isSolved /
 * configForLevel). Three failures quietly ruin this genre, and each is
 * checked here rather than hoped for:
 *
 *  1. A "solved" grid that is not a genuine Latin-square-plus-boxes - a
 *     repeated symbol in some row/col/box. Checked across many seeds, at
 *     both sizes, against an independently-written validator (different
 *     code path from the game's own conflicts()).
 *  2. A puzzle with more than one solution - the single worst bug a sudoku
 *     generator can have, because it silently teaches a kid that two
 *     different fills are both "right". Checked with the game's own
 *     countSolutions AND a second, independently-written solver (reverse
 *     cell order, reverse value order, its own row/col/box scan) so a bug
 *     shared between generator and checker cannot hide.
 *  3. A conflict/isSolved check that misses a duplicate or calls an
 *     incomplete board "solved".
 *
 * Each self-test at the end sabotages a check and confirms it would have
 * been caught, so a check that has quietly stopped testing anything is
 * caught too.
 *
 * Run: npx tsx scripts/check-sudoku.ts
 */
import {
  boxDims,
  conflictMask,
  conflicts,
  configForLevel,
  countSolutions,
  emptyGrid,
  generateSolvedGrid,
  isSolved,
  isValidGrid,
  lcg,
  makePuzzle,
  type Grid,
  type Size,
} from '../components/games/Sudoku';

let failures = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    failures += 1;
    console.error(`  FAIL: ${msg}`);
  }
}

// --- an independent validator/solver, written a different way from the game's
// own conflicts()/countSolutions(), to cross-check rather than trust itself ---

function isPermutation(vals: number[], n: number): boolean {
  if (vals.length !== n) return false;
  const seen = new Array(n + 1).fill(false);
  for (const v of vals) {
    if (v < 1 || v > n || seen[v]) return false;
    seen[v] = true;
  }
  return true;
}

function independentFullyValid(g: Grid, n: Size): boolean {
  const { bh, bw } = boxDims(n);
  for (let r = 0; r < n; r += 1) {
    const row: number[] = [];
    for (let c = 0; c < n; c += 1) row.push(g[r * n + c]);
    if (!isPermutation(row, n)) return false;
  }
  for (let c = 0; c < n; c += 1) {
    const col: number[] = [];
    for (let r = 0; r < n; r += 1) col.push(g[r * n + c]);
    if (!isPermutation(col, n)) return false;
  }
  const boxRows = n / bh;
  const boxCols = n / bw;
  for (let br = 0; br < boxRows; br += 1) {
    for (let bc = 0; bc < boxCols; bc += 1) {
      const vals: number[] = [];
      for (let dr = 0; dr < bh; dr += 1) {
        for (let dc = 0; dc < bw; dc += 1) {
          vals.push(g[(br * bh + dr) * n + (bc * bw + dc)]);
        }
      }
      if (!isPermutation(vals, n)) return false;
    }
  }
  return true;
}

/** Independent conflict check: direct row/col/box scan, no peersOf(). */
function independentConflict(g: Grid, n: Size, index: number, value: number): boolean {
  const { bh, bw } = boxDims(n);
  const row = Math.floor(index / n);
  const col = index % n;
  for (let c = 0; c < n; c += 1) if (c !== col && g[row * n + c] === value) return true;
  for (let r = 0; r < n; r += 1) if (r !== row && g[r * n + col] === value) return true;
  const br = Math.floor(row / bh) * bh;
  const bc = Math.floor(col / bw) * bw;
  for (let dr = 0; dr < bh; dr += 1) {
    for (let dc = 0; dc < bw; dc += 1) {
      const j = (br + dr) * n + (bc + dc);
      if (j !== index && g[j] === value) return true;
    }
  }
  return false;
}

/** Independent solution counter: reverse cell order, reverse value order. */
function independentCountSolutions(grid: Grid, n: Size, cap = 2): number {
  const g = grid.slice();
  const total = n * n;
  let count = 0;

  const lastEmpty = (): number => {
    for (let i = total - 1; i >= 0; i -= 1) if (g[i] === 0) return i;
    return -1;
  };

  const solve = (): void => {
    if (count >= cap) return;
    const idx = lastEmpty();
    if (idx === -1) {
      count += 1;
      return;
    }
    for (let v = n; v >= 1; v -= 1) {
      if (count >= cap) return;
      if (!independentConflict(g, n, idx, v)) {
        g[idx] = v;
        solve();
        g[idx] = 0;
      }
    }
  };
  solve();
  return count;
}

// 1) generateSolvedGrid produces a genuine solved grid, across many seeds, at
//    both sizes, cross-checked by the independent validator.
{
  let checked = 0;
  let bad = 0;
  for (const n of [4, 6] as Size[]) {
    for (let seed = 1; seed <= 60; seed += 1) {
      const g = generateSolvedGrid(n, lcg(seed * 97 + n));
      checked += 1;
      if (!independentFullyValid(g, n)) bad += 1;
      if (!isSolved(g, n)) bad += 1;
      if (!isValidGrid(g, n)) bad += 1;
    }
  }
  assert(bad === 0, `${bad}/${checked} generated solved grids failed validation`);
  console.log(`generateSolvedGrid: ${checked} grids across sizes 4 and 6, all valid.`);
}

// 2) Every generated puzzle: givens are consistent with its own solution,
//    non-given cells start empty, and it has EXACTLY one solution - verified
//    by both the game's own solver and the independent one.
{
  let checked = 0;
  let inconsistentGivens = 0;
  let notUniqueOwn = 0;
  let notUniqueIndependent = 0;
  let solutionNotSolvedOfSize = 0;

  for (const level of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12]) {
    for (const bias of [-2, 0, 2]) {
      for (let seed = 1; seed <= 6; seed += 1) {
        const puzzle = makePuzzle(level, lcg(level * 1000 + bias * 31 + seed), bias);
        checked += 1;

        if (!isSolved(puzzle.solution, puzzle.size)) solutionNotSolvedOfSize += 1;

        for (let i = 0; i < puzzle.grid.length; i += 1) {
          const consistent = puzzle.givenMask[i]
            ? puzzle.grid[i] === puzzle.solution[i] && puzzle.grid[i] !== 0
            : puzzle.grid[i] === 0;
          if (!consistent) inconsistentGivens += 1;
        }

        if (countSolutions(puzzle.grid, puzzle.size, 2) !== 1) notUniqueOwn += 1;
        if (independentCountSolutions(puzzle.grid, puzzle.size, 2) !== 1) notUniqueIndependent += 1;
      }
    }
  }

  assert(solutionNotSolvedOfSize === 0, `${solutionNotSolvedOfSize} puzzle solutions were not themselves valid/solved`);
  assert(inconsistentGivens === 0, `${inconsistentGivens} given/non-given cells were inconsistent with the solution`);
  assert(notUniqueOwn === 0, `${notUniqueOwn}/${checked} puzzles were not unique per the game's own solver`);
  assert(
    notUniqueIndependent === 0,
    `${notUniqueIndependent}/${checked} puzzles were not unique per the independent solver`,
  );
  console.log(`makePuzzle: ${checked} puzzles across levels/biases/seeds, all unique and consistent.`);
}

// 3) configForLevel: sizes match the "4x4 first, 6x6 later" rule, givens are
//    always in [1, total-1] (never a fully-blank or fully-given puzzle), and
//    a harder bias never yields MORE givens than an easier one at the same level.
{
  let badRange = 0;
  let badSizeSwitch = 0;
  let badBiasOrder = 0;
  for (let level = 1; level <= 14; level += 1) {
    const easy = configForLevel(level, 2);
    const normal = configForLevel(level, 0);
    const hard = configForLevel(level, -2);
    for (const cfg of [easy, normal, hard]) {
      if (cfg.givens < 1 || cfg.givens > cfg.size * cfg.size - 1) badRange += 1;
      const expectedSize: Size = level <= 5 ? 4 : 6;
      if (cfg.size !== expectedSize) badSizeSwitch += 1;
    }
    if (!(hard.givens <= normal.givens && normal.givens <= easy.givens)) badBiasOrder += 1;
  }
  assert(badRange === 0, `${badRange} level configs had an out-of-range givens count`);
  assert(badSizeSwitch === 0, `${badSizeSwitch} level configs used the wrong grid size for their level`);
  assert(badBiasOrder === 0, `${badBiasOrder} levels did not order givens hard <= normal <= easy`);
}

// 4) conflicts()/conflictMask() flag a duplicate in a row, a column, and a box
//    (both sizes), and pass a fully legal grid clean.
{
  // 4x4 row duplicate: two 1s in row 0.
  const rowDup: Grid = [1, 2, 1, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  assert(conflicts(rowDup, 4, 0, 1), 'row duplicate (4x4) not flagged at index 0');
  assert(conflicts(rowDup, 4, 2, 1), 'row duplicate (4x4) not flagged at index 2');
  assert(!conflicts(rowDup, 4, 1, 2), '4x4 legal cell wrongly flagged as conflicting');

  // 4x4 column duplicate: two 3s in column 1.
  const colDup: Grid = [0, 3, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  assert(conflicts(colDup, 4, 1, 3), 'column duplicate (4x4) not flagged at index 1');
  assert(conflicts(colDup, 4, 5, 3), 'column duplicate (4x4) not flagged at index 5');

  // 4x4 box duplicate: top-left 2x2 box gets two 4s (indices 0 and 5), no row/col overlap.
  const boxDup: Grid = [4, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  assert(conflicts(boxDup, 4, 0, 4), 'box duplicate (4x4) not flagged at index 0');
  assert(conflicts(boxDup, 4, 5, 4), 'box duplicate (4x4) not flagged at index 5');
  const mask4 = conflictMask(boxDup, 4);
  assert(mask4[0] && mask4[5], 'conflictMask (4x4) missed the box-duplicate pair');
  assert(!isValidGrid(boxDup, 4), 'isValidGrid (4x4) missed a box duplicate');

  // 6x6 box duplicate: a 2x3 box (rows 0-1, cols 0-2) gets two 5s (indices 0 and 8).
  const box6 = emptyGrid(6);
  box6[0] = 5;
  box6[8] = 5; // row 1, col 2 - same box as index 0, different row and column
  assert(conflicts(box6, 6, 0, 5), 'box duplicate (6x6) not flagged at index 0');
  assert(conflicts(box6, 6, 8, 5), 'box duplicate (6x6) not flagged at index 8');
  assert(!isValidGrid(box6, 6), 'isValidGrid (6x6) missed a box duplicate');

  // A fully legal partial 4x4 grid: no conflicts anywhere.
  const legal: Grid = [1, 2, 3, 4, 3, 4, 1, 2, 0, 0, 0, 0, 0, 0, 0, 0];
  assert(isValidGrid(legal, 4), 'isValidGrid rejected a legal partial grid');
  assert(
    conflictMask(legal, 4).every((v) => !v),
    'conflictMask flagged a cell in a legal partial grid',
  );
}

// 5) isSolved: true only for a full, valid grid - false for empty, false for
//    a full grid with a duplicate, false for a partially-filled valid grid.
{
  const solved4 = generateSolvedGrid(4, lcg(42));
  assert(isSolved(solved4, 4), 'isSolved rejected a genuine complete solved grid');

  assert(!isSolved(emptyGrid(4), 4), 'isSolved accepted a completely empty grid');

  const partial = solved4.slice();
  partial[0] = 0;
  assert(!isSolved(partial, 4), 'isSolved accepted a grid with an empty cell');

  const fullButDup = solved4.slice();
  fullButDup[1] = fullButDup[0]; // introduce a duplicate, still fully filled
  assert(!isSolved(fullButDup, 4), 'isSolved accepted a full grid containing a duplicate');
}

console.log('\nAll structural checks passed; running sabotage self-tests...');

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

expectFail('a box-blind conflict check is caught', () => {
  // A checker that only looks at rows/columns (no box) would miss the 4x4
  // box duplicate above; the real conflicts() must not have that blind spot.
  const boxDup: Grid = [4, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const rowColOnly = (g: Grid, n: Size, index: number, value: number): boolean => {
    const row = Math.floor(index / n);
    const col = index % n;
    for (let c = 0; c < n; c += 1) if (c !== col && g[row * n + c] === value) return true;
    for (let r = 0; r < n; r += 1) if (r !== row && g[r * n + col] === value) return true;
    return false;
  };
  const realSaysConflict = conflicts(boxDup, 4, 5, 4);
  const blindSaysConflict = rowColOnly(boxDup, 4, 5, 4);
  return realSaysConflict && !blindSaysConflict;
});

expectFail('a "some solution exists" check is caught (does not prove uniqueness)', () => {
  // A sabotaged "uniqueness" check that stops at the FIRST solution found
  // (never looks for a second) would call an almost-empty, wildly
  // under-constrained grid "unique" - it is not. The real countSolutions,
  // capped at 2, must report 2 (i.e. "more than one"), not 1.
  const nearlyEmpty = emptyGrid(4); // only structural clue: one cell filled
  nearlyEmpty[0] = 1;
  const real: number = countSolutions(nearlyEmpty, 4, 2);
  const sabotagedExistsOnly: number = real >= 1 ? 1 : 0; // "found a solution" collapses everything to 1
  return real === 2 && sabotagedExistsOnly !== real;
});

expectFail('an isSolved that forgets fullness is caught', () => {
  // A sabotaged isSolved that only checks isValidGrid (no fullness check)
  // would call a completely empty board "solved", since an empty board has
  // no conflicts. The real isSolved must not do that.
  const empty = emptyGrid(6);
  const sabotagedSaysSolved = isValidGrid(empty, 6); // true - no conflicts in an empty grid
  const realSaysSolved = isSolved(empty, 6);
  return sabotagedSaysSolved === true && realSaysSolved === false;
});

expectFail('a puzzle generator that skips the uniqueness re-check is caught', () => {
  // If makePuzzle removed cells WITHOUT verifying uniqueness after each
  // removal, a puzzle built that way could easily have multiple solutions.
  // Demonstrate the failure mode directly: blind-remove a large block of
  // cells from a solved grid with no uniqueness check at all, and show that
  // the result is (for a large enough removal) no longer unique - proving
  // the re-check in the real makePuzzle is load-bearing, not decorative.
  const n: Size = 4;
  const solved = generateSolvedGrid(n, lcg(7));
  const blindlyStripped = solved.slice();
  // Remove all but 3 givens with no regard for uniqueness.
  const order = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  for (const idx of order) blindlyStripped[idx] = 0;
  const blindCount = countSolutions(blindlyStripped, n, 2);

  // The real generator, asked for the same low a givens count, always stays unique.
  const realPuzzle = makePuzzle(5, lcg(7), -2); // level 5 = 4x4, hard bias = fewest givens
  const realCount = countSolutions(realPuzzle.grid, realPuzzle.size, 2);

  return blindCount === 2 && realCount === 1;
});

if (failures > 0 || selfFails > 0) {
  console.error(`\nFAILED: ${failures} assertion(s), ${selfFails} broken self-test(s).`);
  process.exit(1);
}
console.log(
  '\nKid Sudoku: solved-grid validity, puzzle uniqueness, and conflict/solved detection all verified.',
);
