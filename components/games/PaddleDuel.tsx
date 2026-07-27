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
export type DuelSpeed = 'chill' | 'classic' | 'turbo';
export type TouchSide = 'top' | 'bottom';
type DuelState = {
  bottomX: number; topX: number; ballX: number; ballY: number; vx: number; vy: number;
  bottom: number; top: number; round: number; serve: number; flash: number;
  awaitingServe: boolean; readyTop: boolean; readyBottom: boolean; nextDirection: 1 | -1;
};
type Touch = { side: TouchSide; x: number };

const CPU_SPEED: Record<Difficulty, number> = { easy: 125, normal: 180, hard: 245 };
export const DUEL_SPEED_SCALE: Record<DuelSpeed, number> = { chill: 0.78, classic: 1, turbo: 1.34 };
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function touchSide(y: number): TouchSide { return y < 0.5 ? 'top' : 'bottom'; }
export function awardsReturnScore(mode: DuelMode, side: TouchSide): boolean {
  return mode === 'solo' && side === 'bottom';
}
export function freshDuel(direction = -1): DuelState {
  return {
    bottomX: W / 2, topX: W / 2, ballX: W / 2, ballY: H / 2,
    vx: 112, vy: 178 * direction, bottom: 0, top: 0, round: 1,
    serve: 0, flash: 0, awaitingServe: true, readyTop: false,
    readyBottom: false, nextDirection: direction < 0 ? -1 : 1,
  };
}

export function paddleBounce(ballX: number, paddleX: number, incomingVy: number) {
  const offset = clamp((ballX - paddleX) / (PADDLE_W / 2), -1, 1);
  return { vx: offset * 235, vy: -Math.sign(incomingVy || 1) * Math.min(430, Math.max(185, Math.abs(incomingVy) * 1.035)) };
}

function resetBall(s: DuelState, direction: 1 | -1) {
  s.ballX = W / 2; s.ballY = H / 2;
  s.vx = direction * (100 + s.round * 4);
  s.vy = direction * (172 + s.round * 5);
  s.serve = 0;
  s.awaitingServe = true;
  s.readyTop = false;
  s.readyBottom = false;
  s.nextDirection = direction;
}
function clampPaddle(x: number) { return clamp(x, PADDLE_W / 2 + 8, W - PADDLE_W / 2 - 8); }

export function markServeReady(s: DuelState, mode: DuelMode, side: TouchSide): boolean {
  if (!s.awaitingServe) return false;
  if (mode === 'solo') {
    s.readyBottom = true;
    s.readyTop = true;
  } else if (side === 'top') s.readyTop = true;
  else s.readyBottom = true;
  if (!s.readyTop || !s.readyBottom) return false;
  s.awaitingServe = false;
  s.serve = 0.65;
  return true;
}

