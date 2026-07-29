import {
  figurativeQuestionsForGrade,
  IDIOM_DESIGN_AUDIT,
  IDIOM_QUESTIONS,
} from '../lib/questions/figurativeLanguage';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

assert(IDIOM_QUESTIONS.length === 82, `Expected 82 idioms, found ${IDIOM_QUESTIONS.length}`);
assert(
  IDIOM_DESIGN_AUDIT.curatedDistractorCount === IDIOM_DESIGN_AUDIT.idiomCount,
  `${IDIOM_DESIGN_AUDIT.idiomCount - IDIOM_DESIGN_AUDIT.curatedDistractorCount} idioms lack curated distractors`,
);
assert(
  IDIOM_DESIGN_AUDIT.groupedIdiomCount === IDIOM_DESIGN_AUDIT.idiomCount,
  'Every idiom must belong to exactly one semantic neighborhood',
);
assert(
  new Set(IDIOM_QUESTIONS.map((question) => question.id)).size === IDIOM_QUESTIONS.length,
  'Idiom ids must be unique',
);

const promptPattern =
  /^Read the sentence\.\n\n“[\s\S]+[.!?]”\n\nWhat does the idiom “[^”]+” mean in this sentence\?$/;

for (const question of IDIOM_QUESTIONS) {
  assert(promptPattern.test(question.prompt), `${question.id} does not ask from sentence context`);
  assert(question.choices.length === 4, `${question.id} must have four choices`);
  assert(
    new Set(question.choices.map((choice) => choice.toLowerCase())).size === 4,
    `${question.id} repeats an answer choice`,
  );
  assert(
    question.answer >= 0 && question.answer < question.choices.length,
    `${question.id} has an invalid answer`,
  );
  assert(
    question.explain.startsWith('In this sentence,'),
    `${question.id} does not explain the contextual meaning`,
  );
  const literalMatch = /It does not literally mean “([^”]+)”\.?$/.exec(question.explain);
  assert(literalMatch, `${question.id} does not contrast literal and figurative meaning`);
  const literalMeaning = literalMatch[1].replace(/[.!?]+$/, '');
  assert(
    !question.choices.some(
      (choice) => choice.trim().toLowerCase() === literalMeaning.trim().toLowerCase(),
    ),
    `${question.id} uses a silly literal picture as a giveaway option`,
  );
  const wordCounts = question.choices.map((choice) => choice.trim().split(/\s+/).length);
  assert(
    Math.max(...wordCounts) - Math.min(...wordCounts) <= 4,
    `${question.id} choices are not reasonably parallel in length: ${wordCounts.join(', ')}`,
  );
}

const thirdGrade = figurativeQuestionsForGrade('grade3').filter((question) =>
  question.topic?.startsWith('grade-only idiom:'),
);
const thirdGradeDifficulty = ([1, 2, 3] as const).map(
  (difficulty) => thirdGrade.filter((question) => question.difficulty === difficulty).length,
);
assert(thirdGrade.length === 23, `Third Grade should have 23 idioms, found ${thirdGrade.length}`);
assert(
  thirdGradeDifficulty.every((count) => count >= 7),
  `Third Grade needs a balanced progression; found ${thirdGradeDifficulty.join('/')}`,
);

console.log(
  `Idiom bank verified: ${IDIOM_QUESTIONS.length} sentence-context items with individually curated distractors; Third Grade progression ${thirdGradeDifficulty.join('/')}.`,
);
