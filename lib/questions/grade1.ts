import {
  buildChoices,
  num,
  pick,
  randInt,
  type QuestionTemplate,
  type Rng,
} from './templates';

/**
 * First-grade question bank for a child ENTERING first grade (about age 6)
 * who does NOT read well yet.
 *
 * The app reads every prompt and every choice out loud (text-to-speech) for
 * this profile, and shows any picture-marks on screen. The child answers by
 * LISTENING, not by reading. That changes the design rules versus every
 * other grade band in this folder:
 *
 *   - Prompts are natural spoken sentences - no bare "+ - =" symbol soup.
 *     Addition says "plus", subtraction says "minus" or "take away".
 *   - Choices are SHORT (a number, a short word, a shape/color name, or a
 *     clock time like "3:00") so they read quickly aloud and stay
 *     distinguishable by ear from each other.
 *   - Counting questions put repeated marks (e.g. "* * *") directly in the
 *     prompt so they can be looked at on screen, the same convention the
 *     kindergarten bank (gradeK.ts) already uses.
 *   - Nothing requires the child to decode written text to find the answer -
 *     letter/word tasks are rhyming and beginning/ending SOUND matches,
 *     which work fine when read aloud, never sight-reading or spelling.
 *
 * Scope is a deliberate mix of what a kindergartner already knows and the
 * very start of first grade: counting and skip counting by 1s/2s/5s/10s to
 * about 30, number before/after/between, comparing small numbers by ear,
 * addition and subtraction within 10 (a few up to 20), a first taste of tens
 * and ones, naming shapes and their sides/corners, telling time to the hour,
 * counting a few coins to a small value, and rhyming / beginning-and-ending
 * sounds. Difficulty is mostly 1-2, with a couple of 3s for the hardest
 * (missing-addend and "how many more") items.
 */

const NAMES = ['Mia', 'Sam', 'Leo', 'Ana', 'Ben', 'Zoe', 'Max', 'Ivy', 'Noah', 'Ella'] as const;

/** k distinct items drawn from pool, in random order. */
function sample<T>(rng: Rng, pool: readonly T[], k: number): T[] {
  const copy = pool.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, k);
}

/** h in 1..12, delta any integer, wraps like a real clock (never lands on 0). */
function hourAdd(h: number, delta: number): number {
  const m = (((h - 1 + delta) % 12) + 12) % 12;
  return m + 1;
}

