'use client';

import { useEffect, useRef } from 'react';
import type { Difficulty } from '@/lib/difficulty';
import type { GameCanvasProps } from '@/lib/games';
import {
  useKenneySpaceSprites,
  type KenneySpaceSprites,
  type KenneySpaceSpriteName,
} from '@/lib/kenneySpace';
import { playSound } from '@/lib/sound';
import { useCanvasGame } from '@/lib/useCanvasGame';

const W = 360;
const H = 520;
type Invader = { x: number; y: number; alive: boolean; kind: number };
type Bolt = { x: number; y: number; vy: number; enemy?: boolean };
type State = {
  shipX: number; invaders: Invader[]; bolts: Bolt[]; dir: 1 | -1; wave: number;
  lives: number; fire: number; enemyFire: number; time: number; inv: number;
};
const DESCENT: Record<Difficulty, number> = { easy: 9, normal: 13, hard: 18 };

export function makeFormation(wave: number): Invader[] {
  const rows = Math.min(5, 3 + Math.floor(wave / 3));
  const cols = 7;
  return Array.from({ length: rows * cols }, (_, i) => ({
    x: 48 + (i % cols) * 44,
    y: 86 + Math.floor(i / cols) * 38,
    alive: true,
    kind: (i + wave) % 3,
  }));
}

export function formationBounds(invaders: Invader[]) {
  const alive = invaders.filter((i) => i.alive);
  if (!alive.length) return { left: 0, right: 0, bottom: 0 };
  return {
    left: Math.min(...alive.map((i) => i.x - 15)),
    right: Math.max(...alive.map((i) => i.x + 15)),
    bottom: Math.max(...alive.map((i) => i.y + 13)),
  };
}

function fresh(): State {
  return { shipX: W / 2, invaders: makeFormation(1), bolts: [], dir: 1, wave: 1, lives: 3, fire: 0, enemyFire: 1, time: 0, inv: 1.2 };
}

export default function StarDefender({ paused, input, api, restartToken, difficulty, controlsInset }: GameCanvasProps) {
  const stateRef = useRef<State>(fresh());
  const sprites = useKenneySpaceSprites();
  useEffect(() => { stateRef.current = fresh(); }, [restartToken]);
  const { canvasRef } = useCanvasGame({
    active: !paused,
    step: (ctx, dt, cw, ch) => {
      const s = stateRef.current;
      const playH = Math.max(180, ch - controlsInset);
      const scale = Math.min(cw / W, playH / H);
      const ox = (cw - W * scale) / 2;
      s.time += dt; s.fire -= dt; s.enemyFire -= dt; s.inv = Math.max(0, s.inv - dt);
      if (input.pointerX !== null) s.shipX = (input.pointerX * cw - ox) / scale;
      else {
        if (input.held.left) s.shipX -= 230 * dt;
        if (input.held.right) s.shipX += 230 * dt;
      }
      s.shipX = Math.max(22, Math.min(W - 22, s.shipX));
      if (s.fire <= 0) {
        s.fire = 0.34;
        s.bolts.push({ x: s.shipX, y: H - 64, vy: -360 });
      }
      const aliveCount = s.invaders.filter((i) => i.alive).length;
      const speed = 22 + (s.invaders.length - aliveCount) * 1.9 + s.wave * 3;
      for (const invader of s.invaders) if (invader.alive) invader.x += s.dir * speed * dt;
      const bounds = formationBounds(s.invaders);
      if (bounds.left <= 12 || bounds.right >= W - 12) {
        s.dir = s.dir === 1 ? -1 : 1;
        for (const invader of s.invaders) if (invader.alive) {
          invader.x = Math.max(28, Math.min(W - 28, invader.x));
          invader.y += DESCENT[difficulty];
        }
      }
      if (s.enemyFire <= 0 && aliveCount > 0) {
        s.enemyFire = Math.max(.28, 1.2 - s.wave * .035) / ({ easy: .75, normal: 1, hard: 1.35 }[difficulty]);
        const shooters = s.invaders.filter((i) => i.alive);
        const shooter = shooters[Math.floor((s.time * 17 + s.wave * 3) % shooters.length)];
        s.bolts.push({ x: shooter.x, y: shooter.y + 13, vy: 190 + s.wave * 5, enemy: true });
      }
      for (const bolt of s.bolts) bolt.y += bolt.vy * dt;
      for (const bolt of s.bolts) {
        if (bolt.enemy) {
          if (s.inv <= 0 && bolt.y > H - 82 && Math.abs(bolt.x - s.shipX) < 20) {
            bolt.y = H + 50; s.lives -= 1; s.inv = 1.1; playSound('wrong');
          }
        } else {
          const target = s.invaders.find((i) => i.alive && Math.abs(i.x - bolt.x) < 17 && Math.abs(i.y - bolt.y) < 15);
          if (target) {
            target.alive = false; bolt.y = -50; api.addScore(10 + target.kind * 5); playSound('coin');
          }
        }
      }
      s.bolts = s.bolts.filter((b) => b.y > -30 && b.y < H + 30);
      if (s.lives <= 0 || formationBounds(s.invaders).bottom > H - 104) {
        s.lives = 3; s.wave = 1; s.invaders = makeFormation(1); s.bolts = []; s.inv = 1.2;
        api.died('The star shield needs recharging');
      } else if (!s.invaders.some((i) => i.alive)) {
        s.wave += 1; s.invaders = makeFormation(s.wave); s.bolts = []; s.inv = 1.2;
        api.requestGate(`Star defense wave ${s.wave - 1} cleared!`);
      }
      draw(ctx, s, cw, ch, playH, sprites);
    },
  });
  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />;
}

