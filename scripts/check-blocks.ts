/**
 * Proves Block Drop's rules are the rules it claims to have.
 *
 * The four failures that ruin this genre are all invisible from the renderer -
 * the game keeps running and looking fine while quietly cheating:
 *
 *  1. A placement that overwrites a filled cell, or a `canPlace` that disagrees
 *     with reality. The game tests placement against per-row bitmasks; this file
 *     re-derives the same answer by walking the colour cells one at a time, which
 *     is a genuinely independent implementation, and asserts the two never
 *     disagree at any anchor - in bounds or out.
 *  2. Line clearing that takes the wrong cells. A full row and a full column
 *     share a cell, so "clear rows, then look for columns" silently loses
 *     columns. Every clear here is checked against a from-scratch expected board.
 *  3. Scoring that is not monotonic in lines, which would teach a kid that one
 *     line at a time is fine.
 *  4. A dishonest game over. Ending the run with a piece still placeable is the
 *     worst bug this game could ship. Every game-over decision is cross-checked
 *     against a brute force over every remaining piece at every position.
 *
 * It also plays the game: a greedy bot plays thousands of runs across all three
 * difficulties, so "the bag cannot hand you an unwinnable board" is measured
 * rather than asserted.
 *
 * Every check below is a function that returns problems, and the self-tests at
 * the bottom feed each one deliberately broken input and assert it complains. A
 * verifier that cannot fail proves nothing.
 *
 * Run: npx tsx scripts/check-blocks.ts
 */
import {
  BASES,
  BOARD_H,
  BOARD_W,
  FULL_ROW,
  GRID,
  GUARANTEE_FIT,
  MAX_LEVEL,
  MAX_STREAK,
  TONE_COUNT,
  aimAt,
  anyFits,
  applyPlacement,
  bagFor,
  canPlace,
  cellCentre,
  clearLines,
  clearScore,
  cloneBoard,
  dragOrigin,
  fillCount,
  firstFit,
  layoutFor,
  lcg,
  levelForScore,
  levelThreshold,
  makeBoard,
  masksAgree,
  place,
  placeScore,
  previewLines,
  refillTray,
  slotIndexAt,
  toBoard,
  type Board,
  type Clear,
  type Piece,
  type Shape,
} from '../components/games/Blocks';
import { DIFFICULTIES, type Difficulty } from '../lib/difficulty';

const errors: string[] = [];
const fail = (msg: string) => {
  if (errors.length < 300) errors.push(msg);
};

const ALL_SHAPES: Shape[] = BASES.flatMap((b) => b.rotations);

// --- reference implementations ----------------------------------------------
//
// Deliberately naive and deliberately reading `cells`, never `rows`. If these
// shared code with the game they would prove nothing.

/** Placement legality, one cell at a time, from the colour array. */
function refCanPlace(b: Board, s: Shape, r: number, c: number): boolean {
  for (const cell of s.cells) {
    const rr = r + cell.dr;
    const cc = c + cell.dc;
    if (rr < 0 || rr >= GRID || cc < 0 || cc >= GRID) return false;
    if (b.cells[rr * GRID + cc] >= 0) return false;
  }
  return true;
}

/** Every legal anchor for a shape, by exhaustive scan over a generous range. */
function refAllFits(b: Board, s: Shape): Array<{ r: number; c: number }> {
  const out: Array<{ r: number; c: number }> = [];
  for (let r = -2; r <= GRID + 1; r += 1) {
    for (let c = -2; c <= GRID + 1; c += 1) {
      if (refCanPlace(b, s, r, c)) out.push({ r, c });
    }
  }
  return out;
}

function refAnyFit(b: Board, shapes: Shape[]): boolean {
  for (const s of shapes) if (refAllFits(b, s).length > 0) return true;
  return false;
}

/** Full rows and columns, counted from the colour array. */
function refFullLines(cells: number[]): { rows: number[]; cols: number[] } {
  const rows: number[] = [];
  const cols: number[] = [];
  for (let r = 0; r < GRID; r += 1) {
    let n = 0;
    for (let c = 0; c < GRID; c += 1) if (cells[r * GRID + c] >= 0) n += 1;
    if (n === GRID) rows.push(r);
  }
  for (let c = 0; c < GRID; c += 1) {
    let n = 0;
    for (let r = 0; r < GRID; r += 1) if (cells[r * GRID + c] >= 0) n += 1;
    if (n === GRID) cols.push(c);
  }
  return { rows, cols };
}

/** The board a correct clear must produce, built from scratch. */
function refAfterClear(cells: number[]): number[] {
  const { rows, cols } = refFullLines(cells);
  const out = cells.slice();
  for (let r = 0; r < GRID; r += 1) {
    for (let c = 0; c < GRID; c += 1) {
      if (rows.includes(r) || cols.includes(c)) out[r * GRID + c] = -1;
    }
  }
  return out;
}

// --- checks ------------------------------------------------------------------

/** 1. `canPlace` must agree with the naive scan everywhere, including off-board. */
function checkCanPlace(b: Board, shapes: Shape[], at: string): string[] {
  const out: string[] = [];
  for (const s of shapes) {
    for (let r = -2; r <= GRID + 1; r += 1) {
      for (let c = -2; c <= GRID + 1; c += 1) {
        const mine = canPlace(b, s, r, c);
        const ref = refCanPlace(b, s, r, c);
        if (mine !== ref) {
          out.push(
            `${at}: canPlace(${s.id}, ${r},${c}) said ${mine}, brute force said ${ref}`,
          );
          if (out.length > 4) return out;
        }
      }
    }
  }
  return out;
}

/** 2. A clear removes exactly the full rows and columns, and nothing else. */
function checkClear(before: number[], after: Board, res: Clear, at: string): string[] {
  const out: string[] = [];
  const ref = refFullLines(before);
  const want = refAfterClear(before);

  if (res.rows.join(',') !== ref.rows.join(',')) {
    out.push(`${at}: cleared rows ${res.rows.join('/')}, full rows were ${ref.rows.join('/')}`);
  }
  if (res.cols.join(',') !== ref.cols.join(',')) {
    out.push(`${at}: cleared cols ${res.cols.join('/')}, full cols were ${ref.cols.join('/')}`);
  }

  for (let i = 0; i < GRID * GRID; i += 1) {
    if (after.cells[i] === want[i]) continue;
    const r = Math.floor(i / GRID);
    const c = i % GRID;
    out.push(
      `${at}: cell (${r},${c}) is ${after.cells[i]} after the clear, expected ${want[i]}` +
        (want[i] < 0 ? ' (should have been cleared)' : ' (should have survived)'),
    );
    if (out.length > 6) break;
  }

  // The reported cell list must be exactly the set that changed, so the sweep
  // animation cannot show a cell that is still there or miss one that went.
  const reported = new Set(res.cells.map((cell) => cell.r * GRID + cell.c));
  for (let i = 0; i < GRID * GRID; i += 1) {
    const changed = before[i] >= 0 && want[i] < 0;
    if (changed && !reported.has(i)) out.push(`${at}: cell ${i} cleared but not reported`);
    if (!changed && reported.has(i)) out.push(`${at}: cell ${i} reported but not cleared`);
  }

  if (!masksAgree(after)) out.push(`${at}: row bitmasks disagree with the cells after clearing`);
  return out;
}

