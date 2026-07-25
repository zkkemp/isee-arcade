'use client';

import { useEffect, useRef } from 'react';
import type { GameCanvasProps } from '@/lib/games';
import {
  COLS,
  GROUND_TOP,
  LEVEL_W,
  ROWS,
  TILE,
  buildLevel,
  solidAt,
  type Level,
} from '@/lib/platformerLevel';
import { useCanvasGame } from '@/lib/useCanvasGame';

const VIEW_W = 480;
const VIEW_H = ROWS * TILE;

const GRAVITY = 880;
const RUN_SPEED = 118;
const JUMP_VELOCITY = 292;
/** Grace period after walking off a ledge where a jump still counts. */
const COYOTE_TIME = 0.09;
/** A jump pressed slightly before landing still fires on touchdown. */
const JUMP_BUFFER = 0.12;
/** Coins between study gates, on top of the gate at each flag. */
const COINS_PER_GATE = 10;

const PW = 11;
const PH = 14;

type State = {
  level: number;
  data: Level;
  x: number;
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
  facing: 1 | -1;
  coyote: number;
  jumpBuffer: number;
  coinsSinceGate: number;
  coinsTotal: number;
  camera: number;
  hurt: number;
  animTime: number;
};

function freshState(level: number, coinsTotal = 0): State {
  const data = buildLevel(level);
  return {
    level,
    data,
    x: data.spawn.x,
    y: data.spawn.y,
    vx: 0,
    vy: 0,
    onGround: false,
    facing: 1,
    coyote: 0,
    jumpBuffer: 0,
    coinsSinceGate: 0,
    coinsTotal,
    camera: 0,
    hurt: 0,
    animTime: 0,
  };
}

function overlapsSolid(tiles: string[][], x: number, y: number, w: number, h: number): boolean {
  const x0 = Math.floor(x / TILE);
  const x1 = Math.floor((x + w - 1) / TILE);
  const y0 = Math.floor(y / TILE);
  const y1 = Math.floor((y + h - 1) / TILE);
  for (let ty = y0; ty <= y1; ty += 1) {
    for (let tx = x0; tx <= x1; tx += 1) {
      if (solidAt(tiles, tx, ty)) return true;
    }
  }
  return false;
}

