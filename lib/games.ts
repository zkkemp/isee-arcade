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
  | 'echo'
  | 'fruit'
  | 'chess'
  | 'tapattack'
  | 'sudoku'
  | 'dots'
  | 'cards'
  | 'wordhunt'
  | 'spelling';

/**
 * How a game is driven on touch.
 *  dpad      - tap the edges of the play area
 *  run-jump  - hold arrows in a strip below, tap the right half to jump
 *  lanes     - tap left/right halves to change lane, swipe up to jump
 *  tapjump   - tap ANYWHERE to jump; tap again in the air to double-jump
 *  paddle    - drag anywhere to move a paddle
 *  grid      - tap and drag on a board; both pointer axes plus press/release edges
 *  board     - turn-based board games (tic-tac-toe, checkers, chess, crazy eights).
 *              No overlay and no dpad: the game attaches its own pointer handling
 *              directly to its canvas and runs its own turn logic.
 */
export type ControlScheme = 'dpad' | 'run-jump' | 'lanes' | 'tapjump' | 'paddle' | 'grid' | 'board';

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
    tagline: 'Run and jump. Tap anywhere to leap, tap again to double-jump.',
    gateNote: 'Study time buys play time.',
    icon: '🏃',
    accent: '#ff8f5d',
    controls: 'tapjump',
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
  fruit: {
    id: 'fruit',
    name: 'Fruit Catch',
    tagline: 'Slide the basket, catch the fruit, let the yucky ones go.',
    gateNote: 'Study time buys play time.',
    icon: '🍓',
    accent: '#ff8fa3',
    controls: 'paddle',
    aspect: 3 / 4,
  },
  chess: {
    id: 'chess',
    name: 'Chess',
    tagline: 'The royal game. Checkmate the king to win.',
    gateNote: 'Study time buys play time.',
    icon: '♟️',
    accent: '#c8a06a',
    controls: 'board',
    aspect: 1,
  },
  tapattack: {
    id: 'tapattack',
    name: 'Tap Attack',
    tagline: 'Pop up, tap fast - watch out for grumps!',
    gateNote: 'Study time buys play time.',
    icon: '🔨',
    accent: '#f2542d',
    controls: 'grid',
    aspect: 1,
  },
  sudoku: {
    id: 'sudoku',
    name: 'Kid Sudoku',
    tagline: 'Fill the grid so every row, column, and box has each number once.',
    gateNote: 'Study time buys play time.',
    icon: '🔢',
    accent: '#7dd490',
    controls: 'board',
    aspect: 3 / 4,
  },
  dots: {
    id: 'dots',
    name: 'Dots & Boxes',
    tagline: 'Draw the lines, close the boxes, out-square your opponent.',
    gateNote: 'Study time buys play time.',
    icon: '✏️',
    accent: '#cbd5e1',
    controls: 'board',
    aspect: 3 / 4,
  },
  cards: {
    id: 'cards',
    name: 'Color Cascade',
    tagline: 'Match the color, dodge the wilds, empty your hand!',
    gateNote: 'Study time buys play time.',
    icon: '🃏',
    accent: '#ff5252',
    controls: 'board',
    aspect: 3 / 4,
  },
  wordhunt: {
    id: 'wordhunt',
    name: 'Word Hunt',
    tagline: 'Track down every hidden word before the grid grows.',
    gateNote: 'Study time buys play time.',
    icon: '🔎',
    accent: '#e8590c',
    controls: 'grid',
    aspect: 3 / 4,
  },
  spelling: {
    id: 'spelling',
    name: 'Spelling Zap',
    tagline: 'Tap the letters in order and zap each word into place.',
    gateNote: 'Study time buys play time.',
    icon: '⚡',
    accent: '#20c997',
    controls: 'grid',
    aspect: 3 / 4,
  },
};

/**
 * A kid-readable "how to play" for each game - the OBJECTIVE and rules, not just
 * the controls. Shown in the in-game info panel (and auto-shown the first time a
 * game is opened), so a child who has never seen the game knows what to do.
 */
