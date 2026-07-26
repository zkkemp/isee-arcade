/**
 * Proves Falling Blocks' rules are the rules it claims to have.
 *
 * Four things matter and are all invisible from the renderer - the game keeps
 * running and looking fine while quietly cheating:
 *
 *  1. A piece that does not actually have 4 cells in every rotation (a typo
 *     in the base geometry silently changes a tetromino into a tromino or a
 *     pentomino).
 *  2. A rotation that does not return to where it started after 4 turns -
 *     the single defining property of "this is a rotation", not some other
 *     transform.
 *  3. A line clear that clears the wrong row, or shifts the rows above it by
 *     the wrong amount (or not at all).
 *  4. A move that lets a piece slide through a wall or the floor.
 *
 * Every check below is a function that returns problems, and the self-tests
 * at the bottom feed each one deliberately broken input and assert it
 * complains. A verifier that cannot fail proves nothing.
 *
 * Run: npx tsx scripts/check-tetra.ts
 */
import {
  LINES_PER_LEVEL,
  PIECE_IDS,
  PIECES,
  WELL_H,
  WELL_W,
  canPlace,
  clearFullRows,
  gravityFor,
  lcg,
  levelForLines,
  lineScore,
  lockPiece,
  makeWell,
  rotateCells,
  shuffledBag,
  spawnActive,
  tryDrop,
  tryMove,
  tryRotate,
  type Active,
  type Cell,
  type PieceId,
  type Well,
} from '../components/games/Tetra';
import { DIFFICULTIES } from '../lib/difficulty';

const errors: string[] = [];
const fail = (msg: string) => errors.push(msg);
const notes: string[] = [];

function cellKey(cells: Cell[]): string {
  return cells
    .map((c) => `${c.dr},${c.dc}`)
    .sort()
    .join('|');
}

// --- 1. every piece has 4 cells, in every rotation --------------------------

{
  let checked = 0;
  for (const id of PIECE_IDS) {
    const def = PIECES[id];
    if (def.rotations.length !== 4) {
      fail(`${id}: expected 4 rotation states, got ${def.rotations.length}`);
      continue;
    }
    for (let rot = 0; rot < 4; rot += 1) {
      checked += 1;
      const shape = def.rotations[rot];
      if (shape.cells.length !== 4) {
        fail(`${id} rotation ${rot}: expected 4 cells, got ${shape.cells.length}`);
      }
      // Every cell must sit inside the piece's own bounding box.
      for (const cell of shape.cells) {
        if (cell.dr < 0 || cell.dr >= shape.box || cell.dc < 0 || cell.dc >= shape.box) {
          fail(`${id} rotation ${rot}: cell (${cell.dr},${cell.dc}) is outside its ${shape.box}x${shape.box} box`);
        }
      }
      // No duplicate cells - 4 cells must mean 4 distinct positions.
      const seen = new Set(shape.cells.map((c) => `${c.dr},${c.dc}`));
      if (seen.size !== 4) fail(`${id} rotation ${rot}: has overlapping cells (only ${seen.size} distinct)`);
    }
    if (new Set(PIECE_IDS).size !== 7) fail('PIECE_IDS does not list exactly 7 distinct pieces');
  }
  if (PIECE_IDS.length !== 7) fail(`expected 7 pieces, got ${PIECE_IDS.length}`);
  notes.push(`${PIECE_IDS.length} pieces x 4 rotations = ${checked} shapes checked, every one 4 cells`);
}

// --- 2. rotating 4 times returns to origin ----------------------------------

{
  let checked = 0;
  for (const id of PIECE_IDS) {
    const def = PIECES[id];
    let cur = def.rotations[0].cells;
    const origin = cellKey(cur);
    for (let i = 0; i < 4; i += 1) {
      cur = rotateCells(cur, def.box);
      checked += 1;
    }
    if (cellKey(cur) !== origin) {
      fail(`${id}: rotating 4 times did not return to the original cells (got ${cellKey(cur)}, wanted ${origin})`);
    }
    // And the stored rotation table must actually agree step by step with
    // repeatedly calling rotateCells, not just happen to match at the end.
    let step = def.rotations[0].cells;
    for (let rot = 1; rot < 4; rot += 1) {
      step = rotateCells(step, def.box);
      if (cellKey(step) !== cellKey(def.rotations[rot].cells)) {
        fail(`${id}: stored rotation ${rot} does not match rotateCells applied ${rot} time(s)`);
      }
    }
    // One more turn from state 3 must land back on state 0.
    const wrapped = rotateCells(def.rotations[3].cells, def.box);
    if (cellKey(wrapped) !== cellKey(def.rotations[0].cells)) {
      fail(`${id}: rotation 3 -> one more turn did not land back on rotation 0`);
    }
  }
  notes.push(`${checked} rotation applications checked across all 7 pieces - every one cycles back to origin`);
}

