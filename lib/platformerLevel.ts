/**
 * World geometry, player physics and procedural level generation for Coin Runner.
 *
 * Physics lives beside generation rather than in the component because
 * reachability is a property of the level AND the jump arc together. The
 * generator sizes every step, gap, spring and platform ride from the constants
 * below, and `scripts/check-platformer.ts` proves the result by running
 * `stepBody` and `stepEnemy` - the same integrators the game runs - over a
 * search of reachable states. One implementation, three consumers, no chance of
 * them disagreeing.
 */
import { RAMP_SCALE, SPEED_SCALE, type Difficulty } from './difficulty';

export const TILE = 16;
/**
 * The world is 18 rows tall with three rows of ground at the bottom, so there are
 * 15 rows of air - and the generator is required to put reachable content in
 * all but the top two of them.
 *
 * Both numbers are load-bearing. The ground is deliberately thin, because a slab
 * of dirt filling a quarter of the screen is the same wasted space as blank sky.
 * The height is what it is because the renderer fills the canvas with world: on
 * the narrowest portrait phone, showing eleven tiles across needs eighteen rows
 * down, and anything shorter leaves a strip of sky the layout cannot fill. The
 * verifier asserts that over a table of real device sizes.
 *
 * It used to be 15 rows with the ground at row 13 and platforms stopping around
 * row 6, which left seven rows permanently empty in every level. Because the
 * renderer fits the world's height to the canvas, those dead rows became dead
 * SCREEN: half an iPad was blank sky with the action in a strip along the
 * bottom. Making the world shorter looked like the fix and is not, because
 * fitting a short world to a tall portrait canvas zooms in until you can only
 * see eight tiles ahead. The fix is a world that is tall AND full: ground at row
 * 14, standing surfaces climbing to row 6, coins and flyers up to row 1.
 */
export const ROWS = 18;
/**
 * Level width. Raised from the original 88 (Zach's complaint: a single run ended
 * too quickly) to roughly 2.7x that distance, so a run from spawn to flag is
 * substantially longer at the same walk/run speed. `LENGTH_SCALE` below scales
 * the content budgets (enemies, coin top-up) that would otherwise stay fixed
 * per-level regardless of how wide the level is, so a longer level does not
 * read as the same amount of stuff spread thinner.
 */
export const COLS = 220;
export const LEVEL_W = COLS * TILE;
export const WORLD_H = ROWS * TILE;
/** COLS this file originally shipped with, kept only to derive LENGTH_SCALE. */
const BASE_COLS = 88;
/** How much wider the level is than the original. Scales density budgets. */
export const LENGTH_SCALE = COLS / BASE_COLS;

/** Topmost solid ground row. Rows below this are also solid. */
export const GROUND_TOP = 15;

// --- Player physics -------------------------------------------------------
// Momentum first: you accelerate into a run, skid when you turn around, and a
// running jump goes higher and further than a standing one. That relationship
// between ground speed and jump arc is most of what makes this genre feel good,
// and it was the thing the old flat `vx -> target` lerp had none of.

export const GRAVITY = 900;
/** Top ground speed, reached after roughly half a second of holding a direction. */
export const RUN_SPEED = 168;
/** The first plateau. Below it acceleration is brisk so a tap of the button moves you. */
export const WALK_SPEED = 82;
export const ACCEL_START = 900;
/** Walk to run is slower, so topping out reads as building speed rather than a step. */
export const ACCEL_RUN = 260;
/** Braking when the held direction opposes current motion. This is the skid. */
export const SKID_DECEL = 1250;
/**
 * Ground drag with nothing held. Below SKID_DECEL, so stopping is not instant.
 * Tuned 720 -> 1080 (Coin Runner parent feedback): at full RUN_SPEED the old
 * value coasted ~19.6px (about 1.2 tiles) over ~0.23s after letting go, which
 * read as sliding past where a young player meant to stop. 1080 cuts that to
 * ~13px over ~0.16s - noticeably tighter without being an instant stop (still
 * well under SKID_DECEL, so turning around still has its skid, and a running
 * jump still keeps its speed since this only decays vx with no input held).
 */
export const FRICTION = 1080;
/** Air control. Weaker than the ground burst, so a jump commits you somewhat. */
export const AIR_ACCEL = 430;
/** Jump impulse from a standstill. */
export const JUMP_VELOCITY = 340;
/** Extra impulse at full run speed. The reward for building up speed. */
export const JUMP_RUN_BONUS = 40;
/** Releasing the button clips rising speed to this, giving variable jump height. */
export const JUMP_CUT = 120;
export const MAX_FALL = 520;
/** Grace period after walking off a ledge where a jump still counts. */
export const COYOTE_TIME = 0.1;
/** A jump pressed slightly before landing still fires on touchdown. */
export const JUMP_BUFFER = 0.13;
/** Launch speed off a spring pad. Sized so the apex stays inside the world. */
export const SPRING_VELOCITY = 590;
/** Bounce off a stomped enemy. Holding jump gives the taller one, for chaining. */
export const STOMP_BOUNCE = 240;
export const STOMP_BOUNCE_HELD = 330;
/**
 * No single collision substep may move the body further than this. A tile is 16px
 * and the fastest thing in the game covers 26px in one 20fps frame, so without
 * substepping a fall could straddle a one-tile platform and tunnel through it.
 */
export const MAX_SUBSTEP = 5;

export const PW = 11;
export const PH = 14;
/** Hitbox height once grown. Head clearance is checked against this, not PH. */
export const PH_BIG = 20;

/** Peak rise of a standing jump, in pixels. */
export const JUMP_RISE = (JUMP_VELOCITY * JUMP_VELOCITY) / (2 * GRAVITY);
/** Peak rise of a full-speed running jump. The generator never relies on it. */
export const JUMP_RISE_RUN =
  ((JUMP_VELOCITY + JUMP_RUN_BONUS) * (JUMP_VELOCITY + JUMP_RUN_BONUS)) / (2 * GRAVITY);
/** Time from takeoff back to the same height, in seconds. */
export const AIR_TIME = (2 * JUMP_VELOCITY) / GRAVITY;
/** Peak rise of a spring launch, in pixels. */
export const SPRING_RISE = (SPRING_VELOCITY * SPRING_VELOCITY) / (2 * GRAVITY);
/**
 * Tallest step the generator may build between two standing surfaces. One tile
 * is held back from the raw rise for head clearance and for the fact that you
 * also need time to move sideways onto the ledge.
 */
export const MAX_STEP_UP = Math.max(1, Math.floor(JUMP_RISE / TILE) - 1);
/** Gross horizontal distance covered by a walking-speed jump, in tiles. */
export const JUMP_REACH_TILES = (WALK_SPEED * AIR_TIME) / TILE;
/**
 * Widest pit the generator may carve, measured against the WALKING jump rather
 * than the running one: the player must be able to clear it without having had
 * room for a run-up, and must land somewhere, not merely arrive.
 */
export const MAX_PIT_WIDTH = Math.max(1, Math.floor(JUMP_REACH_TILES) - 1);
/** Minimum solid ground between consecutive pits, so two never merge. */
export const MIN_PIT_GAP = 5;
/**
 * Highest row that may hold a standing surface. A full running jump from it must
 * leave a grown player's head inside the world, or the player disappears off the
 * top of the view; the verifier asserts exactly that against JUMP_RISE_RUN.
 */
export const TOP_SURFACE_ROW = 7;
/** Highest row anything at all may occupy. Row 0 stays clear for the HUD strip. */
export const SKY_TOP_ROW = 1;

// --- The sky contract -----------------------------------------------------
// The complaint this whole rewrite answers is that the top of the screen was
// permanently blank. "Not blank" needs a definition both the generator and the
// verifier agree on, or they will drift, so it lives here: the level is split
// into SKY_BANDS stretches roughly a screen wide, and each one must carry at
// least MIN_BAND_CONTENT cells of tiles, coins or enemies in the rows between
// UPPER_AIR_TOP and UPPER_AIR_BOTTOM. On top of that no single row in the whole
// air band may be empty. `buildLevel` aims above the minimum; the checker
// asserts the minimum.

export const UPPER_AIR_TOP = SKY_TOP_ROW + 1;
export const UPPER_AIR_BOTTOM = GROUND_TOP - 5;
export const SKY_BANDS = 6;
export const MIN_BAND_CONTENT = 3;
/** Flag pole height in tiles. Touching the pole at any height clears the level. */
export const FLAG_H = 6;

// --- Camera ---------------------------------------------------------------
// Shared with the renderer so the verifier can prove a running player cannot
// outrun the view.

/** Exponential follow rate, per second. */
export const CAMERA_LERP = 8;
/** How far ahead of the player the camera leads at full run speed, in pixels. */
export const CAMERA_LOOKAHEAD = 26;
/** Narrowest view the renderer will produce, in pixels. */
export const MIN_VIEW_W = 11 * TILE;
/** Widest view the renderer will produce. Beyond this everything is too small. */
export const MAX_VIEW_W = 22 * TILE;

export type Viewport = {
  zoom: number;
  viewW: number;
  viewH: number;
  /** Surplus height when the view is taller than the world: sky above the world. */
  skyPad: number;
};

/**
 * How much of the world to show on a canvas `cw` x `playH` CSS pixels.
 *
 * Start from the zoom that fits the world's height exactly, then clamp so the
 * view is never narrower than MIN_VIEW_W (you cannot see what is coming) nor
 * wider than MAX_VIEW_W (everything shrinks to nothing). On a portrait phone the
 * upper clamp bites and leaves a thin strip of sky above the world; on a wide
 * screen the lower clamp bites and the world is taller than the view, so the
 * camera scrolls vertically. Either way the canvas is filled with world, which
 * the old code could not manage on both shapes at once.
 *
 * It lives here rather than in the component so the verifier can prove the
 * framing over a range of real device sizes.
 */
export function viewport(cw: number, playH: number): Viewport {
  const zoom = Math.min(Math.max(playH / WORLD_H, cw / MAX_VIEW_W), cw / MIN_VIEW_W);
  const viewW = cw / zoom;
  const viewH = playH / zoom;
  return { zoom, viewW, viewH, skyPad: Math.max(0, viewH - WORLD_H) };
}

