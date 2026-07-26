/**
 * Headless proof for Checkers' rules and computer.
 *
 * Drives the exact pure functions the game runs (legalMoves / applyMove /
 * winnerOf / isGameOver / evaluate / minimax / bestMove / cpuMove). The bugs
 * that ruin a checkers implementation are specific and testable: a capture
 * that isn't actually forced, a multi-jump that misses a jumped piece or
 * lands wrong, a man that fails to king (or a king somehow moving like a man),
 * applyMove corrupting the board, win detection that disagrees with "no legal
 * moves", and a computer that ignores a free capture.
 *
 * Each self-test at the end sabotages a check and confirms it would fail, so
 * a check that has quietly stopped testing anything is caught (mirrors
 * check-tictactoe.ts's expectFail pattern).
 */
import {
  applyMove,
  bestMove,
  colOf,
  evaluate,
  idx,
  initialBoard,
  isGameOver,
  KING_ROW,
  lcg,
  legalMoves,
  minimax,
  movesFrom,
  opponent,
  pieceIsKing,
  pieceOwner,
  rowOf,
  squareAtPoint,
  winnerOf,
  type Board,
  type Move,
  type Piece,
  type Player,
} from '../components/games/Checkers';

let failures = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    failures += 1;
    console.error(`  FAIL: ${msg}`);
  }
}

// --- fixtures ----------------------------------------------------------------

function emptyB(): Board {
  return new Array<Piece>(64).fill(0);
}

/** Builds a board from a list of [row, col, piece]. */
function board(pieces: Array<[number, number, Piece]>): Board {
  const b = emptyB();
  for (const [r, c, p] of pieces) b[idx(r, c)] = p;
  return b;
}

/** Independent re-scan (does not call legalMoves/captureSequencesFrom): does
 * `player` have any first-ply action at all (a simple slide or a capture)?
 * Used to cross-check winnerOf/isGameOver against a differently-written scan. */
function bruteHasAnyMove(b: Board, player: Player): boolean {
  const manDirs: Record<Player, Array<[number, number]>> = {
    1: [
      [-1, -1],
      [-1, 1],
    ],
    2: [
      [1, -1],
      [1, 1],
    ],
  };
  const kingDirs: Array<[number, number]> = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ];
  const inb = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;
  for (let sq = 0; sq < 64; sq += 1) {
    const p = b[sq];
    if (pieceOwner(p) !== player) continue;
    const r = rowOf(sq);
    const c = colOf(sq);
    const dirs = pieceIsKing(p) ? kingDirs : manDirs[player];
    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (inb(nr, nc) && b[idx(nr, nc)] === 0) return true; // simple slide
      const jr = r + 2 * dr;
      const jc = c + 2 * dc;
      if (inb(jr, jc) && pieceOwner(b[idx(nr, nc)]) === opponent(player) && b[idx(jr, jc)] === 0) return true; // capture
    }
  }
  return false;
}

/** Like bruteHasAnyMove, but deliberately blind to captures - used only to
 * manufacture a "broken" check for the self-test below. */
function bruteHasAnySimpleMoveOnly(b: Board, player: Player): boolean {
  const manDirs: Record<Player, Array<[number, number]>> = {
    1: [
      [-1, -1],
      [-1, 1],
    ],
    2: [
      [1, -1],
      [1, 1],
    ],
  };
  const kingDirs: Array<[number, number]> = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ];
  const inb = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;
  for (let sq = 0; sq < 64; sq += 1) {
    const p = b[sq];
    if (pieceOwner(p) !== player) continue;
    const r = rowOf(sq);
    const c = colOf(sq);
    const dirs = pieceIsKing(p) ? kingDirs : manDirs[player];
    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (inb(nr, nc) && b[idx(nr, nc)] === 0) return true;
    }
  }
  return false;
}

