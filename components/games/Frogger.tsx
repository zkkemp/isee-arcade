'use client';

import { useEffect, useRef } from 'react';
import type { GameCanvasProps } from '@/lib/games';
import {
  CAR_NAMES,
  animFrame,
  drawFrame,
  drawRotated,
  useSprites,
  type SpriteSet,
} from '@/lib/sprites';
import { fitBoard, useCanvasGame } from '@/lib/useCanvasGame';

const COLS = 13;
const ROWS = 13;
const CELL = 32;
const W = COLS * CELL;
const H = ROWS * CELL;

const GOAL_ROW = 0;
const RIVER_ROWS = [1, 2, 3, 4, 5];
const MEDIAN_ROW = 6;
const ROAD_ROWS = [7, 8, 9, 10, 11];
const START_ROW = 12;

/** Horizontal forgiveness on collisions, in cells. Makes near misses feel fair. */
const HITBOX_INSET = 0.22;

type LaneSpec = {
  row: number;
  kind: 'car' | 'log';
  dir: 1 | -1;
  speed: number;
  len: number;
  gap: number;
  /** Car sprite name, for road lanes. */
  car?: string;
};

type Obstacle = { x: number; len: number };
type Lane = LaneSpec & { obstacles: Obstacle[]; span: number };

const LANE_SPECS: LaneSpec[] = [
  // River: ride these or drown.
  { row: 1, kind: 'log', dir: 1, speed: 2.0, len: 3, gap: 6 },
  { row: 2, kind: 'log', dir: -1, speed: 2.6, len: 2, gap: 5 },
  { row: 3, kind: 'log', dir: 1, speed: 1.5, len: 4, gap: 7 },
  { row: 4, kind: 'log', dir: -1, speed: 3.0, len: 2, gap: 5 },
  { row: 5, kind: 'log', dir: 1, speed: 2.2, len: 3, gap: 6 },
  // Road: avoid these or get squashed.
  { row: 7, kind: 'car', dir: -1, speed: 2.6, len: 2, gap: 5, car: CAR_NAMES[0] },
  { row: 8, kind: 'car', dir: 1, speed: 3.4, len: 1, gap: 4, car: CAR_NAMES[1] },
  { row: 9, kind: 'car', dir: -1, speed: 4.2, len: 1, gap: 6, car: CAR_NAMES[4] },
  { row: 10, kind: 'car', dir: 1, speed: 2.1, len: 3, gap: 6, car: CAR_NAMES[2] },
  { row: 11, kind: 'car', dir: -1, speed: 3.0, len: 2, gap: 5, car: CAR_NAMES[3] },
];

function buildLanes(level: number): Lane[] {
  // Each cleared bank speeds everything up, but caps out so it stays playable.
  const mult = Math.min(1 + (level - 1) * 0.16, 2.4);
  return LANE_SPECS.map((spec) => {
    const period = spec.len + spec.gap;
    const count = Math.ceil((COLS + period) / period) + 1;
    const span = count * period;
    const start = -period + Math.random() * period;
    return {
      ...spec,
      speed: spec.speed * mult,
      span,
      obstacles: Array.from({ length: count }, (_, i) => ({
        x: start + i * period,
        len: spec.len,
      })),
    };
  });
}

type State = {
  lanes: Lane[];
  level: number;
  /** Player column as a float so it can drift while riding a log. */
  x: number;
  row: number;
  /** Highest row (lowest index) reached this life, for forward-progress points. */
  bestRow: number;
  /** Counts down a short hop animation. */
  hop: number;
  dying: number;
  splash: { x: number; y: number } | null;
  animTime: number;
};

function freshState(level: number): State {
  return {
    lanes: buildLanes(level),
    level,
    x: Math.floor(COLS / 2),
    row: START_ROW,
    bestRow: START_ROW,
    hop: 0,
    dying: 0,
    splash: null,
    animTime: 0,
  };
}

