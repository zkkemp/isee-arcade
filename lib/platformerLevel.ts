/**
 * World geometry, player physics and procedural level generation for Coin Runner.
 *
 * Physics lives beside generation rather than in the component because
 * reachability is a property of the level AND the jump arc together. The
 * generator sizes every step and gap from the constants below, and
 * `scripts/check-platformer.ts` proves the result by running `stepBody` — the
 * same integrator the game runs — over a search of reachable states. One
 * implementation, three consumers, no chance of them disagreeing.
 */
import { RAMP_SCALE, SPEED_SCALE, type Difficulty } from './difficulty';

export const TILE = 16;
export const ROWS = 15;
export const COLS = 80;
export const LEVEL_W = COLS * TILE;
export const WORLD_H = ROWS * TILE;

/** Topmost solid ground row. Rows below this are also solid. */
export const GROUND_TOP = 13;

// --- Player physics -------------------------------------------------------
// Tuned for a Mario-ish arc: a high, floaty jump you can shorten by releasing.

export const GRAVITY = 900;
export const RUN_SPEED = 125;
export const JUMP_VELOCITY = 340;
/** Releasing the button clips rising speed to this, giving variable jump height. */
export const JUMP_CUT = 120;
export const MAX_FALL = 520;
/** How quickly horizontal speed converges on the target. */
export const ACCEL = 14;
/** Grace period after walking off a ledge where a jump still counts. */
export const COYOTE_TIME = 0.09;
/** A jump pressed slightly before landing still fires on touchdown. */
export const JUMP_BUFFER = 0.12;

export const PW = 11;
export const PH = 14;

/** Peak rise of a full jump, in pixels. */
export const JUMP_RISE = (JUMP_VELOCITY * JUMP_VELOCITY) / (2 * GRAVITY);
/** Time from takeoff back to the same height, in seconds. */
export const AIR_TIME = (2 * JUMP_VELOCITY) / GRAVITY;
/**
 * Tallest step the generator may build between two standing surfaces. One tile
 * is held back from the raw rise for head clearance and for the fact that you
 * also need time to move sideways onto the ledge.
 */
export const MAX_STEP_UP = Math.max(1, Math.floor(JUMP_RISE / TILE) - 1);
/** Gross horizontal distance covered by a full-speed full jump, in tiles. */
export const JUMP_REACH_TILES = (RUN_SPEED * AIR_TIME) / TILE;
/**
 * Widest pit the generator may carve. Two tiles are held back from the gross
 * reach because a jump taken from a standstill (no run-up room) covers much
 * less, and the player still has to land somewhere, not just arrive.
 */
export const MAX_PIT_WIDTH = Math.max(1, Math.floor(JUMP_REACH_TILES) - 2);
/** Minimum solid ground between consecutive pits, so two never merge. */
export const MIN_PIT_GAP = 5;

// --- Level data -----------------------------------------------------------

/**
 * Tile codes. Anything other than '.' is solid; the distinction only drives
 * which sprite the renderer picks and whether a hit from below pops a coin.
 *   '.' air   '#' terrain (autotiled)   'B' brick   'Q' coin block
 */
export type TileCode = '.' | '#' | 'B' | 'Q';

export type Biome = 'grass' | 'sand' | 'snow' | 'stone' | 'dirt' | 'purple';
export type Backdrop = 'hills' | 'desert' | 'trees' | 'mushrooms';

export type DecorKind =
  | 'bush'
  | 'cactus'
  | 'mushroom_red'
  | 'mushroom_brown'
  | 'rock'
  | 'fence'
  | 'fence_broken'
  | 'hill'
  | 'sign';

export type EnemyKind = 'slime' | 'walker' | 'flyer';

export type Coin = { x: number; y: number; taken: boolean };

export type Enemy = {
  x: number;
  y: number;
  vx: number;
  alive: boolean;
  squash: number;
  kind: EnemyKind;
  /** Flyers bob around this height instead of resting on a surface. */
  baseY: number;
  /** Desynchronises the bob between flyers. */
  phase: number;
  /** Patrol limits in world pixels; flyers turn at these, walkers use terrain. */
  minX: number;
  maxX: number;
};

