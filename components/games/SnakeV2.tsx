'use client';

import { useEffect, useRef } from 'react';
import type { GameCanvasProps } from '@/lib/games';
import type { Direction } from '@/lib/input';
import { SPEED_SCALE } from '@/lib/difficulty';
import { fitBoard, useCanvasGame } from '@/lib/useCanvasGame';

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
  lastEat: Vec | null;
};

function spawnFood(body: Vec[]): Vec {
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
  const body = [
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
    lastEat: null,
  };
}

/** Garden Edition: the simulation matches Snake; only the canvas art is new. */
export default function SnakeV2({ paused, input, api, restartToken, difficulty }: GameCanvasProps) {
  const stateRef = useRef<State>(freshState());

  useEffect(() => {
    stateRef.current = freshState();
  }, [restartToken]);

  const { canvasRef } = useCanvasGame({
    active: !paused,
    step: (ctx, dt, cw, ch) => {
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

      // Lower difficulty means a longer tick, so there is more time to react.
      const tick = Math.max(MIN_TICK, (BASE_TICK - s.eaten * 0.004) / SPEED_SCALE[difficulty]);
      s.tickAccum += dt;

      if (s.tickAccum >= tick) {
        s.tickAccum -= tick;
        s.dir = s.nextDir;
        const head = s.body[0];
        const next = { x: head.x + s.dir.x, y: head.y + s.dir.y };
        const hitWall = next.x < 0 || next.y < 0 || next.x >= GRID || next.y >= GRID;
        // The tail tip moves out of the way this tick unless the snake is growing.
        const bodyToCheck = s.grow > 0 ? s.body : s.body.slice(0, -1);
        const hitSelf = bodyToCheck.some((b) => b.x === next.x && b.y === next.y);

        if (hitWall || hitSelf) {
          stateRef.current = freshState(s.eaten);
          api.died(hitWall ? 'You hit the wall' : 'You ran into yourself');
          draw(ctx, stateRef.current, cw, ch);
          return;
        }

        s.body.unshift(next);
        if (s.grow > 0) s.grow -= 1;
        else s.body.pop();

        if (next.x === s.food.x && next.y === s.food.y) {
          s.grow += 1;
          s.eaten += 1;
          s.flash = 0.22;
          s.lastEat = { ...next };
          s.food = spawnFood(s.body);
          api.addScore(10);
        }
      }

      draw(ctx, s, cw, ch);
    },
  });

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />;
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function draw(ctx: CanvasRenderingContext2D, s: State, cw: number, ch: number) {
  const backdrop = ctx.createLinearGradient(0, 0, 0, ch);
  backdrop.addColorStop(0, '#17384d');
  backdrop.addColorStop(0.52, '#102b3d');
  backdrop.addColorStop(1, '#081d2b');
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, cw, ch);

  // A restrained halo keeps the garden afloat on wide and tall displays.
  const glow = ctx.createRadialGradient(cw / 2, ch / 2, 10, cw / 2, ch / 2, Math.max(cw, ch) * 0.7);
  glow.addColorStop(0, 'rgba(113, 191, 111, 0.18)');
  glow.addColorStop(1, 'rgba(3, 13, 25, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, cw, ch);

  ctx.save();
  fitBoard(ctx, cw, ch, W, H);
  drawGarden(ctx, s);
  ctx.restore();
}

function drawGarden(ctx: CanvasRenderingContext2D, s: State) {
  // Layered planter frame and its broad, soft ground shadow.
  ctx.save();
  ctx.shadowColor = 'rgba(1, 8, 12, 0.6)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 8;
  roundedRect(ctx, 1, 1, W - 2, H - 2, 18);
  ctx.fillStyle = '#68432a';
  ctx.fill();
  ctx.restore();

  const wood = ctx.createLinearGradient(0, 0, W, H);
  wood.addColorStop(0, '#d4a564');
  wood.addColorStop(0.22, '#8f5631');
  wood.addColorStop(0.7, '#704128');
  wood.addColorStop(1, '#d09a57');
  roundedRect(ctx, 3, 3, W - 6, H - 6, 15);
  ctx.fillStyle = wood;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 232, 164, 0.42)';
  ctx.lineWidth = 2;
  ctx.stroke();

  roundedRect(ctx, 11, 11, W - 22, H - 22, 10);
  ctx.fillStyle = '#396c47';
  ctx.fill();
  ctx.save();
  ctx.clip();
  drawGrass(ctx, s.animTime);
  drawMotes(ctx, s.animTime);
  ctx.restore();

  // Inner lip makes the bounds unambiguous without obscuring edge cells.
  roundedRect(ctx, 11, 11, W - 22, H - 22, 10);
  ctx.strokeStyle = 'rgba(19, 57, 36, 0.9)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(246, 223, 156, 0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();

  drawFood(ctx, s);
  if (s.flash > 0 && s.lastEat) drawCelebration(ctx, s);
  drawSnake(ctx, s);
}