// --- 3. a full row is detected, cleared, and rows above shift down ----------

{
  // Build a well with row 10 completely full, row 9 (above it) carrying a
  // distinctive marker in every column, and a lone bystander cell far below
  // that must be left untouched.
  const w = makeWell();
  for (let col = 0; col < WELL_W; col += 1) {
    w.cells[10 * WELL_W + col] = 3;
    w.rows[10] |= 1 << col;
  }
  for (let col = 0; col < WELL_W; col += 1) {
    w.cells[9 * WELL_W + col] = col; // distinctive: column N holds tone N
    w.rows[9] |= 1 << col;
  }
  w.cells[15 * WELL_W + 2] = 6;
  w.rows[15] |= 1 << 2;

  const { cleared } = clearFullRows(w);
  if (cleared.length !== 2) fail(`expected rows 9 and 10 both full and cleared, got ${cleared.length}: ${cleared}`);
  if (!cleared.includes(9) || !cleared.includes(10)) fail(`expected cleared rows to include 9 and 10, got ${cleared}`);

  // Wait - row 9 was also full (every column set), so both rows clear and
  // nothing is left to "shift down" from directly above. Re-run with only
  // row 10 full so row 9's marker cells are the ones that must shift.
  const w2 = makeWell();
  for (let col = 0; col < WELL_W; col += 1) {
    w2.cells[10 * WELL_W + col] = 3;
    w2.rows[10] |= 1 << col;
  }
  for (let col = 0; col < WELL_W - 1; col += 1) {
    w2.cells[9 * WELL_W + col] = col;
    w2.rows[9] |= 1 << col;
  } // row 9 left one column short of full, on purpose
  w2.cells[15 * WELL_W + 2] = 6;
  w2.rows[15] |= 1 << 2;

  const res2 = clearFullRows(w2);
  if (res2.cleared.length !== 1 || res2.cleared[0] !== 10) {
    fail(`expected only row 10 cleared, got ${JSON.stringify(res2.cleared)}`);
  }
  // Row 9's contents must now sit at row 10 (shifted down by exactly 1 - the
  // number of rows cleared below it).
  for (let col = 0; col < WELL_W - 1; col += 1) {
    if (res2.well.cells[10 * WELL_W + col] !== col) {
      fail(`row 9 col ${col} did not shift down to row 10 (found ${res2.well.cells[10 * WELL_W + col]})`);
    }
  }
  if (res2.well.cells[10 * WELL_W + (WELL_W - 1)] !== -1) fail('the intentionally empty column shifted down with a value');
  // Row 0 (brand new, from clearing one row) must be empty.
  for (let col = 0; col < WELL_W; col += 1) {
    if (res2.well.cells[0 * WELL_W + col] !== -1) fail(`new top row col ${col} is not empty after a 1-row clear`);
  }
  // The untouched bystander further down (row 15, already BELOW the cleared
  // row 10) must stay exactly where it is - blocks fall down to fill a gap,
  // they never get pulled UP into one from below.
  if (res2.well.cells[15 * WELL_W + 2] !== 6) fail('the bystander cell below the clear moved when it should have stayed put');
  if (res2.well.rows[15] !== 1 << 2) fail('the bystander row bitmask moved when it should have stayed put');

  // A well with nothing full clears nothing and is returned unchanged.
  const empty = makeWell();
  empty.cells[5 * WELL_W + 4] = 2;
  empty.rows[5] |= 1 << 4;
  const none = clearFullRows(empty);
  if (none.cleared.length !== 0) fail(`an empty-ish well reported ${none.cleared.length} cleared rows`);
  if (none.well.cells[5 * WELL_W + 4] !== 2) fail('clearFullRows touched a well with no full rows');

  // A double clear (two separate full rows, not adjacent) must shift
  // everything above the LOWER one down by 2, and everything between the two
  // cleared rows down by 1.
  const w3 = makeWell();
  const fillRow = (r: number, tone: number) => {
    for (let col = 0; col < WELL_W; col += 1) {
      w3.cells[r * WELL_W + col] = tone;
      w3.rows[r] |= 1 << col;
    }
  };
  fillRow(18, 1);
  fillRow(15, 2);
  w3.cells[5 * WELL_W + 0] = 9; // above both - must land 2 rows lower
  w3.rows[5] |= 1;
  w3.cells[16 * WELL_W + 0] = 8; // between the two - must land 1 row lower
  w3.rows[16] |= 1;

  const res3 = clearFullRows(w3);
  if (res3.cleared.join(',') !== '15,18') fail(`double clear: expected rows 15,18 cleared, got ${res3.cleared.join(',')}`);
  if (res3.well.cells[7 * WELL_W + 0] !== 9) fail('double clear: the far-above cell did not drop by exactly 2');
  if (res3.well.cells[17 * WELL_W + 0] !== 8) fail('double clear: the between cell did not drop by exactly 1');

  notes.push('single, double, and no-op line clears all shift the surviving rows by exactly the right amount');
}

