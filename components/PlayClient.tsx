'use client';

import GameShell from './GameShell';
import Frogger from './games/Frogger';
import Snake from './games/Snake';
import Platformer from './games/Platformer';
import Runner from './games/Runner';
import Breakout from './games/Breakout';
import Climber from './games/Climber';
import Maze from './games/Maze';
import Match3 from './games/Match3';
import Blocks from './games/Blocks';
import Tetra from './games/Tetra';
import { GAMES, type GameComponent, type GameId } from '@/lib/games';

/**
 * Maps a game id to its canvas component. Lives on the client because a
 * component reference cannot cross the server/client boundary as a prop.
 */
const COMPONENTS: Record<GameId, GameComponent> = {
  frogger: Frogger,
  snake: Snake,
  platformer: Platformer,
  runner: Runner,
  breakout: Breakout,
  climber: Climber,
  maze: Maze,
  match3: Match3,
  blocks: Blocks,
  tetris: Tetra,
};

export default function PlayClient({ game }: { game: GameId }) {
  return <GameShell meta={GAMES[game]} Game={COMPONENTS[game]} />;
}