/** Vertical camera offset for a body at `bodyY` with height `h`. */
export function cameraY(bodyY: number, h: number, viewH: number): number {
  const want = bodyY + h / 2 - viewH / 2;
  return Math.max(0, Math.min(want, Math.max(0, WORLD_H - viewH)));
}

// --- Level data -----------------------------------------------------------

/**
 * Tile codes. Solid is everything except air, springs, spikes and doors.
 *   '.' air                    '#' terrain (autotiled)
 *   'B' solid plank platform   'C' cloud platform (sky storeys)
 *   'Q' coin block             'P' power block (holds the grow mushroom)
 *   'K' breakable brick        'S' spring pad (pass-through, launches)
 *   'X' spikes (pass-through, lethal)   'D' door (pass-through, warps)
 */
export type TileCode = '.' | '#' | 'B' | 'C' | 'Q' | 'P' | 'K' | 'S' | 'X' | 'D';

export type Biome = 'grass' | 'sand' | 'snow' | 'stone' | 'dirt' | 'purple';
export type Backdrop = 'hills' | 'desert' | 'trees' | 'mushrooms';

export type DecorKind =
  | 'bush'
  | 'cactus'
  | 'mushroom_brown'
  | 'rock'
  | 'fence'
  | 'fence_broken'
  | 'hill'
  | 'sign';

/**
 * `spiker` is the one you must never stomp. `shell` walks until stomped, then
 * becomes a shell you can kick along the ground through everything in its path.
 * `hopper` bounces, so it clears low walls a walker would turn at.
 */
export type EnemyKind = 'slime' | 'walker' | 'flyer' | 'hopper' | 'spiker' | 'shell';

/** Runtime state of a shell enemy. Every other kind stays on 'walk' forever. */
export type EnemyMode = 'walk' | 'shell' | 'slide';

export type Coin = { x: number; y: number; taken: boolean };

export type Enemy = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
  alive: boolean;
  /** Countdown of the flattened death sprite. */
  squash: number;
  kind: EnemyKind;
  mode: EnemyMode;
  /** Seconds until a dormant shell wakes back up and walks again. */
  wake: number;
  /** Seconds until a hopper's next hop. */
  hop: number;
  /** Flyers bob around this height instead of resting on a surface. */
  baseY: number;
  /** Desynchronises the bob between flyers. */
  phase: number;
  /** Patrol limits in world pixels; flyers turn at these, walkers use terrain. */
  minX: number;
  maxX: number;
};

/** A block that can be punched from below. */
export type Block = {
  tx: number;
  ty: number;
  kind: 'coin' | 'brick' | 'power';
  used: boolean;
  /** Countdown of the little upward nudge after a hit. */
  bump: number;
};

export type Decor = { tx: number; ty: number; kind: DecorKind };

/** A spring pad. Stepping on it launches you SPRING_RISE pixels up. */
export type Spring = { tx: number; ty: number; fired: number };

/**
 * A one-way moving platform: you can land on top of it and ride, and jump up
 * through it from below. Position is a parameter along the line (x0,y0)-(x1,y1).
 */
export type Mover = {
  kind: 'h' | 'v';
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Platform width in pixels. */
  w: number;
  /** Travel speed in pixels per second. */
  speed: number;
  /** Position along the line, 0..1. Mutated at runtime. */
  pos: number;
  /** Travel direction along the line. Mutated at runtime. */
  dir: 1 | -1;
};

/** A door that warps to its partner. Doors are always placed in pairs. */
export type Door = { tx: number; ty: number; exitTx: number; exitTy: number };

/** A hidden pocket or sky ledge holding a coin cluster. */
export type Secret = { tx: number; ty: number; w: number; h: number; kind: 'cave' | 'sky' };

export type Level = {
  tiles: TileCode[][];
  coins: Coin[];
  enemies: Enemy[];
  blocks: Block[];
  decor: Decor[];
  springs: Spring[];
  movers: Mover[];
  doors: Door[];
  secrets: Secret[];
  spawn: { x: number; y: number };
  /** Passing this x moves the respawn point, so a death is never a full restart. */
  checkpointX: number;
  flagX: number;
  biome: Biome;
  backdrop: Backdrop;
  /** Names of the beats placed, in order. Diagnostics for the checker. */
  structures: string[];
  /** Which mechanic this level introduces, tests and twists. */
  lesson: string;
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

/**
 * Decor that suits each biome, so a snow level is not full of cacti. Red
 * mushrooms are deliberately absent: that sprite is the grow power-up now, and a
 * collectable must never also be scenery.
 */
const DECOR_FOR: Record<Biome, DecorKind[]> = {
  grass: ['bush', 'rock', 'fence', 'hill'],
  sand: ['cactus', 'rock', 'fence_broken', 'hill'],
  snow: ['rock', 'fence', 'bush', 'hill'],
  stone: ['rock', 'fence_broken', 'mushroom_brown', 'hill'],
  dirt: ['mushroom_brown', 'rock', 'bush', 'fence'],
  purple: ['mushroom_brown', 'rock', 'hill', 'bush'],
};

// --- Collision and physics ------------------------------------------------

export function solidAt(tiles: TileCode[][], tx: number, ty: number): boolean {
  if (tx < 0 || tx >= COLS) return true; // level edges act as walls
  if (ty < 0) return false;
  if (ty >= ROWS) return false; // below the level is a pit, not a floor
  const t = tiles[ty][tx];
  return t !== '.' && t !== 'S' && t !== 'X' && t !== 'D';
}

/** Spikes. Touching one is fatal, which is why the verifier routes around them. */
export function hazardAt(tiles: TileCode[][], tx: number, ty: number): boolean {
  if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) return false;
  return tiles[ty][tx] === 'X';
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

/** First tile of `code` the box overlaps, or null. Used for the pass-through tiles. */
function overlapsCode(
  tiles: TileCode[][],
  x: number,
  y: number,
  w: number,
  h: number,
  code: TileCode,
): { tx: number; ty: number } | null {
  const x0 = Math.max(0, Math.floor(x / TILE));
  const x1 = Math.min(COLS - 1, Math.floor((x + w - 1) / TILE));
  const y0 = Math.max(0, Math.floor(y / TILE));
  const y1 = Math.min(ROWS - 1, Math.floor((y + h - 1) / TILE));
  for (let ty = y0; ty <= y1; ty += 1) {
    for (let tx = x0; tx <= x1; tx += 1) {
      if (tiles[ty][tx] === code) return { tx, ty };
    }
  }
  return null;
}

/**
 * The body carries its own height, so a grown player is a taller hitbox, and its
 * own `cut` flag: releasing the button shortens a JUMP, but must never clip a
 * spring launch or a stomp bounce, which are not the player's to shorten.
 */
export type Body = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
  h?: number;
  cut?: boolean;
};

export function bodyH(b: Body): number {
  return b.h ?? PH;
}

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
  /** True while braking hard against the held direction on the ground. */
  skidding: boolean;
  /** The spring that launched this frame, if any. */
  sprung: { tx: number; ty: number } | null;
  /** A spike tile the body is touching. Fatal; reported, not applied. */
  hazard: { tx: number; ty: number } | null;
  /** A door tile the body is touching. */
  door: { tx: number; ty: number } | null;
};

/**
 * Advances the player one frame. Shared by the game and the verifier, so the
 * proof of reachability is a proof about the code that actually runs.
 *
 * Collision is substepped: acceleration, the jump impulse and gravity are
 * integrated once over the whole frame (so the arc is unchanged), then the
 * resulting velocity is applied in slices no longer than MAX_SUBSTEP. That is
 * what makes tunnelling impossible at spring and terminal-fall speeds.
 */
