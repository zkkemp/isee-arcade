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

/** Retired catalog ids collapse into their surviving game instead of vanishing. */
export function normalizeRecentGames(value: unknown): GameId[] {
  if (!Array.isArray(value)) return EMPTY;
  const normalized: GameId[] = [];
  for (const candidate of value) {
    const migrated = candidate === 'platformer2' ? 'platformer' : candidate;
    if (isGameId(migrated) && !normalized.includes(migrated)) normalized.push(migrated);
    if (normalized.length === 6) break;
  }
  return normalized.length > 0 ? normalized : EMPTY;
}

export function getRecentGames(): GameId[] {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === cachedRaw) return cachedGames;
    if (!raw) {
      cachedRaw = raw;
      cachedGames = EMPTY;
      return cachedGames;
    }
    const parsed = JSON.parse(raw) as unknown;
    cachedGames = normalizeRecentGames(parsed);
    const migratedRaw = JSON.stringify(cachedGames);
    cachedRaw = migratedRaw;
    if (migratedRaw !== raw) window.localStorage.setItem(STORAGE_KEY, migratedRaw);
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
  void import('./cloudSync')
    .then(({ queueCloudSync }) => queueCloudSync())
    .catch(() => undefined);
}
