export type Subject = 'verbal' | 'quantitative' | 'reading' | 'math';

export type QuestionKind =
  | 'synonym'
  | 'sentence_completion'
  | 'quant_reasoning'
  | 'math_achievement'
  | 'reading';

export type Question = {
  /** Stable unique id, e.g. "vb-001". Never reuse across files. */
  id: string;
  subject: Subject;
  kind: QuestionKind;
  /** Short reading passage. Reading questions only. */
  passage?: string;
  /** Groups questions that share a passage so we don't repeat one in a session. */
  passageId?: string;
  /**
   * Family label for templated questions, e.g. "add unlike fractions". Used to
   * serve a retry of the same shape after a wrong answer.
   */
  topic?: string;
  prompt: string;
  /** Exactly four choices. */
  choices: [string, string, string, string];
  /** Index into `choices` of the correct answer. */
  answer: 0 | 1 | 2 | 3;
  /** One or two sentences a 10-year-old can follow. Shown after answering. */
  explain: string;
  /** 1 = warm-up, 2 = on-level, 3 = stretch. */
  difficulty: 1 | 2 | 3;
};

export const SUBJECT_LABELS: Record<Subject, string> = {
  verbal: 'Verbal Reasoning',
  quantitative: 'Quantitative Reasoning',
  reading: 'Reading Comprehension',
  math: 'Math Achievement',
};
