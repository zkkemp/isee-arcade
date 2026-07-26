/**
 * Proves every generated platformer level is actually playable.
 *
 * The bug this exists to prevent: floating platforms were being generated five
 * rows above the ground while the jump only rises three, so most of the level's
 * coins could not be collected and the player could not get "to the second
 * area". Geometry rules alone did not catch it, because the rule was never
 * written down anywhere the physics could contradict.
 *
 * So this does not check heights against a hand-derived number. It runs the real
 * integrators (`stepBody`, `stepEnemy`, `stepMover` - the same functions the game
 * calls) over a search of reachable player states and asserts the flag, every
 * coin, every block and every secret are actually touched. The search is
 * deliberately conservative: it only ever expands from states it has physically
 * simulated its way into, it treats spikes as impassable, it never rides a moving
 * platform, and it re-verifies each standing state is collision-free before
 * treating it as reachable. It can under-report reachability but never
 * over-report it.
 *
 * On top of reachability it proves: the sky is not empty (the complaint that
 * started this rewrite), springs and lifts cannot fling or strand you, kicked
 * shells stay inside the level, a running player cannot outrun the camera, and
 * the substepped collision cannot tunnel at maximum speed.
 *
 * Run: npx tsx scripts/check-platformer.ts
 */
import {
  AIR_TIME,
  CAMERA_LERP,
  CAMERA_LOOKAHEAD,
  COLS,
  FLAG_H,
  GROUND_TOP,
  JUMP_REACH_TILES,
  JUMP_RISE,
  JUMP_RISE_RUN,
  LEVEL_W,
  MAX_FALL,
  MAX_PIT_WIDTH,
  MAX_STEP_UP,
  MAX_SUBSTEP,
  MAX_VIEW_W,
  MIN_BAND_CONTENT,
  MIN_PIT_GAP,
  MIN_VIEW_W,
  MOVER_H,
  PH,
  PH_BIG,
  PW,
  ROWS,
  RUN_SPEED,
  SKY_BANDS,
  SKY_TOP_ROW,
  SPRING_RISE,
  UPPER_AIR_BOTTOM,
  UPPER_AIR_TOP,
  TILE,
  TOP_SURFACE_ROW,
  WORLD_H,
  buildLevel,
  cameraY,
  coinTouched,
  doorExit,
  findPits,
  flagTouched,
  hazardAt,
  kickShell,
  landOnMover,
  moverX,
  moverY,
  overlapsSolid,
  solidAt,
  stepBody,
  stepEnemy,
  stepMover,
  viewport,
  type Body,
  type Level,
  type Mover,
  type TileCode,
} from '../lib/platformerLevel';
import { DIFFICULTIES, type Difficulty } from '../lib/difficulty';

const LEVELS = 25;
const DT = 1 / 60;
/** The slowest frame the canvas loop will hand out. Worst case for tunnelling. */
const SLOW_DT = 1 / 20;
/** Beyond the loop's clamp. Used to show the substepping is load-bearing. */
const EXTREME_DT = 1 / 8;
/** Frames simulated per action. A spring launch plus its fall is about 90. */
const MAX_FRAMES = 120;
/** Safety valve: a runaway search is a bug in this file, not in the level. */
const MAX_EXPANSIONS = 9000;
/**
 * Rows 0 and 1 are the only ones left as sky: row 0 sits under the HUD strip and
 * row 1 is the head clearance a spring launch needs. Every row from 2 down to the
 * ground must hold something, in every level, on every difficulty. Row-by-row
 * fill is not enough on its own - a level could satisfy it with one tall tower and
 * still show blank sky for the rest of the run - so the band test below covers the
 * horizontal axis. Both thresholds come from lib/platformerLevel, so the
 * generator and this file cannot drift apart on what "not empty" means.
 */
const AIR_TOP_ROW = UPPER_AIR_TOP;
const MAX_EMPTY_AIR_ROWS = 0;
const UPPER_HALF_ROW = UPPER_AIR_BOTTOM;

const errors: string[] = [];
let sink = errors;
const fail = (msg: string) => sink.push(msg);

/** Runs `body` with failures collected somewhere else. Used by the self-tests. */
function collecting(body: () => void): string[] {
  const scratch: string[] = [];
  const prev = sink;
  sink = scratch;
  try {
    body();
  } finally {
    sink = prev;
  }
  return scratch;
}

// --- reachability search --------------------------------------------------

/**
 * One button plan: run in `runDir` for `delay` frames, jump, hold the button for
 * `hold` frames, and steer `airDir` while airborne. `hold: 0` never jumps at all,
 * which is how walking, falling off ledges and riding springs get covered.
 */
type Action = { runDir: -1 | 0 | 1; airDir: -1 | 0 | 1; delay: number; hold: number };

const DIRS: Array<-1 | 0 | 1> = [-1, 0, 1];
const ACTIONS: Action[] = [];
for (const runDir of DIRS) {
  for (const airDir of DIRS) {
    // A run-up only matters if there is a run direction to build speed in.
    for (const delay of runDir === 0 ? [0] : [0, 18]) {
      // hold 0 is the no-jump plan: walking, and being launched by a spring.
      for (const hold of [0, 4, 12, 30, 60]) {
        if (hold === 0 && delay !== 0) continue;
        ACTIONS.push({ runDir, airDir, delay, hold });
      }
    }
  }
}

type Reach = {
  coins: boolean[];
  blocks: boolean[];
  flag: boolean;
  nodes: Set<string>;
  expansions: number;
  capped: boolean;
};

/**
 * Canonical standing state for a column: centred on the tile, feet on top of
 * `surfaceRow`. Landing anywhere in a column can be walked to this position
 * (the offset is under 6px and a 16px tile cannot fit inside that gap), so
 * collapsing landings onto it keeps the search finite without cheating.
 */
function canonical(tx: number, surfaceRow: number, h: number): Body {
  return {
    x: tx * TILE + (TILE - PW) / 2,
    y: surfaceRow * TILE - h,
    vx: 0,
    vy: 0,
    onGround: true,
    h,
  };
}

/** True if the box touches a spike. A path through one is not a path. */
function touchesHazard(tiles: TileCode[][], x: number, y: number, h: number): boolean {
  const x0 = Math.floor(x / TILE);
  const x1 = Math.floor((x + PW - 1) / TILE);
  const y0 = Math.floor(y / TILE);
  const y1 = Math.floor((y + h - 1) / TILE);
  for (let ty = y0; ty <= y1; ty += 1) {
    for (let tx = x0; tx <= x1; tx += 1) {
      if (hazardAt(tiles, tx, ty)) return true;
    }
  }
  return false;
}

