import type { ComponentType } from 'react';
import type { InputController } from './input';

export type GameId = 'frogger' | 'snake' | 'platformer';

export type ControlScheme = 'dpad' | 'run-jump';

export type GameMeta = {
  id: GameId;
  name: string;
  tagline: string;
  /** How the study gate is earned in this game, shown on the picker card. */
  gateNote: string;
  icon: string;
  accent: string;
  controls: ControlScheme;
  startingLives: number;
};

/** What a game can tell the shell. The shell owns score, lives, and gating. */
export type GameApi = {
  addScore: (delta: number) => void;
  lifeLost: () => void;
  gameOver: () => void;
  /** Pauses the game and opens a question. `label` explains why, e.g. "Level 2 clear". */
  requestGate: (label: string) => void;
  /** Transient banner text drawn over the canvas. */
  setStatus: (text: string | null) => void;
};

export type GameCanvasProps = {
  paused: boolean;
  input: InputController;
  api: GameApi;
  /** Increments whenever the shell wants a fresh game. */
  restartToken: number;
  /** Extra lives granted by correct answers, so the game can show a pickup effect. */
  bonusToken: number;
};

export type GameComponent = ComponentType<GameCanvasProps>;

export const GAMES: Record<GameId, GameMeta> = {
  frogger: {
    id: 'frogger',
    name: 'Road Hopper',
    tagline: 'Dodge the traffic, ride the logs, reach the far bank.',
    gateNote: 'A question after every bank you reach.',
    icon: '🐸',
    accent: '#3ddc84',
    controls: 'dpad',
    startingLives: 3,
  },
  snake: {
    id: 'snake',
    name: 'Byte Snake',
    tagline: 'Eat, grow, and try not to trip over yourself.',
    gateNote: 'A question every 5 snacks.',
    icon: '🐍',
    accent: '#4ea8ff',
    controls: 'dpad',
    startingLives: 1,
  },
  platformer: {
    id: 'platformer',
    name: 'Coin Runner',
    tagline: 'Run, jump, stomp, and collect every coin.',
    gateNote: 'A question every 10 coins, plus one at each flag.',
    icon: '🍄',
    accent: '#ffb84e',
    controls: 'run-jump',
    startingLives: 3,
  },
};

export const GAME_LIST: GameMeta[] = [GAMES.frogger, GAMES.snake, GAMES.platformer];

export function isGameId(v: string): v is GameId {
  return v === 'frogger' || v === 'snake' || v === 'platformer';
}
