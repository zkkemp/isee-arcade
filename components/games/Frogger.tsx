'use client';

import { useEffect, useRef } from 'react';
import type { GameCanvasProps } from '@/lib/games';
import { useCanvasGame } from '@/lib/useCanvasGame';

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
  color: string;
};

type Obstacle = { x: number; len: number };

type Lane = LaneSpec & { obstacles: Obstacle[]; span: number };

const LANE_SPECS: LaneSpec[] = [
  // River: ride these or drown.
  { row: 1, kind: 'log', dir: 1, speed: 2.0, len: 3, gap: 6, color: '#8b5e34' },
  { row: 2, kind: 'log', dir: -1, speed: 2.6, len: 2, gap: 5, color: '#a06b3c' },
  { row: 3, kind: 'log', dir: 1, speed: 1.5, len: 4, gap: 7, color: '#7a5230' },
  { row: 4, kind: 'log', dir: -1, speed: 3.0, len: 2, gap: 5, color: '#a06b3c' },
  { row: 5, kind: 'log', dir: 1, speed: 2.2, len: 3, gap: 6, color: '#8b5e34' },
  // Road: avoid these or get squashed.
  { row: 7, kind: 'car', dir: -1, speed: 2.6, len: 2, gap: 5, color: '#ff5d5d' },
  { row: 8, kind: 'car', dir: 1, speed: 3.4, len: 1, gap: 4, color: '#ffd166' },
  { row: 9, kind: 'car', dir: -1, speed: 4.2, len: 1, gap: 6, color: '#c77dff' },
  { row: 10, kind: 'car', dir: 1, speed: 2.1, len: 3, gap: 6, color: '#4ea8ff' },
  { row: 11, kind: 'car', dir: -1, speed: 3.0, len: 2, gap: 5, color: '#ff8fab' },
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
  };
}

export default function Frogger({ paused, input, api, restartToken }: GameCanvasProps) {
  const stateRef = useRef<State>(freshState(1));
  useEffect(() => {
    stateRef.current = freshState(1);
  }, [restartToken]);

  const { canvasRef } = useCanvasGame({
    width: W,
    height: H,
    active: !paused,
    step: (ctx, dt) => {
      const s = stateRef.current;

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
            s.hop = 0.12;
          } else if (tap === 'down' && s.row < START_ROW) {
            s.row += 1;
            s.x = Math.round(s.x);
            s.hop = 0.12;
          } else if (tap === 'left') {
            s.x = Math.max(0, Math.round(s.x) - 1);
            s.hop = 0.12;
          } else if (tap === 'right') {
            s.x = Math.min(COLS - 1, Math.round(s.x) + 1);
            s.hop = 0.12;
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
          // Made it across.
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
              api.lifeLost();
            }
          } else {
            s.dying = 0.5;
            s.splash = { x: s.x, y: s.row };
            api.lifeLost();
          }
        } else if (lane?.kind === 'car') {
          const hit = lane.obstacles.some(
            (o) => o.x < s.x + 1 - HITBOX_INSET && o.x + o.len > s.x + HITBOX_INSET,
          );
          if (hit) {
            s.dying = 0.5;
            s.splash = { x: s.x, y: s.row };
            api.lifeLost();
          }
        }
      }

      // --- draw ---
      draw(ctx, stateRef.current);
    },
  });

  return (
    <canvas
      ref={canvasRef}
      className="block h-auto w-full touch-none"
      style={{ aspectRatio: `${W} / ${H}`, imageRendering: 'pixelated' }}
    />
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function draw(ctx: CanvasRenderingContext2D, s: State) {
  // Terrain
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#1f6f43';
  ctx.fillRect(0, GOAL_ROW * CELL, W, CELL);
  ctx.fillRect(0, MEDIAN_ROW * CELL, W, CELL);
  ctx.fillRect(0, START_ROW * CELL, W, CELL);

  ctx.fillStyle = '#123a6b';
  ctx.fillRect(0, RIVER_ROWS[0] * CELL, W, RIVER_ROWS.length * CELL);
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1;
  for (const row of RIVER_ROWS) {
    ctx.beginPath();
    ctx.moveTo(0, row * CELL + CELL / 2);
    ctx.lineTo(W, row * CELL + CELL / 2);
    ctx.stroke();
  }

  ctx.fillStyle = '#26262e';
  ctx.fillRect(0, ROAD_ROWS[0] * CELL, W, ROAD_ROWS.length * CELL);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.setLineDash([10, 12]);
  for (let i = 1; i < ROAD_ROWS.length; i += 1) {
    const y = (ROAD_ROWS[0] + i) * CELL;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Goal bank marker
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  for (let c = 0; c < COLS; c += 2) {
    ctx.fillRect(c * CELL + 6, 6, CELL - 12, CELL - 12);
  }

  // Obstacles
  for (const lane of s.lanes) {
    const y = lane.row * CELL;
    for (const o of lane.obstacles) {
      const px = o.x * CELL;
      const pw = o.len * CELL;
      if (px > W || px + pw < 0) continue;

      if (lane.kind === 'log') {
        ctx.fillStyle = lane.color;
        roundRect(ctx, px + 1, y + 5, pw - 2, CELL - 10, 6);
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        for (let i = 1; i < o.len; i += 1) {
          ctx.fillRect(px + i * CELL - 1, y + 6, 2, CELL - 12);
        }
      } else {
        ctx.fillStyle = lane.color;
        roundRect(ctx, px + 2, y + 4, pw - 4, CELL - 8, 5);
        ctx.fill();
        // Windshield hints direction of travel.
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        const wsW = Math.min(8, pw / 3);
        const wsX = lane.dir > 0 ? px + pw - wsW - 5 : px + 5;
        ctx.fillRect(wsX, y + 9, wsW, CELL - 18);
      }
    }
  }

  // Player
  if (s.dying > 0 && s.splash) {
    const t = 1 - s.dying / 0.5;
    ctx.strokeStyle = `rgba(255,255,255,${1 - t})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(s.splash.x * CELL + CELL / 2, s.splash.y * CELL + CELL / 2, 6 + t * 16, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    const pop = s.hop > 0 ? 3 : 0;
    const px = s.x * CELL;
    const py = s.row * CELL;
    ctx.fillStyle = '#3ddc84';
    roundRect(ctx, px + 4 - pop / 2, py + 4 - pop / 2, CELL - 8 + pop, CELL - 8 + pop, 8);
    ctx.fill();
    ctx.fillStyle = '#0b1020';
    ctx.beginPath();
    ctx.arc(px + 11, py + 12, 2.6, 0, Math.PI * 2);
    ctx.arc(px + 21, py + 12, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Level badge
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = 'bold 11px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`BANK ${s.level}`, W - 8, H - 10);
  ctx.textAlign = 'left';
}
