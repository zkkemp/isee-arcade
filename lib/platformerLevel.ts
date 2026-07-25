/**
 * Procedural level generation for Coin Runner.
 *
 * Kept separate from the component so the geometry can be validated without a
 * browser: an unjumpable pit or a coin embedded in a wall makes the game
 * unwinnable, and neither shows up in a type check. See
 * `scripts/check-levels.ts`.
 */

export const TILE = 16;
export const ROWS = 15;
export const COLS = 56;
export const LEVEL_W = COLS * TILE;

/** Topmost solid ground row. Rows below this are also solid. */
export const GROUND_TOP = 13;

/** Widest pit the generator may carve. Physics clears ~4.9 tiles; 3 keeps margin. */
export const MAX_PIT_WIDTH = 3;
/** Minimum solid ground between consecutive pits, so two never merge. */
export const MIN_PIT_GAP = 5;

export type Coin = { x: number; y: number; taken: boolean };
export type Enemy = { x: number; y: number; vx: number; alive: boolean; squash: number };

export type Level = {
  tiles: string[][];
  coins: Coin[];
  enemies: Enemy[];
  spawn: { x: number; y: number };
  flagX: number;
};

/**
 * Small deterministic PRNG. Seeding by level number keeps each level stable
 * across replays while still varying between levels.
 */
function lcg(seed: number) {
  let s = (seed * 1103515245 + 12345) & 0x7fffffff;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

export function solidAt(tiles: string[][], tx: number, ty: number): boolean {
  if (tx < 0 || tx >= COLS) return true; // level edges act as walls
  if (ty < 0) return false;
  if (ty >= ROWS) return false; // below the level is a pit, not a floor
  return tiles[ty][tx] === '#';
}

export function buildLevel(level: number): Level {
  const rand = lcg(level * 7919 + 13);
  const tiles: string[][] = Array.from({ length: ROWS }, () => Array(COLS).fill('.'));

  // Solid ground, then carve pits.
  for (let x = 0; x < COLS; x += 1) {
    for (let y = GROUND_TOP; y < ROWS; y += 1) tiles[y][x] = '#';
  }

  const pits: Array<[number, number]> = [];
  let x = 8;
  while (x < COLS - 10) {
    if (rand() < 0.55) {
      const w = 2 + Math.floor(rand() * (MAX_PIT_WIDTH - 1));
      for (let i = 0; i < w; i += 1) {
        for (let y = GROUND_TOP; y < ROWS; y += 1) tiles[y][x + i] = '.';
      }
      pits.push([x, w]);
      x += w + MIN_PIT_GAP + Math.floor(rand() * 4);
    } else {
      x += 4 + Math.floor(rand() * 4);
    }
  }

  // Floating platforms, with coins one tile above them.
  const coins: Coin[] = [];
  let px = 6;
  while (px < COLS - 8) {
    if (rand() < 0.6) {
      const w = 3 + Math.floor(rand() * 4);
      const row = 8 + Math.floor(rand() * 3);
      for (let i = 0; i < w; i += 1) {
        if (px + i < COLS) tiles[row][px + i] = '#';
      }
      for (let i = 0; i < w; i += 1) {
        if (px + i < COLS && rand() < 0.7) {
          coins.push({
            x: (px + i) * TILE + TILE / 2,
            y: (row - 1) * TILE + TILE / 2,
            taken: false,
          });
        }
      }
      px += w + 3 + Math.floor(rand() * 4);
    } else {
      px += 4 + Math.floor(rand() * 3);
    }
  }

  // Coin arcs over pits, as a reward for the risky route.
  for (const [pitX, pitW] of pits) {
    for (let i = 0; i < pitW; i += 1) {
      coins.push({
        x: (pitX + i) * TILE + TILE / 2,
        y: (GROUND_TOP - 2) * TILE + TILE / 2,
        taken: false,
      });
    }
  }

  // Ground-level coins on solid stretches.
  for (let cx = 4; cx < COLS - 6; cx += 1) {
    if (tiles[GROUND_TOP][cx] === '#' && rand() < 0.12) {
      coins.push({
        x: cx * TILE + TILE / 2,
        y: (GROUND_TOP - 1) * TILE + TILE / 2,
        taken: false,
      });
    }
  }

  // Clear a landing pad for the flag before placing enemies, so the pad can't
  // be carved out from under it.
  const flagCol = COLS - 4;
  for (let i = -2; i <= 2; i += 1) {
    for (let y = GROUND_TOP; y < ROWS; y += 1) tiles[y][flagCol + i] = '#';
  }

  // Enemies on solid ground, never right at the spawn.
  const enemies: Enemy[] = [];
  const wanted = 3 + Math.min(level, 5);
  let guard = 0;
  while (enemies.length < wanted && guard < 300) {
    guard += 1;
    const ex = 10 + Math.floor(rand() * (COLS - 20));
    if (tiles[GROUND_TOP][ex] !== '#') continue;
    if (enemies.some((e) => Math.abs(e.x / TILE - ex) < 4)) continue;
    const speed = (22 + rand() * 14) * (1 + (level - 1) * 0.1);
    enemies.push({
      x: ex * TILE + 2,
      y: (GROUND_TOP - 1) * TILE,
      vx: rand() < 0.5 ? -speed : speed,
      alive: true,
      squash: 0,
    });
  }

  return {
    tiles,
    coins,
    enemies,
    spawn: { x: 2 * TILE, y: (GROUND_TOP - 2) * TILE },
    flagX: flagCol * TILE,
  };
}

/** Pit runs along the ground row, as `[startX, width]`. Used by the validator. */
export function findPits(tiles: string[][]): Array<[number, number]> {
  const pits: Array<[number, number]> = [];
  let run = 0;
  for (let x = 0; x < COLS; x += 1) {
    if (tiles[GROUND_TOP][x] !== '#') {
      run += 1;
    } else if (run > 0) {
      pits.push([x - run, run]);
      run = 0;
    }
  }
  if (run > 0) pits.push([COLS - run, run]);
  return pits;
}
