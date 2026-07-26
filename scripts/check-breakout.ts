/**
 * Proves Brick Buster is free of the two bugs every Breakout clone ships with.
 *
 * 1. Tunnelling. A fast ball can step clean over a thin brick or the paddle
 *    between frames, so the brick never breaks and the paddle never saves you.
 *    The fix is substepping (plus a swept test on the paddle, the thinnest
 *    collider). This file fires the ball at the fastest speed the game can ever
 *    reach, from thousands of angles and offsets, at the worst-case geometry
 *    (a short landscape viewport, where bricks are squashed thinnest), and
 *    asserts that whenever the ball's centre path passes through a brick the
 *    brick registered the hit — and that the paddle is never passed through.
 *
 * 2. Stuck / degenerate trajectories. A near-horizontal ball can bounce
 *    wall-to-wall forever, and a ball wedged between bricks can jitter in place.
 *    The fixes are a minimum vertical speed component, an axis-lock during brick
 *    resolution, and a stall nudge. This file plays whole walls to completion
 *    with a paddle bot and asserts every wall clears inside a step budget, that
 *    the minimum-vertical invariant holds after every single frame, and that the
 *    substep safety cap is never reached.
 *
 * It drives the real exported functions from components/games/Breakout.tsx, so
 * there is no second copy of the physics to drift out of sync.
 *
 * Run: npx tsx scripts/check-breakout.ts
 */
import {
  BALL_R,
  FIELD_W,
  MAX_SPEED,
  MAX_SUBSTEPS,
  MIN_VY_FRAC,
  brickRect,
  bricksLeft,
  buildWall,
  createWorld,
  makeGeom,
  paddleWidthFor,
  stepWorld,
  wallShape,
  type Ball,
  type Brick,
  type Ctrl,
  type Rect,
  type World,
} from '../components/games/Breakout';
import { DIFFICULTIES, type Difficulty } from '../lib/difficulty';

const errors: string[] = [];
const fail = (msg: string) => {
  if (errors.length < 400) errors.push(msg);
};

/** Canvas shapes to test: portrait phone, tall phone, iPad, and nasty landscape. */
const SIZES: Array<[string, number, number]> = [
  ['phone portrait', 390, 700],
  ['tall portrait', 360, 820],
  ['ipad portrait', 768, 1000],
  ['ipad landscape', 1024, 700],
  ['squat landscape', 900, 340],
];

const LEVELS = 20;
const NO_INPUT: Ctrl = { pointerX: null, left: false, right: false, launch: false };

// --- geometry -------------------------------------------------------------

function overlaps(a: Rect, b: Rect): boolean {
  const eps = 1e-9;
  return (
    a.x + a.w > b.x + eps &&
    b.x + b.w > a.x + eps &&
    a.y + a.h > b.y + eps &&
    b.y + b.h > a.y + eps
  );
}

function checkGeometry(): void {
  let rects = 0;
  for (const [label, cw, ch] of SIZES) {
    for (const d of DIFFICULTIES) {
      for (let level = 1; level <= LEVELS; level += 1) {
        const at = `${label} ${d} wall ${level}`;
        const wall = buildWall(level, d, 12345 + level);
        const g = makeGeom(cw, ch, 0, wall.cols, wall.rows);
        const shape = wallShape(level, d);
        if (wall.cols !== shape.cols || wall.rows !== shape.rows) {
          fail(`${at}: wall shape disagrees with wallShape()`);
        }
        if (wall.bricks.length === 0) fail(`${at}: empty wall`);

        const list = wall.bricks.map((b) => brickRect(g, b));
        rects += list.length;

        // 3a. inside the playfield, clear of the paddle, with reaction room.
        for (const r of list) {
          if (r.x < 0 || r.x + r.w > FIELD_W + 1e-9) fail(`${at}: brick outside width`);
          if (r.y < 0) fail(`${at}: brick above the ceiling`);
          if (r.y + r.h > g.paddleY - 4) {
            fail(`${at}: brick bottom ${(r.y + r.h).toFixed(1)} reaches the paddle at ${g.paddleY.toFixed(1)}`);
          }
          if (r.w <= 0 || r.h <= 0) fail(`${at}: degenerate brick ${r.w}x${r.h}`);
        }

        // 3b. no two bricks overlap.
        for (let i = 0; i < list.length; i += 1) {
          for (let j = i + 1; j < list.length; j += 1) {
            if (overlaps(list[i], list[j])) {
              const a = wall.bricks[i];
              const b = wall.bricks[j];
              fail(`${at}: bricks (${a.row},${a.col}) and (${b.row},${b.col}) overlap`);
            }
          }
        }

        // The substep budget only works if the thinnest collider is a real size.
        if (g.minCollider < 2) fail(`${at}: minCollider ${g.minCollider.toFixed(2)} is too thin`);
        if (g.paddleY + g.paddleH > g.h) fail(`${at}: paddle hangs below the field`);
        if (paddleWidthFor(level, d) > FIELD_W * 0.4) fail(`${at}: paddle is absurdly wide`);
      }
    }
  }
  console.log(`geometry: ${rects} brick rects across ${SIZES.length} canvas shapes, ${DIFFICULTIES.length} difficulties, walls 1-${LEVELS}`);
}

