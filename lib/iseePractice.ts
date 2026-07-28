import {
  ALL_TEMPLATES,
  STATIC_QUESTIONS,
  type Question,
  type Subject,
} from './questions';
import { instantiate, mulberry32 } from './questions/templates';
import type { QuestionTemplate } from './questions/templates';

export type PracticeSectionId = Subject | 'essay';
export type IseeLevel = 'lower' | 'middle' | 'upper';

export const ISEE_LEVEL_LABELS: Record<IseeLevel, string> = {
  lower: 'Lower Level — Applying to Fifth or Sixth Grade',
  middle: 'Middle Level — Applying to Seventh or Eighth Grade',
  upper: 'Upper Level — Applying to Ninth, Tenth, Eleventh, or Twelfth Grade',
};

export type PracticeSection = {
  id: PracticeSectionId;
  name: string;
  shortName: string;
  questions: number;
  minutes: number;
  description: string;
  skills: string[];
};

/** Official Lower Level section shape from ERB's What to Expect guide. */
const LOWER_SECTIONS: PracticeSection[] = [
  {
    id: 'verbal',
    name: 'Verbal Reasoning',
    shortName: 'Verbal',
    questions: 34,
    minutes: 20,
    description: '17 synonyms and 17 sentence completions.',
    skills: ['Synonyms', 'Single-word completions', 'Phrase completions'],
  },
  {
    id: 'quantitative',
    name: 'Quantitative Reasoning',
    shortName: 'Quantitative',
    questions: 38,
    minutes: 35,
    description: 'Word problems that reward reasoning, estimation, patterns, and data sense.',
    skills: ['Concepts and applications', 'Estimation', 'Patterns', 'Data and probability'],
  },
  {
    id: 'reading',
    name: 'Reading Comprehension',
    shortName: 'Reading',
    questions: 25,
    minutes: 25,
    description: 'Five passages with questions about meaning, evidence, language, and structure.',
    skills: ['Main idea', 'Supporting ideas', 'Inference', 'Vocabulary in context', 'Organization', 'Tone and style'],
  },
  {
    id: 'math',
    name: 'Mathematics Achievement',
    shortName: 'Math',
    questions: 30,
    minutes: 30,
    description: 'Grade-level computation and application across all six tested strands.',
    skills: ['Whole numbers', 'Fractions, decimals, percents', 'Algebra', 'Geometry', 'Measurement', 'Data and probability'],
  },
  {
    id: 'essay',
    name: 'Essay',
    shortName: 'Essay',
    questions: 1,
    minutes: 30,
    description: 'Plan, write, and revise one organized response in your own voice.',
    skills: ['Plan', 'Clear beginning', 'Specific details', 'Strong ending', 'Review'],
  },
];

const MIDDLE_UPPER_SECTIONS: PracticeSection[] = [
  {
    id: 'verbal',
    name: 'Verbal Reasoning',
    shortName: 'Verbal',
    questions: 40,
    minutes: 20,
    description: 'Synonyms and sentence completions at a faster pace.',
    skills: ['Synonyms', 'Sentence completions', 'Context', 'Roots and word parts'],
  },
  {
    id: 'quantitative',
    name: 'Quantitative Reasoning',
    shortName: 'Quantitative',
    questions: 37,
    minutes: 35,
    description: 'Multi-step reasoning, estimation, algebraic thinking, geometry, and data.',
    skills: ['Number sense', 'Algebraic reasoning', 'Geometry', 'Data and probability'],
  },
  {
    id: 'reading',
    name: 'Reading Comprehension',
    shortName: 'Reading',
    questions: 36,
    minutes: 35,
    description: 'Longer passages across literature, humanities, science, and social studies.',
    skills: ['Main idea', 'Evidence', 'Inference', 'Vocabulary in context', 'Organization', 'Tone'],
  },
  {
    id: 'math',
    name: 'Mathematics Achievement',
    shortName: 'Math',
    questions: 47,
    minutes: 40,
    description: 'A broad, fast-moving check of grade-level mathematics and application.',
    skills: ['Numbers and operations', 'Algebra', 'Geometry', 'Measurement', 'Data and probability'],
  },
  {
    id: 'essay',
    name: 'Essay',
    shortName: 'Essay',
    questions: 1,
    minutes: 30,
    description: 'Plan, write, and revise one organized response in your own voice.',
    skills: ['Plan', 'Clear position or focus', 'Specific details', 'Organization', 'Review'],
  },
];

export const ISEE_SECTIONS_BY_LEVEL: Record<IseeLevel, PracticeSection[]> = {
  lower: LOWER_SECTIONS,
  middle: MIDDLE_UPPER_SECTIONS,
  upper: MIDDLE_UPPER_SECTIONS,
};

/** Backward-compatible Lower Level export used by the existing audit scripts. */
export const ISEE_SECTIONS = ISEE_SECTIONS_BY_LEVEL.lower;

