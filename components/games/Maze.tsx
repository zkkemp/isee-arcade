'use client';

import { useEffect, useRef } from 'react';
import { RAMP_SCALE, SPEED_SCALE, type Difficulty } from '@/lib/difficulty';
import type { GameApi, GameCanvasProps } from '@/lib/games';
import type { Direction } from '@/lib/input';
import { animFrame, drawFrame, useSprites, type SpriteSet } from '@/lib/sprites';
import { fitBoard, useCanvasGame } from '@/lib/useCanvasGame';

/**
 * Dot Muncher - a maze chase.
 *
 * Every layout is generated from a seeded LCG keyed on (level, difficulty), so
 * generation is pure and repeatable and `scripts/check-maze.ts` can make claims
 * about the actual maze a player will get rather than about a copy of it.
 *
 * The two things that silently ruin this genre are both structural, so both are
 * guaranteed by construction rather than by hope:
 *
 *  1. A walled-off pocket makes a level impossible to clear - the player eats
 *     everything reachable and the dot counter never hits zero. Dots are
 *     therefore only ever placed on cells a flood fill actually reached:
 *     `buildMaze` prunes every unreached open cell before it places a single dot,
 *     and the flood fill walks with the same step function the game moves with.
 *  2. Sub-cell drift wedges the player against a wall. Position here is not a
 *     free vector - a mover is an integer cell plus `prog`, a 0..1 fraction of
 *     the way toward one neighbour. There is no representable position that is
 *     not on the grid or on a legal edge between two open cells.
 */

// ------------------------------------------------------------------ geometry

export const COLS = 19;
export const ROWS = 19;
/** Mirror column. Odd, so the axis is itself a corridor rather than a wall. */
const AXIS = (COLS - 1) / 2;
const CELL = 18;
const HUD_H = 16;
const BOARD_W = COLS * CELL;
const BOARD_H = ROWS * CELL + HUD_H;

/** Minimum grid distance from the player's spawn to any chaser's spawn. */
export const SAFE_RADIUS = 7;

export type Cell = { r: number; c: number };

export const DIRECTIONS: Direction[] = ['up', 'down', 'left', 'right'];

const DELTA: Record<Direction, { dr: number; dc: number }> = {
  up: { dr: -1, dc: 0 },
  down: { dr: 1, dc: 0 },
  left: { dr: 0, dc: -1 },
  right: { dr: 0, dc: 1 },
};

const OPPOSITE: Record<Direction, Direction> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

// ------------------------------------------------------------ difficulty dials

/** Cells per second. Constant across levels: the kid's own control never changes. */
const PLAYER_SPEED = 5.2;
const CHASER_SPEED_BASE = 4;
/** Chasers may end up a shade faster than the player, but never a lot. */
const CHASER_SPEED_CAP = PLAYER_SPEED * 1.12;

const CHASER_BASE: Record<Difficulty, number> = { easy: 2, normal: 3, hard: 4 };
const CHASER_MAX: Record<Difficulty, number> = { easy: 3, normal: 4, hard: 5 };
/** Levels between each extra chaser. */
const CHASER_EVERY: Record<Difficulty, number> = { easy: 6, normal: 4, hard: 3 };

/** Power pellet duration, seconds. */
const FRIGHT_BASE: Record<Difficulty, number> = { easy: 9, normal: 7, hard: 5 };
const FRIGHT_MIN: Record<Difficulty, number> = { easy: 5, normal: 3.5, hard: 2.5 };

/** Scatter is the breather: chasers head for their corners instead of the player. */
const SCATTER_BASE: Record<Difficulty, number> = { easy: 9, normal: 6, hard: 4 };
const SCATTER_MIN: Record<Difficulty, number> = { easy: 5, normal: 3.5, hard: 2 };
const CHASE_BASE: Record<Difficulty, number> = { easy: 12, normal: 16, hard: 22 };

/**
 * Chance the semi-random chaser throws away its plan at a junction. Higher is
 * friendlier, so easy gets the most of it.
 */
const WANDER_BASE: Record<Difficulty, number> = { easy: 0.45, normal: 0.35, hard: 0.28 };

/**
 * How often a dead end gets a second opening. High values braid the maze into
 * loops, which is what makes a chase survivable; harder levels keep more dead
 * ends, which is what makes them frightening.
 */
const BRAID_BASE: Record<Difficulty, number> = { easy: 0.95, normal: 0.85, hard: 0.7 };
/** Extra walls knocked out at random, purely for more loops. */
const LOOP_BASE: Record<Difficulty, number> = { easy: 0.22, normal: 0.15, hard: 0.09 };

/** Seconds the chasers stay frozen at the start of a level and after a death. */
const READY_SECONDS = 1.8;
/**
 * Contact is ignored for this long after a reset. The shell may run one more
 * frame before a question pauses play, and a second death in that frame would
 * cost a second question for one mistake.
 */
const GRACE_SECONDS = 0.4;
/** How long a queued turn is remembered if no junction ever allows it. */
const WANT_MEMORY = 0.9;
/** Centre-to-centre distance, in cells, that counts as contact. */
const TOUCH_DIST = 0.62;