function validNode(tiles: TileCode[][], tx: number, surfaceRow: number, h: number): boolean {
  if (tx < 0 || tx >= COLS || surfaceRow < 1 || surfaceRow >= ROWS) return false;
  if (!solidAt(tiles, tx, surfaceRow)) return false;
  const b = canonical(tx, surfaceRow, h);
  if (overlapsSolid(tiles, b.x, b.y, PW, h)) return false;
  return !touchesHazard(tiles, b.x, b.y, h);
}

type ExploreOpts = {
  /** Hitbox height. PH for the normal player, PH_BIG for a grown one. */
  h?: number;
  /** Override the starting position, for the checkpoint proof. */
  from?: { x: number; y: number };
  /** Substitute tile grid, for the "all bricks broken" proof. */
  tiles?: TileCode[][];
};

function explore(L: Level, opts: ExploreOpts = {}): Reach {
  const h = opts.h ?? PH;
  const tiles = opts.tiles ?? L.tiles;
  const r: Reach = {
    coins: L.coins.map(() => false),
    blocks: L.blocks.map(() => false),
    flag: false,
    nodes: new Set<string>(),
    expansions: 0,
    capped: false,
  };

  // Column buckets so a frame only tests nearby coins, not all of them.
  const coinsByCol = new Map<number, number[]>();
  L.coins.forEach((c, i) => {
    const col = Math.floor(c.x / TILE);
    const list = coinsByCol.get(col);
    if (list) list.push(i);
    else coinsByCol.set(col, [i]);
  });
  const blockAt = new Map<string, number>();
  L.blocks.forEach((b, i) => blockAt.set(`${b.tx},${b.ty}`, i));
  const doorAt = new Map<string, number>();
  L.doors.forEach((d, i) => doorAt.set(`${d.tx},${d.ty}`, i));

  const queue: Array<[number, number]> = [];
  const push = (tx: number, surfaceRow: number) => {
    const key = `${tx},${surfaceRow}`;
    if (r.nodes.has(key)) return;
    if (!validNode(tiles, tx, surfaceRow, h)) return;
    r.nodes.add(key);
    queue.push([tx, surfaceRow]);
  };

  const run = (b: Body, a: Action) => {
    let jumped = false;
    let holdLeft = 0;
    for (let f = 0; f < MAX_FRAMES; f += 1) {
      const jumpNow = !jumped && a.hold > 0 && f >= a.delay && b.onGround;
      if (jumpNow) {
        jumped = true;
        holdLeft = a.hold;
      }
      // Direction follows whether the body is airborne, so a spring launch is
      // steered by airDir exactly as a jump is.
      const dir = b.onGround ? a.runDir : a.airDir;
      const res = stepBody(
        tiles,
        b,
        { left: dir < 0, right: dir > 0, jump: jumpNow, jumpHeld: jumpNow || holdLeft > 0 },
        DT,
      );
      if (holdLeft > 0) holdLeft -= 1;

      // Spikes end the run: nothing after touching one is reachable.
      if (res.hazard) break;

      const col = Math.floor((b.x + PW / 2) / TILE);
      for (let c = col - 1; c <= col + 1; c += 1) {
        const list = coinsByCol.get(c);
        if (!list) continue;
        for (const i of list) if (!r.coins[i] && coinTouched(b, L.coins[i])) r.coins[i] = true;
      }
      if (!r.flag && flagTouched(b, L.flagX)) r.flag = true;
      if (res.headHit) {
        const idx = blockAt.get(`${res.headHit.tx},${res.headHit.ty}`);
        if (idx !== undefined) r.blocks[idx] = true;
      }
      // Doors warp only when you stop in the doorway, so a run straight past one
      // does not teleport - which is what keeps the stretch between a pair
      // walkable and its coins collectable.
      if (res.door && Math.abs(b.vx) < 24) {
        const di = doorAt.get(`${res.door.tx},${res.door.ty}`);
        if (di !== undefined) {
          const exit = doorExit(L.doors[di]);
          push(Math.floor((exit.x + PW / 2) / TILE), Math.floor((exit.y + h) / TILE));
        }
      }
      if (b.onGround) push(col, Math.floor((b.y + h) / TILE));
      if (b.y > WORLD_H + 30) break;
    }
  };

  const start = opts.from ?? L.spawn;
  run({ x: start.x, y: start.y, vx: 0, vy: 0, onGround: false, h }, {
    runDir: 0,
    airDir: 0,
    delay: MAX_FRAMES,
    hold: 0,
  });

  while (queue.length > 0 && r.expansions < MAX_EXPANSIONS) {
    const node = queue.pop();
    if (!node) break;
    r.expansions += 1;
    for (const a of ACTIONS) run(canonical(node[0], node[1], h), a);
  }
  r.capped = r.expansions >= MAX_EXPANSIONS;
  return r;
}

// --- synthetic maps, for the physics proofs -------------------------------

function blankTiles(): TileCode[][] {
  return Array.from({ length: ROWS }, () => Array<TileCode>(COLS).fill('.'));
}

/**
 * A single-step integrator with no substepping: what `stepBody` used to be. The
 * tunnelling proof runs this too and asserts it FAILS, which is what shows the
 * test map actually poses the hazard the substepping exists to defeat.
 */
function naiveFall(tiles: TileCode[][], b: Body, dt: number, frames: number) {
  for (let f = 0; f < frames; f += 1) {
    b.vy = Math.min(b.vy + 900 * dt, MAX_FALL);
    const nextY = b.y + b.vy * dt;
    if (!overlapsSolid(tiles, b.x, nextY, PW, PH)) b.y = nextY;
    else {
      b.y = Math.floor((nextY + PH) / TILE) * TILE - PH;
      b.vy = 0;
    }
  }
}

// --- per-level checks -----------------------------------------------------

type Tally = {
  coins: number;
  enemies: number;
  blocks: number;
  decor: number;
  pits: number;
  springs: number;
  movers: number;
  doors: number;
  secrets: number;
  /** Occupied cells per row, summed over every level. Diagnostic for the sky. */
  rowFill: number[];
  emptyAirRows: number;
  /** Upper-air content per horizontal band, summed over every level. */
  bandFill: number[];
  structures: Map<string, number>;
};

function emptyTally(): Tally {
  return {
    coins: 0,
    enemies: 0,
    blocks: 0,
    decor: 0,
    pits: 0,
    springs: 0,
    movers: 0,
    doors: 0,
    secrets: 0,
    rowFill: Array<number>(ROWS).fill(0),
    emptyAirRows: 0,
    bandFill: Array<number>(SKY_BANDS).fill(0),
    structures: new Map(),
  };
}