/** A block that can be punched from below. Coin blocks yield one coin. */
export type Block = {
  tx: number;
  ty: number;
  kind: 'coin' | 'brick';
  used: boolean;
  /** Countdown of the little upward nudge after a hit. */
  bump: number;
};

export type Decor = { tx: number; ty: number; kind: DecorKind };

export type Level = {
  tiles: TileCode[][];
  coins: Coin[];
  enemies: Enemy[];
  blocks: Block[];
  decor: Decor[];
  spawn: { x: number; y: number };
  flagX: number;
  biome: Biome;
  backdrop: Backdrop;
  /** Names of the structures placed, in order. Diagnostics for the checker. */
  structures: string[];
};

export const BIOMES: Biome[] = ['grass', 'sand', 'snow', 'stone', 'dirt', 'purple'];

const BACKDROP_FOR: Record<Biome, Backdrop> = {
  grass: 'hills',
  sand: 'desert',
  snow: 'hills',
  stone: 'trees',
  dirt: 'mushrooms',
  purple: 'mushrooms',
};

/** Decor that suits each biome, so a snow level is not full of cacti. */
const DECOR_FOR: Record<Biome, DecorKind[]> = {
  grass: ['bush', 'mushroom_red', 'rock', 'fence'],
  sand: ['cactus', 'rock', 'fence_broken', 'hill'],
  snow: ['rock', 'fence', 'bush', 'hill'],
  stone: ['rock', 'fence_broken', 'mushroom_brown', 'hill'],
  dirt: ['mushroom_brown', 'rock', 'bush', 'fence'],
  purple: ['mushroom_red', 'mushroom_brown', 'rock', 'hill'],
};

// --- Collision and physics ------------------------------------------------

export function solidAt(tiles: TileCode[][], tx: number, ty: number): boolean {
  if (tx < 0 || tx >= COLS) return true; // level edges act as walls
  if (ty < 0) return false;
  if (ty >= ROWS) return false; // below the level is a pit, not a floor
  return tiles[ty][tx] !== '.';
}

export function overlapsSolid(
  tiles: TileCode[][],
  x: number,
  y: number,
  w: number,
  h: number,
): boolean {
  const x0 = Math.floor(x / TILE);
  const x1 = Math.floor((x + w - 1) / TILE);
  const y0 = Math.floor(y / TILE);
  const y1 = Math.floor((y + h - 1) / TILE);
  for (let ty = y0; ty <= y1; ty += 1) {
    for (let tx = x0; tx <= x1; tx += 1) {
      if (solidAt(tiles, tx, ty)) return true;
    }
  }
  return false;
}

export type Body = { x: number; y: number; vx: number; vy: number; onGround: boolean };

export type Controls = {
  left: boolean;
  right: boolean;
  /** Fire a jump this frame. The caller owns eligibility (coyote, buffering). */
  jump: boolean;
  /** Held state, for variable jump height. */
  jumpHeld: boolean;
};

export type StepResult = {
  /** Downward speed at the moment of touchdown, or 0 if no landing happened. */
  landedAt: number;
  /** Tile punched by the player's head this frame, if any. */
  headHit: { tx: number; ty: number } | null;
  /** True while the body left the ground this frame (for coyote time). */
  leftGround: boolean;
};

/**
 * Advances the player one frame. Shared by the game and the verifier, so the
 * proof of reachability is a proof about the code that actually runs.
 */
