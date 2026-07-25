import type { Question, QuestionKind, Subject } from './types';

/**
 * Templated questions.
 *
 * A static question can be memorized: see "1/3 + 1/6" enough times and the
 * answer becomes 1/2 by recall rather than by arithmetic. A template keeps the
 * shape and regenerates the numbers every time it is served, so the work has to
 * be done again.
 *
 * Generated instances carry the TEMPLATE's id, which means the review pool
 * tracks the family. Missing a template re-serves that family later with fresh
 * numbers — exactly the behavior we want.
 */

export type Rng = () => number;

export type GeneratedQuestion = {
  prompt: string;
  choices: [string, string, string, string];
  answer: 0 | 1 | 2 | 3;
  explain: string;
};

export type QuestionTemplate = {
  /** Stable id for the family, e.g. "mt-014". */
  id: string;
  subject: Subject;
  kind: QuestionKind;
  difficulty: 1 | 2 | 3;
  /** Short family label, e.g. "add unlike fractions". Used to serve a retry of the same shape. */
  topic: string;
  generate: (rng: Rng) => GeneratedQuestion;
};

/** Inclusive on both ends. */
export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

/**
 * Builds a shuffled 4-choice set from the correct answer plus candidate
 * distractors, and reports where the correct one landed.
 *
 * Pass more candidates than needed — the first three that are unique and not
 * equal to the answer are used. Distractors should be the results of realistic
 * mistakes (forgot to carry, wrong denominator, off by a place value), not
 * random numbers, or the question is guessable by elimination.
 */
export function buildChoices(
  rng: Rng,
  correct: string,
  candidates: string[],
): { choices: [string, string, string, string]; answer: 0 | 1 | 2 | 3 } {
  const seen = new Set([correct.trim()]);
  const distractors: string[] = [];
  for (const c of candidates) {
    const v = c.trim();
    if (v === '' || seen.has(v)) continue;
    seen.add(v);
    distractors.push(v);
    if (distractors.length === 3) break;
  }
  if (distractors.length < 3) {
    throw new Error(
      `buildChoices: need 3 unique distractors for "${correct}", got ${distractors.length}`,
    );
  }

  const all = [correct, ...distractors];
  // Fisher-Yates, so the answer is not biased toward any index.
  for (let i = all.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }

  return {
    choices: all as [string, string, string, string],
    answer: all.indexOf(correct) as 0 | 1 | 2 | 3,
  };
}

/** Deterministic PRNG, so the validator can replay a template's instances. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Turns one template instance into a Question the rest of the app understands. */
export function instantiate(template: QuestionTemplate, rng: Rng = Math.random): Question {
  const g = template.generate(rng);
  return {
    id: template.id,
    subject: template.subject,
    kind: template.kind,
    topic: template.topic,
    prompt: g.prompt,
    choices: g.choices,
    answer: g.answer,
    explain: g.explain,
    difficulty: template.difficulty,
  };
}

// --- formatting helpers, shared so templates render numbers consistently ---

export function gcd(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : gcd(b, a % b);
}

/** "3/4", reduced. Whole numbers render bare. */
export function frac(num: number, den: number): string {
  const g = gcd(num, den) || 1;
  const n = num / g;
  const d = den / g;
  return d === 1 ? `${n}` : `${n}/${d}`;
}

/** Money with exactly two decimals: "$4.50". */
export function money(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const v = Math.abs(cents);
  return `${sign}$${Math.floor(v / 100)}.${String(v % 100).padStart(2, '0')}`;
}

/** Trims float noise: 2.5 -> "2.5", 3.0 -> "3". */
export function num(value: number): string {
  return String(Math.round(value * 1e6) / 1e6);
}
