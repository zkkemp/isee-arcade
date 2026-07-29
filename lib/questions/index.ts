import type { Question, QuestionKind, Subject } from './types';
import type { VocabularyMastery } from '../progress';
import { instantiate, type QuestionTemplate } from './templates';
import { VERBAL_QUESTIONS } from './verbal';
import { READING_QUESTIONS } from './reading';
import { READING_QUESTIONS_2 } from './reading2';
import { READING_QUESTIONS_3 } from './reading3';
import { LOWER_LEVEL_READING_QUESTIONS } from './readingLowerLevel';
import { LOWER_LEVEL_VERBAL_QUESTIONS } from './verbalLowerLevel';
import { VOCAB_AB } from './vocab/ab';
import { VOCAB_CD } from './vocab/cd';
import { VOCAB_EH } from './vocab/eh';
import { VOCAB_IM } from './vocab/im';
import { VOCAB_NR } from './vocab/nr';
import { VOCAB_SZ } from './vocab/sz';
import { MATH_TEMPLATES } from './mathTemplates';
import { MATH_TEMPLATES_2 } from './mathTemplates2';
import { MATH_TEMPLATES_3 } from './mathTemplates3';
import { MATH_TEMPLATES_4 } from './mathTemplates4';
import { QUANT_TEMPLATES } from './quantTemplates';
import { QUANT_TEMPLATES_2 } from './quantTemplates2';
import { QUANT_TEMPLATES_3 } from './quantTemplates3';
import { GRADE_K_TEMPLATES } from './gradeK';
import { GRADE_1_TEMPLATES } from './grade1';
import { GRADE_3_TEMPLATES } from './grade3';
import { ELEMENTARY_EXPANSION, type ElementaryBand } from './elementaryExpansion';
import { figurativeQuestionsForGrade } from './figurativeLanguage';

export * from './types';

/**
 * Which learner a bank is for. Each family profile picks one. `isee` remains the
 * original, protected ISEE Lower Level bank (applying to grades 5-6). Keeping
 * that internal id preserves existing profiles and, more importantly, means the
 * proven Lower Level question source does not have to be edited while the
 * profile UI gains the missing grade and ISEE level choices.
 */
export type GradeBand =
  | 'k'
  | 'grade1'
  | 'grade2'
  | 'grade3'
  | 'grade4'
  | 'grade5'
  | 'grade6'
  | 'grade7'
  | 'grade8'
  | 'isee'
  | 'iseeMiddle'
  | 'iseeUpper';

export const GRADE_BAND_LABELS: Record<GradeBand, string> = {
  k: 'Kindergarten',
  grade1: 'First Grade',
  grade2: 'Second Grade',
  grade3: 'Third Grade',
  grade4: 'Fourth Grade',
  grade5: 'Fifth Grade',
  grade6: 'Sixth Grade',
  grade7: 'Seventh Grade',
  grade8: 'Eighth Grade',
  isee: 'ISEE Lower Level — Applying to Fifth or Sixth Grade',
  iseeMiddle: 'ISEE Middle Level — Applying to Seventh or Eighth Grade',
  iseeUpper:
    'ISEE Upper Level — Applying to Ninth, Tenth, Eleventh, or Twelfth Grade',
};

export const GRADE_BAND_BLURBS: Record<GradeBand, string> = {
  k: 'Counting, shapes, sounds, patterns, weather, nature, and simple STEM.',
  grade1: 'Add and subtract to 20, place value, time, phonics, idioms, weather, and STEM.',
  grade2: 'Two-digit operations, fluency, grammar, idioms, weather, and STEM.',
  grade3: 'Times tables, fractions, grammar, idioms, STEM, weather, and comprehension.',
  grade4: 'Multi-step operations, fractions, vocabulary, and close reading.',
  grade5: 'Decimals, fractions, volume, language, and evidence-based reading.',
  grade6: 'Ratios, expressions, number systems, vocabulary, and analysis.',
  grade7: 'Proportions, equations, geometry, vocabulary, and deeper reading.',
  grade8: 'Linear relationships, functions, geometry, vocabulary, and analysis.',
  isee: 'The protected Lower Level preparation bank for applicants to grades five or six.',
  iseeMiddle: 'Middle Level pacing and challenge for applicants to grades seven or eight.',
  iseeUpper: 'Upper Level pacing and challenge for applicants to grades nine through twelve.',
};