export function stepBody(tiles: TileCode[][], b: Body, c: Controls, dt: number): StepResult {
  const h = bodyH(b);
  const res: StepResult = {
    landedAt: 0,
    headHit: null,
    leftGround: false,
    skidding: false,
    sprung: null,
    hazard: null,
    door: null,
  };

  const dir = (c.right ? 1 : 0) - (c.left ? 1 : 0);
  if (dir !== 0) {
    if (b.vx * dir < 0) {
      // Turning around brakes hard before it accelerates. The long stop is the
      // skid, and it is the whole reason the movement feels like it has mass.
      b.vx += dir * SKID_DECEL * dt;
      res.skidding = b.onGround && Math.abs(b.vx) > 30;
    } else {
      const accel = !b.onGround
        ? AIR_ACCEL
        : Math.abs(b.vx) < WALK_SPEED
          ? ACCEL_START
          : ACCEL_RUN;
      b.vx += dir * accel * dt;
      if (Math.abs(b.vx) > RUN_SPEED) b.vx = dir * RUN_SPEED;
    }
  } else if (b.onGround) {
    const drop = FRICTION * dt;
    b.vx = Math.abs(b.vx) <= drop ? 0 : b.vx - Math.sign(b.vx) * drop;
  }

  if (c.jump) {
    // Running raises the jump. This is the run threshold: speed buys height and
    // distance, so the player learns to build it up before a big gap.
    const run = Math.min(1, Math.abs(b.vx) / RUN_SPEED);
    b.vy = -(JUMP_VELOCITY + JUMP_RUN_BONUS * run);
    b.onGround = false;
    b.cut = true;
  }
  if (b.cut && !c.jumpHeld && b.vy < -JUMP_CUT) b.vy = -JUMP_CUT;
  if (b.vy >= 0) b.cut = false;
  b.vy = Math.min(b.vy + GRAVITY * dt, MAX_FALL);

  const wasOnGround = b.onGround;
  const slices = Math.max(
    1,
    Math.ceil((Math.max(Math.abs(b.vx), Math.abs(b.vy)) * dt) / MAX_SUBSTEP),
  );
  const sdt = dt / slices;

  for (let i = 0; i < slices; i += 1) {
    if (b.vx !== 0) {
      const nextX = b.x + b.vx * sdt;
      if (!overlapsSolid(tiles, nextX, b.y, PW, h)) b.x = nextX;
      else b.vx = 0;
      b.x = Math.max(0, Math.min(b.x, LEVEL_W - PW));
    }
    // vy is exactly zero only in the slices after a landing or a head bump, and
    // resolving those would clear onGround for a body that never moved.
    if (b.vy !== 0) {
      const fallSpeed = b.vy;
      const nextY = b.y + b.vy * sdt;
      if (!overlapsSolid(tiles, b.x, nextY, PW, h)) {
        b.y = nextY;
        b.onGround = false;
      } else if (b.vy > 0) {
        b.y = Math.floor((nextY + h) / TILE) * TILE - h;
        b.onGround = true;
        b.vy = 0;
        if (!wasOnGround && res.landedAt === 0) res.landedAt = fallSpeed;
      } else {
        b.y = Math.floor(nextY / TILE) * TILE + TILE;
        b.vy = 0;
        // Whichever tile the head is under: report the one nearest the body
        // centre so a corner clip does not credit a block two tiles away.
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
    }
  }

  // Springs last, so a landing this frame turns straight into a launch.
  if (b.vy >= 0) {
    const s = overlapsCode(tiles, b.x, b.y, PW, h, 'S');
    if (s) {
      b.vy = -SPRING_VELOCITY;
      b.onGround = false;
      // A spring launch is not a jump, so releasing the button must not clip it.
      b.cut = false;
      res.sprung = s;
    }
  }
  res.hazard = overlapsCode(tiles, b.x, b.y, PW, h, 'X');
  res.door = overlapsCode(tiles, b.x, b.y, PW, h, 'D');

  if (wasOnGround && !b.onGround) res.leftGround = true;
  return res;
}

// --- Enemies ---------------------------------------------------------------

/** How fast a kicked shell travels. Fast enough to read as a projectile. */
export const SHELL_SPEED = 210;
/** Seconds a stomped shell lies dormant before walking again. */
export const SHELL_WAKE = 5;
export const HOP_VELOCITY = 250;
export const HOP_PERIOD = 1.1;

export function enemySpeedFor(kind: EnemyKind): number {
  switch (kind) {
    case 'slime':
      return 24;
    case 'walker':
      return 44;
    case 'flyer':
      return 34;
    case 'hopper':
      return 30;
    case 'spiker':
      return 28;
    case 'shell':
      return 22;
  }
}

/** True if stomping this one hurts you instead of killing it. */
export function isSpiky(e: Enemy): boolean {
  return e.kind === 'spiker';
}

/**
 * Advances one enemy. Ground kinds fall, turn at ledges and walls, and stay
 * inside their patrol span; flyers ride a fixed sine lane and ignore terrain; a
 * kicked shell ignores ledges and its patrol span, so it runs the length of the
 * ground until something stops it.
 */
export function stepEnemy(tiles: TileCode[][], e: Enemy, dt: number, time: number): void {
  if (!e.alive) {
    if (e.squash > 0) e.squash -= dt;
    return;
  }

  if (e.kind === 'flyer') {
    e.x += e.vx * dt;
    if (e.x < e.minX) {
      e.x = e.minX;
      e.vx = Math.abs(e.vx);
    } else if (e.x > e.maxX) {
      e.x = e.maxX;
      e.vx = -Math.abs(e.vx);
    }
    e.y = e.baseY + Math.sin(time * 2.4 + e.phase) * 9;
    return;
  }

  if (e.mode === 'shell') {
    e.wake -= dt;
    if (e.wake <= 0) {
      e.mode = 'walk';
      e.vx = enemySpeedFor(e.kind) * (e.vx >= 0 ? 1 : -1) || enemySpeedFor(e.kind);
    } else {
      e.vx = 0;
    }
  }

  if (e.kind === 'hopper' && e.onGround && e.mode === 'walk') {
    e.hop -= dt;
    if (e.hop <= 0) {
      e.vy = -HOP_VELOCITY;
      e.hop = HOP_PERIOD;
      e.onGround = false;
    }
  }

  e.vy = Math.min(e.vy + GRAVITY * dt, MAX_FALL);

  const slices = Math.max(
    1,
    Math.ceil((Math.max(Math.abs(e.vx), Math.abs(e.vy)) * dt) / MAX_SUBSTEP),
  );
  const sdt = dt / slices;
  for (let i = 0; i < slices; i += 1) {
    if (e.vx !== 0) {
      const nextX = e.x + e.vx * sdt;
      if (overlapsSolid(tiles, nextX, e.y, PW, PH)) e.vx = -e.vx;
      else e.x = nextX;
    }
    if (e.vy !== 0) {
      const nextY = e.y + e.vy * sdt;
      if (!overlapsSolid(tiles, e.x, nextY, PW, PH)) {
        e.y = nextY;
        e.onGround = false;
      } else if (e.vy > 0) {
        e.y = Math.floor((nextY + PH) / TILE) * TILE - PH;
        e.vy = 0;
        e.onGround = true;
      } else {
        e.y = Math.floor(nextY / TILE) * TILE + TILE;
        e.vy = 0;
      }
    }
  }

  // A sliding shell is a projectile: it runs off ledges and out of its span,
  // which is exactly what makes it useful for clearing a line of enemies.
  if (e.onGround && e.mode !== 'slide') {
    const aheadTx = Math.floor((e.x + (e.vx > 0 ? PW + 1 : -1)) / TILE);
    const belowTy = Math.floor((e.y + PH + 2) / TILE);
    if (e.vx !== 0 && !solidAt(tiles, aheadTx, belowTy)) e.vx = -e.vx;
    if (e.x < e.minX) e.vx = Math.abs(e.vx);
    else if (e.x > e.maxX) e.vx = -Math.abs(e.vx);
  }

  // Level edges are solid, so x can never leave; falling out of the world can,
  // and a shell that fell out must stop existing rather than travel forever.
  e.x = Math.max(0, Math.min(e.x, LEVEL_W - PW));
  if (e.y > WORLD_H + 40) e.alive = false;
}

/** Turns a stomped shell-carrier into a dormant shell. */
export function toShell(e: Enemy): void {
  e.mode = 'shell';
  e.vx = 0;
  e.wake = SHELL_WAKE;
}

/** Kicks a dormant shell in `dir`. It becomes a projectile. */
export function kickShell(e: Enemy, dir: 1 | -1): void {
  e.mode = 'slide';
  e.vx = SHELL_SPEED * dir;
  e.wake = 0;
}

// --- Moving platforms -----------------------------------------------------
// Shared by the game and the verifier: the checker proves a ride is boardable
// and cannot strand or crush a rider by running these, not by trusting the
// generator.

/** Platform thickness in pixels. Thin, so it reads as a plank, not a block. */
export const MOVER_H = 8;

export function moverX(m: Mover): number {
  return m.x0 + (m.x1 - m.x0) * m.pos;
}

export function moverY(m: Mover): number {
  return m.y0 + (m.y1 - m.y0) * m.pos;
}

function moverLen(m: Mover): number {
  return Math.hypot(m.x1 - m.x0, m.y1 - m.y0) || 1;
}

/** Advances a mover and reports how far it moved, for carrying a rider. */
export function stepMover(m: Mover, dt: number): { dx: number; dy: number } {
  const px = moverX(m);
  const py = moverY(m);
  m.pos += (m.dir * m.speed * dt) / moverLen(m);
  if (m.pos > 1) {
    m.pos = 1;
    m.dir = -1;
  } else if (m.pos < 0) {
    m.pos = 0;
    m.dir = 1;
  }
  return { dx: moverX(m) - px, dy: moverY(m) - py };
}

/**
 * Lands the body on any mover it fell onto this frame, given where its feet were
 * before the move. Returns the mover's index, or -1. One-way: rising through a
 * platform is deliberate, it keeps a missed jump from becoming a trap.
 */
export function landOnMover(b: Body, movers: Mover[], prevBottom: number): number {
  if (b.vy < 0) return -1;
  const bottom = b.y + bodyH(b);
  for (let i = 0; i < movers.length; i += 1) {
    const m = movers[i];
    const mx = moverX(m);
    const my = moverY(m);
    if (b.x + PW <= mx || b.x >= mx + m.w) continue;
    if (prevBottom > my + 4 || bottom < my) continue;
    b.y = my - bodyH(b);
    b.vy = 0;
    b.onGround = true;
    return i;
  }
  return -1;
}

/** Pickup test, shared with the verifier so both agree on what "collected" means. */
export function coinTouched(b: Body, c: Coin): boolean {
  return Math.abs(c.x - (b.x + PW / 2)) < 11 && Math.abs(c.y - (b.y + bodyH(b) / 2)) < 12;
}

/** Flag test. Touching the pole at any height counts. */
export function flagTouched(b: Body, flagX: number): boolean {
  return (
    b.x + PW > flagX && b.x < flagX + TILE && b.y + bodyH(b) > (GROUND_TOP - FLAG_H) * TILE
  );
}

/** Standing position a door drops you at. */
export function doorExit(d: Door): { x: number; y: number } {
  return { x: d.exitTx * TILE + (TILE - PW) / 2, y: (d.exitTy + 1) * TILE - PH };
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
  speed: number;
  flyers: boolean;
  /** Spiky enemies you must not stomp, and spike patches on the ground. */
  hazards: boolean;
  /** How many sky storey chains to try to thread through the upper rows. */
  skyChains: number;
  /**
   * First level (first two on easy): flat ground, coins, one block row, one slow
   * enemy on open ground. The player quit the old version at the first screen,
   * so the first screen has to be winnable without knowing anything.
   */
  warmup: boolean;
};

/**
 * Difficulty and level number collapse into these knobs. `intensity` is the
 * single ramp value; RAMP_SCALE stretches how many levels it takes to reach 1.
 */
function knobsFor(level: number, d: Difficulty): Knobs {
  const intensity = Math.min(1, ((level - 1) * RAMP_SCALE[d]) / 14);
  const easy = d === 'easy';
  const hard = d === 'hard';
  const warmupLevels = easy ? 2 : 1;
  const isWarmup = level <= warmupLevels;
  const basePits = easy ? 0.18 : hard ? 0.46 : 0.32;
  const baseEnemies = easy ? 1.6 : hard ? 4 : 2.8;
  const baseEnemyBudget =
    level === 1
      ? easy
        ? 1
        : hard
          ? 3
          : 2
      : baseEnemies + intensity * (easy ? 3 : hard ? 8 : 5);
  return {
    intensity,
    pitChance: isWarmup ? 0 : basePits + intensity * 0.18,
    maxPitW: Math.min(MAX_PIT_WIDTH, (easy ? 1 : 2) + Math.round(intensity * 2)),
    // Scaled by LENGTH_SCALE: the budget used to be sized for an 88-column level,
    // and a level this much wider needs proportionally more enemies or the extra
    // distance reads as empty rather than as more game. The warm-up levels are
    // deliberately exempt - "one slow enemy on open ground" is a design choice
    // about teaching, not a density the wider level should scale up.
    enemyBudget: Math.round(baseEnemyBudget * (isWarmup ? 1 : LENGTH_SCALE)),
    coinScale: easy ? 1.3 : hard ? 0.85 : 1,
    speed: SPEED_SCALE[d] * (1 + intensity * 0.45),
    flyers: easy ? level >= 4 : level >= 2,
    hazards: intensity > (easy ? 0.3 : 0.15),
    // Roughly one chain per screenful of level, so the upper rows are never blank
    // wherever the camera happens to be - not merely non-blank on average. Scaled
    // with LENGTH_SCALE so a wider level gets proportionally more real climbable
    // storeys instead of leaning on guaranteeUpperAir's coin-stack fallback.
    skyChains: isWarmup ? 4 : Math.round((5 + intensity * 2) * LENGTH_SCALE),
    warmup: isWarmup,
  };
}

type Gen = {
  rand: () => number;
  tiles: TileCode[][];
  coins: Coin[];
  enemies: Enemy[];
  blocks: Block[];
  decor: Decor[];
  springs: Spring[];
  movers: Mover[];
  doors: Door[];
  secrets: Secret[];
  structures: string[];
  /** Columns claimed by a structure, so decor never lands on them. */
  busy: Set<number>;
  /** Tile keys that must stay air: spring corridors, block headroom, lanes. */
  reserved: Set<string>;
  /** Tile keys already holding a coin, so arcs and top-ups never double up. */
  coinKeys: Set<string>;
  k: Knobs;
  enemiesLeft: number;
};

const START_PAD = 6;
const END_PAD = 10;
/** Widest any single structure can grow. The placer needs this much room left. */
const MAX_STRUCTURE_W = 15;

/** Ground surface row: standing on it puts the feet at GROUND_TOP * TILE. */
const SURFACE = GROUND_TOP;
/**
 * The two floating storeys, THREE rows apart.
 *
 * Three, not two, because two rows leaves 16px of air under a platform and a grown
 * player is 20px tall: every block row and brick run would have been a wall to
 * anyone holding the power-up, and a two-row staircase would have been a wall to
 * itself. Three rows is 32px of clearance and still one row inside a standing
 * jump's four-row rise. Two storeys is all that fits above the ground: ROW_B is the
 * highest STANDING surface allowed, the rows above it hold coins reached by jumping
 * off it, and rows 2-4 belong to the spring launches.
 */
const ROW_A = SURFACE - 3;
const ROW_B = SURFACE - 6;

function pick<T>(g: Gen, list: T[]): T {
  return list[Math.floor(g.rand() * list.length) % list.length];
}

function irand(g: Gen, lo: number, hi: number): number {
  return lo + Math.floor(g.rand() * (hi - lo + 1));
}

function reserve(g: Gen, tx: number, ty: number) {
  g.reserved.add(`${tx},${ty}`);
}

function reserveBox(g: Gen, tx: number, ty: number, w: number, h: number) {
  for (let y = ty; y < ty + h; y += 1) {
    for (let x = tx; x < tx + w; x += 1) reserve(g, x, y);
  }
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
  if (tx < 1 || tx >= COLS - 1 || ty < SKY_TOP_ROW || ty >= ROWS) return;
  if (solidAt(g.tiles, tx, ty)) return; // never bury a coin
  if (g.tiles[ty][tx] !== '.') return; // nor hide one inside a spring or spikes
  const key = `${tx},${ty}`;
  if (g.coinKeys.has(key)) return;
  g.coinKeys.add(key);
  g.coins.push({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2, taken: false });
}

/**
 * Coins along the real jump parabola from a standing start at WALKING speed, so
 * the line of coins literally shows the path a jump takes and the player never
 * needs a run-up to follow it. This is the teaching device: an arc goes in front
 * of whatever structure demands the jump.
 */
function coinArc(g: Gen, tx: number, surfaceRow: number, tiles: number, dir: 1 | -1 = 1) {
  const speed = Math.min(WALK_SPEED, (tiles * TILE) / AIR_TIME);
  const steps = Math.max(2, tiles * 2);
  for (let i = 0; i <= steps; i += 1) {
    const t = (AIR_TIME * i) / steps;
    const px = tx * TILE + TILE / 2 + dir * speed * t;
    const py = surfaceRow * TILE - (JUMP_VELOCITY * t - 0.5 * GRAVITY * t * t) - PH / 2;
    putCoin(g, Math.floor(px / TILE), Math.floor(py / TILE));
  }
}

/** A tight cluster of coins: the payoff at the end of a lesson. */
function coinCluster(g: Gen, tx: number, ty: number, w: number, h: number) {
  for (let iy = 0; iy < h; iy += 1) {
    for (let ix = 0; ix < w; ix += 1) putCoin(g, tx + ix, ty + iy);
  }
}

function putBlock(g: Gen, tx: number, ty: number, kind: 'coin' | 'brick' | 'power') {
  if (tx < 1 || tx >= COLS - 1 || ty < SKY_TOP_ROW + 1) return;
  if (g.tiles[ty][tx] !== '.') return;
  g.tiles[ty][tx] = kind === 'coin' ? 'Q' : kind === 'power' ? 'P' : 'K';
  g.blocks.push({ tx, ty, kind, used: false, bump: 0 });
  // The row below has to stay open or the block can never be punched, and the
  // row above has to stay open or the popped coin has nowhere to go.
  reserve(g, tx, ty + 1);
  reserve(g, tx, ty - 1);
}

function putPlatform(g: Gen, tx: number, w: number, row: number, code: TileCode = 'B') {
  for (let i = 0; i < w; i += 1) {
    const x = tx + i;
    if (x < 1 || x >= COLS - 1) continue;
    if (g.reserved.has(`${x},${row}`)) continue;
    if (g.tiles[row][x] !== '.') continue;
    g.tiles[row][x] = code;
  }
}

/**
 * Springs sit on the ground surface and need a clear corridor above them. The
 * corridor is three columns wide because the launch carries whatever sideways
 * speed you walked on with, so the flight is never perfectly vertical.
 */
function putSpring(g: Gen, tx: number): boolean {
  if (tx < 3 || tx >= COLS - 3) return false;
  if (!solidAt(g.tiles, tx, SURFACE)) return false;
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let y = SKY_TOP_ROW; y < SURFACE; y += 1) if (g.tiles[y][tx + dx] !== '.') return false;
  }
  g.tiles[SURFACE - 1][tx] = 'S';
  g.springs.push({ tx, ty: SURFACE - 1, fired: 0 });
  // Nothing may ever be built in the launch corridor, or the ride ends in a roof.
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let y = SKY_TOP_ROW; y < SURFACE - 1; y += 1) reserve(g, tx + dx, y);
  }
  return true;
}