export default function PaddleDuel({ paused, input, api, restartToken, difficulty, controlsInset }: GameCanvasProps) {
  const stateRef = useRef<DuelState>(freshDuel());
  const touchesRef = useRef<Map<number, Touch>>(new Map());
  const [mode, setModeState] = useState<DuelMode>('solo');
  const modeRef = useRef<DuelMode>('solo');
  const [speed, setSpeed] = useState<DuelSpeed>('classic');
  const speedRef = useRef<DuelSpeed>('classic');
  const [configured, setConfigured] = useState(false);
  const [readyView, setReadyView] = useState({
    restartToken,
    awaiting: true,
    top: false,
    bottom: false,
  });
  const visibleReady = readyView.restartToken === restartToken
    ? readyView
    : { restartToken, awaiting: true, top: false, bottom: false };

  const reset = (nextMode = modeRef.current, syncView = true) => {
    modeRef.current = nextMode;
    touchesRef.current.clear();
    stateRef.current = freshDuel();
    if (syncView) setReadyView({ restartToken, awaiting: true, top: false, bottom: false });
  };
  useEffect(() => {
    touchesRef.current.clear();
    stateRef.current = freshDuel();
  }, [restartToken]);
  useEffect(() => {
    if (paused) touchesRef.current.clear();
  }, [paused]);

  const selectMode = (next: DuelMode) => {
    setModeState(next);
    reset(next);
  };

  const selectSpeed = (next: DuelSpeed) => {
    setSpeed(next);
    speedRef.current = next;
  };

  const ready = (side: TouchSide) => {
    if (paused) return;
    if (markServeReady(stateRef.current, modeRef.current, side)) playSound('levelClear');
    else playSound('click');
    setReadyView({
      restartToken,
      awaiting: stateRef.current.awaitingServe,
      top: stateRef.current.readyTop,
      bottom: stateRef.current.readyBottom,
    });
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
      if (!s.awaitingServe && s.serve <= 0) {
        const ballDt = dt * DUEL_SPEED_SCALE[speedRef.current];
        const priorY = s.ballY;
        s.ballX += s.vx * ballDt; s.ballY += s.vy * ballDt;
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
          setReadyView({ restartToken, awaiting: true, top: false, bottom: false });
        }
      }
      draw(ctx, s, cw, ch, playH, scale, ox, modeRef.current, speedRef.current, Boolean(topTouch), Boolean(bottomTouch));
    },
  });

  return <>
    <canvas ref={canvasRef} className="absolute inset-0 z-20 h-full w-full touch-none" aria-label="Paddle Duel game" onPointerDown={(e) => updateTouch(e, true)} onPointerMove={(e) => updateTouch(e)} onPointerUp={(e) => touchesRef.current.delete(e.pointerId)} onPointerCancel={(e) => touchesRef.current.delete(e.pointerId)} />
    {configured && (
      <button
        type="button"
        onClick={() => setConfigured(false)}
        className="absolute right-3 top-3 z-30 rounded-full border border-white/25 bg-[#07112c]/90 px-3 py-1.5 text-[9px] font-black uppercase tracking-wide text-white/80"
      >
        ⚙ Setup
      </button>
    )}
    {configured && visibleReady.awaiting && (
      <div className="absolute inset-x-3 bottom-4 z-30 rounded-3xl border border-white/20 bg-[#07112c]/94 p-3 shadow-2xl backdrop-blur">
        <div className="mb-2 text-center text-[10px] font-black uppercase tracking-[.18em] text-white/60">
          {mode === 'duo' ? 'Both players tap ready before the serve' : 'Tap when you are ready'}
        </div>
        <div className={`grid gap-2 ${mode === 'duo' ? 'grid-cols-2' : ''}`}>
          {mode === 'duo' && (
            <button
              type="button"
              onClick={() => ready('top')}
              className={`rounded-2xl border px-4 py-3 font-black ${
                visibleReady.top
                  ? 'border-emerald-300/40 bg-emerald-300/15 text-emerald-200'
                  : 'border-pink-300/35 bg-pink-300/12 text-pink-200'
              }`}
            >
              {visibleReady.top ? '✓ Pink ready' : 'Pink · Ready'}
            </button>
          )}
          <button
            type="button"
            onClick={() => ready('bottom')}
            className={`rounded-2xl border px-4 py-3 font-black ${
              visibleReady.bottom
                ? 'border-emerald-300/40 bg-emerald-300/15 text-emerald-200'
                : 'border-cyan-300/35 bg-cyan-300/12 text-cyan-200'
            }`}
          >
            {visibleReady.bottom ? '✓ Blue ready' : mode === 'duo' ? 'Blue · Ready' : 'Serve'}
          </button>
        </div>
      </div>
    )}
    {!configured && (
      <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#050817]/92 p-5 backdrop-blur-sm">
        <div className="w-full max-w-sm rounded-[2rem] border border-white/20 bg-gradient-to-b from-[#18204e] to-[#10152f] p-5 text-center text-white shadow-2xl">
          <div className="text-[10px] font-black uppercase tracking-[.2em] text-cyan-200/60">Paddle Duel setup</div>
          <h2 className="mt-1 text-2xl font-black">Who is playing?</h2>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => selectMode('solo')} className={`rounded-2xl border p-4 font-black ${mode === 'solo' ? 'border-cyan-300 bg-cyan-300 text-[#07112c]' : 'border-white/15 bg-white/[.05]'}`}>
              <span className="block text-2xl">🤖</span>1 Player
              <span className="mt-1 block text-[10px] font-bold opacity-60">vs computer</span>
            </button>
            <button type="button" onClick={() => selectMode('duo')} className={`rounded-2xl border p-4 font-black ${mode === 'duo' ? 'border-pink-300 bg-pink-300 text-[#29122b]' : 'border-white/15 bg-white/[.05]'}`}>
              <span className="block text-2xl">👥</span>2 Players
              <span className="mt-1 block text-[10px] font-bold opacity-60">same iPad</span>
            </button>
          </div>
          <div className="mt-5 text-[10px] font-black uppercase tracking-[.18em] text-white/45">Ball speed</div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(['chill', 'classic', 'turbo'] as DuelSpeed[]).map((choice) => (
              <button
                key={choice}
                type="button"
                onClick={() => selectSpeed(choice)}
                className={`rounded-xl border px-2 py-2 text-xs font-black capitalize ${
                  speed === choice
                    ? 'border-amber-200 bg-amber-200 text-[#241a0c]'
                    : 'border-white/15 bg-white/[.04] text-white/65'
                }`}
              >
                {choice}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              reset(mode);
              speedRef.current = speed;
              setConfigured(true);
            }}
            className="mt-5 w-full rounded-2xl bg-white px-5 py-3 font-black text-[#10152f]"
          >
            Start match →
          </button>
        </div>
      </div>
    )}
  </>;
}

