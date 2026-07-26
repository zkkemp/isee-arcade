'use client';

import { useEffect, useRef } from 'react';
import type { Difficulty } from '@/lib/difficulty';
import type { GameCanvasProps } from '@/lib/games';
import { playSound } from '@/lib/sound';
import { useCanvasGame } from '@/lib/useCanvasGame';

/** Sky Stack: tap once to drop the moving cloud-brick onto the tower. */
export const SKY_STACK_W = 240;
export const START_LIVES = 3;
const BASE_W = 104;
const BLOCK_H = 15;
const LEVEL_STEPS = 8;

export type StackBlock = { x: number; w: number; y: number; hue: number };
export type MovingBlock = StackBlock & { dir: 1 | -1; speed: number };
export type Spark = { x: number; y: number; vx: number; vy: number; life: number; color: string };

export type SkyState = {
  blocks: StackBlock[];
  moving: MovingBlock;
  level: number;
  lives: number;
  placed: number;
  time: number;
  shake: number;
  message: string;
  messageT: number;
  sparks: Spark[];
};

function difficultySpeed(difficulty: Difficulty): number {
  return difficulty === 'easy' ? 53 : difficulty === 'hard' ? 86 : 68;
}

/**
 * The level ramp is deliberately visible and bounded: every new skyline starts
 * a little narrower and sweeps faster, but never shrinks below a width that is
 * reasonable to catch. Pure so the progression can be checked without canvas.
 */
export function levelParams(level: number, difficulty: Difficulty): { baseWidth: number; speed: number } {
  const safeLevel = Math.max(1, level);
  return {
    baseWidth: Math.max(58, BASE_W - (safeLevel - 1) * 7),
    speed: Math.min(154, difficultySpeed(difficulty) + (safeLevel - 1) * 9),
  };
}

function freshMoving(width: number, y: number, level: number, difficulty: Difficulty): MovingBlock {
  const fromLeft = level % 2 === 0;
  return {
    x: fromLeft ? -width + 6 : SKY_STACK_W - 6,
    w: width,
    y,
    dir: fromLeft ? 1 : -1,
    speed: levelParams(level, difficulty).speed,
    hue: (level * 43 + 185) % 360,
  };
}

export function createSkyState(difficulty: Difficulty, worldH: number): SkyState {
  const baseY = worldH - 38;
  const base: StackBlock = { x: (SKY_STACK_W - BASE_W) / 2, w: BASE_W, y: baseY, hue: 205 };
  return {
    blocks: [base],
    moving: freshMoving(BASE_W, baseY - BLOCK_H, 1, difficulty),
    level: 1,
    lives: START_LIVES,
    placed: 0,
    time: 0,
    shake: 0,
    message: 'Tap to drop!',
    messageT: 2.6,
    sparks: [],
  };
}

/** The precise horizontal amount a dropped block can keep. Pure and testable. */
export function overlapWidth(a: StackBlock, b: StackBlock): { x: number; w: number } {
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.w, b.x + b.w);
  return { x: left, w: Math.max(0, right - left) };
}

/** A new level has a fresh, friendly-wide tower, while score/lives stay in the shell/state. */
function beginLevel(s: SkyState, worldH: number, difficulty: Difficulty): void {
  const width = levelParams(s.level, difficulty).baseWidth;
  const baseY = worldH - 38;
  s.blocks = [{ x: (SKY_STACK_W - width) / 2, w: width, y: baseY, hue: (s.level * 43 + 162) % 360 }];
  s.moving = freshMoving(width, baseY - BLOCK_H, s.level, difficulty);
  const p = levelParams(s.level, difficulty);
  s.message = `Level ${s.level}: ${Math.round(p.speed)} speed, ${Math.round(p.baseWidth)} wide`;
  s.messageT = 2;
}

function sprinkle(s: SkyState, x: number, y: number, count: number, color: string): void {
  for (let i = 0; i < count; i += 1) {
    const a = (Math.PI * 2 * i) / count + s.time * 2;
    s.sparks.push({
      x,
      y,
      vx: Math.cos(a) * (20 + (i % 3) * 9),
      vy: Math.sin(a) * 24 - 18,
      life: 0.55 + (i % 2) * 0.15,
      color,
    });
  }
  if (s.sparks.length > 70) s.sparks.splice(0, s.sparks.length - 70);
}

function resetAfterFall(s: SkyState, worldH: number, difficulty: Difficulty): void {
  const lives = s.lives;
  const level = s.level;
  const fresh = createSkyState(difficulty, worldH);
  Object.assign(s, fresh, { lives, level });
  beginLevel(s, worldH, difficulty);
}