export function stepBody(tiles: TileCode[][], b: Body, c: Controls, dt: number): StepResult {
  const target = (c.right ? RUN_SPEED : 0) - (c.left ? RUN_SPEED : 0);
  b.vx += (target - b.vx) * Math.min(1, dt * ACCEL);

  if (c.jump) {
    b.vy = -JUMP_VELOCITY;
    b.onGround = false;
  }
  if (!c.jumpHeld && b.vy < -JUMP_CUT) b.vy = -JUMP_CUT;

  b.vy = Math.min(b.vy + GRAVITY * dt, MAX_FALL);

  const nextX = b.x + b.vx * dt;
  if (!overlapsSolid(tiles, nextX, b.y, PW, PH)) b.x = nextX;
  else b.vx = 0;
  b.x = Math.max(0, Math.min(b.x, LEVEL_W - PW));

  const wasOnGround = b.onGround;
  const fallSpeed = b.vy;
  const nextY = b.y + b.vy * dt;
  const res: StepResult = { landedAt: 0, headHit: null, leftGround: false };

  if (!overlapsSolid(tiles, b.x, nextY, PW, PH)) {
    b.y = nextY;
    b.onGround = false;
  } else if (b.vy > 0) {
    b.y = Math.floor((nextY + PH) / TILE) * TILE - PH;
    b.onGround = true;
    b.vy = 0;
    if (!wasOnGround) res.landedAt = fallSpeed;
  } else {
    b.y = Math.floor(nextY / TILE) * TILE + TILE;
    b.vy = 0;
    // Whichever tile the head is under: report the one nearest the body centre
    // so a corner clip does not credit a block two tiles away.
    const ty = Math.floor((b.y - 1) / TILE);
    const cx = Math.floor((b.x + PW / 2) / TILE);
    const candidates = [cx, Math.floor(b.x / TILE), Math.floor((b.x + PW - 1) / TILE)];
    for (const tx of candidates) {
      if (solidAt(tiles, tx, ty)) {
        res.headHit = { tx, ty };
        break;
      }
    }
  }

  if (wasOnGround && !b.onGround) res.leftGround = true;
  return res;
}

/** Pickup test, shared with the verifier so both agree on what "collected" means. */
export function coinTouched(b: Body, c: Coin): boolean {
  return Math.abs(c.x - (b.x + PW / 2)) < 11 && Math.abs(c.y - (b.y + PH / 2)) < 12;
}

/** Flag test. The flag pole is two tiles tall and stands on the ground pad. */
export function flagTouched(b: Body, flagX: number): boolean {
  return b.x + PW > flagX && b.x < flagX + TILE && b.y + PH > (GROUND_TOP - 2) * TILE;
}

// --- Generation -----------------------------------------------------------

/**
 * Small deterministic PRNG. Seeding by level and difficulty keeps a level stable
 * across replays while still varying between levels and settings.
 */
function lcg(seed: number) {
  let s = (seed * 1103515245 + 12345) & 0x7fffffff;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

type Knobs = {
  intensity: number;
  pitChance: number;
  maxPitW: number;
  enemyBudget: number;
  coinScale: number;
  /** 1 = only low platforms; 2 = a second storey above them. */
  maxTier: 1 | 2;
  speed: number;
  flyers: boolean;
  /**
   * First level (first two on easy): flat ground, a few coins, one block row.
   * The player quit the old version at the first screen, so the first screen has
   * to be winnable without learning anything.
   */
  warmup: boolean;
};

/**
 * Difficulty and level number collapse into these knobs. `intensity` is the
 * single ramp value; RAMP_SCALE stretches how many levels it takes to reach 1.
 */
function knobsFor(level: number, d: Difficulty): Knobs {
  const intensity = Math.min(1, ((level - 1) * RAMP_SCALE[d]) / 12);
  const easy = d === 'easy';
  const hard = d === 'hard';
  // Level 1 (and level 2 on easy) is a warm-up with no pits at all.
  const warmup = easy ? 2 : 1;
  const basePits = easy ? 0.2 : hard ? 0.46 : 0.34;
  const baseEnemies = easy ? 1.6 : hard ? 4 : 2.8;
  return {
    intensity,
    pitChance: level <= warmup ? 0 : basePits + intensity * 0.18,
    maxPitW: Math.min(MAX_PIT_WIDTH, (easy ? 1 : 2) + Math.round(intensity * 2)),
    enemyBudget:
      level === 1
        ? easy
          ? 1
          : hard
            ? 3
            : 2
        : Math.round(baseEnemies + intensity * (easy ? 3 : hard ? 7 : 5)),
    coinScale: easy ? 1.3 : hard ? 0.85 : 1,
    maxTier: level >= 3 && intensity > 0.05 ? 2 : 1,
    speed: SPEED_SCALE[d] * (1 + intensity * 0.45),
    flyers: easy ? level >= 4 : level >= 2,
    warmup: level <= warmup,
  };
}

type Gen = {
  rand: () => number;
  tiles: TileCode[][];
  coins: Coin[];
  enemies: Enemy[];
  blocks: Block[];
  decor: Decor[];
  structures: string[];
  /** Columns already claimed by a structure, so decor never lands on them. */
  busy: Set<number>;
  k: Knobs;
  enemiesLeft: number;
};

const START_PAD = 5;
const END_PAD = 9;
/** Widest any single structure can grow. The placer needs this much room left. */
const MAX_STRUCTURE_W = 12;

/** Ground surface tile row: standing on it puts the feet at GROUND_TOP * TILE. */
const SURFACE = GROUND_TOP;

function pick<T>(g: Gen, list: T[]): T {
  return list[Math.floor(g.rand() * list.length) % list.length];
}

function irand(g: Gen, lo: number, hi: number): number {
  return lo + Math.floor(g.rand() * (hi - lo + 1));
}

function fillDown(g: Gen, tx: number, topRow: number) {
  if (tx < 0 || tx >= COLS) return;
  for (let y = topRow; y < ROWS; y += 1) g.tiles[y][tx] = '#';
}

function carveGround(g: Gen, tx: number) {
  if (tx < 0 || tx >= COLS) return;
  for (let y = 0; y < ROWS; y += 1) g.tiles[y][tx] = '.';
}

function putCoin(g: Gen, tx: number, ty: number) {
  if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) return;
  if (solidAt(g.tiles, tx, ty)) return; // never bury a coin
  g.coins.push({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2, taken: false });
}

