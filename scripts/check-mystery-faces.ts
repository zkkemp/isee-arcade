import { readFileSync } from 'node:fs';
import { FACES, ask, clueBudgetFor, eliminateInconsistent, isSolvableWithAllQuestions, minimumClueSet, remainingFaces, roundFor } from '../components/games/MysteryFaces';
import type { Difficulty } from '../lib/difficulty';

function assert(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }

assert(FACES.length >= 24, 'the mystery board needs at least 24 faces');
assert(new Set(FACES.map((face) => face.id)).size === FACES.length, 'face ids must be unique');
assert(new Set(FACES.map((face) => JSON.stringify([face.hair, face.glasses, face.hat, face.smile, face.freckles, face.shirt]))).size === FACES.length, 'each face needs a distinct deduction signature');
assert(isSolvableWithAllQuestions(), 'every pair of faces must differ on at least one question');

for (const difficulty of ['easy', 'normal', 'hard'] as Difficulty[]) {
  for (let level = 1; level <= 24; level += 1) {
    for (let secretIndex = 0; secretIndex < FACES.length; secretIndex += 1) {
      const secret = FACES[secretIndex];
      const clueSet = minimumClueSet(secretIndex);
      const budget = clueBudgetFor(secretIndex, level, difficulty);
      assert(clueSet.length <= budget, `${difficulty} level ${level} cannot identify ${secret.name} within its clue budget`);
      let eliminated = Array(FACES.length).fill(false);
      for (const question of clueSet) eliminated = eliminateInconsistent(eliminated, question, ask(secret, question));
      const left = remainingFaces(eliminated);
      assert(left.length === 1 && left[0].id === secret.id, `${difficulty} level ${level} clue plan does not isolate ${secret.name}`);
      assert(budget >= 3 && budget <= 8, `${difficulty} level ${level} has unfair clue count`);
    }
  }
  for (let seed = 1; seed < 80; seed += 1) {
    const round = roundFor(seed, 4, difficulty);
    assert(minimumClueSet(round.secret).length <= round.clues, `${difficulty} seed ${seed} is not solvable inside its round budget`);
  }
}
const source = readFileSync('components/games/MysteryFaces.tsx', 'utf8');
assert(/s\.clues = s\.clueBudget/.test(source), 'a wrong guess must restore the round’s complete clue budget');
console.log('Mystery Faces: all 24 secrets across 72 difficulty/level combinations are solvable within budget; wrong guesses restore every clue.');