// --- determinism and difficulty ------------------------------------------

function checkGeneration(): void {
  for (const d of DIFFICULTIES) {
    for (let level = 1; level <= LEVELS; level += 1) {
      const a = JSON.stringify(buildWall(level, d, 777));
      const b = JSON.stringify(buildWall(level, d, 777));
      if (a !== b) fail(`buildWall(${level}, ${d}, 777) is not deterministic`);
      if (level > 1 && a === JSON.stringify(buildWall(level - 1, d, 777))) {
        fail(`${d} walls ${level - 1} and ${level} are identical on one seed`);
      }
    }
  }
  // Different seeds must actually produce different walls.
  let differ = 0;
  for (let s = 1; s <= 40; s += 1) {
    if (JSON.stringify(buildWall(6, 'normal', s)) !== JSON.stringify(buildWall(6, 'normal', s + 1))) {
      differ += 1;
    }
  }
  if (differ < 30) fail(`only ${differ}/40 seed pairs produced different walls`);

  // 5. easy really is easier, by every knob that exists.
  const g = makeGeom(390, 700, 0, 8, 5);
  for (let level = 1; level <= LEVELS; level += 1) {
    const pad = DIFFICULTIES.map((d) => paddleWidthFor(level, d));
    if (!(pad[0] > pad[1] && pad[1] > pad[2])) {
      fail(`wall ${level}: paddle widths not easy > normal > hard (${pad.join(', ')})`);
    }
    const rows = DIFFICULTIES.map((d) => wallShape(level, d).rows);
    if (!(rows[0] <= rows[1] && rows[1] <= rows[2])) {
      fail(`wall ${level}: rows not easy <= normal <= hard (${rows.join(', ')})`);
    }
    // Averaged over seeds, not measured on one wall. Tough bricks are placed
    // probabilistically, so a single wall can hand easy more of them than hard by
    // chance even though easy's chance is strictly lower - the per-wall version of
    // this assertion was testing an invariant the generator never promised.
    const SEEDS = 60;
    const strong = DIFFICULTIES.map((d) => {
      let total = 0;
      for (let s = 1; s <= SEEDS; s += 1) {
        total += buildWall(level, d, s * 7919).bricks.filter((b) => b.maxHp > 1).length;
      }
      return total / SEEDS;
    });
    if (strong[0] > strong[2] + 0.001) {
      fail(
        `wall ${level}: easy averages more two-hit bricks than hard ` +
          `(${strong.map((n) => n.toFixed(2)).join(', ')} over ${SEEDS} seeds)`,
      );
    }
  }
  const speeds = DIFFICULTIES.map((d) => {
    const w = createWorld({ level: 1, difficulty: d, seed: 5, cw: 390, ch: 700 });
    return w.speed;
  });
  if (!(speeds[0] < speeds[1] && speeds[1] < speeds[2])) {
    fail(`ball speed not easy < normal < hard (${speeds.map((s) => s.toFixed(1)).join(', ')})`);
  }

  // Wall 1 on easy is the warm-up a 10-year-old meets first.
  const w1 = buildWall(1, 'easy', 4242);
  if (w1.bricks.some((b) => b.maxHp > 1)) fail('easy wall 1 contains two-hit bricks');
  if (w1.rows > 3) fail(`easy wall 1 has ${w1.rows} rows; keep it to 3`);
  if (w1.pattern !== 'solid') fail(`easy wall 1 pattern is ${w1.pattern}, expected solid`);

  console.log(
    `generation: deterministic per seed, ${differ}/40 seed pairs differ; ` +
      `easy/normal/hard paddle ${DIFFICULTIES.map((d) => paddleWidthFor(1, d).toFixed(0)).join('/')}, ` +
      `speed ${speeds.map((s) => s.toFixed(0)).join('/')} (field ${FIELD_W}x${g.h.toFixed(0)})`,
  );
}

