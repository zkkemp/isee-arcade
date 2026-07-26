'use client';

import { useEffect, useRef } from 'react';
import { RAMP_SCALE, SPEED_SCALE, type Difficulty } from '@/lib/difficulty';
import type { GameApi, GameCanvasProps } from '@/lib/games';
import type { InputController } from '@/lib/input';
import { playSound, unlockAudio } from '@/lib/sound';
import { useCanvasGame } from '@/lib/useCanvasGame';

/**
 * Sugar Swap - a match-three.
 *
 * Everything above the component is pure: no canvas, no React, no Math.random.
 * `buildLevel`, `makeBoard`, `findRuns`, `collapse`, `refill` and `settleBoard`
 * are the real functions the game runs, and scripts/check-match3.ts drives them
 * headlessly to prove the four things that quietly ruin this genre:
 *
 *  1. A board that starts mid-cascade. The first move is stolen and the player
 *     watches a chain they did not earn, so `makeBoard` refuses any colour that
 *     would complete a run with the cells already placed.
 *  2. A dead board - no swap anywhere makes a match - which is a soft lock with
 *     no error message. After every settle `hasLegalMove` is consulted and the
 *     board reshuffles on screen if the answer is no.
 *  3. Gravity that loses or duplicates a candy, or leaves a hole floating in the
 *     middle of a column. `collapse` is the only thing that moves pieces
 *     downward and the checker asserts both invariants over thousands of boards.
 *  4. An unwinnable level. Targets are a points-per-move budget times the move
 *     limit, and the checker plays every level with a greedy solver to prove the
 *     target is reachable inside that limit with room to spare.
 *
 * Art is drawn procedurally - gradients, specular highlights, soft shadows - so
 * there are no assets to fetch and nothing borrowed from anyone.
 */

// ------------------------------------------------------------------- geometry

export const COLS = 8;
export const ROWS = 8;
export const CELL_COUNT = ROWS * COLS;

/** Distinct candy designs available. Each is a different shape AND colour. */
export const MAX_COLORS = 7;

/**
 * Cascade steps allowed before the loop is cut. A refill can always match again,
 * so the loop needs a hard ceiling; the checker asserts it never actually binds.
 */
export const MAX_CASCADE = 32;

export function idx(r: number, c: number): number {
  return r * COLS + c;
}
export function rowOf(i: number): number {
  return Math.floor(i / COLS);
}
export function colOf(i: number): number {
  return i % COLS;
}

// --------------------------------------------------------------------- pieces

/**
 * plain   - an ordinary candy
 * lineH   - blaster, clears its whole row (earned by a match of 4 across)
 * lineV   - blaster, clears its whole column (a match of 4 down)
 * bomb    - burst, clears a 5x5 patch minus corners (an L or T match)
 * rainbow - colour bomb, clears every candy of one colour (a match of 5+)
 */
export type Kind = 'plain' | 'lineH' | 'lineV' | 'bomb' | 'rainbow';

/** A rainbow carries colour -1: it belongs to no colour, so it never matches. */
export type Piece = { color: number; kind: Kind };

/** Row-major, length CELL_COUNT. A null is a hole waiting for gravity. */
export type Board = (Piece | null)[];

export function isMatchable(p: Piece | null | undefined): boolean {
  return !!p && p.color >= 0;
}

export function cloneBoard(b: Board): Board {
  return b.map((p) => (p ? { color: p.color, kind: p.kind } : null));
}

/** Seeded LCG. Generation must never touch Math.random or nothing is reproducible. */
export function lcg(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// -------------------------------------------------------------------- scoring

export const POINTS_PER_PIECE = 20;
export const POINTS_PER_SPECIAL = 50;

/**
 * Cascade bonus. The first clear of a swap is x1 and each further step in the
 * chain adds three quarters, capped so one lucky avalanche cannot hand over a
 * whole level.
 */
export function comboMultiplier(comboIndex: number): number {
  return 1 + Math.min(Math.max(comboIndex - 1, 0), 6) * 0.75;
}

export function scoreFor(clearedCount: number, comboIndex: number, specials: number): number {
  return (
    Math.round(clearedCount * POINTS_PER_PIECE * comboMultiplier(comboIndex)) +
    specials * POINTS_PER_SPECIAL
  );
}

// --------------------------------------------------------------------- levels

export type LevelSpec = {
  level: number;
  difficulty: Difficulty;
  /** How many candy designs are in play. Fewer is easier. */
  colors: number;
  moves: number;
  target: number;
  seed: number;
};

/** Moves granted per level. Constant, so a kid always knows what they have. */
const MOVES: Record<Difficulty, number> = { easy: 30, normal: 26, hard: 22 };

/**
 * The target is a points-per-move budget times the move limit, which is what
 * keeps every level winnable by construction: raising the target raises the
 * scoring rate required, and the checker proves a greedy player beats that rate
 * with margin. Easy starts at a rate a five-year-old passes by accident.
 *
 * The numbers look low against what a good run actually scores, and they are
 * meant to: measured greedy play floors at roughly 134 points per move on five
 * colours, 85 on six and 65 on seven, so these budgets sit near a third of the
 * worst case. Cheap to clear, but the bar still climbs every single level.
 */
const PPM_BASE: Record<Difficulty, number> = { easy: 14, normal: 18, hard: 20 };
const PPM_STEP: Record<Difficulty, number> = { easy: 0.7, normal: 0.5, hard: 0.36 };
const PPM_CAP: Record<Difficulty, number> = { easy: 30, normal: 36, hard: 38 };

/**
 * Candy colours in play. This is the real difficulty dial - one more colour cuts
 * how often three of a kind fall together, which drops the scoring rate hard - so
 * it is fixed per difficulty rather than creeping up with the level. Levels get
 * harder by raising the target, which stays honest and provable.
 */
const COLORS: Record<Difficulty, number> = { easy: 5, normal: 6, hard: 7 };

export function colorsFor(difficulty: Difficulty): number {
  return Math.min(MAX_COLORS, COLORS[difficulty]);
}

export function buildLevel(level: number, difficulty: Difficulty, seed: number): LevelSpec {
  const moves = MOVES[difficulty];
  const ppm = Math.min(
    PPM_CAP[difficulty],
    PPM_BASE[difficulty] + (level - 1) * PPM_STEP[difficulty] * RAMP_SCALE[difficulty],
  );
  return {
    level,
    difficulty,
    colors: colorsFor(difficulty),
    moves,
    // Rounded to fifties so the number on the HUD is readable at a glance.
    target: Math.max(200, Math.round((moves * ppm) / 50) * 50),
    seed: (Math.imul(seed || 1, 2246822519) ^ Math.imul(level, 0x9e3779b1)) >>> 0 || 1,
  };
}

// ------------------------------------------------------------- match detection

export type Run = { color: number; dir: 'h' | 'v'; cells: number[] };

/** Every maximal straight run of three or more of one colour, rows then columns. */
export function findRuns(board: Board): Run[] {
  const runs: Run[] = [];

  const sweep = (
    get: (a: number, b: number) => number,
    outer: number,
    inner: number,
    dir: 'h' | 'v',
  ) => {
    for (let a = 0; a < outer; a += 1) {
      let start = 0;
      while (start < inner) {
        const first = board[get(a, start)];
        if (!isMatchable(first)) {
          start += 1;
          continue;
        }
        const color = first!.color;
        let end = start + 1;
        while (end < inner && board[get(a, end)]?.color === color) end += 1;
        if (end - start >= 3) {
          const cells: number[] = [];
          for (let b = start; b < end; b += 1) cells.push(get(a, b));
          runs.push({ color, dir, cells });
        }
        start = end;
      }
    }
  };

  sweep((r, c) => idx(r, c), ROWS, COLS, 'h');
  sweep((c, r) => idx(r, c), COLS, ROWS, 'v');
  return runs;
}

export type Cluster = {
  color: number;
  /** Ascending, deduplicated. */
  cells: number[];
  hasH: boolean;
  hasV: boolean;
  /** Length of the longest straight run inside the cluster. */
  longest: number;
  dir: 'h' | 'v';
};

/**
 * Merges runs that share a cell, so an L or a T is one cluster and earns one
 * special rather than two. Parallel runs never share a cell, so a 2x3 block
 * stays two clusters - which is right: it clears six candies and earns nothing.
 */
export function clusterRuns(runs: Run[]): Cluster[] {
  const parent = runs.map((_, i) => i);
  const find = (x: number): number => {
    let n = x;
    while (parent[n] !== n) {
      parent[n] = parent[parent[n]];
      n = parent[n];
    }
    return n;
  };
  const owner = new Map<number, number>();
  runs.forEach((run, i) => {
    for (const cell of run.cells) {
      const prev = owner.get(cell);
      if (prev === undefined) {
        owner.set(cell, i);
        continue;
      }
      const ra = find(prev);
      const rb = find(i);
      if (ra !== rb) parent[rb] = ra;
    }
  });

  const groups = new Map<number, Run[]>();
  runs.forEach((run, i) => {
    const k = find(i);
    const list = groups.get(k);
    if (list) list.push(run);
    else groups.set(k, [run]);
  });

  return [...groups.values()].map((rs) => {
    const cells = [...new Set(rs.flatMap((r) => r.cells))].sort((a, b) => a - b);
    let longest = 0;
    for (const r of rs) longest = Math.max(longest, r.cells.length);
    const hasH = rs.some((r) => r.dir === 'h');
    const hasV = rs.some((r) => r.dir === 'v');
    return { color: rs[0].color, cells, hasH, hasV, longest, dir: hasH ? 'h' : 'v' } as Cluster;
  });
}

/** What a cluster earns. Five in a line beats an L, which beats four in a line. */
export function spawnKindFor(cl: Cluster): Kind | null {
  if (cl.longest >= 5) return 'rainbow';
  if (cl.hasH && cl.hasV) return 'bomb';
  if (cl.longest === 4) return cl.dir === 'h' ? 'lineH' : 'lineV';
  return null;
}

/**
 * Length of the longest run through `i`. Only cells that changed can create a new
 * run, so testing a swap needs this at two cells rather than a whole-board sweep.
 */
export function runThrough(board: Board, i: number): number {
  const p = board[i];
  if (!isMatchable(p)) return 0;
  const color = p!.color;
  const r = rowOf(i);
  const c = colOf(i);

  let h = 1;
  for (let x = c - 1; x >= 0 && board[idx(r, x)]?.color === color; x -= 1) h += 1;
  for (let x = c + 1; x < COLS && board[idx(r, x)]?.color === color; x += 1) h += 1;

  let v = 1;
  for (let y = r - 1; y >= 0 && board[idx(y, c)]?.color === color; y -= 1) v += 1;
  for (let y = r + 1; y < ROWS && board[idx(y, c)]?.color === color; y += 1) v += 1;

  return Math.max(h, v);
}

export function areAdjacent(a: number, b: number): boolean {
  return Math.abs(rowOf(a) - rowOf(b)) + Math.abs(colOf(a) - colOf(b)) === 1;
}

/**
 * A swap of two specials, or anything involving a colour bomb, fires on contact
 * without needing to line a colour up. Everything else must make a match.
 */
export function isSpecialSwap(pa: Piece | null, pb: Piece | null): boolean {
  if (!pa || !pb) return false;
  if (pa.kind === 'rainbow' || pb.kind === 'rainbow') return true;
  return pa.kind !== 'plain' && pb.kind !== 'plain';
}

export function isLegalSwap(board: Board, a: number, b: number): boolean {
  if (a === b || !areAdjacent(a, b)) return false;
  const pa = board[a];
  const pb = board[b];
  if (!pa || !pb) return false;
  if (isSpecialSwap(pa, pb)) return true;

  board[a] = pb;
  board[b] = pa;
  const made = runThrough(board, a) >= 3 || runThrough(board, b) >= 3;
  board[a] = pa;
  board[b] = pb;
  return made;
}

export type Move = { a: number; b: number };

/** Every swap the player is allowed to make. Each pair is listed once. */
export function findLegalMoves(board: Board): Move[] {
  const out: Move[] = [];
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const a = idx(r, c);
      if (c + 1 < COLS && isLegalSwap(board, a, a + 1)) out.push({ a, b: a + 1 });
      if (r + 1 < ROWS && isLegalSwap(board, a, a + COLS)) out.push({ a, b: a + COLS });
    }
  }
  return out;
}