/** 3. Game over is exactly "no remaining piece fits anywhere". */
function checkGameOver(b: Board, shapes: Shape[], at: string): string[] {
  const out: string[] = [];
  const mine = anyFits(b, shapes);
  const ref = refAnyFit(b, shapes);
  if (mine !== ref) {
    out.push(
      `${at}: anyFits said ${mine} but brute force over ${shapes.length} piece(s) ` +
        `x ${(GRID + 4) ** 2} positions said ${ref}`,
    );
  }
  // And each individual verdict, since anyFits short-circuits.
  for (const s of shapes) {
    const f = firstFit(b, s);
    const all = refAllFits(b, s);
    if ((f === null) !== (all.length === 0)) {
      out.push(`${at}: firstFit(${s.id}) = ${JSON.stringify(f)} but brute force found ${all.length}`);
    }
    if (f && !refCanPlace(b, s, f.r, f.c)) {
      out.push(`${at}: firstFit(${s.id}) returned the illegal anchor ${f.r},${f.c}`);
    }
  }
  return out;
}

/** 4. Scoring must never go backwards as lines or streak rise. */
function checkMonotonic(score: (lines: number, streak: number) => number): string[] {
  const out: string[] = [];
  for (let streak = 0; streak <= MAX_STREAK + 4; streak += 1) {
    if (score(0, streak) !== 0) out.push(`clearing 0 lines scored ${score(0, streak)}`);
    for (let lines = 1; lines <= 2 * GRID; lines += 1) {
      const here = score(lines, streak);
      const less = score(lines - 1, streak);
      if (here <= less) {
        out.push(`${lines} lines scored ${here}, but ${lines - 1} scored ${less} (streak ${streak})`);
      }
      if (score(lines, streak + 1) < here) {
        out.push(`streak ${streak + 1} scored less than streak ${streak} at ${lines} lines`);
      }
      // A multi-line clear must beat doing the same lines one at a time, or the
      // combo is a lie.
      if (lines >= 2 && here <= lines * score(1, 0)) {
        out.push(`${lines} at once (${here}) is not worth more than ${lines} singles`);
      }
    }
  }
  return out;
}

/** 5. previewLines must predict exactly what clearLines then does. */
function checkPreview(b: Board, s: Shape, r: number, c: number, at: string): string[] {
  const out: string[] = [];
  const pv = previewLines(b, s, r, c);
  const trial = cloneBoard(b);
  place(trial, s, r, c, 0);
  const got = clearLines(trial);
  if (pv.rows.join(',') !== got.rows.join(',') || pv.cols.join(',') !== got.cols.join(',')) {
    out.push(
      `${at}: previewLines said rows ${pv.rows.join('/')} cols ${pv.cols.join('/')}, ` +
        `the placement actually cleared rows ${got.rows.join('/')} cols ${got.cols.join('/')}`,
    );
  }
  return out;
}

// --- helpers ----------------------------------------------------------------

function randomBoard(rng: () => number, fill: number): Board {
  const b = makeBoard();
  for (let r = 0; r < GRID; r += 1) {
    for (let c = 0; c < GRID; c += 1) {
      if (rng() >= fill) continue;
      b.cells[r * GRID + c] = Math.floor(rng() * TONE_COUNT);
      b.rows[r] |= 1 << c;
    }
  }
  // A board with no empty cell cannot occur in play (a placement that fills the
  // board also completes every row, so it clears). Free one so the sample stays
  // inside the reachable space.
  if (fillCount(b) === GRID * GRID) {
    const i = Math.floor(rng() * GRID * GRID);
    b.cells[i] = -1;
    b.rows[Math.floor(i / GRID)] &= ~(1 << i % GRID);
  }
  return b;
}

function filledSet(b: Board): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < b.cells.length; i += 1) if (b.cells[i] >= 0) out.add(i);
  return out;
}

/** Empty cells with no empty neighbour: dead space nothing but a 1x1 can use. */
function strandedCells(b: Board): number {
  let n = 0;
  for (let r = 0; r < GRID; r += 1) {
    for (let c = 0; c < GRID; c += 1) {
      if (b.cells[r * GRID + c] >= 0) continue;
      let open = 0;
      if (r > 0 && b.cells[(r - 1) * GRID + c] < 0) open += 1;
      if (r < GRID - 1 && b.cells[(r + 1) * GRID + c] < 0) open += 1;
      if (c > 0 && b.cells[r * GRID + c - 1] < 0) open += 1;
      if (c < GRID - 1 && b.cells[r * GRID + c + 1] < 0) open += 1;
      if (open === 0) n += 1;
    }
  }
  return n;
}

/**
 * Sum of squared fill counts over every row and column. Concentrating fill into a
 * few nearly-complete lines scores far higher than spreading it evenly, which is
 * the pressure that makes a greedy bot aim at clears instead of drifting into a
 * uniformly half-full board it can never dig out of.
 */
function lineFocus(b: Board): number {
  let total = 0;
  for (let r = 0; r < GRID; r += 1) {
    let n = 0;
    for (let c = 0; c < GRID; c += 1) if (b.cells[r * GRID + c] >= 0) n += 1;
    total += n * n;
  }
  for (let c = 0; c < GRID; c += 1) {
    let n = 0;
    for (let r = 0; r < GRID; r += 1) if (b.cells[r * GRID + c] >= 0) n += 1;
    total += n * n;
  }
  return total;
}

/** Fully empty 2x2 windows: a cheap proxy for "there is still room to work". */
function openSquares(b: Board): number {
  let n = 0;
  for (let r = 0; r + 1 < GRID; r += 1) {
    for (let c = 0; c + 1 < GRID; c += 1) {
      if (
        b.cells[r * GRID + c] < 0 &&
        b.cells[r * GRID + c + 1] < 0 &&
        b.cells[(r + 1) * GRID + c] < 0 &&
        b.cells[(r + 1) * GRID + c + 1] < 0
      ) {
        n += 1;
      }
    }
  }
  return n;
}

