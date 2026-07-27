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
  message: string; messageT: number; from: HopPoint; hopT: number; bugFrom: HopPoint; bugT: number; lastLit: number;
};

function litTiles() { const tiles = Array(PYRAMID_ROWS * (PYRAMID_ROWS + 1) / 2).fill(0); tiles[0] = 1; return tiles; }
function fresh(): State {
  const bug = { r: PYRAMID_ROWS - 1, c: PYRAMID_ROWS - 1 };
  return {
    r: 0,
    c: 0,
    tiles: litTiles(),
    level: 1,
    score: 0,
    lives: 3,
    bug,
    enemyClock: 0,
    enemyTick: 0,
    invulnerable: 1.25,
    moveLock: 0,
    message: 'Light every jewel. Follow the arrow slopes!',
    messageT: 3,
    from: { r: 0, c: 0 },
    hopT: 0,
    bugFrom: { ...bug },
    bugT: 0,
    lastLit: 0,
  };
}
function resetLevel(s: State) {
  s.r = 0; s.c = 0; s.tiles = litTiles(); s.bug = { r: PYRAMID_ROWS - 1, c: PYRAMID_ROWS - 1 }; s.enemyClock = 0; s.enemyTick = 0; s.invulnerable = 1.25; s.moveLock = 0;
  s.from = { r: 0, c: 0 }; s.hopT = 0; s.bugFrom = { ...s.bug }; s.bugT = 0; s.lastLit = 0;
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
      s.hopT = Math.max(0, s.hopT - dt);
      s.bugT = Math.max(0, s.bugT - dt);
      let changedLevel = false;
      const direction = input.consumeTap();
      if (direction && s.moveLock <= 0) {
        const next = hop(s.r, s.c, direction);
        s.moveLock = 0.1;
        if (!next) { s.message = 'That slope ends here — try another arrow.'; s.messageT = 1.1; playSound('click'); }
        else {
          s.from = { r: s.r, c: s.c };
          s.r = next.r; s.c = next.c;
          s.hopT = 0.22;
          const tile = tileIndex(next.r, next.c);
          if (!s.tiles[tile]) {
            s.tiles[tile] = 1;
            s.lastLit = tile;
            s.score += 5;
            api.addScore(5);
            playSound('coin');
          }
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
          s.enemyClock = 0;
          s.enemyTick += 1;
          s.bugFrom = { ...s.bug };
          s.bug = bugStep(s.bug, { r: s.r, c: s.c }, s.enemyTick, s.invulnerable > 0);
          s.bugT = 0.2;
        }
        if (s.invulnerable <= 0 && s.r === s.bug.r && s.c === s.bug.c) {
          s.lives -= 1; playSound('wrong');
          if (s.lives <= 0) { api.died('The dust bug caught you'); ref.current = fresh(); }
          else { resetLevel(s); s.message = 'Dusty bump! You have a safe restart.'; s.messageT = 1.7; }
        }
      }
      draw(ctx, ref.current, cw, ch, h, difficulty);
    },
  });
  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" aria-label="Pyramid Hop game" />;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function tilePoint(r: number, c: number, cx: number, top: number, size: number): { x: number; y: number } {
  return { x: cx + (c - r / 2) * size, y: top + r * size * .72 };
}

function movingPoint(
  from: HopPoint,
  to: HopPoint,
  time: number,
  duration: number,
  cx: number,
  top: number,
  size: number,
): { x: number; y: number; jump: number } {
  const progress = time <= 0 ? 1 : 1 - clamp(time / duration, 0, 1);
  const a = tilePoint(from.r, from.c, cx, top, size);
  const b = tilePoint(to.r, to.c, cx, top, size);
  return {
    x: a.x + (b.x - a.x) * progress,
    y: a.y + (b.y - a.y) * progress,
    jump: Math.sin(progress * Math.PI) * size * .34,
  };
}

