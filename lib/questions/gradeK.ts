import {
  buildChoices,
  num,
  pick,
  randInt,
  type QuestionTemplate,
  type Rng,
} from './templates';

/**
 * Kindergarten (~5-year-old) question templates.
 *
 * This is the youngest bank in the app, so the bar is different from the ISEE
 * Lower Level templates elsewhere in this folder: every instance must be
 * solvable BY A KINDERGARTNER using counting, the alphabet, or shapes she has
 * already been taught — no multi-step arithmetic, no reading a paragraph, no
 * negative numbers, nothing past 20. `difficulty` here only ever takes the
 * value 1 (warm-up) or 2 (a small stretch); 3 is reserved for older grades.
 *
 * Every generator below is written so the candidate list passed to
 * `buildChoices` is PROVABLY at least 3 distinct values apart from the
 * correct answer for every value the random ranges can produce — not just
 * for typical values. Where that took real reasoning (see the "difference
 * between groups" and "letter after/before" templates) the comment explains
 * why the bound holds for the whole range, not only the common case.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Words grouped by first letter, used for "first letter" and "same starting
 * letter" templates. Every group has at least 2 words, so there is always a
 * second word available that shares the target letter.
 */
const LETTER_GROUPS: string[][] = [
  ['BUS', 'BEE', 'BAT', 'BOX', 'BED'],
  ['CAT', 'COW', 'CUP'],
  ['DOG', 'DUCK'],
  ['FOX', 'FISH', 'FROG'],
  ['HAT', 'HEN'],
  ['JAM', 'JET'],
  ['KID', 'KEY'],
  ['LOG', 'LEG', 'LAMP'],
  ['MAP', 'MUD', 'MILK'],
  ['NET', 'NUT', 'NEST'],
  ['PIG', 'PEN', 'PIN', 'POT'],
  ['RUG', 'RAT', 'RUN'],
  ['SUN', 'SHIP', 'SIT'],
  ['TOP', 'TEN', 'TREE'],
  ['VAN', 'VET', 'VEST'],
  ['WEB', 'WIN', 'WOLF'],
  ['ZOO', 'ZIP'],
];

/** Every word from every group, flattened, for "first letter"/"count letters". */
const WORDS: string[] = LETTER_GROUPS.flat();

const COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'] as const;
const SHAPES = ['circle', 'square', 'triangle', 'star'] as const;
const ADD_ITEMS = ['apples', 'balloons', 'ducks', 'blocks', 'crayons', 'cookies'] as const;
const SUB_ITEMS = ['birds', 'balloons', 'fish', 'stars', 'frogs', 'kites'] as const;

/** "* * * *" — n copies of mark, space separated, for things a kid can count on screen. */
function repeatMark(mark: string, n: number): string {
  return Array.from({ length: n }, () => mark).join(' ');
}

