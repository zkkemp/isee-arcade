import ParentReports from '@/components/parent/ParentReports';
import ParentShell from '@/components/parent/ParentShell';
import { requireActiveParent } from '@/lib/parentAccess';

export const metadata = { title: 'Parent Reports' };

export default async function ReportsPage() {
  await requireActiveParent();
  return (
    <ParentShell
      title="Learning reports"
      description="Real attempt history shows improvement over time, current strengths, and the smallest useful next focus for each child."
    >
      <ParentReports />
    </ParentShell>
  );
}