// --- tunnelling -----------------------------------------------------------

/** Does the segment a->b pass through rect r? Slab test on the ball's centre. */
function segmentHitsRect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  r: Rect,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  let t0 = 0;
  let t1 = 1;
  const slab = (p: number, d: number, lo: number, hi: number): boolean => {
    if (Math.abs(d) < 1e-12) return p >= lo && p <= hi;
    let n = (lo - p) / d;
    let f = (hi - p) / d;
    if (n > f) [n, f] = [f, n];
    t0 = Math.max(t0, n);
    t1 = Math.min(t1, f);
    return t1 >= t0;
  };
  if (!slab(ax, dx, r.x, r.x + r.w)) return false;
  if (!slab(ay, dy, r.y, r.y + r.h)) return false;
  return t1 >= t0;
}

/** A world with exactly one brick, nothing else in the way. */
function oneBrickWorld(
  d: Difficulty,
  cw: number,
  ch: number,
  row: number,
): { w: World; brick: Brick; rect: Rect } {
  const w = createWorld({ level: 14, difficulty: d, seed: 31337, cw, ch });
  const col = Math.floor(w.wall.cols / 2);
  const brick: Brick = { row, col, hp: 1, maxHp: 1, tint: 'blue', points: 10 };
  w.wall.bricks = [brick];
  w.wall.grid = Array.from({ length: w.wall.rows }, () =>
    Array.from({ length: w.wall.cols }, () => null),
  );
  w.wall.grid[row][col] = brick;
  w.serving = false;
  w.drops = [];
  w.balls = [];
  return { w, brick, rect: brickRect(w.geom, brick) };
}

/** Distance from the rect centre out to its boundary along direction (dx,dy). */
function exitDistance(rect: Rect, dx: number, dy: number, pad: number): number {
  const hw = rect.w / 2 + pad;
  const hh = rect.h / 2 + pad;
  const tx = Math.abs(dx) < 1e-9 ? Infinity : hw / Math.abs(dx);
  const ty = Math.abs(dy) < 1e-9 ? Infinity : hh / Math.abs(dy);
  return Math.min(tx, ty);
}

type TunnelStats = { fired: number; hit: number; tunnelled: number; skipped: number };

/**
 * Fires the ball straight through the brick centre from every direction, at the
 * top speed the game can reach and at the longest frame the shell will ever hand
 * a game (dt is clamped to 1/20 there, so 1/20 is the worst case).
 */
