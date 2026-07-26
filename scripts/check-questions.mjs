/**
 * Structural validation of the fixed-text question bank.
 *
 * Cannot catch a wrong answer key (that needs a human), but it does catch every
 * mechanical failure: duplicate ids, a 3-choice question, an `answer` pointing
 * past the end of `choices`, a reading question that lost its passage, smart
 * quotes that render as mojibake on iOS, and — since the vocabulary was written
 * by six independent authors — the same target word defined twice.
 *
 * Templated math lives in scripts/check-logic.ts instead, because it has to be
 * executed rather than read.
 *
 * Run: npm run check:questions
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BANK_DIR = join(HERE, '..', 'lib', 'questions');

const FILES = [
  { file: 'verbal.ts', subject: 'verbal', prefix: 'vb', kinds: ['synonym', 'sentence_completion'] },
  { file: 'reading.ts', subject: 'reading', prefix: 'rc', kinds: ['reading'] },
  { file: 'reading2.ts', subject: 'reading', prefix: 'rc2', kinds: ['reading'] },
  { file: 'reading3.ts', subject: 'reading', prefix: 'rc3', kinds: ['reading'] },
  { file: 'vocab/ab.ts', subject: 'verbal', prefix: 'vc-ab', kinds: ['synonym'] },
  { file: 'vocab/cd.ts', subject: 'verbal', prefix: 'vc-cd', kinds: ['synonym'] },
  { file: 'vocab/eh.ts', subject: 'verbal', prefix: 'vc-eh', kinds: ['synonym'] },
  { file: 'vocab/im.ts', subject: 'verbal', prefix: 'vc-im', kinds: ['synonym'] },
  { file: 'vocab/nr.ts', subject: 'verbal', prefix: 'vc-nr', kinds: ['synonym'] },
  { file: 'vocab/sz.ts', subject: 'verbal', prefix: 'vc-sz', kinds: ['synonym'] },
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
/** Synonym target word -> where it was first defined, for cross-file dupes. */
const seenWords = new Map();
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
  const passageTexts = new Map();

  bank.forEach((q, i) => {
    const at = `${spec.file}[${i}] (${q?.id ?? 'no id'})`;
    total += 1;

    if (!q || typeof q !== 'object') {
      errors.push(`${at}: not an object`);
      return;
    }

    if (typeof q.id !== 'string' || !q.id.startsWith(`${spec.prefix}-`)) {
      errors.push(`${at}: id must start with "${spec.prefix}-"`);
    }
    if (seenIds.has(q.id)) errors.push(`${at}: duplicate id`);
    seenIds.add(q.id);

    if (q.subject !== spec.subject) {
      errors.push(`${at}: subject is "${q.subject}", expected "${spec.subject}"`);
    }
    if (!spec.kinds.includes(q.kind)) {
      errors.push(`${at}: kind "${q.kind}" not one of ${spec.kinds.join(', ')}`);
    }

    if (typeof q.prompt !== 'string' || q.prompt.trim().length < 2) {
      errors.push(`${at}: prompt missing or too short`);
    }
    if (typeof q.explain !== 'string' || q.explain.trim().length < 10) {
      errors.push(`${at}: explain missing or too short`);
    }

    // Six authors wrote the vocabulary independently. The same word defined
    // twice means one of them silently wasted a slot, and she would see it as
    // a repeat.
    if (q.kind === 'synonym' && typeof q.prompt === 'string') {
      const word = q.prompt.trim().toUpperCase();
      const prior = seenWords.get(word);
      if (prior) errors.push(`${at}: target word "${word}" already defined in ${prior}`);
      else seenWords.set(word, spec.file);
    }

    // Reading questions carry five options, so a blind guess is one-in-five;
    // every other kind is exactly four.
    const wantChoices = q.kind === 'reading' ? 5 : 4;
    if (!Array.isArray(q.choices) || q.choices.length !== wantChoices) {
      errors.push(`${at}: needs exactly ${wantChoices} choices, has ${q.choices?.length}`);
    } else {
      q.choices.forEach((c, ci) => {
        if (typeof c !== 'string' || c.trim() === '') {
          errors.push(`${at}: choice ${ci} is empty`);
        }
      });
      const norm = q.choices.map((c) => String(c).trim().toLowerCase());
      if (new Set(norm).size !== wantChoices) {
        errors.push(`${at}: duplicate choices — ${JSON.stringify(q.choices)}`);
      }
    }
    const maxAnswer = wantChoices - 1;
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > maxAnswer) {
      errors.push(`${at}: answer must be an integer 0-${maxAnswer}, got ${q.answer}`);
    } else {
      // The distribution tally only has four buckets; a fifth reading slot would
      // skew "answers spread across positions", so it is counted mod 4.
      const bucket = q.answer % 4;
      fileTally[bucket] += 1;
      answerTally[bucket] += 1;
    }

    if (![1, 2, 3].includes(q.difficulty)) {
      errors.push(`${at}: difficulty must be 1, 2, or 3 — got ${q.difficulty}`);
    }

    if (spec.subject === 'reading') {
      if (typeof q.passage !== 'string' || q.passage.trim().length < 100) {
        errors.push(`${at}: reading question needs a passage`);
      } else {
        const words = q.passage.trim().split(/\s+/).length;
        if (words > 130) warnings.push(`${at}: passage is ${words} words (target <= 120)`);
        const prev = passageTexts.get(q.passageId);
        if (prev !== undefined && prev !== q.passage) {
          errors.push(`${at}: passageId "${q.passageId}" has two different passage texts`);
        }
        passageTexts.set(q.passageId, q.passage);
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
    `${spec.file.padEnd(16)} ${String(bank.length).padStart(3)} questions   ` +
      `answer spread ${pcts.map((p) => `${p}%`).join(' / ')}${skewed ? '  <- skewed' : ''}`,
  );
  if (skewed) {
    warnings.push(`${spec.file}: answer index distribution is skewed (${pcts.join('/')})`);
  }
  if (spec.subject === 'reading') {
    console.log(`${''.padEnd(16)} ${passageTexts.size} distinct passages`);
  }
}

console.log(`\ntotal fixed-text questions: ${total}`);
console.log(`distinct vocabulary words: ${seenWords.size}`);
console.log(
  `overall answer spread: ${answerTally.map((n) => Math.round((n / total) * 100) + '%').join(' / ')}`,
);

if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings) console.log(`  ! ${w}`);
}

if (errors.length) {
  console.error(`\n${errors.length} ERROR(S):`);
  for (const e of errors.slice(0, 40)) console.error(`  x ${e}`);
  if (errors.length > 40) console.error(`  … and ${errors.length - 40} more`);
  process.exit(1);
}

console.log('\nAll structural checks passed.');
