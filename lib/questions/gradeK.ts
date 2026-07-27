import {
  buildChoices,
  num,
  pick,
  randInt,
  type QuestionTemplate,
  type Rng,
} from './templates';
import type { CountingPictureItem } from './types';

/**
 * Kindergarten question bank, rewritten for a child ENTERING kindergarten who
 * cannot read yet (~5 years old).
 *
 * The player app reads every prompt and every choice ALOUD (text-to-speech)
 * for this profile, and shows large structured picture groups on screen. So a
 * non-reader answers by LISTENING to the question and the choices, and/or by
 * LOOKING at the pictures, then tapping the numbered choice they heard. That
 * drives every design rule below:
 *
 *   - Prompts are natural spoken sentences a grown-up would say out loud —
 *     no symbol soup, no "___" left for the ear to parse.
 *   - Choices are always SHORT: a single number, a single color word, a
 *     single shape word, or one other short word. Long phrases are hard to
 *     tell apart by ear, so none are used as choices here.
 *   - Anything that needs a visible count carries structured `visual` data.
 *     QuestionGate renders those objects as large, spaced pictures; everything
 *     else is answerable purely by ear.
 *   - Nothing requires reading a word's letters to answer. Rhyming and
 *     first-sound questions are about SOUND, not letter shapes.
 *
 * Calibration: entering-K is a mix of late pre-K skills and the very start
 * of kindergarten, so this is deliberately easy. `difficulty` is 1 (warm-up)
 * for most templates and 2 (a small stretch) for a few; 3 never appears here
 * — that's reserved for older grades.
 *
 * Every generator is written so the candidate list passed to `buildChoices`
 * is PROVABLY at least 3 distinct values apart from the correct answer for
 * every value the random ranges can produce, not just the common case.
 * Where that took real reasoning, a comment explains why the bound holds
 * across the whole range.
 */

const COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'] as const;

/** The 4 shapes used in AB/three-item patterns — kept to exactly 4 so the
 * "other shapes" distractor pool is always well-defined (see gk-018). */
const PATTERN_SHAPES = ['circle', 'square', 'triangle', 'star'] as const;

/** Spoken number words for "compare two numbers by ear" (index 0 = "one"). */
const NUM_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** Plural, single-word nouns for "which group has more" — every element is
 * a short word by itself, so it reads quickly and distinctly by ear. */
const GROUP_ITEMS = ['pigs', 'ducks', 'frogs', 'bees', 'cats', 'dogs', 'birds', 'fish'] as const;

const ADD_ITEMS = ['apples', 'balloons', 'ducks', 'blocks', 'crayons', 'cookies'] as const;

/** "What color is X?" — one fact per color, so distractors are always the
 * other 5 colors and the pairing is unambiguous. */
const COLOR_FACTS = [
  { thing: 'the sky', color: 'blue' },
  { thing: 'grass', color: 'green' },
  { thing: 'a strawberry', color: 'red' },
  { thing: 'a banana', color: 'yellow' },
  { thing: 'an orange', color: 'orange' },
  { thing: 'grape jelly', color: 'purple' },
] as const;

/**
 * Words grouped by ending sound, for rhyme templates. Every word appears in
 * exactly one group (no word repeats across groups), and every group has at
 * least 2 words so a same-group correct answer always exists.
 */
const RHYME_GROUPS: string[][] = [
  ['cat', 'hat', 'bat', 'mat'],
  ['dog', 'log', 'frog'],
  ['sun', 'fun', 'run', 'bun'],
  ['pig', 'wig', 'dig'],
  ['hen', 'pen', 'ten'],
  ['cup', 'pup'],
  ['fox', 'box'],
  ['bed', 'red', 'sled'],
  ['car', 'star', 'jar'],
  ['moon', 'spoon'],
  ['ball', 'tall', 'wall'],
  ['fish', 'dish'],
];

/**
 * Words grouped by starting sound, for first-sound templates. Same
 * uniqueness guarantee as RHYME_GROUPS: every word is in exactly one group.
 */
