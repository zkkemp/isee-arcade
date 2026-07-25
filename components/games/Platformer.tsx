'use client';

import { useEffect, useRef } from 'react';
import type { GameCanvasProps } from '@/lib/games';
import {
  COLS,
  COYOTE_TIME,
  GROUND_TOP,
  JUMP_BUFFER,
  LEVEL_W,
  PH,
  PW,
  ROWS,
  TILE,
  WORLD_H,
  buildLevel,
  coinTouched,
  flagTouched,
  solidAt,
  stepBody,
  type Backdrop,
  type Biome,
  type Block,
  type Body,
  type DecorKind,
  type Enemy,
  type Level,
  type TileCode,
} from '@/lib/platformerLevel';
import { animFrame, drawFrame, useSprites, type SpriteSet } from '@/lib/sprites';
import { useCanvasGame } from '@/lib/useCanvasGame';

/**
 * How much world width we aim to show, in pixels (18 tiles). Fitting the world's
 * HEIGHT to a tall phone zooms in so far that you cannot see what is coming, so
 * width is the primary constraint and height only clamps it.
 */
const TARGET_VIEW_W = 18 * TILE;
/**
 * Cap on surplus vertical space, as a multiple of the world's height. A tall
 * phone is much narrower than a platformer level is wide, so something has to
 * give: without this the ground sits in a thin strip at the bottom under a
 * screenful of empty sky.
 */
const MAX_SKY_FACTOR = 1.3;

type Spark = { x: number; y: number; vx: number; vy: number; life: number };
/** A coin knocked out of a block: pops up, then vanishes. Already scored. */
type Pop = { x: number; y: number; vy: number; life: number };

type State = {
  level: number;
  data: Level;
  body: Body;
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
  pops: Pop[];
};