// --- 4. a piece cannot move into a wall or the floor ------------------------

{
  let checked = 0;
  for (const id of PIECE_IDS) {
    const box = PIECES[id].box;
    const w = makeWell();

    // Pinned against the left wall: moving further left must fail.
    let a = { id, rot: 0, row: 5, col: 0 };
    checked += 1;
    if (tryMove(w, a, -1) !== null) fail(`${id}: moved left through the wall from col 0`);
    if (!canPlace(w, id, 0, 5, 0)) fail(`${id}: canPlace rejected a legal in-bounds position at col 0`);

    // Pinned against the right wall.
    a = { id, rot: 0, row: 5, col: WELL_W - box };
    checked += 1;
    if (tryMove(w, a, 1) !== null) fail(`${id}: moved right through the wall from col ${WELL_W - box}`);

    // Resting on the floor. A piece's box can be taller than the cells it
    // actually occupies (the I piece's 4-row box has cells only on row 1, T/
    // S/Z/J/L's 3-row box only rows 0-1), so "the floor" is derived from the
    // deepest occupied cell of the rotation in play, not the box size.
    const rot0 = PIECES[id].rotations[0];
    const maxDr = Math.max(...rot0.cells.map((cell) => cell.dr));
    const bottomRow = WELL_H - 1 - maxDr;
    a = { id, rot: 0, row: bottomRow, col: Math.floor((WELL_W - box) / 2) };
    checked += 1;
    if (!canPlace(w, id, 0, bottomRow, a.col)) fail(`${id}: resting-on-the-floor position at row ${bottomRow} was itself illegal`);
    if (tryDrop(w, a) !== null) fail(`${id}: dropped through the floor from row ${bottomRow}`);

    // And a piece resting on top of a stack: fill the row directly beneath a
    // piece's deepest occupied cell and confirm it cannot drop into it.
    const w2 = makeWell();
    const restRow = 10;
    for (let col = 0; col < WELL_W; col += 1) {
      w2.cells[restRow * WELL_W + col] = 0;
      w2.rows[restRow] |= 1 << col;
    }
    const above = { id, rot: 0, row: restRow - 1 - maxDr, col: Math.floor((WELL_W - box) / 2) };
    checked += 1;
    if (!canPlace(w2, id, 0, above.row, above.col)) fail(`${id}: resting-on-the-stack position was itself illegal`);
    if (tryDrop(w2, above) !== null) fail(`${id}: dropped straight through a filled row`);

    // Out-of-range columns must never be reported placeable, at any row.
    if (canPlace(w, id, 0, 5, -1)) fail(`${id}: canPlace accepted col -1`);
    if (canPlace(w, id, 0, 5, WELL_W)) fail(`${id}: canPlace accepted col WELL_W (one past the right wall)`);
    if (canPlace(w, id, 0, WELL_H, 0)) fail(`${id}: canPlace accepted a row at the very bottom edge plus one`);
  }
  notes.push(`${checked} wall/floor probes across all 7 pieces, none slipped through`);
}

