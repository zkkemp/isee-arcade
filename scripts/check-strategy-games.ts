import { dropFour, fourWinner, newFourBoard } from '../components/games/StarlineFour';
import { newMancala, playMancalaPit } from '../components/games/Mancala';
import { scoreGemGuess } from '../components/games/GemCode';

function ok(value: boolean, message: string): void {
  if (!value) throw new Error(`Strategy games check failed: ${message}`);
}

let four = newFourBoard();
for (const column of [0, 1, 2, 3]) {
  const next = dropFour(four, column, 1);
  ok(next !== null, 'a legal star must drop');
  four = next!;
}
ok(fourWinner(four) === 1, 'horizontal four must win');

four = newFourBoard();
for (let index = 0; index < 4; index += 1) four = dropFour(four, 4, 2)!;
ok(fourWinner(four) === 2, 'vertical four must win');
ok(dropFour(Array(42).fill(1), 0, 2) === null, 'full columns must reject a drop');

const mancala = newMancala();
ok(mancala.pits.reduce((sum, value) => sum + value, 0) === 48, 'Mancala must begin with 48 stones');
const extraTurn = playMancalaPit(mancala, 2);
ok(Boolean(extraTurn) && extraTurn!.stores[0] === 1 && extraTurn!.turn === 0, 'ending in your store must grant another turn');

const capture = {
  ...newMancala(),
  pits: [0, 0, 1, 0, 0, 1, 1, 1, 4, 1, 1, 1],
  stores: [0, 0] as [number, number],
  turn: 0 as const,
};
const captured = playMancalaPit(capture, 2);
ok(Boolean(captured) && captured!.stores[0] === 5 && captured!.pits[3] === 0 && captured!.pits[8] === 0, 'empty-side landing must capture the opposite stones');
ok(playMancalaPit(mancala, 7) === null, 'a player cannot sow from the other side');

const exact = scoreGemGuess([0, 1, 2, 3], [0, 1, 2, 3]);
ok(exact.exact === 4 && exact.close === 0, 'Gem Code must score exact matches');
const mixed = scoreGemGuess([0, 1, 2, 3], [0, 2, 1, 4]);
ok(mixed.exact === 1 && mixed.close === 2, 'Gem Code must separate exact and misplaced colors');
const duplicates = scoreGemGuess([0, 1, 2, 3], [0, 0, 0, 0]);
ok(duplicates.exact === 1 && duplicates.close === 0, 'Gem Code must not over-count duplicate guesses');

console.log('Strategy games verified: Starline Four, Mancala Garden, and Gem Code rules passed.');
