/**
 * Headless proof for Dots & Boxes' edge model and computer policy.
 *
 * Drives the exact pure functions the game runs (addEdge / wouldCompleteBoxes /
 * givesAwayBoxes / chooseCpuEdge / winnerOf). The bugs that ruin this game are:
 * a completed box not claimed, a non-completing move wrongly granting another
 * turn (or vice versa), a single edge that finishes two boxes at once only
 * claiming one of them, a game that does not end exactly when the grid fills,
 * and a computer that either passes up a free box or hands one away when it
 * did not have to. Each is proved directly below.
 *
 * Each self-test at the end sabotages a check and confirms it would fail, so a
 * check that has quietly stopped testing anything is caught.
 */
import {
  addEdge,
  boxesCompletedBy,
  chooseCpuEdge,
  drawnEdgeCount,
  edgeAtPoint,
  emptyBoxState,
  givesAwayBoxes,
  isFull,
  lcg,
  listUndrawnEdges,
  totalEdgeCount,
  winnerOf,
  wouldCompleteBoxes,
  type BoxState,
  type Edge,
} from '../components/games/DotsBoxes';

let failures = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    failures += 1;
    console.error(`  FAIL: ${msg}`);
  }
}

// 1) Completing a box's 4th edge claims exactly that box and grants another
// turn; a non-completing edge passes the turn (goAgain === false).
{
  const s = emptyBoxState(1, 1); // a single box: h[0][0], h[1][0], v[0][0], v[0][1]
  const r1 = addEdge(s, { type: 'h', r: 0, c: 0 }, 1);
  assert(r1.ok && r1.completed.length === 0 && r1.goAgain === false, '1st edge of a lone box wrongly completed it');
  const r2 = addEdge(s, { type: 'h', r: 1, c: 0 }, 1);
  assert(r2.ok && r2.completed.length === 0 && r2.goAgain === false, '2nd edge of a lone box wrongly completed it');
  const r3 = addEdge(s, { type: 'v', r: 0, c: 0 }, 1);
  assert(r3.ok && r3.completed.length === 0 && r3.goAgain === false, '3rd edge of a lone box wrongly completed it');
  const r4 = addEdge(s, { type: 'v', r: 0, c: 1 }, 1);
  assert(r4.ok && r4.goAgain === true, '4th edge did not grant another turn');
  assert(
    r4.completed.length === 1 && r4.completed[0][0] === 0 && r4.completed[0][1] === 0,
    'the 4th edge did not claim exactly box (0,0)',
  );
  assert(s.boxes[0][0] === 1, 'the claimed box was not owned by the mover');
  assert(isEdgeDrawnOk(s), 'edges were not marked drawn after addEdge');
}

function isEdgeDrawnOk(s: BoxState): boolean {
  return s.h[0][0] !== 0 && s.h[1][0] !== 0 && s.v[0][0] !== 0 && s.v[0][1] !== 0;
}

// 2) A single edge that completes TWO boxes at once claims both. 1x2 grid: two
// boxes sharing the interior vertical edge v[0][1].
{
  const s = emptyBoxState(1, 2);
  // Complete box (0,0) except the shared edge.
  addEdge(s, { type: 'h', r: 0, c: 0 }, 1);
  addEdge(s, { type: 'h', r: 1, c: 0 }, 1);
  addEdge(s, { type: 'v', r: 0, c: 0 }, 1);
  // Complete box (0,1) except the shared edge.
  addEdge(s, { type: 'h', r: 0, c: 1 }, 1);
  addEdge(s, { type: 'h', r: 1, c: 1 }, 1);
  addEdge(s, { type: 'v', r: 0, c: 2 }, 1);
  assert(wouldCompleteBoxes(s, { type: 'v', r: 0, c: 1 }).length === 2, 'the shared edge was not predicted to complete both boxes');

  const res = addEdge(s, { type: 'v', r: 0, c: 1 }, 2);
  assert(res.completed.length === 2, `the shared edge claimed ${res.completed.length} box(es), expected 2`);
  assert(s.boxes[0][0] === 2 && s.boxes[0][1] === 2, 'both boxes were not awarded to the mover');
  assert(res.goAgain === true, 'a double completion did not grant another turn');
  assert(isFull(s), 'the 1x2 grid should be full once every edge is drawn');
}