function drawCube(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  lit: boolean,
  justLit: boolean,
): void {
  const topY = y - size * .34;
  const rightX = x + size * .48;
  const bottomY = y + size * .34;
  const leftX = x - size * .48;
  const depth = size * .22;

  ctx.fillStyle = lit ? '#126d68' : '#173d67';
  ctx.beginPath();
  ctx.moveTo(leftX, y);
  ctx.lineTo(x, bottomY);
  ctx.lineTo(x, bottomY + depth);
  ctx.lineTo(leftX, y + depth);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = lit ? '#0b4e58' : '#112c50';
  ctx.beginPath();
  ctx.moveTo(rightX, y);
  ctx.lineTo(x, bottomY);
  ctx.lineTo(x, bottomY + depth);
  ctx.lineTo(rightX, y + depth);
  ctx.closePath();
  ctx.fill();

  ctx.save();
  if (lit) {
    ctx.shadowColor = justLit ? '#fff49a' : '#66f3d1';
    ctx.shadowBlur = justLit ? 28 : 12;
  }
  const topFill = ctx.createLinearGradient(x, topY, x, bottomY);
  topFill.addColorStop(0, lit ? '#9affdf' : '#64a7df');
  topFill.addColorStop(1, lit ? '#32c6a8' : '#2968a7');
  ctx.fillStyle = topFill;
  ctx.beginPath();
  ctx.moveTo(x, topY);
  ctx.lineTo(rightX, y);
  ctx.lineTo(x, bottomY);
  ctx.lineTo(leftX, y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = lit ? 'rgba(225,255,241,.9)' : 'rgba(208,234,255,.58)';
  ctx.lineWidth = Math.max(1.5, size * .016);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = lit ? '#fff6a2' : 'rgba(221,240,255,.2)';
  ctx.shadowColor = lit ? '#fff39a' : 'transparent';
  ctx.shadowBlur = lit ? 12 : 0;
  ctx.fillRect(-size * .075, -size * .075, size * .15, size * .15);
  ctx.restore();
}

function drawHopper(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, invulnerable: number): void {
  ctx.save();
  ctx.translate(x, y);
  const blink = invulnerable > 0 ? .58 + Math.sin(performance.now() / 78) * .3 : 1;
  ctx.globalAlpha = clamp(blink, .28, 1);
  ctx.fillStyle = 'rgba(5,19,36,.28)';
  ctx.beginPath();
  ctx.ellipse(0, size * .13, size * .17, size * .065, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ef7b46';
  ctx.roundRect(-size * .12, -size * .14, size * .24, size * .25, size * .07);
  ctx.fill();
  ctx.fillStyle = '#ffd18d';
  ctx.beginPath();
  ctx.arc(0, -size * .22, size * .115, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6b3b2a';
  ctx.beginPath();
  ctx.moveTo(-size * .17, -size * .27);
  ctx.lineTo(size * .17, -size * .27);
  ctx.lineTo(size * .1, -size * .35);
  ctx.lineTo(-size * .08, -size * .35);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#18304a';
  ctx.beginPath();
  ctx.arc(-size * .04, -size * .22, size * .018, 0, Math.PI * 2);
  ctx.arc(size * .04, -size * .22, size * .018, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff0a3';
  ctx.lineWidth = Math.max(2, size * .035);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-size * .08, -size * .02);
  ctx.lineTo(-size * .15, size * .13);
  ctx.moveTo(size * .08, -size * .02);
  ctx.lineTo(size * .15, size * .13);
  ctx.stroke();
  ctx.restore();
}

function drawDustBug(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = '#321c47';
  ctx.lineWidth = Math.max(2, size * .025);
  for (const side of [-1, 1]) {
    for (let leg = -1; leg <= 1; leg += 1) {
      ctx.beginPath();
      ctx.moveTo(side * size * .08, leg * size * .045);
      ctx.lineTo(side * size * (.18 + Math.abs(leg) * .03), leg * size * .11);
      ctx.stroke();
    }
  }
  ctx.fillStyle = '#4b275e';
  ctx.shadowColor = '#e88bdc';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.ellipse(0, 0, size * .15, size * .12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffcf70';
  ctx.beginPath();
  ctx.arc(-size * .05, -size * .025, size * .027, 0, Math.PI * 2);
  ctx.arc(size * .05, -size * .025, size * .027, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function draw(ctx: CanvasRenderingContext2D, s: State, cw: number, ch: number, h: number, difficulty: Difficulty) {
  ctx.textBaseline = 'alphabetic';
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#14183f');
  bg.addColorStop(.45, '#5a417b');
  bg.addColorStop(.75, '#c56f6d');
  bg.addColorStop(1, '#f2ad70');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, cw, ch);

  const size = Math.min(cw / 5.8, h / 6.55);
  const cx = cw / 2;
  const top = h * .235;
  ctx.fillStyle = 'rgba(255,237,166,.2)';
  ctx.beginPath();
  ctx.arc(cx, top - size * 1.18, size * .86, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffeaa0';
  ctx.shadowColor = '#ffd878';
  ctx.shadowBlur = 30;
  ctx.beginPath();
  ctx.arc(cx, top - size * 1.18, size * .52, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Distant dunes and temple ruins give the board a world instead of a flat gradient.
  ctx.fillStyle = 'rgba(38,28,67,.36)';
  ctx.beginPath();
  ctx.moveTo(0, h * .62);
  ctx.quadraticCurveTo(cw * .24, h * .48, cw * .5, h * .63);
  ctx.quadraticCurveTo(cw * .76, h * .5, cw, h * .6);
  ctx.lineTo(cw, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(29,26,62,.46)';
  for (const x of [cw * .08, cw * .89]) {
    ctx.fillRect(x - size * .12, h * .3, size * .24, h * .42);
    ctx.fillRect(x - size * .2, h * .28, size * .4, size * .1);
    ctx.fillRect(x - size * .18, h * .7, size * .36, size * .08);
  }
  ctx.fillStyle = 'rgba(255,242,198,.32)';
  for (let dust = 0; dust < 28; dust += 1) {
    const x = (dust * 83 + 17) % Math.max(1, cw);
    const y = h * .18 + ((dust * 47) % Math.max(1, h * .65));
    ctx.beginPath();
    ctx.arc(x, y, 1 + dust % 2, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let r = 0; r < PYRAMID_ROWS; r += 1) {
    for (let c = 0; c <= r; c += 1) {
      const point = tilePoint(r, c, cx, top, size);
      const index = tileIndex(r, c);
      drawCube(ctx, point.x, point.y, size, Boolean(s.tiles[index]), s.lastLit === index && s.hopT > 0);
    }
  }

  const bugPoint = movingPoint(s.bugFrom, s.bug, s.bugT, .2, cx, top, size);
  drawDustBug(ctx, bugPoint.x, bugPoint.y - size * .08 - bugPoint.jump * .65, size);
  const hopper = movingPoint(s.from, { r: s.r, c: s.c }, s.hopT, .22, cx, top, size);
  drawHopper(ctx, hopper.x, hopper.y - size * .15 - hopper.jump, size, s.invulnerable);

  ctx.fillStyle = 'rgba(12,16,49,.9)';
  ctx.roundRect(10, 10, cw - 20, 48, 13);
  ctx.fill();
  ctx.fillStyle = '#ffeaa2';
  ctx.font = `900 ${clamp(cw * .021, 11, 15)}px "Avenir Next", system-ui`;
  ctx.textAlign = 'left';
  ctx.fillText(`SUN TEMPLE  ·  LEVEL ${s.level}`, 20, 29);
  ctx.fillStyle = '#c8e9ff';
  ctx.font = `800 ${clamp(cw * .018, 9, 12)}px "Avenir Next", system-ui`;
  ctx.fillText(`${s.score} points`, 20, 47);

  const lit = s.tiles.filter(Boolean).length;
  const barW = Math.min(cw * .3, 210);
  const barX = cw / 2 - barW / 2;
  ctx.fillStyle = 'rgba(255,255,255,.13)';
  ctx.roundRect(barX, 23, barW, 9, 5);
  ctx.fill();
  ctx.fillStyle = '#64e8c3';
  ctx.roundRect(barX, 23, barW * lit / s.tiles.length, 9, 5);
  ctx.fill();
  ctx.fillStyle = '#eefcff';
  ctx.font = `900 ${clamp(cw * .018, 9, 12)}px "Avenir Next", system-ui`;
  ctx.textAlign = 'center';
  ctx.fillText(`${lit} / ${s.tiles.length} JEWELS`, cw / 2, 47);
  ctx.fillStyle = '#ff8b8b';
  ctx.font = `900 ${clamp(cw * .025, 14, 19)}px "Avenir Next", system-ui`;
  ctx.textAlign = 'right';
  ctx.fillText('♥'.repeat(s.lives), cw - 20, 40);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff8d1';
  ctx.font = `900 ${clamp(cw * .027, 14, 19)}px "Avenir Next", system-ui`;
  ctx.fillText(s.message, cw / 2, h * .125);
  ctx.fillStyle = '#eadfff';
  ctx.font = `800 ${clamp(cw * .017, 9, 12)}px "Avenir Next", system-ui`;
  ctx.fillText('LEFT / RIGHT go down  ·  UP / DOWN climb back', cw / 2, h * .165);

  const danger = clamp(s.enemyClock / enemyInterval(s.level, difficulty), 0, 1);
  const dangerW = Math.min(cw - 40, 360);
  const dangerX = cw / 2 - dangerW / 2;
  const dangerY = h * .89;
  ctx.fillStyle = 'rgba(12,16,49,.82)';
  ctx.roundRect(dangerX - 10, dangerY - 18, dangerW + 20, 39, 12);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.12)';
  ctx.roundRect(dangerX, dangerY + 3, dangerW, 6, 3);
  ctx.fill();
  ctx.fillStyle = danger > .72 ? '#ff8a78' : '#e58bd7';
  ctx.roundRect(dangerX, dangerY + 3, dangerW * danger, 6, 3);
  ctx.fill();
  ctx.fillStyle = '#f8e9ff';
  ctx.font = `800 ${clamp(cw * .016, 8, 11)}px "Avenir Next", system-ui`;
  ctx.fillText('DUST BUG MOVE', cw / 2, dangerY - 3);
  ctx.textAlign = 'left';
}