export default function Platformer({ paused, input, api, restartToken }: GameCanvasProps) {
  const stateRef = useRef<State>(freshState(1));
  useEffect(() => {
    stateRef.current = freshState(1);
  }, [restartToken]);

  const { canvasRef } = useCanvasGame({
    width: VIEW_W,
    height: VIEW_H,
    active: !paused,
    step: (ctx, dt) => {
      const s = stateRef.current;
      const tiles = s.data.tiles;
      s.animTime += dt;
      if (s.hurt > 0) s.hurt -= dt;

      // --- input ---
      const left = input.held.left;
      const right = input.held.right;
      const targetVx = (right ? RUN_SPEED : 0) - (left ? RUN_SPEED : 0);
      // Snappy but not instant, so direction changes have a little weight.
      s.vx += (targetVx - s.vx) * Math.min(1, dt * 14);
      if (targetVx !== 0) s.facing = targetVx > 0 ? 1 : -1;

      if (input.consumeJump()) s.jumpBuffer = JUMP_BUFFER;
      if (s.jumpBuffer > 0) s.jumpBuffer -= dt;
      if (s.coyote > 0) s.coyote -= dt;

      if (s.jumpBuffer > 0 && (s.onGround || s.coyote > 0)) {
        s.vy = -JUMP_VELOCITY;
        s.onGround = false;
        s.coyote = 0;
        s.jumpBuffer = 0;
      }
      // Releasing early cuts the jump short: full control over height.
      if (!input.jumpHeld && s.vy < -110) s.vy = -110;

      // --- physics, one axis at a time so corners resolve cleanly ---
      s.vy = Math.min(s.vy + GRAVITY * dt, 520);

      const nextX = s.x + s.vx * dt;
      if (!overlapsSolid(tiles, nextX, s.y, PW, PH)) {
        s.x = nextX;
      } else {
        s.vx = 0;
      }

      const wasOnGround = s.onGround;
      const nextY = s.y + s.vy * dt;
      if (!overlapsSolid(tiles, s.x, nextY, PW, PH)) {
        s.y = nextY;
        s.onGround = false;
      } else {
        if (s.vy > 0) {
          // Landing: snap to the top of the tile below.
          s.y = Math.floor((nextY + PH) / TILE) * TILE - PH;
          s.onGround = true;
        } else {
          s.y = Math.floor(nextY / TILE) * TILE + TILE;
        }
        s.vy = 0;
      }
      if (wasOnGround && !s.onGround && s.vy >= 0) s.coyote = COYOTE_TIME;

      s.x = Math.max(0, Math.min(s.x, LEVEL_W - PW));

      // --- enemies ---
      for (const e of s.data.enemies) {
        if (!e.alive) {
          if (e.squash > 0) e.squash -= dt;
          continue;
        }
        e.x += e.vx * dt;
        const footTx = Math.floor((e.x + (e.vx > 0 ? PW : 0)) / TILE);
        const aheadTy = Math.floor((e.y + PH + 2) / TILE);
        const wallTx = Math.floor((e.x + (e.vx > 0 ? PW : -1)) / TILE);
        const wallTy = Math.floor((e.y + PH / 2) / TILE);
        // Turn around at a ledge or a wall so enemies never walk into pits.
        if (!solidAt(tiles, footTx, aheadTy) || solidAt(tiles, wallTx, wallTy)) {
          e.vx = -e.vx;
          e.x += e.vx * dt * 2;
        }

        const hit = s.x < e.x + PW && s.x + PW > e.x && s.y < e.y + PH && s.y + PH > e.y;
        if (hit && s.hurt <= 0) {
          const stomping = s.vy > 40 && s.y + PH - 8 < e.y;
          if (stomping) {
            e.alive = false;
            e.squash = 0.35;
            s.vy = -210;
            api.addScore(50);
          } else {
            s.hurt = 1;
            api.lifeLost();
            s.x = s.data.spawn.x;
            s.y = s.data.spawn.y;
            s.vx = 0;
            s.vy = 0;
          }
        }
      }

      // --- coins ---
      for (const c of s.data.coins) {
        if (c.taken) continue;
        if (Math.abs(c.x - (s.x + PW / 2)) < 11 && Math.abs(c.y - (s.y + PH / 2)) < 12) {
          c.taken = true;
          s.coinsTotal += 1;
          s.coinsSinceGate += 1;
          api.addScore(10);
          if (s.coinsSinceGate >= COINS_PER_GATE) {
            s.coinsSinceGate = 0;
            api.requestGate(`${s.coinsTotal} coins collected`);
          }
        }
      }

      // --- pit death ---
      if (s.y > VIEW_H + 30) {
        api.lifeLost();
        s.x = s.data.spawn.x;
        s.y = s.data.spawn.y;
        s.vx = 0;
        s.vy = 0;
        s.hurt = 0.6;
      }

      // --- flag ---
      if (s.x + PW > s.data.flagX && s.y + PH > (GROUND_TOP - 3) * TILE) {
        api.addScore(150);
        const nextLevel = s.level + 1;
        stateRef.current = freshState(nextLevel, s.coinsTotal);
        api.requestGate(`Level ${s.level} flag raised`);
        draw(ctx, stateRef.current);
        return;
      }

      // --- camera ---
      const want = s.x + PW / 2 - VIEW_W / 2;
      const clamped = Math.max(0, Math.min(want, LEVEL_W - VIEW_W));
      s.camera += (clamped - s.camera) * Math.min(1, dt * 8);

      draw(ctx, s);
    },
  });

  return (
    <canvas
      ref={canvasRef}
      className="block h-auto w-full touch-none"
      style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}
    />
  );
}

