/**
 * Verifies generated mazes are actually completable.
 *
 * The failure that matters here is a walled-off pocket: the player eats every
 * dot they can reach, the level never registers as clear, and the run is stuck
 * forever with no error anywhere. Nothing in the type system or the renderer can
 * catch that, so it is proven here by flood-filling the real grid through the
 * game's own `nextCell` movement rule.
 *
 * Run: npm run check:maze
 */
import {
  COLS,
  ROWS,
  SAFE_RADIUS,
  buildMaze,
  nextCell,
  type MazeLevel,
} from '../components/games/Maze';
import { DIFFICULTIES } from '../lib/difficulty';

const LEVELS = 25;

const errors: string[] = [];
const fail = (m: string) => errors.push(m);

/** BFS over cells reachable from the spawn, using the game's own movement rule. */
function reachable(m: MazeLevel): { seen: Set<string>; dist: Map<string, number> } {
  const key = (r: number, c: number) => `${r},${c}`;
  const seen = new Set<string>([key(m.playerSpawn.r, m.playerSpawn.c)]);
  const dist = new Map<string, number>([[key(m.playerSpawn.r, m.playerSpawn.c), 0]]);
  const queue: Array<{ r: number; c: number; d: number }> = [
    { r: m.playerSpawn.r, c: m.playerSpawn.c, d: 0 },
  ];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const dir of ['up', 'down', 'left', 'right'] as const) {
      const nxt = nextCell(m, cur.r, cur.c, dir);
      if (!nxt) continue;
      const k = key(nxt.r, nxt.c);
      if (seen.has(k)) continue;
      seen.add(k);
      dist.set(k, cur.d + 1);
      queue.push({ r: nxt.r, c: nxt.c, d: cur.d + 1 });
    }
  }
  return { seen, dist };
}

let totalDots = 0;
let totalPellets = 0;
let checked = 0;

for (const d of DIFFICULTIES) {
  for (let level = 1; level <= LEVELS; level += 1) {
    const m = buildMaze(level, d);
    const at = `${d} maze ${level}`;
    checked += 1;

    if (m.wall.length !== ROWS || m.wall.some((row) => row.length !== COLS)) {
      fail(`${at}: grid is not ${ROWS}x${COLS}`);
      continue;
    }

    const { seen, dist } = reachable(m);
    const key = (r: number, c: number) => `${r},${c}`;

    // 1. Every dot must be reachable, or the level can never be cleared.
    let dots = 0;
    const orphans: string[] = [];
    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        if (!m.dot[r][c]) continue;
        dots += 1;
        if (m.wall[r][c]) fail(`${at}: dot inside a wall at (${r},${c})`);
        if (!seen.has(key(r, c))) orphans.push(`(${r},${c})`);
      }
    }
    if (orphans.length > 0) {
      fail(
        `${at}: ${orphans.length} unreachable dot(s) - level can never be cleared: ` +
          orphans.slice(0, 6).join(' '),
      );
    }
    if (dots === 0) fail(`${at}: no dots at all`);
    if (dots !== m.dotCount) fail(`${at}: dotCount says ${m.dotCount}, grid has ${dots}`);
    totalDots += dots;

    // 2. Power pellets must be reachable too, and not buried in a wall.
    for (const p of m.pellets) {
      if (m.wall[p.r][p.c]) fail(`${at}: pellet inside a wall at (${p.r},${p.c})`);
      if (!seen.has(key(p.r, p.c))) fail(`${at}: unreachable pellet at (${p.r},${p.c})`);
    }
    if (m.pellets.length === 0) fail(`${at}: no power pellets`);
    totalPellets += m.pellets.length;

    // 3. The spawn must not be a dead end, or the player is trapped immediately.
    const exits = (['up', 'down', 'left', 'right'] as const).filter((dir) =>
      nextCell(m, m.playerSpawn.r, m.playerSpawn.c, dir),
    ).length;
    if (exits < 2) fail(`${at}: player spawn has only ${exits} exit(s)`);
    if (m.wall[m.playerSpawn.r][m.playerSpawn.c]) fail(`${at}: player spawns inside a wall`);

    // 4. Chasers must be reachable (else they can never threaten or be eaten) and
    //    must not start on top of the player.
    for (const ch of m.chasers) {
      const k = key(ch.spawn.r, ch.spawn.c);
      if (m.wall[ch.spawn.r][ch.spawn.c]) {
        fail(`${at}: chaser spawns inside a wall at (${ch.spawn.r},${ch.spawn.c})`);
      }
      if (!seen.has(k)) fail(`${at}: chaser spawn unreachable at (${ch.spawn.r},${ch.spawn.c})`);
      const dd = dist.get(k);
      if (dd !== undefined && dd < SAFE_RADIUS) {
        fail(`${at}: chaser starts ${dd} steps from the player (min ${SAFE_RADIUS})`);
      }
    }
    if (m.chasers.length === 0) fail(`${at}: no chasers`);

    // 5. The tunnel row must be open at both edges, or the wrap is one-way.
    if (m.wall[m.tunnelRow][0] || m.wall[m.tunnelRow][COLS - 1]) {
      fail(`${at}: tunnel row ${m.tunnelRow} is walled at an edge`);
    }

    // 6. Determinism - a verifier cannot prove anything about a maze it cannot
    //    reproduce, and replays would differ.
    if (JSON.stringify(buildMaze(level, d)) !== JSON.stringify(m)) {
      fail(`${at}: buildMaze is not deterministic`);
    }
  }

  // Levels must actually differ from one another.
  if (JSON.stringify(buildMaze(1, d).wall) === JSON.stringify(buildMaze(2, d).wall)) {
    fail(`${d}: mazes 1 and 2 are identical`);
  }
}