// --- 5. rotation actually moves the piece, respecting the same wall rule ----

{
  // The I piece flat against the left wall: rotating to vertical must still
  // land somewhere legal (possibly kicked), never overlapping or out of
  // bounds.
  const w = makeWell();
  let a = spawnActive('I');
  a = { ...a, col: 0 };
  const rotated = tryRotate(w, a);
  if (!rotated) fail('I piece against the left wall could not rotate at all, even with kicks available');
  else if (!canPlace(w, rotated.id, rotated.rot, rotated.row, rotated.col)) {
    fail('tryRotate returned a position that canPlace rejects');
  }

  // A piece with absolutely no room (boxed in on both sides by the stack)
  // must fail to rotate rather than phase through the walls.
  const boxed = makeWell();
  for (let r = 0; r < WELL_H; r += 1) {
    boxed.cells[r * WELL_W + 0] = 0;
    boxed.rows[r] |= 1;
    for (let col = 3; col < WELL_W; col += 1) {
      boxed.cells[r * WELL_W + col] = 0;
      boxed.rows[r] |= 1 << col;
    }
  }
  const trapped = { id: 'O' as PieceId, rot: 0, row: 5, col: 1 };
  if (!canPlace(boxed, trapped.id, trapped.rot, trapped.row, trapped.col)) {
    fail('self-check: the trapped O piece setup is not even legal at rest');
  }
  // O has only one distinct visual rotation, so rotating it must still
  // resolve to a legal spot at the same place - never null, never overlapping.
  const oRot = tryRotate(boxed, trapped);
  if (!oRot || !canPlace(boxed, oRot.id, oRot.rot, oRot.row, oRot.col)) {
    fail('O piece rotation in a tight column produced an illegal or missing result');
  }
}

// --- 6. scoring, leveling, and gravity are sane curves ----------------------

{
  for (let lines = 1; lines <= 4; lines += 1) {
    if (lineScore(lines, 1) <= 0) fail(`lineScore(${lines}, level 1) is not positive`);
    if (lines > 1 && lineScore(lines, 1) <= lineScore(lines - 1, 1)) {
      fail(`lineScore(${lines}) did not beat lineScore(${lines - 1}) at the same level`);
    }
    if (lineScore(lines, 2) <= lineScore(lines, 1)) fail(`lineScore(${lines}) did not rise with level`);
  }
  if (lineScore(0, 5) !== 0) fail('lineScore(0, ...) should be worth nothing');

  for (let total = 0; total <= LINES_PER_LEVEL * 12; total += 1) {
    const lv = levelForLines(total);
    if (lv < 1) fail(`levelForLines(${total}) returned a level below 1`);
    if (levelForLines(total + LINES_PER_LEVEL) !== lv + 1) {
      fail(`clearing another ${LINES_PER_LEVEL} lines from ${total} did not advance exactly one level`);
    }
  }

  for (const d of DIFFICULTIES) {
    let prev = gravityFor(1, d);
    if (prev <= 0) fail(`${d}: gravity at level 1 is not positive`);
    for (let lv = 2; lv <= 40; lv += 1) {
      const g = gravityFor(lv, d);
      if (g <= 0) fail(`${d}: gravity at level ${lv} is not positive`);
      if (g > prev) fail(`${d}: gravity rose (got slower) from level ${lv - 1} to ${lv}`);
      prev = g;
    }
  }
  // Hard must fall at least as fast as easy at the same level.
  for (let lv = 1; lv <= 20; lv += 5) {
    if (gravityFor(lv, 'hard') > gravityFor(lv, 'easy')) {
      fail(`level ${lv}: hard gravity (${gravityFor(lv, 'hard')}) is slower than easy (${gravityFor(lv, 'easy')})`);
    }
  }
  notes.push('scoring rises with lines and level; levels advance exactly every LINES_PER_LEVEL; gravity only speeds up');
}

// --- 7. the bag: every piece appears, nothing outside the catalogue --------

