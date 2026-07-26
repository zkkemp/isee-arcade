import type { Question, QuestionKind, Subject } from './types';
import { instantiate, type QuestionTemplate } from './templates';
import { VERBAL_QUESTIONS } from './verbal';
import { READING_QUESTIONS } from './reading';
import { READING_QUESTIONS_2 } from './reading2';
import { READING_QUESTIONS_3 } from './reading3';
import { VOCAB_AB } from './vocab/ab';
import { VOCAB_CD } from './vocab/cd';
import { VOCAB_EH } from './vocab/eh';
import { VOCAB_IM } from './vocab/im';
import { VOCAB_NR } from './vocab/nr';
import { VOCAB_SZ } from './vocab/sz';
import { MATH_TEMPLATES } from './mathTemplates';
import { MATH_TEMPLATES_2 } from './mathTemplates2';
import { MATH_TEMPLATES_3 } from './mathTemplates3';
import { QUANT_TEMPLATES } from './quantTemplates';
import { QUANT_TEMPLATES_2 } from './quantTemplates2';
import { QUANT_TEMPLATES_3 } from './quantTemplates3';

export * from './types';

/**
 * Verbal and reading are fixed text — a synonym cannot be parameterized.
 * Math and quantitative are templates instead, so the numbers change on every
 * serving and the answer cannot be memorized.
 */
export const STATIC_QUESTIONS: Question[] = [
  ...VERBAL_QUESTIONS,
  ...READING_QUESTIONS,
  ...READING_QUESTIONS_2,
  ...READING_QUESTIONS_3,
  ...VOCAB_AB,
  ...VOCAB_CD,
  ...VOCAB_EH,
  ...VOCAB_IM,
  ...VOCAB_NR,
  ...VOCAB_SZ,
];

export const ALL_TEMPLATES: QuestionTemplate[] = [
  ...MATH_TEMPLATES,
  ...MATH_TEMPLATES_2,
  ...MATH_TEMPLATES_3,
  ...QUANT_TEMPLATES,
  ...QUANT_TEMPLATES_2,
  ...QUANT_TEMPLATES_3,
];

/**
 * Anything the picker can serve. `materialize` either returns the fixed question
 * or generates a fresh instance of a template.
 */
type Candidate = {
  id: string;
  subject: Subject;
  kind: QuestionKind;
  difficulty: 1 | 2 | 3;
  topic?: string;
  passageId?: string;
  materialize: () => Question;
};

const CANDIDATES: Candidate[] = [
  ...STATIC_QUESTIONS.map((q) => ({
    id: q.id,
    subject: q.subject,
    kind: q.kind,
    difficulty: q.difficulty,
    topic: q.topic,
    passageId: q.passageId,
    materialize: () => q,
  })),
  ...ALL_TEMPLATES.map((t) => ({
    id: t.id,
    subject: t.subject,
    kind: t.kind,
    difficulty: t.difficulty,
    topic: t.topic,
    materialize: () => instantiate(t),
  })),
];

const BY_ID = new Map(CANDIDATES.map((c) => [c.id, c]));

export const ALL_SUBJECTS: Subject[] = ['verbal', 'quantitative', 'reading', 'math'];

/** Distinct question families available, counting each template once. */
export function countBySubject(): Record<Subject, number> {
  const out: Record<Subject, number> = { verbal: 0, quantitative: 0, reading: 0, math: 0 };
  for (const c of CANDIDATES) out[c.subject] += 1;
  return out;
}

export function questionById(id: string): Question | null {
  return BY_ID.get(id)?.materialize() ?? null;
}

export const TOTAL_FAMILIES = CANDIDATES.length;
export const TEMPLATE_COUNT = ALL_TEMPLATES.length;

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export type PickArgs = {
  /** Subjects the player enabled. Empty or undefined means all. */
  subjects?: Subject[];
  /** Question ids seen recently this session, freshest last. Avoided when possible. */
  recentIds?: string[];
  /** passageIds already read this session. Avoided so a passage is not re-read. */
  recentPassageIds?: string[];
  /** questionId -> outstanding misses, from Progress.missed. */
  missed?: Record<string, number>;
  /** Recent accuracy 0..1, or null when there is not enough data yet. */
  recentAccuracy?: number | null;
  /**
   * Set when the player just got a question wrong. The next question must be of
   * the same kind so they practice the thing they missed rather than skating to
   * an easier category. A templated question re-serves the SAME family with new
   * numbers; a fixed question serves a different one of the same kind.
   */
  sameKindAs?: Question | null;
  /**
   * Restrict to one kind. The study block uses this to serve exactly one reading
   * question per block, rather than leaving it to chance.
   */
  forceKind?: QuestionKind | null;
  /**
   * Kind to steer away from, so questions rotate between sections instead of
   * serving two of the same in a row. Reading passages are long, and two back to
   * back is where a kid checks out. Ignored when `sameKindAs` is set, because a
   * wrong answer deliberately keeps them on the same kind.
   */
  /**
   * Kinds to rotate away from. Takes a list because the study block needs to
   * exclude reading for the rest of the block AND still rotate away from
   * whatever was just answered.
   */
  avoidKind?: QuestionKind | QuestionKind[] | null;
};