// 7. Easy must really be easier than hard.
for (let level = 1; level <= LEVELS; level += 1) {
  const [e, n, h] = DIFFICULTIES.map((d) => buildMaze(level, d));
  if (e.chaserSpeed > h.chaserSpeed) {
    fail(`maze ${level}: easy chasers faster than hard (${e.chaserSpeed} > ${h.chaserSpeed})`);
  }
  if (e.chasers.length > h.chasers.length) {
    fail(`maze ${level}: easy has more chasers than hard`);
  }
  if (e.frightSeconds < h.frightSeconds) {
    fail(`maze ${level}: easy power pellets last less long than hard`);
  }
  void n;
}

// --- self-test: prove the connectivity check can actually fail ---------------
//
// A flood fill that always succeeds proves nothing. This walls a dot off inside a
// clone and asserts the check notices. If this ever stops failing, the real
// assertions above have quietly stopped meaning anything.
{
  const m: MazeLevel = JSON.parse(JSON.stringify(buildMaze(3, 'normal')));
  // Find a dot that is not the spawn, and seal every way into it.
  let target: { r: number; c: number } | null = null;
  for (let r = 1; r < ROWS - 1 && !target; r += 1) {
    for (let c = 1; c < COLS - 1; c += 1) {
      if (m.dot[r][c] && !(r === m.playerSpawn.r && c === m.playerSpawn.c)) {
        target = { r, c };
        break;
      }
    }
  }
  if (!target) {
    fail('self-test: could not find a dot to wall off');
  } else {
    m.wall[target.r - 1][target.c] = true;
    m.wall[target.r + 1][target.c] = true;
    m.wall[target.r][target.c - 1] = true;
    m.wall[target.r][target.c + 1] = true;
    const { seen } = reachable(m);
    if (seen.has(`${target.r},${target.c}`)) {
      fail(
        `self-test: a fully walled-off dot at (${target.r},${target.c}) still read as ` +
          'reachable, so the connectivity proof is not actually proving anything',
      );
    } else {
      console.log(
        `self-test: sealing the dot at (${target.r},${target.c}) is correctly detected ` +
          'as unreachable',
      );
    }
  }
}

console.log(`mazes checked: ${checked} (${LEVELS} levels x ${DIFFICULTIES.length} difficulties)`);
console.log(`grid ${ROWS}x${COLS}; ${totalDots} dots and ${totalPellets} pellets flood-filled`);
const sample = buildMaze(1, 'easy');
console.log(
  `easy maze 1: ${sample.dotCount} dots, ${sample.chasers.length} chasers at speed ` +
    `${sample.chaserSpeed}, fright ${sample.frightSeconds}s, tunnel row ${sample.tunnelRow}`,
);

if (errors.length > 0) {
  console.error(`\n${errors.length} PROBLEM(S):`);
  for (const e of errors.slice(0, 25)) console.error(`  x ${e}`);
  if (errors.length > 25) console.error(`  ... and ${errors.length - 25} more`);
  process.exit(1);
}
console.log('\nEvery dot, pellet and chaser reachable; spawns safe; generation deterministic.');
