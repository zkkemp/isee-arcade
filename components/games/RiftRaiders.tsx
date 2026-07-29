'use client';

import { useEffect, useRef } from 'react';
import { drawCharacterSprite, type Character } from '@/lib/characters';
import type { Difficulty } from '@/lib/difficulty';
import type { GameApi, GameCanvasProps } from '@/lib/games';
import { playSound } from '@/lib/sound';
import { useCanvasGame } from '@/lib/useCanvasGame';

/**
 * THESIS: A family-avatar run-and-gun where forward motion leaves living light
 * in a jungle bioforge; it refuses a copied military cartridge world.
 * OWN-WORLD: Ink-blue jungle, cyan life, coral danger, gold rescue hardware,
 * crisp silhouettes, phosphorescent trails, and machinery reclaimed by roots.
 * STORY: Breach the swarm, activate beacons, collect experimental weapons, and
 * dismantle the siege core.
 * FIRST VIEWPORT: Hero low-left, target lane centered, layered canopy above,
 * objective and hearts embedded in the playfield, danger entering from right.
 * FORM: Continuous siege path, fourth grounded structure; seed 0d7bf681.
 */

const VIEW_H = 600;
const BASE_VIEW_W = 360;
const GROUND_Y = 500;
const PLAYER_W = 30;
const PLAYER_H = 46;
const RUN_SPEED = 174;
const JUMP_SPEED = 350;
const GRAVITY = 920;
const MAX_FALL = 540;
const COYOTE = 0.11;
const JUMP_BUFFER = 0.13;

type Weapon = 'pulse' | 'spread' | 'laser' | 'comet';
export type RiftEnemyType = 'crawler' | 'drone' | 'turret' | 'brute';
type Platform = { x: number; y: number; w: number; h: number; kind: 'ground' | 'ledge' };
type Enemy = {
  id: number;
  type: RiftEnemyType;
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  hp: number;
  maxHp: number;
  cooldown: number;
  alive: boolean;
  hit: number;
};
type Pickup = { x: number; y: number; weapon: Exclude<Weapon, 'pulse'>; taken: boolean; phase: number };
type Checkpoint = { x: number; active: boolean };
type Bullet = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  enemy: boolean;
  damage: number;
  radius: number;
  life: number;
  color: string;
};
type Particle = { x: number; y: number; vx: number; vy: number; life: number; size: number; color: string };
type Player = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  onGround: boolean;
  coyote: number;
  jumpBuffer: number;
  health: number;
  invulnerable: number;
  respawnX: number;
  weapon: Weapon;
  weaponTime: number;
};
type Boss = {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  cooldown: number;
  hit: number;
  alive: boolean;
  phase: number;
};

export type RiftStage = {
  number: number;
  name: string;
  worldW: number;
  platforms: Platform[];
  enemies: Enemy[];
  pickups: Pickup[];
  checkpoints: Checkpoint[];
  boss: Boss;
};

type State = {
  stage: RiftStage;
  player: Player;
  bullets: Bullet[];
  particles: Particle[];
  camX: number;
  time: number;
  fire: number;
  shake: number;
  intro: number;
  bossWarning: number;
  kills: number;
  /** The how-to card can stay open as long as a child needs. Nothing attacks
   *  until their first real movement or jump input. */
  started: boolean;
};

const STAGE_NAMES = ['Glowwood Ingress', 'Convoy Breaker', 'The Living Forge', 'Midnight Rebellion'];
const WEAPON_COLOR: Record<Weapon, string> = {
  pulse: '#76f7ff',
  spread: '#ffd66b',
  laser: '#8cff9b',
  comet: '#ff7bd6',
};
const FIRE_RATE: Record<Weapon, number> = { pulse: 0.2, spread: 0.29, laser: 0.13, comet: 0.42 };

function groundSegmentAt(platforms: Platform[], x: number): Platform | undefined {
  return platforms.find((p) => p.kind === 'ground' && x >= p.x && x <= p.x + p.w);
}

function safeGroundX(platforms: Platform[], preferred: number): number {
  const direct = groundSegmentAt(platforms, preferred);
  if (direct) return preferred;
  const next = platforms.find((p) => p.kind === 'ground' && p.x > preferred);
  return next ? next.x + 50 : preferred;
}