export const ESSAY_PROMPTS = [
  'Describe a time when you learned something important from making a mistake.',
  'What is one rule you would change at school, and why?',
  'Describe a person who has taught you something valuable.',
  'If you could create a new holiday, what would it celebrate and how would people observe it?',
  'Tell about a time when helping someone else changed your day.',
  'Which quality makes someone a good friend? Explain with examples.',
  'Describe a place where you feel especially comfortable or inspired.',
  'If you could master one new skill instantly, what would it be and how would you use it?',
  'Tell about a difficult choice you made and what happened afterward.',
  'What is one invention that would make your community better?',
  'Describe a tradition that matters to you or your family.',
  'Should students have homework every night? Explain your position.',
];

export type MathStrand =
  | 'Whole Numbers'
  | 'Fractions, Decimals, and Percents'
  | 'Algebraic Concepts'
  | 'Geometry'
  | 'Measurement'
  | 'Data Analysis and Probability';

export const MATH_BLUEPRINT_COUNTS: Record<MathStrand, number> = {
  'Whole Numbers': 5,
  'Fractions, Decimals, and Percents': 6,
  'Algebraic Concepts': 5,
  Geometry: 4,
  Measurement: 4,
  'Data Analysis and Probability': 6,
};

export type QuantStrand =
  | 'Number Sense and Estimation'
  | 'Patterns and Algebraic Reasoning'
  | 'Geometry and Measurement'
  | 'Data and Probability'
  | 'Logic and Non-routine Problems';

const QUANT_BLUEPRINT_COUNTS: Record<QuantStrand, number> = {
  'Number Sense and Estimation': 7,
  'Patterns and Algebraic Reasoning': 9,
  'Geometry and Measurement': 7,
  'Data and Probability': 10,
  'Logic and Non-routine Problems': 5,
};

export function mathStrandForTopic(topic = ''): MathStrand {
  if (/mean|median|mode|range|probability|data|table|graph|chart/i.test(topic)) {
    return 'Data Analysis and Probability';
  }
  if (/elapsed|time|money|liquid|metric|inch|feet|minute|hour|temperature|volume|unit conversion/i.test(topic)) {
    return 'Measurement';
  }
  if (/area|perimeter|angle|triangle|parallelogram|shape|geometry|coordinate|symmetry|polygon/i.test(topic)) {
    return 'Geometry';
  }
  if (/fraction|decimal|percent|ratio|unit rate|mixed number|improper/i.test(topic)) {
    return 'Fractions, Decimals, and Percents';
  }
  if (/unknown|equation|expression|operation|rule|variable|pattern|negative/i.test(topic)) {
    return 'Algebraic Concepts';
  }
  return 'Whole Numbers';
}

export function quantStrandForTopic(topic = ''): QuantStrand {
  if (/probability|mean|median|mode|range|table|graph|pictograph|tally|data/i.test(topic)) {
    return 'Data and Probability';
  }
  if (/area|perimeter|side|symmetry|polygon|coordinate|axis|distance|measurement|weight|scale|time/i.test(topic)) {
    return 'Geometry and Measurement';
  }
  if (/sequence|pattern|term|function|machine|equation|operation|inequality|n\^|evaluate/i.test(topic)) {
    return 'Patterns and Algebraic Reasoning';
  }
  if (/riddle|clue|ordering|sharing|balance/i.test(topic)) {
    return 'Logic and Non-routine Problems';
  }
  return 'Number Sense and Estimation';
}

export function sectionById(id: PracticeSectionId, level: IseeLevel = 'lower'): PracticeSection {
  const section = ISEE_SECTIONS_BY_LEVEL[level].find((candidate) => candidate.id === id);
  if (!section) throw new Error(`Unknown ISEE section: ${id}`);
  return section;
}

