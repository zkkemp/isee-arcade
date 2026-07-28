'use client';

import type { Profile } from './profiles';
import type { Progress } from './progress';
import {
  parentContentSnapshot,
  restoreParentContentSnapshot,
} from './parentControls';
import { getSupabaseBrowserClient } from './supabase/client';

const PROFILE_KEY = 'isee-arcade:profiles';
const RECENT_KEY = 'isee-arcade:recent-games';
const PROGRESS_KEY = 'isee-arcade:v1';
const SESSION_KEY = 'isee-arcade:play-session';
const PAINTING_KEY = 'isee-arcade:color-by-number:v1';
const PAINTING_FINISHED_KEY = 'isee-arcade:color-by-number:finished:v1';
const DAILY_USAGE_KEY = 'isee-arcade:daily-usage';
const SETTINGS_KEYS = [
  'isee-arcade:difficulty',
  'isee-arcade:character',
  'isee-arcade:character-name',
  'isee-arcade:muted',
] as const;

export type CloudSyncResult = {
  ok: boolean;
  message: string;
  learners: number;
};

type RemoteLearner = {
  id: string;
  local_profile_id: string;
  display_name: string;
  grade_band: Profile['band'];
  avatar_id: Profile['avatarId'];
  username: string;
  password_hash: string;
  password_salt: string;
  daily_limit_minutes: number;
  question_block_size: number;
  smart_practice: boolean;
};

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let syncInFlight: Promise<CloudSyncResult> | null = null;

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function readProfiles(): Profile[] {
  const parsed = parseJson<unknown>(window.localStorage.getItem(PROFILE_KEY), []);
  return Array.isArray(parsed)
    ? parsed.flatMap((candidate) => {
        const profile = candidate as Partial<Profile> | null;
        if (!profile || typeof profile.id !== 'string' || typeof profile.name !== 'string') {
          return [];
        }
        return [
          {
            id: profile.id,
            name: profile.name,
            username:
              profile.username ||
              profile.name.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24) ||
              'player',
            band: profile.band ?? 'isee',
            avatarId: profile.avatarId ?? 'dakota',
            passcodeHash: profile.passcodeHash ?? '',
            passcodeSalt: profile.passcodeSalt ?? '',
            dailyLimitMinutes: Math.max(5, Math.min(240, profile.dailyLimitMinutes ?? 30)),
            questionBlockSize: Math.max(5, Math.min(20, profile.questionBlockSize ?? 8)),
            smartPractice: profile.smartPractice !== false,
          } satisfies Profile,
        ];
      })
    : [];
}

function settingsSnapshot(): Record<string, string> {
  return Object.fromEntries(
    SETTINGS_KEYS.flatMap((key) => {
      const value = window.localStorage.getItem(key);
      return value === null ? [] : [[key, value]];
    }),
  );
}

async function householdId(): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  const { data: membership } = await supabase
    .from('household_members')
    .select('household_id')
    .limit(1)
    .maybeSingle();
  if (membership?.household_id) return String(membership.household_id);
  const { data, error } = await supabase.rpc('ensure_my_household');
  if (error) throw error;
  return typeof data === 'string' ? data : null;
}

