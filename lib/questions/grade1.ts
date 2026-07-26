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
 * First-grade (age ~6-7) question bank.
 *
 * Scope matches early first-grade math and reading standards: addition and
 * subtraction within 20, place value to 100 (tens and ones), skip counting,
 * comparing two-digit numbers, telling time to the hour and half hour,
 * counting coins, basic shape attributes, simple word problems, and a
 * handful of sight-word / rhyming items.
 *
 * Every generator below is solvable by a first grader with paper-and-pencil
 * counting - no regrouping-heavy arithmetic, no negative numbers, no numbers
 * past 100. Distractors are built from realistic first-grade mistakes
 * (miscounted by one, added instead of subtracted, reversed the digits,
 * confused the coin values) rather than random noise, so guessing by
 * elimination does not work.
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

function cap(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export const GRADE_1_TEMPLATES: QuestionTemplate[] = [
  // --- Addition & subtraction within 20 ------------------------------------
  {
    id: 'g1-001',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'addition within 20',
    generate: (rng) => {
      const a = randInt(rng, 1, 19);
      const b = randInt(rng, 1, 20 - a);
      const total = a + b;
      const correct = num(total);
      const { choices, answer } = buildChoices(rng, correct, [
        num(total + 1),
        num(total - 1),
        num(Math.abs(a - b)), // subtracted instead of adding
        num(total + 10),
        num(total + 2),
      ]);
      return {
        prompt: `What is ${a} + ${b}?`,
        choices,
        answer,
        explain: `Count up ${b} more from ${a}: ${a} + ${b} = ${total}.`,
      };
    },
  },
  {
    id: 'g1-002',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'subtraction within 20',
    generate: (rng) => {
      const a = randInt(rng, 2, 20);
      const b = randInt(rng, 1, a);
      const diff = a - b;
      const correct = num(diff);
      const { choices, answer } = buildChoices(rng, correct, [
        num(diff + 1),
        num(diff + 2),
        num(a + b), // added instead of subtracting
        num(a), // forgot to subtract at all
        num(Math.max(0, diff - 1)),
      ]);
      return {
        prompt: `What is ${a} - ${b}?`,
        choices,
        answer,
        explain: `Start at ${a} and count back ${b}: ${a} - ${b} = ${diff}.`,
      };
    },
  },
  {
    id: 'g1-003',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'doubles facts',
    generate: (rng) => {
      const n = randInt(rng, 1, 10);
      const double = n * 2;
      const correct = num(double);
      const { choices, answer } = buildChoices(rng, correct, [
        num(double + 1),
        num(double - 1),
        num(n), // only wrote one of the two addends
        num(n * 3), // tripled instead of doubled
        num(double + 2),
      ]);
      return {
        prompt: `What is ${n} + ${n}?`,
        choices,
        answer,
        explain: `Doubling ${n} means adding it to itself: ${n} + ${n} = ${double}.`,
      };
    },
  },
  {
    id: 'g1-004',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'missing addend within 20',
    generate: (rng) => {
      const target = randInt(rng, 5, 20);
      const a = randInt(rng, 1, target - 1);
      const missing = target - a;
      const correct = num(missing);
      const { choices, answer } = buildChoices(rng, correct, [
        num(a), // gave back the known number instead of the blank
        num(target), // gave the total instead of the missing part
        num(missing + 1),
        num(Math.max(0, missing - 1)),
        num(target + a),
      ]);
      return {
        prompt: `${a} + ___ = ${target}. What number goes in the blank?`,
        choices,
        answer,
        explain: `Since ${a} + ${missing} = ${target}, the missing number is ${missing}.`,
      };
    },
  },
  {
    id: 'g1-025',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'add three numbers within 20',
    generate: (rng) => {
      const a = randInt(rng, 1, 6);
      const b = randInt(rng, 1, 6);
      const c = randInt(rng, 1, 6);
      const total = a + b + c;
      const correct = num(total);
      const { choices, answer } = buildChoices(rng, correct, [
        num(total + 1),
        num(total - 1),
        num(a + b), // forgot to add the third number
        num(total + 2),
      ]);
      return {
        prompt: `What is ${a} + ${b} + ${c}?`,
        choices,
        answer,
        explain: `Add them in order: ${a} + ${b} = ${a + b}, then ${a + b} + ${c} = ${total}.`,
      };
    },
  },

  // --- Place value to 100 ---------------------------------------------------
  {
    id: 'g1-005',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'tens and ones to a number',
    generate: (rng) => {
      const tens = randInt(rng, 1, 9);
      const ones = randInt(rng, 0, 9);
      const value = tens * 10 + ones;
      const correct = num(value);
      const { choices, answer } = buildChoices(rng, correct, [
        num(ones * 10 + tens), // flipped the tens and ones
        num(tens + ones), // added the digits instead of using place value
        num(tens * 10), // dropped the ones
        num(ones), // dropped the tens
        num(value + 10),
      ]);
      return {
        prompt: `What number is ${tens} tens and ${ones} ones?`,
        choices,
        answer,
        explain: `${tens} tens is ${tens * 10}, plus ${ones} ones makes ${value}.`,
      };
    },
  },
  {
    id: 'g1-006',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'digit place value in a two-digit number',
    generate: (rng) => {
      const tens = randInt(rng, 1, 9);
      const ones = randInt(rng, 0, 9);
      const value = tens * 10 + ones;
      const target = pick(rng, ['tens', 'ones'] as const);
      const digit = target === 'tens' ? tens : ones;
      const other = target === 'tens' ? ones : tens;
      const correct = num(digit);
      const { choices, answer } = buildChoices(rng, correct, [
        num(other), // read the other place instead
        num(value), // gave the whole number
        num(digit + 1),
        num(digit === 0 ? digit + 2 : digit - 1),
        num(9 - digit),
      ]);
      return {
        prompt: `In the number ${value}, which digit is in the ${target} place?`,
        choices,
        answer,
        explain: `${value} has a ${tens} in the tens place and a ${ones} in the ones place, so the ${target} digit is ${digit}.`,
      };
    },
  },
  {
    id: 'g1-007',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'find the number with a given tens digit',
    generate: (rng) => {
      const targetDigit = randInt(rng, 1, 9);
      const onesTarget = randInt(rng, 0, 9);
      const correctNum = targetDigit * 10 + onesTarget;
      const correct = num(correctNum);
      const otherTens = sample(
        rng,
        Array.from({ length: 9 }, (_, i) => i + 1).filter((d) => d !== targetDigit),
        3,
      );
      const { choices, answer } = buildChoices(
        rng,
        correct,
        otherTens.map((t) => num(t * 10 + randInt(rng, 0, 9))),
      );
      return {
        prompt: `Which number has a ${targetDigit} in the tens place?`,
        choices,
        answer,
        explain: `${correctNum} is made of ${targetDigit} tens and ${onesTarget} ones, so its tens digit is ${targetDigit}.`,
      };
    },
  },

  // --- Counting & skip counting ---------------------------------------------
  {
    id: 'g1-008',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'skip counting forward',
    generate: (rng) => {
      const step = pick(rng, [2, 5, 10] as const);
      const maxMult = Math.floor((100 - 4 * step) / step);
      const startMult = randInt(rng, 0, maxMult);
      const start = startMult * step;
      const terms = [0, 1, 2, 3].map((i) => start + i * step);
      const next = start + 4 * step;
      const correct = num(next);
      const { choices, answer } = buildChoices(rng, correct, [
        num(next + step),
        num(next - step),
        num(next + 1),
        num(terms[3]), // repeated the last term shown
        num(next + 2),
      ]);
      return {
        prompt: `Count by ${step}s: ${terms.join(', ')}, ___`,
        choices,
        answer,
        explain: `Each number is ${step} more than the last, so after ${terms[3]} comes ${terms[3]} + ${step} = ${next}.`,
      };
    },
  },
  {
    id: 'g1-009',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'number that comes before',
    generate: (rng) => {
      const n = randInt(rng, 2, 100);
      const before = n - 1;
      const correct = num(before);
      const { choices, answer } = buildChoices(rng, correct, [
        num(n), // repeated the given number
        num(n + 1),
        num(Math.max(0, before - 1)),
        num(n - 2 >= 0 ? n - 2 : n + 2),
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
    id: 'g1-010',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 1,
    topic: 'number that comes after',
    generate: (rng) => {
      const n = randInt(rng, 1, 99);
      const after = n + 1;
      const correct = num(after);
      const { choices, answer } = buildChoices(rng, correct, [
        num(n), // repeated the given number
        num(Math.max(0, n - 1)),
        num(after + 1),
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
    id: 'g1-011',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'number that comes between',
    generate: (rng) => {
      const n = randInt(rng, 2, 98);
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
        prompt: `What number is missing? ${low}, ___, ${high}`,
        choices,
        answer,
        explain: `${n} comes between ${low} and ${high} when counting by ones.`,
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
      const POOL = ['circle', 'square', 'triangle', 'star', 'heart'] as const;
      const [x, y] = sample(rng, POOL, 2);
      const mode = pick(rng, ['AB', 'AAB'] as const);
      const terms = mode === 'AB' ? [x, y, x, y, x] : [x, x, y, x, x];
      const next = mode === 'AB' ? y : y;
      const correct = next;
      const unused = POOL.filter((s) => s !== x && s !== y);
      const { choices, answer } = buildChoices(rng, correct, [x, ...unused]);
      return {
        prompt: `What comes next in the pattern? ${terms.join(', ')}, ___`,
        choices,
        answer,
        explain:
          mode === 'AB'
            ? `The pattern repeats ${x}, ${y}, so after ${terms[4]} comes ${next}.`
            : `The pattern repeats ${x}, ${x}, ${y}, so after ${terms[4]} comes ${next}.`,
      };
    },
  },

  // --- Comparing numbers to 100 --------------------------------------------
  {
    id: 'g1-012',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'compare two-digit numbers',
    generate: (rng) => {
      const equalCase = rng() < 0.2;
      const a = randInt(rng, 10, 99);
      let b = equalCase ? a : randInt(rng, 10, 99);
      if (!equalCase && b === a) b = b === 99 ? b - 1 : b + 1;
      const correctLabel = a > b ? 'greater than' : a < b ? 'less than' : 'equal to';
      const otherLabels = (['greater than', 'less than', 'equal to'] as const).filter(
        (l) => l !== correctLabel,
      );
      const { choices, answer } = buildChoices(rng, correctLabel, [
        ...otherLabels,
        'twice as many',
      ]);
      const explain =
        correctLabel === 'equal to'
          ? `${a} and ${b} are the same number, so they are equal.`
          : `Compare the tens digits first: ${a} has ${Math.floor(a / 10)} tens and ${b} has ${Math.floor(b / 10)} tens, so ${a} is ${correctLabel} ${b}.`;
      return {
        prompt: `${a} is ___ ${b}.`,
        choices,
        answer,
        explain,
      };
    },
  },
  {
    id: 'g1-013',
    subject: 'quantitative',
    kind: 'quant_reasoning',
    difficulty: 2,
    topic: 'greatest or least of a set',
    generate: (rng) => {
      const pool = Array.from({ length: 90 }, (_, i) => i + 10);
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
        prompt: `Which number is the ${wantGreatest ? 'greatest' : 'least'}? ${nums.join(', ')}`,
        choices,
        answer,
        explain: `Comparing the numbers, ${winner} is the ${wantGreatest ? 'biggest' : 'smallest'}.`,
      };
    },
  },

  // --- Telling time ----------------------------------------------------------
  {
    id: 'g1-014',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'time — hours later',
    generate: (rng) => {
      const startHour = randInt(rng, 1, 12);
      const addHours = randInt(rng, 1, 3);
      const endHour = hourAdd(startHour, addHours);
      const correct = `${endHour}:00`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${hourAdd(startHour, addHours + 1)}:00`,
        `${hourAdd(startHour, addHours - 1)}:00`,
        `${startHour}:00`, // forgot to add the hours
        `${hourAdd(startHour, addHours + 2)}:00`,
      ]);
      return {
        prompt: `The clock shows ${startHour}:00. What time is it ${addHours} hour${addHours === 1 ? '' : 's'} later?`,
        choices,
        answer,
        explain: `Adding ${addHours} hour${addHours === 1 ? '' : 's'} to ${startHour}:00 gives ${endHour}:00.`,
      };
    },
  },
  {
    id: 'g1-015',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'time — minutes later, crossing the hour',
    generate: (rng) => {
      const startHour = randInt(rng, 1, 12);
      const startMinute = pick(rng, [0, 30] as const);
      const steps = randInt(rng, 1, 3); // each step is 30 minutes
      const addedMinutes = steps * 30;
      const totalMinutes = startMinute + addedMinutes;
      const hoursToAdd = Math.floor(totalMinutes / 60);
      const endMinute = totalMinutes % 60;
      const endHour = hourAdd(startHour, hoursToAdd);
      const correct = `${endHour}:${endMinute === 0 ? '00' : '30'}`;
      const startLabel = `${startHour}:${startMinute === 0 ? '00' : '30'}`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${hourAdd(startHour, hoursToAdd + 1)}:${endMinute === 0 ? '00' : '30'}`, // one hour too many
        `${endHour}:${endMinute === 0 ? '30' : '00'}`, // flipped the minutes
        startLabel, // did not move the clock at all
        `${hourAdd(startHour, hoursToAdd - 1)}:${endMinute === 0 ? '00' : '30'}`,
      ]);
      return {
        prompt: `The clock shows ${startLabel}. What time is it ${addedMinutes} minutes later?`,
        choices,
        answer,
        explain: `${addedMinutes} minutes later than ${startLabel} is ${correct}.`,
      };
    },
  },
  {
    id: 'g1-016',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'reading clock hands',
    generate: (rng) => {
      const hour = randInt(rng, 1, 12);
      const half = rng() < 0.5;
      const longHandPos = half ? 6 : 12;
      const correct = half ? `${hour}:30` : `${hour}:00`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${hourAdd(hour, 1)}:${half ? '30' : '00'}`,
        `${hour}:${half ? '00' : '30'}`, // read the long hand as the other option
        `${hourAdd(hour, -1)}:${half ? '30' : '00'}`,
        `${hourAdd(hour, 1)}:${half ? '00' : '30'}`,
      ]);
      return {
        prompt: `The short hand points to ${hour} and the long hand points to ${longHandPos}. What time is it?`,
        choices,
        answer,
        explain: half
          ? `The short hand shows the hour is ${hour}, and the long hand on 6 means half past, so the time is ${hour}:30.`
          : `The short hand shows the hour is ${hour}, and the long hand on 12 means exactly on the hour, so the time is ${hour}:00.`,
      };
    },
  },

  // --- Money -------------------------------------------------------------
  {
    id: 'g1-017',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'count mixed coins',
    generate: (rng) => {
      let dimes = randInt(rng, 0, 3);
      const nickels = randInt(rng, 0, 3);
      const pennies = randInt(rng, 0, 4);
      if (dimes + nickels + pennies === 0) dimes = 1;
      const total = dimes * 10 + nickels * 5 + pennies * 1;
      const correct = `${total} cents`;
      const parts: string[] = [];
      if (dimes > 0) parts.push(coinPhrase(dimes, 'dime', 'dimes'));
      if (nickels > 0) parts.push(coinPhrase(nickels, 'nickel', 'nickels'));
      if (pennies > 0) parts.push(coinPhrase(pennies, 'penny', 'pennies'));
      const coinCount = dimes + nickels + pennies;
      const swappedValue = pennies * 1 + nickels * 10 + dimes * 5;
      const name = pick(rng, NAMES);
      const { choices, answer } = buildChoices(rng, correct, [
        `${total + 1} cents`,
        `${total + 5} cents`,
        `${total + 10} cents`,
        `${coinCount} cents`, // counted coins instead of their value
        `${swappedValue} cents`, // swapped the nickel and dime values
        `${total + 2} cents`,
      ]);
      return {
        prompt: `${name} has ${joinList(parts)}. How many cents does ${name} have in all?`,
        choices,
        answer,
        explain: `Add up the value of each coin: ${total} cents in all.`,
      };
    },
  },
  {
    id: 'g1-018',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'how many coins reach a total',
    generate: (rng) => {
      const coinType = pick(rng, [
        { name: 'penny', plural: 'pennies', value: 1 },
        { name: 'nickel', plural: 'nickels', value: 5 },
        { name: 'dime', plural: 'dimes', value: 10 },
      ] as const);
      const count = randInt(rng, 2, 9);
      const total = count * coinType.value;
      const correct = `${total} cents`;
      const { choices, answer } = buildChoices(rng, correct, [
        `${(count + 1) * coinType.value} cents`,
        `${(count - 1) * coinType.value} cents`,
        `${count} cents`, // confused the coin count with the total value
        `${total + coinType.value} cents`,
        `${(count + 2) * coinType.value} cents`,
        `${count + 5} cents`,
      ]);
      return {
        prompt: `${coinPhrase(count, coinType.name, coinType.plural)} equal how many cents?`,
        choices,
        answer,
        explain: `Each ${coinType.name} is worth ${coinType.value} cent${coinType.value === 1 ? '' : 's'}, so ${count} x ${coinType.value} = ${total} cents.`,
      };
    },
  },
  {
    id: 'g1-019',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'money word problem — change',
    generate: (rng) => {
      const name = pick(rng, NAMES);
      const item = pick(rng, ['toy car', 'sticker book', 'yo-yo', 'small kite', 'bag of marbles']);
      const priceCents = randInt(rng, 5, 75);
      const paidCents = 100;
      const change = paidCents - priceCents;
      const correct = money(change);
      const { choices, answer } = buildChoices(rng, correct, [
        money(priceCents), // gave back the price instead of the change
        money(Math.max(0, change - 10)),
        money(change + 10),
        money(paidCents + priceCents), // added instead of subtracting
      ]);
      return {
        prompt: `A ${item} costs ${money(priceCents)}. ${name} pays with ${money(paidCents)}. How much change should ${name} get back?`,
        choices,
        answer,
        explain: `Subtract the price from the dollar: ${money(paidCents)} - ${money(priceCents)} = ${money(change)}.`,
      };
    },
  },

  // --- Shapes ----------------------------------------------------------------
  {
    id: 'g1-020',
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
        num(shape.count - 1),
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
    id: 'g1-021',
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

  // --- Word problems -----------------------------------------------------------
  {
    id: 'g1-022',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'addition word problem within 20',
    generate: (rng) => {
      const name = pick(rng, NAMES);
      const items = pick(rng, ['apples', 'stickers', 'crayons', 'marbles', 'balloons']);
      const a = randInt(rng, 2, 12);
      const b = randInt(rng, 1, 20 - a);
      const total = a + b;
      const correct = num(total);
      const { choices, answer } = buildChoices(rng, correct, [
        num(total + 1),
        num(total - 1),
        num(Math.abs(a - b)), // subtracted instead of adding
        num(a), // forgot to add the new ones
        num(total + 2),
      ]);
      return {
        prompt: `${name} has ${a} ${items}. ${name} gets ${b} more. How many ${items} does ${name} have now?`,
        choices,
        answer,
        explain: `Start with ${a} and add ${b} more: ${a} + ${b} = ${total}.`,
      };
    },
  },
  {
    id: 'g1-023',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'subtraction word problem within 20',
    generate: (rng) => {
      const name = pick(rng, NAMES);
      const item = pick(rng, ['cookie', 'pencil', 'sticker', 'balloon', 'marble']);
      const start = randInt(rng, 5, 20);
      const given = randInt(rng, 1, start - 1);
      const left = start - given;
      const correct = num(left);
      const { choices, answer } = buildChoices(rng, correct, [
        num(left + 1),
        num(Math.max(0, left - 1)),
        num(start + given), // added instead of subtracting
        num(given), // gave away the wrong amount back
        num(left + 2),
      ]);
      return {
        prompt: `${name} had ${start} ${item}s. ${name} gave away ${given}. How many ${item}s does ${name} have left?`,
        choices,
        answer,
        explain: `Take away ${given} from ${start}: ${start} - ${given} = ${left}.`,
      };
    },
  },
  {
    id: 'g1-024',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'comparison subtraction word problem',
    generate: (rng) => {
      const name1 = pick(rng, NAMES);
      const name2 = pick(rng, NAMES.filter((n) => n !== name1));
      const items = pick(rng, ['stickers', 'shells', 'rocks', 'cards']);
      const countA = randInt(rng, 5, 20);
      const countB = randInt(rng, 1, countA - 1);
      const diff = countA - countB;
      const correct = num(diff);
      const { choices, answer } = buildChoices(rng, correct, [
        num(countA + countB), // added instead of comparing
        num(diff + 1),
        num(Math.max(0, diff - 1)),
        num(countA), // gave the total instead of the difference
        num(diff + 2),
      ]);
      return {
        prompt: `${name1} has ${countA} ${items}. ${name2} has ${countB} ${items}. How many more ${items} does ${name1} have than ${name2}?`,
        choices,
        answer,
        explain: `Subtract to compare: ${countA} - ${countB} = ${diff}, so ${name1} has ${diff} more.`,
      };
    },
  },

  // --- Sight words / phonics (kind: synonym) ----------------------------------
  {
    id: 'g1-027',
    subject: 'verbal',
    kind: 'synonym',
    difficulty: 1,
    topic: 'easy synonym match',
    generate: (rng) => {
      const pairs = [
        ['big', 'huge'],
        ['small', 'tiny'],
        ['happy', 'glad'],
        ['sad', 'unhappy'],
        ['fast', 'quick'],
        ['begin', 'start'],
        ['end', 'finish'],
        ['loud', 'noisy'],
        ['quiet', 'silent'],
        ['pretty', 'beautiful'],
        ['scared', 'afraid'],
        ['jump', 'leap'],
      ] as const;
      const [word, synonym] = pick(rng, pairs);
      const distractorWords = [
        'chair',
        'purple',
        'seven',
        'kitchen',
        'pencil',
        'cloud',
        'shoe',
        'music',
        'window',
        'garden',
      ] as const;
      const distractors = sample(rng, distractorWords, 3);
      const { choices, answer } = buildChoices(rng, synonym, distractors);
      return {
        prompt: word.toUpperCase(),
        choices,
        answer,
        explain: `${cap(word)} means the same as ${synonym}.`,
      };
    },
  },
  {
    id: 'g1-028',
    subject: 'verbal',
    kind: 'synonym',
    difficulty: 1,
    topic: 'rhyming words',
    generate: (rng) => {
      const families = [
        { base: 'cat', rhymes: ['hat', 'bat', 'mat', 'rat'] },
        { base: 'dog', rhymes: ['log', 'fog', 'hog', 'jog'] },
        { base: 'sun', rhymes: ['fun', 'run', 'bun'] },
        { base: 'pen', rhymes: ['hen', 'ten', 'men'] },
        { base: 'box', rhymes: ['fox', 'socks', 'locks'] },
        { base: 'bed', rhymes: ['red', 'fed', 'led'] },
      ] as const;
      const target = pick(rng, families);
      const correct = pick(rng, target.rhymes);
      const otherBases = families.filter((f) => f.base !== target.base).map((f) => f.base);
      const distractors = sample(rng, otherBases, 3);
      const { choices, answer } = buildChoices(rng, correct, distractors);
      return {
        prompt: `Which word rhymes with "${target.base}"?`,
        choices,
        answer,
        explain: `"${correct}" rhymes with "${target.base}" because they both end with the same sound.`,
      };
    },
  },
];
