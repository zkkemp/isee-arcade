/**
 * Standalone validator for the 3rd grade question bank (lib/questions/grade3.ts).
 *
 * Instantiates every GRADE_3_TEMPLATES entry over thousands of seeds and checks:
 *   - buildChoices never throws (every candidate distractor set stays valid)
 *   - exactly 4 choices, answer is 0-3, choices[answer] is non-empty
 *   - prompt/explain are non-empty and ASCII-only
 *   - for templates whose prompt text is regular enough to parse, the expected
 *     answer is INDEPENDENTLY recomputed from the numbers in the prompt (not
 *     by re-running the template's own formula) and compared to choices[answer]
 *     -- this is what catches a wrong formula, not just a malformed choice set.
 *
 * Also runs a few sabotage self-tests: known-wrong instances are fed through
 * the same independent-recompute checks to prove they actually get flagged,
 * rather than passing everything vacuously.
 *
 * Run: npx tsx scripts/check-grade3.ts
 */
import { GRADE_3_TEMPLATES } from '../lib/questions/grade3';
import { frac, instantiate, money, mulberry32, num } from '../lib/questions/templates';
import type { Question } from '../lib/questions/types';

const SEEDS_PER_TEMPLATE = 5000;

const errors: string[] = [];

function fail(msg: string) {
  errors.push(msg);
}

// ---------------------------------------------------------------------------
// Independent recompute: for templates whose prompt format we control and can
// parse, work out the expected correct string from the numbers IN THE PROMPT
// (never from the template's internal variables), and compare it against
// choices[answer]. Returns null when a template's shape is not mechanically
// parseable (fraction-equivalence choice sets, synonyms, etc.) -- those still
// get every generic check above, just not this one.
// ---------------------------------------------------------------------------

function arithmeticVerifier(q: Question): string | null {
  const m = /^What is (\d+) (\+|-|x|\/) (\d+)\?$/.exec(q.prompt);
  if (!m) return null;
  const a = Number(m[1]);
  const op = m[2];
  const b = Number(m[3]);
  const value = op === '+' ? a + b : op === '-' ? a - b : op === 'x' ? a * b : a / b;
  return num(value);
}

function multiStepVerifier(q: Question): string | null {
  const m = /^What is \((\d+) x (\d+)\) (\+|-) (\d+)\?$/.exec(q.prompt);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const op = m[3];
  const c = Number(m[4]);
  const product = a * b;
  return num(op === '+' ? product + c : product - c);
}

function fractionOfSetVerifier(q: Question): string | null {
  const m = /^A box has (\d+) [\w\s]+\. (\d+)\/(\d+) of them are red\. How many are red\?$/.exec(q.prompt);
  if (!m) return null;
  const total = Number(m[1]);
  const n = Number(m[2]);
  const d = Number(m[3]);
  return num((total / d) * n);
}

function identifyFractionVerifier(q: Question): string | null {
  const m = /^A shape is cut into (\d+) equal parts\. (\d+) of the parts are shaded\. What fraction of the shape is shaded\?$/.exec(
    q.prompt,
  );
  if (!m) return null;
  const total = Number(m[1]);
  const shaded = Number(m[2]);
  return frac(shaded, total);
}

function equivalentFractionVerifier(q: Question): string | null {
  const pm = /^Which fraction is equal to (\d+)\/(\d+)\?$/.exec(q.prompt);
  if (!pm) return null;
  const n = Number(pm[1]);
  const d = Number(pm[2]);
  const em = /Multiply the top and bottom by the same number: \d+ x (\d+) =/.exec(q.explain);
  if (!em) return null;
  const k = Number(em[1]);
  return `${n * k}/${d * k}`;
}

function moneyChangeVerifier(q: Question): string | null {
  const m = /costs \$(\d+)\.(\d+)\. You pay with \$(\d+)\.(\d+)\./.exec(q.prompt);
  if (!m) return null;
  const price = Number(m[1]) * 100 + Number(m[2]);
  const paid = Number(m[3]) * 100 + Number(m[4]);
  return money(paid - price);
}

function moneyAddVerifier(q: Question): string | null {
  const m = /has \$(\d+)\.(\d+)\. \S+ finds \$(\d+)\.(\d+) more/.exec(q.prompt);
  if (!m) return null;
  const a = Number(m[1]) * 100 + Number(m[2]);
  const b = Number(m[3]) * 100 + Number(m[4]);
  return money(a + b);
}

function roundTenVerifier(q: Question): string | null {
  const m = /^Round (\d+) to the nearest ten\.$/.exec(q.prompt);
  if (!m) return null;
  const v = Number(m[1]);
  return num(Math.round(v / 10) * 10);
}