function putBlock(g: Gen, tx: number, ty: number, kind: 'coin' | 'brick') {
  if (tx < 0 || tx >= COLS || ty < 1) return;
  g.tiles[ty][tx] = kind === 'coin' ? 'Q' : 'B';
  g.blocks.push({ tx, ty, kind, used: false, bump: 0 });
}

function putPlatform(g: Gen, tx: number, w: number, row: number) {
  for (let i = 0; i < w; i += 1) {
    if (tx + i >= 0 && tx + i < COLS) g.tiles[row][tx + i] = 'B';
  }
}

/**
 * Spends one unit of the enemy budget. `surfaceRow` is the tile row the enemy
 * stands on; flyers hover a couple of tiles above it.
 */
function addEnemy(g: Gen, tx: number, surfaceRow: number, kind: EnemyKind, span = 3) {
  if (g.enemiesLeft <= 0) return;
  const speed = (kind === 'slime' ? 24 : kind === 'walker' ? 40 : 34) * g.k.speed;
  const standY = surfaceRow * TILE - PH;
  const baseY = kind === 'flyer' ? (surfaceRow - 3) * TILE : standY;
  g.enemies.push({
    x: tx * TILE + (TILE - PW) / 2,
    y: baseY,
    vx: g.rand() < 0.5 ? -speed : speed,
    alive: true,
    squash: 0,
    kind,
    baseY,
    phase: g.rand() * Math.PI * 2,
    minX: (tx - span) * TILE,
    maxX: (tx + span) * TILE,
  });
  g.enemiesLeft -= 1;
}

/** Picks a ground enemy type, weighted so slimes stay the common case. */
function groundKind(g: Gen): EnemyKind {
  return g.rand() < 0.55 || g.k.intensity < 0.1 ? 'slime' : 'walker';
}

function claim(g: Gen, x: number, w: number) {
  for (let i = 0; i < w; i += 1) g.busy.add(x + i);
}

// Each structure writes into `g` starting at column x and returns the number of
// columns it consumed. Every one of them leaves the result reachable by
// construction: nothing rises more than MAX_STEP_UP above a surface the player
// can already stand on, and no gap is wider than MAX_PIT_WIDTH.

function sFlat(g: Gen, x: number): number {
  const w = irand(g, 3, 6);
  if (g.rand() < 0.7 * g.k.coinScale) {
    const n = irand(g, 1, 3);
    for (let i = 0; i < n; i += 1) putCoin(g, x + 1 + i, SURFACE - 1);
  }
  if (g.rand() < 0.45) {
    // Flat ground is the only safe place for a flyer: it patrols a fixed lane
    // and does not collide with terrain, so keep the lane free of platforms.
    const kind = g.k.flyers && g.rand() < 0.3 ? 'flyer' : groundKind(g);
    addEnemy(g, x + Math.floor(w / 2), SURFACE, kind, 2);
  }
  return w;
}

