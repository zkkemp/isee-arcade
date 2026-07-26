/**
 * Verifies Sugar Swap's boards are fair, its gravity is honest, and every level
 * is actually winnable.
 *
 * A match-three fails in ways nothing in the type system or the renderer can
 * catch: a board that starts already matching, a board where no swap is legal
 * (a soft lock with no error), a column that loses a candy on the way down, and
 * a score target nobody can reach in the moves given. All four are proven here
 * against the real functions the game runs.
 *
 * Match detection and legal-move detection are each checked against a second,
 * deliberately naive implementation written in this file - a sliding window over
 * every triple rather than the game's run scanner - so agreement between them
 * means something.
 *
 * Run: npx tsx scripts/check-match3.ts
 */
import {
  CELL_COUNT,
  COLS,
  MAX_CASCADE,
  ROWS,
  applyResolution,
  buildLevel,
  cloneBoard,
  collapse,
  colOf,
  colorsFor,
  clusterRuns,
  findLegalMoves,
  fillNoMatch,
  findRuns,
  hasLegalMove,
  idx,
  isLegalSwap,
  isSpecialSwap,
  lcg,
  makeBoard,
  moveValue,
  refill,
  resolveMatches,
  resolveSwapActivation,
  rowOf,
  scoreFor,
  settleBoard,
  shuffleBoard,
  spawnKindFor,
  type Board,
  type Kind,
  type LevelSpec,
  type Piece,
} from '../components/games/Match3';
import {
  cellPointer,
  draw,
  makeLayout,
  makeSim,
  pointerGrid,
  gridIndex,
  update,
  type Sim,
} from '../components/games/Match3';
import { InputController } from '../lib/input';
import type { GameApi } from '../lib/games';
import { DIFFICULTIES, type Difficulty } from '../lib/difficulty';

const LEVELS = 30;
const SEEDS = 12;

const errors: string[] = [];
const fail = (m: string) => errors.push(m);

// --- an independent match detector -----------------------------------------
//
// Deliberately not the game's algorithm: this slides a window of three over every
// row and column and marks all three cells when they agree. If this and
// `findRuns` ever disagree, one of them is wrong and the game is either clearing
// candies it should not or leaving matches on the board.
function refMatched(board: Board): Set<number> {
  const out = new Set<number>();
  const same = (a: number, b: number, c: number) => {
    const pa = board[a];
    const pb = board[b];
    const pc = board[c];
    if (!pa || !pb || !pc) return false;
    if (pa.color < 0) return false;
    return pa.color === pb.color && pb.color === pc.color;
  };
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c + 2 < COLS; c += 1) {
      const a = idx(r, c);
      if (same(a, a + 1, a + 2)) {
        out.add(a);
        out.add(a + 1);
        out.add(a + 2);
      }
    }
  }
  for (let c = 0; c < COLS; c += 1) {
    for (let r = 0; r + 2 < ROWS; r += 1) {
      const a = idx(r, c);
      if (same(a, a + COLS, a + 2 * COLS)) {
        out.add(a);
        out.add(a + COLS);
        out.add(a + 2 * COLS);
      }
    }
  }
  return out;
}

/** Legal-move detector built on the independent match detector. */
function refHasLegalMove(board: Board): boolean {
  for (let i = 0; i < CELL_COUNT; i += 1) {
    for (const j of [i + 1, i + COLS]) {
      if (j >= CELL_COUNT) continue;
      if (j === i + 1 && colOf(j) === 0) continue;
      const pa = board[i];
      const pb = board[j];
      if (!pa || !pb) continue;
      if (isSpecialSwap(pa, pb)) return true;
      const copy = cloneBoard(board);
      copy[i] = pb;
      copy[j] = pa;
      if (refMatched(copy).size > 0) return true;
    }
  }
  return false;
}

function setsEqual(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

function plainBoard(rand: () => number, colors: number): Board {
  const b: Board = new Array<Piece | null>(CELL_COUNT).fill(null);
  for (let i = 0; i < CELL_COUNT; i += 1) {
    b[i] = { color: Math.floor(rand() * colors) % colors, kind: 'plain' };
  }
  return b;
}

/**
 * After a collapse every candy in a column has to be resting at the bottom, so
 * scanning a column downward the holes all come first: a hole appearing below a
 * candy means something is hovering. Nothing may go missing on the way down either.
 */
function gravityProblem(board: Board, expectedCount: number): string | null {
  let count = 0;
  for (let c = 0; c < COLS; c += 1) {
    let seenCandy = false;
    for (let r = 0; r < ROWS; r += 1) {
      const p = board[idx(r, c)];
      if (p) {
        count += 1;
        seenCandy = true;
      } else if (seenCandy) {
        return `hole at (${r},${c}) with a candy left hovering above it`;
      }
    }
  }
  if (count !== expectedCount) return `piece count changed: ${expectedCount} -> ${count}`;
  return null;
}

/**
 * A board with no legal move, built rather than searched for: three colours laid
 * out as colour = (r + 2c) mod 3.
 *
 * Every row reads x, x+2, x+1, x, ... and every column x, x+1, x+2, x, ... so no
 * run of three exists to begin with. It is dead because of what the diagonals do:
 * whichever way a pair is swapped, each moved candy lands with exactly one
 * matching neighbour and the cell beyond it is always the third colour, so a pair
 * is the best any single swap can manage.
 */
function deadBoard(): Board {
  const b: Board = new Array<Piece | null>(CELL_COUNT).fill(null);
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) b[idx(r, c)] = { color: (r + 2 * c) % 3, kind: 'plain' };
  }
  return b;
}

/** A filled board with no match anywhere, which is what the game deals out. */
function cleanBoard(seed: number, colors: number): Board {
  const b: Board = new Array<Piece | null>(CELL_COUNT).fill(null);
  fillNoMatch(b, lcg(seed), colors);
  return b;
}

