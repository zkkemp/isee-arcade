/**
 * Proves every generated Road Hopper level is actually crossable.
 *
 * The failure mode this exists to catch: a seeded layout whose lanes happen to
 * leave no safe timing anywhere - a river with no reachable platform
 * sequence, or a road lane so dense that no gap ever passes a given column.
 * A kid would meet a level that simply cannot be won and would never know why.
 *
 * The proof is a real search, not a geometry rule checked in isolation: it
 * calls `buildLevel` and `advanceLevel` - the exact functions the live game
 * uses to lay out and move obstacles - and does a frontier-by-frontier
 * breadth-first search over (row, column) state, one simulated tick at a
 * time, trying every hop direction plus "stay put" from every state reached
 * so far. A level is crossable if and only if this search ever reaches the
 * goal row. Because `carHit` and `rideObstacle` are the same functions the
 * component's own per-frame step calls, this is not a model of the game - it
 * is the game, minus rendering and input.
 *
 * Soundness of the tick size: the search only samples obstacle state once per
 * tick, so a hazard that fully enters and leaves a column faster than one
 * tick could in principle be missed. The lane speed caps in Frogger.tsx
 * (MAX_ROAD_SPEED, MAX_RIVER_SPEED) and the minimum obstacle length keep every
 * lane's crossing time for a single cell well above the tick length - checked
 * explicitly below for every generated lane - so that can't happen here.
 *
 * Run: npx tsx scripts/check-frogger.ts
 */
import {
  COLS,
  GOAL_ROW,
  GOAL_SLOTS,
  HITBOX_INSET,
  MAX_RIVER_SPEED,
  MAX_ROAD_SPEED,
  ROAD_VEHICLES,
  ROWS,
  START_ROW,
  advanceLevel,
  buildLevel,
  carHit,
  laneAt,
  rideObstacle,
  type LevelPlan,
  type RoadVehicle,
} from '../components/games/Frogger';
import { DIFFICULTIES } from '../lib/difficulty';

const LEVELS = 20;
const SEEDS = [1, 2, 3, 7, 11, 42, 99, 12345];

/** Simulation tick. Small relative to every lane's per-cell crossing time - see
 *  the soundness checks in the per-level loop below. */
const DT = 1 / 24;
const MAX_TIME = 14;
const TICKS = Math.round(MAX_TIME / DT);
/** Column resolution for dedup while drifting on a log; hop landings are
 *  always exactly integer, so this only matters mid-ride. */
const XBUCKET = 20;
const FRONTIER_CAP = 6000;

const errors: string[] = [];
const fail = (m: string) => errors.push(m);

function clonePlan(level: LevelPlan): LevelPlan {
  return JSON.parse(JSON.stringify(level)) as LevelPlan;
}

function keyOf(row: number, x: number): string {
  return `${row}:${Math.round(x * XBUCKET)}`;
}

type SimResult = { reached: boolean; capped: boolean };

/**
 * The proof itself: a tick-by-tick frontier search using the game's own
 * `advanceLevel`, `carHit` and `rideObstacle`. `next` is filled with every
 * (row, x) reachable one tick later than the current frontier, from either
 * staying put (with a river ride drifting, or a road/river cell staying
 * safe) or hopping in any of the four directions - each validated against
 * the SAME snapshot the hop would land in, matching the live game's
 * advance-then-check per-frame order.
 */