function sPit(g: Gen, x: number): number {
  // Skew wide: a one-tile gap you can walk over does not read as a pit.
  const w = irand(g, Math.max(1, g.k.maxPitW - 1), Math.max(1, g.k.maxPitW));
  // Two solid pad columns either side keep consecutive pits MIN_PIT_GAP apart.
  for (let i = 0; i < w; i += 1) carveGround(g, x + 2 + i);
  // Coin arc across the gap, the reward for taking the jump.
  for (let i = 0; i < w; i += 1) putCoin(g, x + 2 + i, SURFACE - 2);
  claim(g, x, w + 4);
  return w + 4;
}

function sStairs(g: Gen, x: number): number {
  const h = irand(g, 2, Math.min(MAX_STEP_UP, 2 + Math.round(g.k.intensity * 2)));
  // Up one tile at a time, a flat top, then back down: always walkable.
  let cx = x;
  for (let i = 1; i <= h; i += 1) fillDown(g, cx++, SURFACE - i);
  const topW = irand(g, 1, 3);
  for (let i = 0; i < topW; i += 1) {
    fillDown(g, cx, SURFACE - h);
    if (g.rand() < 0.6 * g.k.coinScale) putCoin(g, cx, SURFACE - h - 1);
    cx += 1;
  }
  if (g.rand() < 0.4) addEnemy(g, x + h, SURFACE - h, groundKind(g), 1);
  for (let i = h; i >= 1; i -= 1) fillDown(g, cx++, SURFACE - i);
  const w = cx - x;
  claim(g, x, w);
  return w;
}

function sPlateau(g: Gen, x: number): number {
  const h = irand(g, 2, MAX_STEP_UP);
  const top = SURFACE - h;
  const w = irand(g, 5, 9);
  // Stepped ramp up the left side so the plateau is walkable, not just jumpable.
  for (let i = 1; i < h; i += 1) fillDown(g, x + i - 1, SURFACE - i);
  for (let i = 0; i < w; i += 1) fillDown(g, x + h - 1 + i, top);
  const total = h - 1 + w;
  for (let i = 1; i < w - 1; i += 1) {
    if (g.rand() < 0.4 * g.k.coinScale) putCoin(g, x + h - 1 + i, top - 1);
  }
  if (g.rand() < 0.6) addEnemy(g, x + h + Math.floor(w / 2), top, groundKind(g), 2);
  claim(g, x, total);
  return total;
}

function sBrickRun(g: Gen, x: number): number {
  // Floating run exactly MAX_STEP_UP tiles above the ground surface, with the
  // ground left intact underneath so it can always be jumped onto.
  const row = SURFACE - MAX_STEP_UP;
  const w = irand(g, 3, 5);
  putPlatform(g, x + 1, w, row);
  for (let i = 0; i < w; i += 1) {
    if (g.rand() < 0.7 * g.k.coinScale) putCoin(g, x + 1 + i, row - 1);
  }
  if (g.k.intensity > 0.25 && g.rand() < 0.35) {
    addEnemy(g, x + 1 + Math.floor(w / 2), row, 'slime', Math.max(1, Math.floor(w / 2)));
  }
  claim(g, x, w + 2);
  return w + 2;
}

function sQuestionRow(g: Gen, x: number): number {
  const row = SURFACE - MAX_STEP_UP;
  const n = irand(g, 2, 4);
  for (let i = 0; i < n; i += 1) {
    // Mostly coin blocks; the odd brick gives the row some shape.
    putBlock(g, x + 1 + i, row, g.rand() < 0.7 ? 'coin' : 'brick');
  }
  if (g.rand() < 0.5 * g.k.coinScale) putCoin(g, x + 1 + irand(g, 0, n - 1), row - 2);
  claim(g, x, n + 2);
  return n + 2;
}

function sIslands(g: Gen, x: number): number {
  // A pit with stepping stones over it: two routes, low risk either way.
  const w = Math.max(2, Math.min(g.k.maxPitW, 3));
  for (let i = 0; i < w; i += 1) carveGround(g, x + 2 + i);
  const row = SURFACE - 2;
  putPlatform(g, x + 2, Math.max(1, w - 1), row);
  for (let i = 0; i < Math.max(1, w - 1); i += 1) putCoin(g, x + 2 + i, row - 1);
  claim(g, x, w + 4);
  return w + 4;
}