/** Fisher-Yates on a copy, so the source array is never mutated. */
function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export const GRADE_K_TEMPLATES: QuestionTemplate[] = [
  {
    id: 'gk-001',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'count small groups',
    generate: (rng) => {
      const n = randInt(rng, 3, 10);
      const marks = repeatMark('*', n);
      const correct = num(n);
      // n-1, n+1, n+2, n-2 are four offsets from n that are pairwise distinct
      // for every n in [3,10] and never negative (smallest is n-2 >= 1).
      const { choices, answer } = buildChoices(rng, correct, [
        num(n - 1),
        num(n + 1),
        num(n + 2),
        num(n - 2),
      ]);
      return {
        prompt: `How many stars are there? ${marks}`,
        choices,
        answer,
        explain: `Count each star one at a time: ${marks} is ${n} stars.`,
      };
    },
  },
  {
    id: 'gk-002',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'count to twenty',
    generate: (rng) => {
      const n = randInt(rng, 11, 20);
      const marks = repeatMark('o', n);
      const correct = num(n);
      const { choices, answer } = buildChoices(rng, correct, [
        num(n - 1),
        num(n + 1),
        num(n - 2),
        num(n + 2),
      ]);
      return {
        prompt: `Count the circles. How many circles are there? ${marks}`,
        choices,
        answer,
        explain: `Counting one by one, there are ${n} circles.`,
      };
    },
  },
  {
    id: 'gk-003',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'number that comes after',
    generate: (rng) => {
      const n = randInt(rng, 2, 19);
      const correct = num(n + 1);
      // n, n-1, n+2 are always three different numbers, and none of them can
      // equal n+1 for any integer n.
      const { choices, answer } = buildChoices(rng, correct, [num(n), num(n - 1), num(n + 2)]);
      return {
        prompt: `What number comes right after ${n}?`,
        choices,
        answer,
        explain: `Counting up from ${n}, the very next number is ${n + 1}.`,
      };
    },
  },
  {
    id: 'gk-004',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'number that comes before',
    generate: (rng) => {
      const n = randInt(rng, 3, 20);
      const correct = num(n - 1);
      const { choices, answer } = buildChoices(rng, correct, [num(n), num(n + 1), num(n - 2)]);
      return {
        prompt: `What number comes right before ${n}?`,
        choices,
        answer,
        explain: `Counting back from ${n}, the number just before it is ${n - 1}.`,
      };
    },
  },
  {
    id: 'gk-005',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'one more than',
    generate: (rng) => {
      const n = randInt(rng, 1, 9);
      const correct = num(n + 1);
      // n is always >= 1 here, so n-1 is always >= 0 — never a negative choice.
      const { choices, answer } = buildChoices(rng, correct, [num(n), num(n + 2), num(n - 1)]);
      return {
        prompt: `What is 1 more than ${n}?`,
        choices,
        answer,
        explain: `1 more than ${n} is ${n} + 1 = ${n + 1}.`,
      };
    },
  },
  {
    id: 'gk-006',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'one less than',
    generate: (rng) => {
      const n = randInt(rng, 2, 10);
      const correct = num(n - 1);
      const { choices, answer } = buildChoices(rng, correct, [num(n), num(n - 2), num(n + 1)]);
      return {
        prompt: `What is 1 less than ${n}?`,
        choices,
        answer,
        explain: `1 less than ${n} is ${n} - 1 = ${n - 1}.`,
      };
    },
  },
  {
    id: 'gk-007',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'add within ten (word problem)',
    generate: (rng) => {
      const a = randInt(rng, 1, 7);
      const b = randInt(rng, 1, 10 - a);
      const sum = a + b;
      const item = pick(rng, ADD_ITEMS);
      const correct = num(sum);
      // |a-b| is always strictly less than a+b when a,b > 0, so it can never
      // equal the sum; sum+1 and sum+2 obviously can't either.
      const { choices, answer } = buildChoices(rng, correct, [
        num(sum + 1),
        num(sum - 1),
        num(Math.abs(a - b)),
      ]);
      return {
        prompt: `There are ${a} ${item}. ${b} more ${item} come. How many ${item} are there now?`,
        choices,
        answer,
        explain: `Start with ${a}, then count ${b} more: ${a} + ${b} = ${sum}.`,
      };
    },
  },
  {
    id: 'gk-008',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'subtract within ten (word problem)',
    generate: (rng) => {
      const a = randInt(rng, 4, 10);
      const b = randInt(rng, 1, a - 1);
      const diff = a - b;
      const item = pick(rng, SUB_ITEMS);
      const correct = num(diff);
      // a+b can only equal diff (=a-b) if b were 0, which it never is here, so
      // it is always a safe distractor; diff+1/diff-1 are trivially distinct.
      const { choices, answer } = buildChoices(rng, correct, [
        num(a + b),
        num(diff + 1),
        num(diff - 1),
      ]);
      return {
        prompt: `There are ${a} ${item}. ${b} fly away. How many ${item} are left?`,
        choices,
        answer,
        explain: `Start with ${a}, then take away ${b}: ${a} - ${b} = ${diff}.`,
      };
    },
  },
  {
    id: 'gk-009',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'add within ten',
    generate: (rng) => {
      const a = randInt(rng, 1, 8);
      const b = randInt(rng, 1, 10 - a);
      const sum = a + b;
      const correct = num(sum);
      const { choices, answer } = buildChoices(rng, correct, [
        num(sum + 1),
        num(sum - 1),
        num(Math.abs(a - b)),
      ]);
      return {
        prompt: `What is ${a} + ${b}?`,
        choices,
        answer,
        explain: `Count ${a}, then ${b} more: ${a} + ${b} = ${sum}.`,
      };
    },
  },
  {
    id: 'gk-010',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'subtract within ten',
    generate: (rng) => {
      const a = randInt(rng, 2, 10);
      const b = randInt(rng, 1, a - 1);
      const diff = a - b;
      const correct = num(diff);
      const { choices, answer } = buildChoices(rng, correct, [
        num(a + b),
        num(diff + 1),
        num(diff - 1),
      ]);
      return {
        prompt: `What is ${a} - ${b}?`,
        choices,
        answer,
        explain: `${a} take away ${b} is ${a} - ${b} = ${diff}.`,
      };
    },
  },
  {
    id: 'gk-011',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'missing number in counting order',
    generate: (rng) => {
      const start = randInt(rng, 1, 7);
      const sequence = [start, start + 1, start + 2, start + 3];
      const missingIdx = pick(rng, [1, 2] as const);
      const correctValue = sequence[missingIdx];
      const displayed = sequence.map((v, i) => (i === missingIdx ? '___' : String(v))).join(', ');
      const correct = num(correctValue);
      const { choices, answer } = buildChoices(rng, correct, [
        num(correctValue - 1),
        num(correctValue + 1),
        num(correctValue + 2),
      ]);
      return {
        prompt: `Which number is missing? ${displayed}`,
        choices,
        answer,
        explain: `Counting in order: ${sequence.join(', ')}. The missing number is ${correctValue}.`,
      };
    },
  },
  {
    id: 'gk-012',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'compare group sizes',
    generate: (rng) => {
      const base = randInt(rng, 2, 7);
      const delta = randInt(rng, 1, 3);
      const flip = rng() < 0.5;
      const countA = flip ? base : base + delta;
      const countB = flip ? base + delta : base;
      const askMore = rng() < 0.5;
      // countA !== countB always, since delta >= 1, so exactly one group wins.
      const aWins = askMore ? countA > countB : countA < countB;
      const correct = aWins ? 'Group A' : 'Group B';
      const other = aWins ? 'Group B' : 'Group A';
      const { choices, answer } = buildChoices(rng, correct, [
        other,
        'They have the same number of stars',
        'Not enough information',
      ]);
      return {
        prompt: `Group A: ${repeatMark('*', countA)}. Group B: ${repeatMark('*', countB)}. Which group has ${askMore ? 'more' : 'fewer'} stars?`,
        choices,
        answer,
        explain: `Group A has ${countA} stars and Group B has ${countB} stars, so ${correct} has ${askMore ? 'more' : 'fewer'}.`,
      };
    },
  },
  {
    id: 'gk-013',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'shape riddle',
    generate: (rng) => {
      const riddles = [
        {
          desc: 'This shape is round and has no corners.',
          answer: 'circle',
          explain: 'A circle is round all the way around and has no corners at all.',
        },
        {
          desc: 'This shape has exactly 3 sides.',
          answer: 'triangle',
          explain: 'A triangle is the shape with exactly 3 straight sides.',
        },
        {
          desc: 'This shape has 4 sides that are all the same length.',
          answer: 'square',
          explain: 'A square has 4 sides, and every side is the same length.',
        },
        {
          desc: 'This shape has 5 points.',
          answer: 'star',
          explain: 'A star shape has 5 points sticking out.',
        },
        {
          desc: 'This shape has 4 sides, but the sides are not all the same length.',
          answer: 'rectangle',
          explain: 'A rectangle has 4 sides like a square, but two of the sides are longer.',
        },
      ] as const;
      const riddle = pick(rng, riddles);
      const allShapes = ['circle', 'triangle', 'square', 'star', 'rectangle'];
      const { choices, answer } = buildChoices(
        rng,
        riddle.answer,
        allShapes.filter((s) => s !== riddle.answer),
      );
      return {
        prompt: `${riddle.desc} Which shape is it?`,
        choices,
        answer,
        explain: riddle.explain,
      };
    },
  },
  {
    id: 'gk-014',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'sides and points of a shape',
    generate: (rng) => {
      const shapes = [
        { name: 'triangle', word: 'sides', n: 3 },
        { name: 'square', word: 'sides', n: 4 },
        { name: 'rectangle', word: 'sides', n: 4 },
        { name: 'star', word: 'points', n: 5 },
      ] as const;
      const shape = pick(rng, shapes);
      const correct = num(shape.n);
      const { choices, answer } = buildChoices(
        rng,
        correct,
        [2, 3, 4, 5, 6].filter((v) => v !== shape.n).map(num),
      );
      return {
        prompt: `How many ${shape.word} does a ${shape.name} have?`,
        choices,
        answer,
        explain: `A ${shape.name} has ${shape.n} ${shape.word}.`,
      };
    },
  },
  {
    id: 'gk-015',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'repeating pattern of colors',
    generate: (rng) => {
      const c1 = pick(rng, COLORS);
      const c2 = pick(rng, COLORS.filter((c) => c !== c1));
      const len = pick(rng, [4, 5] as const);
      const sequence = Array.from({ length: len }, (_, i) => (i % 2 === 0 ? c1 : c2));
      const next = len % 2 === 0 ? c1 : c2;
      const other = next === c1 ? c2 : c1;
      const rest = COLORS.filter((c) => c !== c1 && c !== c2);
      const { choices, answer } = buildChoices(rng, next, [other, ...rest]);
      return {
        prompt: `What comes next in the pattern? ${sequence.join(', ')}, ___`,
        choices,
        answer,
        explain: `The pattern repeats ${c1}, ${c2}, so after ${sequence[sequence.length - 1]} comes ${next}.`,
      };
    },
  },
  {
    id: 'gk-016',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'repeating pattern of shapes',
    generate: (rng) => {
      const s1 = pick(rng, SHAPES);
      const s2 = pick(rng, SHAPES.filter((s) => s !== s1));
      const len = pick(rng, [4, 5] as const);
      const sequence = Array.from({ length: len }, (_, i) => (i % 2 === 0 ? s1 : s2));
      const next = len % 2 === 0 ? s1 : s2;
      const other = next === s1 ? s2 : s1;
      const rest = SHAPES.filter((s) => s !== s1 && s !== s2);
      const { choices, answer } = buildChoices(rng, next, [other, ...rest]);
      return {
        prompt: `What comes next in the pattern? ${sequence.join(', ')}, ___`,
        choices,
        answer,
        explain: `The pattern repeats ${s1}, ${s2}, so after ${sequence[sequence.length - 1]} comes ${next}.`,
      };
    },
  },
  {
    id: 'gk-017',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'repeating pattern of three shapes',
    generate: (rng) => {
      const base = ['circle', 'square', 'triangle'] as const;
      const [s1, s2, s3] = shuffle(rng, base);
      const order = [s1, s2, s3];
      const len = pick(rng, [6, 7] as const);
      const sequence = Array.from({ length: len }, (_, i) => order[i % 3]);
      const next = order[len % 3];
      const others = order.filter((s) => s !== next);
      const { choices, answer } = buildChoices(rng, next, [...others, 'star']);
      return {
        prompt: `What comes next in the pattern? ${sequence.join(', ')}, ___`,
        choices,
        answer,
        explain: `The pattern repeats ${s1}, ${s2}, ${s3} over and over, so the next shape is ${next}.`,
      };
    },
  },
  {
    id: 'gk-018',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'how many more in one group',
    generate: (rng) => {
      const b = randInt(rng, 1, 6);
      const extra = randInt(rng, 1, 4);
      const a = b + extra;
      const correct = num(extra);
      // a, b, a+b, and 0 are pairwise distinct for any a > b > 0 (a != b since
      // a = b + extra with extra >= 1; a+b > a since b >= 1; none is 0 since
      // a,b >= 1). Only b can ever coincide with the correct value `extra`
      // (when a = 2b) — buildChoices' own de-dup handles that by discarding
      // b and still finding 3 unique values among {a, a+b, 0}.
      const { choices, answer } = buildChoices(rng, correct, [num(a), num(b), num(a + b), num(0)]);
      return {
        prompt: `Group A: ${repeatMark('*', a)}. Group B: ${repeatMark('*', b)}. How many more stars does Group A have than Group B?`,
        choices,
        answer,
        explain: `Group A has ${a} stars and Group B has ${b} stars. ${a} - ${b} = ${extra}, so Group A has ${extra} more.`,
      };
    },
  },
  {
    id: 'gk-019',
    subject: 'verbal',
    kind: 'synonym',
    difficulty: 1,
    topic: 'letter that comes after',
    generate: (rng) => {
      const idx = randInt(rng, 1, 23);
      const letter = ALPHABET[idx];
      const next = ALPHABET[idx + 1];
      const prev = ALPHABET[idx - 1];
      const plus2 = ALPHABET[idx + 2];
      const { choices, answer } = buildChoices(rng, next, [letter, prev, plus2]);
      return {
        prompt: `Which letter comes right after ${letter}?`,
        choices,
        answer,
        explain: `The alphabet goes in order, so right after ${letter} comes ${next}.`,
      };
    },
  },
  {
    id: 'gk-020',
    subject: 'verbal',
    kind: 'synonym',
    difficulty: 1,
    topic: 'letter that comes before',
    generate: (rng) => {
      const idx = randInt(rng, 2, 24);
      const letter = ALPHABET[idx];
      const prev = ALPHABET[idx - 1];
      const prev2 = ALPHABET[idx - 2];
      const next = ALPHABET[idx + 1];
      const { choices, answer } = buildChoices(rng, prev, [letter, prev2, next]);
      return {
        prompt: `Which letter comes right before ${letter}?`,
        choices,
        answer,
        explain: `The alphabet goes in order, so right before ${letter} comes ${prev}.`,
      };
    },
  },
  {
    id: 'gk-021',
    subject: 'verbal',
    kind: 'synonym',
    difficulty: 1,
    topic: 'first letter of a word',
    generate: (rng) => {
      const word = pick(rng, WORDS);
      const correct = word[0];
      const others = shuffle(rng, ALPHABET.split('').filter((c) => c !== correct)).slice(0, 3);
      const { choices, answer } = buildChoices(rng, correct, others);
      return {
        prompt: `What is the first letter in the word ${word}?`,
        choices,
        answer,
        explain: `${word} starts with the letter ${correct}.`,
      };
    },
  },
  {
    id: 'gk-022',
    subject: 'verbal',
    kind: 'synonym',
    difficulty: 2,
    topic: 'missing letter in the alphabet',
    generate: (rng) => {
      const idx = randInt(rng, 1, 22);
      const letters = [0, 1, 2, 3].map((i) => ALPHABET[idx + i]);
      const missingIdx = pick(rng, [1, 2] as const);
      const correct = letters[missingIdx];
      const displayed = letters.map((c, i) => (i === missingIdx ? '___' : c)).join(', ');
      const pool = shuffle(rng, ALPHABET.split('').filter((c) => !letters.includes(c))).slice(0, 3);
      const { choices, answer } = buildChoices(rng, correct, pool);
      return {
        prompt: `Which letter is missing? ${displayed}`,
        choices,
        answer,
        explain: `In order, the alphabet here reads ${letters.join(', ')}. The missing letter is ${correct}.`,
      };
    },
  },
  {
    id: 'gk-023',
    subject: 'verbal',
    kind: 'synonym',
    difficulty: 2,
    topic: 'count the letters in a word',
    generate: (rng) => {
      const word = pick(rng, WORDS);
      const correct = num(word.length);
      const { choices, answer } = buildChoices(
        rng,
        correct,
        [2, 3, 4, 5, 6].filter((v) => v !== word.length).map(num),
      );
      return {
        prompt: `How many letters are in the word ${word}?`,
        choices,
        answer,
        explain: `${word.split('').join('-')} has ${word.length} letters.`,
      };
    },
  },
  {
    id: 'gk-024',
    subject: 'verbal',
    kind: 'synonym',
    difficulty: 2,
    topic: 'words that start with the same letter',
    generate: (rng) => {
      const group = pick(rng, LETTER_GROUPS);
      const word0 = pick(rng, group);
      const correct = pick(rng, group.filter((w) => w !== word0));
      const otherWords = LETTER_GROUPS.filter((g) => g !== group).flat();
      const distractors = shuffle(rng, otherWords).slice(0, 3);
      const { choices, answer } = buildChoices(rng, correct, distractors);
      return {
        prompt: `Which word starts with the same letter as ${word0}?`,
        choices,
        answer,
        explain: `${word0} and ${correct} both start with the letter ${word0[0]}.`,
      };
    },
  },
];
