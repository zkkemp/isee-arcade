import {
  buildChoices,
  frac,
  money,
  num,
  pick,
  randInt,
  type QuestionTemplate,
  type Rng,
} from './templates';

/**
 * Third grade (~8-9 years old) question bank.
 *
 * Sits BELOW the ISEE Lower Level templates in lib/questions/mathTemplates.ts
 * and lib/questions/quantTemplates.ts -- same generator pattern (a template
 * regenerates its numbers every serve, so the answer cannot be memorized),
 * but every range is calibrated for a 3rd grader: multiplication/division
 * facts through 10, 2-3 digit addition/subtraction with regrouping, an
 * intro to fractions, elapsed/clock time, money, rounding, place value to
 * the thousands, and whole-number rectangle area/perimeter. Distractors are
 * always computed wrong answers (a realistic slip), never random numbers.
 *
 * A handful of grade-3 vocabulary synonym templates round out 'verbal'.
 * These are deliberately easier than the ISEE word lists in verbal.ts and
 * lib/questions/vocab/*.ts, and every target word here is checked to avoid
 * those lists.
 */

/** Minutes-past-midnight (12-hour clock) -> "4:05". */
function clockG3(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 12;
  const m = ((totalMinutes % 60) + 60) % 60;
  return `${h === 0 ? 12 : h}:${String(m).padStart(2, '0')}`;
}

type SynonymEntry = readonly [word: string, correct: string, wrong1: string, wrong2: string, wrong3: string];

/** Builds a synonym template that draws one word per serve from a curated pool. */
function synonymTemplate(
  id: string,
  topic: string,
  difficulty: 1 | 2 | 3,
  pool: readonly SynonymEntry[],
): QuestionTemplate {
  return {
    id,
    subject: 'verbal',
    kind: 'synonym',
    difficulty,
    topic,
    generate: (rng: Rng) => {
      const [word, correct, w1, w2, w3] = pick(rng, pool);
      const { choices, answer } = buildChoices(rng, correct, [w1, w2, w3]);
      return {
        prompt: word,
        choices,
        answer,
        explain: `${word} means about the same thing as "${correct}".`,
      };
    },
  };
}

const POOL_FEELINGS_SIZE: readonly SynonymEntry[] = [
  ['HAPPY', 'glad', 'sad', 'sleepy', 'angry'],
  ['SAD', 'unhappy', 'happy', 'brave', 'loud'],
  ['ANGRY', 'mad', 'calm', 'quiet', 'shy'],
  ['SCARED', 'afraid', 'proud', 'friendly', 'lucky'],
  ['TIRED', 'sleepy', 'excited', 'hungry', 'thirsty'],
  ['BIG', 'large', 'tiny', 'narrow', 'short'],
  ['SMALL', 'tiny', 'huge', 'wide', 'tall'],
];

const POOL_SPEED_SOUND: readonly SynonymEntry[] = [
  ['FAST', 'quick', 'slow', 'heavy', 'shy'],
  ['LOUD', 'noisy', 'quiet', 'small', 'kind'],
  ['QUIET', 'silent', 'loud', 'angry', 'fast'],
  ['START', 'begin', 'stop', 'jump', 'end'],
  ['STOP', 'halt', 'go', 'begin', 'run'],
  ['FUNNY', 'silly', 'serious', 'gentle', 'plain'],
  ['SMART', 'clever', 'confused', 'lazy', 'shy'],
];

const POOL_KINDNESS_TOUGH: readonly SynonymEntry[] = [
  ['KIND', 'nice', 'mean', 'rude', 'lazy'],
  ['BRAVE', 'fearless', 'scared', 'weak', 'shy'],
  ['STRONG', 'powerful', 'weak', 'tiny', 'soft'],
  ['GENTLE', 'soft', 'rough', 'loud', 'angry'],
  ['MESSY', 'untidy', 'neat', 'clean', 'quiet'],
  ['NEAT', 'tidy', 'messy', 'dirty', 'wild'],
  ['CAREFUL', 'cautious', 'careless', 'quick', 'noisy'],
];

