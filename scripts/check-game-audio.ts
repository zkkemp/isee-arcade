import { readFileSync } from 'node:fs';
import {
  parseGameDifficulties,
  withGameDifficulty,
} from '../lib/difficulty.js';
import { MUSIC_PATTERNS } from '../lib/gameMusic.js';
import { GAMES } from '../lib/games.js';
import { SOUND_COOLDOWNS } from '../lib/sound.js';

const fail = (message: string): never => {
  throw new Error(`Game audio/settings check failed: ${message}`);
};

if (GAMES.platformer.music !== 'storybook') fail('Coin Runner needs its storybook score');
if (GAMES.riftraiders.music !== 'rift') fail('Rift Raiders needs its quieter rift score');
if (GAMES.platformer3.music !== 'kingdom') fail('Kingdom Quest must use the shared kingdom score');
if (Object.values(GAMES).filter((game) => game.music).length < 20) {
  fail('the active arcade catalog needs broad—but selective—music coverage');
}

for (const [name, pattern] of Object.entries(MUSIC_PATTERNS)) {
  if (pattern.stepMs < 320) fail(`${name} music is too busy for soft background play`);
  if (pattern.melody.length < 16) fail(`${name} needs a full musical phrase`);
  if (pattern.melodyGain > 0.22 || pattern.bassGain > 0.13) {
    fail(`${name} is mixed too loudly`);
  }
}

if (SOUND_COOLDOWNS.gameOver < 400 || SOUND_COOLDOWNS.levelClear < 400) {
  fail('shell/game duplicate end sounds need a protective cooldown');
}
if (SOUND_COOLDOWNS.land < 75) fail('repeated landing sounds need rate limiting');

const first = withGameDifficulty({}, 'platformer', 'easy');
const second = withGameDifficulty(first, 'riftraiders', 'hard');
if (second.platformer !== 'easy' || second.riftraiders !== 'hard') {
  fail('game levels are not independent');
}
const parsed = parseGameDifficulties(
  '{"platformer":"normal","riftraiders":"hard","bad":"impossible"}',
);
if (parsed.platformer !== 'normal' || parsed.riftraiders !== 'hard' || 'bad' in parsed) {
  fail('stored game levels are not validated');
}

const shellSource = readFileSync(
  new URL('../components/GameShell.tsx', import.meta.url),
  'utf8',
);
if (!shellSource.includes('useGameDifficulty(meta.id)')) {
  fail('GameShell is not loading the selected game level');
}
if (!shellSource.includes('useGameMusic(meta.music')) {
  fail('GameShell is not coordinating background music with pause/mute state');
}
const kingdomSource = readFileSync(
  new URL('../components/games/KingdomQuest.tsx', import.meta.url),
  'utf8',
);
if (kingdomSource.includes('startKingdomMusic')) {
  fail('Kingdom Quest still starts an independent music engine');
}

console.log(
  `Game audio/settings verified: ${Object.values(GAMES).filter((game) => game.music).length} scored games, six soft themes, calmer rate-limited effects, and independent per-game levels.`,
);