// --- 1. generation ----------------------------------------------------------

let boardsChecked = 0;
let movesSeen = 0;

for (const d of DIFFICULTIES) {
  for (let level = 1; level <= LEVELS; level += 1) {
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const spec = buildLevel(level, d, seed * 7919);
      const board = makeBoard(spec);
      const at = `${d} level ${level} seed ${seed}`;
      boardsChecked += 1;

      if (board.length !== CELL_COUNT || board.some((p) => !p)) {
        fail(`${at}: board is not completely filled`);
        continue;
      }
      for (const p of board) {
        if (p!.color < 0 || p!.color >= spec.colors) {
          fail(`${at}: colour ${p!.color} outside 0..${spec.colors - 1}`);
          break;
        }
        if (p!.kind !== 'plain') {
          fail(`${at}: a fresh board should hold no specials, found ${p!.kind}`);
          break;
        }
      }

      // A pre-made match plays a cascade the player did not earn and steals the
      // first move.
      const runs = findRuns(board);
      if (runs.length > 0) {
        fail(`${at}: ${runs.length} pre-made match(es), first at cell ${runs[0].cells[0]}`);
      }
      if (refMatched(board).size > 0) {
        fail(`${at}: the independent detector sees a pre-made match`);
      }

      // No legal move is a soft lock before the player has done anything.
      const legal = findLegalMoves(board);
      movesSeen += legal.length;
      if (legal.length === 0) fail(`${at}: opening board has no legal move`);
      if (!hasLegalMove(board)) fail(`${at}: hasLegalMove disagrees with findLegalMoves`);
      if (!refHasLegalMove(board)) fail(`${at}: the independent detector finds no legal move`);

      if (JSON.stringify(makeBoard(spec)) !== JSON.stringify(board)) {
        fail(`${at}: makeBoard is not deterministic`);
      }
    }
  }
}

// --- 2. match detection, against the naive detector -------------------------

let detectionTrials = 0;
let detectedCells = 0;

for (let trial = 0; trial < 2500; trial += 1) {
  const rand = lcg(0x51a3 + trial * 2654435761);
  const colors = 3 + (trial % 5); // Few colours, so matches are common.
  const board = plainBoard(rand, colors);
  detectionTrials += 1;

  const mine = new Set<number>(findRuns(board).flatMap((r) => r.cells));
  const ref = refMatched(board);
  detectedCells += ref.size;
  if (!setsEqual(mine, ref)) {
    const missed = [...ref].filter((i) => !mine.has(i));
    const bogus = [...mine].filter((i) => !ref.has(i));
    fail(
      `trial ${trial}: findRuns disagrees with the naive detector - ` +
        `missed ${missed.length} (${missed.slice(0, 4).join(',')}), ` +
        `false ${bogus.length} (${bogus.slice(0, 4).join(',')})`,
    );
  }

  // Every reported run really is a straight line of one colour.
  for (const run of findRuns(board)) {
    if (run.cells.length < 3) fail(`trial ${trial}: run of ${run.cells.length} reported`);
    for (const cell of run.cells) {
      if (board[cell]!.color !== run.color) fail(`trial ${trial}: run holds a foreign colour`);
    }
    const straight =
      run.dir === 'h'
        ? run.cells.every((c, k) => c === run.cells[0] + k)
        : run.cells.every((c, k) => c === run.cells[0] + k * COLS);
    if (!straight) fail(`trial ${trial}: ${run.dir} run is not contiguous`);
  }

}

// --- 2b. legal-move detection, on match-free boards --------------------------
//
// Separated from the trials above on purpose: `isLegalSwap` asks whether a swap
// creates a new run, so it can only be compared against a whole-board sweep on a
// board that has no runs already - which is the only kind the game ever hands to
// the player.

let swapTrials = 0;
let legalSwapsFound = 0;

for (let trial = 0; trial < 900; trial += 1) {
  const colors = 5 + (trial % 3);
  const board = cleanBoard(0x77b1 + trial * 40503, colors);
  swapTrials += 1;
  if (findRuns(board).length > 0) {
    fail(`swap trial ${trial}: fillNoMatch produced a board that already matches`);
    continue;
  }

  let expected = 0;
  for (let i = 0; i < CELL_COUNT; i += 1) {
    for (const j of [i + 1, i + COLS]) {
      if (j >= CELL_COUNT) continue;
      if (j === i + 1 && colOf(j) === 0) continue;
      const copy = cloneBoard(board);
      copy[i] = board[j];
      copy[j] = board[i];
      const slow = refMatched(copy).size > 0;
      const quick = isLegalSwap(board, i, j);
      if (quick !== slow) {
        fail(`swap trial ${trial}: isLegalSwap(${i},${j}) says ${quick}, the naive sweep says ${slow}`);
      }
      if (slow) expected += 1;
    }
  }
  legalSwapsFound += expected;

  const listed = findLegalMoves(board);
  if (listed.length !== expected) {
    fail(`swap trial ${trial}: findLegalMoves listed ${listed.length}, expected ${expected}`);
  }
  if (hasLegalMove(board) !== (expected > 0)) {
    fail(`swap trial ${trial}: hasLegalMove disagrees with the naive legal-move detector`);
  }
  if (refHasLegalMove(board) !== (expected > 0)) {
    fail(`swap trial ${trial}: the naive detectors disagree with each other`);
  }
  // Swapping a piece with a non-neighbour, or with itself, is never a move.
  if (isLegalSwap(board, 0, 0) || isLegalSwap(board, 0, 2) || isLegalSwap(board, 0, COLS + 1)) {
    fail(`swap trial ${trial}: a non-adjacent swap was accepted`);
  }
}

