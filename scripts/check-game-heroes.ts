import fs from 'node:fs';
import path from 'node:path';

function source(file: string): string {
  return fs.readFileSync(path.join(process.cwd(), 'components', 'games', file), 'utf8');
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`Game hero check failed: ${message}`);
}

function expectFrames(file: string, frames: string[]): void {
  const game = source(file);
  assert(!game.includes('drawCharacterSprite'), `${file} still stretches a profile portrait in gameplay`);
  for (const frame of frames) {
    assert(game.includes(`'${frame}'`), `${file} is missing the ${frame} animation pose`);
  }
}

expectFrames('Frogger.tsx', ['frog_idle', 'frog_jump']);
expectFrames('CoinRunner.tsx', [
  'character_pink_idle',
  'character_pink_walk_a',
  'character_pink_walk_b',
  'character_pink_jump',
  'character_pink_hit',
]);
expectFrames('RiftRaiders.tsx', [
  'character_purple_idle',
  'character_purple_walk_a',
  'character_purple_walk_b',
  'character_purple_jump',
  'character_purple_hit',
]);

console.log(
  'Game heroes verified: Road Hopper, Coin Runner, and Rift Raiders use purpose-built animated sprites.',
);