export function buildRiftStage(number: number, difficulty: Difficulty): RiftStage {
  const stage = Math.max(1, number);
  const worldW = 5000 + (stage - 1) * 260;
  const gaps = [820, 1710, 2620, 3550].map((x) => x + (stage - 1) * 28);
  const gapWidths = [76, 88, 82, 92];
  const platforms: Platform[] = [];
  let cursor = 0;
  for (let i = 0; i < gaps.length; i += 1) {
    platforms.push({ x: cursor, y: GROUND_Y, w: gaps[i] - cursor, h: 100, kind: 'ground' });
    cursor = gaps[i] + gapWidths[i];
  }
  platforms.push({ x: cursor, y: GROUND_Y, w: worldW - cursor, h: 100, kind: 'ground' });

  const ledges = [
    [420, 414, 150],
    [1080, 388, 190],
    [1450, 430, 120],
    [2010, 370, 210],
    [2400, 420, 150],
    [3020, 380, 190],
    [3360, 430, 130],
    [3940, 388, 220],
    [4360, 430, 150],
  ] as const;
  for (const [x, y, w] of ledges) {
    platforms.push({ x: x + (stage - 1) * 22, y, w, h: 18, kind: 'ledge' });
  }

  const hpScale = difficulty === 'easy' ? 0.78 : difficulty === 'hard' ? 1.25 : 1;
  const enemyTypes: RiftEnemyType[] = ['crawler', 'drone', 'turret', 'crawler', 'brute', 'drone'];
  const enemies: Enemy[] = [];
  const enemyCount = 14 + Math.min(8, stage * 2);
  for (let i = 0; i < enemyCount; i += 1) {
    const type = enemyTypes[(i + stage) % enemyTypes.length];
    const preferred = 345 + i * ((worldW - 925) / enemyCount);
    const x = safeGroundX(platforms, preferred);
    const baseHp = type === 'brute' ? 8 : type === 'turret' ? 5 : type === 'drone' ? 3 : 2;
    const y = type === 'drone' ? 305 - (i % 3) * 38 : type === 'turret' ? GROUND_Y - 31 : GROUND_Y - 22;
    enemies.push({
      id: i,
      type,
      x,
      y,
      baseX: x,
      baseY: y,
      hp: Math.max(1, Math.round(baseHp * hpScale)),
      maxHp: Math.max(1, Math.round(baseHp * hpScale)),
      cooldown: 1.2 + (i % 4) * 0.42,
      alive: true,
      hit: 0,
    });
  }

  const pickupKinds: Array<Exclude<Weapon, 'pulse'>> = ['spread', 'laser', 'comet', 'spread'];
  const pickups = [285, 1880, 3220, 4200].map((preferred, index) => ({
    x: safeGroundX(platforms, preferred + (stage - 1) * 24),
    y: index % 2 === 0 ? 405 : 450,
    weapon: pickupKinds[(index + stage - 1) % pickupKinds.length],
    taken: false,
    phase: index * 1.7,
  }));
  const checkpoints = [1500, 3100].map((x) => ({
    x: safeGroundX(platforms, x + (stage - 1) * 25),
    active: false,
  }));
  const bossHp = Math.round((64 + stage * 16) * hpScale);
  const boss: Boss = {
    x: worldW - 245,
    y: GROUND_Y - 118,
    hp: bossHp,
    maxHp: bossHp,
    cooldown: 1.1,
    hit: 0,
    alive: true,
    phase: 0,
  };
  return {
    number: stage,
    name: STAGE_NAMES[(stage - 1) % STAGE_NAMES.length],
    worldW,
    platforms,
    enemies,
    pickups,
    checkpoints,
    boss,
  };
}

export function largestGroundGap(stage: RiftStage): number {
  const ground = stage.platforms.filter((p) => p.kind === 'ground').sort((a, b) => a.x - b.x);
  let largest = 0;
  for (let i = 1; i < ground.length; i += 1) {
    largest = Math.max(largest, ground[i].x - (ground[i - 1].x + ground[i - 1].w));
  }
  return largest;
}

export type ForwardTarget = { x: number; y: number; alive: boolean };

export function pickForwardTarget<T extends ForwardTarget>(
  candidates: T[],
  x: number,
  y: number,
  facing: 1 | -1,
  maxRange = 460,
): T | undefined {
  return candidates
    .filter((target) => {
      if (!target.alive) return false;
      const dx = target.x - x;
      return dx * facing >= -18 && Math.hypot(dx, target.y - y) <= maxRange;
    })
    .sort((a, b) => {
      const score = (target: T) => {
        const dx = target.x - x;
        const dy = target.y - y;
        return Math.abs(dx) + Math.abs(dy) * 0.72;
      };
      return score(a) - score(b);
    })[0];
}

function fresh(stageNumber: number, difficulty: Difficulty): State {
  const stage = buildRiftStage(stageNumber, difficulty);
  return {
    stage,
    player: {
      x: 92,
      y: GROUND_Y - PLAYER_H,
      vx: 0,
      vy: 0,
      facing: 1,
      onGround: true,
      coyote: COYOTE,
      jumpBuffer: 0,
      health: difficulty === 'easy' ? 5 : difficulty === 'hard' ? 3 : 4,
      invulnerable: 1.1,
      respawnX: 92,
      weapon: 'pulse',
      weaponTime: 0,
    },
    bullets: [],
    particles: [],
    camX: 0,
    time: 0,
    fire: 0.25,
    shake: 0,
    intro: 2.8,
    bossWarning: 0,
    kills: 0,
    started: false,
  };
}

function overlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function burst(s: State, x: number, y: number, color: string, count = 10, power = 115): void {
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 + (i % 3) * 0.12;
    const speed = power * (0.45 + ((i * 37) % 70) / 100);
    s.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.35 + (i % 4) * 0.08,
      size: 2 + (i % 3),
      color,
    });
  }
  if (s.particles.length > 180) s.particles.splice(0, s.particles.length - 180);
}

function weaponShots(weapon: Weapon, x: number, y: number, angle: number): Bullet[] {
  const specs =
    weapon === 'spread'
      ? [-0.2, 0, 0.2]
      : weapon === 'comet'
        ? [0]
        : weapon === 'laser'
          ? [-0.025, 0.025]
          : [0];
  const speed = weapon === 'comet' ? 360 : weapon === 'laser' ? 690 : 540;
  const damage = weapon === 'comet' ? 4 : weapon === 'laser' ? 1.5 : 1;
  return specs.map((offset) => ({
    x,
    y,
    vx: Math.cos(angle + offset) * speed,
    vy: Math.sin(angle + offset) * speed,
    enemy: false,
    damage,
    radius: weapon === 'comet' ? 7 : weapon === 'laser' ? 2.5 : 4,
    life: 1.2,
    color: WEAPON_COLOR[weapon],
  }));
}

function enemyShot(x: number, y: number, tx: number, ty: number, speed: number): Bullet {
  const angle = Math.atan2(ty - y, tx - x);
  return {
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    enemy: true,
    damage: 1,
    radius: 5,
    life: 2.7,
    color: '#ff6a7c',
  };
}

function landPlayer(p: Player, platforms: Platform[], oldBottom: number): void {
  if (p.vy < 0) {
    p.onGround = false;
    return;
  }
  const newBottom = p.y + PLAYER_H;
  const landing = platforms
    .filter(
      (platform) =>
        p.x + PLAYER_W > platform.x + 3 &&
        p.x < platform.x + platform.w - 3 &&
        oldBottom <= platform.y + 7 &&
        newBottom >= platform.y,
    )
    .sort((a, b) => a.y - b.y)[0];
  if (landing) {
    p.y = landing.y - PLAYER_H;
    p.vy = 0;
    p.onGround = true;
    p.coyote = COYOTE;
  } else {
    p.onGround = false;
  }
}