// --- 3. shapes earn the right special ---------------------------------------

function boardOf(plan: string[]): Board {
  const b: Board = new Array<Piece | null>(CELL_COUNT).fill(null);
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      // Anything not named in the plan gets a filler colour that cannot match:
      // a repeating 3-cycle offset per row never makes a run of three.
      const ch = plan[r]?.[c] ?? '.';
      const color = ch === '.' ? 4 + ((r + c) % 3) : Number(ch);
      b[idx(r, c)] = { color, kind: 'plain' };
    }
  }
  return b;
}

const SHAPES: Array<{ name: string; plan: string[]; want: Kind | null; size: number }> = [
  { name: 'three across', plan: ['000'], want: null, size: 3 },
  { name: 'four across', plan: ['0000'], want: 'lineH', size: 4 },
  { name: 'five across', plan: ['00000'], want: 'rainbow', size: 5 },
  { name: 'three down', plan: ['0', '0', '0'], want: null, size: 3 },
  { name: 'four down', plan: ['0', '0', '0', '0'], want: 'lineV', size: 4 },
  { name: 'L shape', plan: ['000', '0', '0'], want: 'bomb', size: 5 },
  { name: 'T shape', plan: ['000', '.0', '.0'], want: 'bomb', size: 5 },
  { name: 'plus shape', plan: ['.0', '000', '.0'], want: 'bomb', size: 5 },
];

for (const shape of SHAPES) {
  const board = boardOf(shape.plan);
  const clusters = clusterRuns(findRuns(board));
  const target = clusters.find((cl) => cl.color === 0);
  if (!target) {
    fail(`${shape.name}: no cluster of the planted colour found`);
    continue;
  }
  if (target.cells.length !== shape.size) {
    fail(`${shape.name}: cluster covers ${target.cells.length} cells, expected ${shape.size}`);
  }
  const got = spawnKindFor(target);
  if (got !== shape.want) fail(`${shape.name}: earns ${got}, expected ${shape.want}`);
  if (clusters.length !== 1) fail(`${shape.name}: ${clusters.length} clusters, expected 1`);
}

// --- 4. gravity -------------------------------------------------------------

let gravityTrials = 0;
let holesPunched = 0;

for (let trial = 0; trial < 3000; trial += 1) {
  const rand = lcg(0x9e11 + trial * 40503);
  const colors = 5 + (trial % 3);
  const board = plainBoard(rand, colors);

  // Punch a random set of holes, including whole columns.
  let holes = 0;
  for (let i = 0; i < CELL_COUNT; i += 1) {
    if (rand() < 0.3) {
      board[i] = null;
      holes += 1;
    }
  }
  if (trial % 17 === 0) {
    for (let r = 0; r < ROWS; r += 1) {
      const i = idx(r, trial % COLS);
      if (board[i]) holes += 1;
      board[i] = null;
    }
  }
  holesPunched += holes;
  gravityTrials += 1;

  const before = board.filter((p) => p).length;
  const survivors: number[][] = [];
  for (let c = 0; c < COLS; c += 1) {
    const col: number[] = [];
    for (let r = 0; r < ROWS; r += 1) {
      const p = board[idx(r, c)];
      if (p) col.push(p.color);
    }
    survivors.push(col);
  }

  const falls = collapse(board);
  const problem = gravityProblem(board, before);
  if (problem) fail(`gravity trial ${trial}: ${problem}`);

  // Order within a column must survive: gravity may not shuffle a column.
  for (let c = 0; c < COLS; c += 1) {
    const after: number[] = [];
    for (let r = 0; r < ROWS; r += 1) {
      const p = board[idx(r, c)];
      if (p) after.push(p.color);
    }
    if (after.join(',') !== survivors[c].join(',')) {
      fail(`gravity trial ${trial}: column ${c} order changed`);
    }
  }
  for (const f of falls) {
    if (colOf(f.from) !== colOf(f.to)) fail(`gravity trial ${trial}: a candy changed column`);
    if (rowOf(f.to) <= rowOf(f.from)) fail(`gravity trial ${trial}: a candy fell upward`);
  }

  const entries = refill(board, rand, colors);
  if (board.some((p) => !p)) fail(`gravity trial ${trial}: refill left a hole`);
  if (entries.length !== CELL_COUNT - before) {
    fail(`gravity trial ${trial}: refilled ${entries.length}, expected ${CELL_COUNT - before}`);
  }
  for (const e of entries) {
    if (e.dist < 1 || e.dist > ROWS) fail(`gravity trial ${trial}: fall distance ${e.dist}`);
  }
}

// --- 5. cascades terminate ---------------------------------------------------

let cascadeRuns = 0;
let deepestCascade = 0;
let cascadeCleared = 0;

for (const d of DIFFICULTIES) {
  for (let seed = 0; seed < 220; seed += 1) {
    const colors = colorsFor(d);
    const rand = lcg(0x2f7a + seed * 2246822519);
    // Start from a fully random board, which usually is already matching - the
    // harshest input a cascade can get.
    const board = plainBoard(rand, colors);
    const stats = settleBoard(board, rand, colors);
    cascadeRuns += 1;
    cascadeCleared += stats.cleared;
    deepestCascade = Math.max(deepestCascade, stats.iterations);

    if (stats.iterations >= MAX_CASCADE) {
      fail(`${d} cascade seed ${seed}: hit the ${MAX_CASCADE}-step ceiling, so it may not settle`);
    }
    if (findRuns(board).length > 0) {
      fail(`${d} cascade seed ${seed}: settled with matches still on the board`);
    }
    if (board.some((p) => !p)) fail(`${d} cascade seed ${seed}: settled with a hole`);
  }
}

// --- 6. every level is winnable ---------------------------------------------

type Play = { score: number; moves: number; shuffles: number; deepest: number };