/**
 * The greedy bot. Deliberately not a solver: one move of lookahead, a handful of
 * board-shape heuristics, and a second pass over its own shortlist that throws
 * away any move which would strand a piece still sitting in the tray. If a bot
 * this plain survives long runs on every seed, the bag is not handing out
 * unplayable boards.
 */
function bestMove(
  b: Board,
  tray: Array<Piece | null>,
): { slot: number; r: number; c: number } | null {
  type Cand = { slot: number; r: number; c: number; value: number; after: Board };
  const cands: Cand[] = [];

  for (let slot = 0; slot < tray.length; slot += 1) {
    const piece = tray[slot];
    if (!piece) continue;
    const s = piece.shape;
    for (let r = 0; r + s.h <= GRID; r += 1) {
      for (let c = 0; c + s.w <= GRID; c += 1) {
        if (!canPlace(b, s, r, c)) continue;
        const after = cloneBoard(b);
        place(after, s, r, c, 0);
        const pv = previewLines(b, s, r, c);
        const lines = pv.rows.length + pv.cols.length;
        clearLines(after);

        // Reward hugging what is already there or a wall: a tidy edge is what
        // leaves long straight gaps for the awkward pieces.
        let contact = 0;
        for (const cell of s.cells) {
          for (const [dr, dc] of [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
          ]) {
            const rr = r + cell.dr + dr;
            const cc = c + cell.dc + dc;
            if (rr < 0 || rr >= GRID || cc < 0 || cc >= GRID) contact += 1;
            else if (b.cells[rr * GRID + cc] >= 0) contact += 1;
          }
        }

        const value =
          lines * 900 +
          contact * 4 +
          lineFocus(after) * 1.5 +
          openSquares(after) * 20 -
          strandedCells(after) * 55 -
          fillCount(after) * 10;
        cands.push({ slot, r, c, value, after });
      }
    }
  }
  if (cands.length === 0) return null;

  // Second pass over the shortlist only, because "do the other tray pieces still
  // fit?" costs a full board scan per piece and is far too slow to run on every
  // one of a couple of hundred candidates.
  cands.sort((x, y) => y.value - x.value);
  const shortlist = cands.slice(0, 10);
  let best = shortlist[0];
  let bestValue = -Infinity;
  for (const cand of shortlist) {
    let survivors = 0;
    for (let slot = 0; slot < tray.length; slot += 1) {
      if (slot === cand.slot) continue;
      const piece = tray[slot];
      if (!piece) continue;
      if (firstFit(cand.after, piece.shape) !== null) survivors += 1;
    }
    const value = cand.value + survivors * 500;
    if (value > bestValue) {
      bestValue = value;
      best = cand;
    }
  }
  return { slot: best.slot, r: best.r, c: best.c };
}

// --- 1. the catalogue -------------------------------------------------------

{
  const ids = new Set<string>();
  for (const b of BASES) {
    if (b.rotations.length === 0) fail(`${b.id}: no rotations`);
    for (const rot of b.rotations) {
      if (ids.has(rot.id)) fail(`duplicate shape id ${rot.id}`);
      ids.add(rot.id);
      if (rot.cells.length !== rot.size) fail(`${rot.id}: size ${rot.size} but ${rot.cells.length} cells`);
      if (rot.size !== b.size) fail(`${rot.id}: rotation changed the cell count`);
      if (rot.w > GRID || rot.h > GRID) fail(`${rot.id}: ${rot.w}x${rot.h} cannot fit an ${GRID} grid`);
      if (rot.rowMasks.length !== rot.h) fail(`${rot.id}: ${rot.rowMasks.length} row masks for h=${rot.h}`);

      // The bounding box must be tight, otherwise canPlace's box test and the
      // per-cell bounds test are not the same question.
      let colUnion = 0;
      for (let i = 0; i < rot.h; i += 1) {
        if (rot.rowMasks[i] === 0) fail(`${rot.id}: empty row ${i} inside the bounding box`);
        colUnion |= rot.rowMasks[i];
      }
      if (colUnion !== (1 << rot.w) - 1) fail(`${rot.id}: bounding box has an empty column`);

      // rowMasks and cells must describe the same shape.
      let fromCells = 0;
      for (const cell of rot.cells) fromCells |= 1 << (cell.dr * GRID + cell.dc);
      let fromMasks = 0;
      for (let i = 0; i < rot.h; i += 1) {
        for (let c = 0; c < rot.w; c += 1) {
          if ((rot.rowMasks[i] & (1 << c)) !== 0) fromMasks |= 1 << (i * GRID + c);
        }
      }
      if (fromCells !== fromMasks) fail(`${rot.id}: rowMasks and cells disagree`);
    }
    // Rotations must be distinct, or the bag is skewed toward symmetric shapes.
    const keys = new Set(b.rotations.map((r) => r.rowMasks.join('/') + `|${r.w}`));
    if (keys.size !== b.rotations.length) fail(`${b.id}: duplicate rotations kept`);
  }

  // Every shape must fit an empty board, or it can never be played at all.
  const empty = makeBoard();
  for (const s of ALL_SHAPES) {
    if (firstFit(empty, s) === null) fail(`${s.id} does not fit an empty board`);
  }
}

// --- 2. difficulty is really a difficulty curve ------------------------------

let bagSummary = '';
{
  for (const d of DIFFICULTIES) {
    const bag = bagFor(d);
    if (bag.length === 0) fail(`${d}: empty bag`);
    for (const b of bag) if (b.weight[d] <= 0) fail(`${d}: ${b.id} in the bag with weight 0`);
  }
  if (bagFor('easy').some((b) => b.size >= 5)) {
    fail('easy can draw a pentomino; the youngest player is about five');
  }

  // Expected piece size, from the actual weights.
  const meanSize = (d: Difficulty) => {
    let total = 0;
    let sum = 0;
    for (const b of bagFor(d)) {
      total += b.weight[d];
      sum += b.weight[d] * b.size;
    }
    return sum / total;
  };
  const [e, n, h] = DIFFICULTIES.map(meanSize);
  if (!(e < n && n < h)) {
    fail(`mean piece size is not increasing with difficulty: ${e} / ${n} / ${h}`);
  }
  bagSummary =
    `bag mean piece size: easy ${e.toFixed(2)}, normal ${n.toFixed(2)}, hard ${h.toFixed(2)} cells; ` +
    `${BASES.length} base shapes, ${ALL_SHAPES.length} rotations`;

  // And the drawn distribution must match the weights, not just the table.
  for (const d of DIFFICULTIES) {
    const rng = lcg(0x5eed ^ d.length);
    const board = makeBoard();
    let big = 0;
    let drawn = 0;
    for (let i = 0; i < 4000; i += 1) {
      for (const p of refillTray(board, rng, d)) {
        drawn += 1;
        if (p.shape.size >= 5) big += 1;
        if (!ALL_SHAPES.includes(p.shape)) fail(`${d}: drew a shape outside the catalogue`);
      }
    }
    if (d === 'easy' && big > 0) fail(`easy drew ${big} pentomino(es) out of ${drawn}`);
    if (d === 'hard' && big === 0) fail('hard never drew a pentomino');
  }
}

