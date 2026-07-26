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
import { GRADE_K_TEMPLATES } from './gradeK';
import { GRADE_1_TEMPLATES } from './grade1';
import { GRADE_3_TEMPLATES } from './grade3';

export * from './types';

/**
 * Which learner a bank is for. Each family profile picks one. 'isee' is the
 * original ISEE Lower Level bank (entering grades 5-6); the others are the
 * younger grade bands so a kindergartner is never handed a 5th-grade question.
 */
export type GradeBand = 'k' | 'grade1' | 'grade3' | 'isee';

export const GRADE_BAND_LABELS: Record<GradeBand, string> = {
  k: 'Kindergarten',
  grade1: '1st Grade',
  grade3: '3rd Grade',
  isee: 'ISEE Lower Level',
};

export const GRADE_BAND_BLURBS: Record<GradeBand, string> = {
  k: 'Counting, shapes, letters, patterns.',
  grade1: 'Add & subtract to 20, place value, time, money.',
  grade3: 'Times tables, fractions, multi-digit, elapsed time.',
  isee: 'Entering 5th-6th grade. Full ISEE Lower Level prep.',
};

export const GRADE_BANDS: GradeBand[] = ['k', 'grade1', 'grade3', 'isee'];

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

function templatesToCandidates(ts: QuestionTemplate[]): Candidate[] {
  return ts.map((t) => ({
    id: t.id,
    subject: t.subject,
    kind: t.kind,
    difficulty: t.difficulty,
    topic: t.topic,
    materialize: () => instantiate(t),
  }));
}

/** The ISEE Lower Level bank: fixed verbal/reading/vocab plus the math+quant templates. */
const ISEE_CANDIDATES: Candidate[] = [
  ...STATIC_QUESTIONS.map((q) => ({
    id: q.id,
    subject: q.subject,
    kind: q.kind,
    difficulty: q.difficulty,
    topic: q.topic,
    passageId: q.passageId,
    materialize: () => q,
  })),
  ...templatesToCandidates(ALL_TEMPLATES),
];

/**
 * One candidate pool per grade band. A profile's band decides which pool the
 * study block draws from, so a kindergartner never sees a 5th-grade question and
 * vice versa. The younger banks are entirely templated (fresh numbers each time).
 */
const BANDS: Record<GradeBand, Candidate[]> = {
  isee: ISEE_CANDIDATES,
  k: templatesToCandidates(GRADE_K_TEMPLATES),
  grade1: templatesToCandidates(GRADE_1_TEMPLATES),
  grade3: templatesToCandidates(GRADE_3_TEMPLATES),
};

/** Every candidate across all bands, so questionById can restore any owed question. */
const ALL_CANDIDATES: Candidate[] = Object.values(BANDS).flat();
const BY_ID = new Map(ALL_CANDIDATES.map((c) => [c.id, c]));

export const ALL_SUBJECTS: Subject[] = ['verbal', 'quantitative', 'reading', 'math'];

/** Distinct ISEE question families available, counting each template once. */
export function countBySubject(): Record<Subject, number> {
  const out: Record<Subject, number> = { verbal: 0, quantitative: 0, reading: 0, math: 0 };
  for (const c of ISEE_CANDIDATES) out[c.subject] += 1;
  return out;
}

export function questionById(id: string): Question | null {
  return BY_ID.get(id)?.materialize() ?? null;
}

export const TOTAL_FAMILIES = ISEE_CANDIDATES.length;
export const TEMPLATE_COUNT = ALL_TEMPLATES.length;

/** Family count for a specific band, for the profile picker. */
export function familyCountForBand(band: GradeBand): number {
  return (BANDS[band] ?? ISEE_CANDIDATES).length;
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export type PickArgs = {
  /** Which learner's bank to draw from. Defaults to the ISEE Lower Level bank. */
  band?: GradeBand;
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
    band = 'isee',
    subjects,
    recentIds = [],
    recentPassageIds = [],
    missed = {},
    recentAccuracy = null,
    sameKindAs = null,
    avoidKind = null,
    forceKind = null,
  } = args;

  // The band's pool is the whole universe this call draws from.
  const CANDIDATES = BANDS[band] ?? ISEE_CANDIDATES;

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

  const usedPassages = new Set(recentPassageIds);

  // Least-recently-used selection. `recentIds` is ordered oldest-first, so a
  // family's recency is the index of its LAST appearance: never-served families
  // rank -1 (freshest), and the just-served one ranks highest. Choosing only from
  // the lowest-ranked families means the whole pool is cycled before ANY family
  // repeats - the fix for "it keeps asking the same question". The old code only
  // filtered out a fixed recent WINDOW and, once every family in a small bank was
  // inside that window (the 24-item grade banks vs a longer history), fell back
  // to a blind random pick that could re-serve what was just asked.
  const lastSeen = new Map<string, number>();
  recentIds.forEach((id, i) => lastSeen.set(id, i));
  const recencyOf = (id: string): number => (lastSeen.has(id) ? (lastSeen.get(id) as number) : -1);

  // A re-read passage is worse than a repeated family, so drop already-read
  // passages first when that still leaves something to serve.
  const passageOk = inScope.filter((c) => !c.passageId || !usedPassages.has(c.passageId));
  const scope = passageOk.length > 0 ? passageOk : inScope;

  // The least-recently-used subset: everything tied for the oldest last-seen rank
  // (all never-served families when any exist).
  let minRank = Infinity;
  for (const c of scope) minRank = Math.min(minRank, recencyOf(c.id));
  const lru = scope.filter((c) => recencyOf(c.id) === minRank);

  // 1. Spaced repetition: re-ask something previously missed - but only from the
  // LRU set, so a missed item still can never come back-to-back.
  const reviewable = lru.filter((c) => (missed[c.id] ?? 0) > 0);
  if (reviewable.length > 0 && Math.random() < 0.35) {
    return pickRandom(reviewable).materialize();
  }

  // 2. Adaptive difficulty, chosen within the LRU set.
  let target: 1 | 2 | 3 = 2;
  if (recentAccuracy !== null) {
    if (recentAccuracy >= 0.85) target = 3;
    else if (recentAccuracy < 0.5) target = 1;
  }

  const atTarget = lru.filter((c) => c.difficulty === target);
  if (atTarget.length > 0) return pickRandom(atTarget).materialize();

  const nearTarget = lru.filter((c) => Math.abs(c.difficulty - target) === 1);
  if (nearTarget.length > 0) return pickRandom(nearTarget).materialize();

  return pickRandom(lru).materialize();
}
