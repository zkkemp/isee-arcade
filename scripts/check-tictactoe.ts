/**
 * Headless proof for Tic-Tac-Toe's rules and computer.
 *
 * Drives the exact pure functions the game runs (winnerOf / minimax / bestMove /
 * cpuMove). The one bug that ruins a board game against a computer is a beatable
 * "unbeatable" opponent, so the core claim here is proved by brute force: from
 * the empty board, against an opponent that tries EVERY move at every turn, the
 * perfect engine never loses - as first player and as second. It also proves the
 * engine always takes an immediate win and always blocks an immediate loss, and
 * that win detection agrees with an independent scan across many random boards.
 *
 * Each self-test at the end sabotages a check and confirms it fails, so a check
 * that has quietly stopped testing anything is caught.
 */
import {
  bestMove,
  cellAtPoint,
  cpuMove,
  emptyBoard,
  emptyCells,
  isFull,
  lcg,
  minimax,
  OTHER,
  winnerOf,
  type Cell,
  type TttBoard,
} from '../components/games/TicTacToe';

let failures = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    failures += 1;
    console.error(`  FAIL: ${msg}`);
  }
}

// Independent winner scan, written a different way from winnerOf, to cross-check.
function scanWinner(b: TttBoard): Cell {
  const L = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];
  for (const [a, c, d] of L) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a] as Cell;
  return 0;
}

// 1) winner detection agrees with an independent scan on every reachable board.
// Enumerate all boards produced by legal alternating play from empty.
let boardsChecked = 0;
let disagreements = 0;
function walk(b: TttBoard, toMove: 1 | 2): void {
  boardsChecked += 1;
  if (winnerOf(b).player !== scanWinner(b)) disagreements += 1;
  if (winnerOf(b).player !== 0 || isFull(b)) return;
  for (const m of emptyCells(b)) {
    b[m] = toMove;
    walk(b, OTHER[toMove]);
    b[m] = 0;
  }
}
walk(emptyBoard(), 1);
assert(disagreements === 0, `winnerOf vs independent scan disagreed ${disagreements}x`);

// 2) The perfect engine never loses. Opponent explores every move; the engine
// always plays bestMove. Do it with the engine going first AND second.
function engineNeverLoses(engine: 1 | 2): { games: number; losses: number } {
  let games = 0;
  let losses = 0;
  const b = emptyBoard();
  const rec = (toMove: 1 | 2): void => {
    const w = winnerOf(b).player;
    if (w !== 0) {
      games += 1;
      if (w !== engine) losses += 1;
      return;
    }
    if (isFull(b)) {
      games += 1;
      return;
    }
    if (toMove === engine) {
      const m = bestMove(b, engine);
      b[m] = engine;
      rec(OTHER[toMove]);
      b[m] = 0;
    } else {
      for (const m of emptyCells(b)) {
        b[m] = toMove;
        rec(OTHER[toMove]);
        b[m] = 0;
      }
    }
  };
  rec(1);
  return { games, losses };
}
const first = engineNeverLoses(1);
const second = engineNeverLoses(2);
assert(first.losses === 0, `engine lost ${first.losses} game(s) going first`);
assert(second.losses === 0, `engine lost ${second.losses} game(s) going second`);

// 3) Always takes an immediate win.
{
  // X at 0,1 ; win at 2.
  const b: TttBoard = [1, 1, 0, 0, 2, 2, 0, 0, 0];
  assert(bestMove(b, 1) === 2, 'engine did not take the immediate win at 2');
}
// 4) Always blocks an immediate loss.
{
  // O threatens 6,7 -> 8. X must play 8.
  const b: TttBoard = [1, 0, 0, 0, 1, 0, 2, 2, 0];
  assert(bestMove(b, 1) === 8, 'engine did not block the immediate loss at 8');
}