function hurtPlayer(s: State, api: GameApi, difficulty: Difficulty): void {
  const p = s.player;
  if (p.invulnerable > 0) return;
  p.health -= 1;
  p.invulnerable = 1.35;
  s.shake = 10;
  burst(s, p.x + PLAYER_W / 2, p.y + PLAYER_H / 2, '#ff7892', 14, 150);
  playSound('wrong');
  if (p.health > 0) {
    p.x = Math.max(12, p.x - p.facing * 38);
    p.y -= 10;
    p.vy = -190;
    p.onGround = false;
    return;
  }
  const stageNumber = s.stage.number;
  const respawn = p.respawnX;
  const replacement = fresh(stageNumber, difficulty);
  replacement.player.x = respawn;
  replacement.player.respawnX = respawn;
  replacement.camX = Math.max(0, respawn - 100);
  replacement.intro = 0;
  replacement.stage.checkpoints.forEach((checkpoint) => {
    checkpoint.active = checkpoint.x <= respawn;
  });
  Object.assign(s, replacement);
  api.died('The rift shield broke — beacon restored');
}

function recoverFromFall(s: State, api: GameApi, difficulty: Difficulty): void {
  const p = s.player;
  p.health -= 1;
  s.shake = 10;
  playSound('wrong');
  if (p.health <= 0) {
    const stageNumber = s.stage.number;
    const respawn = p.respawnX;
    const replacement = fresh(stageNumber, difficulty);
    replacement.player.x = respawn;
    replacement.player.respawnX = respawn;
    replacement.camX = Math.max(0, respawn - 100);
    replacement.intro = 0;
    replacement.stage.checkpoints.forEach((checkpoint) => {
      checkpoint.active = checkpoint.x <= respawn;
    });
    Object.assign(s, replacement);
    api.died('The rift shield broke — beacon restored');
    return;
  }
  p.x = p.respawnX;
  p.y = GROUND_Y - PLAYER_H;
  p.vx = 0;
  p.vy = 0;
  p.onGround = true;
  p.coyote = COYOTE;
  p.jumpBuffer = 0;
  p.invulnerable = 1.5;
  s.camX = Math.max(0, p.respawnX - 100);
  s.bullets = s.bullets.filter((bullet) => !bullet.enemy);
  burst(s, p.x + PLAYER_W / 2, p.y + PLAYER_H / 2, '#79f9dd', 18, 120);
  api.setStatus('Beacon recovery — one shield lost');
}

function updateEnemies(s: State, dt: number, difficulty: Difficulty): void {
  const p = s.player;
  const aggression = difficulty === 'easy' ? 0.78 : difficulty === 'hard' ? 1.28 : 1;
  for (const enemy of s.stage.enemies) {
    if (!enemy.alive) continue;
    enemy.cooldown -= dt;
    enemy.hit = Math.max(0, enemy.hit - dt);
    const dx = p.x - enemy.x;
    if (enemy.type === 'crawler' && Math.abs(dx) < 480) {
      enemy.x += Math.sign(dx) * 36 * aggression * dt;
    } else if (enemy.type === 'brute' && Math.abs(dx) < 560) {
      enemy.x += Math.sign(dx) * 23 * aggression * dt;
    } else if (enemy.type === 'drone') {
      enemy.x = enemy.baseX + Math.sin(s.time * 0.85 + enemy.id) * 34;
      enemy.y = enemy.baseY + Math.sin(s.time * 2.1 + enemy.id * 0.8) * 23;
    }
    const range = Math.hypot(enemy.x - p.x, enemy.y - (p.y + PLAYER_H / 2));
    if (enemy.cooldown <= 0 && range < 470 && enemy.type !== 'crawler') {
      enemy.cooldown = (enemy.type === 'brute' ? 1.55 : enemy.type === 'turret' ? 1.25 : 1.7) / aggression;
      s.bullets.push(
        enemyShot(
          enemy.x,
          enemy.y,
          p.x + PLAYER_W / 2,
          p.y + PLAYER_H * 0.45,
          (enemy.type === 'brute' ? 175 : 205) * aggression,
        ),
      );
    }
  }
}

function updateBoss(s: State, dt: number, difficulty: Difficulty): void {
  const boss = s.stage.boss;
  if (!boss.alive) return;
  boss.hit = Math.max(0, boss.hit - dt);
  boss.phase += dt;
  const p = s.player;
  const distance = boss.x - p.x;
  if (distance > 600) return;
  s.bossWarning = Math.max(s.bossWarning, 1.2);
  const aggression = difficulty === 'easy' ? 0.82 : difficulty === 'hard' ? 1.25 : 1;
  boss.cooldown -= dt;
  boss.y = GROUND_Y - 118 + Math.sin(boss.phase * 1.5) * 16;
  if (boss.cooldown > 0) return;
  const ratio = boss.hp / boss.maxHp;
  boss.cooldown = (ratio > 0.5 ? 1.05 : 0.68) / aggression;
  const base = Math.atan2(p.y + PLAYER_H / 2 - boss.y, p.x - boss.x);
  const spread = ratio > 0.5 ? [-0.14, 0, 0.14] : [-0.28, -0.14, 0, 0.14, 0.28];
  for (const offset of spread) {
    const speed = 205 * aggression;
    s.bullets.push({
      x: boss.x - 35,
      y: boss.y,
      vx: Math.cos(base + offset) * speed,
      vy: Math.sin(base + offset) * speed,
      enemy: true,
      damage: 1,
      radius: ratio > 0.5 ? 5 : 6,
      life: 3,
      color: '#ff52b8',
    });
  }
}