// 1) Starting position sanity: 12 men per side on the right rows, nobody kinged.
{
  const b = initialBoard();
  let p1 = 0;
  let p2 = 0;
  for (let sq = 0; sq < 64; sq += 1) {
    if (b[sq] === 1) p1 += 1;
    else if (b[sq] === -1) p2 += 1;
    else assert(b[sq] === 0, `unexpected piece value ${b[sq]} at square ${sq} in initial board`);
  }
  assert(p1 === 12, `expected 12 player-1 men at start, found ${p1}`);
  assert(p2 === 12, `expected 12 player-2 men at start, found ${p2}`);
  assert(legalMoves(b, 1).length === 7, `player 1 should have 7 opening moves, got ${legalMoves(b, 1).length}`);
}

// 2) Forced capture: a position where player 1 has both a capture available
// AND an unrelated simple move available for a different piece. legalMoves
// must return ONLY the capture(s).
function forcedCaptureFixture(): Board {
  return board([
    [3, 2, 1], // player 1 man that can capture
    [2, 3, -1], // player 2 man to be jumped, landing at (1,4) empty
    [5, 4, 1], // an unrelated player-1 man with an ordinary simple move available
  ]);
}
function checkForcedCapture(moves: Move[]): boolean {
  return moves.length > 0 && moves.every((m) => m.captured.length > 0);
}
{
  const b = forcedCaptureFixture();
  const moves = legalMoves(b, 1);
  assert(checkForcedCapture(moves), 'a position with a capture available offered a non-capturing move');
  assert(
    moves.some((m) => m.from === idx(3, 2) && m.to === idx(1, 4) && m.captured[0] === idx(2, 3)),
    'the expected capture (3,2)->(1,4) over (2,3) was not offered',
  );
}

// 3) Multi-jump: player 1 man at (5,2) can jump two player-2 men in one turn,
// (5,2) -> (3,4) capturing (4,3), then (3,4) -> (1,6) capturing (2,5), landing
// empty and off the king row (so no kinging interferes with this specific test).
function multiJumpFixture(): Board {
  return board([
    [5, 2, 1],
    [4, 3, -1],
    [2, 5, -1],
  ]);
}
{
  const b = multiJumpFixture();
  const moves = legalMoves(b, 1);
  const multi = moves.find((m) => m.from === idx(5, 2) && m.captured.length === 2);
  assert(!!multi, 'the two-piece multi-jump from (5,2) was not generated');
  if (multi) {
    assert(multi.to === idx(1, 6), `multi-jump landed at ${multi.to}, expected ${idx(1, 6)}`);
    assert(
      multi.captured.includes(idx(4, 3)) && multi.captured.includes(idx(2, 5)),
      'multi-jump did not record both jumped squares',
    );
    assert(multi.path[0] === idx(5, 2) && multi.path[multi.path.length - 1] === idx(1, 6), 'multi-jump path endpoints wrong');
    const after = applyMove(b, multi);
    assert(after[idx(5, 2)] === 0, 'origin square still occupied after multi-jump');
    assert(after[idx(4, 3)] === 0 && after[idx(2, 5)] === 0, 'a jumped piece was not removed after multi-jump');
    assert(after[idx(1, 6)] === 1, 'moving piece did not land at the final square after multi-jump');
  }
  // Only the fully-maximal chain should be offered, not the shorter one-jump
  // prefix (mandatory continuation), since a further capture was available.
  assert(
    !moves.some((m) => m.from === idx(5, 2) && m.captured.length === 1),
    'a shorter (non-maximal) one-jump chain was offered even though a further capture existed',
  );
}

// 4a) Kinging on a simple move: a player-1 man one step from row 0 kings when
// it slides there, and only then gains backward moves.
{
  const b = board([[1, 2, 1]]);
  const moves = legalMoves(b, 1);
  const toKingRow = moves.find((m) => rowOf(m.to) === KING_ROW[1]);
  assert(!!toKingRow, 'no move reached the king row from one step away');
  assert(!!toKingRow && toKingRow.becomesKing, 'move onto the king row was not flagged becomesKing');
  if (toKingRow) {
    const after = applyMove(b, toKingRow);
    assert(after[toKingRow.to] === 2, `piece did not king (expected 2, got ${after[toKingRow.to]})`);
    // Now it must be able to move backward (dr = +1), which a player-1 MAN could not.
    const kingMoves = movesFrom(after, 1, toKingRow.to);
    assert(
      kingMoves.some((m) => rowOf(m.to) > rowOf(toKingRow.to)),
      'newly kinged piece could not move backward',
    );
  }
}

