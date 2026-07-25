'use client';

import { useEffect, useRef } from 'react';
import type { GameCanvasProps } from '@/lib/games';
import type { Direction } from '@/lib/input';
import { animFrame, drawFrame, useSprites, type SpriteSet } from '@/lib/sprites';
import { useCanvasGame } from '@/lib/useCanvasGame';

const GRID = 20;
const CELL = 20;
const W = GRID * CELL;
const H = GRID * CELL;

const BASE_TICK = 0.15;
const MIN_TICK = 0.07;

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
  flash: number;
  animTime: number;
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
    flash: 0,
    animTime: 0,
  };
}

export default function Snake({ paused, input, api, restartToken }: GameCanvasProps) {
  const stateRef = useRef<State>(freshState());
  const sprites = useSprites();
  const spritesRef = useRef<SpriteSet | null>(null);
  useEffect(() => {
    spritesRef.current = sprites;
  }, [sprites]);

  useEffect(() => {
    stateRef.current = freshState();
  }, [restartToken]);

  const { canvasRef } = useCanvasGame({
    width: W,
    height: H,
    active: !paused,
    step: (ctx, dt) => {
      const s = stateRef.current;
      s.animTime += dt;

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
          api.died(hitWall ? 'You hit the wall' : 'You ran into yourself');
          draw(ctx, stateRef.current, spritesRef.current);
          return;
        }

        s.body.unshift(next);
        if (s.grow > 0) s.grow -= 1;
        else s.body.pop();

        if (next.x === s.food.x && next.y === s.food.y) {
          s.grow += 1;
          s.eaten += 1;
          s.flash = 0.22;
          s.food = spawnFood(s.body);
          api.addScore(10);
        }
      }

      draw(ctx, stateRef.current, spritesRef.current);
    },
  });

  return <canvas ref={canvasRef} className="block h-full w-full touch-none" />;
}

function roundedCell(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  radius: number,
) {
  const x = cx - size / 2;
  const y = cy - size / 2;
  const r = Math.min(radius, size / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + size, y, x + size, y + size, r);
  ctx.arcTo(x + size, y + size, x, y + size, r);
  ctx.arcTo(x, y + size, x, y, r);
  ctx.arcTo(x, y, x + size, y, r);
  ctx.closePath();
  ctx.fill();
}

function draw(ctx: CanvasRenderingContext2D, s: State, sp: SpriteSet | null) {
  // --- checkered field, so movement reads clearly ---
  ctx.fillStyle = '#7cc96a';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) {
      if ((x + y) % 2 === 0) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    }
  }

  // Vignette, so the playfield edges read as walls.
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, W - 6, H - 6);

  // --- food: a spinning coin ---
  const fx = s.food.x * CELL + CELL / 2;
  const fy = s.food.y * CELL + CELL / 2;
  if (sp) {
    const coin = animFrame(['coin_gold', 'coin_gold', 'coin_gold_side', 'coin_gold_side'], s.animTime, 6);
    const pulse = s.flash > 0 ? 4 : 0;
    const size = CELL - 4 + pulse;
    drawFrame(ctx, sp.tiles, coin, fx - size / 2, fy - size / 2, size, size);
  } else {
    ctx.fillStyle = '#ffd75e';
    ctx.beginPath();
    ctx.arc(fx, fy, CELL / 2 - 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- snake, tapering and brightest at the head ---
  for (let i = s.body.length - 1; i >= 0; i -= 1) {
    const seg = s.body[i];
    const t = 1 - i / Math.max(s.body.length, 1);
    const cx = seg.x * CELL + CELL / 2;
    const cy = seg.y * CELL + CELL / 2;

    // Soft shadow gives the body a little depth against the field.
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    roundedCell(ctx, cx + 1.5, cy + 2, CELL - 3, 7);

    if (i === 0) {
      ctx.fillStyle = '#2f6df6';
    } else {
      const g = 120 + Math.round(t * 90);
      ctx.fillStyle = `rgb(40, ${g}, ${Math.min(255, g + 90)})`;
    }
    const size = CELL - 3 - (1 - t) * 3;
    roundedCell(ctx, cx, cy, size, 7);
  }

  // --- eyes on the head, looking where it is going ---
  const head = s.body[0];
  const hx = head.x * CELL + CELL / 2;
  const hy = head.y * CELL + CELL / 2;
  const ox = s.dir.x * 3.5;
  const oy = s.dir.y * 3.5;
  const px = s.dir.x === 0 ? 4 : 0;
  const py = s.dir.y === 0 ? 4 : 0;

  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(hx + ox + px, hy + oy + py, 3, 0, Math.PI * 2);
  ctx.arc(hx + ox - px, hy + oy - py, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#10233f';
  ctx.beginPath();
  ctx.arc(hx + ox * 1.3 + px, hy + oy * 1.3 + py, 1.5, 0, Math.PI * 2);
  ctx.arc(hx + ox * 1.3 - px, hy + oy * 1.3 - py, 1.5, 0, Math.PI * 2);
  ctx.fill();

  // --- HUD ---
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.fillRect(0, H - 18, W, 18);
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.font = 'bold 10px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`${s.eaten} eaten`, W - 6, H - 6);
  ctx.textAlign = 'left';
}
