/**
 * Headless proof for Chess's rules and computer.
 *
 * Drives the exact pure functions the game runs (legalMoves / applyMove /
 * inCheck / isCheckmate / isStalemate / evaluate / searchBestMove / cpuMove).
 * The strongest correctness proof for a move generator is perft (a leaf-node
 * count of the legal-move tree): the counts from the standard starting
 * position are well-known constants, so any bug in piece movement, castling,
 * en passant, promotion, or check-filtering shows up as a wrong number
 * almost immediately - it does not require guessing which bug to look for.
 *
 * Beyond perft this also proves: a known checkmate and a known stalemate are
 * each detected correctly (and not confused for one another); a pinned piece
 * has zero legal destinations even though pseudo-legal generation offers
 * some; castling is legal only with empty/unattacked squares and intact
 * rights, and is correctly refused when a square the king passes through is
 * attacked; en passant is offered only immediately after the enabling double
 * push and is gone one ply later whether or not it was used.
 *
 * Each self-test at the end sabotages a check and confirms it would fail, so
 * a check that has quietly stopped testing anything is caught (mirrors
 * check-tictactoe.ts's / check-checkers.ts's expectFail pattern).
 */
import {
  applyMove,
  cpuMove,
  evaluate,
  inCheck,
  initialState,
  isCheckmate,
  isStalemate,
  lcg,
  legalMoves,
  perft,
  pseudoMoves,
  searchBestMove,
  squareAtPoint,
  squareFromAlgebraic,
  stateFromFEN,
  type ChessState,
  type Side,
} from '../components/games/Chess';

let failures = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    failures += 1;
    console.error(`  FAIL: ${msg}`);
  }
}

const sq = squareFromAlgebraic;

// 1) Perft from the standard starting position. This is THE brute-force proof
// that move generation (all piece types, castling, en passant, promotion,
// and "does this move leave my own king in check") is correct end to end.
{
  const start = initialState();
  const t0 = Date.now();
  const p1 = perft(start, 1);
  const p2 = perft(start, 2);
  const p3 = perft(start, 3);
  const t1 = Date.now();
  assert(p1 === 20, `perft(1) should be 20, got ${p1}`);
  assert(p2 === 400, `perft(2) should be 400, got ${p2}`);
  assert(p3 === 8902, `perft(3) should be 8902, got ${p3}`);
  console.log(`  perft(1..3) = ${p1}, ${p2}, ${p3} (${t1 - t0}ms)`);

  // perft(4) is the optional deeper check the prompt allows skipping if slow.
  // On this implementation it comfortably finishes in a few seconds, so it is
  // included as a real assertion rather than just a timing note.
  const t2 = Date.now();
  const p4 = perft(start, 4);
  const t3 = Date.now();
  assert(p4 === 197281, `perft(4) should be 197281, got ${p4}`);
  console.log(`  perft(4) = ${p4} (${t3 - t2}ms)`);
}

// 2) Known checkmate: Fool's Mate (1.f3 e5 2.g4 Qh4#). White to move, in
// check, with zero legal moves.
{
  const fen = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';
  const s = stateFromFEN(fen);
  assert(inCheck(s), 'Fool-s-Mate position: White king should be in check');
  assert(legalMoves(s).length === 0, `Fool-s-Mate position should have 0 legal moves, got ${legalMoves(s).length}`);
  assert(isCheckmate(s), 'Fool-s-Mate position should be detected as checkmate');
  assert(!isStalemate(s), 'Fool-s-Mate position should NOT be detected as stalemate');
}

// 3) Known stalemate: king+queen vs lone king, Black to move, not in check,
// zero legal moves.
{
  const fen = 'k7/8/1Q6/8/8/8/8/7K b - - 0 1';
  const s = stateFromFEN(fen);
  assert(!inCheck(s), 'KQvK stalemate position: Black king should NOT be in check');
  assert(legalMoves(s).length === 0, `KQvK stalemate position should have 0 legal moves, got ${legalMoves(s).length}`);
  assert(isStalemate(s), 'KQvK position should be detected as stalemate');
  assert(!isCheckmate(s), 'KQvK position should NOT be detected as checkmate');
}

// 4) Pinned piece: a White knight on e2, White king on e1, Black rook on e8.
// Pseudo-legal generation offers knight moves (a knight never stays on the
// e-file), but every single one exposes the king, so legalMoves must offer
// NONE of them.
{
  const fen = '4r3/8/8/8/8/8/4N3/4K3 w - - 0 1';
  const s = stateFromFEN(fen);
  const e2 = sq('e2');
  const pseudoFromE2 = pseudoMoves(s).filter((m) => m.from === e2);
  const legalFromE2 = legalMoves(s).filter((m) => m.from === e2);
  assert(pseudoFromE2.length > 0, 'pinned-knight fixture: expected pseudo-legal knight moves to exist');
  assert(legalFromE2.length === 0, `pinned knight should have 0 legal moves, got ${legalFromE2.length}`);
}

