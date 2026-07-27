/**
 * Kingdom Quest's world data and physics, deliberately free of React/canvas.
 * The component and the focused checker both call these functions so the game
 * cannot quietly drift away from what we test.
 */

export const WORLD_H = 384;
export const GROUND_Y = 320;
export const HERO_W = 22;
export const HERO_H = 30;
export const GRAVITY = 1280;
export const RUN_ACCEL = 1180;
export const RUN_DECEL = 1500;
export const RUN_MAX = 205;
export const JUMP_SPEED = 500;
/** A quick touch tap still needs to clear every authored ground gap. */
export const TAP_JUMP_SPEED = 320;
export const COYOTE = 0.11;
export const JUMP_BUFFER = 0.12;
export const QUEST_VIEW_H = WORLD_H;
export const MIN_QUEST_VIEW_W = 260;
export const MAX_QUEST_VIEW_W = 720;

export type Biome = 'meadow' | 'cavern' | 'citadel';
export type Rect = { x: number; y: number; w: number; h: number };
export type EnemyKind = 'mossling' | 'emberbat' | 'sentinel';
export type Enemy = Rect & { kind: EnemyKind; left: number; right: number; vx: number; hp: number; alive: boolean };
export type Portal = Rect & { toX: number; toY: number; label: string };
export type Power = Rect & { kind: 'bloom' | 'star'; used: boolean };
export type Checkpoint = Rect & { hit: boolean };
export type Goal = Rect & { locked: boolean };

export type QuestLevel = {
  id: string;
  name: string;
  biome: Biome;
  width: number;
  platforms: Rect[];
  coins: Rect[];
  runes: Rect[];
  enemies: Enemy[];
  portals: Portal[];
  powers: Power[];
  checkpoints: Checkpoint[];
  goal: Goal;
  boss?: Enemy;
  tip: string;
};

export type Hero = Rect & {
  vx: number;
  vy: number;
  grounded: boolean;
  coyote: number;
  jumpBuffer: number;
  facing: -1 | 1;
  armour: boolean;
  star: number;
  hurt: number;
};

export type StepInput = { left: boolean; right: boolean; jumpPressed: boolean; jumpHeld: boolean };
export type StepResult = { landed: boolean; headHit: boolean };

/** Fill any phone/iPad stage without reserving a second, phantom controls band. */
export function questViewport(canvasW: number, canvasH: number): { w: number; h: number; scale: number } {
  const safeW = Math.max(1, canvasW);
  const safeH = Math.max(1, canvasH);
  const naturalW = QUEST_VIEW_H * (safeW / safeH);
  const w = Math.max(MIN_QUEST_VIEW_W, Math.min(MAX_QUEST_VIEW_W, naturalW));
  return { w, h: QUEST_VIEW_H, scale: Math.min(safeW / w, safeH / QUEST_VIEW_H) };
}

export function cameraTarget(heroX: number, viewportW: number, worldW: number): number {
  const lead = viewportW * 0.39;
  return Math.max(0, Math.min(Math.max(0, worldW - viewportW), heroX - lead));
}

/** Frame-rate-independent camera easing avoids the stop/start snap seen on iPad. */
export function dampCamera(current: number, target: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-Math.max(0, dt) * 7.5));
}

/** Keep simulation slices small enough that a slow frame cannot tunnel through a platform. */
export function simulationSteps(dt: number): number[] {
  const safe = Math.max(0, Math.min(dt, 1 / 20));
  const count = Math.max(1, Math.ceil(safe / (1 / 120)));
  return Array(count).fill(safe / count);
}

export function questPace(levelIndex: number, difficultyScale: number): number {
  return difficultyScale * (1 + Math.max(0, Math.min(5, levelIndex)) * 0.055);
}

export function portalTouches(hero: Rect, portal: Portal): boolean {
  return overlaps(hero, { x: portal.x - 8, y: portal.y - 7, w: portal.w + 16, h: portal.h + 14 });
}

/** Spawn beyond the destination ring so standing still cannot bounce straight back. */
export function portalExitX(portal: Portal, facing: -1 | 1, worldW: number): number {
  const x = portal.toX + (facing > 0 ? portal.w + 14 : -HERO_W - 14);
  return Math.max(0, Math.min(worldW - HERO_W, x));
}