/** "1 dime" vs "2 dimes". */
function coinPhrase(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** ["a"] -> "a"; ["a","b"] -> "a and b"; ["a","b","c"] -> "a, b, and c". */
function joinList(items: string[]): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/** "* * * *" - n copies of mark, space separated, for things a kid can count on screen. */
function repeatMark(mark: string, n: number): string {
  return Array.from({ length: n }, () => mark).join(' ');
}

const COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'] as const;
const SHAPES = ['circle', 'square', 'triangle', 'star'] as const;

const RHYME_FAMILIES = [
  { base: 'cat', rhymes: ['hat', 'bat', 'mat', 'rat'] },
  { base: 'dog', rhymes: ['log', 'fog', 'hog', 'jog'] },
  { base: 'sun', rhymes: ['fun', 'run', 'bun'] },
  { base: 'pen', rhymes: ['hen', 'ten', 'men'] },
  { base: 'box', rhymes: ['fox', 'socks', 'locks'] },
  { base: 'bed', rhymes: ['red', 'fed', 'led'] },
] as const;

/** Words grouped by beginning SOUND (not just spelling) for by-ear matching. */
const BEGIN_SOUND_GROUPS = [
  { words: ['sun', 'sock', 'soap', 'seed'] },
  { words: ['cat', 'cup', 'cap', 'coat'] },
  { words: ['dog', 'duck', 'doll', 'desk'] },
  { words: ['fish', 'fox', 'fan', 'frog'] },
  { words: ['ball', 'bed', 'bug', 'bike'] },
  { words: ['hat', 'hen', 'house', 'horse'] },
  { words: ['mop', 'map', 'mud', 'moon'] },
  { words: ['pig', 'pen', 'pot', 'pan'] },
  { words: ['rat', 'run', 'rock', 'rain'] },
  { words: ['top', 'ten', 'toy', 'tent'] },
] as const;

/** Words grouped by ending SOUND only (final consonant), not by full rhyme. */
const END_SOUND_GROUPS = [
  { words: ['cup', 'top', 'hop', 'mop', 'lip'] },
  { words: ['dog', 'bag', 'leg', 'pig'] },
  { words: ['sun', 'pen', 'ten', 'fan'] },
  { words: ['cat', 'hat', 'boat', 'foot'] },
  { words: ['ham', 'gum', 'swim'] },
  { words: ['bus', 'dress', 'kiss'] },
] as const;

export const GRADE_1_TEMPLATES: QuestionTemplate[] = [
  // --- Counting with marks shown on screen ----------------------------------
  {
    id: 'g1-001',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'count a small group of marks',
    generate: (rng) => {
      const n = randInt(rng, 3, 10);
      const marks = repeatMark('*', n);
      const correct = num(n);
      const { choices, answer } = buildChoices(rng, correct, [
        num(n - 1),
        num(n + 1),
        num(n + 2),
        num(n - 2),
      ]);
      return {
        prompt: `Look at the stars: ${marks} How many stars are there?`,
        choices,
        answer,
        explain: `Counting one at a time, ${marks} is ${n} stars.`,
      };
    },
  },
  {
    id: 'g1-002',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'count a bigger group of marks',
    generate: (rng) => {
      const n = randInt(rng, 11, 20);
      const marks = repeatMark('*', n);
      const correct = num(n);
      const { choices, answer } = buildChoices(rng, correct, [
        num(n - 1),
        num(n + 1),
        num(n - 2),
        num(n + 2),
      ]);
      return {
        prompt: `Look at the dots: ${marks} How many dots are there?`,
        choices,
        answer,
        explain: `Counting one at a time, ${marks} is ${n} dots.`,
      };
    },
  },

  // --- Addition & subtraction within 10, a few to 20 ------------------------
  {
    id: 'g1-003',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'addition within 10',
    generate: (rng) => {
      const a = randInt(rng, 1, 8);
      const b = randInt(rng, 1, 10 - a);
      const total = a + b;
      const correct = num(total);
      const { choices, answer } = buildChoices(rng, correct, [
        num(total + 1),
        num(total - 1),
        num(Math.abs(a - b)), // subtracted instead of adding
        num(total + 2),
      ]);
      return {
        prompt: `What is ${a} plus ${b}?`,
        choices,
        answer,
        explain: `Start at ${a} and count up ${b} more: ${a} and ${b} make ${total}.`,
      };
    },
  },
  {
    id: 'g1-004',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'addition within 20',
    generate: (rng) => {
      const a = randInt(rng, 6, 14);
      const b = randInt(rng, 1, 20 - a);
      const total = a + b;
      const correct = num(total);
      const { choices, answer } = buildChoices(rng, correct, [
        num(total + 1),
        num(total - 1),
        num(Math.abs(a - b)), // subtracted instead of adding
        num(total + 10),
      ]);
      return {
        prompt: `What is ${a} plus ${b}?`,
        choices,
        answer,
        explain: `Start at ${a} and count up ${b} more: ${a} and ${b} make ${total}.`,
      };
    },
  },
  {
    id: 'g1-005',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'add three small numbers',
    generate: (rng) => {
      const a = randInt(rng, 1, 4);
      const b = randInt(rng, 1, 4);
      const c = randInt(rng, 1, 4);
      const total = a + b + c;
      const correct = num(total);
      const { choices, answer } = buildChoices(rng, correct, [
        num(total + 1),
        num(total - 1),
        num(a + b), // forgot to add the third number
        num(total + 2),
      ]);
      return {
        prompt: `What is ${a} plus ${b} plus ${c}?`,
        choices,
        answer,
        explain: `${a} and ${b} make ${a + b}, then ${a + b} and ${c} make ${total}.`,
      };
    },
  },
  {
    id: 'g1-006',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'subtraction within 10',
    generate: (rng) => {
      const a = randInt(rng, 2, 10);
      const b = randInt(rng, 1, a - 1);
      const diff = a - b;
      const correct = num(diff);
      const { choices, answer } = buildChoices(rng, correct, [
        num(diff + 1),
        num(Math.max(0, diff - 1)),
        num(a + b), // added instead of subtracting
        num(a), // forgot to take any away
      ]);
      return {
        prompt: `What is ${a} minus ${b}?`,
        choices,
        answer,
        explain: `Start at ${a} and count back ${b}: ${a} take away ${b} leaves ${diff}.`,
      };
    },
  },
  {
    id: 'g1-007',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'subtraction within 20',
    generate: (rng) => {
      const a = randInt(rng, 11, 20);
      const b = randInt(rng, 1, a - 1);
      const diff = a - b;
      const correct = num(diff);
      const { choices, answer } = buildChoices(rng, correct, [
        num(diff + 1),
        num(Math.max(0, diff - 1)),
        num(a + b), // added instead of subtracting
        num(a), // forgot to take any away
      ]);
      return {
        prompt: `What is ${a} minus ${b}?`,
        choices,
        answer,
        explain: `Start at ${a} and count back ${b}: ${a} take away ${b} leaves ${diff}.`,
      };
    },
  },
  {
    id: 'g1-008',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 3,
    topic: 'missing addend within a small total',
    generate: (rng) => {
      const target = randInt(rng, 5, 12);
      const a = randInt(rng, 1, target - 1);
      const missing = target - a;
      const correct = num(missing);
      const { choices, answer } = buildChoices(rng, correct, [
        num(a), // gave back the known number instead of the missing one
        num(target), // gave the total instead of the missing part
        num(missing + 1),
        num(Math.max(0, missing - 1)),
      ]);
      return {
        prompt: `What number goes with ${a} to make ${target}?`,
        choices,
        answer,
        explain: `${a} and ${missing} together make ${target}, so the missing number is ${missing}.`,
      };
    },
  },
  {
    id: 'g1-009',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'addition word problem within 10',
    generate: (rng) => {
      const name = pick(rng, NAMES);
      const items = pick(rng, ['apples', 'stickers', 'crayons', 'marbles', 'balloons']);
      const a = randInt(rng, 2, 8);
      const b = randInt(rng, 1, 10 - a);
      const total = a + b;
      const correct = num(total);
      const { choices, answer } = buildChoices(rng, correct, [
        num(total + 1),
        num(total - 1),
        num(Math.abs(a - b)), // subtracted instead of adding
        num(a), // forgot the new ones
      ]);
      return {
        prompt: `${name} has ${a} ${items}. ${name} gets ${b} more ${items}. How many ${items} does ${name} have now?`,
        choices,
        answer,
        explain: `Start with ${a} and add ${b} more: ${a} and ${b} make ${total}.`,
      };
    },
  },
  {
    id: 'g1-010',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'subtraction word problem within 10',
    generate: (rng) => {
      const name = pick(rng, NAMES);
      const item = pick(rng, ['cookie', 'pencil', 'sticker', 'balloon', 'marble']);
      const start = randInt(rng, 5, 10);
      const given = randInt(rng, 1, start - 1);
      const left = start - given;
      const correct = num(left);
      const { choices, answer } = buildChoices(rng, correct, [
        num(left + 1),
        num(Math.max(0, left - 1)),
        num(start + given), // added instead of subtracting
        num(given), // gave the wrong amount back
      ]);
      return {
        prompt: `${name} had ${start} ${item}s. ${name} gave away ${given}. How many ${item}s does ${name} have left?`,
        choices,
        answer,
        explain: `Take away ${given} from ${start}: that leaves ${left}.`,
      };
    },
  },
  {
    id: 'g1-011',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 3,
    topic: 'comparison subtraction word problem',
    generate: (rng) => {
      const name1 = pick(rng, NAMES);
      const name2 = pick(rng, NAMES.filter((n) => n !== name1));
      const items = pick(rng, ['stickers', 'shells', 'rocks', 'cards']);
      const countA = randInt(rng, 5, 12);
      const countB = randInt(rng, 1, countA - 1);
      const diff = countA - countB;
      const correct = num(diff);
      const { choices, answer } = buildChoices(rng, correct, [
        num(countA + countB), // added instead of comparing
        num(diff + 1),
        num(Math.max(0, diff - 1)),
        num(countA), // gave the total instead of the difference
      ]);
      return {
        prompt: `${name1} has ${countA} ${items}. ${name2} has ${countB} ${items}. How many more ${items} does ${name1} have than ${name2}?`,
        choices,
        answer,
        explain: `${countA} take away ${countB} is ${diff}, so ${name1} has ${diff} more.`,
      };
    },
  },

  // --- Tens and ones ---------------------------------------------------------
  {
    id: 'g1-012',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'tens and ones to a number',
    generate: (rng) => {
      const tens = randInt(rng, 1, 3);
      const ones = randInt(rng, 0, 9);
      const value = tens * 10 + ones;
      const tensWord = coinPhrase(tens, 'ten', 'tens');
      const onesWord = coinPhrase(ones, 'one', 'ones');
      const correct = num(value);
      const { choices, answer } = buildChoices(rng, correct, [
        num(ones * 10 + tens), // flipped the tens and ones
        num(tens + ones), // added the digits instead of using place value
        num(tens * 10), // dropped the ones
        num(ones), // dropped the tens
        num(value + 10),
        num(Math.max(0, value - 10)),
      ]);
      return {
        prompt: `How many is ${tensWord} and ${onesWord}?`,
        choices,
        answer,
        explain: `${tensWord} is ${tens * 10}, and ${onesWord} more makes ${value}.`,
      };
    },
  },

  // --- Telling time to the hour -----------------------------------------------
  {
    id: 'g1-013',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'time - hours later',
    generate: (rng) => {
      const startHour = randInt(rng, 1, 12);
      const addHours = randInt(rng, 1, 2);
      const endHour = hourAdd(startHour, addHours);
      const correct = `${endHour}:00`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${hourAdd(startHour, addHours + 1)}:00`,
        `${hourAdd(startHour, addHours - 1)}:00`,
        `${startHour}:00`, // forgot to add the hours
        `${hourAdd(startHour, addHours + 2)}:00`,
        `${hourAdd(startHour, addHours + 3)}:00`,
      ]);
      return {
        prompt: `It is ${startHour} o'clock. What time is it ${addHours} hour${addHours === 1 ? '' : 's'} later?`,
        choices,
        answer,
        explain: `${addHours} hour${addHours === 1 ? '' : 's'} after ${startHour} o'clock is ${endHour} o'clock.`,
      };
    },
  },
  {
    id: 'g1-014',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'time - hours earlier',
    generate: (rng) => {
      const startHour = randInt(rng, 1, 12);
      const subHours = randInt(rng, 1, 2);
      const beforeHour = hourAdd(startHour, -subHours);
      const correct = `${beforeHour}:00`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${hourAdd(startHour, -subHours - 1)}:00`,
        `${hourAdd(startHour, -subHours + 1)}:00`,
        `${startHour}:00`, // forgot to go back at all
        `${hourAdd(startHour, -subHours - 2)}:00`,
        `${hourAdd(startHour, -subHours - 3)}:00`,
      ]);
      return {
        prompt: `It is ${startHour} o'clock now. What time was it ${subHours} hour${subHours === 1 ? '' : 's'} ago?`,
        choices,
        answer,
        explain: `${subHours} hour${subHours === 1 ? '' : 's'} before ${startHour} o'clock is ${beforeHour} o'clock.`,
      };
    },
  },

  // --- Money -------------------------------------------------------------
  {
    id: 'g1-015',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'count a few coins',
    generate: (rng) => {
      let dimes = randInt(rng, 0, 2);
      const nickels = randInt(rng, 0, 2);
      const pennies = randInt(rng, 0, 4);
      if (dimes + nickels + pennies === 0) dimes = 1;
      const total = dimes * 10 + nickels * 5 + pennies;
      const coinCount = dimes + nickels + pennies;
      const correct = num(total);
      const parts: string[] = [];
      if (dimes > 0) parts.push(coinPhrase(dimes, 'dime', 'dimes'));
      if (nickels > 0) parts.push(coinPhrase(nickels, 'nickel', 'nickels'));
      if (pennies > 0) parts.push(coinPhrase(pennies, 'penny', 'pennies'));
      const name = pick(rng, NAMES);
      const { choices, answer } = buildChoices(rng, correct, [
        num(total + 1),
        num(Math.max(0, total - 1)),
        num(coinCount), // counted coins instead of their value
        num(total + 5),
        num(total + 10),
      ]);
      return {
        prompt: `${name} has ${joinList(parts)}. How many cents does ${name} have in all?`,
        choices,
        answer,
        explain: `Adding up the value of each coin gives ${total} cents in all.`,
      };
    },
  },
  {
    id: 'g1-016',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'compare coin values',
    generate: (rng) => {
      const COIN_POOL = [
        { name: 'penny', value: 1 },
        { name: 'nickel', value: 5 },
        { name: 'dime', value: 10 },
        { name: 'quarter', value: 25 },
      ] as const;
      const [coinA, coinB] = sample(rng, COIN_POOL, 2);
      const askMore = rng() < 0.5;
      const aWins = askMore ? coinA.value > coinB.value : coinA.value < coinB.value;
      const winner = aWins ? coinA : coinB;
      const loser = aWins ? coinB : coinA;
      const remaining = COIN_POOL.filter((c) => c !== coinA && c !== coinB);
      const correct = winner.name;
      const { choices, answer } = buildChoices(rng, correct, [
        loser.name,
        ...remaining.map((c) => c.name),
      ]);
      return {
        prompt: `Which is worth ${askMore ? 'more' : 'less'}: a ${coinA.name} or a ${coinB.name}?`,
        choices,
        answer,
        explain: `A ${coinA.name} is worth ${coinA.value} cents and a ${coinB.name} is worth ${coinB.value} cents, so the ${winner.name} is worth ${askMore ? 'more' : 'less'}.`,
      };
    },
  },

  // --- Shapes ----------------------------------------------------------------
  {
    id: 'g1-017',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'sides and corners of a shape',
    generate: (rng) => {
      const shape = pick(rng, [
        { name: 'triangle', count: 3 },
        { name: 'square', count: 4 },
        { name: 'rectangle', count: 4 },
        { name: 'pentagon', count: 5 },
        { name: 'hexagon', count: 6 },
      ] as const);
      const attr = pick(rng, ['sides', 'corners'] as const);
      const correct = num(shape.count);
      const { choices, answer } = buildChoices(rng, correct, [
        num(shape.count + 1),
        num(Math.max(0, shape.count - 1)),
        num(shape.count + 2),
        num(Math.max(0, shape.count - 2)),
      ]);
      return {
        prompt: `How many ${attr} does a ${shape.name} have?`,
        choices,
        answer,
        explain: `A ${shape.name} has ${shape.count} ${attr}.`,
      };
    },
  },
  {
    id: 'g1-018',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'which shape has a given number of sides',
    generate: (rng) => {
      const canonical: Record<number, string> = { 3: 'triangle', 5: 'pentagon', 6: 'hexagon' };
      const targetSides = pick(rng, [3, 5, 6] as const);
      const correct = canonical[targetSides];
      const allNames = ['triangle', 'square', 'pentagon', 'hexagon'];
      const distractorNames = allNames.filter((n) => n !== correct);
      const { choices, answer } = buildChoices(rng, correct, distractorNames);
      return {
        prompt: `Which shape has ${targetSides} sides?`,
        choices,
        answer,
        explain: `A ${correct} has ${targetSides} sides.`,
      };
    },
  },
  {
    id: 'g1-019',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'shape riddle',
    generate: (rng) => {
      const riddles = [
        { desc: 'This shape is round and has no corners.', answer: 'circle' },
        { desc: 'This shape has exactly 3 sides.', answer: 'triangle' },
        { desc: 'This shape has 4 sides that are all the same length.', answer: 'square' },
        {
          desc: 'This shape has 4 sides, but they are not all the same length.',
          answer: 'rectangle',
        },
        { desc: 'This shape has 5 points sticking out.', answer: 'star' },
      ] as const;
      const riddle = pick(rng, riddles);
      const allShapes = ['circle', 'triangle', 'square', 'rectangle', 'star'];
      const { choices, answer } = buildChoices(
        rng,
        riddle.answer,
        allShapes.filter((s) => s !== riddle.answer),
      );
      return {
        prompt: `${riddle.desc} Which shape is it?`,
        choices,
        answer,
        explain: `A ${riddle.answer} matches that clue.`,
      };
    },
  },

  // --- Counting order, skip counting, and comparing --------------------------
  {
    id: 'g1-020',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'number that comes before',
    generate: (rng) => {
      const n = randInt(rng, 2, 30);
      const before = n - 1;
      const correct = num(before);
      const { choices, answer } = buildChoices(rng, correct, [
        num(n), // repeated the given number
        num(n + 1),
        num(Math.max(0, before - 1)),
      ]);
      return {
        prompt: `What number comes right before ${n}?`,
        choices,
        answer,
        explain: `Counting back one from ${n} gives ${before}.`,
      };
    },
  },
  {
    id: 'g1-021',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'number that comes after',
    generate: (rng) => {
      const n = randInt(rng, 1, 29);
      const after = n + 1;
      const correct = num(after);
      const { choices, answer } = buildChoices(rng, correct, [
        num(n), // repeated the given number
        num(Math.max(0, n - 1)),
        num(n + 2),
      ]);
      return {
        prompt: `What number comes right after ${n}?`,
        choices,
        answer,
        explain: `Counting up one from ${n} gives ${after}.`,
      };
    },
  },
  {
    id: 'g1-022',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'number that comes between',
    generate: (rng) => {
      const n = randInt(rng, 2, 29);
      const low = n - 1;
      const high = n + 1;
      const correct = num(n);
      const { choices, answer } = buildChoices(rng, correct, [
        num(low), // repeated the number before
        num(high), // repeated the number after
        num(n + 2),
        num(Math.max(0, n - 2)),
      ]);
      return {
        prompt: `Which number comes between ${low} and ${high}?`,
        choices,
        answer,
        explain: `${n} comes right between ${low} and ${high} when counting in order.`,
      };
    },
  },
  {
    id: 'g1-023',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'skip counting',
    generate: (rng) => {
      const step = pick(rng, [1, 2, 5, 10] as const);
      const cap = step === 10 ? 40 : 30;
      const maxMult = Math.floor((cap - 4 * step) / step);
      const startMult = randInt(rng, 0, Math.max(0, maxMult));
      const start = startMult * step;
      const terms = [0, 1, 2, 3].map((i) => start + i * step);
      const next = start + 4 * step;
      const stepLabel = step === 1 ? 'ones' : `${step}s`;
      const correct = num(next);
      // terms[0], terms[1], next+step, next+2*step are start, start+step,
      // start+5*step, start+6*step - pairwise distinct for any step >= 1, and
      // each differs from the correct answer (start+4*step) by a nonzero
      // multiple of step, so this holds for every step in {1,2,5,10}.
      const { choices, answer } = buildChoices(rng, correct, [
        num(terms[0]), // repeated the first number shown
        num(terms[1]), // repeated an earlier number shown
        num(next + step),
        num(next + 2 * step),
      ]);
      return {
        prompt: `Count by ${stepLabel}: ${terms.join(', ')}. What comes next?`,
        choices,
        answer,
        explain: `Each number is ${step} more than the last, so after ${terms[3]} comes ${next}.`,
      };
    },
  },
  {
    id: 'g1-024',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'which number is greater or less',
    generate: (rng) => {
      const pool = Array.from({ length: 20 }, (_, i) => i + 1);
      const [a, b] = sample(rng, pool, 2);
      const askMore = rng() < 0.5;
      const winner = askMore ? Math.max(a, b) : Math.min(a, b);
      const loser = winner === a ? b : a;
      const extras = sample(
        rng,
        pool.filter((v) => v !== a && v !== b),
        2,
      );
      const correct = num(winner);
      const { choices, answer } = buildChoices(rng, correct, [
        num(loser),
        num(extras[0]),
        num(extras[1]),
      ]);
      return {
        prompt: `Which number is ${askMore ? 'greater' : 'less'}: ${a} or ${b}?`,
        choices,
        answer,
        explain: `Comparing ${a} and ${b}, ${winner} is the ${askMore ? 'bigger' : 'smaller'} number.`,
      };
    },
  },
  {
    id: 'g1-025',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'greatest or least of small numbers',
    generate: (rng) => {
      const pool = Array.from({ length: 20 }, (_, i) => i + 1);
      const nums = sample(rng, pool, 4);
      const wantGreatest = rng() < 0.5;
      const sorted = nums.slice().sort((x, y) => x - y);
      const winner = wantGreatest ? sorted[3] : sorted[0];
      const correct = num(winner);
      const { choices, answer } = buildChoices(
        rng,
        correct,
        nums.filter((v) => v !== winner).map((v) => num(v)),
      );
      return {
        prompt: `Listen to these numbers: ${nums.join(', ')}. Which one is the ${wantGreatest ? 'biggest' : 'smallest'}?`,
        choices,
        answer,
        explain: `Comparing the numbers, ${winner} is the ${wantGreatest ? 'biggest' : 'smallest'}.`,
      };
    },
  },
  {
    id: 'g1-026',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'repeating pattern',
    generate: (rng) => {
      const useColors = rng() < 0.5;
      const pool = useColors ? COLORS : SHAPES;
      const [x, y] = sample(rng, pool, 2);
      const mode = pick(rng, ['AB', 'AAB'] as const);
      const terms = mode === 'AB' ? [x, y, x, y, x] : [x, x, y, x, x];
      const next = y;
      const correct = next;
      const unused = pool.filter((s) => s !== x && s !== y);
      const { choices, answer } = buildChoices(rng, correct, [x, ...unused]);
      return {
        prompt: `What comes next in the pattern: ${terms.join(', ')}?`,
        choices,
        answer,
        explain:
          mode === 'AB'
            ? `The pattern repeats ${x}, ${y}, so after ${terms[4]} comes ${next}.`
            : `The pattern repeats ${x}, ${x}, ${y}, so after ${terms[4]} comes ${next}.`,
      };
    },
  },

  // --- Rhyming and sounds by ear ----------------------------------------------
  {
    id: 'g1-027',
    subject: 'verbal',
    kind: 'synonym',
    difficulty: 1,
    topic: 'rhyming words',
    generate: (rng) => {
      const target = pick(rng, RHYME_FAMILIES);
      const correct = pick(rng, target.rhymes);
      const otherBases = RHYME_FAMILIES.filter((f) => f.base !== target.base).map((f) => f.base);
      const distractors = sample(rng, otherBases, 3);
      const { choices, answer } = buildChoices(rng, correct, distractors);
      return {
        prompt: `Which word rhymes with ${target.base}?`,
        choices,
        answer,
        explain: `${correct} rhymes with ${target.base} because they end with the same sound.`,
      };
    },
  },
  {
    id: 'g1-028',
    subject: 'verbal',
    kind: 'synonym',
    difficulty: 1,
    topic: 'beginning sound match',
    generate: (rng) => {
      const group = pick(rng, BEGIN_SOUND_GROUPS);
      const word0 = pick(rng, group.words);
      const correct = pick(rng, group.words.filter((w) => w !== word0));
      const otherWords = BEGIN_SOUND_GROUPS.filter((g) => g !== group).flatMap((g) => g.words);
      const distractors = sample(rng, otherWords, 3);
      const { choices, answer } = buildChoices(rng, correct, distractors);
      return {
        prompt: `Which word starts with the same sound as ${word0}?`,
        choices,
        answer,
        explain: `${correct} and ${word0} both start with the same sound.`,
      };
    },
  },
  {
    id: 'g1-029',
    subject: 'verbal',
    kind: 'synonym',
    difficulty: 2,
    topic: 'ending sound match',
    generate: (rng) => {
      const group = pick(rng, END_SOUND_GROUPS);
      const word0 = pick(rng, group.words);
      const correct = pick(rng, group.words.filter((w) => w !== word0));
      const otherWords = END_SOUND_GROUPS.filter((g) => g !== group).flatMap((g) => g.words);
      const distractors = sample(rng, otherWords, 3);
      const { choices, answer } = buildChoices(rng, correct, distractors);
      return {
        prompt: `Which word ends with the same sound as ${word0}?`,
        choices,
        answer,
        explain: `${correct} and ${word0} both end with the same sound.`,
      };
    },
  },
];