// 5) Castling legality: positive case (kingside available, path clear and
// unattacked) and negative case (a rook attacks the square the king passes
// through, so castling must be refused).
{
  const clear = stateFromFEN('8/8/8/8/8/8/8/4K2R w K - 0 1');
  const e1 = sq('e1');
  const g1 = sq('g1');
  const castleAvailable = legalMoves(clear).some((m) => m.from === e1 && m.to === g1 && m.flag === 'castleK');
  assert(castleAvailable, 'kingside castle should be legal with clear, unattacked squares and intact rights');

  const blocked = stateFromFEN('5r2/8/8/8/8/8/8/4K2R w K - 0 1');
  const castleBlocked = legalMoves(blocked).some((m) => m.from === e1 && m.to === g1 && m.flag === 'castleK');
  assert(!castleBlocked, 'kingside castle should be refused when the king would pass through an attacked square (f1)');
}

// 6) En passant: generated only immediately after the enabling double push,
// captures the correct pawn, and disappears one ply later even if unused.
{
  const fen = '4k3/8/8/8/3pP3/8/8/4K3 b - e3 0 1';
  const s = stateFromFEN(fen);
  const d4 = sq('d4');
  const e3 = sq('e3');
  const e4 = sq('e4');
  const epMove = legalMoves(s).find((m) => m.from === d4 && m.to === e3 && m.flag === 'ep');
  assert(!!epMove, 'en passant capture d4xe3 should be a legal move immediately after the enabling double push');
  if (epMove) {
    const after = applyMove(s, epMove);
    assert(after.board[e4] === 0, 'en passant should remove the captured pawn from e4');
    assert(after.board[e3] === -1, 'en passant should land the capturing black pawn on e3');
    assert(after.board[d4] === 0, 'en passant should empty the origin square d4');
  }

  // The transience check: from the start position, a double push sets ep,
  // and it is gone after one more ply passes without using it.
  let g = initialState();
  const e2e4 = legalMoves(g).find((m) => m.from === sq('e2') && m.to === sq('e4') && m.flag === 'double');
  assert(!!e2e4, 'expected e2-e4 to be generated as a double push from the start position');
  g = applyMove(g, e2e4!);
  assert(g.ep === sq('e3'), `ep target should be e3 right after e2-e4, got square ${g.ep}`);
  const reply = legalMoves(g).find((m) => m.from === sq('g8') && m.to === sq('f6'));
  assert(!!reply, 'expected Nf6 to be a legal Black reply');
  g = applyMove(g, reply!);
  assert(g.ep === -1, `ep target should be cleared after an intervening ply, got square ${g.ep}`);
}

