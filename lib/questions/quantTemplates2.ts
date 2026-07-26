import {
  buildChoices,
  num,
  pick,
  randInt,
  type QuestionTemplate,
  type Rng,
} from './templates';

/**
 * ISEE Lower Level Quantitative Reasoning templates, set 2.
 *
 * Domain: Algebra, Patterns, and Logical Reasoning. Every instance is
 * regenerated from fresh numbers, must be solvable in the head, and has exactly
 * one defensible answer. Distractors model realistic wrong reasoning (applied
 * the rule one step too few, forgot to add the constant, swapped the operation)
 * so nothing is guessable by elimination.
 */

const NAMES = [
  'Ana',
  'Ben',
  'Cara',
  'Dan',
  'Eli',
  'Mia',
  'Sam',
  'Tom',
  'Zoe',
  'Leo',
  'Nia',
  'Kai',
  'Roy',
  'Ivy',
] as const;

function shuffle<T>(rng: Rng, arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const QUANT_TEMPLATES_2: QuestionTemplate[] = [
  // --- Function tables -----------------------------------------------------
  {
    id: 'qt2-001',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'function machine: multiply then add',
    generate: (rng) => {
      const a = randInt(rng, 2, 5);
      const b = randInt(rng, 1, 9);
      const x = randInt(rng, 3, 9);
      const correct = num(a * x + b);
      const { choices, answer } = buildChoices(rng, correct, [
        num(a * (x + b)),
        num(a * x),
        num(x + a + b),
        num(a * x + b + 1),
        num(a * x + b - 1),
        // Structurally-distinct fallbacks: when a=2, x=3, b=1 the a*x, a*(x+b), and
        // x+a+b distractors all collapse onto correct+-1. The +-1 and +-2 offsets are
        // always distinct near-miss answers.
        num(a * x + b + 2),
        num(a * x + b - 2),
      ]);
      return {
        prompt: `A machine multiplies a number by ${a}, then adds ${b}. If you put in ${x}, what comes out?`,
        choices,
        answer,
        explain: `First multiply: ${a} x ${x} = ${a * x}. Then add ${b}: ${a * x} + ${b} = ${correct}.`,
      };
    },
  },
  {
    id: 'qt2-002',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'function machine: multiply then subtract',
    generate: (rng) => {
      const a = randInt(rng, 2, 4);
      const b = randInt(rng, 1, 5);
      const x = randInt(rng, 4, 9);
      const correct = num(a * x - b);
      const { choices, answer } = buildChoices(rng, correct, [
        num(a * x + b),
        num(a * x),
        num(a * x - b + 1),
        num(a * x - b - 1),
        num(a * x + 2 * b),
      ]);
      return {
        prompt: `A machine multiplies a number by ${a}, then subtracts ${b}. If you put in ${x}, what comes out?`,
        choices,
        answer,
        explain: `First multiply: ${a} x ${x} = ${a * x}. Then subtract ${b}: ${a * x} - ${b} = ${correct}.`,
      };
    },
  },
  {
    id: 'qt2-003',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'function table: find the rule',
    generate: (rng) => {
      const a = randInt(rng, 2, 5);
      const correct = `Multiply by ${a}`;
      const { choices, answer } = buildChoices(rng, correct, [
        `Add ${a}`,
        `Multiply by ${a + 1}`,
        `Multiply by ${a - 1}`,
        `Add ${a + 1}`,
      ]);
      return {
        prompt: `A rule turns 1 into ${a}, 2 into ${2 * a}, and 3 into ${3 * a}. What is the rule?`,
        choices,
        answer,
        explain: `Each output is the input times ${a}: 1 x ${a} = ${a}, 2 x ${a} = ${2 * a}, 3 x ${a} = ${3 * a}.`,
      };
    },
  },
  // --- Substitution --------------------------------------------------------
  {
    id: 'qt2-004',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'evaluate an + b',
    generate: (rng) => {
      const a = randInt(rng, 2, 6);
      const b = randInt(rng, 1, 9);
      const n = randInt(rng, 2, 8);
      const correct = num(a * n + b);
      const { choices, answer } = buildChoices(rng, correct, [
        num(a * n),
        num(a + n + b),
        num(a * n + 2 * b),
        num(a * n + b + 1),
        num(a * n + b - 1),
        // Structurally-distinct fallbacks: when a=2, n=2, b=1 the a*n, a+n+b, and
        // a*n+2*b distractors collapse onto correct+-1. The +-2 offsets are always
        // distinct near-miss answers.
        num(a * n + b + 2),
        num(a * n + b - 2),
      ]);
      return {
        prompt: `If n = ${n}, what is ${a}n + ${b}?`,
        choices,
        answer,
        explain: `${a}n means ${a} times n: ${a} x ${n} = ${a * n}. Then add ${b}: ${correct}.`,
      };
    },
  },
  {
    id: 'qt2-005',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'evaluate pa + qb',
    generate: (rng) => {
      const p = randInt(rng, 2, 4);
      const q = randInt(rng, 2, 4);
      const a = randInt(rng, 2, 6);
      const b = randInt(rng, 2, 6);
      const correct = num(p * a + q * b);
      const { choices, answer } = buildChoices(rng, correct, [
        num(p * b + q * a),
        num(p + a + q + b),
        num(p * a + q + b),
        num(p * a + q * b + 1),
        num(p * a + q * b - 1),
        // Structurally-distinct fallbacks: when p=q and a=b the p*b+q*a, p+a+q+b,
        // and p*a+q+b distractors all collapse onto the correct answer. The +-2
        // offsets are always distinct near-miss answers.
        num(p * a + q * b + 2),
        num(p * a + q * b - 2),
      ]);
      return {
        prompt: `If a = ${a} and b = ${b}, what is ${p}a + ${q}b?`,
        choices,
        answer,
        explain: `${p}a = ${p} x ${a} = ${p * a}, and ${q}b = ${q} x ${b} = ${q * b}. Add them: ${correct}.`,
      };
    },
  },
  {
    id: 'qt2-006',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 3,
    topic: 'evaluate n^2 + b',
    generate: (rng) => {
      const n = randInt(rng, 3, 8);
      const b = randInt(rng, 1, 9);
      const correct = num(n * n + b);
      const { choices, answer } = buildChoices(rng, correct, [
        num(2 * n + b),
        num(n * n),
        num(n * n + 2 * b),
        num(n * n + b + 1),
        num(n * n + b - 1),
      ]);
      return {
        prompt: `If n = ${n}, what is n^2 + ${b}?`,
        choices,
        answer,
        explain: `n^2 means n times n: ${n} x ${n} = ${n * n}. Then add ${b}: ${correct}.`,
      };
    },
  },
  {
    id: 'qt2-007',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 3,
    topic: 'evaluate a(n + b)',
    generate: (rng) => {
      const a = randInt(rng, 2, 5);
      const b = randInt(rng, 1, 6);
      const n = randInt(rng, 2, 7);
      const correct = num(a * (n + b));
      const { choices, answer } = buildChoices(rng, correct, [
        num(a * n + b),
        num(a + n + b),
        num(a * n),
        num(a * (n + b) + a),
        num(a * (n + b) - a),
      ]);
      return {
        prompt: `If n = ${n}, what is ${a} x (n + ${b})?`,
        choices,
        answer,
        explain: `Add inside the parentheses first: ${n} + ${b} = ${n + b}. Then ${a} x ${n + b} = ${correct}.`,
      };
    },
  },
  // --- Missing operation ---------------------------------------------------
  {
    id: 'qt2-008',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'missing operation sign',
    generate: (rng) => {
      const op = pick(rng, ['+', '-', 'x', '/']);
      let m: number;
      let n: number;
      let c: number;
      if (op === '/') {
        n = randInt(rng, 2, 4);
        let quotient = randInt(rng, 2, 5);
        if (n === 2 && quotient === 2) quotient = 3;
        m = n * quotient;
        c = quotient;
      } else {
        n = randInt(rng, 2, 5);
        const k = randInt(rng, 2, 4);
        const r = randInt(rng, 1, n - 1);
        m = n * k + r;
        c = op === '+' ? m + n : op === '-' ? m - n : m * n;
      }
      const shown = op === '/' ? `${m} / ${n}` : `${m} ${op} ${n}`;
      const { choices, answer } = buildChoices(
        rng,
        op,
        ['+', '-', 'x', '/'].filter((s) => s !== op),
      );
      return {
        prompt: `Which sign goes in the box to make it true?  ${m} [ ] ${n} = ${c}`,
        choices,
        answer,
        explain: `${shown} = ${c}, so the missing sign is ${op}.`,
      };
    },
  },
  {
    id: 'qt2-009',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'which number sentence is true',
    generate: (rng) => {
      const a = randInt(rng, 3, 8);
      const b = randInt(rng, 3, 8);
      const correct = `${a} x ${b} = ${a * b}`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${a} x ${b} = ${a * b + b}`,
        `${a} x ${b} = ${a * b - b}`,
        `${a} + ${b} = ${a * b}`,
        `${a} x ${b} = ${a * b + a}`,
      ]);
      return {
        prompt: 'Which number sentence is TRUE?',
        choices,
        answer,
        explain: `${a} x ${b} = ${a * b}, so that sentence is the true one. The others give the wrong total.`,
      };
    },
  },
  {
    id: 'qt2-010',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 3,
    topic: 'machine operation from input and output',
    generate: (rng) => {
      const n = randInt(rng, 2, 6);
      const k = randInt(rng, 2, 4);
      const r = randInt(rng, 1, n - 1);
      const m = n * k + r;
      const op = pick(rng, ['+', '-', 'x']);
      const c = op === '+' ? m + n : op === '-' ? m - n : m * n;
      const { choices, answer } = buildChoices(
        rng,
        op,
        ['+', '-', 'x', '/'].filter((s) => s !== op),
      );
      return {
        prompt: `A machine changed ${m} into ${c} using the number ${n}. Which operation did it use?`,
        choices,
        answer,
        explain: `${m} ${op} ${n} = ${c}, so the machine used ${op}.`,
      };
    },
  },
  // --- Inequality reasoning ------------------------------------------------
  {
    id: 'qt2-011',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'which value keeps the inequality true',
    generate: (rng) => {
      const a = randInt(rng, 1, 5);
      const b = a + randInt(rng, 4, 10);
      const t = b - a;
      const correct = num(t - 1);
      const { choices, answer } = buildChoices(rng, correct, [
        num(t),
        num(t + 1),
        num(t + 2),
        num(t + 3),
      ]);
      return {
        prompt: `Which number can go in the box to make it true?  [ ] + ${a} < ${b}`,
        choices,
        answer,
        explain: `The box plus ${a} must stay under ${b}, so the box must be less than ${t}. Only ${correct} works.`,
      };
    },
  },
  {
    id: 'qt2-012',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'find a number between two others',
    generate: (rng) => {
      const a = randInt(rng, 4, 12);
      const b = a + randInt(rng, 4, 9);
      const correct = num(randInt(rng, a + 1, b - 1));
      const { choices, answer } = buildChoices(rng, correct, [
        num(a),
        num(b),
        num(a - 2),
        num(b + 2),
        num(b + 1),
      ]);
      return {
        prompt: `Which number is greater than ${a} but less than ${b}?`,
        choices,
        answer,
        explain: `It has to be bigger than ${a} and smaller than ${b}. Only ${correct} fits between them.`,
      };
    },
  },
  {
    id: 'qt2-013',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'which comparison statement is true',
    generate: (rng) => {
      const a = randInt(rng, 2, 20);
      let b = randInt(rng, 2, 20);
      if (a === b) b = a + 1;
      const correct = a > b ? `${a} is greater than ${b}` : `${a} is less than ${b}`;
      const opposite = a > b ? `${a} is less than ${b}` : `${a} is greater than ${b}`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${a} is equal to ${b}`,
        opposite,
        `${a} plus ${b} is less than ${Math.min(a, b)}`,
        `${a} minus ${b} is greater than ${a}`,
      ]);
      return {
        prompt: 'Which statement is TRUE?',
        choices,
        answer,
        explain:
          a > b
            ? `${a} is the bigger number, so "${a} is greater than ${b}" is true.`
            : `${a} is the smaller number, so "${a} is less than ${b}" is true.`,
      };
    },
  },
  {
    id: 'qt2-014',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'order three numbers least to greatest',
    generate: (rng) => {
      const nums: number[] = [];
      while (nums.length < 3) {
        const x = randInt(rng, 2, 30);
        if (!nums.includes(x)) nums.push(x);
      }
      const asc = [...nums].sort((p, q) => p - q);
      const correct = asc.join(', ');
      const perms = [
        [0, 2, 1],
        [1, 0, 2],
        [1, 2, 0],
        [2, 0, 1],
        [2, 1, 0],
      ];
      const distractors = shuffle(
        rng,
        perms.map((p) => p.map((i) => nums[i]).join(', ')),
      ).filter((s) => s !== correct);
      const { choices, answer } = buildChoices(rng, correct, distractors);
      return {
        prompt: 'Which list is in order from least to greatest?',
        choices,
        answer,
        explain: `From smallest to biggest the numbers go ${correct}.`,
      };
    },
  },
  // --- Arithmetic sequences ------------------------------------------------
  {
    id: 'qt2-015',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'missing middle term',
    generate: (rng) => {
      const s = randInt(rng, 2, 12);
      const d = randInt(rng, 2, 9);
      const correct = num(s + 2 * d);
      const { choices, answer } = buildChoices(rng, correct, [
        num(s + d),
        num(s + 3 * d),
        num(s + 2 * d + 1),
        num(s + 2 * d - 1),
        num(s + d + 1),
      ]);
      return {
        prompt: `What number is missing?  ${s}, ${s + d}, ___, ${s + 3 * d}, ${s + 4 * d}`,
        choices,
        answer,
        explain: `The list goes up by ${d} each step, so the middle is ${s + d} + ${d} = ${correct}.`,
      };
    },
  },
  {
    id: 'qt2-016',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'nth term of an arithmetic sequence',
    generate: (rng) => {
      const s = randInt(rng, 1, 9);
      const d = randInt(rng, 2, 7);
      const k = randInt(rng, 6, 9);
      const correct = num(s + (k - 1) * d);
      const { choices, answer } = buildChoices(rng, correct, [
        num(s + k * d),
        num(s + (k - 2) * d),
        num(k * d),
        num(s + (k - 1) * d + 1),
        num(s + (k - 1) * d - 1),
      ]);
      return {
        prompt: `A pattern starts at ${s} and goes up by ${d} each time (${s}, ${s + d}, ${s + 2 * d}, ...). What is the ${k}th number?`,
        choices,
        answer,
        explain: `Start at ${s} and add ${d} a total of ${k - 1} times: ${s} + ${k - 1} x ${d} = ${correct}.`,
      };
    },
  },
  {
    id: 'qt2-017',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'missing first term',
    generate: (rng) => {
      const s = randInt(rng, 3, 12);
      const d = randInt(rng, 2, 8);
      const correct = num(s);
      const { choices, answer } = buildChoices(rng, correct, [
        num(s + d),
        num(s + 2 * d),
        num(s - 1),
        num(s + 1),
        num(s + d + d),
      ]);
      return {
        prompt: `What number is missing?  ___, ${s + d}, ${s + 2 * d}, ${s + 3 * d}`,
        choices,
        answer,
        explain: `Each step adds ${d}, so the first term is ${d} less than ${s + d}: ${correct}.`,
      };
    },
  },
  {
    id: 'qt2-018',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 3,
    topic: 'common difference from two terms',
    generate: (rng) => {
      const t2 = randInt(rng, 3, 10);
      const d = randInt(rng, 2, 7);
      const t5 = t2 + 3 * d;
      const correct = num(d);
      const { choices, answer } = buildChoices(rng, correct, [
        num(t5 - t2),
        num(d + 1),
        num(d - 1),
        num(2 * d),
        num(t2),
      ]);
      return {
        prompt: `In a pattern that goes up by the same amount each step, the 2nd number is ${t2} and the 5th number is ${t5}. How much does it go up each step?`,
        choices,
        answer,
        explain: `From the 2nd to the 5th number is 3 steps, a rise of ${t5 - t2}. One step is ${t5 - t2} / 3 = ${correct}.`,
      };
    },
  },
  // --- Geometric / doubling ------------------------------------------------
  {
    id: 'qt2-019',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'doubling growth',
    generate: (rng) => {
      const h = randInt(rng, 1, 4);
      const k = randInt(rng, 3, 5);
      const correct = num(h * 2 ** (k - 1));
      const { choices, answer } = buildChoices(rng, correct, [
        num(h * 2 * (k - 1)),
        num(h * 2 ** k),
        num(h * 2 ** (k - 1) + h),
        num(h * 2 ** (k - 2)),
        num(h * (k - 1)),
      ]);
      return {
        prompt: `A plant is ${h} cm tall on day 1 and doubles in height every day. How tall is it on day ${k}?`,
        choices,
        answer,
        explain: `It doubles ${k - 1} times: ${h} x 2^${k - 1} = ${correct} cm.`,
      };
    },
  },
  {
    id: 'qt2-020',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'find the multiplier of a pattern',
    generate: (rng) => {
      const s = randInt(rng, 1, 3);
      const r = randInt(rng, 2, 4);
      const t0 = s;
      const t1 = s * r;
      const t2 = s * r * r;
      const t3 = s * r * r * r;
      const correct = num(r);
      const { choices, answer } = buildChoices(rng, correct, [
        num(r + 1),
        num(r - 1),
        num(t1),
        num(t1 - t0),
        num(2 * r),
      ]);
      return {
        prompt: `Each term is the one before times a number:  ${t0}, ${t1}, ${t2}, ${t3}. What is that number?`,
        choices,
        answer,
        explain: `${t1} divided by ${t0} is ${r}, and ${t2} divided by ${t1} is ${r}. The pattern multiplies by ${correct}.`,
      };
    },
  },
  {
    id: 'qt2-021',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'halving pattern next term',
    generate: (rng) => {
      const base = randInt(rng, 3, 10);
      const correct = num(base);
      const { choices, answer } = buildChoices(rng, correct, [
        num(base * 2),
        num(base * 4),
        num(base * 3),
        num(base + 1),
        num(base - 1),
      ]);
      return {
        prompt: `What comes next?  ${base * 8}, ${base * 4}, ${base * 2}, ___`,
        choices,
        answer,
        explain: `Each term is half the one before, so after ${base * 2} comes ${correct}.`,
      };
    },
  },
  // --- Growing shape patterns ----------------------------------------------
  {
    id: 'qt2-022',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'growing dot pattern',
    generate: (rng) => {
      const a = randInt(rng, 2, 5);
      const d = randInt(rng, 2, 4);
      const k = randInt(rng, 5, 7);
      const correct = num(a + (k - 1) * d);
      const { choices, answer } = buildChoices(rng, correct, [
        num(a + k * d),
        num(a + (k - 2) * d),
        num(k * d),
        num(a + (k - 1) * d + 1),
        num(a + (k - 1) * d - 1),
      ]);
      return {
        prompt: `Figure 1 has ${a} dots, Figure 2 has ${a + d}, and Figure 3 has ${a + 2 * d}. How many dots does Figure ${k} have?`,
        choices,
        answer,
        explain: `Each figure adds ${d} dots: ${a} + ${k - 1} x ${d} = ${correct}.`,
      };
    },
  },
  {
    id: 'qt2-023',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'square-number pattern',
    generate: (rng) => {
      const k = randInt(rng, 4, 7);
      const correct = num(k * k);
      const { choices, answer } = buildChoices(rng, correct, [
        num((k - 1) * (k - 1)),
        num((k + 1) * (k + 1)),
        num(k * 2),
        num(k * k + 1),
        num(k * k - 1),
      ]);
      return {
        prompt: `Figure 1 has 1 tile, Figure 2 has 4 tiles, and Figure 3 has 9 tiles. How many tiles does Figure ${k} have?`,
        choices,
        answer,
        explain: `The tiles are square numbers: Figure ${k} has ${k} x ${k} = ${correct} tiles.`,
      };
    },
  },
  {
    id: 'qt2-024',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'growing perimeter pattern',
    generate: (rng) => {
      const k = randInt(rng, 4, 9);
      const correct = num(2 * k + 2);
      const { choices, answer } = buildChoices(rng, correct, [
        num(4 * k),
        num(2 * k),
        num(2 * k + 1),
        num(4 * k - 2),
        num(2 * k + 4),
      ]);
      return {
        prompt: `Squares are joined in a row. 1 square has a border of 4, 2 squares have 6, and 3 squares have 8. What is the border around ${k} squares?`,
        choices,
        answer,
        explain: `Each added square adds 2 to the border: 2 x ${k} + 2 = ${correct}.`,
      };
    },
  },
  {
    id: 'qt2-025',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 3,
    topic: 'triangular-number pattern',
    generate: (rng) => {
      const k = randInt(rng, 4, 6);
      const correct = num((k * (k + 1)) / 2);
      const { choices, answer } = buildChoices(rng, correct, [
        num((k * (k - 1)) / 2),
        num(((k + 1) * (k + 2)) / 2),
        num(k * k),
        num((k * (k + 1)) / 2 + 1),
        num(k * 2),
      ]);
      return {
        prompt: `Dots form triangles: Figure 1 has 1 dot, Figure 2 has 3, and Figure 3 has 6. How many dots does Figure ${k} have?`,
        choices,
        answer,
        explain: `Figure ${k} stacks 1 + 2 + ... + ${k} = ${k} x ${k + 1} / 2 = ${correct} dots.`,
      };
    },
  },
  // --- Balance-scale reasoning ---------------------------------------------
  {
    id: 'qt2-026',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'blocks per weight',
    generate: (rng) => {
      const r = randInt(rng, 2, 5);
      const k = randInt(rng, 2, 6);
      const correct = num(r * k);
      const { choices, answer } = buildChoices(rng, correct, [
        num(r + k),
        num(k),
        num(r * k + r),
        num(r * k + k),
        num(r),
        // Structurally-distinct fallbacks: when r=k the r*k+r and r*k+k distractors
        // are identical (and r+k, k, r can coincide too). r*k+r is always valid, and
        // r*k+2*r, r*k+3*r step away from it in fixed increments - always distinct.
        num(r * k + 2 * r),
        num(r * k + 3 * r),
      ]);
      return {
        prompt: `On a balance, ${r} blocks weigh the same as 1 weight. How many blocks weigh the same as ${k} weights?`,
        choices,
        answer,
        explain: `One weight equals ${r} blocks, so ${k} weights equal ${k} x ${r} = ${correct} blocks.`,
      };
    },
  },
  {
    id: 'qt2-027',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'balance conversion',
    generate: (rng) => {
      const per = randInt(rng, 2, 6);
      const a = randInt(rng, 2, 4);
      const b = a * per;
      const c = randInt(rng, 2, 5);
      const correct = num(per * c);
      const { choices, answer } = buildChoices(rng, correct, [
        num(b * c),
        num(b + c),
        num(per + c),
        num(per * c + per),
        num(b),
        // Structurally-distinct fallbacks: when a=c the b distractor equals the
        // correct answer and per+c can equal it too, collapsing the pool. per*c+2*per
        // and per*c-per step away from the answer in fixed increments - always distinct.
        num(per * c + 2 * per),
        num(per * c - per),
      ]);
      return {
        prompt: `${a} apples balance ${b} marbles. How many marbles balance ${c} apples?`,
        choices,
        answer,
        explain: `Each apple balances ${per} marbles (${b} divided by ${a}), so ${c} apples balance ${c} x ${per} = ${correct}.`,
      };
    },
  },
  {
    id: 'qt2-028',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 3,
    topic: 'big and small blocks on a scale',
    generate: (rng) => {
      const s = randInt(rng, 2, 4);
      const g = randInt(rng, 2, 4);
      const e = randInt(rng, 1, 3);
      const correct = num(g * s + e);
      const { choices, answer } = buildChoices(rng, correct, [
        num(g + e),
        num(g * s),
        num((g + e) * s),
        num(g * s + e + s),
        num(g * e),
        // Structurally-distinct fallbacks: when s=g=e=2 the g+e, g*s, g*e, and
        // (g+e)*s / g*s+e+s distractors collapse together. g*s+e+s is always valid,
        // and g*s+e+2*s, g*s+e-s step away in fixed increments - always distinct.
        num(g * s + e + 2 * s),
        num(g * s + e - s),
      ]);
      return {
        prompt: `1 big block balances ${s} small blocks. One side of a scale holds ${g} big blocks and ${e} small blocks. How many small blocks balance that side?`,
        choices,
        answer,
        explain: `Turn big into small: ${g} big = ${g} x ${s} = ${g * s} small. Add the ${e} small: ${correct}.`,
      };
    },
  },
  // --- Number riddles (solve backward) -------------------------------------
  {
    id: 'qt2-029',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'riddle: multiply then add',
    generate: (rng) => {
      const n = randInt(rng, 2, 9);
      const a = randInt(rng, 2, 5);
      const b = randInt(rng, 1, 9);
      const c = a * n + b;
      const correct = num(n);
      const { choices, answer } = buildChoices(rng, correct, [
        num(c - b),
        num(c - a),
        num(n + 1),
        num(n - 1),
        num(c - b - a),
      ]);
      return {
        prompt: `I think of a number. I multiply it by ${a}, then add ${b}, and get ${c}. What is my number?`,
        choices,
        answer,
        explain: `Work backward: ${c} - ${b} = ${c - b}, then ${c - b} divided by ${a} = ${correct}.`,
      };
    },
  },
  {
    id: 'qt2-030',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 3,
    topic: 'riddle: subtract then double',
    generate: (rng) => {
      const a = randInt(rng, 2, 6);
      const x = randInt(rng, a + 2, a + 10);
      const c = 2 * (x - a);
      const correct = num(x);
      const { choices, answer } = buildChoices(rng, correct, [
        num(c / 2),
        num(x + 1),
        num(x - 1),
        num(c - a),
        num(c),
      ]);
      return {
        prompt: `I think of a number. I subtract ${a}, then double the result, and get ${c}. What is my number?`,
        choices,
        answer,
        explain: `Work backward: ${c} halved is ${c / 2}, then add ${a} back: ${c / 2} + ${a} = ${correct}.`,
      };
    },
  },
  {
    id: 'qt2-031',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 3,
    topic: 'riddle: add then multiply',
    generate: (rng) => {
      const x = randInt(rng, 1, 9);
      const a = randInt(rng, 1, 5);
      const b = randInt(rng, 2, 4);
      const c = (x + a) * b;
      const correct = num(x);
      const { choices, answer } = buildChoices(rng, correct, [
        num(c - a),
        num(c / b),
        num(x + 1),
        num(x - 1),
        num(c - b),
      ]);
      return {
        prompt: `I think of a number. I add ${a}, then multiply by ${b}, and get ${c}. What is my number?`,
        choices,
        answer,
        explain: `Work backward: ${c} divided by ${b} = ${c / b}, then subtract ${a}: ${c / b} - ${a} = ${correct}.`,
      };
    },
  },
  {
    id: 'qt2-032',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 3,
    topic: 'riddle: half then add',
    generate: (rng) => {
      const x = 2 * randInt(rng, 2, 9);
      const a = randInt(rng, 1, 6);
      const c = x / 2 + a;
      const correct = num(x);
      const { choices, answer } = buildChoices(rng, correct, [
        num(c - a),
        num(2 * c),
        num(x + 2),
        num(x - 2),
        num(c),
      ]);
      return {
        prompt: `Half of a number plus ${a} equals ${c}. What is the number?`,
        choices,
        answer,
        explain: `${c} - ${a} = ${c - a} is half the number, so double it: ${c - a} x 2 = ${correct}.`,
      };
    },
  },
  // --- Logic with clues ----------------------------------------------------
  {
    id: 'qt2-033',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'ordering clues: tallest',
    generate: (rng) => {
      const [p0, p1, p2, p3] = shuffle(rng, NAMES).slice(0, 4);
      const clues = shuffle(rng, [
        `${p0} is taller than ${p1}.`,
        `${p1} is taller than ${p2}.`,
        `${p2} is taller than ${p3}.`,
      ]);
      const { choices, answer } = buildChoices(rng, p0, [p1, p2, p3]);
      return {
        prompt: `${clues.join(' ')} Who is the tallest?`,
        choices,
        answer,
        explain: `Line them up: ${p0} > ${p1} > ${p2} > ${p3}. The tallest is ${p0}.`,
      };
    },
  },
  {
    id: 'qt2-034',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 3,
    topic: 'ordering clues: oldest (mixed wording)',
    generate: (rng) => {
      const [p0, p1, p2, p3] = shuffle(rng, NAMES).slice(0, 4);
      const pairs: Array<[string, string]> = [
        [p0, p1],
        [p1, p2],
        [p2, p3],
      ];
      const clues = shuffle(
        rng,
        pairs.map(([older, younger]) =>
          rng() < 0.5
            ? `${older} is older than ${younger}.`
            : `${younger} is younger than ${older}.`,
        ),
      );
      const { choices, answer } = buildChoices(rng, p0, [p1, p2, p3]);
      return {
        prompt: `${clues.join(' ')} Who is the oldest?`,
        choices,
        answer,
        explain: `In order of age: ${p0} > ${p1} > ${p2} > ${p3}. The oldest is ${p0}.`,
      };
    },
  },
  {
    id: 'qt2-035',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'ordering clues: race finish',
    generate: (rng) => {
      const [p0, p1, p2, p3] = shuffle(rng, NAMES).slice(0, 4);
      const clues = shuffle(rng, [
        `${p0} finished ahead of ${p1}.`,
        `${p1} finished ahead of ${p2}.`,
        `${p2} finished ahead of ${p3}.`,
      ]);
      const { choices, answer } = buildChoices(rng, p2, [p0, p1, p3]);
      return {
        prompt: `${clues.join(' ')} Who finished in 3rd place?`,
        choices,
        answer,
        explain: `The finish order is ${p0}, ${p1}, ${p2}, ${p3}. Third place is ${p2}.`,
      };
    },
  },
  {
    id: 'qt2-036',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'ordering clues: second heaviest',
    generate: (rng) => {
      const [p0, p1, p2, p3] = shuffle(rng, NAMES).slice(0, 4);
      const clues = shuffle(rng, [
        `${p0} is heavier than ${p1}.`,
        `${p1} is heavier than ${p2}.`,
        `${p2} is heavier than ${p3}.`,
      ]);
      const { choices, answer } = buildChoices(rng, p1, [p0, p2, p3]);
      return {
        prompt: `${clues.join(' ')} Who is the second heaviest?`,
        choices,
        answer,
        explain: `From heaviest to lightest: ${p0}, ${p1}, ${p2}, ${p3}. The second heaviest is ${p1}.`,
      };
    },
  },
];
