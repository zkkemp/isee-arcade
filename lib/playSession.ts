'use client';

/**
 * The play-time economy: study buys minutes, and minutes are what the kid spends.
 *
 * The first design gated on every death and every level, which sounded fair and
 * was a disaster in practice - a five-year-old who dies twice a minute answers a
 * question twice a minute, never gets more than a few seconds of game at a time,
 * and stops wanting to play at all. The feedback was blunt: "you're really not
 * playing the game at all because there's too many questions."
 *
 * So the relationship is inverted. Questions are no longer a toll on failure;
 * they are how you BUY a long uninterrupted play window. Inside that window
 * dying is free and levels never interrupt. The clock is the only thing that
 * sends you back to studying, which means the incentives finally point the right
 * way: the kid wants more time, and the only way to get it is to answer.
 *
 * Two levers stretch a window without weakening the studying:
 *  - scoring well (every COIN_STEP points adds a minute, capped) so playing well
 *    is rewarded rather than just surviving
 *  - clearing a level (a smaller top-up)
 * Both are capped per window so the game can never become a perpetual-motion
 * machine that outruns the studying entirely.
 *
 * Everything here is persisted, for the same reason the question debt is: force
 * quitting the app must not refill the clock or shake off an owed study block.
 */

import { clampQuestionBlockSize, getActiveProfile, profileStorageSuffix } from './profiles';

/** Default questions in one study block. Parents can choose 5–20 per learner. */
export const BLOCK_SIZE = 8;
export const MAX_BLOCK_SIZE = 20;

/**
 * Play granted by finishing a study block. Six minutes is long enough to reach a
 * few levels and actually get absorbed, which was the whole complaint.
 */
export const PLAY_WINDOW_MS = 6 * 60_000;

/** Points that earn a bonus minute, and how much each one is worth. */
export const COIN_STEP = 150;
export const COIN_BONUS_MS = 60_000;
/** Clearing a level tops the clock up by this much. */
export const LEVEL_BONUS_MS = 30_000;
/** Ceiling on bonuses within one window, so play can never outrun study. */
export const MAX_BONUS_MS = 5 * 60_000;

/**
 * A study block in progress.
 *
 * One reading passage turns up per block (about one draw in eight, never twice).
 * It counts as a single question like any other - there is no shortcut for
 * getting it right. The incentive to actually read is a penalty instead of a
 * reward: MISSING the reading question adds five more questions to the block (see
 * READING_MISS_PENALTY in GameShell). A wrong guess on a passage therefore costs
 * more than a wrong guess on a synonym, which is the whole point - it makes
 * skimming the passage the expensive move. The added questions do not have to be
 * reading; grinding three passages in a row is how you teach a kid to hate
 * reading.
 */
export type StudyBlock = {
  /** Parent-selected base target captured when this block begins. */
  target: number;
  /** Correct answers so far in this block. */
  correct: number;
  /**
   * Extra answers added to this block - two per missed reading question, one per
   * three-wrong streak. Kept on the block rather than in a ref so a force quit
   * cannot shrug the raised bar off.
   */
  penalty: number;
  /** The one reading question has been served. */
  readingServed: boolean;
};

export type PlaySession = {
  /** Play time remaining, in ms. */
  msLeft: number;
  /** Bonus already granted in this window, against MAX_BONUS_MS. */
  bonusMs: number;
  /** Score at the last bonus minute, so bonuses are not paid twice. */
  bonusAtScore: number;
  /** Study blocks finished, all time. Drives the "block 4" label. */
  blocksDone: number;
  /** Non-null while a block is owed. */
  study: StudyBlock | null;
};

function activeBlockTarget(): number {
  return clampQuestionBlockSize(getActiveProfile()?.questionBlockSize ?? BLOCK_SIZE);
}

export function newBlock(target = activeBlockTarget()): StudyBlock {
  return {
    target: clampQuestionBlockSize(target),
    correct: 0,
    penalty: 0,
    readingServed: false,
  };
}

/**
 * A fresh player starts owing a block rather than holding a free window. The
 * app's whole purpose is the studying, so the first thing it ever does is ask.
 */
export function emptySession(): PlaySession {
  return {
    msLeft: 0,
    bonusMs: 0,
    bonusAtScore: 0,
    blocksDone: 0,
    study: newBlock(),
  };
}

/** True once the block has been satisfied. */
export function blockComplete(b: StudyBlock): boolean {
  return b.correct >= Math.min(MAX_BLOCK_SIZE, b.target + b.penalty);
}

/** Questions still to answer, for the "3 to go" line. */
export function questionsLeft(b: StudyBlock): number {
  return Math.max(0, Math.min(MAX_BLOCK_SIZE, b.target + b.penalty) - b.correct);
}

const BASE_KEY = 'isee-arcade:play-session';

// The play clock is per learner, so each kid earns and spends their own time.
function key(): string {
  return `${BASE_KEY}${profileStorageSuffix()}`;
}

export function loadSession(): PlaySession {
  if (typeof window === 'undefined') return emptySession();
  try {
    const raw = window.localStorage.getItem(key());
    if (!raw) return emptySession();
    const s = JSON.parse(raw) as PlaySession;
    if (!s || typeof s !== 'object' || typeof s.msLeft !== 'number') return emptySession();
    return {
      // Clamp rather than trust: a corrupted or hand-edited value should not hand
      // out an unbounded window.
      msLeft: Math.max(0, Math.min(s.msLeft, PLAY_WINDOW_MS + MAX_BONUS_MS)),
      bonusMs: Math.max(0, Math.min(s.bonusMs ?? 0, MAX_BONUS_MS)),
      bonusAtScore: Math.max(0, s.bonusAtScore ?? 0),
      blocksDone: Math.max(0, s.blocksDone ?? 0),
      // Rebuilt field by field rather than spread, so a stored block from an
      // older build (which carried a now-removed readingWon flag) is normalised
      // to the current shape instead of dragging a stray field along.
      study:
        s.study && typeof s.study.correct === 'number'
          ? {
              target: clampQuestionBlockSize(s.study.target ?? activeBlockTarget()),
              correct: Math.max(0, s.study.correct),
              penalty: Math.max(
                0,
                Math.min(
                  s.study.penalty ?? 0,
                  MAX_BLOCK_SIZE -
                    clampQuestionBlockSize(s.study.target ?? activeBlockTarget()),
                ),
              ),
              readingServed: s.study.readingServed === true,
            }
          : null,
    };
  } catch {
    return emptySession();
  }
}

export function saveSession(s: PlaySession): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key(), JSON.stringify(s));
  } catch {
    // Private browsing or quota. The clock then only lasts the session.
  }
  void import('./cloudSync')
    .then(({ queueCloudSync }) => queueCloudSync())
    .catch(() => undefined);
}

/** mm:ss for the HUD. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
