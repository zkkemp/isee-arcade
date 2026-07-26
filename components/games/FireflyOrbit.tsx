'use client';

import { useEffect, useRef } from 'react';
import type { Difficulty } from '@/lib/difficulty';
import type { GameCanvasProps } from '@/lib/games';
import { playSound } from '@/lib/sound';
import { useCanvasGame } from '@/lib/useCanvasGame';

const WORLD_W = 320;
const WORLD_H = 480;
const START_LIVES = 3;
const CATCHES_PER_LEVEL = 6;
const TAU = Math.PI * 2;

type Spark = { x: number; y: number; vx: number; vy: number; life: number; color: string };
type OrbitState = {
  angle: number;
  target: number;
  level: number;
  catches: number;
  lives: number;
  time: number;
  message: string;
  messageT: number;
  sparks: Spark[];
};

const SPEED: Record<Difficulty, number> = { easy: 0.92, normal: 1.22, hard: 1.58 };
const CATCH_WINDOW: Record<Difficulty, number> = { easy: 0.52, normal: 0.4, hard: 0.32 };

function normalize(angle: number): number {
  return ((angle % TAU) + TAU) % TAU;
}

/** Smallest distance between two angles, in radians. */
export function orbitDistance(a: number, b: number): number {
  const d = Math.abs(normalize(a) - normalize(b));
  return Math.min(d, TAU - d);
}

function nextTarget(s: OrbitState): number {
  // A deterministic golden-angle hop keeps targets varied without impossible
  // back-to-back placements.
  return normalize(s.target + 2.4 + (s.catches % 3) * 0.37);
}

export function createOrbitState(): OrbitState {
  return {
    angle: Math.PI,
    target: 0.35,
    level: 1,
    catches: 0,
    lives: START_LIVES,
    time: 0,
    message: 'Tap when the lights meet!',
    messageT: 3,
    sparks: [],
  };
}

function burst(s: OrbitState, x: number, y: number, color: string) {
  for (let i = 0; i < 14; i += 1) {
    const a = (i / 14) * TAU;
    s.sparks.push({
      x,
      y,
      vx: Math.cos(a) * (28 + (i % 4) * 10),
      vy: Math.sin(a) * (28 + (i % 4) * 10),
      life: 0.6,
      color,
    });
  }
}

function attemptCatch(
  s: OrbitState,
  difficulty: Difficulty,
): 'catch' | 'miss' | 'level' | 'dead' {
  if (orbitDistance(s.angle, s.target) <= CATCH_WINDOW[difficulty]) {
    s.catches += 1;
    s.message = 'Firefly friends!';
    s.messageT = 0.75;
    const result = s.catches % CATCHES_PER_LEVEL === 0 ? 'level' : 'catch';
    if (result === 'level') {
      s.level += 1;
      s.message = `Garden ${s.level} glowing!`;
      s.messageT = 1.5;
    }
    s.target = nextTarget(s);
    return result;
  }
  s.lives -= 1;
  s.message = s.lives > 0 ? 'So close — watch the glow!' : 'The fireflies flew home!';
  s.messageT = 1.2;
  return s.lives > 0 ? 'miss' : 'dead';
}

function orbPoint(angle: number, cx: number, cy: number, radius: number) {
  return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
}

