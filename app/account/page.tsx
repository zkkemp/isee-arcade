import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Family Cloud · ISEE Arcade',
};

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  redirect('/');
}
