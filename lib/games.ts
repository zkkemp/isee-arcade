import type { ComponentType } from 'react';
import type { Difficulty } from './difficulty';
import type { InputController } from './input';
import type { Character } from './characters';

export type GameId =
  | 'match3'
  | 'blocks'
  | 'tetris'
  | 'frogger'
  | 'snake'
  | 'platformer'
  | 'runner'
  | 'breakout'
  | 'climber'
  | 'maze'
  | 'tictactoe'
  | 'memory'
  | 'merge'
  | 'bubble'
  | 'checkers'
  | 'echo';

/**
 * How a game is driven on touch.
 *  dpad      - tap the edges of the play area
 *  run-jump  - hold arrows in a strip below, tap the right half to jump
 *  lanes     - tap left/right halves to change lane, swipe up to jump
 *  paddle    - drag anywhere to move a paddle
 *  grid      - tap and drag on a board; both pointer axes plus press/release edges
 *  board     - turn-based board games (tic-tac-toe, checkers, chess, crazy eights).
 *              No overlay and no dpad: the game attaches its own pointer handling
 *              directly to its canvas and runs its own turn logic.
 */
export type ControlScheme = 'dpad' | 'run-jump' | 'lanes' | 'paddle' | 'grid' | 'board';

export type GameMeta = {
  id: GameId;
  name: string;
  tagline: string;
  /** When the game stops to ask, shown on the picker card. */
  gateNote: string;
  icon: string;
  accent: string;
  controls: ControlScheme;
  /** Canvas width / height. The stage scales to fit while preserving this. */
  aspect: number;
};

/**
 * What a game can tell the shell. The shell owns score and all question gating.
 *
 * Note there is no mid-play gate: a game asks only when the player dies or
 * clears a level. Interrupting mid-run was the single worst thing about the
 * first version.
 */
export type GameApi = {
  addScore: (delta: number) => void;
  /** Player died. Opens a question; answering correctly puts them back in. */
  died: (label?: string) => void;
  /** Level cleared. Opens a question before the next level. */
  requestGate: (label: string) => void;
  /** Transient banner over the canvas. */
  setStatus: (text: string | null) => void;
};

export type GameCanvasProps = {
  paused: boolean;
  input: InputController;
  api: GameApi;
  /** Increments whenever the shell wants a fresh game. */
  restartToken: number;
  /** Skill setting. Games scale speed, hazard density and ramp from this. */
  difficulty: Difficulty;
  /** The chosen family character, so every game can draw the same avatar. */
  character: Character;
  /**
   * Screen pixels at the bottom of the canvas occupied by thumb controls. Games
   * must keep gameplay above this band so a hand never covers the action.
   */
  controlsInset: number;
};

export type GameComponent = ComponentType<GameCanvasProps>;

