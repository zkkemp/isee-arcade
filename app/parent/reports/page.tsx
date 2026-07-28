import ParentReports from '@/components/parent/ParentReports';
import ParentShell from '@/components/parent/ParentShell';

export const metadata = { title: 'Parent Reports' };

export default function ReportsPage() {
  return (
    <ParentShell
      title="Learning reports"
      description="Real attempt history shows improvement over time, current strengths, and the smallest useful next focus for each child."
    >
      <ParentReports />
    </ParentShell>
  );
}
