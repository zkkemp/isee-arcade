import fs from 'node:fs';
import path from 'node:path';
import { smartFocusForProgress } from '../lib/adaptivePractice';
import {
  curriculumFamiliesForBand,
  GRADE_BANDS,
  questionById,
} from '../lib/questions';
import { emptyProgress, mergeProgressSnapshots, recordAnswer } from '../lib/progress';
import { buildPracticeSection } from '../lib/iseePractice';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

for (const band of GRADE_BANDS) {
  const catalog = curriculumFamiliesForBand(band);
  assert(catalog.length > 0, `${band} parent catalog is empty`);
  const ids = new Set(catalog.map((family) => family.id));
  assert(ids.size === catalog.length, `${band} parent catalog repeats family ids`);
  for (const family of catalog.slice(0, 25)) {
    assert(
      family.sample.choices[family.sample.answer] !== undefined,
      `${band}/${family.id} has no valid answer`,
    );
  }
}

const mathId = curriculumFamiliesForBand('isee').find(
  (family) => family.subject === 'math',
)?.id;
assert(mathId && questionById(mathId), 'audit needs a restorable math family');
let progress = emptyProgress();
for (let index = 0; index < 6; index += 1) {
  progress = recordAnswer(progress, {
    id: mathId,
    subject: 'math',
    correct: index === 5,
  });
}
const focus = smartFocusForProgress(progress);
assert(focus?.subject === 'math', 'Smart Practice must find a repeated weak math lane');
assert(focus.attempts === 6, 'Smart Practice evidence count is wrong');
assert(focus.topic, 'Smart Practice must identify a concrete topic, not only a broad subject');

const excludedVerbal = curriculumFamiliesForBand('isee').find(
  (family) => family.subject === 'verbal',
)?.id;
assert(excludedVerbal, 'audit needs an ISEE verbal question');
for (let seed = 1; seed <= 5; seed += 1) {
  assert(
    !buildPracticeSection('verbal', seed, 34, 'lower', [excludedVerbal]).some(
      (question) => question.id === excludedVerbal,
    ),
    'formal ISEE practice served parent-disabled content',
  );
}

const shellSource = fs.readFileSync(
  path.join(process.cwd(), 'components', 'GameShell.tsx'),
  'utf8',
);
assert(shellSource.includes("playerMode === 'parent'"), 'games need explicit parent sandbox mode');
assert(
  shellSource.includes('if (parentSandbox) return;'),
  'parent sandbox must bypass opening the study gate',
);
assert(shellSource.includes('Math.random() < 0.3'), 'Smart Practice must remain a gentle 30% nudge');
assert(shellSource.includes('focusTopic:'), 'Smart Practice must target concrete skill topics');
assert(
  shellSource.includes('ms = 2800'),
  'the level-clear celebration must remain visible long enough to read',
);

const celebrationSource = fs.readFileSync(
  path.join(process.cwd(), 'components', 'CelebrationCard.tsx'),
  'utf8',
);
assert(
  celebrationSource.includes('character: Character') &&
    celebrationSource.includes('character={character}'),
  'celebrations must render the active learner avatar',
);
assert(
  !celebrationSource.includes("getCharacter('marty')"),
  'celebrations must never fall back to a hard-coded boy avatar',
);

const modeSource = fs.readFileSync(
  path.join(process.cwd(), 'lib', 'playerMode.ts'),
  'utf8',
);
assert(
  modeSource.includes('sessionStorage') && !modeSource.includes('localStorage'),
  'parent access must expire with the browser session',
);

const reportSource = fs.readFileSync(
  path.join(process.cwd(), 'components', 'parent', 'ParentReports.tsx'),
  'utf8',
);
assert(reportSource.includes('setHours(0, 0, 0, 0)'), 'report days must align to local midnight');
assert(
  reportSource.includes('useParentCloudRefresh'),
  'open parent reports must keep checking for newly synced answers',
);