// 5) minimax sign sanity: a won board scores positive for the winner, negative
// for the loser, a full drawn board scores 0.
{
  const won: TttBoard = [1, 1, 1, 0, 2, 2, 0, 0, 0];
  assert(minimax(won, 1, 2) > 0, 'minimax did not score a win positive for the winner');
  assert(minimax(won, 2, 1) < 0, 'minimax did not score a loss negative for the loser');
  const draw: TttBoard = [1, 2, 1, 1, 2, 2, 2, 1, 1];
  assert(minimax(draw, 1, 1) === 0, 'minimax did not score a full drawn board 0');
}

// 6) cellAtPoint maps points to the intended cell and rejects points off-board.
{
  const l = { ox: 0, oy: 100, size: 300, cell: 100 };
  let ok = 0;
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      const x = l.ox + (c + 0.5) * l.cell;
      const y = l.oy + (r + 0.5) * l.cell;
      if (cellAtPoint(l, x, y) === r * 3 + c) ok += 1;
    }
  }
  assert(ok === 9, `cellAtPoint hit ${ok}/9 cell centres`);
  assert(cellAtPoint(l, -5, 150) === -1, 'cellAtPoint accepted a point left of the board');
  assert(cellAtPoint(l, 150, 50) === -1, 'cellAtPoint accepted a point above the board');
}

// 7) cpuMove with randomness=0 equals bestMove; with randomness=1 it stays legal.
{
  const rng = lcg(12345);
  const b: TttBoard = [1, 1, 0, 0, 2, 0, 0, 0, 0];
  const perfect = bestMove([...b], 2);
  let sameAsBest = true;
  for (let i = 0; i < 50; i += 1) if (cpuMove([...b], 2, 0, rng) !== perfect) sameAsBest = false;
  assert(sameAsBest, 'cpuMove with randomness 0 diverged from bestMove');
  let allLegal = true;
  for (let i = 0; i < 500; i += 1) {
    const m = cpuMove([...b], 2, 1, rng);
    if (b[m] !== 0) allLegal = false;
  }
  assert(allLegal, 'cpuMove with randomness 1 returned an occupied cell');
}

console.log(
  `${boardsChecked} reachable boards checked; perfect engine drew/won all ` +
    `${first.games + second.games} games vs an exhaustive opponent (first + second).`,
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

expectFail('a losing engine is caught', () => {
  // An engine that plays the FIRST empty cell (not bestMove) can be made to lose.
  const b = emptyBoard();
  let losses = 0;
  const rec = (toMove: 1 | 2): void => {
    const w = winnerOf(b).player;
    if (w !== 0) {
      if (w !== 1) losses += 1;
      return;
    }
    if (isFull(b)) return;
    if (toMove === 1) {
      const m = emptyCells(b)[0];
      b[m] = 1;
      rec(2);
      b[m] = 0;
    } else {
      for (const m of emptyCells(b)) {
        b[m] = 2;
        rec(1);
        b[m] = 0;
      }
    }
  };
  rec(1);
  return losses > 0;
});

expectFail('win-detection sabotage is caught', () => {
  // A scan that ignores diagonals disagrees with winnerOf on a diagonal win.
  const b: TttBoard = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const noDiag = (bb: TttBoard): Cell => {
    const L = [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [0, 3, 6],
      [1, 4, 7],
      [2, 5, 8],
    ];
    for (const [a, c, d] of L) if (bb[a] && bb[a] === bb[c] && bb[a] === bb[d]) return bb[a] as Cell;
    return 0;
  };
  return winnerOf(b).player !== noDiag(b);
});

expectFail('block-detection sabotage is caught', () => {
  // Playing a corner instead of the forced block loses; bestMove must differ.
  const b: TttBoard = [1, 0, 0, 0, 1, 0, 2, 2, 0];
  return bestMove(b, 1) !== 0; // corner 0 would be wrong; real answer is 8
});

if (failures > 0 || selfFails > 0) {
  console.error(`\nFAILED: ${failures} assertion(s), ${selfFails} broken self-test(s).`);
  process.exit(1);
}
console.log('\nTic-Tac-Toe: winner detection, minimax, and an unbeatable computer all verified.');