const FIRST_SOUND_GROUPS: string[][] = [
  ['ball', 'bat', 'bear', 'bell'],
  ['cat', 'cow', 'cup'],
  ['dog', 'duck', 'doll'],
  ['fish', 'fox', 'frog'],
  ['hat', 'hen', 'horse'],
  ['jam', 'jet'],
  ['kite', 'key'],
  ['leg', 'log', 'lamp'],
  ['map', 'mud', 'milk'],
  ['nut', 'net', 'nest'],
  ['pig', 'pen', 'pot'],
  ['rat', 'run', 'rug'],
  ['sun', 'ship', 'sock'],
  ['top', 'ten', 'tree'],
  ['van', 'vet', 'vest'],
  ['web', 'win', 'wolf'],
  ['zip', 'zoo'],
];

const GROUP_PICTURES: Record<(typeof GROUP_ITEMS)[number], CountingPictureItem> = {
  pigs: 'pig',
  ducks: 'duck',
  frogs: 'frog',
  bees: 'bee',
  cats: 'cat',
  dogs: 'dog',
  birds: 'bird',
  fish: 'fish',
};

const ADD_PICTURES: Record<(typeof ADD_ITEMS)[number], CountingPictureItem> = {
  apples: 'apple',
  balloons: 'balloon',
  ducks: 'duck',
  blocks: 'block',
  crayons: 'crayon',
  cookies: 'cookie',
};

/** Fisher-Yates on a copy, so the source array is never mutated. */
function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Rhyme groups with at least 3 words — needed by gk-022, which shows two
 * example words and asks for a third from the SAME group. */
const RHYME_GROUPS_3PLUS = RHYME_GROUPS.filter((g) => g.length >= 3);

/** Same idea for first-sound groups, used by gk-024. */
const FIRST_SOUND_GROUPS_3PLUS = FIRST_SOUND_GROUPS.filter((g) => g.length >= 3);