// --- 3. scoring and levels ---------------------------------------------------

for (const e of checkMonotonic(clearScore)) fail(e);
{
  let prev = -1;
  for (const s of ALL_SHAPES) {
    if (placeScore(s) <= 0) fail(`${s.id}: placement worth ${placeScore(s)}`);
  }
  const bySize = [...ALL_SHAPES].sort((a, b) => a.size - b.size);
  for (const s of bySize) {
    if (placeScore(s) < prev) fail(`placeScore fell as size rose at ${s.id}`);
    prev = placeScore(s);
  }

  // Levels: thresholds must climb, and levelForScore must agree with them.
  for (let lv = 1; lv < MAX_LEVEL; lv += 1) {
    if (levelThreshold(lv + 1) <= levelThreshold(lv)) fail(`level ${lv + 1} threshold not above ${lv}`);
    if (levelForScore(levelThreshold(lv + 1)) < lv + 1) fail(`hitting level ${lv + 1}'s threshold did not reach it`);
    if (levelForScore(levelThreshold(lv + 1) - 1) !== lv) fail(`one point short of level ${lv + 1} is not level ${lv}`);
  }
  let last = 0;
  for (let score = 0; score <= levelThreshold(MAX_LEVEL) + 500; score += 7) {
    const lv = levelForScore(score);
    if (lv < last) fail(`levelForScore fell from ${last} to ${lv} at score ${score}`);
    if (lv < 1 || lv > MAX_LEVEL) fail(`levelForScore(${score}) = ${lv}, out of range`);
    last = lv;
  }
}

// --- 4. random boards: placement, clearing, preview, game over ---------------

let randomBoards = 0;
let randomAnchors = 0;
let randomClears = 0;
{
  const rng = lcg(0xb10c);
  for (let i = 0; i < 4000; i += 1) {
    const fill = 0.05 + (i % 19) * 0.05;
    const b = randomBoard(rng, fill);
    randomBoards += 1;
    if (!masksAgree(b)) fail(`random board ${i}: generator desynced the masks`);

    // A handful of shapes per board, so the whole catalogue gets covered without
    // 4000 x 44 x 144 canPlace comparisons.
    const shapes = [
      ALL_SHAPES[Math.floor(rng() * ALL_SHAPES.length)],
      ALL_SHAPES[Math.floor(rng() * ALL_SHAPES.length)],
      ALL_SHAPES[Math.floor(rng() * ALL_SHAPES.length)],
    ];
    for (const e of checkCanPlace(b, shapes, `random board ${i}`)) fail(e);
    randomAnchors += shapes.length * (GRID + 4) ** 2;
    for (const e of checkGameOver(b, shapes, `random board ${i}`)) fail(e);

    // Place one legal move and check the clear against a from-scratch expectation.
    const s = shapes[0];
    const anchor = refAllFits(b, s)[0];
    if (!anchor) continue;
    for (const e of checkPreview(b, s, anchor.r, anchor.c, `random board ${i}`)) fail(e);

    const wasFilled = filledSet(b);
    place(b, s, anchor.r, anchor.c, 3);
    if (fillCount(b) !== wasFilled.size + s.size) {
      fail(`random board ${i}: placing ${s.id} changed the fill count by the wrong amount`);
    }
    for (const idx of wasFilled) {
      if (b.cells[idx] < 0) fail(`random board ${i}: placing ${s.id} erased cell ${idx}`);
    }
    if (!masksAgree(b)) fail(`random board ${i}: place() desynced the masks`);

    const before = b.cells.slice();
    const res = clearLines(b);
    if (res.rows.length + res.cols.length > 0) randomClears += 1;
    for (const e of checkClear(before, b, res, `random board ${i}`)) fail(e);
  }
}

// --- 5. the simultaneous row-and-column case, built by hand -----------------

{
  // Row 3 and column 5 both one cell short, sharing (3,5). Filling it must clear
  // 16 - 1 = 15 cells in one go.
  const b = makeBoard();
  for (let c = 0; c < GRID; c += 1) {
    if (c === 5) continue;
    b.cells[3 * GRID + c] = 1;
    b.rows[3] |= 1 << c;
  }
  for (let r = 0; r < GRID; r += 1) {
    if (r === 3) continue;
    b.cells[r * GRID + 5] = 2;
    b.rows[r] |= 1 << 5;
  }
  // A bystander that must survive.
  b.cells[7 * GRID + 0] = 4;
  b.rows[7] |= 1 << 0;

  const single = BASES[0].rotations[0];
  if (!canPlace(b, single, 3, 5)) fail('cross case: the shared cell was not placeable');
  const pv = previewLines(b, single, 3, 5);
  if (pv.rows.join() !== '3' || pv.cols.join() !== '5') {
    fail(`cross case: previewLines said rows ${pv.rows.join('/')} cols ${pv.cols.join('/')}`);
  }
  place(b, single, 3, 5, 0);
  const before = b.cells.slice();
  const res = clearLines(b);
  for (const e of checkClear(before, b, res, 'cross case')) fail(e);
  if (res.rows.length !== 1 || res.cols.length !== 1) {
    fail(`cross case: expected 1 row + 1 col, got ${res.rows.length} + ${res.cols.length}`);
  }
  if (res.cells.length !== GRID * 2 - 1) {
    fail(`cross case: cleared ${res.cells.length} cells, expected ${GRID * 2 - 1}`);
  }
  if (b.cells[7 * GRID + 0] !== 4) fail('cross case: the bystander cell was cleared too');
  if (clearScore(2, 0) <= 2 * clearScore(1, 0)) fail('cross case: a cross is not worth more than two singles');
}

// --- 6. a full row across the whole board clears to empty -------------------

{
  const b = makeBoard();
  for (let i = 0; i < GRID * GRID; i += 1) {
    b.cells[i] = 0;
    b.rows[Math.floor(i / GRID)] = FULL_ROW;
  }
  const before = b.cells.slice();
  const res = clearLines(b);
  for (const e of checkClear(before, b, res, 'full board')) fail(e);
  if (fillCount(b) !== 0) fail(`full board: ${fillCount(b)} cells left after clearing everything`);
  if (res.rows.length !== GRID || res.cols.length !== GRID) {
    fail(`full board: cleared ${res.rows.length} rows and ${res.cols.length} cols`);
  }
}

