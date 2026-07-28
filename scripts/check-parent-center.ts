import fs from 'node:fs';
import path from 'node:path';
import { smartFocusForProgress } from '../lib/adaptivePractice';
import {
  curriculumFamiliesForBand,
  GRADE_BANDS,
  questionById,
} from '../lib/questions';
import { emptyProgress, recordAnswer } from '../lib/progress';
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
    'unlimited parent sandbox, and isolated cloud preferences passed.',
);