function simulate(level: LevelPlan): SimResult {
  const plan = clonePlan(level);
  let frontier = new Map<string, { row: number; x: number }>();
  const startX = Math.floor(COLS / 2);
  frontier.set(keyOf(START_ROW, startX), { row: START_ROW, x: startX });

  let capped = false;

  for (let tick = 0; tick < TICKS; tick += 1) {
    advanceLevel(plan, DT);
    const next = new Map<string, { row: number; x: number }>();
    let reached = false;

    const add = (row: number, x: number) => {
      const k = keyOf(row, x);
      if (!next.has(k)) next.set(k, { row, x });
    };

    const landing = (destRow: number, destX: number): void => {
      if (destRow < 0 || destRow > START_ROW) return;
      const dk = plan.rows[destRow];
      if (dk === 'goal') {
        reached = true;
        return;
      }
      if (dk === 'start' || dk === 'safe') {
        add(destRow, destX);
        return;
      }
      const dl = laneAt(plan, destRow);
      if (!dl) return;
      if (dk === 'road') {
        if (!carHit(dl, destX)) add(destRow, destX);
      } else if (dk === 'river') {
        if (rideObstacle(dl, destX + 0.5)) add(destRow, destX);
      }
    };

    for (const { row, x } of frontier.values()) {
      const kind = plan.rows[row];
      const lane = laneAt(plan, row);

      // -- stay put for this tick --
      if (kind === 'goal') {
        reached = true;
      } else if (kind === 'start' || kind === 'safe') {
        add(row, x);
      } else if (kind === 'road' && lane) {
        if (!carHit(lane, x)) add(row, x);
      } else if (kind === 'river' && lane) {
        const ride = rideObstacle(lane, x + 0.5);
        if (ride) {
          const nx = lane.speed > 0 ? x + lane.dir * lane.speed * DT : x;
          if (nx >= -0.4 && nx <= COLS - 0.6) add(row, nx);
        }
      }

      // -- or hop, landing checked against this same tick's obstacles --
      const rx = Math.round(x);
      landing(row - 1, rx);
      landing(row + 1, rx);
      landing(row, Math.max(0, rx - 1));
      landing(row, Math.min(COLS - 1, rx + 1));
    }

    if (reached) return { reached: true, capped };
    if (next.size === 0) return { reached: false, capped };
    if (next.size > FRONTIER_CAP) capped = true;
    frontier = next;
  }
  return { reached: false, capped };
}

// --- per-level checks -------------------------------------------------------

let checked = 0;
let coinsTotal = 0;
let turtleLanes = 0;
let lilypadLanes = 0;
let restStops = 0;
const vehicleCounts = Object.fromEntries(
  ROAD_VEHICLES.map((vehicle) => [vehicle, 0]),
) as Record<RoadVehicle, number>;

for (const d of DIFFICULTIES) {
  for (let level = 1; level <= LEVELS; level += 1) {
    for (const seed of SEEDS) {
      const plan = buildLevel(level, d, seed);
      checked += 1;
      const at = `${d} L${level} seed${seed}`;

      if (plan.rows.length !== ROWS) fail(`${at}: rows length ${plan.rows.length} != ${ROWS}`);
      if (plan.rows[GOAL_ROW] !== 'goal') fail(`${at}: row ${GOAL_ROW} is not the goal`);
      if (plan.rows[START_ROW] !== 'start') fail(`${at}: row ${START_ROW} is not the start`);

      for (const lane of plan.lanes) {
        if (lane.kind === 'car' && lane.speed > MAX_ROAD_SPEED + 1e-6) {
          fail(`${at}: road lane at row ${lane.row} exceeds MAX_ROAD_SPEED (${lane.speed.toFixed(2)})`);
        }
        if (lane.kind === 'car') {
          const vehicle = lane.vehicle ?? 'car';
          if (!ROAD_VEHICLES.includes(vehicle)) {
            fail(`${at}: unknown road vehicle "${vehicle}" at row ${lane.row}`);
          } else {
            vehicleCounts[vehicle] += 1;
          }
        }
        if (lane.kind !== 'car' && lane.kind !== 'lilypad' && lane.speed > MAX_RIVER_SPEED + 1e-6) {
          fail(`${at}: river lane at row ${lane.row} exceeds MAX_RIVER_SPEED (${lane.speed.toFixed(2)})`);
        }
        if (lane.gap < 2) fail(`${at}: lane at row ${lane.row} has gap ${lane.gap}, below the safety margin`);

        // Soundness of the search's tick size: a lane must not be able to
        // sweep a full obstacle length past a fixed column faster than one
        // tick, or the search could miss it entirely.
        if (lane.speed > 0 && lane.len / lane.speed <= DT) {
          fail(
            `${at}: lane at row ${lane.row} passes a point in ${(lane.len / lane.speed).toFixed(3)}s,` +
              ` faster than the ${DT.toFixed(3)}s search tick can see - the proof below would be unsound`,
          );
        }
        if (lane.kind === 'turtle') {
          turtleLanes += 1;
          if ((lane.subUp ?? 0) <= DT) fail(`${at}: turtle at row ${lane.row} surfaces for less than one tick`);
          if ((lane.subDown ?? 0) <= DT) fail(`${at}: turtle at row ${lane.row} submerges for less than one tick`);
        }
        if (lane.kind === 'lilypad') lilypadLanes += 1;
      }
      for (let r = 1; r < ROWS - 1; r += 1) if (plan.rows[r] === 'safe') restStops += 1;
      coinsTotal += plan.coins.length;

      for (const coin of plan.coins) {
        if (coin.row < 0 || coin.row >= ROWS || coin.x < 0 || coin.x >= COLS) {
          fail(`${at}: coin outside the board at (${coin.row},${coin.x})`);
        }
      }

      // --- the actual proof ---
      const result = simulate(plan);
      if (result.capped) fail(`${at}: search hit the frontier cap - result not trustworthy`);
      if (!result.reached) fail(`${at}: no timing gets the hopper from the start to the goal`);
    }
  }

  // Determinism: a verifier cannot prove anything about a level it cannot
  // reproduce.
  if (JSON.stringify(buildLevel(5, d, 7)) !== JSON.stringify(buildLevel(5, d, 7))) {
    fail(`${d}: buildLevel is not deterministic`);
  }
}