const ground = (width: number, gaps: Array<[number, number]> = []): Rect[] => {
  const pieces: Rect[] = [];
  let at = 0;
  for (const [start, end] of gaps) {
    if (start > at) pieces.push({ x: at, y: GROUND_Y, w: start - at, h: WORLD_H - GROUND_Y });
    at = end;
  }
  if (at < width) pieces.push({ x: at, y: GROUND_Y, w: width - at, h: WORLD_H - GROUND_Y });
  return pieces;
};

const p = (x: number, y: number, w = 96, h = 18): Rect => ({ x, y, w, h });
const coin = (x: number, y: number): Rect => ({ x, y, w: 13, h: 13 });
const rune = (x: number, y: number): Rect => ({ x, y, w: 16, h: 20 });
const foe = (kind: EnemyKind, x: number, y: number, left: number, right: number, hp = 1): Enemy => ({ x, y, w: kind === 'sentinel' ? 42 : 26, h: kind === 'sentinel' ? 42 : 24, kind, left, right, vx: kind === 'sentinel' ? 58 : kind === 'emberbat' ? 66 : 46, hp, alive: true });

/** Six compact but genuinely hand-laid-out stages, not procedural variants. */
export const LEVELS: QuestLevel[] = [
  {
    id: 'verdant-crossing', name: 'Verdant Crossing', biome: 'meadow', width: 2060,
    platforms: [...ground(2060, [[620, 704], [1250, 1334]]), p(240, 260, 105), p(405, 212, 94), p(700, 270, 90), p(845, 222, 120), p(1045, 250, 82), p(1338, 270, 110), p(1510, 216, 104), p(1700, 255, 118)],
    coins: [coin(160, 274), coin(265, 228), coin(300, 228), coin(438, 180), coin(472, 180), coin(546, 274), coin(725, 238), coin(876, 190), coin(912, 190), coin(955, 274), coin(1075, 218), coin(1190, 274), coin(1368, 238), coin(1540, 184), coin(1580, 184), coin(1730, 223), coin(1850, 274)],
    runes: [rune(446, 176), rune(1549, 180)],
    enemies: [foe('mossling', 510, 296, 500, 590), foe('mossling', 980, 296, 900, 1180), foe('mossling', 1465, 296, 1390, 1498), foe('emberbat', 1770, 178, 1680, 1880)],
    portals: [{ x: 550, y: 278, w: 30, h: 42, toX: 1570, toY: 180, label: 'Root Gate' }, { x: 1570, y: 174, w: 30, h: 42, toX: 585, toY: 278, label: 'Canopy Gate' }],
    powers: [{ x: 1080, y: 222, w: 20, h: 24, kind: 'bloom', used: false }], checkpoints: [{ x: 1160, y: 264, w: 18, h: 56, hit: false }],
    goal: { x: 1970, y: 238, w: 34, h: 82, locked: false }, tip: 'Find the Root Gate for a sky-high rune cache.',
  },
  {
    id: 'cinder-hollows', name: 'Cinder Hollows', biome: 'cavern', width: 2190,
    platforms: [...ground(2190, [[470, 560], [1020, 1110], [1590, 1688]]), p(160, 252, 98), p(330, 202, 90), p(565, 262, 105), p(740, 216, 92), p(890, 166, 106), p(1114, 264, 118), p(1320, 212, 104), p(1462, 160, 90), p(1690, 265, 115), p(1880, 215, 132)],
    coins: [coin(176, 220), coin(210, 220), coin(350, 170), coin(390, 170), coin(420, 274), coin(590, 230), coin(630, 230), coin(762, 184), coin(805, 184), coin(912, 134), coin(950, 134), coin(1140, 232), coin(1200, 232), coin(1350, 180), coin(1490, 128), coin(1522, 128), coin(1715, 233), coin(1755, 233), coin(1910, 183), coin(1960, 183)],
    runes: [rune(916, 128), rune(1496, 122)],
    enemies: [foe('emberbat', 355, 142, 300, 430), foe('mossling', 680, 296, 590, 760), foe('emberbat', 1180, 188, 1120, 1280), foe('mossling', 1400, 296, 1300, 1510), foe('emberbat', 1900, 170, 1850, 2050)],
    portals: [{ x: 935, y: 124, w: 30, h: 42, toX: 1502, toY: 116, label: 'Ash Gate' }, { x: 1502, y: 118, w: 30, h: 42, toX: 970, toY: 124, label: 'Ember Gate' }],
    powers: [{ x: 1168, y: 234, w: 20, h: 24, kind: 'star', used: false }], checkpoints: [{ x: 1285, y: 264, w: 18, h: 56, hit: false }],
    goal: { x: 2090, y: 238, w: 34, h: 82, locked: false }, tip: 'A comet star can melt through the crowded final tunnel.',
  },
  {
    id: 'aurora-spire', name: 'Aurora Spire', biome: 'citadel', width: 2360,
    platforms: [...ground(2360, [[530, 620], [1160, 1250]]), p(195, 254, 108), p(370, 204, 92), p(630, 258, 100), p(805, 208, 110), p(990, 158, 100), p(1255, 264, 112), p(1435, 212, 104), p(1600, 160, 106), p(1790, 224, 122), p(2010, 250, 150)],
    coins: [coin(215, 222), coin(258, 222), coin(392, 172), coin(430, 172), coin(470, 274), coin(650, 226), coin(695, 226), coin(830, 176), coin(875, 176), coin(1014, 126), coin(1054, 126), coin(1280, 232), coin(1330, 232), coin(1460, 180), coin(1500, 180), coin(1628, 128), coin(1670, 128), coin(1820, 192), coin(1880, 192)],
    runes: [rune(1019, 120), rune(1635, 122), rune(1832, 186)],
    enemies: [foe('emberbat', 390, 145, 350, 475), foe('mossling', 760, 296, 650, 860), foe('emberbat', 1020, 120, 970, 1100), foe('mossling', 1380, 296, 1260, 1490), foe('emberbat', 1650, 124, 1580, 1740)],
    portals: [{ x: 1036, y: 116, w: 30, h: 42, toX: 1642, toY: 116, label: 'Star Gate' }, { x: 1642, y: 116, w: 30, h: 42, toX: 1070, toY: 116, label: 'Crown Gate' }],
    powers: [{ x: 1300, y: 234, w: 20, h: 24, kind: 'bloom', used: false }], checkpoints: [{ x: 1750, y: 264, w: 18, h: 56, hit: false }],
    goal: { x: 2290, y: 238, w: 34, h: 82, locked: false }, tip: 'Use the Star Gate to uncover the high moon-rune route.',
  },
  {
    id: 'sunroot-run', name: 'Sunroot Run', biome: 'meadow', width: 2120,
    platforms: [...ground(2120, [[400, 488], [950, 1044], [1530, 1620]]), p(120, 252, 94), p(275, 200, 86), p(495, 262, 95), p(665, 210, 112), p(830, 158, 90), p(1050, 265, 118), p(1245, 212, 90), p(1390, 160, 106), p(1628, 264, 105), p(1810, 206, 130)],
    coins: [coin(140, 220), coin(180, 220), coin(295, 168), coin(334, 168), coin(430, 274), coin(520, 230), coin(550, 230), coin(690, 178), coin(740, 178), coin(850, 126), coin(885, 126), coin(1075, 233), coin(1132, 233), coin(1265, 180), coin(1415, 128), coin(1460, 128), coin(1650, 232), coin(1700, 232), coin(1835, 174), coin(1895, 174)],
    runes: [rune(850, 122), rune(1420, 122)], enemies: [foe('mossling', 235, 296, 160, 380), foe('emberbat', 680, 150, 630, 810), foe('mossling', 1120, 296, 1060, 1220), foe('emberbat', 1420, 112, 1370, 1530), foe('mossling', 1950, 296, 1840, 2050)],
    portals: [{ x: 848, y: 116, w: 30, h: 42, toX: 1420, toY: 120, label: 'Sun Gate' }, { x: 1420, y: 116, w: 30, h: 42, toX: 880, toY: 120, label: 'Leaf Gate' }], powers: [{ x: 1277, y: 182, w: 20, h: 24, kind: 'star', used: false }], checkpoints: [{ x: 1185, y: 264, w: 18, h: 56, hit: false }], goal: { x: 2045, y: 238, w: 34, h: 82, locked: false }, tip: 'The Sun Gate takes a bold jumper to a hidden ridge.',
  },
  {
    id: 'obsidian-rail', name: 'Obsidian Rail', biome: 'cavern', width: 2240,
    platforms: [...ground(2240, [[510, 602], [1080, 1172], [1710, 1800]]), p(160, 250, 100), p(340, 198, 110), p(610, 260, 96), p(780, 205, 98), p(940, 150, 104), p(1178, 260, 112), p(1370, 205, 106), p(1540, 150, 104), p(1808, 260, 120), p(2000, 204, 125)],
    coins: [coin(180, 218), coin(222, 218), coin(360, 166), coin(410, 166), coin(470, 274), coin(630, 228), coin(674, 228), coin(800, 173), coin(845, 173), coin(965, 118), coin(1010, 118), coin(1205, 228), coin(1255, 228), coin(1400, 173), coin(1450, 173), coin(1570, 118), coin(1612, 118), coin(1835, 228), coin(1890, 228), coin(2025, 172)],
    runes: [rune(970, 112), rune(1578, 112)], enemies: [foe('emberbat', 370, 140, 320, 470), foe('mossling', 720, 296, 630, 860), foe('emberbat', 970, 110, 920, 1080), foe('mossling', 1310, 296, 1200, 1450), foe('emberbat', 1570, 110, 1510, 1680), foe('mossling', 1940, 296, 1840, 2070)],
    portals: [{ x: 972, y: 108, w: 30, h: 42, toX: 1578, toY: 112, label: 'Glass Gate' }, { x: 1578, y: 108, w: 30, h: 42, toX: 1008, toY: 112, label: 'Rail Gate' }], powers: [{ x: 1218, y: 230, w: 20, h: 24, kind: 'bloom', used: false }], checkpoints: [{ x: 1510, y: 264, w: 18, h: 56, hit: false }], goal: { x: 2140, y: 238, w: 34, h: 82, locked: false }, tip: 'Glass Gate jumps over the old molten rail.',
  },
  {
    id: 'dawnkeep-summit', name: 'Dawnkeep Summit', biome: 'citadel', width: 2440,
    platforms: [...ground(2440, [[540, 632], [1200, 1294], [1850, 1940]]), p(180, 252, 104), p(365, 200, 94), p(640, 258, 102), p(820, 204, 114), p(1005, 150, 110), p(1300, 262, 115), p(1495, 205, 110), p(1670, 150, 108), p(1948, 260, 130), p(2140, 210, 138)],
    coins: [coin(200, 220), coin(244, 220), coin(388, 168), coin(430, 168), coin(500, 274), coin(660, 226), coin(710, 226), coin(845, 172), coin(900, 172), coin(1030, 118), coin(1080, 118), coin(1325, 230), coin(1375, 230), coin(1520, 173), coin(1568, 173), coin(1695, 118), coin(1740, 118), coin(1970, 228), coin(2025, 228), coin(2165, 178)],
    runes: [rune(1038, 112), rune(1702, 112), rune(2170, 172)], enemies: [foe('emberbat', 385, 140, 340, 480), foe('mossling', 760, 296, 660, 900), foe('emberbat', 1045, 110, 990, 1160), foe('mossling', 1435, 296, 1320, 1570), foe('emberbat', 1700, 110, 1640, 1810), foe('mossling', 2080, 296, 1980, 2220)],
    portals: [{ x: 1040, y: 108, w: 30, h: 42, toX: 1704, toY: 112, label: 'Crown Gate' }, { x: 1704, y: 108, w: 30, h: 42, toX: 1075, toY: 112, label: 'Dawn Gate' }], powers: [{ x: 1345, y: 230, w: 20, h: 24, kind: 'star', used: false }], checkpoints: [{ x: 1885, y: 264, w: 18, h: 56, hit: false }], boss: foe('sentinel', 2190, 278, 2130, 2340, 4), goal: { x: 2375, y: 238, w: 34, h: 82, locked: true }, tip: "Four stomps restore the Sentinel and open Dawnkeep's beacon.",
  },
];