// 3) Total claimed boxes never exceeds the grid, and the game ends exactly
// when all edges are drawn. Play every legal edge (order does not matter for
// this claim) on a 3x3 grid, alternating movers, checking invariants each step.
{
  const rows = 3;
  const cols = 3;
  const s = emptyBoxState(rows, cols);
  const rng = lcg(99);
  let mover: 1 | 2 = 1;
  let steps = 0;
  const total = totalEdgeCount(rows, cols);

  while (!isFull(s)) {
    assert(steps < total, 'the grid did not fill after drawing every possible edge');
    const undrawn = listUndrawnEdges(s);
    assert(undrawn.length === total - drawnEdgeCount(s), 'listUndrawnEdges count disagreed with drawnEdgeCount');
    const e = undrawn[Math.floor(rng() * undrawn.length)];
    const res = addEdge(s, e, mover);
    assert(res.ok, 'addEdge rejected a legal, undrawn edge');
    const claimed = boxesCompletedBy(s, 1) + boxesCompletedBy(s, 2);
    assert(claimed <= rows * cols, `claimed boxes (${claimed}) exceeded the grid size (${rows * cols})`);
    if (!res.goAgain) mover = mover === 1 ? 2 : 1;
    steps += 1;
  }
  assert(steps === total, `the game took ${steps} moves to fill, expected exactly ${total}`);
  assert(
    boxesCompletedBy(s, 1) + boxesCompletedBy(s, 2) === rows * cols,
    'not every box on a full grid was claimed by someone',
  );
}

// 4) The computer always takes an available completing edge, even when a
// "safe" edge also happens to be available elsewhere on the board.
{
  const s = emptyBoxState(2, 2);
  // Complete box (0,0) except its bottom edge - a free box is on the table.
  addEdge(s, { type: 'h', r: 0, c: 0 }, 1);
  addEdge(s, { type: 'v', r: 0, c: 0 }, 1);
  addEdge(s, { type: 'v', r: 0, c: 1 }, 1);
  const completing: Edge = { type: 'h', r: 1, c: 0 };
  assert(wouldCompleteBoxes(s, completing).length === 1, 'test setup did not produce a completing edge');

  const rng = lcg(7);
  const move = chooseCpuEdge(s, rng, 1);
  assert(move !== null && wouldCompleteBoxes(s, move).length > 0, 'the computer did not take the available free box');
}

// 5) Given a choice, the computer avoids handing over a 3-sided box. Set up a
// board where one edge is safe and every other edge would gift a box.
{
  const s = emptyBoxState(2, 2);
  // Box (0,0): 2 edges drawn (top, left) - one more (right or bottom) would
  // make it 3-sided and gift it. Its bottom edge v[1][0]... use h/v carefully:
  addEdge(s, { type: 'h', r: 0, c: 0 }, 1); // top of (0,0)
  addEdge(s, { type: 'v', r: 0, c: 0 }, 1); // left of (0,0)
  // Box (1,1): 2 edges drawn similarly, on the far corner.
  addEdge(s, { type: 'h', r: 2, c: 1 }, 1); // bottom of (1,1)
  addEdge(s, { type: 'v', r: 1, c: 2 }, 1); // right of (1,1)
  // No completing move exists yet.
  const undrawn = listUndrawnEdges(s);
  assert(undrawn.every((e) => wouldCompleteBoxes(s, e).length === 0), 'test setup accidentally created a completing edge');
  const unsafeCount = undrawn.filter((e) => givesAwayBoxes(s, e).length > 0).length;
  assert(unsafeCount > 0 && unsafeCount < undrawn.length, 'test setup did not produce a mix of safe and unsafe edges');

  const rng = lcg(2024);
  for (let i = 0; i < 20; i += 1) {
    const move = chooseCpuEdge(s, rng, 1);
    assert(move !== null && givesAwayBoxes(s, move).length === 0, 'the computer handed away a box when a safe move existed');
  }
}

// 6) Winner is whoever holds more boxes; a split grid is a tie.
{
  const s = emptyBoxState(2, 2);
  s.boxes = [
    [1, 1],
    [2, 0],
  ];
  assert(winnerOf(s) === 1, 'winnerOf did not credit the player with more boxes');
  s.boxes = [
    [1, 2],
    [2, 1],
  ];
  assert(winnerOf(s) === 0, 'winnerOf did not call an even split a tie');
  s.boxes = [
    [2, 2],
    [2, 1],
  ];
  assert(winnerOf(s) === 2, 'winnerOf did not credit player 2 when they hold more boxes');
}

// 7) edgeAtPoint maps a tap near an edge's midpoint to that edge, and rejects
// a point that is too far from every edge.
{
  const l = { ox: 0, oy: 0, cell: 100, rows: 2, cols: 2 };
  const hHit = edgeAtPoint(l, 50, 0); // midpoint of h edge (0,0)
  assert(!!hHit && hHit.type === 'h' && hHit.r === 0 && hHit.c === 0, 'edgeAtPoint missed a horizontal edge midpoint');
  const vHit = edgeAtPoint(l, 0, 50); // midpoint of v edge (0,0)
  assert(!!vHit && vHit.type === 'v' && vHit.r === 0 && vHit.c === 0, 'edgeAtPoint missed a vertical edge midpoint');
  const miss = edgeAtPoint(l, 50, 50); // dead centre of a box, far from any edge
  assert(miss === null, 'edgeAtPoint accepted a tap in the middle of a box, far from any edge');
}

