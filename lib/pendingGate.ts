'use client';

import type { Question } from './questions/types';

/**
 * A question owed, persisted across reloads.
 *
 * Without this, force-quitting is a free escape: die, kill the app, reopen, and
 * the debt is gone. Worse, reopening rerolls the question, so a kid can quit
 * repeatedly until they get a short one. So the exact question is stored, not
 * just the fact that one is owed, and the debt is app-wide rather than per game -
 * otherwise switching games would clear it.
 *
 * This is a deterrent, not a vault: the answer index is in localStorage and a
 * determined kid with developer tools could read it. On an iPad that is not a
 * realistic path, and the point is to remove the easy out.
 */
export type PendingGate = {
  /** Which game they were playing, so it can say so on resume. */
  gameId: string;
  reason: 'death' | 'level' | 'time';
  label: string;
  attempt: number;
  /** Correct answers still required. */
  owed: number;
  /** Wrong answers in a row, so the raised bar survives a restart too. */
  wrongStreak: number;
  question: Question;
};

const KEY = 'isee-arcade:pending-gate';

export function loadPendingGate(): PendingGate | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as PendingGate;
    // Guard against a partially written or stale-shaped record.
    if (!p || typeof p !== 'object' || !p.question || !Array.isArray(p.question.choices)) {
      return null;
    }
    // Four for most kinds, eight for reading. Anything under four is malformed.
    if (p.question.choices.length < 4) return null;
    if (typeof p.question.answer !== 'number' || p.question.answer >= p.question.choices.length) {
      return null;
    }
    return p;
  } catch {
    return null;
  }
}

export function savePendingGate(p: PendingGate): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Quota or private browsing. The debt just will not survive a reload.
  }
}

export function clearPendingGate(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function hasPendingGate(): boolean {
  return loadPendingGate() !== null;
}