/** Drops the current block. Caller owns scores, gates, sounds, and terminal death. */
export function dropSkyBlock(s: SkyState, worldH: number, difficulty: Difficulty): 'placed' | 'miss' | 'level' {
  const top = s.blocks[s.blocks.length - 1];
  const hit = overlapWidth(s.moving, top);
  if (hit.w < 5) {
    s.lives -= 1;
    s.shake = 0.34;
    s.message = s.lives > 0 ? 'Whoops — try again!' : 'The tower tumbled!';
    s.messageT = 1.3;
    sprinkle(s, s.moving.x + s.moving.w / 2, s.moving.y + BLOCK_H / 2, 13, '#ff8b8b');
    if (s.lives > 0) resetAfterFall(s, worldH, difficulty);
    return 'miss';
  }

  const perfect = Math.abs(hit.w - Math.min(top.w, s.moving.w)) < 3;
  const landed: StackBlock = { x: hit.x, w: hit.w, y: top.y - BLOCK_H, hue: s.moving.hue };
  s.blocks.push(landed);
  s.placed += 1;
  s.shake = perfect ? 0.06 : 0.025;
  s.message = perfect ? 'Perfect stack!' : 'Nice catch!';
  s.messageT = 0.65;
  sprinkle(s, landed.x + landed.w / 2, landed.y + 5, perfect ? 10 : 6, perfect ? '#fff4a8' : '#d7f4ff');

  if (s.placed % LEVEL_STEPS === 0) {
    s.level += 1;
    beginLevel(s, worldH, difficulty);
    return 'level';
  }
  s.moving = freshMoving(landed.w, landed.y - BLOCK_H, s.level, difficulty);
  return 'placed';
}

function drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, alpha: number): void {
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  ctx.beginPath();
  ctx.arc(x, y, 11 * scale, Math.PI, 0);
  ctx.arc(x + 14 * scale, y - 5 * scale, 14 * scale, Math.PI, 0);
  ctx.arc(x + 31 * scale, y, 10 * scale, Math.PI, 0);
  ctx.lineTo(x + 41 * scale, y + 12 * scale);
  ctx.lineTo(x - 11 * scale, y + 12 * scale);
  ctx.closePath();
  ctx.fill();
}

function drawBlock(ctx: CanvasRenderingContext2D, block: StackBlock, moving = false): void {
  const grad = ctx.createLinearGradient(block.x, block.y, block.x, block.y + BLOCK_H);
  grad.addColorStop(0, `hsl(${block.hue}, 78%, ${moving ? '76%' : '68%'})`);
  grad.addColorStop(1, `hsl(${block.hue}, 65%, ${moving ? '48%' : '43%'})`);
  ctx.fillStyle = 'rgba(30,43,80,0.20)';
  ctx.beginPath();
  ctx.ellipse(block.x + block.w / 2, block.y + BLOCK_H + 2.5, block.w * 0.43, 2.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(block.x, block.y, block.w, BLOCK_H, 4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.58)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.27)';
  ctx.fillRect(block.x + 5, block.y + 3, Math.max(0, block.w - 10), 2);
  // Little window stitches give the blocks a toy-town warmth.
  if (block.w > 26) {
    ctx.fillStyle = 'rgba(255,248,190,0.58)';
    for (let x = block.x + 10; x < block.x + block.w - 5; x += 17) ctx.fillRect(x, block.y + 8, 5, 3);
  }
}

