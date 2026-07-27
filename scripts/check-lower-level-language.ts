/**
 * Official-shape audit for ISEE Lower Level verbal and reading preparation.
 *
 * Blueprint: ERB's Lower Level What to Expect guide (Appendix A).
 * Run: node --import tsx scripts/check-lower-level-language.ts
 */
import {
  LOWER_LEVEL_COMPLETION_TOPICS,
  LOWER_LEVEL_VERBAL_BLUEPRINT,
  LOWER_LEVEL_VERBAL_QUESTIONS,
} from '../lib/questions/verbalLowerLevel';
import {
  LOWER_LEVEL_READING_BLUEPRINT,
  LOWER_LEVEL_READING_QUESTIONS,
} from '../lib/questions/readingLowerLevel';
import { STATIC_QUESTIONS, questionById } from '../lib/questions';
import type { PassageGenre, ReadingSkill } from '../lib/questions/types';

const errors: string[] = [];
const fail = (message: string) => errors.push(message);

// ----- Verbal: official 17 / 11 / 6 section mix ----------------------------

const synonyms = STATIC_QUESTIONS.filter((q) => q.kind === 'synonym');
const wordCompletions = LOWER_LEVEL_VERBAL_QUESTIONS.filter(
  (q) => q.topic === LOWER_LEVEL_COMPLETION_TOPICS.singleWord,
);
const phraseCompletions = LOWER_LEVEL_VERBAL_QUESTIONS.filter(
  (q) => q.topic === LOWER_LEVEL_COMPLETION_TOPICS.phrase,
);

if (synonyms.length < LOWER_LEVEL_VERBAL_BLUEPRINT.synonym) {
  fail(`need ${LOWER_LEVEL_VERBAL_BLUEPRINT.synonym} synonyms, found ${synonyms.length}`);
}
if (wordCompletions.length < LOWER_LEVEL_VERBAL_BLUEPRINT.singleWordCompletion) {
  fail(`need ${LOWER_LEVEL_VERBAL_BLUEPRINT.singleWordCompletion} single-word completions, found ${wordCompletions.length}`);
}
if (phraseCompletions.length < LOWER_LEVEL_VERBAL_BLUEPRINT.phraseCompletion) {
  fail(`need ${LOWER_LEVEL_VERBAL_BLUEPRINT.phraseCompletion} phrase completions, found ${phraseCompletions.length}`);
}
if (
  LOWER_LEVEL_VERBAL_BLUEPRINT.synonym +
    LOWER_LEVEL_VERBAL_BLUEPRINT.singleWordCompletion +
    LOWER_LEVEL_VERBAL_BLUEPRINT.phraseCompletion !==
  LOWER_LEVEL_VERBAL_BLUEPRINT.total
) {
  fail('verbal blueprint does not add to 34');
}

for (const q of wordCompletions) {
  if (q.verbalSkill !== 'sentence_completion_word') fail(`${q.id}: wrong verbalSkill`);
  if (q.choices.some((choice) => /\s/.test(choice.trim()))) {
    fail(`${q.id}: single-word completion contains a phrase choice`);
  }
}
for (const q of phraseCompletions) {
  if (q.verbalSkill !== 'sentence_completion_phrase') fail(`${q.id}: wrong verbalSkill`);
  if (q.choices.some((choice) => choice.trim().split(/\s+/).length < 2)) {
    fail(`${q.id}: phrase completion contains a single-word choice`);
  }
}
for (const q of LOWER_LEVEL_VERBAL_QUESTIONS) {
  if (!q.prompt.includes('------')) fail(`${q.id}: sentence completion has no blank`);
  if (q.choices.length !== 4 || new Set(q.choices).size !== 4) fail(`${q.id}: needs 4 distinct choices`);
  if (!q.choices[q.answer]) fail(`${q.id}: answer index is invalid`);
  if (q.explain.length < 60) fail(`${q.id}: explanation is too short to teach the clue`);
  if (questionById(q.id)?.id !== q.id) fail(`${q.id}: not reachable through questionById`);
}

// ----- Reading: exactly five full-length passages x five questions ---------

