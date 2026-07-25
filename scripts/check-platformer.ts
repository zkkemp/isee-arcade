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
 * integrator (`stepBody`, the same function the game calls) over a search of
 * reachable player states and asserts the flag and every coin are actually
 * touched. The search is deliberately conservative: it only ever expands from
 * states it has physically simulated its way into, and it re-verifies each
 * standing state is collision-free before treating it as reachable, so it can
 * under-report reachability but never over-report it.
 *
 * Run: npx tsx scripts/check-platformer.ts
 */
import {
  COLS,
  GROUND_TOP,
  JUMP_REACH_TILES,
  JUMP_RISE,
  MAX_PIT_WIDTH,
  MAX_STEP_UP,
  MIN_PIT_GAP,
  PH,
  PW,
  ROWS,
  TILE,
  WORLD_H,
  buildLevel,
  coinTouched,
  findPits,
  flagTouched,
  overlapsSolid,
  solidAt,
  stepBody,
  type Body,
  type Level,
} from '../lib/platformerLevel';
import { DIFFICULTIES, type Difficulty } from '../lib/difficulty';

const LEVELS = 25;
const DT = 1 / 60;
/** Frames simulated per action. A full jump plus its fall is about 50. */
const MAX_FRAMES = 110;
/** Safety valve: a runaway search is a bug in this file, not in the level. */
const MAX_EXPANSIONS = 4000;

const errors: string[] = [];
const fail = (msg: string) => errors.push(msg);

// --- reachability search --------------------------------------------------

/**
 * One button plan: run in `runDir` for `delay` frames, jump, hold the button for
 * `hold` frames, and steer `airDir` in the air. `hold: 0` never jumps at all,
 * which is how walking and falling off ledges get covered.
 */
type Action = { runDir: -1 | 0 | 1; airDir: -1 | 0 | 1; delay: number; hold: number };

const DIRS: Array<-1 | 0 | 1> = [-1, 0, 1];
const ACTIONS: Action[] = [];
for (const runDir of DIRS) {
  if (runDir !== 0) ACTIONS.push({ runDir, airDir: runDir, delay: MAX_FRAMES, hold: 0 });
  for (const airDir of DIRS) {
    // A run-up only matters if there is a run direction to build speed in.
    for (const delay of runDir === 0 ? [0] : [0, 20]) {
      for (const hold of [4, 12, 30, 60]) ACTIONS.push({ runDir, airDir, delay, hold });
    }
  }
}

type Reach = {
  coins: boolean[];
  blocks: boolean[];
  flag: boolean;
  nodes: Set<string>;
  expansions: number;
};

/**
 * Canonical standing state for a column: centred on the tile, feet on top of
 * `surfaceRow`. Landing anywhere in a column can be walked to this position
 * (the offset is under 6px and a 16px tile cannot fit inside that gap), so
 * collapsing landings onto it keeps the search finite without cheating.
 */
function canonical(tx: number, surfaceRow: number): Body {
  return {
    x: tx * TILE + (TILE - PW) / 2,
    y: surfaceRow * TILE - PH,
    vx: 0,
    vy: 0,
    onGround: true,
  };
}

function validNode(L: Level, tx: number, surfaceRow: number): boolean {
  if (tx < 0 || tx >= COLS || surfaceRow < 1 || surfaceRow >= ROWS) return false;
  if (!solidAt(L.tiles, tx, surfaceRow)) return false;
  const b = canonical(tx, surfaceRow);
  return !overlapsSolid(L.tiles, b.x, b.y, PW, PH);
}