for (const vehicle of ROAD_VEHICLES) {
  if (vehicleCounts[vehicle] === 0) {
    fail(`traffic variety check never generated a ${vehicle}`);
  }
}

// --- variety: levels and seeds must actually differ from one another -------
if (JSON.stringify(buildLevel(3, 'normal', 1)) === JSON.stringify(buildLevel(3, 'normal', 2))) {
  fail('two different seeds produced an identical level 3 - no variety between seeds');
}
if (JSON.stringify(buildLevel(1, 'normal', 5)) === JSON.stringify(buildLevel(2, 'normal', 5))) {
  fail('levels 1 and 2 (same seed) are identical - the level no longer repeats, but neither does it vary');
}
{
  const layouts = new Set<string>();
  for (let level = 1; level <= LEVELS; level += 1) {
    layouts.add(JSON.stringify(buildLevel(level, 'normal', 1).rows));
  }
  if (layouts.size < LEVELS * 0.5) {
    fail(`only ${layouts.size} distinct row layouts across ${LEVELS} levels - too repetitive`);
  }
}

// --- difficulty must actually ramp, and must actually be capped ------------
{
  const avgSpeed = (p: LevelPlan) =>
    p.lanes.reduce((sum, l) => sum + l.speed, 0) / Math.max(1, p.lanes.length);
  const early = avgSpeed(buildLevel(1, 'normal', 3));
  const late = avgSpeed(buildLevel(LEVELS, 'normal', 3));
  if (late <= early) fail(`average lane speed did not increase from level 1 (${early.toFixed(2)}) to ${LEVELS} (${late.toFixed(2)})`);

  for (let level = 1; level <= LEVELS; level += 1) {
    const e = buildLevel(level, 'easy', 5);
    const h = buildLevel(level, 'hard', 5);
    if (avgSpeed(e) > avgSpeed(h) + 1e-6) fail(`level ${level}: easy lanes average faster than hard`);
  }

  // Capped: level 20 must not be dramatically harder than level 12 - the ramp
  // has to have leveled off well within the tested range.
  const mid = avgSpeed(buildLevel(12, 'hard', 9));
  const cap = avgSpeed(buildLevel(20, 'hard', 9));
  if (cap > mid * 1.35) {
    fail(`hard-difficulty speed kept climbing sharply from level 12 (${mid.toFixed(2)}) to 20 (${cap.toFixed(2)}) - ramp is not capping`);
  }
}