/** Row a spring launch tops out at, as a body centre. */
const SPRING_APEX_ROW = Math.max(
  SKY_TOP_ROW,
  Math.floor((SURFACE * TILE - SPRING_RISE - PH / 2) / TILE),
);

/**
 * Spikes on the ground. Kept to one or two tiles with clear run-ups either side,
 * and always paired with a coin arc showing the way over.
 */
function putSpikes(g: Gen, tx: number, w: number) {
  for (let i = 0; i < w; i += 1) {
    const x = tx + i;
    if (x < 1 || x >= COLS - 1) continue;
    if (!solidAt(g.tiles, x, SURFACE)) continue;
    if (g.tiles[SURFACE - 1][x] !== '.') continue;
    g.tiles[SURFACE - 1][x] = 'X';
    reserve(g, x, SURFACE - 1);
  }
}

/**
 * Spends one unit of the enemy budget. `surfaceRow` is the tile row the enemy
 * stands on; flyers hover a few tiles above it.
 */
function addEnemy(g: Gen, tx: number, surfaceRow: number, kind: EnemyKind, span = 3) {
  if (g.enemiesLeft <= 0) return;
  const speed = enemySpeedFor(kind) * g.k.speed;
  const standY = surfaceRow * TILE - PH;
  const baseY = kind === 'flyer' ? Math.max(SKY_TOP_ROW * TILE, (surfaceRow - 4) * TILE) : standY;
  g.enemies.push({
    x: tx * TILE + (TILE - PW) / 2,
    y: baseY,
    vx: g.rand() < 0.5 ? -speed : speed,
    vy: 0,
    onGround: kind !== 'flyer',
    alive: true,
    squash: 0,
    kind,
    mode: 'walk',
    wake: 0,
    hop: HOP_PERIOD * (0.4 + g.rand()),
    baseY,
    phase: g.rand() * Math.PI * 2,
    minX: (tx - span) * TILE,
    maxX: (tx + span) * TILE,
  });
  g.enemiesLeft -= 1;
}

/** Picks a ground enemy type, weighted so slimes stay the common case. */
function groundKind(g: Gen): EnemyKind {
  const r = g.rand();
  if (g.k.intensity < 0.08) return 'slime';
  if (g.k.hazards && r > 0.88) return 'spiker';
  if (r > 0.74) return 'shell';
  if (r > 0.58) return 'hopper';
  if (r > 0.4) return 'walker';
  return 'slime';
}

function claim(g: Gen, x: number, w: number) {
  for (let i = 0; i < w; i += 1) g.busy.add(x + i);
}

/** Topmost solid row in a column, or -1 for a pit column. */
function surfaceRowAt(g: Gen, tx: number): number {
  if (tx < 0 || tx >= COLS) return -1;
  for (let ty = 0; ty < ROWS; ty += 1) if (solidAt(g.tiles, tx, ty)) return ty;
  return -1;
}