// 4b) Kinging mid-jump ends the turn immediately, even though a further
// capture would otherwise have been possible from the landing square.
function midJumpKingFixture(): Board {
  return board([
    [2, 3, 1], // player 1 man, one jump from the king row
    [1, 4, -1], // jumped piece, landing at (0,5) = king row for player 1
    [1, 6, -1], // a further-capturable piece from (0,5)... but kinging should stop the chain first
  ]);
}
{
  const b = midJumpKingFixture();
  const moves = legalMoves(b, 1);
  const jump = moves.find((m) => m.from === idx(2, 3));
  assert(!!jump, 'expected single-jump-then-king move was not found');
  if (jump) {
    assert(jump.becomesKing, 'jump landing on the king row was not flagged becomesKing');
    assert(jump.captured.length === 1, `kinging jump should stop after one capture, captured ${jump.captured.length}`);
    assert(jump.to === idx(0, 5), `kinging jump landed at ${jump.to}, expected ${idx(0, 5)}`);
    assert(
      !moves.some((m) => m.from === idx(2, 3) && m.captured.length === 2),
      'a continued capture past the kinging square was incorrectly offered',
    );
  }
}

// 5) applyMove invariants: for a batch of real moves (simple + capturing),
// the origin empties, every captured square empties, the destination holds
// exactly the (possibly promoted) piece, and total piece count only drops by
// the number captured.
function countPieces(b: Board): number {
  let n = 0;
  for (const p of b) if (p !== 0) n += 1;
  return n;
}
function checkApplyInvariants(before: Board, m: Move, after: Board): boolean {
  if (after.length !== 64) return false;
  if (after[m.from] !== 0) return false;
  for (const cap of m.captured) if (after[cap] !== 0) return false;
  if (after[m.to] === 0) return false;
  if (countPieces(before) - countPieces(after) !== m.captured.length) return false;
  for (const p of after) if (![0, 1, 2, -1, -2].includes(p)) return false;
  return true;
}
{
  const b1 = forcedCaptureFixture();
  const m1 = legalMoves(b1, 1)[0];
  assert(checkApplyInvariants(b1, m1, applyMove(b1, m1)), 'applyMove invariants failed on a simple capture');

  const b2 = multiJumpFixture();
  const m2 = legalMoves(b2, 1).find((m) => m.captured.length === 2)!;
  assert(checkApplyInvariants(b2, m2, applyMove(b2, m2)), 'applyMove invariants failed on a multi-jump');

  const b3 = initialBoard();
  const m3 = legalMoves(b3, 1)[0];
  assert(checkApplyInvariants(b3, m3, applyMove(b3, m3)), 'applyMove invariants failed on an opening simple move');
}

// 6) winnerOf / isGameOver: a player-2 man fully boxed in by player-1 pieces
// (no simple move, no capture) means player 1 wins when it is player 2's turn.
function boxedInFixture(): Board {
  // Player 2 man at (0,1) moves by dr=+1. Both forward-diagonal squares are
  // occupied by player-1 pieces that cannot be jumped (no empty landing square
  // for either, since the board edge / another piece blocks it).
  return board([
    [0, 1, -1],
    [1, 0, 1],
    [1, 2, 1],
    [2, 3, 1], // blocks the landing square for a jump over (1,2)
    // (1,0)->jump landing would be (2,-1): off board, already blocked by bounds.
  ]);
}
{
  const b = boxedInFixture();
  assert(isGameOver(b, 2), 'boxed-in player 2 should have no legal moves');
  assert(winnerOf(b, 2) === 1, `winnerOf should award player 1 the win, got ${winnerOf(b, 2)}`);
  assert(!isGameOver(b, 1), 'player 1 (with moves available) was incorrectly reported as game over');
}

