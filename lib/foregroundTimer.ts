/**
 * A small foreground-only elapsed-time clock.
 *
 * Mobile Safari may suspend JavaScript while an iPhone or iPad is locked or the
 * app is backgrounded, then deliver one delayed interval after it becomes
 * visible again. Resetting on visibility changes and capping a single tick keeps
 * that delayed callback from removing minutes in one jump.
 */

export type ForegroundClock = {
  lastAt: number;
  wasVisible: boolean;
};

export const MAX_FOREGROUND_TICK_MS = 2_000;

export function newForegroundClock(now = Date.now(), visible = true): ForegroundClock {
  return { lastAt: now, wasVisible: visible };
}

export function resetForegroundClock(
  clock: ForegroundClock,
  now = Date.now(),
  visible = true,
): void {
  clock.lastAt = now;
  clock.wasVisible = visible;
}

export function foregroundElapsedMs(
  clock: ForegroundClock,
  now: number,
  visible: boolean,
): number {
  const elapsed = Math.max(0, now - clock.lastAt);
  const count = visible && clock.wasVisible ? Math.min(elapsed, MAX_FOREGROUND_TICK_MS) : 0;
  clock.lastAt = now;
  clock.wasVisible = visible;
  return count;
}