function checkBrickTunnelling(speedMul: number): TunnelStats {
  const stats: TunnelStats = { fired: 0, hit: 0, tunnelled: 0, skipped: 0 };
  const DTS = [1 / 20, 1 / 30, 1 / 60];
  const ANGLES = 72;
  const LATERAL = [-0.44, -0.28, -0.1, 0, 0.1, 0.28, 0.44];

  for (const [label, cw, ch] of SIZES) {
    for (const d of DIFFICULTIES) {
      // Row 1 keeps the brick well clear of the paddle so only the brick can be
      // hit, and the squat landscape shape gives the thinnest bricks in the game.
      const { w, brick, rect } = oneBrickWorld(d, cw, ch, 1);
      const speed = MAX_SPEED * speedMul;

      for (const dt of DTS) {
        for (let a = 0; a < ANGLES; a += 1) {
          const ang = (a / ANGLES) * Math.PI * 2;
          const dx = Math.cos(ang);
          const dy = Math.sin(ang);
          for (const lat of LATERAL) {
            // Offset the aim point across the face so it is not always dead centre.
            const cx = rect.x + rect.w / 2 - dy * lat * rect.w;
            const cy = rect.y + rect.h / 2 + dx * lat * rect.h;
            const back = exitDistance(rect, dx, dy, BALL_R + 0.4);
            const ball: Ball = {
              x: cx - dx * back,
              y: cy - dy * back,
              vx: dx * speed,
              vy: dy * speed,
              r: BALL_R,
            };
            // Skip setups that start outside the field or would hit a wall first.
            if (
              ball.x < BALL_R ||
              ball.x > FIELD_W - BALL_R ||
              ball.y < BALL_R ||
              ball.y > w.geom.paddleY - BALL_R
            ) {
              stats.skipped += 1;
              continue;
            }

            brick.hp = 1;
            w.wall.grid[brick.row][brick.col] = brick;
            w.balls = [ball];
            w.serving = false;
            w.stall = 0;
            const x0 = ball.x;
            const y0 = ball.y;
            stepWorld(w, dt, NO_INPUT);
            stats.fired += 1;

            const alive = w.balls.length > 0;
            const end = alive ? { x: w.balls[0].x, y: w.balls[0].y } : { x: x0, y: y0 };
            const crossed = segmentHitsRect(x0, y0, end.x, end.y, rect);
            if (brick.hp < 1) {
              stats.hit += 1;
            } else if (crossed) {
              stats.tunnelled += 1;
              fail(
                `TUNNELLED ${label} ${d} dt=${dt.toFixed(4)} speed=${speed.toFixed(0)}: ` +
                  `ball went from (${x0.toFixed(1)},${y0.toFixed(1)}) to ` +
                  `(${end.x.toFixed(1)},${end.y.toFixed(1)}) through an untouched brick ` +
                  `${rect.w.toFixed(1)}x${rect.h.toFixed(1)}`,
              );
            }
          }
        }
      }
    }
  }
  return stats;
}

/**
 * The paddle is thinner than any brick, so it gets its own sweep test: aim down
 * at it from just above at top speed and require a save whenever the crossing
 * point is over the paddle.
 */
