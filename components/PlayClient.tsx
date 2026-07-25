'use client';

import GameShell from './GameShell';
import Frogger from './games/Frogger';
import Snake from './games/Snake';
import Platformer from './games/Platformer';
import { GAMES, type GameComponent, type GameId } from '@/lib/games';

/**
 * Maps a game id to its canvas component. Lives on the client because a
 * component reference cannot cross the server/client boundary as a prop.
 */
const COMPONENTS: Record<GameId, GameComponent> = {
  frogger: Frogger,
  snake: Snake,
  platformer: Platformer,
};

export default function PlayClient({ game }: { game: GameId }) {
  return <GameShell meta={GAMES[game]} Game={COMPONENTS[game]} />;
}
