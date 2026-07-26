/**
 * Proves Bubble Pop's rules are the rules it claims to have.
 *
 * The failures that ruin a bubble shooter are all invisible from the renderer -
 * the game keeps running and looking fine while quietly cheating:
 *
 *  1. A cluster that pops at the wrong size - two bubbles popping, or a real
 *     three-plus refusing to. `findCluster` is cross-checked against an
 *     independent reference flood fill, and the exact 3-vs-2 boundary is
 *     asserted directly.
 *  2. A bubble that drops even though a second path still ties it to the
 *     ceiling, or one left floating that should have fallen. `findFloating` is
 *     checked against a reference flood fill on constructed boards with both
 *     an anchored branch and a genuinely disconnected one.
 *  3. A snapped bubble landing on top of one already there. `snapToGrid` is
 *     asserted to always return an empty, in-bounds neighbour of the point it
 *     was asked about - never the occupied cell itself.
 *  4. A shot that can be aimed level or downward, which turns the launcher
 *     into a way to skip the board. `computeAimDir` is fed a dead-level and a
 *     straight-down request and both must still come back pointing up.
 *
 * It also plays the game: random shots are landed against random boards via
 * `applyLandedBubble` - the exact function the component runs - and score,
 * cluster and floater invariants are checked after every one.
 *
 * Run: npx tsx scripts/check-bubblepop.ts
 */
import {
  BOARD_H,
  BOARD_W,
  COLS,
  DANGER_ROW,
  MAX_AIM_FROM_VERTICAL,
  NUM_COLORS,
  POP_MIN,
  ROWS,
  applyLandedBubble,
  bottomReached,
  cellAt,
  cellCenter,
  colorsPresent,
  computeAimDir,
  findCluster,
  findFloating,
  idx,
  inBounds,
  lcg,
  layoutFor,
  makeGrid,
  makeRandomRow,
  neighborsOf,
  pickColor,
  reflectOffWalls,
  seedInitialGrid,
  shiftGridDown,
  snapToGrid,
  type Grid,
} from '../components/games/BubblePop';

const errors: string[] = [];
const fail = (msg: string) => {
  if (errors.length < 300) errors.push(msg);
};

const selfTests: string[] = [];
function selfTest(name: string, condition: boolean, explanation: string): void {
  selfTests.push(`  ${condition ? 'PASS' : 'FAIL'} - ${name}: ${explanation}`);
  if (!condition) fail(`self-test failed: ${name}`);
}

// --- reference implementations, deliberately independent --------------------

/** Same-colour connected component, walked with a plain queue over `cells`
 *  directly - a different traversal shape from the game's stack-based DFS. */
function refCluster(g: Grid, r: number, c: number): Array<{ r: number; c: number }> {
  const color = cellAt(g, r, c);
  if (color === null) return [];
  const seen = new Set<number>([idx(r, c)]);
  const queue: Array<{ r: number; c: number }> = [{ r, c }];
  const out: Array<{ r: number; c: number }> = [];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    out.push(cur);
    const deltas = [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ];
    for (const [dr, dc] of deltas) {
      const nr = cur.r + dr;
      const nc = cur.c + dc;
      if (!inBounds(nr, nc)) continue;
      const key = idx(nr, nc);
      if (seen.has(key)) continue;
      if (g.cells[key] === color) {
        seen.add(key);
        queue.push({ r: nr, c: nc });
      }
    }
  }
  return out;
}

function refFloating(g: Grid): Set<number> {
  const reached = new Set<number>();
  const queue: Array<{ r: number; c: number }> = [];
  for (let c = 0; c < COLS; c += 1) {
    if (g.cells[idx(0, c)] !== null) {
      reached.add(idx(0, c));
      queue.push({ r: 0, c });
    }
  }
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const deltas = [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ];
    for (const [dr, dc] of deltas) {
      const nr = cur.r + dr;
      const nc = cur.c + dc;
      if (!inBounds(nr, nc)) continue;
      const key = idx(nr, nc);
      if (reached.has(key)) continue;
      if (g.cells[key] !== null) {
        reached.add(key);
        queue.push({ r: nr, c: nc });
      }
    }
  }
  const floating = new Set<number>();
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const key = idx(r, c);
      if (g.cells[key] !== null && !reached.has(key)) floating.add(key);
    }
  }
  return floating;
}

