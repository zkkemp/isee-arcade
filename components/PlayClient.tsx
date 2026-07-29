'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import GameShell from './GameShell';
import { GAMES, type GameCanvasProps, type GameComponent, type GameId } from '@/lib/games';
import { setPlayerMode } from '@/lib/playerMode';
import { recordRecentlyPlayed } from '@/lib/recentGames';

function GameLoading() {
  return (
    <div
      className="absolute inset-0 grid place-items-center bg-[#08101f] text-center text-lg font-black text-white"
      role="status"
    >
      <span className="animate-pulse">Loading game…</span>
    </div>
  );
}

/**
 * Maps a game id to its canvas component. Lives on the client because a
 * component reference cannot cross the server/client boundary as a prop. Each
 * explicit dynamic import gives the game its own chunk so an iPhone opening one
 * title does not download the code for every game in the arcade.
 */
const COMPONENTS: Record<GameId, GameComponent> = {
  frogger: dynamic<GameCanvasProps>(() => import('./games/Frogger'), { loading: GameLoading }),
  snake2: dynamic<GameCanvasProps>(() => import('./games/SnakeV2'), { loading: GameLoading }),
  platformer: dynamic<GameCanvasProps>(() => import('./games/CoinRunner'), { loading: GameLoading }),
  platformer3: dynamic<GameCanvasProps>(() => import('./games/KingdomQuest'), { loading: GameLoading }),
  riftraiders: dynamic<GameCanvasProps>(() => import('./games/RiftRaiders'), { loading: GameLoading }),
  diamond: dynamic<GameCanvasProps>(() => import('./games/DiamondDerby'), { loading: GameLoading }),
  paperroute: dynamic<GameCanvasProps>(() => import('./games/PaperRoute'), { loading: GameLoading }),
  pyramidhop: dynamic<GameCanvasProps>(() => import('./games/PyramidHop'), { loading: GameLoading }),
  reversi: dynamic<GameCanvasProps>(() => import('./games/Reversi'), { loading: GameLoading }),
  backgammon: dynamic<GameCanvasProps>(() => import('./games/Backgammon'), { loading: GameLoading }),
  seabattle: dynamic<GameCanvasProps>(() => import('./games/SeaBattle'), { loading: GameLoading }),
  paddleduel: dynamic<GameCanvasProps>(() => import('./games/PaddleDuel'), { loading: GameLoading }),
  asteroids: dynamic<GameCanvasProps>(() => import('./games/AsteroidPatrol'), { loading: GameLoading }),
  stardefender: dynamic<GameCanvasProps>(() => import('./games/StarDefender'), { loading: GameLoading }),
  lunarlander: dynamic<GameCanvasProps>(() => import('./games/LunarLander'), { loading: GameLoading }),
  runner: dynamic<GameCanvasProps>(() => import('./games/Runner'), { loading: GameLoading }),
  breakout: dynamic<GameCanvasProps>(() => import('./games/Breakout'), { loading: GameLoading }),
  climber: dynamic<GameCanvasProps>(() => import('./games/Climber'), { loading: GameLoading }),
  maze: dynamic<GameCanvasProps>(() => import('./games/Maze'), { loading: GameLoading }),
  match3: dynamic<GameCanvasProps>(() => import('./games/Match3'), { loading: GameLoading }),
  blocks: dynamic<GameCanvasProps>(() => import('./games/Blocks'), { loading: GameLoading }),
  tetris: dynamic<GameCanvasProps>(() => import('./games/Tetra'), { loading: GameLoading }),
  tictactoe: dynamic<GameCanvasProps>(() => import('./games/TicTacToe'), { loading: GameLoading }),
  memory: dynamic<GameCanvasProps>(() => import('./games/MemoryMatch'), { loading: GameLoading }),
  merge: dynamic<GameCanvasProps>(() => import('./games/NumberMerge'), { loading: GameLoading }),
  bubble: dynamic<GameCanvasProps>(() => import('./games/BubblePop'), { loading: GameLoading }),
  checkers: dynamic<GameCanvasProps>(() => import('./games/Checkers'), { loading: GameLoading }),
  echo: dynamic<GameCanvasProps>(() => import('./games/Echo'), { loading: GameLoading }),
  fruit: dynamic<GameCanvasProps>(() => import('./games/FruitCatch'), { loading: GameLoading }),
  fruit2: dynamic<GameCanvasProps>(() => import('./games/FruitCatchV2'), { loading: GameLoading }),
  chess: dynamic<GameCanvasProps>(() => import('./games/Chess'), { loading: GameLoading }),
  tapattack: dynamic<GameCanvasProps>(() => import('./games/TapAttack'), { loading: GameLoading }),
  tapattack2: dynamic<GameCanvasProps>(() => import('./games/TapAttackV2'), { loading: GameLoading }),
  sudoku: dynamic<GameCanvasProps>(() => import('./games/Sudoku'), { loading: GameLoading }),
  dots: dynamic<GameCanvasProps>(() => import('./games/DotsBoxes'), { loading: GameLoading }),
  cards: dynamic<GameCanvasProps>(() => import('./games/CardMatch'), { loading: GameLoading }),
  wordhunt: dynamic<GameCanvasProps>(() => import('./games/WordHunt'), { loading: GameLoading }),
  spelling: dynamic<GameCanvasProps>(() => import('./games/SpellingZap'), { loading: GameLoading }),
  skystack: dynamic<GameCanvasProps>(() => import('./games/SkyStack'), { loading: GameLoading }),
  starfall: dynamic<GameCanvasProps>(() => import('./games/StarfallSquadron'), { loading: GameLoading }),
  firefly: dynamic<GameCanvasProps>(() => import('./games/FireflyOrbit'), { loading: GameLoading }),
  mysteryfaces: dynamic<GameCanvasProps>(() => import('./games/MysteryFaces'), { loading: GameLoading }),
  colorbynumber: dynamic<GameCanvasProps>(() => import('./games/ColorByNumber'), { loading: GameLoading }),
  hangman: dynamic<GameCanvasProps>(() => import('./games/Hangman'), { loading: GameLoading }),
  wordscramble: dynamic<GameCanvasProps>(() => import('./games/WordScramble'), { loading: GameLoading }),
  diceroyale: dynamic<GameCanvasProps>(() => import('./games/DiceRoyale'), { loading: GameLoading }),
  starlinefour: dynamic<GameCanvasProps>(() => import('./games/StarlineFour'), { loading: GameLoading }),
  mancala: dynamic<GameCanvasProps>(() => import('./games/Mancala'), { loading: GameLoading }),
  gemcode: dynamic<GameCanvasProps>(() => import('./games/GemCode'), { loading: GameLoading }),
  constellation: dynamic<GameCanvasProps>(() => import('./games/ConstellationConnect'), { loading: GameLoading }),
  lanterns: dynamic<GameCanvasProps>(() => import('./games/LanternGarden'), { loading: GameLoading }),
};

export default function PlayClient({
  game,
  parentAccount = false,
}: {
  game: GameId;
  parentAccount?: boolean;
}) {
  useEffect(() => {
    if (parentAccount) setPlayerMode('parent');
    recordRecentlyPlayed(game);
  }, [game, parentAccount]);

  return <GameShell meta={GAMES[game]} Game={COMPONENTS[game]} parentAccount={parentAccount} />;
}
