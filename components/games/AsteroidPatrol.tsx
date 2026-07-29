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
const TAU = Math.PI * 2;
type Rock = { x: number; y: number; vx: number; vy: number; r: number; spin: number; kind?: number };
type Shot = { x: number; y: number; vx: number; vy: number; life: number };
type State = {
  x: number; y: number; vx: number; vy: number; angle: number;
  rocks: Rock[]; shots: Shot[]; wave: number; lives: number; fire: number; inv: number; time: number; thrust: number;
};

const ROCK_SPEED: Record<Difficulty, number> = { easy: 0.72, normal: 1, hard: 1.3 };

export function wrap(value: number, max: number) {
  return ((value % max) + max) % max;
}

export function splitRock(rock: Rock): Rock[] {
  if (rock.r <= 13) return [];
  return [-1, 1].map((dir) => ({
    x: rock.x,
    y: rock.y,
    vx: rock.vx * 0.55 + dir * 42,
    vy: rock.vy * 0.55 - dir * 35,
    r: rock.r * 0.58,
    spin: rock.spin + dir,
    kind: ((rock.kind ?? 0) + (dir === 1 ? 1 : 2)) % 6,
  }));
}

export function makeWave(wave: number): Rock[] {
  // Waves rise in variety rather than ballooning into thirty tiny rocks. This
  // keeps a field clearable with the large, forgiving iPad controls.
  const count = Math.min(7, 2 + Math.ceil(wave * 0.65));
  return Array.from({ length: count }, (_, i) => {
    const side = i % 4;
    const rawX = ((i * 37) % 75) - 37;
    const rawY = ((i * 53) % 75) - 37;
    return {
      x: side === 0 ? 12 : side === 1 ? W - 12 : 45 + ((i * 83) % (W - 90)),
      y: side === 2 ? 18 : side === 3 ? H - 18 : 55 + ((i * 117) % (H - 110)),
      vx: rawX === 0 ? 32 : rawX,
      vy: rawY === 0 ? -29 : rawY,
      r: 22 + (i % 3) * 5,
      spin: i * 0.7,
      kind: i % 6,
    };
  });
}

function fresh(): State {
  return { x: W / 2, y: H / 2, vx: 0, vy: 0, angle: -Math.PI / 2, rocks: makeWave(1), shots: [], wave: 1, lives: 3, fire: 0, inv: 1.5, time: 0, thrust: 0 };
}

function near(a: { x: number; y: number }, b: { x: number; y: number }, d: number) {
  const dx = Math.min(Math.abs(a.x - b.x), W - Math.abs(a.x - b.x));
  const dy = Math.min(Math.abs(a.y - b.y), H - Math.abs(a.y - b.y));
  return dx * dx + dy * dy < d * d;
}