/**
 * A greedy player: always takes the swap that clears the most right now. Weaker
 * than a person who plans ahead, so if greedy beats the target the level is
 * comfortably passable.
 */
function playGreedy(spec: LevelSpec): Play {
  const board = makeBoard(spec);
  const rand = lcg(spec.seed ^ 0x5bf03635);
  const out: Play = { score: 0, moves: 0, shuffles: 0, deepest: 0 };

  for (let move = 0; move < spec.moves; move += 1) {
    let moves = findLegalMoves(board);
    for (let tries = 0; moves.length === 0 && tries < 20; tries += 1) {
      // Reshuffling is free in the game too: a dead board is not the player's
      // fault, so it does not cost a move.
      shuffleBoard(board, rand, spec.colors);
      out.shuffles += 1;
      moves = findLegalMoves(board);
    }
    if (moves.length === 0) {
      fail(`level ${spec.level} ${spec.difficulty} seed ${spec.seed}: could not un-stick the board`);
      break;
    }

    let best = moves[0];
    let bestValue = -1;
    for (const mv of moves) {
      const v = moveValue(board, mv);
      if (v > bestValue) {
        bestValue = v;
        best = mv;
      }
    }

    const pa = board[best.a];
    board[best.a] = board[best.b];
    board[best.b] = pa;
    const stats = settleBoard(board, rand, spec.colors, best.a, best.b);
    out.score += stats.score;
    out.moves += 1;
    out.deepest = Math.max(out.deepest, stats.iterations);
    if (stats.iterations === 0) {
      fail(`level ${spec.level} ${spec.difficulty}: a legal move cleared nothing`);
    }
  }
  return out;
}

type Margin = { at: string; ratio: number; score: number; target: number };
let worst: Margin | null = null;
let levelsPlayed = 0;
let totalMoves = 0;
let totalShuffles = 0;
const perDifficulty = new Map<Difficulty, { min: number; max: number; sum: number; n: number }>();

for (const d of DIFFICULTIES) {
  for (let level = 1; level <= LEVELS; level += 1) {
    for (let seed = 1; seed <= 6; seed += 1) {
      const spec = buildLevel(level, d, seed * 104729);
      const play = playGreedy(spec);
      levelsPlayed += 1;
      totalMoves += play.moves;
      totalShuffles += play.shuffles;
      const ratio = play.score / spec.target;
      const at = `${d} level ${level} seed ${seed}`;
      if (play.score < spec.target) {
        fail(
          `${at}: greedy play scored ${play.score} in ${play.moves} moves but the target is ` +
            `${spec.target} - this level is not winnable`,
        );
      }
      if (!worst || ratio < worst.ratio) {
        worst = { at, ratio, score: play.score, target: spec.target };
      }
      const agg = perDifficulty.get(d) ?? { min: Infinity, max: 0, sum: 0, n: 0 };
      agg.min = Math.min(agg.min, ratio);
      agg.max = Math.max(agg.max, ratio);
      agg.sum += ratio;
      agg.n += 1;
      perDifficulty.set(d, agg);
    }
  }
}

// --- 7. difficulty really is ordered ----------------------------------------
//
// Deliberately NOT "hard has a bigger target": a seventh colour cuts the scoring
// rate by roughly half, so hard's points target is lower in absolute terms while
// being much harder to reach. The honest statements are about moves, colours, and
// the margin the greedy solver clears each difficulty by, measured above.

for (let level = 1; level <= LEVELS; level += 1) {
  const [e, n, h] = DIFFICULTIES.map((d) => buildLevel(level, d, 1));
  if (!(e.moves >= n.moves && n.moves >= h.moves)) {
    fail(`level ${level}: move limits are not easy >= normal >= hard`);
  }
  if (!(e.colors <= n.colors && n.colors <= h.colors)) {
    fail(`level ${level}: colour counts are not easy <= normal <= hard`);
  }
  for (const d of DIFFICULTIES) {
    const cur = buildLevel(level, d, 1);
    if (cur.target < 200) fail(`level ${level} ${d}: target ${cur.target} is below the floor`);
    if (level > 1) {
      const prev = buildLevel(level - 1, d, 1);
      if (cur.target < prev.target) fail(`level ${level} ${d}: target went down from ${prev.target}`);
    }
  }
}
for (const d of DIFFICULTIES) {
  const first = buildLevel(1, d, 1).target;
  const last = buildLevel(LEVELS, d, 1).target;
  // A level list whose target never moves is not a level list.
  if (last <= first) fail(`${d}: target does not rise across ${LEVELS} levels (${first} -> ${last})`);
  if (last < first * 1.4) fail(`${d}: target only rose from ${first} to ${last} over ${LEVELS} levels`);
}

{
  const mins = DIFFICULTIES.map((d) => perDifficulty.get(d)?.min ?? 0);
  if (!(mins[0] > mins[1] && mins[1] > mins[2])) {
    fail(
      `difficulty margins are not ordered: easy clears its target by ${mins[0].toFixed(2)}x, ` +
        `normal ${mins[1].toFixed(2)}x, hard ${mins[2].toFixed(2)}x`,
    );
  }
  // Easy has to be genuinely easy - the youngest player is about five.
  if (mins[0] < 2.5) fail(`easy only clears its target by ${mins[0].toFixed(2)}x in the worst case`);
  if (mins[2] < 1.5) fail(`hard clears its target by only ${mins[2].toFixed(2)}x in the worst case`);
}

// --- 8. the reshuffle escape hatch ------------------------------------------

