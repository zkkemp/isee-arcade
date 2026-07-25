import {
  buildChoices,
  frac,
  money,
  num,
  pick,
  randInt,
  type QuestionTemplate,
} from './templates';

/**
 * ISEE Lower Level (grades 4-5) Quantitative Reasoning templates.
 *
 * Quantitative Reasoning is about reasoning and estimation, not computation
 * drills, and it is a no-calculator section. Every generated instance must be
 * solvable in the head or with two lines of scratch work, so the random ranges
 * here are deliberately tight: probabilities land on tidy fractions, divisions
 * come out even, and nothing goes negative where a 10-year-old would not
 * expect it.
 *
 * Distractors are computed mistakes (off by one, forgot to simplify, used the
 * total instead of the part, added instead of multiplied) so the question can't
 * be solved by elimination.
 */

const COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'] as const;

/**
 * Ratio pairs kept coprime, so a prompt never reads "4 to 2" when it means
 * "2 to 1", and kept small so the scaling stays mental.
 */
const RATIO_PAIRS: ReadonlyArray<readonly [number, number]> = [
  [2, 3],
  [3, 2],
  [2, 5],
  [5, 2],
  [3, 4],
  [4, 3],
  [3, 5],
  [5, 3],
  [4, 5],
  [5, 4],
];