function sTower(g: Gen, x: number): number {
  // Two storeys, each MAX_STEP_UP above the last: ground -> lower -> upper.
  const lowRow = SURFACE - MAX_STEP_UP;
  const upRow = lowRow - MAX_STEP_UP;
  const lowW = irand(g, 3, 4);
  const upW = irand(g, 2, 3);
  putPlatform(g, x + 1, lowW, lowRow);
  // The upper deck overlaps the lower one, so the second hop is nearly vertical.
  putPlatform(g, x + 2, upW, upRow);
  for (let i = 0; i < upW; i += 1) putCoin(g, x + 2 + i, upRow - 1);
  if (g.rand() < 0.6 * g.k.coinScale) putCoin(g, x + 1, lowRow - 1);
  claim(g, x, lowW + 3);
  return lowW + 3;
}

function sFlyerLane(g: Gen, x: number): number {
  const w = irand(g, 5, 7);
  addEnemy(g, x + Math.floor(w / 2), SURFACE, 'flyer', Math.floor(w / 2));
  for (let i = 1; i < w - 1; i += 2) {
    if (g.rand() < 0.5 * g.k.coinScale) putCoin(g, x + i, SURFACE - 1);
  }
  return w;
}

type Structure = {
  name: string;
  run: (g: Gen, x: number) => number;
  weight: (k: Knobs) => number;
  /** Kept out of the warm-up levels, which are flat ground and coins only. */
  advanced?: boolean;
};

const STRUCTURES: Structure[] = [
  { name: 'flat', run: sFlat, weight: (k) => 1.8 - k.intensity * 0.8 },
  { name: 'pit', run: sPit, weight: (k) => k.pitChance * 3, advanced: true },
  { name: 'stairs', run: sStairs, weight: () => 1.1 },
  { name: 'plateau', run: sPlateau, weight: () => 1, advanced: true },
  { name: 'bricks', run: sBrickRun, weight: (k) => 0.9 + k.intensity * 0.6, advanced: true },
  { name: 'blocks', run: sQuestionRow, weight: () => 1.2 },
  { name: 'islands', run: sIslands, weight: (k) => k.pitChance * 1.6, advanced: true },
  {
    name: 'tower',
    run: sTower,
    weight: (k) => (k.maxTier > 1 ? 0.9 + k.intensity : 0),
    advanced: true,
  },
  { name: 'flyers', run: sFlyerLane, weight: (k) => (k.flyers ? 0.7 : 0), advanced: true },
];

const BLOCKS_STRUCTURE = STRUCTURES.find((s) => s.name === 'blocks') as Structure;

/**
 * Weighted pick, with two structure types boosted per level so consecutive
 * levels do not read as the same soup of parts.
 */
