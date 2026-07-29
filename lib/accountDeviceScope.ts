'use client';

import { refreshProfilesFromStorage } from './profiles';

const STORAGE_PREFIX = 'isee-arcade:';
const ACCOUNT_SCOPE_KEY = `${STORAGE_PREFIX}account-scope`;

function removeIseeArcadeKeys(storage: Storage): void {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(STORAGE_PREFIX)) keys.push(key);
  }
  keys.forEach((key) => storage.removeItem(key));
}

/**
 * Keeps a shared phone or iPad from showing one family's cached learners after
 * another account signs in. Supabase's own auth keys use a different prefix.
 */
export function prepareParentDeviceState(userId: string): boolean {
  if (typeof window === 'undefined' || !userId) return false;
  const nextScope = `parent:${userId}`;
  if (window.localStorage.getItem(ACCOUNT_SCOPE_KEY) === nextScope) return false;

  removeIseeArcadeKeys(window.localStorage);
  removeIseeArcadeKeys(window.sessionStorage);
  window.localStorage.setItem(ACCOUNT_SCOPE_KEY, nextScope);
  refreshProfilesFromStorage();
  return true;
}