export const QUANT_TEMPLATES: QuestionTemplate[] = [
  {
    id: 'qt-001',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'arithmetic sequence next term',
    generate: (rng) => {
      const start = randInt(rng, 2, 12);
      const step = randInt(rng, 3, 9);
      const terms = [0, 1, 2, 3].map((i) => start + i * step);
      const correct = num(start + 4 * step);
      const { choices, answer } = buildChoices(rng, correct, [
        num(start + 5 * step),
        num(start + 4 * step - 1),
        num(start + 3 * step + 1),
        num(start + 4 * step + 2),
      ]);
      return {
        prompt: `What number comes next? ${terms.join(', ')}, ___`,
        choices,
        answer,
        explain: `Each term goes up by ${step}. After ${terms[3]} comes ${terms[3]} + ${step} = ${correct}.`,
      };
    },
  },
  {
    id: 'qt-002',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'geometric sequence next term',
    generate: (rng) => {
      const start = randInt(rng, 1, 4);
      const ratio = randInt(rng, 2, 3);
      const terms = [0, 1, 2, 3].map((i) => start * ratio ** i);
      const last = terms[3];
      const correct = num(last * ratio);
      const { choices, answer } = buildChoices(rng, correct, [
        num(last + ratio),
        num(last + terms[2]),
        num(last * ratio - last),
        num(last * ratio + ratio),
      ]);
      return {
        prompt: `What number comes next? ${terms.join(', ')}, ___`,
        choices,
        answer,
        explain: `The pattern multiplies by ${ratio} instead of adding. ${last} x ${ratio} = ${correct}.`,
      };
    },
  },
  {
    id: 'qt-003',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'counting-down sequence',
    generate: (rng) => {
      const step = randInt(rng, 3, 7);
      const start = 5 * step + randInt(rng, 2, 20);
      const terms = [0, 1, 2, 3].map((i) => start - i * step);
      const last = terms[3];
      const correct = num(last - step);
      const { choices, answer } = buildChoices(rng, correct, [
        num(last - 2 * step),
        num(last),
        num(last - step - 1),
        num(last - step + 1),
      ]);
      return {
        prompt: `What number comes next? ${terms.join(', ')}, ___`,
        choices,
        answer,
        explain: `Each term drops by ${step}. ${last} - ${step} = ${correct}.`,
      };
    },
  },
  {
    id: 'qt-004',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 3,
    topic: 'growing-difference pattern',
    generate: (rng) => {
      const start = randInt(rng, 1, 9);
      const d = randInt(rng, 2, 6);
      const terms = [start, start + d, start + 3 * d, start + 6 * d];
      const last = terms[3];
      const correct = num(start + 10 * d);
      const { choices, answer } = buildChoices(rng, correct, [
        num(last + 3 * d),
        num(start + 11 * d),
        num(start + 10 * d - 1),
        num(last + d),
      ]);
      return {
        prompt: `What number comes next? ${terms.join(', ')}, ___`,
        choices,
        answer,
        explain: `The gaps grow: +${d}, +${2 * d}, +${3 * d}, so the next gap is +${4 * d}. ${last} + ${4 * d} = ${correct}.`,
      };
    },
  },
  {
    id: 'qt-005',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'estimate a sum',
    generate: (rng) => {
      const a = randInt(rng, 21, 89);
      let b = randInt(rng, 21, 89);
      if ((a + b) % 10 === 5) b += 1;
      const sum = a + b;
      const nearest = Math.round(sum / 10) * 10;
      const correct = num(nearest);
      const { choices, answer } = buildChoices(rng, correct, [
        num(nearest - 10),
        num(nearest + 10),
        num(nearest + 20),
        num(nearest - 20),
      ]);
      return {
        prompt: `The sum ${a} + ${b} is closest to which number?`,
        choices,
        answer,
        explain: `${a} + ${b} = ${sum}, and ${sum} is closest to ${correct}.`,
      };
    },
  },
  {
    id: 'qt-006',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'estimate a product',
    generate: (rng) => {
      const ones = pick(rng, [1, 2, 3, 4, 6, 7, 8, 9]);
      const tens = randInt(rng, 2, 4);
      const a = tens * 10 + ones;
      const rounded = Math.round(a / 10) * 10;
      const b = randInt(rng, 3, 9);
      const correct = num(rounded * b);
      // Every distractor is a ten-off rounding slip. Keeping them all a full
      // 10 x b away guarantees the marked answer really is the CLOSEST option to
      // the true product -- a distractor like rounded x (b + 1) can land nearer
      // to a x b than the intended estimate does, which makes the item unfair.
      const { choices, answer } = buildChoices(rng, correct, [
        num((rounded - 10) * b),
        num((rounded + 10) * b),
        num((rounded + 20) * b),
        num((rounded + 30) * b),
      ]);
      return {
        prompt: `Which is the best estimate of ${a} x ${b}?`,
        choices,
        answer,
        explain: `Round ${a} to ${rounded}. Then ${rounded} x ${b} = ${correct}.`,
      };
    },
  },
  {
    id: 'qt-007',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'compare unit fractions',
    generate: (rng) => {
      const pool = [2, 3, 4, 5, 6, 8, 10, 12];
      const chosen: number[] = [];
      while (chosen.length < 4) {
        const d = pick(rng, pool);
        if (!chosen.includes(d)) chosen.push(d);
      }
      const smallest = Math.min(...chosen);
      const others = chosen.filter((d) => d !== smallest).sort((x, y) => x - y);
      const correct = `1/${smallest}`;
      const { choices, answer } = buildChoices(rng, correct, [
        ...others.map((d) => `1/${d}`),
        `1/${Math.max(...chosen) + 1}`,
      ]);
      return {
        prompt: 'Which fraction is the largest?',
        choices,
        answer,
        explain: `Each fraction has 1 on top, so the smallest bottom number wins. 1/${smallest} is larger than 1/${others[0]}.`,
      };
    },
  },
  {
    id: 'qt-008',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'scale a ratio',
    generate: (rng) => {
      const [flourPer, sugarPer] = pick(rng, RATIO_PAIRS);
      const n = randInt(rng, 2, 5);
      const flour = n * flourPer;
      const correct = num(n * sugarPer);
      const { choices, answer } = buildChoices(rng, correct, [
        num(flour),
        num(n * sugarPer + sugarPer),
        num(n * sugarPer - sugarPer),
        num(sugarPer + n),
        num(flour - flourPer),
      ]);
      return {
        prompt: `A recipe uses ${flourPer} cups of flour for every ${sugarPer} cups of sugar. How many cups of sugar go with ${flour} cups of flour?`,
        choices,
        answer,
        explain: `${flour} cups of flour is ${n} batches of ${flourPer}. So sugar is ${n} x ${sugarPer} = ${correct} cups.`,
      };
    },
  },
  {
    id: 'qt-009',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'probability from marbles',
    generate: (rng) => {
      // Each colour gets at least 2 so the total is 6+; that keeps the
      // distractor set from collapsing onto the answer.
      const counts = [randInt(rng, 2, 7), randInt(rng, 2, 7), randInt(rng, 2, 7)];
      const names = [COLORS[0], COLORS[1], COLORS[2]];
      const idx = randInt(rng, 0, 2);
      const total = counts[0] + counts[1] + counts[2];
      const part = counts[idx];
      const correct = frac(part, total);
      const raw = `${part}/${total}`;
      // NOTE: the unsimplified `part/total` is deliberately NOT a distractor --
      // it is numerically equal to the answer, so offering both would make two
      // options correct.
      const { choices, answer } = buildChoices(rng, correct, [
        frac(total - part, total),
        frac(part + 1, total),
        frac(part, total - 1),
        frac(counts[(idx + 1) % 3], total),
        // part-to-part instead of part-to-whole, but only while it stays under 1
        // -- an option of "1" or more is not a believable probability.
        ...(part < total - part ? [frac(part, total - part)] : []),
      ]);
      return {
        prompt: `A bag holds ${counts[0]} ${names[0]}, ${counts[1]} ${names[1]}, and ${counts[2]} ${names[2]} marbles. What is the probability of drawing a ${names[idx]} marble?`,
        choices,
        answer,
        explain:
          raw === correct
            ? `There are ${part} ${names[idx]} out of ${total} marbles, so the probability is ${correct}.`
            : `There are ${part} ${names[idx]} out of ${total} marbles, and ${raw} simplifies to ${correct}.`,
      };
    },
  },
  {
    id: 'qt-010',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'probability from a spinner',
    generate: (rng) => {
      const sections = pick(rng, [4, 6, 8, 10, 12]);
      // Capped at sections - 2 so no distractor comes out as a probability of 1.
      const k = randInt(rng, 1, sections - 2);
      const color = pick(rng, COLORS);
      const correct = frac(k, sections);
      const raw = `${k}/${sections}`;
      const isOne = k === 1;
      const { choices, answer } = buildChoices(rng, correct, [
        frac(sections - k, sections),
        frac(k + 1, sections),
        frac(k, sections - 1),
        frac(1, sections),
        ...(k > 1 ? [frac(k - 1, sections)] : []),
      ]);
      return {
        prompt: `A spinner has ${sections} equal sections, and ${k} of them ${isOne ? 'is' : 'are'} ${color}. What is the probability of landing on ${color}?`,
        choices,
        answer,
        explain:
          raw === correct
            ? `${k} of the ${sections} equal sections ${isOne ? 'is' : 'are'} ${color}, so the probability is ${correct}.`
            : `${k} of the ${sections} equal sections are ${color}, so the probability is ${raw}, which simplifies to ${correct}.`,
      };
    },
  },
  {
    id: 'qt-011',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 3,
    topic: 'probability of repeated coin flips',
    generate: (rng) => {
      const n = randInt(rng, 2, 3);
      const outcomes = 2 ** n;
      const correct = frac(1, outcomes);
      const { choices, answer } = buildChoices(rng, correct, [
        '1/2',
        `${outcomes - 1}/${outcomes}`,
        `1/${outcomes - 1}`,
        `${n}/${outcomes}`,
        `1/${2 * n}`,
      ]);
      return {
        prompt: `A fair coin is flipped ${n} times. What is the probability that it lands heads up every time?`,
        choices,
        answer,
        explain: `Each flip has a 1/2 chance, so ${n} heads in a row is ${Array(n).fill('1/2').join(' x ')} = ${correct}.`,
      };
    },
  },
  {
    id: 'qt-012',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'rectangle perimeter',
    generate: (rng) => {
      const long = randInt(rng, 5, 15);
      const short = randInt(rng, 2, 4) + randInt(rng, 0, 3);
      const w = short === long ? short - 1 : short;
      const p = 2 * (long + w);
      const correct = num(p);
      const { choices, answer } = buildChoices(rng, correct, [
        num(long * w),
        num(long + w),
        num(2 * long + w),
        num(p - 2),
        num(p + 2),
      ]);
      return {
        prompt: `A rectangle is ${long} feet long and ${w} feet wide. What is its perimeter, in feet?`,
        choices,
        answer,
        explain: `Add all four sides: ${long} + ${w} + ${long} + ${w} = ${correct}.`,
      };
    },
  },
  {
    id: 'qt-013',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 3,
    topic: 'missing side from area',
    generate: (rng) => {
      const known = randInt(rng, 3, 9);
      const other = randInt(rng, 4, 12);
      const area = known * other;
      const correct = num(other);
      const { choices, answer } = buildChoices(rng, correct, [
        num(area - known),
        num(2 * (known + other)),
        num(other + 1),
        num(other - 1),
        num(area + known),
      ]);
      return {
        prompt: `A rectangle has an area of ${area} square feet. One side is ${known} feet long. How long is the other side, in feet?`,
        choices,
        answer,
        explain: `Area is length x width, so divide: ${area} divided by ${known} = ${correct}.`,
      };
    },
  },
  {
    id: 'qt-014',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'square side from perimeter',
    generate: (rng) => {
      const side = randInt(rng, 3, 15);
      const p = 4 * side;
      const correct = num(side);
      const { choices, answer } = buildChoices(rng, correct, [
        num(p / 2),
        num(side * side),
        num(p - 4),
        num(side + 1),
        num(side + 4),
      ]);
      return {
        prompt: `The perimeter of a square is ${p} inches. How long is one side, in inches?`,
        choices,
        answer,
        explain: `A square has 4 equal sides, so ${p} divided by 4 = ${correct} inches.`,
      };
    },
  },
  {
    id: 'qt-015',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'square area from side',
    generate: (rng) => {
      const side = randInt(rng, 3, 12);
      const area = side * side;
      const correct = num(area);
      const { choices, answer } = buildChoices(rng, correct, [
        num(4 * side),
        num(2 * side),
        num(area - side),
        num(area + 2 * side),
        num(area + side),
        num(area - 1),
      ]);
      return {
        prompt: `A square garden has sides ${side} feet long. What is its area, in square feet?`,
        choices,
        answer,
        explain: `Area of a square is side x side: ${side}^2 = ${side} x ${side} = ${correct}.`,
      };
    },
  },
  {
    id: 'qt-016',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'lines of symmetry',
    generate: (rng) => {
      const shapes = [
        { name: 'square', lines: 4 },
        { name: 'rectangle that is not a square', lines: 2 },
        { name: 'equilateral triangle', lines: 3 },
        { name: 'regular pentagon', lines: 5 },
        { name: 'regular hexagon', lines: 6 },
        { name: 'regular octagon', lines: 8 },
      ];
      const shape = pick(rng, shapes);
      const correct = num(shape.lines);
      const { choices, answer } = buildChoices(rng, correct, [
        num(shape.lines + 1),
        num(shape.lines - 1),
        num(shape.lines * 2),
        num(shape.lines + 2),
        '1',
      ]);
      return {
        prompt: `How many lines of symmetry does a ${shape.name} have?`,
        choices,
        answer,
        explain: `A ${shape.name} can be folded onto itself ${shape.lines} different ways, so it has ${shape.lines} lines of symmetry.`,
      };
    },
  },
  {
    id: 'qt-017',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'regular polygon perimeter',
    generate: (rng) => {
      const shape = pick(rng, [
        { name: 'pentagon', sides: 5 },
        { name: 'hexagon', sides: 6 },
        { name: 'octagon', sides: 8 },
      ]);
      const side = randInt(rng, 3, 12);
      const p = shape.sides * side;
      const correct = num(p);
      const { choices, answer } = buildChoices(rng, correct, [
        num(shape.sides + side),
        num((shape.sides - 1) * side),
        num(p + side),
        num(side * side),
        num(p - side),
      ]);
      return {
        prompt: `A regular ${shape.name} has ${shape.sides} equal sides, each ${side} cm long. What is its perimeter, in cm?`,
        choices,
        answer,
        explain: `All ${shape.sides} sides are the same, so ${shape.sides} x ${side} = ${correct} cm.`,
      };
    },
  },
  {
    id: 'qt-018',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'solve for a box',
    generate: (rng) => {
      const factor = randInt(rng, 3, 9);
      const missing = randInt(rng, 3, 9);
      const product = factor * missing;
      const correct = num(missing);
      const { choices, answer } = buildChoices(rng, correct, [
        num(product - factor),
        num(product + factor),
        num(factor + missing),
        num(missing + 1),
        num(product),
      ]);
      return {
        prompt: `If [box] x ${factor} = ${product}, what number goes in the box?`,
        choices,
        answer,
        explain: `Undo the multiplication: ${product} divided by ${factor} = ${correct}.`,
      };
    },
  },
  {
    id: 'qt-019',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 3,
    topic: 'two-step equation',
    generate: (rng) => {
      const a = randInt(rng, 2, 6);
      const n = randInt(rng, 2, 9);
      const b = randInt(rng, 2, 12);
      const c = a * n + b;
      const correct = num(n);
      const { choices, answer } = buildChoices(rng, correct, [
        num(c - b),
        num(n + 1),
        num(n - 1),
        num(a + b),
        num(a * (n - 1)),
      ]);
      return {
        prompt: `If ${a}n + ${b} = ${c}, what is the value of n?`,
        choices,
        answer,
        explain: `Take away ${b} from both sides: ${a}n = ${c - b}. Then ${c - b} divided by ${a} = ${correct}.`,
      };
    },
  },
  {
    id: 'qt-020',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'order of operations value',
    generate: (rng) => {
      const a = randInt(rng, 2, 9);
      const b = randInt(rng, 2, 6);
      const c = randInt(rng, 2, 6);
      const product = b * c;
      const correct = num(a + product);
      const { choices, answer } = buildChoices(rng, correct, [
        num((a + b) * c),
        num(a + b + c),
        num(a * b * c),
        num(a * b + c),
        num(a + product + 1),
        num(a + product - 1),
      ]);
      return {
        prompt: `What is the value of ${a} + ${b} x ${c}?`,
        choices,
        answer,
        explain: `Multiply before adding: ${b} x ${c} = ${product}, then ${a} + ${product} = ${correct}.`,
      };
    },
  },
  {
    id: 'qt-021',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 3,
    topic: 'compare decimals',
    generate: (rng) => {
      const x = randInt(rng, 2, 8);
      const correct = `0.${x}`;
      const { choices, answer } = buildChoices(rng, correct, [
        `0.${x - 1}9`,
        `0.0${x}`,
        `0.0${x}9`,
        `0.${x - 1}`,
      ]);
      return {
        prompt: 'Which number is the greatest?',
        choices,
        answer,
        explain: `0.${x} is ${x} tenths. 0.${x - 1}9 is only ${x - 1} tenths and 9 hundredths, and 0.0${x} is just ${x} hundredths.`,
      };
    },
  },
  {
    id: 'qt-022',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'measurement unit conversion',
    generate: (rng) => {
      const unit = pick(rng, [
        { one: 'meter', many: 'meters', to: 'centimeters', f: 100 },
        { one: 'kilogram', many: 'kilograms', to: 'grams', f: 1000 },
        { one: 'liter', many: 'liters', to: 'milliliters', f: 1000 },
        { one: 'kilometer', many: 'kilometers', to: 'meters', f: 1000 },
        { one: 'foot', many: 'feet', to: 'inches', f: 12 },
        { one: 'yard', many: 'yards', to: 'feet', f: 3 },
        { one: 'hour', many: 'hours', to: 'minutes', f: 60 },
        { one: 'minute', many: 'minutes', to: 'seconds', f: 60 },
      ]);
      const q = randInt(rng, 2, 9);
      const total = q * unit.f;
      const correct = num(total);
      const { choices, answer } = buildChoices(rng, correct, [
        num(total * 10),
        num(q + unit.f),
        num(unit.f),
        num((q + 1) * unit.f),
        num((q - 1) * unit.f),
      ]);
      return {
        prompt: `How many ${unit.to} are in ${q} ${unit.many}?`,
        choices,
        answer,
        explain: `One ${unit.one} is ${unit.f} ${unit.to}, so ${q} x ${unit.f} = ${correct}.`,
      };
    },
  },
  {
    id: 'qt-023',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'elapsed time',
    generate: (rng) => {
      const fmt = (h: number, m: number) => `${h}:${String(m).padStart(2, '0')}`;
      const startHour = randInt(rng, 2, 8);
      const startMin = pick(rng, [0, 5, 10, 15, 20, 25, 30, 40, 45, 50, 55]);
      const duration = pick(rng, [45, 50, 55, 70, 75, 80, 90, 95, 100, 105, 110]);
      const totalMin = startHour * 60 + startMin + duration;
      const endHour = Math.floor(totalMin / 60);
      const endMin = totalMin % 60;
      const startStr = fmt(startHour, startMin);
      const correct = fmt(endHour, endMin);
      const wholeHours = Math.floor(duration / 60);
      const leftover = duration % 60;
      const durText =
        wholeHours === 0
          ? `${leftover} minutes`
          : leftover === 0
            ? `${wholeHours} hours`
            : `${wholeHours} hour ${leftover} minutes`;
      const { choices, answer } = buildChoices(rng, correct, [
        fmt(endHour - 1, endMin),
        fmt(endHour + 1, endMin),
        fmt(endHour, (endMin + 15) % 60),
        fmt(startHour + wholeHours, startMin),
        fmt(startHour + wholeHours + 1, startMin),
      ]);
      return {
        prompt: `A movie starts at ${startStr} and lasts ${duration} minutes. What time does it end?`,
        choices,
        answer,
        explain: `${duration} minutes is ${durText}, so ${startStr} plus ${durText} ends at ${correct}.`,
      };
    },
  },
  {
    id: 'qt-024',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'read a table: difference',
    generate: (rng) => {
      const red = randInt(rng, 13, 20);
      const blue = randInt(rng, 5, 12);
      const green = randInt(rng, 2, 8);
      const correct = num(red - green);
      const { choices, answer } = buildChoices(rng, correct, [
        num(red + green),
        num(red - blue),
        num(red + blue + green),
        num(red - green - 1),
        num(Math.abs(blue - green)),
      ]);
      return {
        prompt: `A store sold ${red} red, ${blue} blue, and ${green} green shirts. How many more red shirts than green shirts were sold?`,
        choices,
        answer,
        explain: `Use only red and green: ${red} - ${green} = ${correct}.`,
      };
    },
  },
  {
    id: 'qt-025',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'ratio to a total',
    generate: (rng) => {
      const [boysPer, girlsPer] = pick(rng, RATIO_PAIRS);
      const k = randInt(rng, 2, 5);
      const boys = boysPer * k;
      const girls = girlsPer * k;
      const correct = num(boys + girls);
      const { choices, answer } = buildChoices(rng, correct, [
        num(girls),
        num(boysPer + girlsPer),
        num(boys + girlsPer),
        num(boys + girls - k),
        num(boys + girls + k),
      ]);
      return {
        prompt: `In a class the ratio of boys to girls is ${boysPer} to ${girlsPer}. If there are ${boys} boys, how many students are in the class?`,
        choices,
        answer,
        explain: `${boys} boys is ${k} groups of ${boysPer}, so there are ${k} x ${girlsPer} = ${girls} girls. Together that is ${correct} students.`,
      };
    },
  },
  {
    id: 'qt-026',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 3,
    topic: 'average from a table',
    generate: (rng) => {
      const mean = randInt(rng, 6, 15);
      const a = randInt(rng, 1, 4);
      const b = randInt(rng, 1, 4);
      const values = [mean - a, mean + a, mean - b, mean + b];
      // Shuffle so the pairing is not visible in the prompt.
      for (let i = values.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [values[i], values[j]] = [values[j], values[i]];
      }
      const total = 4 * mean;
      const correct = num(mean);
      const { choices, answer } = buildChoices(rng, correct, [
        num(total),
        num(mean + 1),
        num(mean - 1),
        num(Math.max(...values)),
        num(Math.min(...values)),
      ]);
      return {
        prompt: `A shop sold ${values[0]}, ${values[1]}, ${values[2]}, and ${values[3]} bagels on four days. What was the average number sold per day?`,
        choices,
        answer,
        explain: `The four days add up to ${total}, and ${total} divided by 4 = ${correct}.`,
      };
    },
  },
  {
    id: 'qt-027',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 3,
    topic: 'number riddle with clues',
    generate: (rng) => {
      const k = randInt(rng, 3, 9);
      const t = randInt(rng, 3, 8);
      const target = k * t;
      const low = target - k;
      const high = target + k;
      const correct = num(target);
      const { choices, answer } = buildChoices(rng, correct, [
        num(low),
        num(high),
        num(target + 1),
        num(target - 1),
        num(low + 1),
      ]);
      return {
        prompt: `A number is a multiple of ${k}, greater than ${low}, and less than ${high}. What is the number?`,
        choices,
        answer,
        explain: `The multiples of ${k} in that area are ${low}, ${target}, and ${high}. Only ${correct} is between ${low} and ${high}.`,
      };
    },
  },
  {
    id: 'qt-028',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'read a table: fraction of total',
    generate: (rng) => {
      const red = randInt(rng, 2, 8);
      const blue = randInt(rng, 2, 8);
      const green = randInt(rng, 2, 8);
      const total = red + blue + green;
      const correct = frac(blue, total);
      const raw = `${blue}/${total}`;
      // As in qt-009: no unsimplified `blue/total` distractor, it equals the answer.
      const { choices, answer } = buildChoices(rng, correct, [
        frac(total - blue, total),
        frac(blue + 1, total),
        frac(blue, total - 1),
        frac(red, total),
        ...(blue < total - blue ? [frac(blue, total - blue)] : []),
      ]);
      return {
        prompt: `A store sold ${red} red, ${blue} blue, and ${green} green shirts. What fraction of the shirts sold were blue?`,
        choices,
        answer,
        explain:
          raw === correct
            ? `${blue} of the ${total} shirts were blue, so the fraction is ${correct}.`
            : `${blue} of the ${total} shirts were blue, and ${raw} simplifies to ${correct}.`,
      };
    },
  },
  {
    id: 'qt-029',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 3,
    topic: 'sharing with a remainder',
    generate: (rng) => {
      const kids = randInt(rng, 3, 8);
      const each = randInt(rng, 3, 9);
      const left = randInt(rng, 1, kids - 1);
      const cookies = kids * each + left;
      const shared = kids * each;
      const correct = num(left);
      const { choices, answer } = buildChoices(rng, correct, [
        num(each),
        num(kids - left),
        num(left + 1),
        num(kids),
        num(shared),
        num(cookies - kids),
      ]);
      return {
        prompt: `${cookies} cookies are shared equally among ${kids} children, giving each child as many whole cookies as possible. How many cookies are left over?`,
        choices,
        answer,
        explain: `Each child gets ${each} because ${kids} x ${each} = ${shared}. Then ${cookies} - ${shared} = ${correct} left over.`,
      };
    },
  },
  {
    id: 'qt-030',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'estimate a money total',
    generate: (rng) => {
      const dollars = randInt(rng, 2, 8);
      const n = randInt(rng, 3, 9);
      const priceCents = dollars * 100 + 99;
      const roundedCents = (dollars + 1) * 100;
      const estimateCents = n * roundedCents;
      const correct = money(estimateCents);
      const { choices, answer } = buildChoices(rng, correct, [
        money(n * dollars * 100),
        money(estimateCents - 100),
        money(estimateCents + 100),
        money((n + 1) * roundedCents),
      ]);
      return {
        prompt: `A notebook costs ${money(priceCents)}. About how much do ${n} notebooks cost?`,
        choices,
        answer,
        explain: `${money(priceCents)} is about ${money(roundedCents)}, so ${n} x ${money(roundedCents)} = ${correct}.`,
      };
    },
  },
];