export function cloneLevel(index: number): QuestLevel {
  const source = LEVELS[index];
  return { ...source, platforms: source.platforms.map((v) => ({ ...v })), coins: source.coins.map((v) => ({ ...v })), runes: source.runes.map((v) => ({ ...v })), enemies: source.enemies.map((v) => ({ ...v })), portals: source.portals.map((v) => ({ ...v })), powers: source.powers.map((v) => ({ ...v })), checkpoints: source.checkpoints.map((v) => ({ ...v })), goal: { ...source.goal }, boss: source.boss ? { ...source.boss } : undefined };
}

export function newHero(x = 76, y = GROUND_Y - HERO_H): Hero {
  return { x, y, w: HERO_W, h: HERO_H, vx: 0, vy: 0, grounded: true, coyote: COYOTE, jumpBuffer: 0, facing: 1, armour: false, star: 0, hurt: 0 };
}

export function overlaps(a: Rect, b: Rect): boolean { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

/** Axis-separated body integration: deterministic and exported for verification. */
export function stepHero(hero: Hero, platforms: Rect[], input: StepInput, dt: number): StepResult {
  const result = { landed: false, headHit: false };
  hero.jumpBuffer = Math.max(0, hero.jumpBuffer - dt);
  if (input.jumpPressed) hero.jumpBuffer = JUMP_BUFFER;
  hero.coyote = hero.grounded ? COYOTE : Math.max(0, hero.coyote - dt);
  const dir = Number(input.right) - Number(input.left);
  if (dir) { hero.vx += dir * RUN_ACCEL * dt; hero.facing = dir > 0 ? 1 : -1; }
  else hero.vx += Math.sign(-hero.vx) * Math.min(Math.abs(hero.vx), RUN_DECEL * dt);
  hero.vx = Math.max(-RUN_MAX, Math.min(RUN_MAX, hero.vx));
  if (hero.jumpBuffer && hero.coyote) { hero.vy = -JUMP_SPEED; hero.grounded = false; hero.coyote = 0; hero.jumpBuffer = 0; }
  // Touch controls describe a press as a "tap". Cutting immediately at -180
  // made an ordinary tap too short for the 98px campaign gaps, so preserve a
  // useful minimum arc while a held jump still reaches the high routes.
  if (!input.jumpHeld && hero.vy < -TAP_JUMP_SPEED) hero.vy += GRAVITY * 1.4 * dt;
  hero.vy = Math.min(680, hero.vy + GRAVITY * dt);
  hero.x += hero.vx * dt;
  for (const solid of platforms) if (overlaps(hero, solid)) { if (hero.vx > 0) hero.x = solid.x - hero.w; else if (hero.vx < 0) hero.x = solid.x + solid.w; hero.vx = 0; }
  const priorBottom = hero.y + hero.h;
  hero.y += hero.vy * dt;
  hero.grounded = false;
  for (const solid of platforms) if (overlaps(hero, solid)) {
    if (hero.vy >= 0 && priorBottom <= solid.y + 8) { hero.y = solid.y - hero.h; hero.vy = 0; hero.grounded = true; result.landed = true; }
    else if (hero.vy < 0) { hero.y = solid.y + solid.h; hero.vy = 0; result.headHit = true; }
  }
  return result;
}

export function stepEnemy(enemy: Enemy, dt: number, speed = 1): void {
  if (!enemy.alive) return;
  enemy.x += enemy.vx * speed * dt;
  if (enemy.x < enemy.left) { enemy.x = enemy.left; enemy.vx = Math.abs(enemy.vx); }
  if (enemy.x + enemy.w > enemy.right) { enemy.x = enemy.right - enemy.w; enemy.vx = -Math.abs(enemy.vx); }
  if (enemy.kind === 'emberbat') enemy.y += Math.sin(enemy.x / 45) * 0.35;
}

export function reachableLanding(from: Rect, to: Rect): boolean {
  // Simple conservative reach estimate used only to guard authored jumps.
  const rise = (JUMP_SPEED * JUMP_SPEED) / (2 * GRAVITY);
  const airtime = (2 * JUMP_SPEED) / GRAVITY;
  const horizontal = RUN_MAX * airtime * 0.82 + from.w;
  const gap = Math.max(0, to.x - (from.x + from.w), from.x - (to.x + to.w));
  return to.y >= from.y - rise && gap <= horizontal;
}

export function levelHasGoalRoute(level: QuestLevel): boolean {
  const start = { x: 0, y: GROUND_Y, w: 100, h: 1 };
  const surfaces = [start, ...level.platforms.filter((v) => v.y < GROUND_Y), { x: level.goal.x - 90, y: GROUND_Y, w: 150, h: 1 }];
  return surfaces.some((v) => v.x <= level.goal.x && v.x + v.w >= level.goal.x - 100) && level.platforms.some((v) => v.y === GROUND_Y && v.x <= level.goal.x && v.x + v.w >= level.goal.x);
}