{
  const dead = deadBoard();
  if (hasLegalMove(dead)) {
    fail('the constructed dead board turned out to have a legal move, so section 8 proves nothing');
  } else {
    const rand = lcg(12345);
    let recovered = 0;
    for (let trial = 0; trial < 200; trial += 1) {
      const b = deadBoard();
      // Two colours cannot be arranged into a live board, so the fallback has to
      // deal fresh colours. That is the path being proven here.
      if (!shuffleBoard(b, rand, 5)) continue;
      if (findRuns(b).length === 0 && hasLegalMove(b)) recovered += 1;
    }
    if (recovered < 200) fail(`reshuffle recovered only ${recovered}/200 dead boards`);
  }
}

// --- 9. special activation --------------------------------------------------

{
  // A row blaster must take its whole row and nothing above or below it.
  const board = plainBoard(lcg(99), 6);
  for (let i = 0; i < CELL_COUNT; i += 1) board[i] = { color: 0, kind: 'plain' };
  // A uniform board would match everywhere, so paint a safe checker first.
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      board[idx(r, c)] = { color: (r * 2 + c) % 5, kind: 'plain' };
    }
  }
  const a = idx(3, 3);
  const b = idx(3, 4);
  board[a] = { color: 1, kind: 'lineH' };
  board[b] = { color: 2, kind: 'lineV' };
  const res = resolveSwapActivation(board, a, b);
  if (!res) fail('special swap: two blasters swapped produced nothing');
  else {
    const cells = new Set(res.cleared);
    for (let c = 0; c < COLS; c += 1) {
      if (!cells.has(idx(3, c))) fail(`special swap: row cell (3,${c}) survived a blaster cross`);
    }
    for (let r = 0; r < ROWS; r += 1) {
      if (!cells.has(idx(r, 4))) fail(`special swap: column cell (${r},4) survived`);
    }
    if (cells.has(idx(0, 0))) fail('special swap: a blaster cross reached a far corner');
  }

  // A colour bomb takes every candy of the colour it was swapped with.
  const cb = plainBoard(lcg(7), 5);
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) cb[idx(r, c)] = { color: (r + c) % 5, kind: 'plain' };
  }
  const rb = idx(4, 4);
  cb[rb] = { color: -1, kind: 'rainbow' };
  const partner = idx(4, 5);
  const partnerColor = cb[partner]!.color;
  const res2 = resolveSwapActivation(cb, rb, partner);
  if (!res2) fail('colour bomb: swapping with a plain candy produced nothing');
  else {
    const cells = new Set(res2.cleared);
    for (let i = 0; i < CELL_COUNT; i += 1) {
      if (cb[i]?.color === partnerColor && !cells.has(i)) {
        fail(`colour bomb: left a candy of colour ${partnerColor} at ${i}`);
        break;
      }
    }
    if (!cells.has(rb)) fail('colour bomb: did not consume itself');
  }

  // A match containing a blaster sets it off as well as clearing the match.
  const chain = boardOf(['000']);
  chain[idx(0, 1)] = { color: 0, kind: 'lineV' };
  const res3 = resolveMatches(chain, idx(0, 0), idx(0, 1));
  if (!res3) fail('chain: a planted three did not resolve');
  else {
    if (res3.activated < 1) fail('chain: the blaster caught in the match never went off');
    const cells = new Set(res3.cleared);
    if (!cells.has(idx(5, 1))) fail('chain: the blaster did not clear its column');
  }
}

// --- 10. scoring is monotone ------------------------------------------------

for (let n = 3; n <= 20; n += 1) {
  if (scoreFor(n, 1, 0) <= scoreFor(n - 1, 1, 0)) fail(`scoring: ${n} cleared is not worth more`);
}
for (let combo = 2; combo <= 8; combo += 1) {
  if (scoreFor(5, combo, 0) < scoreFor(5, combo - 1, 0)) {
    fail(`scoring: cascade step ${combo} pays less than ${combo - 1}`);
  }
}
if (scoreFor(5, 1, 1) <= scoreFor(5, 1, 0)) fail('scoring: making a special is worth nothing');


// --- 11. the real frame loop: input, rendering, level flow --------------------
//
// Everything above tests the board. This drives the component's own `update` and
// `draw` headlessly against a recording canvas, because the failures left are the
// ones that only exist once a finger is involved: a tap that lands on the wrong
// cell, a rejected swap that still costs a move, a NaN reaching the renderer.

const CW = 420;
const CH = 760;
const LAY = makeLayout(CW, CH, 0);

type Calls = { score: number; gates: string[]; deaths: string[]; status: string[] };

function stubApi(calls: Calls): GameApi {
  return {
    addScore: (n) => {
      if (!Number.isFinite(n) || n <= 0) fail(`api.addScore called with ${n}`);
      calls.score += n;
    },
    requestGate: (label) => calls.gates.push(label),
    died: (label) => calls.deaths.push(label ?? ''),
    setStatus: (text) => {
      if (text !== null) calls.status.push(text);
    },
  };
}

/**
 * A canvas that records instead of painting, and complains about any non-finite
 * number it is handed. A NaN coordinate paints nothing and throws nothing, which is
 * exactly the kind of bug that survives a code review.
 */
const badArgs: string[] = [];
let drawCalls = 0;
const GRADIENT = { addColorStop: () => {} };
const RECORDING_CTX = new Proxy(
  {},
  {
    get: (_t, k) => {
      const key = String(k);
      if (key === 'createLinearGradient' || key === 'createRadialGradient') {
        return (...a: number[]) => {
          for (const v of a) if (!Number.isFinite(v)) badArgs.push(`${key}(${a.join(',')})`);
          return GRADIENT;
        };
      }
      if (key === 'canvas') return { width: CW, height: CH };
      if (key === 'measureText') return () => ({ width: 8 });
      if (
        ['font', 'fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha', 'textAlign', 'textBaseline', 'lineCap'].includes(key)
      ) {
        return '';
      }
      return (...a: unknown[]) => {
        drawCalls += 1;
        for (const v of a) if (typeof v === 'number' && !Number.isFinite(v)) badArgs.push(`${key}(${a.join(',')})`);
        return undefined;
      };
    },
    set: () => true,
  },
) as CanvasRenderingContext2D;

