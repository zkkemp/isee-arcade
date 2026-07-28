import ParentControls from '@/components/parent/ParentControls';
import ParentShell from '@/components/parent/ParentShell';
import { requireActiveParent } from '@/lib/parentAccess';
import {
  curriculumFamiliesForBand,
  GRADE_BANDS,
  type CurriculumFamilyPreview,
} from '@/lib/questions';

export const metadata = { title: 'Parent Controls' };

export default async function ControlsPage() {
  await requireActiveParent();
  const seen = new Set<string>();
  const catalog: CurriculumFamilyPreview[] = [];
  for (const band of GRADE_BANDS) {
    for (const family of curriculumFamiliesForBand(band)) {
      if (seen.has(family.contentKey)) continue;
      seen.add(family.contentKey);
      catalog.push(family);
    }
  }
  return (
    <ParentShell
      title="Learning controls"
      description="Keep adaptation gentle, restore anything you turned off, and collect useful examples without permanently deleting the curriculum."
    >
      <ParentControls catalog={catalog} />
    </ParentShell>
  );
}
