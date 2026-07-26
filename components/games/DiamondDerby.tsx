'use client';

import { useEffect, useRef } from 'react';
import { SPEED_SCALE } from '@/lib/difficulty';
import type { GameCanvasProps } from '@/lib/games';
import { playSound } from '@/lib/sound';
import { useCanvasGame } from '@/lib/useCanvasGame';

export const SWING_SWEET_SPOT = 0.1;
export function hitQuality(ballX: number): 'miss' | 'single' | 'homer' {
  const distance = Math.abs(ballX - 0.5);
  if (distance > 0.22) return 'miss';
  return distance <= SWING_SWEET_SPOT ? 'homer' : 'single';
}

type State = { ballX: number; pitch: number; strikes: number; hits: number; level: number; score: number; flash: number; message: string; time: number; wait: number };
function fresh(): State { return { ballX: 0.15, pitch: 0, strikes: 0, hits: 0, level: 1, score: 0, flash: 0, message: 'Tap or press Space to swing!', time: 0, wait: 0.8 }; }

export default function DiamondDerby({ paused, input, api, restartToken, difficulty, controlsInset }: GameCanvasProps) {
  const ref = useRef(fresh());
  useEffect(() => { ref.current = fresh(); }, [restartToken]);
  const { canvasRef } = useCanvasGame({ active: !paused, step: (ctx, dt, cw, ch) => {
    const s = ref.current; const h = Math.max(140, ch - controlsInset); s.time += dt; s.flash = Math.max(0, s.flash - dt);
    if (s.wait > 0) s.wait -= dt; else { s.pitch += dt * (0.72 + s.level * 0.08) * SPEED_SCALE[difficulty]; s.ballX = 0.15 + s.pitch * 0.7; }
    const swing = input.consumeJump() || input.consumePointerPress();
    if (swing && s.wait <= 0) {
      const q = hitQuality(s.ballX);
      if (q === 'miss') { s.strikes += 1; s.message = s.strikes >= 3 ? 'Three strikes!' : `Strike ${s.strikes}!`; playSound('wrong'); }
      else { const points = q === 'homer' ? 30 : 10; s.score += points; s.hits += 1; api.addScore(points); s.message = q === 'homer' ? 'HOME RUN! ✦' : 'Nice hit!'; s.flash = 0.4; playSound('coin'); }
      s.pitch = 0; s.ballX = 0.15; s.wait = 0.65;
      if (s.hits > 0 && s.hits % 5 === 0) { s.level += 1; api.requestGate(`Diamond Derby level ${s.level - 1} cleared!`); }
      if (s.strikes >= 3) { api.died('Three strikes'); ref.current = fresh(); }
    }
    if (s.pitch > 1.12) { s.strikes += 1; s.message = s.strikes >= 3 ? 'Strike out!' : `Too late — strike ${s.strikes}!`; s.pitch = 0; s.ballX = 0.15; s.wait = 0.55; playSound('wrong'); if (s.strikes >= 3) { api.died('Three strikes'); ref.current = fresh(); } }
    draw(ctx, s, cw, ch, h);
  }});
  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />;
}
function draw(ctx: CanvasRenderingContext2D, s: State, cw: number, ch: number, h: number) {
  const sky = ctx.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#81d4f1'); sky.addColorStop(1, '#f8dc91'); ctx.fillStyle = sky; ctx.fillRect(0,0,cw,ch);
  ctx.fillStyle='#5eb763'; ctx.fillRect(0,h*.48,cw,h*.52); ctx.fillStyle='#d99758'; ctx.beginPath(); ctx.arc(cw*.5,h*.9,h*.42,Math.PI,0); ctx.fill();
  ctx.fillStyle='rgba(22,47,91,.78)'; ctx.roundRect(12,12,cw-24,35,14); ctx.fill(); ctx.fillStyle='#fff8ce'; ctx.font='800 15px system-ui'; ctx.textBaseline='middle'; ctx.fillText(`LEVEL ${s.level}   SCORE ${s.score}`,25,30); ctx.textAlign='right'; ctx.fillText(`STRIKES ${'●'.repeat(s.strikes)}${'○'.repeat(3-s.strikes)}`,cw-25,30); ctx.textAlign='left';
  const plateX=cw*.5, plateY=h*.78; ctx.fillStyle='#fff9df'; ctx.beginPath(); ctx.moveTo(plateX-22,plateY);ctx.lineTo(plateX+22,plateY);ctx.lineTo(plateX+15,plateY+15);ctx.lineTo(plateX,plateY+23);ctx.lineTo(plateX-15,plateY+15);ctx.closePath();ctx.fill();
  ctx.strokeStyle='#6d3e28';ctx.lineWidth=8;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(plateX+18,plateY-8);ctx.lineTo(plateX+48,plateY-40);ctx.stroke();
  if(s.wait<=0){ const x=cw*(.15+s.pitch*.7), y=h*.23+s.pitch*h*.48; ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(x,y,11,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#e55255';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(x,y,11,.6,3.7);ctx.stroke(); }
  ctx.fillStyle=s.flash?'#fff4a4':'rgba(27,55,92,.86)';ctx.font='900 20px ui-rounded,system-ui';ctx.textAlign='center';ctx.fillText(s.message,cw/2,h*.14);ctx.textAlign='left';
}
