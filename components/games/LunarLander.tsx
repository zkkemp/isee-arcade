'use client';

import { useEffect, useRef } from 'react';
import type { GameCanvasProps } from '@/lib/games';
import { playSound } from '@/lib/sound';
import { useCanvasGame } from '@/lib/useCanvasGame';

const W = 360;
const H = 520;
type Pad = { x: number; w: number };
type LanderState = {
  x: number; y: number; vx: number; vy: number; fuel: number; angle: number;
  level: number; lives: number; pad: Pad; landed: number; time: number; thrust: number;
};
const GRAVITY = { easy: 27, normal: 35, hard: 43 } as const;

export function safeLanding(vx: number, vy: number, x: number, pad: Pad, landerHalfWidth = 12) {
  // `x` is the lander's centre. Requiring both feet inside the pad prevents a
  // visual "landing" where only a single pixel happened to cross the edge.
  return Math.abs(vx) <= 24 && vy >= 0 && vy <= 39 && x - landerHalfWidth >= pad.x && x + landerHalfWidth <= pad.x + pad.w;
}

export function landingPad(level: number): Pad {
  const w = Math.max(42, 88 - level * 3);
  return { x: 22 + ((level * 97) % Math.floor(W - w - 44)), w };
}

function fresh(level = 1, lives = 3): LanderState {
  return { x: W / 2, y: 82, vx: 18, vy: 0, fuel: 100, angle: 0, level, lives, pad: landingPad(level), landed: 0, time: 0, thrust: 0 };
}

export default function LunarLander({ paused, input, api, restartToken, difficulty, controlsInset }: GameCanvasProps) {
  const stateRef = useRef<LanderState>(fresh());
  useEffect(() => { stateRef.current = fresh(); }, [restartToken]);
  const { canvasRef } = useCanvasGame({
    active: !paused,
    step: (ctx, dt, cw, ch) => {
      let s = stateRef.current;
      const playH = Math.max(180, ch - controlsInset);
      s.time += dt;
      s.thrust = Math.max(0, s.thrust - dt);
      if (s.landed > 0) {
        s.landed -= dt;
        if (s.landed <= 0) {
          const next = s.level + 1;
          stateRef.current = fresh(next, s.lives);
          api.requestGate(`Moon base ${s.level} reached!`);
          s = stateRef.current;
        }
      } else {
        // D-pad buttons queue taps while keyboard keys remain held. A tap gets
        // a helpful burst so an iPad player can cross the whole moon, while a
        // held key remains precise for fine approach corrections.
        const tap = input.consumeTap();
        const heldSide = (input.held.right ? 1 : 0) - (input.held.left ? 1 : 0);
        const side = heldSide || (tap === 'right' ? 1 : tap === 'left' ? -1 : 0);
        if (side !== 0 && s.fuel > 0) {
          s.vx += side * 48 * dt; s.fuel = Math.max(0, s.fuel - 7 * dt); s.angle = side * .18;
          if (tap === 'left' || tap === 'right') { s.vx += side * 11; s.fuel = Math.max(0, s.fuel - 1.5); }
        } else s.angle *= Math.pow(.08, dt);
        const wantsThrust = input.held.up || tap === 'up' || input.consumeJump();
        if (wantsThrust && s.fuel > 0) {
          s.vy -= 74 * dt; s.fuel = Math.max(0, s.fuel - 15 * dt);
          if (tap === 'up') { s.vy -= 24; s.fuel = Math.max(0, s.fuel - 3.5); }
          s.thrust = .12;
        }
        if ((input.held.down || tap === 'down') && s.fuel > 0) {
          s.vx *= Math.pow(.22, dt); s.vy *= Math.pow(.62, dt); s.fuel = Math.max(0, s.fuel - 4 * dt);
          if (tap === 'down') { s.vx *= .68; s.vy *= .9; }
        }
        s.vy += GRAVITY[difficulty] * dt;
        s.x += s.vx * dt; s.y += s.vy * dt;
        if (s.x < 10) { s.x = 10; s.vx = Math.abs(s.vx) * .4; }
        if (s.x > W - 10) { s.x = W - 10; s.vx = -Math.abs(s.vx) * .4; }
        if (s.y >= H - 62) {
          if (safeLanding(s.vx, s.vy, s.x, s.pad)) {
            s.y = H - 62; s.vx = 0; s.vy = 0; s.landed = 1.35;
            api.addScore(Math.round(100 + s.fuel * 2 + s.level * 20)); playSound('levelClear');
          } else {
            s.lives -= 1; playSound('wrong');
            if (s.lives <= 0) {
              stateRef.current = fresh(1, 3); api.died('The lunar lander needs repairs');
            } else stateRef.current = fresh(s.level, s.lives);
            s = stateRef.current;
          }
        }
      }
      draw(ctx, s, cw, ch, playH, s.thrust > 0);
    },
  });
  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />;
}

