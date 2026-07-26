'use client';

import { useEffect, useRef } from 'react';
import { SPEED_SCALE, type Difficulty } from '@/lib/difficulty';
import type { GameCanvasProps } from '@/lib/games';
import { playSound } from '@/lib/sound';
import { useCanvasGame } from '@/lib/useCanvasGame';

const WORLD_W = 360;
const WORLD_H = 520;
const START_LIVES = 3;
const MAX_STARS = 48;

type Vec = { x: number; y: number };
type Bullet = Vec & { vy: number };
type Enemy = Vec & { kind: number; hp: number; wobble: number; hit: number };
type Spark = Vec & { vx: number; vy: number; life: number; max: number; color: string };
type Star = { x: number; y: number; size: number; speed: number; hue: number };

type State = {
  ship: Vec;
  enemies: Enemy[];
  bullets: Bullet[];
  sparks: Spark[];
  stars: Star[];
  wave: number;
  lives: number;
  score: number;
  time: number;
  fire: number;
  intro: number;
  gateRequested: boolean;
  invincible: number;
  deadFor: number;
};

const DIFF: Record<Difficulty, { enemy: number; fire: number }> = {
  easy: { enemy: 0.72, fire: 0.8 },
  normal: { enemy: 1, fire: 1 },
  hard: { enemy: 1.28, fire: 1.18 },
};

function makeStars(): Star[] {
  return Array.from({ length: MAX_STARS }, (_, i) => ({
    x: (i * 67) % WORLD_W,
    y: (i * 109) % WORLD_H,
    size: 0.7 + (i % 4) * 0.45,
    speed: 9 + (i % 7) * 6,
    hue: i % 5 === 0 ? 48 : i % 3 === 0 ? 205 : 260,
  }));
}

function formation(wave: number): Enemy[] {
  const rows = Math.min(4, 2 + Math.floor((wave - 1) / 2));
  const cols = Math.min(6, 4 + Math.floor(wave / 3));
  const out: Enemy[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      out.push({
        x: WORLD_W / 2 + (col - (cols - 1) / 2) * 48,
        y: 82 + row * 43,
        kind: (row + col + wave) % 3,
        hp: row === rows - 1 && wave >= 3 ? 2 : 1,
        wobble: col * 0.8 + row * 1.4,
        hit: 0,
      });
    }
  }
  return out;
}

function freshState(): State {
  return {
    ship: { x: WORLD_W / 2, y: WORLD_H - 78 },
    enemies: formation(1),
    bullets: [],
    sparks: [],
    stars: makeStars(),
    wave: 1,
    lives: START_LIVES,
    score: 0,
    time: 0,
    fire: 0,
    intro: 1.4,
    gateRequested: false,
    invincible: 1.5,
    deadFor: 0,
  };
}

function burst(s: State, x: number, y: number, color: string, count = 10) {
  for (let i = 0; i < count && s.sparks.length < 150; i += 1) {
    const angle = (Math.PI * 2 * i) / count + s.time * 3;
    const speed = 28 + ((i * 19) % 33);
    s.sparks.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.45, max: 0.45, color });
  }
}

function hit(a: Vec, b: Vec, distance: number) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy < distance * distance;
}

/** A touch-friendly, auto-firing space adventure. Drag to steer; arrow keys also fly. */
export default function StarfallSquadron({
  paused,
  input,
  api,
  restartToken,
  difficulty,
  controlsInset,
}: GameCanvasProps) {
  const stateRef = useRef<State>(freshState());

  useEffect(() => {
    stateRef.current = freshState();
  }, [restartToken]);

  const { canvasRef } = useCanvasGame({
    active: !paused,
    step: (ctx, dt, cw, ch) => {
      const s = stateRef.current;
      const playH = Math.max(160, ch - controlsInset);
      update(s, dt, input, difficulty, api, cw, playH);
      draw(ctx, s, cw, ch, playH);
    },
  });
  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />;
}