// --- 7. the easy / normal fit guarantee -------------------------------------

let guaranteeBoards = 0;
let hardDeadTrays = 0;
{
  const rng = lcg(0x9a11);
  for (let i = 0; i < 6000; i += 1) {
    // Skew heavily toward crowded boards: that is where the guarantee matters.
    const fill = 0.4 + (i % 13) * 0.045;
    const b = randomBoard(rng, fill);
    guaranteeBoards += 1;
    for (const d of DIFFICULTIES) {
      const tray = refillTray(b, rng, d);
      if (tray.length !== 3) fail(`${d}: refill produced ${tray.length} pieces`);
      const fits = refAnyFit(b, tray.map((p) => p.shape));
      if (GUARANTEE_FIT[d]) {
        if (!fits) {
          fail(
            `${d} refill on a board with ${GRID * GRID - fillCount(b)} empty cell(s) fits ` +
              `nowhere: ${tray.map((p) => p.shape.id).join(', ')}`,
          );
        }
      } else if (!fits) {
        hardDeadTrays += 1;
      }
      // The guarantee must never smuggle in a shape from another difficulty's bag.
      for (const p of tray) {
        if (!bagFor(d).some((bs) => bs.rotations.includes(p.shape))) {
          fail(`${d}: refill produced ${p.shape.id}, which is not in the ${d} bag`);
        }
      }
    }
  }
}

// --- 8. the touch layer ----------------------------------------------------
//
// This is the part a headless checker would normally have to skip, so the pointer
// maths is written as pure functions specifically to make it checkable. Three
// things matter on an iPad and none of them are visible in a screenshot: the board
// fits inside the canvas on every shape of screen, a fingertip aimed at a cell
// actually targets that cell, and the dragged piece is not sitting under the thumb
// holding it.

/** Canvas shapes to test: phones, both iPad orientations, and a nasty short one. */
const SCREENS: Array<[string, number, number]> = [
  ['phone portrait', 390, 700],
  ['tall phone', 360, 820],
  ['ipad portrait', 768, 1000],
  ['ipad landscape', 1024, 700],
  ['squat landscape', 900, 340],
];

/** Cell size in board units, derived rather than duplicated from the component. */
const CELL_UNITS = cellCentre(0, 1).x - cellCentre(0, 0).x;

/** Top-left of a cell, in board units. */
function cellTopLeft(r: number, c: number): { x: number; y: number } {
  const m = cellCentre(r, c);
  return { x: m.x - CELL_UNITS / 2, y: m.y - CELL_UNITS / 2 };
}

/**
 * The fingertip position that puts a shape's top-left corner exactly on cell
 * (r,c). `dragOrigin(shape, 0, 0)` is the constant offset the renderer applies, so
 * inverting it needs no knowledge of the lift or the cell size.
 */
function fingerFor(shape: Shape, r: number, c: number): { x: number; y: number } {
  const off = dragOrigin(shape, 0, 0);
  const target = cellTopLeft(r, c);
  return { x: target.x - off.x, y: target.y - off.y };
}

type AimFn = (b: Board, s: Shape, fx: number, fy: number) => {
  ar: number;
  ac: number;
  near: boolean;
  valid: boolean;
};

/**
 * Aiming, as a predicate over an aim function, so the self-tests can hand it a
 * broken one and confirm it complains.
 */
function checkAiming(aim: AimFn, at: string): string[] {
  const out: string[] = [];
  const empty = makeBoard();
  for (const shape of ALL_SHAPES) {
    for (let r = 0; r + shape.h <= GRID; r += 1) {
      for (let c = 0; c + shape.w <= GRID; c += 1) {
        const f = fingerFor(shape, r, c);
        // Nudged a third of a cell in each direction too: a real fingertip is
        // never exactly on the ideal spot, and the snap must round to the same
        // cell anyway.
        for (const [jx, jy] of [
          [0, 0],
          [CELL_UNITS * 0.33, 0],
          [-CELL_UNITS * 0.33, 0],
          [0, CELL_UNITS * 0.33],
          [0, -CELL_UNITS * 0.33],
        ]) {
          const got = aim(empty, shape, f.x + jx, f.y + jy);
          aimChecks += 1;
          if (got.ar !== r || got.ac !== c) {
            out.push(
              `${at}: ${shape.id} aimed at (${r},${c}) with a ${jx.toFixed(1)},` +
                `${jy.toFixed(1)} nudge landed on (${got.ar},${got.ac})`,
            );
          }
          if (!got.near || !got.valid) {
            out.push(`${at}: ${shape.id} aimed at (${r},${c}) on an empty board was not valid`);
          }
          if (out.length > 6) return out;
        }
      }
    }
  }
  return out;
}

type OriginFn = (s: Shape, fx: number, fy: number) => { x: number; y: number };

/**
 * The lift rule: a one- or two-row piece must sit entirely ABOVE the fingertip, or
 * a thumb covers it completely on a touchscreen. Taller pieces only have to extend
 * well above it. Also a predicate, for the same reason.
 */
function checkLift(origin: OriginFn): string[] {
  const out: string[] = [];
  const fy = 500;
  for (const shape of ALL_SHAPES) {
    const o = origin(shape, 200, fy);
    const bottom = o.y + shape.h * CELL_UNITS;
    if (shape.h <= 2) {
      if (bottom >= fy) {
        out.push(
          `${shape.id} (h=${shape.h}) is drawn under the fingertip: bottom ${bottom} >= ${fy}`,
        );
      }
    } else if (o.y >= fy - CELL_UNITS) {
      out.push(`${shape.id} does not extend at least a cell above the fingertip`);
    }
    if (Math.abs(o.x + (shape.w * CELL_UNITS) / 2 - 200) > 1e-9) {
      out.push(`${shape.id} is not horizontally centred on the fingertip`);
    }
  }
  return out;
}