export const HOW_TO: Record<GameId, string> = {
  match3:
    'Swap two touching candies to line up three or more of the same kind. They pop, you score, and new candies fall in. Make big matches for chains!',
  blocks:
    'Drag the shapes from the tray onto the board. Fill a whole row or a whole column and it clears away. Each level starts with a fun picture to clear. It ends when no shape fits - so leave yourself room!',
  tetris:
    'Shapes fall from the top. Move and rotate them so they fit together with no gaps. Fill a whole row and it disappears. Keep the stack from reaching the top.',
  frogger:
    'Hop across the road and river to reach the safe spots at the top. Dodge the cars, and ride the logs and lily pads across the water - do not fall in! Grab coins along the way.',
  snake:
    'Steer the snake to eat the food. Every bite makes it longer. Do not run into the walls or into your own tail.',
  platformer:
    'Run and jump to the flag at the end. Collect coins, bounce on enemies to squash them, and watch out for spiky ones you cannot jump on. Jump over the pits! See a glowing OPEN door? Stand on it and STOP moving for a moment to warp to a hidden coin room.',
  runner:
    'You run automatically and the road never ends. Tap anywhere to jump over gaps and obstacles - tap again in the air for a double jump. See how far you can go!',
  breakout:
    'Slide the paddle to bounce the ball up and smash all the bricks. Do not let the ball fall past your paddle. Clear the whole wall to win.',
  climber:
    'Bounce higher and higher up the platforms. Move side to side to land on the next one. Do not fall off the bottom!',
  maze:
    'Munch all the dots in the maze. Move around the paths and avoid the ghosts chasing you. Clear every dot to finish.',
  tictactoe:
    'Take turns placing your mark. Get three of yours in a row - across, down, or diagonally - before the other player does. Play a friend or the computer.',
  memory:
    'Flip two cards at a time to find matching pairs. Remember where each face is! Match them all to clear the board, then a bigger board appears.',
  merge:
    'Slide ALL the tiles one direction (swipe or use the arrows). When two tiles with the SAME number touch, they join into one tile worth double (2+2 makes 4, 4+4 makes 8). A new tile appears after each slide. Keep merging to reach big numbers - the game ends only when the board is full with no moves left.',
  bubble:
    'Aim and shoot bubbles up at the cluster. Match three or more of the same color to pop them. Any bubbles left hanging drop too. Do not let the bubbles reach the bottom.',
  checkers:
    'Move your pieces diagonally. Jump over an opponent piece to capture it - and chain jumps if you can. Reach the far side to make a King that moves both ways. Play a friend or the computer.',
  echo:
    'Watch the pattern of pads light up, then tap them back in the same order. Each round adds one more step. How long a pattern can you remember?',
  fruit:
    'Slide the basket left and right to catch the falling fruit. Catch the good fruit for points, and let the yucky ones fall past. Do not miss too many!',
  chess:
    'The classic game. Each piece moves its own way. Capture pieces and trap the other king in checkmate to win. Play a friend or the computer.',
  tapattack:
    'Critters pop out of the holes - tap the friendly ones fast for points before they duck back down. Do NOT tap the grumpy ones! It speeds up as you go.',
  sudoku:
    'Fill the grid so every row, every column, and every box has each number exactly once. Tap a square, then tap a number. The given numbers cannot change.',
  dots:
    'Take turns drawing one line between two dots. Finish the fourth side of a box to claim it and go again. Whoever owns the most boxes wins. Play a friend or the computer.',
  cards:
    'Play a card that matches the color OR the number of the top card. No match? Draw a card. Use Rainbow cards to change the color. First to empty their hand wins!',
  wordhunt:
    'Find the hidden words in the letter grid. Drag from the first letter to the last - words go across, down, and diagonally. Find them all to move on.',
  spelling:
    'A word flashes on the screen - memorize it! Then it hides and you tap the scrambled letters in the right order to spell it. Stuck? Use the Peek button.',
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
  GAMES.chess,
  GAMES.dots,
  GAMES.sudoku,
  GAMES.echo,
  GAMES.fruit,
  GAMES.tapattack,
  GAMES.cards,
  GAMES.wordhunt,
  GAMES.spelling,
];

const IDS = new Set<string>(Object.keys(GAMES));

export function isGameId(v: string): v is GameId {
  return IDS.has(v);
}