function roundHundredVerifier(q: Question): string | null {
  const m = /^Round (\d+) to the nearest hundred\.$/.exec(q.prompt);
  if (!m) return null;
  const v = Number(m[1]);
  return num(Math.round(v / 100) * 100);
}

function placeValueVerifier(q: Question): string | null {
  const m = /the digit (\d+) in the (thousands|hundreds|tens|ones) place\?$/.exec(q.prompt);
  if (!m) return null;
  const digit = Number(m[1]);
  const placeValue = { thousands: 1000, hundreds: 100, tens: 10, ones: 1 }[m[2] as 'thousands' | 'hundreds' | 'tens' | 'ones'];
  return num(digit * placeValue);
}

function areaVerifier(q: Question): string | null {
  const m = /^A rectangle is (\d+) (\w+) long and (\d+) \w+ wide\. What is its area\?$/.exec(q.prompt);
  if (!m) return null;
  const long = Number(m[1]);
  const unit = m[2];
  const wide = Number(m[3]);
  return `${long * wide} sq ${unit}`;
}

function perimeterVerifier(q: Question): string | null {
  const m = /^A rectangle is (\d+) (\w+) long and (\d+) \w+ wide\. What is its perimeter\?$/.exec(q.prompt);
  if (!m) return null;
  const long = Number(m[1]);
  const unit = m[2];
  const wide = Number(m[3]);
  return `${2 * (long + wide)} ${unit}`;
}

function clock12(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 12;
  const mm = ((totalMinutes % 60) + 60) % 60;
  return `${h === 0 ? 12 : h}:${String(mm).padStart(2, '0')}`;
}

function elapsedTimeVerifier(q: Question): string | null {
  const m = /^It is (\d+):(\d+) p\.m\. What time will it be (\d+) minutes later\?$/.exec(q.prompt);
  if (!m) return null;
  const h = Number(m[1]) % 12;
  const mm = Number(m[2]);
  const add = Number(m[3]);
  return `${clock12(h * 60 + mm + add)} p.m.`;
}

function readClockVerifier(q: Question): string | null {
  const m = /^The hour hand points closest to the (\d+), and the minute hand (points straight up at the 12|points at the (\d+))\. What time is it\?$/.exec(
    q.prompt,
  );
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = m[3] ? Number(m[3]) * 5 : 0;
  return `${hour}:${String(minute).padStart(2, '0')}`;
}

function sequenceVerifier(q: Question): string | null {
  const m = /^What number comes next(?: when skip counting by \d+s)?\? (.+), ___$/.exec(q.prompt);
  if (!m) return null;
  const terms = m[1].split(', ').map(Number);
  if (terms.length < 2) return null;
  const step = terms[1] - terms[0];
  return num(terms[terms.length - 1] + step);
}

function multiplyPatternVerifier(q: Question): string | null {
  const m = /^What number comes next in this multiply pattern\? (.+), ___$/.exec(q.prompt);
  if (!m) return null;
  const terms = m[1].split(', ').map(Number);
  if (terms.length < 2 || terms[0] === 0 || terms[1] % terms[0] !== 0) return null;
  const multiplier = terms[1] / terms[0];
  if (multiplier < 2 || !terms.every((value, i) => i === 0 || value === terms[i - 1] * multiplier)) {
    return null;
  }
  return num(terms[terms.length - 1] * multiplier);
}

function compareNumbersVerifier(q: Question): string | null {
  const m = /^Which number is the (greatest|least)\? (.+)$/.exec(q.prompt);
  if (!m) return null;
  const values = m[2].split(', ').map(Number);
  return num(m[1] === 'greatest' ? Math.max(...values) : Math.min(...values));
}

function estimateSumVerifier(q: Question): string | null {
  const m = /^About how much is (\d+) \+ (\d+)\? Round your answer to the nearest ten\.$/.exec(q.prompt);
  if (!m) return null;
  const sum = Number(m[1]) + Number(m[2]);
  return num(Math.round(sum / 10) * 10);
}

function barGraphVerifier(q: Question): string | null {
  const m = /(\d+) picked (\w+), (\d+) picked (\w+), and (\d+) picked (\w+)\./.exec(q.prompt);
  if (!m) return null;
  const counts = [Number(m[1]), Number(m[3]), Number(m[5])];
  const names = [m[2], m[4], m[6]];
  if (/Which fruit was picked the most\?$/.test(q.prompt)) {
    return names[counts.indexOf(Math.max(...counts))];
  }
  if (/Which fruit was picked the least\?$/.test(q.prompt)) {
    return names[counts.indexOf(Math.min(...counts))];
  }
  const dm = /How many more kids picked (\w+) than (\w+)\?$/.exec(q.prompt);
  if (dm) {
    const a = counts[names.indexOf(dm[1])];
    const b = counts[names.indexOf(dm[2])];
    return num(a - b);
  }
  return null;
}

