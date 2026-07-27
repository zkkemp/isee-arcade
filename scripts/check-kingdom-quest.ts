/** Focused structural regression check for the original Kingdom Quest campaign. */
import { readFileSync } from 'node:fs';
import { GROUND_Y, HERO_H, LEVELS, cloneLevel, levelHasGoalRoute, newHero, overlaps, reachableLanding, stepEnemy, stepHero } from '../lib/kingdomQuest.js';

const fail = (message: string): never => { throw new Error(`Kingdom Quest check failed: ${message}`); };

if (LEVELS.length < 6) fail('campaign needs six handcrafted stages');
if (new Set(LEVELS.map((v) => v.biome)).size < 3) fail('each realm needs its own biome');

for (let i = 0; i < LEVELS.length; i += 1) {
  const level = cloneLevel(i);
  if (!levelHasGoalRoute(level)) fail(`${level.name} has no ground route to its beacon`);
  if (level.platforms.filter((v) => v.y < GROUND_Y).length < 5) fail(`${level.name} lacks platforming variety`);
  if (level.coins.length < 12 || level.runes.length < 2) fail(`${level.name} lacks collectible exploration rewards`);
  if (level.portals.length !== 2 || level.portals.some((v) => v.toX < 0 || v.toX > level.width - 30 || v.toY < 0 || v.toY > GROUND_Y)) fail(`${level.name} portal pair has an unsafe destination`);
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

console.log(`Kingdom Quest verified: ${LEVELS.length} hand-authored realms, portals, checkpoints, power-ups, and final boss.`);
