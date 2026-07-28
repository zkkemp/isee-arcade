import fs from 'node:fs';
import path from 'node:path';
import { shouldOfferScratch } from '../components/QuestionGate';
import { emptyProgress, recordAnswer } from '../lib/progress';
import { ALL_TEMPLATES, STATIC_QUESTIONS, familyIdsForBand, pickQuestion, type Question } from '../lib/questions';
import { instantiate, mulberry32 } from '../lib/questions/templates';
import { GRADE_K_TEMPLATES } from '../lib/questions/gradeK';
import { GRADE_1_TEMPLATES } from '../lib/questions/grade1';
import { GRADE_3_TEMPLATES } from '../lib/questions/grade3';

function assert(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
const all: Question[] = [...STATIC_QUESTIONS, ...[...ALL_TEMPLATES, ...GRADE_K_TEMPLATES, ...GRADE_1_TEMPLATES, ...GRADE_3_TEMPLATES].flatMap((t) => Array.from({ length: 12 }, (_, seed) => instantiate(t, mulberry32(seed + 1))))];
for (const q of all) { assert(q.choices[q.answer] !== undefined, `${q.id} has no answer choice`); assert(q.explain.trim().length >= 12 && !/undefined|NaN/.test(q.explain), `${q.id} has a broken explanation`); }
const fractions = all.filter((q) => q.topic === 'fraction of a set' || q.topic === 'fraction of a quantity');
assert(fractions.length > 0 && fractions.every((q) => /group|split|divide/i.test(q.explain) && /take|x|×/i.test(q.explain)), 'fraction-of-whole explanations must show equal groups then chosen groups');
assert(shouldOfferScratch({ ...all.find((q) => q.topic === 'fraction of a set')!, difficulty: 2 }), 'hard fraction work needs scratch paper');
assert(shouldOfferScratch({ ...all.find((q) => q.subject === 'quantitative')!, difficulty: 3 }), 'hard quantitative work needs scratch paper');
assert(!shouldOfferScratch({ ...STATIC_QUESTIONS[0], subject: 'verbal', difficulty: 3 }), 'verbal question must not show math scratch paper');
const equalGroupSteps = all.filter((q) => q.id === 'mt3-003' || q.id === 'mt3-004');
assert(equalGroupSteps.length > 0 && equalGroupSteps.every((q) => q.explain.split('\n').length === 3), 'fraction-of-whole walkthroughs must render as three visible steps');

let p = emptyProgress(); p = recordAnswer(p, { id: 'vc-demo', subject: 'verbal', correct: true, vocabulary: true }); p = recordAnswer(p, { id: 'vc-demo', subject: 'verbal', correct: true, vocabulary: true });
assert(p.vocabulary['vc-demo'].correctStreak === 2 && p.vocabulary['vc-demo'].dueAt > p.totalSeen, 'two correct vocabulary answers must create a long delay');
p = recordAnswer(p, { id: 'vc-demo', subject: 'verbal', correct: false, vocabulary: true });
assert(p.vocabulary['vc-demo'].misses === 1 && p.vocabulary['vc-demo'].dueAt === p.totalSeen, 'a missed word must be immediately due');
const oldRandom = Math.random; Math.random = () => .01;
const picked = pickQuestion({ vocabulary: { 'vc-ab-001': { correctStreak: 0, misses: 2, dueAt: 0 } }, vocabularyClock: 0 }); Math.random = oldRandom;
assert(picked.id === 'vc-ab-001', 'a missed vocabulary word must be prioritized');
const iseeIds = familyIdsForBand('isee');
assert(
  iseeIds.every((id) => !/^gk-|^g1-|^g3-/.test(id)),
  'a younger-grade question leaked into the ISEE bank',
);
for (const band of ['k', 'grade1', 'grade3'] as const) {
  const gradePrefix = band === 'k' ? 'gk-' : band === 'grade1' ? 'g1-' : 'g3-';
  assert(
    familyIdsForBand(band).every((id) => id.startsWith(gradePrefix) || id.startsWith('fig-')),
    `${band} contains an out-of-band question`,
  );
}

const shellSource = fs.readFileSync(
  path.join(process.cwd(), 'components', 'GameShell.tsx'),
  'utf8',
);
const answerHandler = shellSource
  .split('const handleAnswered = useCallback(', 2)[1]
  ?.split('const gateHeadline', 1)[0] ?? '';
assert(
  !/playSound\(['"](?:correct|wrong)['"]\)/.test(answerHandler),
  'question answers must stay silent; correct/wrong sounds belong to games only',
);

const accordionSource = fs.readFileSync(
  path.join(process.cwd(), 'components', 'StableGameCategory.tsx'),
  'utf8',
);
assert(
  accordionSource.includes("scrollIntoView({ block: 'start'"),
  'game categories must keep the newly opened shelf heading in view',
);

console.log(
  `Learning audit: ${all.length} explanations, ${fractions.length} fraction walkthroughs, ` +
    'scratch criteria, vocabulary spacing, silent answers, and stable category scrolling passed.',
);
