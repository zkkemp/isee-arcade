/**
 * Standalone structural validator for the Kindergarten question bank
 * (lib/questions/gradeK.ts).
 *
 * Mirrors the approach in scripts/check-logic.ts (instantiate every template
 * over many seeds and assert the structural invariants) but is scoped to
 * just this one file, since GRADE_K_TEMPLATES is not yet wired into
 * ALL_TEMPLATES / index.ts.
 *
 * Also runs a handful of deliberate "sabotage" self-tests that feed the
 * SAME assertion logic a known-broken instance, to prove the checks below
 * actually catch the failure modes they claim to catch (an out-of-range
 * answer index, duplicate choice text, and buildChoices' own refusal to
 * build from an all-duplicate candidate list) rather than trivially
 * passing everything.
 *
 * Run: npx tsx scripts/check-gradek.ts
 */
import { GRADE_K_TEMPLATES } from '../lib/questions/gradeK';
import { buildChoices, instantiate, mulberry32 } from '../lib/questions/templates';

const errors: string[] = [];
const fail = (msg: string) => errors.push(msg);

const KNOWN_KINDS = ['math_achievement', 'quant_reasoning', 'synonym'] as const;

/**
 * Parses a rendered choice into a number when it looks numeric, so two
 * choices that differ as text but are equal as values would be caught.
 */
function asNumber(s: string): number | null {
  const t = s.trim().replace(/^\$/, '').replace(/,/g, '');
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return null;
}

/**
 * Structural checks shared between real generated instances and the
 * sabotage fixtures below. Returns a list of problems found — never
 * throws, so it can be used to test intentionally-broken input too.
 */
function findProblems(prompt: string, choices: string[], answer: number, explain: string): string[] {
  const problems: string[] = [];

  if (!Array.isArray(choices) || choices.length !== 4) {
    problems.push(`expected 4 choices, got ${choices?.length}`);
  } else {
    if (choices.some((c) => typeof c !== 'string' || c.trim() === '')) {
      problems.push('an empty choice');
    }
    const norm = choices.map((c) => String(c).trim().toLowerCase());
    if (new Set(norm).size !== 4) {
      problems.push(`duplicate choice text — ${JSON.stringify(choices)}`);
    }
    const nums = choices.map(asNumber).filter((n): n is number => n !== null);
    if (new Set(nums).size !== nums.length) {
      problems.push(`two choices are numerically equal — ${JSON.stringify(choices)}`);
    }
  }

  if (!Number.isInteger(answer) || answer < 0 || answer > 3) {
    problems.push(`bad answer index ${answer}`);
  } else if (
    !Array.isArray(choices) ||
    typeof choices[answer] !== 'string' ||
    choices[answer].trim() === ''
  ) {
    problems.push(`answer index ${answer} points at an empty or missing choice`);
  }

  if (typeof prompt !== 'string' || prompt.trim().length < 2) {
    problems.push('prompt missing or too short');
  }
  if (typeof explain !== 'string' || explain.trim().length < 8) {
    problems.push('explain missing or too short');
  }

  const rendered = [prompt, ...(Array.isArray(choices) ? choices : []), explain].join(' | ');
  if (/undefined|NaN|Infinity/.test(rendered)) {
    problems.push(`rendered text contains a bug token — "${rendered.slice(0, 120)}"`);
  }
  if (/[^\x20-\x7E]/.test(rendered)) {
    problems.push('non-ASCII character in rendered text');
  }

  return problems;
}

// --- Real templates: instantiate every family over many seeds -------------

const SEEDS = 5000;
let instancesChecked = 0;
const seenIds = new Set<string>();

for (const t of GRADE_K_TEMPLATES) {
  if (!t.id.startsWith('gk-')) fail(`${t.id}: id must start with "gk-"`);
  if (seenIds.has(t.id)) fail(`${t.id}: duplicate id`);
  seenIds.add(t.id);

  if (t.difficulty !== 1 && t.difficulty !== 2) {
    fail(`${t.id}: Kindergarten difficulty must be 1 or 2, got ${t.difficulty}`);
  }
  if (!KNOWN_KINDS.includes(t.kind as (typeof KNOWN_KINDS)[number])) {
    fail(`${t.id}: unexpected kind "${t.kind}" for the Kindergarten bank`);
  }
  if (!t.topic || t.topic.trim() === '') fail(`${t.id}: missing topic`);

  const promptsSeen = new Set<string>();

  for (let seed = 1; seed <= SEEDS; seed += 1) {
    let q;
    try {
      q = instantiate(t, mulberry32(seed));
    } catch (e) {
      fail(`${t.id} (${t.topic}) threw on seed ${seed}: ${(e as Error).message}`);
      continue;
    }
    instancesChecked += 1;

    const problems = findProblems(q.prompt, q.choices, q.answer, q.explain);
    for (const p of problems) fail(`${t.id} seed ${seed}: ${p}`);

    if (q.id !== t.id) fail(`${t.id} seed ${seed}: instance id ${q.id} does not match template id`);
    if (q.topic !== t.topic) fail(`${t.id} seed ${seed}: instance lost its topic`);

    if (seed <= 40) promptsSeen.add(q.prompt);
  }

  // Regenerating must actually change the wording/numbers over a handful of
  // seeds, or the "template" is really just a fixed question — checking a
  // window of seeds instead of two fixed ones avoids a false failure on a
  // template with a small (but real) combinatorial space, like the shape
  // riddles, happening to land on the same instance at two arbitrary seeds.
  if (promptsSeen.size < 2) {
    fail(`${t.id} (${t.topic}) produced the same prompt across the first 40 seeds — not really templated`);
  }
}

console.log(
  `Kindergarten bank: ${GRADE_K_TEMPLATES.length} templates x ${SEEDS} seeds = ${instancesChecked} instances checked`,
);

// --- Sabotage self-tests: prove the checks above actually catch bad data --

function expectCaught(label: string, problems: string[]) {
  if (problems.length === 0) {
    fail(`SELF-TEST FAILED (${label}): the validator did not catch a deliberately broken instance`);
  } else {
    console.log(`  self-test ok — ${label}: caught (${problems[0]})`);
  }
}

// 1. A deliberately wrong / out-of-range answer index.
expectCaught(
  'out-of-range answer index',
  findProblems('What is 1 + 1?', ['1', '2', '3', '4'], 4, 'A deliberately broken instance.'),
);

// 2. Duplicate choice text slipping past generation (bypassing buildChoices).
expectCaught(
  'duplicate choice text',
  findProblems('Pick a number.', ['5', '5', '6', '7'], 0, 'A deliberately broken instance.'),
);

// 3. buildChoices itself must refuse to build from too few distinct candidates.
{
  let threw = false;
  try {
    buildChoices(mulberry32(1), 'A', ['A', 'A', 'A']);
  } catch {
    threw = true;
  }
  if (!threw) {
    fail('SELF-TEST FAILED (buildChoices distractor guard): did not throw for an all-duplicate candidate list');
  } else {
    console.log('  self-test ok — buildChoices distractor guard: threw as expected on all-duplicate candidates');
  }
}

// --- Report -----------------------------------------------------------

if (errors.length) {
  console.error(`\n${errors.length} FAILURE(S):`);
  for (const e of errors.slice(0, 40)) console.error(`  x ${e}`);
  if (errors.length > 40) console.error(`  ...and ${errors.length - 40} more`);
  process.exit(1);
}

console.log('\nAll Kindergarten bank checks passed.');