export default function Frogger({ paused, input, api, restartToken }: GameCanvasProps) {
  const stateRef = useRef<State>(freshState(1));
  const sprites = useSprites();
  const spritesRef = useRef<SpriteSet | null>(null);
  useEffect(() => {
    spritesRef.current = sprites;
  }, [sprites]);

  useEffect(() => {
    stateRef.current = freshState(1);
  }, [restartToken]);

  const { canvasRef } = useCanvasGame({
    active: !paused,
    step: (ctx, dt, cw, ch) => {
      const s = stateRef.current;
      s.animTime += dt;

      // --- update ---
      for (const lane of s.lanes) {
        for (const o of lane.obstacles) {
          o.x += lane.dir * lane.speed * dt;
          if (lane.dir > 0 && o.x > COLS) o.x -= lane.span;
          else if (lane.dir < 0 && o.x + o.len < 0) o.x += lane.span;
        }
      }

      if (s.dying > 0) {
        s.dying -= dt;
        if (s.dying <= 0) {
          s.x = Math.floor(COLS / 2);
          s.row = START_ROW;
          s.bestRow = START_ROW;
          s.splash = null;
        }
      } else {
        // Hops are discrete, one queued tap per frame.
        const tap = input.consumeTap();
        if (tap) {
          if (tap === 'up' && s.row > 0) {
            s.row -= 1;
            s.x = Math.round(s.x);
            s.hop = 0.14;
          } else if (tap === 'down' && s.row < START_ROW) {
            s.row += 1;
            s.x = Math.round(s.x);
            s.hop = 0.14;
          } else if (tap === 'left') {
            s.x = Math.max(0, Math.round(s.x) - 1);
            s.hop = 0.14;
          } else if (tap === 'right') {
            s.x = Math.min(COLS - 1, Math.round(s.x) + 1);
            s.hop = 0.14;
          }

          // Award forward progress once per row, not per hop back and forth.
          if (s.row < s.bestRow) {
            s.bestRow = s.row;
            api.addScore(10);
          }
        }

        if (s.hop > 0) s.hop -= dt;

        const center = s.x + 0.5;
        const lane = s.lanes.find((l) => l.row === s.row);

        if (s.row === GOAL_ROW) {
          api.addScore(100);
          const nextLevel = s.level + 1;
          stateRef.current = freshState(nextLevel);
          api.requestGate(`Bank ${s.level} reached`);
        } else if (lane?.kind === 'log') {
          const riding = lane.obstacles.find((o) => o.x <= center && center <= o.x + o.len);
          if (riding) {
            s.x += lane.dir * lane.speed * dt;
            if (s.x < -0.4 || s.x > COLS - 0.6) {
              s.dying = 0.5;
              s.splash = { x: s.x, y: s.row };
              api.died('You drifted off the log');
            }
          } else {
            s.dying = 0.5;
            s.splash = { x: s.x, y: s.row };
            api.died('You fell in the water');
          }
        } else if (lane?.kind === 'car') {
          const hit = lane.obstacles.some(
            (o) => o.x < s.x + 1 - HITBOX_INSET && o.x + o.len > s.x + HITBOX_INSET,
          );
          if (hit) {
            s.dying = 0.5;
            s.splash = { x: s.x, y: s.row };
            api.died('You got squashed');
          }
        }
      }

      draw(ctx, stateRef.current, spritesRef.current, cw, ch);
    },
  });

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />;
}

function drawGrassRow(
  ctx: CanvasRenderingContext2D,
  sp: SpriteSet,
  row: number,
  frame: string,
) {
  for (let c = 0; c < COLS; c += 1) {
    drawFrame(ctx, sp.tiles, frame, c * CELL, row * CELL, CELL, CELL);
  }
}

/**
 * The board is inherently square, so it is scaled to fit and centred. The
 * surrounding area is painted in a matching colour rather than left black, so a
 * tall screen still looks intentional.
 */
function draw(
  ctx: CanvasRenderingContext2D,
  s: State,
  sp: SpriteSet | null,
  cw: number,
  ch: number,
) {
  ctx.fillStyle = '#0d2b52';
  ctx.fillRect(0, 0, cw, ch);
  ctx.save();
  fitBoard(ctx, cw, ch, W, H);
  drawBoard(ctx, s, sp);
  ctx.restore();
}

