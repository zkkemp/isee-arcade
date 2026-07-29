import type { ComponentType } from 'react';
import type { Difficulty } from './difficulty';
import type { InputController } from './input';
import type { Character } from './characters';

export type GameId =
  | 'match3'
  | 'blocks'
  | 'tetris'
  | 'frogger'
  | 'snake2'
  | 'platformer'
  | 'platformer3'
  | 'riftraiders'
  | 'diamond'
  | 'paperroute'
  | 'pyramidhop'
  | 'reversi'
  | 'backgammon'
  | 'seabattle'
  | 'paddleduel'
  | 'asteroids'
  | 'stardefender'
  | 'lunarlander'
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
  | 'fruit2'
  | 'chess'
  | 'tapattack'
  | 'tapattack2'
  | 'sudoku'
  | 'dots'
  | 'cards'
  | 'wordhunt'
  | 'spelling'
  | 'skystack'
  | 'starfall'
  | 'firefly'
  | 'mysteryfaces'
  | 'colorbynumber'
  | 'hangman'
  | 'wordscramble'
  | 'diceroyale'
  | 'starlinefour'
  | 'mancala'
  | 'gemcode'
  | 'constellation'
  | 'lanterns';

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
  /** The chosen family character for profile-aware games and non-gameplay UI. */
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
  snake2: {
    id: 'snake2',
    name: 'Byte Snake: Garden',
    tagline: 'Slither through the garden, snack on berries, and grow your trail.',
    gateNote: 'Study time buys play time.',
    icon: '🐍',
    accent: '#69c66d',
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
    tagline: 'Race through storybook worlds, uncover secret pages, and collect every coin.',
    gateNote: 'Study time buys play time.',
    icon: '🪙',
    accent: '#ff9f5a',
    controls: 'run-jump',
    aspect: 4 / 3,
  },
  platformer3: { id: 'platformer3', name: 'Kingdom Quest', tagline: 'Cross sixteen handcrafted realms, master magical powers, and restore the kingdom.', gateNote: 'Study time buys play time.', icon: '🏰', accent: '#79c9ff', controls: 'run-jump', aspect: 4 / 3 },
  riftraiders: {
    id: 'riftraiders',
    name: 'Rift Raiders',
    tagline: 'Run the glowing wilds, blast the machine swarm, and break the siege.',
    gateNote: 'Study time buys play time.',
    icon: '🦾',
    accent: '#4df8d2',
    controls: 'run-jump',
    aspect: 4 / 3,
  },
  diamond: { id: 'diamond', name: 'Diamond Derby', tagline: 'Pitch, field, bat, run the bases, and win a three-inning harbor cup.', gateNote: 'Study time buys play time.', icon: '⚾', accent: '#71e3d0', controls: 'grid', aspect: 3 / 4 },
  paperroute: { id: 'paperroute', name: 'Paper Route', tagline: 'Zip down the street, dodge trouble, and deliver every paper.', gateNote: 'Study time buys play time.', icon: '📰', accent: '#ffbd5a', controls: 'lanes', aspect: 3 / 4 },
  pyramidhop: { id: 'pyramidhop', name: 'Pyramid Hop', tagline: 'Hop through sunny ruins and uncover the golden path.', gateNote: 'Study time buys play time.', icon: '🔺', accent: '#efb24e', controls: 'dpad', aspect: 3 / 4 },
  reversi: { id: 'reversi', name: 'Reversi', tagline: 'Trap the discs, flip the board, and claim the most.', gateNote: 'Study time buys play time.', icon: '⚫', accent: '#5ed6a0', controls: 'board', aspect: 1 },
  backgammon: { id: 'backgammon', name: 'Backgammon', tagline: 'Play the complete 24-point race with all 15 checkers.', gateNote: 'Study time buys play time.', icon: '▰', accent: '#e7b978', controls: 'board', aspect: 4 / 3 },
  seabattle: { id: 'seabattle', name: 'Sea Battle', tagline: 'Scan the waves, find the fleet, and win the naval duel.', gateNote: 'Study time buys play time.', icon: '⚓', accent: '#58b9e8', controls: 'board', aspect: 1 },
  paddleduel: { id: 'paddleduel', name: 'Paddle Duel', tagline: 'Challenge the computer or put two players on one iPad.', gateNote: 'Study time buys play time.', icon: '🏓', accent: '#ff7d8e', controls: 'paddle', aspect: 3 / 4 },
  asteroids: { id: 'asteroids', name: 'Asteroid Patrol', tagline: 'Steer through the starfield and clear a safe space lane.', gateNote: 'Study time buys play time.', icon: '☄️', accent: '#b49aff', controls: 'dpad', aspect: 3 / 4 },
  stardefender: { id: 'stardefender', name: 'Star Defender', tagline: 'Slide your starship, fire bright bolts, and stop the descending swarm.', gateNote: 'Study time buys play time.', icon: '🌟', accent: '#ffdc63', controls: 'paddle', aspect: 3 / 4 },
  lunarlander: { id: 'lunarlander', name: 'Lunar Lander', tagline: 'Guide your lander gently onto the moon base.', gateNote: 'Study time buys play time.', icon: '🌙', accent: '#b6d4ee', controls: 'dpad', aspect: 3 / 4 },
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
  fruit2: {
    id: 'fruit2',
    name: 'Fruit Catch: Orchard',
    tagline: 'Catch the orchard harvest and keep the basket full of goodies.',
    gateNote: 'Study time buys play time.',
    icon: '🍎',
    accent: '#f26b5b',
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
  tapattack2: {
    id: 'tapattack2',
    name: 'Tap Attack: Carnival',
    tagline: 'Tap the carnival targets fast, but leave the grumpy ones alone.',
    gateNote: 'Study time buys play time.',
    icon: '🎪',
    accent: '#ff5aa5',
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
    name: 'Color Dash',
    tagline: 'Match colors and numbers, call one, and race to empty your hand!',
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
  skystack: {
    id: 'skystack',
    name: 'Sky Stack',
    tagline: 'Tap at just the right moment and build a toy town into the clouds.',
    gateNote: 'Study time buys play time.',
    icon: '🏙️',
    accent: '#7dd3fc',
    controls: 'tapjump',
    aspect: 3 / 4,
  },
  starfall: {
    id: 'starfall',
    name: 'Starfall Squadron',
    tagline: 'Steer through a sparkling galaxy and clear each colorful wave.',
    gateNote: 'Study time buys play time.',
    icon: '🚀',
    accent: '#7be6ff',
    controls: 'grid',
    aspect: 3 / 4,
  },
  firefly: {
    id: 'firefly',
    name: 'Firefly Orbit',
    tagline: 'Time one perfect tap to bring two glowing garden friends together.',
    gateNote: 'Study time buys play time.',
    icon: '✨',
    accent: '#fff19a',
    controls: 'grid',
    aspect: 2 / 3,
  },
  mysteryfaces: {
    id: 'mysteryfaces',
    name: 'Mystery Faces',
    tagline: 'Ask smart questions, cross off suspects, and solve each friendly mystery.',
    gateNote: 'Study time buys play time.',
    icon: '🕵️',
    accent: '#f6d56b',
    controls: 'grid',
    aspect: 3 / 4,
  },
  colorbynumber: {
    id: 'colorbynumber',
    name: 'Color by Number Studio',
    tagline: 'Bring 42 intricate, original pictures to life one rich color at a time.',
    gateNote: 'Study time buys play time.',
    icon: '🎨',
    accent: '#ff79b8',
    controls: 'grid',
    aspect: 3 / 4,
  },
  hangman: {
    id: 'hangman',
    name: 'Hangman: Word Rescue',
    tagline: 'Use smart letter guesses to solve the word before the storm arrives.',
    gateNote: 'Study time buys play time.',
    icon: '🪁',
    accent: '#67e8f9',
    controls: 'board',
    aspect: 3 / 4,
  },
  wordscramble: {
    id: 'wordscramble',
    name: 'Word Scramble',
    tagline: 'Unscramble picture words, school words, or challenging ISEE vocabulary.',
    gateNote: 'Study time buys play time.',
    icon: '🔤',
    accent: '#e879f9',
    controls: 'board',
    aspect: 3 / 4,
  },
  diceroyale: {
    id: 'diceroyale',
    name: 'Dice Royale',
    tagline: 'Roll, hold, and build the best scorecard with friends or clever CPU rivals.',
    gateNote: 'Study time buys play time.',
    icon: '🎲',
    accent: '#fbbf24',
    controls: 'board',
    aspect: 3 / 4,
  },
  starlinefour: {
    id: 'starlinefour',
    name: 'Starline Four',
    tagline: 'Drop glowing stars and connect four before your rival.',
    gateNote: 'Study time buys play time.',
    icon: '🌠',
    accent: '#fbbf24',
    controls: 'board',
    aspect: 3 / 4,
  },
  mancala: {
    id: 'mancala',
    name: 'Mancala Garden',
    tagline: 'Sow the stones, plan a capture, and fill your store.',
    gateNote: 'Study time buys play time.',
    icon: '🪨',
    accent: '#6ee7b7',
    controls: 'board',
    aspect: 4 / 3,
  },
  gemcode: {
    id: 'gemcode',
    name: 'Gem Code',
    tagline: 'Crack the hidden color code with logic and careful clues.',
    gateNote: 'Study time buys play time.',
    icon: '💎',
    accent: '#67e8f9',
    controls: 'board',
    aspect: 3 / 4,
  },
  constellation: {
    id: 'constellation',
    name: 'Constellation Connect',
    tagline: 'Race across the night sky and connect every numbered star in order.',
    gateNote: 'Study time buys play time.',
    icon: '🌌',
    accent: '#a5f3fc',
    controls: 'board',
    aspect: 3 / 4,
  },
  lanterns: {
    id: 'lanterns',
    name: 'Lantern Garden',
    tagline: 'Flip neighboring lanterns and make the whole moonlit garden glow.',
    gateNote: 'Study time buys play time.',
    icon: '🏮',
    accent: '#fde68a',
    controls: 'board',
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
    'Choose a 10 by 10, 12 by 12, or 14 by 14 board, then drag shapes from the tray into open spaces. Fill a whole row or column to clear it. Every new game starts with a different picture and piece deal. It ends when no shape fits, so leave yourself room!',
  tetris:
    'Shapes fall from the top. Move and rotate them so they fit together with no gaps. Fill a whole row and it disappears. Keep the stack from reaching the top.',
  frogger:
    'Hop across the road and river to reach the safe spots at the top. Dodge the cars, and ride the logs and lily pads across the water - do not fall in! Grab coins along the way.',
  snake2:
    'Guide your snake through the garden to munch sweet berries. Every berry makes your trail longer, so plan ahead and do not bump into the fence or your own tail.',
  platformer:
    'Run through each storybook chapter to reach the flag. Collect coins, jump over pits, bounce on safe enemies, and avoid spiky ones. Look for glowing doors that open secret pages full of treasure.',
  platformer3:
    'Follow the sixteen-stage kingdom map, then run and jump to each beacon in order. Build speed smoothly, stomp creatures, cross pits, collect coins and hidden runes, and light checkpoints. Sunblooms give you a shield and comet stars let you charge through danger. Restore all sixteen realms, then defeat the Aurora Sentinel with four careful stomps.',
  riftraiders:
    'Move left and right and jump across the glowing bioforge. Your pulse rifle aims and fires automatically, so concentrate on moving, dodging, and choosing safe platforms. Collect S, L, and C weapon capsules for spread shots, lasers, and comet blasts. Activate gold rescue beacons, then destroy the giant Siege Core to open the next mission.',
  diamond:
    'Play both sides of a three-inning Harbor Cup. On defense, choose Changeup, Curveball, or Fastball, then tap the catcher target. Pitch smart: changeups work best low, fastballs work best high, and curveballs create outs on the corners. Avoid the risky center square. On offense, move the yellow aim marker and tap as the ball reaches the strike zone. Balls, strikes, walks, fielded outs, hits, runners, runs, innings, extra innings, wins, and losses all count.',
  paperroute: 'Move left and right along the street. Deliver papers to the mailboxes, dodge obstacles, and keep your route rolling.',
  pyramidhop: 'Light every jewel while avoiding the dust bug. Left and Right descend the two visible slopes; Up climbs the left slope and Down climbs the right slope. The top jewel starts lit, invalid moves stay safely on the pyramid, and each completed pyramid begins a faster level.',
  reversi: 'Place a disc so it traps the other color in a straight line. Every trapped disc flips to your color. When the board is full, the most discs wins.',
  backgammon: 'Play standard backgammon on 24 points with 15 checkers each. Ivory moves toward point 1 and Crimson moves toward point 24. Use both dice whenever possible; doubles give four moves. A point with two opposing checkers is blocked, while landing on one opposing checker sends it to the bar. Bar checkers must re-enter first. Once all 15 of your checkers are in your six-point home board, bear them off to win.',
  seabattle: 'Tap squares in the enemy ocean to fire. Hits find ships and misses mark empty water. Find every ship before the other fleet finds yours.',
  paddleduel: 'Choose 1 player or 2 players before the match, then choose Chill, Classic, or Turbo ball speed. In 1P, drag the blue bottom paddle. In 2P, one player drags in the top half for pink while the other simultaneously drags in the bottom half for blue. After every point, both local players must tap Ready before the next serve. First to seven wins.',
  asteroids: 'Use Left and Right to turn, Up to thrust and auto-fire, and Down to brake. Clear every moving rock to open the next patrol field. Large rocks split into smaller pieces, so keep moving and use your three lives carefully.',
  stardefender: 'Slide your starship left and right; it fires automatically. Dodge enemy bolts and shoot every colorful invader before the formation reaches your defense line.',
  lunarlander: 'Use Left and Right for side thrust, Up for lift, and Down to brake. Watch both velocity numbers: they turn green when your sideways and downward speeds are safe. Land with both feet inside the glowing pad before fuel runs out.',
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
  fruit2:
    'Slide your basket through the orchard to catch ripe fruit as it tumbles down. Grab the tasty fruit for points, avoid the spoiled ones, and do not let too many good picks fall away.',
  chess:
    'The classic game. Each piece moves its own way. Capture pieces and trap the other king in checkmate to win. Play a friend or the computer.',
  tapattack:
    'Critters pop out of the holes - tap the friendly ones fast for points before they duck back down. Do NOT tap the grumpy ones! It speeds up as you go.',
  tapattack2:
    'Carnival targets pop up all around the booth. Tap the happy targets quickly for points, but do not tap the grumpy ones! Each round gets faster.',
  sudoku:
    'Fill the grid so every row, every column, and every box has each number exactly once. Tap a square, then tap a number. The given numbers cannot change.',
  dots:
    'Take turns drawing one line between two dots. Finish the fourth side of a box to claim it and go again. Whoever owns the most boxes wins. Play a friend or the computer.',
  cards:
    'Play a card that matches the color or number on top. Wild cards let you choose a color; action cards skip, reverse, or make the other player draw. When you have two cards, tap CALL ONE before playing one - forget and you draw two cards! Empty your hand to win.',
  wordhunt:
    'Find the hidden words in the letter grid. Drag from the first letter to the last - words go across, down, and diagonally. Find them all to move on.',
  spelling:
    'A word flashes on the screen - memorize it! Then it hides and you tap the scrambled letters in the right order to spell it. Stuck? Use the Peek button.',
  skystack:
    'A colorful block slides across the sky. Tap or press Space to drop it onto the tower. The part that hangs over the edge falls away, so line it up carefully. Stack eight blocks to light up the next town!',
  starfall:
    'Drag your ship around the galaxy or use the arrow keys. Your ship fires automatically. Dodge the visitors, clear every colorful wave, and protect all three hearts.',
  firefly:
    'The blue firefly circles the moonlit garden. Tap or press Space when it reaches the golden firefly. Light six meetings to open the next garden, and watch closely as the orbit speeds up!',
  mysteryfaces:
    'A secret member of the Mystery Crew has been chosen. Ask yes-or-no questions, use each answer to cross off faces that cannot be the secret, then tap MAKE GUESS and choose the one face left. Easy mode helps cross off impossible faces for you.',
  colorbynumber:
    'Choose from a seven-page gallery of 42 original pictures, each with more than 1,200 numbered cells. Use the large Previous and Next buttons to change gallery pages, or the Picture buttons while painting to move directly to another design. Pick a numbered color and paint every cell with that number. Pinch to zoom, use two fingers to move, and tap Fit whenever you want the whole picture back on screen. Finished colors disappear automatically, wrong colors do not stick, and every picture resumes where you stopped.',
  hangman:
    'Use the clue and guess one letter at a time. Correct letters fill the word; wrong letters bring the storm closer. Solve four words to complete a Word Rescue mission. Word difficulty follows the active learner profile.',
  wordscramble:
    'Use the picture or meaning clue, then tap the mixed-up letter tiles in the right order. Undo, reshuffle, or place one hint letter when needed. Words automatically match the active learner profile and grow harder as rounds increase.',
  diceroyale:
    'Choose 1 to 4 players and decide which seats are people or computer rivals. Roll up to three times, tapping dice to hold the ones you want to keep. Then choose one open score row. Every row can be used once; the highest total after all 13 rounds wins.',
  starlinefour:
    'Choose one player or two players. Take turns dropping one glowing star into a column. Stars fall to the lowest open spot. Connect four of your color across, down, or diagonally before your rival does.',
  mancala:
    'Choose one player or two players. Tap one bowl on your side to pick up every stone and sow them one at a time around the board. Skip the other player’s store. End in your own store to play again. End in an empty bowl on your side to capture that stone and the stones directly opposite. When one side is empty, the most stones in a store wins.',
  gemcode:
    'The vault hides four different colored gems. Build a four-gem guess, then lock it in. Each bright clue pin means one gem has the right color and the right position. Each pale pin means a right color is in the wrong position. Use those clues to crack the code in ten guesses.',
  constellation:
    'Tap the numbered stars in order before the constellation fades. Correct stars draw a glowing path across the sky. A wrong star costs one second. Connect three constellations to reach a study break.',
  lanterns:
    'Tap a lantern to change it and the lanterns directly above, below, left, and right. Keep experimenting until every lantern is glowing. Every puzzle begins solvable, and larger difficulty settings grow a bigger garden.',
};

export const GAME_LIST: GameMeta[] = [
  GAMES.match3,
  GAMES.blocks,
  GAMES.tetris,
  GAMES.platformer3,
  GAMES.riftraiders,
  GAMES.platformer,
  GAMES.diamond,
  GAMES.paperroute,
  GAMES.pyramidhop,
  GAMES.reversi,
  GAMES.backgammon,
  GAMES.seabattle,
  GAMES.paddleduel,
  GAMES.asteroids,
  GAMES.stardefender,
  GAMES.lunarlander,
  GAMES.runner,
  GAMES.breakout,
  GAMES.maze,
  GAMES.climber,
  GAMES.frogger,
  GAMES.snake2,
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
  GAMES.fruit2,
  GAMES.tapattack,
  GAMES.tapattack2,
  GAMES.cards,
  GAMES.wordhunt,
  GAMES.spelling,
  GAMES.skystack,
  GAMES.starfall,
  GAMES.firefly,
  GAMES.mysteryfaces,
  GAMES.colorbynumber,
  GAMES.hangman,
  GAMES.wordscramble,
  GAMES.diceroyale,
  GAMES.starlinefour,
  GAMES.mancala,
  GAMES.gemcode,
  GAMES.constellation,
  GAMES.lanterns,
];

const IDS = new Set<string>(Object.keys(GAMES));

export function isGameId(v: string): v is GameId {
  return IDS.has(v);
}
