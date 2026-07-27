'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Difficulty } from '@/lib/difficulty';
import type { GameCanvasProps } from '@/lib/games';
import { playSound } from '@/lib/sound';
import { useCanvasGame } from '@/lib/useCanvasGame';

const W = 360;
const H = 520;
const PADDLE_W = 82;
const PADDLE_H = 12;
const BALL_R = 7;
const WIN_SCORE = 7;
const TOP_Y = 58;
const BOTTOM_Y = H - 48;

export type DuelMode = 'solo' | 'duo';
export type TouchSide = 'top' | 'bottom';
type DuelState = {
  bottomX: number; topX: number; ballX: number; ballY: number; vx: number; vy: number;
  bottom: number; top: number; round: number; serve: number; flash: number;
};
type Touch = { side: TouchSide; x: number };

const CPU_SPEED: Record<Difficulty, number> = { easy: 125, normal: 180, hard: 245 };
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function touchSide(y: number): TouchSide { return y < 0.5 ? 'top' : 'bottom'; }
export function awardsReturnScore(mode: DuelMode, side: TouchSide): boolean {
  return mode === 'solo' && side === 'bottom';
}
export function freshDuel(direction = -1): DuelState {
  return { bottomX: W / 2, topX: W / 2, ballX: W / 2, ballY: H / 2, vx: 112, vy: 178 * direction, bottom: 0, top: 0, round: 1, serve: 0.8, flash: 0 };
}

export function paddleBounce(ballX: number, paddleX: number, incomingVy: number) {
  const offset = clamp((ballX - paddleX) / (PADDLE_W / 2), -1, 1);
  return { vx: offset * 235, vy: -Math.sign(incomingVy || 1) * Math.min(430, Math.max(185, Math.abs(incomingVy) * 1.035)) };
}

function resetBall(s: DuelState, direction: 1 | -1) {
  s.ballX = W / 2; s.ballY = H / 2; s.vx = direction * (100 + s.round * 4); s.vy = direction * (172 + s.round * 5); s.serve = 0.7;
}
function clampPaddle(x: number) { return clamp(x, PADDLE_W / 2 + 8, W - PADDLE_W / 2 - 8); }