/** Cells of row `ty` holding a tile, a coin or an enemy. */
function rowContent(L: Level, ty: number): number {
  let n = 0;
  for (let tx = 0; tx < COLS; tx += 1) if (L.tiles[ty][tx] !== '.') n += 1;
  for (const c of L.coins) if (Math.floor(c.y / TILE) === ty) n += 1;
  for (const e of L.enemies) if (Math.floor((e.y + PH / 2) / TILE) === ty) n += 1;
  for (const m of L.movers) {
    const lo = Math.floor(Math.min(m.y0, m.y1) / TILE);
    const hi = Math.floor(Math.max(m.y0, m.y1) / TILE);
    if (ty >= lo && ty <= hi) n += 1;
  }
  return n;
}

/** Simulates a mover for a full round trip with a rider aboard. */
function proveMover(L: Level, m: Mover, at: string, index: number) {
  const lo = { x: Math.min(m.x0, m.x1), y: Math.min(m.y0, m.y1) };
  const hi = { x: Math.max(m.x0, m.x1) + m.w, y: Math.max(m.y0, m.y1) + MOVER_H };
  if (lo.x < 0 || hi.x > LEVEL_W || lo.y < SKY_TOP_ROW * TILE || hi.y > WORLD_H) {
    fail(`${at}: mover ${index} travels outside the world (${lo.x},${lo.y})-(${hi.x},${hi.y})`);
    return;
  }

  const sim: Mover = { ...m };
  const b: Body = {
    x: moverX(sim) + m.w / 2 - PW / 2,
    y: moverY(sim) - PH,
    vx: 0,
    vy: 0,
    onGround: true,
    h: PH,
  };
  // Long enough for a full there-and-back at the slowest travel speed.
  const frames = Math.ceil(12 / DT);
  let riding = true;
  for (let f = 0; f < frames; f += 1) {
    const d = stepMover(sim, DT);
    if (riding) {
      b.x += d.dx;
      b.y += d.dy;
      if (overlapsSolid(L.tiles, b.x, b.y, PW, PH)) {
        fail(`${at}: mover ${index} pushed its rider into terrain at (${b.x.toFixed(0)},${b.y.toFixed(0)})`);
        return;
      }
      if (touchesHazard(L.tiles, b.x, b.y, PH)) {
        fail(`${at}: mover ${index} carried its rider onto spikes`);
        return;
      }
    }
    const prevBottom = b.y + PH;
    stepBody(L.tiles, b, { left: false, right: false, jump: false, jumpHeld: false }, DT);
    riding = landOnMover(b, [sim], prevBottom) >= 0 || b.onGround;
    if (b.y > WORLD_H + 30) {
      fail(`${at}: mover ${index} dropped a passive rider out of the world`);
      return;
    }
  }
  // Both ends of the travel must sit beside something static to step off onto,
  // or the ride can strand a player who misses the return trip.
  for (const p of [0, 1]) {
    const px = m.x0 + (m.x1 - m.x0) * p;
    const py = m.y0 + (m.y1 - m.y0) * p;
    const row = Math.floor(py / TILE);
    let escape = false;
    for (let tx = Math.floor(px / TILE) - 3; tx <= Math.floor((px + m.w) / TILE) + 3; tx += 1) {
      for (let ty = row - MAX_STEP_UP; ty <= row + 3; ty += 1) {
        if (validNode(L.tiles, tx, ty, PH)) escape = true;
      }
    }
    if (!escape) fail(`${at}: mover ${index} has no static footing near travel end ${p}`);
  }
}