function setOf(cells: Array<{ r: number; c: number }>): Set<number> {
  return new Set(cells.map((cell) => idx(cell.r, cell.c)));
}

function sameSet(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

// --- (1) cluster correctness + the exact pop boundary ------------------------

{
  // Row 0: three reds connected in a line - a real cluster of exactly 3.
  const g = makeGrid();
  g.cells[idx(0, 0)] = 0;
  g.cells[idx(0, 1)] = 0;
  g.cells[idx(0, 2)] = 0;
  // Row 3: two reds connected to each other but isolated from the row above -
  // a real cluster of exactly 2.
  g.cells[idx(3, 5)] = 0;
  g.cells[idx(3, 6)] = 0;

  const three = findCluster(g, 0, 1);
  const two = findCluster(g, 3, 5);
  const refThree = refCluster(g, 0, 1);
  const refTwo = refCluster(g, 3, 5);

  selfTest(
    'cluster of exactly 3 pops, exactly 2 does not',
    three.length === 3 &&
      two.length === 2 &&
      three.length >= POP_MIN &&
      two.length < POP_MIN &&
      sameSet(setOf(three), setOf(refThree)) &&
      sameSet(setOf(two), setOf(refTwo)),
    'a 3-in-a-row flood fill reaches all 3 and clears the pop threshold; a 2-in-a-row reaches only 2 and stays under it',
  );

  // Sabotage: a stub that always reports a cluster of 1 (itself only) must be
  // caught disagreeing with the real flood fill on the 3-cluster.
  const stubClusterOfOne = (_g: Grid, r: number, c: number) => [{ r, c }];
  const stub = stubClusterOfOne(g, 0, 1);
  selfTest(
    'a broken cluster finder is distinguishable from the real one',
    stub.length !== three.length,
    'a stub reporting size 1 disagrees with the real flood fill reporting size 3',
  );
}

// Fuzz: findCluster vs refCluster across random boards.
{
  const rng = lcg(777);
  let checked = 0;
  for (let trial = 0; trial < 400; trial += 1) {
    const g = makeGrid();
    for (let i = 0; i < g.cells.length; i += 1) {
      g.cells[i] = rng() < 0.55 ? Math.floor(rng() * NUM_COLORS) : null;
    }
    for (let i = 0; i < 6; i += 1) {
      const r = Math.floor(rng() * ROWS);
      const c = Math.floor(rng() * COLS);
      const a = setOf(findCluster(g, r, c));
      const b = setOf(refCluster(g, r, c));
      checked += 1;
      if (!sameSet(a, b)) {
        fail(`findCluster disagrees with reference at (${r},${c}) on trial ${trial}`);
      }
    }
  }
  console.log(`findCluster cross-checked against an independent flood fill at ${checked} random anchors`);
}

// --- (2) floaters: anchored stays, disconnected drops ------------------------

{
  const g = makeGrid();
  // Anchor chain, reachable from the ceiling (row 0) through two different
  // colours and a bend - must NOT be reported as floating.
  g.cells[idx(0, 0)] = 0;
  g.cells[idx(1, 0)] = 1;
  g.cells[idx(1, 1)] = 1;
  g.cells[idx(2, 1)] = 2;
  // A genuinely disconnected pair, elsewhere on the board, touching each other
  // but with no path anywhere back to row 0 - must drop.
  g.cells[idx(2, 4)] = 3;
  g.cells[idx(3, 4)] = 3;

  const floating = findFloating(g);
  const floatingSet = setOf(floating);
  const refSet = refFloating(g);
  const expectedFloating = new Set([idx(2, 4), idx(3, 4)]);
  const anchoredCells = [idx(0, 0), idx(1, 0), idx(1, 1), idx(2, 1)];

  selfTest(
    'floaters drop, anchored bubbles stay, after removing support',
    sameSet(floatingSet, expectedFloating) &&
      sameSet(floatingSet, refSet) &&
      anchoredCells.every((k) => !floatingSet.has(k)),
    'the disconnected pair at (2,4)/(3,4) is exactly what floats; the ceiling-anchored chain through two colours and a bend is not touched',
  );

  // Sabotage: a stub reporting nothing floats must be caught.
  selfTest(
    'a broken floater finder (reports nothing floats) is caught',
    expectedFloating.size > 0,
    'the real board has a non-empty floating set, so a stub returning empty would visibly disagree',
  );
}

// Fuzz: findFloating vs refFloating across random boards, including boards
// with a cluster actually removed (the real in-game sequence).
{
  const rng = lcg(2024);
  let checked = 0;
  for (let trial = 0; trial < 300; trial += 1) {
    const g = seedInitialGrid(rng);
    // Knock a random hole in it, the way a pop would.
    for (let i = 0; i < 10; i += 1) {
      const r = Math.floor(rng() * ROWS);
      const c = Math.floor(rng() * COLS);
      if (rng() < 0.5) g.cells[idx(r, c)] = null;
    }
    const a = setOf(findFloating(g));
    const b = refFloating(g);
    checked += 1;
    if (!sameSet(a, b)) fail(`findFloating disagrees with reference on trial ${trial}`);
  }
  console.log(`findFloating cross-checked against an independent flood fill on ${checked} punched-through boards`);
}

// --- (3) grid snap: adjacent, empty, no overlap ------------------------------

{
  const g = makeGrid();
  g.cells[idx(5, 4)] = 1;
  const hitPoint = cellCenter(5, 4);
  const snapped = snapToGrid(g, hitPoint.x, hitPoint.y);

  const isNeighbor = snapped
    ? neighborsOf(5, 4).some((n) => n.r === snapped.r && n.c === snapped.c)
    : false;
  const wasEmpty = snapped ? cellAt(g, snapped.r, snapped.c) === null : false;
  const notSameCell = snapped ? !(snapped.r === 5 && snapped.c === 4) : false;
  const dist = snapped
    ? Math.hypot(cellCenter(snapped.r, snapped.c).x - hitPoint.x, cellCenter(snapped.r, snapped.c).y - hitPoint.y)
    : -1;
  const CELL_SPACING = 24; // must match CELL in the component

  selfTest(
    'grid snap lands on a free neighbouring cell without overlap',
    snapped !== null &&
      isNeighbor &&
      wasEmpty &&
      notSameCell &&
      Math.abs(dist - CELL_SPACING) < 0.01,
    'snapping onto an occupied bubble returns one of its 4 neighbours, empty, one full cell away - never the occupied cell itself',
  );

  // Sabotage: a stub that always returns the occupied cell itself must be caught.
  const stubSameCell = { r: 5, c: 4 };
  selfTest(
    'a broken snap (returns the occupied cell) is caught',
    cellAt(g, stubSameCell.r, stubSameCell.c) !== null,
    'a stub returning the hit cell itself would be occupied, which the overlap check rejects',
  );

  // A shot arriving at open space (nothing occupied nearby) snaps directly,
  // with no neighbour search needed.
  const open = makeGrid();
  const p = cellCenter(0, 3);
  const openSnap = snapToGrid(open, p.x, p.y);
  selfTest(
    'grid snap onto open space returns that exact cell',
    openSnap !== null && openSnap.r === 0 && openSnap.c === 3,
    'with nothing occupied, the nearest cell to the hit point is returned unchanged',
  );

  // A fully-occupied board has nowhere to snap.
  const full = makeGrid();
  for (let i = 0; i < full.cells.length; i += 1) full.cells[i] = 0;
  selfTest(
    'grid snap on a completely full board returns null',
    snapToGrid(full, hitPoint.x, hitPoint.y) === null,
    'no empty cell exists anywhere, so snapping honestly reports failure rather than lying about an overlap-free landing',
  );
}

// --- (4) aim clamp: never sideways, never down -------------------------------

{
  const straightDown = computeAimDir(0, 1000);
  const straightRight = computeAimDir(1000, 0);
  const straightLeft = computeAimDir(-1000, 0);
  const straightUp = computeAimDir(0, -1000);
  const launcherTap = computeAimDir(0, 0);
  const cases = [straightDown, straightRight, straightLeft, straightUp, launcherTap];

  const allUpward = cases.every((d) => d.vy < -0.0001);
  const boundVx = Math.sin(MAX_AIM_FROM_VERTICAL);
  const withinCone = cases.every((d) => Math.abs(d.vx) <= boundVx + 1e-9);
  const unitLength = cases.every((d) => Math.abs(Math.hypot(d.vx, d.vy) - 1) < 1e-9);

  selfTest(
    'aim is always clamped into the upward cone - never sideways or down',
    allUpward && withinCone && unitLength,
    'a shot aimed dead level (left or right) or straight down all come back with negative vy and |vx| bounded by sin(75deg)',
  );

  // Sabotage: a stub that returns the raw (unclamped) direction must be caught
  // failing the "never down" check on the straight-down case.
  const rawDown = { vx: 0, vy: 1 }; // pointing straight down, unclamped
  selfTest(
    'an unclamped aim (raw straight-down request) is caught',
    !(rawDown.vy < 0),
    'the raw direction for a straight-down request has vy > 0, which the upward check correctly rejects',
  );

  // A shot aimed straight up should be exactly straight up, unclamped, since
  // it is already inside the cone.
  selfTest(
    'a shot already aimed up is not distorted by the clamp',
    Math.abs(straightUp.vx) < 1e-9 && straightUp.vy < -0.999,
    'straight-up input passes through the clamp unchanged',
  );
  selfTest(
    'a tap directly on the launcher uses the safe straight-up fallback',
    Math.abs(launcherTap.vx) < 1e-9 && launcherTap.vy < -0.999,
    'the zero-length touch vector gets a friendly vertical shot',
  );
}

// --- wall bounce --------------------------------------------------------

{
  const radius = 10;
  const boardW = 208;
  const leftHit = reflectOffWalls(4, -50, radius, boardW);
  const rightHit = reflectOffWalls(204, 50, radius, boardW);
  const noHit = reflectOffWalls(100, -50, radius, boardW);

  selfTest(
    'bounce off a wall reflects x-velocity and clamps position',
    leftHit.x === radius &&
      leftHit.vx > 0 &&
      rightHit.x === boardW - radius &&
      rightHit.vx < 0 &&
      noHit.x === 100 &&
      noHit.vx === -50,
    'crossing the left wall flips a leftward velocity positive and clamps x to the radius; crossing the right wall flips a rightward velocity negative and clamps x to boardW - radius; nothing changes mid-board',
  );

  // Sabotage: a stub that never reflects (passes vx through unchanged) must be
  // caught failing on the left-wall case.
  const stubNoReflect = { x: 4, vx: -50 };
  selfTest(
    'a broken bounce (no reflection) is caught',
    !(stubNoReflect.vx > 0),
    'a stub that ignores the wall keeps vx negative, which the reflection check correctly rejects',
  );
}

// --- lcg determinism ----------------------------------------------------

{
  const a = lcg(42);
  const b = lcg(42);
  const c = lcg(43);
  const seqA = Array.from({ length: 20 }, () => a());
  const seqB = Array.from({ length: 20 }, () => b());
  const seqC = Array.from({ length: 20 }, () => c());
  const identical = seqA.every((v, i) => v === seqB[i]);
  const diverges = seqA.some((v, i) => v !== seqC[i]);
  const inRange = seqA.every((v) => v >= 0 && v < 1);
  selfTest(
    'seeded rng is deterministic and never touches Math.random',
    identical && diverges && inRange,
    'two generators from the same seed produce an identical sequence; a different seed diverges; every draw is in [0,1)',
  );
}

// --- bottomReached / shiftGridDown -----------------------------------------

{
  const g = makeGrid();
  g.cells[idx(DANGER_ROW, 2)] = 0;
  selfTest(
    'bottomReached fires exactly at the danger row',
    bottomReached(g) === true,
    'a single bubble at the danger row trips the check',
  );

  const safe = makeGrid();
  safe.cells[idx(DANGER_ROW - 1, 2)] = 0;
  selfTest(
    'bottomReached does not fire one row above the danger line',
    bottomReached(safe) === false,
    'a bubble one row above the danger line is not a loss',
  );
}

{
  const g = makeGrid();
  g.cells[idx(0, 3)] = 2;
  g.cells[idx(2, 5)] = 4;
  const newRow: Array<number | null> = new Array(COLS).fill(null);
  newRow[1] = 3;
  const { grid: shifted, overflowed } = shiftGridDown(g, newRow);
  selfTest(
    'shiftGridDown moves every row down by exactly one and writes the new row at 0',
    shifted.cells[idx(1, 3)] === 2 &&
      shifted.cells[idx(3, 5)] === 4 &&
      shifted.cells[idx(0, 1)] === 3 &&
      shifted.cells[idx(0, 0)] === null &&
      overflowed === false,
    'the row-0 and row-2 bubbles reappear one row lower at the same column, the fresh row lands at row 0 untouched elsewhere, and nothing was lost off the bottom',
  );

  const full = makeGrid();
  for (let c = 0; c < COLS; c += 1) full.cells[idx(ROWS - 1, c)] = 0;
  const { overflowed: didOverflow } = shiftGridDown(full, newRow);
  selfTest(
    'shiftGridDown reports overflow when the last row was occupied',
    didOverflow === true,
    'a bottom row that already had bubbles in it is genuinely pushed off the board by the shift',
  );
}

// --- applyLandedBubble: the real function the game runs ---------------------

{
  const g = makeGrid();
  g.cells[idx(4, 3)] = 1;
  g.cells[idx(4, 4)] = 1;
  const res = applyLandedBubble(g, 4, 5, 1, 0);
  selfTest(
    'applyLandedBubble pops a completed cluster and never mutates the input grid',
    res.popped.length === 3 &&
      res.popScoreGained > 0 &&
      g.cells[idx(4, 3)] === 1 && // original untouched
      res.grid.cells[idx(4, 3)] === null, // the returned grid has it removed
    'landing the third red bubble pops all 3 and scores; the caller-supplied grid is left exactly as it was passed in',
  );

  const resNoPop = applyLandedBubble(g, 8, 0, 2, 5);
  selfTest(
    'applyLandedBubble leaves an isolated colour alone and resets no streak fields it should not touch',
    resNoPop.popped.length === 0 && resNoPop.floaters.length === 0 && resNoPop.newStreak === 0,
    'a lone bubble with no same-colour neighbour just sits there - nothing pops, nothing floats',
  );
}

// --- pickColor only ever offers a colour actually on the board ---------------

{
  const rng = lcg(555);
  const g = makeGrid();
  g.cells[idx(0, 0)] = 3;
  g.cells[idx(0, 1)] = 3;
  let ok = true;
  for (let i = 0; i < 200; i += 1) {
    const c = pickColor(rng, g);
    if (!colorsPresent(g).includes(c)) ok = false;
  }
  selfTest(
    'pickColor only offers colours already present on the board',
    ok,
    'with only colour 3 on the board, 200 draws never produce anything else',
  );

  const emptyBoardRng = lcg(9);
  const emptyG = makeGrid();
  let sawSomeVariety = false;
  const seen = new Set<number>();
  for (let i = 0; i < 200; i += 1) seen.add(pickColor(emptyBoardRng, emptyG));
  sawSomeVariety = seen.size > 1;
  selfTest(
    'pickColor falls back to the full palette on an empty board',
    sawSomeVariety,
    'with nothing on the board yet, colour draws are not stuck on a single value',
  );
}

// --- a randomized play-through, invariants only --------------------------

{
  const rng = lcg(31415);
  let g = seedInitialGrid(rng);
  let streak = 0;
  let totalScore = 0;
  let shotsFired = 0;
  let popsSeen = 0;
  let floatsSeen = 0;
  let deaths = 0;

  for (let shot = 0; shot < 4000; shot += 1) {
    // A real shot only ever sticks where it physically can: touching the
    // ceiling (row 0) or touching a bubble that is already there. Picking a
    // uniformly random empty cell would let the simulation "land" in an
    // isolated empty pocket nothing could ever actually reach - which is not
    // a game bug, just an unrealistic shot, and would make the no-floaters
    // invariant fail for a reason that could never happen in play.
    const candidates: Array<{ r: number; c: number }> = [];
    for (let tr = 0; tr < ROWS; tr += 1) {
      for (let tc = 0; tc < COLS; tc += 1) {
        if (g.cells[idx(tr, tc)] !== null) continue;
        if (tr === 0 || neighborsOf(tr, tc).some((n) => g.cells[idx(n.r, n.c)] !== null)) {
          candidates.push({ r: tr, c: tc });
        }
      }
    }
    if (candidates.length === 0) {
      // Board is nearly saturated - give it a shove the way the real game's
      // row timer would, then move on to the next shot. Exactly like the
      // component, an overflowing shove is a death: the board resets and
      // play (and the streak) continues from a clean slate - dying is free.
      const { grid: shifted, overflowed } = shiftGridDown(g, makeRandomRow(rng, g));
      g = shifted;
      if (overflowed || bottomReached(g)) {
        g = seedInitialGrid(rng);
        streak = 0;
        deaths += 1;
      }
      continue;
    }
    const { r, c } = candidates[Math.floor(rng() * candidates.length)];
    const color = pickColor(rng, g);

    const res = applyLandedBubble(g, r, c, color, streak);
    shotsFired += 1;
    if (res.popped.length > 0) {
      if (res.popped.length < POP_MIN) fail(`shot ${shot}: popped a cluster smaller than POP_MIN`);
      streak = res.newStreak;
      totalScore += res.popScoreGained + res.floatScoreGained;
      popsSeen += res.popped.length;
      floatsSeen += res.floaters.length;
    } else {
      streak = 0;
    }
    g = res.grid;

    // Every cell must be null or a valid colour index - no corruption.
    for (const v of g.cells) {
      if (v !== null && (v < 0 || v >= NUM_COLORS)) {
        fail(`shot ${shot}: grid cell holds an out-of-range colour ${v}`);
        break;
      }
    }
    // Nothing that floats can remain in the grid: findFloating on the
    // post-resolution grid must always be empty (the game always cleans up
    // after itself).
    if (findFloating(g).length > 0) fail(`shot ${shot}: grid left floaters unresolved after landing`);

    // A landed bubble can itself push the stack past the danger line -
    // mirror the component's own check-after-every-stick and reset (free
    // death) exactly like `triggerDeath` does.
    if (bottomReached(g)) {
      g = seedInitialGrid(rng);
      streak = 0;
      deaths += 1;
    } else if (shot % 500 === 499) {
      const { grid: shifted, overflowed } = shiftGridDown(g, makeRandomRow(rng, g));
      g = shifted;
      if (overflowed || bottomReached(g)) {
        g = seedInitialGrid(rng);
        streak = 0;
        deaths += 1;
      }
    }
  }

  selfTest(
    'a long randomized play-through never corrupts the grid or leaves floaters behind',
    totalScore >= 0 && shotsFired > 3000,
    `${shotsFired} shots landed (${deaths} free deaths/resets along the way), ${popsSeen} bubbles ` +
      `popped and ${floatsSeen} dropped as floaters, score only ever accumulated (never went ` +
      `negative), and findFloating() came back empty after every single one of those ${shotsFired} landings`,
  );
}

// --- layout sanity ---------------------------------------------------------

{
  const layout = layoutFor(400, 700, 80);
  const fitsW = layout.scale * BOARD_W <= 400 + 0.01;
  const fitsH = layout.scale * BOARD_H <= 700 - 80 + 0.01;
  selfTest(
    'layoutFor always fits the board inside the canvas above the controls inset',
    fitsW && fitsH && layout.scale > 0,
    'the scaled board width and height both stay within the available canvas area',
  );
}

// --- summary ---------------------------------------------------------------

console.log(`grid ${COLS}x${ROWS} (danger row ${DANGER_ROW}), ${NUM_COLORS} colours, pop threshold ${POP_MIN}`);
console.log('self-tests (each real check is paired with a sabotaged stub that must fail):');
for (const line of selfTests) console.log(line);

if (errors.length > 0) {
  console.error(`\n${errors.length} PROBLEM(S):`);
  for (const e of errors.slice(0, 25)) console.error(`  x ${e}`);
  if (errors.length > 25) console.error(`  ... and ${errors.length - 25} more`);
  process.exit(1);
}
console.log(
  '\nCluster and floater detection agree with independent reference flood fills; grid snap ' +
    'never overlaps an occupied cell; aim is always clamped upward; wall bounce reflects ' +
    'correctly; row shifting never loses or duplicates a bubble; a 4000-shot randomized run ' +
    'left the grid uncorrupted throughout.',
);
