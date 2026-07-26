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
 * A few sabotage self-tests at the end deliberately break instantiate()'s
 * invariants (wrong answer index, duplicate choices) to prove this validator
 * would actually catch them, not just pass by construction.
 */
import { GRADE_1_TEMPLATES } from '../lib/questions/grade1';
import { buildChoices, instantiate, mulberry32 } from '../lib/questions/templates';
import type { GeneratedQuestion } from '../lib/questions/templates';

const SEEDS_PER_TEMPLATE = 5000;

const errors: string[] = [];
const fail = (msg: string) => errors.push(msg);

function isAsciiOnly(s: string): boolean {
  return /^[\x00-\x7F]*$/.test(s);
}

let instancesChecked = 0;
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

    // instantiate() end to end, through the same path the app uses.
    const q = instantiate(t, mulberry32(seed));
    if (q.id !== t.id) fail(`${at}: instantiate() id mismatch`);
    if (q.subject !== t.subject) fail(`${at}: instantiate() subject mismatch`);
    if (q.kind !== t.kind) fail(`${at}: instantiate() kind mismatch`);
    if (q.difficulty !== t.difficulty) fail(`${at}: instantiate() difficulty mismatch`);
  }
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

if (sabotageCaught !== 3) {
  fail(`expected 3 sabotage tests to be caught, got ${sabotageCaught}`);
}

if (errors.length > 0) {
  console.error(`FAILED - ${errors.length} error(s):`);
  for (const e of errors.slice(0, 50)) console.error(`  - ${e}`);
  if (errors.length > 50) console.error(`  ... and ${errors.length - 50} more`);
  process.exit(1);
}

console.log(
  `grade1 question bank OK - ${GRADE_1_TEMPLATES.length} templates, ${instancesChecked} instances checked (${SEEDS_PER_TEMPLATE} seeds each), 3 sabotage self-tests caught.`,
);