/** Ground is solid for `pad` tiles either side of tx. Mushrooms need this. */
function groundRunAround(g: Gen, tx: number, pad: number): boolean {
  for (let i = tx - pad; i <= tx + pad; i += 1) {
    if (i < 0 || i >= COLS) return false;
    if (!solidAt(g.tiles, i, SURFACE)) return false;
    if (g.tiles[SURFACE - 1][i] === 'X') return false;
  }
  return true;
}

// Each structure writes into `g` starting at column x and returns the number of
// columns it consumed. Every one leaves the result reachable by construction:
// nothing rises more than MAX_STEP_UP above a surface the player can already
// stand on, no gap is wider than MAX_PIT_WIDTH, and no standing surface goes
// above TOP_SURFACE_ROW. The verifier then proves it by simulation anyway.

function sFlat(g: Gen, x: number): number {
  const w = irand(g, 3, 6);
  if (g.rand() < 0.7 * g.k.coinScale) {
    const n = irand(g, 1, 3);
    for (let i = 0; i < n; i += 1) putCoin(g, x + 1 + i, SURFACE - 1);
  }
  if (g.rand() < 0.45) {
    const kind = g.k.flyers && g.rand() < 0.28 ? 'flyer' : groundKind(g);
    addEnemy(g, x + Math.floor(w / 2), SURFACE, kind, 2);
  }
  return w;
}

function sPit(g: Gen, x: number): number {
  const w = irand(g, Math.max(1, g.k.maxPitW - 1), Math.max(1, g.k.maxPitW));
  // Two solid pad columns either side keep consecutive pits MIN_PIT_GAP apart.
  for (let i = 0; i < w; i += 1) carveGround(g, x + 2 + i);
  coinArc(g, x + 1, SURFACE, w + 2);
  claim(g, x, w + 4);
  return w + 4;
}

function sStairs(g: Gen, x: number): number {
  const h = irand(g, 2, Math.min(MAX_STEP_UP, 2 + Math.round(g.k.intensity * 2)));
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
  // Floating run two rows above the ground, with the ground left intact
  // underneath so it can always be jumped onto and never becomes a trap.
  const w = irand(g, 3, 5);
  putPlatform(g, x + 1, w, ROW_A);
  for (let i = 0; i < w; i += 1) {
    if (g.rand() < 0.7 * g.k.coinScale) putCoin(g, x + 1 + i, ROW_A - 1);
  }
  if (g.k.intensity > 0.25 && g.rand() < 0.35) {
    addEnemy(g, x + 1 + Math.floor(w / 2), ROW_A, 'slime', Math.max(1, Math.floor(w / 2)));
  }
  claim(g, x, w + 2);
  return w + 2;
}

function sQuestionRow(g: Gen, x: number): number {
  const n = irand(g, 2, 4);
  for (let i = 0; i < n; i += 1) {
    // Mostly coin blocks; a breakable brick gives the row some shape.
    putBlock(g, x + 1 + i, ROW_A, g.rand() < 0.7 ? 'coin' : 'brick');
  }
  if (g.rand() < 0.5 * g.k.coinScale) putCoin(g, x + 1 + irand(g, 0, n - 1), ROW_B);
  claim(g, x, n + 2);
  return n + 2;
}

/** A block row with the level's grow mushroom hidden in one of them. */
function sPowerRow(g: Gen, x: number): number {
  const n = irand(g, 3, 4);
  const hidden = irand(g, 0, n - 1);
  for (let i = 0; i < n; i += 1) {
    putBlock(g, x + 1 + i, ROW_A, i === hidden ? 'power' : 'coin');
  }
  coinCluster(g, x + 1, ROW_B, n, 1);
  claim(g, x, n + 2);
  return n + 2;
}

/** Blocks on two storeys, so the upper row is punched from the lower one. */
function sBlockStack(g: Gen, x: number): number {
  const n = irand(g, 3, 4);
  putPlatform(g, x + 1, n, ROW_A);
  for (let i = 0; i < n; i += 1) putBlock(g, x + 1 + i, ROW_B, g.rand() < 0.6 ? 'coin' : 'brick');
  putCoin(g, x + 1, ROW_A - 1);
  putCoin(g, x + n, ROW_A - 1);
  if (g.rand() < 0.6) addEnemy(g, x + n + 2, SURFACE, groundKind(g), 2);
  claim(g, x, n + 3);
  return n + 3;
}

function sIslands(g: Gen, x: number): number {
  // A pit with stepping stones over it: two routes, low risk either way.
  const w = Math.max(2, Math.min(g.k.maxPitW, 3));
  for (let i = 0; i < w; i += 1) carveGround(g, x + 2 + i);
  putPlatform(g, x + 2, Math.max(1, w - 1), ROW_A);
  for (let i = 0; i < Math.max(1, w - 1); i += 1) putCoin(g, x + 2 + i, ROW_A - 1);
  claim(g, x, w + 4);
  return w + 4;
}

/**
 * The vertical staircase, and the direct answer to "I cannot get to the second
 * area": four storeys two rows apart, each offset sideways so the hop is short
 * and the one above never blocks it.
 */
function sTower(g: Gen, x: number): number {
  const rows = [ROW_A, ROW_B];
  let cx = x + 1;
  for (let i = 0; i < rows.length; i += 1) {
    const w = i === rows.length - 1 ? 3 : irand(g, 2, 3);
    putPlatform(g, cx, w, rows[i], i === 0 ? 'B' : 'C');
    for (let j = 0; j < w; j += 1) {
      if (g.rand() < 0.55 * g.k.coinScale) putCoin(g, cx + j, rows[i] - 1);
    }
    // Same as the chains: the rows between storeys need something in them.
    putCoin(g, cx, rows[i] + 1);
    putCoin(g, cx + 1, rows[i] + 2);
    cx += irand(g, 1, 2);
  }
  coinCluster(g, cx - 1, ROW_B - 4, 2, 3);
  g.secrets.push({ tx: cx - 1, ty: ROW_B - 4, w: 2, h: 3, kind: 'sky' });
  const total = cx - x + 3;
  claim(g, x, total);
  return total;
}

function sFlyerLane(g: Gen, x: number): number {
  const w = irand(g, 5, 7);
  addEnemy(g, x + Math.floor(w / 2), SURFACE, 'flyer', Math.floor(w / 2));
  // A flyer does not collide with terrain, so nothing may be built in its lane.
  reserveBox(g, x, SURFACE - 6, w, 6);
  for (let i = 1; i < w - 1; i += 2) {
    if (g.rand() < 0.5 * g.k.coinScale) putCoin(g, x + i, SURFACE - 1);
  }
  claim(g, x, w);
  return w;
}

function sHopperLane(g: Gen, x: number): number {
  const w = 7;
  addEnemy(g, x + 3, SURFACE, 'hopper', 3);
  coinArc(g, x + 1, SURFACE, 3);
  claim(g, x, w);
  return w;
}

function sShellLane(g: Gen, x: number, withTarget: boolean): number {
  const w = withTarget ? 10 : 6;
  addEnemy(g, x + 2, SURFACE, 'shell', 2);
  if (withTarget) {
    addEnemy(g, x + 6, SURFACE, g.rand() < 0.5 ? 'slime' : 'walker', 1);
    addEnemy(g, x + 8, SURFACE, 'slime', 1);
  }
  for (let i = 1; i < w - 1; i += 2) putCoin(g, x + i, SURFACE - 1);
  claim(g, x, w);
  return w;
}

/** Spikes with a coin arc over them and room to line the jump up. */
function sSpikePatch(g: Gen, x: number): number {
  const w = g.k.intensity > 0.5 ? 2 : 1;
  putSpikes(g, x + 3, w);
  coinArc(g, x + 2, SURFACE, w + 2);
  if (g.rand() < 0.4) addEnemy(g, x + 6 + w, SURFACE, 'spiker', 1);
  const total = w + 8;
  claim(g, x, total);
  return total;
}

/**
 * A spring pad. Coins sit in the first few rows of the corridor, where the flight
 * is still near-vertical, and the real payload is a wide block around the apex,
 * which is where vertical speed drops to nothing and the player lingers.
 */
function sSpringPad(g: Gen, x: number): number {
  const tx = x + 2;
  if (putSpring(g, tx)) {
    for (let ty = SURFACE - 4; ty <= SURFACE - 2; ty += 1) putCoin(g, tx, ty);
    coinCluster(g, tx - 1, SPRING_APEX_ROW, 3, 3);
  }
  claim(g, x, 5);
  return 5;
}

/**
 * The same pad with the apex block turned into a proper hoard, and recorded as a
 * secret: nothing but the bounce reaches it, so finding out what the pad does is
 * the reward.
 */
function sSpringSecret(g: Gen, x: number): number {
  const w = 7;
  const tx = x + 3;
  if (putSpring(g, tx)) {
    for (let ty = SURFACE - 4; ty <= SURFACE - 2; ty += 1) putCoin(g, tx, ty);
    coinCluster(g, tx - 1, SPRING_APEX_ROW, 3, 4);
    g.secrets.push({ tx: tx - 1, ty: SPRING_APEX_ROW, w: 3, h: 4, kind: 'sky' });
  }
  claim(g, x, w);
  return w;
}

/**
 * A horizontal mover over a pit. The pit stays inside MAX_PIT_WIDTH, so missing
 * the ride costs a jump, never a life - the platform is a convenience.
 */
function sMoverH(g: Gen, x: number, wide: boolean): number {
  const w = wide ? Math.max(2, g.k.maxPitW) : 2;
  for (let i = 0; i < w; i += 1) carveGround(g, x + 2 + i);
  const y = ROW_A * TILE;
  g.movers.push({
    kind: 'h',
    x0: (x + 2) * TILE,
    y0: y,
    x1: (x + 1 + w) * TILE,
    y1: y,
    w: TILE * 2,
    speed: 36 * g.k.speed,
    pos: 0,
    dir: 1,
  });
  reserveBox(g, x + 1, ROW_A - 1, w + 3, 3);
  coinArc(g, x + 1, SURFACE, w + 2);
  claim(g, x, w + 4);
  return w + 4;
}

/**
 * A vertical lift up the side of a stepped mound. The mound is walkable one row
 * at a time, so the lift is a shortcut and never the only way up - nothing on
 * this structure is hostage to catching the ride. Both ends of the travel sit
 * beside something solid, so it also cannot strand a rider.
 */
