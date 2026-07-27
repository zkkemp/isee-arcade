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
 * Parameterized ISEE Lower Level Math Achievement templates, set 3: fractions,
 * decimals, percents, ratios, and geometry/measurement computation.
 *
 * Same two rules as mathTemplates.ts:
 * 1. Ranges are constrained so the arithmetic stays clean (whole quotients,
 *    terminating decimals, positive results a 10-year-old expects).
 * 2. Distractors are computed WRONG ANSWERS (wrong operation, forgot to convert,
 *    used the base instead of the area, added instead of multiplied), never
 *    random numbers, and the explanation is built from the same numbers.
 *
 * A note on mixed numbers: the improper form of a mixed number is numerically
 * EQUAL to it ("9/4" == "2 1/4"), which would be a second right answer. So every
 * mixed-number template keeps its choices in ONE representation (all via
 * mixedStr, plus at most one clearly-smaller proper fraction) so equal values
 * collapse to equal text and get deduped rather than shipping two right answers.
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

/** "3", "2 1/2", "3/4" - a normalized mixed number, fraction part reduced. */
function mixedStr(whole: number, n: number, d: number): string {
  const w = whole + Math.floor(n / d);
  let r = n % d;
  const g = gcd(r, d) || 1;
  r = r / g;
  const dd = d / g;
  if (r === 0) return `${w}`;
  if (w === 0) return `${r}/${dd}`;
  return `${w} ${r}/${dd}`;
}

