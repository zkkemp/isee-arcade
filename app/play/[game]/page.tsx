import { cookies } from 'next/headers';
import { notFound, permanentRedirect, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import PlayClient from '@/components/PlayClient';
import { GAMES, GAME_LIST, isGameId } from '@/lib/games';
import { childSessionCookie, verifyChildSession } from '@/lib/childSession';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export function generateStaticParams() {
  return GAME_LIST.map((g) => ({ game: g.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ game: string }>;
}): Promise<Metadata> {
  const { game } = await params;
  if (game === 'platformer2') return { title: GAMES.platformer.name };
  if (!isGameId(game)) return { title: 'ISEE Arcade' };
  return { title: GAMES[game].name };
}

export default async function PlayPage({ params }: { params: Promise<{ game: string }> }) {
  const { game } = await params;
  if (game === 'platformer2') permanentRedirect('/play/platformer');
  if (!isGameId(game)) notFound();

  // A game route can be opened directly, refreshed, or restored by iOS without
  // passing through the arcade menu. Resolve the authenticated role on the
  // server so parent free play never depends on a tab-scoped sessionStorage flag.
  const supabase = await getSupabaseServerClient();
  const { data } = (await supabase?.auth.getClaims()) ?? { data: null };
  const parentId = typeof data?.claims?.sub === 'string' ? data.claims.sub : null;
  let parentAccount = false;

  if (parentId) {
    const { data: account } = (await supabase
      ?.from('parent_accounts')
      .select('status')
      .eq('user_id', parentId)
      .maybeSingle()) ?? { data: null };
    parentAccount = account?.status === 'active';
  }

  if (!parentAccount) {
    const cookieStore = await cookies();
    const child = await verifyChildSession(cookieStore.get(childSessionCookie.name)?.value);
    if (!child) redirect('/');
  }

  return <PlayClient game={game} parentAccount={parentAccount} />;
}