function sMoverV(g: Gen, x: number): number {
  const col = x + 1;
  const px = col * TILE;
  const top = ROW_B;
  g.movers.push({
    kind: 'v',
    x0: px,
    y0: (SURFACE - 1) * TILE,
    x1: px,
    y1: top * TILE,
    w: TILE * 2,
    speed: 32 * g.k.speed,
    pos: 0,
    dir: 1,
  });
  reserveBox(g, col, top - 1, 2, SURFACE - top + 1);
  // Stepped mound on the right of the shaft, one row per column so it can be
  // walked, topping out level with the lift.
  const mx = col + 2;
  const steps = SURFACE - top;
  for (let i = 1; i <= steps; i += 1) fillDown(g, mx + i - 1, SURFACE - i);
  for (let i = 0; i < 3; i += 1) fillDown(g, mx + steps - 1 + i, top);
  for (let i = 0; i < 3; i += 1) {
    if (g.rand() < 0.7) putCoin(g, mx + steps + i, top - 1);
  }
  putCoin(g, col, SURFACE - 2);
  const total = steps + 5;
  claim(g, x, total);
  return total;
}

/**
 * A hollow mound: the mouth faces the direction of travel, so it is walked past
 * rather than walked into, and the pocket holds a coin cluster. The interior is
 * two tiles tall so a grown player fits.
 */
function sSecretCave(g: Gen, x: number): number {
  const w = 6;
  const top = SURFACE - 3;
  for (let i = 1; i < 3; i += 1) fillDown(g, x + i - 1, SURFACE - i);
  const bodyX = x + 2;
  for (let i = 0; i < w; i += 1) fillDown(g, bodyX + i, top);
  for (let i = 1; i < w; i += 1) {
    for (let y = top + 1; y < SURFACE; y += 1) g.tiles[y][bodyX + i] = '.';
  }
  const inner = { tx: bodyX + 1, ty: top + 1, w: w - 1, h: SURFACE - top - 1 };
  reserveBox(g, inner.tx, inner.ty, inner.w, inner.h);
  coinCluster(g, inner.tx, SURFACE - 1, w - 2, 1);
  putCoin(g, bodyX + Math.floor(w / 2), top - 1);
  g.secrets.push({ ...inner, kind: 'cave' });
  const total = 2 + w;
  claim(g, x, total);
  return total;
}

/**
 * A doorway needs solid ground and two clear rows above it, because a grown
 * player has to be able to stand in it.
 */
function doorSpotOk(g: Gen, tx: number): boolean {
  if (tx < 2 || tx >= COLS - 2) return false;
  if (!solidAt(g.tiles, tx, SURFACE)) return false;
  return g.tiles[SURFACE - 1][tx] === '.' && g.tiles[SURFACE - 2][tx] === '.';
}

/** First column at or after `from` that a doorway fits in, or -1. */
function findDoorSpot(g: Gen, from: number, limit: number): number {
  for (let tx = from; tx <= limit; tx += 1) if (doorSpotOk(g, tx)) return tx;
  return -1;
}

/**
 * A door pair. Both doors stand on flat ground, and the exit is always forward,
 * so a door is a shortcut past a stretch rather than a maze.
 */
function sDoorPair(g: Gen, x: number, span: number): number {
  const entryTx = findDoorSpot(g, x + 1, x + 5);
  const exitTx =
    entryTx < 0 ? -1 : findDoorSpot(g, entryTx + span, Math.min(COLS - END_PAD - 2, entryTx + span + 6));
  if (entryTx < 0 || exitTx < 0 || exitTx <= entryTx) return 3;
  g.tiles[SURFACE - 1][entryTx] = 'D';
  g.tiles[SURFACE - 1][exitTx] = 'D';
  g.doors.push({ tx: entryTx, ty: SURFACE - 1, exitTx, exitTy: SURFACE - 1 });
  reserve(g, entryTx, SURFACE - 1);
  reserve(g, exitTx, SURFACE - 1);
  reserve(g, entryTx, SURFACE - 2);
  reserve(g, exitTx, SURFACE - 2);
  putCoin(g, entryTx, SURFACE - 3);
  claim(g, x, 3);
  return 3;
}