function shuffled<T>(items: T[], rng: () => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function seeded(seed: number): () => number {
  return mulberry32((seed >>> 0) || 1);
}

function minimumDifficulty(level: IseeLevel): 1 | 2 | 3 {
  return level === 'upper' ? 3 : level === 'middle' ? 2 : 1;
}

function practiceVerbal(
  rng: () => number,
  count: number,
  level: IseeLevel,
  excluded: Set<string>,
): Question[] {
  const minimum = minimumDifficulty(level);
  const verbal = STATIC_QUESTIONS.filter(
    (question) => question.subject === 'verbal' && !excluded.has(question.id),
  );
  const leveled = verbal.filter((question) => question.difficulty >= minimum);
  // Sentence-completion coverage matters more than an artificial difficulty
  // badge. If a higher-level slice is too small for the official 40-question
  // shape, broaden one step while keeping the protected source items unchanged.
  const source =
    leveled.filter((question) => question.kind === 'sentence_completion').length >=
    Math.floor(count / 2)
      ? leveled
      : verbal.filter((question) => question.difficulty >= Math.max(1, minimum - 1));
  const synonyms = shuffled(
    source.filter((question) => question.kind === 'synonym'),
    rng,
  );
  const completions = shuffled(
    source.filter((question) => question.kind === 'sentence_completion'),
    rng,
  );
  const synonymCount = count === 34 ? 17 : Math.round(count / 2);
  const completionCount = count - synonymCount;
  if (count === 34) {
    const singleWord = shuffled(
      completions.filter((question) => question.topic === 'sentence completion: single word'),
      rng,
    );
    const phrase = shuffled(
      completions.filter((question) => question.topic === 'sentence completion: phrase'),
      rng,
    );
    if (singleWord.length >= 11 && phrase.length >= 6) {
      return shuffled(
        [...synonyms.slice(0, 17), ...singleWord.slice(0, 11), ...phrase.slice(0, 6)],
        rng,
      );
    }
  }
  return shuffled(
    [...synonyms.slice(0, synonymCount), ...completions.slice(0, completionCount)],
    rng,
  );
}

function takeTemplates(
  groups: Array<{ templates: QuestionTemplate[]; count: number }>,
  rng: () => number,
): Question[] {
  const result: Question[] = [];
  for (const group of groups) {
    const pool = shuffled(group.templates, rng);
    for (let index = 0; index < group.count && index < pool.length; index += 1) {
      result.push(instantiate(pool[index], rng));
    }
  }
  return shuffled(result, rng);
}

function practiceTemplates(
  subject: Extract<Subject, 'math' | 'quantitative'>,
  rng: () => number,
  count: number,
  level: IseeLevel,
  excluded: Set<string>,
): Question[] {
  const minimum = minimumDifficulty(level);
  const templates = shuffled(
    ALL_TEMPLATES.filter(
      (template) =>
        template.subject === subject &&
        template.difficulty >= minimum &&
        !excluded.has(template.id),
    ),
    rng,
  );
  if (templates.length === 0) return [];

  // Full sections are stratified instead of blindly random. This prevents a
  // "math test" that happens to contain twelve fraction questions and no data,
  // or a reasoning section with patterns but no probability.
  if (subject === 'math' && count === 30) {
    return takeTemplates(
      Object.entries(MATH_BLUEPRINT_COUNTS).map(([strand, target]) => ({
        templates: templates.filter(
          (template) => mathStrandForTopic(template.topic) === strand,
        ),
        count: target,
      })),
      rng,
    );
  }
  if (subject === 'quantitative' && count === 38) {
    return takeTemplates(
      Object.entries(QUANT_BLUEPRINT_COUNTS).map(([strand, target]) => ({
        templates: templates.filter(
          (template) => quantStrandForTopic(template.topic) === strand,
        ),
        count: target,
      })),
      rng,
    );
  }

  return Array.from({ length: count }, (_, index) =>
    instantiate(templates[index % templates.length], rng),
  );
}

type PassageGroup = { passageId: string; questions: Question[] };

export function readingPassageGroups(level: IseeLevel = 'lower'): PassageGroup[] {
  const minimum = minimumDifficulty(level);
  const byPassage = new Map<string, Question[]>();
  for (const question of STATIC_QUESTIONS.filter(
    (candidate) => candidate.subject === 'reading' && candidate.difficulty >= minimum,
  )) {
    const passageId = question.passageId ?? question.id;
    const group = byPassage.get(passageId) ?? [];
    group.push(question);
    byPassage.set(passageId, group);
  }
  return [...byPassage].map(([passageId, questions]) => ({ passageId, questions }));
}

function practiceReading(
  rng: () => number,
  count: number,
  level: IseeLevel,
  excluded: Set<string>,
): Question[] {
  const groups = readingPassageGroups(level)
    .filter((group) => !excluded.has(`passage:${group.passageId}`))
    .map((group) => ({
      ...group,
      questions: group.questions.filter((question) => !excluded.has(question.id)),
    }))
    .filter((group) => group.questions.length > 0);
  const fiveQuestionGroups = shuffled(
    groups.filter((group) => group.questions.length >= 5),
    rng,
  );

  // A full section mirrors the official five-passage shape. Older banks may not
  // yet have five questions per passage, so the fallback still avoids repeating
  // a question and uses as few additional passages as possible.
  if (count === 25 && fiveQuestionGroups.length >= 5) {
    return fiveQuestionGroups
      .slice(0, 5)
      .flatMap((group) => shuffled(group.questions, rng).slice(0, 5));
  }

  const result: Question[] = [];
  for (const group of shuffled(groups, rng)) {
    for (const question of shuffled(group.questions, rng)) {
      result.push(question);
      if (result.length === count) return result;
    }
  }
  return result;
}

export function buildPracticeSection(
  id: Exclude<PracticeSectionId, 'essay'>,
  seed = Date.now(),
  requestedCount?: number,
  level: IseeLevel = 'lower',
  excludedContentKeys: string[] = [],
): Question[] {
  const rng = seeded(seed);
  const excluded = new Set(excludedContentKeys);
  const count = requestedCount ?? sectionById(id, level).questions;
  if (id === 'verbal') return practiceVerbal(rng, count, level, excluded);
  if (id === 'reading') return practiceReading(rng, count, level, excluded);
  return practiceTemplates(id, rng, count, level, excluded);
}

export function essayPrompt(seed = Date.now()): string {
  const rng = seeded(seed);
  return ESSAY_PROMPTS[Math.floor(rng() * ESSAY_PROMPTS.length)];
}

export function formatPracticeTime(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