export const GAMES: Record<GameId, GameMeta> = {
  frogger: {
    id: 'frogger',
    name: 'Road Hopper',
    tagline: 'Dodge the traffic, ride the logs, reach the far bank.',
    gateNote: 'Study time buys play time.',
    icon: '🐸',
    accent: '#3ddc84',
    controls: 'dpad',
    aspect: 1,
  },
  snake: {
    id: 'snake',
    name: 'Byte Snake',
    tagline: 'Eat, grow, and try not to trip over yourself.',
    gateNote: 'Study time buys play time.',
    icon: '🐍',
    accent: '#4ea8ff',
    controls: 'dpad',
    aspect: 1,
  },
  match3: {
    id: 'match3',
    name: 'Sugar Swap',
    tagline: 'Swap the candies, line up three, set off a chain.',
    gateNote: 'Study time buys play time.',
    icon: '🍬',
    accent: '#ff6fb5',
    controls: 'grid',
    aspect: 3 / 4,
  },
  blocks: {
    id: 'blocks',
    name: 'Block Drop',
    tagline: 'Drop the shapes, fill the lines, clear the board.',
    gateNote: 'Study time buys play time.',
    icon: '🟦',
    accent: '#5ec8ff',
    controls: 'grid',
    aspect: 3 / 4,
  },
  tetris: {
    id: 'tetris',
    name: 'Tetra Stack',
    tagline: 'Slot the falling shapes, complete the rows, keep the stack down.',
    gateNote: 'Study time buys play time.',
    icon: '🟪',
    accent: '#8b7cf6',
    controls: 'dpad',
    aspect: 1 / 2,
  },
  runner: {
    id: 'runner',
    name: 'Dash Run',
    tagline: 'Run, jump, and do not stop. The road never ends.',
    gateNote: 'Study time buys play time.',
    icon: '🏃',
    accent: '#ff8f5d',
    controls: 'lanes',
    aspect: 3 / 4,
  },
  breakout: {
    id: 'breakout',
    name: 'Brick Buster',
    tagline: 'Bounce the ball, smash every brick, clear the wall.',
    gateNote: 'Study time buys play time.',
    icon: '🧱',
    accent: '#ffd75e',
    controls: 'paddle',
    aspect: 3 / 4,
  },
  climber: {
    id: 'climber',
    name: 'Sky Hopper',
    tagline: 'Bounce higher and higher. Do not look down.',
    gateNote: 'Study time buys play time.',
    icon: '☁️',
    accent: '#7ec8ff',
    controls: 'lanes',
    aspect: 3 / 4,
  },
  maze: {
    id: 'maze',
    name: 'Dot Muncher',
    tagline: 'Eat every dot. Do not get caught.',
    gateNote: 'Study time buys play time.',
    icon: '👻',
    accent: '#c77dff',
    controls: 'dpad',
    aspect: 1,
  },
  platformer: {
    id: 'platformer',
    name: 'Coin Runner',
    tagline: 'Run, jump, stomp, and collect every coin.',
    gateNote: 'Study time buys play time.',
    icon: '🍄',
    accent: '#ffb84e',
    controls: 'run-jump',
    aspect: 4 / 3,
  },
  tictactoe: {
    id: 'tictactoe',
    name: 'Tic-Tac-Toe',
    tagline: 'Three in a row. Play a friend or take on the computer.',
    gateNote: 'Study time buys play time.',
    icon: '❌',
    accent: '#5ec8ff',
    controls: 'board',
    aspect: 3 / 4,
  },
  memory: {
    id: 'memory',
    name: 'Memory Match',
    tagline: 'Flip two, find the match, clear the whole family.',
    gateNote: 'Study time buys play time.',
    icon: '🧠',
    accent: '#ff6a9e',
    controls: 'grid',
    aspect: 3 / 4,
  },
  merge: {
    id: 'merge',
    name: 'Number Merge',
    tagline: 'Slide the tiles, match the numbers, watch them double.',
    gateNote: 'Study time buys play time.',
    icon: '🧮',
    accent: '#2dd4bf',
    controls: 'dpad',
    aspect: 1,
  },
  bubble: {
    id: 'bubble',
    name: 'Bubble Pop',
    tagline: "Aim, pop three, don't let the ceiling win.",
    gateNote: 'Study time buys play time.',
    icon: '🫧',
    accent: '#4be3c2',
    controls: 'grid',
    aspect: 3 / 4,
  },
  checkers: {
    id: 'checkers',
    name: 'Checkers',
    tagline: 'Red vs black. Jump your way to a king.',
    gateNote: 'Study time buys play time.',
    icon: '🔴',
    accent: '#e63946',
    controls: 'board',
    aspect: 3 / 4,
  },
  echo: {
    id: 'echo',
    name: 'Echo',
    tagline: 'Watch the pattern glow and chime, then echo it back.',
    gateNote: 'Study time buys play time.',
    icon: '🔔',
    accent: '#7a4fd1',
    controls: 'grid',
    aspect: 1,
  },
};

export const GAME_LIST: GameMeta[] = [
  GAMES.match3,
  GAMES.blocks,
  GAMES.tetris,
  GAMES.platformer,
  GAMES.runner,
  GAMES.breakout,
  GAMES.maze,
  GAMES.climber,
  GAMES.frogger,
  GAMES.snake,
  GAMES.tictactoe,
  GAMES.memory,
  GAMES.merge,
  GAMES.bubble,
  GAMES.checkers,
  GAMES.echo,
];

const IDS = new Set<string>(Object.keys(GAMES));

export function isGameId(v: string): v is GameId {
  return IDS.has(v);
}