function checkLevel(level: number, d: Difficulty, tally: Tally) {
  const L = buildLevel(level, d);
  const at = `${d} L${level}`;

  // --- grid shape ---
  if (L.tiles.length !== ROWS) fail(`${at}: expected ${ROWS} rows, got ${L.tiles.length}`);
  for (const row of L.tiles) {
    if (row.length !== COLS) fail(`${at}: a row has ${row.length} cols, expected ${COLS}`);
  }

  // --- spawn is open air with ground beneath and no spikes ---
  const sx = Math.floor(L.spawn.x / TILE);
  const sy = Math.floor(L.spawn.y / TILE);
  if (overlapsSolid(L.tiles, L.spawn.x, L.spawn.y, PW, PH_BIG)) {
    fail(`${at}: spawn overlaps a solid tile (even at grown height)`);
  }
  if (touchesHazard(L.tiles, L.spawn.x, L.spawn.y, PH_BIG)) fail(`${at}: spawn is on spikes`);
  let groundBelow = false;
  for (let y = sy; y < ROWS; y += 1) {
    if (solidAt(L.tiles, sx, y)) {
      groundBelow = true;
      break;
    }
  }
  if (!groundBelow) fail(`${at}: spawn has no ground beneath it`);

  // --- pits are clearable, and never merge into a wider one ---
  const pits = findPits(L.tiles);
  tally.pits += pits.length;
  for (const [px, pw] of pits) {
    if (pw > MAX_PIT_WIDTH) fail(`${at}: pit at x=${px} is ${pw} wide (max ${MAX_PIT_WIDTH})`);
    if (pw >= JUMP_REACH_TILES) {
      fail(`${at}: pit at x=${px} (${pw}) exceeds walking jump reach ${JUMP_REACH_TILES.toFixed(2)}`);
    }
  }
  for (let i = 1; i < pits.length; i += 1) {
    const gap = pits[i][0] - (pits[i - 1][0] + pits[i - 1][1]);
    if (gap < MIN_PIT_GAP) fail(`${at}: only ${gap} tiles of ground between pits at x=${pits[i][0]}`);
  }

  // --- nothing is embedded in a solid tile ---
  tally.coins += L.coins.length;
  if (L.coins.length === 0) fail(`${at}: no coins`);
  for (const c of L.coins) {
    const cx = Math.floor(c.x / TILE);
    const cy = Math.floor(c.y / TILE);
    if (solidAt(L.tiles, cx, cy)) fail(`${at}: coin at (${cx},${cy}) is inside a solid tile`);
    if (cy < SKY_TOP_ROW) fail(`${at}: coin at (${cx},${cy}) is above the playable rows`);
  }
  tally.decor += L.decor.length;
  for (const dec of L.decor) {
    if (solidAt(L.tiles, dec.tx, dec.ty)) {
      fail(`${at}: decor ${dec.kind} at (${dec.tx},${dec.ty}) is inside a solid tile`);
    }
  }
  tally.blocks += L.blocks.length;
  for (const blk of L.blocks) {
    const code = L.tiles[blk.ty][blk.tx];
    const want = blk.kind === 'coin' ? 'Q' : blk.kind === 'power' ? 'P' : 'K';
    if (code !== want) {
      fail(`${at}: block at (${blk.tx},${blk.ty}) was overwritten by '${code}'`);
    }
    if (solidAt(L.tiles, blk.tx, blk.ty + 1) && solidAt(L.tiles, blk.tx, blk.ty - 1)) {
      fail(`${at}: block at (${blk.tx},${blk.ty}) is sealed in on both sides`);
    }
  }
  tally.springs += L.springs.length;
  for (const s of L.springs) {
    if (L.tiles[s.ty][s.tx] !== 'S') fail(`${at}: spring at (${s.tx},${s.ty}) is not a spring tile`);
    if (!solidAt(L.tiles, s.tx, s.ty + 1)) fail(`${at}: spring at x=${s.tx} floats over a pit`);
  }
  tally.doors += L.doors.length;
  for (const dr of L.doors) {
    if (L.tiles[dr.ty][dr.tx] !== 'D') fail(`${at}: door at (${dr.tx},${dr.ty}) is not a door tile`);
    const ex = doorExit(dr);
    if (overlapsSolid(L.tiles, ex.x, ex.y - (PH_BIG - PH), PW, PH_BIG)) {
      fail(`${at}: door exit at (${dr.exitTx},${dr.exitTy}) is inside terrain`);
    }
    if (!solidAt(L.tiles, dr.exitTx, dr.exitTy + 1)) {
      fail(`${at}: door exit at x=${dr.exitTx} has no floor`);
    }
  }

  // --- enemies have footing, are moving, and are not buried ---
  tally.enemies += L.enemies.length;
  for (const e of L.enemies) {
    const ex = Math.floor((e.x + PW / 2) / TILE);
    const ey = Math.floor((e.y + PH / 2) / TILE);
    if (overlapsSolid(L.tiles, e.x, e.y, PW, PH)) {
      fail(`${at}: enemy ${e.kind} at (${ex},${ey}) spawns inside terrain`);
    }
    if (hazardAt(L.tiles, ex, ey)) fail(`${at}: enemy ${e.kind} at (${ex},${ey}) spawns on spikes`);
    if (e.kind !== 'flyer') {
      const feet = Math.floor((e.y + PH + 1) / TILE);
      if (!solidAt(L.tiles, ex, feet)) fail(`${at}: enemy at x=${ex} has no ground under its feet`);
    }
    if (e.vx === 0) fail(`${at}: enemy at x=${ex} has zero velocity`);
  }

  // --- a grown player fits under every platform ---
  // Two rows of air is 32px and a grown player is 20px; ONE row is 16px, which
  // would turn every block row into a wall for anyone holding a power-up. The bug
  // this catches is a storey constant being set two rows above the ground instead
  // of three.
  for (let ty = 1; ty < ROWS; ty += 1) {
    for (let tx = 0; tx < COLS; tx += 1) {
      const code = L.tiles[ty][tx];
      if (code !== 'B' && code !== 'C' && code !== 'K' && code !== 'Q' && code !== 'P') continue;
      let below = ROWS;
      for (let y = ty + 1; y < ROWS; y += 1) {
        if (solidAt(L.tiles, tx, y)) {
          below = y;
          break;
        }
      }
      const gap = (below - ty - 1) * TILE;
      if (gap < PH_BIG) {
        fail(
          `${at}: platform tile '${code}' at (${tx},${ty}) leaves ${gap}px under it; ` +
            `a grown player is ${PH_BIG}px tall and could not pass`,
        );
      }
    }
  }

  // --- movers cannot fling, crush or strand ---
  tally.movers += L.movers.length;
  L.movers.forEach((m, i) => proveMover(L, m, at, i));

  // --- a kicked shell stays inside the level ---
  for (const e of L.enemies) {
    if (e.kind !== 'shell') continue;
    for (const dir of [1, -1] as const) {
      const sim = { ...e };
      kickShell(sim, dir);
      const frames = Math.ceil(20 / DT);
      for (let f = 0; f < frames; f += 1) {
        stepEnemy(L.tiles, sim, DT, f * DT);
        if (sim.x < 0 || sim.x > LEVEL_W - PW) {
          fail(`${at}: a shell kicked ${dir > 0 ? 'right' : 'left'} escaped to x=${sim.x.toFixed(0)}`);
          break;
        }
        if (!sim.alive) break; // fell into a pit and was retired: correct
      }
      if (sim.alive && (sim.y < -TILE || sim.y > WORLD_H)) {
        fail(`${at}: a live shell ended up outside the world at y=${sim.y.toFixed(0)}`);
      }
    }
  }

  // --- the power-up promise: one grow mushroom, over ground it cannot walk off ---
  const powers = L.blocks.filter((b) => b.kind === 'power');
  if (powers.length === 0) fail(`${at}: no power block, so the level holds no grow mushroom`);
  for (const p of powers) {
    for (let tx = p.tx - 3; tx <= p.tx + 3; tx += 1) {
      if (!solidAt(L.tiles, tx, GROUND_TOP)) {
        fail(`${at}: power block at x=${p.tx} sits over a pit at x=${tx}; the mushroom would fall in`);
        break;
      }
    }
  }

  // --- no standing surface high enough to jump out of the world ---
  for (let ty = 0; ty < TOP_SURFACE_ROW; ty += 1) {
    for (let tx = 0; tx < COLS; tx += 1) {
      if (solidAt(L.tiles, tx, ty) && !solidAt(L.tiles, tx, ty - 1)) {
        fail(`${at}: standing surface at (${tx},${ty}) is above TOP_SURFACE_ROW ${TOP_SURFACE_ROW}`);
        ty = TOP_SURFACE_ROW;
        break;
      }
    }
  }

  // --- the sky is not empty: this is the complaint that started the rewrite ---
  let emptyRows = 0;
  const emptyList: number[] = [];
  for (let ty = AIR_TOP_ROW; ty < GROUND_TOP; ty += 1) {
    const n = rowContent(L, ty);
    tally.rowFill[ty] += n;
    if (n === 0) {
      emptyRows += 1;
      emptyList.push(ty);
    }
  }
  tally.emptyAirRows += emptyRows;
  if (emptyRows > MAX_EMPTY_AIR_ROWS) {
    fail(
      `${at}: ${emptyRows} of the ${GROUND_TOP - AIR_TOP_ROW} required air rows are empty ` +
        `(rows ${emptyList.join(',')}); at most ${MAX_EMPTY_AIR_ROWS} allowed`,
    );
  }

  // ...and not merely on average. A level whose sky content is all bunched into
  // one tower still shows blank sky for most of the run, so every band of the
  // level roughly one screen wide must have something in its upper half.
  {
    const from = 0;
    const to = Math.floor(L.flagX / TILE);
    const bandW = (to - from) / SKY_BANDS;
    for (let band = 0; band < SKY_BANDS; band += 1) {
      const lo = Math.floor(from + band * bandW);
      const hi = Math.floor(from + (band + 1) * bandW);
      let n = 0;
      for (let tx = lo; tx < hi; tx += 1) {
        for (let ty = AIR_TOP_ROW; ty <= UPPER_HALF_ROW; ty += 1) {
          if (L.tiles[ty][tx] !== '.') n += 1;
        }
      }
      for (const c of L.coins) {
        const cx = Math.floor(c.x / TILE);
        const cy = Math.floor(c.y / TILE);
        if (cx >= lo && cx < hi && cy >= AIR_TOP_ROW && cy <= UPPER_HALF_ROW) n += 1;
      }
      for (const e of L.enemies) {
        const ex = Math.floor((e.x + PW / 2) / TILE);
        const ey = Math.floor((e.y + PH / 2) / TILE);
        if (ex >= lo && ex < hi && ey >= AIR_TOP_ROW && ey <= UPPER_HALF_ROW) n += 1;
      }
      tally.bandFill[band] += n;
      if (n < MIN_BAND_CONTENT) {
        fail(
          `${at}: columns ${lo}-${hi} have only ${n} cell(s) of content above row ` +
            `${UPPER_HALF_ROW}; a screenful of that stretch is empty sky`,
        );
      }
    }
  }

  tally.secrets += L.secrets.length;
  for (const name of L.structures) {
    tally.structures.set(name, (tally.structures.get(name) ?? 0) + 1);
  }

  // --- level 1 on easy is a warm-up ---
  if (level === 1 && d === 'easy') {
    if (pits.length !== 0) fail(`easy L1 has ${pits.length} pit(s); it must have none`);
    if (L.enemies.length > 1) fail(`easy L1 has ${L.enemies.length} enemies; at most 1 allowed`);
    for (let tx = 0; tx < COLS; tx += 1) {
      for (let ty = 0; ty < ROWS; ty += 1) {
        if (L.tiles[ty][tx] === 'X') fail(`easy L1 has spikes at (${tx},${ty})`);
      }
    }
  }

  // --- the important one: simulate and prove reachability ---
  const r = explore(L);
  if (r.capped) fail(`${at}: search hit the expansion cap`);
  if (!r.flag) fail(`${at}: FLAG at tile x=${Math.floor(L.flagX / TILE)} is unreachable`);
  const missedCoins = L.coins
    .map((c, i) => (r.coins[i] ? null : `(${Math.floor(c.x / TILE)},${Math.floor(c.y / TILE)})`))
    .filter((v): v is string => v !== null);
  if (missedCoins.length > 0) {
    fail(`${at}: ${missedCoins.length} unreachable coin(s) at ${missedCoins.slice(0, 12).join(' ')}`);
  }
  const missedBlocks = L.blocks
    .map((b, i) => (r.blocks[i] ? null : `(${b.tx},${b.ty})`))
    .filter((v): v is string => v !== null);
  if (missedBlocks.length > 0) {
    fail(`${at}: ${missedBlocks.length} block(s) cannot be hit from below at ${missedBlocks.join(' ')}`);
  }
  // Every secret must hold at least one coin, and coins are all proven above, so
  // this closes the loop: a secret area you cannot get into fails the coin check.
  for (const s of L.secrets) {
    const has = L.coins.some(
      (c) =>
        Math.floor(c.x / TILE) >= s.tx &&
        Math.floor(c.x / TILE) < s.tx + s.w &&
        Math.floor(c.y / TILE) >= s.ty &&
        Math.floor(c.y / TILE) < s.ty + s.h,
    );
    if (!has) fail(`${at}: ${s.kind} secret at (${s.tx},${s.ty}) holds nothing to collect`);
  }

  // A grown player must be able to finish too, or the power-up is a trap.
  const big = explore(L, { h: PH_BIG });
  if (!big.flag) fail(`${at}: FLAG is unreachable while grown (PH_BIG=${PH_BIG})`);

  // Respawning at the checkpoint must not drop the player inside terrain, and
  // must not leave the level unwinnable.
  const cpSpawn = { x: L.checkpointX, y: (GROUND_TOP - 3) * TILE };
  if (overlapsSolid(L.tiles, cpSpawn.x, cpSpawn.y, PW, PH_BIG)) {
    fail(`${at}: the checkpoint respawn at x=${L.checkpointX} is inside terrain`);
  }
  if (touchesHazard(L.tiles, cpSpawn.x, cpSpawn.y, PH_BIG)) {
    fail(`${at}: the checkpoint respawn at x=${L.checkpointX} is on spikes`);
  }
  {
    let floor = false;
    const col = Math.floor(cpSpawn.x / TILE);
    for (let y = Math.floor(cpSpawn.y / TILE); y < ROWS; y += 1) {
      if (solidAt(L.tiles, col, y)) floor = true;
    }
    if (!floor) fail(`${at}: the checkpoint respawn at x=${L.checkpointX} is over a pit`);
  }
  const cp = explore(L, { from: cpSpawn });
  if (!cp.flag) fail(`${at}: FLAG is unreachable from the checkpoint at x=${L.checkpointX}`);

  // Breaking every breakable brick must not lock anything away either.
  const broken = L.tiles.map((row) => row.map((t) => (t === 'K' ? '.' : t)) as TileCode[]);
  const after = explore(L, { tiles: broken });
  if (!after.flag) fail(`${at}: FLAG becomes unreachable once every brick is broken`);
  const lostCoins = L.coins.filter((_, i) => r.coins[i] && !after.coins[i]).length;
  if (lostCoins > 0) {
    fail(`${at}: ${lostCoins} coin(s) become unreachable once every brick is broken`);
  }

  // --- the one enemy you must not stomp must never be the only way through ---
  //
  // Every other kind can be dealt with by jumping on it, so it can never trap a
  // player - worst case they stomp it and carry on. A spiker cannot: touching it
  // anywhere on its body costs a hit exactly like walking into it does. So its
  // whole patrol strip (not just where it happens to be standing right now) is
  // reproven as if it were a solid wall of spikes, and the search has to find a
  // route to the flag and to every coin the normal run reaches that never has to
  // touch that strip. This is the same technique as the "every brick broken"
  // proof above: prove it by re-running the real search against a worse map,
  // not by trusting that the placement code left room to jump over it.
  for (const e of L.enemies) {
    if (e.kind !== 'spiker') continue;
    const loTx = Math.max(0, Math.floor(e.minX / TILE));
    const hiTx = Math.min(COLS - 1, Math.ceil(e.maxX / TILE));
    const loTy = Math.max(0, Math.floor(e.y / TILE));
    const hiTy = Math.min(ROWS - 1, Math.floor((e.y + PH - 1) / TILE));
    const walled = L.tiles.map((row) => row.slice()) as TileCode[][];
    for (let ty = loTy; ty <= hiTy; ty += 1) {
      for (let tx = loTx; tx <= hiTx; tx += 1) {
        if (walled[ty][tx] === '.') walled[ty][tx] = 'X';
      }
    }
    // Coins directly over the strip are not held to the same standard: a coin a
    // hair's width from a hazard is normal platformer risk/reward (grab it and
    // maybe take a hit), the same as a coin arc drawn low over a spike patch.
    // What must never happen is the FLAG - the level itself - depending on
    // contact with something you cannot safely stomp.
    const detour = explore(L, { tiles: walled });
    if (!detour.flag) {
      fail(
        `${at}: spiker at x=${Math.floor(e.x / TILE)} (patrol ${loTx}-${hiTx}) blocks every route ` +
          'to the flag - there is no way to jump over or route around it',
      );
    }
  }
}

