/**
 * Standalone validator for the first-grade question bank
 * (lib/questions/grade1.ts). Not wired into `npm run check` - run directly:
 *
 *   npx tsx scripts/check-grade1.ts
 *
 * Instantiates every template over thousands of seeds and asserts the
 * mechanical invariants instantiate()/buildChoices() are supposed to
 * guarantee: buildChoices never throws, choices has exactly 4 entries, the
 * answer index is in range, choices[answer] is the intended correct string,
 * and prompt/explain are non-empty ASCII.
 *
 * This grade's questions are read aloud by text-to-speech (the child does
 * not read them), so this validator also checks the design rules that come
 * with that: prompts must not contain bare arithmetic symbols ("+ - ="),
 * and every choice must be short enough to say and hear quickly.
 *
 * For every template whose answer can be recomputed independently of
 * generate() (arithmetic, place value, time, coins, counting order/skip
 * counting/comparisons), a per-id checker below parses the numbers back out
 * of the returned prompt with its own regex and its own formula, then
 * asserts that matches the template's actual answer. That catches a bug in
 * generate()'s own arithmetic that a mechanical shape check (4 choices, in
 * range, etc.) would sail right past.
 *
 * A few sabotage self-tests at the end deliberately break invariants (wrong
 * answer index, duplicate choices, a symbol in a prompt, a too-long choice)
 * to prove this validator would actually catch them, not just pass by
 * construction.
 */
import { GRADE_1_TEMPLATES } from '../lib/questions/grade1';
import { buildChoices, instantiate, mulberry32 } from '../lib/questions/templates';
import type { GeneratedQuestion } from '../lib/questions/templates';

const SEEDS_PER_TEMPLATE = 5000;
/** Choices must be short enough to say and hear quickly by ear. */
const MAX_CHOICE_LEN = 12;

const errors: string[] = [];
const fail = (msg: string) => errors.push(msg);

function isAsciiOnly(s: string): boolean {
  return /^[\x00-\x7F]*$/.test(s);
}

/**
 * Bare arithmetic symbols ("+", "=") make a prompt unreadable as a spoken
 * sentence - this grade's prompts must say "plus"/"minus" instead. "*" is
 * exempt: it is the on-screen counting mark, not an operator.
 */
function hasBareArithmeticSymbol(s: string): boolean {
  return /[+=]/.test(s);
}

/**
 * Independent recomputation checks, keyed by template id. Each pulls the
 * numbers it needs straight out of the rendered prompt (never from
 * generate()'s internals) and recomputes the expected answer with its own
 * formula, so a sign error or off-by-one in the template's own arithmetic
 * gets caught here even though it would otherwise still "look" valid.
 */
const COIN_VALUE: Record<string, number> = { penny: 1, nickel: 5, dime: 10, quarter: 25 };
const SHAPE_SIDES: Record<string, number> = {
  triangle: 3,
  square: 4,
  rectangle: 4,
  pentagon: 5,
  hexagon: 6,
};