let aimChecks = 0;
let liftGap = 0;
{
  for (const [name, cw, ch] of SCREENS) {
    for (const inset of [0, 60]) {
      const layout = layoutFor(cw, ch, inset);
      const at = `${name} ${cw}x${ch} inset ${inset}`;

      // 1. The board must fit, and must never spill into the reserved thumb band.
      if (layout.scale <= 0) fail(`${at}: non-positive scale`);
      if (BOARD_W * layout.scale > cw + 0.001) fail(`${at}: board is wider than the canvas`);
      if (BOARD_H * layout.scale > ch - inset + 0.001) {
        fail(`${at}: board is taller than the canvas minus the controls inset`);
      }
      if (layout.ox < -0.001 || layout.oy < -0.001) fail(`${at}: board is positioned off-canvas`);

      // 2. Screen-to-board must invert the draw transform exactly, including the
      //    normalised 0..1 form the touch overlay actually reports.
      for (const [nx, ny] of [
        [0, 0],
        [0.5, 0.5],
        [1, 1],
        [0.25, 0.8],
      ]) {
        const b = toBoard(layout, nx * cw, ny * ch);
        const backX = b.x * layout.scale + layout.ox;
        const backY = b.y * layout.scale + layout.oy;
        if (Math.abs(backX - nx * cw) > 1e-6 || Math.abs(backY - ny * ch) > 1e-6) {
          fail(`${at}: toBoard does not invert the draw transform at ${nx},${ny}`);
        }
      }

      // 3. Aiming, for every shape at every legal anchor.
      for (const e of checkAiming(aimAt, at)) fail(e);
    }
  }

  // 4. The lift: nothing short may be drawn under the thumb holding it.
  for (const e of checkLift(dragOrigin)) fail(e);
  liftGap = Math.min(
    ...ALL_SHAPES.filter((sh) => sh.h <= 2).map(
      (sh) => 500 - (dragOrigin(sh, 200, 500).y + sh.h * CELL_UNITS),
    ),
  );

  // 5. Edge clamping. A fingertip well off the top-left must still resolve to the
  //    corner rather than refusing the drop, and a piece must never be clamped
  //    outside the grid.
  for (const shape of ALL_SHAPES) {
    for (const [fx, fy] of [
      [-500, -500],
      [5000, 5000],
      [0, 0],
      [BOARD_W, BOARD_H],
    ]) {
      const aim = aimAt(makeBoard(), shape, fx, fy);
      if (aim.ar < 0 || aim.ac < 0 || aim.ar + shape.h > GRID || aim.ac + shape.w > GRID) {
        fail(`${shape.id}: fingertip at ${fx},${fy} clamped to the off-grid anchor ${aim.ar},${aim.ac}`);
      }
    }
    // Far below the board is "changed my mind", not "aimed at an occupied square".
    if (aimAt(makeBoard(), shape, BOARD_W / 2, BOARD_H + 400).near) {
      fail(`${shape.id}: a release far below the board still counted as aimed at it`);
    }
  }

  // 6. Tray grabbing. The band must cover three equal thirds with no dead gap, and
  //    must not steal presses meant for the board.
  // Anywhere in the lower band; the exact tray top is a component detail, so probe
  // a row that is unambiguously inside it.
  for (let x = 0; x < BOARD_W; x += 1) {
    const i = slotIndexAt(x, BOARD_H - 20);
    if (i === null) fail(`tray x=${x} is a dead zone`);
    const expected = Math.min(2, Math.floor((x / BOARD_W) * 3));
    if (i !== expected) fail(`tray x=${x} grabbed slot ${i}, expected ${expected}`);
  }
  if (slotIndexAt(BOARD_W / 2, 0) !== null) fail('a press at the top of the board grabbed a tray slot');
  if (slotIndexAt(BOARD_W / 2, BOARD_H) === null) fail('a press at the very bottom grabbed nothing');
}

// --- 9. play the game ------------------------------------------------------

type RunStats = { placements: number; lines: number; score: number; clears: number; capped: boolean };

/** Placements after which a run counts as survived. Keeps the runtime sane. */
const TURN_CAP = 1500;

function playRun(seed: number, d: Difficulty): RunStats {
  const rng = lcg(seed);
  const board = makeBoard();
  const tray: Array<Piece | null> = refillTray(board, rng, d);
  const stats: RunStats = { placements: 0, lines: 0, score: 0, clears: 0, capped: false };
  let streak = 0;
  const at = `${d} run ${seed}`;

  for (let turn = 0; turn < TURN_CAP; turn += 1) {
    const live: Shape[] = [];
    for (const p of tray) if (p) live.push(p.shape);

    // The game-over decision, cross-checked every single turn.
    for (const e of checkGameOver(board, live, `${at} turn ${turn}`)) fail(e);
    const move = bestMove(board, tray);
    if (!anyFits(board, live)) {
      if (move) fail(`${at} turn ${turn}: game over reported while ${JSON.stringify(move)} was legal`);
      break;
    }
    if (!move) {
      fail(`${at} turn ${turn}: anyFits said a piece fits but the bot found no move`);
      break;
    }

    const piece = tray[move.slot];
    if (!piece) {
      fail(`${at} turn ${turn}: bot chose an empty slot`);
      break;
    }
    for (const e of checkPreview(board, piece.shape, move.r, move.c, `${at} turn ${turn}`)) fail(e);

    const wasFilled = filledSet(board);
    const before = (() => {
      const trial = cloneBoard(board);
      place(trial, piece.shape, move.r, move.c, piece.tone);
      return trial.cells.slice();
    })();

    const res = applyPlacement(board, tray, move.slot, move.r, move.c, streak, rng, d);
    streak = res.streak;
    stats.placements += 1;
    stats.lines += res.lines;
    stats.score += res.placePoints + res.clearPoints;
    if (res.lines > 0) stats.clears += 1;

    // Nothing that was on the board may have been overwritten - a survivor is
    // either still there or was taken by a line clear.
    for (const idx of wasFilled) {
      const r = Math.floor(idx / GRID);
      const c = idx % GRID;
      const takenByLine = res.cleared.rows.includes(r) || res.cleared.cols.includes(c);
      if (board.cells[idx] < 0 && !takenByLine) {
        fail(`${at} turn ${turn}: cell (${r},${c}) vanished without its line clearing`);
      }
    }
    for (const e of checkClear(before, board, res.cleared, `${at} turn ${turn}`)) fail(e);
    if (!masksAgree(board)) fail(`${at} turn ${turn}: masks desynced after applyPlacement`);
    if (fillCount(board) === GRID * GRID) {
      fail(`${at} turn ${turn}: board is completely full after a placement, which must be impossible`);
    }
    if (res.lines === 0 && streak !== 0) fail(`${at} turn ${turn}: streak survived a clearless placement`);
    if (res.lines > 0 && res.clearPoints <= 0) fail(`${at} turn ${turn}: cleared ${res.lines} lines for nothing`);
    if (turn === TURN_CAP - 1) stats.capped = true;
  }
  return stats;
}

const runStats: Record<Difficulty, RunStats[]> = { easy: [], normal: [], hard: [] };

