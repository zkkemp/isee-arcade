'use client';

import { useEffect, useRef } from 'react';
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

type DuelState = {
  playerX: number;
  cpuX: number;
  ballX: number;
  ballY: number;
  vx: number;
  vy: number;
  player: number;
  cpu: number;
  round: number;
  serve: number;
  flash: number;
};

const CPU_SPEED: Record<Difficulty, number> = { easy: 125, normal: 180, hard: 245 };

export function freshDuel(direction = -1): DuelState {
  return {
    playerX: W / 2,
    cpuX: W / 2,
    ballX: W / 2,
    ballY: H / 2,
    vx: 112,
    vy: 178 * direction,
    player: 0,
    cpu: 0,
    round: 1,
    serve: 0.8,
    flash: 0,
  };
}

export function paddleBounce(ballX: number, paddleX: number, incomingVy: number) {
  const offset = Math.max(-1, Math.min(1, (ballX - paddleX) / (PADDLE_W / 2)));
  return { vx: offset * 235, vy: -Math.sign(incomingVy || 1) * Math.max(185, Math.abs(incomingVy) * 1.035) };
}

function resetBall(s: DuelState, direction: 1 | -1) {
  s.ballX = W / 2;
  s.ballY = H / 2;
  s.vx = direction * (100 + s.round * 4);
  s.vy = direction * (172 + s.round * 5);
  s.serve = 0.7;
}

export default function PaddleDuel({
  paused,
  input,
  api,
  restartToken,
  difficulty,
  controlsInset,
}: GameCanvasProps) {
  const stateRef = useRef<DuelState>(freshDuel());
  useEffect(() => {
    stateRef.current = freshDuel();
  }, [restartToken]);

  const { canvasRef } = useCanvasGame({
    active: !paused,
    step: (ctx, dt, cw, ch) => {
      const playH = Math.max(180, ch - controlsInset);
      const scale = Math.min(cw / W, playH / H);
      const ox = (cw - W * scale) / 2;
      const s = stateRef.current;

      if (input.pointerX !== null) {
        s.playerX = (input.pointerX * cw - ox) / scale;
      } else {
        if (input.held.left) s.playerX -= 250 * dt;
        if (input.held.right) s.playerX += 250 * dt;
      }
      s.playerX = Math.max(PADDLE_W / 2 + 8, Math.min(W - PADDLE_W / 2 - 8, s.playerX));

      const cpuDelta = Math.max(-CPU_SPEED[difficulty] * dt, Math.min(CPU_SPEED[difficulty] * dt, s.ballX - s.cpuX));
      s.cpuX = Math.max(PADDLE_W / 2 + 8, Math.min(W - PADDLE_W / 2 - 8, s.cpuX + cpuDelta));
      s.flash = Math.max(0, s.flash - dt);
      s.serve = Math.max(0, s.serve - dt);

      if (s.serve <= 0) {
        s.ballX += s.vx * dt;
        s.ballY += s.vy * dt;
        if (s.ballX < BALL_R + 8 || s.ballX > W - BALL_R - 8) {
          s.ballX = Math.max(BALL_R + 8, Math.min(W - BALL_R - 8, s.ballX));
          s.vx *= -1;
          playSound('click');
        }

        if (s.vy > 0 && s.ballY + BALL_R >= H - 48 && s.ballY < H - 35 && Math.abs(s.ballX - s.playerX) <= PADDLE_W / 2 + BALL_R) {
          const hit = paddleBounce(s.ballX, s.playerX, s.vy);
          s.vx = hit.vx;
          s.vy = hit.vy;
          s.ballY = H - 48 - BALL_R;
          api.addScore(2);
          playSound('land');
        }
        if (s.vy < 0 && s.ballY - BALL_R <= 58 && s.ballY > 42 && Math.abs(s.ballX - s.cpuX) <= PADDLE_W / 2 + BALL_R) {
          const hit = paddleBounce(s.ballX, s.cpuX, s.vy);
          s.vx = hit.vx;
          s.vy = hit.vy;
          s.ballY = 58 + BALL_R;
          playSound('land');
        }

        if (s.ballY < -20) {
          s.player += 1;
          s.flash = 0.55;
          api.addScore(25);
          playSound('coin');
          if (s.player >= WIN_SCORE) {
            s.round += 1;
            s.player = 0;
            s.cpu = 0;
            api.requestGate(`Paddle Duel round ${s.round - 1} won!`);
          }
          resetBall(s, 1);
        } else if (s.ballY > H + 20) {
          s.cpu += 1;
          playSound('wrong');
          if (s.cpu >= WIN_SCORE) {
            s.player = 0;
            s.cpu = 0;
            api.died('The rival won the duel');
          }
          resetBall(s, -1);
        }
      }

      draw(ctx, s, cw, ch, playH, scale, ox);
    },
  });

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />;
}

function draw(ctx: CanvasRenderingContext2D, s: DuelState, cw: number, ch: number, playH: number, scale: number, ox: number) {
  ctx.fillStyle = '#070b21';
  ctx.fillRect(0, 0, cw, ch);
  ctx.save();
  ctx.translate(ox, 0);
  ctx.scale(scale, scale);

  const glow = ctx.createLinearGradient(0, 0, W, H);
  glow.addColorStop(0, '#14184a');
  glow.addColorStop(0.5, '#081b35');
  glow.addColorStop(1, '#291344');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(114,235,255,.16)';
  ctx.lineWidth = 1;
  for (let x = 12; x < W; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 8; y < H; y += 24) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.setLineDash([9, 10]);
  ctx.strokeStyle = 'rgba(255,255,255,.36)';
  ctx.beginPath();
  ctx.moveTo(18, H / 2);
  ctx.lineTo(W - 18, H / 2);
  ctx.stroke();
  ctx.setLineDash([]);

  drawPaddle(ctx, s.cpuX, 58, '#ff78bf');
  drawPaddle(ctx, s.playerX, H - 48, '#61e9ff');

  ctx.shadowColor = '#fff6a3';
  ctx.shadowBlur = 18;
  ctx.fillStyle = '#fff8c7';
  ctx.beginPath();
  ctx.arc(s.ballX, s.ballY, BALL_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.fillStyle = 'rgba(4,8,27,.76)';
  ctx.beginPath();
  ctx.roundRect(18, H / 2 - 25, W - 36, 50, 17);
  ctx.fill();
  ctx.font = '900 19px ui-rounded, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff78bf';
  ctx.fillText(String(s.cpu), W / 2 - 35, H / 2 + 7);
  ctx.fillStyle = '#fff';
  ctx.fillText('—', W / 2, H / 2 + 7);
  ctx.fillStyle = '#61e9ff';
  ctx.fillText(String(s.player), W / 2 + 35, H / 2 + 7);

  if (s.serve > 0 || s.flash > 0) {
    ctx.font = '900 15px ui-rounded, system-ui, sans-serif';
    ctx.fillStyle = '#fff8c7';
    ctx.fillText(s.flash > 0 ? 'POINT!' : `ROUND ${s.round} · FIRST TO ${WIN_SCORE}`, W / 2, H / 2 + 50);
  }
  ctx.restore();
  ctx.fillStyle = '#050817';
  ctx.fillRect(0, playH, cw, Math.max(0, ch - playH));
}

function drawPaddle(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x - PADDLE_W / 2, y - PADDLE_H / 2, PADDLE_W, PADDLE_H, 6);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  ctx.fillRect(x - PADDLE_W / 2 + 8, y - 3, PADDLE_W - 16, 2);
}
