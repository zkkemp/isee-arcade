import {
  curriculumFamiliesForBand,
  familyIdsForBand,
  pickQuestion,
  type GradeBand,
} from '../lib/questions';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

const REQUIRED: GradeBand[] = ['k', 'grade1', 'grade2', 'grade3'];

for (const band of REQUIRED) {
  const families = curriculumFamiliesForBand(band);
  const ids = familyIdsForBand(band);
  assert(families.length >= 300, `${band} has only ${families.length} question families`);
  assert(new Set(ids).size === ids.length, `${band} repeats a question id`);

  for (const family of families) {
    const question = family.sample;
    const wantedChoices = question.passage ? 5 : 4;
    assert(
      question.choices.length === wantedChoices,
      `${band}/${question.id} has ${question.choices.length} choices`,
    );
    assert(
      question.answer >= 0 && question.answer < question.choices.length,
      `${band}/${question.id} has an invalid answer index`,
    );
    assert(
      new Set(question.choices.map((choice) => choice.trim().toLowerCase())).size === wantedChoices,
      `${band}/${question.id} repeats a choice`,
    );
    assert(
      question.explain.trim().length >= 12 && !/undefined|NaN/.test(question.explain),
      `${band}/${question.id} has a broken explanation`,
    );
  }

  const stemCount = families.filter((family) =>
    family.topic?.toLowerCase().startsWith('stem ·'),
  ).length;
  assert(stemCount >= 16, `${band} needs a visible STEM and weather lane`);

  const recentIds: string[] = [];
  for (let draw = 0; draw < 100; draw += 1) {
    const question = pickQuestion({ band, recentIds });
    assert(ids.includes(question.id), `${band} served ${question.id} from another level`);
    recentIds.push(question.id);
  }
}

const firstGrade = curriculumFamiliesForBand('grade1');
assert(
  firstGrade.filter((family) => family.topic?.toLowerCase().includes('idiom')).length >= 8,
  'First Grade needs a visible introductory idiom lane',
);

const thirdGrade = curriculumFamiliesForBand('grade3');
assert(
  thirdGrade.filter((family) => family.kind === 'reading').length >= 80,
  'Third Grade must include the completed reading and STEM passage bank',
);

console.log(
  `Elementary expansion passed: ${REQUIRED.map(
    (band) => `${band}=${curriculumFamiliesForBand(band).length}`,
  ).join(', ')} families with visible Idioms and STEM/weather lanes.`,
);