function fireWeapon(s: State): boolean {
  const p = s.player;
  const boss = s.stage.boss;
  const targets: ForwardTarget[] = s.stage.enemies.filter((enemy) => enemy.alive);
  if (boss.alive) targets.push(boss);
  const muzzleX = p.x + (p.facing > 0 ? PLAYER_W + 9 : -9);
  const muzzleY = p.y + 19;
  const target = pickForwardTarget(targets, muzzleX, muzzleY, p.facing, 320);
  if (!target) {
    s.fire = 0.08;
    return false;
  }
  const angle = Math.atan2(target.y - muzzleY, target.x - muzzleX);
  s.bullets.push(...weaponShots(p.weapon, muzzleX, muzzleY, angle));
  s.fire = FIRE_RATE[p.weapon];
  if (p.weapon === 'comet') playSound('brick');
  return true;
}

function updateBullets(s: State, dt: number, api: GameApi): void {
  for (const bullet of s.bullets) {
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;
    if (bullet.enemy) {
      continue;
    }
    const enemy = s.stage.enemies.find(
      (candidate) =>
        candidate.alive &&
        Math.abs(candidate.x - bullet.x) < (candidate.type === 'brute' ? 25 : 18) + bullet.radius &&
        Math.abs(candidate.y - bullet.y) < (candidate.type === 'drone' ? 17 : 25) + bullet.radius,
    );
    if (enemy) {
      enemy.hp -= bullet.damage;
      enemy.hit = 0.1;
      bullet.life = -1;
      burst(s, bullet.x, bullet.y, bullet.color, 5, 70);
      if (enemy.hp <= 0) {
        enemy.alive = false;
        s.kills += 1;
        api.addScore(enemy.type === 'brute' ? 80 : enemy.type === 'turret' ? 55 : 35);
        burst(s, enemy.x, enemy.y, '#ffb34e', enemy.type === 'brute' ? 20 : 12, 150);
        playSound('stomp');
      }
      continue;
    }
    const boss = s.stage.boss;
    if (
      boss.alive &&
      Math.abs(boss.x - bullet.x) < 70 + bullet.radius &&
      Math.abs(boss.y - bullet.y) < 86 + bullet.radius
    ) {
      boss.hp -= bullet.damage;
      boss.hit = 0.1;
      bullet.life = -1;
      burst(s, bullet.x, bullet.y, bullet.color, 5, 75);
      api.addScore(2);
      if (boss.hp <= 0) {
        boss.alive = false;
        api.addScore(650);
        s.shake = 18;
        burst(s, boss.x, boss.y, '#ffd76b', 42, 230);
        playSound('levelClear');
      }
    }
  }
  s.bullets = s.bullets.filter(
    (bullet) =>
      bullet.life > 0 &&
      bullet.x > s.camX - 120 &&
      bullet.x < s.camX + 900 &&
      bullet.y > -80 &&
      bullet.y < VIEW_H + 100,
  );
}

function update(
  s: State,
  dt: number,
  input: GameCanvasProps['input'],
  api: GameApi,
  difficulty: Difficulty,
): State | null {
  const p = s.player;
  s.time += dt;
  const move = (input.held.right ? 1 : 0) - (input.held.left ? 1 : 0);
  const jumpPressed = input.consumeJump();
  if (move !== 0 || jumpPressed) s.started = true;
  if (!s.started) {
    s.fire = 0.08;
    return null;
  }
  s.intro = Math.max(0, s.intro - dt);
  s.bossWarning = Math.max(0, s.bossWarning - dt);
  s.shake = Math.max(0, s.shake - 35 * dt);
  p.invulnerable = Math.max(0, p.invulnerable - dt);
  p.coyote = Math.max(0, p.coyote - dt);
  p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
  p.weaponTime = Math.max(0, p.weaponTime - dt);
  if (p.weaponTime <= 0) p.weapon = 'pulse';

  p.vx = move * RUN_SPEED;
  if (move !== 0) p.facing = move > 0 ? 1 : -1;
  if (jumpPressed) p.jumpBuffer = JUMP_BUFFER;
  if (p.jumpBuffer > 0 && p.coyote > 0) {
    p.vy = -JUMP_SPEED;
    p.onGround = false;
    p.coyote = 0;
    p.jumpBuffer = 0;
    playSound('jump');
    burst(s, p.x + PLAYER_W / 2, p.y + PLAYER_H, '#79f9dd', 6, 55);
  }
  if (!input.jumpHeld && p.vy < -120) p.vy *= Math.pow(0.02, dt);
  p.x = Math.max(12, Math.min(s.stage.worldW - 95, p.x + p.vx * dt));
  const oldBottom = p.y + PLAYER_H;
  p.vy = Math.min(MAX_FALL, p.vy + GRAVITY * dt);
  p.y += p.vy * dt;
  landPlayer(p, s.stage.platforms, oldBottom);
  if (p.onGround) p.coyote = COYOTE;

  for (const checkpoint of s.stage.checkpoints) {
    if (!checkpoint.active && p.x >= checkpoint.x) {
      checkpoint.active = true;
      p.respawnX = checkpoint.x + 20;
      const maxHealth = difficulty === 'easy' ? 5 : difficulty === 'hard' ? 3 : 4;
      p.health = Math.min(maxHealth, p.health + 1);
      api.addScore(100);
      api.setStatus('Rescue beacon online!');
      playSound('powerup');
      burst(s, checkpoint.x, GROUND_Y - 40, '#ffd76b', 24, 180);
    }
  }
  for (const pickup of s.stage.pickups) {
    if (
      !pickup.taken &&
      overlap(p.x, p.y, PLAYER_W, PLAYER_H, pickup.x - 18, pickup.y - 18, 36, 36)
    ) {
      pickup.taken = true;
      p.weapon = pickup.weapon;
      p.weaponTime = 18;
      api.addScore(75);
      api.setStatus(`${pickup.weapon.toUpperCase()} weapon online!`);
      playSound('powerup');
      burst(s, pickup.x, pickup.y, WEAPON_COLOR[pickup.weapon], 22, 170);
    }
  }

  if (s.intro <= 0) {
    updateEnemies(s, dt, difficulty);
    updateBoss(s, dt, difficulty);
    s.fire -= dt;
    if (s.fire <= 0) fireWeapon(s);
    for (const bullet of s.bullets) {
      if (
        bullet.enemy &&
        bullet.life > 0 &&
        p.invulnerable <= 0 &&
        overlap(
          bullet.x - bullet.radius,
          bullet.y - bullet.radius,
          bullet.radius * 2,
          bullet.radius * 2,
          p.x + 4,
          p.y + 4,
          PLAYER_W - 8,
          PLAYER_H - 6,
        )
      ) {
        bullet.life = -1;
        hurtPlayer(s, api, difficulty);
        break;
      }
    }
    updateBullets(s, dt, api);
    const touchingEnemy = s.stage.enemies.some(
      (enemy) =>
        enemy.alive &&
        overlap(p.x + 4, p.y + 4, PLAYER_W - 8, PLAYER_H - 5, enemy.x - 18, enemy.y - 23, 36, 46),
    );
    if (touchingEnemy) hurtPlayer(s, api, difficulty);
  }
  if (p.y > VIEW_H + 60) recoverFromFall(s, api, difficulty);

  for (const particle of s.particles) {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += 140 * dt;
    particle.life -= dt;
  }
  s.particles = s.particles.filter((particle) => particle.life > 0);
  const targetCam = Math.max(0, Math.min(s.stage.worldW - 360, p.x - 92));
  s.camX += (targetCam - s.camX) * (1 - Math.exp(-7 * dt));

  if (!s.stage.boss.alive && p.x > s.stage.boss.x - 120) {
    const nextStage = fresh(s.stage.number + 1, difficulty);
    api.requestGate(`${s.stage.name} secured`);
    return nextStage;
  }
  return null;
}