function checkPaddleTunnelling(speedMul: number): TunnelStats {
  const stats: TunnelStats = { fired: 0, hit: 0, tunnelled: 0, skipped: 0 };
  const DTS = [1 / 20, 1 / 45];

  for (const [label, cw, ch] of SIZES) {
    for (const d of DIFFICULTIES) {
      const { w } = oneBrickWorld(d, cw, ch, 1);
      w.wall.bricks = [];
      w.wall.grid = Array.from({ length: w.wall.rows }, () =>
        Array.from({ length: w.wall.cols }, () => null),
      );
      const g = w.geom;
      const speed = MAX_SPEED * speedMul;

      for (const dt of DTS) {
        // Steep through to shallow-ish descents.
        for (let a = 0; a < 24; a += 1) {
          const ang = -0.55 + (a / 23) * 1.1; // radians off straight down
          const dx = Math.sin(ang);
          const dy = Math.cos(ang);
          for (let k = 0; k <= 16; k += 1) {
            // Aim at points across the paddle, plus a little beyond each end.
            const frac = -0.6 + (k / 16) * 1.2;
            const aimX = w.paddle.x + frac * (w.paddle.w / 2);
            const lead = 6 + speed * dt * 0.9;
            const ball: Ball = {
              x: aimX - dx * lead,
              y: g.paddleY - dy * lead,
              vx: dx * speed,
              vy: dy * speed,
              r: BALL_R,
            };
            if (
              ball.x < BALL_R ||
              ball.x > FIELD_W - BALL_R ||
              ball.y < BALL_R
            ) {
              stats.skipped += 1;
              continue;
            }
            w.balls = [ball];
            w.serving = false;
            const inside = Math.abs(aimX - w.paddle.x) <= w.paddle.w / 2 - BALL_R;
            // Step until the ball resolves rather than once. The launch point is
            // deliberately further from the paddle than a single frame of travel
            // (so the sweep is genuinely exercised across a frame boundary), so a
            // single step cannot have reached the paddle yet - asserting after one
            // step reported a tunnel on every case, which was a harness bug, not a
            // physics one.
            for (let f = 0; f < 240; f += 1) {
              stepWorld(w, dt, NO_INPUT);
              const cur = w.balls[0];
              // Bounced (now travelling up), or gone off the bottom.
              if (!cur || cur.vy < 0) break;
            }
            stats.fired += 1;

            if (!inside) continue; // grazing the very end may legitimately miss
            const b = w.balls[0];
            if (!b || b.y + BALL_R > g.paddleY + 0.6 || b.vy >= 0) {
              stats.tunnelled += 1;
              fail(
                `PADDLE PASSED THROUGH ${label} ${d} dt=${dt.toFixed(4)} ` +
                  `speed=${speed.toFixed(0)} aim=${aimX.toFixed(1)} ` +
                  `(paddle x=${w.paddle.x.toFixed(1)} w=${w.paddle.w.toFixed(1)} ` +
                  `thickness=${g.paddleH.toFixed(1)}): ${b ? `ended y=${b.y.toFixed(1)} vy=${b.vy.toFixed(0)}` : 'ball lost'}`,
              );
            } else {
              stats.hit += 1;
            }
          }
        }
      }
    }
  }
  return stats;
}

// --- playing whole walls to completion -----------------------------------

const DT = 1 / 60;
const STEP_BUDGET = 120000; // 33 minutes of play at 60fps

type Play = {
  steps: number;
  serves: number;
  cleared: boolean;
  destroyed: number;
  maxSubsteps: number;
  nudges: number;
  minVyBreaches: number;
  worstVyRatio: number;
  maxSpeedSeen: number;
  longestStall: number;
};

/**
 * A paddle bot: predicts where the ball will cross the paddle line, then aims the
 * hit offset so the ball is thrown toward whatever brick is still standing. It is
 * deliberately not perfect — it only ever uses the same Ctrl a player has.
 */
function botControl(w: World): Ctrl {
  if (w.serving) return { pointerX: w.paddle.x / FIELD_W, left: false, right: false, launch: true };

  let pred = w.paddle.x;
  let bestT = Infinity;
  for (const b of w.balls) {
    if (b.vy <= 0) continue;
    const t = (w.geom.paddleY - b.r - b.y) / b.vy;
    if (t < 0 || t >= bestT) continue;
    bestT = t;
    // Unfold the wall bounces: mirror the raw landing x back into the field.
    const lo = b.r;
    const span = FIELD_W - 2 * b.r;
    const period = span * 2;
    let m = (((b.x + b.vx * t - lo) % period) + period) % period;
    if (m > span) m = period - m;
    pred = lo + m;
  }
  if (!Number.isFinite(bestT)) {
    const b = w.balls.reduce((acc, cur) => (cur.y > acc.y ? cur : acc), w.balls[0]);
    if (b) pred = b.x;
  }

  // Aim at the lowest surviving brick, tie-broken by proximity: digging upward
  // from the bottom is both fast and what a decent player does.
  let aim: number | null = null;
  let bestRow = -1;
  let bestDx = Infinity;
  for (const brick of w.wall.bricks) {
    if (brick.hp <= 0) continue;
    const r = brickRect(w.geom, brick);
    const cx = r.x + r.w / 2;
    const dx = Math.abs(cx - pred);
    if (brick.row > bestRow || (brick.row === bestRow && dx < bestDx)) {
      bestRow = brick.row;
      bestDx = dx;
      aim = cx;
    }
  }
  const offset = aim === null ? 0 : Math.max(-0.85, Math.min(0.85, (aim - pred) / 45));
  const want = pred - offset * (w.paddle.w / 2);
  return {
    pointerX: Math.max(0, Math.min(1, want / FIELD_W)),
    left: false,
    right: false,
    launch: false,
  };
}

