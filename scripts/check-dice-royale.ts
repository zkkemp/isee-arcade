/**
 * Pure rules and CPU regression checks for Dice Royale.
 * Run: node --import tsx scripts/check-dice-royale.ts
 */
import {
  DICE_CATEGORIES,
  cardComplete,
  cardTotal,
  chooseCpuCategory,
  chooseCpuHolds,
  emptyScoreCard,
  newDiceRoyale,
  rollDice,
  scoreDice,
  scoreTurn,
  upperBonus,
  upperSubtotal,
  winningPlayers,
  type DiceCategory,
  type Die,
} from '../components/games/DiceRoyale';
import { mulberry32 } from '../lib/questions/templates';

function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}

const dice = (values: number[]) => values as Die[];

// All thirteen scoring categories, including failure cases and duplicate-safe straights.
const scoringCases: Array<[DiceCategory, number[], number]> = [
  ['ones', [1, 1, 2, 4, 6], 2],
  ['twos', [2, 2, 2, 4, 6], 6],
  ['threes', [3, 3, 3, 3, 6], 12],
  ['fours', [4, 4, 1, 2, 6], 8],
  ['fives', [5, 5, 5, 2, 6], 15],
  ['sixes', [6, 6, 6, 6, 6], 30],
  ['threeKind', [4, 4, 4, 2, 6], 20],
  ['fourKind', [5, 5, 5, 5, 2], 22],
  ['fullHouse', [2, 2, 5, 5, 5], 25],
  ['smallStraight', [1, 2, 3, 4, 4], 30],
  ['largeStraight', [2, 3, 4, 5, 6], 40],
  ['chance', [1, 3, 4, 5, 6], 19],
  ['fiveKind', [3, 3, 3, 3, 3], 50],
];
for (const [category, values, expected] of scoringCases) {
  assert(scoreDice(category, dice(values)) === expected, `${category} scored incorrectly`);
}
assert(scoreDice('threeKind', dice([1, 1, 2, 2, 6])) === 0, 'invalid three-kind scored');
assert(scoreDice('fourKind', dice([4, 4, 4, 2, 2])) === 0, 'invalid four-kind scored');
assert(scoreDice('fullHouse', dice([2, 2, 2, 2, 2])) === 0, 'five-kind is not a full house');
assert(scoreDice('smallStraight', dice([1, 2, 2, 3, 4])) === 30, 'duplicate-safe small straight failed');
assert(scoreDice('largeStraight', dice([1, 2, 3, 4, 4])) === 0, 'duplicate large straight scored');
assert(scoreDice('fiveKind', dice([6, 6, 6, 6, 5])) === 0, 'invalid five-kind scored');

// Upper subtotal, threshold bonus, and grand total.
const bonusCard = emptyScoreCard();
Object.assign(bonusCard, { ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18 });
assert(upperSubtotal(bonusCard) === 63, 'upper subtotal should be 63');
assert(upperBonus(bonusCard) === 35, '63 upper points should award 35');
assert(cardTotal(bonusCard) === 98, 'grand total must include upper bonus');
bonusCard.sixes = 17;
assert(upperBonus(bonusCard) === 0, '62 upper points must not award bonus');

// Rolling preserves held dice and never permits a fourth roll.
let heldState = newDiceRoyale([false, true]);
heldState = { ...heldState, dice: dice([6, 2, 6, 3, 6]), held: [true, false, true, false, true], rollsUsed: 1 };
const rolled = rollDice(heldState, () => 0); // every unheld die becomes 1
assert(rolled.dice.join(',') === '6,1,6,1,6', 'held dice changed during roll');
const third = rollDice({ ...rolled, rollsUsed: 2 }, () => .99);
assert(third.rollsUsed === 3, 'third roll missing');
assert(rollDice(third, () => 0) === third, 'fourth roll should be rejected');

// CPU plans: preserve groups, straights, and two-pair full-house starts.
{
  const card = emptyScoreCard();
  const mask = chooseCpuHolds(dice([6, 6, 6, 2, 3]), card);
  assert(mask.join(',') === 'true,true,true,false,false', 'CPU did not preserve three sixes');
}
{
  const card = emptyScoreCard();
  card.fiveKind = 0;
  card.fourKind = 0;
  card.threeKind = 0;
  card.ones = 0;
  card.twos = 0;
  card.threes = 0;
  card.fours = 0;
  card.fives = 0;
  card.sixes = 0;
  card.fullHouse = 0;
  card.smallStraight = 0;
  card.chance = 0;
  const mask = chooseCpuHolds(dice([1, 2, 3, 4, 6]), card);
  assert(mask.join(',') === 'true,true,true,true,false', 'CPU did not pursue large straight');
}
{
  const card = emptyScoreCard();
  for (const category of DICE_CATEGORIES) if (category !== 'fullHouse') card[category] = 0;
  const mask = chooseCpuHolds(dice([2, 2, 3, 3, 5]), card);
  assert(mask.join(',') === 'true,true,true,true,false', 'CPU did not preserve two pairs');
}
assert(
  chooseCpuCategory(dice([4, 4, 4, 4, 4]), emptyScoreCard()) === 'fiveKind',
  'CPU should bank a five-kind',
);
{
  const card = emptyScoreCard();
  card.fiveKind = 0;
  assert(
    chooseCpuCategory(dice([2, 3, 4, 5, 6]), card) === 'largeStraight',
    'CPU should bank a large straight',
  );
}

// Complete 1-4-seat games across many seeds. Each player must take exactly
// thirteen turns, no category may be overwritten, totals remain finite, and a
// winner always exists. CPU decisions drive every seat in the simulation even
// though the UI requires at least one human.
for (let players = 1; players <= 4; players += 1) {
  for (let seed = 1; seed <= 80; seed += 1) {
    const rng = mulberry32(seed * 101 + players);
    let state = newDiceRoyale(Array.from({ length: players }, (_, index) => index !== 0));
    let turns = 0;
    while (state.phase === 'play' && turns < players * 13 + 1) {
      while (state.rollsUsed < 3) {
        state = rollDice(state, rng);
        if (state.rollsUsed < 3) {
          state = {
            ...state,
            held: chooseCpuHolds(state.dice, state.players[state.current].scores),
          };
        }
      }
      const category = chooseCpuCategory(state.dice, state.players[state.current].scores);
      assert(state.players[state.current].scores[category] === null, 'CPU selected a filled box');
      state = scoreTurn(state, category);
      turns += 1;
    }
    assert(state.phase === 'result', `${players} players seed ${seed}: game did not finish`);
    assert(turns === players * 13, `${players} players seed ${seed}: wrong turn count ${turns}`);
    assert(state.players.every((player) => cardComplete(player.scores)), 'finished game has open boxes');
    assert(state.players.every((player) => Number.isFinite(cardTotal(player.scores))), 'non-finite total');
    assert(winningPlayers(state).length >= 1, 'finished game has no winner');
  }
}

// Invalid setup safeguards.
for (const seats of [[], [true], [true, true], [false, false, false, false, false]]) {
  let threw = false;
  try {
    newDiceRoyale(seats);
  } catch {
    threw = true;
  }
  assert(threw, `invalid seats ${JSON.stringify(seats)} should throw`);
}

console.log(
  'Dice Royale audit passed: 13-category scoring, upper bonus, held rolls, CPU plans, and 320 full games.',
);
