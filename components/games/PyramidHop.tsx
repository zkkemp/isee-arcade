'use client';

import { useEffect, useRef } from 'react';
import { SPEED_SCALE, type Difficulty } from '@/lib/difficulty';
import type { Direction } from '@/lib/input';
import type { GameCanvasProps } from '@/lib/games';
import { playSound } from '@/lib/sound';
import { useCanvasGame } from '@/lib/useCanvasGame';

export const PYRAMID_ROWS = 5;
export type HopPoint = { r: number; c: number };
const DIRECTIONS: Direction[] = ['left', 'right', 'up', 'down'];

export function tileIndex(r: number, c: number) { return r * (r + 1) / 2 + c; }
/** Left/right descend the two visible slopes; up/down climb their matching slopes. */
export function hop(r: number, c: number, direction: Direction): HopPoint | null {
  if (direction === 'left') return r < PYRAMID_ROWS - 1 ? { r: r + 1, c } : null;
  if (direction === 'right') return r < PYRAMID_ROWS - 1 ? { r: r + 1, c: c + 1 } : null;
  if (direction === 'up') return r > 0 ? { r: r - 1, c: Math.max(0, c - 1) } : null;
  return r > 0 ? { r: r - 1, c: Math.min(r - 1, c) } : null;
}
export function complete(tiles: number[]) { return tiles.every((v) => v > 0); }
export function enemyInterval(level: number, difficulty: Difficulty): number {
  return Math.max(0.34, 1.05 - (level - 1) * 0.055) / SPEED_SCALE[difficulty];
}
export function bugStep(from: HopPoint, target: HopPoint, tick: number, avoidTarget = false): HopPoint {
  const options = DIRECTIONS.map((direction) => hop(from.r, from.c, direction)).filter((v): v is HopPoint => v !== null);
  const distance = (v: HopPoint) => Math.abs(v.r - target.r) + Math.abs(v.c - target.c);
  const safe = options.filter((v) => v.r !== target.r || v.c !== target.c);
  const choices = avoidTarget && safe.length ? safe : options;
  const best = Math.min(...choices.map(distance));
  const finalists = choices.filter((v) => distance(v) === best);
  return finalists[tick % finalists.length];
}

type State = {
  r: number; c: number; tiles: number[]; level: number; score: number; lives: number;
  bug: HopPoint; enemyClock: number; enemyTick: number; invulnerable: number; moveLock: number;
  message: string; messageT: number;
};

function litTiles() { const tiles = Array(PYRAMID_ROWS * (PYRAMID_ROWS + 1) / 2).fill(0); tiles[0] = 1; return tiles; }
function fresh(): State {
  return { r: 0, c: 0, tiles: litTiles(), level: 1, score: 0, lives: 3, bug: { r: PYRAMID_ROWS - 1, c: PYRAMID_ROWS - 1 }, enemyClock: 0, enemyTick: 0, invulnerable: 1.25, moveLock: 0, message: 'Light every jewel. Follow the arrow slopes!', messageT: 3 };
}
function resetLevel(s: State) {
  s.r = 0; s.c = 0; s.tiles = litTiles(); s.bug = { r: PYRAMID_ROWS - 1, c: PYRAMID_ROWS - 1 }; s.enemyClock = 0; s.enemyTick = 0; s.invulnerable = 1.25; s.moveLock = 0;
}

