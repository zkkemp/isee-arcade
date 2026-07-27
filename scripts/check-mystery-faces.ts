import { readFileSync } from 'node:fs';
import { FACES, QUESTIONS, ask, bestQuestionFor, candidateIndices, clueBudgetFor, coachPathForSecret, eliminateInconsistent, isSolvableWithAllQuestions, minimumClueSet, remainingFaces, retryCase, roundFor } from '../components/games/MysteryFaces';
import type { Difficulty } from '../lib/difficulty';

function assert(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }

assert(FACES.length >= 24, 'the mystery board needs at least 24 faces');
assert(new Set(FACES.map((face) => face.id)).size === FACES.length, 'face ids must be unique');
assert(new Set(FACES.map((face) => JSON.stringify([face.hair, face.glasses, face.hat, face.smile, face.freckles, face.shirt]))).size === FACES.length, 'each face needs a distinct deduction signature');
assert(isSolvableWithAllQuestions(), 'every pair of faces must differ on at least one question');
assert(new Set(QUESTIONS.map((q) => q.category)).size === 4, 'large clue cards need clear visual categories');
assert(bestQuestionFor(FACES.map((_, i) => i), []) === bestQuestionFor(FACES.map((_, i) => i), []), 'clue coach must be deterministic');

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
      let coached = Array(FACES.length).fill(false);
      const coachPath = coachPathForSecret(secretIndex);
      assert(coachPath.length <= budget, `${difficulty} level ${level} coach cannot solve ${secret.name} inside its clue budget`);
      for (const question of coachPath) coached = eliminateInconsistent(coached, question, ask(secret, question));
      assert(candidateIndices(coached).length === 1 && !coached[secretIndex], `clue coach failed to identify ${secret.name}`);
    }
  }
  for (let seed = 1; seed < 80; seed += 1) {
    const round = roundFor(seed, 4, difficulty);
    assert(minimumClueSet(round.secret).length <= round.clues, `${difficulty} seed ${seed} is not solvable inside its round budget`);
  }
}
const source = readFileSync('components/games/MysteryFaces.tsx', 'utf8');
const retry = retryCase({ clueBudget: 7 });
assert(retry.clues === 7 && retry.asked.length === 0 && candidateIndices(retry.eliminated).length === FACES.length, 'a wrong guess must restore the complete clue book and board');
assert(!/Guess Who/i.test(source), 'the original game must not use a protected commercial title');
console.log('Mystery Faces: 24 original faces, categorized touch clues, deterministic clue coach, exhaustive solvability, and full retries passed.');
