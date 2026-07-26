'use client';

import { useMemo, useSyncExternalStore } from 'react';
import type { CharacterId } from './characters';
import { setCharacterId } from './characters';
import type { GradeBand } from './questions';
import { sha256Hex } from './passcode';

/**
 * Per-kid learner accounts.
 *
 * This is a private family app, not a multi-tenant service, so "accounts" here
 * are a lightweight local thing: each kid is a Profile in localStorage with a
 * name, a grade band (which question bank they get), an avatar, and an optional
 * passcode (stored as a SHA-256 hash, same speed-bump approach as the app
 * passcode - never plaintext in storage). A master account ("Zach") holds its
 * own passcode and can reset any kid's forgotten passcode. None of this is real
 * security; it just keeps a five-year-old out of their sibling's ISEE bank and
 * lets a parent reset a code without wiping the profile.
 *
 * The active profile drives three things: which grade band the study block draws
 * from, which avatar the games render, and (namespaced by id elsewhere) that
 * kid's own progress and play clock.
 */

export type Profile = {
  id: string;
  /** Display name and username - what the kid taps to log in. */
  name: string;
  band: GradeBand;
  avatarId: CharacterId;
  /** SHA-256 hex of the passcode, or '' for no passcode. */
  passcodeHash: string;
};

const PROFILES_KEY = 'isee-arcade:profiles';
const ACTIVE_KEY = 'isee-arcade:active-profile';
const MASTER_KEY = 'isee-arcade:master-hash';

const EMPTY: Profile[] = [];

// --- storage (cached so useSyncExternalStore gets a stable reference) --------

let cachedRaw: string | null = null;
let cachedProfiles: Profile[] = EMPTY;

function readProfiles(): Profile[] {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.localStorage.getItem(PROFILES_KEY);
    if (raw === cachedRaw) return cachedProfiles;
    cachedRaw = raw;
    if (!raw) {
      cachedProfiles = EMPTY;
      return cachedProfiles;
    }
    const parsed = JSON.parse(raw) as Profile[];
    cachedProfiles = Array.isArray(parsed) ? parsed : EMPTY;
    return cachedProfiles;
  } catch {
    return EMPTY;
  }
}

function writeProfiles(list: Profile[]): void {
  try {
    window.localStorage.setItem(PROFILES_KEY, JSON.stringify(list));
  } catch {
    // Private browsing: the notify below still refreshes the in-memory view.
  }
  notify();
}

function readActiveId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

function readMasterHash(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(MASTER_KEY) ?? '';
  } catch {
    return '';
  }
}

// --- module store ------------------------------------------------------------

const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

// --- ids ---------------------------------------------------------------------

function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    // fall through
  }
  return `p-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

// --- reads -------------------------------------------------------------------

export function getProfiles(): Profile[] {
  return readProfiles();
}

export function getActiveProfile(): Profile | null {
  const id = readActiveId();
  if (!id) return null;
  return readProfiles().find((p) => p.id === id) ?? null;
}

/** The active profile's band, or the ISEE bank when nobody is signed in yet. */
export function activeBand(): GradeBand {
  return getActiveProfile()?.band ?? 'isee';
}

/** localStorage key suffix so each kid's progress and play clock stay separate. */
export function profileStorageSuffix(): string {
  const id = readActiveId();
  return id ? `::${id}` : '';
}

export function hasMaster(): boolean {
  return readMasterHash().length === 64;
}

// --- writes ------------------------------------------------------------------

export function addProfile(input: { name: string; band: GradeBand; avatarId: CharacterId }): Profile {
  const profile: Profile = {
    id: newId(),
    name: input.name.trim().slice(0, 16) || 'Player',
    band: input.band,
    avatarId: input.avatarId,
    passcodeHash: '',
  };
  writeProfiles([...readProfiles(), profile]);
  return profile;
}

export function updateProfile(id: string, patch: Partial<Omit<Profile, 'id'>>): void {
  writeProfiles(readProfiles().map((p) => (p.id === id ? { ...p, ...patch } : p)));
}

export function removeProfile(id: string): void {
  writeProfiles(readProfiles().filter((p) => p.id !== id));
  if (readActiveId() === id) setActiveProfile(null);
}

export function setActiveProfile(id: string | null): void {
  try {
    if (id) window.localStorage.setItem(ACTIVE_KEY, id);
    else window.localStorage.removeItem(ACTIVE_KEY);
  } catch {
    // ignore
  }
  // Keep the avatar the games render in sync with who is signed in.
  if (id) {
    const p = readProfiles().find((x) => x.id === id);
    if (p) setCharacterId(p.avatarId);
  }
  notify();
}

// --- passcodes ---------------------------------------------------------------

export async function setProfilePasscode(id: string, code: string): Promise<void> {
  const hash = code ? await sha256Hex(code) : '';
  updateProfile(id, { passcodeHash: hash });
}

/** True when the code matches, or when the profile has no passcode set. */
export async function verifyProfilePasscode(profile: Profile, code: string): Promise<boolean> {
  if (!profile.passcodeHash) return true;
  return (await sha256Hex(code)) === profile.passcodeHash;
}

export async function setMasterPasscode(code: string): Promise<void> {
  try {
    if (code) window.localStorage.setItem(MASTER_KEY, await sha256Hex(code));
    else window.localStorage.removeItem(MASTER_KEY);
  } catch {
    // ignore
  }
  notify();
}

export async function verifyMasterPasscode(code: string): Promise<boolean> {
  const hash = readMasterHash();
  if (!hash) return false;
  return (await sha256Hex(code)) === hash;
}

/** Master-only: clear a kid's passcode so they can set a new one. */
export function resetProfilePasscode(id: string): void {
  updateProfile(id, { passcodeHash: '' });
}

// --- hooks -------------------------------------------------------------------

export function useProfiles(): Profile[] {
  return useSyncExternalStore(subscribe, readProfiles, () => EMPTY);
}

export function useActiveProfileId(): string | null {
  return useSyncExternalStore(subscribe, readActiveId, () => null);
}

export function useActiveProfile(): Profile | null {
  const id = useActiveProfileId();
  const profiles = useProfiles();
  return id ? (profiles.find((p) => p.id === id) ?? null) : null;
}

export function useMasterExists(): boolean {
  return useSyncExternalStore(subscribe, hasMaster, () => false);
}

/**
 * Stable action bundle for the picker UI. The actions are all module-level
 * functions (stable references), so this only needs to memoize the wrapper
 * object so its identity does not change every render.
 */
export function useProfileActions() {
  return useMemo(
    () => ({
      add: addProfile,
      update: updateProfile,
      remove: removeProfile,
      setActive: setActiveProfile,
      setPasscode: setProfilePasscode,
      verifyPasscode: verifyProfilePasscode,
      setMaster: setMasterPasscode,
      verifyMaster: verifyMasterPasscode,
      resetPasscode: resetProfilePasscode,
    }),
    [],
  );
}