function draw(ctx: CanvasRenderingContext2D, s: LanderState, cw: number, ch: number, playH: number, thrust: boolean) {
  const scale = Math.min(cw / W, playH / H), ox = (cw - W * scale) / 2;
  ctx.fillStyle = '#050512'; ctx.fillRect(0, 0, cw, ch);
  ctx.save(); ctx.translate(ox, 0); ctx.scale(scale, scale);
  const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#090b2f'); bg.addColorStop(.62, '#242050'); bg.addColorStop(1, '#403b63');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#f7edb8'; ctx.beginPath(); ctx.arc(282, 94, 45, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(80,73,120,.22)'; ctx.beginPath(); ctx.arc(266, 82, 12, 0, Math.PI * 2); ctx.arc(299, 106, 8, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 55; i += 1) { ctx.fillStyle = i % 8 === 0 ? '#ffe9a8' : 'rgba(210,225,255,.65)'; ctx.fillRect((i * 73) % W, (i * 43) % 350, i % 9 === 0 ? 2 : 1, i % 9 === 0 ? 2 : 1); }
  ctx.fillStyle = '#211f3f'; ctx.beginPath(); ctx.moveTo(0, H - 68);
  for (let x = 0; x <= W; x += 18) ctx.lineTo(x, H - 58 - ((x * 7 + s.level * 13) % 28));
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#89f3c1'; ctx.fillRect(s.pad.x, H - 64, s.pad.w, 6);
  ctx.shadowColor = '#89f3c1'; ctx.shadowBlur = 14; ctx.fillStyle = 'rgba(137,243,193,.18)'; ctx.fillRect(s.pad.x - 4, H - 70, s.pad.w + 8, 16); ctx.shadowBlur = 0;
  drawLander(ctx, s, thrust);
  ctx.fillStyle = 'rgba(5,7,28,.8)'; ctx.beginPath(); ctx.roundRect(13, 13, W - 26, 66, 16); ctx.fill();
  ctx.font = '900 13px ui-rounded, system-ui, sans-serif'; ctx.textBaseline = 'middle';
  ctx.textAlign = 'left'; ctx.fillStyle = '#8ff3ca'; ctx.fillText(`BASE ${s.level}  ${'♥'.repeat(s.lives)}`, 26, 31);
  ctx.fillStyle = '#fff0a8'; ctx.fillText(`FUEL ${Math.ceil(s.fuel)}%`, 26, 49);
  ctx.textAlign = 'right'; ctx.fillStyle = Math.abs(s.vy) < 39 ? '#8ff3ca' : '#ff8b9e'; ctx.fillText(`↓ ${Math.max(0, s.vy).toFixed(0)}`, W - 27, 31);
  ctx.fillStyle = Math.abs(s.vx) < 24 ? '#8ff3ca' : '#ff8b9e'; ctx.fillText(`↔ ${Math.abs(s.vx).toFixed(0)}`, W - 27, 49);
  ctx.textAlign = 'center'; ctx.fillStyle = '#dceaff'; ctx.font = '800 10px ui-rounded, system-ui, sans-serif'; ctx.fillText('◀ ▶ SIDE THRUST  •  ▲ LIFT  •  ▼ BRAKE', W / 2, 69);
  if (s.landed > 0) { ctx.textAlign = 'center'; ctx.font = '900 24px ui-rounded, system-ui, sans-serif'; ctx.fillStyle = '#fff5b6'; ctx.fillText('SOFT LANDING!', W / 2, H / 2); }
  ctx.restore(); ctx.fillStyle = '#03030b'; ctx.fillRect(0, playH, cw, Math.max(0, ch - playH));
}

function drawLander(ctx: CanvasRenderingContext2D, s: LanderState, thrust: boolean) {
  ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.angle);
  if (thrust && s.fuel > 0 && s.landed <= 0) {
    ctx.fillStyle = '#ffd45d'; ctx.shadowColor = '#ff8a52'; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.moveTo(-7, 15); ctx.lineTo(0, 30 + Math.sin(s.time * 30) * 5); ctx.lineTo(7, 15); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
  }
  ctx.strokeStyle = '#d7eaff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-10, 10); ctx.lineTo(-18, 21); ctx.moveTo(10, 10); ctx.lineTo(18, 21); ctx.stroke();
  ctx.fillStyle = '#d9efff'; ctx.beginPath(); ctx.roundRect(-14, -10, 28, 25, 7); ctx.fill();
  ctx.fillStyle = '#6ccce9'; ctx.beginPath(); ctx.arc(0, -5, 7, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#ffb85b'; ctx.fillRect(-15, 9, 30, 6); ctx.restore();
}