function update(s: State, dt: number, input: GameCanvasProps['input'], difficulty: Difficulty, api: GameCanvasProps['api'], cw: number, playH: number) {
  const d = DIFF[difficulty];
  s.time += dt;
  s.intro = Math.max(0, s.intro - dt);
  s.invincible = Math.max(0, s.invincible - dt);
  s.deadFor = Math.max(0, s.deadFor - dt);
  for (const star of s.stars) {
    star.y += star.speed * dt;
    if (star.y > WORLD_H) star.y -= WORLD_H;
  }

  // Pointer coordinates are normalised to the whole canvas; scale to the playable area.
  const scale = Math.min(cw / WORLD_W, playH / WORLD_H);
  const offsetX = (cw - WORLD_W * scale) / 2;
  if (input.pointerDown && input.pointerX !== null && input.pointerY !== null) {
    const targetX = (input.pointerX * cw - offsetX) / scale;
    const targetY = (input.pointerY * playH) / scale;
    const follow = Math.min(1, dt * 12);
    s.ship.x += (targetX - s.ship.x) * follow;
    s.ship.y += (targetY - s.ship.y) * follow;
  } else {
    const steer = 205 * dt;
    if (input.held.left) s.ship.x -= steer;
    if (input.held.right) s.ship.x += steer;
    if (input.held.up) s.ship.y -= steer;
    if (input.held.down) s.ship.y += steer;
  }
  s.ship.x = Math.max(24, Math.min(WORLD_W - 24, s.ship.x));
  s.ship.y = Math.max(225, Math.min(WORLD_H - 36, s.ship.y));

  s.fire -= dt;
  if (s.fire <= 0 && s.deadFor <= 0) {
    s.fire += 0.3 / d.fire;
    s.bullets.push({ x: s.ship.x - 8, y: s.ship.y - 19, vy: -390 }, { x: s.ship.x + 8, y: s.ship.y - 19, vy: -390 });
  }
  for (const bullet of s.bullets) bullet.y += bullet.vy * dt;
  s.bullets = s.bullets.filter((b) => b.y > -20);

  const descend = (6 + s.wave * 1.05) * d.enemy * SPEED_SCALE[difficulty];
  for (const enemy of s.enemies) {
    enemy.y += descend * dt;
    enemy.x += Math.sin(s.time * 1.8 + enemy.wobble) * 15 * dt;
    enemy.hit = Math.max(0, enemy.hit - dt * 5);
  }
  for (const bullet of s.bullets) {
    const enemy = s.enemies.find((e) => hit(bullet, e, 19));
    if (!enemy) continue;
    bullet.y = -30;
    enemy.hp -= 1;
    enemy.hit = 1;
    burst(s, enemy.x, enemy.y, enemy.kind === 0 ? '#ffcf6f' : enemy.kind === 1 ? '#9ee9ff' : '#f79dd2', 6);
    if (enemy.hp <= 0) {
      s.score += 10;
      api.addScore(10);
      burst(s, enemy.x, enemy.y, '#fff3a1', 12);
      playSound('coin');
    }
  }
  s.enemies = s.enemies.filter((e) => e.hp > 0);

  if (s.invincible <= 0) {
    const danger = s.enemies.find((e) => hit(e, s.ship, 26) || e.y > WORLD_H - 70);
    if (danger) {
      s.enemies = s.enemies.filter((e) => e !== danger);
      s.lives -= 1;
      s.invincible = 1.2;
      burst(s, s.ship.x, s.ship.y, '#ff8181', 18);
      playSound('wrong');
    }
  }
  if (s.lives <= 0 && s.deadFor <= 0) {
    api.died('The squadron needs a recharge');
    s.lives = START_LIVES;
    s.wave = 1;
    s.enemies = formation(1);
    s.score = 0;
    s.deadFor = 0.9;
    s.invincible = 1.5;
  }
  if (s.enemies.length === 0 && !s.gateRequested) {
    s.gateRequested = true;
    s.wave += 1;
    s.enemies = formation(s.wave);
    s.intro = 1.4;
    api.requestGate(`Wave ${s.wave - 1} cleared!`);
  }
  // requestGate pauses the canvas; reset this only after that pause has ended.
  if (s.gateRequested) s.gateRequested = false;

  for (const spark of s.sparks) {
    spark.x += spark.vx * dt;
    spark.y += spark.vy * dt;
    spark.vy += 42 * dt;
    spark.life -= dt;
  }
  s.sparks = s.sparks.filter((spark) => spark.life > 0);
}