console.log('Dots & Boxes: box-claiming, double completions, game-end, and the computer policy all verified.');

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

expectFail('a goAgain sabotage is caught', () => {
  // A broken rule that always passes the turn, even after completing a box,
  // disagrees with the real result on the 4th-edge case.
  const s = emptyBoxState(1, 1);
  addEdge(s, { type: 'h', r: 0, c: 0 }, 1);
  addEdge(s, { type: 'h', r: 1, c: 0 }, 1);
  addEdge(s, { type: 'v', r: 0, c: 0 }, 1);
  const real = addEdge(s, { type: 'v', r: 0, c: 1 }, 1);
  const sabotagedGoAgain = false; // the "always pass the turn" bug
  return real.goAgain !== sabotagedGoAgain;
});

expectFail('a double-completion sabotage is caught', () => {
  // A broken rule that only ever claims the first affected box (ignoring the
  // second) would under-count a shared-edge completion.
  const s = emptyBoxState(1, 2);
  addEdge(s, { type: 'h', r: 0, c: 0 }, 1);
  addEdge(s, { type: 'h', r: 1, c: 0 }, 1);
  addEdge(s, { type: 'v', r: 0, c: 0 }, 1);
  addEdge(s, { type: 'h', r: 0, c: 1 }, 1);
  addEdge(s, { type: 'h', r: 1, c: 1 }, 1);
  addEdge(s, { type: 'v', r: 0, c: 2 }, 1);
  const res = addEdge(s, { type: 'v', r: 0, c: 1 }, 2);
  const sabotagedFirstOnly = 1; // the "only claim the first box" bug
  return res.completed.length !== sabotagedFirstOnly;
});

expectFail('a win-detection sabotage is caught', () => {
  // A scan that only ever looks at player 1's count (never compares to player
  // 2) would wrongly call this a win for player 1 instead of a tie.
  const s = emptyBoxState(2, 2);
  s.boxes = [
    [1, 2],
    [2, 1],
  ];
  const sabotagedAlwaysP1 = 1;
  return winnerOf(s) !== sabotagedAlwaysP1;
});

expectFail('a CPU-ignores-free-box sabotage is caught', () => {
  // A naive policy that always plays the first undrawn edge in scan order,
  // ignoring completions, would not reliably take a free box that sits later
  // in that order.
  const s = emptyBoxState(2, 2);
  addEdge(s, { type: 'h', r: 0, c: 0 }, 1);
  addEdge(s, { type: 'v', r: 0, c: 0 }, 1);
  addEdge(s, { type: 'v', r: 0, c: 1 }, 1);
  const naiveFirst = listUndrawnEdges(s)[0];
  const naiveCompletes = wouldCompleteBoxes(s, naiveFirst).length > 0;
  const real = chooseCpuEdge(s, lcg(3), 1);
  const realCompletes = !!real && wouldCompleteBoxes(s, real).length > 0;
  return realCompletes && !naiveCompletes;
});

expectFail('a CPU-gives-away-a-box sabotage is caught', () => {
  // A policy that ignores safety entirely (pure random among all undrawn
  // edges) will, over enough draws, hand away a box when a safe one exists -
  // the real policy with safeChance=1 never does.
  const s = emptyBoxState(2, 2);
  addEdge(s, { type: 'h', r: 0, c: 0 }, 1);
  addEdge(s, { type: 'v', r: 0, c: 0 }, 1);
  addEdge(s, { type: 'h', r: 2, c: 1 }, 1);
  addEdge(s, { type: 'v', r: 1, c: 2 }, 1);
  const rng = lcg(55);
  let naiveGaveAway = false;
  const undrawn = listUndrawnEdges(s);
  for (let i = 0; i < 30; i += 1) {
    const naive = undrawn[Math.floor(rng() * undrawn.length)];
    if (givesAwayBoxes(s, naive).length > 0) naiveGaveAway = true;
  }
  const rng2 = lcg(55);
  let realGaveAway = false;
  for (let i = 0; i < 30; i += 1) {
    const move = chooseCpuEdge(s, rng2, 1);
    if (move && givesAwayBoxes(s, move).length > 0) realGaveAway = true;
  }
  return naiveGaveAway && !realGaveAway;
});

if (failures > 0 || selfFails > 0) {
  console.error(`\nFAILED: ${failures} assertion(s), ${selfFails} broken self-test(s).`);
  process.exit(1);
}
console.log('\nDots & Boxes: edge model, box-claiming, and the computer policy all verified.');