export default function AsteroidPatrol({ paused, input, api, restartToken, difficulty, controlsInset }: GameCanvasProps) {
  const stateRef = useRef<State>(fresh());
  const sprites = useKenneySpaceSprites();
  useEffect(() => { stateRef.current = fresh(); }, [restartToken]);
  const { canvasRef } = useCanvasGame({
    active: !paused,
    step: (ctx, dt, cw, ch) => {
      const s = stateRef.current;
      const playH = Math.max(180, ch - controlsInset);
      s.time += dt;
      s.inv = Math.max(0, s.inv - dt);
      s.thrust = Math.max(0, s.thrust - dt);
      s.fire -= dt;
      // Desktop holds a key, while the shared iPad D-pad intentionally sends
      // discrete taps. Supporting both makes every labelled control real.
      const tap = input.consumeTap();
      const jump = input.consumeJump();
      if (input.held.left) s.angle -= 3.5 * dt;
      if (input.held.right) s.angle += 3.5 * dt;
      if (tap === 'left') s.angle -= 0.34;
      if (tap === 'right') s.angle += 0.34;
      const wantsThrust = input.held.up || tap === 'up';
      const wantsBrake = input.held.down || tap === 'down';
      if (wantsThrust) {
        s.vx += Math.cos(s.angle) * 105 * dt;
        s.vy += Math.sin(s.angle) * 105 * dt;
        // A tap is deliberately a small engine burst rather than a one-frame
        // sample, otherwise the touch pad could never steer the ship far enough.
        if (tap === 'up') {
          s.vx += Math.cos(s.angle) * 18;
          s.vy += Math.sin(s.angle) * 18;
        }
        s.thrust = 0.12;
      }
      if (wantsBrake) {
        s.vx *= Math.pow(0.12, dt);
        s.vy *= Math.pow(0.12, dt);
        if (tap === 'down') { s.vx *= 0.62; s.vy *= 0.62; }
      }
      // Thrust doubles as friendly auto-fire. Keyboard Space/Z still fires
      // directly, so neither control scheme needs a tiny extra button.
      if ((wantsThrust || jump) && s.fire <= 0) {
        s.fire = 0.22;
        s.shots.push({ x: s.x + Math.cos(s.angle) * 16, y: s.y + Math.sin(s.angle) * 16, vx: s.vx + Math.cos(s.angle) * 300, vy: s.vy + Math.sin(s.angle) * 300, life: 1.15 });
        playSound('click');
      }
      s.vx *= Math.pow(0.74, dt);
      s.vy *= Math.pow(0.74, dt);
      s.x = wrap(s.x + s.vx * dt, W);
      s.y = wrap(s.y + s.vy * dt, H);
      for (const rock of s.rocks) {
        rock.x = wrap(rock.x + rock.vx * ROCK_SPEED[difficulty] * dt, W);
        rock.y = wrap(rock.y + rock.vy * ROCK_SPEED[difficulty] * dt, H);
        rock.spin += dt;
      }
      for (const shot of s.shots) {
        shot.x = wrap(shot.x + shot.vx * dt, W);
        shot.y = wrap(shot.y + shot.vy * dt, H);
        shot.life -= dt;
      }
      const spawned: Rock[] = [];
      for (const shot of s.shots) {
        const rock = s.rocks.find((candidate) => candidate.r > 0 && near(shot, candidate, candidate.r + 3));
        if (!rock) continue;
        shot.life = 0;
        const wasLarge = rock.r > 18;
        spawned.push(...splitRock(rock));
        rock.r = -1;
        api.addScore(wasLarge ? 25 : 50);
        playSound('coin');
      }
      s.rocks = s.rocks.filter((rock) => rock.r > 0).concat(spawned);
      s.shots = s.shots.filter((shot) => shot.life > 0);
      if (s.inv <= 0 && s.rocks.some((rock) => near(s, rock, rock.r + 9))) {
        s.lives -= 1;
        s.inv = 1.6;
        s.x = W / 2; s.y = H / 2; s.vx = 0; s.vy = 0;
        playSound('wrong');
        if (s.lives <= 0) {
          s.lives = 3; s.wave = 1; s.rocks = makeWave(1);
          api.died('The patrol ship needs repairs');
        }
      }
      if (s.rocks.length === 0) {
        s.wave += 1;
        s.rocks = makeWave(s.wave);
        s.inv = 1.2;
        api.requestGate(`Asteroid field ${s.wave - 1} cleared!`);
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
  const scale = Math.min(cw / W, playH / H);
  const ox = (cw - W * scale) / 2;
  ctx.fillStyle = '#050719'; ctx.fillRect(0, 0, cw, ch);
  ctx.save(); ctx.translate(ox, 0); ctx.scale(scale, scale);
  const bg = ctx.createRadialGradient(W * .45, H * .35, 20, W * .45, H * .35, H * .7);
  bg.addColorStop(0, '#252255'); bg.addColorStop(.5, '#11183a'); bg.addColorStop(1, '#050719');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 80; i += 1) {
    const x = (i * 97) % W; const y = (i * 61) % H;
    ctx.fillStyle = i % 7 === 0 ? '#ffe9a6' : 'rgba(189,222,255,.72)';
    ctx.fillRect(x, y, i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1);
  }
  for (const shot of s.shots) {
    ctx.shadowColor = '#8cf5ff'; ctx.shadowBlur = 10; ctx.fillStyle = '#d9ffff';
    ctx.beginPath(); ctx.arc(shot.x, shot.y, 2.5, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
  }
  for (const r of s.rocks) drawRock(ctx, r, sprites);
  drawShip(ctx, s, sprites);
  ctx.fillStyle = 'rgba(5,8,28,.76)'; ctx.beginPath(); ctx.roundRect(12, 12, W - 24, 40, 15); ctx.fill();
  ctx.font = '900 14px ui-rounded, system-ui, sans-serif'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#8cf5ff'; ctx.textAlign = 'left'; ctx.fillText(`FIELD ${s.wave}`, 25, 32);
  ctx.fillStyle = '#fff4b4'; ctx.textAlign = 'center'; ctx.fillText(`${s.rocks.length} ROCKS`, W / 2, 32);
  ctx.fillStyle = '#ff8da8'; ctx.textAlign = 'right'; ctx.fillText('♥'.repeat(s.lives), W - 24, 32);
  ctx.textAlign = 'center'; ctx.font = '800 11px ui-rounded, system-ui, sans-serif'; ctx.fillStyle = 'rgba(225,244,255,.88)';
  ctx.fillText('◀ ▶ TURN   •   ▲ THRUST + AUTO-FIRE   •   ▼ BRAKE', W / 2, H - 18);
  ctx.restore();
  ctx.fillStyle = '#030512'; ctx.fillRect(0, playH, cw, Math.max(0, ch - playH));
}

const BIG_METEORS: KenneySpaceSpriteName[] = [
  'meteor-big-1',
  'meteor-big-2',
  'meteor-big-3',
  'meteor-big-4',
];

function drawRock(
  ctx: CanvasRenderingContext2D,
  r: Rock,
  sprites: KenneySpaceSprites | null,
) {
  ctx.save(); ctx.translate(r.x, r.y); ctx.rotate(r.spin);
  if (sprites) {
    const name =
      r.r > 18
        ? BIG_METEORS[(r.kind ?? 0) % BIG_METEORS.length]
        : r.r > 11
          ? 'meteor-medium'
          : 'meteor-small';
    const size = r.r * 2.15;
    ctx.shadowColor = 'rgba(147, 167, 201, 0.34)';
    ctx.shadowBlur = 7;
    ctx.drawImage(sprites[name], -size / 2, -size / 2, size, size);
  } else {
    ctx.fillStyle = '#3a4668'; ctx.strokeStyle = '#93a7c9'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 9; i += 1) {
      const a = (i / 9) * TAU; const rr = r.r * (.78 + (i % 3) * .1);
      const x = Math.cos(a) * rr; const y = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#242d4c';
    ctx.beginPath(); ctx.arc(-r.r * .24, -r.r * .15, r.r * .2, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function drawShip(
  ctx: CanvasRenderingContext2D,
  s: State,
  sprites: KenneySpaceSprites | null,
) {
  ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.angle);
  if (sprites && s.inv > 0) {
    ctx.save();
    ctx.globalAlpha = 0.24 + Math.sin(s.time * 8) * 0.07;
    ctx.drawImage(sprites.shield, -28, -28, 56, 56);
    ctx.restore();
  }
  if (s.thrust > 0) {
    ctx.fillStyle = '#ffd56b'; ctx.beginPath(); ctx.moveTo(-10, -5); ctx.lineTo(-23 - Math.sin(s.time * 35) * 4, 0); ctx.lineTo(-10, 5); ctx.closePath(); ctx.fill();
  }
  ctx.shadowColor = '#74e9ff';
  ctx.shadowBlur = 12;
  if (sprites) {
    ctx.save();
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(sprites['player-ship-blue'], -22, -17, 44, 34);
    ctx.restore();
  } else {
    ctx.fillStyle = '#e8fbff';
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-12, -11);
    ctx.lineTo(-7, 0);
    ctx.lineTo(-12, 11);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#57bde9';
    ctx.beginPath();
    ctx.arc(1, 0, 4, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}
