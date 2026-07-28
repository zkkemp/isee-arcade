/**
 * THESIS: Parent tools form an inspection lane, not another child dashboard.
 * OWN-WORLD: Existing midnight arcade surfaces, violet selection, amber parent state.
 * STORY: See the family, spot the next action, then inspect reports or curriculum.
 * FIRST VIEWPORT: Family summary, learner rows, and four plainly named destinations.
 * FORM: Sixth grounded structure—overview to focused drawers; seed b844d7a9.
 */
import ParentOverview from '@/components/parent/ParentOverview';
import ParentShell from '@/components/parent/ParentShell';

export const metadata = { title: 'Parent Center' };

export default function ParentPage() {
  return (
    <ParentShell
      title="Family overview"
      description="See how everyone is doing, inspect what they are learning, and adjust support without changing the child experience by accident."
    >
      <ParentOverview />
    </ParentShell>
  );
}