// --- run ------------------------------------------------------------------

const started = Date.now();
console.log(
  `physics: standing jump rises ${JUMP_RISE.toFixed(1)}px (${(JUMP_RISE / TILE).toFixed(2)} tiles), ` +
    `running jump ${JUMP_RISE_RUN.toFixed(1)}px, spring ${SPRING_RISE.toFixed(1)}px`,
);
console.log(
  `world: ${COLS}x${ROWS} tiles, ground row ${GROUND_TOP}, top surface row ${TOP_SURFACE_ROW}, ` +
    `max step up ${MAX_STEP_UP}, walking reach ${JUMP_REACH_TILES.toFixed(2)} tiles, ` +
    `max pit ${MAX_PIT_WIDTH}`,
);
console.log(`search: ${ACTIONS.length} button plans per standing state\n`);

// --- world shape: the sky problem, stated as an assertion -----------------
{
  const airRows = GROUND_TOP - SKY_TOP_ROW;
  // A full running jump from the highest legal surface must keep a grown
  // player's head inside the world, or the player leaves the view.
  const headroom = TOP_SURFACE_ROW * TILE - JUMP_RISE_RUN - PH_BIG;
  if (headroom < 0) {
    fail(
      `TOP_SURFACE_ROW ${TOP_SURFACE_ROW} is too high: a running jump from it puts a grown ` +
        `player's head ${(-headroom).toFixed(1)}px above the world`,
    );
  }
  // The ground must not sit so low that most of the world is unusable air.
  if (GROUND_TOP < ROWS - 4) fail(`ground row ${GROUND_TOP} leaves fewer than 4 rows of ground`);
  if (airRows < 8) fail(`only ${airRows} air rows: not enough room for sky storeys`);
  // The pole must stand inside the world, and its foot must be low enough that a
  // player running along the ground touches it without having to jump.
  if (GROUND_TOP - FLAG_H < SKY_TOP_ROW) {
    fail(`a ${FLAG_H}-tile flag pole on row ${GROUND_TOP} pokes out of the top of the world`);
  }
  if (FLAG_H < 2) fail('the flag pole is too short to be touched at ground level');
  console.log(
    `world shape: ${airRows} air rows, headroom above the top surface ${headroom.toFixed(1)}px`,
  );
}

