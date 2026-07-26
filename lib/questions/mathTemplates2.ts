import {
  buildChoices,
  money,
  num,
  pick,
  randInt,
  type QuestionTemplate,
  type Rng,
} from './templates';

/**
 * Parameterized ISEE Lower Level Math Achievement templates, second set:
 * NUMBERS & OPERATIONS. These fill the gaps the first math file left open --
 * primes and factors, GCF and LCM, divisibility, squares and exponents,
 * expanded and word form, place value to the millions, comparing and ordering,
 * rounding, negative numbers, multi-step word problems, multi-digit
 * multiplication and long division, and estimation.
 *
 * Same two rules govern every generator here as in mathTemplates.ts:
 * 1. Ranges are constrained so the arithmetic stays clean and grade-level.
 * 2. Distractors are computed WRONG ANSWERS (forgot to carry, wrong place
 *    value, off by one, used the wrong operation, gave the GCF when asked for
 *    the LCM), never random numbers, and each explanation is built from the
 *    same instance numbers as its prompt.
 */

const NAMES = [
  'Maya',
  'Jordan',
  'Priya',
  'Sam',
  'Elena',
  'Marcus',
  'Ava',
  'Diego',
  'Nina',
  'Owen',
] as const;

/** k distinct items drawn from pool, in random order. */
function sample<T>(rng: Rng, pool: readonly T[], k: number): T[] {
  const copy = pool.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, k);
}

/** k distinct integers in [lo, hi]. Range must be wide enough for k. */
function distinctInts(rng: Rng, k: number, lo: number, hi: number): number[] {
  const seen = new Set<number>();
  let guard = 0;
  while (seen.size < k && guard < 5000) {
    seen.add(randInt(rng, lo, hi));
    guard += 1;
  }
  return [...seen];
}

/** 1234567 -> "1,234,567". Handles negatives. */
function commas(value: number): string {
  const neg = value < 0;
  const body = String(Math.abs(Math.trunc(value))).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ',',
  );
  return neg ? `-${body}` : body;
}

/** Sum of the digits, used by the divide-by-3-and-9 rules. */
function digitSum(n: number): number {
  return String(Math.abs(n))
    .split('')
    .reduce((s, c) => s + Number(c), 0);
}

function isPrime(n: number): boolean {
  if (n < 2) return false;
  for (let i = 2; i * i <= n; i += 1) if (n % i === 0) return false;
  return true;
}

/** Smallest divisor above 1 (equals n when n is prime). */
function smallestFactor(n: number): number {
  for (let i = 2; i * i <= n; i += 1) if (n % i === 0) return i;
  return n;
}

function factorsOf(n: number): number[] {
  const f: number[] = [];
  for (let i = 1; i <= n; i += 1) if (n % i === 0) f.push(i);
  return f;
}

// --- number-to-words, for the word-form templates -------------------------

const ONES = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
] as const;

const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'] as const;

function under100(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o ? `${TENS[t]}-${ONES[o]}` : TENS[t];
}