function explore(L: Level): Reach {
  const r: Reach = {
    coins: L.coins.map(() => false),
    blocks: L.blocks.map(() => false),
    flag: false,
    nodes: new Set<string>(),
    expansions: 0,
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

  const queue: Array<[number, number]> = [];
  const push = (tx: number, surfaceRow: number) => {
    const key = `${tx},${surfaceRow}`;
    if (r.nodes.has(key)) return;
    if (!validNode(L, tx, surfaceRow)) return;
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
      const dir = jumped ? a.airDir : a.runDir;
      const res = stepBody(
        L.tiles,
        b,
        { left: dir < 0, right: dir > 0, jump: jumpNow, jumpHeld: jumpNow || holdLeft > 0 },
        DT,
      );
      if (holdLeft > 0) holdLeft -= 1;

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
      if (b.onGround) push(col, Math.floor((b.y + PH) / TILE));
      if (b.y > WORLD_H + 30) break;
    }
  };

  // Seed from the actual spawn, which starts in mid-air.
  run({ x: L.spawn.x, y: L.spawn.y, vx: 0, vy: 0, onGround: false }, {
    runDir: 0,
    airDir: 0,
    delay: MAX_FRAMES,
    hold: 0,
  });

  while (queue.length > 0 && r.expansions < MAX_EXPANSIONS) {
    const node = queue.pop();
    if (!node) break;
    r.expansions += 1;
    for (const a of ACTIONS) run(canonical(node[0], node[1]), a);
  }
  return r;
}

// --- per-level checks -----------------------------------------------------

type Tally = {
  coins: number;
  enemies: number;
  blocks: number;
  decor: number;
  pits: number;
  structures: Map<string, number>;
};

function emptyTally(): Tally {
  return { coins: 0, enemies: 0, blocks: 0, decor: 0, pits: 0, structures: new Map() };
}

function checkLevel(level: number, d: Difficulty, tally: Tally) {
  const L = buildLevel(level, d);
  const at = `${d} L${level}`;

  // 8. grid shape
  if (L.tiles.length !== ROWS) fail(`${at}: expected ${ROWS} rows, got ${L.tiles.length}`);
  for (const row of L.tiles) {
    if (row.length !== COLS) fail(`${at}: a row has ${row.length} cols, expected ${COLS}`);
  }

  // 5. spawn is open air with ground beneath
  const sx = Math.floor(L.spawn.x / TILE);
  const sy = Math.floor(L.spawn.y / TILE);
  if (overlapsSolid(L.tiles, L.spawn.x, L.spawn.y, PW, PH)) {
    fail(`${at}: spawn overlaps a solid tile`);
  }
  let groundBelow = false;
  for (let y = sy; y < ROWS; y += 1) {
    if (solidAt(L.tiles, sx, y)) {
      groundBelow = true;
      break;
    }
  }
  if (!groundBelow) fail(`${at}: spawn has no ground beneath it`);

  // 4. pits are clearable, and never merge into a wider one
  const pits = findPits(L.tiles);
  tally.pits += pits.length;
  for (const [px, pw] of pits) {
    if (pw > MAX_PIT_WIDTH) fail(`${at}: pit at x=${px} is ${pw} wide (max ${MAX_PIT_WIDTH})`);
    if (pw >= JUMP_REACH_TILES) {
      fail(`${at}: pit at x=${px} (${pw}) exceeds jump reach ${JUMP_REACH_TILES.toFixed(2)}`);
    }
  }
  for (let i = 1; i < pits.length; i += 1) {
    const gap = pits[i][0] - (pits[i - 1][0] + pits[i - 1][1]);
    if (gap < MIN_PIT_GAP) fail(`${at}: only ${gap} tiles of ground between pits at x=${pits[i][0]}`);
  }

  // 2. nothing is embedded in a solid tile
  tally.coins += L.coins.length;
  if (L.coins.length === 0) fail(`${at}: no coins`);
  for (const c of L.coins) {
    const cx = Math.floor(c.x / TILE);
    const cy = Math.floor(c.y / TILE);
    if (solidAt(L.tiles, cx, cy)) fail(`${at}: coin at (${cx},${cy}) is inside a solid tile`);
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
    const want = blk.kind === 'coin' ? 'Q' : 'B';
    if (code !== want) {
      fail(`${at}: block at (${blk.tx},${blk.ty}) was overwritten by '${code}'`);
    }
    // A block buried under terrain can never be punched.
    if (solidAt(L.tiles, blk.tx, blk.ty + 1) && solidAt(L.tiles, blk.tx, blk.ty - 1)) {
      fail(`${at}: block at (${blk.tx},${blk.ty}) is sealed in on both sides`);
    }
  }

  // 3. enemies have footing and are moving
  tally.enemies += L.enemies.length;
  for (const e of L.enemies) {
    const ex = Math.floor((e.x + PW / 2) / TILE);
    const ey = Math.floor((e.y + PH / 2) / TILE);
    if (solidAt(L.tiles, ex, ey)) fail(`${at}: enemy at (${ex},${ey}) is inside a solid tile`);
    if (!solidAt(L.tiles, ex, GROUND_TOP)) fail(`${at}: enemy at x=${ex} hovers over a pit`);
    if (e.kind !== 'flyer') {
      const feet = Math.floor((e.y + PH + 1) / TILE);
      if (!solidAt(L.tiles, ex, feet)) fail(`${at}: enemy at x=${ex} has no ground under its feet`);
    }
    if (e.vx === 0) fail(`${at}: enemy at x=${ex} has zero velocity`);
  }

  for (const name of L.structures) {
    tally.structures.set(name, (tally.structures.get(name) ?? 0) + 1);
  }

  // 6. level 1 on easy is a warm-up
  if (level === 1 && d === 'easy') {
    if (pits.length !== 0) fail(`easy L1 has ${pits.length} pit(s); it must have none`);
    if (L.enemies.length > 1) fail(`easy L1 has ${L.enemies.length} enemies; at most 1 allowed`);
  }

  // 1. the important one: simulate and prove reachability
  const r = explore(L);
  if (r.expansions >= MAX_EXPANSIONS) fail(`${at}: search hit the expansion cap`);
  if (!r.flag) fail(`${at}: FLAG at tile x=${Math.floor(L.flagX / TILE)} is unreachable`);
  const missedCoins = L.coins
    .map((c, i) => (r.coins[i] ? null : `(${Math.floor(c.x / TILE)},${Math.floor(c.y / TILE)})`))
    .filter((v): v is string => v !== null);
  if (missedCoins.length > 0) {
    fail(`${at}: ${missedCoins.length} unreachable coin(s) at ${missedCoins.join(' ')}`);
  }
  const missedBlocks = L.blocks
    .map((b, i) => (r.blocks[i] ? null : `(${b.tx},${b.ty})`))
    .filter((v): v is string => v !== null);
  if (missedBlocks.length > 0) {
    fail(`${at}: ${missedBlocks.length} block(s) cannot be hit from below at ${missedBlocks.join(' ')}`);
  }
}

