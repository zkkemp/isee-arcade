import type { ComponentType } from 'react';
import type { Difficulty } from './difficulty';
import type { InputController } from './input';

export type GameId =
  | 'frogger'
  | 'snake'
  | 'platformer'
  | 'runner'
  | 'breakout'
  | 'climber'
  | 'maze';

/**
 * How a game is driven on touch.
 *  dpad      - tap the edges of the play area
 *  run-jump  - hold arrows in a strip below, tap the right half to jump
 *  lanes     - tap left/right halves to change lane, swipe up to jump
 *  paddle    - drag anywhere to move a paddle
 */
export type ControlScheme = 'dpad' | 'run-jump' | 'lanes' | 'paddle';

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
    gateNote: 'A question when you reach the bank, or when you get squashed.',
    icon: '🐸',
    accent: '#3ddc84',
    controls: 'dpad',
    aspect: 1,
  },
  snake: {
    id: 'snake',
    name: 'Byte Snake',
    tagline: 'Eat, grow, and try not to trip over yourself.',
    gateNote: 'A question when you crash.',
    icon: '🐍',
    accent: '#4ea8ff',
    controls: 'dpad',
    aspect: 1,
  },
  runner: {
    id: 'runner',
    name: 'Dash Run',
    tagline: 'Sprint down three lanes, dodge everything, grab every coin.',
    gateNote: 'A question when you crash.',
    icon: '🏃',
    accent: '#ff8f5d',
    controls: 'lanes',
    aspect: 3 / 4,
  },
  breakout: {
    id: 'breakout',
    name: 'Brick Buster',
    tagline: 'Bounce the ball, smash every brick, clear the wall.',
    gateNote: 'A question when you clear a wall or lose the ball.',
    icon: '🧱',
    accent: '#ffd75e',
    controls: 'paddle',
    aspect: 3 / 4,
  },
  climber: {
    id: 'climber',
    name: 'Sky Hopper',
    tagline: 'Bounce higher and higher. Do not look down.',
    gateNote: 'A question when you fall.',
    icon: '☁️',
    accent: '#7ec8ff',
    controls: 'lanes',
    aspect: 3 / 4,
  },
  maze: {
    id: 'maze',
    name: 'Dot Muncher',
    tagline: 'Eat every dot. Do not get caught.',
    gateNote: 'A question when you clear the maze or get caught.',
    icon: '👻',
    accent: '#c77dff',
    controls: 'dpad',
    aspect: 1,
  },
  platformer: {
    id: 'platformer',
    name: 'Coin Runner',
    tagline: 'Run, jump, stomp, and collect every coin.',
    gateNote: 'A question at each flag, or when you fall.',
    icon: '🍄',
    accent: '#ffb84e',
    controls: 'run-jump',
    aspect: 4 / 3,
  },
};

export const GAME_LIST: GameMeta[] = [
  GAMES.platformer,
  GAMES.runner,
  GAMES.breakout,
  GAMES.maze,
  GAMES.climber,
  GAMES.frogger,
  GAMES.snake,
];

const IDS = new Set<string>(Object.keys(GAMES));

export function isGameId(v: string): v is GameId {
  return IDS.has(v);
}
