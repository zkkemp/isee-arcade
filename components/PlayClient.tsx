'use client';

import { useEffect } from 'react';
import GameShell from './GameShell';
import Frogger from './games/Frogger';
import SnakeV2 from './games/SnakeV2';
import Platformer from './games/Platformer';
import PlatformerV2 from './games/PlatformerV2';
import KingdomQuest from './games/KingdomQuest';
import DiamondDerby from './games/DiamondDerby';
import PaperRoute from './games/PaperRoute';
import PyramidHop from './games/PyramidHop';
import Reversi from './games/Reversi';
import Backgammon from './games/Backgammon';
import SeaBattle from './games/SeaBattle';
import PaddleDuel from './games/PaddleDuel';
import AsteroidPatrol from './games/AsteroidPatrol';
import StarDefender from './games/StarDefender';
import LunarLander from './games/LunarLander';
import Runner from './games/Runner';
import Breakout from './games/Breakout';
import Climber from './games/Climber';
import Maze from './games/Maze';
import Match3 from './games/Match3';
import Blocks from './games/Blocks';
import Tetra from './games/Tetra';
import TicTacToe from './games/TicTacToe';
import MemoryMatch from './games/MemoryMatch';
import NumberMerge from './games/NumberMerge';
import BubblePop from './games/BubblePop';
import Checkers from './games/Checkers';
import Echo from './games/Echo';
import FruitCatch from './games/FruitCatch';
import FruitCatchV2 from './games/FruitCatchV2';
import Chess from './games/Chess';
import TapAttack from './games/TapAttack';
import TapAttackV2 from './games/TapAttackV2';
import Sudoku from './games/Sudoku';
import DotsBoxes from './games/DotsBoxes';
import CardMatch from './games/CardMatch';
import WordHunt from './games/WordHunt';
import SpellingZap from './games/SpellingZap';
import SkyStack from './games/SkyStack';
import StarfallSquadron from './games/StarfallSquadron';
import FireflyOrbit from './games/FireflyOrbit';
import MysteryFaces from './games/MysteryFaces';
import ColorByNumber from './games/ColorByNumber';
import Hangman from './games/Hangman';
import WordScramble from './games/WordScramble';
import DiceRoyale from './games/DiceRoyale';
import StarlineFour from './games/StarlineFour';
import Mancala from './games/Mancala';
import GemCode from './games/GemCode';
import { GAMES, type GameComponent, type GameId } from '@/lib/games';
import { recordRecentlyPlayed } from '@/lib/recentGames';

/**
 * Maps a game id to its canvas component. Lives on the client because a
 * component reference cannot cross the server/client boundary as a prop.
 */
const COMPONENTS: Record<GameId, GameComponent> = {
  frogger: Frogger,
  snake2: SnakeV2,
  platformer: Platformer,
  platformer2: PlatformerV2,
  platformer3: KingdomQuest,
  diamond: DiamondDerby,
  paperroute: PaperRoute,
  pyramidhop: PyramidHop,
  reversi: Reversi,
  backgammon: Backgammon,
  seabattle: SeaBattle,
  paddleduel: PaddleDuel,
  asteroids: AsteroidPatrol,
  stardefender: StarDefender,
  lunarlander: LunarLander,
  runner: Runner,
  breakout: Breakout,
  climber: Climber,
  maze: Maze,
  match3: Match3,
  blocks: Blocks,
  tetris: Tetra,
  tictactoe: TicTacToe,
  memory: MemoryMatch,
  merge: NumberMerge,
  bubble: BubblePop,
  checkers: Checkers,
  echo: Echo,
  fruit: FruitCatch,
  fruit2: FruitCatchV2,
  chess: Chess,
  tapattack: TapAttack,
  tapattack2: TapAttackV2,
  sudoku: Sudoku,
  dots: DotsBoxes,
  cards: CardMatch,
  wordhunt: WordHunt,
  spelling: SpellingZap,
  skystack: SkyStack,
  starfall: StarfallSquadron,
  firefly: FireflyOrbit,
  mysteryfaces: MysteryFaces,
  colorbynumber: ColorByNumber,
  hangman: Hangman,
  wordscramble: WordScramble,
  diceroyale: DiceRoyale,
  starlinefour: StarlineFour,
  mancala: Mancala,
  gemcode: GemCode,
};

export default function PlayClient({ game }: { game: GameId }) {
  useEffect(() => {
    recordRecentlyPlayed(game);
  }, [game]);

  return <GameShell meta={GAMES[game]} Game={COMPONENTS[game]} />;
}