function draw(ctx: CanvasRenderingContext2D, s: DuelState, cw: number, ch: number, playH: number, scale: number, ox: number, mode: DuelMode, speed: DuelSpeed, topTouch: boolean, bottomTouch: boolean) {
  ctx.fillStyle = '#070b21'; ctx.fillRect(0, 0, cw, ch); ctx.save(); ctx.translate(ox, 0); ctx.scale(scale, scale);
  const glow = ctx.createLinearGradient(0, 0, W, H); glow.addColorStop(0, '#14184a'); glow.addColorStop(0.5, '#081b35'); glow.addColorStop(1, '#291344'); ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(114,235,255,.16)'; ctx.lineWidth = 1;
  for (let x = 12; x < W; x += 24) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 8; y < H; y += 24) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.setLineDash([9, 10]); ctx.strokeStyle = 'rgba(255,255,255,.36)'; ctx.beginPath(); ctx.moveTo(18, H / 2); ctx.lineTo(W - 18, H / 2); ctx.stroke(); ctx.setLineDash([]);
  drawPaddle(ctx, s.topX, TOP_Y, '#ff78bf'); drawPaddle(ctx, s.bottomX, BOTTOM_Y, '#61e9ff');
  ctx.shadowColor = '#fff6a3'; ctx.shadowBlur = 18; ctx.fillStyle = '#fff8c7'; ctx.beginPath(); ctx.arc(s.ballX, s.ballY, BALL_R, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(4,8,27,.76)'; ctx.beginPath(); ctx.roundRect(18, H / 2 - 25, W - 36, 50, 17); ctx.fill(); ctx.font = '900 19px ui-rounded, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#ff78bf'; ctx.fillText(String(s.top), W / 2 - 35, H / 2 + 7); ctx.fillStyle = '#fff'; ctx.fillText('—', W / 2, H / 2 + 7); ctx.fillStyle = '#61e9ff'; ctx.fillText(String(s.bottom), W / 2 + 35, H / 2 + 7);
  ctx.font = '800 11px system-ui'; ctx.fillStyle = '#dceaff'; ctx.fillText(mode === 'duo' ? `PINK ${topTouch ? 'TOUCH' : 'TOP HALF'} · BLUE ${bottomTouch ? 'TOUCH' : 'BOTTOM HALF'} · ${speed.toUpperCase()}` : `BLUE: DRAG BOTTOM HALF · PINK: CPU · ${speed.toUpperCase()}`, W / 2, H / 2 + 47);
  if (s.awaitingServe || s.serve > 0 || s.flash > 0) { ctx.font = '900 15px ui-rounded, system-ui, sans-serif'; ctx.fillStyle = '#fff8c7'; ctx.fillText(s.flash > 0 ? 'POINT!' : s.awaitingServe ? 'READY FOR SERVE' : `ROUND ${s.round} · FIRST TO ${WIN_SCORE}`, W / 2, H / 2 + 68); }
  ctx.restore(); ctx.fillStyle = '#050817'; ctx.fillRect(0, playH, cw, Math.max(0, ch - playH));
}

function drawPaddle(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.shadowColor = color; ctx.shadowBlur = 18; ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x - PADDLE_W / 2, y - PADDLE_H / 2, PADDLE_W, PADDLE_H, 6); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillRect(x - PADDLE_W / 2 + 8, y - 3, PADDLE_W - 16, 2);
}