export const GRADE_BANDS: GradeBand[] = [
  'k',
  'grade1',
  'grade2',
  'grade3',
  'grade4',
  'grade5',
  'grade6',
  'grade7',
  'grade8',
  'isee',
  'iseeMiddle',
  'iseeUpper',
];

export const GENERIC_GRADE_BANDS: GradeBand[] = [
  'k',
  'grade1',
  'grade2',
  'grade3',
  'grade4',
  'grade5',
  'grade6',
  'grade7',
  'grade8',
];

export const ISEE_GRADE_BANDS: GradeBand[] = ['isee', 'iseeMiddle', 'iseeUpper'];

export function bandHasReading(band: GradeBand): boolean {
  return !['k', 'grade1', 'grade2'].includes(band);
}

export function bandNeedsNarration(band: GradeBand): boolean {
  return band === 'k' || band === 'grade1';
}

/**
 * Verbal and reading are fixed text — a synonym cannot be parameterized.
 * Math and quantitative are templates instead, so the numbers change on every
 * serving and the answer cannot be memorized.
 */
export const STATIC_QUESTIONS: Question[] = [
  ...VERBAL_QUESTIONS,
  ...LOWER_LEVEL_VERBAL_QUESTIONS,
  ...READING_QUESTIONS,
  ...READING_QUESTIONS_2,
  ...READING_QUESTIONS_3,
  ...LOWER_LEVEL_READING_QUESTIONS,
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
  ...MATH_TEMPLATES_4,
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
  /** Static text with a topic must not take the template same-family retry path. */
  templated: boolean;
  materialize: () => Question;
};

function templatesToCandidates(ts: QuestionTemplate[]): Candidate[] {
  return ts.map((t) => ({
    id: t.id,
    subject: t.subject,
    kind: t.kind,
    difficulty: t.difficulty,
    topic: t.topic,
    templated: true,
    materialize: () => instantiate(t),
  }));
}

function questionsToCandidates(questions: Question[]): Candidate[] {
  return questions.map((q) => ({
    id: q.id,
    subject: q.subject,
    kind: q.kind,
    difficulty: q.difficulty,
    topic: q.topic,
    passageId: q.passageId,
    templated: false,
    materialize: () => q,
  }));
}

/** The ISEE Lower Level bank: fixed verbal/reading/vocab plus the math+quant templates. */
const ISEE_CANDIDATES: Candidate[] = [
  ...questionsToCandidates(STATIC_QUESTIONS),
  ...templatesToCandidates(ALL_TEMPLATES),
];

/**
 * One candidate pool per grade band. A profile's band decides which pool the
 * study block draws from, so a kindergartner never sees a 5th-grade question and
 * vice versa. The younger banks are entirely templated (fresh numbers each time).
 */
const ISEE_EASY = ISEE_CANDIDATES.filter((candidate) => candidate.difficulty === 1);
const ISEE_ON_LEVEL = ISEE_CANDIDATES.filter((candidate) => candidate.difficulty <= 2);
const ISEE_LANGUAGE = ISEE_CANDIDATES.filter(
  (candidate) => candidate.subject === 'verbal' || candidate.subject === 'reading',
);
const ISEE_MIDDLE = [
  ...ISEE_LANGUAGE,
  ...ISEE_CANDIDATES.filter(
    (candidate) =>
      (candidate.subject === 'math' || candidate.subject === 'quantitative') &&
      candidate.difficulty >= 2,
  ),
];
const ISEE_UPPER = [
  ...ISEE_LANGUAGE,
  ...ISEE_CANDIDATES.filter(
    (candidate) =>
      (candidate.subject === 'math' || candidate.subject === 'quantitative') &&
      candidate.difficulty === 3,
  ),
];
const GRADE_1_CANDIDATES = templatesToCandidates(GRADE_1_TEMPLATES);
const GRADE_3_CANDIDATES = templatesToCandidates(GRADE_3_TEMPLATES);
const ELEMENTARY_CANDIDATES: Record<ElementaryBand, Candidate[]> = {
  k: questionsToCandidates(ELEMENTARY_EXPANSION.k),
  grade1: questionsToCandidates(ELEMENTARY_EXPANSION.grade1),
  grade2: questionsToCandidates(ELEMENTARY_EXPANSION.grade2),
  grade3: questionsToCandidates(ELEMENTARY_EXPANSION.grade3),
};
const GRADE_3_READING_CANDIDATES = questionsToCandidates(READING_QUESTIONS_3);
const GRADE_FIGURATIVE: Record<
  Extract<GradeBand, 'k' | 'grade1' | 'grade2' | 'grade3' | 'grade4' | 'grade5' | 'grade6' | 'grade7' | 'grade8'>,
  Candidate[]
