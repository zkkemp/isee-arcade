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
import { animFrame, drawFrame, useSprites, type SpriteSet } from '@/lib/sprites';
import { useCanvasGame } from '@/lib/useCanvasGame';

const VIEW_W = 320;
const VIEW_H = ROWS * TILE;

const GRAVITY = 880;
const RUN_SPEED = 118;
const JUMP_VELOCITY = 292;
/** Grace period after walking off a ledge where a jump still counts. */
const COYOTE_TIME = 0.09;
/** A jump pressed slightly before landing still fires on touchdown. */
const JUMP_BUFFER = 0.12;

const PW = 11;
const PH = 14;

type Spark = { x: number; y: number; vx: number; vy: number; life: number };

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
  coinsTotal: number;
  camera: number;
  hurt: number;
  animTime: number;
  /** Squash-and-stretch amount, 0 = neutral. Set on land and takeoff. */
  squash: number;
  sparks: Spark[];
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
    coinsTotal,
    camera: 0,
    hurt: 0,
    animTime: 0,
    squash: 0,
    sparks: [],
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

function burst(s: State, x: number, y: number, count: number, speed: number) {
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2;
    s.sparks.push({
      x,
      y,
      vx: Math.cos(a) * speed * (0.5 + Math.random()),
      vy: Math.sin(a) * speed * (0.5 + Math.random()) - 20,
      life: 0.45,
    });
  }
  if (s.sparks.length > 80) s.sparks.splice(0, s.sparks.length - 80);
}

export default function Platformer({ paused, input, api, restartToken }: GameCanvasProps) {
  const stateRef = useRef<State>(freshState(1));
  const sprites = useSprites();
  const spritesRef = useRef<SpriteSet | null>(null);
  useEffect(() => {
    spritesRef.current = sprites;
  }, [sprites]);

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
      if (s.squash > 0) s.squash = Math.max(0, s.squash - dt * 4);

      // --- input ---
      const left = input.held.left;
      const right = input.held.right;
      const targetVx = (right ? RUN_SPEED : 0) - (left ? RUN_SPEED : 0);
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
        s.squash = 0.6;
        burst(s, s.x + PW / 2, s.y + PH, 4, 40);
      }
      if (!input.jumpHeld && s.vy < -110) s.vy = -110;

      // --- physics, one axis at a time so corners resolve cleanly ---
      s.vy = Math.min(s.vy + GRAVITY * dt, 520);

      const nextX = s.x + s.vx * dt;
      if (!overlapsSolid(tiles, nextX, s.y, PW, PH)) s.x = nextX;
      else s.vx = 0;

      const wasOnGround = s.onGround;
      const nextY = s.y + s.vy * dt;
      const fallSpeed = s.vy;
      if (!overlapsSolid(tiles, s.x, nextY, PW, PH)) {
        s.y = nextY;
        s.onGround = false;
      } else {
        if (s.vy > 0) {
          s.y = Math.floor((nextY + PH) / TILE) * TILE - PH;
          s.onGround = true;
          if (!wasOnGround && fallSpeed > 220) {
            s.squash = 1;
            burst(s, s.x + PW / 2, s.y + PH, 5, 30);
          }
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
            s.squash = 0.8;
            burst(s, e.x + PW / 2, e.y + PH / 2, 8, 60);
            api.addScore(50);
          } else {
            s.hurt = 1;
            burst(s, s.x + PW / 2, s.y + PH / 2, 10, 70);
            api.died('An enemy got you');
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
          burst(s, c.x, c.y, 6, 50);
          api.addScore(10);
        }
      }

      // --- sparks ---
      for (const p of s.sparks) {
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 260 * dt;
      }
      s.sparks = s.sparks.filter((p) => p.life > 0);

      // --- pit death ---
      if (s.y > VIEW_H + 30) {
        api.died('You fell');
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
        api.requestGate(`Level ${s.level} cleared`);
        draw(ctx, stateRef.current, spritesRef.current);
        return;
      }

      // --- camera ---
      const want = s.x + PW / 2 - VIEW_W / 2;
      const clamped = Math.max(0, Math.min(want, LEVEL_W - VIEW_W));
      s.camera += (clamped - s.camera) * Math.min(1, dt * 8);

      draw(ctx, s, spritesRef.current);
    },
  });

  return <canvas ref={canvasRef} className="block h-full w-full touch-none" />;
}

/** Picks the autotile variant for a solid tile from which sides are exposed. */
function terrainFrame(tiles: string[][], tx: number, ty: number): string {
  const up = !solidAt(tiles, tx, ty - 1);
  const leftOpen = !solidAt(tiles, tx - 1, ty);
  const rightOpen = !solidAt(tiles, tx + 1, ty);

  if (up && leftOpen) return 'terrain_grass_block_top_left';
  if (up && rightOpen) return 'terrain_grass_block_top_right';
  if (up) return 'terrain_grass_block_top';
  if (leftOpen) return 'terrain_grass_block_left';
  if (rightOpen) return 'terrain_grass_block_right';
  return 'terrain_grass_block_center';
}