function freshState(level: number, difficulty: GameCanvasProps['difficulty'], coinsTotal = 0): State {
  const data = buildLevel(level, difficulty);
  return {
    level,
    data,
    body: { x: data.spawn.x, y: data.spawn.y, vx: 0, vy: 0, onGround: false },
    facing: 1,
    coyote: 0,
    jumpBuffer: 0,
    coinsTotal,
    camera: 0,
    hurt: 0,
    animTime: 0,
    squash: 0,
    sparks: [],
    pops: [],
  };
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

function respawn(s: State) {
  s.body.x = s.data.spawn.x;
  s.body.y = s.data.spawn.y;
  s.body.vx = 0;
  s.body.vy = 0;
  s.camera = Math.max(0, s.data.spawn.x - 60);
}

export default function Platformer({
  paused,
  input,
  api,
  restartToken,
  difficulty,
  controlsInset,
}: GameCanvasProps) {
  const stateRef = useRef<State>(freshState(1, difficulty));
  const sprites = useSprites();
  const spritesRef = useRef<SpriteSet | null>(null);
  useEffect(() => {
    spritesRef.current = sprites;
  }, [sprites]);

  // Difficulty changes the geometry, so it has to rebuild rather than rescale.
  useEffect(() => {
    stateRef.current = freshState(1, difficulty);
  }, [restartToken, difficulty]);

  // The step closure is captured per frame by useCanvasGame, but the inset can
  // change on rotation, so read it through a ref updated after commit.
  const insetRef = useRef(controlsInset);
  useEffect(() => {
    insetRef.current = controlsInset;
  }, [controlsInset]);

  const { canvasRef } = useCanvasGame({
    active: !paused,
    step: (ctx, dt, cw, ch) => {
      const s = stateRef.current;
      const tiles = s.data.tiles;

      // --- view layout ---
      // The bottom band belongs to the thumb buttons: the world is laid out in
      // the space ABOVE it, so nothing the player must see or hit is under a hand.
      const playH = Math.max(80, ch - insetRef.current);
      const zoomFit = playH / WORLD_H;
      const zoom = Math.min(
        Math.max(cw / TARGET_VIEW_W, playH / (WORLD_H * MAX_SKY_FACTOR)),
        zoomFit,
      );
      const viewW = cw / zoom;
      const viewH = playH / zoom;
      // Ground pinned to the bottom of the play area; surplus becomes sky.
      const offsetY = Math.max(0, viewH - WORLD_H);

      s.animTime += dt;
      if (s.hurt > 0) s.hurt -= dt;
      if (s.squash > 0) s.squash = Math.max(0, s.squash - dt * 4);

      // --- input ---
      const b = s.body;
      if (input.consumeJump()) s.jumpBuffer = JUMP_BUFFER;
      if (s.jumpBuffer > 0) s.jumpBuffer -= dt;
      if (s.coyote > 0) s.coyote -= dt;

      const canJump = b.onGround || s.coyote > 0;
      const firing = s.jumpBuffer > 0 && canJump;
      if (firing) {
        s.jumpBuffer = 0;
        s.coyote = 0;
        s.squash = 0.6;
        burst(s, b.x + PW / 2, b.y + PH, 4, 40);
      }
      if (input.held.left !== input.held.right) s.facing = input.held.right ? 1 : -1;

      const res = stepBody(
        tiles,
        b,
        {
          left: input.held.left,
          right: input.held.right,
          jump: firing,
          jumpHeld: input.jumpHeld,
        },
        dt,
      );
      if (res.leftGround && b.vy >= 0) s.coyote = COYOTE_TIME;
      if (res.landedAt > 220) {
        s.squash = 1;
        burst(s, b.x + PW / 2, b.y + PH, 5, 30);
      }

      // --- punched blocks ---
      if (res.headHit) {
        const hit = s.data.blocks.find(
          (blk) => blk.tx === res.headHit!.tx && blk.ty === res.headHit!.ty,
        );
        if (hit) {
          hit.bump = 0.18;
          if (hit.kind === 'coin' && !hit.used) {
            hit.used = true;
            s.coinsTotal += 1;
            s.pops.push({ x: hit.tx * TILE + TILE / 2, y: hit.ty * TILE, vy: -90, life: 0.5 });
            burst(s, hit.tx * TILE + TILE / 2, hit.ty * TILE, 5, 45);
            api.addScore(10);
          }
        }
      }
      for (const blk of s.data.blocks) if (blk.bump > 0) blk.bump -= dt;

      // --- enemies ---
      for (const e of s.data.enemies) {
        if (!e.alive) {
          if (e.squash > 0) e.squash -= dt;
          continue;
        }
        if (e.kind === 'flyer') {
          // A sine bob on a fixed lane: no terrain probing, so flyer lanes are
          // generated over open ground only.
          e.x += e.vx * dt;
          if (e.x < e.minX || e.x > e.maxX) e.vx = -e.vx;
          e.y = e.baseY + Math.sin(s.animTime * 2.4 + e.phase) * 9;
        } else {
          e.x += e.vx * dt;
          const footTx = Math.floor((e.x + (e.vx > 0 ? PW : 0)) / TILE);
          const aheadTy = Math.floor((e.y + PH + 2) / TILE);
          const wallTx = Math.floor((e.x + (e.vx > 0 ? PW : -1)) / TILE);
          const wallTy = Math.floor((e.y + PH / 2) / TILE);
          const edge = !solidAt(tiles, footTx, aheadTy) || solidAt(tiles, wallTx, wallTy);
          if (edge || e.x < e.minX || e.x > e.maxX) {
            e.vx = -e.vx;
            e.x += e.vx * dt * 2;
          }
        }

        const hit = b.x < e.x + PW && b.x + PW > e.x && b.y < e.y + PH && b.y + PH > e.y;
        if (hit && s.hurt <= 0) {
          const stomping = b.vy > 40 && b.y + PH - 8 < e.y;
          if (stomping) {
            e.alive = false;
            e.squash = 0.35;
            b.vy = -230;
            s.squash = 0.8;
            burst(s, e.x + PW / 2, e.y + PH / 2, 8, 60);
            api.addScore(50);
          } else {
            s.hurt = 1;
            burst(s, b.x + PW / 2, b.y + PH / 2, 10, 70);
            api.died('An enemy got you');
            respawn(s);
          }
        }
      }

      // --- coins ---
      for (const c of s.data.coins) {
        if (c.taken) continue;
        if (!coinTouched(b, c)) continue;
        c.taken = true;
        s.coinsTotal += 1;
        burst(s, c.x, c.y, 6, 50);
        api.addScore(10);
      }

      // --- effects ---
      for (const p of s.sparks) {
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 260 * dt;
      }
      s.sparks = s.sparks.filter((p) => p.life > 0);
      for (const p of s.pops) {
        p.life -= dt;
        p.y += p.vy * dt;
        p.vy += 320 * dt;
      }
      s.pops = s.pops.filter((p) => p.life > 0);

      // --- pit death ---
      if (b.y > WORLD_H + 30) {
        api.died('You fell');
        respawn(s);
        s.hurt = 0.6;
      }

      // --- flag ---
      if (flagTouched(b, s.data.flagX)) {
        api.addScore(150);
        const cleared = s.level;
        stateRef.current = freshState(cleared + 1, difficulty, s.coinsTotal);
        api.requestGate(`Level ${cleared} cleared`);
        draw(ctx, stateRef.current, spritesRef.current, viewW, zoom, offsetY, cw, ch, playH);
        return;
      }

      // --- camera ---
      const want = b.x + PW / 2 - viewW / 2;
      const clamped = Math.max(0, Math.min(want, Math.max(0, LEVEL_W - viewW)));
      s.camera += (clamped - s.camera) * Math.min(1, dt * 8);

      draw(ctx, s, spritesRef.current, viewW, zoom, offsetY, cw, ch, playH);
    },
  });

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />;
}

// --- sprite tables --------------------------------------------------------
// Written out as literals rather than composed from the biome name so
// `npm run check:sprites`, which scans this file for quoted names, can see them.

type TerrainSet = {
  top: string;
  topLeft: string;
  topRight: string;
  center: string;
  left: string;
  right: string;
  bottom: string;
};

const TERRAIN: Record<Biome, TerrainSet> = {
  grass: {
    top: 'terrain_grass_block_top',
    topLeft: 'terrain_grass_block_top_left',
    topRight: 'terrain_grass_block_top_right',
    center: 'terrain_grass_block_center',
    left: 'terrain_grass_block_left',
    right: 'terrain_grass_block_right',
    bottom: 'terrain_grass_block_bottom',
  },
  sand: {
    top: 'terrain_sand_block_top',
    topLeft: 'terrain_sand_block_top_left',
    topRight: 'terrain_sand_block_top_right',
    center: 'terrain_sand_block_center',
    left: 'terrain_sand_block_left',
    right: 'terrain_sand_block_right',
    bottom: 'terrain_sand_block_bottom',
  },
  snow: {
    top: 'terrain_snow_block_top',
    topLeft: 'terrain_snow_block_top_left',
    topRight: 'terrain_snow_block_top_right',
    center: 'terrain_snow_block_center',
    left: 'terrain_snow_block_left',
    right: 'terrain_snow_block_right',
    bottom: 'terrain_snow_block_bottom',
  },
  stone: {
    top: 'terrain_stone_block_top',
    topLeft: 'terrain_stone_block_top_left',
    topRight: 'terrain_stone_block_top_right',
    center: 'terrain_stone_block_center',
    left: 'terrain_stone_block_left',
    right: 'terrain_stone_block_right',
    bottom: 'terrain_stone_block_bottom',
  },
  dirt: {
    top: 'terrain_dirt_block_top',
    topLeft: 'terrain_dirt_block_top_left',
    topRight: 'terrain_dirt_block_top_right',
    center: 'terrain_dirt_block_center',
    left: 'terrain_dirt_block_left',
    right: 'terrain_dirt_block_right',
    bottom: 'terrain_dirt_block_bottom',
  },
  purple: {
    top: 'terrain_purple_block_top',
    topLeft: 'terrain_purple_block_top_left',
    topRight: 'terrain_purple_block_top_right',
    center: 'terrain_purple_block_center',
    left: 'terrain_purple_block_left',
    right: 'terrain_purple_block_right',
    bottom: 'terrain_purple_block_bottom',
  },
};

const BACKDROP_LAYERS: Record<Backdrop, { far: string; near: string }> = {
  hills: { far: 'background_fade_hills', near: 'background_color_hills' },
  desert: { far: 'background_fade_desert', near: 'background_color_desert' },
  trees: { far: 'background_fade_trees', near: 'background_color_trees' },
  mushrooms: { far: 'background_fade_mushrooms', near: 'background_color_mushrooms' },
};

/** Sky gradient per biome, drawn under the parallax so the tone is never flat. */
const SKY: Record<Biome, [string, string]> = {
  grass: ['#8fd3ff', '#d8f1ff'],
  sand: ['#ffd79a', '#fff0d2'],
  snow: ['#bfe4ff', '#f2fbff'],
  stone: ['#9fb6cf', '#dfe9f2'],
  dirt: ['#f0c79a', '#ffeedd'],
  purple: ['#b79cf0', '#e9dcff'],
};

/** The strip behind the thumb buttons, so the world does not just stop. */
const BAND: Record<Biome, string> = {
  grass: 'background_solid_grass',
  sand: 'background_solid_sand',
  snow: 'background_solid_cloud',
  stone: 'background_solid_dirt',
  dirt: 'background_solid_dirt',
  purple: 'background_solid_dirt',
};

const DECOR_SPRITE: Record<DecorKind, string> = {
  bush: 'bush',
  cactus: 'cactus',
  mushroom_red: 'mushroom_red',
  mushroom_brown: 'mushroom_brown',
  rock: 'rock',
  fence: 'fence',
  fence_broken: 'fence_broken',
  hill: 'hill',
  sign: 'sign',
};

const ENEMY_SPRITES: Record<Enemy['kind'], { walk: string[]; dead: string }> = {
  slime: { walk: ['slime_normal_walk_a', 'slime_normal_walk_b'], dead: 'slime_normal_flat' },
  walker: { walk: ['ladybug_walk_a', 'ladybug_walk_b'], dead: 'ladybug_rest' },
  flyer: { walk: ['bee_a', 'bee_b'], dead: 'bee_rest' },
};

/** Picks the autotile variant for a terrain tile from which sides are exposed. */
function terrainFrame(tiles: TileCode[][], tx: number, ty: number, set: TerrainSet): string {
  const up = !solidAt(tiles, tx, ty - 1);
  const leftOpen = !solidAt(tiles, tx - 1, ty);
  const rightOpen = !solidAt(tiles, tx + 1, ty);
  const downOpen = !solidAt(tiles, tx, ty + 1);

  if (up && leftOpen) return set.topLeft;
  if (up && rightOpen) return set.topRight;
  if (up) return set.top;
  if (leftOpen) return set.left;
  if (rightOpen) return set.right;
  if (downOpen) return set.bottom;
  return set.center;
}

function blockFrame(blk: Block, time: number): string {
  if (blk.kind === 'brick') return 'block_planks';
  if (blk.used) return 'block_empty';
  // The active variant flashes so an unhit coin block reads as interactive.
  return animFrame(['block_coin', 'block_coin', 'block_coin_active'], time, 4);
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
  playH: number,
) {
  const cam = Math.round(s.camera);
  const biome = s.data.biome;

  const [skyTop, skyBottom] = SKY[biome];
  const sky = ctx.createLinearGradient(0, 0, 0, playH);
  sky.addColorStop(0, skyTop);
  sky.addColorStop(1, skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, cw, ch);

  if (!sp) {
    // Sprites still loading — show something rather than a blank frame.
    ctx.fillStyle = '#4a8f4a';
    ctx.fillRect(0, playH - 40, cw, 40);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.font = 'bold 13px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('loading art', cw / 2, playH / 2);
    ctx.textAlign = 'left';
    return;
  }

  // Parallax in SCREEN space, sized to the play area. Anchoring these to the
  // world instead left a hard seam where the backdrop stopped and raw sky began.
  // Each band covers only part of the height, bottom-anchored, so the sky
  // gradient shows through above instead of a wall of flat backdrop white.
  const layers = BACKDROP_LAYERS[s.data.backdrop];
  /**
   * Each backdrop frame is opaque with a white sky filling its top half, so a
   * second layer drawn on top would erase the first. Layers are therefore
   * clipped to the band where their scenery lives, and the biome sky gradient is
   * multiplied over the lot afterwards. That turns every white region — the art's
   * own sky and the gaps between clipped bands — into the same graded sky, so the
   * layering leaves no seams and each biome gets its own light.
   */
  const drawBand = (name: string, factor: number, alpha: number, topFrac: number, bottomFrac = 1) => {
    const f = sp.backgrounds.frames[name];
    if (!f) return;
    const bandTop = playH * topFrac;
    const bandH = playH * bottomFrac - bandTop;
    if (bandH <= 0) return;
    const w = playH * (f[2] / f[3]);
    const off = -(((cam * factor * zoom) % w) + w);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, bandTop, cw, bandH);
    ctx.clip();
    ctx.globalAlpha = alpha;
    for (let x = off; x < cw + w; x += w) {
      drawFrame(ctx, sp.backgrounds, name, x, 0, w, playH);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  };
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cw, playH);
  drawBand(layers.far, 0.15, 1, 0);
  // Kept faint: the band's lower clip edge is a tone step, invisible at low alpha.
  drawBand('background_clouds', 0.32, 0.4, 0, 0.46);
  drawBand(layers.near, 0.45, 1, 0.62);

  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, cw, playH);
  ctx.globalCompositeOperation = 'source-over';

  // World drawing happens in world units, with the ground pinned to the bottom
  // of the play area (above the controls band).
  ctx.save();
  ctx.scale(zoom, zoom);
  ctx.translate(0, offsetY);
  ctx.save();
  ctx.translate(-cam, 0);

  const terrain = TERRAIN[biome];
  const firstCol = Math.max(0, Math.floor(cam / TILE) - 1);
  const lastCol = Math.min(COLS - 1, Math.ceil((cam + viewW) / TILE) + 1);

  // --- decor behind the terrain silhouette, so bushes tuck into the ground ---
  for (const d of s.data.decor) {
    if (d.tx < firstCol || d.tx > lastCol) continue;
    drawFrame(ctx, sp.tiles, DECOR_SPRITE[d.kind], d.tx * TILE, d.ty * TILE, TILE, TILE);
  }

  // --- terrain and blocks ---
  const blockAt = new Map<string, Block>();
  for (const blk of s.data.blocks) blockAt.set(`${blk.tx},${blk.ty}`, blk);
  for (let ty = 0; ty < ROWS; ty += 1) {
    for (let tx = firstCol; tx <= lastCol; tx += 1) {
      const code = s.data.tiles[ty][tx];
      if (code === '.') continue;
      if (code === '#') {
        drawFrame(ctx, sp.tiles, terrainFrame(s.data.tiles, tx, ty, terrain), tx * TILE, ty * TILE, TILE, TILE);
        continue;
      }
      const blk = blockAt.get(`${tx},${ty}`);
      const lift = blk && blk.bump > 0 ? -3 : 0;
      const name = blk ? blockFrame(blk, s.animTime) : 'block_planks';
      drawFrame(ctx, sp.tiles, name, tx * TILE, ty * TILE + lift, TILE, TILE);
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
  for (const p of s.pops) {
    ctx.globalAlpha = Math.max(0, p.life / 0.5);
    drawFrame(ctx, sp.tiles, 'coin_bronze', p.x - 6, p.y - 6, 12, 12);
    ctx.globalAlpha = 1;
  }

  // --- enemies ---
  for (const e of s.data.enemies) {
    if (e.x < cam - 30 || e.x > cam + viewW + 30) continue;
    const art = ENEMY_SPRITES[e.kind];
    if (!e.alive) {
      if (e.squash > 0) drawFrame(ctx, sp.enemies, art.dead, e.x - 2, e.y + PH - 6, 16, 8);
      continue;
    }
    const fps = e.kind === 'flyer' ? 12 : 5;
    drawFrame(ctx, sp.enemies, animFrame(art.walk, s.animTime, fps), e.x - 2, e.y - 2, 16, 16, e.vx > 0);
  }

  // --- player ---
  const b = s.body;
  const blink = s.hurt > 0 && Math.floor(s.animTime * 20) % 2 === 0;
  if (!blink) {
    let frame = 'character_green_idle';
    if (!b.onGround) frame = 'character_green_jump';
    else if (Math.abs(b.vx) > 20)
      frame = animFrame(['character_green_walk_a', 'character_green_walk_b'], s.animTime, 10);
    if (s.hurt > 0.5) frame = 'character_green_hit';

    // Squash on landing, stretch on takeoff. Cheap, and it makes jumps feel good.
    const sq = s.squash;
    const w = 16 * (1 + sq * 0.18);
    const h = 20 * (1 - sq * 0.18);
    drawFrame(ctx, sp.characters, frame, b.x + PW / 2 - w / 2, b.y + PH - h, w, h, s.facing < 0);
  }

  // --- sparks ---
  for (const p of s.sparks) {
    ctx.globalAlpha = Math.max(0, p.life / 0.45);
    ctx.fillStyle = '#fff3c4';
    ctx.fillRect(p.x - 1, p.y - 1, 2.5, 2.5);
  }
  ctx.globalAlpha = 1;

  ctx.restore(); // end camera translate
  ctx.restore(); // end world scale

  // --- controls band, in screen pixels ---
  if (ch > playH) {
    const f = sp.backgrounds.frames[BAND[biome]];
    if (f) {
      const tileW = (ch - playH) * (f[2] / f[3]);
      for (let x = 0; x < cw; x += tileW) {
        drawFrame(ctx, sp.backgrounds, BAND[biome], x, playH, tileW, ch - playH);
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, playH, cw, ch - playH);
  }

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