export default function PaddleDuel({ paused, input, api, restartToken, difficulty, controlsInset }: GameCanvasProps) {
  const stateRef = useRef<DuelState>(freshDuel());
  const touchesRef = useRef<Map<number, Touch>>(new Map());
  const [mode, setModeState] = useState<DuelMode>('solo');
  const modeRef = useRef<DuelMode>('solo');

  const reset = (nextMode = modeRef.current) => {
    modeRef.current = nextMode;
    touchesRef.current.clear();
    stateRef.current = freshDuel();
  };
  useEffect(() => { reset(); }, [restartToken]);
  useEffect(() => {
    if (paused) touchesRef.current.clear();
  }, [paused]);

  const selectMode = (next: DuelMode) => {
    if (next === modeRef.current) return;
    setModeState(next);
    reset(next);
  };

  const updateTouch = (event: ReactPointerEvent<HTMLCanvasElement>, isNew = false) => {
    if (paused) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    const existing = touchesRef.current.get(event.pointerId);
    touchesRef.current.set(event.pointerId, { side: existing?.side ?? touchSide(y), x });
    if (isNew) event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const { canvasRef } = useCanvasGame({
    active: !paused,
    step: (ctx, dt, cw, ch) => {
      const playH = Math.max(180, ch - controlsInset);
      const scale = Math.min(cw / W, playH / H);
      const ox = (cw - W * scale) / 2;
      const s = stateRef.current;
      const touches = [...touchesRef.current.values()];
      const bottomTouch = touches.find((v) => v.side === 'bottom');
      const topTouch = touches.find((v) => v.side === 'top');
      if (bottomTouch) s.bottomX = clampPaddle((bottomTouch.x * cw - ox) / scale);
      else {
        if (input.held.left) s.bottomX -= 250 * dt;
        if (input.held.right) s.bottomX += 250 * dt;
        s.bottomX = clampPaddle(s.bottomX);
      }
      if (modeRef.current === 'duo' && topTouch) s.topX = clampPaddle((topTouch.x * cw - ox) / scale);
      else if (modeRef.current === 'solo') s.topX = clampPaddle(s.topX + clamp(s.ballX - s.topX, -CPU_SPEED[difficulty] * dt, CPU_SPEED[difficulty] * dt));

      s.flash = Math.max(0, s.flash - dt);
      s.serve = Math.max(0, s.serve - dt);
      if (s.serve <= 0) {
        const priorY = s.ballY;
        s.ballX += s.vx * dt; s.ballY += s.vy * dt;
        if (s.ballX < BALL_R + 8 || s.ballX > W - BALL_R - 8) { s.ballX = clamp(s.ballX, BALL_R + 8, W - BALL_R - 8); s.vx *= -1; playSound('click'); }
        if (s.vy > 0 && priorY + BALL_R <= BOTTOM_Y && s.ballY + BALL_R >= BOTTOM_Y && Math.abs(s.ballX - s.bottomX) <= PADDLE_W / 2 + BALL_R) {
          const hit = paddleBounce(s.ballX, s.bottomX, s.vy); s.vx = hit.vx; s.vy = hit.vy; s.ballY = BOTTOM_Y - BALL_R;
          if (awardsReturnScore(modeRef.current, 'bottom')) api.addScore(2);
          playSound('land');
        }
        if (s.vy < 0 && priorY - BALL_R >= TOP_Y && s.ballY - BALL_R <= TOP_Y && Math.abs(s.ballX - s.topX) <= PADDLE_W / 2 + BALL_R) {
          const hit = paddleBounce(s.ballX, s.topX, s.vy); s.vx = hit.vx; s.vy = hit.vy; s.ballY = TOP_Y + BALL_R;
          if (awardsReturnScore(modeRef.current, 'top')) api.addScore(2);
          playSound('land');
        }
        if (s.ballY < -20 || s.ballY > H + 20) {
          const topScored = s.ballY > H + 20;
          if (topScored) s.top += 1; else { s.bottom += 1; api.addScore(25); }
          s.flash = 0.55; playSound(topScored ? 'wrong' : 'coin');
          const winner = topScored ? s.top : s.bottom;
          if (winner >= WIN_SCORE) {
            const winnerName = modeRef.current === 'solo' ? (topScored ? 'The rival' : 'You') : (topScored ? 'Pink player' : 'Blue player');
            if (modeRef.current === 'solo' && topScored) api.died(`${winnerName} won the duel`);
            else api.requestGate(`${winnerName} won Paddle Duel round ${s.round}!`);
            s.round += 1; s.top = 0; s.bottom = 0;
          }
          resetBall(s, topScored ? -1 : 1);
        }
      }
      draw(ctx, s, cw, ch, playH, scale, ox, modeRef.current, Boolean(topTouch), Boolean(bottomTouch));
    },
  });

  return <>
    <canvas ref={canvasRef} className="absolute inset-0 z-20 h-full w-full touch-none" aria-label="Paddle Duel game" onPointerDown={(e) => updateTouch(e, true)} onPointerMove={(e) => updateTouch(e)} onPointerUp={(e) => touchesRef.current.delete(e.pointerId)} onPointerCancel={(e) => touchesRef.current.delete(e.pointerId)} />
    <div className="absolute left-1/2 top-2 z-20 flex -translate-x-1/2 overflow-hidden rounded-full border border-white/30 bg-[#07112c]/90 text-[10px] font-black uppercase tracking-wide text-white shadow-lg">
      <button type="button" className={`px-3 py-1.5 ${mode === 'solo' ? 'bg-cyan-400 text-[#07112c]' : ''}`} onPointerDown={(e) => { e.stopPropagation(); selectMode('solo'); }}>1P · CPU</button>
      <button type="button" className={`px-3 py-1.5 ${mode === 'duo' ? 'bg-pink-400 text-[#07112c]' : ''}`} onPointerDown={(e) => { e.stopPropagation(); selectMode('duo'); }}>2P · LOCAL</button>
    </div>
  </>;
}

function draw(ctx: CanvasRenderingContext2D, s: DuelState, cw: number, ch: number, playH: number, scale: number, ox: number, mode: DuelMode, topTouch: boolean, bottomTouch: boolean) {
  ctx.fillStyle = '#070b21'; ctx.fillRect(0, 0, cw, ch); ctx.save(); ctx.translate(ox, 0); ctx.scale(scale, scale);
  const glow = ctx.createLinearGradient(0, 0, W, H); glow.addColorStop(0, '#14184a'); glow.addColorStop(0.5, '#081b35'); glow.addColorStop(1, '#291344'); ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(114,235,255,.16)'; ctx.lineWidth = 1;
  for (let x = 12; x < W; x += 24) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 8; y < H; y += 24) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.setLineDash([9, 10]); ctx.strokeStyle = 'rgba(255,255,255,.36)'; ctx.beginPath(); ctx.moveTo(18, H / 2); ctx.lineTo(W - 18, H / 2); ctx.stroke(); ctx.setLineDash([]);
  drawPaddle(ctx, s.topX, TOP_Y, '#ff78bf'); drawPaddle(ctx, s.bottomX, BOTTOM_Y, '#61e9ff');
  ctx.shadowColor = '#fff6a3'; ctx.shadowBlur = 18; ctx.fillStyle = '#fff8c7'; ctx.beginPath(); ctx.arc(s.ballX, s.ballY, BALL_R, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(4,8,27,.76)'; ctx.beginPath(); ctx.roundRect(18, H / 2 - 25, W - 36, 50, 17); ctx.fill(); ctx.font = '900 19px ui-rounded, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#ff78bf'; ctx.fillText(String(s.top), W / 2 - 35, H / 2 + 7); ctx.fillStyle = '#fff'; ctx.fillText('—', W / 2, H / 2 + 7); ctx.fillStyle = '#61e9ff'; ctx.fillText(String(s.bottom), W / 2 + 35, H / 2 + 7);
  ctx.font = '800 11px system-ui'; ctx.fillStyle = '#dceaff'; ctx.fillText(mode === 'duo' ? `PINK ${topTouch ? 'TOUCH' : 'TOP HALF'} · BLUE ${bottomTouch ? 'TOUCH' : 'BOTTOM HALF'}` : 'BLUE: DRAG BOTTOM HALF · PINK: CPU', W / 2, H / 2 + 47);
  if (s.serve > 0 || s.flash > 0) { ctx.font = '900 15px ui-rounded, system-ui, sans-serif'; ctx.fillStyle = '#fff8c7'; ctx.fillText(s.flash > 0 ? 'POINT!' : `ROUND ${s.round} · FIRST TO ${WIN_SCORE}`, W / 2, H / 2 + 68); }
  ctx.restore(); ctx.fillStyle = '#050817'; ctx.fillRect(0, playH, cw, Math.max(0, ch - playH));
}

function drawPaddle(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.shadowColor = color; ctx.shadowBlur = 18; ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x - PADDLE_W / 2, y - PADDLE_H / 2, PADDLE_W, PADDLE_H, 6); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillRect(x - PADDLE_W / 2 + 8, y - 3, PADDLE_W - 16, 2);
}