const SCORE_DOT = 10;
const SCORE_PELLET = 50;
const SCORE_CLEAR = 150;
const SCORE_CHASER = 200;

// -------------------------------------------------------------------- chasers

/**
 * Four readable behaviours. A kid should be able to say out loud what each one
 * is doing, so there is no shared "optimal pursuit" fallback:
 *  direct   - walks straight at you
 *  wanderer - mostly at you, but throws the plan away at junctions
 *  ambusher - aims four cells ahead of your heading, to cut you off
 *  shy      - chases from a distance and peels off to its corner up close
 */
export type ChaserKind = 'direct' | 'wanderer' | 'ambusher' | 'shy';

export type ChaserSpec = {
  kind: ChaserKind;
  spawn: Cell;
  corner: Cell;
  sprites: [string, string];
  /** Readability aid: a coloured pool under each chaser. */
  tint: string;
};

/**
 * Roster order is difficulty order too - easy only ever fields the first two, so
 * a beginner meets the friendliest pair: one straight chaser and one scatterbrain.
 */
const ROSTER: Array<Omit<ChaserSpec, 'spawn' | 'corner'>> = [
  { kind: 'direct', sprites: ['slime_normal_walk_a', 'slime_normal_walk_b'], tint: '#ff6b81' },
  { kind: 'wanderer', sprites: ['ladybug_walk_a', 'ladybug_walk_b'], tint: '#ffb347' },
  { kind: 'ambusher', sprites: ['bee_a', 'bee_b'], tint: '#ffe066' },
  { kind: 'shy', sprites: ['fly_a', 'fly_b'], tint: '#7ee0ff' },
  { kind: 'ambusher', sprites: ['slime_spike_walk_a', 'slime_spike_walk_b'], tint: '#c77dff' },
];

/** Scatter corners, one per roster slot. */
const CORNERS: Cell[] = [
  { r: 1, c: COLS - 2 },
  { r: 1, c: 1 },
  { r: ROWS - 2, c: COLS - 2 },
  { r: ROWS - 2, c: 1 },
  { r: 1, c: AXIS },
];

/** Wall art per level. Literal names, so `npm run check:sprites` can see them. */
const WALL_TILES = [
  'terrain_stone_block_center',
  'terrain_purple_block_center',
  'terrain_dirt_block_center',
  'terrain_snow_block_center',
  'terrain_sand_block_center',
  'terrain_grass_block_center',
];

/** Colour of the area around the board, matched to that level's wall art. */
const FRAME_COLORS = ['#141225', '#1a1230', '#1d1710', '#101a26', '#231b12', '#12210f'];

// ----------------------------------------------------------------- generation

export type MazeLevel = {
  level: number;
  difficulty: Difficulty;
  cols: number;
  rows: number;
  /** wall[r][c] - true is solid. */
  wall: boolean[][];
  /** dot[r][c] - a dot to eat. Never true where `wall` is true. */
  dot: boolean[][];
  dotCount: number;
  pellets: Cell[];
  playerSpawn: Cell;
  chasers: ChaserSpec[];
  /** The one row open at both edges; leaving either end wraps to the other. */
  tunnelRow: number;
  playerSpeed: number;
  chaserSpeed: number;
  frightSeconds: number;
  scatterSeconds: number;
  chaseSeconds: number;
  wanderChance: number;
  wallTile: string;
  frameColor: string;
};

/**
 * Seeded LCG. Deliberately not Math.random: a verifier cannot prove anything
 * about a maze it is not able to reproduce.
 */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  if (s === 0) s = 0x9e3779b9;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const DIFFICULTY_SALT: Record<Difficulty, number> = {
  easy: 0x1f2e3d4c,
  normal: 0x2b7f4c19,
  hard: 0x3c9d5e77,
};