function draw(ctx: CanvasRenderingContext2D, s: State) {
  const cam = Math.round(s.camera);

  // Sky
  const sky = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  sky.addColorStop(0, '#1b2a4a');
  sky.addColorStop(1, '#33406b');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // Parallax hills
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 8; i += 1) {
    const span = VIEW_W + 360;
    const hx = (((i * 180 - cam * 0.3) % span) + span) % span - 180;
    ctx.beginPath();
    ctx.arc(hx, VIEW_H - 30, 70, Math.PI, 0);
    ctx.fill();
  }

  ctx.save();
  ctx.translate(-cam, 0);

  // Tiles
  const firstCol = Math.max(0, Math.floor(cam / TILE) - 1);
  const lastCol = Math.min(COLS - 1, Math.ceil((cam + VIEW_W) / TILE) + 1);
  for (let ty = 0; ty < ROWS; ty += 1) {
    for (let tx = firstCol; tx <= lastCol; tx += 1) {
      if (s.data.tiles[ty][tx] !== '#') continue;
      const px = tx * TILE;
      const py = ty * TILE;
      const topExposed = ty === 0 || s.data.tiles[ty - 1][tx] !== '#';
      ctx.fillStyle = topExposed ? '#4a8f4a' : '#6b4a2f';
      ctx.fillRect(px, py, TILE, TILE);
      if (topExposed) {
        ctx.fillStyle = '#5fb85f';
        ctx.fillRect(px, py, TILE, 4);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(px, py + TILE - 2, TILE, 2);
      ctx.fillRect(px + TILE - 2, py, 2, TILE);
    }
  }

  // Flag
  const fx = s.data.flagX;
  const fy = (GROUND_TOP - 5) * TILE;
  ctx.fillStyle = '#d9d9e3';
  ctx.fillRect(fx + 6, fy, 3, 5 * TILE);
  ctx.fillStyle = '#ffb84e';
  const wave = Math.sin(s.animTime * 4) * 2;
  ctx.beginPath();
  ctx.moveTo(fx + 9, fy + 2);
  ctx.lineTo(fx + 30 + wave, fy + 9);
  ctx.lineTo(fx + 9, fy + 16);
  ctx.closePath();
  ctx.fill();

  // Coins
  for (const c of s.data.coins) {
    if (c.taken) continue;
    if (c.x < cam - 20 || c.x > cam + VIEW_W + 20) continue;
    const bob = Math.sin(s.animTime * 3 + c.x * 0.05) * 1.5;
    ctx.fillStyle = '#ffd75e';
    ctx.beginPath();
    ctx.arc(c.x, c.y + bob, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(c.x - 1, c.y - 2 + bob, 2, 4);
  }

  // Enemies
  for (const e of s.data.enemies) {
    if (e.x < cam - 30 || e.x > cam + VIEW_W + 30) continue;
    if (!e.alive) {
      if (e.squash > 0) {
        ctx.fillStyle = '#8b5a3c';
        ctx.fillRect(e.x, e.y + PH - 4, PW, 4);
      }
      continue;
    }
    ctx.fillStyle = '#c1553f';
    ctx.fillRect(e.x, e.y + 2, PW, PH - 2);
    ctx.fillStyle = '#2a1410';
    // Feet shuffle so they read as walking.
    const step = Math.floor(s.animTime * 8) % 2 === 0 ? 0 : 2;
    ctx.fillRect(e.x + step, e.y + PH - 3, 4, 3);
    ctx.fillRect(e.x + PW - 4 - step, e.y + PH - 3, 4, 3);
    ctx.fillStyle = '#fff';
    ctx.fillRect(e.x + 2, e.y + 5, 3, 3);
    ctx.fillRect(e.x + PW - 5, e.y + 5, 3, 3);
  }

  // Player, blinking while briefly invulnerable after a hit.
  const blink = s.hurt > 0 && Math.floor(s.animTime * 20) % 2 === 0;
  if (!blink) {
    ctx.fillStyle = '#ffb84e';
    ctx.fillRect(s.x, s.y, PW, PH);
    ctx.fillStyle = '#e0453c';
    ctx.fillRect(s.x, s.y, PW, 5);
    ctx.fillStyle = '#2a1a10';
    const eyeX = s.facing > 0 ? s.x + PW - 4 : s.x + 2;
    ctx.fillRect(eyeX, s.y + 6, 2, 2);
    if (s.onGround && Math.abs(s.vx) > 20) {
      const step = Math.floor(s.animTime * 10) % 2 === 0 ? 0 : 2;
      ctx.fillRect(s.x + step, s.y + PH - 2, 3, 2);
      ctx.fillRect(s.x + PW - 3 - step, s.y + PH - 2, 3, 2);
    }
  }

  ctx.restore();

  // HUD
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = 'bold 11px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(`LEVEL ${s.level}`, 8, VIEW_H - 9);
  ctx.textAlign = 'right';
  ctx.fillText(`${s.coinsSinceGate}/${COINS_PER_GATE} to quiz`, VIEW_W - 8, VIEW_H - 9);
  ctx.textAlign = 'left';
}