/** The payoff beat: a plateau with an arc up to a cluster above it. */
function sReward(g: Gen, x: number): number {
  const top = SURFACE - 3;
  const w = 6;
  for (let i = 1; i < 3; i += 1) fillDown(g, x + i - 1, SURFACE - i);
  for (let i = 0; i < w; i += 1) fillDown(g, x + 2 + i, top);
  coinArc(g, x + 2, top, 4);
  putPlatform(g, x + 3, 3, ROW_B, 'C');
  coinCluster(g, x + 3, ROW_B - 1, 3, 1);
  const total = 2 + w;
  claim(g, x, total);
  return total;
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
  { name: 'bricks', run: sBrickRun, weight: (k) => 0.9 + k.intensity * 0.5, advanced: true },
  { name: 'blocks', run: sQuestionRow, weight: () => 1.2 },
  { name: 'islands', run: sIslands, weight: (k) => k.pitChance * 1.6, advanced: true },
  { name: 'tower', run: sTower, weight: (k) => 0.8 + k.intensity, advanced: true },
  { name: 'flyers', run: sFlyerLane, weight: (k) => (k.flyers ? 0.7 : 0), advanced: true },
  { name: 'hoppers', run: sHopperLane, weight: (k) => 0.4 + k.intensity * 0.5, advanced: true },
  { name: 'spring', run: sSpringPad, weight: (k) => 0.6 + k.intensity * 0.4 },
  { name: 'shells', run: (g, x) => sShellLane(g, x, false), weight: (k) => 0.4 + k.intensity },
  { name: 'spikes', run: sSpikePatch, weight: (k) => (k.hazards ? 0.6 + k.intensity : 0), advanced: true },
  { name: 'stack', run: sBlockStack, weight: (k) => 0.7 + k.intensity * 0.4, advanced: true },
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
    if (s.name === last) w *= 0.3; // discourage immediate repeats
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

// --- Lesson pacing --------------------------------------------------------
// Every level features one mechanic and paces it the way a hand-built level
// would: introduce it somewhere it cannot kill you, test it, twist it, then pay
// out. The beats are laid down first and weighted filler goes in whatever is
// left, so the SHAPE of the level is designed even though its detail is random.

type Stage = 0 | 1 | 2;

type Lesson = {
  name: string;
  beat: (g: Gen, x: number, stage: Stage) => number;
};

const LESSONS: Lesson[] = [
  {
    // Punching blocks from below, and the grow mushroom hidden in one of them.
    name: 'punch',
    beat: (g, x, stage) =>
      stage === 0 ? sPowerRow(g, x) : stage === 1 ? sQuestionRow(g, x) : sBlockStack(g, x),
  },
  {
    // Gaps. The teach beat is a coin arc over a gap one tile wide.
    name: 'gap',
    beat: (g, x, stage) => {
      if (stage === 0) {
        const saved = g.k.maxPitW;
        g.k.maxPitW = 1;
        const w = sPit(g, x);
        g.k.maxPitW = saved;
        return w;
      }
      return stage === 1 ? sPit(g, x) : sIslands(g, x);
    },
  },
  {
    // Stomping. One slow slime with an arc over it, then company.
    name: 'stomp',
    beat: (g, x, stage) => {
      if (stage === 0) {
        addEnemy(g, x + 4, SURFACE, 'slime', 2);
        coinArc(g, x + 1, SURFACE, 4);
        claim(g, x, 8);
        return 8;
      }
      if (stage === 1) {
        addEnemy(g, x + 2, SURFACE, 'slime', 2);
        addEnemy(g, x + 6, SURFACE, 'walker', 2);
        putCoin(g, x + 4, SURFACE - 1);
        claim(g, x, 8);
        return 8;
      }
      const w = sBrickRun(g, x);
      addEnemy(g, x + 2, SURFACE, groundKind(g), 2);
      return w;
    },
  },
  {
    // Climbing into the sky storeys.
    name: 'climb',
    beat: (g, x, stage) => (stage === 0 ? sStairs(g, x) : sTower(g, x)),
  },
  {
    // Springs. Coin column, then a cluster only the bounce reaches.
    name: 'spring',
    beat: (g, x, stage) =>
      stage === 0 ? sSpringPad(g, x) : stage === 1 ? sSpringSecret(g, x) : sSpringPad(g, x),
  },
  {
    // Shells: stomp one, kick it, then kick one through a line of enemies.
    name: 'shell',
    beat: (g, x, stage) => sShellLane(g, x, stage > 0),
  },
  {
    // Riding platforms, horizontal first and vertical as the twist.
    name: 'ride',
    beat: (g, x, stage) =>
      stage === 0 ? sMoverH(g, x, false) : stage === 1 ? sMoverH(g, x, true) : sMoverV(g, x),
  },
  {
    // Hazards you cannot stomp: spikes on the floor, spiky enemies beside them.
    name: 'avoid',
    beat: (g, x, stage) => {
      if (stage === 0) return sSpikePatch(g, x);
      if (stage === 1) {
        addEnemy(g, x + 3, SURFACE, 'spiker', 2);
        coinArc(g, x + 1, SURFACE, 4);
        claim(g, x, 7);
        return 7;
      }
      const w = sSpikePatch(g, x);
      addEnemy(g, x + 2, SURFACE, 'spiker', 1);
      return w;
    },
  },
];

/** Levels 1-8 teach the lessons in this order; after that they cycle. */
const LESSON_ORDER = [0, 1, 2, 3, 4, 5, 6, 7];

/**
 * True if a horizontal lane of open air runs above the ground either side of
 * `tx`. Flyers do not collide with terrain, so they only belong in one.
 */
function flatLane(g: Gen, tx: number, span: number): boolean {
  for (let i = tx - span; i <= tx + span; i += 1) {
    if (i < 0 || i >= COLS) return false;
    if (!solidAt(g.tiles, i, GROUND_TOP)) return false;
    for (let ty = Math.max(0, GROUND_TOP - 6); ty < GROUND_TOP; ty += 1) {
      if (solidAt(g.tiles, i, ty)) return false;
    }
  }
  return true;
}

/**
 * Sky pass. This is what keeps the upper half of the world from being the blank
 * strip it used to be: chains of small cloud platforms climbing away from a
 * surface the player can already stand on, two rows at a time, each offset
 * sideways so the one above never caps the hop onto it.
 */
/**
 * Builds one diagonal staircase of cloud decks climbing away from the ground at
 * `startTx`, and returns how many storeys it managed. Each deck is two rows above
 * and two columns along from the last, which is far inside a standing jump and
 * offset enough that the deck above never caps the hop onto it.
 */
function chainFrom(g: Gen, startTx: number, limit: number): number {
  if (surfaceRowAt(g, startTx) !== SURFACE || !groundRunAround(g, startTx, 1)) return 0;
  let row = SURFACE;
  let cx = startTx;
  let storeys = 0;
  while (row - 3 >= TOP_SURFACE_ROW) {
    const nextRow = row - 3;
    const w = irand(g, 2, 3);
    const nx = cx + 2;
    if (nx + w >= limit) break;
    if (!spanFree(g, nx, w, nextRow)) break;
    putPlatform(g, nx, w, nextRow, 'C');
    for (let i = 0; i < w; i += 1) {
      if (g.rand() < 0.7 * g.k.coinScale) putCoin(g, nx + i, nextRow - 1);
    }
    // Coins hanging in the gap under the new deck. They are in the path of a jump
    // from the deck below, and they are the only thing that ever occupies the rows
    // BETWEEN two storeys - without them those rows read as sky.
    putCoin(g, nx, nextRow + 1);
    if (g.rand() < 0.6) putCoin(g, nx + 1, nextRow + 2);
    cx = nx;
    row = nextRow;
    storeys += 1;
    if (storeys >= 3) break;
  }
  if (storeys >= 2) {
    // Three rows of coins above the highest deck: reachable by jumping off it, and
    // the reason the rows just under the spring corridors are never blank.
    coinCluster(g, cx, row - 4, 2, 3);
    g.secrets.push({ tx: cx, ty: row - 4, w: 2, h: 3, kind: 'sky' });
    // The chain only checked ground continuity at its own anchor column; by the
    // last deck `cx` has walked several columns further and may now sit over a
    // pit carved by an unrelated structure. Flyers do not fly free of the "never
    // over a pit" rule, so require real ground here too rather than assuming it.
    if (g.k.flyers && g.rand() < 0.5 && solidAt(g.tiles, cx + 2, GROUND_TOP)) {
      addEnemy(g, cx + 2, row, 'flyer', 2);
    }
  }
  return storeys;
}

/** Cells of tiles, coins or enemies in the upper air of columns [lo, hi). */
function upperAirCells(g: Gen, lo: number, hi: number): number {
  let n = 0;
  for (let tx = Math.max(0, lo); tx < Math.min(COLS, hi); tx += 1) {
    for (let ty = UPPER_AIR_TOP; ty <= UPPER_AIR_BOTTOM; ty += 1) {
      if (g.tiles[ty][tx] !== '.') n += 1;
    }
  }
  for (const c of g.coins) {
    const cx = Math.floor(c.x / TILE);
    const cy = Math.floor(c.y / TILE);
    if (cx >= lo && cx < hi && cy >= UPPER_AIR_TOP && cy <= UPPER_AIR_BOTTOM) n += 1;
  }
  for (const e of g.enemies) {
    const ex = Math.floor((e.x + PW / 2) / TILE);
    const ey = Math.floor((e.y + PH / 2) / TILE);
    if (ex >= lo && ex < hi && ey >= UPPER_AIR_TOP && ey <= UPPER_AIR_BOTTOM) n += 1;
  }
  return n;
}

/**
 * Brings a band up to quota when it is too built-up to fit a cloud staircase:
 * coins stacked over the highest surfaces already there, highest first. A
 * standing jump rises four rows, so coins two, three and four rows above a
 * surface the player can stand on are collectable from it - which populates the
 * upper air without adding geometry to a stretch that has no room for any.
 */
function padUpperAir(g: Gen, lo: number, hi: number, want: number) {
  const spots: Array<{ tx: number; row: number }> = [];
  for (let tx = Math.max(1, lo); tx < Math.min(COLS - 2, hi); tx += 1) {
    const row = surfaceRowAt(g, tx);
    // Coins go two to four rows above the surface, so only a surface high enough
    // for that to land inside the counted band is any use here.
    if (row < TOP_SURFACE_ROW || row > UPPER_AIR_BOTTOM + 4) continue;
    // Both neighbours must be at or above this surface, so the spot is a ledge
    // wide enough to stand and jump from, not a one-tile spike of terrain.
    if (surfaceRowAt(g, tx - 1) > row + 1 || surfaceRowAt(g, tx + 1) > row + 1) continue;
    spots.push({ tx, row });
  }
  spots.sort((a, b) => a.row - b.row);
  for (const spot of spots) {
    if (upperAirCells(g, lo, hi) >= want) return;
    for (let dy = 2; dy <= 4; dy += 1) {
      for (let dx = 0; dx <= 1; dx += 1) putCoin(g, spot.tx + dx, spot.row - dy);
    }
  }
}

/**
 * Final guarantee for the sky contract, run after every other pass. It measures
 * the same bands the verifier measures, so "the checker passes" and "the sky is
 * full" cannot come apart.
 */
function guaranteeUpperAir(g: Gen, flagCol: number) {
  const bandW = flagCol / SKY_BANDS;
  for (let band = 0; band < SKY_BANDS; band += 1) {
    const lo = Math.floor(band * bandW);
    const hi = Math.floor((band + 1) * bandW);
    // Two cells of headroom above the minimum, so a later filter that drops one
    // coin does not drop the band below the line.
    if (upperAirCells(g, lo, hi) < MIN_BAND_CONTENT + 2) {
      padUpperAir(g, lo, hi, MIN_BAND_CONTENT + 2);
    }
  }
}

/**
 * Sky pass. This is what keeps the upper half of the world from being the blank
 * strip it used to be. One chain per horizontal band rather than N chances
 * anywhere in the level: random placement clumped them, and a clump leaves whole
 * screenfuls of empty sky between the clumps - which is the same complaint in a
 * different disguise.
 */
function threadSky(g: Gen, flagCol: number) {
  const from = START_PAD - 2;
  const to = flagCol - 4;
  const bands = Math.max(1, g.k.skyChains);
  const bandW = (to - from) / bands;
  for (let band = 0; band < bands; band += 1) {
    const bandFrom = Math.max(1, Math.floor(from + band * bandW));
    const bandTo = Math.max(bandFrom, Math.floor(from + (band + 1) * bandW) - 1);
    // Scan every candidate rather than sampling: a band whose middle is one wide
    // mound has only a couple of usable anchors, and random sampling missed them.
    // The search starts left of the band because a chain climbs to the RIGHT, so
    // an anchor just outside still puts its decks inside.
    for (let t = Math.max(1, bandFrom - 6); t <= bandTo; t += 1) {
      if (chainFrom(g, t, flagCol - 1) >= 2) break;
    }
  }
  // The flag approach gets its own chain: it is the one stretch every level ends
  // on, and the pad clears everything above it, so nothing else would fill it.
  for (let t = flagCol - 9; t <= flagCol - 5; t += 1) {
    if (chainFrom(g, t, COLS - 1) >= 2) break;
  }
}

/** A `w`-wide run at `row` is air, unreserved, and has air above and below it. */
function spanFree(g: Gen, tx: number, w: number, row: number): boolean {
  if (row < SKY_TOP_ROW + 1) return false;
  for (let i = -1; i <= w; i += 1) {
    const x = tx + i;
    if (x < 1 || x >= COLS - 1) return false;
    for (let y = row - 3; y <= row + 2; y += 1) {
      if (y < 0 || y >= ROWS) continue;
      if (g.tiles[y][x] !== '.') return false;
      if (g.reserved.has(`${x},${y}`)) return false;
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
    const surface = surfaceRowAt(g, tx);
    if (surface < 2) continue;
    // surfaceRowAt reports the TOPMOST solid tile in the column, which can be a
    // floating cloud deck (sky chains put those several columns past the ground
    // check they were anchored on). Standing an enemy on that deck would read as
    // "on solid ground" while a pit sits underneath at GROUND_TOP - exactly what
    // enemies must never do. Require the real ground row itself to be solid, not
    // merely whatever this column's highest surface happens to be.
    if (!solidAt(g.tiles, tx, GROUND_TOP)) continue;
    if (g.tiles[surface - 1][tx] === 'X' || g.tiles[surface - 1][tx] === 'S') continue;
    if (overlapsSolid(g.tiles, tx * TILE + (TILE - PW) / 2, surface * TILE - PH, PW, PH)) continue;
    if (g.enemies.some((e) => Math.abs(e.x / TILE - tx) < 3)) continue;
    const flyer = g.k.flyers && g.rand() < 0.26 && flatLane(g, tx, 3);
    addEnemy(g, tx, surface, flyer ? 'flyer' : groundKind(g), 2);
  }
}

/** Brings a thin level up to a coin target, on surfaces the player walks anyway. */
function topUpCoins(g: Gen) {
  // Same LENGTH_SCALE reasoning as enemyBudget: this floor was sized for the
  // original 88-column level and must grow with the level or a longer run
  // just means more empty ground between the same coin count as before.
  const target = Math.round((14 + g.k.intensity * 8) * g.k.coinScale * LENGTH_SCALE);
  let guard = 0;
  while (g.coins.length < target && guard < 500) {
    guard += 1;
    const tx = irand(g, 1, COLS - END_PAD + 2);
    const surface = surfaceRowAt(g, tx);
    if (surface < 1) continue; // a pit column: a floating coin may not be reachable
    putCoin(g, tx, surface - 1);
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
    if (g.rand() > 0.3) continue;
    let surface = -1;
    for (let ty = 0; ty < ROWS; ty += 1) {
      if (g.tiles[ty][tx] === '#') {
        surface = ty;
        break;
      }
    }
    if (surface < 1) continue;
    const ty = surface - 1;
    if (g.tiles[ty][tx] !== '.') continue;
    if (taken.has(`${tx},${ty}`)) continue;
    g.decor.push({ tx, ty, kind: pick(g, kinds) });
    taken.add(`${tx},${ty}`);
  }
}

/**
 * Every level must hold at least one grow mushroom, and the block holding it
 * must sit over unbroken ground: a mushroom that pops out and walks into a pit
 * is a promise the level failed to keep.
 */
function ensurePowerBlock(g: Gen) {
  const good = g.blocks.some(
    (b) => b.kind === 'power' && g.tiles[b.ty][b.tx] === 'P' && groundRunAround(g, b.tx, 3),
  );
  if (good) return;
  for (const b of g.blocks) {
    if (b.kind !== 'power') continue;
    // Demote a badly placed one rather than leaving an unkeepable promise.
    b.kind = 'coin';
    g.tiles[b.ty][b.tx] = 'Q';
  }
  for (let tx = START_PAD + 2; tx < COLS - END_PAD - 2; tx += 1) {
    if (!groundRunAround(g, tx, 3)) continue;
    if (g.tiles[ROW_A][tx] !== '.' || g.reserved.has(`${tx},${ROW_A}`)) continue;
    if (solidAt(g.tiles, tx, ROW_A - 1) || solidAt(g.tiles, tx, SURFACE - 1)) continue;
    if (g.tiles[SURFACE - 1][tx] !== '.') continue;
    putBlock(g, tx, ROW_A, 'power');
    return;
  }
}

/**
 * A spring on the opening pad, before anything else is built there.
 *
 * Three reasons it is unconditional. Bouncing is the most fun thing in the game
 * for a five-year-old and it should be the first thing they find. The launch
 * corridor and its apex hoard are the only content that reaches rows 2-4, so
 * without one the very top of the world is blank. And the opening pad is
 * deliberately clear of structures, which makes it the one place a three-column
 * corridor is always available - a level dense enough to have no room anywhere
 * else still gets its sky filled here.
 */
function startSpring(g: Gen) {
  const tx = START_PAD - 2;
  if (!putSpring(g, tx)) return;
  for (let ty = SURFACE - 4; ty <= SURFACE - 2; ty += 1) putCoin(g, tx, ty);
  const tall = g.rand() < 0.5 ? 3 : 4;
  coinCluster(g, tx - 1, SPRING_APEX_ROW, 3, tall);
  g.secrets.push({ tx: tx - 1, ty: SPRING_APEX_ROW, w: 3, h: tall, kind: 'sky' });
  g.structures.push('spring:start');
}

/** Safety net: a level with no spring at all would have nothing in rows 2-4. */
function ensureSpring(g: Gen) {
  if (g.springs.length > 0) return;
  const from = START_PAD + 4;
  for (let tx = from; tx < COLS - END_PAD - 2; tx += 1) {
    if (!groundRunAround(g, tx, 2)) continue;
    if (!putSpring(g, tx)) continue;
    for (let ty = SURFACE - 4; ty <= SURFACE - 2; ty += 1) putCoin(g, tx, ty);
    coinCluster(g, tx - 1, SPRING_APEX_ROW, 3, 3);
    g.structures.push('spring:guaranteed');
    return;
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
    springs: [],
    movers: [],
    doors: [],
    secrets: [],
    structures: [],
    busy: new Set<number>(),
    reserved: new Set<string>(),
    coinKeys: new Set<string>(),
    k,
    enemiesLeft: k.enemyBudget,
  };

  for (let x = 0; x < COLS; x += 1) fillDown(g, x, GROUND_TOP);

  const boostA = STRUCTURES[(level * 3) % STRUCTURES.length].name;
  const boostB = STRUCTURES[(level * 5 + 2) % STRUCTURES.length].name;
  const boosted = [boostA, boostB];

  // Warm-up levels always teach the block punch: it is the one mechanic with no
  // way to fail. After level 8 the lessons cycle with the intensity ramp.
  const lesson = k.warmup ? LESSONS[0] : LESSONS[LESSON_ORDER[(level - 2) % LESSON_ORDER.length]];

  let x = START_PAD;
  let checkpointX = START_PAD * TILE;
  const runBeat = (name: string, w: number) => {
    g.structures.push(name);
    x += w + irand(g, 1, 2);
  };

  // The designed spine: teach, breathe, test, breathe, twist, pay, hide.
  runBeat(`teach:${lesson.name}`, lesson.beat(g, x, 0));
  runBeat('flat', sFlat(g, x));
  runBeat(`test:${lesson.name}`, lesson.beat(g, x, 1));
  if (!k.warmup) {
    runBeat('flat', sFlat(g, x));
    runBeat(`twist:${lesson.name}`, lesson.beat(g, x, 2));
  }
  checkpointX = x * TILE;
  runBeat('reward', sReward(g, x));
  runBeat('secret', sSecretCave(g, x));

  // Weighted filler fills whatever is left. Stop while a whole structure still
  // fits: a half-placed one could leave a platform sticking into the flag pad,
  // whose coins the pad then orphans.
  let last = '';
  let guard = 0;
  while (COLS - END_PAD - x >= MAX_STRUCTURE_W && guard < 200) {
    guard += 1;
    const s = g.k.warmup && guard === 1 ? BLOCKS_STRUCTURE : pickStructure(g, boosted, last);
    const w = s.run(g, x);
    last = s.name;
    runBeat(s.name, w);
  }

  // A door shortcut on levels where there is a stretch worth skipping.
  if (!k.warmup && level % 3 === 0) {
    const from = START_PAD + 4;
    const span = 10 + irand(g, 0, 6);
    if (groundRunAround(g, from, 2)) {
      sDoorPair(g, from, span);
      g.structures.push('door');
    }
  }

  // Flag pad: solid ground the last stretch of the level, restored after
  // placement so no structure can leave a hole under the flag.
  const flagCol = COLS - 6;
  for (let i = flagCol - 4; i < COLS; i += 1) {
    for (let y = GROUND_TOP; y < ROWS; y += 1) g.tiles[y][i] = '#';
    for (let y = 0; y < GROUND_TOP; y += 1) if (g.tiles[y][i] !== '.') g.tiles[y][i] = '.';
  }
  // Only the pole and its immediate neighbours are protected: reserving the whole
  // approach left the last screen of every level as empty sky.
  for (let i = flagCol - 1; i <= flagCol + 1; i += 1) {
    reserveBox(g, i, GROUND_TOP - FLAG_H - 1, 1, FLAG_H + 1);
  }
  // Same for the opening columns, so the spawn always has flat ground.
  for (let i = 0; i < START_PAD; i += 1) {
    for (let y = GROUND_TOP; y < ROWS; y += 1) g.tiles[y][i] = '#';
    for (let y = 0; y < GROUND_TOP; y += 1) if (g.tiles[y][i] !== '.') g.tiles[y][i] = '.';
  }
  claim(g, flagCol - 4, 10);
  g.decor.push({ tx: flagCol - 4, ty: GROUND_TOP - 1, kind: 'sign' });

  startSpring(g);
  threadSky(g, flagCol);
  ensureSpring(g);
  topUpEnemies(g);
  ensurePowerBlock(g);

  // Drop anything the pads may have overwritten, and anything a later structure
  // buried. Cheaper and safer than trying to order placement perfectly.
  g.coins = g.coins.filter((c) => {
    const tx = Math.floor(c.x / TILE);
    const ty = Math.floor(c.y / TILE);
    return g.tiles[ty][tx] === '.';
  });
  g.blocks = g.blocks.filter((b) => {
    const want = b.kind === 'coin' ? 'Q' : b.kind === 'power' ? 'P' : 'K';
    return g.tiles[b.ty][b.tx] === want;
  });
  g.springs = g.springs.filter((s) => g.tiles[s.ty][s.tx] === 'S');
  g.doors = g.doors.filter(
    (d) => g.tiles[d.ty][d.tx] === 'D' && g.tiles[d.exitTy][d.exitTx] === 'D',
  );
  g.enemies = g.enemies.filter((e) => {
    const tx = Math.floor((e.x + PW / 2) / TILE);
    const ty = Math.floor((e.y + PH / 2) / TILE);
    if (overlapsSolid(g.tiles, e.x, e.y, PW, PH)) return false;
    if (hazardAt(g.tiles, tx, ty)) return false;
    // A flyer ignores terrain, so it needs a clear lane; a walker needs the tile
    // under its feet. Both need the column not to be a pit.
    if (e.kind === 'flyer') return flatLane(g, tx, 3);
    const feetRow = Math.floor((e.y + PH + 1) / TILE);
    return solidAt(g.tiles, tx, feetRow);
  });
  g.secrets = g.secrets.filter((s) => {
    for (let ty = s.ty; ty < s.ty + s.h; ty += 1) {
      for (let tx = s.tx; tx < s.tx + s.w; tx += 1) {
        if (ty < 0 || ty >= ROWS || tx < 0 || tx >= COLS) return false;
        if (solidAt(g.tiles, tx, ty)) return false;
      }
    }
    return g.coins.some(
      (c) =>
        Math.floor(c.x / TILE) >= s.tx &&
        Math.floor(c.x / TILE) < s.tx + s.w &&
        Math.floor(c.y / TILE) >= s.ty &&
        Math.floor(c.y / TILE) < s.ty + s.h,
    );
  });

  // A guaranteed coin right in front of the spawn, so the very first thing on
  // screen is a reward rather than a hazard.
  putCoin(g, START_PAD - 2, GROUND_TOP - 1);
  putCoin(g, START_PAD - 1, GROUND_TOP - 1);
  topUpCoins(g);
  // Last, and after every filter, so nothing downstream can empty a band again.
  guaranteeUpperAir(g, flagCol);

  const biome = BIOMES[(level - 1) % BIOMES.length];
  scatterDecor(g, biome);

  return {
    tiles: g.tiles,
    coins: g.coins,
    enemies: g.enemies,
    blocks: g.blocks,
    decor: g.decor,
    springs: g.springs,
    movers: g.movers,
    doors: g.doors,
    secrets: g.secrets,
    spawn: { x: 2 * TILE, y: (GROUND_TOP - 2) * TILE },
    checkpointX,
    flagX: flagCol * TILE,
    biome,
    backdrop: BACKDROP_FOR[biome],
    structures: g.structures,
    lesson: lesson.name,
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