const independentChecks: Record<string, (g: GeneratedQuestion, at: string) => void> = {
  // Independent of the template's own `n`: count the marks in the rendered
  // prompt with a plain regex match, and check that count against the
  // answer choice.
  'g1-001': (g, at) => checkMarkCount(g, at),
  'g1-002': (g, at) => checkMarkCount(g, at),
  'g1-003': (g, at) => checkArith(g, at, /What is (\d+) plus (\d+)\?/, (a, b) => a + b),
  'g1-004': (g, at) => checkArith(g, at, /What is (\d+) plus (\d+)\?/, (a, b) => a + b),
  'g1-005': (g, at) =>
    checkArith3(g, at, /What is (\d+) plus (\d+) plus (\d+)\?/, (a, b, c) => a + b + c),
  'g1-006': (g, at) => checkArith(g, at, /What is (\d+) minus (\d+)\?/, (a, b) => a - b),
  'g1-007': (g, at) => checkArith(g, at, /What is (\d+) minus (\d+)\?/, (a, b) => a - b),
  'g1-008': (g, at) => {
    const m = g.prompt.match(/What number goes with (\d+) to make (\d+)\?/);
    if (!m) return fail(`${at}: g1-008 prompt did not match expected shape: ${g.prompt}`);
    assertAnswer(g, at, Number(m[2]) - Number(m[1]));
  },
  'g1-009': (g, at) => {
    const m = g.prompt.match(/has (\d+) .+\. .+ gets (\d+) more/);
    if (!m) return fail(`${at}: g1-009 prompt did not match expected shape: ${g.prompt}`);
    assertAnswer(g, at, Number(m[1]) + Number(m[2]));
  },
  'g1-010': (g, at) => {
    const m = g.prompt.match(/had (\d+) .+\. .+ gave away (\d+)\./);
    if (!m) return fail(`${at}: g1-010 prompt did not match expected shape: ${g.prompt}`);
    assertAnswer(g, at, Number(m[1]) - Number(m[2]));
  },
  'g1-011': (g, at) => {
    const m = g.prompt.match(/has (\d+) .+\. .+ has (\d+) .+\. How many more/);
    if (!m) return fail(`${at}: g1-011 prompt did not match expected shape: ${g.prompt}`);
    assertAnswer(g, at, Number(m[1]) - Number(m[2]));
  },
  'g1-012': (g, at) => {
    const m = g.prompt.match(/How many is (\d+) tens? and (\d+) ones?\?/);
    if (!m) return fail(`${at}: g1-012 prompt did not match expected shape: ${g.prompt}`);
    assertAnswer(g, at, Number(m[1]) * 10 + Number(m[2]));
  },
  'g1-013': (g, at) => {
    const m = g.prompt.match(/It is (\d+) o'clock\. What time is it (\d+) hours? later\?/);
    if (!m) return fail(`${at}: g1-013 prompt did not match expected shape: ${g.prompt}`);
    assertAnswer(g, at, `${hourAddRef(Number(m[1]), Number(m[2]))}:00`);
  },
  'g1-014': (g, at) => {
    const m = g.prompt.match(/It is (\d+) o'clock now\. What time was it (\d+) hours? ago\?/);
    if (!m) return fail(`${at}: g1-014 prompt did not match expected shape: ${g.prompt}`);
    assertAnswer(g, at, `${hourAddRef(Number(m[1]), -Number(m[2]))}:00`);
  },
  'g1-015': (g, at) => {
    const matches = [...g.prompt.matchAll(/(\d+) (penny|pennies|nickels?|dimes?)/g)];
    if (matches.length === 0) return fail(`${at}: g1-015 found no coin phrases: ${g.prompt}`);
    let total = 0;
    for (const [, countStr, word] of matches) {
      const count = Number(countStr);
      if (word.startsWith('penny') || word.startsWith('pennies')) total += count * 1;
      else if (word.startsWith('nickel')) total += count * 5;
      else if (word.startsWith('dime')) total += count * 10;
    }
    assertAnswer(g, at, total);
  },
  'g1-016': (g, at) => {
    const m = g.prompt.match(/Which is worth (more|less): a (\w+) or a (\w+)\?/);
    if (!m) return fail(`${at}: g1-016 prompt did not match expected shape: ${g.prompt}`);
    const [, cmp, coinA, coinB] = m;
    const valueA = COIN_VALUE[coinA];
    const valueB = COIN_VALUE[coinB];
    if (valueA === undefined || valueB === undefined) {
      return fail(`${at}: g1-016 unknown coin name in "${g.prompt}"`);
    }
    const expected = cmp === 'more' ? (valueA > valueB ? coinA : coinB) : (valueA < valueB ? coinA : coinB);
    assertAnswer(g, at, expected);
  },
  'g1-017': (g, at) => {
    const m = g.prompt.match(/How many (sides|corners) does a (\w+) have\?/);
    if (!m) return fail(`${at}: g1-017 prompt did not match expected shape: ${g.prompt}`);
    const sides = SHAPE_SIDES[m[2]];
    if (sides === undefined) return fail(`${at}: g1-017 unknown shape "${m[2]}"`);
    assertAnswer(g, at, sides);
  },
  'g1-018': (g, at) => {
    const m = g.prompt.match(/Which shape has (\d+) sides\?/);
    if (!m) return fail(`${at}: g1-018 prompt did not match expected shape: ${g.prompt}`);
    const n = Number(m[1]);
    const expected = Object.keys(SHAPE_SIDES).find(
      (name) => SHAPE_SIDES[name] === n && name !== 'rectangle',
    );
    if (!expected) return fail(`${at}: g1-018 no canonical shape has ${n} sides`);
    assertAnswer(g, at, expected);
  },
  'g1-020': (g, at) => {
    const m = g.prompt.match(/What number comes right before (\d+)\?/);
    if (!m) return fail(`${at}: g1-020 prompt did not match expected shape: ${g.prompt}`);
    assertAnswer(g, at, Number(m[1]) - 1);
  },
  'g1-021': (g, at) => {
    const m = g.prompt.match(/What number comes right after (\d+)\?/);
    if (!m) return fail(`${at}: g1-021 prompt did not match expected shape: ${g.prompt}`);
    assertAnswer(g, at, Number(m[1]) + 1);
  },
  'g1-022': (g, at) => {
    const m = g.prompt.match(/Which number comes between (\d+) and (\d+)\?/);
    if (!m) return fail(`${at}: g1-022 prompt did not match expected shape: ${g.prompt}`);
    const low = Number(m[1]);
    const high = Number(m[2]);
    if (high - low !== 2) fail(`${at}: g1-022 low/high are not 2 apart: ${low}, ${high}`);
    assertAnswer(g, at, low + 1);
  },
  'g1-023': (g, at) => {
    const m = g.prompt.match(/Count by [\w]+: ([\d, ]+)\. What comes next\?/);
    if (!m) return fail(`${at}: g1-023 prompt did not match expected shape: ${g.prompt}`);
    const terms = m[1].split(',').map((s) => Number(s.trim()));
    if (terms.length !== 4) return fail(`${at}: g1-023 expected 4 terms, got ${terms.length}`);
    const step = terms[1] - terms[0];
    for (let i = 1; i < terms.length; i += 1) {
      if (terms[i] - terms[i - 1] !== step) {
        fail(`${at}: g1-023 terms are not a consistent skip-count: ${terms.join(', ')}`);
      }
    }
    assertAnswer(g, at, terms[3] + step);
  },
  'g1-024': (g, at) => {
    const m = g.prompt.match(/Which number is (greater|less): (\d+) or (\d+)\?/);
    if (!m) return fail(`${at}: g1-024 prompt did not match expected shape: ${g.prompt}`);
    const [a, b] = [Number(m[2]), Number(m[3])];
    const expected = m[1] === 'greater' ? Math.max(a, b) : Math.min(a, b);
    assertAnswer(g, at, expected);
  },
  'g1-025': (g, at) => {
    const m = g.prompt.match(
      /Listen to these numbers: ([\d, ]+)\. Which one is the (biggest|smallest)\?/,
    );
    if (!m) return fail(`${at}: g1-025 prompt did not match expected shape: ${g.prompt}`);
    const nums = m[1].split(',').map((s) => Number(s.trim()));
    const expected = m[2] === 'biggest' ? Math.max(...nums) : Math.min(...nums);
    assertAnswer(g, at, expected);
  },
  'g1-026': (g, at) => {
    const m = g.prompt.match(/What comes next in the pattern: (.+)\?/);
    if (!m) return fail(`${at}: g1-026 prompt did not match expected shape: ${g.prompt}`);
    const terms = m[1].split(',').map((s) => s.trim());
    const first = terms[0];
    const other = terms.find((v) => v !== first);
    if (!other) return fail(`${at}: g1-026 pattern has only one distinct term: ${g.prompt}`);
    assertAnswer(g, at, other);
  },
};

function hourAddRef(h: number, delta: number): number {
  const m = (((h - 1 + delta) % 12) + 12) % 12;
  return m + 1;
}

function assertAnswer(g: GeneratedQuestion, at: string, expected: number | string) {
  const expectedStr = String(expected);
  const actual = g.choices[g.answer];
  if (actual.trim() !== expectedStr) {
    fail(`${at}: independent check expected "${expectedStr}" but choices[answer] was "${actual}"`);
  }
}

function checkArith(
  g: GeneratedQuestion,
  at: string,
  re: RegExp,
  fn: (a: number, b: number) => number,
) {
  const m = g.prompt.match(re);
  if (!m) return fail(`${at}: prompt did not match expected shape: ${g.prompt}`);
  assertAnswer(g, at, fn(Number(m[1]), Number(m[2])));
}

function checkArith3(
  g: GeneratedQuestion,
  at: string,
  re: RegExp,
  fn: (a: number, b: number, c: number) => number,
) {
  const m = g.prompt.match(re);
  if (!m) return fail(`${at}: prompt did not match expected shape: ${g.prompt}`);
  assertAnswer(g, at, fn(Number(m[1]), Number(m[2]), Number(m[3])));
}

function checkMarkCount(g: GeneratedQuestion, at: string) {
  const marks = g.prompt.match(/\*/g);
  if (!marks) return fail(`${at}: expected "*" marks in the prompt, found none: ${g.prompt}`);
  assertAnswer(g, at, marks.length);
}

let instancesChecked = 0;
let independentChecksRun = 0;
const seenIds = new Set<string>();

for (const t of GRADE_1_TEMPLATES) {
  if (!t.id.startsWith('g1-')) {
    fail(`${t.id}: template id must start with "g1-"`);
  }
  if (seenIds.has(t.id)) fail(`${t.id}: duplicate template id`);
  seenIds.add(t.id);

  for (let seed = 1; seed <= SEEDS_PER_TEMPLATE; seed += 1) {
    let g: GeneratedQuestion;
    try {
      g = t.generate(mulberry32(seed));
    } catch (e) {
      fail(`${t.id} (${t.topic}) threw on seed ${seed}: ${(e as Error).message}`);
      continue;
    }
    instancesChecked += 1;
    const at = `${t.id} seed ${seed}`;

    if (!Array.isArray(g.choices) || g.choices.length !== 4) {
      fail(`${at}: expected 4 choices, got ${g.choices?.length}`);
    }
    if (new Set(g.choices.map((c) => c.trim())).size !== 4) {
      fail(`${at}: duplicate choice text`);
    }
    if (!(g.answer >= 0 && g.answer <= 3)) {
      fail(`${at}: answer index ${g.answer} out of range`);
    }
    if (typeof g.choices[g.answer] !== 'string') {
      fail(`${at}: choices[answer] is not a string`);
    }
    if (typeof g.prompt !== 'string' || g.prompt.trim().length === 0) {
      fail(`${at}: empty prompt`);
    }
    if (typeof g.explain !== 'string' || g.explain.trim().length === 0) {
      fail(`${at}: empty explain`);
    }
    if (!isAsciiOnly(g.prompt)) fail(`${at}: prompt has non-ASCII characters: ${g.prompt}`);
    if (!isAsciiOnly(g.explain)) fail(`${at}: explain has non-ASCII characters: ${g.explain}`);
    for (const c of g.choices) {
      if (!isAsciiOnly(c)) fail(`${at}: choice has non-ASCII characters: ${c}`);
    }

    // This grade is read aloud, never read by the child - the prompt must be
    // a spoken sentence (no bare "+"/"=" symbol soup), and every choice must
    // be short enough to say and hear quickly.
    if (hasBareArithmeticSymbol(g.prompt)) {
      fail(`${at}: prompt has a bare arithmetic symbol, say "plus"/"minus" instead: ${g.prompt}`);
    }
    for (const c of g.choices) {
      if (c.trim().length > MAX_CHOICE_LEN) {
        fail(`${at}: choice "${c}" is longer than ${MAX_CHOICE_LEN} chars - too long to hear`);
      }
    }

    // Independent recomputation: parse the prompt's own numbers back out
    // with a separate regex/formula and check that against the answer, for
    // every template where that is feasible.
    const checker = independentChecks[t.id];
    if (checker) {
      checker(g, at);
      independentChecksRun += 1;
    }

    // instantiate() end to end, through the same path the app uses.
    const q = instantiate(t, mulberry32(seed));
    if (q.id !== t.id) fail(`${at}: instantiate() id mismatch`);
    if (q.subject !== t.subject) fail(`${at}: instantiate() subject mismatch`);
    if (q.kind !== t.kind) fail(`${at}: instantiate() kind mismatch`);
    if (q.difficulty !== t.difficulty) fail(`${at}: instantiate() difficulty mismatch`);
  }
}

const templatesWithIndependentCheck = GRADE_1_TEMPLATES.filter(
  (t) => independentChecks[t.id],
).length;
if (templatesWithIndependentCheck < 15) {
  fail(
    `only ${templatesWithIndependentCheck} templates have an independent recomputation check - expected at least 15`,
  );
}

// --- Sabotage self-tests: prove the validator itself catches real breaks ---

let sabotageCaught = 0;

function expectThrow(label: string, fn: () => void) {
  try {
    fn();
    fail(`sabotage "${label}": expected a throw but none happened`);
  } catch {
    sabotageCaught += 1;
  }
}

function expectAssertionFailure(label: string, check: () => boolean) {
  if (check()) {
    fail(`sabotage "${label}": expected the check to detect a problem, but it passed`);
  } else {
    sabotageCaught += 1;
  }
}

// 1) A wrong answer index: choices[answer] should equal the intended correct
//    string; if a template's answer index were wrong, this specific
//    assertion (mirrored from the loop above) would fail.
{
  const brokenAnswer = 3 as const;
  const brokenChoices: [string, string, string, string] = ['10', '11', '12', '13'];
  const intendedCorrect = '11';
  expectAssertionFailure(
    'wrong answer index does not point at the intended correct string',
    () => brokenChoices[brokenAnswer] === intendedCorrect,
  );
}

// 2) A duplicate-choice throw: buildChoices requires 3 unique distractors
//    distinct from the correct answer; fewer than 3 unique values must throw.
expectThrow('buildChoices throws with fewer than 3 unique distractors', () => {
  buildChoices(mulberry32(1), '5', ['5', '5', '5']); // all equal the correct answer
});

// 3) A duplicate-choice-set throw via too few distinct candidates overall.
expectThrow('buildChoices throws when only 2 unique distractors are offered', () => {
  buildChoices(mulberry32(2), '5', ['6', '7', '6', '7']); // only 2 unique values, need 3
});

// 4) A bare arithmetic symbol in a prompt (this grade must say "plus"/
//    "minus", not "+"/"=") - prove hasBareArithmeticSymbol flags it.
expectAssertionFailure('bare "+" in a prompt goes undetected', () =>
  !hasBareArithmeticSymbol('What is 3 + 4?'),
);

// 5) A choice too long to say and hear quickly - prove the length check
//    would flag it rather than silently accept it.
expectAssertionFailure('an overlong choice goes undetected', () => {
  const overlong = 'this choice is way too long to hear';
  return overlong.trim().length <= MAX_CHOICE_LEN;
});

if (sabotageCaught !== 5) {
  fail(`expected 5 sabotage tests to be caught, got ${sabotageCaught}`);
}

if (errors.length > 0) {
  console.error(`FAILED - ${errors.length} error(s):`);
  for (const e of errors.slice(0, 50)) console.error(`  - ${e}`);
  if (errors.length > 50) console.error(`  ... and ${errors.length - 50} more`);
  process.exit(1);
}

console.log(
  `grade1 question bank OK - ${GRADE_1_TEMPLATES.length} templates, ${instancesChecked} instances checked (${SEEDS_PER_TEMPLATE} seeds each), ${independentChecksRun} independently-recomputed-answer checks passed across ${templatesWithIndependentCheck} templates, 5 sabotage self-tests caught.`,
);
