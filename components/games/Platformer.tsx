'use client';

import { useEffect, useRef } from 'react';
import type { GameCanvasProps } from '@/lib/games';
import {
  CAMERA_LERP,
  CAMERA_LOOKAHEAD,
  COLS,
  COYOTE_TIME,
  FLAG_H,
  GRAVITY,
  GROUND_TOP,
  JUMP_BUFFER,
  LEVEL_W,
  MAX_FALL,
  MOVER_H,
  PH,
  PH_BIG,
  PW,
  ROWS,
  RUN_SPEED,
  STOMP_BOUNCE,
  STOMP_BOUNCE_HELD,
  TILE,
  WORLD_H,
  buildLevel,
  cameraY,
  coinTouched,
  doorExit,
  flagTouched,
  isSpiky,
  kickShell,
  landOnMover,
  moverX,
  moverY,
  overlapsSolid,
  solidAt,
  stepBody,
  stepEnemy,
  stepMover,
  toShell,
  viewport,
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
import { playSound } from '@/lib/sound';
import { useCanvasGame } from '@/lib/useCanvasGame';

type Spark = { x: number; y: number; vx: number; vy: number; life: number; hue: string };
/** A coin knocked out of a block: pops up, then vanishes. Already scored. */
type Pop = { x: number; y: number; vy: number; life: number };
/** A quarter of a smashed brick. */
type Chunk = { x: number; y: number; vx: number; vy: number; life: number; spin: number };
/** The grow mushroom, out of its block and walking. */
type Pickup = { x: number; y: number; vx: number; vy: number; onGround: boolean; rise: number };
/** Floating score text, so a stomp or a hoard reads as a reward. */
type Blip = { x: number; y: number; life: number; text: string };

type State = {
  level: number;
  data: Level;
  body: Body;
  facing: 1 | -1;
  coyote: number;
  jumpBuffer: number;
  coinsTotal: number;
  /** Coins collected in THIS level, for the clear bonus. */
  coinsHere: number;
  camX: number;
  camY: number;
  /** Blink-invulnerability window after taking a hit. */
  hurt: number;
  /** True while grown. A hit costs this instead of a life. */
  big: boolean;
  animTime: number;
  /** Squash-and-stretch amount, 0 = neutral. Set on land and takeoff. */
  squash: number;
  /** Index of the mover being ridden, or -1. */
  riding: number;
  /** Seconds standing still in a doorway, and the warp cooldown. */
  dwell: number;
  doorCd: number;
  /** Where a death puts the player back. Advances past the checkpoint. */
  respawnX: number;
  checkpointHit: boolean;
  /** Countdown of the end-of-level celebration. */
  finish: number;
  sparks: Spark[];
  pops: Pop[];
  chunks: Chunk[];
  pickups: Pickup[];
  blips: Blip[];
};

function freshState(level: number, difficulty: GameCanvasProps['difficulty'], coinsTotal = 0): State {
  const data = buildLevel(level, difficulty);
  return {
    level,
    data,
    body: { x: data.spawn.x, y: data.spawn.y, vx: 0, vy: 0, onGround: false, h: PH },
    facing: 1,
    coyote: 0,
    jumpBuffer: 0,
    coinsTotal,
    coinsHere: 0,
    camX: 0,
    camY: 0,
    hurt: 0,
    big: false,
    animTime: 0,
    squash: 0,
    riding: -1,
    dwell: 0,
    doorCd: 0,
    respawnX: data.spawn.x,
    checkpointHit: false,
    finish: 0,
    sparks: [],
    pops: [],
    chunks: [],
    pickups: [],
    blips: [],
  };
}

function burst(s: State, x: number, y: number, count: number, speed: number, hue = '#fff3c4') {
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2;
    s.sparks.push({
      x,
      y,
      vx: Math.cos(a) * speed * (0.5 + Math.random()),
      vy: Math.sin(a) * speed * (0.5 + Math.random()) - 20,
      life: 0.45,
      hue,
    });
  }
  if (s.sparks.length > 90) s.sparks.splice(0, s.sparks.length - 90);
}

function blip(s: State, x: number, y: number, text: string) {
  s.blips.push({ x, y, life: 0.7, text });
  if (s.blips.length > 12) s.blips.shift();
}

function bodyTop(s: State): number {
  return s.big ? PH_BIG : PH;
}

