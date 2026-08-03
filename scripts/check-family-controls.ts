import fs from 'node:fs';
import path from 'node:path';
import {
  GRADE_BANDS,
  GRADE_BAND_LABELS,
  familyCountForKind,
  familyIdsForBand,
  pickQuestion,
} from '../lib/questions';
import { usernameAuthEmail } from '../lib/accountUsername';
import {
  clampDailyLimit,
  clampPerfectBlockBonusMinutes,
  clampPlayWindowMinutes,
  clampQuestionBlockSize,
} from '../lib/profiles';
import {
  MAX_BLOCK_SIZE,
  blockComplete,
  playAwardMs,
  questionsLeft,
  type StudyBlock,
} from '../lib/playSession';
import { foregroundElapsedMs, newForegroundClock } from '../lib/foregroundTimer';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

assert(GRADE_BANDS.length === 12, 'all nine school grades and three ISEE levels must be selectable');
for (const band of GRADE_BANDS) {
  assert(GRADE_BAND_LABELS[band].length > 4, `${band} needs a visible label`);
  assert(familyIdsForBand(band).length > 0, `${band} has no routed question families`);
  const question = pickQuestion({ band });
  assert(question.choices[question.answer] !== undefined, `${band} produced a broken question`);
}

const lowerVocabulary = familyCountForKind('isee', 'synonym');
const middleVocabulary = familyCountForKind('iseeMiddle', 'synonym');
const upperVocabulary = familyCountForKind('iseeUpper', 'synonym');
assert(lowerVocabulary === 550, 'the protected Lower Level bank must retain 550 words');
assert(
  middleVocabulary === lowerVocabulary && upperVocabulary === lowerVocabulary,
  'Middle and Upper routes must carry the same 550-word coverage target as Lower',
);

assert(
  GRADE_BAND_LABELS.isee === 'ISEE Lower Level — Applying to Fifth or Sixth Grade',
  'Lower Level label must spell out its application grades',
);
assert(
  GRADE_BAND_LABELS.iseeMiddle ===
    'ISEE Middle Level — Applying to Seventh or Eighth Grade',
  'Middle Level label must spell out its application grades',
);
assert(
  GRADE_BAND_LABELS.iseeUpper.includes('Ninth, Tenth, Eleventh, or Twelfth Grade'),
  'Upper Level label must spell out its application grades',
);

assert(clampDailyLimit(1) === 5 && clampDailyLimit(999) === 240, 'daily limits must clamp');
assert(
  clampQuestionBlockSize(1) === 5 && clampQuestionBlockSize(99) === 20,
  'question blocks must stay between 5 and 20',
);
assert(
  clampPlayWindowMinutes(0) === 1 && clampPlayWindowMinutes(99) === 60,
  'question intervals must stay between 1 and 60 minutes',
);
assert(
  clampPerfectBlockBonusMinutes(-1) === 0 && clampPerfectBlockBonusMinutes(99) === 60,
  'perfect-block rewards must stay between 0 and 60 minutes',
);
const block: StudyBlock = {
  target: 18,
  correct: 17,
  mistakes: 0,
  penalty: 9,
  readingServed: true,
  playWindowMinutes: 7,
  perfectBlockBonusMinutes: 3,
};
assert(questionsLeft(block) === 3, 'penalties must hard-cap a study block at 20');
assert(!blockComplete(block), 'a capped block must not finish early');
assert(blockComplete({ ...block, correct: MAX_BLOCK_SIZE }), 'a capped block must finish at 20');
assert(playAwardMs(block) === 10 * 60_000, 'a perfect block must earn the parent-selected bonus');
assert(
  playAwardMs({ ...block, mistakes: 1 }) === 7 * 60_000,
  'one wrong answer must remove the perfect-block bonus',
);

const clock = newForegroundClock(1_000, true);
assert(foregroundElapsedMs(clock, 2_000, true) === 1_000, 'visible timer tick is wrong');
assert(foregroundElapsedMs(clock, 300_000, false) === 0, 'hidden time must not count');
assert(foregroundElapsedMs(clock, 300_100, true) === 0, 'resume tick must reset its baseline');
assert(foregroundElapsedMs(clock, 310_100, true) === 2_000, 'one delayed tick must be capped');

assert(
  usernameAuthEmail(' Family_One ') === 'family_one@accounts.isee-arcade.app',
  'parent usernames must map to a stable internal Auth identifier',
);

const limitSource = fs.readFileSync(
  path.join(process.cwd(), 'components', 'DailyLimitProvider.tsx'),
  'utf8',
);
assert(
  limitSource.includes('foregroundElapsedMs') && limitSource.includes("window.addEventListener('pageshow'"),
  'backgrounded or suspended mobile tabs must not consume daily time on resume',
);
assert(
  limitSource.includes('deferredRef.current'),
  'daily limit must support finishing the current question block or round',
);

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    'supabase',
    'migrations',
    '202607270002_username_profiles_and_limits.sql',
  ),
  'utf8',
);
assert(migration.includes('Never run this in any KEMPCO/FSM project'), 'migration needs protected boundary');
assert(migration.includes('question_block_size between 5 and 20'), 'database must enforce question range');
assert(migration.includes('daily_limit_minutes between 5 and 240'), 'database must enforce daily range');

const timerMigration = fs.readFileSync(
  path.join(
    process.cwd(),
    'supabase',
    'migrations',
    '202608020001_parent_playtime_rules.sql',
  ),
  'utf8',
);
assert(
  timerMigration.includes('hgmupcysijskaowsrgbn') &&
    timerMigration.includes('play_window_minutes between 1 and 60') &&
    timerMigration.includes('perfect_block_bonus_minutes between 0 and 60'),
  'parent timer rules need pinned, database-enforced ranges',
);

const gameShellSource = fs.readFileSync(
  path.join(process.cwd(), 'components', 'GameShell.tsx'),
  'utf8',
);
assert(
  gameShellSource.includes('playAwardMs(next)') &&
    gameShellSource.includes('mistakes: b.mistakes + 1') &&
    !gameShellSource.includes('grantBonus') &&
    !gameShellSource.includes('COIN_BONUS_MS') &&
    !gameShellSource.includes('LEVEL_BONUS_MS'),
  'only a perfect study block may add extra play time; games must never add it',
);

console.log(
  'Family controls audit: 12 grade/test routes, username auth mapping, secure ranges, ' +
  'mobile-safe timer accounting, parent-selected study intervals, perfect-only rewards, and isolated Supabase migrations passed.',
);