export function hasLegalMove(board: Board): boolean {
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const a = idx(r, c);
      if (c + 1 < COLS && isLegalSwap(board, a, a + 1)) return true;
      if (r + 1 < ROWS && isLegalSwap(board, a, a + COLS)) return true;
    }
  }
  return false;
}

// --------------------------------------------------------------------- blasts

function addRow(r: number, out: Set<number>): void {
  for (let c = 0; c < COLS; c += 1) out.add(idx(r, c));
}
function addCol(c: number, out: Set<number>): void {
  for (let r = 0; r < ROWS; r += 1) out.add(idx(r, c));
}

/** Chebyshev square, optionally with the corners spared. */
function addSquare(i: number, radius: number, trimCorners: boolean, out: Set<number>): void {
  const r0 = rowOf(i);
  const c0 = colOf(i);
  for (let r = r0 - radius; r <= r0 + radius; r += 1) {
    for (let c = c0 - radius; c <= c0 + radius; c += 1) {
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue;
      if (trimCorners && Math.abs(r - r0) === radius && Math.abs(c - c0) === radius) continue;
      out.add(idx(r, c));
    }
  }
}

/** The colour a stray colour bomb takes out when something else sets it off. */
export function dominantColor(board: Board): number {
  const counts = new Array<number>(MAX_COLORS).fill(0);
  for (const p of board) if (isMatchable(p)) counts[p!.color] += 1;
  let best = 0;
  for (let i = 1; i < counts.length; i += 1) if (counts[i] > counts[best]) best = i;
  return best;
}

function addBlast(board: Board, i: number, kind: Kind, out: Set<number>): void {
  out.add(i);
  if (kind === 'lineH') addRow(rowOf(i), out);
  else if (kind === 'lineV') addCol(colOf(i), out);
  else if (kind === 'bomb') addSquare(i, 2, true, out);
  else if (kind === 'rainbow') {
    const color = dominantColor(board);
    for (let j = 0; j < CELL_COUNT; j += 1) if (board[j]?.color === color) out.add(j);
  }
}

/**
 * Sets off every special caught in the clear set, and every special their blasts
 * reach in turn. Terminates because `fired` only ever grows and is bounded by the
 * board. Returns how many went off, which is what the chain bonus pays on.
 */
function expandSpecials(board: Board, toClear: Set<number>, fired: Set<number>): number {
  let activated = 0;
  let changed = true;
  while (changed) {
    changed = false;
    for (const i of [...toClear]) {
      const p = board[i];
      if (!p || p.kind === 'plain' || fired.has(i)) continue;
      fired.add(i);
      activated += 1;
      const before = toClear.size;
      addBlast(board, i, p.kind, toClear);
      if (toClear.size !== before) changed = true;
    }
  }
  return activated;
}

// ---------------------------------------------------------------- resolutions

export type SpawnedSpecial = { index: number; kind: Kind; color: number };

export type Resolution = {
  /** Cells emptied this step, ascending. */
  cleared: number[];
  /** Specials left behind. Their cells are deliberately absent from `cleared`. */
  spawns: SpawnedSpecial[];
  activated: number;
  clusters: Cluster[];
};

/** Middle cell of a cluster, preferring a cell the player just touched. */
function spawnCellFor(board: Board, cl: Cluster, hintA: number, hintB: number): number {
  for (const hint of [hintA, hintB]) {
    if (hint >= 0 && cl.cells.includes(hint) && board[hint]?.kind === 'plain') return hint;
  }
  for (const hint of [hintA, hintB]) if (hint >= 0 && cl.cells.includes(hint)) return hint;
  const plain = cl.cells.filter((i) => board[i]?.kind === 'plain');
  const pool = plain.length > 0 ? plain : cl.cells;
  return pool[Math.floor(pool.length / 2)];
}

/**
 * One clear step from whatever is matching right now. `hintA`/`hintB` are the
 * cells the player swapped, so a new special lands under their finger rather than
 * somewhere arbitrary. Returns null when nothing matches.
 */
export function resolveMatches(board: Board, hintA = -1, hintB = -1): Resolution | null {
  const runs = findRuns(board);
  if (runs.length === 0) return null;

  const clusters = clusterRuns(runs);
  const toClear = new Set<number>();
  for (const cl of clusters) for (const i of cl.cells) toClear.add(i);

  const activated = expandSpecials(board, toClear, new Set<number>());

  const spawns: SpawnedSpecial[] = [];
  for (const cl of clusters) {
    const kind = spawnKindFor(cl);
    if (!kind) continue;
    const at = spawnCellFor(board, cl, hintA, hintB);
    spawns.push({ index: at, kind, color: kind === 'rainbow' ? -1 : cl.color });
  }

  const keep = new Set(spawns.map((s) => s.index));
  const cleared = [...toClear].filter((i) => !keep.has(i)).sort((x, y) => x - y);
  return { cleared, spawns, activated, clusters };
}

/**
 * Two specials swapped into each other. This is where combining is meant to feel
 * outrageous, so every pairing is bigger than either piece alone.
 */
export function resolveSwapActivation(board: Board, a: number, b: number): Resolution | null {
  if (a < 0 || b < 0) return null;
  const pa = board[a];
  const pb = board[b];
  if (!pa || !pb || !isSpecialSwap(pa, pb)) return null;

  const toClear = new Set<number>([a, b]);
  const rainbowA = pa.kind === 'rainbow';
  const rainbowB = pb.kind === 'rainbow';

  if (rainbowA && rainbowB) {
    // Two colour bombs wipe the board. It might happen once in a session.
    for (let i = 0; i < CELL_COUNT; i += 1) toClear.add(i);
  } else if (rainbowA || rainbowB) {
    const other = rainbowA ? pb : pa;
    const color = other.color >= 0 ? other.color : dominantColor(board);
    const hits: number[] = [];
    for (let i = 0; i < CELL_COUNT; i += 1) {
      if (board[i]?.color === color) {
        toClear.add(i);
        hits.push(i);
      }
    }
    // Colour bomb plus a blaster turns every candy of that colour into a blaster
    // and sets them all off at once.
    if (other.kind !== 'plain') for (const i of hits) addBlast(board, i, other.kind, toClear);
  } else if (pa.kind === 'bomb' && pb.kind === 'bomb') {
    addSquare(b, 2, false, toClear);
  } else if (pa.kind === 'bomb' || pb.kind === 'bomb') {
    // Blaster plus burst: a three-wide cross, full width and full height.
    for (let d = -1; d <= 1; d += 1) {
      const r = rowOf(b) + d;
      const c = colOf(b) + d;
      if (r >= 0 && r < ROWS) addRow(r, toClear);
      if (c >= 0 && c < COLS) addCol(c, toClear);
    }
  } else {
    addRow(rowOf(b), toClear);
    addCol(colOf(b), toClear);
  }

  // The two swapped pieces have already had their say, so they start out fired -
  // otherwise a colour bomb would take a second colour on the way out.
  const activated = 2 + expandSpecials(board, toClear, new Set<number>([a, b]));
  return { cleared: [...toClear].sort((x, y) => x - y), spawns: [], activated, clusters: [] };
}

