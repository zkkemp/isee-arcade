import {
  createSkyState,
  dropSkyBlock,
  levelParams,
  overlapWidth,
  SKY_STACK_W,
} from '../components/games/SkyStack';
import { createOrbitState, orbitDistance } from '../components/games/FireflyOrbit';

function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}

// Sky Stack geometry: exact, partial, and missed overlaps.
assert(overlapWidth({ x: 10, w: 40, y: 0, hue: 0 }, { x: 10, w: 40, y: 0, hue: 0 }).w === 40, 'exact stack overlap');
const partial = overlapWidth({ x: 20, w: 40, y: 0, hue: 0 }, { x: 40, w: 40, y: 0, hue: 0 });
assert(partial.x === 40 && partial.w === 20, 'partial stack overlap');
assert(overlapWidth({ x: 0, w: 10, y: 0, hue: 0 }, { x: 20, w: 10, y: 0, hue: 0 }).w === 0, 'missed stack overlap');

const sky = createSkyState('easy', 420);
for (let i = 0; i < 8; i += 1) {
  const top = sky.blocks[sky.blocks.length - 1];
  sky.moving.x = top.x;
  sky.moving.w = top.w;
  const result = dropSkyBlock(sky, 420, 'easy');
  assert(i === 7 ? result === 'level' : result === 'placed', `sky placement ${i + 1}`);
}
assert(sky.level === 2 && sky.placed === 8, 'sky level progression');
assert(sky.moving.x > -SKY_STACK_W && sky.moving.x < SKY_STACK_W * 2, 'sky moving block sane');

// Every level is measurably harder, but the floor keeps even late levels fair.
for (const difficulty of ['easy', 'normal', 'hard'] as const) {
  let previous = levelParams(1, difficulty);
  for (let level = 2; level <= 20; level += 1) {
    const current = levelParams(level, difficulty);
    assert(current.speed > previous.speed || current.speed === 154, `${difficulty} level ${level} speeds up`);
    assert(current.baseWidth <= previous.baseWidth, `${difficulty} level ${level} does not widen`);
    assert(current.baseWidth >= 58, `${difficulty} level ${level} retains fair minimum width`);
    previous = current;
  }
}
const easyL2 = levelParams(2, 'easy');
const hardL2 = levelParams(2, 'hard');
assert(hardL2.speed > easyL2.speed && easyL2.baseWidth < levelParams(1, 'easy').baseWidth, 'difficulty and level ramps are visible');

// Firefly timing wraps correctly across the zero/two-pi seam.
assert(orbitDistance(0.05, Math.PI * 2 - 0.05) < 0.11, 'orbit seam distance');
assert(Math.abs(orbitDistance(0, Math.PI) - Math.PI) < 1e-9, 'orbit opposite distance');
const orbit = createOrbitState();
assert(orbit.lives === 3 && orbit.level === 1 && orbit.catches === 0, 'orbit fresh state');

console.log('New games: Sky Stack geometry, fair level ramp, and Firefly Orbit timing checks passed.');
