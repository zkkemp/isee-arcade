import {
  buildChoices,
  frac,
  gcd,
  money,
  num,
  pick,
  randInt,
  type QuestionTemplate,
  type Rng,
} from './templates';

/**
 * Parameterized ISEE Lower Level Math Achievement templates (grade 4-5, no
 * calculator).
 *
 * Every template regenerates its numbers on each serve, so only the SHAPE
 * repeats — a student cannot memorize "the answer to the fraction one." Two
 * rules govern every generator here:
 *
 * 1. Ranges are constrained so the arithmetic stays clean: whole quotients,
 *    terminating decimals, no negative results a 10-year-old would not expect.
 * 2. Distractors are computed WRONG ANSWERS (forgot to carry, used the wrong
 *    denominator, off by a place value, added instead of multiplied), never
 *    random numbers, and the explanation is built from the same instance
 *    numbers as the prompt.
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

const LENGTH_UNITS = ['cm', 'in', 'ft', 'm'] as const;

/** k distinct items drawn from pool, in random order. */
function sample<T>(rng: Rng, pool: readonly T[], k: number): T[] {
  const copy = pool.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, k);
}

/** 3482 -> "3,482". Grade-level numbers only, so thousands is enough. */
function commas(value: number): string {
  return value >= 1000
    ? `${Math.floor(value / 1000)},${String(value % 1000).padStart(3, '0')}`
    : String(value);
}

/** Minutes past midnight -> "4:05". Callers add "p.m." themselves. */
function clock(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 12;
  const m = totalMinutes % 60;
  return `${h === 0 ? 12 : h}:${String(m).padStart(2, '0')}`;
}

/** Cents -> "3.47" for use inside a decimal (not money) prompt. */
function dec2(hundredths: number): string {
  return num(hundredths / 100);
}