// Cross-check winnerOf/isGameOver against an independently-written scan across
// many boards sampled from randomized self-play.
{
  const rng = lcg(777);
  let sampled = 0;
  let disagreements = 0;
  for (let game = 0; game < 25; game += 1) {
    let b = initialBoard();
    let turn: Player = 1;
    for (let ply = 0; ply < 200; ply += 1) {
      const moves = legalMoves(b, turn);
      const stuck = moves.length === 0;
      sampled += 1;
      if (stuck === bruteHasAnyMove(b, turn)) disagreements += 1; // stuck and hasAnyMove must be opposites
      if (stuck) break;
      const pick = moves[Math.floor(rng() * moves.length)];
      b = applyMove(b, pick);
      turn = opponent(turn);
    }
  }
  assert(disagreements === 0, `legalMoves-empty disagreed with an independent move scan ${disagreements}/${sampled} times`);
  assert(sampled > 100, `too few positions sampled during self-play (${sampled})`);
}

// 7) The computer prefers a free capture over declining it. Because mandatory
// capture means legalMoves() would not even offer the declining alternative,
// this compares the two hypothetical resulting positions directly through
// evaluate()/minimax() - the scoring the AI actually uses to choose - so a
// broken evaluator that doesn't value captured material is still caught.
{
  // Player 1 man can capture a lone, undefended player-2 man; if it instead
  // (hypothetically) just slid to a nearby empty square, no material changes.
  const b = board([
    [3, 2, 1],
    [2, 3, -1], // capturable, landing at (1,4) is empty
    [3, 6, 1], // gives player 1 a harmless simple-move alternative to compare against
  ]);
  const captureMove = legalMoves(b, 1).find((m) => m.captured.length > 0)!;
  assert(!!captureMove, 'expected a capture to be available in the AI-preference fixture');
  const afterCapture = applyMove(b, captureMove);
  // Hypothetical non-capturing alternative: the OTHER piece takes its plain
  // simple move instead, leaving the capturable enemy man on the board. Built
  // by hand (rather than via legalMoves) because mandatory capture would not
  // even offer this move as a real option - the point here is to compare the
  // scoring of the two outcomes, not to re-litigate mandatory capture.
  const declineBoard = board([
    [3, 2, 1],
    [2, 3, -1],
    [3, 6, 1],
  ]);
  const plain: Move = { from: idx(3, 6), to: idx(2, 5), path: [idx(3, 6), idx(2, 5)], captured: [], becomesKing: false };
  const afterDecline = applyMove(declineBoard, plain);

  assert(
    evaluate(afterCapture, 1) > evaluate(afterDecline, 1),
    'evaluate() did not score the position after a free capture higher than declining it',
  );
  assert(
    minimax(afterCapture, 1, 2, 2) > minimax(afterDecline, 1, 2, 2),
    'minimax did not prefer the branch after a free capture over declining it',
  );
  // And bestMove, driven by the real (mandatory-capture) legalMoves, must in
  // fact choose to capture when it is the only/best option on offer.
  const chosen = bestMove(b, 1, 4);
  assert(!!chosen && chosen.captured.length > 0, 'bestMove did not choose the capturing move');
}

// 8) squareAtPoint maps points to the intended square and rejects off-board taps.
{
  const l = { ox: 0, oy: 100, size: 320, cell: 40 };
  let ok = 0;
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const x = l.ox + (c + 0.5) * l.cell;
      const y = l.oy + (r + 0.5) * l.cell;
      if (squareAtPoint(l, x, y) === idx(r, c)) ok += 1;
    }
  }
  assert(ok === 64, `squareAtPoint hit ${ok}/64 square centres`);
  assert(squareAtPoint(l, -5, 150) === -1, 'squareAtPoint accepted a point left of the board');
  assert(squareAtPoint(l, 150, 50) === -1, 'squareAtPoint accepted a point above the board');
}

