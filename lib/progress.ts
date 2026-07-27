'use client';

import type { Subject } from './questions/types';
import { profileStorageSuffix } from './profiles';

const BASE_STORAGE_KEY = 'isee-arcade:v1';
const HISTORY_CAP = 500;

// Progress is per learner, so a kindergartner's stats never mix with a sibling's.
function storageKey(): string {
  return `${BASE_STORAGE_KEY}${profileStorageSuffix()}`;
}

export type SubjectStat = { seen: number; correct: number };

export type Attempt = {
  /** epoch ms */
  t: number;
  id: string;
  subject: Subject;
  correct: boolean;
};
/** Per-profile spaced vocabulary state. `dueAt` is measured in later attempts. */
export type VocabularyMastery = { correctStreak: number; misses: number; dueAt: number };

export type Progress = {
  bySubject: Record<Subject, SubjectStat>;
  /** questionId -> how many times still owed a correct answer. Drives spaced repetition. */
  missed: Record<string, number>;
  /** questionIds answered correctly after having been missed. */
  mastered: string[];
  /** gameId -> best score */
  highScores: Record<string, number>;
  totalSeen: number;
  totalCorrect: number;
  streak: number;
  bestStreak: number;
  history: Attempt[];
  vocabulary: Record<string, VocabularyMastery>;
};

const EMPTY_SUBJECTS: Record<Subject, SubjectStat> = {
  verbal: { seen: 0, correct: 0 },
  quantitative: { seen: 0, correct: 0 },
  reading: { seen: 0, correct: 0 },
  math: { seen: 0, correct: 0 },
};

export function emptyProgress(): Progress {
  return {
    bySubject: structuredClone(EMPTY_SUBJECTS),
    missed: {},
    mastered: [],
    highScores: {},
    totalSeen: 0,
    totalCorrect: 0,
    streak: 0,
    bestStreak: 0,
    history: [],
    vocabulary: {},
  };
}

/** Merges stored data over a fresh shape so older saves survive new fields. */
function hydrate(raw: unknown): Progress {
  const base = emptyProgress();
  if (!raw || typeof raw !== 'object') return base;
  const p = raw as Partial<Progress>;
  return {
    ...base,
    ...p,
    bySubject: { ...base.bySubject, ...(p.bySubject ?? {}) },
    missed: { ...(p.missed ?? {}) },
    mastered: [...(p.mastered ?? [])],
    highScores: { ...(p.highScores ?? {}) },
    history: [...(p.history ?? [])],
    vocabulary: { ...(p.vocabulary ?? {}) },
  };
}

export function loadProgress(): Progress {
  if (typeof window === 'undefined') return emptyProgress();
  try {
    const raw = window.localStorage.getItem(storageKey());
    return hydrate(raw ? JSON.parse(raw) : null);
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(p: Progress): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(), JSON.stringify(p));
  } catch {
    // Quota or private-browsing failure. Progress is a nice-to-have, never block play.
  }
  void import('./cloudSync')
    .then(({ queueCloudSync }) => queueCloudSync())
    .catch(() => undefined);
}

export function resetProgress(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(storageKey());
  } catch {
    // ignore
  }
}

/** Records one answered question and returns the updated progress. */
export function recordAnswer(
  prev: Progress,
  args: { id: string; subject: Subject; correct: boolean; vocabulary?: boolean },
): Progress {
  const { id, subject, correct, vocabulary = false } = args;
  const next: Progress = {
    ...prev,
    bySubject: { ...prev.bySubject },
    missed: { ...prev.missed },
    mastered: [...prev.mastered],
    history: [...prev.history],
    vocabulary: { ...prev.vocabulary },
  };

  const stat = next.bySubject[subject] ?? { seen: 0, correct: 0 };
  next.bySubject[subject] = {
    seen: stat.seen + 1,
    correct: stat.correct + (correct ? 1 : 0),
  };

  next.totalSeen += 1;
  if (correct) {
    next.totalCorrect += 1;
    next.streak += 1;
    next.bestStreak = Math.max(next.bestStreak, next.streak);
    // A correct answer pays down one unit of debt on a previously missed question.
    if (next.missed[id]) {
      const remaining = next.missed[id] - 1;
      if (remaining <= 0) {
        delete next.missed[id];
        if (!next.mastered.includes(id)) next.mastered.push(id);
      } else {
        next.missed[id] = remaining;
      }
    }
  } else {
    next.streak = 0;
    // Missing it again deepens the debt, so it resurfaces sooner and more often.
    next.missed[id] = Math.min((next.missed[id] ?? 0) + 1, 3);
    next.mastered = next.mastered.filter((m) => m !== id);
  }

  next.history.push({ t: Date.now(), id, subject, correct });
  if (next.history.length > HISTORY_CAP) {
    next.history = next.history.slice(-HISTORY_CAP);
  }
  if (vocabulary) {
    const prior = next.vocabulary[id] ?? { correctStreak: 0, misses: 0, dueAt: 0 };
    if (correct) {
      const correctStreak = prior.correctStreak + 1;
      // Two correct encounters graduate a word for a long interval. It remains
      // available later, but stops crowding out words that need attention now.
      next.vocabulary[id] = { correctStreak, misses: Math.max(0, prior.misses - 1), dueAt: correctStreak >= 2 ? next.totalSeen + 28 : next.totalSeen + 5 };
    } else {
      next.vocabulary[id] = { correctStreak: 0, misses: Math.min(4, prior.misses + 1), dueAt: next.totalSeen };
    }
  }
  return next;
}

export function recordHighScore(prev: Progress, gameId: string, score: number): Progress {
  const best = prev.highScores[gameId] ?? 0;
  if (score <= best) return prev;
  return { ...prev, highScores: { ...prev.highScores, [gameId]: score } };
}

export function accuracy(stat: SubjectStat): number {
  return stat.seen === 0 ? 0 : Math.round((stat.correct / stat.seen) * 100);
}

/** Accuracy over the most recent `n` attempts. Used to steer difficulty. */
export function recentAccuracy(p: Progress, n = 12): number | null {
  const slice = p.history.slice(-n);
  if (slice.length < 4) return null;
  const hits = slice.filter((a) => a.correct).length;
  return hits / slice.length;
}