const POOL_APPEARANCE_TEMP: readonly SynonymEntry[] = [
  ['PRETTY', 'beautiful', 'ugly', 'plain', 'boring'],
  ['UGLY', 'unattractive', 'pretty', 'shiny', 'neat'],
  ['EASY', 'simple', 'hard', 'strange', 'heavy'],
  ['HARD', 'difficult', 'easy', 'soft', 'light'],
  ['NEW', 'brand-new', 'old', 'broken', 'used'],
  ['OLD', 'aged', 'new', 'fresh', 'young'],
  ['WARM', 'toasty', 'cold', 'freezing', 'wet'],
];

export const GRADE_3_TEMPLATES: QuestionTemplate[] = [
  {
    id: 'g3-001',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'multiplication facts to 10',
    generate: (rng) => {
      const a = randInt(rng, 2, 10);
      const b = randInt(rng, 2, 10);
      const product = a * b;
      const correct = num(product);
      const { choices, answer } = buildChoices(rng, correct, [
        num(product + a), // counted one extra group of a
        num(product - a), // one group short
        num(product + b),
        num(product - b),
        num(a + b), // added instead of multiplying
        num(product + 1),
        num(product - 1),
        num(product + 2),
      ]);
      return {
        prompt: `What is ${a} x ${b}?`,
        choices,
        answer,
        explain: `${a} groups of ${b} make ${a} x ${b} = ${correct}.`,
      };
    },
  },
  {
    id: 'g3-002',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'division facts to 10',
    generate: (rng) => {
      const divisor = randInt(rng, 2, 10);
      const quotient = randInt(rng, 2, 10);
      const dividend = divisor * quotient;
      const correct = num(quotient);
      const { choices, answer } = buildChoices(rng, correct, [
        num(quotient + 1),
        num(quotient - 1),
        num(quotient + 2),
        num(divisor),
        num(dividend - divisor), // subtracted the divisor once instead of dividing
      ]);
      return {
        prompt: `What is ${dividend} / ${divisor}?`,
        choices,
        answer,
        explain: `${divisor} x ${quotient} = ${dividend}, so ${dividend} / ${divisor} = ${quotient}.`,
      };
    },
  },
  {
    id: 'g3-003',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'multiply then add',
    generate: (rng) => {
      const a = randInt(rng, 2, 9);
      const b = randInt(rng, 2, 9);
      const c = randInt(rng, 1, 9);
      const product = a * b;
      const total = product + c;
      const correct = num(total);
      const { choices, answer } = buildChoices(rng, correct, [
        num(a * (b + c)), // added c before multiplying
        num(product), // forgot to add c
        num(total + 1),
        num(total - 1),
        num(total + 2),
        num(total - 2),
        num(c),
      ]);
      return {
        prompt: `What is (${a} x ${b}) + ${c}?`,
        choices,
        answer,
        explain: `Multiply first: ${a} x ${b} = ${product}. Then add: ${product} + ${c} = ${correct}.`,
      };
    },
  },
  {
    id: 'g3-004',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'multiply then subtract',
    generate: (rng) => {
      const a = randInt(rng, 2, 9);
      const b = randInt(rng, 2, 9);
      const product = a * b;
      const c = randInt(rng, 1, product - 1);
      const total = product - c;
      const correct = num(total);
      const { choices, answer } = buildChoices(rng, correct, [
        num(product + c), // added instead of subtracting
        num(product), // forgot to subtract c
        num(total + 1),
        num(total - 1),
        num(c),
      ]);
      return {
        prompt: `What is (${a} x ${b}) - ${c}?`,
        choices,
        answer,
        explain: `Multiply first: ${a} x ${b} = ${product}. Then subtract: ${product} - ${c} = ${correct}.`,
      };
    },
  },
  {
    id: 'g3-005',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: '2-digit addition with regrouping',
    generate: (rng) => {
      const onesA = randInt(rng, 5, 9);
      const onesB = randInt(rng, 10 - onesA, 9); // forces a carry
      const a = randInt(rng, 1, 8) * 10 + onesA;
      const b = randInt(rng, 1, 7) * 10 + onesB;
      const total = a + b;
      const correct = num(total);
      const { choices, answer } = buildChoices(rng, correct, [
        num(total - 10), // dropped the carry
        num(total + 10),
        num(total - 100),
        num(total + 100),
      ]);
      return {
        prompt: `What is ${a} + ${b}?`,
        choices,
        answer,
        explain: `In the ones column ${onesA} + ${onesB} = ${onesA + onesB}, so carry 1. Finishing the columns, ${a} + ${b} = ${correct}.`,
      };
    },
  },
  {
    id: 'g3-006',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: '2-digit subtraction with regrouping',
    generate: (rng) => {
      const aTens = randInt(rng, 4, 9);
      const onesA = randInt(rng, 0, 5);
      const bTens = randInt(rng, 1, aTens - 1); // keeps a > b regardless of ones
      const onesB = randInt(rng, onesA + 2, 9); // forces a borrow in the ones column
      const a = aTens * 10 + onesA;
      const b = bTens * 10 + onesB;
      const diff = a - b;
      const correct = num(diff);
      const { choices, answer } = buildChoices(rng, correct, [
        num(diff + 2 * (onesB - onesA)), // subtracted the small digit from the big one
        num(diff + 10),
        num(diff - 10),
        num(a + b),
      ]);
      return {
        prompt: `What is ${a} - ${b}?`,
        choices,
        answer,
        explain: `The ones column needs a borrow: ${onesA + 10} - ${onesB} = ${onesA + 10 - onesB}. Finishing the columns, ${a} - ${b} = ${correct}.`,
      };
    },
  },
  {
    id: 'g3-007',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: '3-digit addition with regrouping',
    generate: (rng) => {
      const onesA = randInt(rng, 5, 9);
      const onesB = randInt(rng, 10 - onesA, 9);
      const a = randInt(rng, 1, 6) * 100 + randInt(rng, 1, 8) * 10 + onesA;
      const b = randInt(rng, 1, 4) * 100 + randInt(rng, 1, 7) * 10 + onesB;
      const total = a + b;
      const correct = num(total);
      const { choices, answer } = buildChoices(rng, correct, [
        num(total - 10), // dropped the ones carry
        num(total - 100), // dropped a hundred
        num(total + 100),
        num(total + 10),
      ]);
      return {
        prompt: `What is ${a} + ${b}?`,
        choices,
        answer,
        explain: `In the ones column ${onesA} + ${onesB} = ${onesA + onesB}, so carry 1. Finishing the columns, ${a} + ${b} = ${correct}.`,
      };
    },
  },
  {
    id: 'g3-008',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: '3-digit subtraction with regrouping',
    generate: (rng) => {
      const hA = randInt(rng, 3, 9);
      const onesA = randInt(rng, 0, 5);
      const tensA = randInt(rng, 0, 9);
      const hB = randInt(rng, 1, hA - 1); // keeps a > b regardless of tens/ones
      const onesB = randInt(rng, onesA + 2, 9); // forces a borrow in the ones column
      const tensB = randInt(rng, 0, 9);
      const a = hA * 100 + tensA * 10 + onesA;
      const b = hB * 100 + tensB * 10 + onesB;
      const diff = a - b;
      const correct = num(diff);
      const { choices, answer } = buildChoices(rng, correct, [
        num(diff + 2 * (onesB - onesA)), // borrowed the ones column wrong
        num(diff + 10),
        num(diff - 10),
        num(diff + 100),
      ]);
      return {
        prompt: `What is ${a} - ${b}?`,
        choices,
        answer,
        explain: `Line up the columns. The ones need a borrow: ${onesA + 10} - ${onesB} = ${onesA + 10 - onesB}. Working through the rest, ${a} - ${b} = ${correct}.`,
      };
    },
  },
  {
    id: 'g3-009',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'fraction of a set',
    generate: (rng) => {
      const d = pick(rng, [2, 3, 4, 5]);
      const n = randInt(rng, 1, d - 1);
      const groups = randInt(rng, 2, 6);
      const total = d * groups;
      const part = n * groups;
      const item = pick(rng, ['stickers', 'marbles', 'crayons', 'cookies', 'toy cars']);
      const correct = num(part);
      const { choices, answer } = buildChoices(rng, correct, [
        num(total - part), // found the leftover part instead
        num(groups), // gave the size of one group instead of n groups
        num(part + groups),
        num(total),
        num(part + 1),
        num(part - 1),
        num(total - 1),
      ]);
      return {
        prompt: `A box has ${total} ${item}. ${n}/${d} of them are red. How many are red?`,
        choices,
        answer,
        explain: `${total} split into ${d} equal groups gives ${groups} in each group. Taking ${n} of those groups: ${n} x ${groups} = ${correct}.`,
      };
    },
  },
  {
    id: 'g3-010',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'identify a fraction',
    generate: (rng) => {
      const total = pick(rng, [2, 3, 4, 5, 6, 8, 10]);
      const shaded = randInt(rng, 1, total - 1);
      const correct = frac(shaded, total);
      const raw = `${shaded}/${total}`;
      const { choices, answer } = buildChoices(rng, correct, [
        frac(total - shaded, total), // read the unshaded part instead
        frac(shaded, total + 1),
        frac(shaded + 1, total),
        `${total}/${shaded}`, // flipped it
      ]);
      return {
        prompt: `A shape is cut into ${total} equal parts. ${shaded} of the parts are shaded. What fraction of the shape is shaded?`,
        choices,
        answer,
        explain:
          raw === correct
            ? `${shaded} shaded out of ${total} equal parts is the fraction ${correct}.`
            : `${shaded} shaded out of ${total} equal parts is ${raw}, which simplifies to ${correct}.`,
      };
    },
  },
  {
    id: 'g3-011',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'equivalent fractions',
    generate: (rng) => {
      const [n, d] = pick(rng, [
        [1, 2],
        [1, 3],
        [2, 3],
        [1, 4],
        [3, 4],
      ] as const);
      const rawK = randInt(rng, 2, 4);
      // With n = 1 and d = k^2 (1/4 with k=2), two of the distractors below land
      // on the same value even though their strings differ -- bump k to dodge it.
      const k = n === 1 && d === rawK * rawK ? rawK + 1 : rawK;
      // Written raw, not through frac(), or the answer would reduce back to n/d.
      const correct = `${n * k}/${d * k}`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${n + k}/${d + k}`, // added k instead of multiplying by it
        `${n}/${d * k}`, // scaled only the bottom
        `${n * k}/${d}`, // scaled only the top
        `${n * k + 1}/${d * k}`,
      ]);
      return {
        prompt: `Which fraction is equal to ${n}/${d}?`,
        choices,
        answer,
        explain: `Multiply the top and bottom by the same number: ${n} x ${k} = ${n * k} and ${d} x ${k} = ${d * k}, so ${n}/${d} = ${correct}.`,
      };
    },
  },
  {
    id: 'g3-012',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'money: making change',
    generate: (rng) => {
      const item = pick(rng, ['toy', 'book', 'snack', 'kite', 'yo-yo', 'puzzle']);
      const priceDollars = randInt(rng, 1, 4);
      const priceCents = pick(rng, [0, 25, 50, 75]);
      const price = priceDollars * 100 + priceCents;
      const paid = pick(rng, [500, 1000]);
      const change = paid - price;
      const correct = money(change);
      const { choices, answer } = buildChoices(rng, correct, [
        money(paid + price), // added instead of subtracting
        money(change + 100),
        money(change - 25),
        money(change + 25),
      ]);
      return {
        prompt: `A ${item} costs ${money(price)}. You pay with ${money(paid)}. How much change should you get back?`,
        choices,
        answer,
        explain: `Subtract the price from what you paid: ${money(paid)} - ${money(price)} = ${correct}.`,
      };
    },
  },
  {
    id: 'g3-013',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'money: adding amounts',
    generate: (rng) => {
      const name = pick(rng, ['Maya', 'Sam', 'Priya', 'Owen', 'Ava', 'Diego']);
      const aDollars = randInt(rng, 1, 6);
      const aCents = pick(rng, [0, 25, 50, 75]);
      const bDollars = randInt(rng, 1, 6);
      const bCents = pick(rng, [0, 25, 50, 75]);
      const a = aDollars * 100 + aCents;
      const b = bDollars * 100 + bCents;
      const total = a + b;
      const correct = money(total);
      const { choices, answer } = buildChoices(rng, correct, [
        money(total + 100),
        money(total - 100),
        money(Math.abs(a - b)), // subtracted instead of adding
        money(total + 25),
      ]);
      return {
        prompt: `${name} has ${money(a)}. ${name} finds ${money(b)} more. How much money does ${name} have now?`,
        choices,
        answer,
        explain: `Add the two amounts: ${money(a)} + ${money(b)} = ${correct}.`,
      };
    },
  },
  {
    id: 'g3-014',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'rounding to the nearest ten',
    generate: (rng) => {
      const tens = randInt(rng, 1, 9);
      const roundsUp = rng() < 0.5;
      const ones = roundsUp ? randInt(rng, 5, 9) : randInt(rng, 1, 4);
      const value = tens * 10 + ones;
      const down = tens * 10;
      const up = down + 10;
      const correctValue = roundsUp ? up : down;
      const correct = num(correctValue);
      const { choices, answer } = buildChoices(rng, correct, [
        num(roundsUp ? down : up), // rounded the wrong way
        num(value), // did not round at all
        num(correctValue + 10),
        num(correctValue - 10),
      ]);
      return {
        prompt: `Round ${value} to the nearest ten.`,
        choices,
        answer,
        explain: `The ones digit of ${value} is ${ones}, so round ${roundsUp ? 'up' : 'down'} to ${correct}.`,
      };
    },
  },
  {
    id: 'g3-015',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'rounding to the nearest hundred',
    generate: (rng) => {
      const hundreds = randInt(rng, 1, 9);
      const roundsUp = rng() < 0.5;
      const tail = roundsUp ? randInt(rng, 50, 99) : randInt(rng, 1, 49);
      const value = hundreds * 100 + tail;
      const down = hundreds * 100;
      const up = down + 100;
      const correctValue = roundsUp ? up : down;
      const correct = num(correctValue);
      const { choices, answer } = buildChoices(rng, correct, [
        num(roundsUp ? down : up),
        num(value),
        num(correctValue + 100),
        num(correctValue - 100),
      ]);
      return {
        prompt: `Round ${value} to the nearest hundred.`,
        choices,
        answer,
        explain: `${value} is closer to ${correct} than to ${roundsUp ? down : up}, so it rounds to ${correct}.`,
      };
    },
  },
  {
    id: 'g3-016',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'place value to the thousands',
    generate: (rng) => {
      const digits = [randInt(rng, 1, 9), randInt(rng, 1, 9), randInt(rng, 1, 9), randInt(rng, 1, 9)];
      const shown = `${digits[0]},${digits[1]}${digits[2]}${digits[3]}`;
      const places = [
        { name: 'thousands', value: 1000 },
        { name: 'hundreds', value: 100 },
        { name: 'tens', value: 10 },
        { name: 'ones', value: 1 },
      ] as const;
      const idx = randInt(rng, 0, 3);
      const digit = digits[idx];
      const place = places[idx];
      const worth = digit * place.value;
      const correct = num(worth);
      const { choices, answer } = buildChoices(
        rng,
        correct,
        places.filter((p) => p.value !== place.value).map((p) => num(digit * p.value)),
      );
      return {
        prompt: `In the number ${shown}, what is the value of the digit ${digit} in the ${place.name} place?`,
        choices,
        answer,
        explain: `That digit is in the ${place.name} place, so it is worth ${digit} x ${place.value} = ${correct}.`,
      };
    },
  },
  {
    id: 'g3-017',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'area of a rectangle',
    generate: (rng) => {
      const unit = pick(rng, ['cm', 'in', 'ft', 'm'] as const);
      const long = randInt(rng, 4, 10);
      const wide = randInt(rng, 2, 8);
      const area = long * wide;
      const correct = `${area} sq ${unit}`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${2 * (long + wide)} sq ${unit}`, // found the perimeter instead
        `${long + wide} sq ${unit}`, // added the sides
        `${area + long} sq ${unit}`,
        `${area - wide} sq ${unit}`,
        `${area + wide} sq ${unit}`,
        `${area - long} sq ${unit}`,
        `${area + 1} sq ${unit}`,
        `${area - 1} sq ${unit}`,
      ]);
      return {
        prompt: `A rectangle is ${long} ${unit} long and ${wide} ${unit} wide. What is its area?`,
        choices,
        answer,
        explain: `Area multiplies the two sides: ${long} x ${wide} = ${area} sq ${unit}.`,
      };
    },
  },
  {
    id: 'g3-018',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'perimeter of a rectangle',
    generate: (rng) => {
      const unit = pick(rng, ['cm', 'in', 'ft', 'm'] as const);
      const long = randInt(rng, 5, 15);
      const wide = randInt(rng, 2, long - 1);
      const p = 2 * (long + wide);
      const correct = `${p} ${unit}`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${long * wide} sq ${unit}`, // found the area instead
        `${long + wide} ${unit}`, // added only two sides
        `${p + 2} ${unit}`,
        `${p - 2} ${unit}`,
      ]);
      return {
        prompt: `A rectangle is ${long} ${unit} long and ${wide} ${unit} wide. What is its perimeter?`,
        choices,
        answer,
        explain: `Add all four sides: ${long} + ${wide} + ${long} + ${wide} = ${p} ${unit}.`,
      };
    },
  },
  {
    id: 'g3-019',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'elapsed time',
    generate: (rng) => {
      const startH = randInt(rng, 1, 11);
      const startM = pick(rng, [0, 5, 10, 15, 20, 30, 40, 45, 50]);
      const addM = pick(rng, [15, 20, 25, 30, 40, 45, 50]);
      const start = startH * 60 + startM;
      const end = start + addM;
      const correct = `${clockG3(end)} p.m.`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${clockG3(end + 60)} p.m.`, // added an extra hour
        `${clockG3(end - 60)} p.m.`,
        `${clockG3(end - 10)} p.m.`,
        `${clockG3(start)} p.m.`, // forgot to add the minutes at all
      ]);
      return {
        prompt: `It is ${clockG3(start)} p.m. What time will it be ${addM} minutes later?`,
        choices,
        answer,
        explain: `${addM} minutes after ${clockG3(start)} is ${correct}.`,
      };
    },
  },
  {
    id: 'g3-020',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'reading a clock',
    generate: (rng) => {
      const hour = randInt(rng, 1, 12);
      const minute = pick(rng, [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
      const correct = `${hour}:${String(minute).padStart(2, '0')}`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${hour}:${String((minute + 5) % 60).padStart(2, '0')}`,
        `${hour}:${String((minute + 55) % 60).padStart(2, '0')}`,
        `${hour === 12 ? 1 : hour + 1}:${String(minute).padStart(2, '0')}`,
        `${hour === 1 ? 12 : hour - 1}:${String(minute).padStart(2, '0')}`,
      ]);
      const minuteWord = minute === 0 ? 'points straight up at the 12' : `points at the ${minute / 5}`;
      return {
        prompt: `The hour hand points closest to the ${hour}, and the minute hand ${minuteWord}. What time is it?`,
        choices,
        answer,
        explain: `The hour hand near the ${hour} means the hour is ${hour}, and the minute hand at the ${
          minute === 0 ? '12' : minute / 5
        } means ${minute} minutes, so the time is ${correct}.`,
      };
    },
  },
  {
    id: 'g3-021',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'number pattern: add a constant',
    generate: (rng) => {
      const start = randInt(rng, 1, 10);
      const step = randInt(rng, 2, 9);
      const terms = [0, 1, 2, 3].map((i) => start + i * step);
      const correct = num(start + 4 * step);
      const { choices, answer } = buildChoices(rng, correct, [
        num(start + 5 * step), // added the step twice
        num(start + 3 * step), // repeated the last term shown, without advancing
        num(start + 4 * step - 1),
        num(start + 4 * step + 1),
        num(start + 6 * step),
      ]);
      return {
        prompt: `What number comes next? ${terms.join(', ')}, ___`,
        choices,
        answer,
        explain: `Each number is ${step} more than the one before it. ${terms[3]} + ${step} = ${correct}.`,
      };
    },
  },
  {
    id: 'g3-022',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'skip counting',
    generate: (rng) => {
      const step = pick(rng, [2, 5, 10]);
      const start = randInt(rng, 1, 6) * step;
      const terms = [0, 1, 2, 3].map((i) => start + i * step);
      const correct = num(start + 4 * step);
      const { choices, answer } = buildChoices(rng, correct, [
        num(start + 3 * step), // repeated the last term shown
        num(start + 4 * step + 1),
        num(start + 4 * step - 1),
        num(start + 5 * step),
      ]);
      return {
        prompt: `What number comes next when skip counting by ${step}s? ${terms.join(', ')}, ___`,
        choices,
        answer,
        explain: `Counting by ${step}s means adding ${step} each time. ${terms[3]} + ${step} = ${correct}.`,
      };
    },
  },
  {
    id: 'g3-023',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'compare whole numbers',
    generate: (rng) => {
      const values: number[] = [];
      while (values.length < 4) {
        const v = randInt(rng, 100, 999);
        if (!values.includes(v)) values.push(v);
      }
      const wantGreatest = rng() < 0.5;
      const sorted = values.slice().sort((a, b) => a - b);
      const winner = wantGreatest ? sorted[3] : sorted[0];
      const correct = num(winner);
      const { choices, answer } = buildChoices(
        rng,
        correct,
        values.filter((v) => v !== winner).map((v) => num(v)),
      );
      return {
        prompt: `Which number is the ${wantGreatest ? 'greatest' : 'least'}? ${values.join(', ')}`,
        choices,
        answer,
        explain: `Comparing the hundreds, tens, and ones, ${correct} is the ${wantGreatest ? 'largest' : 'smallest'} of the four numbers.`,
      };
    },
  },
  {
    id: 'g3-024',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'estimate a sum',
    generate: (rng) => {
      const a = randInt(rng, 11, 89);
      let b = randInt(rng, 11, 89);
      if ((a + b) % 10 === 5) b += 1;
      const sum = a + b;
      const nearest = Math.round(sum / 10) * 10;
      const correct = num(nearest);
      const { choices, answer } = buildChoices(rng, correct, [
        num(nearest - 10),
        num(nearest + 10),
        num(sum),
        num(nearest + 20),
      ]);
      return {
        prompt: `About how much is ${a} + ${b}? Round your answer to the nearest ten.`,
        choices,
        answer,
        explain: `${a} + ${b} = ${sum}, and ${sum} rounds to ${correct}.`,
      };
    },
  },
  {
    id: 'g3-025',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'read a bar graph',
    generate: (rng) => {
      const fruits = ['apples', 'bananas', 'grapes'] as const;
      let counts: number[];
      do {
        counts = [randInt(rng, 3, 9), randInt(rng, 3, 9), randInt(rng, 3, 9)];
      } while (new Set(counts).size !== 3);
      const line = `A bar graph shows how many kids picked each fruit: ${counts[0]} picked ${fruits[0]}, ${counts[1]} picked ${fruits[1]}, and ${counts[2]} picked ${fruits[2]}.`;
      const mode = pick(rng, ['most', 'least', 'difference'] as const);
      if (mode === 'most' || mode === 'least') {
        const wantMost = mode === 'most';
        const target = wantMost ? Math.max(...counts) : Math.min(...counts);
        const idx = counts.indexOf(target);
        const correct = fruits[idx];
        const { choices, answer } = buildChoices(rng, correct, [
          ...fruits.filter((f) => f !== correct),
          'oranges', // not one of the bars at all
        ]);
        return {
          prompt: `${line} Which fruit was picked the ${wantMost ? 'most' : 'least'}?`,
          choices,
          answer,
          explain: `${correct} has ${target}, the ${wantMost ? 'tallest' : 'shortest'} bar on the graph.`,
        };
      }
      const maxIdx = counts.indexOf(Math.max(...counts));
      const minIdx = counts.indexOf(Math.min(...counts));
      const diff = counts[maxIdx] - counts[minIdx];
      const correct = num(diff);
      const { choices, answer } = buildChoices(rng, correct, [
        num(counts[maxIdx] + counts[minIdx]),
        num(counts[maxIdx]),
        num(counts[minIdx]),
        num(diff + 1),
      ]);
      return {
        prompt: `${line} How many more kids picked ${fruits[maxIdx]} than ${fruits[minIdx]}?`,
        choices,
        answer,
        explain: `${counts[maxIdx]} - ${counts[minIdx]} = ${correct}.`,
      };
    },
  },
  {
    id: 'g3-026',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'two-step word problem: give some away',
    generate: (rng) => {
      const name = pick(rng, ['Maya', 'Jordan', 'Sam', 'Elena', 'Owen', 'Nina']);
      const item = pick(rng, ['stickers', 'pencils', 'marbles', 'trading cards']);
      const packs = randInt(rng, 2, 6);
      const perPack = randInt(rng, 3, 9);
      const total = packs * perPack;
      const giveAway = randInt(rng, 1, total - 1);
      const left = total - giveAway;
      const correct = num(left);
      const { choices, answer } = buildChoices(rng, correct, [
        num(total), // forgot to give any away
        num(total + giveAway), // added instead of subtracting
        num(left + 1),
        num(left - 1),
        num(giveAway),
      ]);
      return {
        prompt: `${name} buys ${packs} packs of ${item} with ${perPack} in each pack. ${name} gives ${giveAway} ${item} to a friend. How many does ${name} have left?`,
        choices,
        answer,
        explain: `${packs} x ${perPack} = ${total} ${item} total. Then ${total} - ${giveAway} = ${correct} left.`,
      };
    },
  },
  {
    id: 'g3-027',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 3,
    topic: 'two-step word problem: groups plus extra',
    generate: (rng) => {
      const name = pick(rng, ['Priya', 'Marcus', 'Ava', 'Diego', 'Elena']);
      const boxes = randInt(rng, 2, 5);
      const perBox = randInt(rng, 4, 9);
      const extra = randInt(rng, 2, 9);
      const total = boxes * perBox + extra;
      const correct = num(total);
      const { choices, answer } = buildChoices(rng, correct, [
        num(boxes * perBox), // forgot the extra loose crayons
        num((boxes + 1) * perBox + extra),
        num(boxes * (perBox + extra)), // multiplied the extra in too
        num(total - 1),
        num(total + 1),
      ]);
      return {
        prompt: `${name} has ${boxes} boxes of crayons with ${perBox} crayons in each box, plus ${extra} loose crayons. How many crayons does ${name} have in all?`,
        choices,
        answer,
        explain: `${boxes} x ${perBox} = ${boxes * perBox}, and ${boxes * perBox} + ${extra} = ${correct}.`,
      };
    },
  },
  synonymTemplate('g3-028', 'grade 3 synonyms: feelings and size', 1, POOL_FEELINGS_SIZE),
  synonymTemplate('g3-029', 'grade 3 synonyms: speed and sound', 1, POOL_SPEED_SOUND),
  synonymTemplate('g3-030', 'grade 3 synonyms: kindness and toughness', 2, POOL_KINDNESS_TOUGH),
  synonymTemplate('g3-031', 'grade 3 synonyms: appearance and temperature', 2, POOL_APPEARANCE_TEMP),
];