function draw(
  ctx: CanvasRenderingContext2D,
  s: State,
  cw: number,
  ch: number,
  playH: number,
  sprites: KenneySpaceSprites | null,
) {
  const scale = Math.min(cw / W, playH / H), ox = (cw - W * scale) / 2;
  ctx.fillStyle = '#030615'; ctx.fillRect(0, 0, cw, ch);
  ctx.save(); ctx.translate(ox, 0); ctx.scale(scale, scale);
  const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#171552'); bg.addColorStop(.6, '#081b39'); bg.addColorStop(1, '#061321');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 70; i += 1) { ctx.fillStyle = `rgba(210,235,255,${.25 + (i % 3) * .2})`; ctx.fillRect((i * 83) % W, (i * 47 + s.time * (4 + i % 4)) % H, i % 8 === 0 ? 2 : 1, i % 8 === 0 ? 2 : 1); }
  for (const invader of s.invaders) {
    if (invader.alive) drawInvader(ctx, invader, s.time, sprites);
  }
  for (const bolt of s.bolts) {
    ctx.shadowColor = bolt.enemy ? '#ff6c9e' : '#73f6ff'; ctx.shadowBlur = 10; ctx.fillStyle = bolt.enemy ? '#ff9abc' : '#d6ffff';
    ctx.fillRect(bolt.x - 2, bolt.y - 7, 4, 14); ctx.shadowBlur = 0;
  }
  drawPlayerShip(ctx, s, sprites);
  ctx.fillStyle = 'rgba(4,7,28,.8)'; ctx.beginPath(); ctx.roundRect(13, 13, W - 26, 42, 15); ctx.fill();
  ctx.font = '900 14px ui-rounded, system-ui, sans-serif'; ctx.textBaseline = 'middle';
  ctx.textAlign = 'left'; ctx.fillStyle = '#75efff'; ctx.fillText(`WAVE ${s.wave}`, 27, 34);
  ctx.textAlign = 'center'; ctx.fillStyle = '#fff0a6'; ctx.fillText(`${s.invaders.filter(i => i.alive).length} LEFT`, W / 2, 34);
  ctx.textAlign = 'right'; ctx.fillStyle = '#ff8bad'; ctx.fillText('♥'.repeat(s.lives), W - 26, 34);
  ctx.restore(); ctx.fillStyle = '#02040e'; ctx.fillRect(0, playH, cw, Math.max(0, ch - playH));
}

const ENEMY_SPRITES: KenneySpaceSpriteName[] = ['enemy-red', 'enemy-blue', 'enemy-green'];

function drawPlayerShip(
  ctx: CanvasRenderingContext2D,
  s: State,
  sprites: KenneySpaceSprites | null,
) {
  ctx.save();
  ctx.translate(s.shipX, H - 58);
  if (sprites) {
    ctx.shadowColor = '#71efff';
    ctx.shadowBlur = 15;
    ctx.drawImage(sprites['player-ship-blue'], -24, -19, 48, 36);
    ctx.shadowBlur = 0;
    if (s.inv > 0) {
      ctx.globalAlpha = 0.26 + Math.sin(s.time * 8) * 0.08;
      ctx.drawImage(sprites.shield, -31, -31, 62, 62);
    }
  } else {
    ctx.shadowColor = '#71efff';
    ctx.shadowBlur = 15;
    ctx.fillStyle = '#a9f6ff';
    ctx.beginPath();
    ctx.moveTo(0, -19);
    ctx.lineTo(21, 14);
    ctx.lineTo(8, 9);
    ctx.lineTo(0, 15);
    ctx.lineTo(-8, 9);
    ctx.lineTo(-21, 14);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawInvader(
  ctx: CanvasRenderingContext2D,
  i: Invader,
  time: number,
  sprites: KenneySpaceSprites | null,
) {
  const colors = [['#fbc85f', '#ff7a7a'], ['#70e5ff', '#6d7cff'], ['#f58fe1', '#a66ee8']][i.kind];
  ctx.save();
  ctx.translate(i.x, i.y + Math.sin(time * 5 + i.x) * 2);
  ctx.shadowColor = colors[0];
  ctx.shadowBlur = 9;
  if (sprites) {
    ctx.drawImage(sprites[ENEMY_SPRITES[i.kind]], -18, -16, 36, 33);
  } else {
    ctx.fillStyle = colors[0];
    ctx.beginPath();
    ctx.roundRect(-15, -10, 30, 20, 7);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = colors[1];
    ctx.fillRect(-20, -4, 6, 12);
    ctx.fillRect(14, -4, 6, 12);
    ctx.fillStyle = '#121633';
    ctx.fillRect(-8, -4, 4, 5);
    ctx.fillRect(4, -4, 4, 5);
  }
  ctx.restore();
}