function drawBoard(ctx: CanvasRenderingContext2D, s: State, sp: SpriteSet | null) {
  // --- water base, drawn under everything in the river band ---
  const water = ctx.createLinearGradient(0, RIVER_ROWS[0] * CELL, 0, (MEDIAN_ROW + 1) * CELL);
  water.addColorStop(0, '#2b7fd4');
  water.addColorStop(1, '#1f5fa8');

  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, W, H);

  if (!sp) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = 'bold 12px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('loading art…', W / 2, H / 2);
    ctx.textAlign = 'left';
    return;
  }

  // --- banks and median ---
  drawGrassRow(ctx, sp, GOAL_ROW, 'terrain_grass_block_top');
  drawGrassRow(ctx, sp, MEDIAN_ROW, 'terrain_grass_block_top');
  drawGrassRow(ctx, sp, START_ROW, 'terrain_grass_block_top');

  // --- river with moving surface highlights ---
  ctx.fillStyle = water;
  ctx.fillRect(0, RIVER_ROWS[0] * CELL, W, RIVER_ROWS.length * CELL);
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 2;
  for (const row of RIVER_ROWS) {
    const drift = (s.animTime * 22 * (row % 2 === 0 ? 1 : -1)) % 40;
    for (let x = -40; x < W + 40; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x + drift, row * CELL + CELL * 0.35);
      ctx.lineTo(x + drift + 14, row * CELL + CELL * 0.35);
      ctx.stroke();
    }
  }

  // --- road ---
  ctx.fillStyle = '#3b3b45';
  ctx.fillRect(0, ROAD_ROWS[0] * CELL, W, ROAD_ROWS.length * CELL);
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 2;
  ctx.setLineDash([12, 14]);
  for (let i = 1; i < ROAD_ROWS.length; i += 1) {
    const y = (ROAD_ROWS[0] + i) * CELL;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // --- goal markers ---
  const flagName = animFrame(['flag_green_a', 'flag_green_b'], s.animTime, 4);
  for (let c = 1; c < COLS; c += 3) {
    drawFrame(ctx, sp.tiles, flagName, c * CELL, GOAL_ROW * CELL - 6, CELL, CELL);
  }

  // --- obstacles ---
  for (const lane of s.lanes) {
    const y = lane.row * CELL;
    for (const o of lane.obstacles) {
      const px = o.x * CELL;
      const pw = o.len * CELL;
      if (px > W || px + pw < 0) continue;

      if (lane.kind === 'log') {
        // Repeat the log-bridge tile across the length so joints line up.
        for (let i = 0; i < o.len; i += 1) {
          drawFrame(ctx, sp.tiles, 'bridge_logs', px + i * CELL, y + 3, CELL, CELL - 6);
        }
      } else {
        const img = lane.car ? sp.cars[lane.car] : undefined;
        if (img) {
          // Car art points up; a quarter turn makes it face along the lane.
          const angle = lane.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
          const carLen = pw - 6;
          const carW = CELL - 6;
          drawRotated(ctx, img, px + pw / 2, y + CELL / 2, carW, carLen, angle);
        }
      }
    }
  }

  // --- player ---
  if (s.dying > 0 && s.splash) {
    const t = 1 - s.dying / 0.5;
    ctx.strokeStyle = `rgba(255,255,255,${1 - t})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(s.splash.x * CELL + CELL / 2, s.splash.y * CELL + CELL / 2, 6 + t * 18, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    const hopping = s.hop > 0;
    const lift = hopping ? 5 : 0;
    const size = CELL - 4 + (hopping ? 4 : 0);
    drawFrame(
      ctx,
      sp.enemies,
      hopping ? 'frog_jump' : 'frog_idle',
      s.x * CELL + (CELL - size) / 2,
      s.row * CELL + (CELL - size) / 2 - lift,
      size,
      size,
    );
  }

  // --- HUD ---
  ctx.fillStyle = 'rgba(0,0,0,0.34)';
  ctx.fillRect(0, H - 18, W, 18);
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.font = 'bold 10px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`BANK ${s.level}`, W - 6, H - 6);
  ctx.textAlign = 'left';
}