function pickStructure(g: Gen, boosted: string[], last: string): Structure {
  const weights = STRUCTURES.map((s) => {
    if (g.k.warmup && s.advanced) return 0;
    let w = s.weight(g.k);
    if (boosted.includes(s.name)) w *= 2.4;
    if (s.name === last) w *= 0.35; // discourage immediate repeats
    return w;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return STRUCTURES[0];
  let r = g.rand() * total;
  for (let i = 0; i < STRUCTURES.length; i += 1) {
    r -= weights[i];
    if (r <= 0) return STRUCTURES[i];
  }
  return STRUCTURES[0];
}

/**
 * True if a horizontal lane of open air runs above the ground either side of
 * `tx`. Flyers do not collide with terrain, so they only belong in one.
 */
function flatLane(g: Gen, tx: number, span: number): boolean {
  for (let i = tx - span; i <= tx + span; i += 1) {
    if (i < 0 || i >= COLS) return false;
    if (!solidAt(g.tiles, i, GROUND_TOP)) return false;
    for (let ty = Math.max(0, GROUND_TOP - 5); ty < GROUND_TOP; ty += 1) {
      if (solidAt(g.tiles, i, ty)) return false;
    }
  }
  return true;
}

/**
 * Structures only add enemies opportunistically, which left late levels nearly
 * empty however high the budget went. This spends whatever is left on exposed
 * surfaces, which is also what keeps the difficulty ramp visible.
 */
function topUpEnemies(g: Gen) {
  let guard = 0;
  while (g.enemiesLeft > 0 && guard < 400) {
    guard += 1;
    const tx = irand(g, START_PAD + 3, COLS - END_PAD - 2);
    let surface = -1;
    for (let ty = 1; ty < ROWS; ty += 1) {
      if (g.tiles[ty][tx] !== '.') {
        surface = ty;
        break;
      }
    }
    if (surface < 2) continue;
    if (overlapsSolid(g.tiles, tx * TILE + (TILE - PW) / 2, surface * TILE - PH, PW, PH)) continue;
    if (g.enemies.some((e) => Math.abs(e.x / TILE - tx) < 3)) continue;
    const flyer = g.k.flyers && g.rand() < 0.28 && flatLane(g, tx, 3);
    addEnemy(g, tx, surface, flyer ? 'flyer' : groundKind(g), 2);
  }
}

/**
 * Brings a thin level up to a coin target. Structures place coins by chance, so
 * without this a level can generate almost nothing to collect.
 */
function topUpCoins(g: Gen) {
  const target = Math.round((8 + g.k.intensity * 5) * g.k.coinScale);
  const occupied = new Set<string>();
  for (const c of g.coins) occupied.add(`${Math.floor(c.x / TILE)},${Math.floor(c.y / TILE)}`);
  let guard = 0;
  while (g.coins.length < target && guard < 400) {
    guard += 1;
    const tx = irand(g, 1, COLS - END_PAD + 2);
    let surface = -1;
    for (let ty = 1; ty < ROWS; ty += 1) {
      if (g.tiles[ty][tx] !== '.') {
        surface = ty;
        break;
      }
    }
    if (surface < 1) continue; // a pit column: a floating coin there may not be reachable
    const ty = surface - 1;
    if (solidAt(g.tiles, tx, ty)) continue;
    const key = `${tx},${ty}`;
    if (occupied.has(key)) continue;
    occupied.add(key);
    putCoin(g, tx, ty);
  }
}

/** Scatters biome decor on exposed ground, avoiding anything gameplay uses. */
function scatterDecor(g: Gen, biome: Biome) {
  const kinds = DECOR_FOR[biome];
  const taken = new Set<string>();
  for (const c of g.coins) taken.add(`${Math.floor(c.x / TILE)},${Math.floor(c.y / TILE)}`);
  for (const e of g.enemies) taken.add(`${Math.floor(e.x / TILE)},${Math.floor(e.y / TILE)}`);

  for (let tx = 1; tx < COLS - 1; tx += 1) {
    if (g.busy.has(tx)) continue;
    if (g.rand() > 0.28) continue;
    // Find the exposed surface in this column, if any.
    let surface = -1;
    for (let ty = 0; ty < ROWS; ty += 1) {
      if (g.tiles[ty][tx] === '#') {
        surface = ty;
        break;
      }
    }
    if (surface < 1) continue;
    const ty = surface - 1;
    if (solidAt(g.tiles, tx, ty)) continue;
    if (taken.has(`${tx},${ty}`)) continue;
    g.decor.push({ tx, ty, kind: pick(g, kinds) });
    taken.add(`${tx},${ty}`);
  }
}

export function buildLevel(level: number, difficulty: Difficulty = 'normal'): Level {
  const diffSeed = difficulty === 'easy' ? 1 : difficulty === 'normal' ? 2 : 3;
  const k = knobsFor(level, difficulty);
  const g: Gen = {
    rand: lcg(level * 7919 + diffSeed * 104729 + 13),
    tiles: Array.from({ length: ROWS }, () => Array<TileCode>(COLS).fill('.')),
    coins: [],
    enemies: [],
    blocks: [],
    decor: [],
    structures: [],
    busy: new Set<number>(),
    k,
    enemiesLeft: k.enemyBudget,
  };

  for (let x = 0; x < COLS; x += 1) fillDown(g, x, GROUND_TOP);

  // Two structure families get a boost this level, cycling with the level
  // number so level 5 does not feel like level 4.
  const boostA = STRUCTURES[(level * 3) % STRUCTURES.length].name;
  const boostB = STRUCTURES[(level * 5 + 2) % STRUCTURES.length].name;
  const boosted = [boostA, boostB];

  let x = START_PAD;
  let last = '';
  let guard = 0;
  // Stop while a whole structure still fits: a half-placed one could leave a
  // platform sticking into the flag pad, whose coins the pad then orphans.
  while (COLS - END_PAD - x >= MAX_STRUCTURE_W && guard < 200) {
    guard += 1;
    // Warm-up levels open with a coin-block row: it teaches the punch-from-below
    // mechanic on flat ground, with nothing else going on.
    const s = g.k.warmup && guard === 1 ? BLOCKS_STRUCTURE : pickStructure(g, boosted, last);
    const w = s.run(g, x);
    g.structures.push(s.name);
    last = s.name;
    x += w + irand(g, 1, 2);
  }

  // Flag pad: solid ground the last stretch of the level, restored after
  // placement so no structure can leave a hole under the flag.
  const flagCol = COLS - 5;
  for (let i = flagCol - 3; i < COLS; i += 1) {
    for (let y = GROUND_TOP; y < ROWS; y += 1) g.tiles[y][i] = '#';
    for (let y = 0; y < GROUND_TOP; y += 1) if (g.tiles[y][i] !== '.') g.tiles[y][i] = '.';
  }
  // Same for the opening columns, so the spawn always has flat ground.
  for (let i = 0; i < START_PAD; i += 1) {
    for (let y = GROUND_TOP; y < ROWS; y += 1) g.tiles[y][i] = '#';
  }
  claim(g, flagCol - 3, 8);
  g.decor.push({ tx: flagCol - 3, ty: GROUND_TOP - 1, kind: 'sign' });

  topUpEnemies(g);

  // Drop anything the pads may have overwritten, and anything a later structure
  // buried. Cheaper and safer than trying to order placement perfectly.
  g.coins = g.coins.filter((c) => !solidAt(g.tiles, Math.floor(c.x / TILE), Math.floor(c.y / TILE)));
  g.blocks = g.blocks.filter((b) => g.tiles[b.ty][b.tx] === (b.kind === 'coin' ? 'Q' : 'B'));
  g.enemies = g.enemies.filter((e) => {
    const tx = Math.floor((e.x + PW / 2) / TILE);
    const ty = Math.floor((e.y + PH / 2) / TILE);
    if (solidAt(g.tiles, tx, ty)) return false;
    // A flyer ignores terrain, so it needs a clear lane; a walker needs the tile
    // under its feet. Both need the column not to be a pit.
    if (e.kind === 'flyer') return flatLane(g, tx, 3);
    const feetRow = Math.floor((e.y + PH + 1) / TILE);
    return solidAt(g.tiles, tx, feetRow) && solidAt(g.tiles, tx, GROUND_TOP);
  });

  // A guaranteed coin near the spawn, so the very first thing on screen is a
  // reward rather than a hazard.
  putCoin(g, START_PAD - 2, GROUND_TOP - 1);
  topUpCoins(g);
  scatterDecor(g, BIOMES[(level - 1) % BIOMES.length]);

  const biome = BIOMES[(level - 1) % BIOMES.length];
  return {
    tiles: g.tiles,
    coins: g.coins,
    enemies: g.enemies,
    blocks: g.blocks,
    decor: g.decor,
    spawn: { x: 2 * TILE, y: (GROUND_TOP - 2) * TILE },
    flagX: flagCol * TILE,
    biome,
    backdrop: BACKDROP_FOR[biome],
    structures: g.structures,
  };
}

/** Pit runs along the ground row, as `[startX, width]`. Used by the validators. */
export function findPits(tiles: TileCode[][]): Array<[number, number]> {
  const pits: Array<[number, number]> = [];
  let run = 0;
  for (let x = 0; x < COLS; x += 1) {
    if (!solidAt(tiles, x, GROUND_TOP)) {
      run += 1;
    } else if (run > 0) {
      pits.push([x - run, run]);
      run = 0;
    }
  }
  if (run > 0) pits.push([COLS - run, run]);
  return pits;
}
