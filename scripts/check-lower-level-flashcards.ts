import {
  LOWER_LEVEL_FLASHCARDS,
  LOWER_LEVEL_FLASHCARD_QUESTIONS,
  pickLowerLevelFlashcard,
} from '../lib/questions/lowerLevelFlashcards';
import { STATIC_QUESTIONS, questionById } from '../lib/questions';
import type { VocabularyMastery } from '../lib/progress';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

const normalize = (value: string) =>
  value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

assert(LOWER_LEVEL_FLASHCARDS.length === 200, 'the supplied PDF must yield exactly 200 cards');
assert(
  new Set(LOWER_LEVEL_FLASHCARDS.map((card) => normalize(card.word))).size === 200,
  'all 200 source words must be unique',
);
assert(
  LOWER_LEVEL_FLASHCARD_QUESTIONS.length === 165,
  'exactly 165 source words should extend the original 550-word bank',
);

const curriculumWords = new Set(
  STATIC_QUESTIONS.filter((question) => question.kind === 'synonym').map((question) => normalize(question.prompt)),
);
for (const card of LOWER_LEVEL_FLASHCARDS) {
  assert(curriculumWords.has(normalize(card.word)), `${card.word} is missing from Lower Level curriculum`);
  assert(card.word.length >= 3 && card.meaning.length >= 2, `${card.id} is incomplete`);
  assert(questionById(card.questionId)?.id === card.questionId, `${card.word} has no routed question`);
}

for (const question of LOWER_LEVEL_FLASHCARD_QUESTIONS) {
  assert(question.choices.length === 4, `${question.id} must have four choices`);
  assert(new Set(question.choices.map(normalize)).size === 4, `${question.id} repeats a choice`);
  assert(question.choices[question.answer] !== undefined, `${question.id} has a bad answer index`);
  assert(question.topic === 'Lower Level flashcard vocabulary', `${question.id} lost its source topic`);
}

const allMastered: Record<string, VocabularyMastery> = Object.fromEntries(
  LOWER_LEVEL_FLASHCARDS.map((card) => [
    card.questionId,
    { correctStreak: 2, misses: 0, dueAt: 999 },
  ]),
);
const urgent = LOWER_LEVEL_FLASHCARDS[73];
const urgentVocabulary = {
  ...allMastered,
  [urgent.questionId]: { correctStreak: 0, misses: 2, dueAt: 0 },
};
assert(
  pickLowerLevelFlashcard(urgentVocabulary, 100, [], () => 0).id === urgent.id,
  'a missed word must outrank mastered cards',
);

const unseen = LOWER_LEVEL_FLASHCARDS[121];
const oneUnseen = { ...allMastered };
delete oneUnseen[unseen.questionId];
assert(
  pickLowerLevelFlashcard(oneUnseen, 100, [], () => 0).id === unseen.id,
  'an unseen word must outrank cards that are not due',
);
assert(
  pickLowerLevelFlashcard(urgentVocabulary, 100, [urgent.questionId], () => 0).id !== urgent.id,
  'the last card must not repeat immediately',
);

console.log(
  `Lower Level Word Lab verified: 200 PDF words, ${LOWER_LEVEL_FLASHCARD_QUESTIONS.length} additions, ` +
    'complete curriculum coverage, missed-first spacing, search-ready metadata, and no immediate repeats.',
);