function shuffled<T>(items: T[], rand: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Odd indices 1, 3, ... n-2: the corridor lattice. */
function oddSeq(n: number): number[] {
  const out: number[] = [];
  for (let i = 1; i <= n - 2; i += 2) out.push(i);
  return out;
}

function keyOf(r: number, c: number): number {
  return r * COLS + c;
}

/** The four lattice steps, in a fixed order so generation stays deterministic. */
const LATTICE_STEPS = [
  { dr: -2, dc: 0 },
  { dr: 2, dc: 0 },
  { dr: 0, dc: -2 },
  { dr: 0, dc: 2 },
];

/**
 * The single source of truth for "can something move from here to there".
 * Player movement, the chaser AI and the connectivity proof all go through this,
 * so they cannot disagree about what the maze allows.
 */
export function nextCell(m: MazeLevel, r: number, c: number, dir: Direction): Cell | null {
  return stepRaw(m.wall, m.tunnelRow, r, c, dir);
}

function stepRaw(
  wall: boolean[][],
  tunnelRow: number,
  r: number,
  c: number,
  dir: Direction,
): Cell | null {
  const d = DELTA[dir];
  const nr = r + d.dr;
  let nc = c + d.dc;
  if (nr < 0 || nr >= ROWS) return null;
  if (nc < 0 || nc >= COLS) {
    // Only the tunnel row wraps; everywhere else the boundary is solid.
    if (nr !== tunnelRow) return null;
    nc = (nc + COLS) % COLS;
  }
  return wall[nr][nc] ? null : { r: nr, c: nc };
}

/** Breadth-first distances in cells from `start`, over open cells only. */
function floodDistances(wall: boolean[][], tunnelRow: number, start: Cell): Map<number, number> {
  const dist = new Map<number, number>();
  if (wall[start.r][start.c]) return dist;
  dist.set(keyOf(start.r, start.c), 0);
  const queue: Cell[] = [start];
  for (let head = 0; head < queue.length; head += 1) {
    const cur = queue[head];
    const d = dist.get(keyOf(cur.r, cur.c)) ?? 0;
    for (const dir of DIRECTIONS) {
      const nx = stepRaw(wall, tunnelRow, cur.r, cur.c, dir);
      if (!nx) continue;
      const k = keyOf(nx.r, nx.c);
      if (dist.has(k)) continue;
      dist.set(k, d + 1);
      queue.push(nx);
    }
  }
  return dist;
}

function openNeighbourCount(wall: boolean[][], tunnelRow: number, r: number, c: number): number {
  let n = 0;
  for (const dir of DIRECTIONS) if (stepRaw(wall, tunnelRow, r, c, dir)) n += 1;
  return n;
}

/**
 * Builds one level. Pure: the same (level, difficulty) always yields the same
 * maze, dots, pellets and spawns.
 *
 * Shape: a randomised spanning tree over the left half's corridor lattice,
 * braided to kill dead ends, then mirrored about the centre column. The mirror is
 * why layouts read as deliberate rather than as noise, and it makes the side
 * tunnel symmetric for free. Connectivity does not depend on any of that being
 * right, though - see step 6.
 */
export function buildMaze(level: number, difficulty: Difficulty): MazeLevel {
  const rand = makeRng((DIFFICULTY_SALT[difficulty] ^ Math.imul(level, 0x9e3779b1)) >>> 0);
  const ramp = RAMP_SCALE[difficulty];

  const wall: boolean[][] = Array.from({ length: ROWS }, () => Array<boolean>(COLS).fill(true));
  const open = (r: number, c: number) => {
    wall[r][c] = false;
  };

  const latRows = oddSeq(ROWS);
  const latCols = oddSeq(COLS).filter((c) => c <= AXIS);
  const inLattice = (r: number, c: number) => latRows.includes(r) && latCols.includes(c);

  // --- 1. spanning tree over the left half, including the mirror axis column ---
  const seen = new Set<number>();
  const start: Cell = { r: latRows[latRows.length - 1], c: latCols[0] };
  const stack: Cell[] = [start];
  seen.add(keyOf(start.r, start.c));
  open(start.r, start.c);

  while (stack.length > 0) {
    const cur = stack[stack.length - 1];
    const options = shuffled(LATTICE_STEPS, rand)
      .map((d) => ({ r: cur.r + d.dr, c: cur.c + d.dc }))
      .filter((n) => inLattice(n.r, n.c) && !seen.has(keyOf(n.r, n.c)));

    if (options.length === 0) {
      stack.pop();
      continue;
    }
    const next = options[0];
    open((cur.r + next.r) / 2, (cur.c + next.c) / 2);
    open(next.r, next.c);
    seen.add(keyOf(next.r, next.c));
    stack.push(next);
  }

  // --- 2. braid: give dead ends a second way out, so a chase has escape routes ---
  const braidP = Math.max(0.35, BRAID_BASE[difficulty] - (level - 1) * 0.03 * ramp);
  const latticeLinks = (r: number, c: number) => {
    let n = 0;
    for (const d of LATTICE_STEPS) {
      const nr = r + d.dr;
      const nc = c + d.dc;
      if (!inLattice(nr, nc)) continue;
      if (!wall[(r + nr) / 2][(c + nc) / 2]) n += 1;
    }
    return n;
  };

  for (const r of latRows) {
    for (const c of latCols) {
      if (latticeLinks(r, c) > 1) continue;
      if (rand() > braidP) continue;
      const closed = LATTICE_STEPS.filter((d) => {
        const nr = r + d.dr;
        const nc = c + d.dc;
        return inLattice(nr, nc) && wall[(r + nr) / 2][(c + nc) / 2];
      });
      if (closed.length === 0) continue;
      const pick = closed[Math.floor(rand() * closed.length)];
      open(r + pick.dr / 2, c + pick.dc / 2);
    }
  }

  // --- 3. a few extra loops, for room to run ---
  const loopP = Math.max(0.04, LOOP_BASE[difficulty] - (level - 1) * 0.005 * ramp);
  for (const r of latRows) {
    for (const c of latCols) {
      // Only the down and right walls, so each wall is considered exactly once.
      for (const d of [
        { dr: 2, dc: 0 },
        { dr: 0, dc: 2 },
      ]) {
        const nr = r + d.dr;
        const nc = c + d.dc;
        if (!inLattice(nr, nc)) continue;
        const mr = (r + nr) / 2;
        const mc = (c + nc) / 2;
        if (!wall[mr][mc]) continue;
        if (rand() < loopP) open(mr, mc);
      }
    }
  }

  // --- 4. mirror about the axis column, which maps to itself ---
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < AXIS; c += 1) wall[r][COLS - 1 - c] = wall[r][c];
  }

  // --- 5. side tunnel: one row open at both edges, kept away from the corners ---
  const tunnelCandidates = latRows.slice(2, latRows.length - 2);
  const tunnelRow = tunnelCandidates[Math.floor(rand() * tunnelCandidates.length)];
  open(tunnelRow, 0);
  open(tunnelRow, COLS - 1);

  // --- 6. prune anything the flood fill cannot reach ---
  // Construction should make this a no-op. It runs anyway because it is what
  // turns "every dot is reachable" from an argument into a fact: dots are placed
  // after it, and only on cells it reached.
  const reach = floodDistances(wall, tunnelRow, start);
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      if (!wall[r][c] && !reach.has(keyOf(r, c))) wall[r][c] = true;
    }
  }

  const openCells: Cell[] = [];
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) if (!wall[r][c]) openCells.push({ r, c });
  }

  /** Orders cells by how close they are to a point of interest. */
  const byAnchor = (anchor: Cell) => (a: Cell, b: Cell) => {
    const da = Math.abs(a.r - anchor.r) + Math.abs(a.c - anchor.c);
    const db = Math.abs(b.r - anchor.r) + Math.abs(b.c - anchor.c);
    return da - db || a.r - b.r || a.c - b.c;
  };

  // --- 7. player spawn: bottom-centre-ish, and never a dead end ---
  // Two exits minimum, so the first chaser to arrive can always be run away from.
  const playerSpawn =
    openCells
      .slice()
      .sort(byAnchor({ r: ROWS - 2, c: AXIS }))
      .find((cell) => openNeighbourCount(wall, tunnelRow, cell.r, cell.c) >= 2) ?? start;

  // --- 8. chaser spawns: clustered up top, never near the player ---
  const dist = floodDistances(wall, tunnelRow, playerSpawn);
  const chaserCount = Math.min(
    CHASER_MAX[difficulty],
    CHASER_BASE[difficulty] + Math.floor((level - 1) / CHASER_EVERY[difficulty]),
  );
  const safeCells = openCells.filter(
    (cell) => (dist.get(keyOf(cell.r, cell.c)) ?? -1) >= SAFE_RADIUS,
  );
  const pool =
    safeCells.length >= chaserCount
      ? safeCells.slice().sort(byAnchor({ r: 1, c: AXIS }))
      : // Cannot happen in a 19x19 braided maze, but if it ever did, the cells
        // farthest from the player are the least bad answer.
        openCells
          .slice()
          .sort(
            (a, b) =>
              (dist.get(keyOf(b.r, b.c)) ?? 0) - (dist.get(keyOf(a.r, a.c)) ?? 0) ||
              a.r - b.r ||
              a.c - b.c,
          );
  const chasers: ChaserSpec[] = pool.slice(0, chaserCount).map((spawn, i) => ({
    ...ROSTER[i % ROSTER.length],
    corner: CORNERS[i % CORNERS.length],
    spawn,
  }));

  // --- 9. power pellets, one per corner of the board ---
  const taken = new Set<number>([
    keyOf(playerSpawn.r, playerSpawn.c),
    ...chasers.map((c) => keyOf(c.spawn.r, c.spawn.c)),
  ]);
  const pellets: Cell[] = [];
  for (const anchor of [
    { r: 1, c: 1 },
    { r: 1, c: COLS - 2 },
    { r: ROWS - 2, c: 1 },
    { r: ROWS - 2, c: COLS - 2 },
  ]) {
    const cell = openCells
      .slice()
      .sort(byAnchor(anchor))
      .find((o) => !taken.has(keyOf(o.r, o.c)));
    if (!cell) continue;
    taken.add(keyOf(cell.r, cell.c));
    pellets.push(cell);
  }

  // --- 10. a dot on every remaining open cell ---
  const dot: boolean[][] = Array.from({ length: ROWS }, () => Array<boolean>(COLS).fill(false));
  let dotCount = 0;
  for (const cell of openCells) {
    if (taken.has(keyOf(cell.r, cell.c))) continue;
    dot[cell.r][cell.c] = true;
    dotCount += 1;
  }

  return {
    level,
    difficulty,
    cols: COLS,
    rows: ROWS,
    wall,
    dot,
    dotCount,
    pellets,
    playerSpawn,
    chasers,
    tunnelRow,
    playerSpeed: PLAYER_SPEED,
    chaserSpeed: Math.min(
      CHASER_SPEED_CAP,
      CHASER_SPEED_BASE * SPEED_SCALE[difficulty] * (1 + (level - 1) * 0.05 * ramp),
    ),
    frightSeconds: Math.max(
      FRIGHT_MIN[difficulty],
      FRIGHT_BASE[difficulty] - (level - 1) * 0.3 * ramp,
    ),
    scatterSeconds: Math.max(
      SCATTER_MIN[difficulty],
      SCATTER_BASE[difficulty] - (level - 1) * 0.25 * ramp,
    ),
    chaseSeconds: Math.min(30, CHASE_BASE[difficulty] + (level - 1) * 0.5 * ramp),
    wanderChance: WANDER_BASE[difficulty],
    wallTile: WALL_TILES[(level - 1) % WALL_TILES.length],
    frameColor: FRAME_COLORS[(level - 1) % FRAME_COLORS.length],
  };
}

