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
/** A piece of level-clear confetti. Pure celebration, no gameplay. */
type Confetti = { x: number; y: number; vx: number; vy: number; spin: number; life: number; color: string };
/** An expanding dust ring, for landings and stomps. */
type Puff = { x: number; y: number; r: number; life: number };
export type PlatformerEdition = 'storybook' | 'skybound';
type PlatformerV2Props = GameCanvasProps & { edition?: PlatformerEdition };

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
  confetti: Confetti[];
  puffs: Puff[];
  /** Coins grabbed in quick succession. Resets when comboT runs out. */
  combo: number;
  comboT: number;
  /** Happy-hop scale pop on pickups, 0 = neutral. */
  pulse: number;
  /** Screen shake amplitude, decays fast. Set by stomps and heavy landings. */
  shake: number;
  /** Countdown of the world-name banner shown when a level starts. */
  intro: number;
  /** Frozen-at-rest stride phase: keeps the family avatar from snapping poses. */
  runPhase: number;
  /** Door tile the player is currently standing on, for the on-canvas prompt. */
  onDoor: { tx: number; ty: number } | null;
  /** Index into data.coins of this level's one rainbow coin, or -1. */
  rainbowIdx: number;
  /** Three V3 star relics, chosen deterministically from this level's coins. */
  relicIdx: number[];
  relicsHere: number;
  /** V3 discovery callouts never repeat within a level. */
  secretsFound: number[];
  /** Screen-space V3 portal wipe; presentation-only. */
  portalFlash: number;
};

function relicIndices(level: number, count: number): number[] {
  if (count < 3) return [];
  const indices = new Set<number>();
  for (let i = 0; indices.size < 3 && i < 12; i += 1) {
    indices.add((level * 47 + i * Math.max(7, Math.floor(count / 3) + 1) + 11) % count);
  }
  return [...indices];
}

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
    confetti: [],
    puffs: [],
    combo: 0,
    comboT: 0,
    pulse: 0,
    shake: 0,
    intro: 2.2,
    runPhase: 0,
    onDoor: null,
    // One magic rainbow coin per level, picked deterministically so replays of
    // a level hide it in the same place. Worth extra and worth hunting for.
    rainbowIdx: data.coins.length > 0 ? (level * 31 + 7) % data.coins.length : -1,
    relicIdx: relicIndices(level, data.coins.length),
    relicsHere: 0,
    secretsFound: [],
    portalFlash: 0,
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

function puffAt(s: State, x: number, y: number) {
  s.puffs.push({ x, y, r: 3, life: 0.35 });
  if (s.puffs.length > 20) s.puffs.shift();
}

const CONFETTI_COLORS = ['#ff5a5a', '#ffb54a', '#ffe95a', '#6ee76e', '#5ab8ff', '#c98aff'];

function confettiBurst(s: State, x: number, y: number, count: number) {
  for (let i = 0; i < count; i += 1) {
    s.confetti.push({
      x: x + (Math.random() - 0.5) * 24,
      y,
      vx: (Math.random() - 0.5) * 170,
      vy: -70 - Math.random() * 160,
      spin: Math.random() * 6,
      life: 1.5 + Math.random() * 0.9,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    });
  }
  if (s.confetti.length > 90) s.confetti.splice(0, s.confetti.length - 90);
}

/**
 * One coin collected: the streak counter climbs, the pickup jingle climbs a
 * semitone with it, and milestone streaks announce themselves. The streak is
 * what turns a row of coins from a checklist into a little rhythm game.
 */