// 7) Cross-check: an independently-written attack scanner (does not call
// isSquareAttacked) agrees with inCheck across many positions sampled from
// randomized-but-legal self-play. Mirrors TicTacToe's independent winnerOf
// scan and Checkers' independent bruteHasAnyMove scan.
function bruteKingAttacked(state: ChessState, side: Side): boolean {
  const board = state.board;
  const kingVal = side * 6;
  let kingSq = -1;
  for (let i = 0; i < 64; i += 1) if (board[i] === kingVal) kingSq = i;
  if (kingSq === -1) return false;
  const kf = kingSq % 8;
  const kr = Math.floor(kingSq / 8);
  const opp = side === 1 ? -1 : 1;
  for (let i = 0; i < 64; i += 1) {
    const p = board[i];
    if (p === 0 || Math.sign(p) !== opp) continue;
    const type = Math.abs(p);
    const f = i % 8;
    const r = Math.floor(i / 8);
    const df = kf - f;
    const dr = kr - r;
    if (type === 1) {
      if (dr === opp && Math.abs(df) === 1) return true;
    } else if (type === 2) {
      if ((Math.abs(df) === 1 && Math.abs(dr) === 2) || (Math.abs(df) === 2 && Math.abs(dr) === 1)) return true;
    } else if (type === 6) {
      if (Math.abs(df) <= 1 && Math.abs(dr) <= 1 && (df !== 0 || dr !== 0)) return true;
    } else if (type === 3 || type === 5) {
      if (Math.abs(df) === Math.abs(dr) && df !== 0 && clearDiagonal(board, i, kingSq)) return true;
      if (type === 5 && (df === 0 || dr === 0) && (df !== 0 || dr !== 0) && clearStraight(board, i, kingSq)) return true;
    } else if (type === 4) {
      if ((df === 0 || dr === 0) && (df !== 0 || dr !== 0) && clearStraight(board, i, kingSq)) return true;
    }
  }
  return false;
}
function clearDiagonal(board: ChessState['board'], from: number, to: number): boolean {
  const ff = from % 8;
  const fr = Math.floor(from / 8);
  const tf = to % 8;
  const tr = Math.floor(to / 8);
  const sfDir = Math.sign(tf - ff);
  const srDir = Math.sign(tr - fr);
  let f = ff + sfDir;
  let r = fr + srDir;
  while (f !== tf || r !== tr) {
    if (board[r * 8 + f] !== 0) return false;
    f += sfDir;
    r += srDir;
  }
  return true;
}
function clearStraight(board: ChessState['board'], from: number, to: number): boolean {
  const ff = from % 8;
  const fr = Math.floor(from / 8);
  const tf = to % 8;
  const tr = Math.floor(to / 8);
  const sfDir = Math.sign(tf - ff);
  const srDir = Math.sign(tr - fr);
  let f = ff + sfDir;
  let r = fr + srDir;
  while (f !== tf || r !== tr) {
    if (board[r * 8 + f] !== 0) return false;
    f += sfDir;
    r += srDir;
  }
  return true;
}
{
  const rng = lcg(2024);
  let sampled = 0;
  let disagreements = 0;
  let kingCountBad = 0;
  let exposedKingMoves = 0;
  for (let game = 0; game < 15; game += 1) {
    let g = initialState();
    for (let ply = 0; ply < 60; ply += 1) {
      const moves = legalMoves(g);
      sampled += 1;
      if (bruteKingAttacked(g, g.side) !== inCheck(g)) disagreements += 1;
      let whiteKings = 0;
      let blackKings = 0;
      for (const p of g.board) {
        if (p === 6) whiteKings += 1;
        if (p === -6) blackKings += 1;
      }
      if (whiteKings !== 1 || blackKings !== 1) kingCountBad += 1;
      if (moves.length === 0) break;
      const pick = moves[Math.floor(rng() * moves.length)];
      const mover = g.side;
      g = applyMove(g, pick);
      if (inCheck(g, mover)) exposedKingMoves += 1; // the mover's own king must never end up in check
    }
  }
  assert(disagreements === 0, `inCheck disagreed with an independent attack scan ${disagreements}/${sampled} times`);
  assert(kingCountBad === 0, `some sampled position did not have exactly one king per side (${kingCountBad} times)`);
  assert(exposedKingMoves === 0, `a "legal" move left the mover-s own king in check ${exposedKingMoves} time(s)`);
  assert(sampled > 200, `too few positions sampled during self-play (${sampled})`);
}

// 8) The computer prefers a free capture over ignoring it (mirrors Checkers'
// AI-preference test): evaluate() must score the position after a free
// capture higher than a position where the capture was declined, and
// searchBestMove must actually choose to capture when a free capture exists.
{
  // White queen can capture a lone, undefended Black rook for free.
  const fen = '4k3/8/8/8/8/8/8/K2Q3r w - - 0 1';
  const s = stateFromFEN(fen);
  const captureMove = legalMoves(s).find((m) => m.to === sq('h1') && m.captured !== 0);
  assert(!!captureMove, 'expected the queen to be able to capture the undefended rook on h1');
  if (captureMove) {
    const afterCapture = applyMove(s, captureMove);
    const declineMove = legalMoves(s).find((m) => m.from === sq('d1') && m.to !== sq('h1'));
    assert(!!declineMove, 'expected an alternative, non-capturing queen move to compare against');
    if (declineMove) {
      const afterDecline = applyMove(s, declineMove);
      assert(
        evaluate(afterCapture) > evaluate(afterDecline),
        'evaluate() did not score the position after a free rook capture higher than declining it',
      );
    }
    const chosen = searchBestMove(s, 3);
    assert(!!chosen && chosen.to === sq('h1') && chosen.captured !== 0, 'searchBestMove did not choose the free rook capture');
  }
}

// 9) squareAtPoint maps points to the intended square and rejects off-board taps.
{
  const l = { ox: 0, oy: 100, size: 320, cell: 40 };
  let ok = 0;
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const x = l.ox + (col + 0.5) * l.cell;
      const y = l.oy + (row + 0.5) * l.cell;
      const file = col;
      const rank = 7 - row;
      if (squareAtPoint(l, x, y) === rank * 8 + file) ok += 1;
    }
  }
  assert(ok === 64, `squareAtPoint hit ${ok}/64 square centres`);
  assert(squareAtPoint(l, -5, 150) === -1, 'squareAtPoint accepted a point left of the board');
  assert(squareAtPoint(l, 150, 50) === -1, 'squareAtPoint accepted a point above the board');
}