export function pickQuestion(args: PickArgs = {}): Question {
  const {
    subjects,
    recentIds = [],
    recentPassageIds = [],
    missed = {},
    recentAccuracy = null,
    sameKindAs = null,
    avoidKind = null,
    forceKind = null,
  } = args;

  // --- retry path: stay on the thing they just missed ---
  if (sameKindAs) {
    // Templated: regenerate the same family. New numbers, same shape — this is
    // the whole reason templates exist.
    if (sameKindAs.topic) {
      const sameTopic = CANDIDATES.find(
        (c) => c.topic === sameKindAs.topic && c.id === sameKindAs.id,
      );
      if (sameTopic) return sameTopic.materialize();
    }
    // Fixed text: another question of the same kind that they have not just seen.
    const recent = new Set(recentIds);
    const usedPassages = new Set(recentPassageIds);
    const sameKind = CANDIDATES.filter((c) => c.kind === sameKindAs.kind);
    const fresh = sameKind.filter(
      (c) => !recent.has(c.id) && (!c.passageId || !usedPassages.has(c.passageId)),
    );
    const pool = fresh.length > 0 ? fresh : sameKind.filter((c) => c.id !== sameKindAs.id);
    if (pool.length > 0) return pickRandom(pool).materialize();
    if (sameKind.length > 0) return pickRandom(sameKind).materialize();
  }

  // --- normal path ---
  const allowed = subjects && subjects.length > 0 ? new Set(subjects) : null;
  let inScope = CANDIDATES.filter((c) => !allowed || allowed.has(c.subject));
  if (inScope.length === 0) return pickRandom(CANDIDATES).materialize();

  // An explicit kind wins over rotation. Falls back rather than returning
  // nothing if that kind is somehow empty.
  if (forceKind) {
    const only = inScope.filter((c) => c.kind === forceKind);
    if (only.length > 0) inScope = only;
  }

  // Rotate sections. Falls back to the unfiltered pool if avoiding the kind
  // would leave nothing to serve.
  if (avoidKind) {
    const avoid = new Set(Array.isArray(avoidKind) ? avoidKind : [avoidKind]);
    const rotated = inScope.filter((c) => !avoid.has(c.kind));
    if (rotated.length > 0) inScope = rotated;
  }

  const recent = new Set(recentIds);
  const usedPassages = new Set(recentPassageIds);

  // Prefer families that are neither recently served nor tied to an already-read
  // passage, then fall back progressively rather than ever returning nothing.
  const fresh = inScope.filter(
    (c) => !recent.has(c.id) && (!c.passageId || !usedPassages.has(c.passageId)),
  );
  const pool = fresh.length > 0 ? fresh : inScope.filter((c) => !recent.has(c.id));
  const usable = pool.length > 0 ? pool : inScope;

  // 1. Spaced repetition: re-ask something previously missed.
  const reviewable = usable.filter((c) => (missed[c.id] ?? 0) > 0);
  if (reviewable.length > 0 && Math.random() < 0.35) {
    return pickRandom(reviewable).materialize();
  }

  // 2. Adaptive difficulty.
  let target: 1 | 2 | 3 = 2;
  if (recentAccuracy !== null) {
    if (recentAccuracy >= 0.85) target = 3;
    else if (recentAccuracy < 0.5) target = 1;
  }

  const atTarget = usable.filter((c) => c.difficulty === target);
  if (atTarget.length > 0) return pickRandom(atTarget).materialize();

  const nearTarget = usable.filter((c) => Math.abs(c.difficulty - target) === 1);
  if (nearTarget.length > 0) return pickRandom(nearTarget).materialize();

  return pickRandom(usable).materialize();
}
