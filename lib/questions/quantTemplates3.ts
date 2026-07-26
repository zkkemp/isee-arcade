import {
  buildChoices,
  frac,
  num,
  pick,
  randInt,
  type QuestionTemplate,
  type Rng,
} from './templates';

/**
 * ISEE Lower Level Quantitative Reasoning templates, set 3.
 *
 * Domain: Data Analysis, Probability, Statistics (mean/median/mode/range),
 * Estimation/Rounding, and Coordinate Geometry (reading points and distance
 * along axis-aligned segments). Every instance is regenerated from fresh
 * numbers, must be solvable in the head by a 5th grader, and has exactly one
 * defensible answer. Distractors model realistic mistakes (used the sum instead
 * of dividing for a mean, took the wrong middle number, off-by-one on a range,
 * swapped the coordinates) so nothing is guessable by elimination.
 */

const KID_NAMES = [
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
] as const;

const FRUITS = ['apples', 'bananas', 'grapes', 'oranges', 'pears', 'plums'] as const;
const PETS = ['cats', 'dogs', 'fish', 'birds', 'rabbits', 'turtles'] as const;
const SPORTS = ['soccer', 'baseball', 'tennis', 'hockey', 'swimming', 'running'] as const;
const SYMBOLS = ['star', 'apple', 'book', 'smiley', 'flag', 'leaf'] as const;
const COLORS = ['red', 'blue', 'green', 'yellow'] as const;