export const MATH_TEMPLATES: QuestionTemplate[] = [
  {
    id: 'mt-001',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'multi-digit addition',
    generate: (rng) => {
      // Ones digits are forced to carry, so "forgot to carry" is a real trap.
      const onesA = randInt(rng, 5, 9);
      const onesB = randInt(rng, 10 - onesA, 9);
      const a = randInt(rng, 21, 87) * 10 + onesA;
      const b = randInt(rng, 13, 79) * 10 + onesB;
      const total = a + b;
      const correct = num(total);
      const { choices, answer } = buildChoices(rng, correct, [
        num(total - 10), // dropped the carry out of the ones column
        num(total + 100),
        num(total - 100),
        num(total + 10),
      ]);
      return {
        prompt: `What is ${a} + ${b}?`,
        choices,
        answer,
        explain: `In the ones column ${onesA} + ${onesB} = ${onesA + onesB}, so write ${(onesA + onesB) % 10} and carry 1. Finishing the columns, ${a} + ${b} = ${correct}.`,
      };
    },
  },
  {
    id: 'mt-002',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'multi-digit subtraction',
    generate: (rng) => {
      // Ones digit of a is smaller, so the ones column must borrow.
      const onesA = randInt(rng, 0, 5);
      const onesB = randInt(rng, onesA + 2, 9);
      const a = randInt(rng, 32, 94) * 10 + onesA;
      const b = randInt(rng, 11, 28) * 10 + onesB;
      const diff = a - b;
      const correct = num(diff);
      const { choices, answer } = buildChoices(rng, correct, [
        num(diff + 2 * (onesB - onesA)), // subtracted the small digit from the big one
        num(diff + 100),
        num(diff - 100),
        num(diff + 10),
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
    id: 'mt-003',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'multiply by a one-digit number',
    generate: (rng) => {
      const tens = randInt(rng, 1, 4);
      const ones = randInt(rng, 4, 9);
      const t = tens * 10 + ones;
      const f = randInt(rng, 3, 9);
      const product = t * f;
      const correct = num(product);
      const noCarry = tens * f * 10 + ((ones * f) % 10);
      const { choices, answer } = buildChoices(rng, correct, [
        num(noCarry), // forgot to carry out of the ones column
        num(product + t),
        num(product - t),
        num(product + f),
      ]);
      return {
        prompt: `What is ${t} x ${f}?`,
        choices,
        answer,
        explain: `${ones} x ${f} = ${ones * f}, so write ${(ones * f) % 10} and carry ${Math.floor((ones * f) / 10)}. Then ${tens * 10} x ${f} = ${tens * f * 10}, for a total of ${correct}.`,
      };
    },
  },
  {
    id: 'mt-004',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'equivalent fractions',
    generate: (rng) => {
      const [n, d] = pick(rng, [
        [1, 2],
        [1, 3],
        [2, 3],
        [1, 4],
        [3, 4],
        [2, 5],
        [3, 5],
        [4, 5],
        [1, 6],
        [5, 6],
        [2, 7],
        [3, 7],
        [5, 7],
        [3, 8],
        [5, 8],
        [4, 9],
        [7, 9],
        [7, 10],
      ] as const);
      const rawK = randInt(rng, 2, 4);
      // With n = 1 and d = k^2, (n+k)/(d+k) and nk/d are equal in value
      // (1/4 with k=2 gives 3/6 and 2/4), which would offer two right answers.
      const k = n === 1 && d === rawK * rawK ? rawK + 1 : rawK;
      // Written raw, not through frac(), or the answer would reduce back.
      const correct = `${n * k}/${d * k}`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${n + k}/${d + k}`, // added k instead of multiplying by it
        `${n}/${d * k}`, // scaled only the denominator
        `${n * k}/${d}`, // scaled only the numerator
        `${n * k + k}/${d * k}`,
      ]);
      return {
        prompt: `Which fraction is equal to ${n}/${d}?`,
        choices,
        answer,
        explain: `Multiply the top and the bottom by ${k}: ${n} x ${k} = ${n * k} and ${d} x ${k} = ${d * k}, so ${n}/${d} = ${correct}.`,
      };
    },
  },
  {
    id: 'mt-005',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'add fractions with like denominators',
    generate: (rng) => {
      const d = pick(rng, [4, 5, 6, 8, 9, 10, 12]);
      const n1 = randInt(rng, 1, d - 2);
      const n2 = randInt(rng, 1, d - 1 - n1);
      const total = n1 + n2;
      const correct = frac(total, d);
      // Everything goes through frac() so two candidates that are equal in
      // value render as the same string and get deduped, never offered twice.
      const { choices, answer } = buildChoices(rng, correct, [
        frac(total, d + d), // added the denominators too
        frac(total + 1, d),
        frac(Math.max(1, Math.abs(n1 - n2)), d), // subtracted instead of adding
        frac(n1 * n2, d),
        frac(total + 2, d),
      ]);
      return {
        prompt: `What is ${n1}/${d} + ${n2}/${d}?`,
        choices,
        answer,
        explain: `The denominators already match, so add only the tops: ${n1} + ${n2} = ${total}, giving ${total}/${d}${correct === `${total}/${d}` ? '' : ` = ${correct}`}.`,
      };
    },
  },
  {
    id: 'mt-006',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'decimal place value',
    generate: (rng) => {
      const digits = sample(rng, [1, 2, 3, 4, 5, 6, 7, 8, 9], 4);
      const [w, tenths, hundredths, thousandths] = digits;
      const shown = `${w}.${tenths}${hundredths}${thousandths}`;
      const places = [
        { label: 'tenths', digit: tenths },
        { label: 'hundredths', digit: hundredths },
        { label: 'thousandths', digit: thousandths },
      ] as const;
      const target = pick(rng, places);
      const correct = num(target.digit);
      const { choices, answer } = buildChoices(
        rng,
        correct,
        [
          num(tenths),
          num(hundredths),
          num(thousandths),
          num(w), // read the ones digit instead
        ].filter((v) => v !== correct),
      );
      return {
        prompt: `In the number ${shown}, which digit is in the ${target.label} place?`,
        choices,
        answer,
        explain: `After the decimal point in ${shown} the places run tenths (${tenths}), hundredths (${hundredths}), thousandths (${thousandths}), so the ${target.label} digit is ${correct}.`,
      };
    },
  },
  {
    id: 'mt-007',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'rounding',
    generate: (rng) => {
      const n = randInt(rng, 1, 8) * 1000 + randInt(rng, 1, 9) * 100 + randInt(rng, 1, 4) * 10 + randInt(rng, 1, 9);
      const roundsUp = rng() < 0.5;
      // Rebuild the tens/ones part so the "nearest hundred" call is unambiguous.
      const base = Math.floor(n / 100) * 100;
      const tail = roundsUp ? randInt(rng, 6, 9) * 10 + randInt(rng, 1, 9) : randInt(rng, 1, 4) * 10 + randInt(rng, 1, 9);
      const value = base + tail;
      const down = base;
      const up = base + 100;
      const correctValue = roundsUp ? up : down;
      const correct = commas(correctValue);
      const { choices, answer } = buildChoices(rng, correct, [
        commas(roundsUp ? down : up), // rounded the wrong way
        commas(Math.round(value / 10) * 10), // rounded to the nearest ten
        commas(Math.round(value / 1000) * 1000), // rounded to the nearest thousand
        commas(Math.floor(value / 1000) * 1000),
        commas(up + 100),
      ]);
      return {
        prompt: `Round ${commas(value)} to the nearest hundred.`,
        choices,
        answer,
        explain: `The tens digit of ${commas(value)} is ${Math.floor(tail / 10)}, so round ${roundsUp ? 'up' : 'down'} to ${correct}.`,
      };
    },
  },
  {
    id: 'mt-008',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'convert inches and feet',
    generate: (rng) => {
      const f = randInt(rng, 2, 9);
      if (rng() < 0.5) {
        const extra = randInt(rng, 1, 11);
        const total = f * 12 + extra;
        const correct = `${total} inches`;
        const { choices, answer } = buildChoices(rng, correct, [
          `${f * 12} inches`, // dropped the extra inches
          `${f * 10 + extra} inches`, // used 10 inches per foot
          `${f * 12 - extra} inches`,
          `${f * 12 + extra + 12} inches`,
        ]);
        return {
          prompt: `How many inches are in ${f} feet ${extra} inches?`,
          choices,
          answer,
          explain: `${f} feet is ${f} x 12 = ${f * 12} inches, plus ${extra} more makes ${total} inches.`,
        };
      }
      const inches = f * 12;
      const correct = `${f} feet`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${f + 1} feet`,
        `${f - 1} feet`,
        `${f * 2} feet`,
        `${inches / 6} feet`, // divided by 6 instead of 12
      ]);
      return {
        prompt: `How many feet are in ${inches} inches?`,
        choices,
        answer,
        explain: `There are 12 inches in a foot, and ${inches} / 12 = ${f}, so ${inches} inches is ${f} feet.`,
      };
    },
  },
  {
    id: 'mt-009',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'perimeter of a rectangle',
    generate: (rng) => {
      const unit = pick(rng, LENGTH_UNITS);
      const long = randInt(rng, 5, 19);
      const wide = randInt(rng, 2, long - 1);
      const p = 2 * (long + wide);
      const correct = `${p} ${unit}`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${long * wide} ${unit}`, // found the area instead
        `${long + wide} ${unit}`, // added only two sides
        `${2 * long + wide} ${unit}`,
        `${2 * long * wide} ${unit}`,
      ]);
      return {
        prompt: `A rectangle is ${long} ${unit} long and ${wide} ${unit} wide. What is its perimeter?`,
        choices,
        answer,
        explain: `Perimeter adds all four sides: ${long} + ${wide} + ${long} + ${wide} = ${p} ${unit}.`,
      };
    },
  },
  {
    id: 'mt-010',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'solve for an unknown',
    generate: (rng) => {
      const a = randInt(rng, 3, 19);
      const value = randInt(rng, 4, 29);
      if (rng() < 0.5) {
        const b = a + value;
        const correct = num(value);
        const { choices, answer } = buildChoices(rng, correct, [
          num(b + a), // added instead of subtracting
          num(b),
          num(a),
          num(value + 1),
        ]);
        return {
          prompt: `If n + ${a} = ${b}, what is n?`,
          choices,
          answer,
          explain: `Undo the + ${a} by subtracting: ${b} - ${a} = ${value}, so n = ${value}.`,
        };
      }
      const c = value - a > 0 ? value - a : value + a;
      const nValue = c + a;
      const correct = num(nValue);
      const { choices, answer } = buildChoices(rng, correct, [
        num(c - a > 0 ? c - a : a - c), // subtracted instead of adding
        num(c),
        num(a),
        num(nValue + 1),
      ]);
      return {
        prompt: `If n - ${a} = ${c}, what is n?`,
        choices,
        answer,
        explain: `Undo the - ${a} by adding: ${c} + ${a} = ${nValue}, so n = ${nValue}.`,
      };
    },
  },
  {
    id: 'mt-011',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'subtract fractions with like denominators',
    generate: (rng) => {
      const d = pick(rng, [5, 6, 8, 9, 10, 12]);
      const n2 = randInt(rng, 1, d - 3);
      const n1 = randInt(rng, n2 + 2, d - 1);
      const diff = n1 - n2;
      const correct = frac(diff, d);
      const { choices, answer } = buildChoices(rng, correct, [
        frac(n1 + n2, d), // added instead of subtracting
        frac(diff + 1, d),
        frac(diff - 1, d),
        frac(d - diff, d),
        frac(diff + 2, d),
      ]);
      return {
        prompt: `What is ${n1}/${d} - ${n2}/${d}?`,
        choices,
        answer,
        explain: `The denominators match, so subtract only the tops: ${n1} - ${n2} = ${diff}, giving ${diff}/${d}${correct === `${diff}/${d}` ? '' : ` = ${correct}`}.`,
      };
    },
  },
  {
    id: 'mt-012',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'add unlike fractions',
    generate: (rng) => {
      const d1 = pick(rng, [3, 4, 5, 6]);
      const k = randInt(rng, 2, 3);
      const d2 = d1 * k;
      const n1 = randInt(rng, 1, d1 - 1);
      const num1 = n1 * k;
      const n2 = randInt(rng, 1, d2 - num1 - 1);
      const correctN = num1 + n2;
      const correct = frac(correctN, d2);
      const { choices, answer } = buildChoices(rng, correct, [
        frac(n1 + n2, d2), // forgot to rewrite the first fraction
        frac(n1 + n2, d1 + d2), // added the denominators too
        frac(correctN + 1, d2),
        frac(Math.abs(num1 - n2), d2),
        frac(correctN - 1, d2),
      ]);
      return {
        prompt: `What is ${n1}/${d1} + ${n2}/${d2}?`,
        choices,
        answer,
        explain: `Rewrite ${n1}/${d1} as ${num1}/${d2} so both fractions have denominator ${d2}. Then ${num1}/${d2} + ${n2}/${d2} = ${correct}.`,
      };
    },
  },
  {
    id: 'mt-013',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 3,
    topic: 'subtract unlike fractions',
    generate: (rng) => {
      const d1 = pick(rng, [3, 4, 5, 6]);
      const k = randInt(rng, 2, 3);
      const d2 = d1 * k;
      const n1 = randInt(rng, 2, d1 - 1);
      const num1 = n1 * k;
      const n2 = randInt(rng, 1, num1 - 2);
      const diff = num1 - n2;
      const correct = frac(diff, d2);
      const { choices, answer } = buildChoices(rng, correct, [
        frac(Math.max(1, Math.abs(n1 - n2)), d2), // forgot to rewrite the first fraction
        frac(num1 + n2, d2), // added instead of subtracting
        frac(diff + 1, d2),
        frac(diff - 1, d2),
        frac(diff + 2, d2),
      ]);
      return {
        prompt: `What is ${n1}/${d1} - ${n2}/${d2}?`,
        choices,
        answer,
        explain: `Rewrite ${n1}/${d1} as ${num1}/${d2}, then subtract the tops: ${num1} - ${n2} = ${diff}, so the answer is ${correct}.`,
      };
    },
  },
  {
    id: 'mt-014',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'simplify fractions',
    generate: (rng) => {
      const [bn, bd] = pick(rng, [
        [2, 3],
        [3, 4],
        [2, 5],
        [3, 5],
        [4, 5],
        [5, 6],
        [3, 7],
        [4, 7],
        [3, 8],
        [5, 8],
        [7, 8],
        [4, 9],
        [5, 9],
        [7, 10],
        [9, 10],
      ] as const);
      const k = randInt(rng, 2, 5);
      const n = bn * k;
      const d = bd * k;
      const correct = frac(n, d);
      const { choices, answer } = buildChoices(rng, correct, [
        // These first three are always distinct in value as well as in text:
        // subtracting k, flipping, and dividing only the denominator can never
        // land on each other or on bn/bd for any pair-and-k in the ranges above.
        `${n - k}/${d - k}`, // subtracted k instead of dividing by it
        `${bd}/${bn}`, // flipped the fraction
        `${n}/${bd}`, // reduced only the denominator
        `${bn + 1}/${bd}`,
        `${bn}/${bd + 1}`,
      ]);
      return {
        prompt: `Write ${n}/${d} in simplest form.`,
        choices,
        answer,
        explain: `${n} and ${d} share the factor ${k}: ${n} / ${k} = ${bn} and ${d} / ${k} = ${bd}, so ${n}/${d} = ${correct}.`,
      };
    },
  },
  {
    id: 'mt-015',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'compare fractions',
    generate: (rng) => {
      const n = randInt(rng, 2, 6);
      // Same numerator throughout, so the comparison is pure reasoning about
      // denominators; a wide pool keeps the set of possible questions large.
      const dens = sample(
        rng,
        Array.from({ length: 13 }, (_, i) => n + 1 + i),
        4,
      );
      const smallest = Math.min(...dens);
      const biggest = Math.max(...dens);
      const wantGreatest = rng() < 0.5;
      const winner = wantGreatest ? smallest : biggest;
      const correct = `${n}/${winner}`;
      const { choices, answer } = buildChoices(
        rng,
        correct,
        dens.filter((d) => d !== winner).map((d) => `${n}/${d}`),
      );
      return {
        prompt: `Which fraction is the ${wantGreatest ? 'greatest' : 'least'}?`,
        choices,
        answer,
        explain: `Each fraction has the numerator ${n}, so ${wantGreatest ? 'fewer' : 'more'} pieces means a ${wantGreatest ? 'bigger' : 'smaller'} share: ${n}/${winner} rather than ${n}/${wantGreatest ? biggest : smallest}.`,
      };
    },
  },
  {
    id: 'mt-016',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'divide multi-digit numbers',
    generate: (rng) => {
      const divisor = randInt(rng, 3, 9);
      const quotient = randInt(rng, 21, 89);
      const dividend = divisor * quotient;
      const correct = num(quotient);
      const { choices, answer } = buildChoices(rng, correct, [
        num(quotient + 10), // slipped a place value in long division
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
    id: 'mt-017',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 3,
    topic: 'division with a remainder',
    generate: (rng) => {
      const divisor = randInt(rng, 3, 9);
      const quotient = randInt(rng, 11, 49);
      const r = randInt(rng, 1, divisor - 1);
      const dividend = divisor * quotient + r;
      const correct = `${quotient} R ${r}`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${quotient} R ${divisor - r}`, // remainder counted from the wrong end
        `${quotient + 1} R ${r}`,
        `${quotient - 1} R ${r}`,
        `${quotient} R ${r + 1}`,
      ]);
      return {
        prompt: `What is ${dividend} / ${divisor}? Give the quotient and remainder.`,
        choices,
        answer,
        explain: `${divisor} x ${quotient} = ${divisor * quotient}, and ${dividend} - ${divisor * quotient} = ${r} is left over, so the answer is ${quotient} R ${r}.`,
      };
    },
  },
  {
    id: 'mt-018',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'compare decimals',
    generate: (rng) => {
      const w = randInt(rng, 1, 9);
      const ragged = pick(rng, [10, 20, 30, 40, 50, 60, 70, 80, 90]);
      const rest = sample(
        rng,
        Array.from({ length: 99 }, (_, i) => i + 1).filter((v) => v % 10 !== 0),
        3,
      );
      const values = [ragged, ...rest];
      const show = (v: number) =>
        v % 10 === 0 ? `${w}.${v / 10}` : `${w}.${String(v).padStart(2, '0')}`;
      const sorted = values.slice().sort((a, b) => b - a);
      const correct = show(sorted[0]);
      const { choices, answer } = buildChoices(
        rng,
        correct,
        sorted.slice(1).map(show),
      );
      return {
        prompt: `Which number is the largest?`,
        choices,
        answer,
        explain: `Write each with two decimal places: ${correct} is ${sorted[0]} hundredths and ${show(sorted[1])} is only ${sorted[1]} hundredths, so ${correct} is largest.`,
      };
    },
  },
  {
    id: 'mt-019',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'add decimals',
    generate: (rng) => {
      const onesA = randInt(rng, 2, 8);
      const onesB = randInt(rng, 11 - onesA, 9);
      const a = randInt(rng, 11, 89) * 10 + onesA;
      const b = randInt(rng, 10, 79) * 10 + onesB;
      const total = a + b;
      const correct = dec2(total);
      const { choices, answer } = buildChoices(rng, correct, [
        dec2(total - 10), // dropped the carry out of the hundredths
        dec2(total + 10),
        num(total / 10), // decimal point one place off
        dec2(total - 100),
      ]);
      return {
        prompt: `What is ${dec2(a)} + ${dec2(b)}?`,
        choices,
        answer,
        explain: `Line up the decimal points: the hundredths give ${onesA} + ${onesB} = ${onesA + onesB}, so carry 1. That makes ${dec2(a)} + ${dec2(b)} = ${correct}.`,
      };
    },
  },
  {
    id: 'mt-020',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'subtract decimals',
    generate: (rng) => {
      const onesA = randInt(rng, 0, 5);
      const onesB = randInt(rng, onesA + 2, 9);
      const a = randInt(rng, 32, 94) * 10 + onesA;
      const b = randInt(rng, 11, 29) * 10 + onesB;
      const diff = a - b;
      const correct = dec2(diff);
      const { choices, answer } = buildChoices(rng, correct, [
        dec2(diff + 2 * (onesB - onesA)), // subtracted the small digit from the big one
        dec2(a + b), // added instead of subtracting
        dec2(diff + 10),
        dec2(diff - 10),
      ]);
      return {
        prompt: `What is ${dec2(a)} - ${dec2(b)}?`,
        choices,
        answer,
        explain: `Line up the decimal points. The hundredths need a borrow: ${onesA + 10} - ${onesB} = ${onesA + 10 - onesB}. So ${dec2(a)} - ${dec2(b)} = ${correct}.`,
      };
    },
  },
  {
    id: 'mt-021',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'multiply a decimal by 10 or 100',
    generate: (rng) => {
      const cents = randInt(rng, 10, 98) * 10 + randInt(rng, 1, 9);
      const factor = pick(rng, [10, 100]);
      const correct = num((cents * factor) / 100);
      const { choices, answer } = buildChoices(rng, correct, [
        num((cents * factor * 10) / 100), // moved the point one place too far
        dec2(cents), // moved nothing at all
        num((cents * factor) / 1000),
        num(cents / 1000),
        num((cents * factor) / 100 + factor),
      ]);
      return {
        prompt: `What is ${dec2(cents)} x ${factor}?`,
        choices,
        answer,
        explain: `Multiplying by ${factor} slides the decimal point ${factor === 10 ? 'one place' : 'two places'} to the right, so ${dec2(cents)} becomes ${correct}.`,
      };
    },
  },
  {
    id: 'mt-022',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'percent of a number',
    generate: (rng) => {
      const base = randInt(rng, 2, 20) * 20;
      const pct = pick(rng, [5, 10, 20, 25, 40, 50, 60, 75]);
      const part = (base * pct) / 100;
      const correct = num(part);
      const { choices, answer } = buildChoices(rng, correct, [
        num(part * 10), // divided by 10 instead of 100
        num(base - part), // found the part that is left over
        num(part + pct),
        num(base + pct),
        num(part / 10),
      ]);
      return {
        prompt: `What is ${pct}% of ${base}?`,
        choices,
        answer,
        explain: `${pct}% means ${frac(pct, 100)}, and ${frac(pct, 100)} of ${base} is ${base} x ${pct} / 100 = ${correct}.`,
      };
    },
  },
  {
    id: 'mt-023',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'percent, fraction, decimal conversion',
    generate: (rng) => {
      const [pct, n, d] = pick(rng, [
        [5, 1, 20],
        [10, 1, 10],
        [20, 1, 5],
        [25, 1, 4],
        [30, 3, 10],
        [40, 2, 5],
        [50, 1, 2],
        [60, 3, 5],
        [75, 3, 4],
        [80, 4, 5],
        [90, 9, 10],
      ] as const);
      const dec = pct / 100;
      const mode = pick(rng, ['toDecimal', 'toFraction', 'toPercent'] as const);

      if (mode === 'toDecimal') {
        const correct = num(dec);
        const { choices, answer } = buildChoices(rng, correct, [
          num(pct / 10), // moved the point only one place
          num(pct), // moved it not at all
          num(pct / 1000),
          num(1 - dec),
        ]);
        return {
          prompt: `Write ${pct}% as a decimal.`,
          choices,
          answer,
          explain: `Percent means out of 100, so ${pct}% = ${pct}/100 = ${correct}.`,
        };
      }

      if (mode === 'toFraction') {
        const correct = frac(n, d);
        const { choices, answer } = buildChoices(rng, correct, [
          `${pct}/10`, // out of 10 instead of out of 100
          frac(100 - pct, 100), // reduced the leftover percent
          frac(n + 1, d),
          frac(n, d + 1),
        ]);
        return {
          prompt: `Which fraction is equal to ${pct}%?`,
          choices,
          answer,
          explain: `${pct}% = ${pct}/100, and dividing top and bottom by ${gcd(pct, 100)} gives ${correct}.`,
        };
      }

      const correct = `${pct}%`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${num(dec)}%`, // forgot to move the point
        `${num(pct * 10)}%`,
        `${num(pct / 10)}%`,
        `${num(100 - pct)}%`,
      ]);
      return {
        prompt: `Write ${num(dec)} as a percent.`,
        choices,
        answer,
        explain: `Multiply by 100 to get percent: ${num(dec)} x 100 = ${pct}, so ${num(dec)} = ${pct}%.`,
      };
    },
  },
  {
    id: 'mt-024',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'money word problem',
    generate: (rng) => {
      const name = pick(rng, NAMES);
      const item = pick(rng, ['book', 'game', 'kite', 'puzzle', 'backpack', 'water bottle']);
      const price = randInt(rng, 2, 18) * 100 + randInt(rng, 1, 19) * 5;
      const paid = pick(rng, [2000, 2500, 5000]);
      const change = paid - price;
      const correct = money(change);
      const { choices, answer } = buildChoices(rng, correct, [
        money(paid + price), // added instead of subtracting
        money(change + 100), // lost a dollar in the borrow
        money(change - 10),
        money(change + 10),
      ]);
      return {
        prompt: `A ${item} costs ${money(price)}. ${name} pays with ${money(paid)}. How much change is due?`,
        choices,
        answer,
        explain: `Subtract the price from what was handed over: ${money(paid)} - ${money(price)} = ${correct}.`,
      };
    },
  },
  {
    id: 'mt-025',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'money total word problem',
    generate: (rng) => {
      const name = pick(rng, NAMES);
      const plural = pick(rng, ['notebooks', 'markers', 'apples', 'folders', 'stickers']);
      const single = pick(rng, ['pen', 'snack', 'ruler', 'eraser', 'juice box']);
      const qty = randInt(rng, 2, 6);
      const unit = randInt(rng, 25, 95) * 5;
      const extra = randInt(rng, 30, 180) * 5;
      const total = qty * unit + extra;
      const correct = money(total);
      const { choices, answer } = buildChoices(rng, correct, [
        money(qty * unit), // forgot the second item
        money(unit + extra), // forgot to multiply
        money(qty * (unit + extra)), // multiplied everything by the count
        money(total + 100),
      ]);
      return {
        prompt: `${name} buys ${qty} ${plural} at ${money(unit)} each and one ${single} for ${money(extra)}. What is the total?`,
        choices,
        answer,
        explain: `${qty} x ${money(unit)} = ${money(qty * unit)}, then ${money(qty * unit)} + ${money(extra)} = ${correct}.`,
      };
    },
  },
  {
    id: 'mt-026',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'elapsed time',
    generate: (rng) => {
      const start = 60 + randInt(rng, 0, 71) * 5;
      const durH = randInt(rng, 1, 2);
      const durM = pick(rng, [15, 30, 45]);
      const end = start + durH * 60 + durM;
      const correct = `${clock(end)} p.m.`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${clock(end + 60)} p.m.`, // counted an extra hour
        `${clock(end - 60)} p.m.`,
        `${clock(end + durM)} p.m.`, // added the minutes twice
        `${clock(end - durM)} p.m.`,
        `${clock(end + 30)} p.m.`,
      ]);
      const event = pick(rng, ['movie', 'practice', 'rehearsal', 'field trip', 'class']);
      return {
        prompt: `A ${event} starts at ${clock(start)} p.m. and lasts ${durH} hour${durH === 1 ? '' : 's'} ${durM} minutes. When does it end?`,
        choices,
        answer,
        explain: `${durH} hour${durH === 1 ? '' : 's'} after ${clock(start)} is ${clock(start + durH * 60)}, and ${durM} minutes more is ${clock(end)} p.m.`,
      };
    },
  },
  {
    id: 'mt-027',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'convert liquid measures',
    generate: (rng) => {
      const c = pick(rng, [
        { bigPl: 'quarts', smallPl: 'cups', f: 4 },
        { bigPl: 'gallons', smallPl: 'quarts', f: 4 },
        { bigPl: 'pints', smallPl: 'cups', f: 2 },
        { bigPl: 'gallons', smallPl: 'cups', f: 16 },
      ]);
      const n = randInt(rng, 2, 9);
      if (rng() < 0.5) {
        const total = n * c.f;
        const correct = `${total} ${c.smallPl}`;
        const { choices, answer } = buildChoices(rng, correct, [
          `${n * 2} ${c.smallPl}`, // used 2 as the factor
          `${n * 8} ${c.smallPl}`,
          `${n + c.f} ${c.smallPl}`, // added the factor instead of multiplying
          `${n * c.f * 2} ${c.smallPl}`,
          `${(n * c.f) / 2} ${c.smallPl}`,
          `${n * c.f + c.f} ${c.smallPl}`,
          `${n * c.f - c.f} ${c.smallPl}`,
        ]);
        return {
          prompt: `How many ${c.smallPl} are in ${n} ${c.bigPl}?`,
          choices,
          answer,
          explain: `Each of the ${n} ${c.bigPl} holds ${c.f} ${c.smallPl}, and ${n} x ${c.f} = ${total}.`,
        };
      }
      const amount = n * c.f;
      const correct = `${n} ${c.bigPl}`;
      // n is small here, so several formulas can coincide (n + f == n x 2 when
      // n == f, and n x f == n x 2 when f is 2). n-1 and n+1 always survive.
      const { choices, answer } = buildChoices(rng, correct, [
        `${n * c.f} ${c.bigPl}`, // multiplied instead of dividing
        `${n + c.f} ${c.bigPl}`, // added instead of dividing
        `${n * 2} ${c.bigPl}`,
        `${n - 1} ${c.bigPl}`,
        `${n + 1} ${c.bigPl}`,
      ]);
      return {
        prompt: `How many ${c.bigPl} are in ${amount} ${c.smallPl}?`,
        choices,
        answer,
        explain: `There are ${c.f} ${c.smallPl} in one, so divide: ${amount} / ${c.f} = ${n} ${c.bigPl}.`,
      };
    },
  },
  {
    id: 'mt-028',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'convert metric length',
    generate: (rng) => {
      const c = pick(rng, [
        { bigPl: 'meters', smallPl: 'centimeters', f: 100 },
        { bigPl: 'centimeters', smallPl: 'millimeters', f: 10 },
        { bigPl: 'kilometers', smallPl: 'meters', f: 1000 },
      ]);
      const n = randInt(rng, 2, 9);
      if (rng() < 0.5) {
        const total = n * c.f;
        const correct = `${total} ${c.smallPl}`;
        const { choices, answer } = buildChoices(rng, correct, [
          `${n * 10} ${c.smallPl}`, // shifted one place instead of the right number
          `${n * 100} ${c.smallPl}`,
          `${n * 1000} ${c.smallPl}`,
          `${n + c.f} ${c.smallPl}`,
          `${n * c.f * 10} ${c.smallPl}`,
        ]);
        return {
          prompt: `How many ${c.smallPl} are in ${n} ${c.bigPl}?`,
          choices,
          answer,
          explain: `One of the ${c.bigPl} is ${c.f} ${c.smallPl}, so ${n} x ${c.f} = ${total} ${c.smallPl}.`,
        };
      }
      const amount = n * c.f;
      const correct = `${n} ${c.bigPl}`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${amount} ${c.bigPl}`, // forgot to convert at all
        `${n * 10} ${c.bigPl}`,
        `${num(n / 10)} ${c.bigPl}`,
        `${n + 1} ${c.bigPl}`,
        `${n - 1} ${c.bigPl}`,
      ]);
      return {
        prompt: `How many ${c.bigPl} are in ${amount} ${c.smallPl}?`,
        choices,
        answer,
        explain: `Divide by ${c.f} because that many ${c.smallPl} make one: ${amount} / ${c.f} = ${n} ${c.bigPl}.`,
      };
    },
  },
  {
    id: 'mt-029',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'convert minutes and hours',
    generate: (rng) => {
      const h = randInt(rng, 2, 6);
      const m = pick(rng, [5, 10, 15, 20, 25, 35, 40, 45, 50]);
      const total = h * 60 + m;
      if (rng() < 0.5) {
        const correct = `${total} minutes`;
        const { choices, answer } = buildChoices(rng, correct, [
          `${h * 100 + m} minutes`, // used 100 minutes in an hour
          `${h * 60} minutes`, // dropped the extra minutes
          `${h * 60 - m} minutes`,
          `${h * 30 + m} minutes`,
        ]);
        return {
          prompt: `How many minutes are in ${h} hours ${m} minutes?`,
          choices,
          answer,
          explain: `${h} x 60 = ${h * 60} minutes, plus ${m} more is ${total} minutes.`,
        };
      }
      const hm = (hours: number, mins: number) =>
        `${hours} hour${hours === 1 ? '' : 's'} ${mins} minutes`;
      const correct = hm(h, m);
      const { choices, answer } = buildChoices(rng, correct, [
        hm(h + 1, m),
        hm(h, 60 - m), // took the leftover from the wrong end
        hm(h - 1, m),
        hm(h, m + 10),
      ]);
      return {
        prompt: `How many hours and minutes is ${total} minutes?`,
        choices,
        answer,
        explain: `${total} / 60 = ${h} with ${m} left over, so ${total} minutes is ${correct}.`,
      };
    },
  },
  {
    id: 'mt-030',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'area of a rectangle',
    generate: (rng) => {
      const unit = pick(rng, LENGTH_UNITS);
      const long = randInt(rng, 4, 15);
      const wide = randInt(rng, 3, 12);
      const area = long * wide;
      const correct = `${area} sq ${unit}`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${2 * (long + wide)} sq ${unit}`, // found the perimeter instead
        `${long + wide} sq ${unit}`, // added the sides
        `${area + long} sq ${unit}`,
        `${area - wide} sq ${unit}`,
        `${area * 2} sq ${unit}`,
        `${area + wide} sq ${unit}`,
      ]);
      return {
        prompt: `A rectangle is ${long} ${unit} by ${wide} ${unit}. What is its area?`,
        choices,
        answer,
        explain: `Area multiplies the sides: ${long} x ${wide} = ${area} sq ${unit}.`,
      };
    },
  },
  {
    id: 'mt-031',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 3,
    topic: 'area of a triangle',
    generate: (rng) => {
      const unit = pick(rng, LENGTH_UNITS);
      const base = randInt(rng, 2, 7) * 2; // even, so half of base x height stays whole
      const height = randInt(rng, 3, 15);
      const area = (base * height) / 2;
      const correct = `${area} sq ${unit}`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${base * height} sq ${unit}`, // forgot to take half
        `${base + height} sq ${unit}`, // added instead of multiplying
        `${area + base} sq ${unit}`,
        `${area - height} sq ${unit}`,
      ]);
      return {
        prompt: `A triangle has a base of ${base} ${unit} and a height of ${height} ${unit}. What is its area?`,
        choices,
        answer,
        explain: `Area is half of base x height: ${base} x ${height} = ${base * height}, and half of ${base * height} is ${area} sq ${unit}.`,
      };
    },
  },
  {
    id: 'mt-032',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 3,
    topic: 'multiply two-digit numbers',
    generate: (rng) => {
      const aTens = randInt(rng, 1, 2);
      const aOnes = randInt(rng, 1, 9);
      const bTens = randInt(rng, 1, 2);
      const bOnes = randInt(rng, 1, 9);
      const a = aTens * 10 + aOnes;
      const b = bTens * 10 + bOnes;
      const product = a * b;
      const correct = num(product);
      // Multiplied tens by tens and ones by ones, skipping the cross terms.
      const diagonal = aTens * bTens * 100 + aOnes * bOnes;
      const { choices, answer } = buildChoices(rng, correct, [
        num(diagonal),
        num(product - 100),
        num(product + b),
        num(product - a),
      ]);
      return {
        prompt: `What is ${a} x ${b}?`,
        choices,
        answer,
        explain: `${a} x ${bTens * 10} = ${a * bTens * 10} and ${a} x ${bOnes} = ${a * bOnes}. Adding those parts gives ${correct}.`,
      };
    },
  },
  {
    id: 'mt-033',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 3,
    topic: 'angles on a line',
    generate: (rng) => {
      if (rng() < 0.5) {
        const raw = randInt(rng, 5, 31) * 5;
        const a = raw === 90 ? 95 : raw;
        const other = 180 - a;
        const correct = `${other} degrees`;
        const { choices, answer } = buildChoices(rng, correct, [
          `${360 - a} degrees`, // used a full turn
          `${90 - a > 0 ? 90 - a : a - 90} degrees`, // used a right angle
          `${180 + a} degrees`,
          `${a} degrees`,
        ]);
        return {
          prompt: `Two angles together form a straight line. One measures ${a} degrees. How big is the other?`,
          choices,
          answer,
          explain: `A straight line measures 180 degrees, so the other angle is 180 - ${a} = ${other} degrees.`,
        };
      }
      const raw = randInt(rng, 3, 15) * 5;
      const a = raw === 45 ? 50 : raw;
      const other = 90 - a;
      const correct = `${other} degrees`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${180 - a} degrees`, // used a straight line
        `${90 + a} degrees`,
        `${45 - a > 0 ? 45 - a : a - 45} degrees`,
        `${a} degrees`,
      ]);
      return {
        prompt: `Two angles together form a right angle. One measures ${a} degrees. How big is the other?`,
        choices,
        answer,
        explain: `A right angle measures 90 degrees, so the other angle is 90 - ${a} = ${other} degrees.`,
      };
    },
  },
  {
    id: 'mt-034',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 3,
    topic: 'angles in a triangle',
    generate: (rng) => {
      const a = randInt(rng, 4, 20) * 5;
      const b = randInt(rng, 4, Math.floor((160 - a) / 5)) * 5;
      const third = 180 - a - b;
      const correct = `${third} degrees`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${180 - a} degrees`, // subtracted only one angle
        `${a + b} degrees`, // gave the sum of the two known angles
        `${360 - a - b} degrees`, // used 360 instead of 180
        `${third + 10} degrees`,
      ]);
      return {
        prompt: `Two angles of a triangle measure ${a} degrees and ${b} degrees. What is the third angle?`,
        choices,
        answer,
        explain: `The three angles add to 180 degrees: ${a} + ${b} = ${a + b}, and 180 - ${a + b} = ${third} degrees.`,
      };
    },
  },
  {
    id: 'mt-035',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 3,
    topic: 'place value in whole numbers',
    generate: (rng) => {
      const digits = sample(rng, [1, 2, 3, 4, 5, 6, 7, 8, 9], 4);
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
      const correct = commas(worth);
      const { choices, answer } = buildChoices(
        rng,
        correct,
        places
          .filter((p) => p.value !== place.value)
          .map((p) => commas(digit * p.value)),
      );
      return {
        prompt: `In the number ${shown}, what is the value of the digit ${digit}?`,
        choices,
        answer,
        explain: `That ${digit} sits in the ${place.name} place, so it is worth ${digit} x ${commas(place.value)} = ${correct}.`,
      };
    },
  },
  {
    id: 'mt-036',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 3,
    topic: 'order of operations',
    generate: (rng) => {
      if (rng() < 0.5) {
        const a = randInt(rng, 2, 12);
        const b = randInt(rng, 2, 9);
        const c = randInt(rng, 2, 9);
        const total = a + b * c;
        const correct = num(total);
        const { choices, answer } = buildChoices(rng, correct, [
          num((a + b) * c), // worked strictly left to right
          num(a + b + c),
          num(a * b + c),
          num(a * b * c),
          num(a * (b + c)),
        ]);
        return {
          prompt: `What is ${a} + ${b} x ${c}?`,
          choices,
          answer,
          explain: `Multiply before adding: ${b} x ${c} = ${b * c}, then ${a} + ${b * c} = ${total}.`,
        };
      }
      const a = randInt(rng, 3, 9);
      const b = randInt(rng, 4, 9);
      const c = randInt(rng, 2, b - 1);
      const total = a * b - c;
      const correct = num(total);
      const { choices, answer } = buildChoices(rng, correct, [
        num(a * (b - c)), // subtracted before multiplying
        num(a * b + c),
        num(a + b * c),
        num(a + b - c),
        num(a * b), // forgot to subtract
      ]);
      return {
        prompt: `What is ${a} x ${b} - ${c}?`,
        choices,
        answer,
        explain: `Multiply first: ${a} x ${b} = ${a * b}, then ${a * b} - ${c} = ${total}.`,
      };
    },
  },
  {
    id: 'mt-037',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 3,
    topic: 'order of operations with parentheses',
    generate: (rng) => {
      const a = randInt(rng, 2, 9);
      const b = randInt(rng, 2, 9);
      const c = randInt(rng, 2, 6);
      const d = randInt(rng, 1, 9);
      const total = (a + b) * c - d;
      const correct = num(total);
      const { choices, answer } = buildChoices(rng, correct, [
        num(a + b * c - d), // ignored the parentheses
        num((a + b) * c + d),
        num((a + b) * c), // stopped before subtracting
        num(a * b * c - d),
      ]);
      return {
        prompt: `What is (${a} + ${b}) x ${c} - ${d}?`,
        choices,
        answer,
        explain: `Parentheses first: ${a} + ${b} = ${a + b}. Then ${a + b} x ${c} = ${(a + b) * c}, and ${(a + b) * c} - ${d} = ${total}.`,
      };
    },
  },
  {
    id: 'mt-038',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 3,
    topic: 'mean of a small set',
    generate: (rng) => {
      const count = pick(rng, [4, 5]);
      const mean = randInt(rng, 8, 20);
      // Offsets that cancel keep the mean whole; y > x keeps the set from
      // collapsing to two repeated values, and the spread stays under the mean
      // so every value is positive.
      const x = randInt(rng, 1, 3);
      const y = x + randInt(rng, 1, 3);
      const offsets = count === 4 ? [x, -x, y, -y] : [x, -x, y, -y, 0];
      const values = sample(rng, offsets.map((o) => mean + o), count);
      const sum = mean * count;
      const correct = num(mean);
      const { choices, answer } = buildChoices(rng, correct, [
        num(sum), // gave the total instead of the average
        num(mean + 1),
        num(mean - 1),
        num(Math.max(...values)),
      ]);
      return {
        prompt: `What is the mean of ${values.join(', ')}?`,
        choices,
        answer,
        explain: `${values.join(' + ')} = ${sum}, and ${sum} / ${count} = ${mean}.`,
      };
    },
  },
  {
    id: 'mt-039',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'median of a small set',
    generate: (rng) => {
      const values = sample(
        rng,
        Array.from({ length: 40 }, (_, i) => i + 1),
        5,
      );
      const sorted = values.slice().sort((p, q) => p - q);
      const median = sorted[2];
      const correct = num(median);
      const { choices, answer } = buildChoices(rng, correct, [
        num(values[2]), // took the middle of the unsorted list
        num(sorted[4]), // took the largest
        num(sorted[0]), // took the smallest
        num(median + 1),
      ]);
      return {
        prompt: `What is the median of ${values.join(', ')}?`,
        choices,
        answer,
        explain: `In order the numbers are ${sorted.join(', ')}, so the middle value is ${median}.`,
      };
    },
  },
  {
    id: 'mt-040',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'mode of a small set',
    generate: (rng) => {
      const picked = sample(
        rng,
        Array.from({ length: 30 }, (_, i) => i + 1),
        4,
      );
      const mode = picked[0];
      const others = picked.slice(1);
      const list = sample(rng, [mode, mode, mode, ...others], 6);
      const correct = num(mode);
      const { choices, answer } = buildChoices(rng, correct, [
        num(others[0]),
        num(others[1]),
        num(others[2]),
        num(3), // gave how many times it appears
      ]);
      return {
        prompt: `What is the mode of ${list.join(', ')}?`,
        choices,
        answer,
        explain: `${mode} appears 3 times while ${others[0]}, ${others[1]}, and ${others[2]} each appear once, so the mode is ${mode}.`,
      };
    },
  },
];