const passageGroups = new Map<string, typeof LOWER_LEVEL_READING_QUESTIONS>();
for (const q of LOWER_LEVEL_READING_QUESTIONS) {
  const group = passageGroups.get(q.passageId!) ?? [];
  group.push(q);
  passageGroups.set(q.passageId!, group);
}

if (passageGroups.size !== LOWER_LEVEL_READING_BLUEPRINT.passages) {
  fail(`need exactly ${LOWER_LEVEL_READING_BLUEPRINT.passages} new passage groups, found ${passageGroups.size}`);
}

const genres = new Set<PassageGenre>();
const skills = new Set<ReadingSkill>();
const answerPositions = [0, 0, 0, 0, 0];

for (const [passageId, questions] of passageGroups) {
  if (questions.length !== LOWER_LEVEL_READING_BLUEPRINT.questionsPerPassage) {
    fail(`${passageId}: needs exactly 5 questions, found ${questions.length}`);
  }
  const passages = new Set(questions.map((q) => q.passage));
  const passageGenres = new Set(questions.map((q) => q.passageGenre));
  const passageSkills = new Set(questions.map((q) => q.readingSkill));
  if (passages.size !== 1) fail(`${passageId}: questions do not share one passage text`);
  if (passageGenres.size !== 1) fail(`${passageId}: questions do not share one genre`);
  if (passageSkills.size !== questions.length) fail(`${passageId}: repeats a reading strand`);
  const words = questions[0].passage!.trim().split(/\s+/).length;
  if (
    words < LOWER_LEVEL_READING_BLUEPRINT.minimumPassageWords ||
    words > LOWER_LEVEL_READING_BLUEPRINT.maximumPassageWords
  ) {
    fail(`${passageId}: ${words} words, expected 300-600`);
  }
  for (const q of questions) {
    if (q.passageGenre) genres.add(q.passageGenre);
    if (q.readingSkill) skills.add(q.readingSkill);
    if (q.choices.length !== 5 || new Set(q.choices).size !== 5) fail(`${q.id}: needs 5 distinct choices`);
    if (!q.choices[q.answer]) fail(`${q.id}: answer index is invalid`);
    else answerPositions[q.answer] += 1;
    if (q.explain.length < 70) fail(`${q.id}: explanation is too short to teach from evidence`);
    if (questionById(q.id)?.id !== q.id) fail(`${q.id}: not reachable through questionById`);
  }
}

const officialGenres: PassageGenre[] = ['narrative', 'expository', 'persuasive', 'descriptive'];
const officialSkills: ReadingSkill[] = [
  'main_idea',
  'supporting_ideas',
  'inference',
  'vocabulary_in_context',
  'organization_logic',
  'tone_style_figurative',
];
for (const genre of officialGenres) if (!genres.has(genre)) fail(`missing passage genre ${genre}`);
for (const skill of officialSkills) if (!skills.has(skill)) fail(`missing reading strand ${skill}`);
if (answerPositions.some((count) => count !== 5)) {
  fail(`reading answer positions are not evenly balanced: ${answerPositions.join('/')}`);
}

if (errors.length > 0) {
  console.error(`Lower Level language audit failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

const skillCounts = Object.fromEntries(
  officialSkills.map((skill) => [
    skill,
    LOWER_LEVEL_READING_QUESTIONS.filter((q) => q.readingSkill === skill).length,
  ]),
);
console.log(
  `Lower Level verbal: ${synonyms.length} synonyms available, ` +
    `${wordCompletions.length} single-word and ${phraseCompletions.length} phrase completions; ` +
    `official form blueprint ${LOWER_LEVEL_VERBAL_BLUEPRINT.synonym}/` +
    `${LOWER_LEVEL_VERBAL_BLUEPRINT.singleWordCompletion}/` +
    `${LOWER_LEVEL_VERBAL_BLUEPRINT.phraseCompletion}.`,
);
console.log(
  `Lower Level reading: ${passageGroups.size} passages x 5 = ${LOWER_LEVEL_READING_QUESTIONS.length}; ` +
    `genres ${[...genres].join(', ')}; strands ${JSON.stringify(skillCounts)}.`,
);