function shuffle<T>(rng: Rng, arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** n DISTINCT integers drawn from [min, max]. Range must be wide enough. */
function distinctInts(rng: Rng, n: number, min: number, max: number): number[] {
  const out: number[] = [];
  while (out.length < n) {
    const x = randInt(rng, min, max);
    if (!out.includes(x)) out.push(x);
  }
  return out;
}

export const QUANT_TEMPLATES_3: QuestionTemplate[] = [
  // --- Reading pictographs & bar graphs ------------------------------------
  {
    id: 'qt3-001',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'pictograph: value of one row',
    generate: (rng) => {
      const k = randInt(rng, 2, 5);
      const s = randInt(rng, 3, 7);
      const sym = pick(rng, SYMBOLS);
      const item = pick(rng, FRUITS);
      const correct = num(s * k);
      const { choices, answer } = buildChoices(rng, correct, [
        num(s + k),
        num(s),
        num(k),
        num((s + 1) * k),
        num((s - 1) * k),
      ]);
      return {
        prompt: `On a pictograph, each ${sym} stands for ${k} ${item}. One row shows ${s} ${sym} pictures. How many ${item} is that?`,
        choices,
        answer,
        explain: `Each picture is worth ${k}, and there are ${s} of them: ${s} x ${k} = ${correct}.`,
      };
    },
  },
  {
    id: 'qt3-002',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'bar graph: total of all bars',
    generate: (rng) => {
      const [a, b, c] = distinctInts(rng, 3, 2, 9);
      const [x, y, z] = shuffle(rng, KID_NAMES).slice(0, 3);
      const correct = num(a + b + c);
      const { choices, answer } = buildChoices(rng, correct, [
        num(a + b),
        num(Math.max(a, b, c)),
        num(a + b + c + 1),
        num(a + b + c - 1),
        num(a + c),
      ]);
      return {
        prompt: `A bar graph shows books read: ${x} read ${a}, ${y} read ${b}, and ${z} read ${c}. How many books did they read in all?`,
        choices,
        answer,
        explain: `Add the three bars: ${a} + ${b} + ${c} = ${correct}.`,
      };
    },
  },
  {
    id: 'qt3-003',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'bar graph: how many more',
    generate: (rng) => {
      const a = randInt(rng, 6, 12);
      const b = randInt(rng, 1, a - 2);
      const [x, y] = shuffle(rng, KID_NAMES).slice(0, 2);
      const item = pick(rng, SPORTS);
      const correct = num(a - b);
      const { choices, answer } = buildChoices(rng, correct, [
        num(a + b),
        num(a),
        num(a - b - 1),
        num(a - b + 1),
        num(b),
      ]);
      return {
        prompt: `A bar graph shows votes for ${item}: ${x} got ${a} and ${y} got ${b}. How many MORE votes did ${x} get than ${y}?`,
        choices,
        answer,
        explain: `Subtract to compare: ${a} - ${b} = ${correct}.`,
      };
    },
  },
  {
    id: 'qt3-004',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'pictograph: difference between two rows',
    generate: (rng) => {
      const k = randInt(rng, 2, 5);
      const sa = randInt(rng, 4, 8);
      const sb = randInt(rng, 1, sa - 1);
      const sym = pick(rng, SYMBOLS);
      const item = pick(rng, PETS);
      const correct = num((sa - sb) * k);
      const { choices, answer } = buildChoices(rng, correct, [
        num(sa - sb),
        num((sa + sb) * k),
        num(sa * k),
        num((sa - sb) * k + k),
        num((sa - sb) * k - k),
      ]);
      return {
        prompt: `Each ${sym} stands for ${k} ${item}. The top row has ${sa} ${sym} and the bottom row has ${sb} ${sym}. How many more ${item} are in the top row?`,
        choices,
        answer,
        explain: `The rows differ by ${sa} - ${sb} = ${sa - sb} pictures, and each is worth ${k}: ${sa - sb} x ${k} = ${correct}.`,
      };
    },
  },
  {
    id: 'qt3-005',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'bar graph: which category is greatest',
    generate: (rng) => {
      const cats = shuffle(rng, FRUITS).slice(0, 3);
      const vals = distinctInts(rng, 3, 3, 15);
      const maxIdx = vals.indexOf(Math.max(...vals));
      const correct = cats[maxIdx];
      const others = cats.filter((_, i) => i !== maxIdx);
      const { choices, answer } = buildChoices(rng, correct, [
        others[0],
        others[1],
        'They are equal',
        'Cannot tell',
      ]);
      return {
        prompt: `A bar graph shows fruit sold: ${cats[0]} ${vals[0]}, ${cats[1]} ${vals[1]}, ${cats[2]} ${vals[2]}. Which fruit sold the MOST?`,
        choices,
        answer,
        explain: `The biggest number is ${vals[maxIdx]}, which belongs to ${correct}.`,
      };
    },
  },
  {
    id: 'qt3-006',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'tally chart: count the tallies',
    generate: (rng) => {
      const groups = randInt(rng, 2, 5);
      const extra = randInt(rng, 1, 4);
      const total = groups * 5 + extra;
      const item = pick(rng, PETS);
      const correct = num(total);
      const { choices, answer } = buildChoices(rng, correct, [
        num(groups + extra),
        num(groups * 5),
        num(total + 1),
        num(total - 1),
        num(groups),
      ]);
      return {
        prompt: `A tally chart for ${item} has ${groups} full groups of 5 plus ${extra} more marks. How many ${item} is that?`,
        choices,
        answer,
        explain: `Each group is 5: ${groups} x 5 = ${groups * 5}, plus ${extra} more = ${correct}.`,
      };
    },
  },
  // --- Mean -----------------------------------------------------------------
  {
    id: 'qt3-007',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'mean of 3 numbers',
    generate: (rng) => {
      const mean = randInt(rng, 5, 12);
      const d = randInt(rng, 1, 3);
      const shown = shuffle(rng, [mean - d, mean + d, mean]);
      const sum = shown.reduce((p, q) => p + q, 0);
      const correct = num(sum / 3);
      const { choices, answer } = buildChoices(rng, correct, [
        num(sum),
        num(sum / 3 + 1),
        num(sum / 3 - 1),
        num(Math.max(...shown)),
        num(Math.round(sum / 2)),
      ]);
      return {
        prompt: `What is the average (mean) of ${shown[0]}, ${shown[1]}, and ${shown[2]}?`,
        choices,
        answer,
        explain: `Add them: ${shown[0]} + ${shown[1]} + ${shown[2]} = ${sum}. Divide by 3: ${sum} / 3 = ${correct}.`,
      };
    },
  },
  {
    id: 'qt3-008',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'mean of 4 numbers',
    generate: (rng) => {
      const mean = randInt(rng, 6, 14);
      const a = randInt(rng, 1, 4);
      const b = randInt(rng, 1, 4);
      const list = shuffle(rng, [mean - a, mean + a, mean - b, mean + b]);
      const sum = list.reduce((p, q) => p + q, 0);
      const correct = num(sum / 4);
      const { choices, answer } = buildChoices(rng, correct, [
        num(sum),
        num(sum / 4 + 1),
        num(sum / 4 - 1),
        num(Math.round(sum / 3)),
        num(sum / 2),
      ]);
      return {
        prompt: `A team scored ${list[0]}, ${list[1]}, ${list[2]}, and ${list[3]} points in 4 games. What was the average per game?`,
        choices,
        answer,
        explain: `Sum is ${list[0]} + ${list[1]} + ${list[2]} + ${list[3]} = ${sum}. Divide by 4: ${sum} / 4 = ${correct}.`,
      };
    },
  },
  {
    id: 'qt3-009',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'mean as fair share',
    generate: (rng) => {
      const people = randInt(rng, 3, 6);
      const each = randInt(rng, 3, 8);
      const total = people * each;
      const item = pick(rng, FRUITS);
      const correct = num(each);
      const { choices, answer } = buildChoices(rng, correct, [
        num(total - people),
        num(total),
        num(each + 1),
        num(each - 1),
        num(people),
      ]);
      return {
        prompt: `${people} friends share ${total} ${item} equally. How many ${item} does each friend get?`,
        choices,
        answer,
        explain: `Split evenly: ${total} / ${people} = ${correct} each.`,
      };
    },
  },
  {
    id: 'qt3-010',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 3,
    topic: 'find missing value given the mean (3 numbers)',
    generate: (rng) => {
      const mean = randInt(rng, 6, 12);
      const a = mean - randInt(rng, 1, 4);
      const b = mean + randInt(rng, 1, 4);
      const missing = 3 * mean - a - b;
      const correct = num(missing);
      const { choices, answer } = buildChoices(rng, correct, [
        num(mean),
        num(3 * mean),
        num(missing + 1),
        num(missing - 1),
        num(a + b),
      ]);
      return {
        prompt: `Three tests have an average of ${mean}. Two of the scores are ${a} and ${b}. What is the third score?`,
        choices,
        answer,
        explain: `All three add to ${mean} x 3 = ${3 * mean}. Take away the known scores: ${3 * mean} - ${a} - ${b} = ${correct}.`,
      };
    },
  },
  {
    id: 'qt3-011',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 3,
    topic: 'find missing value given the mean (4 numbers)',
    generate: (rng) => {
      const mean = randInt(rng, 6, 12);
      const a = mean - randInt(rng, 1, 3);
      const b = mean + randInt(rng, 1, 3);
      const c = mean - randInt(rng, 1, 3);
      const missing = 4 * mean - a - b - c;
      const correct = num(missing);
      const { choices, answer } = buildChoices(rng, correct, [
        num(mean),
        num(4 * mean),
        num(missing + 1),
        num(missing - 1),
        num(a + b + c),
      ]);
      return {
        prompt: `Four numbers have an average of ${mean}. Three of them are ${a}, ${b}, and ${c}. What is the fourth number?`,
        choices,
        answer,
        explain: `All four add to ${mean} x 4 = ${4 * mean}. Subtract the known ones: ${4 * mean} - ${a} - ${b} - ${c} = ${correct}.`,
      };
    },
  },
  // --- Median ---------------------------------------------------------------
  {
    id: 'qt3-012',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'median of 3 numbers',
    generate: (rng) => {
      const list = distinctInts(rng, 3, 2, 20);
      const sorted = [...list].sort((p, q) => p - q);
      const correct = num(sorted[1]);
      const { choices, answer } = buildChoices(rng, correct, [
        num(sorted[0]),
        num(sorted[2]),
        num(sorted[0] + sorted[2]),
        num(sorted[2] - sorted[0]),
        num(sorted[1] + 1),
        num(sorted[1] - 1),
      ]);
      return {
        prompt: `What is the median (middle number) of ${list[0]}, ${list[1]}, and ${list[2]}?`,
        choices,
        answer,
        explain: `In order they are ${sorted[0]}, ${sorted[1]}, ${sorted[2]}. The middle one is ${correct}.`,
      };
    },
  },
  {
    id: 'qt3-013',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'median of 5 numbers',
    generate: (rng) => {
      const list = distinctInts(rng, 5, 1, 25);
      const sorted = [...list].sort((p, q) => p - q);
      const correct = num(sorted[2]);
      const { choices, answer } = buildChoices(rng, correct, [
        num(sorted[0]),
        num(sorted[4]),
        num(sorted[1]),
        num(sorted[3]),
        num(sorted[4] - sorted[0]),
      ]);
      return {
        prompt: `Find the median of ${list[0]}, ${list[1]}, ${list[2]}, ${list[3]}, and ${list[4]}.`,
        choices,
        answer,
        explain: `In order: ${sorted.join(', ')}. The middle (3rd) number is ${correct}.`,
      };
    },
  },
  {
    id: 'qt3-014',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 3,
    topic: 'median of 4 numbers (even count)',
    generate: (rng) => {
      const b = randInt(rng, 5, 12);
      const gap = randInt(rng, 1, 3) * 2; // keeps b and c the same parity
      const c = b + gap;
      const a = b - randInt(rng, 1, 3);
      const d = c + randInt(rng, 1, 3);
      const list = shuffle(rng, [a, b, c, d]);
      const median = (b + c) / 2;
      const correct = num(median);
      const { choices, answer } = buildChoices(rng, correct, [
        num(b),
        num(c),
        num(b + c),
        num(median + 2),
        num(median - 2),
        num(d - a),
      ]);
      return {
        prompt: `Find the median of ${list[0]}, ${list[1]}, ${list[2]}, and ${list[3]}.`,
        choices,
        answer,
        explain: `In order the two middle numbers are ${b} and ${c}. Their average is (${b} + ${c}) / 2 = ${correct}.`,
      };
    },
  },
  // --- Mode -----------------------------------------------------------------
  {
    id: 'qt3-015',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'mode of a list',
    generate: (rng) => {
      const [modeVal, x, y] = distinctInts(rng, 3, 1, 12);
      const list = shuffle(rng, [modeVal, modeVal, modeVal, x, y]);
      const correct = num(modeVal);
      const { choices, answer } = buildChoices(rng, correct, [
        num(x),
        num(y),
        num(Math.max(modeVal, x, y) + 1),
        num(modeVal + 1),
        num(modeVal - 1),
      ]);
      return {
        prompt: `What is the mode (most common number) of ${list.join(', ')}?`,
        choices,
        answer,
        explain: `${modeVal} appears 3 times, more than any other number, so the mode is ${correct}.`,
      };
    },
  },
  {
    id: 'qt3-016',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'mode of a longer list',
    generate: (rng) => {
      const [modeVal, x, y, z] = distinctInts(rng, 4, 1, 15);
      const list = shuffle(rng, [modeVal, modeVal, modeVal, x, y, z]);
      const correct = num(modeVal);
      const { choices, answer } = buildChoices(rng, correct, [
        num(x),
        num(y),
        num(z),
        num(modeVal + 1),
        num(modeVal - 1),
      ]);
      return {
        prompt: `A list of ages is ${list.join(', ')}. Which age is the mode?`,
        choices,
        answer,
        explain: `${modeVal} shows up 3 times, the most of any value, so the mode is ${correct}.`,
      };
    },
  },
  // --- Range ----------------------------------------------------------------
  {
    id: 'qt3-017',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'range of 4 numbers',
    generate: (rng) => {
      const list = distinctInts(rng, 4, 2, 25);
      const hi = Math.max(...list);
      const lo = Math.min(...list);
      const correct = num(hi - lo);
      const { choices, answer } = buildChoices(rng, correct, [
        num(hi + lo),
        num(hi),
        num(hi - lo + 1),
        num(hi - lo - 1),
        num(lo),
      ]);
      return {
        prompt: `What is the range of ${list.join(', ')}?`,
        choices,
        answer,
        explain: `Range is largest minus smallest: ${hi} - ${lo} = ${correct}.`,
      };
    },
  },
  {
    id: 'qt3-018',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'range of 5 numbers (word problem)',
    generate: (rng) => {
      const list = distinctInts(rng, 5, 1, 30);
      const hi = Math.max(...list);
      const lo = Math.min(...list);
      const correct = num(hi - lo);
      const { choices, answer } = buildChoices(rng, correct, [
        num(hi + lo),
        num(hi),
        num(hi - lo + 1),
        num(hi - lo - 1),
        num(lo),
      ]);
      return {
        prompt: `Daily high temperatures were ${list.join(', ')} degrees. What is the range?`,
        choices,
        answer,
        explain: `The highest is ${hi} and the lowest is ${lo}. Range = ${hi} - ${lo} = ${correct}.`,
      };
    },
  },
  {
    id: 'qt3-019',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 3,
    topic: 'find the largest value from range and smallest',
    generate: (rng) => {
      const lo = randInt(rng, 2, 12);
      const range = randInt(rng, 4, 15);
      const hi = lo + range;
      const correct = num(hi);
      const { choices, answer } = buildChoices(rng, correct, [
        num(range),
        num(lo + range + 1),
        num(range - lo),
        num(hi - 1),
        num(lo),
      ]);
      return {
        prompt: `A set of numbers has a range of ${range}. The smallest number is ${lo}. What is the largest number?`,
        choices,
        answer,
        explain: `Largest = smallest + range: ${lo} + ${range} = ${correct}.`,
      };
    },
  },
  // --- Probability (single event) ------------------------------------------
  {
    id: 'qt3-020',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'probability as x out of y',
    generate: (rng) => {
      const fav = randInt(rng, 2, 5);
      const other = randInt(rng, 2, 5);
      const total = fav + other;
      const color = pick(rng, COLORS);
      const correct = `${fav} out of ${total}`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${other} out of ${total}`,
        `${fav + 1} out of ${total}`,
        `${fav - 1} out of ${total}`,
        `${total} out of ${total}`,
        `1 out of ${total}`,
      ]);
      return {
        prompt: `A bag has ${fav} ${color} marbles and ${other} other marbles. What is the chance of drawing a ${color} marble?`,
        choices,
        answer,
        explain: `There are ${fav} ${color} out of ${total} marbles in all, so the chance is ${correct}.`,
      };
    },
  },
  {
    id: 'qt3-021',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'probability as a reduced fraction',
    generate: (rng) => {
      // total is prime so favorable/total is already in lowest terms
      const total = pick(rng, [5, 7, 11]);
      const fav = randInt(rng, 2, total - 2);
      const other = total - fav;
      const color = pick(rng, COLORS);
      const correct = frac(fav, total);
      const { choices, answer } = buildChoices(rng, correct, [
        frac(other, total),
        frac(fav + 1, total),
        frac(fav - 1, total),
        frac(fav, other),
        frac(total, total),
      ]);
      return {
        prompt: `A spinner has ${total} equal sections: ${fav} are ${color}. What is the probability of landing on ${color}? Give a fraction.`,
        choices,
        answer,
        explain: `${fav} of the ${total} equal sections are ${color}, so the probability is ${correct}.`,
      };
    },
  },
  {
    id: 'qt3-022',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 3,
    topic: 'probability of NOT the event',
    generate: (rng) => {
      const fav = randInt(rng, 2, 5);
      const other = randInt(rng, 3, 6);
      const total = fav + other;
      const color = pick(rng, COLORS);
      const correct = `${other} out of ${total}`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${fav} out of ${total}`,
        `${other + 1} out of ${total}`,
        `${other - 1} out of ${total}`,
        `${total} out of ${total}`,
        `1 out of ${total}`,
      ]);
      return {
        prompt: `A jar has ${fav} ${color} beads and ${other} white beads. What is the chance of drawing a bead that is NOT ${color}?`,
        choices,
        answer,
        explain: `The beads that are not ${color} number ${other}, out of ${total} total: ${correct}.`,
      };
    },
  },
  {
    id: 'qt3-023',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'which color is more likely',
    generate: (rng) => {
      const a = randInt(rng, 2, 9);
      let b = randInt(rng, 2, 9);
      if (b === a) b = a + 1;
      const [c1, c2] = shuffle(rng, COLORS).slice(0, 2);
      const moreColor = a > b ? c1 : c2;
      const lessColor = a > b ? c2 : c1;
      const correct = moreColor;
      const { choices, answer } = buildChoices(rng, correct, [
        lessColor,
        'Equally likely',
        'Neither color',
        'Cannot tell',
      ]);
      return {
        prompt: `A bag has ${a} ${c1} cubes and ${b} ${c2} cubes. Which color are you MORE likely to draw?`,
        choices,
        answer,
        explain: `${moreColor} has more cubes (${Math.max(a, b)} vs ${Math.min(a, b)}), so ${moreColor} is more likely.`,
      };
    },
  },
  {
    id: 'qt3-024',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'certain / likely / unlikely / impossible',
    generate: (rng) => {
      const scenario = pick(rng, ['certain', 'impossible', 'likely', 'unlikely'] as const);
      const total = randInt(rng, 6, 10);
      let fav: number;
      let correct: string;
      if (scenario === 'certain') {
        fav = total;
        correct = 'Certain';
      } else if (scenario === 'impossible') {
        fav = 0;
        correct = 'Impossible';
      } else if (scenario === 'likely') {
        fav = randInt(rng, Math.floor(total / 2) + 1, total - 1);
        correct = 'Likely';
      } else {
        fav = randInt(rng, 1, Math.floor(total / 2) - 1);
        correct = 'Unlikely';
      }
      const color = pick(rng, COLORS);
      const { choices, answer } = buildChoices(rng, correct, [
        'Certain',
        'Impossible',
        'Likely',
        'Unlikely',
      ]);
      return {
        prompt: `A bag holds ${total} marbles, and ${fav} of them are ${color}. Drawing a ${color} marble is:`,
        choices,
        answer,
        explain: `${fav} out of ${total} are ${color}, so drawing ${color} is ${correct.toLowerCase()}.`,
      };
    },
  },
  {
    id: 'qt3-025',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'number cube probability',
    generate: (rng) => {
      // favorable = count of faces meeting a condition on a 1-6 cube
      const cond = pick(rng, ['even', 'odd', 'greater than 4', 'less than 3'] as const);
      let fav: number;
      let desc: string;
      if (cond === 'even') {
        fav = 3;
        desc = 'an even number';
      } else if (cond === 'odd') {
        fav = 3;
        desc = 'an odd number';
      } else if (cond === 'greater than 4') {
        fav = 2;
        desc = 'a number greater than 4';
      } else {
        fav = 2;
        desc = 'a number less than 3';
      }
      const correct = `${fav} out of 6`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${6 - fav} out of 6`,
        `${fav + 1} out of 6`,
        `${fav + 2} out of 6`,
        `1 out of 6`,
        `6 out of 6`,
      ]);
      return {
        prompt: `You roll a fair number cube (faces 1 to 6). What is the chance of rolling ${desc}?`,
        choices,
        answer,
        explain: `${fav} of the 6 faces give ${desc}, so the chance is ${correct}.`,
      };
    },
  },
  // --- Estimation / rounding ------------------------------------------------
  {
    id: 'qt3-026',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'round to the nearest 10',
    generate: (rng) => {
      let n = randInt(rng, 12, 88);
      if (n % 10 === 5) n += 1; // avoid the ambiguous halfway point
      const down = Math.floor(n / 10) * 10;
      const up = down + 10;
      const correct = num(n - down < up - n ? down : up);
      const other = correct === num(down) ? up : down;
      const { choices, answer } = buildChoices(rng, correct, [
        num(other),
        num(down - 10),
        num(up + 10),
        num(n),
        num(other + 10),
      ]);
      return {
        prompt: `Round ${n} to the nearest 10.`,
        choices,
        answer,
        explain: `${n} is between ${down} and ${up}; it is closer to ${correct}.`,
      };
    },
  },
  {
    id: 'qt3-027',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'round to the nearest 100',
    generate: (rng) => {
      let n = randInt(rng, 120, 880);
      if (n % 100 === 50) n += 1;
      const down = Math.floor(n / 100) * 100;
      const up = down + 100;
      const correct = num(n - down < up - n ? down : up);
      const other = correct === num(down) ? up : down;
      const { choices, answer } = buildChoices(rng, correct, [
        num(other),
        num(down - 100),
        num(up + 100),
        num(Math.round(n / 10) * 10),
        num(other + 100),
      ]);
      return {
        prompt: `Round ${n} to the nearest 100.`,
        choices,
        answer,
        explain: `${n} is between ${down} and ${up}; it is closer to ${correct}.`,
      };
    },
  },
  {
    id: 'qt3-028',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'estimate a sum by rounding to 10',
    generate: (rng) => {
      const ra = randInt(rng, 2, 7) * 10;
      const rb = randInt(rng, 2, 7) * 10;
      const a = ra + randInt(rng, 1, 4);
      const b = rb + randInt(rng, 1, 4);
      const correct = num(ra + rb);
      const { choices, answer } = buildChoices(rng, correct, [
        num(a + b),
        num(ra + rb + 10),
        num(ra + rb - 10),
        num(ra + rb + 20),
        num(ra + rb - 20),
      ]);
      return {
        prompt: `Estimate ${a} + ${b} by first rounding each number to the nearest 10. About how much is it?`,
        choices,
        answer,
        explain: `${a} rounds to ${ra} and ${b} rounds to ${rb}: ${ra} + ${rb} = ${correct}.`,
      };
    },
  },
  {
    id: 'qt3-029',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'estimate a difference by rounding to 10',
    generate: (rng) => {
      const ra = randInt(rng, 6, 9) * 10;
      const rb = randInt(rng, 2, 5) * 10;
      const a = ra + randInt(rng, 1, 4);
      const b = rb + randInt(rng, 1, 4);
      const correct = num(ra - rb);
      const { choices, answer } = buildChoices(rng, correct, [
        num(a - b),
        num(ra - rb + 10),
        num(ra - rb - 10),
        num(ra + rb),
        num(ra - rb + 20),
      ]);
      return {
        prompt: `Estimate ${a} - ${b} by rounding each number to the nearest 10. About how much is it?`,
        choices,
        answer,
        explain: `${a} rounds to ${ra} and ${b} rounds to ${rb}: ${ra} - ${rb} = ${correct}.`,
      };
    },
  },
  {
    id: 'qt3-030',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 3,
    topic: 'estimate a product by rounding to 10',
    generate: (rng) => {
      const ra = randInt(rng, 2, 5) * 10;
      const b = randInt(rng, 3, 8);
      const a = ra + randInt(rng, 1, 4);
      const correct = num(ra * b);
      const { choices, answer } = buildChoices(rng, correct, [
        num(a * b),
        num(ra * b + 10),
        num(ra * b - 10),
        num(ra + b),
        num((ra + 10) * b),
      ]);
      return {
        prompt: `Estimate ${a} x ${b} by rounding ${a} to the nearest 10. About how much is it?`,
        choices,
        answer,
        explain: `${a} rounds to ${ra}, then ${ra} x ${b} = ${correct}.`,
      };
    },
  },
  {
    id: 'qt3-031',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'closest ten to a total',
    generate: (rng) => {
      const each = randInt(rng, 6, 12);
      const count = randInt(rng, 3, 6);
      const total = each * count;
      const nearest = Math.round(total / 10) * 10;
      const correct = num(nearest);
      const { choices, answer } = buildChoices(rng, correct, [
        num(total),
        num(nearest + 10),
        num(nearest - 10),
        num(each + count),
        num(nearest + 20),
      ]);
      return {
        prompt: `A box holds ${each} crayons. About how many crayons are in ${count} boxes, to the nearest 10?`,
        choices,
        answer,
        explain: `${each} x ${count} = ${total}, which rounds to ${correct} at the nearest 10.`,
      };
    },
  },
  // --- Coordinate geometry --------------------------------------------------
  {
    id: 'qt3-032',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'read the x-coordinate of a point',
    generate: (rng) => {
      const x = randInt(rng, 1, 9);
      let y = randInt(rng, 1, 9);
      if (y === x) y = x + 1;
      const label = pick(rng, ['P', 'Q', 'R', 'A', 'B']);
      const correct = num(x);
      const { choices, answer } = buildChoices(rng, correct, [
        num(y),
        num(x + y),
        num(x + 1),
        num(x - 1),
        num(x + y + 1),
        num(x + y + 2),
      ]);
      return {
        prompt: `Point ${label} is at (${x}, ${y}) on a grid. What is its x-coordinate?`,
        choices,
        answer,
        explain: `The x-coordinate is the first number in (${x}, ${y}), which is ${correct}.`,
      };
    },
  },
  {
    id: 'qt3-033',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'read the y-coordinate of a point',
    generate: (rng) => {
      const x = randInt(rng, 1, 9);
      let y = randInt(rng, 1, 9);
      if (y === x) y = x + 1;
      const label = pick(rng, ['P', 'Q', 'R', 'A', 'B']);
      const correct = num(y);
      const { choices, answer } = buildChoices(rng, correct, [
        num(x),
        num(x + y),
        num(y + 1),
        num(y - 1),
        num(x + y + 1),
        num(x + y + 2),
      ]);
      return {
        prompt: `Point ${label} is at (${x}, ${y}) on a grid. What is its y-coordinate?`,
        choices,
        answer,
        explain: `The y-coordinate is the second number in (${x}, ${y}), which is ${correct}.`,
      };
    },
  },
  {
    id: 'qt3-034',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'coordinates from right/up moves',
    generate: (rng) => {
      const x = randInt(rng, 2, 8);
      let y = randInt(rng, 2, 8);
      if (y === x) y = x + 1;
      const correct = `(${x}, ${y})`;
      const { choices, answer } = buildChoices(rng, correct, [
        `(${y}, ${x})`,
        `(${x}, ${y + 1})`,
        `(${x + 1}, ${y})`,
        `(${x - 1}, ${y})`,
        `(${x}, ${y - 1})`,
      ]);
      return {
        prompt: `Start at the corner (0, 0), move ${x} units right, then ${y} units up. What are the coordinates?`,
        choices,
        answer,
        explain: `Right sets the x to ${x} and up sets the y to ${y}, giving ${correct}.`,
      };
    },
  },
  {
    id: 'qt3-035',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'horizontal distance between two points',
    generate: (rng) => {
      const y = randInt(rng, 1, 8);
      const x1 = randInt(rng, 0, 4);
      const x2 = x1 + randInt(rng, 3, 8);
      const correct = num(x2 - x1);
      const { choices, answer } = buildChoices(rng, correct, [
        num(x2 + x1),
        num(x2),
        num(x2 - x1 + 1),
        num(x2 - x1 - 1),
        num(x2 - x1 + 2),
        num(y),
      ]);
      return {
        prompt: `Point A is at (${x1}, ${y}) and point B is at (${x2}, ${y}). How many units apart are they?`,
        choices,
        answer,
        explain: `They share the same y, so count along the x-axis: ${x2} - ${x1} = ${correct}.`,
      };
    },
  },
  {
    id: 'qt3-036',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'vertical distance between two points',
    generate: (rng) => {
      const x = randInt(rng, 1, 8);
      const y1 = randInt(rng, 0, 4);
      const y2 = y1 + randInt(rng, 3, 8);
      const correct = num(y2 - y1);
      const { choices, answer } = buildChoices(rng, correct, [
        num(y2 + y1),
        num(y2),
        num(y2 - y1 + 1),
        num(y2 - y1 - 1),
        num(y2 - y1 + 2),
        num(x),
      ]);
      return {
        prompt: `Point A is at (${x}, ${y1}) and point B is at (${x}, ${y2}). How many units apart are they?`,
        choices,
        answer,
        explain: `They share the same x, so count along the y-axis: ${y2} - ${y1} = ${correct}.`,
      };
    },
  },
  {
    id: 'qt3-037',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'which point is on the x-axis',
    generate: (rng) => {
      const labels = shuffle(rng, ['W', 'X', 'Y', 'Z']);
      const ax = randInt(rng, 1, 9);
      const xs = distinctInts(rng, 3, 1, 9);
      const ys = distinctInts(rng, 3, 1, 9); // all nonzero, so only the answer sits on the axis
      const pts = [
        `(${ax}, 0)`,
        `(${xs[0]}, ${ys[0]})`,
        `(${xs[1]}, ${ys[1]})`,
        `(${xs[2]}, ${ys[2]})`,
      ];
      const correct = labels[0];
      const { choices, answer } = buildChoices(rng, correct, [labels[1], labels[2], labels[3]]);
      return {
        prompt: `On a grid, ${labels[0]} is at ${pts[0]}, ${labels[1]} is at ${pts[1]}, ${labels[2]} is at ${pts[2]}, and ${labels[3]} is at ${pts[3]}. Which point lies ON the x-axis?`,
        choices,
        answer,
        explain: `A point on the x-axis has a y-coordinate of 0. Only ${correct} at ${pts[0]} does, so ${correct}.`,
      };
    },
  },
  {
    id: 'qt3-038',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'new x-coordinate after moving right',
    generate: (rng) => {
      const x = randInt(rng, 1, 7);
      const y = randInt(rng, 1, 9);
      const move = randInt(rng, 2, 6);
      const correct = num(x + move);
      const { choices, answer } = buildChoices(rng, correct, [
        num(x),
        num(move),
        num(y + move),
        num(x + move + 1),
        num(x + move - 1),
      ]);
      return {
        prompt: `A point at (${x}, ${y}) slides ${move} units to the right. What is its new x-coordinate?`,
        choices,
        answer,
        explain: `Moving right adds to the x: ${x} + ${move} = ${correct}.`,
      };
    },
  },
  {
    id: 'qt3-039',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 3,
    topic: 'perimeter of an axis-aligned rectangle from corners',
    generate: (rng) => {
      const x1 = randInt(rng, 0, 3);
      const y1 = randInt(rng, 0, 3);
      const w = randInt(rng, 2, 6);
      const h = randInt(rng, 2, 6);
      const x2 = x1 + w;
      const y2 = y1 + h;
      const correct = num(2 * (w + h));
      const { choices, answer } = buildChoices(rng, correct, [
        num(w * h),
        num(w + h),
        num(2 * w + h),
        num(2 * (w + h) + 2),
        num(2 * (w + h) - 2),
      ]);
      return {
        prompt: `A rectangle has corners (${x1}, ${y1}) and (${x2}, ${y2}), with sides along the grid lines. What is its perimeter?`,
        choices,
        answer,
        explain: `The sides are ${w} wide and ${h} tall. Perimeter = 2 x (${w} + ${h}) = ${correct}.`,
      };
    },
  },
  {
    id: 'qt3-040',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 3,
    topic: 'total distance along an L-shaped path',
    generate: (rng) => {
      const y1 = randInt(rng, 1, 6);
      const x1 = randInt(rng, 0, 3);
      const x2 = x1 + randInt(rng, 2, 6);
      const y2 = y1 + randInt(rng, 2, 6);
      const leg1 = x2 - x1;
      const leg2 = y2 - y1;
      const correct = num(leg1 + leg2);
      const { choices, answer } = buildChoices(rng, correct, [
        num(leg1),
        num(leg2),
        num(leg1 * leg2),
        num(leg1 + leg2 + 1),
        num(leg1 + leg2 - 1),
      ]);
      return {
        prompt: `A bug walks from (${x1}, ${y1}) right to (${x2}, ${y1}), then up to (${x2}, ${y2}), moving only along grid lines. How many units does it walk in all?`,
        choices,
        answer,
        explain: `The right leg is ${leg1} units and the up leg is ${leg2} units: ${leg1} + ${leg2} = ${correct}.`,
      };
    },
  },
  // --- More data analysis ---------------------------------------------------
  {
    id: 'qt3-041',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'pictograph: total across two rows',
    generate: (rng) => {
      const k = randInt(rng, 2, 4);
      const sa = randInt(rng, 2, 5);
      const sb = randInt(rng, 2, 5);
      const sym = pick(rng, SYMBOLS);
      const item = pick(rng, SPORTS);
      const correct = num((sa + sb) * k);
      const { choices, answer } = buildChoices(rng, correct, [
        num(sa + sb),
        num(sa * k),
        num((sa + sb) * k + k),
        num((sa + sb) * k - k),
        num(sa * sb * k),
      ]);
      return {
        prompt: `Each ${sym} stands for ${k} votes for ${item}. Grade 4 has ${sa} ${sym} and grade 5 has ${sb} ${sym}. How many votes in all?`,
        choices,
        answer,
        explain: `Together that is ${sa} + ${sb} = ${sa + sb} pictures, each worth ${k}: ${sa + sb} x ${k} = ${correct}.`,
      };
    },
  },
  {
    id: 'qt3-042',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'bar graph: value of the shortest bar',
    generate: (rng) => {
      const cats = shuffle(rng, PETS).slice(0, 4);
      const vals = distinctInts(rng, 4, 2, 18);
      const minVal = Math.min(...vals);
      const minCat = cats[vals.indexOf(minVal)];
      const correct = minCat;
      const others = cats.filter((c) => c !== minCat);
      const { choices, answer } = buildChoices(rng, correct, [
        others[0],
        others[1],
        others[2],
        'They are equal',
      ]);
      return {
        prompt: `A bar graph shows pets owned: ${cats[0]} ${vals[0]}, ${cats[1]} ${vals[1]}, ${cats[2]} ${vals[2]}, ${cats[3]} ${vals[3]}. Which had the FEWEST?`,
        choices,
        answer,
        explain: `The smallest bar is ${minVal}, which belongs to ${correct}.`,
      };
    },
  },
  {
    id: 'qt3-043',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'mean from a small data table',
    generate: (rng) => {
      const mean = randInt(rng, 4, 9);
      const a = randInt(rng, 1, 3);
      const list = shuffle(rng, [mean - a, mean + a, mean]);
      const sum = list.reduce((p, q) => p + q, 0);
      const days = ['Monday', 'Tuesday', 'Wednesday'];
      const correct = num(sum / 3);
      const { choices, answer } = buildChoices(rng, correct, [
        num(sum),
        num(sum / 3 + 1),
        num(sum / 3 - 1),
        num(Math.max(...list)),
        num(Math.round(sum / 2)),
      ]);
      return {
        prompt: `A chart shows glasses of water: ${days[0]} ${list[0]}, ${days[1]} ${list[1]}, ${days[2]} ${list[2]}. What was the average per day?`,
        choices,
        answer,
        explain: `Add: ${list[0]} + ${list[1]} + ${list[2]} = ${sum}. Divide by 3: ${sum} / 3 = ${correct}.`,
      };
    },
  },
  {
    id: 'qt3-044',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'median as the middle score',
    generate: (rng) => {
      const list = distinctInts(rng, 3, 60, 99);
      const sorted = [...list].sort((p, q) => p - q);
      const name = pick(rng, KID_NAMES);
      const correct = num(sorted[1]);
      const { choices, answer } = buildChoices(rng, correct, [
        num(sorted[0]),
        num(sorted[2]),
        num(sorted[2] - sorted[0]),
        num(sorted[1] + 1),
        num(sorted[1] - 1),
      ]);
      return {
        prompt: `${name} scored ${list[0]}, ${list[1]}, and ${list[2]} on three quizzes. What is the median score?`,
        choices,
        answer,
        explain: `In order: ${sorted[0]}, ${sorted[1]}, ${sorted[2]}. The middle score is ${correct}.`,
      };
    },
  },
  {
    id: 'qt3-045',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'range from a data table',
    generate: (rng) => {
      const list = distinctInts(rng, 4, 40, 95);
      const hi = Math.max(...list);
      const lo = Math.min(...list);
      const correct = num(hi - lo);
      const { choices, answer } = buildChoices(rng, correct, [
        num(hi),
        num(lo),
        num(hi - lo + 1),
        num(hi - lo - 1),
        num(hi + lo),
      ]);
      return {
        prompt: `Test scores were ${list.join(', ')}. What is the range of the scores?`,
        choices,
        answer,
        explain: `Highest ${hi} minus lowest ${lo}: ${hi} - ${lo} = ${correct}.`,
      };
    },
  },
  {
    id: 'qt3-046',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'probability of a certain event',
    generate: (rng) => {
      const total = randInt(rng, 4, 8);
      const color = pick(rng, COLORS);
      const correct = `${total} out of ${total}`;
      const { choices, answer } = buildChoices(rng, correct, [
        `0 out of ${total}`,
        `1 out of ${total}`,
        `${total - 1} out of ${total}`,
        `2 out of ${total}`,
        `${total - 2} out of ${total}`,
      ]);
      return {
        prompt: `A bag has ${total} marbles and ALL of them are ${color}. What is the chance of drawing a ${color} marble?`,
        choices,
        answer,
        explain: `Every one of the ${total} marbles is ${color}, so the chance is ${correct} (certain).`,
      };
    },
  },
  {
    id: 'qt3-047',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 3,
    topic: 'find the missing value given the range',
    generate: (rng) => {
      const lo = randInt(rng, 2, 8);
      const range = randInt(rng, 6, 14);
      const hi = lo + range;
      const mid = randInt(rng, lo + 1, hi - 1);
      const correct = num(hi);
      const { choices, answer } = buildChoices(rng, correct, [
        num(range),
        num(lo + range + 1),
        num(hi - 1),
        num(mid + range),
        num(lo),
      ]);
      return {
        prompt: `In a set of numbers the smallest is ${lo} and the range is ${range}. One number is ${mid}. What is the largest number?`,
        choices,
        answer,
        explain: `Largest = smallest + range: ${lo} + ${range} = ${correct}.`,
      };
    },
  },
  {
    id: 'qt3-048',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 3,
    topic: 'mean of five numbers',
    generate: (rng) => {
      const mean = randInt(rng, 6, 12);
      const a = randInt(rng, 1, 3);
      const b = randInt(rng, 1, 3);
      const list = shuffle(rng, [mean - a, mean + a, mean - b, mean + b, mean]);
      const sum = list.reduce((p, q) => p + q, 0);
      const correct = num(sum / 5);
      const { choices, answer } = buildChoices(rng, correct, [
        num(sum),
        num(sum / 5 + 1),
        num(sum / 5 - 1),
        num(Math.round(sum / 4)),
        num(Math.max(...list)),
      ]);
      return {
        prompt: `Find the average (mean) of ${list.join(', ')}.`,
        choices,
        answer,
        explain: `Add all five: ${list.join(' + ')} = ${sum}. Divide by 5: ${sum} / 5 = ${correct}.`,
      };
    },
  },
];