export async function uploadDeviceState(): Promise<CloudSyncResult> {
  if (typeof window === 'undefined') {
    return { ok: false, message: 'Cloud sync runs in the browser.', learners: 0 };
  }
  if (syncInFlight) return syncInFlight;

  syncInFlight = (async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      return {
        ok: false,
        message: 'Connect a separate ISEE Arcade Supabase project first.',
        learners: 0,
      };
    }
    const { data: claims } = await supabase.auth.getClaims();
    if (!claims?.claims?.sub) {
      return { ok: false, message: 'Sign in to sync this device.', learners: 0 };
    }

    try {
      const familyId = await householdId();
      if (!familyId) throw new Error('No family household was available.');
      const profiles = readProfiles();
      if (profiles.length === 0) {
        return { ok: true, message: 'Signed in. Add a learner to begin syncing.', learners: 0 };
      }

      const learnerRows = profiles.map((profile) => ({
        household_id: familyId,
        local_profile_id: profile.id,
        display_name: profile.name.slice(0, 32),
        username: profile.username,
        grade_band: profile.band,
        avatar_id: profile.avatarId,
        password_hash: profile.passcodeHash,
        password_salt: profile.passcodeSalt,
        daily_limit_minutes: profile.dailyLimitMinutes,
        question_block_size: profile.questionBlockSize,
        smart_practice: profile.smartPractice,
        updated_at: new Date().toISOString(),
      }));
      const { data: remoteLearners, error: learnerError } = await supabase
        .from('learners')
        .upsert(learnerRows, { onConflict: 'household_id,local_profile_id' })
        .select('id,local_profile_id');
      if (learnerError) throw learnerError;

      const remoteByLocal = new Map(
        (remoteLearners ?? []).map((learner) => [
          String(learner.local_profile_id),
          String(learner.id),
        ]),
      );
      const recent = parseJson<unknown[]>(window.localStorage.getItem(RECENT_KEY), []);
      const settings = settingsSnapshot();

      const snapshots = profiles.flatMap((profile) => {
        const learnerId = remoteByLocal.get(profile.id);
        if (!learnerId) return [];
        const progress = parseJson<Progress | Record<string, never>>(
          window.localStorage.getItem(`${PROGRESS_KEY}::${profile.id}`),
          {},
        );
        const playSession = parseJson<Record<string, unknown>>(
          window.localStorage.getItem(`${SESSION_KEY}::${profile.id}`),
          {},
        );
        const paintings = parseJson<Record<string, number[]>>(
          window.localStorage.getItem(`${PAINTING_KEY}::${profile.id}`) ??
            window.localStorage.getItem(PAINTING_KEY),
          {},
        );
        const finishedPaintings = parseJson<string[]>(
          window.localStorage.getItem(`${PAINTING_FINISHED_KEY}::${profile.id}`) ??
            window.localStorage.getItem(PAINTING_FINISHED_KEY),
          [],
        );
        const dailyUsage = parseJson<Record<string, unknown>>(
          window.localStorage.getItem(`${DAILY_USAGE_KEY}::${profile.id}`),
          {},
        );
        return [
          {
            learner_id: learnerId,
            progress,
            play_session: playSession,
            recent_games: recent,
            painting_progress: { pictures: paintings, finished: finishedPaintings },
            settings: { ...settings, dailyUsage },
            updated_at: new Date().toISOString(),
          },
        ];
      });
      const { error: snapshotError } = await supabase
        .from('learner_snapshots')
        .upsert(snapshots, { onConflict: 'learner_id' });
      if (snapshotError) throw snapshotError;

      const attempts = snapshots.flatMap((snapshot) => {
        const progress = snapshot.progress as Partial<Progress>;
        return (progress.history ?? []).map((attempt) => ({
          attempt_key: `${snapshot.learner_id}:${attempt.t}:${attempt.id}`,
          learner_id: snapshot.learner_id,
          question_id: attempt.id,
          subject: attempt.subject,
          correct: attempt.correct,
          answered_at: new Date(attempt.t).toISOString(),
        }));
      });
      if (attempts.length > 0) {
        const { error: attemptError } = await supabase
          .from('question_attempts')
          .upsert(attempts, { onConflict: 'attempt_key', ignoreDuplicates: true });
        if (attemptError) throw attemptError;
      }

      const { error: preferencesError } = await supabase
        .from('parent_preferences')
        .upsert(
          {
            household_id: familyId,
            content_controls: parentContentSnapshot(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'household_id' },
        );
      if (preferencesError) throw preferencesError;

      return {
        ok: true,
        message: `Synced ${profiles.length} learner${profiles.length === 1 ? '' : 's'} safely.`,
        learners: profiles.length,
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Cloud sync failed. Try again.',
        learners: 0,
      };
    }
  })();

  try {
    return await syncInFlight;
  } finally {
    syncInFlight = null;
  }
}

export function queueCloudSync(): void {
  if (typeof window === 'undefined' || !getSupabaseBrowserClient()) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void uploadDeviceState().then((result) => {
      if (!result.ok) return uploadSignedInChildState();
    });
  }, 1800);
}

export async function uploadSignedInChildState(): Promise<void> {
  if (typeof window === 'undefined') return;
  const profiles = readProfiles();
  const activeId = window.localStorage.getItem('isee-arcade:active-profile');
  const profile = profiles.find((candidate) => candidate.id === activeId);
  if (!profile) return;
  const settings = settingsSnapshot();
  await fetch('/api/child/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      progress: parseJson(window.localStorage.getItem(`${PROGRESS_KEY}::${profile.id}`), {}),
      playSession: parseJson(window.localStorage.getItem(`${SESSION_KEY}::${profile.id}`), {}),
      recentGames: parseJson(window.localStorage.getItem(RECENT_KEY), []),
      paintings: parseJson(
        window.localStorage.getItem(`${PAINTING_KEY}::${profile.id}`),
        {},
      ),
      finishedPaintings: parseJson(
        window.localStorage.getItem(`${PAINTING_FINISHED_KEY}::${profile.id}`),
        [],
      ),
      dailyUsage: parseJson(
        window.localStorage.getItem(`${DAILY_USAGE_KEY}::${profile.id}`),
        {},
      ),
      settings,
    }),
  });
}