export default function PyramidHop({ paused, input, api, restartToken, difficulty, controlsInset }: GameCanvasProps) {
  const ref = useRef(fresh());
  useEffect(() => { ref.current = fresh(); }, [restartToken]);
  const { canvasRef } = useCanvasGame({
    active: !paused,
    step: (ctx, dt, cw, ch) => {
      const s = ref.current;
      const h = Math.max(180, ch - controlsInset);
      s.invulnerable = Math.max(0, s.invulnerable - dt);
      s.moveLock = Math.max(0, s.moveLock - dt);
      s.messageT = Math.max(0, s.messageT - dt);
      let changedLevel = false;
      const direction = input.consumeTap();
      if (direction && s.moveLock <= 0) {
        const next = hop(s.r, s.c, direction);
        s.moveLock = 0.1;
        if (!next) { s.message = 'That slope ends here — try another arrow.'; s.messageT = 1.1; playSound('click'); }
        else {
          s.r = next.r; s.c = next.c;
          const tile = tileIndex(next.r, next.c);
          if (!s.tiles[tile]) { s.tiles[tile] = 1; s.score += 5; api.addScore(5); playSound('coin'); }
          if (complete(s.tiles)) {
            const cleared = s.level;
            s.level += 1; resetLevel(s); s.message = `Pyramid ${cleared} shines! Level ${s.level} begins.`; s.messageT = 2.1; changedLevel = true;
            api.requestGate(`Pyramid Hop level ${cleared} cleared`);
          }
        }
      }
      if (!changedLevel) {
        s.enemyClock += dt;
        if (s.enemyClock >= enemyInterval(s.level, difficulty)) {
          s.enemyClock = 0; s.enemyTick += 1; s.bug = bugStep(s.bug, { r: s.r, c: s.c }, s.enemyTick, s.invulnerable > 0);
        }
        if (s.invulnerable <= 0 && s.r === s.bug.r && s.c === s.bug.c) {
          s.lives -= 1; playSound('wrong');
          if (s.lives <= 0) { api.died('The dust bug caught you'); ref.current = fresh(); }
          else { resetLevel(s); s.message = 'Dusty bump! You have a safe restart.'; s.messageT = 1.7; }
        }
      }
      draw(ctx, ref.current, cw, ch, h);
    },
  });
  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" aria-label="Pyramid Hop game" />;
}

function draw(ctx: CanvasRenderingContext2D, s: State, cw: number, ch: number, h: number) {
  const bg = ctx.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#31295f'); bg.addColorStop(0.55, '#8b5d8f'); bg.addColorStop(1, '#f0a46f'); ctx.fillStyle = bg; ctx.fillRect(0, 0, cw, ch);
  const size = Math.min(cw / 6.5, h / 7.2); const cx = cw / 2; const top = h * 0.23;
  ctx.fillStyle = 'rgba(255,246,205,.18)'; ctx.beginPath(); ctx.arc(cx, top - size * 1.3, size * .75, 0, Math.PI * 2); ctx.fill();
  for (let r = 0; r < PYRAMID_ROWS; r += 1) for (let c = 0; c <= r; c += 1) {
    const x = cx + (c - r / 2) * size; const y = top + r * size * .72; const i = tileIndex(r, c);
    ctx.fillStyle = s.tiles[i] ? '#6ee3c1' : '#397cbf'; ctx.beginPath(); ctx.moveTo(x, y - size * .35); ctx.lineTo(x + size * .48, y); ctx.lineTo(x, y + size * .35); ctx.lineTo(x - size * .48, y); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1.5; ctx.stroke();
    if (s.r === r && s.c === c) { ctx.fillStyle = s.invulnerable > 0 ? '#fff8b3' : '#fff3a5'; ctx.globalAlpha = s.invulnerable > 0 ? .55 + Math.sin(performance.now() / 90) * .35 : 1; ctx.beginPath(); ctx.arc(x, y - size * .14, size * .18, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
    if (s.bug.r === r && s.bug.c === c) { ctx.fillStyle = '#49224f'; ctx.beginPath(); ctx.arc(x, y + size * .09, size * .16, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#ffca76'; ctx.fillRect(x - size * .09, y + size * .055, size * .05, size * .04); ctx.fillRect(x + size * .04, y + size * .055, size * .05, size * .04); }
  }
  ctx.fillStyle = 'rgba(20,17,62,.78)'; ctx.beginPath(); ctx.roundRect(10, 10, cw - 20, 39, 12); ctx.fill(); ctx.fillStyle = '#fff6cf'; ctx.font = '800 14px system-ui'; ctx.fillText(`LEVEL ${s.level}  •  ${s.tiles.filter(Boolean).length}/15 LIT  •  SCORE ${s.score}`, 19, 34); ctx.textAlign = 'right'; ctx.fillText('♥'.repeat(s.lives), cw - 19, 34); ctx.textAlign = 'center';
  ctx.font = '900 16px ui-rounded, system-ui'; ctx.fillStyle = '#fff8d1'; ctx.fillText(s.message, cw / 2, h * .12); ctx.font = '800 12px system-ui'; ctx.fillStyle = '#e7dcff'; ctx.fillText('← descend left  ·  → descend right  ·  ↑ climb left  ·  ↓ climb right', cw / 2, h * .17); ctx.textAlign = 'left';
}