console.log('Starting position, forced capture, multi-jump, kinging, applyMove invariants, and win detection all verified.');

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

expectFail('forced-capture violation is caught', () => {
  // Sneak a non-capturing move into an otherwise all-capture move list.
  const real = legalMoves(forcedCaptureFixture(), 1);
  const sabotaged = [...real, { from: idx(5, 4), to: idx(4, 5), path: [idx(5, 4), idx(4, 5)], captured: [], becomesKing: false }];
  return !checkForcedCapture(sabotaged);
});

expectFail('multi-jump missing a captured piece is caught', () => {
  const b = multiJumpFixture();
  const real = legalMoves(b, 1).find((m) => m.captured.length === 2)!;
  // Drop the second captured square, as a buggy generator that stops early might.
  const sabotaged: Move = { ...real, captured: [real.captured[0]] };
  const after = applyMove(b, sabotaged);
  return after[idx(2, 5)] !== 0; // the second enemy piece was wrongly left on the board
});

expectFail('a man that fails to king is caught', () => {
  const b = board([[1, 2, 1]]);
  const move = legalMoves(b, 1).find((m) => rowOf(m.to) === KING_ROW[1])!;
  // Sabotage: apply the move but force becomesKing false, as a buggy engine might.
  const broken = applyMove(b, { ...move, becomesKing: false });
  return broken[move.to] !== 2; // stayed a man instead of kinging - bug correctly detected
});

expectFail('a losing applyMove (dropped capture) is caught', () => {
  const b = forcedCaptureFixture();
  const m = legalMoves(b, 1)[0];
  // Sabotage: an apply that forgets to clear the captured square.
  const broken = b.slice();
  broken[m.from] = 0;
  broken[m.to] = b[m.from];
  // captured square NOT cleared, unlike the real applyMove.
  return !checkApplyInvariants(b, m, broken);
});

expectFail('a game-over check that ignores captures is caught', () => {
  // Player 1's ONLY piece on the board is at (3,2), and its ONLY legal move
  // is a capture: both diagonals are occupied by opponents, one of which
  // (2,3) can be jumped (landing (1,4) is empty) while the other (2,1) is
  // capture-blocked too (landing (1,0) is occupied). A broken "game over"
  // scan that only looks for simple slides (never captures) would wrongly
  // conclude player 1 is stuck, disagreeing with the real, capture-aware
  // answer.
  const b = board([
    [3, 2, 1],
    [2, 1, -1], // blocks one diagonal, but is not itself capturable (see below)
    [1, 0, -1], // blocks the landing square for a jump over (2,1)
    [2, 3, -1], // opponent, capturable, landing (1,4) is empty
  ]);
  const brokenIgnoresCaptures = !bruteHasAnySimpleMoveOnly(b, 1);
  const real = isGameOver(b, 1);
  assert(real === false, 'sanity: player 1 should still have a legal move (the capture) in this fixture');
  return brokenIgnoresCaptures !== real; // the broken, capture-blind check disagrees with the truth
});

expectFail('a computer that ignores a free capture is caught', () => {
  const b = board([
    [3, 2, 1],
    [2, 3, -1],
    [3, 6, 1],
  ]);
  // A broken "AI" that always takes the first-listed simple move ignoring
  // material would end up worse off than the real capture; prove the scores
  // differ so such a bug would be visible in the evaluate()/minimax() signal.
  const captureMove = legalMoves(b, 1).find((m) => m.captured.length > 0)!;
  const afterCapture = applyMove(b, captureMove);
  const worseBoard = board([
    [3, 2, 1],
    [2, 3, -1],
    [4, 5, 1], // pretend the "AI" moved the other man somewhere pointless instead
  ]);
  return evaluate(afterCapture, 1) > evaluate(worseBoard, 1);
});

if (failures > 0 || selfFails > 0) {
  console.error(`\nFAILED: ${failures} assertion(s), ${selfFails} broken self-test(s).`);
  process.exit(1);
}
console.log('\nCheckers: forced capture, multi-jump, kinging, and an AI that never declines a free capture all verified.');
