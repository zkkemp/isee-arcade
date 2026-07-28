'use client';

import { queueCloudSync } from './cloudSync';

export type DailyUsage = {
  day: string;
  activeMs: number;
};

const KEY = 'isee-arcade:daily-usage';

export function localDay(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function dailyUsageKey(profileId: string): string {
  return `${KEY}::${profileId}`;
}

export function loadDailyUsage(profileId: string): DailyUsage {
  const today = localDay();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(dailyUsageKey(profileId)) ?? '{}') as
      | Partial<DailyUsage>
      | null;
    if (!parsed || parsed.day !== today || typeof parsed.activeMs !== 'number') {
      return { day: today, activeMs: 0 };
    }
    return { day: today, activeMs: Math.max(0, parsed.activeMs) };
  } catch {
    return { day: today, activeMs: 0 };
  }
}

export function saveDailyUsage(profileId: string, usage: DailyUsage): void {
  try {
    window.localStorage.setItem(dailyUsageKey(profileId), JSON.stringify(usage));
  } catch {
    // Private browsing can lose the daily clock; play remains usable.
  }
}

export function addDailyUsage(profileId: string, deltaMs: number): DailyUsage {
  const current = loadDailyUsage(profileId);
  const next = {
    day: current.day,
    activeMs: current.activeMs + Math.max(0, Math.min(deltaMs, 10_000)),
  };
  saveDailyUsage(profileId, next);
  return next;
}

export function syncDailyUsageSoon(): void {
  queueCloudSync();
}