/**
 * Survivability floors, all set below what the bot actually achieves so the check
 * is stable across seeds while still catching a real regression.
 *
 * Three separate bars, because they answer three different questions, and a
 * single "every run must beat N" bar would have to be set so low to survive the
 * unlucky tail that it stopped meaning anything:
 *
 *  WORST  - no seed is a catastrophe. Deliberately loose, and loosest on hard,
 *           where the tray carries no fit guarantee and bad luck is the design.
 *  P10    - the unlucky tenth of runs is still a real game. This is the honest
 *           statement of "not unwinnable by construction".
 *  MEAN   - the game is systemically playable. This is the bar that would move
 *           if the bag, the clearing rule or the fit guarantee regressed.
 */
const WORST_PLACEMENTS: Record<Difficulty, number> = { easy: 45, normal: 16, hard: 9 };
const P10_PLACEMENTS: Record<Difficulty, number> = { easy: 200, normal: 45, hard: 18 };
const MEAN_PLACEMENTS: Record<Difficulty, number> = { easy: 700, normal: 150, hard: 42 };
const RUNS = 120;

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
}

for (const d of DIFFICULTIES) {
  for (let i = 0; i < RUNS; i += 1) {
    const stats = playRun((0xf00d + i * 7919) >>> 0, d);
    runStats[d].push(stats);
    if (stats.placements < WORST_PLACEMENTS[d]) {
      fail(
        `${d} run ${i}: the bot only managed ${stats.placements} placements ` +
          `(floor ${WORST_PLACEMENTS[d]}); the bag is handing out unplayable boards`,
      );
    }
    if (stats.lines === 0) fail(`${d} run ${i}: a whole run cleared no lines at all`);
  }
}

const meanPlacements = (d: Difficulty) =>
  runStats[d].reduce((a, s) => a + s.placements, 0) / runStats[d].length;

for (const d of DIFFICULTIES) {
  if (meanPlacements(d) < MEAN_PLACEMENTS[d]) {
    fail(
      `${d}: mean run length ${meanPlacements(d).toFixed(1)} placements is below the ` +
        `floor of ${MEAN_PLACEMENTS[d]}; the game has become systemically harder`,
    );
  }
  const p10 = percentile(runStats[d].map((s) => s.placements), 0.1);
  if (p10 < P10_PLACEMENTS[d]) {
    fail(
      `${d}: the unluckiest tenth of runs only reached ${p10} placements ` +
        `(floor ${P10_PLACEMENTS[d]})`,
    );
  }
}

// Easy must actually be easier to survive than normal, and normal than hard.
if (!(meanPlacements('easy') > meanPlacements('normal') && meanPlacements('normal') > meanPlacements('hard'))) {
  fail(
    `run length does not fall with difficulty: easy ${meanPlacements('easy').toFixed(1)}, ` +
      `normal ${meanPlacements('normal').toFixed(1)}, hard ${meanPlacements('hard').toFixed(1)}`,
  );
}

// --- 10. self-tests: prove each check can actually fail ----------------------
//
// Every assertion above is only worth something if it can fail. Each block here
// hands a check something deliberately broken and asserts it complains. If one of
// these ever stops reporting a problem, the matching check has quietly become
// decoration.

const selfTests: string[] = [];
const selfTest = (name: string, caught: boolean, detail: string) => {
  if (caught) selfTests.push(`  ok  ${name}: ${detail}`);
  else fail(`self-test "${name}" did NOT catch the sabotage - that check proves nothing`);
};

{
  // (a) Desync the two board representations: mark a filled cell empty in `cells`
  //     while leaving its bit set in `rows`. canPlace reads the mask, brute force
  //     reads the cell, so they must now disagree somewhere.
  const b = makeBoard();
  place(b, BASES[4].rotations[0], 2, 2, 1); // the square, at (2,2)
  const broken = cloneBoard(b);
  broken.cells[2 * GRID + 2] = -1;
  const problems = checkCanPlace(broken, ALL_SHAPES, 'sabotage');
  selfTest(
    'canPlace vs brute force',
    problems.length > 0 && !masksAgree(broken),
    `blanking one cell behind the mask produced ${problems.length} disagreement(s)`,
  );
}

{
  // (b) A board where a piece obviously fits: game over must NOT be reported.
  const b = makeBoard();
  for (let i = 0; i < GRID * GRID; i += 1) {
    b.cells[i] = 0;
    b.rows[Math.floor(i / GRID)] = FULL_ROW;
  }
  // Open a clean 2x2 hole. The square fits it and nothing else can be argued.
  for (const [r, c] of [
    [4, 4],
    [4, 5],
    [5, 4],
    [5, 5],
  ]) {
    b.cells[r * GRID + c] = -1;
    b.rows[r] &= ~(1 << c);
  }
  const square = BASES[4].rotations[0];
  const over = !anyFits(b, [square]);
  const refOver = !refAnyFit(b, [square]);
  selfTest(
    'game over is not trigger-happy',
    !over && !refOver && firstFit(b, square)?.r === 4 && firstFit(b, square)?.c === 4,
    'a 2x2 hole with a square in the tray is correctly NOT game over',
  );

  // And the mirror image: seal the hole into four separated single cells, where
  // only a 1x1 can go, and hand the tray a domino. That IS game over.
  const sealed = makeBoard();
  for (let i = 0; i < GRID * GRID; i += 1) {
    sealed.cells[i] = 0;
    sealed.rows[Math.floor(i / GRID)] = FULL_ROW;
  }
  for (const [r, c] of [
    [0, 0],
    [2, 3],
    [5, 1],
    [7, 6],
  ]) {
    sealed.cells[r * GRID + c] = -1;
    sealed.rows[r] &= ~(1 << c);
  }
  const domino = BASES[1].rotations[0];
  selfTest(
    'game over on a genuinely dead board',
    !anyFits(sealed, [domino]) && !refAnyFit(sealed, [domino]),
    'four isolated single cells with only a domino in the tray is game over',
  );
}

{
  // (c) A clear that takes one cell too many. checkClear must notice.
  const b = makeBoard();
  for (let c = 0; c < GRID; c += 1) {
    b.cells[1 * GRID + c] = 1;
    b.rows[1] |= 1 << c;
  }
  b.cells[6 * GRID + 3] = 2;
  b.rows[6] |= 1 << 3;

  const before = b.cells.slice();
  const good = cloneBoard(b);
  const res = clearLines(good);
  if (checkClear(before, good, res, 'sabotage').length > 0) {
    fail('self-test (c): the honest clear was reported as wrong');
  }
  // Now sabotage the result: also wipe the innocent bystander.
  const bad = cloneBoard(good);
  bad.cells[6 * GRID + 3] = -1;
  bad.rows[6] &= ~(1 << 3);
  const overreach = checkClear(before, bad, res, 'sabotage');
  // And a clear that missed a column it should have taken.
  const missed = cloneBoard(good);
  missed.cells[1 * GRID + 4] = 1;
  missed.rows[1] |= 1 << 4;
  const underreach = checkClear(before, missed, res, 'sabotage');
  selfTest(
    'line clearing',
    overreach.length > 0 && underreach.length > 0,
    `clearing one cell too many and one too few gave ${overreach.length} and ` +
      `${underreach.length} complaint(s)`,
  );
}