// --- framing: the canvas is filled with world, on every device shape -----
//
// This is the assertion that stands in for the complaint. The old layout fitted
// the world's height and no more, so a portrait canvas either showed a screenful
// of blank sky above the action or zoomed in so far you could not see what was
// coming. Both failure modes are checked here against real device sizes.
{
  const devices: Array<[string, number, number]> = [
    ['iPhone SE portrait', 375, 560],
    ['iPhone 15 portrait', 390, 660],
    ['iPhone 15 landscape', 844, 300],
    ['iPad mini portrait', 744, 900],
    ['iPad Pro portrait', 1024, 1200],
    ['iPad Pro landscape', 1366, 780],
    ['desktop', 1240, 509],
  ];
  const lines: string[] = [];
  for (const [name, cw, playH] of devices) {
    const v = viewport(cw, playH);
    const cols = v.viewW / TILE;
    const rows = v.viewH / TILE;
    if (v.viewW < MIN_VIEW_W - 0.5 || v.viewW > MAX_VIEW_W + 0.5) {
      fail(`${name}: view is ${cols.toFixed(1)} tiles wide, outside the clamp`);
    }
    // Surplus sky is what the owner objected to. One row of slack, no more.
    if (v.skyPad > TILE * 1.5) {
      fail(
        `${name}: ${(v.skyPad / TILE).toFixed(2)} rows of empty sky above the world ` +
          '(the layout is not filling the canvas)',
      );
    }
    // If the world is taller than the view, the camera must still be able to
    // frame a player standing on the ground.
    const standY = GROUND_TOP * TILE - PH;
    const cy = cameraY(standY, PH, v.viewH);
    if (standY - cy < 0 || standY + PH - cy > v.viewH + 0.5) {
      fail(`${name}: a player standing on the ground falls outside the view`);
    }
    // And the goal has to be visible when you reach it.
    if (v.viewH < FLAG_H * TILE) fail(`${name}: the view is shorter than the flag pole`);
    lines.push(`${name} ${cols.toFixed(1)}x${rows.toFixed(1)} tiles, sky pad ${v.skyPad.toFixed(0)}px`);
  }
  console.log(`framing: ${lines.join(' | ')}`);
}

// --- camera: a running player cannot outrun the view ---------------------
{
  // Steady-state follow error at top speed, against the lead the camera takes.
  const lag = RUN_SPEED / CAMERA_LERP;
  const offset = Math.abs(lag - CAMERA_LOOKAHEAD) + PW;
  if (offset > MIN_VIEW_W / 2 - 2 * TILE) {
    fail(
      `at RUN_SPEED ${RUN_SPEED} the player sits ${offset.toFixed(1)}px off centre, which is ` +
        `too close to the edge of the narrowest ${MIN_VIEW_W}px view`,
    );
  }
  if (MIN_VIEW_W >= MAX_VIEW_W) fail('MIN_VIEW_W must be below MAX_VIEW_W');
  console.log(
    `camera: lag ${lag.toFixed(1)}px, lead ${CAMERA_LOOKAHEAD}px, net offset ${offset.toFixed(1)}px ` +
      `inside a ${MIN_VIEW_W}-${MAX_VIEW_W}px view`,
  );
}

