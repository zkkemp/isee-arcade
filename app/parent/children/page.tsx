/**
 * THESIS: Every child account is managed from one calm family roster.
 * OWN-WORLD: Midnight arcade surfaces, cyan identity controls, vivid avatar medallions.
 * STORY: Add a child, set their sign-in and learning limits, then hand them the device.
 * FIRST VIEWPORT: Family roster and a single prominent add-child action.
 * FORM: Existing parent inspection lane extended with an editable crew roster.
 */
import ParentChildren from '@/components/parent/ParentChildren';
import ParentShell from '@/components/parent/ParentShell';
import { requireActiveParent } from '@/lib/parentAccess';

export const metadata = { title: 'Children · Parent Center' };

export default async function ParentChildrenPage() {
  await requireActiveParent();
  return (
    <ParentShell
      title="Children & sign-ins"
      description="Create and update each child’s username, password, learning level, limits, and playable avatar."
    >
      <ParentChildren />
    </ParentShell>
  );
}
