import { freshDuel, paddleBounce } from '../components/games/PaddleDuel';
import { makeWave, splitRock, wrap } from '../components/games/AsteroidPatrol';
import { formationBounds, makeFormation } from '../components/games/StarDefender';
import { landingPad, safeLanding } from '../components/games/LunarLander';

const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};

const duel = freshDuel();
assert(duel.bottom === 0 && duel.top === 0, 'duel starts scoreless');
assert(paddleBounce(180, 180, 190).vx === 0, 'center paddle hit returns straight');
assert(paddleBounce(220, 180, 190).vx > 0, 'right paddle hit angles right');

assert(wrap(-1, 360) === 359 && wrap(361, 360) === 1, 'space wrapping stays in bounds');
assert(splitRock({ x: 0, y: 0, vx: 1, vy: 2, r: 25, spin: 0 }).length === 2, 'large rock splits');
assert(splitRock({ x: 0, y: 0, vx: 1, vy: 2, r: 10, spin: 0 }).length === 0, 'small rock clears');
for (let wave = 1; wave <= 16; wave += 1) {
  const rocks = makeWave(wave);
  assert(rocks.length >= 3 && rocks.length <= 7, `wave ${wave} stays iPad-clearable`);
  assert(rocks.every((rock) => rock.vx !== 0 && rock.vy !== 0), `wave ${wave} has moving rocks`);
}

const formation = makeFormation(1);
const bounds = formationBounds(formation);
assert(formation.length === 21 && bounds.right > bounds.left && bounds.bottom > 0, 'invader formation is sane');

for (let level = 1; level <= 20; level += 1) {
  const pad = landingPad(level);
  assert(pad.x >= 0 && pad.x + pad.w <= 360 && pad.w >= 42, `pad ${level} fits`);
  assert(safeLanding(10, 25, pad.x + pad.w / 2, pad), `pad ${level} accepts safe landing`);
  assert(!safeLanding(10, -5, pad.x + pad.w / 2, pad), `pad ${level} rejects upward contact`);
  assert(!safeLanding(50, 25, pad.x + pad.w / 2, pad), `pad ${level} rejects sideways crash`);
  assert(!safeLanding(10, 70, pad.x + pad.w / 2, pad), `pad ${level} rejects hard landing`);
  assert(!safeLanding(10, 25, pad.x + 4, pad), `pad ${level} needs both feet on the pad`);
}

console.log('Classic arcade B: paddle, asteroid, star-defense, and lunar-landing checks passed.');