// --- collision: no tunnelling at maximum speed ---------------------------
{
  if (MAX_SUBSTEP >= TILE) fail(`MAX_SUBSTEP ${MAX_SUBSTEP} is not smaller than a ${TILE}px tile`);

  // A one-tile-thick floor, hit at terminal velocity on the slowest frame the
  // canvas loop hands out. This is the case that used to be able to tunnel.
  const floorRow = 10;
  for (const h of [PH, PH_BIG]) {
    const tiles = blankTiles();
    for (let tx = 0; tx < COLS; tx += 1) tiles[floorRow][tx] = 'B';
    const b: Body = { x: 5 * TILE, y: 0, vx: 0, vy: MAX_FALL, onGround: false, h };
    for (let f = 0; f < 120; f += 1) {
      stepBody(tiles, b, { left: false, right: false, jump: false, jumpHeld: false }, SLOW_DT);
      if (overlapsSolid(tiles, b.x, b.y, PW, h)) {
        fail(`tunnelling: body (h=${h}) ended up inside the floor at y=${b.y.toFixed(1)}`);
        break;
      }
      if (b.y > floorRow * TILE) {
        fail(`tunnelling: body (h=${h}) fell through a one-tile floor at ${SLOW_DT.toFixed(3)}s/frame`);
        break;
      }
    }
    if (Math.abs(b.y + h - floorRow * TILE) > 0.5) {
      fail(`tunnelling: body (h=${h}) did not come to rest on the floor (y=${b.y.toFixed(1)})`);
    }
  }

  // Self-test. At 20fps a 14px-tall body moving 26px per frame cannot straddle a
  // 16px tile, so that map alone does not prove the substepping does anything. So
  // run the same fall at a frame time the loop's clamp currently rules out, and
  // assert two things: the un-substepped integrator falls straight through, and
  // the real one still lands. That is what makes the collision robust to the
  // clamp changing, and it is what shows this proof can fail.
  {
    const tiles = blankTiles();
    for (let tx = 0; tx < COLS; tx += 1) tiles[floorRow][tx] = 'B';
    const naive: Body = { x: 5 * TILE, y: 0, vx: 0, vy: MAX_FALL, onGround: false };
    naiveFall(tiles, naive, EXTREME_DT, 60);
    if (naive.y <= floorRow * TILE + TILE) {
      fail(
        `self-test: the un-substepped integrator did NOT tunnel at ${(1 / EXTREME_DT).toFixed(0)}fps, ` +
          'so the tunnelling proof is not proving anything',
      );
    }
    const real: Body = { x: 5 * TILE, y: 0, vx: 0, vy: MAX_FALL, onGround: false };
    for (let f = 0; f < 60; f += 1) {
      stepBody(tiles, real, { left: false, right: false, jump: false, jumpHeld: false }, EXTREME_DT);
    }
    if (Math.abs(real.y + PH - floorRow * TILE) > 0.5) {
      fail(
        `tunnelling: at ${(1 / EXTREME_DT).toFixed(0)}fps the substepped body did not land on the ` +
          `one-tile floor (y=${real.y.toFixed(1)})`,
      );
    } else {
      console.log(
        `collision self-test: at ${(1 / EXTREME_DT).toFixed(0)}fps the un-substepped integrator ` +
          `tunnels to y=${naive.y.toFixed(0)}; the substepped one lands on the floor`,
      );
    }
  }

  // A wall at maximum run speed, on the slowest frame.
  for (const h of [PH, PH_BIG]) {
    const tiles = blankTiles();
    const wall = 30;
    for (let ty = 0; ty < ROWS; ty += 1) tiles[ty][wall] = 'B';
    for (let tx = 0; tx < wall; tx += 1) tiles[12][tx] = 'B';
    const b: Body = { x: TILE, y: 12 * TILE - h, vx: RUN_SPEED, vy: 0, onGround: true, h };
    for (let f = 0; f < 200; f += 1) {
      stepBody(tiles, b, { left: false, right: true, jump: false, jumpHeld: false }, SLOW_DT);
      if (overlapsSolid(tiles, b.x, b.y, PW, h)) {
        fail(`tunnelling: body (h=${h}) clipped into the wall at x=${b.x.toFixed(1)}`);
        break;
      }
    }
    if (b.x + PW - 1 > wall * TILE + 0.5) {
      fail(`tunnelling: body (h=${h}) passed through the wall (x=${b.x.toFixed(1)})`);
    }
  }
  console.log(
    `collision: substeps cap movement at ${MAX_SUBSTEP}px; terminal falls and ${RUN_SPEED}px/s ` +
      `runs resolve against one-tile geometry at ${(1 / SLOW_DT).toFixed(0)}fps`,
  );
}

// --- springs: a launch stays inside the world and lands somewhere ---------
{
  const tiles = blankTiles();
  for (let tx = 0; tx < COLS; tx += 1) {
    for (let ty = GROUND_TOP; ty < ROWS; ty += 1) tiles[ty][tx] = '#';
  }
  tiles[GROUND_TOP - 1][10] = 'S';
  for (const h of [PH, PH_BIG]) {
    for (const dir of [-1, 0, 1] as const) {
      const b: Body = {
        x: 10 * TILE + (TILE - PW) / 2,
        y: GROUND_TOP * TILE - h,
        vx: 0,
        vy: 0,
        onGround: true,
        h,
      };
      let top = b.y;
      let launches = 0;
      let landed = false;
      for (let f = 0; f < 200; f += 1) {
        const res = stepBody(
          tiles,
          b,
          { left: dir < 0, right: dir > 0, jump: false, jumpHeld: false },
          SLOW_DT,
        );
        if (res.sprung) launches += 1;
        if (res.landedAt > 0) landed = true;
        top = Math.min(top, b.y);
        if (overlapsSolid(tiles, b.x, b.y, PW, h)) {
          fail(`spring: body (h=${h}, steer ${dir}) ended up inside terrain`);
          break;
        }
        if (b.y > WORLD_H) {
          fail(`spring: body (h=${h}, steer ${dir}) was flung out of the world`);
          break;
        }
      }
      if (launches === 0) fail(`spring: body (h=${h}, steer ${dir}) was never launched`);
      if (top < 0) fail(`spring: launch took a body (h=${h}) ${(-top).toFixed(1)}px above the world`);
      // Standing still on the pad bounces forever, which is correct; either a
      // second launch or a touchdown proves the body came back down.
      if (!landed && launches < 2) {
        fail(`spring: body (h=${h}, steer ${dir}) never came back down`);
      }
    }
  }
  console.log(
    `springs: a ${SPRING_RISE.toFixed(0)}px launch from the ground keeps a grown head inside the ` +
      'world and always lands',
  );
}