export default function RiftRaiders({
  paused,
  input,
  api,
  restartToken,
  difficulty,
  character,
  controlsInset,
}: GameCanvasProps) {
  const stateRef = useRef<State>(fresh(1, difficulty));
  const characterRef = useRef<Character>(character);
  const backgroundRef = useRef<HTMLImageElement | null>(null);
  const reducedMotionRef = useRef(false);
  useEffect(() => {
    characterRef.current = character;
  }, [character]);
  useEffect(() => {
    const image = new Image();
    image.src = '/assets/rift-raiders/bioforge-background.webp';
    image.onload = () => {
      backgroundRef.current = image;
    };
    return () => {
      image.onload = null;
      backgroundRef.current = null;
    };
  }, []);
  useEffect(() => {
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => {
      reducedMotionRef.current = motionPreference.matches;
    };
    updatePreference();
    motionPreference.addEventListener('change', updatePreference);
    return () => motionPreference.removeEventListener('change', updatePreference);
  }, []);
  useEffect(() => {
    stateRef.current = fresh(1, difficulty);
  }, [restartToken, difficulty]);

  const { canvasRef } = useCanvasGame({
    active: !paused,
    step: (ctx, dt, cw, ch) => {
      const s = stateRef.current;
      const replacement = update(s, dt, input, api, difficulty);
      if (replacement) stateRef.current = replacement;
      draw(
        ctx,
        stateRef.current,
        cw,
        ch,
        controlsInset,
        characterRef.current,
        backgroundRef.current,
        reducedMotionRef.current,
      );
    },
  });
  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />;
}

type Palette = { sky: string; deep: string; cyan: string; leaf: string; danger: string };
const PALETTES: Palette[] = [
  { sky: '#07162d', deep: '#020712', cyan: '#27f0d0', leaf: '#0d6381', danger: '#ff667f' },
  { sky: '#14123c', deep: '#050515', cyan: '#64d9ff', leaf: '#2657a4', danger: '#ff7d55' },
  { sky: '#1a0c2d', deep: '#06020f', cyan: '#35ffc7', leaf: '#265f59', danger: '#ff4fc3' },
  { sky: '#061f2d', deep: '#02090f', cyan: '#72f5ff', leaf: '#166c6b', danger: '#ffce5a' },
];