type Rig = { sim: Sim; input: InputController; api: GameApi; calls: Calls; difficulty: Difficulty };

function rig(level: number, difficulty: Difficulty, seed: number): Rig {
  const calls: Calls = { score: 0, gates: [], deaths: [], status: [] };
  return { sim: makeSim(level, difficulty, seed), input: new InputController(), api: stubApi(calls), calls, difficulty };
}

/** Runs frames, drawing every one, until `until` is happy or the budget runs out. */
function run(r: Rig, frames: number, until?: (s: Sim) => boolean): number {
  for (let f = 0; f < frames; f += 1) {
    r.sim = update(r.sim, 1 / 60, r.input, r.api, LAY, CW, CH, r.difficulty, 1);
    draw(RECORDING_CTX, r.sim, LAY, CW, CH, false);
    if (until && until(r.sim)) return f + 1;
  }
  return frames;
}

function tap(r: Rig, cell: number): void {
  const p = cellPointer(LAY, CW, CH, cell);
  r.input.setPointer(p.x, p.y, true);
  run(r, 1);
  r.input.setPointer(p.x, p.y, false);
  run(r, 1);
}

{
  // --- the pointer mapping itself ---
  for (let i = 0; i < CELL_COUNT; i += 1) {
    const p = cellPointer(LAY, CW, CH, i);
    const got = gridIndex(pointerGrid(LAY, CW, CH, p.x, p.y));
    if (got !== i) fail(`pointer mapping: the centre of cell ${i} reads as cell ${got}`);
  }
  // Off the board reads as nothing, rather than as the nearest cell.
  if (gridIndex(pointerGrid(LAY, CW, CH, 0.5, 0.001)) !== -1) {
    fail('pointer mapping: a tap above the board landed on a cell');
  }
  if (gridIndex(pointerGrid(LAY, CW, CH, 0.5, 0.999)) !== -1) {
    fail('pointer mapping: a tap below the board landed on a cell');
  }
  if (pointerGrid(LAY, CW, CH, null, null) !== null) fail('pointer mapping: a null pointer read as a position');
}

let interactions = 0;

{
  // --- tap one candy, then tap its neighbour ---
  const r = rig(1, 'easy', 4242);
  run(r, 400, (s) => s.phase === 'idle');
  if (r.sim.phase !== 'idle') fail(`interaction: the board never became playable (stuck in ${r.sim.phase})`);
  const moves = findLegalMoves(r.sim.board);
  if (moves.length === 0) fail('interaction: opening board had no legal move');
  const mv = moves[0];
  const startMoves = r.sim.movesLeft;

  tap(r, mv.a);
  if (r.sim.sel !== mv.a) fail(`interaction: tapping cell ${mv.a} did not select it (sel=${r.sim.sel})`);
  if (r.sim.movesLeft !== startMoves) fail('interaction: selecting a candy cost a move');

  tap(r, mv.b);
  interactions += 1;
  if (r.sim.movesLeft !== startMoves - 1) {
    fail(`interaction: a legal swap cost ${startMoves - r.sim.movesLeft} moves, expected 1`);
  }
  run(r, 400, (s) => s.phase === 'idle');
  if (r.calls.score <= 0) fail('interaction: a legal swap scored nothing');
  if (findRuns(r.sim.board).length > 0) fail('interaction: the board settled with matches on it');
  if (r.sim.board.some((p) => !p)) fail('interaction: the board settled with a hole');
}

{
  // --- a rejected swap must be free ---
  const r = rig(1, 'normal', 909090);
  run(r, 400, (s) => s.phase === 'idle');
  let dud = -1;
  for (let i = 0; i < CELL_COUNT && dud < 0; i += 1) {
    if (colOf(i) + 1 < COLS && !isLegalSwap(r.sim.board, i, i + 1)) dud = i;
  }
  if (dud < 0) {
    fail('interaction: could not find an illegal swap to try');
  } else {
    const before = r.sim.movesLeft;
    const scoreBefore = r.calls.score;
    tap(r, dud);
    tap(r, dud + 1);
    interactions += 1;
    run(r, 120, (s) => s.phase === 'idle');
    if (r.sim.movesLeft !== before) fail(`interaction: a rejected swap cost ${before - r.sim.movesLeft} move(s)`);
    if (r.calls.score !== scoreBefore) fail('interaction: a rejected swap scored points');
    if (r.sim.phase !== 'idle') fail(`interaction: a rejected swap left the game in ${r.sim.phase}`);
  }
}

{
  // --- press and drag, which is what a kid tries first ---
  const r = rig(1, 'easy', 777001);
  run(r, 400, (s) => s.phase === 'idle');
  const mv = findLegalMoves(r.sim.board)[0];
  const from = cellPointer(LAY, CW, CH, mv.a);
  const to = cellPointer(LAY, CW, CH, mv.b);
  const before = r.sim.movesLeft;
  r.input.setPointer(from.x, from.y, true);
  run(r, 1);
  // Two thirds of the way to the neighbour, finger still down.
  r.input.setPointer(from.x + (to.x - from.x) * 0.66, from.y + (to.y - from.y) * 0.66, true);
  run(r, 1);
  interactions += 1;
  if (r.sim.movesLeft !== before - 1) fail('interaction: dragging a candy onto its neighbour did not swap');
  r.input.setPointer(null, null, false);
  run(r, 400, (s) => s.phase === 'idle');
  if (r.calls.score <= 0) fail('interaction: the drag swap scored nothing');
}