function draw(ctx: CanvasRenderingContext2D, s: State, sp: SpriteSet | null) {
  const cam = Math.round(s.camera);

  // --- sky ---
  const sky = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  sky.addColorStop(0, '#8fd3ff');
  sky.addColorStop(1, '#d8f1ff');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  if (!sp) {
    // Sprites still loading — show something rather than a blank frame.
    ctx.fillStyle = '#4a8f4a';
    ctx.fillRect(0, GROUND_TOP * TILE, VIEW_W, VIEW_H);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.font = 'bold 11px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('loading art…', VIEW_W / 2, VIEW_H / 2);
    ctx.textAlign = 'left';
    return;
  }

  // --- parallax hills, then clouds, both wrapping ---
  const hills = sp.backgrounds.frames['background_color_hills'];
  if (hills) {
    const hw = VIEW_H * (hills[2] / hills[3]);
    const off = -((cam * 0.25) % hw);
    for (let x = off - hw; x < VIEW_W + hw; x += hw) {
      drawFrame(ctx, sp.backgrounds, 'background_color_hills', x, 0, hw, VIEW_H);
    }
  }
  const clouds = sp.backgrounds.frames['background_clouds'];
  if (clouds) {
    const cw = VIEW_H * (clouds[2] / clouds[3]);
    const off = -((cam * 0.45) % cw);
    ctx.globalAlpha = 0.8;
    for (let x = off - cw; x < VIEW_W + cw; x += cw) {
      drawFrame(ctx, sp.backgrounds, 'background_clouds', x, 0, cw, VIEW_H);
    }
    ctx.globalAlpha = 1;
  }

  ctx.save();
  ctx.translate(-cam, 0);

  // --- terrain ---
  const firstCol = Math.max(0, Math.floor(cam / TILE) - 1);
  const lastCol = Math.min(COLS - 1, Math.ceil((cam + VIEW_W) / TILE) + 1);
  for (let ty = 0; ty < ROWS; ty += 1) {
    for (let tx = firstCol; tx <= lastCol; tx += 1) {
      if (s.data.tiles[ty][tx] !== '#') continue;
      drawFrame(
        ctx,
        sp.tiles,
        terrainFrame(s.data.tiles, tx, ty),
        tx * TILE,
        ty * TILE,
        TILE,
        TILE,
      );
    }
  }

  // --- flag, waving ---
  const flagName = animFrame(['flag_green_a', 'flag_green_b'], s.animTime, 4);
  drawFrame(ctx, sp.tiles, flagName, s.data.flagX, (GROUND_TOP - 2) * TILE, TILE, TILE * 2);

  // --- coins, spinning ---
  const coinName = animFrame(
    ['coin_gold', 'coin_gold', 'coin_gold_side', 'coin_gold_side'],
    s.animTime,
    6,
  );
  for (const c of s.data.coins) {
    if (c.taken) continue;
    if (c.x < cam - 20 || c.x > cam + VIEW_W + 20) continue;
    const bob = Math.sin(s.animTime * 3 + c.x * 0.05) * 1.5;
    drawFrame(ctx, sp.tiles, coinName, c.x - 6, c.y - 6 + bob, 12, 12);
  }

  // --- enemies ---
  for (const e of s.data.enemies) {
    if (e.x < cam - 30 || e.x > cam + VIEW_W + 30) continue;
    if (!e.alive) {
      if (e.squash > 0) {
        drawFrame(ctx, sp.enemies, 'slime_normal_flat', e.x - 2, e.y + PH - 6, 16, 8);
      }
      continue;
    }
    const walk = animFrame(['slime_normal_walk_a', 'slime_normal_walk_b'], s.animTime, 5);
    drawFrame(ctx, sp.enemies, walk, e.x - 2, e.y - 2, 16, 16, e.vx > 0);
  }

  // --- player ---
  const blink = s.hurt > 0 && Math.floor(s.animTime * 20) % 2 === 0;
  if (!blink) {
    let frame = 'character_green_idle';
    if (!s.onGround) frame = 'character_green_jump';
    else if (Math.abs(s.vx) > 20)
      frame = animFrame(['character_green_walk_a', 'character_green_walk_b'], s.animTime, 10);
    if (s.hurt > 0.5) frame = 'character_green_hit';

    // Squash on landing, stretch on takeoff. Cheap, and it makes jumps feel good.
    const sq = s.squash;
    const w = 16 * (1 + sq * 0.18);
    const h = 20 * (1 - sq * 0.18);
    drawFrame(ctx, sp.characters, frame, s.x + PW / 2 - w / 2, s.y + PH - h, w, h, s.facing < 0);
  }

  // --- sparks ---
  for (const p of s.sparks) {
    ctx.globalAlpha = Math.max(0, p.life / 0.45);
    ctx.fillStyle = '#fff3c4';
    ctx.fillRect(p.x - 1, p.y - 1, 2.5, 2.5);
  }
  ctx.globalAlpha = 1;

  ctx.restore();

  // --- HUD ---
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.fillRect(0, VIEW_H - 18, VIEW_W, 18);
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.font = 'bold 10px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(`LEVEL ${s.level}`, 6, VIEW_H - 6);
  ctx.textAlign = 'right';
  ctx.fillText(`${s.coinsTotal} coins`, VIEW_W - 6, VIEW_H - 6);
  ctx.textAlign = 'left';
}