function capsule(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy) {
  const colors = [['#ffcd65', '#e56769'], ['#78d9ff', '#6578db'], ['#ff9fce', '#a66cdc']][e.kind];
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.scale(1 + e.hit * 0.18, 1 + e.hit * 0.18);
  ctx.shadowColor = 'rgba(25, 24, 85, 0.38)';
  ctx.shadowBlur = 7;
  ctx.shadowOffsetY = 3;
  const shell = ctx.createLinearGradient(-18, -15, 18, 15);
  shell.addColorStop(0, colors[0]);
  shell.addColorStop(1, colors[1]);
  ctx.fillStyle = shell;
  capsule(ctx, -20, -13, 40, 27, 13);
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#202e65';
  capsule(ctx, -12, -8, 24, 13, 7);
  ctx.fillStyle = '#f6ffdd';
  ctx.beginPath();
  ctx.arc(-5, -2, 2.7, 0, Math.PI * 2);
  ctx.arc(5, -2, 2.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#60446d';
  ctx.fillRect(-25, 2, 5, 10);
  ctx.fillRect(20, 2, 5, 10);
  if (e.hp > 1) {
    ctx.fillStyle = '#fff3ad';
    ctx.font = '800 10px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('★', 0, -19);
  }
  ctx.restore();
}

function drawShip(ctx: CanvasRenderingContext2D, s: State) {
  const blink = s.invincible > 0 && Math.floor(s.time * 12) % 2 === 0;
  if (blink) return;
  ctx.save();
  ctx.translate(s.ship.x, s.ship.y);
  ctx.shadowColor = 'rgba(77, 220, 255, 0.72)';
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#7be6ff';
  ctx.beginPath();
  ctx.moveTo(0, -23);
  ctx.lineTo(18, 18);
  ctx.lineTo(0, 12);
  ctx.lineTo(-18, 18);
  ctx.closePath();
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#354d9b';
  ctx.beginPath();
  ctx.moveTo(0, -15);
  ctx.lineTo(8, 5);
  ctx.lineTo(-8, 5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffed92';
  ctx.beginPath();
  ctx.moveTo(-8, 14);
  ctx.lineTo(0, 28 + Math.sin(s.time * 20) * 4);
  ctx.lineTo(8, 14);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function draw(ctx: CanvasRenderingContext2D, s: State, cw: number, ch: number, playH: number) {
  ctx.clearRect(0, 0, cw, ch);
  const space = ctx.createLinearGradient(0, 0, 0, playH);
  space.addColorStop(0, '#1a215c');
  space.addColorStop(0.55, '#473280');
  space.addColorStop(1, '#112b62');
  ctx.fillStyle = space;
  ctx.fillRect(0, 0, cw, ch);
  const scale = Math.min(cw / WORLD_W, playH / WORLD_H);
  const ox = (cw - WORLD_W * scale) / 2;
  ctx.save();
  ctx.translate(ox, 0);
  ctx.scale(scale, scale);
  const nebula = ctx.createRadialGradient(WORLD_W * 0.7, 120, 10, WORLD_W * 0.7, 120, 220);
  nebula.addColorStop(0, 'rgba(255, 139, 196, 0.28)');
  nebula.addColorStop(1, 'rgba(255, 139, 196, 0)');
  ctx.fillStyle = nebula;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  for (const star of s.stars) {
    ctx.fillStyle = `hsla(${star.hue}, 90%, 88%, 0.82)`;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const bullet of s.bullets) {
    ctx.strokeStyle = '#fff5a7';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bullet.x, bullet.y + 10);
    ctx.lineTo(bullet.x, bullet.y - 7);
    ctx.stroke();
  }
  for (const enemy of s.enemies) drawEnemy(ctx, enemy);
  for (const spark of s.sparks) {
    ctx.globalAlpha = spark.life / spark.max;
    ctx.fillStyle = spark.color;
    ctx.beginPath();
    ctx.arc(spark.x, spark.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  drawShip(ctx, s);
  ctx.fillStyle = 'rgba(10, 17, 61, 0.65)';
  capsule(ctx, 12, 12, WORLD_W - 24, 36, 15);
  ctx.fillStyle = '#fff9ce';
  ctx.font = '800 16px ui-rounded, system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(`WAVE ${s.wave}`, 25, 30);
  ctx.textAlign = 'center';
  ctx.fillText(`★ ${s.score}`, WORLD_W / 2, 30);
  ctx.textAlign = 'right';
  ctx.fillText('♥'.repeat(s.lives) + '♡'.repeat(START_LIVES - s.lives), WORLD_W - 24, 30);
  if (s.intro > 0) {
    ctx.globalAlpha = Math.min(1, s.intro * 1.4);
    ctx.fillStyle = '#fff4a8';
    ctx.font = '900 25px ui-rounded, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`STARFALL WAVE ${s.wave}`, WORLD_W / 2, WORLD_H * 0.42);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}