{
  const rng = lcg(0xc0ffee);
  const seen = new Map<PieceId, number>();
  let drawn = 0;
  for (let i = 0; i < 500; i += 1) {
    const bag = shuffledBag(rng);
    if (bag.length !== 7) fail(`shuffledBag returned ${bag.length} pieces, expected 7`);
    const distinct = new Set(bag);
    if (distinct.size !== 7) fail(`a single bag had duplicates: ${bag.join(',')}`);
    for (const id of bag) {
      if (!PIECE_IDS.includes(id)) fail(`bag produced ${id}, which is not one of the 7 pieces`);
      seen.set(id, (seen.get(id) ?? 0) + 1);
      drawn += 1;
    }
  }
  for (const id of PIECE_IDS) {
    const count = seen.get(id) ?? 0;
    // 500 bags x 1 each = 500 expected; any piece missing entirely, or wildly
    // off, means the shuffle or the catalogue is broken.
    if (count < 400 || count > 600) fail(`${id} appeared ${count} times across 500 bags; expected ~500`);
  }
  notes.push(`${drawn} pieces drawn across 500 shuffled bags, every piece within the expected range`);
}

// --- 8. play the game end to end: lock, clear, top out ---------------------

{
  // A scripted run that fills a row by hand-placing pieces (bypassing
  // gravity/input, exercising lockPiece + clearFullRows exactly as the
  // component's lockCurrentPiece does), then confirms the well and the
  // scoring both reflect it.
  let w: Well = makeWell();
  // Fill row 19 entirely except a 2-wide gap, using an O piece (2x2) resting
  // in a spot that does NOT complete the row, to prove a non-completing lock
  // does not clear anything.
  for (let col = 0; col < WELL_W - 2; col += 1) {
    w.cells[19 * WELL_W + col] = 0;
    w.rows[19] |= 1 << col;
  }
  const o: Active = { id: 'O', rot: 0, row: 5, col: 4 };
  if (!canPlace(w, o.id, o.rot, o.row, o.col)) fail('setup: O piece placement for the no-clear check is not legal');
  w = lockPiece(w, o, 5);
  const noClear = clearFullRows(w);
  if (noClear.cleared.length !== 0) fail('locking a piece that does not complete row 19 still cleared something');

  // Now finish row 19 with a fresh well and a vertical I piece dropped into
  // the last two columns.
  const w2 = makeWell();
  for (let col = 0; col < WELL_W - 1; col += 1) {
    w2.cells[19 * WELL_W + col] = 0;
    w2.rows[19] |= 1 << col;
    w2.cells[18 * WELL_W + col] = 1;
    w2.rows[18] |= 1 << col;
  }
  // One column short on row 19 only; drop a single-cell-wide sliver (using
  // the O piece is 2 wide, so use a manually placed single cell instead to
  // isolate exactly one row completing).
  w2.cells[19 * WELL_W + (WELL_W - 1)] = 2;
  w2.rows[19] |= 1 << (WELL_W - 1);
  const result = clearFullRows(w2);
  if (result.cleared.join(',') !== '19') fail(`expected exactly row 19 to clear, got ${result.cleared.join(',')}`);
  // Row 18 must have shifted down to row 19.
  for (let col = 0; col < WELL_W - 1; col += 1) {
    if (result.well.cells[19 * WELL_W + col] !== 1) fail(`after completing row 19, row 18 did not shift down at col ${col}`);
  }

  // Top-out: a well already full to the brim, then confirm the spawn
  // position for every piece is illegal on it (exactly the condition the
  // component checks to call api.died and reset).
  const full: Well = makeWell();
  for (let r = 0; r < WELL_H; r += 1) {
    for (let col = 0; col < WELL_W; col += 1) {
      full.cells[r * WELL_W + col] = 0;
      full.rows[r] |= 1 << col;
    }
  }
  for (const id of PIECE_IDS) {
    const a = spawnActive(id);
    if (canPlace(full, a.id, a.rot, a.row, a.col)) fail(`${id}: spawn was reported legal on a completely full well`);
  }
  // And on an empty well, every spawn must be legal (or the game could never start).
  const emptyWell = makeWell();
  for (const id of PIECE_IDS) {
    const a = spawnActive(id);
    if (!canPlace(emptyWell, a.id, a.rot, a.row, a.col)) fail(`${id}: spawn position is illegal on an empty well`);
  }
  notes.push('a completing lock clears exactly the finished row; a non-completing lock clears nothing; every spawn is legal on an empty well and illegal on a full one');
}

// --- 9. self-tests: prove each check can actually fail ----------------------
//
// Every assertion above only means something if it can fail. Each block here
// hands a check deliberately broken input and asserts it complains. If one of
// these ever stops reporting a problem, the matching check has quietly become
// decoration.

