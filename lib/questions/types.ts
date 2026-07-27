export type Subject = 'verbal' | 'quantitative' | 'reading' | 'math';

export type QuestionKind =
  | 'synonym'
  | 'sentence_completion'
  | 'quant_reasoning'
  | 'math_achievement'
  | 'reading';

/**
 * A picture a young learner can count without having to decode punctuation.
 * The UI deliberately does not print the count beside a group: the picture is
 * the question, not an answer hint.
 */
export type CountingPictureItem =
  | 'apple'
  | 'balloon'
  | 'bee'
  | 'bird'
  | 'block'
  | 'cat'
  | 'circle'
  | 'cookie'
  | 'crayon'
  | 'dog'
  | 'dot'
  | 'duck'
  | 'fish'
  | 'frog'
  | 'pig'
  | 'star';

export type QuestionVisual = {
  kind: 'counting';
  groups: {
    /** Optional spoken-word label such as "ducks" or "First group". */
    label?: string;
    item: CountingPictureItem;
    count: number;
  }[];
};

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
  /** Optional structured, non-text visual placed between prompt and answers. */
  visual?: QuestionVisual;
  /**
   * The answer options. Four for most kinds. Reading questions carry FIVE, on
   * purpose: a reading right answer is worth a lot, so a blind guess is a
   * one-in-five shot rather than one-in-four. Reading questions are also served
   * only about one draw in eight, since the passages are long.
   */
  choices: string[];
  /** Index into `choices` of the correct answer. */
  answer: number;
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