{
  // --- running out of moves reports a death, and the level restarts ---
  const r = rig(30, 'hard', 5150);
  let guard = 0;
  while (r.calls.deaths.length === 0 && r.calls.gates.length === 0 && guard < 400) {
    guard += 1;
    run(r, 600, (s) => s.phase === 'idle' || s.phase === 'lost' || s.phase === 'won');
    if (r.sim.phase !== 'idle') {
      run(r, 200);
      continue;
    }
    // Play the worst legal move available, to burn moves without scoring much.
    const moves = findLegalMoves(r.sim.board);
    if (moves.length === 0) {
      run(r, 200);
      continue;
    }
    let worst = moves[0];
    let worstValue = Infinity;
    for (const m of moves) {
      const v = moveValue(r.sim.board, m);
      if (v < worstValue) {
        worstValue = v;
        worst = m;
      }
    }
    tap(r, worst.a);
    tap(r, worst.b);
  }
  if (r.calls.deaths.length === 0 && r.calls.gates.length === 0) {
    fail('level flow: 30 moves of play ended in neither a cleared level nor a death');
  }
  if (r.calls.deaths.length > 0) {
    if (r.sim.movesLeft !== 22) fail(`level flow: after a death the retry has ${r.sim.movesLeft} moves, expected 22`);
    if (r.sim.score !== 0) fail('level flow: the retry kept the failed level score');
  }
  if (r.calls.gates.length > 0 && !/Level \d+ cleared/.test(r.calls.gates[0])) {
    fail(`level flow: gate label was "${r.calls.gates[0]}"`);
  }
  if (r.calls.status.length === 0) fail('level flow: the game never set a status line');
}

{
  // --- clearing a level gates and moves on ---
  const r = rig(1, 'easy', 31415);
  let guard = 0;
  while (r.calls.gates.length === 0 && guard < 200) {
    guard += 1;
    run(r, 600, (s) => s.phase === 'idle');
    if (r.sim.phase !== 'idle') continue;
    const moves = findLegalMoves(r.sim.board);
    if (moves.length === 0) continue;
    let best = moves[0];
    let bestValue = -1;
    for (const m of moves) {
      const v = moveValue(r.sim.board, m);
      if (v > bestValue) {
        bestValue = v;
        best = m;
      }
    }
    tap(r, best.a);
    tap(r, best.b);
  }
  if (r.calls.gates.length === 0) fail('level flow: an easy level was never cleared by good play');
  else if (r.sim.spec.level !== 2) fail(`level flow: after clearing level 1 the game is on level ${r.sim.spec.level}`);
}

{
  // --- paused frames must render and change nothing ---
  const r = rig(2, 'normal', 8080);
  run(r, 400, (s) => s.phase === 'idle');
  const snapshot = JSON.stringify(r.sim.board);
  const at = r.sim.movesLeft;
  draw(RECORDING_CTX, r.sim, LAY, CW, CH, true);
  if (JSON.stringify(r.sim.board) !== snapshot || r.sim.movesLeft !== at) {
    fail('paused: drawing a dimmed frame changed the game state');
  }
}

{
  // --- fuzz: random taps for a few thousand frames, watching the renderer ---
  const rand = lcg(0xf0f0);
  for (const d of DIFFICULTIES) {
    const r = rig(3, d, 20250725);
    for (let f = 0; f < 1200; f += 1) {
      if (rand() < 0.05) {
        const cell = Math.floor(rand() * CELL_COUNT);
        const p = cellPointer(LAY, CW, CH, cell);
        r.input.setPointer(p.x, p.y, rand() < 0.75);
      } else if (rand() < 0.02) {
        r.input.setPointer(null, null, false);
      }
      run(r, 1);
      if (r.sim.board.some((p) => !p) && r.sim.phase === 'idle') {
        fail(`fuzz ${d}: the board has a hole while waiting for input`);
        break;
      }
      if (r.sim.movesLeft < 0) {
        fail(`fuzz ${d}: move count went negative`);
        break;
      }
    }
    interactions += 1;
  }
  if (badArgs.length > 0) {
    fail(`renderer: ${badArgs.length} non-finite argument(s) reached the canvas: ${badArgs.slice(0, 3).join(' ')}`);
  }
}

// --- self-tests: prove these checks can fail --------------------------------
//
// Assertions that always pass prove nothing. Each block below breaks the game on
// purpose and requires the corresponding check to notice.

{
  // (a) Plant a match in a board the generator called clean.
  const spec = buildLevel(4, 'normal', 424242);
  const board = makeBoard(spec);
  if (findRuns(board).length > 0) {
    fail('self-test a: the control board was already matching');
  } else {
    const color = board[idx(4, 4)]!.color;
    board[idx(4, 3)] = { color, kind: 'plain' };
    board[idx(4, 5)] = { color, kind: 'plain' };
    const runs = findRuns(board);
    const ref = refMatched(board);
    if (runs.length === 0 || ref.size === 0) {
      fail(
        'self-test a: a deliberately planted three-in-a-row was NOT detected, so the ' +
          '"no pre-made matches" check above is not actually checking anything',
      );
    } else {
      console.log('self-test a: a planted three-in-a-row is correctly detected by both detectors');
    }
  }
}

{
  // (b) Seal the board into a state with no legal move.
  const dead = deadBoard();
  const live = makeBoard(buildLevel(1, 'easy', 777));
  if (hasLegalMove(dead)) {
    fail(
      'self-test b: a board built to have no legal move still reported one, so the ' +
        'dead-board detector cannot be trusted to trigger a reshuffle',
    );
  } else if (!hasLegalMove(live)) {
    fail('self-test b: the detector says a normal board is dead too, so it is just always false');
  } else {
    console.log('self-test b: a sealed no-move board is correctly detected while a live one is not');
  }
}

