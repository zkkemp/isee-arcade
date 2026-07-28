import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import ProfileGate from '@/components/ProfileGate';
import UnifiedLogin from '@/components/UnifiedLogin';
import DifficultyPicker from '@/components/DifficultyPicker';
import ProgressStrip from '@/components/ProgressStrip';
import GameLibrary from '@/components/GameLibrary';
import RecentlyPlayed from '@/components/RecentlyPlayed';
import { TEMPLATE_COUNT, TOTAL_FAMILIES, countBySubject } from '@/lib/questions';
import { SUBJECT_LABELS, type Subject } from '@/lib/questions/types';
import { childSessionCookie, verifyChildSession } from '@/lib/childSession';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ play?: string }>;
}) {
  const query = await searchParams;
  const cookieStore = await cookies();
  const child = await verifyChildSession(cookieStore.get(childSessionCookie.name)?.value);
  let parentPlaying = false;
  if (!child) {
    const supabase = await getSupabaseServerClient();
    const { data } = (await supabase?.auth.getClaims()) ?? { data: null };
    const parentId = typeof data?.claims?.sub === 'string' ? data.claims.sub : null;
    if (parentId) {
      const { data: account } = (await supabase
        ?.from('parent_accounts')
        .select('status')
        .eq('user_id', parentId)
        .maybeSingle()) ?? { data: null };
      if (account?.status === 'active') {
        if (query.play === 'parent') parentPlaying = true;
        else redirect('/parent');
      }
    }
    if (!parentPlaying) return <UnifiedLogin />;
  }

  const counts = countBySubject();
  const subjects = Object.keys(counts) as Subject[];

  return (
    <main className="arcade-home mx-auto w-full max-w-6xl px-4 pb-16 pt-5 sm:px-8 sm:pt-9">
      <header className="arcade-masthead mb-7 sm:mb-9">
        <div>
          <div className="arcade-kicker mb-3 inline-flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.19em] text-violet-100/70">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
            Study. Play. Level up.
          </div>
          <h1 className="arcade-logo text-4xl font-black tracking-[-0.035em] text-white sm:text-6xl">
            ISEE <span>Arcade</span>
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/65 sm:text-base">
            Big adventures powered by a little practice. Finish a short study block, then spend
            your earned play time anywhere in the arcade.
          </p>
        </div>
        <div className="hidden items-center gap-2 sm:flex">
          <Link
            href="/progress"
            className="arcade-action px-4 py-3 text-sm font-bold text-white/80"
          >
            View progress <span className="ml-1 text-violet-300">↗</span>
          </Link>
        </div>
      </header>

      <div className="mb-4">
        <ProgressStrip />
      </div>

      <Link
        href="/prep"
        className="prep-launch mb-6 flex items-center justify-between gap-4 p-4 sm:p-5"
      >
        <span>
          <span className="text-[10px] font-black uppercase tracking-[.18em] text-violet-100/65">
            Complete ISEE preparation
          </span>
          <span className="mt-0.5 block text-lg font-black text-white sm:text-xl">
            ISEE Test Prep Center
          </span>
          <span className="mt-1 block max-w-3xl text-xs leading-relaxed text-white/58 sm:text-sm">
            Full timed sections, a four-part diagnostic, skill review, and a 30-minute Essay Lab.
          </span>
        </span>
        <span className="prep-launch__arrow flex h-11 w-11 flex-shrink-0 items-center justify-center text-lg font-black text-[#171126]">
          →
        </span>
      </Link>

      <div className="mb-6 grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
        <ProfileGate />
        <div className="self-start">
          <DifficultyPicker />
        </div>
      </div>

      <RecentlyPlayed />

      <GameLibrary />

      <section className="mt-14 grid gap-4 lg:grid-cols-[.8fr_1.2fr]">
        <div className="arcade-info-panel p-5">
          <h2 className="text-xl font-black text-white">A deep practice bank</h2>
          <p className="mt-1 text-sm text-white/48">Fresh combinations keep study sessions from feeling repetitive.</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {subjects.map((s, index) => (
              <div key={s} className="practice-stat p-3" data-index={index}>
                <div className="text-xl font-black tabular-nums text-white">{counts[s]}</div>
                <div className="text-[11px] text-white/52">{SUBJECT_LABELS[s]}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="arcade-info-panel p-5">
          <h2 className="text-xl font-black text-white">Practice buys play time</h2>
          <p className="mt-1 text-sm text-white/48">One simple loop keeps learning and play in balance.</p>
          <div className="how-it-works mt-5 grid gap-4 text-sm text-white/64 sm:grid-cols-3">
            <div>
              <span className="how-it-works__number">1</span>
              Answer <strong className="text-white/90">8 questions</strong>.
            </div>
            <div>
              <span className="how-it-works__number">2</span>
              Earn <strong className="text-white/85">6 minutes</strong> of play.
            </div>
            <div>
              <span className="how-it-works__number">3</span>
              Scores and levels add bonus time.
            </div>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-white/30">
            {TOTAL_FAMILIES} question families · {TEMPLATE_COUNT} generate fresh numbers · progress
            stays on this device
          </p>
        </div>
      </section>

      <p className="mt-7 text-center sm:hidden">
        <Link href="/progress" className="text-sm font-bold text-violet-300 hover:underline">
          View progress by subject →
        </Link>
      </p>
    </main>
  );
}