> = {
  k: questionsToCandidates(figurativeQuestionsForGrade('k')),
  grade1: questionsToCandidates(figurativeQuestionsForGrade('grade1')),
  grade2: questionsToCandidates(figurativeQuestionsForGrade('grade2')),
  grade3: questionsToCandidates(figurativeQuestionsForGrade('grade3')),
  grade4: questionsToCandidates(figurativeQuestionsForGrade('grade4')),
  grade5: questionsToCandidates(figurativeQuestionsForGrade('grade5')),
  grade6: questionsToCandidates(figurativeQuestionsForGrade('grade6')),
  grade7: questionsToCandidates(figurativeQuestionsForGrade('grade7')),
  grade8: questionsToCandidates(figurativeQuestionsForGrade('grade8')),
};

const BANDS: Record<GradeBand, Candidate[]> = {
  isee: ISEE_CANDIDATES,
  k: [
    ...templatesToCandidates(GRADE_K_TEMPLATES),
    ...ELEMENTARY_CANDIDATES.k,
    ...GRADE_FIGURATIVE.k,
  ],
  grade1: [
    ...GRADE_1_CANDIDATES,
    ...ELEMENTARY_CANDIDATES.grade1,
    ...GRADE_FIGURATIVE.grade1,
  ],
  grade2: [
    ...GRADE_1_CANDIDATES.filter((candidate) => candidate.difficulty >= 2),
    ...GRADE_3_CANDIDATES.filter((candidate) => candidate.difficulty === 1),
    ...ELEMENTARY_CANDIDATES.grade2,
    ...GRADE_FIGURATIVE.grade2,
  ],
  grade3: [
    ...GRADE_3_CANDIDATES,
    ...ELEMENTARY_CANDIDATES.grade3,
    ...GRADE_3_READING_CANDIDATES,
    ...GRADE_FIGURATIVE.grade3,
  ],
  grade4: [
    ...GRADE_3_CANDIDATES.filter((candidate) => candidate.difficulty >= 2),
    ...ISEE_EASY,
    ...GRADE_FIGURATIVE.grade4,
  ],
  grade5: [...ISEE_ON_LEVEL, ...GRADE_FIGURATIVE.grade5],
  grade6: [...ISEE_CANDIDATES, ...GRADE_FIGURATIVE.grade6],
  grade7: [...ISEE_MIDDLE, ...GRADE_FIGURATIVE.grade7],
  grade8: [...ISEE_MIDDLE, ...GRADE_FIGURATIVE.grade8],
  iseeMiddle: ISEE_MIDDLE,
  iseeUpper: ISEE_UPPER,
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

/** Exposed for audits so grade-bank separation can be proven automatically. */
export function familyIdsForBand(band: GradeBand): string[] {
  return (BANDS[band] ?? ISEE_CANDIDATES).map((candidate) => candidate.id);
}

export type CurriculumFamilyPreview = {
  id: string;
  contentKey: string;
  templated: boolean;
  subject: Subject;
  kind: QuestionKind;
  difficulty: 1 | 2 | 3;
  topic?: string;
  passageId?: string;
  sample: Question;
};

/**
 * Parent-facing catalog. A dynamic family is represented by one fresh example
 * and clearly marked as dynamic; the parent is browsing the rule, not being
 * misled into thinking one random set of numbers is the only question.
 */
export function curriculumFamiliesForBand(band: GradeBand): CurriculumFamilyPreview[] {
  const seen = new Set<string>();
  return (BANDS[band] ?? ISEE_CANDIDATES).flatMap((candidate) => {
    if (seen.has(candidate.id)) return [];
    seen.add(candidate.id);
    return [
      {
        id: candidate.id,
        contentKey: candidate.id,
        templated: candidate.templated,
        subject: candidate.subject,
        kind: candidate.kind,
        difficulty: candidate.difficulty,
        topic: candidate.topic,
        passageId: candidate.passageId,
        sample: candidate.materialize(),
      },
    ];
  });
}

export function familyCountForKind(band: GradeBand, kind: QuestionKind): number {
  return (BANDS[band] ?? ISEE_CANDIDATES).filter((candidate) => candidate.kind === kind).length;
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
  /** Per-profile vocabulary spacing. Missed words are urgent; twice-correct words wait. */
  vocabulary?: Record<string, VocabularyMastery>;
  /** Attempt count used as the vocabulary spacing clock. */
  vocabularyClock?: number;
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
  /** Parent-disabled family ids or `passage:<id>` keys to leave out. */
  excludedContentKeys?: string[];
  /** Smart Practice can gently target a proven weak topic/family. */
  focusTopic?: string | null;
  /** Optional lane-specific target; otherwise recent overall accuracy decides. */
  targetDifficulty?: 1 | 2 | 3;
};

export function pickQuestion(args: PickArgs = {}): Question {
  const {
    band = 'isee',
    subjects,
    recentIds = [],
    recentPassageIds = [],
    missed = {},
    recentAccuracy = null,
    vocabulary = {},
    vocabularyClock = 0,
    sameKindAs = null,
    avoidKind = null,
    forceKind = null,
    excludedContentKeys = [],
    focusTopic = null,
    targetDifficulty,
  } = args;

  // The band's pool is the whole universe this call draws from.
  const excluded = new Set(excludedContentKeys);
  const fullBand = BANDS[band] ?? ISEE_CANDIDATES;
  const enabled = fullBand.filter(
    (candidate) =>
      !excluded.has(candidate.id) &&
      (!candidate.passageId || !excluded.has(`passage:${candidate.passageId}`)),
  );
  // A parent can disable aggressively. Never crash a study session: if no
  // content remains, fall back to the canonical band and surface a warning in
  // the parent controls rather than leaving a child on a blank screen.
  const CANDIDATES = enabled.length > 0 ? enabled : fullBand;

  // --- retry path: stay on the thing they just missed ---
  if (sameKindAs) {
    // Templated: regenerate the same family. New numbers, same shape — this is
    // the whole reason templates exist.
    const missedCandidate = BY_ID.get(sameKindAs.id);
    if (sameKindAs.topic && missedCandidate?.templated) {
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

  if (focusTopic) {
    const focused = inScope.filter((candidate) => candidate.topic === focusTopic);
    if (focused.length > 0) inScope = focused;
  }

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
  let scope = passageOk.length > 0 ? passageOk : inScope;
  // Vocabulary is a separate spacing lane: a missed synonym comes back before
  // unfamiliar words, while a word answered twice stays at the bottom until its
  // long delay has elapsed. This is per profile because Progress is namespaced.
  const urgentWords = scope.filter((c) => c.kind === 'synonym' && (vocabulary[c.id]?.misses ?? 0) > 0);
  if (urgentWords.length > 0 && Math.random() < 0.6) return pickRandom(urgentWords).materialize();
  const notDelayed = scope.filter((c) => !(c.kind === 'synonym' && (vocabulary[c.id]?.correctStreak ?? 0) >= 2 && (vocabulary[c.id]?.dueAt ?? 0) > vocabularyClock));
  if (notDelayed.length > 0) scope = notDelayed;

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
  let target: 1 | 2 | 3 = targetDifficulty ?? 2;
  if (targetDifficulty === undefined && recentAccuracy !== null) {
    if (recentAccuracy >= 0.85) target = 3;
    else if (recentAccuracy < 0.5) target = 1;
  }

  const atTarget = lru.filter((c) => c.difficulty === target);
  if (atTarget.length > 0) return pickRandom(atTarget).materialize();

  const nearTarget = lru.filter((c) => Math.abs(c.difficulty - target) === 1);
  if (nearTarget.length > 0) return pickRandom(nearTarget).materialize();

  return pickRandom(lru).materialize();
}