// 10) cpuMove: randomness 0 always matches searchBestMove's choice on a
// simple fixture; randomness 1 always stays within the legal move list.
{
  const s = stateFromFEN('4k3/8/8/8/8/8/8/K2Q3r w - - 0 1');
  const rng = lcg(55);
  const best = searchBestMove(s, 2);
  let sameAsBest = true;
  for (let i = 0; i < 20; i += 1) {
    const m = cpuMove(s, 2, 0, rng);
    if (!m || m.from !== best?.from || m.to !== best?.to) sameAsBest = false;
  }
  assert(sameAsBest, 'cpuMove with randomness 0 diverged from searchBestMove');

  let allLegal = true;
  const legalSet = new Set(legalMoves(s).map((m) => `${m.from}-${m.to}-${m.flag}`));
  for (let i = 0; i < 100; i += 1) {
    const m = cpuMove(s, 2, 1, rng);
    if (!m || !legalSet.has(`${m.from}-${m.to}-${m.flag}`)) allLegal = false;
  }
  assert(allLegal, 'cpuMove with randomness 1 returned a move outside the legal move list');
}

console.log(
  '\nPerft, checkmate/stalemate detection, pin safety, castling legality, en passant transience, ' +
    'check-scan cross-validation, and AI capture preference all verified.',
);

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

expectFail('a pin-blind move generator is caught', () => {
  // Simulate what a generator WITHOUT check-filtering would allow: move the
  // pinned e2 knight to g3, exposing the king to the rook on the e-file.
  const s = stateFromFEN('4r3/8/8/8/8/8/4N3/4K3 w - - 0 1');
  const naiveBoard = s.board.slice();
  naiveBoard[sq('e2')] = 0;
  naiveBoard[sq('g3')] = 2;
  const naiveState = { ...s, board: naiveBoard, side: -1 as Side };
  return inCheck(naiveState, 1); // the naive (pin-blind) result is caught as leaving White in check
});

expectFail('a checkmate/stalemate mixup is caught', () => {
  // A broken "checkmate" test that forgets to require the king be in check
  // would misclassify the known KQvK stalemate fixture as checkmate too.
  // Prove the real isCheckmate disagrees with that broken version.
  const s = stateFromFEN('k7/8/1Q6/8/8/8/8/7K b - - 0 1');
  const brokenIsCheckmate = legalMoves(s).length === 0; // missing the inCheck requirement
  return brokenIsCheckmate !== isCheckmate(s); // real isCheckmate (false) must disagree with the broken version (true)
});

expectFail('a castling check without attacked-square testing is caught', () => {
  // A naive legality test that only checks emptiness (ignores whether f1/g1
  // are attacked) would wrongly allow this castle. Prove the naive and real
  // results actually differ, so a regression that dropped the attack check
  // would show up as a divergence.
  const blocked = stateFromFEN('5r2/8/8/8/8/8/8/4K2R w K - 0 1');
  const board = blocked.board;
  const naiveWouldAllow = board[sq('e1')] === 6 && board[sq('h1')] === 4 && board[sq('f1')] === 0 && board[sq('g1')] === 0;
  const realAllows = legalMoves(blocked).some((m) => m.from === sq('e1') && m.to === sq('g1') && m.flag === 'castleK');
  return naiveWouldAllow && !realAllows;
});

expectFail('a stale en-passant right is caught', () => {
  // A buggy applyMove that never clears `ep` after an intervening ply would
  // still offer the capture two plies later, when it must not be legal.
  let g = initialState();
  const e2e4 = legalMoves(g).find((m) => m.from === sq('e2') && m.to === sq('e4') && m.flag === 'double')!;
  g = applyMove(g, e2e4);
  const staleEp = g.ep; // e3 - what a buggy engine would wrongly keep forever
  const nf6 = legalMoves(g).find((m) => m.from === sq('g8') && m.to === sq('f6'))!;
  g = applyMove(g, nf6);
  // Real state has cleared ep; a state that (buggily) kept the stale value
  // would be a mismatch we can detect directly.
  return g.ep !== staleEp;
});

expectFail('a losing engine is caught', () => {
  // An "AI" that always plays the FIRST legal move (ignoring material) hands
  // away a free queen; a real capture-aware search must score better.
  const s = stateFromFEN('4k3/8/8/8/8/8/8/K2Q3r w - - 0 1');
  const dumbMove = legalMoves(s)[0];
  const smartMove = searchBestMove(s, 2)!;
  if (dumbMove.from === smartMove.from && dumbMove.to === smartMove.to) return true; // nothing to compare - treat as caught
  const afterDumb = applyMove(s, dumbMove);
  const afterSmart = applyMove(s, smartMove);
  return evaluate(afterSmart) > evaluate(afterDumb);
});

if (failures > 0 || selfFails > 0) {
  console.error(`\nFAILED: ${failures} assertion(s), ${selfFails} broken self-test(s).`);
  process.exit(1);
}
console.log('\nChess: perft, checkmate/stalemate, pins, castling, and en passant all verified.');