function giveAwayWordProblemVerifier(q: Question): string | null {
  const m = /buys (\d+) packs of [\w\s]+ with (\d+) in each pack\. .+ gives (\d+) [\w\s]+ to a friend\. How many does .+ have left\?$/.exec(
    q.prompt,
  );
  if (!m) return null;
  const packs = Number(m[1]);
  const perPack = Number(m[2]);
  const giveAway = Number(m[3]);
  return num(packs * perPack - giveAway);
}

function boxesPlusExtraWordProblemVerifier(q: Question): string | null {
  const m = /has (\d+) boxes of crayons with (\d+) crayons in each box, plus (\d+) loose crayons\. How many crayons does .+ have in all\?$/.exec(
    q.prompt,
  );
  if (!m) return null;
  const boxes = Number(m[1]);
  const perBox = Number(m[2]);
  const extra = Number(m[3]);
  return num(boxes * perBox + extra);
}

/** First verifier (in order) whose regex matches the prompt wins; others return null and are skipped. */
const VERIFIERS: Array<(q: Question) => string | null> = [
  arithmeticVerifier,
  multiStepVerifier,
  fractionOfSetVerifier,
  identifyFractionVerifier,
  equivalentFractionVerifier,
  moneyChangeVerifier,
  moneyAddVerifier,
  roundTenVerifier,
  roundHundredVerifier,
  placeValueVerifier,
  areaVerifier,
  perimeterVerifier,
  elapsedTimeVerifier,
  readClockVerifier,
  multiplyPatternVerifier,
  sequenceVerifier,
  compareNumbersVerifier,
  estimateSumVerifier,
  barGraphVerifier,
  giveAwayWordProblemVerifier,
  boxesPlusExtraWordProblemVerifier,
];

