import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import PlayClient from '@/components/PlayClient';
import { GAMES, GAME_LIST, isGameId } from '@/lib/games';

export function generateStaticParams() {
  return GAME_LIST.map((g) => ({ game: g.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ game: string }>;
}): Promise<Metadata> {
  const { game } = await params;
  if (!isGameId(game)) return { title: 'ISEE Arcade' };
  return { title: `${GAMES[game].name} · ISEE Arcade` };
}

export default async function PlayPage({ params }: { params: Promise<{ game: string }> }) {
  const { game } = await params;
  if (!isGameId(game)) notFound();
  return <PlayClient game={game} />;
}