function under1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} hundred`);
  if (r) parts.push(under100(r));
  return parts.join(' ');
}

/** Words for whole numbers up to the millions. */
function toWords(n: number): string {
  if (n === 0) return 'zero';
  const chunks: string[] = [];
  let rem = n;
  for (const [name, val] of [
    ['million', 1000000],
    ['thousand', 1000],
  ] as const) {
    const q = Math.floor(rem / val);
    if (q) {
      chunks.push(`${under1000(q)} ${name}`);
      rem %= val;
    }
  }
  if (rem) chunks.push(under1000(rem));
  return chunks.join(', ');
}

const ORDINALS: Record<number, string> = {
  2: 'second',
  3: 'third',
  4: 'fourth',
  5: 'fifth',
  6: 'sixth',
};

/** Coprime multiplier pairs, so g x pair keeps g as the true GCF. */
const COPRIME_PAIRS = [
  [2, 3],
  [3, 4],
  [2, 5],
  [3, 5],
  [4, 5],
  [5, 6],
  [2, 7],
  [3, 7],
  [4, 7],
  [5, 8],
  [3, 8],
  [4, 9],
  [5, 7],
] as const;

export const MATH_TEMPLATES_2: QuestionTemplate[] = [
  {
    id: 'mt2-001',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'identify a prime number',
    generate: (rng) => {
      const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29] as const;
      const composites = [4, 6, 8, 9, 10, 12, 14, 15, 16, 18, 20, 21, 22, 24, 25] as const;
      const correctNum = pick(rng, primes);
      const { choices, answer } = buildChoices(
        rng,
        String(correctNum),
        sample(rng, composites, 5).map(String),
      );
      return {
        prompt: `Which of these is a prime number?`,
        choices,
        answer,
        explain: `A prime number has exactly two factors: 1 and itself. ${correctNum} cannot be split into equal groups any other way, so it is prime.`,
      };
    },
  },
  {
    id: 'mt2-002',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'identify a composite number',
    generate: (rng) => {
      const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29] as const;
      const composites = [4, 6, 8, 9, 10, 12, 14, 15, 16, 18, 20, 21, 22, 24, 25] as const;
      const correctNum = pick(rng, composites);
      const f = smallestFactor(correctNum);
      const { choices, answer } = buildChoices(
        rng,
        String(correctNum),
        sample(rng, primes, 5).map(String),
      );
      return {
        prompt: `Which of these is a composite number?`,
        choices,
        answer,
        explain: `A composite number has more than two factors. ${correctNum} = ${f} x ${correctNum / f}, so it has factors besides 1 and itself.`,
      };
    },
  },
  {
    id: 'mt2-003',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'identify a two-digit prime',
    generate: (rng) => {
      const primes = [23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97] as const;
      const composites = [21, 25, 27, 33, 35, 39, 45, 49, 51, 55, 57, 63, 65, 69, 77, 85, 91, 95] as const;
      const correctNum = pick(rng, primes);
      const { choices, answer } = buildChoices(
        rng,
        String(correctNum),
        sample(rng, composites, 5).map(String),
      );
      return {
        prompt: `Which of these two-digit numbers is prime?`,
        choices,
        answer,
        explain: `${correctNum} has no factors except 1 and ${correctNum}. The others each break into smaller factors, so only ${correctNum} is prime.`,
      };
    },
  },
  {
    id: 'mt2-004',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'factor of a number',
    generate: (rng) => {
      const N = pick(rng, [12, 18, 20, 24, 28, 30, 36, 40, 45, 48]);
      const facs = factorsOf(N).filter((f) => f > 1 && f < N);
      const correctFac = pick(rng, facs);
      const nonFacs: number[] = [];
      for (let x = 2; x < N; x += 1) if (N % x !== 0) nonFacs.push(x);
      const { choices, answer } = buildChoices(
        rng,
        String(correctFac),
        sample(rng, nonFacs, 5).map(String),
      );
      return {
        prompt: `Which number is a factor of ${N}?`,
        choices,
        answer,
        explain: `${correctFac} is a factor of ${N} because ${N} / ${correctFac} = ${N / correctFac} with nothing left over.`,
      };
    },
  },
  {
    id: 'mt2-005',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'count the factors of a number',
    generate: (rng) => {
      const N = pick(rng, [12, 16, 18, 20, 24, 28, 30, 36, 40]);
      const facs = factorsOf(N);
      const count = facs.length;
      const { choices, answer } = buildChoices(rng, String(count), [
        String(count - 2), // forgot both 1 and the number itself
        String(count - 1), // forgot to count the number itself
        String(count + 1),
        String(count + 2),
      ]);
      return {
        prompt: `How many factors does ${N} have?`,
        choices,
        answer,
        explain: `The factors of ${N} are ${facs.join(', ')}. Counting them gives ${count} factors.`,
      };
    },
  },
  {
    id: 'mt2-006',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'not a factor of a number',
    generate: (rng) => {
      const N = pick(rng, [12, 18, 20, 24, 30, 36, 40, 48]);
      const facs = factorsOf(N).filter((f) => f > 1);
      const nonFacs: number[] = [];
      for (let x = 2; x < N; x += 1) if (N % x !== 0) nonFacs.push(x);
      const correct = pick(rng, nonFacs);
      const { choices, answer } = buildChoices(
        rng,
        String(correct),
        sample(rng, facs, 5).map(String),
      );
      return {
        prompt: `Which number is NOT a factor of ${N}?`,
        choices,
        answer,
        explain: `${N} / ${correct} does not come out even, so ${correct} is not a factor. The others all divide ${N} exactly.`,
      };
    },
  },
  {
    id: 'mt2-007',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'greatest common factor',
    generate: (rng) => {
      const g = pick(rng, [3, 4, 5, 6, 7, 8, 9, 12]);
      const [m, n] = pick(rng, COPRIME_PAIRS);
      const A = g * m;
      const B = g * n;
      const correct = String(g);
      const { choices, answer } = buildChoices(rng, correct, [
        String(1), // 1 divides both, but is not the greatest
        String(g * m * n), // that is the least common multiple, not the GCF
        String(Math.min(A, B)), // just picked one of the numbers
        String(A + B),
      ]);
      return {
        prompt: `What is the greatest common factor of ${A} and ${B}?`,
        choices,
        answer,
        explain: `${A} = ${g} x ${m} and ${B} = ${g} x ${n}. The largest factor they share is ${g}.`,
      };
    },
  },
  {
    id: 'mt2-008',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 3,
    topic: 'greatest common factor',
    generate: (rng) => {
      const g = pick(rng, [6, 7, 8, 9, 10, 11, 12]);
      const [m, n] = pick(rng, COPRIME_PAIRS);
      const A = g * m;
      const B = g * n;
      const correct = String(g);
      const { choices, answer } = buildChoices(rng, correct, [
        String(g * m * n), // the LCM instead of the GCF
        String(1),
        String(Math.min(A, B)),
        String(Math.abs(A - B)),
      ]);
      return {
        prompt: `What is the greatest number that divides both ${A} and ${B} evenly?`,
        choices,
        answer,
        explain: `Both numbers break into ${g} times something: ${A} = ${g} x ${m}, ${B} = ${g} x ${n}. The biggest shared factor is ${g}.`,
      };
    },
  },
  {
    id: 'mt2-009',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'greatest common factor word problem',
    generate: (rng) => {
      const name = pick(rng, NAMES);
      const g = pick(rng, [3, 4, 5, 6, 8]);
      const [m, n] = pick(rng, COPRIME_PAIRS);
      const A = g * m;
      const B = g * n;
      const correct = String(g);
      const { choices, answer } = buildChoices(rng, correct, [
        String(1),
        String(A + B), // added the two amounts
        String(g * m * n),
        String(Math.min(A, B)),
      ]);
      return {
        prompt: `${name} has ${A} red beads and ${B} blue beads and wants to make identical bracelets with no beads left over. What is the greatest number of bracelets ${name} can make?`,
        choices,
        answer,
        explain: `The number of bracelets must divide both ${A} and ${B}. The greatest common factor is ${g}, so ${name} can make ${g} bracelets.`,
      };
    },
  },
  {
    id: 'mt2-010',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'multiple of a number',
    generate: (rng) => {
      const N = pick(rng, [3, 4, 6, 7, 8, 9, 11, 12]);
      const k = randInt(rng, 3, 9);
      const correctNum = N * k;
      const { choices, answer } = buildChoices(rng, String(correctNum), [
        String(correctNum + 1),
        String(correctNum - 1),
        String(correctNum + 2),
        String(correctNum - 2),
      ]);
      return {
        prompt: `Which number is a multiple of ${N}?`,
        choices,
        answer,
        explain: `${correctNum} is a multiple of ${N} because ${N} x ${k} = ${correctNum}. The others do not divide by ${N} evenly.`,
      };
    },
  },
  {
    id: 'mt2-011',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'nth multiple of a number',
    generate: (rng) => {
      const N = pick(rng, [3, 4, 6, 7, 8, 9, 12, 15]);
      const ord = pick(rng, [3, 4, 5, 6]);
      const correctNum = N * ord;
      const { choices, answer } = buildChoices(rng, String(correctNum), [
        String(N + ord), // added instead of multiplying
        String(N * (ord - 1)), // counted the multiples starting from zero
        String(N * (ord + 1)),
        String(N * ord + 1),
      ]);
      return {
        prompt: `What is the ${ORDINALS[ord]} multiple of ${N}?`,
        choices,
        answer,
        explain: `The multiples of ${N} are ${N}, ${2 * N}, ${3 * N}, and so on. The ${ORDINALS[ord]} one is ${N} x ${ord} = ${correctNum}.`,
      };
    },
  },
  {
    id: 'mt2-012',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'least common multiple',
    generate: (rng) => {
      const g = pick(rng, [2, 3, 4, 5, 6]);
      const [m, n] = pick(rng, [
        [2, 3],
        [3, 4],
        [2, 5],
        [3, 5],
        [4, 5],
        [2, 7],
        [3, 7],
      ] as const);
      const A = g * m;
      const B = g * n;
      const lcm = g * m * n;
      const { choices, answer } = buildChoices(rng, String(lcm), [
        String(A * B), // forgot to divide out the shared factor
        String(g), // that is the greatest common factor, not the LCM
        String(A + B), // added the two numbers
        String(lcm + A),
      ]);
      return {
        prompt: `What is the least common multiple of ${A} and ${B}?`,
        choices,
        answer,
        explain: `${A} = ${g} x ${m} and ${B} = ${g} x ${n}, so the smallest number both divide into is ${g} x ${m} x ${n} = ${lcm}.`,
      };
    },
  },
  {
    id: 'mt2-013',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'divisibility by 2, 5, 10',
    generate: (rng) => {
      const d = pick(rng, [2, 5, 10]);
      const k = randInt(rng, 6, 30);
      const correctNum = d * k;
      const offs = d === 2 ? [1, 3, 5, 7, 9] : d === 5 ? [1, 2, 3, 4, 6] : [2, 4, 5, 6, 8];
      const distract = sample(rng, offs, 4).map((o) => String(correctNum + o));
      const rule =
        d === 2 ? 'ends in 0, 2, 4, 6, or 8' : d === 5 ? 'ends in 0 or 5' : 'ends in 0';
      const { choices, answer } = buildChoices(rng, String(correctNum), distract);
      return {
        prompt: `Which number is divisible by ${d}?`,
        choices,
        answer,
        explain: `A number is divisible by ${d} when it ${rule}. ${correctNum} = ${d} x ${k}, so it works.`,
      };
    },
  },
  {
    id: 'mt2-014',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'divisibility by 3 and 9',
    generate: (rng) => {
      const d = pick(rng, [3, 9]);
      const k = randInt(rng, 5, 25);
      const correctNum = d * k;
      const offs = d === 3 ? [1, 2, 4, 5, 7, 8] : [1, 2, 3, 4, 5, 6];
      const distract = sample(rng, offs, 4).map((o) => String(correctNum + o));
      const { choices, answer } = buildChoices(rng, String(correctNum), distract);
      return {
        prompt: `Which number is divisible by ${d}?`,
        choices,
        answer,
        explain: `A number is divisible by ${d} when its digits add up to a multiple of ${d}. The digits of ${correctNum} add to ${digitSum(correctNum)}.`,
      };
    },
  },
  {
    id: 'mt2-015',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'not divisible by 5',
    generate: (rng) => {
      const k = randInt(rng, 6, 30);
      const base = 5 * k;
      const r = pick(rng, [1, 2, 3, 4]);
      const correctNum = base + r;
      const { choices, answer } = buildChoices(rng, String(correctNum), [
        String(base),
        String(5 * (k + 1)),
        String(5 * (k - 1)),
        String(5 * (k + 2)),
      ]);
      return {
        prompt: `Which number is NOT divisible by 5?`,
        choices,
        answer,
        explain: `Multiples of 5 end in 0 or 5. ${correctNum} ends in ${correctNum % 10}, so it is not divisible by 5.`,
      };
    },
  },
  {
    id: 'mt2-016',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'square a number',
    generate: (rng) => {
      const N = randInt(rng, 4, 15);
      const sq = N * N;
      const { choices, answer } = buildChoices(rng, String(sq), [
        String(2 * N), // doubled instead of squaring
        String(sq + N),
        String(sq - N),
        String(sq + 1),
      ]);
      return {
        prompt: `What is ${N} squared?`,
        choices,
        answer,
        explain: `Squaring means multiplying the number by itself: ${N} x ${N} = ${sq}.`,
      };
    },
  },
  {
    id: 'mt2-017',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'identify a perfect square',
    generate: (rng) => {
      const roots = [4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
      const r = pick(rng, roots);
      const sq = r * r;
      const nonSquares = [8, 10, 12, 15, 18, 20, 24, 27, 30, 40, 50, 60, 72, 90, 99, 110, 130] as const;
      const distract = sample(
        rng,
        nonSquares.filter((v) => v !== sq),
        5,
      ).map(String);
      const { choices, answer } = buildChoices(rng, String(sq), distract);
      return {
        prompt: `Which of these is a perfect square?`,
        choices,
        answer,
        explain: `${sq} is a perfect square because ${r} x ${r} = ${sq}. The others cannot be made by multiplying a whole number by itself.`,
      };
    },
  },
  {
    id: 'mt2-018',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'find a square root',
    generate: (rng) => {
      const r = randInt(rng, 4, 15);
      const sq = r * r;
      const { choices, answer } = buildChoices(rng, String(r), [
        String(2 * r), // halved the number instead of taking the root
        String(r + 1),
        String(r - 1),
        String(Math.floor(sq / 2)),
      ]);
      return {
        prompt: `What number times itself equals ${sq}?`,
        choices,
        answer,
        explain: `We need a number that multiplied by itself gives ${sq}. Since ${r} x ${r} = ${sq}, the answer is ${r}.`,
      };
    },
  },
  {
    id: 'mt2-019',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'evaluate a small power',
    generate: (rng) => {
      const [a, b] = pick(rng, [
        [2, 3],
        [2, 4],
        [3, 2],
        [3, 3],
        [5, 2],
        [10, 2],
        [4, 2],
      ] as const);
      const value = a ** b;
      const { choices, answer } = buildChoices(rng, String(value), [
        String(a * b), // multiplied the base by the exponent
        String(value + a),
        String(value - a),
        String(value + 1),
        String(value - 1),
      ]);
      return {
        prompt: `What is ${a}^${b}?`,
        choices,
        answer,
        explain: `${a}^${b} means multiplying ${a} together ${b} times: ${Array(b).fill(a).join(' x ')} = ${value}.`,
      };
    },
  },
  {
    id: 'mt2-020',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'write repeated multiplication as a power',
    generate: (rng) => {
      const a = randInt(rng, 2, 9);
      const k = randInt(rng, 2, 4);
      const correct = `${a}^${k}`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${k}^${a}`, // swapped the base and exponent
        `${a}^${k - 1}`,
        `${a}^${k + 1}`,
        `${a * k}`, // multiplied base and count instead
      ]);
      return {
        prompt: `Which is another way to write ${Array(k).fill(a).join(' x ')}?`,
        choices,
        answer,
        explain: `${a} is used ${k} times, and that is written ${a}^${k}.`,
      };
    },
  },
  {
    id: 'mt2-021',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'evaluate a power',
    generate: (rng) => {
      const [a, b] = pick(rng, [
        [2, 5],
        [2, 6],
        [3, 3],
        [3, 4],
        [4, 3],
        [5, 3],
      ] as const);
      const value = a ** b;
      const { choices, answer } = buildChoices(rng, String(value), [
        String(a * b), // multiplied the base by the exponent
        String(value + a),
        String(value - a),
        String(value + 10),
        String(value - 10),
      ]);
      return {
        prompt: `What is ${a}^${b}?`,
        choices,
        answer,
        explain: `${a}^${b} = ${Array(b).fill(a).join(' x ')} = ${value}.`,
      };
    },
  },
  {
    id: 'mt2-022',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'expanded form',
    generate: (rng) => {
      const [th, h, t, o] = sample(rng, [1, 2, 3, 4, 5, 6, 7, 8, 9], 4);
      const N = th * 1000 + h * 100 + t * 10 + o;
      const correct = `${th * 1000} + ${h * 100} + ${t * 10} + ${o}`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${th * 1000} + ${h * 100} + ${t} + ${o}`, // tens place written as ones
        `${th * 100} + ${h * 10} + ${t} + ${o}`, // every place shifted down
        `${th} + ${h} + ${t} + ${o}`, // just the digits
        `${th * 1000} + ${h * 10} + ${t * 10} + ${o}`,
      ]);
      return {
        prompt: `Which shows ${commas(N)} in expanded form?`,
        choices,
        answer,
        explain: `Each digit stands for its place: ${th} thousands, ${h} hundreds, ${t} tens, and ${o} ones make ${th * 1000} + ${h * 100} + ${t * 10} + ${o}.`,
      };
    },
  },
  {
    id: 'mt2-023',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'word form to numeral',
    generate: (rng) => {
      const [th, h, t, o] = sample(rng, [1, 2, 3, 4, 5, 6, 7, 8, 9], 4);
      const N = th * 1000 + h * 100 + t * 10 + o;
      const { choices, answer } = buildChoices(rng, commas(N), [
        commas(th * 1000 + t * 100 + h * 10 + o), // swapped hundreds and tens digits
        commas(h * 1000 + th * 100 + t * 10 + o), // swapped thousands and hundreds digits
        commas(th * 1000 + h * 100 + o * 10 + t), // swapped tens and ones digits
        commas(o * 1000 + t * 100 + h * 10 + th), // digits reversed
      ]);
      return {
        prompt: `Which number is "${toWords(N)}"?`,
        choices,
        answer,
        explain: `Reading place by place: ${th} thousand, ${h} hundred, and ${under100(t * 10 + o)} makes ${commas(N)}.`,
      };
    },
  },
  {
    id: 'mt2-024',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'numeral to word form',
    generate: (rng) => {
      const [th, h, t, o] = sample(rng, [1, 2, 3, 4, 5, 6, 7, 8, 9], 4);
      const N = th * 1000 + h * 100 + t * 10 + o;
      const { choices, answer } = buildChoices(rng, toWords(N), [
        toWords(th * 1000 + t * 100 + h * 10 + o),
        toWords(h * 1000 + th * 100 + t * 10 + o),
        toWords(th * 1000 + h * 100 + o * 10 + t),
        toWords(o * 1000 + t * 100 + h * 10 + th),
      ]);
      return {
        prompt: `Which is ${commas(N)} written in words?`,
        choices,
        answer,
        explain: `${commas(N)} has ${th} thousands, ${h} hundreds, ${t} tens, and ${o} ones: "${toWords(N)}".`,
      };
    },
  },
  {
    id: 'mt2-025',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'place value to the millions',
    generate: (rng) => {
      const digits = sample(rng, [1, 2, 3, 4, 5, 6, 7, 8, 9], 7);
      const placeValues = [1000000, 100000, 10000, 1000, 100, 10, 1];
      const placeNames = [
        'millions',
        'hundred thousands',
        'ten thousands',
        'thousands',
        'hundreds',
        'tens',
        'ones',
      ];
      const N = digits.reduce((acc, d, i) => acc + d * placeValues[i], 0);
      const idx = randInt(rng, 0, 6);
      const digit = digits[idx];
      const worth = digit * placeValues[idx];
      const { choices, answer } = buildChoices(
        rng,
        commas(worth),
        placeValues.filter((_, i) => i !== idx).map((pv) => commas(digit * pv)),
      );
      return {
        prompt: `In ${commas(N)}, what is the value of the digit ${digit}?`,
        choices,
        answer,
        explain: `The digit ${digit} sits in the ${placeNames[idx]} place, so it is worth ${digit} x ${commas(placeValues[idx])} = ${commas(worth)}.`,
      };
    },
  },
  {
    id: 'mt2-026',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'digit in a named place',
    generate: (rng) => {
      const digits = sample(rng, [1, 2, 3, 4, 5, 6, 7, 8, 9], 7);
      const placeValues = [1000000, 100000, 10000, 1000, 100, 10, 1];
      const placeNames = [
        'millions',
        'hundred thousands',
        'ten thousands',
        'thousands',
        'hundreds',
        'tens',
        'ones',
      ];
      const N = digits.reduce((acc, d, i) => acc + d * placeValues[i], 0);
      const idx = randInt(rng, 0, 6);
      const { choices, answer } = buildChoices(
        rng,
        String(digits[idx]),
        digits.filter((_, i) => i !== idx).map(String),
      );
      return {
        prompt: `Which digit is in the ${placeNames[idx]} place of ${commas(N)}?`,
        choices,
        answer,
        explain: `Reading ${commas(N)} by place value, the ${placeNames[idx]} digit is ${digits[idx]}.`,
      };
    },
  },
  {
    id: 'mt2-027',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'name the place of a digit',
    generate: (rng) => {
      const digits = sample(rng, [1, 2, 3, 4, 5, 6, 7, 8, 9], 6);
      const placeValues = [100000, 10000, 1000, 100, 10, 1];
      const placeNames = ['hundred thousands', 'ten thousands', 'thousands', 'hundreds', 'tens', 'ones'];
      const N = digits.reduce((acc, d, i) => acc + d * placeValues[i], 0);
      const idx = randInt(rng, 0, 5);
      const { choices, answer } = buildChoices(
        rng,
        placeNames[idx],
        placeNames.filter((_, i) => i !== idx),
      );
      return {
        prompt: `In ${commas(N)}, the digit ${digits[idx]} is in which place?`,
        choices,
        answer,
        explain: `Counting places from the right, ${digits[idx]} lands in the ${placeNames[idx]} place.`,
      };
    },
  },
  {
    id: 'mt2-028',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'greatest multi-digit number',
    generate: (rng) => {
      const dc = pick(rng, [4, 5, 6]);
      const lo = 10 ** (dc - 1);
      const hi = 10 ** dc - 1;
      const vals = distinctInts(rng, 4, lo, hi);
      const max = Math.max(...vals);
      const { choices, answer } = buildChoices(
        rng,
        commas(max),
        vals.filter((v) => v !== max).map(commas),
      );
      return {
        prompt: `Which number is the greatest?`,
        choices,
        answer,
        explain: `Compare the digits from the left. ${commas(max)} is larger than the others, so it is the greatest.`,
      };
    },
  },
  {
    id: 'mt2-029',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'least multi-digit number',
    generate: (rng) => {
      const dc = pick(rng, [4, 5, 6]);
      const lo = 10 ** (dc - 1);
      const hi = 10 ** dc - 1;
      const vals = distinctInts(rng, 4, lo, hi);
      const min = Math.min(...vals);
      const { choices, answer } = buildChoices(
        rng,
        commas(min),
        vals.filter((v) => v !== min).map(commas),
      );
      return {
        prompt: `Which number is the least?`,
        choices,
        answer,
        explain: `Compare the digits from the left. ${commas(min)} is smaller than the others, so it is the least.`,
      };
    },
  },
  {
    id: 'mt2-030',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'true comparison statement',
    generate: (rng) => {
      const dc = pick(rng, [3, 4, 5]);
      const lo = 10 ** (dc - 1);
      const hi = 10 ** dc - 1;
      const [A, B] = distinctInts(rng, 2, lo, hi);
      const bigger = A > B;
      const correct = bigger ? `${commas(A)} > ${commas(B)}` : `${commas(A)} < ${commas(B)}`;
      const { choices, answer } = buildChoices(rng, correct, [
        bigger ? `${commas(A)} < ${commas(B)}` : `${commas(A)} > ${commas(B)}`,
        `${commas(A)} = ${commas(B)}`,
        bigger ? `${commas(B)} > ${commas(A)}` : `${commas(B)} < ${commas(A)}`,
      ]);
      return {
        prompt: `Which statement is true?`,
        choices,
        answer,
        explain: `${commas(A)} is ${bigger ? 'greater' : 'less'} than ${commas(B)}, so the true statement is ${correct}.`,
      };
    },
  },
  {
    id: 'mt2-031',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'round to the nearest ten',
    generate: (rng) => {
      const base = randInt(rng, 11, 98) * 10;
      const ones = pick(rng, [1, 2, 3, 4, 6, 7, 8, 9]);
      const value = base + ones;
      const roundsUp = ones >= 5;
      const correctVal = roundsUp ? base + 10 : base;
      const { choices, answer } = buildChoices(rng, commas(correctVal), [
        commas(roundsUp ? base : base + 10), // rounded the wrong way
        commas(value), // did not round at all
        commas(correctVal + 10),
        commas(correctVal - 10),
      ]);
      return {
        prompt: `Round ${commas(value)} to the nearest ten.`,
        choices,
        answer,
        explain: `The ones digit is ${ones}, which is ${roundsUp ? '5 or more, so round up' : 'less than 5, so round down'} to ${commas(correctVal)}.`,
      };
    },
  },
  {
    id: 'mt2-032',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'round to the nearest hundred',
    generate: (rng) => {
      const base = randInt(rng, 1, 89) * 100;
      const tens = pick(rng, [1, 2, 3, 4, 6, 7, 8, 9]);
      const value = base + tens * 10 + randInt(rng, 0, 9);
      const roundsUp = tens >= 5;
      const correctVal = roundsUp ? base + 100 : base;
      const { choices, answer } = buildChoices(rng, commas(correctVal), [
        commas(roundsUp ? base : base + 100), // rounded the wrong way
        commas(Math.round(value / 10) * 10), // rounded to the nearest ten instead
        commas(value),
        commas(correctVal + 100),
        commas(correctVal - 100),
      ]);
      return {
        prompt: `Round ${commas(value)} to the nearest hundred.`,
        choices,
        answer,
        explain: `The tens digit is ${tens}, so round ${roundsUp ? 'up' : 'down'} to ${commas(correctVal)}.`,
      };
    },
  },
  {
    id: 'mt2-033',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'round to the nearest thousand',
    generate: (rng) => {
      const base = randInt(rng, 1, 89) * 1000;
      const hundreds = pick(rng, [1, 2, 3, 4, 6, 7, 8, 9]);
      const value = base + hundreds * 100 + randInt(rng, 0, 99);
      const roundsUp = hundreds >= 5;
      const correctVal = roundsUp ? base + 1000 : base;
      const { choices, answer } = buildChoices(rng, commas(correctVal), [
        commas(roundsUp ? base : base + 1000), // rounded the wrong way
        commas(Math.round(value / 100) * 100), // rounded to the nearest hundred instead
        commas(value),
        commas(correctVal + 1000),
        commas(correctVal - 1000),
      ]);
      return {
        prompt: `Round ${commas(value)} to the nearest thousand.`,
        choices,
        answer,
        explain: `The hundreds digit is ${hundreds}, so round ${roundsUp ? 'up' : 'down'} to ${commas(correctVal)}.`,
      };
    },
  },
  {
    id: 'mt2-034',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'move left on a number line',
    generate: (rng) => {
      const start = randInt(rng, -5, 8);
      const step = randInt(rng, 3, 12);
      const result = start - step;
      const { choices, answer } = buildChoices(rng, num(result), [
        num(start + step), // moved right instead of left
        num(step - start), // subtracted in the wrong order
        num(result + 2),
        num(result - 2),
        num(result + 1),
      ]);
      return {
        prompt: `On a number line, start at ${start} and move ${step} steps to the left. Where do you land?`,
        choices,
        answer,
        explain: `Moving left means subtracting: ${start} - ${step} = ${result}.`,
      };
    },
  },
  {
    id: 'mt2-035',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'least integer on a number line',
    generate: (rng) => {
      const vals = distinctInts(rng, 4, -20, 15);
      const min = Math.min(...vals);
      const { choices, answer } = buildChoices(
        rng,
        num(min),
        vals.filter((v) => v !== min).map(num),
      );
      return {
        prompt: `Which number is farthest to the left on a number line?`,
        choices,
        answer,
        explain: `The farthest-left number is the smallest. ${min} is less than the others.`,
      };
    },
  },
  {
    id: 'mt2-036',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'negative temperature word problem',
    generate: (rng) => {
      const start = randInt(rng, 2, 15);
      const drop = randInt(rng, start + 2, start + 20);
      const result = start - drop;
      const { choices, answer } = buildChoices(rng, `${num(result)} degrees`, [
        `${num(start + drop)} degrees`, // added instead of subtracting
        `${num(drop - start)} degrees`, // subtracted in the wrong order
        `${num(result + 1)} degrees`,
        `${num(result - 1)} degrees`,
      ]);
      return {
        prompt: `The temperature is ${start} degrees. It falls ${drop} degrees. What is the new temperature?`,
        choices,
        answer,
        explain: `Falling means subtracting: ${start} - ${drop} = ${result} degrees.`,
      };
    },
  },
  {
    id: 'mt2-037',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'add a negative and a positive',
    generate: (rng) => {
      const a = randInt(rng, 3, 15);
      const b = randInt(rng, 3, 15);
      const result = -a + b;
      const { choices, answer } = buildChoices(rng, num(result), [
        num(a + b), // ignored the negative sign
        num(-a - b), // subtracted instead of adding
        num(a - b), // reversed the sign of the answer
        num(result + 2),
      ]);
      return {
        prompt: `What is ${-a} + ${b}?`,
        choices,
        answer,
        explain: `Start at ${-a} and move ${b} to the right: ${-a} + ${b} = ${result}.`,
      };
    },
  },
  {
    id: 'mt2-038',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'subtract to a negative result',
    generate: (rng) => {
      const a = randInt(rng, 2, 12);
      const b = randInt(rng, a + 2, a + 18);
      const result = a - b;
      const { choices, answer } = buildChoices(rng, num(result), [
        num(b - a), // subtracted in the wrong order
        num(a + b), // added instead of subtracting
        num(-(a + b)),
        num(result + 1),
      ]);
      return {
        prompt: `What is ${a} - ${b}?`,
        choices,
        answer,
        explain: `Taking ${b} from ${a} goes below zero: ${a} - ${b} = ${result}.`,
      };
    },
  },
  {
    id: 'mt2-039',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 3,
    topic: 'subtract from a negative',
    generate: (rng) => {
      const a = randInt(rng, 3, 15);
      const b = randInt(rng, 3, 15);
      const result = -a - b;
      const { choices, answer } = buildChoices(rng, num(result), [
        num(b - a), // added instead of subtracting
        num(a - b),
        num(a + b), // dropped the negative sign
        num(result + 2),
      ]);
      return {
        prompt: `What is ${-a} - ${b}?`,
        choices,
        answer,
        explain: `Starting at ${-a} and subtracting ${b} moves further left: ${-a} - ${b} = ${result}.`,
      };
    },
  },
  {
    id: 'mt2-040',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'multi-step word problem',
    generate: (rng) => {
      const name = pick(rng, NAMES);
      const boxes = randInt(rng, 3, 9);
      const per = randInt(rng, 6, 12);
      const total = boxes * per;
      const give = randInt(rng, 4, total - 3);
      const result = total - give;
      const { choices, answer } = buildChoices(rng, num(result), [
        num(total), // forgot to give any away
        num(total + give), // added instead of subtracting
        num(result + per),
        num(result - per),
      ]);
      return {
        prompt: `${name} packs ${boxes} boxes with ${per} toys in each box, then gives away ${give} toys. How many toys are left?`,
        choices,
        answer,
        explain: `First ${boxes} x ${per} = ${total} toys, then ${total} - ${give} = ${result} left.`,
      };
    },
  },
  {
    id: 'mt2-041',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'multi-step money word problem',
    generate: (rng) => {
      const name = pick(rng, NAMES);
      const hours = randInt(rng, 3, 8);
      const rate = randInt(rng, 8, 15);
      const earn = hours * rate;
      const spend = randInt(rng, 5, earn - 5);
      const result = earn - spend;
      const { choices, answer } = buildChoices(rng, money(result * 100), [
        money(earn * 100), // forgot to subtract the spending
        money((earn + spend) * 100), // added instead of subtracting
        money((result + rate) * 100),
        money((result - rate) * 100),
      ]);
      return {
        prompt: `${name} earns $${rate} an hour and works ${hours} hours, then spends $${spend}. How much money is left?`,
        choices,
        answer,
        explain: `${hours} x $${rate} = ${money(earn * 100)} earned, minus $${spend} spent leaves ${money(result * 100)}.`,
      };
    },
  },
  {
    id: 'mt2-042',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 3,
    topic: 'division word problem with rounding up',
    generate: (rng) => {
      const perBus = pick(rng, [12, 15, 20, 24, 30]);
      const full = randInt(rng, 3, 20);
      const rem = randInt(rng, 1, perBus - 1);
      const students = perBus * full + rem;
      const result = full + 1;
      const { choices, answer } = buildChoices(rng, num(result), [
        num(full), // ignored the extra students
        num(full + 2),
        num(full - 1),
        num(rem),
      ]);
      return {
        prompt: `A school has ${students} students. Each bus holds ${perBus} students. How many buses are needed so everyone has a seat?`,
        choices,
        answer,
        explain: `${students} / ${perBus} = ${full} with ${rem} left over, and those extra students need one more bus, so ${result} buses.`,
      };
    },
  },
  {
    id: 'mt2-043',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'multiply a three-digit number by one digit',
    generate: (rng) => {
      const a = randInt(rng, 112, 987);
      const b = randInt(rng, 3, 9);
      const product = a * b;
      const H = Math.floor(a / 100);
      const T = Math.floor((a % 100) / 10);
      const O = a % 10;
      const { choices, answer } = buildChoices(rng, num(product), [
        num((a + 1) * b), // misread a digit of the number
        num((a - 1) * b),
        num(product + a),
        num(product - a),
        num(product + 10),
      ]);
      return {
        prompt: `What is ${a} x ${b}?`,
        choices,
        answer,
        explain: `${H * 100} x ${b} = ${H * 100 * b}, ${T * 10} x ${b} = ${T * 10 * b}, and ${O} x ${b} = ${O * b}. Adding gives ${product}.`,
      };
    },
  },
  {
    id: 'mt2-044',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 3,
    topic: 'multiply two two-digit numbers',
    generate: (rng) => {
      const a = randInt(rng, 11, 49);
      const b = randInt(rng, 11, 29);
      const product = a * b;
      const bT = Math.floor(b / 10);
      const bO = b % 10;
      const aT = Math.floor(a / 10);
      const aO = a % 10;
      const diagonal = aT * bT * 100 + aO * bO; // multiplied only matching places
      const { choices, answer } = buildChoices(rng, num(product), [
        num(diagonal),
        num(product - a),
        num(product + b),
        num(product - 10),
      ]);
      return {
        prompt: `What is ${a} x ${b}?`,
        choices,
        answer,
        explain: `${a} x ${bT * 10} = ${a * bT * 10} and ${a} x ${bO} = ${a * bO}. Adding the parts gives ${product}.`,
      };
    },
  },
  {
    id: 'mt2-045',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 3,
    topic: 'multiply a three-digit number by two digits',
    generate: (rng) => {
      const a = randInt(rng, 101, 499);
      const b = randInt(rng, 11, 29);
      const product = a * b;
      const bT = Math.floor(b / 10);
      const bO = b % 10;
      const { choices, answer } = buildChoices(rng, num(product), [
        num(a * bO), // multiplied by the ones digit only
        num(a * bT * 10), // multiplied by the tens digit only
        num(product + a),
        num(product - a),
      ]);
      return {
        prompt: `What is ${a} x ${b}?`,
        choices,
        answer,
        explain: `${a} x ${bO} = ${a * bO} and ${a} x ${bT * 10} = ${a * bT * 10}. Adding the two parts: ${product}.`,
      };
    },
  },
  {
    id: 'mt2-046',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'long division without a remainder',
    generate: (rng) => {
      const divisor = randInt(rng, 3, 9);
      const quotient = randInt(rng, 23, 98);
      const dividend = divisor * quotient;
      const { choices, answer } = buildChoices(rng, num(quotient), [
        num(quotient + 10), // slipped a place value
        num(quotient - 10),
        num(quotient + 1),
        num(quotient - 1),
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
    id: 'mt2-047',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 3,
    topic: 'long division with a remainder',
    generate: (rng) => {
      const divisor = randInt(rng, 3, 9);
      const quotient = randInt(rng, 12, 60);
      const r = randInt(rng, 1, divisor - 1);
      const dividend = divisor * quotient + r;
      const correct = `${quotient} R ${r}`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${quotient} R ${divisor - r}`, // took the remainder from the wrong end
        `${quotient + 1} R ${r}`,
        `${quotient - 1} R ${r}`,
        `${quotient} R ${r + 1}`,
      ]);
      return {
        prompt: `What is ${dividend} / ${divisor}? Give the quotient and remainder.`,
        choices,
        answer,
        explain: `${divisor} x ${quotient} = ${divisor * quotient}, and ${dividend} - ${divisor * quotient} = ${r} is left over, so ${quotient} R ${r}.`,
      };
    },
  },
  {
    id: 'mt2-048',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'division word problem, find the remainder',
    generate: (rng) => {
      const name = pick(rng, NAMES);
      const perCarton = pick(rng, [6, 8, 10, 12]);
      const full = randInt(rng, 5, 20);
      const r = randInt(rng, 1, perCarton - 1);
      const total = perCarton * full + r;
      const { choices, answer } = buildChoices(rng, num(r), [
        num(full), // gave the number of full cartons instead
        num(perCarton - r), // counted from the wrong end
        num(r + 1),
        num(r + 2),
        num(r + 3),
      ]);
      return {
        prompt: `${name} has ${total} eggs and puts ${perCarton} in each carton. How many eggs are left over after filling as many cartons as possible?`,
        choices,
        answer,
        explain: `${total} / ${perCarton} = ${full} full cartons with ${r} eggs left over.`,
      };
    },
  },
  {
    id: 'mt2-049',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'estimate a sum by rounding',
    generate: (rng) => {
      const aOnes = pick(rng, [1, 2, 3, 4, 6, 7, 8, 9]);
      const bOnes = pick(rng, [1, 2, 3, 4, 6, 7, 8, 9]);
      const a = randInt(rng, 2, 9) * 10 + aOnes;
      const b = randInt(rng, 2, 9) * 10 + bOnes;
      const aR = Math.round(a / 10) * 10;
      const bR = Math.round(b / 10) * 10;
      const est = aR + bR;
      const { choices, answer } = buildChoices(rng, num(est), [
        num(a + b), // the exact sum, not an estimate
        num(est + 10),
        num(est - 10),
        num(est + 20),
      ]);
      return {
        prompt: `Estimate ${a} + ${b} by rounding each number to the nearest ten.`,
        choices,
        answer,
        explain: `${a} rounds to ${aR} and ${b} rounds to ${bR}, so ${aR} + ${bR} = ${est}.`,
      };
    },
  },
  {
    id: 'mt2-050',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'estimate a product by rounding',
    generate: (rng) => {
      const aOnes = pick(rng, [1, 2, 3, 4, 6, 7, 8, 9]);
      const a = randInt(rng, 2, 9) * 10 + aOnes;
      const b = randInt(rng, 3, 9);
      const aR = Math.round(a / 10) * 10;
      const est = aR * b;
      const wrongRound = (aOnes >= 5 ? aR - 10 : aR + 10) * b; // rounded the wrong way
      const { choices, answer } = buildChoices(rng, num(est), [
        num(a * b), // the exact product, not an estimate
        num(wrongRound),
        num(est + b),
        num(est - b),
      ]);
      return {
        prompt: `Estimate ${a} x ${b} by rounding ${a} to the nearest ten.`,
        choices,
        answer,
        explain: `${a} rounds to ${aR}, so ${aR} x ${b} = ${est}.`,
      };
    },
  },
  {
    id: 'mt2-051',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 3,
    topic: 'estimate a sum of three numbers',
    generate: (rng) => {
      const make = () =>
        randInt(rng, 1, 9) * 100 + pick(rng, [1, 2, 3, 4, 6, 7, 8, 9]) * 10 + randInt(rng, 0, 9);
      const a = make();
      const b = make();
      const c = make();
      const round100 = (x: number) => Math.round(x / 100) * 100;
      const est = round100(a) + round100(b) + round100(c);
      const { choices, answer } = buildChoices(rng, num(est), [
        num(a + b + c), // the exact sum, not an estimate
        num(est + 100),
        num(est - 100),
        num(est + 200),
      ]);
      return {
        prompt: `Estimate ${a} + ${b} + ${c} by rounding each number to the nearest hundred.`,
        choices,
        answer,
        explain: `Rounded to the nearest hundred these are ${round100(a)}, ${round100(b)}, and ${round100(c)}, which add to ${est}.`,
      };
    },
  },
  {
    id: 'mt2-052',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'number-line tick placement',
    generate: (rng) => {
      const step = pick(rng, [2, 5, 10, 25]);
      const k = randInt(rng, 2, 8);
      const pos = step * k;
      const { choices, answer } = buildChoices(rng, num(pos), [
        num(k), // ignored the size of each tick
        num(pos + step),
        num(pos - step),
        num(step * (k + 2)),
      ]);
      return {
        prompt: `A number line is marked 0, ${step}, ${2 * step}, ${3 * step}, and so on. What number is ${k} ticks to the right of 0?`,
        choices,
        answer,
        explain: `Each tick is worth ${step}, so ${k} ticks is ${k} x ${step} = ${pos}.`,
      };
    },
  },
  {
    id: 'mt2-053',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'halfway on a number line',
    generate: (rng) => {
      const lo = randInt(rng, 1, 9) * 10;
      const gap = pick(rng, [10, 20, 40, 60, 100]);
      const hi = lo + gap;
      const mid = (lo + hi) / 2;
      const { choices, answer } = buildChoices(rng, num(mid), [
        num(lo + hi), // added instead of averaging
        num(lo),
        num(hi),
        num(mid + gap / 2),
      ]);
      return {
        prompt: `On a number line, what number is exactly halfway between ${lo} and ${hi}?`,
        choices,
        answer,
        explain: `Halfway is the average: (${lo} + ${hi}) / 2 = ${lo + hi} / 2 = ${mid}.`,
      };
    },
  },
  {
    id: 'mt2-054',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'order numbers least to greatest',
    generate: (rng) => {
      const vals = distinctInts(rng, 4, 100, 999);
      const asc = vals.slice().sort((p, q) => p - q);
      const correct = asc.join(', ');
      const swapLast = [asc[0], asc[1], asc[3], asc[2]];
      const swapFirst = [asc[1], asc[0], asc[2], asc[3]];
      const { choices, answer } = buildChoices(rng, correct, [
        asc.slice().reverse().join(', '), // greatest to least
        swapLast.join(', '), // two out of order
        swapFirst.join(', '),
      ]);
      return {
        prompt: `Which list is ordered from least to greatest?`,
        choices,
        answer,
        explain: `From smallest to largest, the numbers go ${correct}.`,
      };
    },
  },
  {
    id: 'mt2-055',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 3,
    topic: 'order integers with negatives',
    generate: (rng) => {
      const vals = distinctInts(rng, 4, -15, 15);
      const asc = vals.slice().sort((p, q) => p - q);
      const correct = asc.join(', ');
      const swapLast = [asc[0], asc[1], asc[3], asc[2]];
      const swapFirst = [asc[1], asc[0], asc[2], asc[3]];
      const { choices, answer } = buildChoices(rng, correct, [
        asc.slice().reverse().join(', '), // greatest to least
        swapLast.join(', '),
        swapFirst.join(', '),
      ]);
      return {
        prompt: `Which list is ordered from least to greatest?`,
        choices,
        answer,
        explain: `Negative numbers are smallest, so in order the numbers go ${correct}.`,
      };
    },
  },
];