/** 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 4 -> "4th". */
function ord(k: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = k % 100;
  return `${k}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/** Fractions with terminating decimals, already in lowest terms. */
const FRAC_DEC: ReadonlyArray<readonly [number, number, number]> = [
  [1, 2, 0.5],
  [1, 4, 0.25],
  [3, 4, 0.75],
  [1, 5, 0.2],
  [2, 5, 0.4],
  [3, 5, 0.6],
  [4, 5, 0.8],
  [1, 10, 0.1],
  [3, 10, 0.3],
  [7, 10, 0.7],
  [9, 10, 0.9],
  [1, 8, 0.125],
  [3, 8, 0.375],
  [5, 8, 0.625],
  [7, 8, 0.875],
  [1, 20, 0.05],
  [3, 20, 0.15],
  [7, 20, 0.35],
  [13, 20, 0.65],
];

export const MATH_TEMPLATES_3: QuestionTemplate[] = [
  // --- multiply a fraction by a whole number -----------------------------
  {
    id: 'mt3-001',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'multiply a fraction by a whole number',
    generate: (rng) => {
      const d = pick(rng, [5, 6, 8, 9, 10, 12]);
      const w = randInt(rng, 2, 4);
      // Keep the product proper: n * w stays below d.
      const n = randInt(rng, 1, Math.max(1, Math.floor((d - 1) / w)));
      const correct = frac(n * w, d);
      const { choices, answer } = buildChoices(rng, correct, [
        frac(n, d * w), // multiplied the bottom instead of the top
        frac(n * w + 1, d),
        frac(n, d), // never multiplied at all
        frac(n + w, d), // added the whole number to the top
        frac(n * w + w, d),
      ]);
      return {
        prompt: `What is ${w} x ${n}/${d}?`,
        choices,
        answer,
        explain: `Multiply the top by the whole number and keep the bottom: ${w} x ${n} = ${n * w}, so ${w} x ${n}/${d} = ${n * w}/${d}${correct === `${n * w}/${d}` ? '' : ` = ${correct}`}.`,
      };
    },
  },
  {
    id: 'mt3-002',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'multiply a fraction by a whole number',
    generate: (rng) => {
      const d = pick(rng, [3, 4, 5, 6, 8]);
      const n = randInt(rng, 2, d - 1);
      const w = randInt(rng, 2, 5);
      const total = n * w;
      // Force an improper result that is not a whole number.
      if (total <= d || total % d === 0) {
        // Nudge into range: use a bigger whole so total > d and not a multiple.
        return (MATH_TEMPLATES_3.find((t) => t.id === 'mt3-002') as QuestionTemplate)
          ? fallback002(rng, d)
          : fallback002(rng, d);
      }
      const whole = Math.floor(total / d);
      const rem = total % d;
      const correct = mixedStr(whole, rem, d);
      const { choices, answer } = buildChoices(rng, correct, [
        mixedStr(whole + 1, rem, d),
        mixedStr(whole + 2, rem, d),
        frac(n, d), // never multiplied - left as the original fraction
        frac(n + w, d),
        whole > 1 ? mixedStr(whole - 1, rem, d) : mixedStr(whole + 3, rem, d),
      ]);
      return {
        prompt: `What is ${w} x ${n}/${d}?`,
        choices,
        answer,
        explain: `${w} x ${n} = ${total}, so ${w} x ${n}/${d} = ${total}/${d}. That is ${whole} whole with ${rem}/${d} left, or ${correct}.`,
      };
    },
  },
  {
    id: 'mt3-003',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'multiply a fraction by a whole number',
    generate: (rng) => {
      // A whole-number result: the whole number is a multiple of the bottom.
      const d = pick(rng, [3, 4, 5, 6]);
      const k = randInt(rng, 2, 3);
      const w = d * k;
      // This family teaches "a fraction of a whole," not simplification. Keep
      // the prompt fraction reduced so 3/6 does not look like an accidental
      // trick; equivalent-fraction practice belongs in its own clearly named
      // question family.
      const reducedNumerators = Array.from(
        { length: d - 2 },
        (_, index) => index + 2,
      ).filter((candidate) => gcd(candidate, d) === 1);
      const n = pick(rng, reducedNumerators);
      const result = n * k;
      const correct = num(result);
      const { choices, answer } = buildChoices(rng, correct, [
        num(n * w), // forgot to divide by the bottom
        num(w), // divided but forgot to multiply by the top
        num(result + 1),
        num(result - 1),
        num(w - n),
      ]);
      return {
        prompt: `What is ${n}/${d} x ${w}?`,
        choices,
        answer,
        explain: `Split ${w} into ${d} equal groups. Each group has ${k}.\nTake ${n} groups because the fraction is ${n}/${d}: ${k} + ${Array.from({ length: n - 1 }, () => k).join(' + ')} = ${result}.\nThe answer is ${result}.`,
      };
    },
  },
  // --- fraction of a set / quantity --------------------------------------
  {
    id: 'mt3-004',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'fraction of a set',
    generate: (rng) => {
      const d = pick(rng, [3, 4, 5, 6]);
      const m = randInt(rng, 3, 8);
      const total = d * m;
      const n = randInt(rng, 2, d - 1);
      const part = n * m;
      const correct = num(part);
      const { choices, answer } = buildChoices(rng, correct, [
        num(m), // only found one part (1/d of it)
        num(total - part), // found the leftover part
        num(total), // gave the whole amount
        num(part + m),
        num(part - m),
        // Structurally-distinct fallbacks: when d=3, n=2 the leftover, one-part,
        // and part-m distractors all collapse. total + m is always distinct from
        // {one part, whole, correct}, guaranteeing three unique choices.
        num(part + 2 * m),
        num(total + m),
      ]);
      return {
        prompt: `What is ${n}/${d} of ${total}?`,
        choices,
        answer,
        explain: `Split ${total} into ${d} equal groups. Each group has ${m}.\nTake ${n} groups because the fraction is ${n}/${d}: ${Array.from({ length: n }, () => m).join(' + ')} = ${part}.\nThe answer is ${part}.`,
      };
    },
  },
  {
    id: 'mt3-005',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'fraction of a set',
    generate: (rng) => {
      const name = pick(rng, NAMES);
      const thing = pick(rng, ['stickers', 'marbles', 'cards', 'beads', 'stamps', 'shells']);
      const d = pick(rng, [3, 4, 5, 6, 8]);
      const m = randInt(rng, 3, 9);
      const total = d * m;
      const n = randInt(rng, 2, d - 1);
      const part = n * m;
      const correct = num(part);
      const { choices, answer } = buildChoices(rng, correct, [
        num(total - part), // gave how many are NOT that kind
        num(m), // only one group
        num(total), // gave the whole collection
        num(part + m),
        num(part - m),
        // Structurally-distinct fallbacks: for small (d,n) - e.g. d=3, n=2 - the
        // leftover, one-group, and part-m distractors collapse to one value.
        // total + m is always distinct, guaranteeing three unique choices.
        num(part + 2 * m),
        num(total + m),
      ]);
      return {
        prompt: `${name} has ${total} ${thing}. ${n}/${d} of them are blue. How many are blue?`,
        choices,
        answer,
        explain: `Divide ${total} into ${d} groups of ${m}, then take ${n}: ${n} x ${m} = ${part} blue ${thing}.`,
      };
    },
  },
  {
    id: 'mt3-006',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'fraction of a quantity',
    generate: (rng) => {
      const d = pick(rng, [3, 4, 5, 6]);
      const m = randInt(rng, 2, 8);
      const totalDollars = d * m;
      const n = randInt(rng, 2, d - 1);
      const partDollars = n * m;
      const correct = money(partDollars * 100);
      const { choices, answer } = buildChoices(rng, correct, [
        money((totalDollars - partDollars) * 100), // the leftover money
        money(m * 100), // one part only
        money(totalDollars * 100), // the whole amount
        money((partDollars + m) * 100),
        money((partDollars - m) * 100),
        // Structurally-distinct fallbacks so small (d,n) - e.g. d=3, n=2, where
        // the leftover, one-part, and n-1 distractors all collapse to the same
        // value - still leave three unique choices for buildChoices.
        money((partDollars + 2 * m) * 100),
        money((totalDollars + m) * 100),
      ]);
      return {
        prompt: `What is ${n}/${d} of ${money(totalDollars * 100)}?`,
        choices,
        answer,
        explain: `${money(totalDollars * 100)} split into ${d} equal parts is ${money(m * 100)} each. Take ${n} parts: ${n} x ${money(m * 100)} = ${correct}.`,
      };
    },
  },
  // --- mixed number <-> improper fraction --------------------------------
  {
    id: 'mt3-007',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'mixed number to improper fraction',
    generate: (rng) => {
      const [n, d] = pick(rng, [
        [1, 2],
        [1, 3],
        [2, 3],
        [1, 4],
        [3, 4],
        [1, 5],
        [2, 5],
        [3, 5],
        [4, 5],
        [1, 6],
        [5, 6],
        [3, 8],
        [5, 8],
      ] as const);
      const w = randInt(rng, 1, 5);
      const top = w * d + n;
      const correct = `${top}/${d}`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${w * d - n}/${d}`, // subtracted the top instead of adding
        `${w * n}/${d}`, // multiplied the whole by the top
        `${top + d}/${d}`, // one whole too many
        `${w + n}/${d}`, // added without multiplying
        `${w * d}/${d}`, // forgot to add the top
      ]);
      return {
        prompt: `Write ${w} ${n}/${d} as an improper fraction.`,
        choices,
        answer,
        explain: `Multiply the whole by the bottom and add the top: ${w} x ${d} = ${w * d}, then ${w * d} + ${n} = ${top}. So ${w} ${n}/${d} = ${top}/${d}.`,
      };
    },
  },
  {
    id: 'mt3-008',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'improper fraction to mixed number',
    generate: (rng) => {
      const d = pick(rng, [3, 4, 5, 6, 8]);
      // Remainder coprime to d so the given fraction is already in lowest terms.
      const rem = pick(
        rng,
        Array.from({ length: d - 1 }, (_, i) => i + 1).filter((r) => gcd(r, d) === 1),
      );
      const w = randInt(rng, 1, 5);
      const top = w * d + rem;
      const correct = mixedStr(w, rem, d);
      const { choices, answer } = buildChoices(rng, correct, [
        mixedStr(w + 1, rem, d),
        mixedStr(w, d - rem, d), // remainder counted from the wrong end
        rem + 1 < d ? mixedStr(w, rem + 1, d) : mixedStr(w + 2, rem, d),
        w > 1 ? mixedStr(w - 1, rem, d) : mixedStr(w + 3, rem, d),
      ]);
      return {
        prompt: `Write ${top}/${d} as a mixed number.`,
        choices,
        answer,
        explain: `How many whole ${d}s fit in ${top}? ${w}, using ${w * d}, with ${rem} left over. So ${top}/${d} = ${correct}.`,
      };
    },
  },
  {
    id: 'mt3-009',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'mixed number to improper fraction',
    generate: (rng) => {
      const c = pick(rng, [
        { d: 2, piece: 'half turns' },
        { d: 3, piece: 'thirds' },
        { d: 4, piece: 'quarter turns' },
        { d: 5, piece: 'fifths' },
        { d: 6, piece: 'sixths' },
        { d: 8, piece: 'eighths' },
      ]);
      const w = randInt(rng, 1, 4);
      const n = randInt(rng, 1, c.d - 1);
      const total = w * c.d + n;
      const correct = num(total);
      const { choices, answer } = buildChoices(rng, correct, [
        num(w + n), // did not multiply
        num(w * c.d), // forgot the extra pieces
        num(total + c.d),
        num(total - c.d),
        num(c.d + n),
      ]);
      return {
        prompt: `Each whole has ${c.d} ${c.piece}. How many ${c.piece} are in ${w} ${n}/${c.d}?`,
        choices,
        answer,
        explain: `${w} wholes make ${w} x ${c.d} = ${w * c.d} ${c.piece}, plus ${n} more is ${total}.`,
      };
    },
  },
  // --- add / subtract mixed numbers --------------------------------------
  {
    id: 'mt3-010',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'add mixed numbers',
    generate: (rng) => {
      const d = pick(rng, [4, 5, 6, 8, 10, 12]);
      const b = randInt(rng, 1, d - 2);
      const e = randInt(rng, 1, d - 1 - b); // b + e < d, no regrouping
      const a = randInt(rng, 1, 4);
      const c = randInt(rng, 1, 4);
      const sumW = a + c;
      const sumR = b + e;
      const correct = mixedStr(sumW, sumR, d);
      const { choices, answer } = buildChoices(rng, correct, [
        mixedStr(sumW + 1, sumR, d),
        mixedStr(sumW + 2, sumR, d),
        num(sumW), // dropped the fraction part
        mixedStr(sumW, sumR >= 2 ? sumR - 1 : sumR + 1, d),
      ]);
      return {
        prompt: `What is ${mixedStr(a, b, d)} + ${mixedStr(c, e, d)}?`,
        choices,
        answer,
        explain: `Add the wholes: ${a} + ${c} = ${sumW}. Add the fractions: ${b}/${d} + ${e}/${d} = ${sumR}/${d}. Together that is ${correct}.`,
      };
    },
  },
  {
    id: 'mt3-011',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'subtract mixed numbers',
    generate: (rng) => {
      const d = pick(rng, [4, 5, 6, 8, 10, 12]);
      const e = randInt(rng, 1, d - 2);
      const b = randInt(rng, e, d - 1); // b >= e, no borrowing
      const c = randInt(rng, 1, 3);
      const a = randInt(rng, c + 1, c + 4);
      const resW = a - c;
      const resR = b - e;
      const correct = mixedStr(resW, resR, d);
      const { choices, answer } = buildChoices(rng, correct, [
        mixedStr(resW + 1, resR, d),
        mixedStr(resW + 2, resR, d),
        mixedStr(resW, resR + 1 < d ? resR + 1 : resR, d),
        num(a + c), // added the wholes instead of subtracting
      ]);
      return {
        prompt: `What is ${mixedStr(a, b, d)} - ${mixedStr(c, e, d)}?`,
        choices,
        answer,
        explain: `Subtract the wholes: ${a} - ${c} = ${resW}. Subtract the fractions: ${b}/${d} - ${e}/${d} = ${resR}/${d}. Together that is ${correct}.`,
      };
    },
  },
  {
    id: 'mt3-012',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 3,
    topic: 'add mixed numbers with regrouping',
    generate: (rng) => {
      const d = pick(rng, [4, 5, 6, 8, 10]);
      // b + e is more than d, so the fraction regroups into a whole.
      const b = randInt(rng, 2, d - 1);
      const e = randInt(rng, d + 1 - b, d - 1);
      const a = randInt(rng, 1, 4);
      const c = randInt(rng, 1, 4);
      const rem = b + e - d;
      const finalW = a + c + 1;
      const correct = mixedStr(finalW, rem, d);
      const { choices, answer } = buildChoices(rng, correct, [
        mixedStr(a + c, rem, d), // forgot to carry the regrouped whole
        mixedStr(finalW + 1, rem, d),
        mixedStr(finalW, rem + 1 < d ? rem + 1 : rem, d),
        num(a + c + 1), // dropped the fraction
      ]);
      return {
        prompt: `What is ${mixedStr(a, b, d)} + ${mixedStr(c, e, d)}?`,
        choices,
        answer,
        explain: `The fractions ${b}/${d} + ${e}/${d} = ${b + e}/${d}, which is one whole and ${rem}/${d}. Carry the 1: ${a} + ${c} + 1 = ${finalW}, giving ${correct}.`,
      };
    },
  },
  // --- compare a fraction to a decimal -----------------------------------
  {
    id: 'mt3-013',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'compare fractions and decimals',
    generate: (rng) => {
      const picks = sample(rng, FRAC_DEC, 4);
      const reps = ['f', 'd', rng() < 0.5 ? 'f' : 'd', rng() < 0.5 ? 'f' : 'd'];
      const show = (i: number) => (reps[i] === 'f' ? frac(picks[i][0], picks[i][1]) : num(picks[i][2]));
      let maxI = 0;
      for (let i = 1; i < 4; i += 1) if (picks[i][2] > picks[maxI][2]) maxI = i;
      const correct = show(maxI);
      const distractors = [0, 1, 2, 3].filter((i) => i !== maxI).map(show);
      const { choices, answer } = buildChoices(rng, correct, distractors);
      const vals = picks.map((p) => num(p[2])).join(', ');
      return {
        prompt: `Which of these is the greatest?`,
        choices,
        answer,
        explain: `As decimals these are ${vals}. The greatest value is ${num(picks[maxI][2])}, written here as ${correct}.`,
      };
    },
  },
  {
    id: 'mt3-014',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'compare fractions and decimals',
    generate: (rng) => {
      const picks = sample(rng, FRAC_DEC, 4);
      const reps = ['f', 'd', rng() < 0.5 ? 'f' : 'd', rng() < 0.5 ? 'f' : 'd'];
      const show = (i: number) => (reps[i] === 'f' ? frac(picks[i][0], picks[i][1]) : num(picks[i][2]));
      let minI = 0;
      for (let i = 1; i < 4; i += 1) if (picks[i][2] < picks[minI][2]) minI = i;
      const correct = show(minI);
      const distractors = [0, 1, 2, 3].filter((i) => i !== minI).map(show);
      const { choices, answer } = buildChoices(rng, correct, distractors);
      const vals = picks.map((p) => num(p[2])).join(', ');
      return {
        prompt: `Which of these is the least?`,
        choices,
        answer,
        explain: `As decimals these are ${vals}. The smallest value is ${num(picks[minI][2])}, written here as ${correct}.`,
      };
    },
  },
  {
    id: 'mt3-015',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'compare a fraction to a decimal',
    generate: (rng) => {
      const [n, d, v] = pick(rng, FRAC_DEC);
      // A decimal at least 0.1 away, so the comparison is unambiguous.
      const others = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].filter(
        (x) => Math.abs(x - v) >= 0.1,
      );
      const dv = pick(rng, others);
      const greater = v > dv;
      const correct = greater
        ? `${n}/${d} is greater than ${num(dv)}`
        : `${n}/${d} is less than ${num(dv)}`;
      const { choices, answer } = buildChoices(rng, correct, [
        greater
          ? `${n}/${d} is less than ${num(dv)}`
          : `${n}/${d} is greater than ${num(dv)}`,
        `${n}/${d} is equal to ${num(dv)}`,
        greater
          ? `${num(dv)} is greater than ${n}/${d}`
          : `${num(dv)} is less than ${n}/${d}`,
        `${n}/${d} is equal to ${num(v + 0.1)}`,
      ]);
      return {
        prompt: `Which statement is true?`,
        choices,
        answer,
        explain: `Write ${n}/${d} as the decimal ${num(v)}. Since ${num(v)} is ${greater ? 'more' : 'less'} than ${num(dv)}, ${correct}.`,
      };
    },
  },
  // --- place a fraction on a number line ---------------------------------
  {
    id: 'mt3-016',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'fraction on a number line',
    generate: (rng) => {
      const d = pick(rng, [3, 4, 5, 6, 8, 10]);
      const k = randInt(rng, 1, d - 1);
      const correct = frac(k, d);
      const { choices, answer } = buildChoices(rng, correct, [
        frac(k, d + 1), // counted the wrong number of parts
        frac(k - 1, d),
        frac(k + 1, d),
        frac(d - k, d), // counted from the wrong end
      ]);
      return {
        prompt: `A number line from 0 to 1 is split into ${d} equal parts. What fraction is at the ${ord(k)} mark?`,
        choices,
        answer,
        explain: `Each part is 1/${d}, and the ${ord(k)} mark is ${k} of them: ${k}/${d} = ${correct}.`,
      };
    },
  },
  {
    id: 'mt3-017',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'fraction on a number line',
    generate: (rng) => {
      const d = pick(rng, [4, 5, 6, 8, 10]);
      const k = randInt(rng, 1, d - 1); // marks from the right end (from 1)
      const fromLeft = d - k;
      const correct = frac(fromLeft, d);
      const { choices, answer } = buildChoices(rng, correct, [
        frac(k, d), // counted from the wrong end
        frac(fromLeft, d + 1),
        frac(fromLeft - 1 > 0 ? fromLeft - 1 : fromLeft + 2, d),
        frac(fromLeft + 1 < d ? fromLeft + 1 : fromLeft - 2, d),
      ]);
      return {
        prompt: `A number line from 0 to 1 is split into ${d} equal parts. Point P sits ${k} mark${k === 1 ? '' : 's'} to the LEFT of 1. What fraction is P?`,
        choices,
        answer,
        explain: `Counting from 0, P is ${d} - ${k} = ${fromLeft} marks along, so P is ${fromLeft}/${d} = ${correct}.`,
      };
    },
  },
  {
    id: 'mt3-018',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 3,
    topic: 'fraction on a number line',
    generate: (rng) => {
      const W = randInt(rng, 2, 3);
      const d = pick(rng, [2, 3, 4]);
      const total = W * d;
      // A mark that lands on a fraction (not a whole number).
      let k = randInt(rng, 1, total - 1);
      if (k % d === 0) k += 1;
      if (k >= total) k = total - 1;
      if (k % d === 0) k -= 1;
      const whole = Math.floor(k / d);
      const rem = k % d;
      const correct = mixedStr(whole, rem, d);
      const { choices, answer } = buildChoices(rng, correct, [
        mixedStr(whole + 1, rem, d),
        mixedStr(whole, rem + 1 < d ? rem + 1 : rem - 1, d),
        num(whole), // dropped the fraction part
        mixedStr(whole + 2, rem, d),
      ]);
      return {
        prompt: `A number line from 0 to ${W} is split so each whole is divided into ${d} equal parts. What number is at the ${ord(k)} mark from 0?`,
        choices,
        answer,
        explain: `Each mark is 1/${d}. The ${ord(k)} mark is ${k}/${d}, which is ${whole} whole and ${rem}/${d}: ${correct}.`,
      };
    },
  },
  // --- multiply a decimal by a whole number ------------------------------
  {
    id: 'mt3-019',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'multiply a decimal by a whole number',
    generate: (rng) => {
      const tenths = randInt(rng, 12, 88); // value = tenths / 10, one decimal place
      const w = randInt(rng, 3, 8);
      const prodTenths = tenths * w;
      const correct = num(prodTenths / 10);
      const { choices, answer } = buildChoices(rng, correct, [
        num(tenths * w), // forgot to put the decimal back
        num(prodTenths / 100), // moved the point one place too far
        num(prodTenths / 10 + w),
        num(prodTenths / 10 - 1),
      ]);
      return {
        prompt: `What is ${num(tenths / 10)} x ${w}?`,
        choices,
        answer,
        explain: `Ignore the point first: ${tenths} x ${w} = ${prodTenths}. Then put the decimal back one place: ${correct}.`,
      };
    },
  },
  {
    id: 'mt3-020',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'multiply a decimal by a whole number',
    generate: (rng) => {
      const name = pick(rng, NAMES);
      const item = pick(rng, ['marker', 'apple', 'notebook', 'snack', 'folder']);
      const price = randInt(rng, 30, 190) * 5; // cents, ends in 0 or 5
      const w = randInt(rng, 2, 6);
      const total = price * w;
      const correct = money(total);
      const { choices, answer } = buildChoices(rng, correct, [
        money(price * (w - 1)), // bought one fewer
        money(price * (w + 1)), // one extra
        money(total + 100),
        money(total - 100),
      ]);
      return {
        prompt: `Each ${item} costs ${money(price)}. ${name} buys ${w} of them. What is the total cost?`,
        choices,
        answer,
        explain: `Multiply the price by the count: ${money(price)} x ${w} = ${correct}.`,
      };
    },
  },
  {
    id: 'mt3-021',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'multiply a decimal by a whole number',
    generate: (rng) => {
      const hundredths = randInt(rng, 115, 875); // two decimal places
      const w = randInt(rng, 2, 8);
      const prod = hundredths * w;
      const correct = num(prod / 100);
      const { choices, answer } = buildChoices(rng, correct, [
        num(prod / 10), // decimal one place off
        num(prod / 1000),
        num(prod / 100 + w),
        num(hundredths / 100), // forgot to multiply
      ]);
      return {
        prompt: `What is ${num(hundredths / 100)} x ${w}?`,
        choices,
        answer,
        explain: `${hundredths} x ${w} = ${prod}. There are two decimal places, so ${num(hundredths / 100)} x ${w} = ${correct}.`,
      };
    },
  },
  // --- divide a decimal by a whole number --------------------------------
  {
    id: 'mt3-022',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'divide a decimal by a whole number',
    generate: (rng) => {
      const qTenths = randInt(rng, 12, 89); // quotient = qTenths / 10
      const w = randInt(rng, 2, 8);
      const dividendTenths = qTenths * w;
      const correct = num(qTenths / 10);
      const { choices, answer } = buildChoices(rng, correct, [
        num(dividendTenths / 10), // gave the dividend, never divided
        num(qTenths / 100),
        num(qTenths / 10 + 1),
        num(qTenths / 10 - 1),
      ]);
      return {
        prompt: `What is ${num(dividendTenths / 10)} / ${w}?`,
        choices,
        answer,
        explain: `${dividendTenths} / ${w} = ${qTenths}, then put the decimal back one place: ${correct}.`,
      };
    },
  },
  {
    id: 'mt3-023',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'divide a decimal by a whole number',
    generate: (rng) => {
      const per = randInt(rng, 25, 180) * 5; // cents each
      const w = randInt(rng, 2, 6);
      const total = per * w;
      const correct = money(per);
      const { choices, answer } = buildChoices(rng, correct, [
        money(total), // forgot to divide
        money(per + 100),
        money(per - 100),
        money(per + w * 10),
      ]);
      const who = pick(rng, ['friends', 'teammates', 'cousins', 'students']);
      return {
        prompt: `${money(total)} is shared equally among ${w} ${who}. How much does each get?`,
        choices,
        answer,
        explain: `Divide the total by the number of people: ${money(total)} / ${w} = ${correct}.`,
      };
    },
  },
  {
    id: 'mt3-024',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 3,
    topic: 'divide a decimal by a whole number',
    generate: (rng) => {
      const qCents = randInt(rng, 115, 875); // quotient = qCents / 100
      const w = randInt(rng, 2, 7);
      const dividendCents = qCents * w;
      const correct = num(qCents / 100);
      const { choices, answer } = buildChoices(rng, correct, [
        num(dividendCents / 100), // never divided
        num(qCents / 1000),
        num(qCents / 100 + 1),
        num(qCents / 10),
      ]);
      return {
        prompt: `What is ${num(dividendCents / 100)} / ${w}?`,
        choices,
        answer,
        explain: `${dividendCents} / ${w} = ${qCents}. With two decimal places, ${num(dividendCents / 100)} / ${w} = ${correct}.`,
      };
    },
  },
  // --- round a decimal ---------------------------------------------------
  {
    id: 'mt3-025',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'round a decimal to the nearest tenth',
    generate: (rng) => {
      const whole = randInt(rng, 1, 9);
      const tenths = randInt(rng, 0, 9);
      const hundredths = randInt(rng, 1, 9);
      const value = whole + tenths / 10 + hundredths / 100;
      const down = Math.floor(value * 10) / 10;
      const up = Math.round((down + 0.1) * 10) / 10;
      const roundsUp = hundredths >= 5;
      const rounded = roundsUp ? up : down;
      const correct = num(rounded);
      const { choices, answer } = buildChoices(rng, correct, [
        num(roundsUp ? down : up), // rounded the wrong way
        num(Math.round(value)), // rounded to the nearest whole
        num(Math.round(value * 100) / 100), // left it as it was
        num(roundsUp ? up + 0.1 : down - 0.1),
      ]);
      return {
        prompt: `Round ${num(Math.round(value * 100) / 100)} to the nearest tenth.`,
        choices,
        answer,
        explain: `Look at the hundredths digit, ${hundredths}. Since ${hundredths} is ${roundsUp ? '5 or more, round up' : 'less than 5, round down'}, the answer is ${correct}.`,
      };
    },
  },
  {
    id: 'mt3-026',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'round a decimal to the nearest hundredth',
    generate: (rng) => {
      const whole = randInt(rng, 1, 9);
      const tenths = randInt(rng, 0, 9);
      const hundredths = randInt(rng, 0, 9);
      const thousandths = randInt(rng, 1, 9);
      const value = whole + tenths / 10 + hundredths / 100 + thousandths / 1000;
      const down = Math.floor(value * 100) / 100;
      const up = Math.round((down + 0.01) * 100) / 100;
      const roundsUp = thousandths >= 5;
      const rounded = roundsUp ? up : down;
      const correct = num(rounded);
      const { choices, answer } = buildChoices(rng, correct, [
        num(roundsUp ? down : up), // wrong direction
        num(Math.round(value * 10) / 10), // rounded to the tenth instead
        num(Math.round(value * 1000) / 1000), // left it alone
        num(roundsUp ? up + 0.01 : down - 0.01),
      ]);
      return {
        prompt: `Round ${num(Math.round(value * 1000) / 1000)} to the nearest hundredth.`,
        choices,
        answer,
        explain: `Look at the thousandths digit, ${thousandths}. Since ${thousandths} is ${roundsUp ? '5 or more, round up' : 'less than 5, round down'}, the answer is ${correct}.`,
      };
    },
  },
  {
    id: 'mt3-027',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'round a decimal to the nearest tenth',
    generate: (rng) => {
      const whole = randInt(rng, 1, 12);
      const tenths = randInt(rng, 0, 9);
      const hundredths = randInt(rng, 0, 9);
      const thousandths = randInt(rng, 1, 9);
      const value = whole + tenths / 10 + hundredths / 100 + thousandths / 1000;
      const down = Math.floor(value * 10) / 10;
      const up = Math.round((down + 0.1) * 10) / 10;
      const roundsUp = hundredths >= 5;
      const rounded = roundsUp ? up : down;
      const correct = num(rounded);
      const item = pick(rng, ['board', 'ribbon', 'rope', 'wire', 'plank']);
      const { choices, answer } = buildChoices(rng, correct, [
        num(roundsUp ? down : up),
        num(Math.round(value * 100) / 100), // rounded to hundredth instead
        num(Math.round(value)), // rounded to whole
        num(roundsUp ? up + 0.1 : down - 0.1),
        // Structurally-distinct fallbacks: when tenths=0 and the value rounds down
        // to a whole number, the hundredth- and whole-rounded distractors collapse
        // onto the correct answer. These tenth-step values are always distinct.
        num(rounded + 0.2),
        num(rounded - 0.2),
        num(rounded + 0.3),
      ]);
      return {
        prompt: `A ${item} measures ${num(Math.round(value * 1000) / 1000)} meters. Rounded to the nearest tenth, how long is it?`,
        choices,
        answer,
        explain: `To round to the nearest tenth, look at the hundredths digit, ${hundredths}. It is ${roundsUp ? '5 or more, so round up' : 'less than 5, so round down'}: ${correct} meters.`,
      };
    },
  },
  // --- convert decimal <-> fraction --------------------------------------
  {
    id: 'mt3-028',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'convert a decimal to a fraction',
    generate: (rng) => {
      const [n, d, v] = pick(rng, FRAC_DEC);
      const correct = frac(n, d);
      const { choices, answer } = buildChoices(rng, correct, [
        frac(d, n), // flipped it over
        frac(n + 1, d),
        frac(n, d + 1),
        frac(n + 2, d),
        frac(Math.max(1, n - 1), d),
      ]);
      return {
        prompt: `Write ${num(v)} as a fraction in simplest form.`,
        choices,
        answer,
        explain: `${num(v)} means ${v < 0.1 ? `${Math.round(v * 100)} hundredths` : `${Math.round(v * 100)}/100`}, which reduces to ${correct}.`,
      };
    },
  },
  {
    id: 'mt3-029',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'convert a fraction to a decimal',
    generate: (rng) => {
      const [n, d, v] = pick(rng, FRAC_DEC);
      const correct = num(v);
      const { choices, answer } = buildChoices(rng, correct, [
        num(v * 10), // decimal point in the wrong place
        num(v / 10),
        num(v + 0.05),
        num(1 - v),
        num(v - 0.05),
      ]);
      return {
        prompt: `Write ${n}/${d} as a decimal.`,
        choices,
        answer,
        explain: `${n}/${d} means ${n} divided by ${d}, which equals ${correct}.`,
      };
    },
  },
  {
    id: 'mt3-030',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 3,
    topic: 'convert a decimal to a fraction',
    generate: (rng) => {
      const pool = FRAC_DEC.filter(([, d]) => d === 8 || d === 20);
      const [n, d, v] = pick(rng, pool);
      const correct = frac(n, d);
      const { choices, answer } = buildChoices(rng, correct, [
        frac(d, n), // flipped
        frac(n + 1, d),
        frac(n, d + 1),
        frac(n + 2, d),
        frac(Math.max(1, n - 1), d),
      ]);
      return {
        prompt: `Which fraction, in simplest form, equals ${num(v)}?`,
        choices,
        answer,
        explain: `${num(v)} is ${Math.round(v * 1000)} thousandths or ${Math.round(v * 100)}/100, which reduces to ${correct}.`,
      };
    },
  },
  // --- percent of a number (word problems) -------------------------------
  {
    id: 'mt3-031',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'percent of a number word problem',
    generate: (rng) => {
      const base = randInt(rng, 2, 12) * 20;
      const pct = pick(rng, [5, 10, 15, 20, 25, 40, 50, 60, 75]);
      const part = (base * pct) / 100;
      const correct = num(part);
      const { choices, answer } = buildChoices(rng, correct, [
        num(part * 10), // divided by 10 instead of 100
        num(base - part), // found the part left over
        num(part + pct),
        num(base + pct),
        num(part / 10),
      ]);
      const noun = pick(rng, ['students', 'books', 'plants', 'tickets', 'cookies']);
      return {
        prompt: `A class has ${base} ${noun}. ${pct}% of them are new. How many are new?`,
        choices,
        answer,
        explain: `${pct}% means ${pct}/100. ${pct}/100 of ${base} is ${base} x ${pct} / 100 = ${part}.`,
      };
    },
  },
  {
    id: 'mt3-032',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 3,
    topic: 'percent discount word problem',
    generate: (rng) => {
      const price = randInt(rng, 2, 16) * 10; // whole dollars
      const pct = pick(rng, [10, 20, 25, 50]);
      const discount = (price * pct) / 100; // dollars, may be a half dollar
      const correct = money(Math.round(discount * 100));
      const { choices, answer } = buildChoices(rng, correct, [
        money(Math.round((price - discount) * 100)), // gave the sale price instead
        money(price * 100), // gave the full price
        money(Math.round(discount * 1000)),
        money(Math.round((discount + pct) * 100)),
        // Structurally-distinct fallbacks: at pct=50 the sale-price distractor
        // equals the discount, and at price=100 the (discount+pct) distractor
        // equals the full price - collapsing the pool. $1 steps are always distinct.
        money(Math.round((discount + 1) * 100)),
        money(Math.round((discount + 2) * 100)),
        money(Math.round((discount - 1) * 100)),
      ]);
      const item = pick(rng, ['jacket', 'game', 'bike', 'lamp', 'backpack']);
      return {
        prompt: `A ${item} costs ${money(price * 100)}. It is ${pct}% off. How much money do you SAVE?`,
        choices,
        answer,
        explain: `${pct}% of ${money(price * 100)} is ${money(price * 100)} x ${pct} / 100 = ${correct} saved.`,
      };
    },
  },
  {
    id: 'mt3-033',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 3,
    topic: 'percent tip word problem',
    generate: (rng) => {
      const price = randInt(rng, 2, 16) * 10;
      const pct = pick(rng, [10, 20, 25, 50]);
      const tip = (price * pct) / 100;
      const total = price + tip;
      const correct = money(Math.round(total * 100));
      const { choices, answer } = buildChoices(rng, correct, [
        money(Math.round(tip * 100)), // gave only the tip
        money(Math.round((price - tip) * 100)), // subtracted the tip
        money(Math.round((total + tip) * 100)),
        money(Math.round((price + pct) * 100)),
        // Structurally-distinct fallbacks: at price=100, pct=50 the (price+pct)
        // distractor equals the total and price-tip equals the tip, collapsing the
        // pool. $1 steps off the total are always distinct near-miss totals.
        money(Math.round((total + 1) * 100)),
        money(Math.round((total + 2) * 100)),
        money(Math.round((total - 1) * 100)),
      ]);
      return {
        prompt: `A meal costs ${money(price * 100)}. A ${pct}% tip is added. What is the total bill?`,
        choices,
        answer,
        explain: `The tip is ${pct}% of ${money(price * 100)} = ${money(Math.round(tip * 100))}. Add it to the meal: ${money(price * 100)} + ${money(Math.round(tip * 100))} = ${correct}.`,
      };
    },
  },
  // --- find the whole given a percent ------------------------------------
  {
    id: 'mt3-034',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 3,
    topic: 'find the whole given a percent',
    generate: (rng) => {
      const whole = randInt(rng, 2, 12) * 20;
      const pct = pick(rng, [5, 10, 15, 20, 25, 40, 50]);
      const part = (whole * pct) / 100;
      const correct = num(whole);
      const { choices, answer } = buildChoices(rng, correct, [
        num((part * pct) / 100), // took the percent of the part
        num(part * pct),
        num(part + pct),
        num(whole + 20),
        num(whole - 20),
      ]);
      return {
        prompt: `${pct}% of a number is ${part}. What is the number?`,
        choices,
        answer,
        explain: `If ${pct}% is ${part}, divide by ${pct} and multiply by 100: ${part} / ${pct} x 100 = ${whole}.`,
      };
    },
  },
  {
    id: 'mt3-035',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 3,
    topic: 'find the whole given a percent',
    generate: (rng) => {
      const whole = randInt(rng, 2, 10) * 20;
      const pct = pick(rng, [10, 20, 25, 40, 50]);
      const part = (whole * pct) / 100;
      const correct = num(whole);
      const { choices, answer } = buildChoices(rng, correct, [
        num((part * pct) / 100),
        num(part * pct),
        num(part + pct),
        num(whole + 20),
        num(whole - 20),
      ]);
      const noun = pick(rng, ['players', 'members', 'voters', 'fans']);
      return {
        prompt: `${part} ${noun}, which is ${pct}% of the team, wore red. How many ${noun} are on the team?`,
        choices,
        answer,
        explain: `${pct}% of the team is ${part}, so the team is ${part} / ${pct} x 100 = ${whole} ${noun}.`,
      };
    },
  },
  {
    id: 'mt3-036',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 3,
    topic: 'find the whole given a percent',
    generate: (rng) => {
      const full = randInt(rng, 2, 16) * 10; // whole dollars
      const pct = pick(rng, [10, 20, 25, 50]);
      const part = (full * pct) / 100;
      const correct = money(full * 100);
      const { choices, answer } = buildChoices(rng, correct, [
        money(Math.round(((part * pct) / 100) * 100)),
        money(Math.round(part * pct * 100)),
        money(Math.round((part + pct) * 100)),
        money((full + 10) * 100),
      ]);
      return {
        prompt: `A ${pct}% deposit on a bike is ${money(Math.round(part * 100))}. What is the full price?`,
        choices,
        answer,
        explain: `The deposit ${money(Math.round(part * 100))} is ${pct}% of the price, so the price is ${money(Math.round(part * 100))} / ${pct} x 100 = ${correct}.`,
      };
    },
  },
  // --- ratio in simplest form --------------------------------------------
  {
    id: 'mt3-037',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'ratio in simplest form',
    generate: (rng) => {
      const [bn, bd] = pick(rng, [
        [3, 2],
        [2, 3],
        [4, 3],
        [3, 4],
        [5, 2],
        [2, 5],
        [5, 3],
        [3, 5],
        [5, 4],
        [4, 5],
        [7, 4],
        [5, 6],
        [7, 3],
        [8, 5],
      ] as const);
      const k = randInt(rng, 2, 5);
      const a = bn * k;
      const b = bd * k;
      const correct = `${bn}:${bd}`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${bd}:${bn}`, // flipped
        `${bn + 1}:${bd}`,
        `${bn}:${bd + 1}`,
        `${bn + 1}:${bd + 1}`,
      ]);
      return {
        prompt: `Write the ratio ${a}:${b} in simplest form.`,
        choices,
        answer,
        explain: `Both numbers divide by ${k}: ${a} / ${k} = ${bn} and ${b} / ${k} = ${bd}, so ${a}:${b} = ${bn}:${bd}.`,
      };
    },
  },
  {
    id: 'mt3-038',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'ratio in simplest form',
    generate: (rng) => {
      const [bn, bd] = pick(rng, [
        [3, 2],
        [2, 3],
        [4, 3],
        [3, 4],
        [5, 2],
        [5, 3],
        [3, 5],
        [5, 4],
        [4, 5],
        [7, 4],
        [5, 6],
      ] as const);
      const k = randInt(rng, 2, 6);
      const a = bn * k;
      const b = bd * k;
      const correct = `${bn}:${bd}`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${bd}:${bn}`,
        `${bn + 1}:${bd}`,
        `${bn}:${bd + 1}`,
        `${bn + 1}:${bd + 1}`,
      ]);
      return {
        prompt: `A recipe uses ${a} cups of flour to ${b} cups of sugar. What is the ratio of flour to sugar in simplest form?`,
        choices,
        answer,
        explain: `Divide both by ${k}: ${a} / ${k} = ${bn} and ${b} / ${k} = ${bd}, so the ratio is ${bn}:${bd}.`,
      };
    },
  },
  {
    id: 'mt3-039',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'ratio in simplest form',
    generate: (rng) => {
      const [bn, bd] = pick(rng, [
        [2, 3],
        [3, 2],
        [3, 4],
        [4, 3],
        [2, 5],
        [3, 5],
        [4, 5],
        [5, 4],
        [5, 6],
        [5, 3],
      ] as const);
      const k = randInt(rng, 2, 6);
      const boys = bn * k;
      const girls = bd * k;
      const correct = `${bn}:${bd}`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${bd}:${bn}`,
        `${bn + 1}:${bd}`,
        `${bn}:${bd + 1}`,
        `${bn + 1}:${bd + 1}`,
      ]);
      return {
        prompt: `A class has ${boys} boys and ${girls} girls. What is the ratio of boys to girls in simplest form?`,
        choices,
        answer,
        explain: `Both counts divide by ${k}: ${boys} / ${k} = ${bn} and ${girls} / ${k} = ${bd}, so the ratio is ${bn}:${bd}.`,
      };
    },
  },
  // --- scale a ratio / unit rate -----------------------------------------
  {
    id: 'mt3-040',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'scale a ratio',
    generate: (rng) => {
      const [bn, bd] = pick(rng, [
        [2, 3],
        [3, 2],
        [3, 4],
        [4, 3],
        [2, 5],
        [5, 2],
        [3, 5],
        [5, 3],
        [4, 5],
      ] as const);
      const m = randInt(rng, 2, 9);
      const dogs = bn * m;
      const cats = bd * m;
      const correct = num(cats);
      const { choices, answer } = buildChoices(rng, correct, [
        num(dogs), // repeated the dog count
        num(bd), // forgot to scale
        num(bd * (m + 1)),
        num(cats + m),
        num(cats - m),
        // Structurally-distinct fallbacks: for pairs like 3:2 with small m the
        // dogs, bd*(m+1), cats+m, and cats-m distractors collapse together. The
        // dogs and bd distractors are always valid, and at least one of these two
        // differs from them, guaranteeing three unique choices.
        num(cats + 2 * m),
        num(cats + 3 * m),
      ]);
      return {
        prompt: `The ratio of dogs to cats is ${bn}:${bd}. If there are ${dogs} dogs, how many cats are there?`,
        choices,
        answer,
        explain: `Dogs grew from ${bn} to ${dogs}, which is x${m}. Cats scale the same way: ${bd} x ${m} = ${cats}.`,
      };
    },
  },
  {
    id: 'mt3-041',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'unit rate',
    generate: (rng) => {
      const speed = randInt(rng, 35, 70);
      const h = randInt(rng, 2, 6);
      const dist = speed * h;
      const correct = num(speed);
      const { choices, answer } = buildChoices(rng, correct, [
        num(dist), // never divided
        num(speed + 10),
        num(speed - 10),
        num(dist - h),
      ]);
      return {
        prompt: `A car travels ${dist} miles in ${h} hours. What is its speed in miles per hour?`,
        choices,
        answer,
        explain: `Divide distance by time: ${dist} / ${h} = ${speed} miles per hour.`,
      };
    },
  },
  {
    id: 'mt3-042',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'unit rate',
    generate: (rng) => {
      const name = pick(rng, NAMES);
      const rate = randInt(rng, 2, 6); // pages per minute
      const n = randInt(rng, 3, 8);
      const m = randInt(rng, 3, 10);
      const pages = rate * n;
      const answerPages = rate * m;
      const correct = num(answerPages);
      const { choices, answer } = buildChoices(rng, correct, [
        num(pages), // gave the first amount
        num(pages + (m - n)), // added the extra minutes instead of scaling
        num(rate * (m + 1)),
        num(rate * (m - 1)),
        num(answerPages + rate),
        // Structurally-distinct fallbacks: when n=m the "first amount" distractors
        // equal the correct answer, and answerPages+rate duplicates rate*(m+1),
        // collapsing the pool. rate*(m+-1) and rate*(m+-2) are always distinct.
        num(rate * (m + 2)),
        num(rate * (m - 2)),
      ]);
      return {
        prompt: `${name} reads ${pages} pages in ${n} minutes. At that steady rate, how many pages in ${m} minutes?`,
        choices,
        answer,
        explain: `${name} reads ${pages} / ${n} = ${rate} pages each minute. In ${m} minutes that is ${rate} x ${m} = ${answerPages}.`,
      };
    },
  },
  // --- area of a parallelogram -------------------------------------------
  {
    id: 'mt3-043',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'area of a parallelogram',
    generate: (rng) => {
      const u = pick(rng, LENGTH_UNITS);
      const b = randInt(rng, 3, 8) * 2; // even, so the triangle-formula trap is clean
      const h = randInt(rng, 3, 12);
      const area = b * h;
      const correct = `${area} sq ${u}`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${2 * (b + h)} sq ${u}`, // perimeter
        `${b + h} sq ${u}`, // added the sides
        `${(b * h) / 2} sq ${u}`, // used the triangle formula
        `${area + b} sq ${u}`,
        // Structurally-distinct fallbacks: when b=6, h=3 the perimeter and
        // triangle-formula distractors both equal the area, collapsing the pool.
        // area+-b (a base-step away) are always distinct near-miss areas.
        `${area + 2 * b} sq ${u}`,
        `${area - b} sq ${u}`,
      ]);
      return {
        prompt: `A parallelogram has a base of ${b} ${u} and a height of ${h} ${u}. What is its area?`,
        choices,
        answer,
        explain: `Area of a parallelogram is base x height: ${b} x ${h} = ${area} sq ${u}.`,
      };
    },
  },
  {
    id: 'mt3-044',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'area of a parallelogram',
    generate: (rng) => {
      const u = pick(rng, LENGTH_UNITS);
      const b = randInt(rng, 4, 12);
      const h = randInt(rng, 3, 9);
      const s = h + randInt(rng, 2, 6); // slanted side, longer than the height
      const area = b * h;
      const correct = `${area} sq ${u}`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${b * s} sq ${u}`, // used the slanted side instead of the height
        `${2 * (b + s)} sq ${u}`, // perimeter
        `${b + h} sq ${u}`,
        `${area + h} sq ${u}`,
      ]);
      return {
        prompt: `A parallelogram has a base of ${b} ${u}, a height of ${h} ${u}, and a slanted side of ${s} ${u}. What is its area?`,
        choices,
        answer,
        explain: `Use the height, not the slanted side: base x height = ${b} x ${h} = ${area} sq ${u}. The ${s} ${u} side is not used.`,
      };
    },
  },
  {
    id: 'mt3-045',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 3,
    topic: 'area of a parallelogram',
    generate: (rng) => {
      const u = pick(rng, LENGTH_UNITS);
      const b = randInt(rng, 3, 12);
      const h = randInt(rng, 2, 9);
      const area = b * h;
      const correct = `${b} ${u}`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${area} ${u}`, // used the area as the base
        `${area * h} ${u}`, // multiplied instead of dividing
        `${2 * area / h} ${u}`, // used the triangle relationship
        `${area - h} ${u}`,
      ]);
      return {
        prompt: `A parallelogram has an area of ${area} sq ${u} and a height of ${h} ${u}. What is the length of its base?`,
        choices,
        answer,
        explain: `Base = area / height = ${area} / ${h} = ${b} ${u}.`,
      };
    },
  },
  // --- area of a composite / L-shaped figure -----------------------------
  {
    id: 'mt3-046',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 3,
    topic: 'area of a composite figure',
    generate: (rng) => {
      const u = pick(rng, LENGTH_UNITS);
      const a = randInt(rng, 3, 9);
      const b = randInt(rng, 2, 7);
      const c = randInt(rng, 3, 9);
      const d = randInt(rng, 2, 7);
      const area = a * b + c * d;
      const correct = `${area} sq ${u}`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${a + b + c + d} sq ${u}`, // added the side lengths
        `${a * b} sq ${u}`, // only one rectangle
        `${(a + c) * (b + d)} sq ${u}`, // treated it as one big rectangle
        `${a * b + c + d} sq ${u}`,
      ]);
      return {
        prompt: `An L-shaped figure is split into two rectangles. One is ${a} ${u} by ${b} ${u} and the other is ${c} ${u} by ${d} ${u}. What is the total area?`,
        choices,
        answer,
        explain: `Find each rectangle's area and add: ${a} x ${b} = ${a * b} and ${c} x ${d} = ${c * d}, so ${a * b} + ${c * d} = ${area} sq ${u}.`,
      };
    },
  },
  {
    id: 'mt3-047',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 3,
    topic: 'area of a composite figure',
    generate: (rng) => {
      const u = pick(rng, LENGTH_UNITS);
      const W = randInt(rng, 8, 15);
      const H = randInt(rng, 6, 12);
      const w = randInt(rng, 2, W - 3);
      const h = randInt(rng, 2, H - 3);
      const area = W * H - w * h;
      const correct = `${area} sq ${u}`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${W * H} sq ${u}`, // forgot to subtract the cut-out
        `${(W - w) * (H - h)} sq ${u}`, // subtracted the dimensions
        `${W * H + w * h} sq ${u}`, // added instead of subtracting
        `${W * H - w - h} sq ${u}`,
      ]);
      return {
        prompt: `A ${W} ${u} by ${H} ${u} rectangle has a ${w} ${u} by ${h} ${u} rectangular piece cut out of one corner. What is the area that remains?`,
        choices,
        answer,
        explain: `Whole rectangle: ${W} x ${H} = ${W * H}. Cut-out: ${w} x ${h} = ${w * h}. Subtract: ${W * H} - ${w * h} = ${area} sq ${u}.`,
      };
    },
  },
  {
    id: 'mt3-048',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'area of a composite figure',
    generate: (rng) => {
      const a = randInt(rng, 4, 10);
      const b = randInt(rng, 3, 8);
      const c = randInt(rng, 3, 8);
      const d = randInt(rng, 2, 6);
      const area = a * b + c * d;
      const correct = `${area} sq ft`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${a + b + c + d} sq ft`,
        `${a * b} sq ft`,
        `${(a + c) * (b + d)} sq ft`,
        `${a * b + c + d} sq ft`,
      ]);
      return {
        prompt: `A room is shaped like an L. It splits into a ${a} ft by ${b} ft rectangle and a ${c} ft by ${d} ft rectangle. What is the total floor area?`,
        choices,
        answer,
        explain: `Add the two rectangles: ${a} x ${b} = ${a * b} and ${c} x ${d} = ${c * d}, so the floor is ${a * b} + ${c * d} = ${area} sq ft.`,
      };
    },
  },
  // --- volume of a rectangular prism -------------------------------------
  {
    id: 'mt3-049',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'volume of a rectangular prism',
    generate: (rng) => {
      const u = pick(rng, LENGTH_UNITS);
      const l = randInt(rng, 2, 9);
      const w = randInt(rng, 2, 8);
      const h = randInt(rng, 2, 7);
      const vol = l * w * h;
      const correct = `${vol} cubic ${u}`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${2 * (l * w + l * h + w * h)} cubic ${u}`, // surface area
        `${l + w + h} cubic ${u}`, // added the edges
        `${l * w} cubic ${u}`, // one face only
        `${l * w * h + h} cubic ${u}`,
      ]);
      return {
        prompt: `A box is ${l} ${u} long, ${w} ${u} wide, and ${h} ${u} tall. What is its volume?`,
        choices,
        answer,
        explain: `Volume multiplies all three dimensions: ${l} x ${w} x ${h} = ${vol} cubic ${u}.`,
      };
    },
  },
  {
    id: 'mt3-050',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'volume of a rectangular prism',
    generate: (rng) => {
      const l = randInt(rng, 2, 9);
      const w = randInt(rng, 2, 8);
      const h = randInt(rng, 2, 7);
      const vol = l * w * h;
      const correct = `${vol} cubic cm`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${2 * (l * w + l * h + w * h)} cubic cm`,
        `${l + w + h} cubic cm`,
        `${l * w} cubic cm`,
        `${l * w * h + l} cubic cm`,
      ]);
      return {
        prompt: `A fish tank is ${l} cm long, ${w} cm wide, and ${h} cm deep. How many cubic cm of water can it hold?`,
        choices,
        answer,
        explain: `Multiply length x width x depth: ${l} x ${w} x ${h} = ${vol} cubic cm.`,
      };
    },
  },
  {
    id: 'mt3-051',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 3,
    topic: 'volume of a rectangular prism',
    generate: (rng) => {
      const u = pick(rng, LENGTH_UNITS);
      const l = randInt(rng, 2, 8);
      const w = randInt(rng, 2, 7);
      const h = randInt(rng, 2, 9);
      const vol = l * w * h;
      const correct = `${h} ${u}`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${vol / l} ${u}`, // divided by only one side
        `${vol / w} ${u}`,
        `${l * w} ${u}`, // gave the base area
        `${vol - l * w} ${u}`,
        // Structurally-distinct fallbacks: when l=w the vol/l and vol/w distractors
        // are identical, and l*w can equal the height, collapsing the pool. Heights
        // one or two units off are always distinct near-miss answers.
        `${h + 1} ${u}`,
        `${h + 2} ${u}`,
        `${h - 1} ${u}`,
      ]);
      return {
        prompt: `A box has a volume of ${vol} cubic ${u}. Its base is ${l} ${u} by ${w} ${u}. How tall is the box?`,
        choices,
        answer,
        explain: `Base area is ${l} x ${w} = ${l * w}. Height = volume / base area = ${vol} / ${l * w} = ${h} ${u}.`,
      };
    },
  },
  // --- perimeter of a composite shape ------------------------------------
  {
    id: 'mt3-052',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'perimeter of a composite shape',
    generate: (rng) => {
      const u = pick(rng, LENGTH_UNITS);
      const W = randInt(rng, 6, 12);
      const H = randInt(rng, 5, 10);
      const w = randInt(rng, 2, W - 2);
      const h = randInt(rng, 2, H - 2);
      const s2 = H - h;
      const s5 = W - w;
      const perimeter = W + s2 + w + h + s5 + H; // = 2*(W+H)
      const correct = `${perimeter} ${u}`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${W * H - w * h} ${u}`, // gave the area
        `${W + H} ${u}`, // added only two sides
        `${W + s2 + w} ${u}`, // added only three sides
        `${perimeter + w + h} ${u}`,
        // Structurally-distinct fallbacks: the area and three-side distractors can
        // coincide with each other or the two-side distractor. W+H and perimeter+w+h
        // are always valid, and perimeter-w-h is always distinct from both.
        `${perimeter - w - h} ${u}`,
        `${perimeter + w} ${u}`,
      ]);
      return {
        prompt: `An L-shaped figure has six sides that measure ${W}, ${s2}, ${w}, ${h}, ${s5}, and ${H} ${u} going around it. What is its perimeter?`,
        choices,
        answer,
        explain: `Perimeter adds every side: ${W} + ${s2} + ${w} + ${h} + ${s5} + ${H} = ${perimeter} ${u}.`,
      };
    },
  },
  {
    id: 'mt3-053',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 3,
    topic: 'perimeter of a composite shape',
    generate: (rng) => {
      const u = pick(rng, LENGTH_UNITS);
      const W = randInt(rng, 7, 14);
      const H = randInt(rng, 5, 11);
      const perimeter = 2 * (W + H);
      const correct = `${perimeter} ${u}`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${W * H} ${u}`, // gave the area of the full rectangle
        `${W + H} ${u}`, // added only two sides
        `${2 * W + H} ${u}`,
        `${perimeter - 4} ${u}`,
      ]);
      return {
        prompt: `A ${W} ${u} by ${H} ${u} rectangle has a small rectangular notch cut from one corner. What is the perimeter of the resulting L-shape?`,
        choices,
        answer,
        explain: `Cutting a notch from a corner does not change the perimeter - the two removed outer pieces are replaced by two inner pieces of the same total length. So it stays 2 x (${W} + ${H}) = ${perimeter} ${u}.`,
      };
    },
  },
  // --- area vs perimeter distinction -------------------------------------
  {
    id: 'mt3-054',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'area vs perimeter',
    generate: (rng) => {
      const u = pick(rng, LENGTH_UNITS);
      const l = randInt(rng, 4, 14);
      const w = randInt(rng, 2, l - 1);
      const area = l * w;
      const per = 2 * (l + w);
      if (rng() < 0.5) {
        const correct = `${area} sq ${u}`;
        const { choices, answer } = buildChoices(rng, correct, [
          `${per} sq ${u}`, // computed the perimeter by mistake
          `${l + w} sq ${u}`,
          `${area * 2} sq ${u}`,
          `${area + l} sq ${u}`,
        ]);
        return {
          prompt: `A rectangle is ${l} ${u} by ${w} ${u}. What is its AREA?`,
          choices,
          answer,
          explain: `Area covers the inside: length x width = ${l} x ${w} = ${area} sq ${u}. (The perimeter would be ${per} ${u}.)`,
        };
      }
      const correct = `${per} ${u}`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${area} ${u}`, // computed the area by mistake
        `${l + w} ${u}`,
        `${2 * l + w} ${u}`,
        `${per + 2} ${u}`,
      ]);
      return {
        prompt: `A rectangle is ${l} ${u} by ${w} ${u}. What is its PERIMETER?`,
        choices,
        answer,
        explain: `Perimeter goes around: add all four sides, ${l} + ${w} + ${l} + ${w} = ${per} ${u}. (The area would be ${area} sq ${u}.)`,
      };
    },
  },
  {
    id: 'mt3-055',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'area vs perimeter',
    generate: (rng) => {
      const name = pick(rng, NAMES);
      const l = randInt(rng, 4, 14);
      const w = randInt(rng, 3, l - 1);
      const area = l * w;
      const per = 2 * (l + w);
      if (rng() < 0.5) {
        const correct = `${per} ft`;
        const { choices, answer } = buildChoices(rng, correct, [
          `${area} ft`, // used area when perimeter was needed
          `${l + w} ft`,
          `${2 * l + w} ft`,
          `${per + 2} ft`,
        ]);
        return {
          prompt: `${name} wants to put a fence around a ${l} ft by ${w} ft garden. How many feet of fence are needed?`,
          choices,
          answer,
          explain: `A fence goes AROUND the garden, so use the perimeter: ${l} + ${w} + ${l} + ${w} = ${per} ft.`,
        };
      }
      const correct = `${area} sq ft`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${per} sq ft`, // used perimeter when area was needed
        `${l + w} sq ft`,
        `${area * 2} sq ft`,
        `${area + w} sq ft`,
      ]);
      return {
        prompt: `${name} wants to cover a ${l} ft by ${w} ft garden with grass. How many square feet of grass are needed?`,
        choices,
        answer,
        explain: `Grass covers the INSIDE, so use the area: length x width = ${l} x ${w} = ${area} sq ft.`,
      };
    },
  },
];

/** Rare-range fallback for mt3-002 so it always yields a clean improper result. */
function fallback002(rng: Rng, d: number) {
  const n = d - 1;
  const w = 3;
  const total = n * w;
  const whole = Math.floor(total / d);
  const rem = total % d;
  const correct = rem === 0 ? num(whole) : mixedStr(whole, rem, d);
  const { choices, answer } = buildChoices(rng, correct, [
    mixedStr(whole + 1, rem === 0 ? 1 : rem, d),
    mixedStr(whole + 2, rem === 0 ? 1 : rem, d),
    frac(n, d),
    frac(n + w, d),
    num(whole + 3),
  ]);
  return {
    prompt: `What is ${w} x ${n}/${d}?`,
    choices,
    answer,
    explain: `${w} x ${n} = ${total}, so ${w} x ${n}/${d} = ${total}/${d} = ${correct}.`,
  };
}