/** Grows the player, nudging the taller hitbox up out of the floor. */
function grow(s: State) {
  if (s.big) return;
  const b = s.body;
  const lifted = b.y - (PH_BIG - PH);
  // Refuse rather than clip: a grow under a low ceiling would embed the head.
  if (overlapsSolid(s.data.tiles, b.x, lifted, PW, PH_BIG)) return;
  b.y = lifted;
  b.h = PH_BIG;
  s.big = true;
  s.squash = 1;
  playSound('powerup');
  burst(s, b.x + PW / 2, b.y + PH_BIG / 2, 12, 70, '#ffe08a');
}

function shrink(s: State) {
  const b = s.body;
  b.y += PH_BIG - PH;
  b.h = PH;
  s.big = false;
}

function respawn(s: State) {
  const b = s.body;
  b.x = s.respawnX;
  b.y = (GROUND_TOP - 3) * TILE;
  b.vx = 0;
  b.vy = 0;
  b.cut = false;
  s.riding = -1;
  s.camX = Math.max(0, b.x - 60);
}

/**
 * One hit. Grown costs the power-up and buys an invulnerable window; small costs
 * the life. The shell handles what a death means now, so this only has to put the
 * player back on their feet.
 */
function takeHit(s: State, api: GameCanvasProps['api'], why: string) {
  if (s.hurt > 0 || s.finish > 0) return;
  const b = s.body;
  if (s.big) {
    shrink(s);
    s.hurt = 1.6;
    playSound('brick');
    burst(s, b.x + PW / 2, b.y + PH / 2, 10, 60, '#ffd9d9');
    blip(s, b.x, b.y, 'ouch');
    return;
  }
  s.hurt = 1.2;
  playSound('gameOver');
  burst(s, b.x + PW / 2, b.y + PH / 2, 12, 75, '#ffb0b0');
  api.died(why);
  respawn(s);
}

