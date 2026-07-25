/**
 * Structural validation of the question bank.
 *
 * Cannot catch a wrong answer key (that needs a human or a second model), but it
 * does catch every mechanical failure: duplicate ids, a 3-choice question, an
 * `answer` pointing past the end of `choices`, a reading question that lost its
 * passage, smart quotes that render as mojibake on iOS.
 *
 * The bank files are pure data, so they're evaluated by stripping the type-only
 * import and the annotation rather than compiling the whole project.
 *
 * Run: node scripts/check-questions.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BANK_DIR = join(HERE, '..', 'lib', 'questions');

const FILES = [
  { file: 'verbal.ts', subject: 'verbal', prefix: 'vb', kinds: ['synonym', 'sentence_completion'] },
  { file: 'quantitative.ts', subject: 'quantitative', prefix: 'qr', kinds: ['quant_reasoning'] },
  { file: 'math.ts', subject: 'math', prefix: 'ma', kinds: ['math_achievement'] },
  { file: 'reading.ts', subject: 'reading', prefix: 'rc', kinds: ['reading'] },
];

function loadBank(file) {
  const src = readFileSync(join(BANK_DIR, file), 'utf8')
    .replace(/^\s*import\s+type\s+.*$/m, '')
    .replace(/export\s+const\s+\w+\s*:\s*Question\[\]\s*=/, 'return');
  return new Function(src)();
}

const errors = [];
const warnings = [];
const seenIds = new Set();
let total = 0;
const answerTally = [0, 0, 0, 0];

for (const spec of FILES) {
  let bank;
  try {
    bank = loadBank(spec.file);
  } catch (e) {
    errors.push(`${spec.file}: failed to evaluate — ${e.message}`);
    continue;
  }

  if (!Array.isArray(bank)) {
    errors.push(`${spec.file}: did not export an array`);
    continue;
  }

  const fileTally = [0, 0, 0, 0];
  const passageWords = new Map();

  bank.forEach((q, i) => {
    const at = `${spec.file}[${i}] (${q?.id ?? 'no id'})`;
    total += 1;

    if (!q || typeof q !== 'object') {
      errors.push(`${at}: not an object`);
      return;
    }

    // Identity
    if (typeof q.id !== 'string' || !q.id.startsWith(`${spec.prefix}-`)) {
      errors.push(`${at}: id must start with "${spec.prefix}-"`);
    }
    if (seenIds.has(q.id)) errors.push(`${at}: duplicate id`);
    seenIds.add(q.id);

    // Taxonomy
    if (q.subject !== spec.subject) {
      errors.push(`${at}: subject is "${q.subject}", expected "${spec.subject}"`);
    }
    if (!spec.kinds.includes(q.kind)) {
      errors.push(`${at}: kind "${q.kind}" not one of ${spec.kinds.join(', ')}`);
    }

    // Prompt + explanation
    if (typeof q.prompt !== 'string' || q.prompt.trim().length < 2) {
      errors.push(`${at}: prompt missing or too short`);
    }
    if (typeof q.explain !== 'string' || q.explain.trim().length < 10) {
      errors.push(`${at}: explain missing or too short`);
    }

    // Choices + answer key
    if (!Array.isArray(q.choices) || q.choices.length !== 4) {
      errors.push(`${at}: needs exactly 4 choices, has ${q.choices?.length}`);
    } else {
      q.choices.forEach((c, ci) => {
        if (typeof c !== 'string' || c.trim() === '') {
          errors.push(`${at}: choice ${ci} is empty`);
        }
      });
      const norm = q.choices.map((c) => String(c).trim().toLowerCase());
      if (new Set(norm).size !== 4) {
        errors.push(`${at}: duplicate choices — ${JSON.stringify(q.choices)}`);
      }
    }
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) {
      errors.push(`${at}: answer must be an integer 0-3, got ${q.answer}`);
    } else {
      fileTally[q.answer] += 1;
      answerTally[q.answer] += 1;
    }

    // Difficulty
    if (![1, 2, 3].includes(q.difficulty)) {
      errors.push(`${at}: difficulty must be 1, 2, or 3 — got ${q.difficulty}`);
    }

    // Passage rules
    if (spec.subject === 'reading') {
      if (typeof q.passage !== 'string' || q.passage.trim().length < 100) {
        errors.push(`${at}: reading question needs a passage`);
      } else {
        const words = q.passage.trim().split(/\s+/).length;
        if (words > 130) warnings.push(`${at}: passage is ${words} words (target <= 120)`);
        const prev = passageWords.get(q.passageId);
        if (prev !== undefined && prev !== q.passage) {
          errors.push(`${at}: passageId "${q.passageId}" has two different passage texts`);
        }
        passageWords.set(q.passageId, q.passage);
      }
      if (typeof q.passageId !== 'string' || q.passageId === '') {
        errors.push(`${at}: reading question needs a passageId`);
      }
    } else if (q.passage !== undefined || q.passageId !== undefined) {
      errors.push(`${at}: non-reading question must not carry a passage`);
    }

    // Non-ASCII renders inconsistently across the iOS/desktop font stack.
    for (const [field, value] of Object.entries(q)) {
      if (typeof value === 'string' && /[^\x20-\x7E\n]/.test(value)) {
        errors.push(`${at}: non-ASCII character in "${field}"`);
      }
    }
  });

  const pcts = fileTally.map((n) => Math.round((n / bank.length) * 100));
  const skewed = pcts.some((p) => p > 40);
  console.log(
    `${spec.file.padEnd(18)} ${String(bank.length).padStart(3)} questions   ` +
      `answer spread ${pcts.map((p) => `${p}%`).join(' / ')}${skewed ? '  <- skewed' : ''}`,
  );
  if (skewed) {
    warnings.push(`${spec.file}: answer index distribution is skewed (${pcts.join('/')})`);
  }
  if (spec.subject === 'reading') {
    console.log(`${''.padEnd(18)} ${passageWords.size} distinct passages`);
  }
}

console.log(`\ntotal: ${total} questions`);
console.log(`overall answer spread: ${answerTally.map((n) => Math.round((n / total) * 100) + '%').join(' / ')}`);

if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings) console.log(`  ! ${w}`);
}

if (errors.length) {
  console.error(`\n${errors.length} ERROR(S):`);
  for (const e of errors) console.error(`  x ${e}`);
  process.exit(1);
}

console.log('\nAll structural checks passed.');