function playWall(level: number, d: Difficulty, seed: number): Play {
  const w = createWorld({ level, difficulty: d, seed, cw: 390, ch: 700 });
  const total = w.wall.bricks.length;
  const p: Play = {
    steps: 0,
    serves: 1,
    cleared: false,
    destroyed: 0,
    maxSubsteps: 0,
    nudges: 0,
    minVyBreaches: 0,
    worstVyRatio: 1,
    maxSpeedSeen: 0,
    longestStall: 0,
  };

  while (p.steps < STEP_BUDGET) {
    const ev = stepWorld(w, DT, botControl(w));
    p.steps += 1;
    p.destroyed += ev.destroyed;
    p.longestStall = Math.max(p.longestStall, w.stall);

    // The invariant that kills the near-horizontal hang, checked after EVERY
    // frame rather than sampled: no live ball may be shallower than the minimum.
    if (!w.serving) {
      for (const b of w.balls) {
        const sp = Math.hypot(b.vx, b.vy);
        if (sp <= 0) continue;
        const ratio = Math.abs(b.vy) / sp;
        p.worstVyRatio = Math.min(p.worstVyRatio, ratio);
        if (ratio < MIN_VY_FRAC - 1e-6) p.minVyBreaches += 1;
        p.maxSpeedSeen = Math.max(p.maxSpeedSeen, sp);
      }
    }
    if (ev.lost) p.serves += 1;
    if (ev.cleared) {
      p.cleared = true;
      break;
    }
  }
  p.maxSubsteps = w.substepPeak;
  p.nudges = w.nudges;
  if (!p.cleared) {
    fail(
      `${d} wall ${level} seed ${seed}: NOT cleared in ${STEP_BUDGET} steps ` +
        `(${bricksLeft(w)}/${total} bricks left, ${p.serves} serves)`,
    );
  }
  if (p.minVyBreaches > 0) {
    fail(
      `${d} wall ${level} seed ${seed}: vertical speed fell below ${MIN_VY_FRAC} of total ` +
        `on ${p.minVyBreaches} frames (worst ${p.worstVyRatio.toFixed(3)})`,
    );
  }
  if (p.maxSubsteps >= MAX_SUBSTEPS) {
    fail(`${d} wall ${level} seed ${seed}: hit the substep cap (${p.maxSubsteps})`);
  }
  if (p.maxSpeedSeen > MAX_SPEED + 1e-6) {
    fail(`${d} wall ${level} seed ${seed}: ball reached ${p.maxSpeedSeen.toFixed(1)} > MAX_SPEED`);
  }
  // Clearing the wall means every brick was destroyed, which is the reachability
  // proof: no brick can hide where a ball launched from the paddle cannot go.
  if (p.cleared && w.wall.bricks.some((b) => b.hp > 0)) {
    fail(`${d} wall ${level} seed ${seed}: reported cleared with bricks left`);
  }
  return p;
}

function checkPlaythroughs(): void {
  const SEEDS = [1, 7, 99, 12345];
  const LVLS = [1, 2, 3, 5, 8, 12, 17];
  let walls = 0;
  let steps = 0;
  let peakSteps = 0;
  let nudges = 0;
  let serves = 0;
  let maxSubsteps = 0;
  let worstVy = 1;
  let longestStall = 0;

  for (const d of DIFFICULTIES) {
    for (const level of LVLS) {
      for (const seed of SEEDS) {
        const p = playWall(level, d, seed);
        walls += 1;
        steps += p.steps;
        peakSteps = Math.max(peakSteps, p.steps);
        nudges += p.nudges;
        serves += p.serves;
        maxSubsteps = Math.max(maxSubsteps, p.maxSubsteps);
        worstVy = Math.min(worstVy, p.worstVyRatio);
        longestStall = Math.max(longestStall, p.longestStall);
      }
    }
  }
  console.log(
    `playthroughs: ${walls} walls all cleared; ${(steps / 1000).toFixed(0)}k frames simulated, ` +
      `worst wall ${(peakSteps / 60).toFixed(0)}s, ${serves} serves, ${nudges} stall nudges`,
  );
  console.log(
    `             peak substeps/frame ${maxSubsteps} (cap ${MAX_SUBSTEPS}), ` +
      `shallowest ball ${worstVy.toFixed(3)} of speed (floor ${MIN_VY_FRAC}), ` +
      `longest no-progress stretch ${longestStall.toFixed(1)}s`,
  );
}

