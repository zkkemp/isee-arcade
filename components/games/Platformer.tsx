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

/**
 * The world is a fixed number of tiles tall; how much WIDTH is visible depends on
 * the screen's aspect ratio. That is what lets the game fill a tall phone and a
 * wide iPad without letterboxing.
 */
const WORLD_H = ROWS * TILE;
/**
 * How much world width we aim to show, in pixels (18 tiles). Fitting the world's
 * HEIGHT to a tall phone zooms in so far that you cannot see what is coming, so
 * width is the primary constraint and height only clamps it on wide screens.
 */
const TARGET_VIEW_W = 18 * TILE;
/**
 * Cap on surplus vertical space, as a multiple of the world's height. A tall
 * phone is much narrower than a platformer level is wide, so something has to
 * give: without this the ground sits in a thin strip at the bottom under a
 * screenful of empty sky. Zooming in a little instead keeps the playfield
 * central at the cost of some forward visibility.
 */
const MAX_SKY_FACTOR = 1.3;

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
    active: !paused,
    step: (ctx, dt, cw, ch) => {
      const s = stateRef.current;
      const tiles = s.data.tiles;
      // Show a useful amount of width, but never less world height than exists.
      const zoom = Math.max(cw / TARGET_VIEW_W, ch / (WORLD_H * MAX_SKY_FACTOR));
      const viewW = cw / zoom;
      const viewH = ch / zoom;
      // Anchor the ground to the bottom of the screen; any surplus is sky.
      const offsetY = Math.max(0, viewH - WORLD_H);
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
      if (s.y > WORLD_H + 30) {
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
        draw(ctx, stateRef.current, spritesRef.current, viewW, zoom, offsetY, cw, ch);
        return;
      }

      // --- camera ---
      const want = s.x + PW / 2 - viewW / 2;
      const clamped = Math.max(0, Math.min(want, Math.max(0, LEVEL_W - viewW)));
      s.camera += (clamped - s.camera) * Math.min(1, dt * 8);

      draw(ctx, s, spritesRef.current, viewW, zoom, offsetY, cw, ch);
    },
  });

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />;
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

function draw(
  ctx: CanvasRenderingContext2D,
  s: State,
  sp: SpriteSet | null,
  viewW: number,
  zoom: number,
  offsetY: number,
  cw: number,
  ch: number,
) {
  const cam = Math.round(s.camera);

  // Sky in screen space so it covers the whole canvas, including the surplus
  // above a short world on a tall screen.
  const sky = ctx.createLinearGradient(0, 0, 0, ch);
  sky.addColorStop(0, '#8fd3ff');
  sky.addColorStop(1, '#d8f1ff');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, cw, ch);

  if (!sp) {
    // Sprites still loading — show something rather than a blank frame.
    ctx.fillStyle = '#4a8f4a';
    ctx.fillRect(0, ch - 40, cw, 40);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.font = 'bold 13px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('loading art', cw / 2, ch / 2);
    ctx.textAlign = 'left';
    return;
  }

  // Parallax in SCREEN space, sized to the canvas. Anchoring these to the world
  // instead left a hard seam where the backdrop stopped and raw sky began.
  const drawLayer = (name: string, factor: number, alpha: number) => {
    const f = sp.backgrounds.frames[name];
    if (!f) return;
    const w = ch * (f[2] / f[3]);
    const off = -(((cam * factor * zoom) % w) + w);
    ctx.globalAlpha = alpha;
    for (let x = off; x < cw + w; x += w) {
      drawFrame(ctx, sp.backgrounds, name, x, 0, w, ch);
    }
    ctx.globalAlpha = 1;
  };
  drawLayer('background_color_hills', 0.25, 1);
  drawLayer('background_clouds', 0.45, 0.75);

  // World drawing happens in world units, with the ground pinned to the bottom.
  ctx.save();
  ctx.scale(zoom, zoom);
  ctx.translate(0, offsetY);

  ctx.save();
  ctx.translate(-cam, 0);

  // --- terrain ---
  const firstCol = Math.max(0, Math.floor(cam / TILE) - 1);
  const lastCol = Math.min(COLS - 1, Math.ceil((cam + viewW) / TILE) + 1);
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
    if (c.x < cam - 20 || c.x > cam + viewW + 20) continue;
    const bob = Math.sin(s.animTime * 3 + c.x * 0.05) * 1.5;
    drawFrame(ctx, sp.tiles, coinName, c.x - 6, c.y - 6 + bob, 12, 12);
  }

  // --- enemies ---
  for (const e of s.data.enemies) {
    if (e.x < cam - 30 || e.x > cam + viewW + 30) continue;
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

  ctx.restore();   // end camera translate
  ctx.restore();   // end world scale

  // --- HUD at the TOP, in screen pixels. The bottom belongs to thumbs. ---
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(0, 0, cw, 26);
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.font = 'bold 13px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(`LEVEL ${s.level}`, 10, 18);
  ctx.textAlign = 'right';
  ctx.fillText(`${s.coinsTotal} coins`, cw - 10, 18);
  ctx.textAlign = 'left';
}