export function applyResolution(board: Board, res: Resolution): void {
  for (const i of res.cleared) board[i] = null;
  for (const s of res.spawns) board[s.index] = { color: s.color, kind: s.kind };
}

// -------------------------------------------------------------------- gravity

export type Fall = { from: number; to: number };

/** Drops every candy into the holes below it. The only thing that moves pieces down. */
export function collapse(board: Board): Fall[] {
  const falls: Fall[] = [];
  for (let c = 0; c < COLS; c += 1) {
    let write = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r -= 1) {
      const i = idx(r, c);
      const p = board[i];
      if (!p) continue;
      if (r !== write) {
        const to = idx(write, c);
        board[to] = p;
        board[i] = null;
        falls.push({ from: i, to });
      }
      write -= 1;
    }
  }
  return falls;
}

export type Entry = { index: number; dist: number };

/**
 * Fills the holes left at the top of each column. Only ever called after
 * `collapse`, so a column's holes are contiguous and start at row 0 - which is
 * why every new candy in a column falls exactly as far as the column had holes.
 */
export function refill(board: Board, rand: () => number, colors: number): Entry[] {
  const out: Entry[] = [];
  for (let c = 0; c < COLS; c += 1) {
    let holes = 0;
    for (let r = 0; r < ROWS; r += 1) if (!board[idx(r, c)]) holes += 1;
    if (holes === 0) continue;
    for (let r = 0; r < ROWS; r += 1) {
      const i = idx(r, c);
      if (board[i]) continue;
      board[i] = { color: Math.floor(rand() * colors) % colors, kind: 'plain' };
      out.push({ index: i, dist: holes });
    }
  }
  return out;
}

// ----------------------------------------------------------- board generation

/**
 * Fills every cell, refusing any colour that would complete a run with the two
 * cells already placed to the left or above. A board therefore cannot contain a
 * match before the player has touched it.
 */
export function fillNoMatch(board: Board, rand: () => number, colors: number): void {
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const banned = new Set<number>();
      if (c >= 2) {
        const a = board[idx(r, c - 1)];
        const b = board[idx(r, c - 2)];
        if (a && b && a.color === b.color) banned.add(a.color);
      }
      if (r >= 2) {
        const a = board[idx(r - 1, c)];
        const b = board[idx(r - 2, c)];
        if (a && b && a.color === b.color) banned.add(a.color);
      }
      // With five or more colours in play, at most two can ever be banned here.
      const allowed: number[] = [];
      for (let k = 0; k < colors; k += 1) if (!banned.has(k)) allowed.push(k);
      board[idx(r, c)] = {
        color: allowed[Math.floor(rand() * allowed.length) % allowed.length],
        kind: 'plain',
      };
    }
  }
}

/**
 * Rearranges the candies already on the board into a layout with no match and at
 * least one legal move. Falls back to a fresh set of colours, because a bag that
 * genuinely cannot be arranged (nearly all one colour) is possible and handing
 * back a dead board is the worse answer. Returns false if even that failed, in
 * which case the caller simply shuffles again next frame.
 */
export function shuffleBoard(board: Board, rand: () => number, colors: number): boolean {
  const bag: Piece[] = [];
  for (const p of board) if (p) bag.push(p);

  for (let attempt = 0; attempt < 60; attempt += 1) {
    for (let i = bag.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      const t = bag[i];
      bag[i] = bag[j];
      bag[j] = t;
    }
    for (let i = 0; i < CELL_COUNT; i += 1) board[i] = bag[i] ?? null;
    if (findRuns(board).length === 0 && hasLegalMove(board)) return true;
  }

  for (let attempt = 0; attempt < 60; attempt += 1) {
    fillNoMatch(board, rand, colors);
    if (hasLegalMove(board)) return true;
  }
  return false;
}

export function makeBoard(spec: LevelSpec): Board {
  const rand = lcg(spec.seed);
  const board: Board = new Array<Piece | null>(CELL_COUNT).fill(null);
  fillNoMatch(board, rand, spec.colors);
  // A board with no legal move is unplayable from the very first frame.
  for (let guard = 0; guard < 40 && !hasLegalMove(board); guard += 1) {
    shuffleBoard(board, rand, spec.colors);
  }
  return board;
}

// ------------------------------------------------------------------- settling

export type SettleStats = {
  /** Cascade steps taken. Compared against MAX_CASCADE by the checker. */
  iterations: number;
  cleared: number;
  specials: number;
  score: number;
};

/**
 * Runs a swap's consequences to a standstill: clear, drop, refill, repeat while
 * anything still matches. The component performs exactly these steps spread
 * across animation phases, so proving this proves the game.
 */
export function settleBoard(
  board: Board,
  rand: () => number,
  colors: number,
  hintA = -1,
  hintB = -1,
): SettleStats {
  const stats: SettleStats = { iterations: 0, cleared: 0, specials: 0, score: 0 };
  for (let step = 0; step < MAX_CASCADE; step += 1) {
    const res =
      step === 0
        ? (resolveSwapActivation(board, hintA, hintB) ?? resolveMatches(board, hintA, hintB))
        : resolveMatches(board);
    if (!res) break;
    stats.iterations += 1;
    stats.cleared += res.cleared.length;
    stats.specials += res.spawns.length;
    stats.score += scoreFor(res.cleared.length, stats.iterations, res.spawns.length);
    applyResolution(board, res);
    collapse(board);
    refill(board, rand, colors);
  }
  return stats;
}

/**
 * What a move is worth right now, without touching the board. The greedy solver
 * in the checker ranks moves with this, and the game uses it to choose which move
 * to hint at when a player stalls.
 */
export function moveValue(board: Board, mv: Move): number {
  const copy = cloneBoard(board);
  const pa = copy[mv.a];
  const pb = copy[mv.b];
  copy[mv.a] = pb;
  copy[mv.b] = pa;
  const res = resolveSwapActivation(copy, mv.a, mv.b) ?? resolveMatches(copy, mv.a, mv.b);
  if (!res) return 0;
  return res.cleared.length + res.spawns.length * 4 + res.activated * 3;
}

// ------------------------------------------------------------------ candy art

type Shape = 'blob' | 'circle' | 'gem' | 'dome' | 'hex' | 'drop' | 'star';

type CandyStyle = { light: string; mid: string; dark: string; shape: Shape };

/**
 * Seven original designs, drawn rather than downloaded. Shape carries as much of
 * the identity as colour does, so the board still reads for a colour-blind player
 * and for a five-year-old going by silhouette.
 */
const CANDY: CandyStyle[] = [
  { light: '#ffb3c1', mid: '#f2415f', dark: '#8e0e26', shape: 'blob' },
  { light: '#fff3ab', mid: '#ffd12f', dark: '#a86c05', shape: 'circle' },
  { light: '#bbe7ff', mid: '#3ba7f5', dark: '#0e4a91', shape: 'gem' },
  { light: '#d9f9ac', mid: '#63c637', dark: '#256a12', shape: 'dome' },
  { light: '#e3c8ff', mid: '#9a5cf0', dark: '#42177f', shape: 'hex' },
  { light: '#ffd4a6', mid: '#ff8a2b', dark: '#9c3c06', shape: 'drop' },
  { light: '#b6fff1', mid: '#28d2b2', dark: '#076d5c', shape: 'star' },
];

const RAINBOW_WEDGES = ['#f2415f', '#ff8a2b', '#ffd12f', '#63c637', '#28d2b2', '#3ba7f5', '#9a5cf0'];

