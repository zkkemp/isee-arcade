'use client';

import { useMemo, useSyncExternalStore } from 'react';
import type { CharacterId } from './characters';
import { setCharacterId } from './characters';
import type { GradeBand } from './questions';
import { newCredentialSalt, passwordHash, sha256Hex } from './passcode';
import { setPlayerMode } from './playerMode';

/**
 * Per-kid learner accounts.
 *
 * Profiles stay local-first so the arcade keeps working offline. When a parent
 * connects the separate ISEE Arcade Supabase project, the cloud-sync layer
 * mirrors these profiles and their learning data into that parent's RLS-protected
 * household. Kid passcodes remain device-local and are never uploaded.
 *
 * The active profile drives three things: which grade band the study block draws
 * from, which avatar the games render, and (namespaced by id elsewhere) that
 * kid's own progress and play clock.
 */

export type Profile = {
  id: string;
  /** Friendly name shown around the arcade. */
  name: string;
  /** Case-insensitive login name chosen by the parent. */
  username: string;
  band: GradeBand;
  avatarId: CharacterId;
  /** PBKDF2 hash, or a legacy SHA-256 hash when passcodeSalt is empty. */
  passcodeHash: string;
  passcodeSalt: string;
  /** Total foreground learning/play time allowed per local calendar day. */
  dailyLimitMinutes: number;
  /** Correct answers required to earn a play window. Always 5–20. */
  questionBlockSize: number;
  /** Minutes of uninterrupted play before the next study block. */
  playWindowMinutes: number;
  /** Extra minutes awarded only when a study block has no wrong answers. */
  perfectBlockBonusMinutes: number;
  /** Gently gives weak skills a little more practice without taking over the mix. */
  smartPractice: boolean;
};

export const DEFAULT_PLAY_WINDOW_MINUTES = 6;
export const DEFAULT_PERFECT_BLOCK_BONUS_MINUTES = 0;

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
    const parsed = JSON.parse(raw) as Array<Partial<Profile>>;
    cachedProfiles = Array.isArray(parsed)
      ? parsed
          .filter(
            (profile): profile is Partial<Profile> & { id: string; name: string } =>
              typeof profile?.id === 'string' && typeof profile?.name === 'string',
          )
          .map((profile) => ({
            id: profile.id,
            name: profile.name,
            username: cleanUsername(profile.username || profile.name),
            band: profile.band ?? 'isee',
            avatarId: profile.avatarId ?? 'dakota',
            passcodeHash: profile.passcodeHash ?? '',
            passcodeSalt: profile.passcodeSalt ?? '',
            dailyLimitMinutes: clampDailyLimit(profile.dailyLimitMinutes),
            questionBlockSize: clampQuestionBlockSize(profile.questionBlockSize),
            playWindowMinutes: clampPlayWindowMinutes(profile.playWindowMinutes),
            perfectBlockBonusMinutes: clampPerfectBlockBonusMinutes(
              profile.perfectBlockBonusMinutes,
            ),
            smartPractice: profile.smartPractice !== false,
          }))
      : EMPTY;
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
  void import('./cloudSync')
    .then(({ queueCloudSync }) => queueCloudSync())
    .catch(() => undefined);
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

/** Refreshes mounted profile readers after cloud restore writes localStorage. */
export function refreshProfilesFromStorage(): void {
  cachedRaw = null;
  notify();
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

export function cleanUsername(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 24);
}

export function clampDailyLimit(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return 30;
  return Math.max(5, Math.min(240, Math.round(number)));
}

export function clampQuestionBlockSize(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return 8;
  return Math.max(5, Math.min(20, Math.round(number)));
}

export function clampPlayWindowMinutes(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return DEFAULT_PLAY_WINDOW_MINUTES;
  return Math.max(1, Math.min(60, Math.round(number)));
}

export function clampPerfectBlockBonusMinutes(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return DEFAULT_PERFECT_BLOCK_BONUS_MINUTES;
  return Math.max(0, Math.min(60, Math.round(number)));
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

export function addProfile(input: {
  name: string;
  username?: string;
  band: GradeBand;
  avatarId: CharacterId;
  dailyLimitMinutes?: number;
  questionBlockSize?: number;
  playWindowMinutes?: number;
  perfectBlockBonusMinutes?: number;
  smartPractice?: boolean;
}): Profile {
  const baseUsername = cleanUsername(input.username || input.name) || 'player';
  const used = new Set(readProfiles().map((profile) => profile.username));
  let username = baseUsername;
  let suffix = 2;
  while (used.has(username)) {
    username = `${baseUsername.slice(0, 20)}${suffix}`;
    suffix += 1;
  }
  const profile: Profile = {
    id: newId(),
    name: input.name.trim().slice(0, 16) || 'Player',
    username,
    band: input.band,
    avatarId: input.avatarId,
    passcodeHash: '',
    passcodeSalt: '',
    dailyLimitMinutes: clampDailyLimit(input.dailyLimitMinutes),
    questionBlockSize: clampQuestionBlockSize(input.questionBlockSize),
    playWindowMinutes: clampPlayWindowMinutes(input.playWindowMinutes),
    perfectBlockBonusMinutes: clampPerfectBlockBonusMinutes(
      input.perfectBlockBonusMinutes,
    ),
    smartPractice: input.smartPractice !== false,
  };
  writeProfiles([...readProfiles(), profile]);
  return profile;
}

export function updateProfile(id: string, patch: Partial<Omit<Profile, 'id'>>): void {
  const profiles = readProfiles();
  const requestedUsername =
    patch.username === undefined ? undefined : cleanUsername(patch.username);
  const usernameTaken =
    requestedUsername !== undefined &&
    profiles.some((profile) => profile.id !== id && profile.username === requestedUsername);
  writeProfiles(
    profiles.map((profile) =>
      profile.id === id
        ? {
            ...profile,
            ...patch,
            username:
              requestedUsername && !usernameTaken ? requestedUsername : profile.username,
            dailyLimitMinutes:
              patch.dailyLimitMinutes === undefined
                ? profile.dailyLimitMinutes
                : clampDailyLimit(patch.dailyLimitMinutes),
            questionBlockSize:
              patch.questionBlockSize === undefined
                ? profile.questionBlockSize
                : clampQuestionBlockSize(patch.questionBlockSize),
            playWindowMinutes:
              patch.playWindowMinutes === undefined
                ? profile.playWindowMinutes
                : clampPlayWindowMinutes(patch.playWindowMinutes),
            perfectBlockBonusMinutes:
              patch.perfectBlockBonusMinutes === undefined
                ? profile.perfectBlockBonusMinutes
                : clampPerfectBlockBonusMinutes(patch.perfectBlockBonusMinutes),
          }
        : profile,
    ),
  );
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
    setPlayerMode('learner');
  } else {
    setPlayerMode(null);
  }
  notify();
}

// --- passcodes ---------------------------------------------------------------

export async function setProfilePasscode(id: string, code: string): Promise<void> {
  const salt = code ? newCredentialSalt() : '';
  const hash = code ? await passwordHash(code, salt) : '';
  updateProfile(id, { passcodeHash: hash, passcodeSalt: salt });
}

/** True when the code matches, or when the profile has no passcode set. */
export async function verifyProfilePasscode(profile: Profile, code: string): Promise<boolean> {
  if (!profile.passcodeHash) return true;
  return profile.passcodeSalt
    ? (await passwordHash(code, profile.passcodeSalt)) === profile.passcodeHash
    : (await sha256Hex(code)) === profile.passcodeHash;
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
  updateProfile(id, { passcodeHash: '', passcodeSalt: '' });
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