// --- run ------------------------------------------------------------------

const started = Date.now();
console.log(
  `physics: jump rises ${JUMP_RISE.toFixed(1)}px (${(JUMP_RISE / TILE).toFixed(2)} tiles), ` +
    `max step up ${MAX_STEP_UP} tiles, reach ${JUMP_REACH_TILES.toFixed(2)} tiles, ` +
    `max pit ${MAX_PIT_WIDTH} tiles`,
);
console.log(`search: ${ACTIONS.length} button plans per standing state\n`);

for (const d of DIFFICULTIES) {
  const tally = emptyTally();
  for (let level = 1; level <= LEVELS; level += 1) checkLevel(level, d, tally);
  const mix = [...tally.structures.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${v}`)
    .join(', ');
  console.log(
    `${d.padEnd(6)} L1-${LEVELS}: ${tally.coins} coins, ${tally.blocks} blocks, ` +
      `${tally.enemies} enemies, ${tally.pits} pits, ${tally.decor} decor`,
  );
  console.log(`       structures: ${mix}`);
}

// 7. determinism, and that levels actually differ from one another
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
  fail('easy and hard level 4 are identical — difficulty is not reaching generation');
}

console.log(`\n${DIFFICULTIES.length * LEVELS} levels simulated in ${Date.now() - started}ms`);

if (errors.length > 0) {
  console.error(`\n${errors.length} PROBLEM(S):`);
  for (const e of errors.slice(0, 40)) console.error(`  x ${e}`);
  if (errors.length > 40) console.error(`  ... and ${errors.length - 40} more`);
  process.exit(1);
}
console.log('Every level: flag reachable, every coin reachable, every block hittable.');