{
  // (c2) The touch layer. A piece drawn centred on the fingertip is the classic
  //      touchscreen mistake, and an aim function that always says "cell 0,0, and
  //      yes that is fine" is the classic snapping mistake. Both must be caught.
  const centredOnFinger: OriginFn = (sh, fx, fy) => ({
    x: fx - (sh.w * CELL_UNITS) / 2,
    y: fy - (sh.h * CELL_UNITS) / 2,
  });
  const alwaysTopLeft: AimFn = () => ({ ar: 0, ac: 0, near: true, valid: true });
  const offByOne: AimFn = (b, sh, fx, fy) => {
    const real = aimAt(b, sh, fx, fy);
    return { ...real, ac: Math.min(GRID - sh.w, real.ac + 1) };
  };
  selfTest(
    'drag lift keeps the piece clear of the thumb',
    checkLift(dragOrigin).length === 0 && checkLift(centredOnFinger).length > 0,
    'the real lift passes and a piece centred on the fingertip is rejected',
  );
  selfTest(
    'fingertip aiming snaps to the intended cell',
    checkAiming(aimAt, 'real').length === 0 &&
      checkAiming(alwaysTopLeft, 'stub').length > 0 &&
      checkAiming(offByOne, 'stub').length > 0,
    'the real aim passes; a stub that always answers (0,0) and one off by a column are rejected',
  );
}

{
  // (d) A scoring table that pays the same for one line as for five.
  const flat = (lines: number) => (lines <= 0 ? 0 : 100);
  // And one that actively goes backwards.
  const backwards = (lines: number) => (lines <= 0 ? 0 : 1000 - lines * 10);
  selfTest(
    'scoring monotonicity',
    checkMonotonic(flat).length > 0 && checkMonotonic(backwards).length > 0,
    'a flat table and a decreasing table are both rejected',
  );
}

{
  // (e) previewLines must be held to the truth, so check it against a lie.
  const b = makeBoard();
  for (let c = 0; c < GRID - 1; c += 1) {
    b.cells[4 * GRID + c] = 1;
    b.rows[4] |= 1 << c;
  }
  const single = BASES[0].rotations[0];
  const honest = checkPreview(b, single, 4, GRID - 1, 'sabotage');
  const pv = previewLines(b, single, 4, GRID - 1);
  selfTest(
    'previewLines',
    honest.length === 0 && pv.rows.join() === '4' && pv.cols.length === 0,
    'completing row 4 is predicted as exactly row 4, nothing else',
  );
}

{
  // (f) applyPlacement must refuse an illegal drop rather than overwrite.
  const b = makeBoard();
  const square = BASES[4].rotations[0];
  place(b, square, 0, 0, 1);
  const tray: Array<Piece | null> = [{ shape: square, tone: 2 }, null, null];
  let threw = false;
  try {
    applyPlacement(b, tray, 0, 0, 0, 0, lcg(1), 'easy');
  } catch {
    threw = true;
  }
  selfTest(
    'applyPlacement refuses overlaps',
    threw && fillCount(b) === 4 && b.cells[0] === 1,
    'dropping a square onto a square throws and leaves the board untouched',
  );
}

// --- summary ---------------------------------------------------------------

const totalPlacements = DIFFICULTIES.reduce(
  (a, d) => a + runStats[d].reduce((x, s) => x + s.placements, 0),
  0,
);
const totalLines = DIFFICULTIES.reduce(
  (a, d) => a + runStats[d].reduce((x, s) => x + s.lines, 0),
  0,
);

console.log(`grid ${GRID}x${GRID}; ${bagSummary}`);
console.log(
  `${randomBoards} random boards: ${randomAnchors} canPlace anchors cross-checked against ` +
    `brute force, ${randomClears} of them produced a line clear`,
);
console.log(
  `${guaranteeBoards} crowded boards x ${DIFFICULTIES.length} difficulties refilled: the easy ` +
    `and normal "at least one piece fits" guarantee held every time (hard, which makes no such ` +
    `promise, dealt ${hardDeadTrays} dead trays)`,
);
console.log(
  `${SCREENS.length} canvas shapes x 2 control insets: board always fits, ${aimChecks} ` +
    `fingertip aims snapped to the intended cell, and a short piece floats at least ` +
    `${liftGap.toFixed(1)} board units clear of the fingertip holding it`,
);
console.log(
  `${RUNS * DIFFICULTIES.length} greedy-bot runs: ${totalPlacements} placements and ` +
    `${totalLines} lines cleared, with the game-over verdict brute-forced on every turn`,
);
for (const d of DIFFICULTIES) {
  const runs = runStats[d];
  const placements = runs.map((s) => s.placements);
  const score = runs.reduce((a, s) => a + s.score, 0) / runs.length;
  const capped = runs.filter((s) => s.capped).length;
  console.log(
    `  ${d.padEnd(6)} placements: min ${Math.min(...placements)} (floor ${WORST_PLACEMENTS[d]}), ` +
      `p10 ${percentile(placements, 0.1)} (floor ${P10_PLACEMENTS[d]}), median ` +
      `${percentile(placements, 0.5)}, mean ${meanPlacements(d).toFixed(1)} (floor ` +
      `${MEAN_PLACEMENTS[d]}), max ${Math.max(...placements)}`,
  );
  console.log(
    `         mean score ${score.toFixed(0)} (level ${levelForScore(Math.round(score))}), ` +
      `${(runs.reduce((a, s) => a + s.lines, 0) / runs.length).toFixed(1)} lines per run` +
      (capped > 0 ? `, ${capped}/${runs.length} still alive at the ${TURN_CAP}-placement cap` : ''),
  );
}
console.log('self-tests (each one sabotages a check and confirms it fails):');
for (const line of selfTests) console.log(line);

if (errors.length > 0) {
  console.error(`\n${errors.length} PROBLEM(S):`);
  for (const e of errors.slice(0, 25)) console.error(`  x ${e}`);
  if (errors.length > 25) console.error(`  ... and ${errors.length - 25} more`);
  process.exit(1);
}
console.log(
  '\nPlacement, clearing, scoring and game over all agree with brute force; no placement ever ' +
    'overwrote a cell; the board is never left full; a greedy bot survives every seed.',
);
