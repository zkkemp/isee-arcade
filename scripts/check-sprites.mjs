/**
 * Verifies every sprite name the games ask for actually exists in an atlas.
 *
 * `drawFrame` deliberately no-ops on an unknown name so a typo degrades to a
 * missing sprite instead of a crashed animation loop. That is the right runtime
 * behavior and a terrible debugging experience: the game just renders nothing
 * where the character should be, with no error anywhere. This closes that gap at
 * build time.
 *
 * Run: npm run check:sprites
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SPRITE_DIR = join(ROOT, 'public', 'assets', 'sprites');
const KENNEY_SPACE_DIR = join(ROOT, 'public', 'assets', 'kenney', 'space-shooter');
const GAME_DIR = join(ROOT, 'components', 'games');

// --- what exists ---
const available = new Set();
const perAtlas = {};
for (const name of ['backgrounds', 'characters', 'enemies', 'tiles']) {
  const frames = JSON.parse(readFileSync(join(SPRITE_DIR, `${name}.json`), 'utf8'));
  perAtlas[name] = Object.keys(frames).length;
  for (const k of Object.keys(frames)) available.add(k);
}
for (const f of readdirSync(join(SPRITE_DIR, 'cars'))) {
  if (f.endsWith('.png')) available.add(f.replace(/\.png$/, ''));
}

// --- what the games ask for ---
// Sprite names are lowercase, underscore-separated, and at least two segments.
// That shape is distinctive enough to pick out of the source without parsing it.
const SPRITE_SHAPED = /^[a-z][a-z0-9]*(?:_[a-z0-9]+){1,}$/;
/** Strings that look like sprite names but are something else. */
const IGNORE = new Set(['run_jump', 'touch_action', 'image_rendering']);

const requested = new Map();
for (const file of readdirSync(GAME_DIR)) {
  if (!file.endsWith('.tsx')) continue;
  const src = readFileSync(join(GAME_DIR, file), 'utf8');
  for (const m of src.matchAll(/'([a-z0-9_]+)'/g)) {
    const name = m[1];
    if (!SPRITE_SHAPED.test(name) || IGNORE.has(name)) continue;
    if (!requested.has(name)) requested.set(name, new Set());
    requested.get(name).add(file);
  }
}

// Names built by template string (e.g. `terrain_${biome}_block_top`) never appear
// as a quoted literal, so the scan above cannot see them. Assert the families
// they expand into explicitly.
const DYNAMIC_FAMILIES = [
  ...['grass', 'sand', 'snow', 'stone', 'dirt', 'purple'].map((b) => `terrain_${b}_block_top`),
];
for (const name of DYNAMIC_FAMILIES) {
  if (!requested.has(name)) requested.set(name, new Set(['(template string)']));
}

const missing = [];
for (const [name, files] of requested) {
  if (!available.has(name)) missing.push(`${name}  (referenced in ${[...files].join(', ')})`);
}

console.log(
  `atlases: ${Object.entries(perAtlas)
    .map(([k, v]) => `${k} ${v}`)
    .join(', ')} frames`,
);
console.log(`game code references ${requested.size} sprite names`);

if (missing.length) {
  console.error(`\n${missing.length} SPRITE NAME(S) NOT IN ANY ATLAS:`);
  for (const m of missing) console.error(`  x ${m}`);
  console.error('\nThese would silently draw nothing.');
  process.exit(1);
}

// Space games use a small set of standalone Kenney images instead of an atlas.
// Keep the loader and checked-in files in lockstep, and make the CC0 record
// impossible to drop accidentally during a cleanup.
const spaceLoader = readFileSync(join(ROOT, 'lib', 'kenneySpace.ts'), 'utf8');
const spriteList = spaceLoader.slice(
  spaceLoader.indexOf('export const KENNEY_SPACE_SPRITES'),
  spaceLoader.indexOf('] as const;'),
);
const requestedSpace = [...spriteList.matchAll(/'([a-z0-9-]+)'/g)].map((match) => match[1]);
const missingSpace = requestedSpace.filter(
  (name) => !readdirSync(KENNEY_SPACE_DIR).includes(`${name}.png`),
);
if (missingSpace.length) {
  console.error(`\nKenney space sprites missing: ${missingSpace.join(', ')}`);
  process.exit(1);
}
const spaceLicense = readFileSync(join(KENNEY_SPACE_DIR, 'KENNEY-LICENSE.txt'), 'utf8');
if (!spaceLicense.includes('License (CC0)')) {
  console.error('\nKenney space sprite license is missing or no longer records CC0.');
  process.exit(1);
}

console.log(`standalone Kenney space sprites: ${requestedSpace.length}, CC0 license present`);
console.log('\nEvery referenced sprite exists.');
