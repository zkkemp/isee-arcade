import Link from 'next/link';
import CloudAccount from '@/components/CloudAccount';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = {
  title: 'Family Cloud · ISEE Arcade',
};

export default async function AccountPage() {
  const configured = isSupabaseConfigured();
  let initialEmail: string | null = null;

  if (configured) {
    const supabase = await getSupabaseServerClient();
    const { data } = (await supabase?.auth.getClaims()) ?? { data: null };
    initialEmail = typeof data?.claims?.email === 'string' ? data.claims.email : null;
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <Link href="/" className="text-sm font-bold text-violet-200/75 hover:text-white">
            ← Arcade
          </Link>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.035em] text-white sm:text-5xl">
            Family cloud
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/60 sm:text-base">
            Keep each learner’s questions, vocabulary, scores, and recent games safe across
            devices.
          </p>
        </div>
        <span
          aria-hidden="true"
          className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-cyan-300/10 text-3xl shadow-[0_14px_35px_rgba(0,0,0,.3)]"
        >
          ☁️
        </span>
      </header>

      <CloudAccount configured={configured} initialEmail={initialEmail} />
    </main>
  );
}
