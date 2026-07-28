'use client';

import { useSyncExternalStore } from 'react';

export type OverrideReason =
  | 'too_easy'
  | 'too_hard'
  | 'unclear'
  | 'not_a_fit'
  | 'already_mastered'
  | 'other';

export type ContentOverride = {
  contentKey: string;
  learnerId: string | null;
  reason: OverrideReason | null;
  updatedAt: number;
};

export type ParentContentState = {
  disabled: ContentOverride[];
  bookmarks: string[];
};

const STORAGE_KEY = 'isee-arcade:parent-content-controls:v1';
const EMPTY: ParentContentState = { disabled: [], bookmarks: [] };
const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedState = EMPTY;

function readState(): ParentContentState {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === cachedRaw) return cachedState;
    cachedRaw = raw;
    const parsed = raw ? (JSON.parse(raw) as Partial<ParentContentState>) : {};
    cachedState = {
      disabled: Array.isArray(parsed.disabled)
        ? parsed.disabled.filter(
            (item): item is ContentOverride =>
              Boolean(item) &&
              typeof item.contentKey === 'string' &&
              (item.learnerId === null || typeof item.learnerId === 'string'),
          )
        : [],
      bookmarks: Array.isArray(parsed.bookmarks)
        ? parsed.bookmarks.filter((key): key is string => typeof key === 'string')
        : [],
    };
    return cachedState;
  } catch {
    return EMPTY;
  }
}

function writeState(state: ParentContentState): void {
  cachedState = state;
  cachedRaw = JSON.stringify(state);
  try {
    window.localStorage.setItem(STORAGE_KEY, cachedRaw);
  } catch {
    // Parent controls remain available in memory when storage is unavailable.
  }
  listeners.forEach((listener) => listener());
  void import('./cloudSync')
    .then(({ queueCloudSync }) => queueCloudSync())
    .catch(() => undefined);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useParentContentState(): ParentContentState {
  return useSyncExternalStore(subscribe, readState, () => EMPTY);
}

export function setContentDisabled(
  contentKey: string,
  learnerId: string | null,
  disabled: boolean,
  reason: OverrideReason | null = null,
): void {
  const state = readState();
  const remaining = state.disabled.filter(
    (item) => !(item.contentKey === contentKey && item.learnerId === learnerId),
  );
  writeState({
    ...state,
    disabled: disabled
      ? [...remaining, { contentKey, learnerId, reason, updatedAt: Date.now() }]
      : remaining,
  });
}

export function toggleBookmark(contentKey: string): void {
  const state = readState();
  const exists = state.bookmarks.includes(contentKey);
  writeState({
    ...state,
    bookmarks: exists
      ? state.bookmarks.filter((key) => key !== contentKey)
      : [...state.bookmarks, contentKey],
  });
}

export function disabledKeysForLearner(learnerId: string | null): string[] {
  return readState().disabled
    .filter((item) => item.learnerId === null || item.learnerId === learnerId)
    .map((item) => item.contentKey);
}

export function parentContentSnapshot(): ParentContentState {
  return readState();
}

export function restoreParentContentSnapshot(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  const candidate = value as Partial<ParentContentState>;
  writeState({
    disabled: Array.isArray(candidate.disabled) ? candidate.disabled : [],
    bookmarks: Array.isArray(candidate.bookmarks) ? candidate.bookmarks : [],
  });
}