export const GRADE_K_TEMPLATES: QuestionTemplate[] = [
  // --- Math: counting, one more/less, adding within 5 ----------------------
  {
    id: 'gk-001',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'count small groups',
    generate: (rng) => {
      const n = randInt(rng, 3, 6);
      const correct = num(n);
      // n-2, n-1, n+1, n+2 are four offsets from n that are pairwise distinct
      // for every n in [3,6] and never negative (smallest is n-2 >= 1).
      const { choices, answer } = buildChoices(rng, correct, [
        num(n - 1),
        num(n + 1),
        num(n + 2),
        num(n - 2),
      ]);
      return {
        prompt: 'How many stars are in the picture?',
        visual: { kind: 'counting', groups: [{ item: 'star', count: n }] },
        choices,
        answer,
        explain: `Touch each star with your eyes and count one at a time. There are ${n} stars.`,
      };
    },
  },
  {
    id: 'gk-002',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'count groups to ten',
    generate: (rng) => {
      const n = randInt(rng, 5, 10);
      const correct = num(n);
      const { choices, answer } = buildChoices(rng, correct, [
        num(n - 1),
        num(n + 1),
        num(n - 2),
        num(n + 2),
      ]);
      return {
        prompt: 'How many bright circles are in the picture?',
        visual: { kind: 'counting', groups: [{ item: 'circle', count: n }] },
        choices,
        answer,
        explain: `Point to each circle and count it once. There are ${n} circles.`,
      };
    },
  },
  {
    id: 'gk-003',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'one more than',
    generate: (rng) => {
      const n = randInt(rng, 1, 9);
      const correct = num(n + 1);
      // n is always >= 1 here, so n-1 is always >= 0 -- never a negative choice.
      const { choices, answer } = buildChoices(rng, correct, [num(n), num(n + 2), num(n - 1)]);
      return {
        prompt: `What is 1 more than ${n}?`,
        choices,
        answer,
        explain: `1 more than ${n} is ${n} and 1 more, which is ${n + 1}.`,
      };
    },
  },
  {
    id: 'gk-004',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'one less than',
    generate: (rng) => {
      const n = randInt(rng, 2, 10);
      const correct = num(n - 1);
      // n >= 2 here, so n-2 is always >= 0.
      const { choices, answer } = buildChoices(rng, correct, [num(n), num(n - 2), num(n + 1)]);
      return {
        prompt: `What is 1 less than ${n}?`,
        choices,
        answer,
        explain: `1 less than ${n} is ${n} take away 1, which is ${n - 1}.`,
      };
    },
  },
  {
    id: 'gk-005',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'number that comes right after',
    generate: (rng) => {
      const n = randInt(rng, 1, 9);
      const correct = num(n + 1);
      // n, n-1, n+2 are always three different numbers, and none of them can
      // equal n+1 for any integer n. n-1 can dip to 0 but never negative.
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
    id: 'gk-006',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'number that comes right before',
    generate: (rng) => {
      const n = randInt(rng, 2, 10);
      const correct = num(n - 1);
      // n >= 2 here, so n-2 is always >= 0 and always distinct from n-1.
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
    id: 'gk-007',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'missing number in counting order',
    generate: (rng) => {
      const start = randInt(rng, 1, 7);
      const sequence = [start, start + 1, start + 2, start + 3];
      const missingIdx = pick(rng, [1, 2] as const);
      const correctValue = sequence[missingIdx];
      const displayed = sequence.map((v, i) => (i === missingIdx ? 'blank' : String(v))).join(', ');
      const correct = num(correctValue);
      const { choices, answer } = buildChoices(rng, correct, [
        num(correctValue - 1),
        num(correctValue + 1),
        num(correctValue + 2),
      ]);
      return {
        prompt: `Count in order: ${displayed}. What number goes in the blank?`,
        choices,
        answer,
        explain: `Counting in order: ${sequence.join(', ')}. The missing number is ${correctValue}.`,
      };
    },
  },
  {
    id: 'gk-008',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'add within five (word problem)',
    generate: (rng) => {
      const a = randInt(rng, 1, 3);
      const b = randInt(rng, 1, 5 - a);
      const sum = a + b;
      const item = pick(rng, ADD_ITEMS);
      const correct = num(sum);
      // |a-b| is always strictly less than a+b when a,b > 0, so it can never
      // equal the sum; sum+1 and sum-1 obviously can't either.
      const { choices, answer } = buildChoices(rng, correct, [
        num(sum + 1),
        num(sum - 1),
        num(Math.abs(a - b)),
      ]);
      return {
        prompt: `There are ${a} ${item}. ${b} more ${item} come. How many ${item} are there now?`,
        choices,
        answer,
        explain: `Start with ${a}, then count ${b} more: ${a} and ${b} make ${sum}.`,
      };
    },
  },
  {
    id: 'gk-009',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'add within five',
    generate: (rng) => {
      const a = randInt(rng, 1, 4);
      const b = randInt(rng, 1, 5 - a);
      const sum = a + b;
      const correct = num(sum);
      const { choices, answer } = buildChoices(rng, correct, [
        num(sum + 1),
        num(sum - 1),
        num(Math.abs(a - b)),
      ]);
      return {
        prompt: `What is ${a} plus ${b}?`,
        choices,
        answer,
        explain: `Count ${a}, then ${b} more: ${a} plus ${b} is ${sum}.`,
      };
    },
  },
  {
    id: 'gk-010',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'add two small groups shown as marks',
    generate: (rng) => {
      const a = randInt(rng, 1, 3);
      const b = randInt(rng, 1, 5 - a);
      const sum = a + b;
      const item = pick(rng, ADD_ITEMS);
      const correct = num(sum);
      const { choices, answer } = buildChoices(rng, correct, [
        num(sum + 1),
        num(sum - 1),
        num(Math.abs(a - b)),
      ]);
      return {
        prompt: `Count both groups of ${item}. How many ${item} are there in all?`,
        visual: {
          kind: 'counting',
          groups: [
            { label: 'First group', item: ADD_PICTURES[item], count: a },
            { label: 'Second group', item: ADD_PICTURES[item], count: b },
          ],
        },
        choices,
        answer,
        explain: `${a} ${item} and ${b} more ${item} make ${sum} ${item} in all.`,
      };
    },
  },

  // --- Quantitative: more/less/same by ear, shapes, colors, patterns -------
  {
    id: 'gk-011',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'which group has more or fewer',
    generate: (rng) => {
      const [itemA, itemB, extra1, extra2] = shuffle(rng, GROUP_ITEMS);
      const base = randInt(rng, 2, 7);
      const delta = randInt(rng, 1, 3);
      const flip = rng() < 0.5;
      const countA = flip ? base : base + delta;
      const countB = flip ? base + delta : base;
      const askMore = rng() < 0.5;
      // countA !== countB always, since delta >= 1, so exactly one item wins.
      const aWins = askMore ? countA > countB : countA < countB;
      const correct = aWins ? itemA : itemB;
      const loser = aWins ? itemB : itemA;
      // itemA, itemB, extra1, extra2 are a 4-element permutation of
      // GROUP_ITEMS, so all four are pairwise distinct.
      const { choices, answer } = buildChoices(rng, correct, [loser, extra1, extra2]);
      return {
        prompt: `Which picture has ${askMore ? 'more' : 'fewer'} animals: the ${itemA} or the ${itemB}?`,
        visual: {
          kind: 'counting',
          groups: [
            { label: itemA, item: GROUP_PICTURES[itemA], count: countA },
            { label: itemB, item: GROUP_PICTURES[itemB], count: countB },
          ],
        },
        choices,
        answer,
        explain: `There are ${countA} ${itemA} and ${countB} ${itemB}, so the ${correct} have ${askMore ? 'more' : 'fewer'}.`,
      };
    },
  },
  {
    id: 'gk-012',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'same number or different number',
    generate: (rng) => {
      const countA = randInt(rng, 1, 8);
      const same = rng() < 0.5;
      const countB = same ? countA : countA + randInt(rng, 1, 3);
      const correct = same ? 'same' : 'different';
      const OPTIONS = ['same', 'different', 'more', 'fewer'];
      // OPTIONS has exactly 4 fixed, pairwise-distinct words, so removing the
      // correct one always leaves exactly 3 unique candidates.
      const { choices, answer } = buildChoices(
        rng,
        correct,
        OPTIONS.filter((o) => o !== correct),
      );
      return {
        prompt: 'Do these two pictures have the same number of stars, or different numbers?',
        visual: {
          kind: 'counting',
          groups: [
            { label: 'First group', item: 'star', count: countA },
            { label: 'Second group', item: 'star', count: countB },
          ],
        },
        choices,
        answer,
        explain:
          correct === 'same'
            ? `Both groups have ${countA} stars, so it is the same number.`
            : `One group has ${countA} stars and the other has ${countB} stars, so it is a different number.`,
      };
    },
  },
  {
    id: 'gk-013',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'which number is more or fewer (by ear)',
    generate: (rng) => {
      const a = randInt(rng, 1, 9);
      const b = a + randInt(rng, 1, 10 - a); // always > a, always <= 10
      const wordA = NUM_WORDS[a - 1];
      const wordB = NUM_WORDS[b - 1];
      const askMore = rng() < 0.5;
      const correct = askMore ? num(b) : num(a);
      const other = askMore ? num(a) : num(b);
      // Every number from 1-10 except a and b, so at least 8 values remain --
      // plenty to pick 2 that are automatically distinct from a, b, and each other.
      const pool = shuffle(
        rng,
        Array.from({ length: 10 }, (_, i) => i + 1).filter((v) => v !== a && v !== b),
      );
      const { choices, answer } = buildChoices(rng, correct, [
        other,
        num(pool[0]),
        num(pool[1]),
      ]);
      return {
        prompt: `Which number is ${askMore ? 'more' : 'fewer'} -- ${wordA} or ${wordB}?`,
        choices,
        answer,
        explain: `${wordA} is ${a} and ${wordB} is ${b}. ${wordB} is more than ${wordA}, so the ${askMore ? 'bigger' : 'smaller'} number is ${askMore ? b : a}.`,
      };
    },
  },
  {
    id: 'gk-014',
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
      ] as const;
      const riddle = pick(rng, riddles);
      // PATTERN_SHAPES has exactly 4 members, so filtering out the correct
      // one always leaves exactly the 3 needed distractors.
      const { choices, answer } = buildChoices(
        rng,
        riddle.answer,
        PATTERN_SHAPES.filter((s) => s !== riddle.answer),
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
    id: 'gk-015',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'sides and points of a shape',
    generate: (rng) => {
      const shapes = [
        { name: 'triangle', word: 'sides', n: 3 },
        { name: 'square', word: 'sides', n: 4 },
        { name: 'star', word: 'points', n: 5 },
      ] as const;
      const shape = pick(rng, shapes);
      const correct = num(shape.n);
      // [2,3,4,5,6] has 5 members; removing the one that equals shape.n
      // always leaves at least 3 remaining candidates.
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
    id: 'gk-016',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'color of a familiar thing',
    generate: (rng) => {
      const fact = pick(rng, COLOR_FACTS);
      const others = shuffle(rng, COLORS.filter((c) => c !== fact.color));
      const { choices, answer } = buildChoices(rng, fact.color, others);
      return {
        prompt: `What color is ${fact.thing}?`,
        choices,
        answer,
        explain: `${fact.thing[0].toUpperCase()}${fact.thing.slice(1)} is ${fact.color}.`,
      };
    },
  },
  {
    id: 'gk-017',
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
        prompt: `Listen to the pattern: ${sequence.join(', ')}. What color comes next?`,
        choices,
        answer,
        explain: `The pattern repeats ${c1}, ${c2}, so after ${sequence[sequence.length - 1]} comes ${next}.`,
      };
    },
  },
  {
    id: 'gk-018',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'repeating pattern of shapes',
    generate: (rng) => {
      const s1 = pick(rng, PATTERN_SHAPES);
      const s2 = pick(rng, PATTERN_SHAPES.filter((s) => s !== s1));
      const len = pick(rng, [4, 5] as const);
      const sequence = Array.from({ length: len }, (_, i) => (i % 2 === 0 ? s1 : s2));
      const next = len % 2 === 0 ? s1 : s2;
      const other = next === s1 ? s2 : s1;
      // PATTERN_SHAPES has exactly 4 members, so rest has exactly 2 left
      // after removing s1 and s2 -- plus `other`, that is exactly 3 distinct
      // candidates (none of the 4 members can equal more than one role here).
      const rest = PATTERN_SHAPES.filter((s) => s !== s1 && s !== s2);
      const { choices, answer } = buildChoices(rng, next, [other, ...rest]);
      return {
        prompt: `Listen to the pattern: ${sequence.join(', ')}. What shape comes next?`,
        choices,
        answer,
        explain: `The pattern repeats ${s1}, ${s2}, so after ${sequence[sequence.length - 1]} comes ${next}.`,
      };
    },
  },
  {
    id: 'gk-019',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'repeating AABB pattern of colors',
    generate: (rng) => {
      const c1 = pick(rng, COLORS);
      const c2 = pick(rng, COLORS.filter((c) => c !== c1));
      const unit = [c1, c1, c2, c2];
      const len = randInt(rng, 4, 7);
      const sequence = Array.from({ length: len }, (_, i) => unit[i % 4]);
      const next = unit[len % 4];
      const other = next === c1 ? c2 : c1;
      const rest = COLORS.filter((c) => c !== c1 && c !== c2);
      const { choices, answer } = buildChoices(rng, next, [other, ...rest]);
      return {
        prompt: `Listen to the pattern: ${sequence.join(', ')}. What color comes next?`,
        choices,
        answer,
        explain: `The pattern goes ${c1}, ${c1}, ${c2}, ${c2}, over and over, so the next color is ${next}.`,
      };
    },
  },
  {
    id: 'gk-020',
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
      // `star` never appears in `order` (order is a permutation of circle,
      // square, triangle only), so it is always a safe third distractor.
      const { choices, answer } = buildChoices(rng, next, [...others, 'star']);
      return {
        prompt: `Listen to the pattern: ${sequence.join(', ')}. What shape comes next?`,
        choices,
        answer,
        explain: `The pattern repeats ${s1}, ${s2}, ${s3} over and over, so the next shape is ${next}.`,
      };
    },
  },

  // --- Verbal: rhyming by sound, first-sound matching -----------------------
  {
    id: 'gk-021',
    subject: 'verbal',
    kind: 'synonym',
    difficulty: 1,
    topic: 'rhyming word',
    generate: (rng) => {
      const group = pick(rng, RHYME_GROUPS);
      const word0 = pick(rng, group);
      const correct = pick(rng, group.filter((w) => w !== word0));
      const otherWords = RHYME_GROUPS.filter((g) => g !== group).flat();
      const distractors = shuffle(rng, otherWords).slice(0, 3);
      const { choices, answer } = buildChoices(rng, correct, distractors);
      return {
        prompt: `Which word rhymes with ${word0}?`,
        choices,
        answer,
        explain: `${correct} rhymes with ${word0} -- they end with the same sound.`,
      };
    },
  },
  {
    id: 'gk-022',
    subject: 'verbal',
    kind: 'synonym',
    difficulty: 1,
    topic: 'rhyming word (find the third)',
    generate: (rng) => {
      const group = pick(rng, RHYME_GROUPS_3PLUS);
      const [word0, word1] = shuffle(rng, group);
      const correct = pick(rng, group.filter((w) => w !== word0 && w !== word1));
      const otherWords = RHYME_GROUPS.filter((g) => g !== group).flat();
      const distractors = shuffle(rng, otherWords).slice(0, 3);
      const { choices, answer } = buildChoices(rng, correct, distractors);
      return {
        prompt: `${word0} rhymes with ${word1}. Which other word also rhymes with ${word0}?`,
        choices,
        answer,
        explain: `${word0}, ${word1}, and ${correct} all rhyme -- they end with the same sound.`,
      };
    },
  },
  {
    id: 'gk-023',
    subject: 'verbal',
    kind: 'synonym',
    difficulty: 1,
    topic: 'first sound matching',
    generate: (rng) => {
      const group = pick(rng, FIRST_SOUND_GROUPS);
      const word0 = pick(rng, group);
      const correct = pick(rng, group.filter((w) => w !== word0));
      const otherWords = FIRST_SOUND_GROUPS.filter((g) => g !== group).flat();
      const distractors = shuffle(rng, otherWords).slice(0, 3);
      const { choices, answer } = buildChoices(rng, correct, distractors);
      return {
        prompt: `Which word starts with the same sound as ${word0}?`,
        choices,
        answer,
        explain: `${word0} and ${correct} both start with the same sound.`,
      };
    },
  },
  {
    id: 'gk-024',
    subject: 'verbal',
    kind: 'synonym',
    difficulty: 2,
    topic: 'first sound matching (find the third)',
    generate: (rng) => {
      const group = pick(rng, FIRST_SOUND_GROUPS_3PLUS);
      const [word0, word1] = shuffle(rng, group);
      const correct = pick(rng, group.filter((w) => w !== word0 && w !== word1));
      const otherWords = FIRST_SOUND_GROUPS.filter((g) => g !== group).flat();
      const distractors = shuffle(rng, otherWords).slice(0, 3);
      const { choices, answer } = buildChoices(rng, correct, distractors);
      return {
        prompt: `${word0} and ${word1} start with the same sound. Which other word also starts like ${word0}?`,
        choices,
        answer,
        explain: `${word0}, ${word1}, and ${correct} all start with the same sound.`,
      };
    },
  },
  {
    id: 'gk-025',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'add two visible groups within ten',
    generate: (rng) => {
      const a = randInt(rng, 1, 5);
      const b = randInt(rng, 1, 5);
      const total = a + b;
      const correct = num(total);
      const { choices, answer } = buildChoices(rng, correct, [
        num(total - 1),
        num(total + 1),
        num(Math.abs(a - b)),
        num(a),
      ]);
      return {
        prompt: 'Count both groups of stars. How many stars are there altogether?',
        visual: {
          kind: 'counting',
          groups: [
            { label: 'First group', item: 'star', count: a },
            { label: 'Second group', item: 'star', count: b },
          ],
        },
        choices,
        answer,
        explain: `Count both groups: ${a} stars and ${b} stars make ${total} stars.`,
      };
    },
  },
];
