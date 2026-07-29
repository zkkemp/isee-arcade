import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GAMES, GAME_LIST, type GameId } from '../lib/games';
import { nextRecentGames } from '../lib/recentGames';

const fail = (message: string): never => {
  throw new Error(`Game catalog check failed: ${message}`);
};

const gameLibrary = readFileSync(resolve('components/GameLibrary.tsx'), 'utf8');
const recentShelf = readFileSync(resolve('components/RecentlyPlayed.tsx'), 'utf8');
const sectionsSource = gameLibrary.slice(
  gameLibrary.indexOf('export const GAME_SECTIONS'),
  gameLibrary.indexOf('const NEW_GAME_IDS'),
);
const categoryIds = [...sectionsSource.matchAll(/ids:\s*\[([^\]]+)\]/g)].flatMap((match) =>
  [...match[1].matchAll(/'([^']+)'/g)].map((idMatch) => idMatch[1] as GameId),
);
const allIds = Object.keys(GAMES) as GameId[];
const missingFromCategories = allIds.filter((id) => !categoryIds.includes(id));
const duplicateCategories = [...new Set(categoryIds.filter((id, index) => categoryIds.indexOf(id) !== index))];

if (missingFromCategories.length) fail(`uncategorized games: ${missingFromCategories.join(', ')}`);
if (duplicateCategories.length) fail(`games repeated across categories: ${duplicateCategories.join(', ')}`);
if (categoryIds.length !== allIds.length) fail(`category count ${categoryIds.length} does not match ${allIds.length} games`);
if (GAME_LIST.length !== allIds.length || new Set(GAME_LIST.map((game) => game.id)).size !== allIds.length) {
  fail('GAME_LIST must contain every game exactly once');
}
if (gameLibrary.includes('<details') || gameLibrary.includes('StableGameCategory')) {
  fail('game tabs must show direct card grids without accordion groupings');
}
if (!recentShelf.includes("recent.length === 1 ? 'game' : 'games'")) {
  fail('recently played count must match the cards actually shown');
}

const playClient = readFileSync(resolve('components/PlayClient.tsx'), 'utf8');
const componentBlock = playClient.slice(
  playClient.indexOf('const COMPONENTS'),
  playClient.indexOf('export default function PlayClient'),
);
const mappedIds = [
  ...componentBlock.matchAll(
    /^\s{2}([a-z0-9]+):\s*dynamic<GameCanvasProps>\(\(\) => import\('\.\/games\/([^']+)'\), \{ loading: GameLoading \}\),$/gm,
  ),
];
const mappedGameIds = mappedIds.map((match) => match[1] as GameId);
const missingMappings = allIds.filter((id) => !mappedGameIds.includes(id));
if (missingMappings.length || mappedGameIds.length !== allIds.length) {
  fail(`dynamic component mapping mismatch: ${missingMappings.join(', ') || 'duplicate mapping'}`);
}
if (/^import\s+\w+\s+from\s+'\.\/games\//m.test(playClient)) {
  fail('games must use dynamic imports so one title does not load the entire arcade');
}
for (const [, , fileName] of mappedIds) {
  const source = readFileSync(resolve(`components/games/${fileName}.tsx`), 'utf8');
  const canvasGame = source.includes('<canvas');
  const fullDomGame = source.includes('className="absolute inset-0');
  if (!canvasGame && !fullDomGame) fail(`${fileName} has no full-stage game surface`);
  if (
    canvasGame &&
    (!source.includes('h-full') || !source.includes('w-full') || !source.includes('touch-none'))
  ) {
    fail(`${fileName} canvas does not fill the touch stage`);
  }
}

let recent: GameId[] = [];
for (const id of allIds.slice(0, 10)) recent = nextRecentGames(recent, id);
if (recent.length !== 6) fail('recently played shelf must stop at six games');
const newest = recent[0];
recent = nextRecentGames(recent, recent[3]);
if (recent[0] === newest || new Set(recent).size !== recent.length) {
  fail('replaying a game must move it to the front without duplication');
}

console.log(`Game catalog verified: ${allIds.length} routed, categorized, full-stage games; recent shelf capped at 6.`);
