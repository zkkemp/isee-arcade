import {
  buildPracticeSection,
  formatPracticeTime,
  ISEE_SECTIONS,
  ISEE_SECTIONS_BY_LEVEL,
  mathStrandForTopic,
  MATH_BLUEPRINT_COUNTS,
  readingPassageGroups,
} from '../lib/iseePractice';

function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}

const expected = {
  verbal: [34, 20],
  quantitative: [38, 35],
  reading: [25, 25],
  math: [30, 30],
  essay: [1, 30],
} as const;

const middleUpperExpected = {
  verbal: [40, 20],
  quantitative: [37, 35],
  reading: [36, 35],
  math: [47, 40],
  essay: [1, 30],
} as const;

for (const section of ISEE_SECTIONS) {
  assert(
    section.questions === expected[section.id][0] && section.minutes === expected[section.id][1],
    `${section.id} does not match the official Lower Level shape`,
  );
}

for (const level of ['middle', 'upper'] as const) {
  for (const section of ISEE_SECTIONS_BY_LEVEL[level]) {
    assert(
      section.questions === middleUpperExpected[section.id][0] &&
        section.minutes === middleUpperExpected[section.id][1],
      `${level} ${section.id} does not match the official section shape`,
    );
  }
  for (const id of ['verbal', 'quantitative', 'reading', 'math'] as const) {
    const section = buildPracticeSection(id, 2026, undefined, level);
    assert(
      section.length === middleUpperExpected[id][0],
      `${level} ${id} section has the wrong length`,
    );
    assert(
      section.every((question) => question.subject === id),
      `${level} ${id} leaked another subject`,
    );
  }
}

for (let seed = 1; seed <= 20; seed += 1) {
  const verbal = buildPracticeSection('verbal', seed);
  assert(verbal.length === 34, 'verbal section must have 34 questions');
  assert(verbal.filter((q) => q.kind === 'synonym').length === 17, 'verbal must have 17 synonyms');
  assert(
    verbal.filter((q) => q.kind === 'sentence_completion').length === 17,
    'verbal must have 17 sentence completions',
  );
  assert(
    verbal.filter((q) => q.topic === 'sentence completion: single word').length === 11,
    'verbal must have 11 single-word completions',
  );
  assert(
    verbal.filter((q) => q.topic === 'sentence completion: phrase').length === 6,
    'verbal must have 6 phrase completions',
  );
  for (const id of ['quantitative', 'reading', 'math'] as const) {
    const section = buildPracticeSection(id, seed);
    assert(section.length === expected[id][0], `${id} section has the wrong length`);
    assert(section.every((question) => question.subject === id), `${id} leaked another subject`);
    assert(new Set(section.map((question) => question.id)).size === section.length, `${id} repeats a family`);
  }
  const math = buildPracticeSection('math', seed);
  for (const [strand, count] of Object.entries(MATH_BLUEPRINT_COUNTS)) {
    assert(
      math.filter((question) => mathStrandForTopic(question.topic) === strand).length === count,
      `math section must include ${count} ${strand} questions`,
    );
  }
}

assert(formatPracticeTime(125) === '2:05', 'timer format is wrong');
const fullPassages = readingPassageGroups().filter((group) => group.questions.length >= 5);
assert(fullPassages.length >= 5, 'need at least five complete five-question reading passages');

console.log(
  'ISEE practice audit: official Lower/Middle/Upper counts, timing, section mix, ' +
    'uniqueness, and reading passage shape passed.',
);