/** '#rrggbb' plus an alpha, since canvas has no colour-with-alpha primitive. */
function shade(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

type Pt = [number, number];

function lerpPt(a: Pt, b: Pt, t: number): Pt {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * A polygon with every corner rounded: the corner becomes the control point of a
 * quadratic and the curve starts and ends part-way along the adjoining edges.
 * `bite` of 0.5 is fully rounded, small values keep the edges crisp. No candy in
 * this game has a sharp corner - sharp corners do not look edible.
 */
function splinePoly(ctx: CanvasRenderingContext2D, pts: Pt[], bite: number): void {
  const n = pts.length;
  const out = (i: number) => lerpPt(pts[i % n], pts[(i + 1) % n], bite);
  const into = (i: number) => lerpPt(pts[(i + n - 1) % n], pts[i % n], 1 - bite);
  const start = out(0);
  ctx.beginPath();
  ctx.moveTo(start[0], start[1]);
  for (let i = 1; i <= n; i += 1) {
    const enter = into(i);
    const leave = out(i);
    const v = pts[i % n];
    ctx.lineTo(enter[0], enter[1]);
    ctx.quadraticCurveTo(v[0], v[1], leave[0], leave[1]);
  }
  ctx.closePath();
}

function polyPts(sides: number, r: number, turn: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < sides; i += 1) {
    const a = turn + (i / sides) * Math.PI * 2;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

/** Builds the silhouette, centred on the origin. Caller fills and strokes it. */
function candyPath(ctx: CanvasRenderingContext2D, shape: Shape, r: number): void {
  switch (shape) {
    case 'circle':
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      break;
    case 'blob':
      roundRect(ctx, -r * 0.88, -r * 0.88, r * 1.76, r * 1.76, r * 0.6);
      break;
    case 'gem':
      splinePoly(
        ctx,
        [
          [0, -r],
          [r * 0.9, 0],
          [0, r],
          [-r * 0.9, 0],
        ],
        0.3,
      );
      break;
    case 'hex':
      splinePoly(ctx, polyPts(6, r, -Math.PI / 2), 0.34);
      break;
    case 'star': {
      const pts: Pt[] = [];
      for (let i = 0; i < 10; i += 1) {
        const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
        const rad = i % 2 === 0 ? r : r * 0.52;
        pts.push([Math.cos(a) * rad, Math.sin(a) * rad]);
      }
      splinePoly(ctx, pts, 0.42);
      break;
    }
    case 'dome':
      // Gumdrop: a flat base with a tall rounded top.
      ctx.beginPath();
      ctx.moveTo(-r * 0.86, r * 0.62);
      ctx.bezierCurveTo(-r * 0.98, -r * 0.35, -r * 0.5, -r, 0, -r);
      ctx.bezierCurveTo(r * 0.5, -r, r * 0.98, -r * 0.35, r * 0.86, r * 0.62);
      ctx.quadraticCurveTo(r * 0.6, r * 0.86, 0, r * 0.86);
      ctx.quadraticCurveTo(-r * 0.6, r * 0.86, -r * 0.86, r * 0.62);
      ctx.closePath();
      break;
    case 'drop':
      // Teardrop, point up.
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.bezierCurveTo(r * 0.42, -r * 0.52, r * 0.92, -r * 0.1, r * 0.92, r * 0.24);
      ctx.bezierCurveTo(r * 0.92, r * 0.78, r * 0.5, r, 0, r);
      ctx.bezierCurveTo(-r * 0.5, r, -r * 0.92, r * 0.78, -r * 0.92, r * 0.24);
      ctx.bezierCurveTo(-r * 0.92, -r * 0.1, -r * 0.42, -r * 0.52, 0, -r);
      ctx.closePath();
      break;
  }
}

/** The one detail line that tells each design apart at thumbnail size. */
function candyDetail(ctx: CanvasRenderingContext2D, style: CandyStyle, r: number): void {
  ctx.save();
  ctx.lineWidth = Math.max(0.5, r * 0.07);
  ctx.strokeStyle = shade(style.dark, 0.3);
  switch (style.shape) {
    case 'circle':
      // Segment lines, like a citrus drop.
      for (let i = 0; i < 3; i += 1) {
        const a = (i / 3) * Math.PI;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72);
        ctx.lineTo(-Math.cos(a) * r * 0.72, -Math.sin(a) * r * 0.72);
        ctx.stroke();
      }
      break;
    case 'blob':
      // Wrapper crease across the chew.
      ctx.beginPath();
      ctx.moveTo(-r * 0.7, r * 0.16);
      ctx.quadraticCurveTo(0, -r * 0.14, r * 0.7, r * 0.16);
      ctx.stroke();
      break;
    case 'gem':
      ctx.fillStyle = shade(style.light, 0.4);
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.72);
      ctx.lineTo(r * 0.42, -r * 0.06);
      ctx.lineTo(-r * 0.42, -r * 0.06);
      ctx.closePath();
      ctx.fill();
      break;
    case 'hex':
      splinePoly(ctx, polyPts(6, r * 0.58, -Math.PI / 2), 0.34);
      ctx.stroke();
      break;
    case 'dome':
      // Sugar crystals.
      ctx.fillStyle = shade('#ffffff', 0.5);
      for (const [dx, dy] of [
        [-0.3, 0.2],
        [0.24, 0.34],
        [0.02, -0.1],
        [-0.44, -0.2],
        [0.44, -0.06],
      ]) {
        ctx.beginPath();
        ctx.arc(dx * r, dy * r, r * 0.08, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'drop':
      ctx.beginPath();
      ctx.arc(0, r * 0.2, r * 0.44, Math.PI * 0.15, Math.PI * 0.95);
      ctx.stroke();
      break;
    case 'star':
      splinePoly(
        ctx,
        polyPts(5, r * 0.4, -Math.PI / 2).flatMap((p, i) => {
          const inner = polyPts(10, r * 0.22, -Math.PI / 2)[i * 2 + 1];
          return [p, inner] as Pt[];
        }),
        0.42,
      );
      ctx.stroke();
      break;
  }
  ctx.restore();
}

/** Gloss: a hard highlight up-left and a soft rim light down-right. */
function candyGloss(ctx: CanvasRenderingContext2D, style: CandyStyle, r: number): void {
  ctx.save();
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(-r * 0.33, -r * 0.42, r * 0.3, r * 0.19, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.ellipse(-r * 0.05, -r * 0.58, r * 0.1, r * 0.07, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = style.light;
  ctx.lineWidth = Math.max(0.5, r * 0.1);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.82, Math.PI * 0.1, Math.PI * 0.55);
  ctx.stroke();
  ctx.restore();
}

/** The colour bomb: a dark sphere with the whole palette turning inside it. */
function drawRainbow(ctx: CanvasRenderingContext2D, r: number, time: number): void {
  const spin = time * 1.1;
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#160f26';
  ctx.fillRect(-r, -r, r * 2, r * 2);
  const step = (Math.PI * 2) / RAINBOW_WEDGES.length;
  RAINBOW_WEDGES.forEach((col, i) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r * 0.92, spin + i * step, spin + (i + 1) * step);
    ctx.closePath();
    ctx.fill();
  });
  // Dark core, so it reads as one object rather than a pie chart.
  const core = ctx.createRadialGradient(0, 0, r * 0.05, 0, 0, r * 0.62);
  core.addColorStop(0, 'rgba(10,6,20,0.95)');
  core.addColorStop(1, 'rgba(10,6,20,0)');
  ctx.fillStyle = core;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.restore();

  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = Math.max(0.6, r * 0.1);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.96, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(-r * 0.34, -r * 0.4, r * 0.26, r * 0.16, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** Blaster stripes, clipped to the candy so they follow its silhouette. */
function drawBlasterMarks(
  ctx: CanvasRenderingContext2D,
  style: CandyStyle,
  r: number,
  vertical: boolean,
  time: number,
): void {
  ctx.save();
  candyPath(ctx, style.shape, r);
  ctx.clip();
  if (vertical) ctx.rotate(Math.PI / 2);
  // A slow travel along the stripes hints at which way it will fire.
  const drift = ((time * 0.6) % 1) * r * 0.62;
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  for (let i = -3; i <= 3; i += 1) {
    const y = i * r * 0.62 + drift;
    if (Math.abs(y) > r) continue;
    ctx.fillRect(-r, y - r * 0.07, r * 2, r * 0.14);
  }
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = Math.max(0.7, r * 0.13);
  ctx.lineCap = 'round';
  if (vertical) ctx.rotate(Math.PI / 2);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * r * 0.5, -r * 0.3);
    ctx.lineTo(side * r * 0.86, 0);
    ctx.lineTo(side * r * 0.5, r * 0.3);
    ctx.stroke();
  }
  ctx.restore();
}

/** Burst wrapper: pinched foil either side and a ring that breathes. */
function drawBurstWrapper(ctx: CanvasRenderingContext2D, r: number, time: number): void {
  const pulse = 1 + Math.sin(time * 5) * 0.06;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * r * 0.62, 0);
    ctx.lineTo(side * r * 1.15 * pulse, -r * 0.5);
    ctx.lineTo(side * r * 1.02 * pulse, 0);
    ctx.lineTo(side * r * 1.15 * pulse, r * 0.5);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = `rgba(255,255,255,${0.55 + Math.sin(time * 5) * 0.2})`;
  ctx.lineWidth = Math.max(0.7, r * 0.12);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.72 * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

type CandyOpts = {
  scale?: number;
  alpha?: number;
  /** 0..1 white-out, used while a candy pops. */
  flash?: number;
  spin?: number;
  /** Vertical squash, 1 is round. Landing candies squash briefly. */
  squash?: number;
  shadow?: boolean;
};

/** One candy, centred on (cx, cy) and sized to a cell. */
function drawCandy(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  cell: number,
  piece: Piece,
  time: number,
  o: CandyOpts = {},
): void {
  const scale = o.scale ?? 1;
  if (scale <= 0.02) return;
  const r = cell * 0.42 * scale;
  const style = piece.color >= 0 ? CANDY[piece.color % CANDY.length] : null;

  if (o.shadow !== false) {
    ctx.save();
    ctx.globalAlpha = (o.alpha ?? 1) * 0.35;
    ctx.fillStyle = '#0a0416';
    ctx.beginPath();
    ctx.ellipse(cx + r * 0.12, cy + r * 0.8, r * 0.76, r * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(cx, cy);
  if (o.squash && o.squash !== 1) ctx.scale(1 / o.squash, o.squash);
  if (o.spin) ctx.rotate(o.spin);
  ctx.globalAlpha = o.alpha ?? 1;

  if (!style) {
    drawRainbow(ctx, r, time);
  } else {
    candyPath(ctx, style.shape, r);
    // Light from up-left, which is what makes a flat fill look like a solid.
    const g = ctx.createRadialGradient(-r * 0.36, -r * 0.44, r * 0.1, 0, 0, r * 1.2);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.2, style.light);
    g.addColorStop(0.62, style.mid);
    g.addColorStop(1, style.dark);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = shade(style.dark, 0.6);
    ctx.lineWidth = Math.max(0.6, r * 0.09);
    ctx.stroke();
    // Clipped: unclipped, the rim light runs outside a diamond or a star and reads
    // as a chip out of the candy rather than as a highlight.
    ctx.save();
    candyPath(ctx, style.shape, r);
    ctx.clip();
    candyDetail(ctx, style, r);
    candyGloss(ctx, style, r);
    ctx.restore();

    if (piece.kind === 'lineH' || piece.kind === 'lineV') {
      drawBlasterMarks(ctx, style, r, piece.kind === 'lineV', time);
    } else if (piece.kind === 'bomb') {
      drawBurstWrapper(ctx, r, time);
    }
  }

  if (o.flash && o.flash > 0) {
    ctx.globalAlpha = Math.min(1, o.flash) * (o.alpha ?? 1);
    ctx.fillStyle = '#ffffff';
    if (style) candyPath(ctx, style.shape, r);
    else {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  ctx.restore();
}

// --------------------------------------------------------------------- layout

const CELL = 40;
const PAD = 9;
const HUD_H = 80;
const FOOT_H = 34;
const GRID_W = COLS * CELL;
const GRID_H = ROWS * CELL;
const BOARD_W = GRID_W + PAD * 2;
const BOARD_H = HUD_H + PAD + GRID_H + PAD + FOOT_H;
const GRID_X = PAD;
const GRID_Y = HUD_H + PAD;

export type Layout = { scale: number; ox: number; oy: number };

/** Fits the fixed board into whatever the canvas turned out to be, and centres it. */
export function makeLayout(cw: number, ch: number, inset: number): Layout {
  const usableH = Math.max(1, ch - inset);
  const scale = Math.min(cw / BOARD_W, usableH / BOARD_H);
  return { scale, ox: (cw - BOARD_W * scale) / 2, oy: (usableH - BOARD_H * scale) / 2 };
}

function cellX(c: number): number {
  return GRID_X + c * CELL + CELL / 2;
}
function cellY(r: number): number {
  return GRID_Y + r * CELL + CELL / 2;
}

/**
 * Canvas-normalised pointer to fractional grid coordinates. Fractional because a
 * drag needs to know how far into the next cell the finger has travelled, not
 * just which cell it is over.
 */
export function pointerGrid(
  lay: Layout,
  cw: number,
  ch: number,
  px: number | null,
  py: number | null,
): { r: number; c: number } | null {
  if (px === null || py === null) return null;
  const lx = (px * cw - lay.ox) / lay.scale;
  const ly = (py * ch - lay.oy) / lay.scale;
  return { r: (ly - GRID_Y) / CELL, c: (lx - GRID_X) / CELL };
}

/**
 * Normalised canvas coordinates of a cell's centre - the inverse of `pointerGrid`.
 * The checker taps through this, so a layout change cannot silently move the board
 * out from under the input mapping.
 */
export function cellPointer(
  lay: Layout,
  cw: number,
  ch: number,
  i: number,
): { x: number; y: number } {
  return {
    x: (cellX(colOf(i)) * lay.scale + lay.ox) / cw,
    y: (cellY(rowOf(i)) * lay.scale + lay.oy) / ch,
  };
}

export function gridIndex(pos: { r: number; c: number } | null): number {
  if (!pos) return -1;
  const r = Math.floor(pos.r);
  const c = Math.floor(pos.c);
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return -1;
  return idx(r, c);
}

// ----------------------------------------------------------------- simulation

export type Phase = 'intro' | 'idle' | 'swap' | 'revert' | 'clear' | 'fall' | 'shuffle' | 'won' | 'lost';

/** Per-cell presentation. The board holds what a candy IS; this holds where it looks. */
type CellView = {
  /** Vertical offset in cells. Negative is above its resting place. */
  off: number;
  /** How far this candy has to fall, in cells. Zero means it is not moving. */
  dist: number;
  delay: number;
  /** 0 while resting, climbing to 1 as the candy pops. */
  pop: number;
  /** 1 down to 0 as a newly made special swells into place. */
  birth: number;
  /** Seconds since landing, for the squash. Negative means still in the air. */
  land: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  spin: number;
  vs: number;
};

type Popup = { x: number; y: number; text: string; life: number; max: number; color: string; size: number };

export type Sim = {
  spec: LevelSpec;
  board: Board;
  /** Board randomness: refills and reshuffles only. */
  rand: () => number;
  /**
   * Effects randomness, kept separate on purpose. Particles are capped by how many
   * are already alive, which depends on the frame rate - drawing shards from the
   * board's generator would make the next refill depend on how fast the device is.
   */
  fx: () => number;
  phase: Phase;
  /** Seconds into the current phase, in game time (slowed on easy). */
  t: number;
  dur: number;
  movesLeft: number;
  /** Points scored on THIS level, which is what the target is measured against. */
  score: number;
  /** Depth of the chain in progress. 1 is the swap's own clear. */
  combo: number;
  res: Resolution | null;
  view: CellView[];
  sel: number;
  /** Cell the current press started on, for drag-to-swap. */
  press: number;
  dragged: boolean;
  swapA: number;
  swapB: number;
  particles: Particle[];
  popups: Popup[];
  shake: number;
  time: number;
  idleT: number;
  hint: Move | null;
  shuffled: boolean;
  announced: boolean;
  /** Repaint bookkeeping for the paused branch. */
  dimmed: boolean;
  lastW: number;
  lastH: number;
};

/** Cells per second squared. Tuned so a full-height drop takes about 0.42s. */
const GRAVITY = 90;
const SWAP_DUR = 0.16;
const REVERT_DUR = 0.3;
const CLEAR_DUR = 0.3;
const SHUFFLE_DUR = 0.85;
/** Seconds of no input before a legal move is pointed out. */
const HINT_AFTER = 5;
/** How far a finger must travel from the cell it pressed to count as a drag-swap. */
const DRAG_THRESHOLD = 0.42;
/** Points for each move left over when the target is reached. */
const LEFTOVER_BONUS = 25;

function freshViews(): CellView[] {
  return Array.from({ length: CELL_COUNT }, () => ({
    off: 0,
    dist: 0,
    delay: 0,
    pop: 0,
    birth: 0,
    land: 99,
  }));
}

export function makeSim(level: number, difficulty: Difficulty, seed: number): Sim {
  const spec = buildLevel(level, difficulty, seed);
  const sim: Sim = {
    spec,
    board: makeBoard(spec),
    // Seeded from the level, so the same level deals the same board and the same
    // refills for a given sequence of moves.
    rand: lcg(spec.seed ^ 0x5bf03635),
    fx: lcg(spec.seed ^ 0x1d872b41),
    phase: 'intro',
    t: 0,
    dur: 1,
    movesLeft: spec.moves,
    score: 0,
    combo: 0,
    res: null,
    view: freshViews(),
    sel: -1,
    press: -1,
    dragged: false,
    swapA: -1,
    swapB: -1,
    particles: [],
    popups: [],
    shake: 0,
    time: 0,
    idleT: 0,
    hint: null,
    shuffled: false,
    announced: false,
    dimmed: false,
    lastW: 0,
    lastH: 0,
  };
  startIntro(sim);
  return sim;
}

/** Deals the board in from above, column by column. */
function startIntro(sim: Sim): void {
  let longest = 0;
  for (let i = 0; i < CELL_COUNT; i += 1) {
    const v = sim.view[i];
    v.pop = 0;
    v.birth = 0;
    v.dist = rowOf(i) + 3;
    v.off = -v.dist;
    v.delay = colOf(i) * 0.04;
    v.land = -1;
    longest = Math.max(longest, v.delay + Math.sqrt((2 * v.dist) / GRAVITY));
  }
  sim.phase = 'intro';
  sim.t = 0;
  sim.dur = longest + 0.05;
}

/** Hands the falling animation a set of distances and runs it. */
function startFall(sim: Sim, falls: Fall[], entries: Entry[]): void {
  let longest = 0;
  for (const v of sim.view) {
    v.off = 0;
    v.dist = 0;
    v.delay = 0;
    v.pop = 0;
    if (v.land < 0) v.land = 99;
  }
  const set = (i: number, dist: number) => {
    const v = sim.view[i];
    v.dist = dist;
    v.off = -dist;
    // A slight per-column offset keeps a wide clear from landing as one thud.
    v.delay = colOf(i) * 0.012;
    v.land = -1;
    longest = Math.max(longest, v.delay + Math.sqrt((2 * dist) / GRAVITY));
  };
  for (const f of falls) set(f.to, rowOf(f.to) - rowOf(f.from));
  for (const e of entries) set(e.index, e.dist);
  sim.phase = 'fall';
  sim.t = 0;
  sim.dur = longest + 0.03;
}

function spawnShards(sim: Sim, i: number, piece: Piece, big: boolean): void {
  // A cap, because a colour bomb pair can clear the whole board at once.
  if (sim.particles.length > 420) return;
  const style = piece.color >= 0 ? CANDY[piece.color % CANDY.length] : null;
  const color = style ? style.mid : RAINBOW_WEDGES[i % RAINBOW_WEDGES.length];
  const light = style ? style.light : '#ffffff';
  const n = big ? 9 : 6;
  for (let k = 0; k < n; k += 1) {
    const a = sim.fx() * Math.PI * 2;
    const sp = (18 + sim.fx() * 74) * (big ? 1.35 : 1);
    sim.particles.push({
      x: cellX(colOf(i)),
      y: cellY(rowOf(i)),
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 34,
      life: 0.34 + sim.fx() * 0.34,
      max: 0.68,
      color: k % 3 === 0 ? light : color,
      size: 1.8 + sim.fx() * 3.4,
      spin: sim.fx() * Math.PI,
      vs: (sim.fx() - 0.5) * 12,
    });
  }
}

function addPopup(sim: Sim, x: number, y: number, text: string, color: string, size: number): void {
  sim.popups.push({ x, y, text, life: 0.95, max: 0.95, color, size });
}

const COMBO_WORDS = ['', '', 'CHAIN x2', 'CHAIN x3', 'CHAIN x4', 'BIG CHAIN x5', 'HUGE CHAIN x6'];

function startClear(sim: Sim, res: Resolution, api: GameApi): void {
  sim.res = res;
  sim.combo += 1;
  const gained = scoreFor(res.cleared.length, sim.combo, res.spawns.length);
  sim.score += gained;
  api.addScore(gained);

  let sx = 0;
  let sy = 0;
  for (const i of res.cleared) {
    const piece = sim.board[i];
    sim.view[i].pop = 0.001;
    sx += cellX(colOf(i));
    sy += cellY(rowOf(i));
    if (piece) spawnShards(sim, i, piece, piece.kind !== 'plain');
  }
  const n = Math.max(1, res.cleared.length);
  addPopup(sim, sx / n, sy / n, `+${gained}`, '#fff0a8', 13 + Math.min(6, res.cleared.length / 4));

  if (sim.combo >= 2) {
    const word = COMBO_WORDS[Math.min(sim.combo, COMBO_WORDS.length - 1)];
    addPopup(sim, GRID_X + GRID_W / 2, GRID_Y + GRID_H * 0.3, word, '#ffd12f', 17);
  }
  for (const s of res.spawns) {
    const label = s.kind === 'rainbow' ? 'COLOUR BOMB!' : s.kind === 'bomb' ? 'BURST!' : 'BLASTER!';
    addPopup(sim, cellX(colOf(s.index)), cellY(rowOf(s.index)) - CELL * 0.5, label, '#ffffff', 11);
  }

  playSound('coin', sim.combo - 1);
  if (res.spawns.length > 0) playSound('powerup');
  if (res.cleared.length >= 9) playSound('stomp');
  // Shake scales with the size of the clear and the depth of the chain, so a
  // three-match barely registers and a colour bomb rocks the board.
  sim.shake = Math.min(7, res.cleared.length * 0.22 + (sim.combo - 1) * 1.1);

  sim.phase = 'clear';
  sim.t = 0;
  sim.dur = CLEAR_DUR;
}

/** Clear finished: empty the cells, place the new specials, then drop everything. */
function endClear(sim: Sim): void {
  const res = sim.res;
  sim.res = null;
  if (!res) return;
  applyResolution(sim.board, res);
  for (const i of res.cleared) sim.view[i].pop = 0;
  for (const s of res.spawns) {
    sim.view[s.index].birth = 1;
    sim.view[s.index].pop = 0;
  }
  const falls = collapse(sim.board);
  const entries = refill(sim.board, sim.rand, sim.spec.colors);
  startFall(sim, falls, entries);
}

function startShuffle(sim: Sim, api: GameApi): void {
  sim.phase = 'shuffle';
  sim.t = 0;
  sim.dur = SHUFFLE_DUR;
  sim.shuffled = false;
  sim.sel = -1;
  sim.hint = null;
  api.setStatus('No moves left - shuffling!');
  playSound('powerup');
}

/**
 * Everything has settled. Decides what happens next, in priority order: the level
 * is won, the moves are gone, the board is dead, or the player is back in control.
 */
function settle(sim: Sim, api: GameApi): void {
  sim.res = null;
  sim.combo = 0;
  sim.sel = -1;
  sim.press = -1;

  if (sim.score >= sim.spec.target) {
    sim.phase = 'won';
    sim.t = 0;
    sim.dur = 0.85;
    playSound('levelClear');
    return;
  }
  if (sim.movesLeft <= 0) {
    sim.phase = 'lost';
    sim.t = 0;
    sim.dur = 0.7;
    playSound('gameOver');
    return;
  }
  if (!hasLegalMove(sim.board)) {
    startShuffle(sim, api);
    return;
  }
  sim.phase = 'idle';
  sim.idleT = 0;
  sim.hint = null;
}

function tryMove(sim: Sim, a: number, b: number, api: GameApi): void {
  sim.sel = -1;
  sim.hint = null;
  sim.idleT = 0;
  sim.swapA = a;
  sim.swapB = b;
  sim.t = 0;

  // An illegal swap animates out and back and costs nothing. Charging a move for
  // a mistake is the fastest way to make a kid stop playing.
  if (!isLegalSwap(sim.board, a, b)) {
    sim.phase = 'revert';
    sim.dur = REVERT_DUR;
    playSound('land');
    return;
  }

  sim.movesLeft -= 1;
  sim.combo = 0;
  sim.phase = 'swap';
  sim.dur = SWAP_DUR;
  playSound('jump');
  if (sim.movesLeft === 5 || sim.movesLeft === 3 || sim.movesLeft === 1) {
    api.setStatus(`Level ${sim.spec.level} - ${sim.movesLeft} move${sim.movesLeft === 1 ? '' : 's'} left`);
  }
}

/** Applies the swap for real and works out what it set off. */
function endSwap(sim: Sim, api: GameApi): void {
  const a = sim.swapA;
  const b = sim.swapB;
  const pa = sim.board[a];
  sim.board[a] = sim.board[b];
  sim.board[b] = pa;
  const res = resolveSwapActivation(sim.board, a, b) ?? resolveMatches(sim.board, a, b);
  if (res) startClear(sim, res, api);
  else settle(sim, api);
}

function readInput(sim: Sim, input: InputController, lay: Layout, cw: number, ch: number, api: GameApi): void {
  const pos = pointerGrid(lay, cw, ch, input.pointerX, input.pointerY);
  const cell = gridIndex(pos);

  if (input.consumePointerPress()) {
    if (cell < 0) {
      sim.sel = -1;
      sim.press = -1;
    } else {
      sim.press = cell;
      sim.dragged = false;
      sim.idleT = 0;
      if (sim.sel === cell) {
        sim.sel = -1;
        playSound('click');
      } else if (sim.sel >= 0 && areAdjacent(sim.sel, cell)) {
        tryMove(sim, sim.sel, cell, api);
        return;
      } else {
        sim.sel = cell;
        playSound('click');
      }
    }
  }

  // Drag to swap: once the finger has left the cell it pressed by enough, the
  // dominant axis picks the neighbour. Kids reach for this before they try
  // tapping twice, so both have to work.
  if (input.pointerDown && pos && sim.press >= 0 && !sim.dragged) {
    const dr = pos.r - (rowOf(sim.press) + 0.5);
    const dc = pos.c - (colOf(sim.press) + 0.5);
    if (Math.abs(dr) > DRAG_THRESHOLD || Math.abs(dc) > DRAG_THRESHOLD) {
      const horiz = Math.abs(dc) >= Math.abs(dr);
      const r = rowOf(sim.press) + (horiz ? 0 : Math.sign(dr));
      const c = colOf(sim.press) + (horiz ? Math.sign(dc) : 0);
      sim.dragged = true;
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
        tryMove(sim, sim.press, idx(r, c), api);
        return;
      }
    }
  }

  if (input.consumePointerRelease()) {
    sim.press = -1;
    sim.dragged = false;
  }
}

/** Advances everything that is not the board itself. */
function updateEffects(sim: Sim, st: number): void {
  for (let i = sim.particles.length - 1; i >= 0; i -= 1) {
    const p = sim.particles[i];
    p.life -= st;
    p.x += p.vx * st;
    p.y += p.vy * st;
    p.vy += 260 * st;
    p.spin += p.vs * st;
    if (p.life <= 0) sim.particles.splice(i, 1);
  }
  for (let i = sim.popups.length - 1; i >= 0; i -= 1) {
    const p = sim.popups[i];
    p.life -= st;
    p.y -= 26 * st;
    if (p.life <= 0) sim.popups.splice(i, 1);
  }
  if (sim.shake > 0) sim.shake = Math.max(0, sim.shake - st * 26);
  for (const v of sim.view) {
    if (v.birth > 0) v.birth = Math.max(0, v.birth - st / 0.32);
  }
}

/** The falling updater, shared by the deal-in and every gravity step after it. */
function updateFall(sim: Sim, st: number): void {
  for (const v of sim.view) {
    if (v.dist <= 0) {
      if (v.land >= 0) v.land += st;
      continue;
    }
    const tt = sim.t - v.delay;
    if (tt <= 0) {
      v.off = -v.dist;
      continue;
    }
    const fallen = 0.5 * GRAVITY * tt * tt;
    if (fallen >= v.dist) {
      v.off = 0;
      v.land = v.land < 0 ? 0 : v.land + st;
    } else {
      v.off = fallen - v.dist;
    }
  }
}

/**
 * One frame of game logic. Returns the sim to use next frame, which is a brand
 * new one when a level ends - the same trick Breakout uses, so the next board is
 * already built and waiting behind the question gate.
 */
export function update(
  sim: Sim,
  dt: number,
  input: InputController,
  api: GameApi,
  lay: Layout,
  cw: number,
  ch: number,
  difficulty: Difficulty,
  seed: number,
): Sim {
  // Easy runs the whole animation a touch slower, which is time to see what
  // happened rather than a handicap.
  const st = dt * SPEED_SCALE[difficulty];
  sim.time += st;
  updateEffects(sim, st);

  if (!sim.announced) {
    sim.announced = true;
    api.setStatus(`Level ${sim.spec.level} - reach ${sim.spec.target} in ${sim.spec.moves} moves`);
  }

  switch (sim.phase) {
    case 'intro':
    case 'fall': {
      sim.t += st;
      updateFall(sim, st);
      if (sim.t >= sim.dur) {
        for (const v of sim.view) {
          v.off = 0;
          v.dist = 0;
        }
        const res = resolveMatches(sim.board);
        if (res && sim.combo < MAX_CASCADE) startClear(sim, res, api);
        else settle(sim, api);
      }
      break;
    }

    case 'idle': {
      sim.idleT += st;
      readInput(sim, input, lay, cw, ch, api);
      if (sim.phase === 'idle' && sim.idleT > HINT_AFTER && !sim.hint) {
        // Point at the best move rather than any move: a hint that clears nothing
        // teaches the wrong lesson.
        const moves = findLegalMoves(sim.board);
        let best: Move | null = null;
        let bestValue = -1;
        for (const mv of moves) {
          const v = moveValue(sim.board, mv);
          if (v > bestValue) {
            bestValue = v;
            best = mv;
          }
        }
        sim.hint = best;
      }
      break;
    }

    case 'swap': {
      sim.t += st;
      if (sim.t >= sim.dur) endSwap(sim, api);
      break;
    }

    case 'revert': {
      sim.t += st;
      if (sim.t >= sim.dur) {
        sim.phase = 'idle';
        sim.swapA = -1;
        sim.swapB = -1;
        sim.idleT = 0;
      }
      break;
    }

    case 'clear': {
      sim.t += st;
      const p = Math.min(1, sim.t / sim.dur);
      if (sim.res) for (const i of sim.res.cleared) sim.view[i].pop = p;
      if (sim.t >= sim.dur) endClear(sim);
      break;
    }

    case 'shuffle': {
      sim.t += st;
      if (!sim.shuffled && sim.t >= sim.dur * 0.45) {
        sim.shuffled = true;
        // A failed shuffle is not fatal: settle() will notice the board is still
        // dead and spin it again.
        shuffleBoard(sim.board, sim.rand, sim.spec.colors);
      }
      if (sim.t >= sim.dur) settle(sim, api);
      break;
    }

    case 'won': {
      sim.t += st;
      if (sim.t >= sim.dur) {
        const bonus = sim.movesLeft * LEFTOVER_BONUS;
        if (bonus > 0) api.addScore(bonus);
        const cleared = sim.spec.level;
        api.requestGate(`Level ${cleared} cleared!`);
        return makeSim(cleared + 1, difficulty, seed);
      }
      break;
    }

    case 'lost': {
      sim.t += st;
      if (sim.t >= sim.dur) {
        api.died('Out of moves');
        // Same level, fresh board. `died` does not always pause - the shell may
        // spend a free pass instead - so the retry has to be set up either way.
        return makeSim(sim.spec.level, difficulty, seed);
      }
      break;
    }
  }
  return sim;
}

// -------------------------------------------------------------------- drawing

function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
  align: CanvasTextAlign = 'left',
): void {
  ctx.font = `bold ${size}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
  ctx.textAlign = 'left';
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function easeInOut(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p);
}

/** Overshoots slightly past 1, which is what makes a new special feel placed. */
function easeOutBack(p: number): number {
  const c1 = 1.9;
  const c3 = c1 + 1;
  return 1 + c3 * (p - 1) ** 3 + c1 * (p - 1) ** 2;
}

function paintBackdrop(ctx: CanvasRenderingContext2D, cw: number, ch: number, time: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, ch);
  g.addColorStop(0, '#2a1140');
  g.addColorStop(0.55, '#1b0d2b');
  g.addColorStop(1, '#120a1e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cw, ch);

  // Two slow glows, so a big flat background is not a big flat background.
  for (const [i, col] of ['#ff6fb5', '#5ec8ff'].entries()) {
    const x = cw * (i === 0 ? 0.22 : 0.8) + Math.sin(time * 0.25 + i * 2) * cw * 0.06;
    const y = ch * (i === 0 ? 0.2 : 0.78);
    const r = Math.max(cw, ch) * 0.5;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r);
    glow.addColorStop(0, shade(col, 0.16));
    glow.addColorStop(1, shade(col, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, cw, ch);
  }
}

/** The tray the candies sit in: a raised rounded frame with a recessed well. */
function drawTray(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.fillStyle = 'rgba(8,3,16,0.5)';
  roundRect(ctx, GRID_X - PAD + 1, GRID_Y - PAD + 3, GRID_W + PAD * 2 - 2, GRID_H + PAD * 2, 16);
  ctx.fill();

  const rim = ctx.createLinearGradient(0, GRID_Y - PAD, 0, GRID_Y + GRID_H + PAD);
  rim.addColorStop(0, 'rgba(255,255,255,0.20)');
  rim.addColorStop(0.5, 'rgba(255,255,255,0.06)');
  rim.addColorStop(1, 'rgba(255,255,255,0.14)');
  ctx.strokeStyle = rim;
  ctx.lineWidth = 1.6;
  roundRect(ctx, GRID_X - PAD + 1, GRID_Y - PAD + 1, GRID_W + PAD * 2 - 2, GRID_H + PAD * 2 - 2, 15);
  ctx.stroke();

  const well = ctx.createLinearGradient(0, GRID_Y, 0, GRID_Y + GRID_H);
  well.addColorStop(0, 'rgba(0,0,0,0.34)');
  well.addColorStop(1, 'rgba(0,0,0,0.16)');
  ctx.fillStyle = well;
  roundRect(ctx, GRID_X, GRID_Y, GRID_W, GRID_H, 10);
  ctx.fill();
  ctx.restore();
}

function drawTiles(ctx: CanvasRenderingContext2D): void {
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      ctx.fillStyle = (r + c) % 2 === 0 ? 'rgba(255,255,255,0.055)' : 'rgba(255,255,255,0.025)';
      roundRect(ctx, GRID_X + c * CELL + 1.5, GRID_Y + r * CELL + 1.5, CELL - 3, CELL - 3, 7);
      ctx.fill();
    }
  }
}

/** A ring around a cell. Used for the selection and for the idle hint. */
function drawRing(
  ctx: CanvasRenderingContext2D,
  i: number,
  color: string,
  time: number,
  thick: number,
): void {
  const pulse = 1 + Math.sin(time * 6) * 0.06;
  const size = CELL * 0.94 * pulse;
  const x = cellX(colOf(i)) - size / 2;
  const y = cellY(rowOf(i)) - size / 2;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = thick;
  roundRect(ctx, x, y, size, size, 9);
  ctx.stroke();
  ctx.restore();
}

function drawPieces(ctx: CanvasRenderingContext2D, sim: Sim): void {
  const shuffling = sim.phase === 'shuffle';
  const shuffleK = shuffling
    ? sim.t / sim.dur < 0.45
      ? clamp01(sim.t / sim.dur / 0.45)
      : clamp01(1 - (sim.t / sim.dur - 0.45) / 0.55)
    : 0;
  const gx = GRID_X + GRID_W / 2;
  const gy = GRID_Y + GRID_H / 2;

  for (let i = 0; i < CELL_COUNT; i += 1) {
    const piece = sim.board[i];
    if (!piece) continue;
    const v = sim.view[i];
    let x = cellX(colOf(i));
    let y = cellY(rowOf(i)) + v.off * CELL;
    const o: CandyOpts = {};

    if ((sim.phase === 'swap' || sim.phase === 'revert') && (i === sim.swapA || i === sim.swapB)) {
      const other = i === sim.swapA ? sim.swapB : sim.swapA;
      const p = clamp01(sim.t / sim.dur);
      // A swap slides all the way across; a rejected swap bulges out and returns.
      const travel = sim.phase === 'swap' ? easeInOut(p) : Math.sin(Math.PI * p) * 0.42;
      x += (cellX(colOf(other)) - x) * travel;
      y += (cellY(rowOf(other)) - cellY(rowOf(i))) * travel;
      o.scale = 1 + Math.sin(Math.PI * p) * 0.1;
      if (sim.phase === 'revert') o.spin = Math.sin(Math.PI * p * 2) * 0.14;
    }

    if (sim.sel === i) {
      // The selected candy lifts and breathes, so it is obvious what is armed.
      o.scale = (o.scale ?? 1) * (1.08 + Math.sin(sim.time * 6) * 0.04);
      y -= CELL * 0.05;
    }

    if (v.pop > 0) {
      const p = v.pop;
      o.scale = (o.scale ?? 1) * (p < 0.3 ? 1 + (p / 0.3) * 0.3 : Math.max(0, 1.3 * (1 - (p - 0.3) / 0.7)));
      o.alpha = 1 - clamp01((p - 0.4) / 0.6);
      o.flash = clamp01(p * 1.7);
      o.spin = (o.spin ?? 0) + p * 1.1;
      o.shadow = false;
    } else if (v.birth > 0) {
      const k = 1 - v.birth;
      o.scale = (o.scale ?? 1) * (0.35 + easeOutBack(k) * 0.65);
      // A halo while it swells, so a new special is never missed.
      ctx.save();
      ctx.globalAlpha = v.birth * 0.6;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, CELL * (0.3 + (1 - v.birth) * 0.55), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (v.land >= 0 && v.land < 0.16) {
      o.squash = 1 - 0.2 * (1 - v.land / 0.16);
    }

    if (shuffling) {
      x += (gx - x) * shuffleK;
      y += (gy - y) * shuffleK;
      o.scale = (o.scale ?? 1) * (1 - 0.72 * shuffleK);
      o.spin = (o.spin ?? 0) + shuffleK * Math.PI * 1.6;
    }

    drawCandy(ctx, x, y, CELL, piece, sim.time, o);
  }

  if (sim.sel >= 0) drawRing(ctx, sim.sel, 'rgba(255,255,255,0.95)', sim.time, 2.6);
  if (sim.hint) {
    drawRing(ctx, sim.hint.a, 'rgba(255,209,47,0.85)', sim.time, 2.2);
    drawRing(ctx, sim.hint.b, 'rgba(255,209,47,0.85)', sim.time, 2.2);
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, sim: Sim): void {
  for (const p of sim.particles) {
    ctx.save();
    ctx.globalAlpha = clamp01(p.life / p.max);
    ctx.translate(p.x, p.y);
    ctx.rotate(p.spin);
    ctx.fillStyle = p.color;
    roundRect(ctx, -p.size / 2, -p.size / 2, p.size, p.size, p.size * 0.35);
    ctx.fill();
    ctx.restore();
  }
}

function drawPopups(ctx: CanvasRenderingContext2D, sim: Sim): void {
  for (const p of sim.popups) {
    const k = p.life / p.max;
    ctx.save();
    ctx.globalAlpha = clamp01(k * 1.6);
    // A short pop on the way in reads as impact rather than a floating label.
    const grow = k > 0.8 ? 1 + (1 - k) * 3 : 1.06;
    ctx.translate(p.x, p.y);
    ctx.scale(grow, grow);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(12,4,22,0.75)';
    ctx.font = `bold ${p.size}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.strokeText(p.text, 0, 0);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, 0, 0);
    ctx.textAlign = 'left';
    ctx.restore();
  }
}

function drawHud(ctx: CanvasRenderingContext2D, sim: Sim): void {
  const spec = sim.spec;

  // --- level chip ---
  ctx.fillStyle = 'rgba(255,255,255,0.09)';
  roundRect(ctx, PAD, 10, 92, 26, 13);
  ctx.fill();
  label(ctx, `LEVEL ${spec.level}`, PAD + 46, 28, 13, '#ffffff', 'center');

  // --- moves badge ---
  const low = sim.movesLeft <= 3;
  const warn = sim.movesLeft <= 6;
  const badgeW = 58;
  const bx = BOARD_W - PAD - badgeW;
  ctx.fillStyle = low ? 'rgba(255,90,110,0.22)' : warn ? 'rgba(255,190,60,0.18)' : 'rgba(255,255,255,0.09)';
  roundRect(ctx, bx, 8, badgeW, 42, 12);
  ctx.fill();
  ctx.strokeStyle = low ? 'rgba(255,120,140,0.75)' : 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1.4;
  roundRect(ctx, bx, 8, badgeW, 42, 12);
  ctx.stroke();
  const movesColor = low ? '#ff9fb0' : warn ? '#ffd12f' : '#ffffff';
  // Pulses only when it matters, so it is a warning rather than decoration.
  const beat = low ? 1 + Math.sin(sim.time * 7) * 0.06 : 1;
  ctx.save();
  ctx.translate(bx + badgeW / 2, 32);
  ctx.scale(beat, beat);
  label(ctx, String(sim.movesLeft), 0, 0, 22, movesColor, 'center');
  ctx.restore();
  label(ctx, 'MOVES', bx + badgeW / 2, 46, 8, 'rgba(255,255,255,0.5)', 'center');

  // --- target progress ---
  const barX = PAD;
  const barY = 58;
  const barW = BOARD_W - PAD * 2;
  const barH = 13;
  const frac = clamp01(sim.score / spec.target);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  roundRect(ctx, barX, barY, barW, barH, barH / 2);
  ctx.fill();

  if (frac > 0) {
    ctx.save();
    roundRect(ctx, barX, barY, barW, barH, barH / 2);
    ctx.clip();
    const fill = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    fill.addColorStop(0, '#ff6fb5');
    fill.addColorStop(0.55, '#ffb03a');
    fill.addColorStop(1, '#ffe86a');
    ctx.fillStyle = fill;
    ctx.fillRect(barX, barY, barW * frac, barH);
    // A moving sheen along the filled part.
    const sheenX = barX + ((sim.time * 90) % (barW + 60)) - 30;
    const sheen = ctx.createLinearGradient(sheenX, 0, sheenX + 30, 0);
    sheen.addColorStop(0, 'rgba(255,255,255,0)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0.45)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(barX, barY, barW * frac, barH);
    ctx.restore();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 1;
  roundRect(ctx, barX, barY, barW, barH, barH / 2);
  ctx.stroke();

  label(
    ctx,
    `${sim.score} / ${spec.target}`,
    barX + barW / 2,
    barY + barH - 2.5,
    9.5,
    frac > 0.55 ? 'rgba(60,20,0,0.85)' : 'rgba(255,255,255,0.85)',
    'center',
  );

  // The star fills in as the target is met, which is the reward a kid watches for.
  ctx.save();
  ctx.translate(barX + barW - 6, barY + barH / 2);
  const done = frac >= 1;
  const starScale = done ? 1.25 + Math.sin(sim.time * 8) * 0.12 : 1;
  ctx.scale(starScale, starScale);
  const pts: Pt[] = [];
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const rad = i % 2 === 0 ? 8 : 3.6;
    pts.push([Math.cos(a) * rad, Math.sin(a) * rad]);
  }
  splinePoly(ctx, pts, 0.4);
  ctx.fillStyle = done ? '#ffe86a' : 'rgba(255,255,255,0.16)';
  ctx.fill();
  ctx.strokeStyle = done ? '#ffffff' : 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
}

function footerText(sim: Sim): string {
  switch (sim.phase) {
    case 'intro':
      return 'Get ready...';
    case 'shuffle':
      return 'No moves left - shuffling';
    case 'won':
      return 'Target reached!';
    case 'lost':
      return 'Out of moves';
    case 'idle':
      return sim.sel >= 0 ? 'Now tap a candy next to it' : 'Tap two candies side by side, or drag one';
    default:
      return sim.combo >= 2 ? `Chain x${sim.combo}!` : 'Nice!';
  }
}

function drawFooter(ctx: CanvasRenderingContext2D, sim: Sim): void {
  const y = HUD_H + PAD + GRID_H + PAD + 21;
  label(ctx, footerText(sim), BOARD_W / 2, y, 11, 'rgba(255,255,255,0.55)', 'center');
}

function drawBanner(ctx: CanvasRenderingContext2D, sim: Sim): void {
  if (sim.phase !== 'won' && sim.phase !== 'lost') return;
  const won = sim.phase === 'won';
  const p = clamp01(sim.t / (sim.dur * 0.4));
  const cy = GRID_Y + GRID_H / 2;
  ctx.save();
  ctx.globalAlpha = Math.min(1, p * 1.4);
  ctx.fillStyle = won ? 'rgba(20,8,34,0.72)' : 'rgba(28,6,14,0.72)';
  roundRect(ctx, GRID_X + 8, cy - 40, GRID_W - 16, 80, 16);
  ctx.fill();
  ctx.strokeStyle = won ? 'rgba(255,232,106,0.7)' : 'rgba(255,140,150,0.6)';
  ctx.lineWidth = 2;
  roundRect(ctx, GRID_X + 8, cy - 40, GRID_W - 16, 80, 16);
  ctx.stroke();
  ctx.translate(GRID_X + GRID_W / 2, cy);
  const s = 0.7 + easeOutBack(p) * 0.3;
  ctx.scale(s, s);
  label(ctx, won ? 'LEVEL CLEARED' : 'OUT OF MOVES', 0, -2, 22, won ? '#ffe86a' : '#ff9fb0', 'center');
  label(
    ctx,
    won
      ? `${sim.movesLeft} moves left - +${sim.movesLeft * LEFTOVER_BONUS} bonus`
      : `${sim.score} of ${sim.spec.target} - one more go`,
    0,
    22,
    11,
    'rgba(255,255,255,0.75)',
    'center',
  );
  ctx.restore();
}

export function draw(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
  lay: Layout,
  cw: number,
  ch: number,
  dimmed: boolean,
): void {
  paintBackdrop(ctx, cw, ch, sim.time);

  ctx.save();
  ctx.translate(lay.ox, lay.oy);
  ctx.scale(lay.scale, lay.scale);
  if (sim.shake > 0) {
    // Driven off the clock rather than a random number, so the shake is smooth
    // rather than a jitter, and identical on a replay.
    ctx.translate(Math.sin(sim.time * 97) * sim.shake, Math.cos(sim.time * 71) * sim.shake * 0.7);
  }

  drawHud(ctx, sim);
  drawTray(ctx);

  ctx.save();
  roundRect(ctx, GRID_X, GRID_Y, GRID_W, GRID_H, 10);
  ctx.clip();
  drawTiles(ctx);
  drawPieces(ctx, sim);
  drawParticles(ctx, sim);
  ctx.restore();

  drawBanner(ctx, sim);
  drawPopups(ctx, sim);
  drawFooter(ctx, sim);
  ctx.restore();

  if (dimmed) {
    ctx.fillStyle = 'rgba(6,2,14,0.6)';
    ctx.fillRect(0, 0, cw, ch);
    label(ctx, 'PAUSED', cw / 2, ch / 2, 15, 'rgba(255,255,255,0.55)', 'center');
  }
}

// ------------------------------------------------------------------ component

export default function Match3({
  paused,
  input,
  api,
  restartToken,
  difficulty,
  controlsInset,
}: GameCanvasProps) {
  const simRef = useRef<Sim | null>(null);
  const seedRef = useRef(1);

  // A fresh run gets a fresh seed, so the boards are not identical every session.
  // The sim itself is built on the first frame, which keeps the server render and
  // the client render identical.
  useEffect(() => {
    seedRef.current = (Date.now() ^ Math.imul(restartToken + 1, 2654435761)) >>> 0 || 1;
    simRef.current = null;
  }, [restartToken, difficulty]);

  // iOS refuses to start an AudioContext outside a real gesture, and a frame
  // callback is not a gesture, so the unlock has to hang off the event itself.
  // Harmless if something else already unlocked it.
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const { canvasRef } = useCanvasGame({
    // Deliberately always active. The loop keeps turning while a question is open
    // so that resuming cannot hand the game a huge dt; the paused branch below
    // advances nothing.
    active: true,
    step: (ctx, dt, cw, ch) => {
      let sim = simRef.current;
      if (!sim) {
        sim = makeSim(1, difficulty, seedRef.current);
        simRef.current = sim;
      }
      const lay = makeLayout(cw, ch, controlsInset);

      if (paused) {
        // Nothing moves, and the frozen board is repainted only when it would
        // otherwise be stale: the first paused frame, or after a resize reset the
        // backing store.
        if (!sim.dimmed || sim.lastW !== cw || sim.lastH !== ch) {
          draw(ctx, sim, lay, cw, ch, true);
          sim.dimmed = true;
          sim.lastW = cw;
          sim.lastH = ch;
        }
        return;
      }

      sim.dimmed = false;
      sim.lastW = cw;
      sim.lastH = ch;
      const next = update(sim, dt, input, api, lay, cw, ch, difficulty, seedRef.current);
      simRef.current = next;
      draw(ctx, next, lay, cw, ch, false);
    },
  });

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />;
}