{
  // (c) Float a candy above a hole and require the gravity check to object.
  const board = plainBoard(lcg(4242), 6);
  const clean = gravityProblem(board, CELL_COUNT);
  board[idx(5, 2)] = null; // a hole with candies still resting above it
  const dirty = gravityProblem(board, CELL_COUNT - 1);
  if (clean !== null) {
    fail(`self-test c: a full board was reported as broken (${clean})`);
  } else if (dirty === null) {
    fail(
      'self-test c: a candy left floating above a hole was NOT reported, so the gravity ' +
        'invariant above is vacuous',
    );
  } else {
    console.log(`self-test c: a floating candy is correctly reported (${dirty})`);
  }
}

{
  // (d) Sabotage a target and require the winnability check to reject it.
  const spec = buildLevel(2, 'easy', 31337);
  const play = playGreedy(spec);
  const impossible: LevelSpec = { ...spec, target: play.score * 20 + 100000 };
  if (play.score < spec.target) {
    fail('self-test d: the control level was not winnable, so the comparison is meaningless');
  } else if (play.score >= impossible.target) {
    fail(
      'self-test d: greedy play "reached" an impossible target, so the winnability check ' +
        'cannot fail and proves nothing',
    );
  } else {
    console.log(
      `self-test d: an impossible target (${impossible.target}) is correctly unreachable ` +
        `while the real one (${spec.target}) is met with ${play.score}`,
    );
  }
}

{
  // (e) Break a resolution and require the "settled" check to object.
  const board = boardOf(['0000']);
  const res = resolveMatches(board, idx(0, 0), idx(0, 1));
  if (!res) {
    fail('self-test e: a planted four did not resolve at all');
  } else {
    applyResolution(board, res);
    const stillThere = res.cleared.filter((i) => board[i] !== null);
    if (stillThere.length > 0) {
      fail(`self-test e: applyResolution left ${stillThere.length} cleared cells occupied`);
    }
    const spawned = res.spawns[0];
    if (!spawned || board[spawned.index]?.kind !== 'lineH') {
      fail('self-test e: the match of four did not leave a row blaster behind');
    } else {
      console.log('self-test e: clearing empties exactly the cleared cells and leaves the special');
    }
  }
}

{
  // (f) A tap on the wrong cell has to be caught. This shifts the pointer half a
  // cell and requires the mapping check to disagree with the cell it aimed at.
  const target = idx(3, 4);
  const p = cellPointer(LAY, CW, CH, target);
  const honest = gridIndex(pointerGrid(LAY, CW, CH, p.x, p.y));
  const shifted = gridIndex(pointerGrid(LAY, CW, CH, p.x + 0.09, p.y));
  if (honest !== target) {
    fail('self-test f: the control tap did not land on its own cell');
  } else if (shifted === target) {
    fail(
      'self-test f: a tap shifted most of a cell to the right still read as the same ' +
        'cell, so the pointer mapping check cannot detect a misaligned board',
    );
  } else {
    console.log(`self-test f: a tap shifted right correctly reads as cell ${shifted}, not ${target}`);
  }
}

// --- summary ----------------------------------------------------------------

const sample = buildLevel(1, 'easy', 1);
const last = buildLevel(LEVELS, 'hard', 1);

console.log(
  `\nboards generated: ${boardsChecked} (${LEVELS} levels x ${DIFFICULTIES.length} ` +
    `difficulties x ${SEEDS} seeds), ${movesSeen} legal moves counted`,
);
console.log(
  `match detection: ${detectionTrials} random boards cross-checked against a naive ` +
    `sliding-window detector (${detectedCells} matched cells), plus ${SHAPES.length} planted shapes`,
);
console.log(
  `legal moves: ${swapTrials} match-free boards, every one of their ` +
    `${swapTrials * (2 * ROWS * COLS - ROWS - COLS)} adjacent swaps tested both ways ` +
    `(${legalSwapsFound} legal)`,
);
console.log(
  `gravity: ${gravityTrials} boards with ${holesPunched} holes punched, collapsed and refilled`,
);
console.log(
  `cascades: ${cascadeRuns} settles from fully random boards, deepest chain ${deepestCascade} ` +
    `of ${MAX_CASCADE} allowed, ${cascadeCleared} candies cleared`,
);
console.log(
  `frame loop: ${interactions} scripted interactions plus ${DIFFICULTIES.length} fuzz runs, ` +
    `${drawCalls} canvas calls recorded, ${badArgs.length} non-finite`,
);
console.log(
  `winnability: ${levelsPlayed} greedy playthroughs, ${totalMoves} moves, ` +
    `${totalShuffles} reshuffles`,
);
for (const d of DIFFICULTIES) {
  const agg = perDifficulty.get(d);
  if (!agg) continue;
  console.log(
    `  ${d.padEnd(6)} score/target  min ${agg.min.toFixed(2)}x  avg ` +
      `${(agg.sum / agg.n).toFixed(2)}x  max ${agg.max.toFixed(2)}x`,
  );
}
if (worst) {
  console.log(
    `tightest level: ${worst.at} scored ${worst.score} against a target of ${worst.target} ` +
      `(${worst.ratio.toFixed(2)}x)`,
  );
}
console.log(
  `easy level 1: ${sample.colors} colours, ${sample.moves} moves, target ${sample.target}; ` +
    `hard level ${LEVELS}: ${last.colors} colours, ${last.moves} moves, target ${last.target}`,
);

if (errors.length > 0) {
  console.error(`\n${errors.length} PROBLEM(S):`);
  for (const e of errors.slice(0, 25)) console.error(`  x ${e}`);
  if (errors.length > 25) console.error(`  ... and ${errors.length - 25} more`);
  process.exit(1);
}
console.log(
  '\nNo pre-made matches, no dead boards, gravity conserves and never floats, every ' +
    'cascade settles, and every level is winnable.',
);
