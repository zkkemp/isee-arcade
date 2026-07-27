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
  return difficultyScale * (1 + Math.max(0, Math.min(15, levelIndex)) * 0.026);
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
const coinsAt = (y: number, ...xs: number[]): Rect[] => xs.map((x) => coin(x, y));
const rune = (x: number, y: number): Rect => ({ x, y, w: 16, h: 20 });
const foe = (kind: EnemyKind, x: number, y: number, left: number, right: number, hp = 1): Enemy => ({ x, y, w: kind === 'sentinel' ? 42 : 26, h: kind === 'sentinel' ? 42 : 24, kind, left, right, vx: kind === 'sentinel' ? 58 : kind === 'emberbat' ? 66 : 46, hp, alive: true });

/** Sixteen compact, genuinely hand-laid-out stages rather than procedural variants. */
export const LEVELS: QuestLevel[] = [
  {
    id: 'verdant-crossing', name: 'Verdant Crossing', biome: 'meadow', width: 2060,
    platforms: [...ground(2060, [[620, 704], [1250, 1334]]), p(240, 260, 105), p(405, 212, 94), p(700, 270, 90), p(845, 222, 120), p(1045, 250, 82), p(1338, 270, 110), p(1510, 216, 104), p(1700, 255, 118)],
    coins: [coin(160, 274), coin(265, 228), coin(300, 228), coin(438, 180), coin(472, 180), coin(546, 274), coin(725, 238), coin(876, 190), coin(912, 190), coin(955, 274), coin(1075, 218), coin(1190, 274), coin(1368, 238), coin(1540, 184), coin(1580, 184), coin(1730, 223), coin(1850, 274)],
    runes: [rune(446, 176), rune(1549, 180)],
    enemies: [foe('mossling', 510, 296, 500, 590), foe('mossling', 980, 296, 900, 1180), foe('mossling', 1465, 296, 1390, 1498), foe('emberbat', 1770, 178, 1680, 1880)],
    powers: [{ x: 1080, y: 222, w: 20, h: 24, kind: 'bloom', used: false }], checkpoints: [{ x: 1160, y: 264, w: 18, h: 56, hit: false }],
    goal: { x: 1970, y: 238, w: 34, h: 82, locked: false }, tip: 'Follow the high canopy route for a sky-rune cache.',
  },
  {
    id: 'cinder-hollows', name: 'Cinder Hollows', biome: 'cavern', width: 2190,
    platforms: [...ground(2190, [[470, 560], [1020, 1110], [1590, 1688]]), p(160, 252, 98), p(330, 202, 90), p(565, 262, 105), p(740, 216, 92), p(890, 166, 106), p(1114, 264, 118), p(1320, 212, 104), p(1462, 160, 90), p(1690, 265, 115), p(1880, 215, 132)],
    coins: [coin(176, 220), coin(210, 220), coin(350, 170), coin(390, 170), coin(420, 274), coin(590, 230), coin(630, 230), coin(762, 184), coin(805, 184), coin(912, 134), coin(950, 134), coin(1140, 232), coin(1200, 232), coin(1350, 180), coin(1490, 128), coin(1522, 128), coin(1715, 233), coin(1755, 233), coin(1910, 183), coin(1960, 183)],
    runes: [rune(916, 128), rune(1496, 122)],
    enemies: [foe('emberbat', 355, 142, 300, 430), foe('mossling', 680, 296, 590, 760), foe('emberbat', 1180, 188, 1120, 1280), foe('mossling', 1400, 296, 1300, 1510), foe('emberbat', 1900, 170, 1850, 2050)],
    powers: [{ x: 1168, y: 234, w: 20, h: 24, kind: 'star', used: false }], checkpoints: [{ x: 1285, y: 264, w: 18, h: 56, hit: false }],
    goal: { x: 2090, y: 238, w: 34, h: 82, locked: false }, tip: 'A comet star can melt through the crowded final tunnel.',
  },
  {
    id: 'aurora-spire', name: 'Aurora Spire', biome: 'citadel', width: 2360,
    platforms: [...ground(2360, [[530, 620], [1160, 1250]]), p(195, 254, 108), p(370, 204, 92), p(630, 258, 100), p(805, 208, 110), p(990, 158, 100), p(1255, 264, 112), p(1435, 212, 104), p(1600, 160, 106), p(1790, 224, 122), p(2010, 250, 150)],
    coins: [coin(215, 222), coin(258, 222), coin(392, 172), coin(430, 172), coin(470, 274), coin(650, 226), coin(695, 226), coin(830, 176), coin(875, 176), coin(1014, 126), coin(1054, 126), coin(1280, 232), coin(1330, 232), coin(1460, 180), coin(1500, 180), coin(1628, 128), coin(1670, 128), coin(1820, 192), coin(1880, 192)],
    runes: [rune(1019, 120), rune(1635, 122), rune(1832, 186)],
    enemies: [foe('emberbat', 390, 145, 350, 475), foe('mossling', 760, 296, 650, 860), foe('emberbat', 1020, 120, 970, 1100), foe('mossling', 1380, 296, 1260, 1490), foe('emberbat', 1650, 124, 1580, 1740)],
    powers: [{ x: 1300, y: 234, w: 20, h: 24, kind: 'bloom', used: false }], checkpoints: [{ x: 1750, y: 264, w: 18, h: 56, hit: false }],
    goal: { x: 2290, y: 238, w: 34, h: 82, locked: false }, tip: 'Climb the moonlit ledges to uncover the high rune route.',
  },
  {
    id: 'sunroot-run', name: 'Sunroot Run', biome: 'meadow', width: 2120,
    platforms: [...ground(2120, [[400, 488], [950, 1044], [1530, 1620]]), p(120, 252, 94), p(275, 200, 86), p(495, 262, 95), p(665, 210, 112), p(830, 158, 90), p(1050, 265, 118), p(1245, 212, 90), p(1390, 160, 106), p(1628, 264, 105), p(1810, 206, 130)],
    coins: [coin(140, 220), coin(180, 220), coin(295, 168), coin(334, 168), coin(430, 274), coin(520, 230), coin(550, 230), coin(690, 178), coin(740, 178), coin(850, 126), coin(885, 126), coin(1075, 233), coin(1132, 233), coin(1265, 180), coin(1415, 128), coin(1460, 128), coin(1650, 232), coin(1700, 232), coin(1835, 174), coin(1895, 174)],
    runes: [rune(850, 122), rune(1420, 122)], enemies: [foe('mossling', 235, 296, 160, 380), foe('emberbat', 680, 150, 630, 810), foe('mossling', 1120, 296, 1060, 1220), foe('emberbat', 1420, 112, 1370, 1530), foe('mossling', 1950, 296, 1840, 2050)],
    powers: [{ x: 1277, y: 182, w: 20, h: 24, kind: 'star', used: false }], checkpoints: [{ x: 1185, y: 264, w: 18, h: 56, hit: false }], goal: { x: 2045, y: 238, w: 34, h: 82, locked: false }, tip: 'Keep your speed through the three sunroot gaps.',
  },
  {
    id: 'obsidian-rail', name: 'Obsidian Rail', biome: 'cavern', width: 2240,
    platforms: [...ground(2240, [[510, 602], [1080, 1172], [1710, 1800]]), p(160, 250, 100), p(340, 198, 110), p(610, 260, 96), p(780, 205, 98), p(940, 150, 104), p(1178, 260, 112), p(1370, 205, 106), p(1540, 150, 104), p(1808, 260, 120), p(2000, 204, 125)],
    coins: [coin(180, 218), coin(222, 218), coin(360, 166), coin(410, 166), coin(470, 274), coin(630, 228), coin(674, 228), coin(800, 173), coin(845, 173), coin(965, 118), coin(1010, 118), coin(1205, 228), coin(1255, 228), coin(1400, 173), coin(1450, 173), coin(1570, 118), coin(1612, 118), coin(1835, 228), coin(1890, 228), coin(2025, 172)],
    runes: [rune(970, 112), rune(1578, 112)], enemies: [foe('emberbat', 370, 140, 320, 470), foe('mossling', 720, 296, 630, 860), foe('emberbat', 970, 110, 920, 1080), foe('mossling', 1310, 296, 1200, 1450), foe('emberbat', 1570, 110, 1510, 1680), foe('mossling', 1940, 296, 1840, 2070)],
    powers: [{ x: 1218, y: 230, w: 20, h: 24, kind: 'bloom', used: false }], checkpoints: [{ x: 1510, y: 264, w: 18, h: 56, hit: false }], goal: { x: 2140, y: 238, w: 34, h: 82, locked: false }, tip: 'Time each jump above the old molten rail.',
  },
  {
    id: 'dawnkeep-summit', name: 'Dawnkeep Summit', biome: 'citadel', width: 2440,
    platforms: [...ground(2440, [[540, 632], [1200, 1294], [1850, 1940]]), p(180, 252, 104), p(365, 200, 94), p(640, 258, 102), p(820, 204, 114), p(1005, 150, 110), p(1300, 262, 115), p(1495, 205, 110), p(1670, 150, 108), p(1948, 260, 130), p(2140, 210, 138)],
    coins: [coin(200, 220), coin(244, 220), coin(388, 168), coin(430, 168), coin(500, 274), coin(660, 226), coin(710, 226), coin(845, 172), coin(900, 172), coin(1030, 118), coin(1080, 118), coin(1325, 230), coin(1375, 230), coin(1520, 173), coin(1568, 173), coin(1695, 118), coin(1740, 118), coin(1970, 228), coin(2025, 228), coin(2165, 178)],
    runes: [rune(1038, 112), rune(1702, 112), rune(2170, 172)], enemies: [foe('emberbat', 385, 140, 340, 480), foe('mossling', 760, 296, 660, 900), foe('emberbat', 1045, 110, 990, 1160), foe('mossling', 1435, 296, 1320, 1570), foe('emberbat', 1700, 110, 1640, 1810), foe('mossling', 2080, 296, 1980, 2220)],
    powers: [{ x: 1345, y: 230, w: 20, h: 24, kind: 'star', used: false }], checkpoints: [{ x: 1885, y: 264, w: 18, h: 56, hit: false }], goal: { x: 2375, y: 238, w: 34, h: 82, locked: false }, tip: 'Scale Dawnkeep and carry the lantern to its summit.',
  },
  {
    id: 'moonpetal-marsh', name: 'Moonpetal Marsh', biome: 'meadow', width: 2260,
    platforms: [...ground(2260, [[460, 548], [1080, 1174], [1720, 1814]]), p(145, 258, 104), p(315, 210, 96), p(555, 266, 110), p(735, 218, 104), p(910, 168, 96), p(1180, 266, 116), p(1370, 214, 102), p(1545, 164, 108), p(1820, 264, 118), p(2020, 216, 126)],
    coins: [...coinsAt(226, 170, 215), ...coinsAt(178, 340, 385), ...coinsAt(234, 580, 625), ...coinsAt(186, 760, 805), ...coinsAt(136, 935, 980), ...coinsAt(234, 1208, 1260), ...coinsAt(182, 1398, 1440), ...coinsAt(132, 1575, 1620), ...coinsAt(232, 1850, 1905), ...coinsAt(184, 2050, 2100)],
    runes: [rune(944, 130), rune(1585, 126)], enemies: [foe('mossling', 270, 296, 210, 440), foe('emberbat', 780, 162, 720, 860), foe('mossling', 1305, 296, 1190, 1510), foe('emberbat', 1580, 120, 1510, 1680), foe('mossling', 1940, 296, 1830, 2160)],
    powers: [{ x: 1410, y: 184, w: 20, h: 24, kind: 'bloom', used: false }], checkpoints: [{ x: 1675, y: 264, w: 18, h: 56, hit: false }], goal: { x: 2170, y: 238, w: 34, h: 82, locked: false }, tip: 'Moonpetals mark the safer rhythm across the marsh.',
  },
  {
    id: 'emberglass-depths', name: 'Emberglass Depths', biome: 'cavern', width: 2320,
    platforms: [...ground(2320, [[520, 616], [1210, 1308], [1810, 1908]]), p(165, 248, 104), p(350, 196, 106), p(625, 260, 108), p(805, 206, 100), p(970, 154, 108), p(1315, 262, 118), p(1505, 208, 112), p(1685, 156, 104), p(1915, 260, 118), p(2110, 208, 126)],
    coins: [...coinsAt(216, 190, 235), ...coinsAt(164, 375, 420), ...coinsAt(228, 650, 695), ...coinsAt(174, 830, 875), ...coinsAt(122, 995, 1040), ...coinsAt(230, 1340, 1390), ...coinsAt(176, 1530, 1580), ...coinsAt(124, 1710, 1750), ...coinsAt(228, 1940, 1990), ...coinsAt(176, 2140, 2190)],
    runes: [rune(1005, 116), rune(1718, 118)], enemies: [foe('emberbat', 385, 138, 320, 480), foe('mossling', 760, 296, 650, 920), foe('emberbat', 1000, 110, 940, 1120), foe('mossling', 1440, 296, 1330, 1640), foe('emberbat', 1715, 112, 1650, 1800), foe('mossling', 2040, 296, 1930, 2210)],
    powers: [{ x: 1550, y: 178, w: 20, h: 24, kind: 'star', used: false }], checkpoints: [{ x: 1765, y: 264, w: 18, h: 56, hit: false }], goal: { x: 2240, y: 238, w: 34, h: 82, locked: false }, tip: 'Save the comet star for the deepest emberglass tunnel.',
  },
  {
    id: 'starlight-ramparts', name: 'Starlight Ramparts', biome: 'citadel', width: 2380,
    platforms: [...ground(2380, [[480, 570], [1120, 1212], [1760, 1854]]), p(130, 254, 106), p(315, 204, 102), p(578, 264, 110), p(760, 214, 108), p(945, 162, 106), p(1220, 262, 116), p(1410, 212, 110), p(1595, 160, 108), p(1862, 262, 122), p(2065, 208, 136)],
    coins: [...coinsAt(222, 155, 200), ...coinsAt(172, 340, 385), ...coinsAt(232, 605, 650), ...coinsAt(182, 790, 835), ...coinsAt(130, 970, 1015), ...coinsAt(230, 1248, 1300), ...coinsAt(180, 1438, 1488), ...coinsAt(128, 1622, 1670), ...coinsAt(230, 1890, 1945), ...coinsAt(176, 2095, 2150)],
    runes: [rune(980, 124), rune(1632, 122), rune(2110, 170)], enemies: [foe('emberbat', 350, 146, 300, 445), foe('mossling', 720, 296, 600, 900), foe('emberbat', 990, 118, 930, 1100), foe('mossling', 1350, 296, 1230, 1570), foe('emberbat', 1630, 116, 1560, 1740), foe('mossling', 2010, 296, 1870, 2230)],
    powers: [{ x: 1450, y: 182, w: 20, h: 24, kind: 'bloom', used: false }], checkpoints: [{ x: 1815, y: 264, w: 18, h: 56, hit: false }], goal: { x: 2295, y: 238, w: 34, h: 82, locked: false }, tip: 'The ramparts reward steady climbs more than rushed leaps.',
  },
  {
    id: 'cloverwind-vale', name: 'Cloverwind Vale', biome: 'meadow', width: 2200,
    platforms: [...ground(2200, [[390, 482], [940, 1036], [1510, 1604]]), p(110, 250, 98), p(265, 198, 96), p(490, 262, 108), p(665, 210, 104), p(830, 158, 102), p(1045, 264, 114), p(1230, 212, 106), p(1398, 160, 104), p(1612, 262, 118), p(1810, 210, 130)],
    coins: [...coinsAt(218, 135, 180), ...coinsAt(166, 290, 335), ...coinsAt(230, 515, 560), ...coinsAt(178, 690, 735), ...coinsAt(126, 855, 900), ...coinsAt(232, 1070, 1120), ...coinsAt(180, 1255, 1305), ...coinsAt(128, 1422, 1470), ...coinsAt(230, 1640, 1690), ...coinsAt(178, 1840, 1890)],
    runes: [rune(862, 120), rune(1430, 122)], enemies: [foe('mossling', 220, 296, 150, 370), foe('emberbat', 700, 154, 640, 790), foe('mossling', 1170, 296, 1060, 1360), foe('emberbat', 1430, 116, 1370, 1510), foe('mossling', 1760, 296, 1630, 2040)],
    powers: [{ x: 1270, y: 182, w: 20, h: 24, kind: 'star', used: false }], checkpoints: [{ x: 1465, y: 264, w: 18, h: 56, hit: false }], goal: { x: 2110, y: 238, w: 34, h: 82, locked: false }, tip: 'Cloverwind favors long, flowing jumps over short hops.',
  },
  {
    id: 'furnace-echo', name: 'Furnace Echo', biome: 'cavern', width: 2420,
    platforms: [...ground(2420, [[530, 628], [1190, 1288], [1840, 1938]]), p(150, 252, 108), p(340, 200, 104), p(636, 262, 112), p(825, 208, 110), p(1010, 156, 104), p(1296, 262, 118), p(1495, 208, 110), p(1678, 154, 108), p(1946, 262, 122), p(2150, 208, 136)],
    coins: [...coinsAt(220, 175, 220), ...coinsAt(168, 365, 410), ...coinsAt(230, 662, 710), ...coinsAt(176, 850, 900), ...coinsAt(124, 1035, 1080), ...coinsAt(230, 1322, 1375), ...coinsAt(176, 1520, 1570), ...coinsAt(122, 1705, 1750), ...coinsAt(230, 1975, 2030), ...coinsAt(176, 2180, 2240)],
    runes: [rune(1042, 118), rune(1715, 116)], enemies: [foe('emberbat', 380, 142, 320, 470), foe('mossling', 790, 296, 650, 980), foe('emberbat', 1040, 112, 980, 1150), foe('mossling', 1420, 296, 1310, 1640), foe('emberbat', 1710, 110, 1640, 1820), foe('mossling', 2080, 296, 1960, 2290)],
    powers: [{ x: 1530, y: 178, w: 20, h: 24, kind: 'bloom', used: false }], checkpoints: [{ x: 1795, y: 264, w: 18, h: 56, hit: false }], goal: { x: 2340, y: 238, w: 34, h: 82, locked: false }, tip: 'Listen for the safe beat between the furnace patrols.',
  },
  {
    id: 'silverclock-keep', name: 'Silverclock Keep', biome: 'citadel', width: 2480,
    platforms: [...ground(2480, [[560, 658], [1260, 1358], [1900, 1998]]), p(170, 250, 108), p(365, 198, 102), p(666, 262, 112), p(855, 208, 108), p(1040, 154, 110), p(1366, 262, 118), p(1560, 208, 112), p(1745, 154, 108), p(2006, 262, 124), p(2220, 208, 136)],
    coins: [...coinsAt(218, 195, 240), ...coinsAt(166, 390, 435), ...coinsAt(230, 692, 740), ...coinsAt(176, 880, 930), ...coinsAt(122, 1065, 1115), ...coinsAt(230, 1392, 1445), ...coinsAt(176, 1588, 1640), ...coinsAt(122, 1772, 1820), ...coinsAt(230, 2035, 2090), ...coinsAt(176, 2250, 2310)],
    runes: [rune(1075, 116), rune(1782, 116), rune(2265, 170)], enemies: [foe('emberbat', 405, 140, 340, 500), foe('mossling', 810, 296, 680, 1010), foe('emberbat', 1080, 108, 1010, 1190), foe('mossling', 1490, 296, 1380, 1710), foe('emberbat', 1780, 108, 1710, 1880), foe('mossling', 2150, 296, 2020, 2350)],
    powers: [{ x: 1600, y: 178, w: 20, h: 24, kind: 'star', used: false }], checkpoints: [{ x: 1855, y: 264, w: 18, h: 56, hit: false }], goal: { x: 2400, y: 238, w: 34, h: 82, locked: false }, tip: 'Use the clockwork ledges to stay above the sentries.',
  },
  {
    id: 'wildflower-heights', name: 'Wildflower Heights', biome: 'meadow', width: 2340,
    platforms: [...ground(2340, [[500, 596], [1160, 1256], [1780, 1878]]), p(135, 250, 104), p(320, 198, 102), p(604, 262, 112), p(790, 208, 108), p(975, 154, 106), p(1264, 262, 118), p(1455, 208, 110), p(1638, 154, 106), p(1886, 262, 122), p(2090, 208, 132)],
    coins: [...coinsAt(218, 160, 205), ...coinsAt(166, 345, 390), ...coinsAt(230, 630, 680), ...coinsAt(176, 815, 865), ...coinsAt(122, 1000, 1045), ...coinsAt(230, 1290, 1340), ...coinsAt(176, 1480, 1530), ...coinsAt(122, 1665, 1710), ...coinsAt(230, 1915, 1970), ...coinsAt(176, 2120, 2175)],
    runes: [rune(1008, 116), rune(1675, 116)], enemies: [foe('mossling', 260, 296, 180, 470), foe('emberbat', 830, 152, 760, 930), foe('mossling', 1390, 296, 1270, 1600), foe('emberbat', 1670, 110, 1600, 1760), foe('mossling', 2020, 296, 1900, 2220)],
    powers: [{ x: 1495, y: 178, w: 20, h: 24, kind: 'bloom', used: false }], checkpoints: [{ x: 1735, y: 264, w: 18, h: 56, hit: false }], goal: { x: 2260, y: 238, w: 34, h: 82, locked: false }, tip: 'The tallest flowers point toward every hidden rune.',
  },
  {
    id: 'crystal-underpass', name: 'Crystal Underpass', biome: 'cavern', width: 2520,
    platforms: [...ground(2520, [[570, 668], [1300, 1398], [1960, 2058]]), p(160, 250, 110), p(355, 198, 106), p(676, 262, 114), p(870, 208, 110), p(1060, 154, 108), p(1406, 262, 120), p(1605, 208, 112), p(1795, 154, 110), p(2066, 262, 126), p(2280, 208, 142)],
    coins: [...coinsAt(218, 185, 230), ...coinsAt(166, 380, 425), ...coinsAt(230, 702, 752), ...coinsAt(176, 895, 945), ...coinsAt(122, 1085, 1135), ...coinsAt(230, 1432, 1485), ...coinsAt(176, 1632, 1685), ...coinsAt(122, 1822, 1872), ...coinsAt(230, 2095, 2150), ...coinsAt(176, 2310, 2370)],
    runes: [rune(1095, 116), rune(1832, 116), rune(2325, 170)], enemies: [foe('emberbat', 395, 140, 330, 500), foe('mossling', 820, 296, 690, 1020), foe('emberbat', 1100, 108, 1030, 1220), foe('mossling', 1530, 296, 1420, 1760), foe('emberbat', 1830, 108, 1760, 1940), foe('mossling', 2210, 296, 2080, 2410)],
    powers: [{ x: 1645, y: 178, w: 20, h: 24, kind: 'star', used: false }], checkpoints: [{ x: 1905, y: 264, w: 18, h: 56, hit: false }], goal: { x: 2440, y: 238, w: 34, h: 82, locked: false }, tip: 'Crystal light reveals the safest upper path.',
  },
  {
    id: 'royal-skyway', name: 'Royal Skyway', biome: 'citadel', width: 2580,
    platforms: [...ground(2580, [[590, 688], [1340, 1438], [2020, 2118]]), p(175, 248, 110), p(375, 196, 108), p(696, 262, 116), p(895, 206, 112), p(1090, 152, 110), p(1270, 210, 104), p(1446, 262, 122), p(1650, 206, 114), p(1845, 152, 112), p(2126, 262, 128), p(2345, 206, 144)],
    coins: [...coinsAt(216, 200, 245), ...coinsAt(164, 400, 445), ...coinsAt(230, 722, 775), ...coinsAt(174, 920, 970), ...coinsAt(120, 1115, 1165), ...coinsAt(230, 1472, 1525), ...coinsAt(174, 1678, 1730), ...coinsAt(120, 1872, 1925), ...coinsAt(230, 2155, 2210), ...coinsAt(174, 2375, 2435)],
    runes: [rune(1125, 114), rune(1882, 114), rune(2390, 168)], enemies: [foe('emberbat', 420, 138, 350, 520), foe('mossling', 850, 296, 710, 1050), foe('emberbat', 1130, 106, 1060, 1260), foe('mossling', 1580, 296, 1460, 1810), foe('emberbat', 1880, 106, 1810, 2000), foe('mossling', 2280, 296, 2140, 2470)],
    powers: [{ x: 1690, y: 176, w: 20, h: 24, kind: 'bloom', used: false }], checkpoints: [{ x: 1970, y: 264, w: 18, h: 56, hit: false }], goal: { x: 2500, y: 238, w: 34, h: 82, locked: false }, tip: 'The royal skyway is long—light the lantern before the final climb.',
  },
  {
    id: 'aurora-crown', name: 'Aurora Crown', biome: 'citadel', width: 2700,
    platforms: [...ground(2700, [[610, 708], [1390, 1488], [2110, 2208]]), p(180, 248, 112), p(385, 196, 108), p(716, 262, 118), p(920, 206, 114), p(1120, 152, 112), p(1300, 210, 104), p(1496, 262, 124), p(1705, 206, 116), p(1905, 152, 114), p(2216, 262, 132), p(2440, 206, 150)],
    coins: [...coinsAt(216, 205, 250), ...coinsAt(164, 410, 455), ...coinsAt(230, 742, 795), ...coinsAt(174, 945, 995), ...coinsAt(120, 1145, 1195), ...coinsAt(230, 1522, 1575), ...coinsAt(174, 1732, 1785), ...coinsAt(120, 1932, 1985), ...coinsAt(230, 2245, 2300), ...coinsAt(174, 2470, 2530)],
    runes: [rune(1155, 114), rune(1942, 114), rune(2485, 168)], enemies: [foe('emberbat', 430, 138, 360, 540), foe('mossling', 870, 296, 730, 1080), foe('emberbat', 1160, 106, 1090, 1300), foe('mossling', 1635, 296, 1510, 1870), foe('emberbat', 1940, 106, 1870, 2070), foe('mossling', 2360, 296, 2230, 2500)],
    powers: [{ x: 1750, y: 176, w: 20, h: 24, kind: 'star', used: false }], checkpoints: [{ x: 2050, y: 264, w: 18, h: 56, hit: false }], boss: foe('sentinel', 2510, 278, 2460, 2635, 4), goal: { x: 2635, y: 238, w: 34, h: 82, locked: true }, tip: 'Four careful stomps restore the Sentinel and light the Aurora Crown.',
  },
];

export function cloneLevel(index: number): QuestLevel {
  const source = LEVELS[index];
  return { ...source, platforms: source.platforms.map((v) => ({ ...v })), coins: source.coins.map((v) => ({ ...v })), runes: source.runes.map((v) => ({ ...v })), enemies: source.enemies.map((v) => ({ ...v })), powers: source.powers.map((v) => ({ ...v })), checkpoints: source.checkpoints.map((v) => ({ ...v })), goal: { ...source.goal }, boss: source.boss ? { ...source.boss } : undefined };
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
