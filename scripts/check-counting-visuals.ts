/**
 * Focused regression checker for the K/grade-1 picture-counting experience.
 *
 * It proves the generated pictures contain the right number of objects without
 * relying on the answer text, prevents a return to tiny "* * *" strings, and
 * guards the phone/iPad responsive layout hooks in QuestionGate.
 *
 * Run: node --import tsx scripts/check-counting-visuals.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { GRADE_1_TEMPLATES } from '../lib/questions/grade1';
import { GRADE_K_TEMPLATES } from '../lib/questions/gradeK';
import { instantiate, mulberry32 } from '../lib/questions/templates';
import type { Question } from '../lib/questions/types';

const errors: string[] = [];
const fail = (message: string) => errors.push(message);

const expectedFromPictures: Record<string, (q: Question) => string> = {
  'gk-001': (q) => String(q.visual!.groups[0].count),
  'gk-002': (q) => String(q.visual!.groups[0].count),
  'gk-010': (q) => String(q.visual!.groups.reduce((sum, group) => sum + group.count, 0)),
  'gk-011': (q) => {
    const wantMore = q.prompt.includes('more');
    const sorted = [...q.visual!.groups].sort((a, b) =>
      wantMore ? b.count - a.count : a.count - b.count,
    );
    return sorted[0].label!;
  },
  'gk-012': (q) =>
    q.visual!.groups[0].count === q.visual!.groups[1].count ? 'same' : 'different',
  'gk-025': (q) => String(q.visual!.groups.reduce((sum, group) => sum + group.count, 0)),
  'g1-001': (q) => String(q.visual!.groups[0].count),
  'g1-002': (q) => String(q.visual!.groups[0].count),
  'g1-030': (q) => String(Math.max(...q.visual!.groups.map((group) => group.count))),
};

const templates = [...GRADE_K_TEMPLATES, ...GRADE_1_TEMPLATES].filter(
  (template) => expectedFromPictures[template.id],
);

if (templates.length !== Object.keys(expectedFromPictures).length) {
  fail(`expected ${Object.keys(expectedFromPictures).length} picture templates, found ${templates.length}`);
}

let instances = 0;
for (const template of templates) {
  for (let seed = 1; seed <= 500; seed += 1) {
    const q = instantiate(template, mulberry32(seed));
    instances += 1;
    if (q.visual?.kind !== 'counting' || q.visual.groups.length === 0) {
      fail(`${q.id} seed ${seed}: missing structured counting picture`);
      continue;
    }
    if (/(\*\s*){2,}|(\bo\s+){2,}o\b/.test(q.prompt)) {
      fail(`${q.id} seed ${seed}: prompt regressed to tiny text marks`);
    }
    for (const group of q.visual.groups) {
      if (!Number.isInteger(group.count) || group.count < 1 || group.count > 20) {
        fail(`${q.id} seed ${seed}: unsafe picture count ${group.count}`);
      }
      if (!group.item) fail(`${q.id} seed ${seed}: picture item is missing`);
    }
    const expected = expectedFromPictures[q.id](q);
    const actual = q.choices[q.answer];
    if (actual !== expected) {
      fail(`${q.id} seed ${seed}: pictures imply "${expected}", answer is "${actual}"`);
    }
  }
}

const source = fs.readFileSync(
  path.join(process.cwd(), 'components', 'QuestionGate.tsx'),
  'utf8',
);
const layoutRequirements = [
  ['phone five-across wrapping', 'grid-cols-5'],
  ['iPad ten-across wrapping', 'sm:grid-cols-10'],
  ['iPad comparison columns', 'sm:grid-cols-2'],
  ['large phone objects', 'min-h-12'],
  ['larger iPad objects', 'sm:min-h-14'],
  ['counting-picture landmark', 'data-counting-picture'],
] as const;
for (const [label, token] of layoutRequirements) {
  if (!source.includes(token)) fail(`QuestionGate missing ${label} (${token})`);
}

if (errors.length > 0) {
  console.error(`Counting-picture audit failed with ${errors.length} error(s):`);
  for (const error of errors.slice(0, 50)) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(
  `Counting-picture audit passed: ${instances} generated questions plus phone/iPad layout guards.`,
);
