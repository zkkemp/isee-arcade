import {
  buildChoices,
  frac,
  num,
  pick,
  randInt,
  type QuestionTemplate,
} from './templates';

/**
 * Lower Level Mathematics Achievement: data analysis and probability.
 *
 * These are achievement questions, so learners must read a compact display and
 * carry out the appropriate calculation. Quantitative Reasoning has separate
 * families that emphasize deciding how to think about a problem.
 */
export const MATH_TEMPLATES_4: QuestionTemplate[] = [
  {
    id: 'mt4-001',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'probability of one color',
    generate: (rng) => {
      const red = randInt(rng, 2, 6);
      const blue = randInt(rng, 2, 6);
      const green = randInt(rng, 1, 4);
      const total = red + blue + green;
      const wanted = pick(rng, [
        ['red', red],
        ['blue', blue],
        ['green', green],
      ] as const);
      const correct = frac(wanted[1], total);
      const { choices, answer } = buildChoices(rng, correct, [
        frac(total - wanted[1], total),
        frac(wanted[1], total - wanted[1]),
        frac(1, total),
        frac(wanted[1] + 1, total),
      ]);
      return {
        prompt: `A bag has ${red} red, ${blue} blue, and ${green} green tiles. What is the probability of picking a ${wanted[0]} tile without looking?`,
        choices,
        answer,
        explain: `There are ${total} tiles in all, and ${wanted[1]} are ${wanted[0]}. Probability is wanted outcomes over all outcomes: ${wanted[1]}/${total} = ${correct}.`,
      };
    },
  },
  {
    id: 'mt4-002',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'probability of not an event',
    generate: (rng) => {
      const total = pick(rng, [8, 10, 12]);
      const stars = randInt(rng, 2, total - 3);
      const notStars = total - stars;
      const correct = frac(notStars, total);
      const { choices, answer } = buildChoices(rng, correct, [
        frac(stars, total),
        frac(notStars, stars),
        frac(1, total),
        frac(notStars - 1, total),
      ]);
      return {
        prompt: `A spinner has ${total} equal spaces. ${stars} spaces show a star. What is the probability of landing on a space that is NOT a star?`,
        choices,
        answer,
        explain: `${total} total spaces - ${stars} star spaces = ${notStars} non-star spaces. The probability is ${notStars}/${total} = ${correct}.`,
      };
    },
  },
  {
    id: 'mt4-003',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'data table: total',
    generate: (rng) => {
      const monday = randInt(rng, 12, 28);
      const tuesday = randInt(rng, 12, 28);
      const wednesday = randInt(rng, 12, 28);
      const total = monday + tuesday + wednesday;
      const correct = num(total);
      const { choices, answer } = buildChoices(rng, correct, [
        num(monday + tuesday),
        num(total - 10),
        num(total + 10),
        num(Math.max(monday, tuesday, wednesday)),
      ]);
      return {
        prompt: `A library table shows books returned: Monday ${monday}, Tuesday ${tuesday}, Wednesday ${wednesday}. How many books were returned in all?`,
        choices,
        answer,
        explain: `Add every row in the table: ${monday} + ${tuesday} + ${wednesday} = ${total}.`,
      };
    },
  },
  {
    id: 'mt4-004',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'data table: compare two categories',
    generate: (rng) => {
      const larger = randInt(rng, 24, 48);
      const difference = randInt(rng, 6, 15);
      const smaller = larger - difference;
      const correct = num(difference);
      const { choices, answer } = buildChoices(rng, correct, [
        num(larger + smaller),
        num(larger),
        num(difference - 1),
        num(difference + 1),
      ]);
      return {
        prompt: `A survey table shows ${larger} votes for recess games and ${smaller} votes for reading. How many MORE votes did recess games receive?`,
        choices,
        answer,
        explain: `"How many more" asks for a difference. Subtract: ${larger} - ${smaller} = ${difference}.`,
      };
    },
  },
  {
    id: 'mt4-005',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'data survey: make a prediction',
    generate: (rng) => {
      const surveyed = pick(rng, [10, 20, 25]);
      const scale = pick(rng, [2, 3, 4]);
      const preferred = randInt(rng, 2, surveyed - 2);
      const population = surveyed * scale;
      const prediction = preferred * scale;
      const correct = num(prediction);
      const { choices, answer } = buildChoices(rng, correct, [
        num(preferred),
        num(population - prediction),
        num(prediction + scale),
        num(preferred + scale),
      ]);
      return {
        prompt: `In a survey of ${surveyed} students, ${preferred} chose art club. If ${population} students answer in the same pattern, about how many would choose art club?`,
        choices,
        answer,
        explain: `${population} is ${scale} times ${surveyed}. Scale the matching group by the same amount: ${preferred} x ${scale} = ${prediction}.`,
      };
    },
  },
  {
    id: 'mt4-006',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'data table: missing value from total',
    generate: (rng) => {
      const a = randInt(rng, 8, 18);
      const b = randInt(rng, 8, 18);
      const missing = randInt(rng, 8, 18);
      const total = a + b + missing;
      const correct = num(missing);
      const { choices, answer } = buildChoices(rng, correct, [
        num(total - a),
        num(total - b),
        num(a + b),
        num(missing - 1),
        num(missing + 1),
        num(missing + 2),
      ]);
      return {
        prompt: `A three-row table has ${a} points in Round 1, ${b} in Round 2, and ? in Round 3. The total is ${total}. How many points belong in Round 3?`,
        choices,
        answer,
        explain: `The known rows total ${a} + ${b} = ${a + b}. Subtract from the table total: ${total} - ${a + b} = ${missing}.`,
      };
    },
  },
  {
    id: 'mt4-007',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 1,
    topic: 'frequency table: mode',
    generate: (rng) => {
      const mode = randInt(rng, 3, 8);
      const low = mode - 2;
      const high = mode + 2;
      const correct = num(mode);
      const { choices, answer } = buildChoices(rng, correct, [
        num(low),
        num(high),
        num(mode + 1),
        num(low + mode + high),
      ]);
      return {
        prompt: `A frequency table lists scores: ${low} occurred 2 times, ${mode} occurred 5 times, and ${high} occurred 3 times. What is the mode?`,
        choices,
        answer,
        explain: `The mode is the value that appears most often. ${mode} has the greatest frequency, 5, so the mode is ${mode}.`,
      };
    },
  },
  {
    id: 'mt4-008',
    subject: 'math',
    kind: 'math_achievement',
    difficulty: 2,
    topic: 'possible outcomes',
    generate: (rng) => {
      const spinner = pick(rng, [3, 4, 5]);
      const coinSides = 2;
      const outcomes = spinner * coinSides;
      const correct = num(outcomes);
      const { choices, answer } = buildChoices(rng, correct, [
        num(spinner + coinSides),
        num(spinner),
        num(outcomes - 1),
        num(outcomes + 2),
      ]);
      return {
        prompt: `A spinner has ${spinner} different colors. A coin has ${coinSides} sides. How many different color-and-coin outcomes are possible?`,
        choices,
        answer,
        explain: `Each of the ${spinner} colors can pair with either coin side. Multiply: ${spinner} x ${coinSides} = ${outcomes} possible outcomes.`,
      };
    },
  },
];
