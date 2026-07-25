'use client';

import { useEffect, useState } from 'react';

/**
 * Skill setting. Defaults to `easy` deliberately: the first version was too hard
 * out of the gate, and a kid who dies constantly stops playing before they get
 * to any questions.
 */
export type Difficulty = 'easy' | 'normal' | 'hard';

export const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Easy',
  normal: 'Normal',
  hard: 'Hard',
};

export const DIFFICULTY_BLURBS: Record<Difficulty, string> = {
  easy: 'Slower, fewer hazards, more coins.',
  normal: 'A fair challenge.',
  hard: 'Fast and crowded.',
};

/** Multipliers games apply to obstacle speed. */
export const SPEED_SCALE: Record<Difficulty, number> = {
  easy: 0.72,
  normal: 1,
  hard: 1.3,
};

/** How fast a game ramps up per level cleared. */
export const RAMP_SCALE: Record<Difficulty, number> = {
  easy: 0.5,
  normal: 1,
  hard: 1.4,
};

const KEY = 'isee-arcade:difficulty';

export function loadDifficulty(): Difficulty {
  if (typeof window === 'undefined') return 'easy';
  try {
    const v = window.localStorage.getItem(KEY);
    return v === 'normal' || v === 'hard' || v === 'easy' ? v : 'easy';
  } catch {
    return 'easy';
  }
}

export function saveDifficulty(d: Difficulty): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, d);
  } catch {
    // Non-fatal: they just get the default next launch.
  }
}

/** Reads the stored setting after mount, so SSR and hydration agree. */
export function useDifficulty(): [Difficulty, (d: Difficulty) => void] {
  const [difficulty, setDifficultyState] = useState<Difficulty>('easy');

  useEffect(() => {
    setDifficultyState(loadDifficulty());
  }, []);

  const set = (d: Difficulty) => {
    setDifficultyState(d);
    saveDifficulty(d);
  };

  return [difficulty, set];
}