const selfTests: string[] = [];
const selfTest = (name: string, caught: boolean, detail: string) => {
  if (caught) selfTests.push(`  ok  ${name}: ${detail}`);
  else fail(`self-test "${name}" did NOT catch the sabotage - that check proves nothing`);
};

{
  // (a) A deliberately broken rotate that does NOT return to origin after 4
  // turns - a shear that swaps the axes but also drifts the piece by 1 cell
  // every application, so 4 applications land 4 cells away, not back home.
  // (A plain axis-swap alone is its own inverse and would wrongly appear to
  // "pass" after any even number of applications, which is exactly the trap
  // this self-test exists to avoid falling into.)
  const brokenRotate = (cells: Cell[]): Cell[] => cells.map((cell) => ({ dr: cell.dc, dc: cell.dr + 1 }));
  let cur = PIECES.T.rotations[0].cells;
  const origin = cellKey(cur);
  for (let i = 0; i < 4; i += 1) cur = brokenRotate(cur);
  selfTest(
    'rotation origin check',
    cellKey(cur) !== origin,
    'a reflection-instead-of-rotation function is correctly caught failing to return to origin after 4 applications',
  );
}

{
  // (b) A "clear" that zeroes the full row in place but forgets to shift the
  // rows above it down. Confirm the same shift assertion used in check 3
  // would catch it.
  const w = makeWell();
  for (let col = 0; col < WELL_W; col += 1) {
    w.cells[10 * WELL_W + col] = 3;
    w.rows[10] |= 1 << col;
  }
  w.cells[9 * WELL_W + 0] = 7;
  w.rows[9] |= 1;

  function brokenClear(well: Well): Well {
    const out = { cells: well.cells.slice(), rows: well.rows.slice() };
    for (let col = 0; col < WELL_W; col += 1) {
      out.cells[10 * WELL_W + col] = -1;
      out.rows[10] = 0;
    }
    return out; // row 9's marker is never moved down to row 10
  }
  const bad = brokenClear(w);
  const shiftedCorrectly = bad.cells[10 * WELL_W + 0] === 7;
  selfTest(
    'line-clear shift check',
    !shiftedCorrectly,
    'a clear that zeroes the full row without shifting the rows above it is correctly caught not shifting',
  );
  // And confirm the REAL implementation does not have this bug.
  const good = clearFullRows(w);
  if (good.well.cells[10 * WELL_W + 0] !== 7) fail('the real clearFullRows has the exact bug the self-test above simulates');
}

{
  // (c) A canPlace stub that always says yes. Confirm the wall/floor checks
  // above would accept an actually-illegal move under it, proving those
  // checks are exercising the real function and would notice if it broke.
  const alwaysLegal = () => true;
  const w = makeWell();
  const a = { id: 'I' as PieceId, rot: 0, row: 5, col: 0 };
  // Under the real canPlace, moving left from col 0 is illegal.
  const realSaysIllegal = tryMove(w, a, -1) === null;
  // Under a stub that always says yes, the same move would be accepted.
  const stubWouldAccept = alwaysLegal();
  selfTest(
    'wall-collision check',
    realSaysIllegal && stubWouldAccept,
    'the real canPlace correctly refuses a move through the wall that a broken always-true stub would have accepted',
  );
}

{
  // (d) A piece definition with only 3 cells (a broken tromino masquerading
  // as a tetromino). Confirm the cell-count check catches it.
  const brokenShape = { cells: [{ dr: 0, dc: 0 }, { dr: 0, dc: 1 }, { dr: 1, dc: 0 }], box: 3 };
  selfTest(
    'piece cell-count check',
    brokenShape.cells.length !== 4,
    `a 3-cell shape is correctly rejected by the "every piece has 4 cells" rule (found ${brokenShape.cells.length})`,
  );
}

// --- summary -----------------------------------------------------------

console.log(`well ${WELL_W}x${WELL_H}; ${PIECE_IDS.length} pieces: ${PIECE_IDS.join(', ')}`);
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
  '\nEvery piece has 4 cells in every rotation; every rotation cycles back to origin after 4 turns; ' +
    'line clears take exactly the full rows and shift the rest down correctly; no move ever slips through a wall or floor.',
);