const overviewSource = fs.readFileSync(
  path.join(process.cwd(), 'components', 'parent', 'ParentOverview.tsx'),
  'utf8',
);
assert(
  overviewSource.includes('Manage parent accounts') && overviewSource.includes('href="/owner"'),
  'the owner dashboard must expose parent account management',
);

const loginSource = fs.readFileSync(
  path.join(process.cwd(), 'components', 'UnifiedLogin.tsx'),
  'utf8',
);
assert(
  loginSource.includes('mergeProgressSnapshots(localProgress, data.snapshot.progress)') &&
    loginSource.includes('await uploadSignedInChildState()'),
  'child sign-in must preserve and immediately upload newer on-device answers',
);

const childSyncSource = fs.readFileSync(
  path.join(process.cwd(), 'app', 'api', 'child', 'sync', 'route.ts'),
  'utf8',
);
assert(
  childSyncSource.includes('insert into public.question_attempts') &&
    childSyncSource.includes('on conflict (attempt_key) do nothing'),
  'child sync must persist deduplicated attempt history as well as the report snapshot',
);

const prepSource = fs.readFileSync(
  path.join(process.cwd(), 'components', 'TestPrepClient.tsx'),
  'utf8',
);
assert(
  prepSource.includes('function chooseAnswer') &&
    prepSource.includes('saveProgress(progress)') &&
    !prepSource.includes('run.questions.forEach((question, index)'),
  'formal test-prep answers must save when chosen instead of waiting for section completion',
);

const playtimeCardSource = fs.readFileSync(
  path.join(process.cwd(), 'components', 'PracticePlaytimeCard.tsx'),
  'utf8',
);
assert(
  playtimeCardSource.includes('profile?.questionBlockSize') &&
    playtimeCardSource.includes('6 minutes') &&
    playtimeCardSource.includes('5 bonus minutes'),
  'the arcade must explain the learner-specific practice-to-play exchange clearly',
);

const childEditorSource = fs.readFileSync(
  path.join(process.cwd(), 'components', 'parent', 'ParentChildren.tsx'),
  'utf8',
);
assert(
  childEditorSource.includes('dailyLimitMinutes: string') &&
    childEditorSource.includes('parseBoundedInteger') &&
    childEditorSource.includes("onChange(event.target.value.replace(/\\D/g, ''))"),
  'parent number fields must allow a blank editing state before validating whole numbers',
);
assert(
  !childEditorSource.includes('Number(event.target.value) || min'),
  'parent number fields must not force the minimum value back in while the user is typing',
);

const localAnswer = recordAnswer(emptyProgress(), {
  id: mathId,
  subject: 'math',
  correct: true,
});
const remoteAnswer = recordAnswer(emptyProgress(), {
  id: excludedVerbal,
  subject: 'verbal',
  correct: false,
});
const mergedProgress = mergeProgressSnapshots(localAnswer, remoteAnswer);
assert(
  mergedProgress.totalSeen === 2 && mergedProgress.history.length === 2,
  'cloud restore must preserve answers that exist on only one device',
);

const curriculumSource = fs.readFileSync(
  path.join(process.cwd(), 'components', 'parent', 'ParentCurriculumLibrary.tsx'),
  'utf8',
);
assert(
  curriculumSource.includes('Last question stays available'),
  'parent controls must not silently disable the final family',
);

const migration = fs.readFileSync(
  path.join(process.cwd(), 'supabase', 'migrations', '202607270003_parent_center.sql'),
  'utf8',
);
assert(
  migration.includes('hgmupcysijskaowsrgbn') &&
    migration.includes('Never run this in any KEMPCO/Chemco/FSM project'),
  'parent migration must be pinned to the isolated ISEE project boundary',
);
assert(migration.includes('parent_preferences'), 'parent preferences need cloud persistence');

console.log(
  'Parent center audit: catalogs, valid answer previews, gentle Smart Practice, ' +
    'avatar-consistent celebrations, live reports, safe progress merging, owner access, ' +
    'editable playtime fields, unlimited parent sandbox, and isolated cloud preferences passed.',
);