function drawBackground(
  ctx: CanvasRenderingContext2D,
  s: State,
  viewW: number,
  palette: Palette,
  background: HTMLImageElement | null,
  reducedMotion: boolean,
): void {
  if (background?.complete && background.naturalWidth > 0) {
    const sourceW = Math.min(background.naturalWidth, background.naturalHeight * (viewW / VIEW_H));
    const maxSourceX = Math.max(0, background.naturalWidth - sourceW);
    const sourceX = maxSourceX > 0 ? (s.camX * 0.035) % maxSourceX : 0;
    ctx.drawImage(
      background,
      sourceX,
      0,
      sourceW,
      background.naturalHeight,
      0,
      0,
      viewW,
      VIEW_H,
    );
    ctx.fillStyle = 'rgba(2,8,20,.22)';
    ctx.fillRect(0, 0, viewW, VIEW_H);
  } else {
    const sky = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    sky.addColorStop(0, palette.sky);
    sky.addColorStop(0.72, '#09273b');
    sky.addColorStop(1, palette.deep);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, viewW, VIEW_H);
  }

  ctx.fillStyle = 'rgba(145,218,255,0.12)';
  ctx.beginPath();
  ctx.arc(viewW * 0.78, 92, 62, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(190,235,255,0.2)';
  ctx.beginPath();
  ctx.arc(viewW * 0.78, 92, 42, 0, Math.PI * 2);
  ctx.fill();

  const farOffset = -((s.camX * 0.12) % 150);
  ctx.fillStyle = '#061c30';
  for (let i = -1; i < Math.ceil(viewW / 150) + 2; i += 1) {
    const x = farOffset + i * 150;
    ctx.beginPath();
    ctx.moveTo(x - 40, 390);
    ctx.quadraticCurveTo(x + 15, 190 - (i % 3) * 28, x + 65, 390);
    ctx.quadraticCurveTo(x + 95, 245, x + 140, 390);
    ctx.closePath();
    ctx.fill();
  }
  const nearOffset = -((s.camX * 0.28) % 118);
  ctx.fillStyle = palette.leaf;
  ctx.globalAlpha = 0.45;
  for (let i = -1; i < Math.ceil(viewW / 118) + 2; i += 1) {
    const x = nearOffset + i * 118;
    ctx.fillRect(x + 50, 165 + (i % 2) * 45, 11, 275);
    for (let j = 0; j < 5; j += 1) {
      ctx.beginPath();
      ctx.ellipse(x + 48 + (j % 2 ? 20 : -16), 210 + j * 42, 28, 9, (j % 2 ? -1 : 1) * 0.65, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  for (let i = 0; i < 34; i += 1) {
    const x = ((i * 97 - s.camX * (0.18 + (i % 3) * 0.05)) % (viewW + 60)) - 30;
    const y = 90 + ((i * 53) % 340);
    const pulse = reducedMotion ? 0.42 : 0.28 + (Math.sin(s.time * 2 + i) + 1) * 0.22;
    ctx.fillStyle = `rgba(71,255,224,${pulse})`;
    ctx.beginPath();
    ctx.arc(x, y, i % 6 === 0 ? 2.2 : 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPlatform(ctx: CanvasRenderingContext2D, platform: Platform, camX: number, palette: Palette): void {
  const x = platform.x - camX;
  const top = platform.y;
  ctx.fillStyle = platform.kind === 'ground' ? '#101c2b' : '#142638';
  ctx.fillRect(x, top, platform.w, platform.h);
  ctx.fillStyle = palette.cyan;
  ctx.globalAlpha = platform.kind === 'ground' ? 0.65 : 0.85;
  ctx.fillRect(x, top, platform.w, 4);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#255b4f';
  for (let i = 4; i < platform.w; i += 23) {
    ctx.beginPath();
    ctx.moveTo(x + i, top + 2);
    ctx.lineTo(x + i + 7, top - 7 - (i % 4));
    ctx.lineTo(x + i + 12, top + 2);
    ctx.fill();
  }
  if (platform.kind === 'ground') {
    ctx.strokeStyle = 'rgba(64,211,185,0.18)';
    ctx.lineWidth = 2;
    for (let i = 22; i < platform.w; i += 54) {
      ctx.beginPath();
      ctx.moveTo(x + i, top + 5);
      ctx.bezierCurveTo(x + i - 8, top + 30, x + i + 16, top + 38, x + i + 5, top + 76);
      ctx.stroke();
    }
  }
}

function drawEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy, camX: number, palette: Palette, time: number): void {
  const x = enemy.x - camX;
  const y = enemy.y;
  ctx.save();
  ctx.translate(x, y);
  if (enemy.hit > 0) ctx.globalCompositeOperation = 'lighter';
  ctx.shadowColor = palette.danger;
  ctx.shadowBlur = 10;
  if (enemy.type === 'crawler') {
    ctx.fillStyle = '#283447';
    ctx.beginPath();
    ctx.ellipse(0, 0, 17, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = palette.danger;
    ctx.beginPath();
    ctx.arc(8, -2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#75869b';
    ctx.lineWidth = 3;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 5, 6);
      ctx.lineTo(side * 16, 16 + Math.sin(time * 8 + enemy.id) * 2);
      ctx.stroke();
    }
  } else if (enemy.type === 'drone') {
    ctx.rotate(Math.sin(time * 2 + enemy.id) * 0.08);
    ctx.fillStyle = '#293a55';
    ctx.beginPath();
    ctx.moveTo(-22, 0);
    ctx.lineTo(-8, -12);
    ctx.lineTo(16, -8);
    ctx.lineTo(22, 0);
    ctx.lineTo(12, 9);
    ctx.lineTo(-10, 11);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = palette.danger;
    ctx.beginPath();
    ctx.arc(4, 0, 6, 0, Math.PI * 2);
    ctx.fill();
  } else if (enemy.type === 'turret') {
    ctx.fillStyle = '#344257';
    ctx.fillRect(-16, -13, 32, 27);
    ctx.fillStyle = '#1b2638';
    ctx.fillRect(-22, 10, 44, 8);
    ctx.fillStyle = palette.danger;
    ctx.fillRect(-23, -6, 24, 8);
    ctx.beginPath();
    ctx.arc(4, -2, 6, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = '#3c334c';
    ctx.beginPath();
    ctx.roundRect(-23, -24, 46, 48, 11);
    ctx.fill();
    ctx.fillStyle = '#6d7896';
    ctx.fillRect(-17, -17, 34, 8);
    ctx.fillStyle = palette.danger;
    ctx.fillRect(-12, -15, 8, 4);
    ctx.fillRect(5, -15, 8, 4);
    ctx.fillStyle = '#1a202e';
    ctx.fillRect(-29, -9, 10, 28);
    ctx.fillRect(19, -9, 10, 28);
  }
  ctx.shadowBlur = 0;
  if (enemy.hp < enemy.maxHp) {
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(-18, -33, 36, 4);
    ctx.fillStyle = palette.danger;
    ctx.fillRect(-18, -33, 36 * Math.max(0, enemy.hp / enemy.maxHp), 4);
  }
  ctx.restore();
}

function drawBoss(
  ctx: CanvasRenderingContext2D,
  boss: Boss,
  camX: number,
  palette: Palette,
  time: number,
  reducedMotion: boolean,
): void {
  if (!boss.alive) return;
  const x = boss.x - camX;
  ctx.save();
  ctx.translate(x, boss.y);
  ctx.rotate(reducedMotion ? 0 : Math.sin(time * 0.8) * 0.035);
  ctx.shadowColor = boss.hit > 0 ? '#fff6c4' : palette.danger;
  ctx.shadowBlur = boss.hit > 0 ? 25 : 12;
  ctx.fillStyle = '#20283c';
  ctx.beginPath();
  ctx.arc(0, 0, 62, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2 + (reducedMotion ? 0 : time * 0.18);
    ctx.save();
    ctx.rotate(angle);
    ctx.fillStyle = i % 2 ? '#45385d' : '#30425d';
    ctx.beginPath();
    ctx.moveTo(20, -11);
    ctx.lineTo(84, -23);
    ctx.lineTo(70, 0);
    ctx.lineTo(84, 23);
    ctx.lineTo(20, 11);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#0b101c';
  ctx.beginPath();
  ctx.arc(0, 0, 36, 0, Math.PI * 2);
  ctx.fill();
  const core = ctx.createRadialGradient(-7, -7, 2, 0, 0, 27);
  core.addColorStop(0, '#fff5c7');
  core.addColorStop(0.32, palette.danger);
  core.addColorStop(1, '#5a1455');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, reducedMotion ? 27 : 27 + Math.sin(time * 4) * 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPickup(
  ctx: CanvasRenderingContext2D,
  pickup: Pickup,
  camX: number,
  time: number,
  reducedMotion: boolean,
): void {
  if (pickup.taken) return;
  const x = pickup.x - camX;
  const y = pickup.y + (reducedMotion ? 0 : Math.sin(time * 2.5 + pickup.phase) * 6);
  const color = WEAPON_COLOR[pickup.weapon];
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = color;
  ctx.shadowBlur = 16;
  ctx.fillStyle = 'rgba(8,14,28,.85)';
  ctx.beginPath();
  ctx.roundRect(-17, -22, 34, 44, 12);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = '900 16px ui-rounded, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(pickup.weapon === 'spread' ? 'S' : pickup.weapon === 'laser' ? 'L' : 'C', 0, 0);
  ctx.restore();
}

function drawCheckpoint(
  ctx: CanvasRenderingContext2D,
  checkpoint: Checkpoint,
  camX: number,
  palette: Palette,
  time: number,
  reducedMotion: boolean,
): void {
  const x = checkpoint.x - camX;
  const color = checkpoint.active ? '#ffd76b' : '#52657c';
  ctx.fillStyle = '#1a2636';
  ctx.fillRect(x - 11, GROUND_Y - 52, 22, 52);
  ctx.fillStyle = color;
  ctx.fillRect(x - 15, GROUND_Y - 56, 30, 8);
  if (checkpoint.active) {
    const beam = ctx.createLinearGradient(0, GROUND_Y - 210, 0, GROUND_Y - 42);
    beam.addColorStop(0, 'rgba(255,215,107,0)');
    beam.addColorStop(1, 'rgba(255,215,107,.35)');
    ctx.fillStyle = beam;
    ctx.fillRect(x - 12, GROUND_Y - 210, 24, 156);
    ctx.strokeStyle = palette.cyan;
    ctx.globalAlpha = reducedMotion ? 0.6 : 0.5 + Math.sin(time * 4) * 0.2;
    ctx.beginPath();
    ctx.arc(x, GROUND_Y - 52, 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  s: State,
  camX: number,
  character: Character,
  reducedMotion: boolean,
): void {
  const p = s.player;
  const x = p.x - camX;
  const running = Math.abs(p.vx) > 1 && p.onGround;
  ctx.save();
  if (p.invulnerable > 0) {
    ctx.globalAlpha = reducedMotion ? 0.68 : Math.floor(s.time * 14) % 2 === 0 ? 0.32 : 1;
  }
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath();
  ctx.ellipse(x + PLAYER_W / 2, p.y + PLAYER_H + 3, 14, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  drawCharacterSprite(ctx, character, x - 8, p.y - 12, 46, 62, {
    frame: running ? Math.floor(s.time * 10) % 2 : 0,
    facing: p.facing,
    airborne: !p.onGround,
    squash: p.onGround ? 1 : 1.05,
  });
  ctx.save();
  ctx.translate(x + PLAYER_W / 2, p.y + 19);
  ctx.scale(p.facing, 1);
  ctx.fillStyle = '#263a52';
  ctx.beginPath();
  ctx.roundRect(3, -4, 26, 8, 3);
  ctx.fill();
  ctx.fillStyle = WEAPON_COLOR[p.weapon];
  ctx.fillRect(24, -2, 11, 4);
  ctx.restore();
  if (p.invulnerable > 0) {
    ctx.strokeStyle = 'rgba(108,245,255,.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x + PLAYER_W / 2, p.y + PLAYER_H / 2, 23, 30, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawHud(ctx: CanvasRenderingContext2D, s: State, viewW: number, palette: Palette): void {
  const p = s.player;
  ctx.fillStyle = 'rgba(2,7,18,.82)';
  ctx.beginPath();
  ctx.roundRect(12, 12, viewW - 24, 46, 13);
  ctx.fill();
  ctx.font = '900 13px ui-rounded, system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = palette.cyan;
  ctx.textAlign = 'left';
  ctx.fillText(`STAGE ${s.stage.number}`, 25, 29);
  ctx.font = '800 10px ui-rounded, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(220,250,255,.7)';
  ctx.fillText(s.stage.name.toUpperCase(), 25, 45);
  ctx.textAlign = 'center';
  ctx.font = '900 11px ui-rounded, system-ui, sans-serif';
  ctx.fillStyle = WEAPON_COLOR[p.weapon];
  const timer = p.weapon === 'pulse' ? '' : ` ${Math.ceil(p.weaponTime)}s`;
  ctx.fillText(`${p.weapon.toUpperCase()}${timer}`, viewW / 2, 35);
  ctx.textAlign = 'right';
  ctx.font = '900 16px ui-rounded, system-ui, sans-serif';
  ctx.fillStyle = '#ff7892';
  ctx.fillText('♥'.repeat(Math.max(0, p.health)), viewW - 25, 35);

  const boss = s.stage.boss;
  if (boss.alive && boss.x - p.x < 610) {
    const width = viewW - 72;
    ctx.fillStyle = 'rgba(3,6,15,.8)';
    ctx.fillRect(36, 73, width, 10);
    ctx.fillStyle = palette.danger;
    ctx.fillRect(36, 73, width * Math.max(0, boss.hp / boss.maxHp), 10);
    ctx.strokeStyle = 'rgba(255,255,255,.25)';
    ctx.strokeRect(36, 73, width, 10);
    ctx.font = '900 9px ui-rounded, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.fillText('SIEGE CORE', viewW / 2, 96);
  }
}

function draw(
  ctx: CanvasRenderingContext2D,
  s: State,
  cw: number,
  ch: number,
  controlsInset: number,
  character: Character,
  background: HTMLImageElement | null,
  reducedMotion: boolean,
): void {
  const playH = Math.max(320, ch - controlsInset);
  const scale = Math.min(cw / BASE_VIEW_W, playH / VIEW_H);
  const viewW = cw / scale;
  const offsetX = (cw - viewW * scale) / 2;
  const offsetY = Math.max(0, (playH - VIEW_H * scale) / 2);
  const palette = PALETTES[(s.stage.number - 1) % PALETTES.length];
  ctx.fillStyle = '#02050d';
  ctx.fillRect(0, 0, cw, ch);
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  const shakeX = !reducedMotion && s.shake > 0 ? Math.sin(s.time * 47) * s.shake : 0;
  const shakeY = !reducedMotion && s.shake > 0 ? Math.cos(s.time * 41) * s.shake * 0.45 : 0;
  ctx.translate(shakeX, shakeY);
  drawBackground(ctx, s, viewW, palette, background, reducedMotion);
  for (const platform of s.stage.platforms) drawPlatform(ctx, platform, s.camX, palette);
  for (const checkpoint of s.stage.checkpoints) {
    drawCheckpoint(ctx, checkpoint, s.camX, palette, s.time, reducedMotion);
  }
  for (const pickup of s.stage.pickups) {
    drawPickup(ctx, pickup, s.camX, s.time, reducedMotion);
  }
  for (const enemy of s.stage.enemies) if (enemy.alive) drawEnemy(ctx, enemy, s.camX, palette, s.time);
  drawBoss(ctx, s.stage.boss, s.camX, palette, s.time, reducedMotion);

  for (const bullet of s.bullets) {
    ctx.save();
    ctx.strokeStyle = bullet.color;
    ctx.fillStyle = bullet.color;
    ctx.shadowColor = bullet.color;
    ctx.shadowBlur = bullet.enemy ? 8 : 12;
    ctx.lineWidth = bullet.radius * 1.2;
    ctx.beginPath();
    ctx.moveTo(bullet.x - s.camX, bullet.y);
    ctx.lineTo(
      bullet.x - s.camX - bullet.vx * 0.025,
      bullet.y - bullet.vy * 0.025,
    );
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(bullet.x - s.camX, bullet.y, bullet.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  if (!reducedMotion) {
    for (const particle of s.particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, particle.life * 2.2));
      ctx.fillStyle = particle.color;
      ctx.fillRect(
        particle.x - s.camX - particle.size / 2,
        particle.y - particle.size / 2,
        particle.size,
        particle.size,
      );
    }
  }
  ctx.globalAlpha = 1;
  drawPlayer(ctx, s, s.camX, character, reducedMotion);

  const targets: ForwardTarget[] = s.stage.enemies.filter((enemy) => enemy.alive);
  if (s.stage.boss.alive) targets.push(s.stage.boss);
  const target = pickForwardTarget(
    targets,
    s.player.x + PLAYER_W / 2,
    s.player.y + 19,
    s.player.facing,
    320,
  );
  if (target) {
    const tx = target.x - s.camX;
    const ty = target.y;
    ctx.strokeStyle = 'rgba(118,247,255,.65)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(tx, ty, reducedMotion ? 13 : 13 + Math.sin(s.time * 5) * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tx - 19, ty);
    ctx.lineTo(tx - 8, ty);
    ctx.moveTo(tx + 8, ty);
    ctx.lineTo(tx + 19, ty);
    ctx.stroke();
  }
  drawHud(ctx, s, viewW, palette);

  if (s.intro > 0) {
    const alpha =
      reducedMotion || !s.started ? 1 : Math.min(1, s.intro / 0.5, (2.8 - s.intro) / 0.35);
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.fillStyle = 'rgba(2,7,18,.86)';
    ctx.fillRect(0, VIEW_H * 0.31, viewW, 106);
    ctx.textAlign = 'center';
    ctx.fillStyle = palette.cyan;
    ctx.font = '950 28px ui-rounded, system-ui, sans-serif';
    ctx.fillText('RIFT RAIDERS', viewW / 2, VIEW_H * 0.31 + 39);
    ctx.fillStyle = '#fff';
    ctx.font = '900 13px ui-rounded, system-ui, sans-serif';
    ctx.fillText(s.stage.name.toUpperCase(), viewW / 2, VIEW_H * 0.31 + 66);
    ctx.fillStyle = 'rgba(220,250,255,.7)';
    ctx.font = '800 10px ui-rounded, system-ui, sans-serif';
    ctx.fillText('AUTO-FIRE ONLINE · MOVE AND JUMP', viewW / 2, VIEW_H * 0.31 + 88);
    ctx.globalAlpha = 1;
  }
  if (s.bossWarning > 0) {
    ctx.globalAlpha = reducedMotion ? 0.5 : Math.min(1, s.bossWarning * 2);
    ctx.fillStyle = 'rgba(255,70,150,.14)';
    ctx.fillRect(0, 0, viewW, VIEW_H);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}
