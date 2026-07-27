'use client';

import { GAMES, type GameId } from './games';

const STORAGE_KEY = 'isee-arcade:recent-games';
const EMPTY: GameId[] = [];
const listeners = new Set<() => void>();

let cachedRaw: string | null = null;
let cachedGames: GameId[] = EMPTY;

function isGameId(value: unknown): value is GameId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(GAMES, value);
}

export function getRecentGames(): GameId[] {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === cachedRaw) return cachedGames;
    cachedRaw = raw;
    if (!raw) {
      cachedGames = EMPTY;
      return cachedGames;
    }
    const parsed = JSON.parse(raw) as unknown;
    cachedGames = Array.isArray(parsed) ? parsed.filter(isGameId).slice(0, 6) : EMPTY;
    return cachedGames;
  } catch {
    return EMPTY;
  }
}

export function getRecentGamesServerSnapshot(): GameId[] {
  return EMPTY;
}

export function subscribeRecentGames(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function nextRecentGames(current: GameId[], game: GameId): GameId[] {
  return [game, ...current.filter((id) => id !== game)].slice(0, 6);
}

export function recordRecentlyPlayed(game: GameId): void {
  const next = nextRecentGames(getRecentGames(), game);
  const raw = JSON.stringify(next);
  cachedRaw = raw;
  cachedGames = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    // The in-memory shelf still works when storage is unavailable.
  }
  listeners.forEach((listener) => listener());
}
