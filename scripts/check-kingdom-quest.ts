/** Focused structural regression check for the original Kingdom Quest campaign. */
import { readFileSync } from 'node:fs';
import { KINGDOM_THEME } from '../lib/kingdomMusic.js';
import { GROUND_Y, HERO_H, LEVELS, cameraTarget, cloneLevel, dampCamera, levelHasGoalRoute, newHero, overlaps, questPace, questViewport, reachableLanding, simulationSteps, stepEnemy, stepHero } from '../lib/kingdomQuest.js';

const fail = (message: string): never => { throw new Error(`Kingdom Quest check failed: ${message}`); };

if (LEVELS.length !== 16) fail('campaign needs exactly sixteen handcrafted stages');
if (new Set(LEVELS.map((v) => v.id)).size !== 16 || new Set(LEVELS.map((v) => v.name)).size !== 16) fail('every campaign stage needs a unique identity');
if (new Set(LEVELS.map((v) => v.biome)).size < 3) fail('each realm needs its own biome');

for (let i = 0; i < LEVELS.length; i += 1) {
  const level = cloneLevel(i);
  if (!levelHasGoalRoute(level)) fail(`${level.name} has no ground route to its beacon`);
  if (level.platforms.filter((v) => v.y < GROUND_Y).length < 5) fail(`${level.name} lacks platforming variety`);
  if (level.coins.length < 12 || level.runes.length < 2) fail(`${level.name} lacks collectible exploration rewards`);
  if (level.checkpoints.length < 1) fail(`${level.name} needs a checkpoint`);
  if (!level.powers.length) fail(`${level.name} needs an original power-up`);
  for (const enemy of level.enemies) {
    const copy = { ...enemy }; stepEnemy(copy, 1, 1); if (copy.x < copy.left || copy.x + copy.w > copy.right) fail(`${level.name} enemy escaped patrol bounds`);
  }
  const ledges = level.platforms.filter((v) => v.y < GROUND_Y).sort((a, b) => a.x - b.x);
  for (let n = 1; n < ledges.length; n += 1) if (!reachableLanding(ledges[n - 1], ledges[n])) fail(`${level.name} has an authored ledge jump outside the conservative reach budget`);
}
if (!LEVELS.at(-1)?.boss || LEVELS.at(-1)?.goal.locked !== true) fail('final realm must keep the goal locked behind the original boss');

// Exercise real integration: acceleration, coyote jump and floor collision all agree.
const hero = newHero();
const floor = [{ x: 0, y: GROUND_Y, w: 300, h: 64 }];
for (let i = 0; i < 20; i += 1) stepHero(hero, floor, { left: false, right: true, jumpPressed: false, jumpHeld: false }, 1 / 60);
if (hero.vx <= 0) fail('right input did not accelerate the hero');
stepHero(hero, floor, { left: false, right: true, jumpPressed: true, jumpHeld: true }, 1 / 60);
if (hero.vy >= 0 || hero.y >= GROUND_Y - HERO_H) fail('jump did not lift the hero');
if (overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })) fail('edge-touching rectangles should not collide');

// Mobile/iPad layout uses every available pixel instead of subtracting the
// already-separate control strip a second time.
const portrait = questViewport(768, 1024);
const landscape = questViewport(1024, 640);
if (Math.abs(portrait.w * portrait.scale - 768) > 1 || Math.abs(portrait.h * portrait.scale - 1024) > 1) fail('portrait iPad viewport does not fill its stage');
if (Math.abs(landscape.w * landscape.scale - 1024) > 1 || Math.abs(landscape.h * landscape.scale - 640) > 1) fail('landscape iPad viewport does not fill its stage');

const target = cameraTarget(900, portrait.w, 2060);
const eased30 = Array.from({ length: 30 }).reduce<number>((camera) => dampCamera(camera, target, 1 / 30), 0);
const eased60 = Array.from({ length: 60 }).reduce<number>((camera) => dampCamera(camera, target, 1 / 60), 0);
if (Math.abs(eased30 - eased60) > 0.01) fail('camera easing changes with frame rate');
if (simulationSteps(1 / 20).some((slice) => slice > 1 / 120 + 1e-8)) fail('slow frames are not split into collision-safe physics slices');
if (questPace(15, 1) <= questPace(0, 1)) fail('the sixteen-stage campaign must build pace toward its finale');
if (questPace(15, 1) > 1.42) fail('late-campaign speed must remain fair on touch controls');

// The touch UI promises that a tap jumps. A released jump must still cross the
// widest authored gap (98px) once the hero has built normal running speed.
const tapHero = newHero(0, GROUND_Y - HERO_H);
tapHero.vx = 205;
const gapFloor = [{ x: -100, y: GROUND_Y, w: 100, h: 64 }, { x: 98, y: GROUND_Y, w: 180, h: 64 }];
let tapPressed = true;
for (let i = 0; i < 90 && tapHero.x < 98; i += 1) {
  stepHero(tapHero, gapFloor, { left: false, right: true, jumpPressed: tapPressed, jumpHeld: false }, 1 / 60);
  tapPressed = false;
}
if (tapHero.x < 98 || tapHero.y > GROUND_Y - HERO_H + 1) fail('a tap jump cannot cross the widest authored gap');

const componentSource = readFileSync(
  new URL('../components/games/KingdomQuest.tsx', import.meta.url),
  'utf8',
);
if (!componentSource.includes('className="absolute inset-0 h-full w-full touch-none"')) {
  fail('canvas must fill the game stage on phones and tablets');
}
if (componentSource.includes('ch - insetRef.current') || componentSource.includes('ch - controlsInset')) {
  fail('Kingdom Quest must not subtract the separate controls strip from its canvas again');
}
if (/\b(portal|warp)\b/i.test(componentSource)) fail('Kingdom Quest must not contain portal or warp mechanics');
const campaignSource = readFileSync(new URL('../lib/kingdomQuest.ts', import.meta.url), 'utf8');
if (/\b(portal|warp)\b/i.test(campaignSource)) fail('Kingdom Quest campaign data must not contain portals or warps');
if (KINGDOM_THEME.length < 24 || new Set(KINGDOM_THEME.filter((note) => note !== null)).size < 8) {
  fail('original platformer theme needs a real melodic phrase');
}

console.log(`Kingdom Quest verified: ${LEVELS.length} sequential realms, full-screen iPad viewports, stable camera/physics, no warps, original theme, checkpoints, powers, and final boss.`);
