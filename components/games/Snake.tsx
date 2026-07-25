'use client';

import { useEffect, useRef } from 'react';
import type { GameCanvasProps } from '@/lib/games';
import type { Direction } from '@/lib/input';
import { useCanvasGame } from '@/lib/useCanvasGame';

const GRID = 20;
const CELL = 20;
const W = GRID * CELL;
const H = GRID * CELL;

const BASE_TICK = 0.15;
const MIN_TICK = 0.07;
/** Snacks between study gates. */
const SNACKS_PER_GATE = 5;

type Vec = { x: number; y: number };

const DIRS: Record<Direction, Vec> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

type State = {
  body: Vec[];
  dir: Vec;
  nextDir: Vec;
  food: Vec;
  grow: number;
  tickAccum: number;
  eaten: number;
  sinceGate: number;
  flash: number;
};

function spawnFood(body: Vec[]): Vec {
  // Pick from the open cells so food never lands under the snake.
  const taken = new Set(body.map((b) => `${b.x},${b.y}`));
  const open: Vec[] = [];
  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) {
      if (!taken.has(`${x},${y}`)) open.push({ x, y });
    }
  }
  if (open.length === 0) return { x: 0, y: 0 };
  return open[Math.floor(Math.random() * open.length)];
}

function freshState(keepEaten = 0): State {
  const mid = Math.floor(GRID / 2);
  const body: Vec[] = [
    { x: mid, y: mid },
    { x: mid - 1, y: mid },
    { x: mid - 2, y: mid },
  ];
  return {
    body,
    dir: DIRS.right,
    nextDir: DIRS.right,
    food: spawnFood(body),
    grow: 0,
    tickAccum: 0,
    eaten: keepEaten,
    sinceGate: 0,
    flash: 0,
  };
}

export default function Snake({ paused, input, api, restartToken }: GameCanvasProps) {
  const stateRef = useRef<State>(freshState());
  useEffect(() => {
    stateRef.current = freshState();
  }, [restartToken]);

  const { canvasRef } = useCanvasGame({
    width: W,
    height: H,
    active: !paused,
    step: (ctx, dt) => {
      const s = stateRef.current;

      // Queue the turn but only commit it on a tick, so a fast double-tap
      // cannot fold the snake back into itself within one step.
      const tap = input.consumeTap();
      if (tap) {
        const nd = DIRS[tap];
        if (nd.x !== -s.dir.x || nd.y !== -s.dir.y) s.nextDir = nd;
      }

      if (s.flash > 0) s.flash -= dt;

      const tick = Math.max(MIN_TICK, BASE_TICK - s.eaten * 0.004);
      s.tickAccum += dt;

      if (s.tickAccum >= tick) {
        s.tickAccum -= tick;
        s.dir = s.nextDir;

        const head = s.body[0];
        const next: Vec = { x: head.x + s.dir.x, y: head.y + s.dir.y };

        const hitWall = next.x < 0 || next.y < 0 || next.x >= GRID || next.y >= GRID;
        // The tail tip moves out of the way this tick unless the snake is growing.
        const bodyToCheck = s.grow > 0 ? s.body : s.body.slice(0, -1);
        const hitSelf = bodyToCheck.some((b) => b.x === next.x && b.y === next.y);

        if (hitWall || hitSelf) {
          stateRef.current = freshState(s.eaten);
          api.lifeLost();
          draw(ctx, stateRef.current);
          return;
        }

        s.body.unshift(next);
        if (s.grow > 0) s.grow -= 1;
        else s.body.pop();

        if (next.x === s.food.x && next.y === s.food.y) {
          s.grow += 1;
          s.eaten += 1;
          s.sinceGate += 1;
          s.flash = 0.2;
          s.food = spawnFood(s.body);
          api.addScore(10);

          if (s.sinceGate >= SNACKS_PER_GATE) {
            s.sinceGate = 0;
            api.requestGate(`${s.eaten} snacks eaten`);
          }
        }
      }

      draw(ctx, stateRef.current);
    },
  });

  return (
    <canvas
      ref={canvasRef}
      className="block h-auto w-full touch-none"
      style={{ aspectRatio: `${W} / ${H}` }}
    />
  );
}

function draw(ctx: CanvasRenderingContext2D, s: State) {
  ctx.fillStyle = '#0a0f1e';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let i = 1; i < GRID; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * CELL, 0);
    ctx.lineTo(i * CELL, H);
    ctx.moveTo(0, i * CELL);
    ctx.lineTo(W, i * CELL);
    ctx.stroke();
  }

  // Food, with a soft pulse right after being eaten.
  const pulse = s.flash > 0 ? 3 : 0;
  ctx.fillStyle = '#ff6b81';
  ctx.beginPath();
  ctx.arc(
    s.food.x * CELL + CELL / 2,
    s.food.y * CELL + CELL / 2,
    CELL / 2 - 4 + pulse,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  // Snake, brightest at the head so direction reads instantly.
  for (let i = s.body.length - 1; i >= 0; i -= 1) {
    const seg = s.body[i];
    const t = 1 - i / Math.max(s.body.length, 1);
    const shade = 90 + Math.round(t * 120);
    ctx.fillStyle = i === 0 ? '#7ec8ff' : `rgb(40, ${shade}, ${shade + 60})`;
    const inset = i === 0 ? 2 : 3;
    ctx.beginPath();
    const x = seg.x * CELL + inset;
    const y = seg.y * CELL + inset;
    const size = CELL - inset * 2;
    const r = 5;
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + size, y, x + size, y + size, r);
    ctx.arcTo(x + size, y + size, x, y + size, r);
    ctx.arcTo(x, y + size, x, y, r);
    ctx.arcTo(x, y, x + size, y, r);
    ctx.closePath();
    ctx.fill();
  }

  // Eyes on the head, facing travel direction.
  const head = s.body[0];
  const hx = head.x * CELL + CELL / 2;
  const hy = head.y * CELL + CELL / 2;
  ctx.fillStyle = '#0a0f1e';
  const ox = s.dir.x * 3;
  const oy = s.dir.y * 3;
  const px = s.dir.x === 0 ? 4 : 0;
  const py = s.dir.y === 0 ? 4 : 0;
  ctx.beginPath();
  ctx.arc(hx + ox + px, hy + oy + py, 2, 0, Math.PI * 2);
  ctx.arc(hx + ox - px, hy + oy - py, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = 'bold 11px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`${s.sinceGate}/${SNACKS_PER_GATE} to quiz`, W - 8, H - 9);
  ctx.textAlign = 'left';
}
