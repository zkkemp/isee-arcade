import type { Question, Subject } from './types';
import { VERBAL_QUESTIONS } from './verbal';
import { QUANTITATIVE_QUESTIONS } from './quantitative';
import { READING_QUESTIONS } from './reading';
import { MATH_QUESTIONS } from './math';

export * from './types';

export const ALL_QUESTIONS: Question[] = [
  ...VERBAL_QUESTIONS,
  ...QUANTITATIVE_QUESTIONS,
  ...READING_QUESTIONS,
  ...MATH_QUESTIONS,
];

export const QUESTIONS_BY_ID = new Map(ALL_QUESTIONS.map((q) => [q.id, q]));

export const ALL_SUBJECTS: Subject[] = ['verbal', 'quantitative', 'reading', 'math'];

export function countBySubject(): Record<Subject, number> {
  const out: Record<Subject, number> = { verbal: 0, quantitative: 0, reading: 0, math: 0 };
  for (const q of ALL_QUESTIONS) out[q.subject] += 1;
  return out;
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export type PickArgs = {
  /** Subjects the player enabled. Empty or undefined means all. */
  subjects?: Subject[];
  /** Question ids seen recently this session, freshest last. Avoided when possible. */
  recentIds?: string[];
  /** passageIds already used this session. Avoided so a passage is not re-read. */
  recentPassageIds?: string[];
  /** questionId -> outstanding misses, from Progress.missed. */
  missed?: Record<string, number>;
  /** Recent accuracy 0..1, or null when there is not enough data yet. */
  recentAccuracy?: number | null;
};

/**
 * Chooses the next question. Three ideas stacked, in priority order:
 *  1. Spaced repetition - a previously missed question gets re-asked ~35% of the time.
 *  2. Novelty - anything seen recently this session is filtered out first.
 *  3. Adaptive difficulty - a hot streak pulls harder questions, a cold streak eases off.
 */
export function pickQuestion(args: PickArgs = {}): Question {
  const {
    subjects,
    recentIds = [],
    recentPassageIds = [],
    missed = {},
    recentAccuracy = null,
  } = args;

  const allowed = subjects && subjects.length > 0 ? new Set(subjects) : null;
  const inScope = ALL_QUESTIONS.filter((q) => !allowed || allowed.has(q.subject));
  if (inScope.length === 0) return pickRandom(ALL_QUESTIONS);

  const recent = new Set(recentIds);
  const usedPassages = new Set(recentPassageIds);

  // Prefer questions that are neither recently seen nor tied to an already-read passage.
  const fresh = inScope.filter(
    (q) => !recent.has(q.id) && (!q.passageId || !usedPassages.has(q.passageId)),
  );
  // Fall back progressively rather than ever returning nothing.
  const pool = fresh.length > 0 ? fresh : inScope.filter((q) => !recent.has(q.id));
  const usable = pool.length > 0 ? pool : inScope;

  // 1. Spaced repetition.
  const reviewable = usable.filter((q) => (missed[q.id] ?? 0) > 0);
  if (reviewable.length > 0 && Math.random() < 0.35) {
    return pickRandom(reviewable);
  }

  // 2. Adaptive difficulty.
  let target: 1 | 2 | 3 = 2;
  if (recentAccuracy !== null) {
    if (recentAccuracy >= 0.85) target = 3;
    else if (recentAccuracy < 0.5) target = 1;
  }

  const atTarget = usable.filter((q) => q.difficulty === target);
  if (atTarget.length > 0) return pickRandom(atTarget);

  const nearTarget = usable.filter((q) => Math.abs(q.difficulty - target) === 1);
  if (nearTarget.length > 0) return pickRandom(nearTarget);

  return pickRandom(usable);
}