/** Pickups walk like a slow enemy and turn at ledges, so they cannot be lost. */
function stepPickup(tiles: TileCode[][], p: Pickup, dt: number) {
  if (p.rise > 0) {
    // Emerging from its block: rises clear before it starts walking.
    p.rise -= dt;
    p.y -= 26 * dt;
    return;
  }
  p.vy = Math.min(p.vy + GRAVITY * dt, MAX_FALL);
  const nextX = p.x + p.vx * dt;
  if (overlapsSolid(tiles, nextX, p.y, PW, PH)) p.vx = -p.vx;
  else p.x = nextX;
  const nextY = p.y + p.vy * dt;
  if (!overlapsSolid(tiles, p.x, nextY, PW, PH)) {
    p.y = nextY;
    p.onGround = false;
  } else if (p.vy > 0) {
    p.y = Math.floor((nextY + PH) / TILE) * TILE - PH;
    p.vy = 0;
    p.onGround = true;
  } else {
    p.y = Math.floor(nextY / TILE) * TILE + TILE;
    p.vy = 0;
  }
  if (p.onGround) {
    const aheadTx = Math.floor((p.x + (p.vx > 0 ? PW + 1 : -1)) / TILE);
    const belowTy = Math.floor((p.y + PH + 2) / TILE);
    if (!solidAt(tiles, aheadTx, belowTy)) p.vx = -p.vx;
  }
  p.x = Math.max(0, Math.min(p.x, LEVEL_W - PW));
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
      const b = s.body;

      // --- view layout ---
      // The bottom band belongs to the thumb buttons: the world is laid out in
      // the space ABOVE it, so nothing the player must see or hit is under a hand.
      const playH = Math.max(80, ch - insetRef.current);
      // `viewport` lives in the level module so the verifier can prove the framing
      // fills the canvas on real device sizes rather than only on this one.
      const { zoom, viewW, viewH, skyPad } = viewport(cw, playH);

      s.animTime += dt;
      if (s.hurt > 0) s.hurt -= dt;
      if (s.squash > 0) s.squash = Math.max(0, s.squash - dt * 4);
      if (s.doorCd > 0) s.doorCd -= dt;
      for (const sp of s.data.springs) if (sp.fired > 0) sp.fired -= dt;
      for (const blk of s.data.blocks) if (blk.bump > 0) blk.bump -= dt;

      // --- end-of-level celebration ---
      // The shell no longer pauses on a gate, so the flourish has to run here and
      // hand over to the next level itself when it finishes.
      if (s.finish > 0) {
        s.finish -= dt;
        b.vx = 0;
        // Slide down the pole, then stand at its foot.
        const foot = GROUND_TOP * TILE - bodyTop(s);
        b.y = Math.min(foot, b.y + 90 * dt);
        if (Math.random() < 0.4) {
          burst(s, s.data.flagX + TILE / 2, (GROUND_TOP - FLAG_H) * TILE, 4, 60, '#ffe9a8');
        }
        stepEffects(s, dt);
        if (s.finish <= 0) {
          const cleared = s.level;
          const next = freshState(cleared + 1, difficulty, s.coinsTotal);
          stateRef.current = next;
          api.requestGate(`Level ${cleared} cleared`);
          draw(ctx, next, spritesRef.current, viewW, viewH, zoom, skyPad, cw, ch, playH);
          return;
        }
        draw(ctx, s, spritesRef.current, viewW, viewH, zoom, skyPad, cw, ch, playH);
        return;
      }

      // --- input ---
      if (input.consumeJump()) s.jumpBuffer = JUMP_BUFFER;
      if (s.jumpBuffer > 0) s.jumpBuffer -= dt;
      if (s.coyote > 0) s.coyote -= dt;

      const canJump = b.onGround || s.coyote > 0;
      const firing = s.jumpBuffer > 0 && canJump;
      if (firing) {
        s.jumpBuffer = 0;
        s.coyote = 0;
        s.squash = 0.6;
        s.riding = -1;
        playSound('jump');
        burst(s, b.x + PW / 2, b.y + bodyTop(s), 4, 40);
      }
      if (input.held.left !== input.held.right) s.facing = input.held.right ? 1 : -1;

      // --- movers, and the ride ---
      const prevBottom = b.y + bodyTop(s);
      for (let i = 0; i < s.data.movers.length; i += 1) {
        const d = stepMover(s.data.movers[i], dt);
        if (s.riding === i) {
          b.x += d.dx;
          b.y += d.dy;
        }
      }

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

      // A platform catches the player only on the way down, so a missed jump
      // falls past it instead of being trapped underneath.
      if (!b.onGround && s.data.movers.length > 0) {
        s.riding = landOnMover(b, s.data.movers, prevBottom);
        if (s.riding >= 0 && res.landedAt === 0) s.squash = 0.7;
      } else if (b.onGround) {
        s.riding = -1;
      }

      if (res.leftGround && b.vy >= 0) s.coyote = COYOTE_TIME;
      if (res.landedAt > 220) {
        s.squash = 1;
        playSound('land');
        burst(s, b.x + PW / 2, b.y + bodyTop(s), 5, 30);
      }
      if (res.sprung) {
        const sp = s.data.springs.find((v) => v.tx === res.sprung!.tx && v.ty === res.sprung!.ty);
        if (sp) sp.fired = 0.3;
        s.squash = 1;
        playSound('jump');
        burst(s, b.x + PW / 2, b.y + bodyTop(s), 8, 70, '#cfe9ff');
      }

      // --- doors: stand still in one to use it ---
      if (res.door && Math.abs(b.vx) < 24 && b.onGround && s.doorCd <= 0) {
        s.dwell += dt;
        if (s.dwell > 0.3) {
          const door = s.data.doors.find((d) => d.tx === res.door!.tx && d.ty === res.door!.ty);
          if (door) {
            const exit = doorExit(door);
            b.x = exit.x;
            b.y = exit.y - (bodyTop(s) - PH);
            b.vx = 0;
            b.vy = 0;
            s.dwell = 0;
            s.doorCd = 1;
            s.riding = -1;
            playSound('powerup');
            burst(s, b.x + PW / 2, b.y + PH, 12, 60, '#d7bcff');
            blip(s, b.x, b.y - 10, 'shortcut');
          }
        }
      } else {
        s.dwell = 0;
      }

      // --- punched blocks ---
      if (res.headHit) {
        const hit = s.data.blocks.find(
          (blk) => blk.tx === res.headHit!.tx && blk.ty === res.headHit!.ty,
        );
        if (hit) {
          hit.bump = 0.18;
          const cx = hit.tx * TILE + TILE / 2;
          const cy = hit.ty * TILE;
          if (hit.kind === 'coin' && !hit.used) {
            hit.used = true;
            s.coinsTotal += 1;
            s.coinsHere += 1;
            s.pops.push({ x: cx, y: cy, vy: -90, life: 0.5 });
            burst(s, cx, cy, 5, 45);
            playSound('coin', s.coinsHere);
            api.addScore(10);
          } else if (hit.kind === 'power' && !hit.used) {
            hit.used = true;
            s.pickups.push({
              x: hit.tx * TILE + (TILE - PW) / 2,
              y: cy - TILE,
              vx: 34,
              vy: 0,
              onGround: false,
              rise: 0.45,
            });
            burst(s, cx, cy, 8, 55, '#ffe08a');
            playSound('brick');
          } else if (hit.kind === 'brick') {
            // Breakable. Removing a tile can only open the level up, never close
            // it, and the verifier proves the level still finishes with every
            // brick gone.
            tiles[hit.ty][hit.tx] = '.';
            hit.used = true;
            for (let i = 0; i < 4; i += 1) {
              s.chunks.push({
                x: cx + (i % 2 === 0 ? -4 : 4),
                y: cy + (i < 2 ? 2 : 10),
                vx: (i % 2 === 0 ? -1 : 1) * (30 + Math.random() * 40),
                vy: -80 - Math.random() * 60,
                life: 0.7,
                spin: Math.random() * 6,
              });
            }
            playSound('brick', 2);
            api.addScore(5);
            // Only rebuilt when a brick actually goes, rather than every frame.
            s.data.blocks = s.data.blocks.filter((blk) => blk !== hit);
          }
        }
      }

      // --- spikes ---
      if (res.hazard) takeHit(s, api, 'Spikes');

      // --- power-ups ---
      for (const p of s.pickups) stepPickup(tiles, p, dt);
      s.pickups = s.pickups.filter((p) => {
        const touching =
          b.x < p.x + PW && b.x + PW > p.x && b.y < p.y + PH && b.y + bodyTop(s) > p.y;
        if (touching) {
          grow(s);
          blip(s, p.x, p.y, '+200');
          api.addScore(200);
          return false;
        }
        return p.y < WORLD_H + 40;
      });

      // --- enemies ---
      for (const e of s.data.enemies) {
        stepEnemy(tiles, e, dt, s.animTime);
        if (!e.alive) continue;

        // A sliding shell clears everything in its lane. This is the reason to
        // kick one in the first place.
        if (e.mode === 'slide') {
          for (const other of s.data.enemies) {
            if (other === e || !other.alive) continue;
            if (other.mode === 'slide') continue;
            const near =
              e.x < other.x + PW && e.x + PW > other.x && e.y < other.y + PH && e.y + PH > other.y;
            if (!near) continue;
            other.alive = false;
            other.squash = 0.35;
            burst(s, other.x + PW / 2, other.y + PH / 2, 8, 65, '#ffd0a0');
            playSound('stomp');
            blip(s, other.x, other.y, '+80');
            api.addScore(80);
          }
        }

        const h = bodyTop(s);
        const hit = b.x < e.x + PW && b.x + PW > e.x && b.y < e.y + PH && b.y + h > e.y;
        if (!hit) continue;

        const stomping = b.vy > 40 && b.y + h - 8 < e.y;

        if (e.mode === 'shell') {
          // A dormant shell is a football: touching it kicks it away from you.
          const dir: 1 | -1 = b.x + PW / 2 <= e.x + PW / 2 ? 1 : -1;
          kickShell(e, dir);
          if (stomping) b.vy = -STOMP_BOUNCE;
          playSound('stomp');
          burst(s, e.x + PW / 2, e.y + PH / 2, 6, 60, '#e0d0a0');
          continue;
        }

        if (isSpiky(e)) {
          // The one you must not jump on. Stomping it is exactly as bad as
          // walking into it, which is the whole lesson.
          takeHit(s, api, 'That one has spikes');
          continue;
        }

        if (stomping) {
          if (e.kind === 'shell') {
            toShell(e);
            burst(s, e.x + PW / 2, e.y + PH / 2, 6, 55, '#e0d0a0');
          } else {
            e.alive = false;
            e.squash = 0.35;
            burst(s, e.x + PW / 2, e.y + PH / 2, 8, 60);
            blip(s, e.x, e.y, '+50');
            api.addScore(50);
          }
          b.vy = -(input.jumpHeld ? STOMP_BOUNCE_HELD : STOMP_BOUNCE);
          b.cut = false;
          s.squash = 0.9;
          s.riding = -1;
          playSound('stomp');
        } else {
          takeHit(s, api, 'An enemy got you');
        }
      }

      // --- coins ---
      for (const c of s.data.coins) {
        if (c.taken) continue;
        if (!coinTouched(b, c)) continue;
        c.taken = true;
        s.coinsTotal += 1;
        s.coinsHere += 1;
        burst(s, c.x, c.y, 6, 50);
        playSound('coin', s.coinsHere);
        api.addScore(10);
      }

      stepEffects(s, dt);

      // --- pit death ---
      if (b.y > WORLD_H + 30) {
        if (s.big) shrink(s);
        s.hurt = 1.2;
        playSound('gameOver');
        api.died('You fell');
        respawn(s);
      }

      // --- checkpoint ---
      if (!s.checkpointHit && b.x > s.data.checkpointX) {
        s.checkpointHit = true;
        s.respawnX = s.data.checkpointX;
        playSound('pass');
        blip(s, b.x, b.y - 12, 'checkpoint');
        burst(s, b.x + PW / 2, b.y, 8, 55, '#a8e6ff');
      }

      // --- flag ---
      if (flagTouched(b, s.data.flagX)) {
        s.finish = 1.5;
        b.x = s.data.flagX - PW / 2;
        b.vx = 0;
        b.vy = 0;
        const bonus = 150 + s.coinsHere * 5;
        api.addScore(bonus);
        blip(s, b.x, b.y - 14, `+${bonus}`);
        playSound('levelClear');
        api.setStatus(`Level ${s.level} clear`);
        burst(s, b.x + PW / 2, b.y, 20, 90, '#ffe9a8');
        draw(ctx, s, spritesRef.current, viewW, viewH, zoom, skyPad, cw, ch, playH);
        return;
      }

      // --- camera ---
      // Leading the player in the direction they are moving cancels most of the
      // follow lag, so a running player never ends up pinned to the right edge.
      const lead = (b.vx / RUN_SPEED) * CAMERA_LOOKAHEAD;
      const wantX = b.x + PW / 2 - viewW / 2 + lead;
      const clampedX = Math.max(0, Math.min(wantX, Math.max(0, LEVEL_W - viewW)));
      s.camX += (clampedX - s.camX) * Math.min(1, dt * CAMERA_LERP);
      // Vertical follow is slower than horizontal: a jump should not yank the view.
      s.camY += (cameraY(b.y, bodyTop(s), viewH) - s.camY) * Math.min(1, dt * CAMERA_LERP * 0.7);

      draw(ctx, s, spritesRef.current, viewW, viewH, zoom, skyPad, cw, ch, playH);
    },
  });

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />;
}