/**
 * Wedge test: drop the ball straight into the seam between two bricks, which is
 * how the jitter bug shows up. It must escape and keep moving, not oscillate.
 */
function checkWedge(): void {
  for (const d of DIFFICULTIES) {
    const w = createWorld({ level: 9, difficulty: d, seed: 606, cw: 390, ch: 700 });
    const g = w.geom;
    for (const brick of w.wall.bricks) {
      if (brick.col + 1 >= w.wall.cols) continue;
      const right = w.wall.grid[brick.row][brick.col + 1];
      if (!right || brick.hp <= 0 || right.hp <= 0) continue;
      const r = brickRect(g, brick);
      // Dead in the seam, moving almost horizontally: the worst case for both the
      // axis-lock and the minimum-vertical rule.
      const sp = MAX_SPEED * 0.8;
      w.serving = false;
      w.balls = [
        { x: r.x + r.w + g.gapX / 2, y: r.y + r.h / 2, vx: sp * 0.999, vy: sp * 0.01, r: BALL_R },
      ];
      let moved = 0;
      let last = { x: w.balls[0].x, y: w.balls[0].y };
      for (let i = 0; i < 90; i += 1) {
        stepWorld(w, DT, NO_INPUT);
        const b = w.balls[0];
        if (!b) break;
        moved += Math.hypot(b.x - last.x, b.y - last.y);
        last = { x: b.x, y: b.y };
      }
      const b = w.balls[0];
      if (b) {
        const sp2 = Math.hypot(b.vx, b.vy);
        if (Math.abs(b.vy) / sp2 < MIN_VY_FRAC - 1e-6) {
          fail(`${d}: wedged ball stayed shallow (${(Math.abs(b.vy) / sp2).toFixed(3)})`);
        }
      }
      // 1.5s of play must cover real ground; a jittering ball covers almost none.
      if (moved < 40) fail(`${d}: wedged ball only travelled ${moved.toFixed(1)} units in 1.5s`);
      break;
    }
  }
  console.log('wedge: seam drops escape and keep travelling');
}

// --- run ------------------------------------------------------------------

const started = Date.now();
console.log(
  `physics: field ${FIELD_W} wide, ball r=${BALL_R}, max speed ${MAX_SPEED} u/s, ` +
    `substep <= ${(0.35).toFixed(2)} x thinnest collider, min vertical ${MIN_VY_FRAC} of speed\n`,
);

checkGeometry();
checkGeneration();

const brickStats = checkBrickTunnelling(1);
console.log(
  `tunnelling (bricks): ${brickStats.fired} shots at max speed, ${brickStats.hit} registered, ` +
    `${brickStats.tunnelled} passed through, ${brickStats.skipped} setups skipped`,
);
const padStats = checkPaddleTunnelling(1);
console.log(
  `tunnelling (paddle): ${padStats.fired} shots at max speed, ${padStats.hit} saved, ` +
    `${padStats.tunnelled} passed through`,
);

checkWedge();
checkPlaythroughs();

console.log(`\nfinished in ${Date.now() - started}ms`);

if (errors.length > 0) {
  console.error(`\n${errors.length} PROBLEM(S):`);
  for (const e of errors.slice(0, 25)) console.error(`  x ${e}`);
  if (errors.length > 25) console.error(`  ... and ${errors.length - 25} more`);
  process.exit(1);
}
console.log('No tunnelling, no stuck balls, every wall clearable, layouts sane.');
