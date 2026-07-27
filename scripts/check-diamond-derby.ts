import {
  advanceRunners,
  applyPlateOutcome,
  emptyCount,
  forceWalk,
  judgeSwing,
  judgeOpponentAtBat,
  makePitch,
  nextRandom,
} from '../components/games/DiamondDerby';

function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}

const loaded = [true, true, true] as const;
const grandSlam = advanceRunners([...loaded], 4);
assert(grandSlam.runs === 4 && grandSlam.bases.every((v) => !v), 'grand slam must score four and clear bases');

const single = advanceRunners([...loaded], 1);
assert(single.runs === 1 && single.bases.every(Boolean), 'single with bases loaded must score one and reload bases');

const force = forceWalk([...loaded]);
assert(force.runs === 1 && force.bases.every(Boolean), 'walk with bases loaded must force exactly one run');

let count = { ...emptyCount(), strikes: 2 };
let result = applyPlateOutcome(count, 'foul');
assert(result.state.strikes === 2 && result.state.outs === 0, 'a two-strike foul must not be a strikeout');
result = applyPlateOutcome(result.state, 'strike');
assert(result.state.outs === 1 && result.state.strikes === 0 && result.state.balls === 0, 'third strike must add an out and reset count');

count = { ...emptyCount(), balls: 3, bases: [true, true, true] };
result = applyPlateOutcome(count, 'ball');
assert(result.runsScored === 1 && result.state.balls === 0 && result.state.bases.every(Boolean), 'fourth ball must award a forced run and reset count');

result = applyPlateOutcome({ ...emptyCount(), bases: [true, true, true] }, 'walk');
assert(result.runsScored === 1 && result.state.bases.every(Boolean) && result.state.balls === 0, 'explicit walk must immediately award first and force a run');

count = { ...emptyCount(), outs: 2 };
result = applyPlateOutcome(count, 'out');
assert(result.inningOver && result.state.outs === 3, 'third out must end an inning');

const easy = makePitch(1, 'easy', 42);
const hard = makePitch(8, 'hard', 42);
assert(JSON.stringify(easy) === JSON.stringify(makePitch(1, 'easy', 42)), 'pitch generation must be deterministic');
assert(hard.speed > easy.speed, 'hard, later innings must deliver faster pitches');
assert(judgeSwing(easy, 0.88, easy.targetX, 'easy', 1, 0.95) === 'homer', 'perfect timing and aim should reward a homer');
const playable = { kind: 'BREEZE' as const, targetX: 0, targetY: 0, inZone: true, speed: 1, seed: 1 };
assert(judgeSwing(playable, 0.8, 0.25, 'hard', 10, 0.01) === 'out', 'weak fair contact on hard must let the defence make an out');
assert(judgeOpponentAtBat({ ...playable, kind: 'CURVE', targetX: 0.46 }, 'easy', 1, 0.01) === 'strike', 'a well-placed curve should produce a called strike band');
assert(judgeOpponentAtBat({ ...playable, kind: 'BREEZE', targetX: 0 }, 'hard', 8, 0.99) === 'homer', 'a hard rival must punish a centre-cut pitch sometimes');
const [nextSeed, roll] = nextRandom(42);
assert(nextSeed !== 42 && roll >= 0 && roll < 1, 'seeded random must advance within [0, 1)');

console.log('Diamond Derby: counts, forced advances, innings, deterministic pitches, and swing rewards passed.');
