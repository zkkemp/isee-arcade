'use client';

import { useSyncExternalStore } from 'react';

export type PlayerMode = 'learner' | 'parent' | null;

const MODE_KEY = 'isee-arcade:player-mode';
const listeners = new Set<() => void>();

export function readPlayerMode(): PlayerMode {
  if (typeof window === 'undefined') return null;
  const value = window.sessionStorage.getItem(MODE_KEY);
  return value === 'learner' || value === 'parent' ? value : null;
}

function notify(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setPlayerMode(mode: PlayerMode): void {
  if (typeof window === 'undefined') return;
  if (mode) window.sessionStorage.setItem(MODE_KEY, mode);
  else window.sessionStorage.removeItem(MODE_KEY);
  notify();
}

export function usePlayerMode(): PlayerMode {
  return useSyncExternalStore(subscribe, readPlayerMode, () => null);
}

export function isParentMode(): boolean {
  return readPlayerMode() === 'parent';
}
