import { shouldOfferScratch } from '../components/QuestionGate';
import { emptyProgress, recordAnswer } from '../lib/progress';
import { ALL_TEMPLATES, STATIC_QUESTIONS, pickQuestion, type Question } from '../lib/questions';
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
for (const question of all.filter((q) => q.id === 'mt3-003')) {
  const match = question.prompt.match(/(\d+)\/(\d+)/);
  assert(match && gcdForCheck(Number(match[1]), Number(match[2])) === 1, `${question.prompt} must use a reduced fraction`);
}

let p = emptyProgress(); p = recordAnswer(p, { id: 'vc-demo', subject: 'verbal', correct: true, vocabulary: true }); p = recordAnswer(p, { id: 'vc-demo', subject: 'verbal', correct: true, vocabulary: true });
assert(p.vocabulary['vc-demo'].correctStreak === 2 && p.vocabulary['vc-demo'].dueAt > p.totalSeen, 'two correct vocabulary answers must create a long delay');
p = recordAnswer(p, { id: 'vc-demo', subject: 'verbal', correct: false, vocabulary: true });
assert(p.vocabulary['vc-demo'].misses === 1 && p.vocabulary['vc-demo'].dueAt === p.totalSeen, 'a missed word must be immediately due');
const oldRandom = Math.random; Math.random = () => .01;
const picked = pickQuestion({ vocabulary: { 'vc-ab-001': { correctStreak: 0, misses: 2, dueAt: 0 } }, vocabularyClock: 0 }); Math.random = oldRandom;
assert(picked.id === 'vc-ab-001', 'a missed vocabulary word must be prioritized');
console.log(`Learning audit: ${all.length} explanations, ${fractions.length} fraction walkthroughs, scratch criteria, and vocabulary spacing passed.`);

function gcdForCheck(a: number, b: number): number {
  while (b !== 0) [a, b] = [b, a % b];
  return Math.abs(a);
}