// --- level 1 is a warm-up, on every seed and every difficulty --------------
for (const d of DIFFICULTIES) {
  for (const seed of SEEDS) {
    const p = buildLevel(1, d, seed);
    const riverCount = p.rows.filter((r) => r === 'river').length;
    const roadCount = p.rows.filter((r) => r === 'road').length;
    if (riverCount > 4) fail(`${d} L1 seed ${seed}: ${riverCount} river lanes, expected a gentle start`);
    if (roadCount > 4) fail(`${d} L1 seed ${seed}: ${roadCount} road lanes, expected a gentle start`);
    if (p.lanes.some((l) => l.kind === 'turtle')) {
      fail(`${d} L1 seed ${seed}: has a turtle lane, too soon for level 1`);
    }
  }
}

// --- self-tests: prove the crossability check can actually fail ------------
//
// A search that always reports "reached" proves nothing. Each of these breaks
// a real, already-proven-crossable level in a specific way and asserts the
// search notices.
{
  const base = buildLevel(6, 'normal', 1);
  if (!simulate(base).reached) {
    fail('self-test setup: chosen base level (6, normal, seed 1) is not even crossable to start with');
  } else {
    // 1. A solid wall of cars, end to end, on every road lane.
    const blocked = clonePlan(base);
    for (const lane of blocked.lanes) {
      if (lane.kind !== 'car') continue;
      lane.obstacles = [{ x: -5, len: COLS + 10, safe: true, phase: 0 }];
      lane.speed = 0; // frozen, so the wall can never wrap/drift open a gap
    }
    if (simulate(blocked).reached) {
      fail('self-test: a solid wall of cars across every road lane still read as crossable');
    } else {
      console.log('self-test: a solid wall of cars correctly blocks the crossing');
    }

    // 2. A river with no platforms anywhere.
    const drained = clonePlan(base);
    for (const lane of drained.lanes) {
      if (lane.kind === 'log' || lane.kind === 'turtle' || lane.kind === 'lilypad') lane.obstacles = [];
    }
    if (simulate(drained).reached) {
      fail('self-test: a river with no platforms at all still read as crossable');
    } else {
      console.log('self-test: an emptied river correctly blocks the crossing');
    }

    // 3. Every river lane turned into a turtle that never resurfaces.
    const drowned = clonePlan(base);
    for (const lane of drowned.lanes) {
      if (lane.kind === 'log' || lane.kind === 'turtle' || lane.kind === 'lilypad') {
        lane.kind = 'turtle';
        lane.subUp = 0.001;
        lane.subDown = 999;
      }
    }
    if (simulate(drowned).reached) {
      fail('self-test: a river of permanently-submerged turtles still read as crossable');
    } else {
      console.log('self-test: permanently-submerged turtles correctly block the crossing');
    }
  }
}

// --- summary -----------------------------------------------------------------

console.log(
  `\n${DIFFICULTIES.length} difficulties x ${LEVELS} levels x ${SEEDS.length} seeds = ` +
    `${checked} levels checked and proven crossable`,
);
console.log(
  `world ${COLS}x${ROWS}, ${GOAL_SLOTS} home-bank slots, hitbox inset ${HITBOX_INSET}, ` +
    `search tick ${(DT * 1000).toFixed(1)}ms over up to ${MAX_TIME}s`,
);
console.log(
  `across all checks: ${turtleLanes} turtle lanes, ${lilypadLanes} lilypad lanes, ` +
    `${restStops} rest stops, ${coinsTotal} coins`,
);
console.log(
  `traffic roster: ${ROAD_VEHICLES.map((vehicle) => `${vehicle} ${vehicleCounts[vehicle]}`).join(', ')}`,
);

if (errors.length > 0) {
  console.error(`\n${errors.length} PROBLEM(S):`);
  for (const e of errors.slice(0, 40)) console.error(`  x ${e}`);
  if (errors.length > 40) console.error(`  ... and ${errors.length - 40} more`);
  process.exit(1);
}
console.log(
  '\nEvery generated level: a timing exists that gets the hopper from start to goal; ' +
    'every river lane has a reachable platform sequence; no lane outruns the search or a hop.',
);