function drawScene(ctx: CanvasRenderingContext2D, s: SkyState, cw: number, ch: number, inset: number): void {
  const usableH = Math.max(80, ch - inset);
  const scale = cw / SKY_STACK_W;
  const worldH = usableH / scale;
  ctx.fillStyle = '#131d46';
  ctx.fillRect(0, 0, cw, ch);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, cw, usableH);
  ctx.clip();
  ctx.scale(scale, scale);

  const sky = ctx.createLinearGradient(0, 0, 0, worldH);
  sky.addColorStop(0, '#5f78d8');
  sky.addColorStop(0.55, '#a9d7f4');
  sky.addColorStop(1, '#f7cfad');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, SKY_STACK_W, worldH);
  const sun = ctx.createRadialGradient(185, 35, 4, 185, 35, 37);
  sun.addColorStop(0, 'rgba(255,249,188,0.96)');
  sun.addColorStop(1, 'rgba(255,229,143,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(148, 0, 74, 74);
  drawCloud(ctx, 16 + Math.sin(s.time * 0.18) * 10, 48, 0.9, 0.42);
  drawCloud(ctx, 158 + Math.sin(s.time * 0.14 + 1) * 9, 92, 0.72, 0.36);
  drawCloud(ctx, 55 + Math.sin(s.time * 0.11 + 3) * 7, 162, 1.15, 0.25);

  // Dreamy distant hills establish scale beneath the tiny toy tower.
  ctx.fillStyle = '#7ebc9b';
  ctx.beginPath();
  ctx.moveTo(0, worldH - 35);
  ctx.quadraticCurveTo(45, worldH - 86, 100, worldH - 39);
  ctx.quadraticCurveTo(168, worldH - 90, SKY_STACK_W, worldH - 43);
  ctx.lineTo(SKY_STACK_W, worldH);
  ctx.lineTo(0, worldH);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#559876';
  ctx.fillRect(0, worldH - 25, SKY_STACK_W, 25);

  const shakeX = s.shake > 0 ? Math.sin(s.time * 45) * s.shake * 8 : 0;
  ctx.save();
  ctx.translate(shakeX, 0);
  for (const b of s.blocks) drawBlock(ctx, b);
  drawBlock(ctx, s.moving, true);
  ctx.restore();
  for (const p of s.sparks) {
    ctx.globalAlpha = Math.max(0, p.life / 0.7);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
  }
  ctx.globalAlpha = 1;

  // Accessible, high-contrast in-canvas instruction / progress language.
  ctx.fillStyle = 'rgba(20,29,72,0.62)';
  ctx.beginPath();
  ctx.roundRect(8, 8, 137, 31, 7);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(`LEVEL ${s.level}  •  ${s.placed % LEVEL_STEPS}/${LEVEL_STEPS}`, 14, 19);
  ctx.font = 'bold 7px ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = '#edf7ff';
  ctx.fillText(`${Math.round(s.moving.speed)} SPEED  •  ${Math.round(s.blocks[0].w)} WIDE`, 14, 28);
  ctx.fillText('TAP / SPACE TO DROP', 14, 36);
  for (let i = 0; i < START_LIVES; i += 1) {
    ctx.fillStyle = i < s.lives ? '#ff7498' : 'rgba(255,255,255,0.28)';
    ctx.beginPath();
    ctx.arc(202 + i * 10, 16, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  if (s.messageT > 0) {
    const a = Math.min(1, s.messageT * 2);
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.font = 'bold 12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(25,35,82,0.40)';
    ctx.fillText(s.message, SKY_STACK_W / 2 + 1, 52 + 1);
    ctx.fillStyle = '#fffbed';
    ctx.fillText(s.message, SKY_STACK_W / 2, 52);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

export default function SkyStack({ paused, input, api, restartToken, difficulty, controlsInset }: GameCanvasProps) {
  const stateRef = useRef<SkyState | null>(null);
  const difficultyRef = useRef(difficulty);
  useEffect(() => {
    difficultyRef.current = difficulty;
    stateRef.current = null;
  }, [restartToken, difficulty]);

  const { canvasRef } = useCanvasGame({
    active: !paused,
    step: (ctx, dt, cw, ch) => {
      const scale = cw / SKY_STACK_W;
      const worldH = Math.max(80, ch - controlsInset) / scale;
      let s = stateRef.current;
      if (!s) {
        s = createSkyState(difficultyRef.current, worldH);
        stateRef.current = s;
      }
      s.time += dt;
      s.shake = Math.max(0, s.shake - dt * 1.7);
      s.messageT = Math.max(0, s.messageT - dt);
      for (const p of s.sparks) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 58 * dt;
        p.life -= dt;
      }
      s.sparks = s.sparks.filter((p) => p.life > 0);

      s.moving.x += s.moving.dir * s.moving.speed * dt;
      if (s.moving.x <= -2) {
        s.moving.x = -2;
        s.moving.dir = 1;
      } else if (s.moving.x + s.moving.w >= SKY_STACK_W + 2) {
        s.moving.x = SKY_STACK_W + 2 - s.moving.w;
        s.moving.dir = -1;
      }

      // The shell's tapjump convention emits one consumeJump edge for touch,
      // mouse, Space, and Enter — holding a key cannot accidentally drop a run.
      const wantsDrop = input.consumeJump();
      if (wantsDrop) {
        const result = dropSkyBlock(s, worldH, difficultyRef.current);
        if (result === 'placed') {
          api.addScore(10);
          playSound('coin', Math.min(8, s.placed));
        } else if (result === 'level') {
          api.addScore(30);
          playSound('pass');
          api.requestGate(`Sky Stack level ${s.level - 1} cleared`);
        } else {
          playSound('wrong');
          if (s.lives <= 0) {
            api.died('Your sky tower tumbled');
            stateRef.current = null;
          } else api.setStatus(`${s.lives} tower chance${s.lives === 1 ? '' : 's'} left`);
        }
      }
      drawScene(ctx, s, cw, ch, controlsInset);
    },
  });

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full touch-none"
      role="img"
      tabIndex={0}
      aria-label="Sky Stack. Tap the screen or press Space to drop the moving block onto the tower."
    />
  );
}
