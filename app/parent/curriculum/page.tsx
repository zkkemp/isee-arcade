import ParentCurriculumLibrary from '@/components/parent/ParentCurriculumLibrary';
import ParentShell from '@/components/parent/ParentShell';
import { requireActiveParent } from '@/lib/parentAccess';
import {
  curriculumFamiliesForBand,
  GRADE_BANDS,
  type GradeBand,
} from '@/lib/questions';

export const metadata = { title: 'Curriculum Library' };

export default async function CurriculumPage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string }>;
}) {
  await requireActiveParent();
  const requested = (await searchParams).level;
  const band = GRADE_BANDS.includes(requested as GradeBand)
    ? (requested as GradeBand)
    : 'isee';
  return (
    <ParentShell
      title="Curriculum library"
      description="Inspect exactly what children can see. Dynamic math families show a representative example; fixed vocabulary and reading questions show their exact wording."
    >
      <ParentCurriculumLibrary band={band} families={curriculumFamiliesForBand(band)} />
    </ParentShell>
  );
}