export async function restoreCloudFamily(): Promise<CloudSyncResult> {
  if (typeof window === 'undefined') {
    return { ok: false, message: 'Cloud restore runs in the browser.', learners: 0 };
  }
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return { ok: false, message: 'Connect ISEE Arcade Supabase first.', learners: 0 };
  }
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) {
    return { ok: false, message: 'Sign in before restoring.', learners: 0 };
  }

  try {
    const familyId = await householdId();
    if (!familyId) throw new Error('No family household was available.');
    const { data: learners, error: learnerError } = await supabase
      .from('learners')
      .select(
        'id,local_profile_id,display_name,username,grade_band,avatar_id,password_hash,password_salt,daily_limit_minutes,question_block_size,smart_practice',
      )
      .eq('household_id', familyId)
      .order('created_at');
    if (learnerError) throw learnerError;
    const remote = (learners ?? []) as RemoteLearner[];
    if (remote.length === 0) {
      return { ok: true, message: 'The cloud family does not have learners yet.', learners: 0 };
    }

    const { data: snapshots, error: snapshotError } = await supabase
      .from('learner_snapshots')
      .select('learner_id,progress,play_session,recent_games,painting_progress,settings')
      .in('learner_id', remote.map((learner) => learner.id));
    if (snapshotError) throw snapshotError;
    const snapshotsByLearner = new Map(
      (snapshots ?? []).map((snapshot) => [String(snapshot.learner_id), snapshot]),
    );

    const existing = readProfiles();
    const existingById = new Map(existing.map((profile) => [profile.id, profile]));
    remote.forEach((learner) => {
      const prior = existingById.get(learner.local_profile_id);
      existingById.set(learner.local_profile_id, {
        id: learner.local_profile_id,
        name: learner.display_name,
        username: learner.username,
        band: learner.grade_band,
        avatarId: learner.avatar_id,
        passcodeHash: learner.password_hash || prior?.passcodeHash || '',
        passcodeSalt: learner.password_salt || prior?.passcodeSalt || '',
        dailyLimitMinutes: learner.daily_limit_minutes ?? prior?.dailyLimitMinutes ?? 30,
        questionBlockSize: learner.question_block_size ?? prior?.questionBlockSize ?? 8,
        smartPractice: learner.smart_practice ?? prior?.smartPractice ?? true,
      });
      const snapshot = snapshotsByLearner.get(learner.id);
      if (!snapshot) return;
      window.localStorage.setItem(
        `${PROGRESS_KEY}::${learner.local_profile_id}`,
        JSON.stringify(snapshot.progress ?? {}),
      );
      window.localStorage.setItem(
        `${SESSION_KEY}::${learner.local_profile_id}`,
        JSON.stringify(snapshot.play_session ?? {}),
      );
      const painting = snapshot.painting_progress as
        | { pictures?: Record<string, number[]>; finished?: string[] }
        | null;
      if (painting?.pictures) {
        window.localStorage.setItem(
          `${PAINTING_KEY}::${learner.local_profile_id}`,
          JSON.stringify(painting.pictures),
        );
      }
      if (painting?.finished) {
        window.localStorage.setItem(
          `${PAINTING_FINISHED_KEY}::${learner.local_profile_id}`,
          JSON.stringify(painting.finished),
        );
      }
      const learnerSettings = snapshot.settings as
        | (Record<string, string> & { dailyUsage?: Record<string, unknown> })
        | null;
      if (learnerSettings?.dailyUsage) {
        window.localStorage.setItem(
          `${DAILY_USAGE_KEY}::${learner.local_profile_id}`,
          JSON.stringify(learnerSettings.dailyUsage),
        );
      }
    });
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify([...existingById.values()]));

    const firstSnapshot = remote
      .map((learner) => snapshotsByLearner.get(learner.id))
      .find(Boolean);
    if (firstSnapshot) {
      window.localStorage.setItem(RECENT_KEY, JSON.stringify(firstSnapshot.recent_games ?? []));
      const settings = firstSnapshot.settings as Record<string, string> | null;
      SETTINGS_KEYS.forEach((key) => {
        if (settings?.[key] !== undefined) window.localStorage.setItem(key, settings[key]);
      });
    }

    const { data: parentPreferences, error: preferencesError } = await supabase
      .from('parent_preferences')
      .select('content_controls')
      .eq('household_id', familyId)
      .maybeSingle();
    if (preferencesError) throw preferencesError;
    if (parentPreferences?.content_controls) {
      restoreParentContentSnapshot(parentPreferences.content_controls);
    }

    return {
      ok: true,
      message: `Restored ${remote.length} learner${remote.length === 1 ? '' : 's'} from the cloud.`,
      learners: remote.length,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Cloud restore failed. Try again.',
      learners: 0,
    };
  }
}
