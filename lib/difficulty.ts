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
export const GAME_DIFFICULTIES_KEY = 'isee-arcade:game-difficulties';

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

function isDifficulty(value: unknown): value is Difficulty {
  return value === 'easy' || value === 'normal' || value === 'hard';
}

export function parseGameDifficulties(raw: string | null): Record<string, Difficulty> {
  if (!raw) return {};
  try {
    const candidate = JSON.parse(raw) as unknown;
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return {};
    return Object.fromEntries(
      Object.entries(candidate).filter((entry): entry is [string, Difficulty] =>
        isDifficulty(entry[1]),
      ),
    );
  } catch {
    return {};
  }
}

export function withGameDifficulty(
  current: Record<string, Difficulty>,
  gameId: string,
  difficulty: Difficulty,
): Record<string, Difficulty> {
  return { ...current, [gameId]: difficulty };
}

/**
 * Each game remembers its own level. The former arcade-wide level remains the
 * fallback so existing families keep the difficulty they already chose.
 */
export function loadGameDifficulty(gameId: string): Difficulty {
  if (typeof window === 'undefined') return 'easy';
  try {
    const saved = parseGameDifficulties(
      window.localStorage.getItem(GAME_DIFFICULTIES_KEY),
    )[gameId];
    return saved ?? loadDifficulty();
  } catch {
    return loadDifficulty();
  }
}

export function saveGameDifficulty(gameId: string, difficulty: Difficulty): void {
  if (typeof window === 'undefined') return;
  try {
    const current = parseGameDifficulties(
      window.localStorage.getItem(GAME_DIFFICULTIES_KEY),
    );
    window.localStorage.setItem(
      GAME_DIFFICULTIES_KEY,
      JSON.stringify(withGameDifficulty(current, gameId, difficulty)),
    );
  } catch {
    // Non-fatal: the game still changes for the current session.
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

/** Reads and writes one game's independent skill level. */
export function useGameDifficulty(gameId: string): [Difficulty, (d: Difficulty) => void] {
  const [difficulty, setDifficultyState] = useState<Difficulty>('easy');

  useEffect(() => {
    setDifficultyState(loadGameDifficulty(gameId));
  }, [gameId]);

  const set = (next: Difficulty) => {
    setDifficultyState(next);
    saveGameDifficulty(gameId, next);
  };

  return [difficulty, set];
}