/** Particles and floating text, advanced whatever else is happening. */
function stepEffects(s: State, dt: number) {
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
  for (const c of s.chunks) {
    c.life -= dt;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    c.vy += 420 * dt;
    c.spin += dt * 8;
  }
  s.chunks = s.chunks.filter((c) => c.life > 0);
  for (const t of s.blips) {
    t.life -= dt;
    t.y -= 22 * dt;
  }
  s.blips = s.blips.filter((t) => t.life > 0);
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

/** Sky storeys are drawn as the biome's cloud tiles, so they read as up high. */
const CLOUD: Record<Biome, { left: string; middle: string; right: string; single: string }> = {
  grass: {
    left: 'terrain_grass_cloud_left',
    middle: 'terrain_grass_cloud_middle',
    right: 'terrain_grass_cloud_right',
    single: 'terrain_grass_cloud',
  },
  sand: {
    left: 'terrain_sand_cloud_left',
    middle: 'terrain_sand_cloud_middle',
    right: 'terrain_sand_cloud_right',
    single: 'terrain_sand_cloud',
  },
  snow: {
    left: 'terrain_snow_cloud_left',
    middle: 'terrain_snow_cloud_middle',
    right: 'terrain_snow_cloud_right',
    single: 'terrain_snow_cloud',
  },
  stone: {
    left: 'terrain_stone_cloud_left',
    middle: 'terrain_stone_cloud_middle',
    right: 'terrain_stone_cloud_right',
    single: 'terrain_stone_cloud',
  },
  dirt: {
    left: 'terrain_dirt_cloud_left',
    middle: 'terrain_dirt_cloud_middle',
    right: 'terrain_dirt_cloud_right',
    single: 'terrain_dirt_cloud',
  },
  purple: {
    left: 'terrain_purple_cloud_left',
    middle: 'terrain_purple_cloud_middle',
    right: 'terrain_purple_cloud_right',
    single: 'terrain_purple_cloud',
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
  mushroom_brown: 'mushroom_brown',
  rock: 'rock',
  fence: 'fence',
  fence_broken: 'fence_broken',
  hill: 'hill',
  sign: 'sign',
};

const ENEMY_SPRITES: Record<Enemy['kind'], { walk: string[]; dead: string; fps: number }> = {
  slime: {
    walk: ['slime_normal_walk_a', 'slime_normal_walk_b'],
    dead: 'slime_normal_flat',
    fps: 5,
  },
  walker: { walk: ['ladybug_walk_a', 'ladybug_walk_b'], dead: 'ladybug_rest', fps: 7 },
  flyer: { walk: ['bee_a', 'bee_b'], dead: 'bee_rest', fps: 12 },
  hopper: { walk: ['frog_idle', 'frog_idle'], dead: 'frog_rest', fps: 3 },
  spiker: { walk: ['slime_spike_walk_a', 'slime_spike_walk_b'], dead: 'slime_spike_flat', fps: 5 },
  shell: { walk: ['snail_walk_a', 'snail_walk_b'], dead: 'snail_rest', fps: 4 },
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
  if (blk.used) return 'block_empty';
  if (blk.kind === 'brick') return 'brick_brown';
  if (blk.kind === 'power') {
    return animFrame(['block_exclamation', 'block_exclamation_active'], time, 5);
  }
  // The active variant flashes so an unhit coin block reads as interactive.
  return animFrame(['block_coin', 'block_coin', 'block_coin_active'], time, 4);
}

function draw(
  ctx: CanvasRenderingContext2D,
  s: State,
  sp: SpriteSet | null,
  viewW: number,
  viewH: number,
  zoom: number,
  skyPad: number,
  cw: number,
  ch: number,
  playH: number,
) {
  const camX = Math.round(s.camX);
  const camY = Math.round(s.camY);
  const biome = s.data.biome;

  const [skyTop, skyBottom] = SKY[biome];
  const sky = ctx.createLinearGradient(0, 0, 0, playH);
  sky.addColorStop(0, skyTop);
  sky.addColorStop(1, skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, cw, ch);

  if (!sp) {
    // Sprites still loading - show something rather than a blank frame.
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
  const layers = BACKDROP_LAYERS[s.data.backdrop];
  /**
   * Each backdrop frame is opaque with a white sky filling its top half, so a
   * second layer drawn on top would erase the first. Layers are therefore
   * clipped to the band where their scenery lives, and the biome sky gradient is
   * multiplied over the lot afterwards. That turns every white region - the art's
   * own sky and the gaps between clipped bands - into the same graded sky, so the
   * layering leaves no seams and each biome gets its own light.
   */
  const drawBand = (
    name: string,
    factor: number,
    alpha: number,
    topFrac: number,
    bottomFrac = 1,
    /** Frame height as a fraction of the play area, bottom-aligned to bottomFrac. */
    heightFrac = 1,
  ) => {
    const f = sp.backgrounds.frames[name];
    if (!f) return;
    const bandTop = playH * topFrac;
    const bandH = playH * bottomFrac - bandTop;
    if (bandH <= 0) return;
    const drawH = playH * heightFrac;
    const drawY = playH * bottomFrac - drawH;
    // Whole pixels. A fractional tile width accumulates a sub-pixel gap between
    // repeats, which shows as a hairline vertical seam on the half-alpha layers.
    const w = Math.ceil(drawH * (f[2] / f[3]));
    const off = -Math.round(((camX * factor * zoom) % w) + w);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, bandTop, cw, bandH);
    ctx.clip();
    ctx.globalAlpha = alpha;
    for (let x = off; x < cw + w; x += w) {
      // One pixel of overlap: scaling an atlas frame up bleeds a hairline of the
      // neighbouring sprite along its edge, which shows as a vertical seam on the
      // part-transparent layers. The next repeat covers it.
      drawFrame(ctx, sp.backgrounds, name, x, drawY, w + 1, drawH);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  };
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cw, playH);
  drawBand(layers.far, 0.12, 1, 0);
  // Two cloud passes at different speeds and scales. The upper sky rows carry no
  // gameplay by design (they are the head clearance a spring launch needs), so
  // they get depth instead of being a flat wash of one colour.
  drawBand('background_clouds', 0.2, 0.5, 0, 0.3, 0.55);
  drawBand('background_clouds', 0.32, 0.34, 0.16, 0.5, 0.8);
  // A second ridge line partway up, so the middle of the sky has a horizon in it.
  drawBand(layers.near, 0.36, 0.5, 0.34, 0.66, 0.62);
  drawBand(layers.near, 0.48, 1, 0.6);

  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, cw, playH);
  ctx.globalCompositeOperation = 'source-over';

  // World drawing happens in world units. `skyPad` is the surplus when the view
  // is taller than the world; `camY` is the scroll when it is shorter. Only one
  // of the two is ever non-zero.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, cw, playH);
  ctx.clip();
  ctx.scale(zoom, zoom);
  ctx.translate(0, skyPad - camY);
  ctx.save();
  ctx.translate(-camX, 0);

  const terrain = TERRAIN[biome];
  const cloud = CLOUD[biome];
  const firstCol = Math.max(0, Math.floor(camX / TILE) - 1);
  const lastCol = Math.min(COLS - 1, Math.ceil((camX + viewW) / TILE) + 1);
  const firstRow = Math.max(0, Math.floor(camY / TILE) - 1);
  const lastRow = Math.min(ROWS - 1, Math.ceil((camY + viewH) / TILE) + 1);

  // --- decor behind the terrain silhouette, so bushes tuck into the ground ---
  for (const d of s.data.decor) {
    if (d.tx < firstCol || d.tx > lastCol) continue;
    drawFrame(ctx, sp.tiles, DECOR_SPRITE[d.kind], d.tx * TILE, d.ty * TILE, TILE, TILE);
  }

  // --- terrain, platforms, blocks, springs, spikes and doors ---
  const blockAt = new Map<string, Block>();
  for (const blk of s.data.blocks) blockAt.set(`${blk.tx},${blk.ty}`, blk);
  for (let ty = firstRow; ty <= lastRow; ty += 1) {
    for (let tx = firstCol; tx <= lastCol; tx += 1) {
      const code = s.data.tiles[ty][tx];
      if (code === '.') continue;
      const px = tx * TILE;
      const py = ty * TILE;
      if (code === '#') {
        drawFrame(ctx, sp.tiles, terrainFrame(s.data.tiles, tx, ty, terrain), px, py, TILE, TILE);
      } else if (code === 'B') {
        drawFrame(ctx, sp.tiles, 'block_planks', px, py, TILE, TILE);
      } else if (code === 'C') {
        const left = s.data.tiles[ty][tx - 1] === 'C';
        const right = s.data.tiles[ty][tx + 1] === 'C';
        const name = left && right ? cloud.middle : left ? cloud.right : right ? cloud.left : cloud.single;
        drawFrame(ctx, sp.tiles, name, px, py, TILE, TILE);
      } else if (code === 'S') {
        const spring = s.data.springs.find((v) => v.tx === tx && v.ty === ty);
        const out = spring && spring.fired > 0;
        drawFrame(ctx, sp.tiles, out ? 'spring_out' : 'spring', px, py, TILE, TILE);
      } else if (code === 'X') {
        drawFrame(ctx, sp.tiles, 'spikes', px, py, TILE, TILE);
      } else if (code === 'D') {
        const isEntry = s.data.doors.some((d) => d.tx === tx && d.ty === ty);
        drawFrame(ctx, sp.tiles, isEntry ? 'door_open_top' : 'door_closed_top', px, py - TILE, TILE, TILE);
        drawFrame(ctx, sp.tiles, isEntry ? 'door_open' : 'door_closed', px, py, TILE, TILE);
      } else {
        const blk = blockAt.get(`${tx},${ty}`);
        const lift = blk && blk.bump > 0 ? -3 : 0;
        drawFrame(ctx, sp.tiles, blk ? blockFrame(blk, s.animTime) : 'brick_brown', px, py + lift, TILE, TILE);
      }
    }
  }

  // --- moving platforms ---
  for (const m of s.data.movers) {
    const mx = moverX(m);
    const my = moverY(m);
    for (let x = 0; x < m.w; x += TILE) {
      drawFrame(ctx, sp.tiles, 'bridge_logs', mx + x, my, Math.min(TILE, m.w - x), MOVER_H);
    }
  }

  // --- the flag pole and its goal ---
  {
    const poleX = s.data.flagX + TILE / 2 - 1.5;
    const poleTop = (GROUND_TOP - FLAG_H) * TILE;
    ctx.fillStyle = '#f5f0d8';
    ctx.fillRect(poleX, poleTop, 3, FLAG_H * TILE);
    ctx.fillStyle = '#c9b98a';
    ctx.fillRect(poleX + 2, poleTop, 1, FLAG_H * TILE);
    const flagName = animFrame(['flag_green_a', 'flag_green_b'], s.animTime, 4);
    drawFrame(ctx, sp.tiles, flagName, s.data.flagX + 2, poleTop - 2, TILE, TILE);
  }

  // --- the checkpoint ---
  {
    const cx = s.data.checkpointX;
    const name = s.checkpointHit
      ? animFrame(['flag_blue_a', 'flag_blue_b'], s.animTime, 5)
      : 'flag_off';
    drawFrame(ctx, sp.tiles, name, cx, (GROUND_TOP - 2) * TILE, TILE, TILE * 2);
  }

  // --- coins, spinning, with a shimmer ---
  const coinName = animFrame(
    ['coin_gold', 'coin_gold', 'coin_gold_side', 'coin_gold_side'],
    s.animTime,
    6,
  );
  for (const c of s.data.coins) {
    if (c.taken) continue;
    if (c.x < camX - 20 || c.x > camX + viewW + 20) continue;
    const bob = Math.sin(s.animTime * 3 + c.x * 0.05) * 1.5;
    drawFrame(ctx, sp.tiles, coinName, c.x - 6, c.y - 6 + bob, 12, 12);
    // A travelling glint, phase-shifted per coin so a row of them sparkles.
    const twinkle = Math.sin(s.animTime * 4 + c.x * 0.3);
    if (twinkle > 0.86) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(c.x - 1, c.y - 8 + bob, 2, 2);
    }
  }
  for (const p of s.pops) {
    ctx.globalAlpha = Math.max(0, p.life / 0.5);
    drawFrame(ctx, sp.tiles, 'coin_bronze', p.x - 6, p.y - 6, 12, 12);
    ctx.globalAlpha = 1;
  }

  // --- brick debris ---
  for (const c of s.chunks) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, c.life / 0.7);
    ctx.translate(c.x, c.y);
    ctx.rotate(c.spin);
    drawFrame(ctx, sp.tiles, 'brick_brown', -3, -3, 6, 6);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // --- power-ups ---
  for (const p of s.pickups) {
    drawFrame(ctx, sp.tiles, 'mushroom_red', p.x - 2, p.y - 1, 15, 15);
  }

  // --- enemies ---
  for (const e of s.data.enemies) {
    if (e.x < camX - 30 || e.x > camX + viewW + 30) continue;
    const art = ENEMY_SPRITES[e.kind];
    if (!e.alive) {
      if (e.squash > 0) drawFrame(ctx, sp.enemies, art.dead, e.x - 2, e.y + PH - 6, 16, 8);
      continue;
    }
    if (e.mode !== 'walk') {
      // A shell spins while it slides, so a live projectile never reads as scenery.
      ctx.save();
      ctx.translate(e.x + PW / 2, e.y + PH / 2);
      if (e.mode === 'slide') ctx.rotate(s.animTime * 12 * Math.sign(e.vx || 1));
      drawFrame(ctx, sp.enemies, 'snail_shell', -8, -6, 16, 12);
      ctx.restore();
      continue;
    }
    const frame =
      e.kind === 'hopper' && !e.onGround ? 'frog_jump' : animFrame(art.walk, s.animTime, art.fps);
    drawFrame(ctx, sp.enemies, frame, e.x - 2, e.y - 2, 16, 16, e.vx > 0);
  }

  // --- player ---
  const b = s.body;
  const h = s.big ? PH_BIG : PH;
  const blink = s.hurt > 0 && Math.floor(s.animTime * 20) % 2 === 0;
  if (!blink) {
    let frame = 'character_green_idle';
    if (s.finish > 0) frame = 'character_green_climb_a';
    else if (!b.onGround) frame = 'character_green_jump';
    else if (Math.abs(b.vx) > 20)
      frame = animFrame(['character_green_walk_a', 'character_green_walk_b'], s.animTime, 10);
    // Skidding shows the hit pose flipped against travel: it reads as leaning back.
    const skidding =
      b.onGround &&
      Math.abs(b.vx) > 45 &&
      ((b.vx > 0 && s.facing < 0) || (b.vx < 0 && s.facing > 0));
    if (skidding) frame = 'character_green_duck';

    // Squash on landing, stretch on takeoff. Cheap, and it makes jumps feel good.
    const sq = s.squash;
    const dw = (s.big ? 20 : 16) * (1 + sq * 0.18);
    const dh = (s.big ? 26 : 20) * (1 - sq * 0.18);
    drawFrame(ctx, sp.characters, frame, b.x + PW / 2 - dw / 2, b.y + h - dh, dw, dh, s.facing < 0);
  }

  // --- sparks ---
  for (const p of s.sparks) {
    ctx.globalAlpha = Math.max(0, p.life / 0.45);
    ctx.fillStyle = p.hue;
    ctx.fillRect(p.x - 1, p.y - 1, 2.5, 2.5);
  }
  ctx.globalAlpha = 1;

  // --- floating score text ---
  ctx.font = 'bold 7px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const t of s.blips) {
    ctx.globalAlpha = Math.max(0, t.life / 0.7);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillText(t.text, t.x + PW / 2 + 0.5, t.y + 0.5);
    ctx.fillStyle = '#fffbe8';
    ctx.fillText(t.text, t.x + PW / 2, t.y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';

  ctx.restore(); // end camera translate
  ctx.restore(); // end world scale and clip

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
  ctx.fillRect(0, 0, cw, 24);
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.font = 'bold 12px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(`LEVEL ${s.level}`, 10, 17);
  drawFrame(ctx, sp.tiles, s.big ? 'hud_heart' : 'hud_heart_empty', 82, 6, 13, 13);
  drawFrame(ctx, sp.tiles, 'hud_coin', cw - 74, 6, 13, 13);
  ctx.textAlign = 'right';
  ctx.fillText(`${s.coinsTotal}`, cw - 10, 17);
  ctx.textAlign = 'left';
}