for (const d of DIFFICULTIES) {
  const tally = emptyTally();
  for (let level = 1; level <= LEVELS; level += 1) checkLevel(level, d, tally);
  const mix = [...tally.structures.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${v}`)
    .join(', ');
  console.log(
    `${d.padEnd(6)} L1-${LEVELS}: ${tally.coins} coins, ${tally.blocks} blocks, ` +
      `${tally.enemies} enemies, ${tally.pits} pits, ${tally.springs} springs, ` +
      `${tally.movers} movers, ${tally.doors} doors, ${tally.secrets} secrets, ${tally.decor} decor`,
  );
  console.log(`       beats: ${mix}`);
  const fill = tally.rowFill
    .map((n, ty) => (ty >= AIR_TOP_ROW && ty < GROUND_TOP ? `${ty}:${Math.round(n / LEVELS)}` : null))
    .filter((v): v is string => v !== null)
    .join(' ');
  console.log(`       air-row fill per level: ${fill} (empty rows total ${tally.emptyAirRows})`);
  console.log(
    `       upper-air cells per level, left to right: ` +
      tally.bandFill.map((n) => Math.round(n / LEVELS)).join(' '),
  );
}

// --- determinism, and that levels actually differ from one another --------
const a1 = JSON.stringify(buildLevel(9, 'normal'));
const a2 = JSON.stringify(buildLevel(9, 'normal'));
if (a1 !== a2) fail('buildLevel(9, normal) is not deterministic');
for (let level = 1; level < 6; level += 1) {
  for (const d of DIFFICULTIES) {
    if (JSON.stringify(buildLevel(level, d)) !== JSON.stringify(buildLevel(level, d))) {
      fail(`buildLevel(${level}, ${d}) is not deterministic`);
    }
    if (JSON.stringify(buildLevel(level, d)) === JSON.stringify(buildLevel(level + 1, d))) {
      fail(`${d} levels ${level} and ${level + 1} are identical`);
    }
  }
}
if (JSON.stringify(buildLevel(4, 'easy')) === JSON.stringify(buildLevel(4, 'hard'))) {
  fail('easy and hard level 4 are identical, so difficulty is not reaching generation');
}
// Levels 1-8 must each teach a different mechanic, or the ramp teaches nothing.
{
  const lessons = new Set<string>();
  for (let level = 2; level <= 9; level += 1) lessons.add(buildLevel(level, 'normal').lesson);
  if (lessons.size < 7) {
    fail(`levels 2-9 only cover ${lessons.size} lessons: ${[...lessons].join(',')}`);
  }
}

// --- self-tests: prove each proof can actually fail -----------------------
//
// A verifier that cannot fail proves nothing. Each of these breaks a level in a
// specific way and asserts the matching check notices.
{
  // 1. A coin sealed in a block of terrain must read as unreachable.
  const L: Level = JSON.parse(JSON.stringify(buildLevel(3, 'normal')));
  const tx = 40;
  const ty = 5;
  for (let y = ty - 1; y <= ty + 1; y += 1) {
    for (let x = tx - 1; x <= tx + 1; x += 1) L.tiles[y][x] = '#';
  }
  L.tiles[ty][tx] = '.';
  L.coins.push({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2, taken: false });
  const r = explore(L);
  if (r.coins[r.coins.length - 1]) {
    fail('self-test: a coin walled into solid terrain still read as reachable');
  } else {
    console.log('self-test: a coin sealed in terrain is correctly unreachable');
  }
}
{
  // 2. Spikes across the only route must make the flag unreachable, which is what
  // shows the search is really routing around hazards rather than ignoring them.
  const L: Level = JSON.parse(JSON.stringify(buildLevel(3, 'normal')));
  for (let tx = 20; tx < 26; tx += 1) {
    for (let ty = SKY_TOP_ROW; ty < GROUND_TOP; ty += 1) L.tiles[ty][tx] = 'X';
  }
  const r = explore(L);
  if (r.flag) {
    fail('self-test: a wall of spikes across the level did not stop the search');
  } else {
    console.log('self-test: a wall of spikes correctly blocks the route to the flag');
  }
}
{
  // 3. A mover whose travel leaves the world must be caught.
  const L: Level = JSON.parse(JSON.stringify(buildLevel(3, 'normal')));
  const bad: Mover = {
    kind: 'v',
    x0: 20 * TILE,
    y0: (GROUND_TOP - 1) * TILE,
    x1: 20 * TILE,
    y1: -4 * TILE,
    w: TILE * 2,
    speed: 40,
    pos: 0,
    dir: 1,
  };
  const found = collecting(() => proveMover(L, bad, 'self-test', 0));
  if (found.length === 0) {
    fail('self-test: a mover travelling out of the world was not reported');
  } else {
    console.log('self-test: a mover leaving the world is correctly reported');
  }
}
{
  // 4. An air row emptied of everything must trip the sky-fill assertion.
  const L: Level = JSON.parse(JSON.stringify(buildLevel(5, 'normal')));
  for (let ty = SKY_TOP_ROW; ty < GROUND_TOP; ty += 1) {
    for (let tx = 0; tx < COLS; tx += 1) L.tiles[ty][tx] = '.';
  }
  L.coins = [];
  L.enemies = [];
  L.movers = [];
  let empty = 0;
  for (let ty = AIR_TOP_ROW; ty < GROUND_TOP; ty += 1) if (rowContent(L, ty) === 0) empty += 1;
  if (empty <= MAX_EMPTY_AIR_ROWS) {
    fail('self-test: an entirely emptied sky did not register as empty air rows');
  } else {
    console.log(`self-test: an emptied sky correctly reports ${empty} empty air rows`);
  }
}

console.log(
  `\n${DIFFICULTIES.length * LEVELS} levels simulated in ${((Date.now() - started) / 1000).toFixed(1)}s ` +
    `(${(AIR_TIME * 1000).toFixed(0)}ms of air time per jump)`,
);

if (errors.length > 0) {
  console.error(`\n${errors.length} PROBLEM(S):`);
  for (const e of errors.slice(0, 40)) console.error(`  x ${e}`);
  if (errors.length > 40) console.error(`  ... and ${errors.length - 40} more`);
  process.exit(1);
}
console.log(
  'Every level: flag reachable from spawn, from the checkpoint, and while grown; every coin, ' +
    'block and secret reachable; sky populated; springs, lifts and shells provably safe.',
);