function comboUp(s: State, x: number, y: number) {
  s.combo += 1;
  s.comboT = 2;
  playSound('coin', s.combo);
  if (s.combo === 3 || s.combo === 6 || s.combo === 10 || s.combo === 15) {
    blip(s, x, y - 8, `COMBO x${s.combo}!`);
  }
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
  s.shake = Math.max(s.shake, 0.14);
  s.pulse = 0.35;
  playSound('powerup');
  burst(s, b.x + PW / 2, b.y + PH_BIG / 2, 12, 70, '#ffe08a');
  burst(s, b.x + PW / 2, b.y + PH_BIG / 2, 8, 40, '#fff6d0');
  blip(s, b.x, b.y - 10, 'POWER UP!');
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
  s.shake = Math.max(s.shake, 0.2);
  s.combo = 0;
  s.comboT = 0;
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

export default function PlatformerV2({
  paused,
  input,
  api,
  restartToken,
  difficulty,
  controlsInset,
  edition = 'storybook',
}: PlatformerV2Props) {
  const stateRef = useRef<State>(freshState(1, difficulty));
  const sprites = useSprites();
  const spritesRef = useRef<SpriteSet | null>(null);
  useEffect(() => {
    spritesRef.current = sprites;
  }, [sprites]);
  const skyboundRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    if (edition !== 'skybound') return;
    const image = new Image();
    image.src = '/assets/coin-runner-v3/skybound-kingdom.png';
    image.onload = () => {
      skyboundRef.current = image;
    };
    return () => {
      image.onload = null;
    };
  }, [edition]);

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
      if (s.portalFlash > 0) s.portalFlash -= dt;
      if (s.hurt > 0) s.hurt -= dt;
      if (s.squash > 0) s.squash = Math.max(0, s.squash - dt * 4);
      if (s.doorCd > 0) s.doorCd -= dt;
      if (s.intro > 0) s.intro -= dt;
      for (const sp of s.data.springs) if (sp.fired > 0) sp.fired -= dt;
      for (const blk of s.data.blocks) if (blk.bump > 0) blk.bump -= dt;

      // --- end-of-level celebration ---
      // The shell no longer pauses on a gate, so the flourish has to run here and
      // hand over to the next level itself when it finishes.
      if (s.finish > 0) {
        s.finish -= dt;
        b.vx = 0;
        // Slide down the pole, then stand at its foot for the victory hops.
        const foot = GROUND_TOP * TILE - bodyTop(s);
        b.y = Math.min(foot, b.y + 90 * dt);
        if (Math.random() < 0.4) {
          burst(s, s.data.flagX + TILE / 2, (GROUND_TOP - FLAG_H) * TILE, 4, 60, '#ffe9a8');
        }
        // A steady drizzle of confetti for the whole celebration, not one pop.
        if (Math.random() < 0.3) {
          confettiBurst(s, s.data.flagX + TILE / 2, (GROUND_TOP - FLAG_H) * TILE + 6, 3);
        }
        stepEffects(s, dt);
        if (s.finish <= 0) {
          const cleared = s.level;
          const next = freshState(cleared + 1, difficulty, s.coinsTotal);
          stateRef.current = next;
          api.requestGate(`Level ${cleared} cleared`);
          draw(ctx, next, spritesRef.current, viewW, viewH, zoom, skyPad, cw, ch, playH, edition, skyboundRef.current);
          return;
        }
        draw(ctx, s, spritesRef.current, viewW, viewH, zoom, skyPad, cw, ch, playH, edition, skyboundRef.current);
        return;
      }

      // --- input ---
      const jumpPressed = input.consumeJump();
      if (jumpPressed) s.jumpBuffer = JUMP_BUFFER;
      if (s.jumpBuffer > 0) s.jumpBuffer -= dt;
      if (s.coyote > 0) s.coyote -= dt;

      const wasGrounded = b.onGround;
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
        puffAt(s, b.x + PW / 2, b.y + bodyTop(s));
        // Only a genuinely HARD fall thumps the camera. Ordinary jumps land above
        // 400, and shaking on every one is what made the game feel jittery.
        if (res.landedAt > 720) s.shake = Math.max(s.shake, 0.1);
      }
      if (res.sprung) {
        const sp = s.data.springs.find((v) => v.tx === res.sprung!.tx && v.ty === res.sprung!.ty);
        if (sp) sp.fired = 0.3;
        s.squash = 1;
        playSound('jump');
        burst(s, b.x + PW / 2, b.y + bodyTop(s), 8, 70, '#cfe9ff');
      }

      // --- sparkle trails: spring flights, and the golden run while grown ---
      // Visual only, so Math.random is fine here; caps keep an iPad smooth.
      if (s.sparks.length < 80) {
        if (!b.onGround && b.vy < -420 && Math.random() < 0.4) {
          s.sparks.push({
            x: b.x + PW / 2 + (Math.random() - 0.5) * 6,
            y: b.y + bodyTop(s),
            vx: (Math.random() - 0.5) * 24,
            vy: 40,
            life: 0.35,
            hue: '#cfe9ff',
          });
        }
        if (s.big && b.onGround && Math.abs(b.vx) > 120 && Math.random() < 0.25) {
          const hues = ['#ffd54a', '#7ee7ff', '#ff9ad5'];
          s.sparks.push({
            x: b.x + (b.vx > 0 ? 0 : PW),
            y: b.y + bodyTop(s) - 2,
            vx: -b.vx * 0.1,
            vy: -10 - Math.random() * 25,
            life: 0.4,
            hue: hues[Math.floor(Math.random() * hues.length)],
          });
        }
      }

      // --- doors: stand still in one to use it ---
      // The prompt state is tracked whether or not the player is still enough to
      // warp, so a kid running through a doorway still gets told the trick.
      // Tap/jump is an explicit, reliable door action. It is also useful for
      // keyboard and switch users who cannot comfortably release a direction
      // with the exact timing needed by the original stand-still gesture.
      const doorUsable =
        res.door !== null && (b.onGround || (jumpPressed && wasGrounded)) && s.doorCd <= 0;
      s.onDoor = doorUsable ? { tx: res.door!.tx, ty: res.door!.ty } : null;
      // The trigger is INPUT, not speed: the old `|vx| < 24` gate kept resetting
      // off residual velocity, so "hold still" never fired for a kid whose thumb
      // was still brushing the pad. Now letting go of left/right is the whole
      // gesture - the dwell accumulates whenever no direction is held, and vx is
      // snapped to zero so the body visibly settles into the doorway. A kid who
      // walks onto a door and releases the buttons ALWAYS warps in ~0.3s.
      const steering = input.held.left || input.held.right;
      if (doorUsable && (!steering || jumpPressed)) {
        if (!steering) b.vx = 0;
        s.dwell = jumpPressed ? 0.31 : s.dwell + dt;
        if (s.dwell > 0.3) {
          const door = s.data.doors.find((d) => d.tx === res.door!.tx && d.ty === res.door!.ty);
          if (door) {
            // A flash at the door being left, so the warp reads as travel...
            burst(s, b.x + PW / 2, b.y + PH, 10, 55, '#d7bcff');
            const exit = doorExit(door);
            b.x = exit.x;
            b.y = exit.y - (bodyTop(s) - PH);
            b.vx = 0;
            b.vy = 0;
            s.dwell = 0;
            s.doorCd = 1;
            s.riding = -1;
            s.onDoor = null;
            s.pulse = 0.35;
            s.portalFlash = 0.38;
            // ...and a fanfare at the arrival, so it lands as a reward.
            playSound('powerup');
            playSound('pass');
            burst(s, b.x + PW / 2, b.y + PH, 14, 70, '#d7bcff');
            burst(s, b.x + PW / 2, b.y + PH / 2, 8, 45, '#fff0ff');
            blip(s, b.x, b.y - 10, 'WHOOSH!');
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
            comboUp(s, cx - PW / 2, cy);
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
            s.shake = Math.max(s.shake, 0.1);
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
          s.shake = Math.max(s.shake, 0.18);
          puffAt(s, e.x + PW / 2, e.y + PH);
          playSound('stomp');
        } else {
          takeHit(s, api, 'An enemy got you');
        }
      }

      // --- coins ---
      for (let ci = 0; ci < s.data.coins.length; ci += 1) {
        const c = s.data.coins[ci];
        if (c.taken) continue;
        if (!coinTouched(b, c)) continue;
        c.taken = true;
        s.coinsTotal += 1;
        s.coinsHere += 1;
        const relic = edition === 'skybound' && s.relicIdx.includes(ci);
        if (relic) {
          s.relicsHere += 1;
          burst(s, c.x, c.y, 12, 82, '#fff0a6');
          burst(s, c.x, c.y, 8, 58, '#76dfff');
          blip(s, c.x - PW / 2, c.y - 12, `STAR RELIC ${s.relicsHere}/3! +75`);
          playSound('powerup');
          s.pulse = 0.5;
          api.addScore(75);
        } else if (ci === s.rainbowIdx) {
          // The level's one magic coin: a triple-color burst and a fanfare, so
          // spotting it in the wild feels like finding treasure.
          burst(s, c.x, c.y, 8, 70, '#ff9ad5');
          burst(s, c.x, c.y, 8, 55, '#7ee7ff');
          burst(s, c.x, c.y, 6, 40, '#ffe95a');
          blip(s, c.x - PW / 2, c.y - 10, 'RAINBOW! +50');
          playSound('powerup');
          s.pulse = 0.4;
          api.addScore(50);
        } else {
          burst(s, c.x, c.y, 6, 50);
          comboUp(s, c.x - PW / 2, c.y);
          s.pulse = Math.max(s.pulse, 0.18);
          api.addScore(10);
        }
        if (edition === 'skybound') {
          const secretIndex = s.data.secrets.findIndex(
            (secret) =>
              c.x >= secret.tx * TILE &&
              c.x < (secret.tx + secret.w) * TILE &&
              c.y >= secret.ty * TILE &&
              c.y < (secret.ty + secret.h) * TILE,
          );
          if (secretIndex >= 0 && !s.secretsFound.includes(secretIndex)) {
            s.secretsFound.push(secretIndex);
            blip(s, c.x - PW / 2, c.y - 22, 'SECRET SKY CACHE!');
            burst(s, c.x, c.y, 14, 76, '#c5a4ff');
          }
        }
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
        blip(s, b.x, b.y - 12, 'CHECKPOINT!');
        burst(s, b.x + PW / 2, b.y, 10, 60, '#a8e6ff');
      }

      // --- flag ---
      if (flagTouched(b, s.data.flagX)) {
        s.finish = 2.4;
        b.x = s.data.flagX - PW / 2;
        b.vx = 0;
        b.vy = 0;
        const bonus = 150 + s.coinsHere * 5;
        api.addScore(bonus);
        blip(s, b.x, b.y - 14, `+${bonus}`);
        playSound('levelClear');
        api.setStatus(`Level ${s.level} clear`);
        burst(s, b.x + PW / 2, b.y, 20, 90, '#ffe9a8');
        confettiBurst(s, b.x + PW / 2, (GROUND_TOP - FLAG_H) * TILE, 42);
        draw(ctx, s, spritesRef.current, viewW, viewH, zoom, skyPad, cw, ch, playH, edition, skyboundRef.current);
        return;
      }

      // --- camera ---
      // Leading the player in the direction they are moving cancels most of the
      // follow lag, so a running player never ends up pinned to the right edge.
      const lead = (b.vx / RUN_SPEED) * CAMERA_LOOKAHEAD;
      const wantX = b.x + PW / 2 - viewW / 2 + lead;
      const clampedX = Math.max(0, Math.min(wantX, Math.max(0, LEVEL_W - viewW)));
      s.camX += (clampedX - s.camX) * Math.min(1, dt * CAMERA_LERP);
      // Stop the last sub-pixel tail instead of pixel-snapping it for several
      // frames. That tail was the visible "jiggle" after the hero stopped.
      if (Math.abs(clampedX - s.camX) < 0.08 / zoom) s.camX = clampedX;
      // Vertical follow is slower than horizontal: a jump should not yank the view.
      const wantY = cameraY(b.y, bodyTop(s), viewH);
      s.camY += (wantY - s.camY) * Math.min(1, dt * CAMERA_LERP * 0.7);
      if (Math.abs(wantY - s.camY) < 0.08 / zoom) s.camY = wantY;
      // Run phase advances with actual distance, then holds its last pose when
      // stationary. The sprite no longer pops back to frame zero on release.
      s.runPhase += Math.abs(b.vx) * dt * 0.08;

      draw(ctx, s, spritesRef.current, viewW, viewH, zoom, skyPad, cw, ch, playH, edition, skyboundRef.current);
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
  for (const p of s.puffs) {
    p.life -= dt;
    p.r += 28 * dt;
  }
  s.puffs = s.puffs.filter((p) => p.life > 0);
  for (const f of s.confetti) {
    f.life -= dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.vy += 240 * dt;
    f.vx *= 1 - 0.8 * dt;
    f.spin += dt * 5;
  }
  s.confetti = s.confetti.filter((f) => f.life > 0 && f.y < WORLD_H + 40);
  if (s.comboT > 0) {
    s.comboT -= dt;
    if (s.comboT <= 0) s.combo = 0;
  }
  if (s.pulse > 0) s.pulse = Math.max(0, s.pulse - dt * 2.5);
  if (s.shake > 0) s.shake = Math.max(0, s.shake - dt * 0.9);
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

/**
 * Sky gradient per biome, drawn under the parallax AND multiplied over it, so
 * each world gets its own light: bright noon in the meadow, baked orange in the
 * desert, aurora twilight on the peaks, a moonlit night over the graveyard,
 * glowing dusk in the hollow, and a real starlit evening in the crystal kingdom.
 */
const SKY: Record<Biome, [string, string]> = {
  grass: ['#8fd3ff', '#d8f1ff'],
  sand: ['#ffc97d', '#ffedcb'],
  snow: ['#8fbce8', '#eaf7ff'],
  stone: ['#2b3152', '#6b729a'],
  dirt: ['#d89468', '#f7ddba'],
  purple: ['#6f5ac2', '#dcc4ef'],
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

// --- world personality ------------------------------------------------------
// Everything in this section is screen-space set dressing: procedural canvas
// shapes seeded from index math (deterministic frame to frame, no stored
// state), drawn behind the world. None of it touches gameplay or the seeded
// generator the checkers replay.

/**
 * Kid-facing identity for each biome: a name, silhouette inks, banner accent.
 * Each world is a PLACE, not a palette swap: a meadow with a distant castle, a
 * pyramid desert under a blazing sun, aurora peaks over a pine ridge, a moonlit
 * graveyard with bats, a glowing giant-mushroom hollow, and a starlit crystal
 * kingdom with floating islands.
 */
const WORLD: Record<Biome, { name: string; far: string; near: string; accent: string }> = {
  grass: { name: 'SUNNY MEADOW', far: 'rgba(120,185,125,0.30)', near: 'rgba(75,145,95,0.40)', accent: '#4caf50' },
  sand: { name: 'BLAZING DESERT', far: 'rgba(235,168,90,0.30)', near: 'rgba(198,128,62,0.38)', accent: '#e8963c' },
  snow: { name: 'AURORA PEAKS', far: 'rgba(148,178,214,0.38)', near: 'rgba(96,130,178,0.45)', accent: '#64a8e8' },
  stone: { name: 'MOONLIT GRAVEYARD', far: 'rgba(64,72,110,0.50)', near: 'rgba(34,40,68,0.62)', accent: '#8fa3e8' },
  dirt: { name: 'MUSHROOM HOLLOW', far: 'rgba(152,82,72,0.30)', near: 'rgba(120,60,56,0.40)', accent: '#c05a4a' },
  purple: { name: 'STARLIGHT KINGDOM', far: 'rgba(94,66,148,0.42)', near: 'rgba(62,42,108,0.52)', accent: '#8a5ce8' },
};

/** Cheap deterministic 0..1 hash, so scenery stays put without stored state. */
function hash01(n: number): number {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Sun, moon and stars: the one thing that instantly sets a world's hour. */
function drawCelestial(ctx: CanvasRenderingContext2D, biome: Biome, t: number, cw: number, playH: number) {
  const sun = (x: number, y: number, r: number, core: string, glow: string, rays: boolean) => {
    const g = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 2.6);
    g.addColorStop(0, glow);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r * 2.6, y - r * 2.6, r * 5.2, r * 5.2);
    if (rays) {
      ctx.strokeStyle = 'rgba(255,220,140,0.5)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2 + t * 0.15;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * (r + 4), y + Math.sin(a) * (r + 4));
        ctx.lineTo(x + Math.cos(a) * (r + 10), y + Math.sin(a) * (r + 10));
        ctx.stroke();
      }
    }
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };

  if (biome === 'grass') sun(cw * 0.8, playH * 0.15, 16, '#fff3b8', 'rgba(255,240,170,0.55)', false);
  else if (biome === 'sand') sun(cw * 0.78, playH * 0.14, 20, '#ffe27a', 'rgba(255,200,110,0.6)', true);
  else if (biome === 'snow') {
    // Aurora: three slow translucent ribbons waving across the upper sky, then
    // a small pale sun low on the horizon - a polar twilight, not noon.
    const ribbons: Array<[string, number, number]> = [
      ['rgba(110,240,180,', 0.16, 0], // teal-green
      ['rgba(140,190,255,', 0.24, 2.1], // ice blue
      ['rgba(220,150,255,', 0.32, 4.2], // violet edge
    ];
    for (const [tint, yFrac, phase] of ribbons) {
      ctx.beginPath();
      const baseY = playH * (0.08 + yFrac);
      ctx.moveTo(-10, baseY);
      for (let x = -10; x <= cw + 10; x += 24) {
        ctx.lineTo(x, baseY + Math.sin(x * 0.012 + t * 0.5 + phase) * playH * 0.045);
      }
      for (let x = cw + 10; x >= -10; x -= 24) {
        ctx.lineTo(x, baseY + Math.sin(x * 0.012 + t * 0.5 + phase + 0.9) * playH * 0.045 - playH * 0.075);
      }
      ctx.closePath();
      const wave = 0.5 + 0.5 * Math.sin(t * 0.7 + phase);
      ctx.fillStyle = `${tint}${(0.10 + 0.08 * wave).toFixed(3)})`;
      ctx.fill();
    }
    sun(cw * 0.82, playH * 0.2, 11, '#f6fbff', 'rgba(230,245,255,0.45)', false);
  } else if (biome === 'stone') {
    // The graveyard's big low moon: a wide halo, a bright disc, three craters,
    // and a scatter of dim stars. This is what flips the world to night.
    const mx = cw * 0.74;
    const my = playH * 0.2;
    const mr = 26;
    for (let i = 0; i < 14; i += 1) {
      const x = hash01(i * 5 + 3) * cw;
      const y = hash01(i * 9 + 4) * playH * 0.45;
      const tw = 0.4 + 0.6 * Math.max(0, Math.sin(t * 1.4 + i * 2.3));
      ctx.fillStyle = `rgba(226,232,255,${(0.25 + 0.35 * tw).toFixed(2)})`;
      ctx.fillRect(x, y, 1.4, 1.4);
    }
    const halo = ctx.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 3);
    halo.addColorStop(0, 'rgba(226,232,255,0.35)');
    halo.addColorStop(1, 'rgba(226,232,255,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(mx - mr * 3, my - mr * 3, mr * 6, mr * 6);
    ctx.fillStyle = '#e8ecf8';
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(168,178,214,0.6)';
    for (const [dx, dy, cr] of [
      [-0.35, -0.15, 0.2],
      [0.25, 0.25, 0.14],
      [0.1, -0.4, 0.1],
    ]) {
      ctx.beginPath();
      ctx.arc(mx + dx * mr, my + dy * mr, cr * mr, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (biome === 'purple') {
    // A starfield, a crescent moon, and (from drawCritter) shooting stars.
    for (let i = 0; i < 26; i += 1) {
      const x = hash01(i * 3 + 1) * cw;
      const y = hash01(i * 7 + 2) * playH * 0.55;
      const tw = 0.45 + 0.55 * Math.max(0, Math.sin(t * 1.8 + i * 1.9));
      ctx.fillStyle = `rgba(255,248,220,${(0.35 + 0.5 * tw).toFixed(2)})`;
      const r = 0.8 + hash01(i * 11) * 1.1;
      ctx.fillRect(x, y, r, r);
    }
    const mx = cw * 0.8;
    const my = playH * 0.14;
    const g = ctx.createRadialGradient(mx, my, 4, mx, my, 34);
    g.addColorStop(0, 'rgba(240,232,255,0.4)');
    g.addColorStop(1, 'rgba(240,232,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(mx - 34, my - 34, 68, 68);
    ctx.fillStyle = '#f2ecff';
    ctx.beginPath();
    ctx.arc(mx, my, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6f5ac2';
    ctx.beginPath();
    ctx.arc(mx + 5, my - 3, 9.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Two parallax bands of themed silhouettes between the backdrop art and the
 * world, each with its own LANDMARK set-pieces: meadow hills with a distant
 * castle, dunes with sunlit pyramids, snow peaks over a pine ridge, a graveyard
 * of dead trees, headstones and iron fence, glowing giant mushrooms, and crystal
 * spires with floating islands. This - not the palette - is what makes "now I'm
 * somewhere new" land at a glance.
 */
function drawSilhouettes(
  ctx: CanvasRenderingContext2D,
  biome: Biome,
  camX: number,
  zoom: number,
  cw: number,
  playH: number,
  horizonY: number,
) {
  const w = WORLD[biome];
  const layer = (factor: number, period: number, color: string, near: boolean) => {
    const off = camX * factor * zoom;
    const first = Math.floor(off / period) - 1;
    const count = Math.ceil(cw / period) + 3;
    ctx.fillStyle = color;
    // The band continues below the horizon so pits show distant ground, not sky.
    ctx.fillRect(0, horizonY, cw, Math.max(0, playH - horizonY));
    for (let k = first; k < first + count; k += 1) {
      const x = k * period - off;
      const r1 = hash01(k * 7.3 + (near ? 5 : 0));
      const r2 = hash01(k * 13.7 + (near ? 9 : 2));
      const h = (near ? 46 : 30) * (0.7 + r1 * 0.6);
      if (biome === 'grass') {
        // Rolling meadow hills, with a distant castle rising off one far hill
        // every few screens - the meadow's landmark, not just another hump.
        ctx.beginPath();
        ctx.moveTo(x - 4, horizonY + 1);
        ctx.quadraticCurveTo(x + period * (0.35 + r2 * 0.3), horizonY - h * 1.6, x + period + 4, horizonY + 1);
        ctx.fill();
        if (!near && k % 7 === 3) {
          const cxp = x + period * (0.35 + r2 * 0.3);
          const kw = h * 1.1;
          const kh = h * 1.35;
          const top = horizonY - h * 0.9 - kh;
          // Keep, two side towers with pointed roofs, and pennant flags.
          ctx.fillRect(cxp - kw / 2, top, kw, kh + h * 0.9);
          for (const sdir of [-1, 1]) {
            const txp = cxp + sdir * kw * 0.62;
            ctx.fillRect(txp - kw * 0.16, top - kh * 0.28, kw * 0.32, kh + h);
            ctx.beginPath();
            ctx.moveTo(txp - kw * 0.22, top - kh * 0.28);
            ctx.lineTo(txp, top - kh * 0.62);
            ctx.lineTo(txp + kw * 0.22, top - kh * 0.28);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.fillRect(txp, top - kh * 0.78, 1, kh * 0.17);
            ctx.beginPath();
            ctx.moveTo(txp + 1, top - kh * 0.78);
            ctx.lineTo(txp + 6, top - kh * 0.72);
            ctx.lineTo(txp + 1, top - kh * 0.67);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = color;
          }
          // Battlements along the keep.
          for (let m = -2; m <= 2; m += 1) {
            ctx.fillRect(cxp + m * kw * 0.2 - kw * 0.06, top - kh * 0.1, kw * 0.12, kh * 0.1);
          }
        }
      } else if (biome === 'sand') {
        // Wind-piled dunes, and great pyramids shimmering on the far horizon.
        ctx.beginPath();
        ctx.moveTo(x - 4, horizonY + 1);
        ctx.quadraticCurveTo(x + period * (0.35 + r2 * 0.3), horizonY - h * 1.9, x + period + 4, horizonY + 1);
        ctx.fill();
        if (!near && k % 5 === 2) {
          const px = x + period * 0.5;
          const pw2 = period * 0.42;
          const ph2 = h * 2.3;
          ctx.beginPath();
          ctx.moveTo(px - pw2, horizonY + 1);
          ctx.lineTo(px, horizonY - ph2);
          ctx.lineTo(px + pw2, horizonY + 1);
          ctx.closePath();
          ctx.fill();
          // The sun-struck face, so it reads as stone and not a dune.
          ctx.fillStyle = 'rgba(255,214,150,0.30)';
          ctx.beginPath();
          ctx.moveTo(px, horizonY - ph2);
          ctx.lineTo(px + pw2, horizonY + 1);
          ctx.lineTo(px + pw2 * 0.28, horizonY + 1);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = color;
        }
      } else if (biome === 'snow') {
        // Far: jagged snow-capped mountains. Near: a ridge of pines under them,
        // so the world reads as alpine forest below the peaks, not bare ice.
        const px = x + period * (0.3 + r2 * 0.4);
        const py = horizonY - h * 2;
        ctx.beginPath();
        ctx.moveTo(x - 6, horizonY + 1);
        ctx.lineTo(px, py);
        ctx.lineTo(x + period + 6, horizonY + 1);
        ctx.closePath();
        ctx.fill();
        // Snow cap.
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px - h * 0.3, py + h * 0.55);
        ctx.lineTo(px + h * 0.3, py + h * 0.55);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = color;
        if (near) {
          for (let p = 0; p < 3; p += 1) {
            const tx2 = x + period * (0.15 + p * 0.32 + hash01(k * 31 + p) * 0.12);
            const th2 = h * (0.5 + hash01(k * 37 + p) * 0.35);
            for (let tier = 0; tier < 2; tier += 1) {
              const ty2 = horizonY - th2 * (0.1 + tier * 0.4);
              const tw2 = th2 * (0.5 - tier * 0.14);
              ctx.beginPath();
              ctx.moveTo(tx2, ty2 - th2 * 0.55);
              ctx.lineTo(tx2 - tw2, ty2);
              ctx.lineTo(tx2 + tw2, ty2);
              ctx.closePath();
              ctx.fill();
            }
          }
        }
      } else if (biome === 'stone') {
        // The graveyard. Far: bare dead trees clawing at the moon on low
        // mounds. Near: headstones and stretches of iron fence.
        if (!near) {
          const px = x + period * (0.25 + r2 * 0.5);
          const th = h * 1.7;
          ctx.beginPath();
          ctx.moveTo(x - 4, horizonY + 1);
          ctx.quadraticCurveTo(px, horizonY - h * 0.7, x + period + 4, horizonY + 1);
          ctx.fill();
          ctx.strokeStyle = color;
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(px, horizonY - h * 0.3);
          ctx.lineTo(px + th * 0.06, horizonY - h * 0.3 - th * 0.55);
          ctx.stroke();
          ctx.lineWidth = 1.4;
          for (let br = 0; br < 3; br += 1) {
            const by = horizonY - h * 0.3 - th * (0.25 + br * 0.15);
            const bd = (br % 2 === 0 ? -1 : 1) * (0.5 + hash01(k * 41 + br) * 0.4);
            ctx.beginPath();
            ctx.moveTo(px + th * 0.04, by);
            ctx.quadraticCurveTo(px + bd * th * 0.2, by - th * 0.1, px + bd * th * 0.34, by - th * 0.22);
            ctx.stroke();
          }
        } else {
          // Two or three headstones - round-topped slabs and little crosses -
          // plus fence posts strung between them.
          for (let gvi = 0; gvi < 3; gvi += 1) {
            const gx = x + period * (0.12 + gvi * 0.3 + hash01(k * 43 + gvi) * 0.1);
            const gh = h * (0.45 + hash01(k * 47 + gvi) * 0.3);
            if (hash01(k * 53 + gvi) < 0.55) {
              ctx.beginPath();
              ctx.arc(gx, horizonY - gh, gh * 0.35, Math.PI, 0);
              ctx.fill();
              ctx.fillRect(gx - gh * 0.35, horizonY - gh, gh * 0.7, gh);
            } else {
              ctx.fillRect(gx - gh * 0.08, horizonY - gh * 1.15, gh * 0.16, gh * 1.15);
              ctx.fillRect(gx - gh * 0.32, horizonY - gh * 0.85, gh * 0.64, gh * 0.16);
            }
          }
          for (let fp = 0; fp < 5; fp += 1) {
            const fx = x + period * (0.05 + fp * 0.22);
            ctx.fillRect(fx, horizonY - h * 0.28, 1.6, h * 0.28);
          }
          ctx.fillRect(x, horizonY - h * 0.2, period * 0.95, 1.4);
        }
      } else if (biome === 'dirt') {
        // A giant mushroom: stem, domed cap, pale spots - and a soft bioluminescent
        // rim under the cap, so the whole hollow reads as lit from its own forest.
        const px = x + period * (0.3 + r2 * 0.4);
        const mh = h * 1.4;
        const capR = mh * 0.55;
        ctx.fillRect(px - mh * 0.14, horizonY - mh * 0.7, mh * 0.28, mh * 0.72);
        ctx.beginPath();
        ctx.arc(px, horizonY - mh * 0.66, capR, Math.PI, 0);
        ctx.fill();
        const rim = ctx.createRadialGradient(px, horizonY - mh * 0.6, capR * 0.2, px, horizonY - mh * 0.6, capR * 1.15);
        rim.addColorStop(0, 'rgba(160,255,190,0.20)');
        rim.addColorStop(1, 'rgba(160,255,190,0)');
        ctx.fillStyle = rim;
        ctx.fillRect(px - capR * 1.15, horizonY - mh * 0.6 - capR * 0.4, capR * 2.3, capR * 1.2);
        ctx.fillStyle = 'rgba(255,235,215,0.4)';
        for (let d = 0; d < 3; d += 1) {
          const dx = px + (hash01(k * 17 + d) - 0.5) * capR * 1.3;
          ctx.beginPath();
          ctx.arc(dx, horizonY - mh * 0.72 - hash01(k * 23 + d) * capR * 0.35, capR * 0.14, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = color;
      } else {
        // Purple: angular crystal spires on the ground, and - on the near band -
        // little floating islands drifting in the starlight above them.
        const px = x + period * (0.3 + r2 * 0.4);
        const chh = h * 1.7;
        for (let spike = -1; spike <= 1; spike += 1) {
          const sh = chh * (spike === 0 ? 1 : 0.55 + hash01(k * 29 + spike) * 0.2);
          const sx = px + spike * chh * 0.28;
          ctx.beginPath();
          ctx.moveTo(sx, horizonY - sh);
          ctx.lineTo(sx - chh * 0.16, horizonY + 1);
          ctx.lineTo(sx + chh * 0.16, horizonY + 1);
          ctx.closePath();
          ctx.fill();
        }
        ctx.strokeStyle = 'rgba(230,210,255,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, horizonY - chh);
        ctx.lineTo(px - chh * 0.05, horizonY + 1);
        ctx.stroke();
        if (near && k % 4 === 1) {
          const ix = x + period * (0.4 + r2 * 0.2);
          const iy = horizonY - chh * 1.7 - hash01(k * 59) * 26;
          const iw = period * 0.3;
          // Grassy top, rocky underside tapering to a point, one crystal on deck.
          ctx.beginPath();
          ctx.ellipse(ix, iy, iw, iw * 0.22, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(ix - iw * 0.75, iy + iw * 0.08);
          ctx.lineTo(ix, iy + iw * 0.72);
          ctx.lineTo(ix + iw * 0.75, iy + iw * 0.08);
          ctx.closePath();
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(ix + iw * 0.2, iy - iw * 0.5);
          ctx.lineTo(ix + iw * 0.08, iy - iw * 0.05);
          ctx.lineTo(ix + iw * 0.34, iy - iw * 0.05);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = 'rgba(230,210,255,0.35)';
          ctx.beginPath();
          ctx.ellipse(ix, iy - iw * 0.02, iw * 0.7, iw * 0.1, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = color;
        }
      }
    }
  };
  layer(0.18, 170, w.far, false);
  layer(0.3, 230, w.near, true);
}

/**
 * Weather and ambient life, per world: pollen in the meadow, wind-blown sand,
 * swaying snowflakes, drifting mist banks, pulsing glow-spores, and blinking
 * fireflies. Deterministic per-index scatter - a pure function of the clock.
 */
function drawAmbient(ctx: CanvasRenderingContext2D, biome: Biome, t: number, cw: number, playH: number) {
  if (biome === 'stone') {
    // Mist banks first, then a few slow motes.
    for (let i = 0; i < 4; i += 1) {
      const y = playH * (0.25 + i * 0.16) + Math.sin(t * 0.3 + i * 2) * 6;
      const x = ((hash01(i * 5 + 1) * cw + t * (5 + i * 2.5)) % (cw + 260)) - 130;
      ctx.fillStyle = 'rgba(235,242,244,0.08)';
      ctx.beginPath();
      ctx.ellipse(x, y, 120, 13, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const count = biome === 'snow' ? 24 : biome === 'stone' ? 6 : biome === 'purple' ? 12 : 12;
  for (let i = 0; i < count; i += 1) {
    const seedX = hash01(i * 3.1 + 7);
    const seedY = hash01(i * 5.7 + 3);
    const mul = 0.6 + (i % 5) * 0.15;
    if (biome === 'snow') {
      const x = ((seedX * cw + t * 9 * mul + Math.sin(t * 1.1 + i) * 9) % (cw + 20) + cw + 20) % (cw + 20) - 10;
      const y = ((seedY * playH + t * (22 + mul * 14)) % (playH + 20)) - 10;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(x, y, 1.1 + seedX * 1.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (biome === 'sand') {
      const x = ((seedX * cw + t * (55 + mul * 40)) % (cw + 30)) - 15;
      const y = ((seedY * playH + t * 4) % (playH + 10)) - 5;
      ctx.fillStyle = 'rgba(255,224,150,0.5)';
      ctx.fillRect(x, y, 6 + mul * 4, 1.2);
    } else if (biome === 'dirt') {
      // Glow-spores: drift upward, pulse softly.
      const x = ((seedX * cw + Math.sin(t * 0.6 + i * 2.2) * 24) % (cw + 20)) - 10;
      const y = (((seedY * playH - t * (7 + mul * 5)) % (playH + 20)) + playH + 20) % (playH + 20) - 10;
      const pulse = 0.4 + 0.6 * Math.max(0, Math.sin(t * 1.6 + i * 1.3));
      ctx.fillStyle = `rgba(200,255,160,${(0.1 * pulse).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(220,255,180,${(0.5 * pulse).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    } else if (biome === 'purple') {
      // Fireflies: wander lazily, blink on and off.
      const x = ((seedX * cw + Math.sin(t * 0.5 + i * 1.7) * 34) % (cw + 20)) - 10;
      const y = playH * (0.25 + seedY * 0.6) + Math.cos(t * 0.4 + i * 2.6) * 16;
      const blink = Math.max(0, Math.sin(t * 1.9 + i * 2.4));
      const a = blink * blink * 0.85;
      if (a > 0.05) {
        ctx.fillStyle = `rgba(255,233,150,${(a * 0.25).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255,240,170,${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Meadow pollen and ridge motes.
      const drift = biome === 'grass' ? 8 : 5;
      const x = ((seedX * cw + t * drift * mul) % (cw + 20)) - 10;
      const y = ((seedY * playH + t * 6 * mul) % (playH + 20)) - 10;
      ctx.fillStyle = biome === 'grass' ? 'rgba(255,255,255,0.5)' : 'rgba(210,220,230,0.35)';
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * The occasional friendly passer-by: butterflies over the meadow and hollow, a
 * tumbleweed bouncing through the desert, birds over the peaks, a flit of bats
 * across the graveyard moon, shooting stars across the kingdom. One at a time,
 * on a long cycle, so it stays a surprise rather than clutter.
 */
function drawCritter(
  ctx: CanvasRenderingContext2D,
  biome: Biome,
  t: number,
  cw: number,
  playH: number,
  horizonY: number,
) {
  if (biome === 'purple') {
    const cycleLen = 9;
    const phase = t % cycleLen;
    if (phase < 0.7) {
      const p = phase / 0.7;
      const cycle = Math.floor(t / cycleLen);
      const sx = cw * (0.1 + 0.6 * hash01(cycle * 3 + 1));
      const sy = 14 + 30 * hash01(cycle * 5 + 2);
      const x = sx + p * 150;
      const y = sy + p * 70;
      const grad = ctx.createLinearGradient(x - 34, y - 16, x, y);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(1, `rgba(255,250,220,${(0.9 * (1 - p)).toFixed(2)})`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x - 34, y - 16);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,255,240,${(1 - p).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(x, y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  if (biome === 'sand') {
    const cycleLen = 14;
    const phase = t % cycleLen;
    if (phase < 6) {
      const p = phase / 6;
      const x = -20 + p * (cw + 40);
      const y = horizonY - 7 - Math.abs(Math.sin(p * 22)) * 8;
      ctx.strokeStyle = 'rgba(150,108,58,0.55)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      for (let sp = 0; sp < 3; sp += 1) {
        const a = t * 6 + (sp / 3) * Math.PI;
        ctx.moveTo(x - Math.cos(a) * 6, y - Math.sin(a) * 6);
        ctx.lineTo(x + Math.cos(a) * 6, y + Math.sin(a) * 6);
      }
      ctx.stroke();
    }
    return;
  }
  if (biome === 'stone') {
    // Bats: a small flit of three, wheeling erratically across the moonlight
    // with a fast wingbeat. Nothing says "graveyard at night" faster.
    const cycleLen = 11;
    const phase = t % cycleLen;
    if (phase < 5) {
      const p = phase / 5;
      ctx.fillStyle = 'rgba(18,14,36,0.85)';
      for (let bi = 0; bi < 3; bi += 1) {
        const x = -24 + p * (cw + 48) - bi * 22 + Math.sin(t * 2.4 + bi * 2) * 10;
        const y = playH * (0.14 + bi * 0.07) + Math.sin(p * 14 + bi * 2.7) * 14;
        const flap = Math.abs(Math.sin(t * 14 + bi * 1.8)) * 4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x - 4, y - 3 - flap, x - 8, y - flap);
        ctx.quadraticCurveTo(x - 4, y + 1, x, y + 1.5);
        ctx.quadraticCurveTo(x + 4, y + 1, x + 8, y - flap);
        ctx.quadraticCurveTo(x + 4, y - 3 - flap, x, y);
        ctx.fill();
      }
    }
    return;
  }
  if (biome === 'snow') {
    const cycleLen = 17;
    const phase = t % cycleLen;
    if (phase < 8) {
      const p = phase / 8;
      ctx.strokeStyle = 'rgba(45,55,65,0.5)';
      ctx.lineWidth = 1.4;
      for (let bi = 0; bi < 2; bi += 1) {
        const x = -20 + p * (cw + 40) - bi * 16;
        const y = playH * (0.18 + bi * 0.05) + Math.sin(p * 9 + bi) * 8;
        const flap = Math.sin(t * 9 + bi * 1.4) * 3;
        ctx.beginPath();
        ctx.moveTo(x - 5, y - 2 - flap);
        ctx.quadraticCurveTo(x - 2, y + 1, x, y - 1);
        ctx.quadraticCurveTo(x + 2, y + 1, x + 5, y - 2 - flap);
        ctx.stroke();
      }
    }
    return;
  }
  // Meadow and hollow: a butterfly bobbing along on a wandering line.
  const cycleLen = 15;
  const phase = t % cycleLen;
  if (phase < 8) {
    const p = phase / 8;
    const x = -16 + p * (cw + 32);
    const y = playH * 0.3 + Math.sin(p * 13) * 22;
    const flap = Math.abs(Math.sin(t * 11));
    const wing = 2.2 + flap * 2.6;
    ctx.fillStyle = biome === 'dirt' ? 'rgba(190,255,170,0.8)' : 'rgba(255,170,200,0.85)';
    ctx.beginPath();
    ctx.ellipse(x - wing / 2 - 0.6, y, wing, 3, -0.4, 0, Math.PI * 2);
    ctx.ellipse(x + wing / 2 + 0.6, y, wing, 3, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(70,50,60,0.7)';
    ctx.fillRect(x - 0.6, y - 2.4, 1.2, 4.8);
  }
}

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

/** A gentle painted-paper glaze and drifting motes, entirely in screen space. */
function drawStorybookAtmosphere(
  ctx: CanvasRenderingContext2D,
  biome: Biome,
  t: number,
  cw: number,
  playH: number,
) {
  const tint: Record<Biome, string> = {
    grass: 'rgba(255,232,166,0.075)', sand: 'rgba(255,170,92,0.10)', snow: 'rgba(190,229,255,0.09)',
    stone: 'rgba(102,104,185,0.11)', dirt: 'rgba(255,168,116,0.075)', purple: 'rgba(205,154,255,0.10)',
  };
  const wash = ctx.createLinearGradient(0, 0, 0, playH);
  wash.addColorStop(0, tint[biome]);
  wash.addColorStop(0.62, 'rgba(255,255,255,0)');
  wash.addColorStop(1, 'rgba(38,20,70,0.035)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, cw, playH);

  const moteColor = biome === 'stone' || biome === 'purple' ? '218,207,255' : '255,246,203';
  for (let i = 0; i < 18; i += 1) {
    const drift = ((hash01(i * 17 + 8) * cw + t * (5 + (i % 4) * 2)) % (cw + 36)) - 18;
    const y = playH * (0.11 + hash01(i * 31 + 3) * 0.68) + Math.sin(t * 0.8 + i) * 5;
    const a = 0.08 + 0.11 * Math.max(0, Math.sin(t * 1.7 + i * 2.6));
    ctx.fillStyle = `rgba(${moteColor},${a.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(drift, y, 0.8 + (i % 3) * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Soft edge foliage gives a storybook proscenium without covering the play lane. */
function drawStorybookForeground(ctx: CanvasRenderingContext2D, biome: Biome, t: number, cw: number, playH: number) {
  const color = biome === 'snow' ? 'rgba(232,248,255,0.20)' : biome === 'stone' ? 'rgba(24,23,50,0.24)' : 'rgba(48,87,57,0.18)';
  ctx.fillStyle = color;
  for (const side of [0, 1]) {
    const base = side === 0 ? 0 : cw;
    const dir = side === 0 ? 1 : -1;
    for (let i = 0; i < 5; i += 1) {
      const y = playH * (0.42 + i * 0.105);
      const sway = Math.sin(t * 1.2 + i * 1.7) * 3;
      ctx.beginPath();
      ctx.ellipse(base + dir * (10 + (i % 2) * 5), y + sway, 14, 5, dir * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** A bold illustrated frame makes this edition legible as its own game at once. */
function drawStorybookEditionFrame(ctx: CanvasRenderingContext2D, biome: Biome, cw: number, playH: number) {
  const accent = WORLD[biome].accent;
  const edge = Math.min(10, Math.max(5, cw * 0.025));
  const shade = ctx.createLinearGradient(0, 0, 0, playH);
  shade.addColorStop(0, `${accent}55`);
  shade.addColorStop(0.5, 'rgba(255,252,225,0.08)');
  shade.addColorStop(1, 'rgba(32,18,62,0.18)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, edge, playH);
  ctx.fillRect(cw - edge, 0, edge, playH);
  ctx.strokeStyle = 'rgba(255,252,225,0.62)';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(edge * 0.5, edge * 0.5, cw - edge, playH - edge);
  ctx.fillStyle = 'rgba(255,255,255,0.76)';
  for (const x of [edge + 6, cw - edge - 8]) {
    ctx.beginPath();
    ctx.arc(x, edge + 6, 2.1, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** V3's panoramic kingdom is original supplied art, parallaxed behind the verified world. */
function drawSkyboundPanorama(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  camX: number,
  zoom: number,
  cw: number,
  playH: number,
) {
  if (!image) return;
  const aspect = image.width / image.height;
  const h = playH;
  const w = Math.max(cw, h * aspect);
  const travel = Math.max(1, w - cw);
  const x = -((camX * zoom * 0.14) % travel);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, cw, playH);
  ctx.clip();
  ctx.globalAlpha = 0.94;
  ctx.drawImage(image, x, 0, w, h);
  // Repeat with one overlap when a wide device sees beyond the image edge.
  ctx.drawImage(image, x + w - 1, 0, w, h);
  ctx.restore();
}

/** Original skybound ink/metal treatment for collision-identical tiles. */
function drawSkyboundTileFinish(ctx: CanvasRenderingContext2D, code: TileCode, x: number, y: number, time: number) {
  if (code === '#') {
    // Fully repaint the old atlas tile: Skybound terrain is violet sky-stone
    // with a bright crystal lip, not a tinted version of the Storybook dirt.
    ctx.fillStyle = '#30265f';
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = '#443579';
    ctx.fillRect(x + 2, y + 5, 5, 4);
    ctx.fillRect(x + 10, y + 10, 4, 3);
    ctx.fillStyle = '#18183d';
    ctx.fillRect(x + 1, y + TILE - 3, TILE - 2, 2);
    ctx.fillStyle = '#9cecff';
    ctx.fillRect(x, y, TILE, 3);
    ctx.fillStyle = '#e7fbff';
    ctx.fillRect(x + 2, y, 5, 1);
  } else if (code === 'B' || code === 'C') {
    ctx.fillStyle = code === 'C' ? '#d9f7ff' : '#82508f';
    ctx.fillRect(x, y + 1, TILE, TILE - 2);
    ctx.fillStyle = code === 'C' ? '#94d9ee' : '#f4bd68';
    ctx.fillRect(x + 2, y + (code === 'C' ? 10 : 3), TILE - 4, 2);
    ctx.strokeStyle = code === 'C' ? '#ffffff' : '#ffd98d';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 1.5, TILE - 1, TILE - 3);
  } else if (code === 'X') {
    ctx.fillStyle = `rgba(255,102,136,${(0.32 + 0.16 * Math.sin(time * 7 + x)).toFixed(3)})`;
    ctx.fillRect(x, y + TILE - 3, TILE, 3);
  }
}

function drawSkyboundEnemyFinish(ctx: CanvasRenderingContext2D, enemy: Enemy, time: number): void {
  const cx = enemy.x + PW / 2;
  const cy = enemy.y + PH / 2;
  const dangerous = isSpiky(enemy);
  const body = dangerous ? '#ed517c' : enemy.kind === 'flyer' ? '#f7c65d' : enemy.kind === 'shell' ? '#8b71e8' : '#58d5df';
  ctx.save();
  ctx.shadowColor = body;
  ctx.shadowBlur = 5;
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 1, 6.5, 5.5 + Math.sin(time * 5 + enemy.x) * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  if (enemy.kind === 'flyer') {
    ctx.fillStyle = 'rgba(233,252,255,.9)';
    ctx.beginPath();
    ctx.ellipse(cx - 7, cy - 2, 4, 2.5, -0.35, 0, Math.PI * 2);
    ctx.ellipse(cx + 7, cy - 2, 4, 2.5, 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
  if (dangerous) {
    ctx.fillStyle = '#ffd4df';
    for (const dx of [-5, 0, 5]) {
      ctx.beginPath();
      ctx.moveTo(cx + dx - 2, cy - 4);
      ctx.lineTo(cx + dx, cy - 9);
      ctx.lineTo(cx + dx + 2, cy - 4);
      ctx.fill();
    }
  }
  ctx.fillStyle = '#15204d';
  ctx.fillRect(cx - 3.5, cy - 1, 2, 2);
  ctx.fillRect(cx + 1.5, cy - 1, 2, 2);
  ctx.restore();
}

function drawSkyboundBlockFinish(
  ctx: CanvasRenderingContext2D,
  block: Block | undefined,
  x: number,
  y: number,
): void {
  const power = block?.kind === 'power';
  const coin = block?.kind === 'coin';
  ctx.fillStyle = power ? '#f0b94f' : coin ? '#4fc5da' : '#7254a5';
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = power ? '#fff19a' : coin ? '#b9f5ff' : '#bda7ed';
  ctx.fillRect(x + 2, y + 2, TILE - 4, 2);
  ctx.fillRect(x + 2, y + TILE - 4, 2, 2);
  ctx.fillRect(x + TILE - 4, y + TILE - 4, 2, 2);
  ctx.strokeStyle = '#252052';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
  if (power) {
    ctx.fillStyle = '#44366e';
    ctx.beginPath();
    ctx.moveTo(x + 8, y + 4);
    ctx.lineTo(x + 10, y + 8);
    ctx.lineTo(x + 8, y + 12);
    ctx.lineTo(x + 6, y + 8);
    ctx.closePath();
    ctx.fill();
  }
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
  edition: PlatformerEdition,
  skyboundImage: HTMLImageElement | null,
) {
  // The backdrop uses the unshaken camera so only the WORLD kicks on impact -
  // shaking the horizon too reads as the screen glitching rather than a thump.
  // The camera itself stays a float here; the world transform below snaps the
  // TRANSLATION to whole device pixels, which is what actually keeps a resting
  // frame pixel-identical to the last one. Rounding camX in world units (the
  // old approach) still landed on fractional device pixels once zoom applied.
  const baseCamX = s.camX;
  const baseCamY = s.camY;
  let camX = baseCamX;
  let camY = baseCamY;
  if (s.shake > 0) {
    // A soft, low-frequency thump - deliberately NOT the old high-frequency,
    // Math.round'd (pixel-quantised) shake, which buzzed the camera +/-1px and,
    // because it fired on every landing, read as the whole game "constantly
    // jittering". Kept as a smooth float that eases out fast (shake^2) and fades
    // to nothing; the world translate below still snaps the final position to the
    // device-pixel grid so it stays crisp.
    const k = s.shake * s.shake;
    camX += Math.sin(s.animTime * 26) * k * 6;
    camY += Math.cos(s.animTime * 30) * k * 4;
  }
  const biome = s.data.biome;
  // The context arrives pre-scaled by devicePixelRatio (useCanvasGame), so one
  // CSS unit is `dpr` device pixels; snapping through that factor lands the
  // world grid on the physical pixel grid.
  const dpr = ctx.getTransform().a || 1;
  const snapPx = (v: number) => Math.round(v * dpr) / dpr;

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
    const off = -Math.round(((baseCamX * factor * zoom) % w) + w);
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

  // World personality, back to front: the sun/moon/stars set the hour, two
  // bands of themed silhouettes set the place, then weather and the occasional
  // passing critter set it in motion. All screen-space canvas primitives - no
  // new art, no new state, just functions of the clock the frame already
  // carries - so none of it touches gameplay or the seeded generator the
  // checkers replay.
  const horizonY = (GROUND_TOP * TILE + skyPad - baseCamY) * zoom;
  drawCelestial(ctx, biome, s.animTime, cw, playH);
  drawSilhouettes(ctx, biome, baseCamX, zoom, cw, playH, horizonY);
  drawAmbient(ctx, biome, s.animTime, cw, playH);
  drawCritter(ctx, biome, s.animTime, cw, playH, horizonY);
  if (edition === 'skybound') {
    drawSkyboundPanorama(ctx, skyboundImage, baseCamX, zoom, cw, playH);
  } else {
    drawStorybookAtmosphere(ctx, biome, s.animTime, cw, playH);
    // This apron sits behind the world draw, so hazards and collectibles always
    // render over it even when they reach a screen edge.
    drawStorybookForeground(ctx, biome, s.animTime, cw, playH);
  }

  // World drawing happens in world units. `skyPad` is the surplus when the view
  // is taller than the world; `camY` is the scroll when it is shorter. Only one
  // of the two is ever non-zero.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, cw, playH);
  ctx.clip();
  // Translate FIRST, in CSS units snapped to device pixels, then scale. This is
  // the jitter fix: the whole world moves in whole physical pixels, so a steady
  // camera produces byte-identical frames instead of sub-pixel resampling.
  ctx.translate(snapPx(-camX * zoom), snapPx((skyPad - camY) * zoom));
  ctx.scale(zoom, zoom);
  ctx.save();

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
        // A hand-painted rim gives every walkable ledge a warm, 16-bit storybook
        // silhouette while preserving the exact same sprite and collision tile.
        if (!solidAt(s.data.tiles, tx, ty - 1)) {
          ctx.fillStyle = 'rgba(255,251,210,0.34)';
          ctx.fillRect(px + 1, py + 1, TILE - 2, 1.35);
          ctx.fillStyle = 'rgba(45,83,56,0.22)';
          ctx.fillRect(px + 2, py + 3, TILE - 4, 0.9);
        }
        if (edition === 'skybound') drawSkyboundTileFinish(ctx, code, px, py, s.animTime);
      } else if (code === 'B') {
        drawFrame(ctx, sp.tiles, 'block_planks', px, py, TILE, TILE);
        if (edition === 'skybound') drawSkyboundTileFinish(ctx, code, px, py, s.animTime);
      } else if (code === 'C') {
        const left = s.data.tiles[ty][tx - 1] === 'C';
        const right = s.data.tiles[ty][tx + 1] === 'C';
        const name = left && right ? cloud.middle : left ? cloud.right : right ? cloud.left : cloud.single;
        drawFrame(ctx, sp.tiles, name, px, py, TILE, TILE);
        if (edition === 'skybound') drawSkyboundTileFinish(ctx, code, px, py, s.animTime);
      } else if (code === 'S') {
        const spring = s.data.springs.find((v) => v.tx === tx && v.ty === ty);
        const out = spring && spring.fired > 0;
        drawFrame(ctx, sp.tiles, out ? 'spring_out' : 'spring', px, py, TILE, TILE);
        if (edition === 'skybound') {
          ctx.fillStyle = out ? 'rgba(255,245,166,0.9)' : 'rgba(132,236,255,0.85)';
          ctx.fillRect(px + 2, py + TILE - (out ? 8 : 5), TILE - 4, 2);
        }
      } else if (code === 'X') {
        // A halo makes the one-shot danger read before a small sprite is reached.
        const warning = 0.32 + 0.16 * Math.sin(s.animTime * 5 + tx * 1.7);
        ctx.fillStyle = `rgba(255,99,92,${warning.toFixed(3)})`;
        ctx.fillRect(px - 1, py + TILE - 5, TILE + 2, 6);
        drawFrame(ctx, sp.tiles, 'spikes', px, py, TILE, TILE);
        if (edition === 'skybound') drawSkyboundTileFinish(ctx, code, px, py, s.animTime);
      } else if (code === 'D') {
        const isEntry = s.data.doors.some((d) => d.tx === tx && d.ty === ty);
        drawFrame(ctx, sp.tiles, isEntry ? 'door_open_top' : 'door_closed_top', px, py - TILE, TILE, TILE);
        drawFrame(ctx, sp.tiles, isEntry ? 'door_open' : 'door_closed', px, py, TILE, TILE);
        if (edition === 'skybound') {
          ctx.strokeStyle = isEntry ? 'rgba(141,242,255,0.95)' : 'rgba(202,167,255,0.7)';
          ctx.lineWidth = 1.1;
          ctx.strokeRect(px + 2, py - TILE + 2, TILE - 4, TILE * 2 - 4);
        }
      } else {
        const blk = blockAt.get(`${tx},${ty}`);
        const lift = blk && blk.bump > 0 ? -3 : 0;
        drawFrame(ctx, sp.tiles, blk ? blockFrame(blk, s.animTime) : 'brick_brown', px, py + lift, TILE, TILE);
        if (edition === 'skybound') {
          drawSkyboundBlockFinish(ctx, blk, px, py + lift);
        }
      }
    }
  }

  // --- moving platforms ---
  for (const m of s.data.movers) {
    const mx = moverX(m);
    const my = moverY(m);
    ctx.fillStyle = 'rgba(31,24,48,0.20)';
    ctx.beginPath();
    ctx.ellipse(mx + m.w / 2, my + MOVER_H + 3, m.w * 0.45, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let x = 0; x < m.w; x += TILE) {
      drawFrame(ctx, sp.tiles, 'bridge_logs', mx + x, my, Math.min(TILE, m.w - x), MOVER_H);
    }
    if (edition === 'skybound') {
      ctx.strokeStyle = 'rgba(255,230,146,0.82)';
      ctx.lineWidth = 1;
      ctx.strokeRect(mx + 1, my + 1, m.w - 2, MOVER_H - 2);
    }
  }

  // --- door magic: the hidden treat, made discoverable ---
  // Entry doors pulse with light, shed rising sparkles, and hang a bobbing star
  // overhead; the exits get a fainter echo of the same glow. Standing in one
  // pops an on-canvas prompt with a fill bar, so the "hold still" trick teaches
  // itself the first time a kid walks into the light.
  for (const d of s.data.doors) {
    const spots: Array<[number, number, number]> = [
      [d.tx, d.ty, 1],
      [d.exitTx, d.exitTy, 0.45],
    ];
    for (const [dtx, dty, strength] of spots) {
      if (dtx * TILE < camX - 40 || dtx * TILE > camX + viewW + 40) continue;
      const cx = dtx * TILE + TILE / 2;
      const cy = dty * TILE + TILE / 2;
      const pulse = 0.6 + 0.4 * Math.sin(s.animTime * 3 + dtx);
      const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, 20);
      glow.addColorStop(0, `rgba(205,155,255,${(0.38 * pulse * strength).toFixed(3)})`);
      glow.addColorStop(1, 'rgba(205,155,255,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(cx - 20, cy - 22, 40, 44);
      for (let k = 0; k < 3; k += 1) {
        const p = (s.animTime * 0.45 + k / 3 + hash01(dtx + k)) % 1;
        const sx = cx - 5 + Math.sin((p * 5 + k) * 4) * 5 + k * 3;
        const sy = dty * TILE + 14 - p * 30;
        ctx.fillStyle = `rgba(232,205,255,${((1 - p) * 0.85 * strength).toFixed(3)})`;
        ctx.fillRect(sx, sy, 1.6, 1.6);
      }
      if (strength === 1) {
        const bobY = dty * TILE - 24 + Math.sin(s.animTime * 2.2 + dtx) * 2.5;
        drawFrame(ctx, sp.tiles, 'star', dtx * TILE + 3.5, bobY, 9, 9);
        if (edition === 'skybound') {
          ctx.strokeStyle = `rgba(127,237,255,${(0.55 + pulse * 0.35).toFixed(3)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(cx, cy, 13 + pulse * 3, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
  }
  if (s.onDoor) {
    const bx = s.onDoor.tx * TILE + TILE / 2;
    const by = s.onDoor.ty * TILE - 36;
    const bw = 94;
    ctx.fillStyle = 'rgba(24,12,44,0.78)';
    roundRectPath(ctx, bx - bw / 2, by, bw, 17, 4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(220,190,255,0.9)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.fillStyle = '#fdf6ff';
    ctx.font = 'bold 6.5px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Tap jump or hold still!', bx, by + 7.5);
    ctx.textAlign = 'left';
    const frac = Math.min(1, s.dwell / 0.3);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(bx - bw / 2 + 5, by + 11, bw - 10, 3);
    ctx.fillStyle = '#ffd54a';
    ctx.fillRect(bx - bw / 2 + 5, by + 11, (bw - 10) * frac, 3);
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
    if (edition === 'skybound') {
      const gx = s.data.flagX + TILE / 2;
      const gy = poleTop - 10;
      const beacon = ctx.createRadialGradient(gx, gy, 2, gx, gy, 25);
      beacon.addColorStop(0, 'rgba(255,244,160,0.78)');
      beacon.addColorStop(1, 'rgba(255,244,160,0)');
      ctx.fillStyle = beacon;
      ctx.fillRect(gx - 25, gy - 25, 50, 50);
      ctx.fillStyle = '#ffef9c';
      ctx.beginPath();
      ctx.moveTo(gx, gy - 8);
      ctx.lineTo(gx + 6, gy);
      ctx.lineTo(gx, gy + 8);
      ctx.lineTo(gx - 6, gy);
      ctx.closePath();
      ctx.fill();
    }
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
  for (let ci = 0; ci < s.data.coins.length; ci += 1) {
    const c = s.data.coins[ci];
    if (c.taken) continue;
    if (c.x < camX - 20 || c.x > camX + viewW + 20) continue;
    const bob = Math.sin(s.animTime * 3 + c.x * 0.05) * 1.5;
    const coinGlow = ctx.createRadialGradient(c.x, c.y + bob, 1, c.x, c.y + bob, 11);
    coinGlow.addColorStop(0, 'rgba(255,232,112,0.36)');
    coinGlow.addColorStop(1, 'rgba(255,232,112,0)');
    ctx.fillStyle = coinGlow;
    ctx.fillRect(c.x - 11, c.y + bob - 11, 22, 22);
    if (edition === 'skybound' && s.relicIdx.includes(ci)) {
      const pulse = 0.7 + 0.3 * Math.sin(s.animTime * 5 + ci);
      const starGlow = ctx.createRadialGradient(c.x, c.y + bob, 1, c.x, c.y + bob, 16);
      starGlow.addColorStop(0, `rgba(255,246,174,${(0.78 * pulse).toFixed(3)})`);
      starGlow.addColorStop(1, 'rgba(135,219,255,0)');
      ctx.fillStyle = starGlow;
      ctx.fillRect(c.x - 16, c.y + bob - 16, 32, 32);
      ctx.save();
      ctx.translate(c.x, c.y + bob);
      ctx.rotate(s.animTime * 1.7 + ci);
      ctx.fillStyle = '#fff4a2';
      ctx.beginPath();
      for (let p = 0; p < 10; p += 1) {
        const r = p % 2 === 0 ? 8 : 3.6;
        const a = -Math.PI / 2 + (p * Math.PI) / 5;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (p === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#6e4fb3';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      continue;
    }
    if (ci === s.rainbowIdx) {
      // The magic coin: a slowly cycling rainbow halo with two orbiting sparks.
      const hue = (s.animTime * 140) % 360;
      const r = 10 + Math.sin(s.animTime * 5) * 1.5;
      const halo = ctx.createRadialGradient(c.x, c.y + bob, 2, c.x, c.y + bob, r + 4);
      halo.addColorStop(0, `hsla(${hue.toFixed(0)},90%,65%,0.55)`);
      halo.addColorStop(1, `hsla(${hue.toFixed(0)},90%,65%,0)`);
      ctx.fillStyle = halo;
      ctx.fillRect(c.x - r - 4, c.y + bob - r - 4, (r + 4) * 2, (r + 4) * 2);
      drawFrame(ctx, sp.tiles, coinName, c.x - 8.5, c.y - 8.5 + bob, 17, 17);
      for (let k = 0; k < 2; k += 1) {
        const a = s.animTime * 4 + k * Math.PI;
        ctx.fillStyle = `hsla(${((hue + 120 * (k + 1)) % 360).toFixed(0)},90%,70%,0.9)`;
        ctx.fillRect(c.x + Math.cos(a) * 9 - 1, c.y + bob + Math.sin(a) * 9 - 1, 2, 2);
      }
      continue;
    }
    drawFrame(ctx, sp.tiles, coinName, c.x - 7, c.y - 7 + bob, 14, 14);
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
    const glow = ctx.createRadialGradient(p.x + PW / 2, p.y + PH / 2, 2, p.x + PW / 2, p.y + PH / 2, 13);
    glow.addColorStop(0, 'rgba(255,227,126,0.30)');
    glow.addColorStop(1, 'rgba(255,227,126,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(p.x - 7, p.y - 7, 26, 26);
    ctx.fillStyle = 'rgba(30,22,38,0.20)';
    ctx.beginPath();
    ctx.ellipse(p.x + PW / 2, p.y + PH + 1, 6, 1.8, 0, 0, Math.PI * 2);
    ctx.fill();
    drawFrame(ctx, sp.tiles, 'mushroom_red', p.x - 3, p.y - 2, 17, 17);
  }

  // --- enemies ---
  for (const e of s.data.enemies) {
    if (e.x < camX - 30 || e.x > camX + viewW + 30) continue;
    const art = ENEMY_SPRITES[e.kind];
    ctx.fillStyle = e.mode === 'slide' ? 'rgba(255,180,85,0.25)' : 'rgba(28,20,38,0.23)';
    ctx.beginPath();
    ctx.ellipse(e.x + PW / 2, e.y + PH + 1, e.mode === 'slide' ? 8 : 6, 1.8, 0, 0, Math.PI * 2);
    ctx.fill();
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
    if (edition === 'skybound') drawSkyboundEnemyFinish(ctx, e, s.animTime);
  }

  // --- dust puffs, behind the player so a landing kicks up around the feet ---
  for (const p of s.puffs) {
    ctx.strokeStyle = `rgba(255,255,255,${(Math.max(0, p.life / 0.35) * 0.6).toFixed(3)})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // --- player: this edition's own animated explorer ---
  // The storybook scout is pink; the optional skybound edition uses purple.
  // Both have complete movement poses while preserving the original hitbox.
  const b = s.body;
  const h = s.big ? PH_BIG : PH;
  const blink = s.hurt > 0 && Math.floor(s.animTime * 20) % 2 === 0;
  if (!blink) {
    const foot = GROUND_TOP * TILE - h;
    const cheering = s.finish > 0 && b.y >= foot - 1;

    // A soft golden aura while grown, so the power-up state reads at a glance.
    if (s.big) {
      const ax = b.x + PW / 2;
      const ay = b.y + h / 2;
      const aura = ctx.createRadialGradient(ax, ay, 3, ax, ay, 17);
      aura.addColorStop(0, `rgba(255,214,90,${(0.2 + 0.08 * Math.sin(s.animTime * 4)).toFixed(3)})`);
      aura.addColorStop(1, 'rgba(255,214,90,0)');
      ctx.fillStyle = aura;
      ctx.fillRect(ax - 17, ay - 17, 34, 34);
    }

    // Grounded shadow stays tied to the collision body, while the larger art can
    // lean and hop above it. It improves depth without moving the hitbox at all.
    const shadowLift = Math.max(0, Math.min(10, (GROUND_TOP * TILE - h) - b.y));
    const shadowScale = 1 - shadowLift / 24;
    ctx.fillStyle = `rgba(26,18,45,${(0.26 * shadowScale).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(b.x + PW / 2, b.y + h + 1, 7 * shadowScale, 2 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();

    // Squash on landing, stretch on takeoff, a happy pop on pickups, victory
    // hops at the flag. The old continuous idle "breathing" scale is GONE on
    // purpose: it resized the sprite by a fraction of a pixel every frame,
    // which is exactly the standing-still vibration the kids noticed. An idle
    // hero now renders pixel-identical frames until something really moves.
    const skidding =
      b.onGround &&
      Math.abs(b.vx) > 45 &&
      ((b.vx > 0 && s.facing < 0) || (b.vx < 0 && s.facing > 0));
    const pop = 1 + s.pulse * 0.22;
    const hop = cheering ? Math.abs(Math.sin(s.animTime * 7)) * 4 : 0;
    const heroScale = edition === 'skybound' ? 1.16 : 1;
    const storybookFrames = {
      front: 'character_pink_front',
      hit: 'character_pink_hit',
      jump: 'character_pink_jump',
      walkA: 'character_pink_walk_a',
      walkB: 'character_pink_walk_b',
      duck: 'character_pink_duck',
      idle: 'character_pink_idle',
    } as const;
    const skyboundFrames = {
      front: 'character_purple_front',
      hit: 'character_purple_hit',
      jump: 'character_purple_jump',
      walkA: 'character_purple_walk_a',
      walkB: 'character_purple_walk_b',
      duck: 'character_purple_duck',
      idle: 'character_purple_idle',
    } as const;
    const frames = edition === 'skybound' ? skyboundFrames : storybookFrames;
    const moving = Math.abs(b.vx) > 8;
    const frame = cheering
      ? frames.front
      : s.hurt > 0
        ? frames.hit
        : !b.onGround
          ? frames.jump
          : skidding
            ? frames.duck
            : moving
              ? Math.floor(s.runPhase) % 2 === 0
                ? frames.walkA
                : frames.walkB
              : frames.idle;
    const size = (s.big ? 36 : 29) * pop * heroScale;
    drawFrame(
      ctx,
      sp.characters,
      frame,
      b.x + PW / 2 - size / 2,
      b.y + h - size - hop,
      size,
      size,
      s.facing < 0,
    );
    if (edition === 'skybound' && !b.onGround) {
      ctx.strokeStyle = 'rgba(221,248,255,0.52)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(b.x + PW / 2 - s.facing * 7, b.y + h - 2);
      ctx.lineTo(b.x + PW / 2 - s.facing * 14, b.y + h + 2);
      ctx.stroke();
    }
  }

  // --- confetti ---
  for (const f of s.confetti) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, f.life));
    ctx.translate(f.x, f.y);
    ctx.rotate(f.spin);
    ctx.fillStyle = f.color;
    ctx.fillRect(-2, -1.2, 4, 2.4);
    ctx.restore();
  }
  ctx.globalAlpha = 1;

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

  if (edition === 'storybook') drawStorybookEditionFrame(ctx, biome, cw, playH);

  // A restrained vignette focuses the eye toward the action without dimming HUD.
  const vignette = ctx.createRadialGradient(cw / 2, playH * 0.46, Math.min(cw, playH) * 0.18, cw / 2, playH * 0.46, Math.max(cw, playH) * 0.78);
  vignette.addColorStop(0, 'rgba(28,17,55,0)');
  vignette.addColorStop(1, edition === 'skybound' ? 'rgba(28,24,95,0.26)' : 'rgba(28,17,55,0.18)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, cw, playH);
  if (edition === 'skybound' && s.portalFlash > 0) {
    const portalA = Math.min(0.5, s.portalFlash * 1.35);
    const portal = ctx.createRadialGradient(cw / 2, playH / 2, 8, cw / 2, playH / 2, Math.max(cw, playH) * 0.72);
    portal.addColorStop(0, `rgba(222,252,255,${portalA.toFixed(3)})`);
    portal.addColorStop(0.42, `rgba(145,188,255,${(portalA * 0.55).toFixed(3)})`);
    portal.addColorStop(1, 'rgba(78,48,158,0)');
    ctx.fillStyle = portal;
    ctx.fillRect(0, 0, cw, playH);
  }

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
  ctx.fillStyle = edition === 'skybound' ? 'rgba(18,22,74,0.66)' : 'rgba(0,0,0,0.22)';
  ctx.fillRect(0, 0, cw, 24);
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.font = 'bold 12px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(`LEVEL ${s.level}`, 10, 17);
  const heartPulse = s.big ? Math.sin(s.animTime * 5) * 1.5 : 0;
  drawFrame(
    ctx,
    sp.tiles,
    s.big ? 'hud_heart' : 'hud_heart_empty',
    82 - heartPulse / 2,
    6 - heartPulse / 2,
    13 + heartPulse,
    13 + heartPulse,
  );
  ctx.textAlign = 'center';
  ctx.font = 'bold 10px ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(edition === 'skybound' ? 'SKYBOUND KINGDOM' : WORLD[biome].name, cw / 2, 16);
  ctx.font = 'bold 6.5px ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = edition === 'skybound' ? 'rgba(160,239,255,0.96)' : 'rgba(255,246,209,0.92)';
  ctx.fillText(edition === 'skybound' ? `STAR RELICS ${s.relicsHere}/3` : 'STORYBOOK EDITION', cw / 2, 23);
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.font = 'bold 12px ui-sans-serif, system-ui, sans-serif';
  drawFrame(ctx, sp.tiles, 'hud_coin', cw - 74, 6, 13, 13);
  ctx.textAlign = 'right';
  ctx.fillText(`${s.coinsTotal}`, cw - 10, 17);
  ctx.textAlign = 'left';

  // --- coin combo chip, growing with the streak ---
  if (s.combo >= 3 && s.comboT > 0) {
    const size = 11 + Math.min(s.combo, 10) * 0.6;
    ctx.font = `bold ${size.toFixed(1)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillText(`COMBO x${s.combo}`, cw - 9, 40 + size / 3);
    ctx.fillStyle = '#ffd54a';
    ctx.fillText(`COMBO x${s.combo}`, cw - 10, 39 + size / 3);
    ctx.textAlign = 'left';
  }

  // --- world intro banner: "you have arrived somewhere new" ---
  if (s.intro > 0) {
    const a = Math.min(1, s.intro / 0.45);
    const popIn = Math.min(1, (2.2 - s.intro) / 0.3);
    const scale = 0.8 + 0.2 * popIn;
    const bw = Math.min(cw - 40, 290);
    const bx = cw / 2;
    const by = playH * 0.3;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(bx, by);
    ctx.scale(scale, scale);
    ctx.fillStyle = edition === 'skybound' ? 'rgba(20,31,88,0.88)' : 'rgba(22,12,46,0.8)';
    roundRectPath(ctx, -bw / 2, -30, bw, 60, 12);
    ctx.fill();
    ctx.strokeStyle = edition === 'skybound' ? '#8eeeff' : WORLD[biome].accent;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = edition === 'skybound' ? '#a7f3ff' : WORLD[biome].accent;
    ctx.font = 'bold 11px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(edition === 'skybound' ? `SKYBOUND ACT ${s.level}` : `LEVEL ${s.level}`, 0, -9);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 19px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(edition === 'skybound' ? 'THE CLOUD-CROWN REACH' : WORLD[biome].name, 0, 14);
    drawFrame(ctx, sp.tiles, 'star', -bw / 2 + 10, -8, 15, 15);
    drawFrame(ctx, sp.tiles, 'star', bw / 2 - 25, -8, 15, 15);
    ctx.textAlign = 'left';
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // --- level clear banner, over the confetti ---
  if (s.finish > 0) {
    const bt = 2.4 - s.finish;
    const scale = Math.min(1, bt * 4);
    const bx = cw / 2;
    const by = playH * 0.32;
    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(scale, scale);
    const bw = Math.min(cw - 40, 300);
    ctx.fillStyle = 'rgba(22,12,46,0.82)';
    roundRectPath(ctx, -bw / 2, -34, bw, 72, 12);
    ctx.fill();
    ctx.strokeStyle = '#ffd54a';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(`LEVEL ${s.level} CLEAR!`, 0, -6);
    ctx.fillStyle = '#ffe9a8';
    ctx.font = 'bold 12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(`You found ${s.coinsHere} coin${s.coinsHere === 1 ? '' : 's'}!`, 0, 14);
    const starBob = Math.sin(s.animTime * 6) * 2;
    for (let k = -1; k <= 1; k += 1) {
      drawFrame(ctx, sp.tiles, 'star', k * 26 - 8, 20 + (k === 0 ? -starBob : starBob), 16, 16);
    }
    ctx.textAlign = 'left';
    ctx.restore();
  }
}