// ------------------------------------------------------------------- movement

/**
 * A mover is an integer cell plus progress toward one neighbour. Grid alignment
 * is not something this maintains; it is the only thing it can represent.
 */
type Mover = { cr: number; cc: number; dir: Direction | null; prog: number };

type Chaser = Mover & {
  spec: ChaserSpec;
  /** 'eyes' is an eaten chaser hurrying back to its spawn to revive. */
  state: 'hunting' | 'eyes';
};

function centerOf(mv: Mover): { x: number; y: number } {
  if (!mv.dir || mv.prog === 0) return { x: mv.cc, y: mv.cr };
  const d = DELTA[mv.dir];
  return { x: mv.cc + d.dc * mv.prog, y: mv.cr + d.dr * mv.prog };
}

/** Column difference, taking the wrap tunnel into account. */
function wrapDx(ax: number, bx: number): number {
  let dx = ax - bx;
  if (dx > COLS / 2) dx -= COLS;
  else if (dx < -COLS / 2) dx += COLS;
  return dx;
}

function distSq(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = wrapDx(a.x, b.x);
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/**
 * Advances a mover. `decide` is consulted only at cell centres, which is what
 * makes turns feel like grid turns; a decision with nowhere to go stops the mover
 * dead on the centre rather than part-way into a wall.
 */
function advance(
  m: MazeLevel,
  mv: Mover,
  dt: number,
  speed: number,
  decide: () => Direction | null,
  onEnter?: (cell: Cell) => void,
): void {
  let budget = speed * dt;
  // The hop cap is a safety valve against a pathological dt, not a game rule.
  for (let hops = 0; budget > 1e-9 && hops < 64; hops += 1) {
    if (mv.prog <= 0) {
      const chosen = decide();
      if (!chosen) {
        mv.dir = null;
        mv.prog = 0;
        return;
      }
      mv.dir = chosen;
    }
    if (!mv.dir) return;
    const target = nextCell(m, mv.cr, mv.cc, mv.dir);
    if (!target) {
      mv.dir = null;
      mv.prog = 0;
      return;
    }
    const step = Math.min(budget, 1 - mv.prog);
    mv.prog += step;
    budget -= step;
    if (mv.prog >= 1 - 1e-9) {
      mv.cr = target.r;
      mv.cc = target.c;
      mv.prog = 0;
      if (onEnter) onEnter(target);
    }
  }
}

// ---------------------------------------------------------------- game state

type Mode = 'scatter' | 'chase';

type State = {
  m: MazeLevel;
  level: number;
  dot: boolean[][];
  dotsLeft: number;
  pellet: boolean[][];
  player: Mover;
  want: Direction | null;
  wantAge: number;
  chasers: Chaser[];
  mode: Mode;
  modeTimer: number;
  /** Seconds of power pellet left. */
  fright: number;
  /** Chasers eaten since this pellet, for the doubling bonus. */
  frightChain: number;
  /** Chasers frozen at level start and after a death. */
  ready: number;
  /** Contact ignored, immediately after a reset. */
  grace: number;
  animTime: number;
  rand: () => number;
};

function freshState(level: number, difficulty: Difficulty): State {
  const m = buildMaze(level, difficulty);
  const pellet = Array.from({ length: ROWS }, () => Array<boolean>(COLS).fill(false));
  for (const p of m.pellets) pellet[p.r][p.c] = true;
  return {
    m,
    level,
    dot: m.dot.map((row) => row.slice()),
    dotsLeft: m.dotCount,
    pellet,
    player: { cr: m.playerSpawn.r, cc: m.playerSpawn.c, dir: null, prog: 0 },
    want: null,
    wantAge: 0,
    chasers: m.chasers.map((spec) => ({
      spec,
      cr: spec.spawn.r,
      cc: spec.spawn.c,
      dir: null,
      prog: 0,
      state: 'hunting',
    })),
    mode: 'scatter',
    modeTimer: m.scatterSeconds,
    fright: 0,
    frightChain: 0,
    ready: READY_SECONDS,
    grace: GRACE_SECONDS,
    animTime: 0,
    // Gameplay randomness is seeded too, so a level plays the same way twice.
    rand: makeRng(0x51ed ^ Math.imul(level, 2246822519)),
  };
}

/**
 * Death reset. Deliberately leaves `dot` and `dotsLeft` alone: losing a life
 * costs position, never the dots already eaten.
 */
function resetPositions(s: State): void {
  s.player = { cr: s.m.playerSpawn.r, cc: s.m.playerSpawn.c, dir: null, prog: 0 };
  s.want = null;
  s.wantAge = 0;
  for (const ch of s.chasers) {
    ch.cr = ch.spec.spawn.r;
    ch.cc = ch.spec.spawn.c;
    ch.dir = null;
    ch.prog = 0;
    ch.state = 'hunting';
  }
  s.mode = 'scatter';
  s.modeTimer = s.m.scatterSeconds;
  s.fright = 0;
  s.frightChain = 0;
  s.ready = READY_SECONDS;
  s.grace = GRACE_SECONDS;
}

// ------------------------------------------------------------------ chaser AI

function clampCell(r: number, c: number): Cell {
  return { r: Math.max(0, Math.min(ROWS - 1, r)), c: Math.max(0, Math.min(COLS - 1, c)) };
}

function targetFor(s: State, ch: Chaser): Cell {
  const p = s.player;
  if (ch.state === 'eyes') return ch.spec.spawn;
  if (s.mode === 'scatter') return ch.spec.corner;

  switch (ch.spec.kind) {
    case 'ambusher': {
      // Four cells along the player's heading: the cut-off. Standing still, it
      // degenerates to a direct chase, which is the right answer anyway.
      const d = p.dir ? DELTA[p.dir] : { dr: 0, dc: 0 };
      return clampCell(p.cr + d.dr * 4, p.cc + d.dc * 4);
    }
    case 'shy': {
      // Loses its nerve up close and heads home, which is what leaves the player
      // a gap to slip through.
      const near = distSq(centerOf(ch), centerOf(p)) < SAFE_RADIUS * SAFE_RADIUS;
      return near ? ch.spec.corner : { r: p.cr, c: p.cc };
    }
    default:
      return { r: p.cr, c: p.cc };
  }
}

function chooseChaserDir(s: State, ch: Chaser): Direction | null {
  const m = s.m;
  const legal = DIRECTIONS.filter((d) => nextCell(m, ch.cr, ch.cc, d) !== null);
  if (legal.length === 0) return null;

  // No mid-corridor reversals - a chaser doubling back on the spot reads as
  // cheating. A true dead end is the one exception.
  const cur = ch.dir;
  const forward = cur ? legal.filter((d) => d !== OPPOSITE[cur]) : legal;
  const pool = forward.length > 0 ? forward : legal;

  const at = (d: Direction) => {
    const nx = nextCell(m, ch.cr, ch.cc, d) as Cell;
    return { x: nx.c, y: nx.r };
  };

  if (s.fright > 0 && ch.state === 'hunting') {
    // Frightened: run away rather than toward.
    const playerPos = centerOf(s.player);
    let best = pool[0];
    let bestScore = -Infinity;
    for (const d of pool) {
      const score = distSq(at(d), playerPos);
      if (score > bestScore) {
        bestScore = score;
        best = d;
      }
    }
    return best;
  }

  if (ch.spec.kind === 'wanderer' && ch.state === 'hunting' && s.rand() < m.wanderChance) {
    return pool[Math.floor(s.rand() * pool.length)];
  }

  const target = targetFor(s, ch);
  let best = pool[0];
  let bestScore = Infinity;
  for (const d of pool) {
    const score = distSq(at(d), { x: target.c, y: target.r });
    if (score < bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

// ------------------------------------------------------------------ component

export default function Maze({
  paused,
  input,
  api,
  restartToken,
  difficulty,
  controlsInset,
}: GameCanvasProps) {
  const stateRef = useRef<State>(freshState(1, difficulty));
  const sprites = useSprites();
  const spritesRef = useRef<SpriteSet | null>(null);
  useEffect(() => {
    spritesRef.current = sprites;
  }, [sprites]);

  // Changing the skill setting mid-run rebuilds the maze from level 1 too.
  useEffect(() => {
    stateRef.current = freshState(1, difficulty);
  }, [restartToken, difficulty]);

  const { canvasRef } = useCanvasGame({
    active: !paused,
    step: (ctx, dt, cw, ch) => {
      const s = stateRef.current;
      const m = s.m;
      s.animTime += dt;
      if (s.ready > 0) s.ready -= dt;
      if (s.grace > 0) s.grace -= dt;

      // --- queued direction ---
      const tap = input.consumeTap();
      if (tap) {
        s.want = tap;
        s.wantAge = 0;
      } else if (s.want) {
        s.wantAge += dt;
        // A turn no junction ever allowed should not fire half a corridor later.
        if (s.wantAge > WANT_MEMORY) s.want = null;
      }

      // A reversal is legal anywhere, not just at a junction. Swapping cell for
      // cell keeps the on-screen position identical instead of snapping backward.
      if (s.want && s.player.dir && s.want === OPPOSITE[s.player.dir] && s.player.prog > 0) {
        const ahead = nextCell(m, s.player.cr, s.player.cc, s.player.dir);
        if (ahead) {
          s.player.cr = ahead.r;
          s.player.cc = ahead.c;
          s.player.prog = 1 - s.player.prog;
          s.player.dir = s.want;
          s.want = null;
        }
      }

      // --- player ---
      advance(
        m,
        s.player,
        dt,
        m.playerSpeed,
        () => {
          // The queued turn wins wherever it is legal. That is what makes a tap
          // arriving mid-corridor take effect at the next junction that allows
          // it, instead of being thrown away.
          const p = s.player;
          if (s.want && nextCell(m, p.cr, p.cc, s.want)) {
            const d = s.want;
            s.want = null;
            return d;
          }
          if (p.dir && nextCell(m, p.cr, p.cc, p.dir)) return p.dir;
          return null;
        },
        (cell) => eat(s, cell, api),
      );

      // --- scatter / chase rhythm ---
      if (s.fright > 0) {
        s.fright -= dt;
        if (s.fright <= 0) {
          s.fright = 0;
          s.frightChain = 0;
        }
      } else {
        s.modeTimer -= dt;
        if (s.modeTimer <= 0) {
          s.mode = s.mode === 'scatter' ? 'chase' : 'scatter';
          s.modeTimer = s.mode === 'scatter' ? m.scatterSeconds : m.chaseSeconds;
        }
      }

      // --- chasers ---
      if (s.ready <= 0) {
        for (const c of s.chasers) {
          const speed =
            c.state === 'eyes' ? m.chaserSpeed * 1.8 : m.chaserSpeed * (s.fright > 0 ? 0.55 : 1);
          advance(
            m,
            c,
            dt,
            speed,
            () => chooseChaserDir(s, c),
            () => {
              if (c.state === 'eyes' && c.cr === c.spec.spawn.r && c.cc === c.spec.spawn.c) {
                c.state = 'hunting';
              }
            },
          );
        }
      }

      // --- contact ---
      const playerPos = centerOf(s.player);
      for (const c of s.chasers) {
        if (c.state !== 'hunting') continue;
        if (distSq(playerPos, centerOf(c)) > TOUCH_DIST * TOUCH_DIST) continue;
        if (s.fright > 0) {
          s.frightChain += 1;
          api.addScore(SCORE_CHASER * 2 ** (Math.min(s.frightChain, 4) - 1));
          c.state = 'eyes';
          api.setStatus('Gotcha!');
        } else if (s.grace <= 0) {
          api.died('A ghost got you');
          // Reset now rather than on resume: the shell may run one more frame
          // before the pause lands, and the eaten dots must survive untouched.
          resetPositions(s);
          break;
        }
      }

      // --- level cleared ---
      if (s.dotsLeft <= 0) {
        const cleared = s.level;
        api.addScore(SCORE_CLEAR);
        stateRef.current = freshState(cleared + 1, difficulty);
        api.requestGate(`Maze ${cleared} cleared`);
      }

      draw(ctx, stateRef.current, spritesRef.current, cw, ch, controlsInset);
    },
  });

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />;
}

function eat(s: State, cell: Cell, api: GameApi): void {
  if (s.dot[cell.r][cell.c]) {
    s.dot[cell.r][cell.c] = false;
    s.dotsLeft -= 1;
    api.addScore(SCORE_DOT);
    return;
  }
  if (s.pellet[cell.r][cell.c]) {
    s.pellet[cell.r][cell.c] = false;
    s.fright = s.m.frightSeconds;
    s.frightChain = 0;
    api.addScore(SCORE_PELLET);
    api.setStatus('Power up - chase them!');
  }
}

// -------------------------------------------------------------------- drawing

function draw(
  ctx: CanvasRenderingContext2D,
  s: State,
  sp: SpriteSet | null,
  cw: number,
  ch: number,
  controlsInset: number,
): void {
  // The board is square-ish, so it is scaled to fit and centred. The surrounding
  // area is painted in a matching colour rather than left black, so a tall screen
  // still looks deliberate.
  ctx.fillStyle = s.m.frameColor;
  ctx.fillRect(0, 0, cw, ch);

  // Keep the board clear of any thumb band the shell has reserved.
  const usableH = Math.max(1, ch - controlsInset);
  ctx.save();
  fitBoard(ctx, cw, usableH, BOARD_W, BOARD_H);
  drawBoard(ctx, s, sp);
  ctx.restore();
}

function drawBoard(ctx: CanvasRenderingContext2D, s: State, sp: SpriteSet | null): void {
  const m = s.m;

  ctx.fillStyle = '#07060f';
  ctx.fillRect(0, 0, BOARD_W, ROWS * CELL);

  // --- walls ---
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      if (!m.wall[r][c]) continue;
      const x = c * CELL;
      const y = r * CELL;
      if (sp) {
        drawFrame(ctx, sp.tiles, m.wallTile, x, y, CELL, CELL);
      } else {
        ctx.fillStyle = '#2c2a48';
        ctx.fillRect(x, y, CELL, CELL);
      }
    }
  }

  // --- tunnel mouths, so the wrap is discoverable ---
  ctx.fillStyle = 'rgba(199,125,255,0.8)';
  ctx.font = 'bold 13px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('<', CELL * 0.5, m.tunnelRow * CELL + CELL * 0.75);
  ctx.fillText('>', BOARD_W - CELL * 0.5, m.tunnelRow * CELL + CELL * 0.75);
  ctx.textAlign = 'left';

  // --- dots ---
  const dotSize = 8;
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      if (!s.dot[r][c]) continue;
      const x = c * CELL + (CELL - dotSize) / 2;
      const y = r * CELL + (CELL - dotSize) / 2;
      if (sp) {
        drawFrame(ctx, sp.tiles, 'coin_bronze', x, y, dotSize, dotSize);
      } else {
        ctx.fillStyle = '#f0d9a0';
        ctx.beginPath();
        ctx.arc(x + dotSize / 2, y + dotSize / 2, dotSize / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // --- power pellets, pulsing so they read as the special ones ---
  const pelletSize = 15 * (1 + Math.sin(s.animTime * 6) * 0.12);
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      if (!s.pellet[r][c]) continue;
      const x = c * CELL + (CELL - pelletSize) / 2;
      const y = r * CELL + (CELL - pelletSize) / 2;
      if (sp) {
        drawFrame(ctx, sp.tiles, 'coin_gold', x, y, pelletSize, pelletSize);
      } else {
        ctx.fillStyle = '#ffd75e';
        ctx.beginPath();
        ctx.arc(x + pelletSize / 2, y + pelletSize / 2, pelletSize / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // --- chasers, then the player on top ---
  for (const c of s.chasers) {
    const p = centerOf(c);
    drawWrapped(ctx, p.x, (x) => drawChaser(ctx, s, c, x, p.y, sp));
  }
  const pp = centerOf(s.player);
  drawWrapped(ctx, pp.x, (x) => drawPlayer(ctx, s, x, pp.y, sp));

  if (s.ready > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 16px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('READY', BOARD_W / 2, ROWS * CELL * 0.5 - 2);
    ctx.textAlign = 'left';
  }

  if (!sp) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = 'bold 11px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('loading art...', BOARD_W / 2, ROWS * CELL - 10);
    ctx.textAlign = 'left';
  }

  // --- HUD ---
  const hudY = ROWS * CELL;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, hudY, BOARD_W, HUD_H);
  ctx.font = 'bold 10px ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(`DOTS ${s.dotsLeft}`, 6, hudY + 11);

  ctx.textAlign = 'center';
  ctx.fillStyle =
    s.fright > 0
      ? '#8ad7ff'
      : s.mode === 'scatter'
        ? 'rgba(140,255,190,0.9)'
        : 'rgba(255,150,150,0.9)';
  ctx.fillText(
    s.fright > 0 ? `POWER ${Math.ceil(s.fright)}` : s.mode === 'scatter' ? 'SCATTER' : 'CHASE',
    BOARD_W / 2,
    hudY + 11,
  );

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.textAlign = 'right';
  ctx.fillText(`MAZE ${s.level}`, BOARD_W - 6, hudY + 11);
  ctx.textAlign = 'left';
}

/**
 * Draws something at its own x and, while it straddles the tunnel, again at the
 * far edge, so a wrap looks like one continuous move rather than a teleport.
 */
function drawWrapped(ctx: CanvasRenderingContext2D, x: number, paint: (x: number) => void): void {
  paint(x);
  if (x < 0) paint(x + COLS);
  else if (x > COLS - 1) paint(x - COLS);
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  s: State,
  x: number,
  y: number,
  sp: SpriteSet | null,
): void {
  if (!sp) {
    ctx.fillStyle = '#8ce99a';
    ctx.beginPath();
    ctx.arc(x * CELL + CELL / 2, y * CELL + CELL / 2, CELL * 0.42, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  const size = CELL + 4;
  const name = s.player.dir
    ? animFrame(['character_green_walk_a', 'character_green_walk_b'], s.animTime, 10)
    : 'character_green_front';
  drawFrame(
    ctx,
    sp.characters,
    name,
    x * CELL + (CELL - size) / 2,
    y * CELL + (CELL - size) / 2,
    size,
    size,
    s.player.dir === 'left',
  );
}

function drawChaser(
  ctx: CanvasRenderingContext2D,
  s: State,
  c: Chaser,
  x: number,
  y: number,
  sp: SpriteSet | null,
): void {
  const cx = x * CELL + CELL / 2;
  const cy = y * CELL + CELL / 2;

  if (c.state === 'eyes') {
    drawEyes(ctx, cx, cy, c.dir);
    return;
  }

  if (s.fright > 0) {
    // Frightened chasers are drawn, not sprited: a recoloured blob reads as
    // "edible now" far faster than the same bug in a different tint would, and
    // the flash near the end is the warning that it is wearing off.
    const ending = s.fright < 2 && Math.floor(s.fright * 6) % 2 === 0;
    ctx.fillStyle = ending ? '#ffffff' : '#3b6fe0';
    ctx.beginPath();
    ctx.arc(cx, cy, CELL * 0.42, 0, Math.PI * 2);
    ctx.fill();
    drawEyes(ctx, cx, cy, c.dir);
    return;
  }

  // A tinted pool underneath keeps four similar-sized bugs apart at a glance.
  ctx.fillStyle = c.spec.tint;
  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  ctx.ellipse(cx, cy + CELL * 0.3, CELL * 0.4, CELL * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  if (!sp) {
    ctx.fillStyle = c.spec.tint;
    ctx.beginPath();
    ctx.arc(cx, cy, CELL * 0.4, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  const size = CELL + 2;
  drawFrame(
    ctx,
    sp.enemies,
    animFrame(c.spec.sprites, s.animTime, 8),
    cx - size / 2,
    cy - size / 2,
    size,
    size,
    c.dir === 'left',
  );
}

function drawEyes(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  dir: Direction | null,
): void {
  const look = dir ? DELTA[dir] : { dr: 0, dc: 0 };
  for (const side of [-1, 1]) {
    const ex = cx + side * CELL * 0.16;
    const ey = cy - CELL * 0.05;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex, ey, CELL * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1b2a6b';
    ctx.beginPath();
    ctx.arc(ex + look.dc * CELL * 0.06, ey + look.dr * CELL * 0.06, CELL * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }
}