function drawGrass(ctx: CanvasRenderingContext2D, time: number) {
  const field = ctx.createLinearGradient(0, 12, W, H - 12);
  field.addColorStop(0, '#78ba61');
  field.addColorStop(0.48, '#4f9b55');
  field.addColorStop(1, '#2f7446');
  ctx.fillStyle = field;
  ctx.fillRect(11, 11, W - 22, H - 22);

  // Sparse deterministic blades and stepping-stone dots: texture without a busy grid.
  for (let i = 0; i < 54; i += 1) {
    const x = 18 + ((i * 71) % 360);
    const y = 18 + ((i * 113) % 360);
    const sway = Math.sin(time * 1.3 + i) * 1.2;
    ctx.strokeStyle = i % 3 === 0 ? 'rgba(215, 245, 143, 0.28)' : 'rgba(21, 91, 49, 0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + 3);
    ctx.quadraticCurveTo(x + sway, y - 3, x + sway * 1.3, y - 5);
    ctx.stroke();
  }
  for (let i = 0; i < 22; i += 1) {
    const x = 24 + ((i * 97) % 346);
    const y = 24 + ((i * 149) % 346);
    ctx.fillStyle = 'rgba(246, 220, 159, 0.12)';
    ctx.beginPath();
    ctx.ellipse(x, y, 2.8, 1.7, (i * 0.7) % Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMotes(ctx: CanvasRenderingContext2D, time: number) {
  for (let i = 0; i < 15; i += 1) {
    const baseX = 24 + ((i * 83) % 346);
    const baseY = 25 + ((i * 137) % 344);
    const x = baseX + Math.sin(time * (0.65 + (i % 3) * 0.12) + i) * 5;
    const y = baseY + Math.cos(time * (0.8 + (i % 4) * 0.1) + i * 2) * 4;
    const pulse = 0.4 + 0.35 * Math.sin(time * 2.2 + i);
    ctx.fillStyle = `rgba(255, 239, 130, ${pulse})`;
    ctx.beginPath();
    ctx.arc(x, y, i % 4 === 0 ? 1.5 : 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawFood(ctx: CanvasRenderingContext2D, s: State) {
  const x = s.food.x * CELL + CELL / 2;
  const y = s.food.y * CELL + CELL / 2;
  const bob = Math.sin(s.animTime * 5) * 1.3;
  const pulse = 1 + Math.sin(s.animTime * 4) * 0.07;
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.scale(pulse, pulse);
  ctx.shadowColor = 'rgba(255, 205, 65, 0.95)';
  ctx.shadowBlur = 12;
  const gem = ctx.createRadialGradient(-3, -4, 1, 0, 0, 11);
  gem.addColorStop(0, '#fff9c9');
  gem.addColorStop(0.22, '#ffe56c');
  gem.addColorStop(0.56, '#ff8e38');
  gem.addColorStop(1, '#bc314a');
  ctx.fillStyle = gem;
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(9, -2);
  ctx.lineTo(5, 9);
  ctx.lineTo(-5, 9);
  ctx.lineTo(-9, -2);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(105, 33, 53, 0.65)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.arc(-3, -4, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCelebration(ctx: CanvasRenderingContext2D, s: State) {
  if (!s.lastEat) return;
  const progress = 1 - s.flash / 0.22;
  const cx = s.lastEat.x * CELL + CELL / 2;
  const cy = s.lastEat.y * CELL + CELL / 2;
  for (let i = 0; i < 12; i += 1) {
    const angle = (Math.PI * 2 * i) / 12 + 0.2;
    const distance = 7 + progress * 25;
    const alpha = Math.max(0, 1 - progress) * 0.9;
    ctx.fillStyle = i % 2 ? `rgba(255, 238, 119, ${alpha})` : `rgba(255, 156, 75, ${alpha})`;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(angle) * distance, cy + Math.sin(angle) * distance, 2.2 * (1 - progress), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSnake(ctx: CanvasRenderingContext2D, s: State) {
  const body = s.body;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // One continuous under-stroke hides seams and gives the body its connected silhouette.
  ctx.strokeStyle = 'rgba(8, 43, 45, 0.35)';
  ctx.lineWidth = CELL - 3;
  ctx.shadowColor = 'rgba(0, 30, 29, 0.38)';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 3;
  drawBodyPath(ctx, body, 1.3, 1.8);
  ctx.stroke();
  ctx.shadowColor = 'transparent';

  const bodyGradient = ctx.createLinearGradient(0, 0, W, H);
  bodyGradient.addColorStop(0, '#b9e35a');
  bodyGradient.addColorStop(0.5, '#62bc59');
  bodyGradient.addColorStop(1, '#277c56');
  ctx.strokeStyle = bodyGradient;
  ctx.lineWidth = CELL - 5;
  drawBodyPath(ctx, body, 0, 0);
  ctx.stroke();
  ctx.restore();

  // Individual highlights retain a pleasant segmented, dimensional read.
  for (let i = body.length - 1; i >= 1; i -= 1) {
    const seg = body[i];
    const x = seg.x * CELL + CELL / 2;
    const y = seg.y * CELL + CELL / 2;
    ctx.fillStyle = i % 2 ? 'rgba(200, 239, 111, 0.16)' : 'rgba(20, 104, 70, 0.12)';
    ctx.beginPath();
    ctx.arc(x - 2.2, y - 2.7, 5.1, 0, Math.PI * 2);
    ctx.fill();
  }
  drawHead(ctx, s);
}

function drawBodyPath(ctx: CanvasRenderingContext2D, body: Vec[], offsetX: number, offsetY: number) {
  const tail = body[body.length - 1];
  ctx.beginPath();
  ctx.moveTo(tail.x * CELL + CELL / 2 + offsetX, tail.y * CELL + CELL / 2 + offsetY);
  for (let i = body.length - 2; i >= 0; i -= 1) {
    const b = body[i];
    ctx.lineTo(b.x * CELL + CELL / 2 + offsetX, b.y * CELL + CELL / 2 + offsetY);
  }
}

function drawHead(ctx: CanvasRenderingContext2D, s: State) {
  const head = s.body[0];
  const x = head.x * CELL + CELL / 2;
  const y = head.y * CELL + CELL / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = 'rgba(0, 34, 36, 0.45)';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 2;
  const skin = ctx.createRadialGradient(-4, -5, 1, 1, 2, 14);
  skin.addColorStop(0, '#eeff9a');
  skin.addColorStop(0.45, '#9cda59');
  skin.addColorStop(1, '#347e53');
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(0, 0, 9.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(20, 82, 56, 0.7)';
  ctx.lineWidth = 1.1;
  ctx.stroke();

  const fx = s.dir.x * 3.5;
  const fy = s.dir.y * 3.5;
  const sx = s.dir.x === 0 ? 4 : 0;
  const sy = s.dir.y === 0 ? 4 : 0;
  for (const sign of [-1, 1]) {
    const ex = fx + sx * sign;
    const ey = fy + sy * sign;
    ctx.fillStyle = '#fffce8';
    ctx.beginPath();
    ctx.arc(ex, ey, 3.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#173342';
    ctx.beginPath();
    ctx.arc(ex + s.dir.x * 1.15, ey + s.dir.y * 1.15, 1.45, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.42)';
  ctx.beginPath();
  ctx.arc(-3.4, -4.4, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