function drawFirefly(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  glow: number,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = color;
  ctx.shadowBlur = glow;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,.78)';
  ctx.beginPath();
  ctx.ellipse(-7, -3, 6, 3, -0.45, 0, TAU);
  ctx.ellipse(7, -3, 6, 3, 0.45, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#44354f';
  ctx.beginPath();
  ctx.arc(0, -6, 3.5, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function draw(ctx: CanvasRenderingContext2D, s: OrbitState, cw: number, ch: number) {
  const scale = Math.min(cw / WORLD_W, ch / WORLD_H);
  const ox = (cw - WORLD_W * scale) / 2;
  const oy = (ch - WORLD_H * scale) / 2;
  ctx.fillStyle = '#101638';
  ctx.fillRect(0, 0, cw, ch);
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);

  const sky = ctx.createLinearGradient(0, 0, 0, WORLD_H);
  sky.addColorStop(0, '#24336d');
  sky.addColorStop(0.58, '#5f4985');
  sky.addColorStop(1, '#193f4b');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  ctx.fillStyle = 'rgba(255,246,184,.9)';
  ctx.beginPath();
  ctx.arc(252, 67, 27, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#384174';
  ctx.beginPath();
  ctx.arc(240, 57, 27, 0, TAU);
  ctx.fill();

  // Layered garden silhouettes.
  ctx.fillStyle = '#233f52';
  for (let x = -12; x < WORLD_W + 20; x += 34) {
    const h = 34 + ((x * 7) % 24);
    ctx.beginPath();
    ctx.ellipse(x, WORLD_H - 54, 29, h, 0, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = '#122f3a';
  ctx.fillRect(0, WORLD_H - 58, WORLD_W, 58);

  const cx = WORLD_W / 2;
  const cy = 250;
  const radius = 104;
  ctx.strokeStyle = 'rgba(210,235,255,.2)';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 9]);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  for (let ring = 0; ring < 3; ring += 1) {
    ctx.strokeStyle = `rgba(255,239,144,${0.08 - ring * 0.018})`;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + ring * 8, s.target - 0.38, s.target + 0.38);
    ctx.stroke();
  }

  const target = orbPoint(s.target, cx, cy, radius);
  const player = orbPoint(s.angle, cx, cy, radius);
  drawFirefly(ctx, target.x, target.y, '#fff19a', 24 + Math.sin(s.time * 8) * 5);
  drawFirefly(ctx, player.x, player.y, '#8ceaff', 18);

  for (const spark of s.sparks) {
    ctx.globalAlpha = Math.max(0, spark.life / 0.6);
    ctx.fillStyle = spark.color;
    ctx.beginPath();
    ctx.arc(spark.x, spark.y, 2.3, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = 'rgba(12,18,52,.68)';
  ctx.beginPath();
  ctx.roundRect(14, 14, WORLD_W - 28, 42, 16);
  ctx.fill();
  ctx.fillStyle = '#fff8d2';
  ctx.font = '900 15px ui-rounded, system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(`GARDEN ${s.level}`, 28, 35);
  ctx.textAlign = 'center';
  ctx.fillText(`✦ ${s.catches % CATCHES_PER_LEVEL}/${CATCHES_PER_LEVEL}`, WORLD_W / 2, 35);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ff91ad';
  ctx.fillText('♥'.repeat(s.lives) + '♡'.repeat(START_LIVES - s.lives), WORLD_W - 27, 35);

  if (s.messageT > 0) {
    ctx.globalAlpha = Math.min(1, s.messageT * 2);
    ctx.textAlign = 'center';
    ctx.font = '900 17px ui-rounded, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(15,21,55,.55)';
    ctx.fillText(s.message, cx + 1, 405);
    ctx.fillStyle = '#fff8d2';
    ctx.fillText(s.message, cx, 404);
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = 'center';
  ctx.font = '800 10px ui-rounded, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,.68)';
  ctx.fillText('TAP OR PRESS SPACE WHEN THE LIGHTS MEET', cx, 440);
  ctx.restore();
}

/** A one-tap timing game: catch the golden firefly as the blue light circles the garden. */
export default function FireflyOrbit({
  paused,
  input,
  api,
  restartToken,
  difficulty,
}: GameCanvasProps) {
  const stateRef = useRef<OrbitState>(createOrbitState());
  useEffect(() => {
    stateRef.current = createOrbitState();
  }, [restartToken, difficulty]);

  const { canvasRef } = useCanvasGame({
    active: !paused,
    step: (ctx, dt, cw, ch) => {
      const s = stateRef.current;
      s.time += dt;
      s.angle = normalize(s.angle + (SPEED[difficulty] + Math.min(0.65, s.level * 0.055)) * dt);
      s.messageT = Math.max(0, s.messageT - dt);
      for (const spark of s.sparks) {
        spark.x += spark.vx * dt;
        spark.y += spark.vy * dt;
        spark.vy += 30 * dt;
        spark.life -= dt;
      }
      s.sparks = s.sparks.filter((spark) => spark.life > 0);

      if (input.consumePointerPress() || input.consumeJump()) {
        const target = orbPoint(s.target, WORLD_W / 2, 250, 104);
        const result = attemptCatch(s, difficulty);
        if (result === 'catch' || result === 'level') {
          burst(s, target.x, target.y, '#fff2a0');
          api.addScore(result === 'level' ? 35 : 10);
          playSound(result === 'level' ? 'pass' : 'coin');
          if (result === 'level') api.requestGate(`Firefly garden ${s.level - 1} lit up!`);
        } else {
          playSound('wrong');
          if (result === 'dead') {
            api.died('The fireflies flew home');
            stateRef.current = createOrbitState();
          } else {
            api.setStatus(`${s.lives} glow chance${s.lives === 1 ? '' : 's'} left`);
          }
        }
      }
      draw(ctx, s, cw, ch);
    },
  });

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full touch-none"
      role="img"
      tabIndex={0}
      aria-label="Firefly Orbit. Tap the screen or press Space when the two glowing fireflies meet."
    />
  );
}