function recompute(q: Question): string | null {
  for (const v of VERIFIERS) {
    const r = v(q);
    if (r !== null) return r;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main pass: instantiate every template over many seeds.
// ---------------------------------------------------------------------------

const ASCII_RE = /^[\x20-\x7E\n]*$/;
let totalInstances = 0;
let recomputedInstances = 0;
const seenIds = new Set<string>();
const verifiedTopics = new Set<string>();

for (const template of GRADE_3_TEMPLATES) {
  if (!template.id.startsWith('g3-')) {
    fail(`${template.id}: id must start with "g3-"`);
  }
  if (seenIds.has(template.id)) {
    fail(`${template.id}: duplicate id`);
  }
  seenIds.add(template.id);

  if (!['math', 'quantitative', 'verbal'].includes(template.subject)) {
    fail(`${template.id}: unexpected subject "${template.subject}"`);
  }
  if (!['math_achievement', 'quant_reasoning', 'synonym'].includes(template.kind)) {
    fail(`${template.id}: grade3 bank must not use kind "${template.kind}" (no reading passages)`);
  }
  if (![1, 2, 3].includes(template.difficulty)) {
    fail(`${template.id}: difficulty must be 1, 2, or 3`);
  }

  let sawRecompute = false;

  for (let seed = 1; seed <= SEEDS_PER_TEMPLATE; seed += 1) {
    const rng = mulberry32(seed * 2654435761 + 1);
    let q: Question;
    try {
      q = instantiate(template, rng);
    } catch (e) {
      fail(`${template.id} seed ${seed}: generate/buildChoices threw -- ${(e as Error).message}`);
      continue;
    }
    totalInstances += 1;

    if (!Array.isArray(q.choices) || q.choices.length !== 4) {
      fail(`${template.id} seed ${seed}: expected 4 choices, got ${q.choices?.length}`);
      continue;
    }
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) {
      fail(`${template.id} seed ${seed}: answer must be 0-3, got ${q.answer}`);
      continue;
    }
    const correctText = q.choices[q.answer];
    if (typeof correctText !== 'string' || correctText.trim() === '') {
      fail(`${template.id} seed ${seed}: choices[answer] is empty`);
    }
    const normSet = new Set(q.choices.map((c) => c.trim()));
    if (normSet.size !== 4) {
      fail(`${template.id} seed ${seed}: duplicate choices -- ${JSON.stringify(q.choices)}`);
    }
    if (typeof q.prompt !== 'string' || q.prompt.trim().length < 2) {
      fail(`${template.id} seed ${seed}: prompt missing or too short`);
    }
    if (typeof q.explain !== 'string' || q.explain.trim().length < 10) {
      fail(`${template.id} seed ${seed}: explain missing or too short`);
    }
    if (!ASCII_RE.test(q.prompt)) fail(`${template.id} seed ${seed}: non-ASCII character in prompt`);
    if (!ASCII_RE.test(q.explain)) fail(`${template.id} seed ${seed}: non-ASCII character in explain`);
    for (const c of q.choices) {
      if (!ASCII_RE.test(c)) fail(`${template.id} seed ${seed}: non-ASCII character in a choice`);
    }

    const expected = recompute(q);
    if (expected !== null) {
      sawRecompute = true;
      recomputedInstances += 1;
      if (expected !== correctText) {
        fail(
          `${template.id} seed ${seed}: independent recompute expected "${expected}" but choices[answer] is "${correctText}" (prompt: ${q.prompt})`,
        );
      }
    }
  }

  if (sawRecompute) verifiedTopics.add(template.id);
}

if (GRADE_3_TEMPLATES.length < 34 || GRADE_3_TEMPLATES.length > 40) {
  fail(`GRADE_3_TEMPLATES has ${GRADE_3_TEMPLATES.length} templates, expected 34-40`);
}

// ---------------------------------------------------------------------------
// Sabotage self-tests: feed deliberately WRONG instances through the same
// recompute() checks used above and confirm they get flagged. If any of these
// fails to catch its planted bug, the checker itself is untrustworthy.
// ---------------------------------------------------------------------------

let sabotageCaught = 0;

function expectCaught(label: string, q: Question) {
  const expected = recompute(q);
  if (expected === null) {
    fail(`sabotage "${label}": recompute() could not parse the planted prompt at all`);
    return;
  }
  const actual = q.choices[q.answer];
  if (expected === actual) {
    fail(`sabotage "${label}": planted a wrong answer but the checker did NOT catch it`);
  } else {
    sabotageCaught += 1;
  }
}

// 1. Multiplication fact with a deliberately wrong product (off by one).
expectCaught('multiplication off-by-one', {
  id: 'sabotage-1',
  subject: 'math',
  kind: 'math_achievement',
  difficulty: 1,
  prompt: 'What is 6 x 7?',
  choices: ['41', '43', '42', '44'], // real product is 42 at index 2
  answer: 1, // deliberately points at 43, not 42
  explain: 'sabotage instance',
});

// 2. Rectangle area formula swapped to perimeter's (add instead of multiply).
expectCaught('area formula swapped to perimeter', {
  id: 'sabotage-2',
  subject: 'math',
  kind: 'math_achievement',
  difficulty: 2,
  prompt: 'A rectangle is 6 cm long and 4 cm wide. What is its area?',
  choices: ['20 sq cm', '24 sq cm', '10 sq cm', '26 sq cm'],
  answer: 0, // 6x4=24 is correct (index 1); this claims 20 (6+4x2) is correct
  explain: 'sabotage instance',
});

// 3. Compare-whole-numbers winner swapped to the second-largest.
expectCaught('compare numbers wrong winner', {
  id: 'sabotage-3',
  subject: 'quantitative',
  kind: 'quant_reasoning',
  difficulty: 1,
  prompt: 'Which number is the greatest? 412, 903, 588, 217',
  choices: ['588', '903', '412', '217'],
  answer: 0, // 903 is actually greatest (index 1); this claims 588 is
  explain: 'sabotage instance',
});

if (sabotageCaught !== 3) {
  fail(`expected all 3 sabotage self-tests to be caught, but only ${sabotageCaught} were`);
}

// ---------------------------------------------------------------------------

console.log(`templates: ${GRADE_3_TEMPLATES.length}`);
console.log(`instances generated: ${totalInstances} (${SEEDS_PER_TEMPLATE} seeds x ${GRADE_3_TEMPLATES.length} templates)`);
console.log(`instances independently recomputed and matched: ${recomputedInstances}`);
console.log(`templates covered by independent recompute: ${verifiedTopics.size} / ${GRADE_3_TEMPLATES.length}`);
console.log(`sabotage self-tests caught: ${sabotageCaught} / 3`);

if (errors.length) {
  console.error(`\n${errors.length} ERROR(S):`);
  for (const e of errors.slice(0, 50)) console.error(`  x ${e}`);
  if (errors.length > 50) console.error(`  ... and ${errors.length - 50} more`);
  process.exit(1);
}

console.log(
  `\nAll checks passed: ${totalInstances} instances across ${GRADE_3_TEMPLATES.length} templates, ${recomputedInstances} independently verified, 3/3 sabotage tests caught.`,
);
