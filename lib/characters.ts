'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * The family, as playable characters.
 *
 * Everything here is DRAWN, not photographed. The reference photos live in
 * /reference/family, which is gitignored and outside `public/`, so they are never
 * committed and never served - the likeness is hand-tuned palette and hair shape,
 * nothing more. That was the explicit requirement: "those pictures are never going
 * to get actually used, just create avatars that look just like them."
 *
 * Drawing rather than loading also means one code path scales from a 24px in-game
 * sprite to a 200px celebration portrait with no assets to ship and nothing to go
 * blurry on a Retina iPad.
 */

export type CharacterId =
  | 'marty'
  | 'dakota'
  | 'carson'
  | 'colton'
  | 'hudson'
  | 'sadie'
  | 'miles'
  | 'ruby'
  | 'jasper'
  | 'nova'
  | 'scout'
  | 'hoot'
  | 'pogo'
  | 'mochi'
  | 'whiskers'
  | 'roary'
  | 'zippy'
  | 'draco'
  | 'rocket'
  | 'orbit'
  | 'comet'
  | 'luna'
  | 'sunny'
  | 'bolt'
  | 'brainwave'
  | 'pixel'
  | 'lucky'
  | 'crown'
  | 'gem'
  | 'skater'
  | 'aria'
  | 'theo'
  | 'nia'
  | 'caleb'
  | 'maya'
  | 'liam'
  | 'finn'
  | 'chloe'
  | 'owen'
  | 'elsie'
  | 'jack'
  | 'sophie'
  | 'micah'
  | 'lily'
  | 'grace'
  | 'noah'
  | 'ava'
  | 'luke'
  | 'glimmer'
  | 'beebo'
  | 'fuzzbit'
  | 'emberwing'
  | 'twinkle'
  | 'moonlet'
  | 'gooey'
  | 'puff'
  | 'prism'
  | 'sprig'
  | 'blink'
  | 'droplet'
  | 'bop'
  | 'peep'
  | 'mushy'
  | 'orbitbot'
  | 'nimbus'
  | 'mossback'
  | 'jellonaut'
  | 'berrywing'
  | 'ripple'
  | 'ticker'
  | 'moonbun'
  | 'reefbot'
  | 'starfox'
  | 'marsh'
  | 'crystalbug'
  | 'bubblemage'
  | 'prickles'
  | 'cometcat'
  | 'lavapup'
  | 'snowbell'
  | 'origami'
  | 'cyclops'
  | 'shroomguard'
  | 'solario'
  | 'puddlefin'
  | 'candybat'
  | 'bloomie'
  | 'cabinet';

type HairStyle = 'bun' | 'ponytail' | 'part' | 'tousled' | 'pigtails' | 'cap' | 'buzz' | 'puffs';
export type CharacterGroup = 'crew' | 'creatures' | 'cosmic' | 'powerups' | 'fantastic';

export type Character = {
  id: CharacterId;
  name: string;
  kind: 'dog' | 'kid' | 'icon';
  group: CharacterGroup;
  age: number | null;
  blurb: string;
  /** Menu highlight colour. */
  accent: string;
  hair: HairStyle | null;
  hairColor: string;
  hairShade: string;
  skin: string;
  skinShade: string;
  shirt: string;
  shirtShade: string;
  /** Navy-and-white striped tee. */
  stripes: boolean;
  /** Little coloured dots on a white tee. */
  dots: boolean;
  /** Carson has braces, and she would be annoyed if they were left out. */
  braces: boolean;
  /** A sprinkle of freckles across the nose and cheeks. */
  freckles?: boolean;
  /** Round glasses frames over the eyes. */
  glasses?: boolean;
  /** Platform-native color symbol used by object and creature mascots. */
  glyph?: string;
  /** High-fidelity menu portrait. Gameplay can keep using the lightweight canvas form. */
  portrait?: string;
};

const SKIN = '#f7dcc4';
const SKIN_SHADE = '#e8bfa0';
const SKIN_TAN = '#d9a06c';
const SKIN_TAN_SHADE = '#b9824f';
const SKIN_DEEP = '#8c5a3c';
const SKIN_DEEP_SHADE = '#6b4128';

function iconCharacter(
  id: CharacterId,
  name: string,
  glyph: string,
  group: CharacterGroup,
  accent: string,
  blurb: string,
): Character {
  return {
    id,
    name,
    kind: 'icon',
    group,
    age: null,
    blurb,
    accent,
    glyph,
    hair: null,
    hairColor: accent,
    hairShade: '#11111b',
    skin: accent,
    skinShade: '#11111b',
    shirt: accent,
    shirtShade: '#11111b',
    stripes: false,
    dots: false,
    braces: false,
  };
}

export const CHARACTERS: Character[] = [
  {
    id: 'marty',
    name: 'Marty',
    kind: 'dog',
    group: 'crew',
    age: null,
    blurb: 'The good boy. Hops first, thinks later.',
    accent: '#f5a800',
    hair: null,
    hairColor: '#1d1d22',
    hairShade: '#0e0e12',
    skin: '#1d1d22',
    skinShade: '#0e0e12',
    shirt: '#f4f1ea',
    shirtShade: '#cfc8bb',
    stripes: false,
    dots: false,
    braces: false,
  },
  {
    id: 'dakota',
    name: 'Dakota',
    kind: 'kid',
    group: 'crew',
    age: 10,
    blurb: 'Ten. Reads the whole passage.',
    accent: '#6f8bd8',
    hair: 'bun',
    hairColor: '#a98a54',
    hairShade: '#87693c',
    skin: SKIN,
    skinShade: SKIN_SHADE,
    shirt: '#3f5b9c',
    shirtShade: '#2b4174',
    stripes: true,
    dots: false,
    braces: false,
  },
  {
    id: 'carson',
    name: 'Carson',
    kind: 'kid',
    group: 'crew',
    age: 8,
    blurb: 'Eight. Braces and a big grin.',
    accent: '#ff8fbf',
    hair: 'ponytail',
    hairColor: '#ecc964',
    hairShade: '#c9a444',
    skin: SKIN,
    skinShade: SKIN_SHADE,
    shirt: '#f2f4f8',
    shirtShade: '#d3d8e2',
    stripes: false,
    dots: true,
    braces: true,
  },
  {
    id: 'colton',
    name: 'Colton',
    kind: 'kid',
    group: 'crew',
    age: 6,
    blurb: 'Six. Full speed, always.',
    accent: '#43d6c4',
    hair: 'part',
    hairColor: '#e6c369',
    hairShade: '#c2a049',
    skin: SKIN,
    skinShade: SKIN_SHADE,
    shirt: '#43d6c4',
    shirtShade: '#2fae9f',
    stripes: false,
    dots: false,
    braces: false,
  },
  {
    id: 'hudson',
    name: 'Hudson',
    kind: 'kid',
    group: 'crew',
    age: 4,
    blurb: 'Four. Fearless.',
    accent: '#2fc7e8',
    hair: 'tousled',
    hairColor: '#f2dc9a',
    hairShade: '#d4bc74',
    skin: SKIN,
    skinShade: SKIN_SHADE,
    shirt: '#2fc7e8',
    shirtShade: '#1fa3c2',
    stripes: false,
    dots: false,
    braces: false,
  },
  {
    id: 'sadie',
    name: 'Sadie',
    kind: 'kid',
    group: 'crew',
    age: 9,
    blurb: 'Nine. Freckles and fast pigtails.',
    accent: '#ff6a4d',
    hair: 'pigtails',
    hairColor: '#c65a3b',
    hairShade: '#a8452b',
    skin: SKIN,
    skinShade: SKIN_SHADE,
    shirt: '#ffb648',
    shirtShade: '#d99730',
    stripes: false,
    dots: false,
    braces: false,
    freckles: true,
  },
  {
    id: 'miles',
    name: 'Miles',
    kind: 'kid',
    group: 'crew',
    age: 11,
    blurb: 'Eleven. Sees everything twice.',
    accent: '#8a6fd8',
    hair: 'part',
    hairColor: '#5b3a24',
    hairShade: '#402710',
    skin: SKIN_TAN,
    skinShade: SKIN_TAN_SHADE,
    shirt: '#3f7d5c',
    shirtShade: '#2b5c42',
    stripes: false,
    dots: false,
    braces: false,
    glasses: true,
  },
  {
    id: 'ruby',
    name: 'Ruby',
    kind: 'kid',
    group: 'crew',
    age: 7,
    blurb: 'Seven. Cap on, ready to go.',
    accent: '#e83e5c',
    hair: 'cap',
    hairColor: '#caa06a',
    hairShade: '#a37f4d',
    skin: SKIN,
    skinShade: SKIN_SHADE,
    shirt: '#f5a800',
    shirtShade: '#c98700',
    stripes: false,
    dots: true,
    braces: false,
  },
  {
    id: 'jasper',
    name: 'Jasper',
    kind: 'kid',
    group: 'crew',
    age: 12,
    blurb: 'Twelve. Buzzcut and business.',
    accent: '#4a90d9',
    hair: 'buzz',
    hairColor: '#1c1c1c',
    hairShade: '#0a0a0a',
    skin: SKIN_DEEP,
    skinShade: SKIN_DEEP_SHADE,
    shirt: '#c0392b',
    shirtShade: '#96271d',
    stripes: false,
    dots: false,
    braces: false,
  },
  {
    id: 'nova',
    name: 'Nova',
    kind: 'kid',
    group: 'crew',
    age: 5,
    blurb: 'Five. Puffs and pure energy.',
    accent: '#ffd23f',
    hair: 'puffs',
    hairColor: '#2b1b12',
    hairShade: '#180f0a',
    skin: SKIN_TAN,
    skinShade: SKIN_TAN_SHADE,
    shirt: '#ff6f91',
    shirtShade: '#d94f70',
    stripes: true,
    dots: false,
    braces: false,
  },
  iconCharacter('scout', 'Scout', '🦊', 'creatures', '#ff8a3d', 'Quick, curious, and ready to explore.'),
  iconCharacter('hoot', 'Hoot', '🦉', 'creatures', '#b58cff', 'A night owl who spots every clue.'),
  iconCharacter('pogo', 'Pogo', '🐸', 'creatures', '#5ee49b', 'Big jumps and even bigger ideas.'),
  iconCharacter('mochi', 'Mochi', '🐼', 'creatures', '#f3f4f6', 'Calm focus with a playful side.'),
  iconCharacter('whiskers', 'Whiskers', '🐱', 'creatures', '#ffbd59', 'Curious about absolutely everything.'),
  iconCharacter('roary', 'Roary', '🐯', 'creatures', '#ff7a45', 'Brave enough for the hardest level.'),
  iconCharacter('zippy', 'Zippy', '🐰', 'creatures', '#f5a7d2', 'Fast feet and a faster brain.'),
  iconCharacter('draco', 'Draco', '🐲', 'creatures', '#63e0c7', 'A tiny dragon with giant confidence.'),
  iconCharacter('rocket', 'Rocket', '🚀', 'cosmic', '#5bc8ff', 'Always headed for the next level.'),
  iconCharacter('orbit', 'Orbit', '🪐', 'cosmic', '#a78bfa', 'Makes every challenge part of the journey.'),
  iconCharacter('comet', 'Comet', '☄️', 'cosmic', '#ff8c5a', 'Bright, fast, and impossible to miss.'),
  iconCharacter('luna', 'Luna', '🌙', 'cosmic', '#d7d4ff', 'Quiet confidence for thoughtful players.'),
  iconCharacter('sunny', 'Sunny', '☀️', 'cosmic', '#ffd24d', 'Brings bright energy to every round.'),
  iconCharacter('bolt', 'Bolt', '⚡', 'powerups', '#ffe14d', 'A jolt of focus when it matters.'),
  iconCharacter('brainwave', 'Brainwave', '🧠', 'powerups', '#ff78b7', 'Built for clever answers and big ideas.'),
  iconCharacter('pixel', 'Pixel', '🎮', 'powerups', '#66d9ff', 'Classic arcade energy in one button.'),
  iconCharacter('lucky', 'Lucky', '🎲', 'powerups', '#ff6b6b', 'Ready to roll with any challenge.'),
  iconCharacter('crown', 'Crown', '👑', 'powerups', '#ffd166', 'For players who rule their own progress.'),
  iconCharacter('gem', 'Gem', '💎', 'powerups', '#5de7f1', 'A brilliant pick with plenty of sparkle.'),
  iconCharacter('skater', 'Skater', '🛹', 'powerups', '#8dff7a', 'Keeps moving, learning, and landing tricks.'),
];

const PORTRAIT_IDS: CharacterId[] = [
  'marty', 'dakota', 'carson', 'colton', 'hudson', 'sadie',
  'miles', 'ruby', 'jasper', 'nova', 'scout', 'hoot',
  'pogo', 'mochi', 'whiskers', 'roary', 'zippy', 'draco',
  'rocket', 'orbit', 'comet', 'luna', 'sunny', 'bolt',
  'brainwave', 'pixel', 'lucky', 'crown', 'gem', 'skater',
  'aria', 'theo', 'nia', 'caleb', 'maya', 'liam',
  'finn', 'chloe', 'owen', 'elsie', 'jack', 'sophie',
  'micah', 'lily', 'grace', 'noah', 'ava', 'luke',
];

const NEW_PORTRAIT_CHARACTERS: Character[] = [
  iconCharacter('aria', 'Aria', '✦', 'cosmic', '#62d6ff', 'Curious, calm, and ready to explore.'),
  iconCharacter('theo', 'Theo', '▲', 'cosmic', '#8b7cf6', 'Builds a plan, then levels it up.'),
  iconCharacter('nia', 'Nia', '◆', 'powerups', '#ff8ab8', 'Bright ideas and brave answers.'),
  iconCharacter('caleb', 'Caleb', '●', 'powerups', '#f7b955', 'A steady teammate with sharp focus.'),
  iconCharacter('maya', 'Maya', '★', 'crew', '#55d6a8', 'Kind, quick, and always learning.'),
  iconCharacter('liam', 'Liam', '⚡', 'crew', '#70a5ff', 'Turns every challenge into a new run.'),
  iconCharacter('finn', 'Finn', '●', 'crew', '#55a7ff', 'Quick smile, quicker thinking.'),
  iconCharacter('chloe', 'Chloe', '✦', 'crew', '#f2b544', 'Brings sunshine to every challenge.'),
  iconCharacter('owen', 'Owen', '▲', 'crew', '#78a7ff', 'Always ready for the next level.'),
  iconCharacter('elsie', 'Elsie', '◆', 'crew', '#b78cff', 'Creative, confident, and kind.'),
  iconCharacter('jack', 'Jack', '★', 'crew', '#70b56b', 'A careful thinker with bold ideas.'),
  iconCharacter('sophie', 'Sophie', '✿', 'crew', '#8e86df', 'Finds the fun in every puzzle.'),
  iconCharacter('micah', 'Micah', '⚡', 'crew', '#4d91dc', 'Calm focus and a winning grin.'),
  iconCharacter('lily', 'Lily', '✦', 'crew', '#78b9e8', 'Bright, brave, and ready to learn.'),
  iconCharacter('grace', 'Grace', '◆', 'crew', '#e5899f', 'Notices every important detail.'),
  iconCharacter('noah', 'Noah', '●', 'crew', '#d95f54', 'Keeps going until it clicks.'),
  iconCharacter('ava', 'Ava', '★', 'crew', '#f0ae42', 'Big curiosity and bigger ideas.'),
  iconCharacter('luke', 'Luke', '▲', 'crew', '#4f91d8', 'Makes every practice round count.'),
];

CHARACTERS.push(...NEW_PORTRAIT_CHARACTERS);
for (const id of PORTRAIT_IDS) {
  const character = CHARACTERS.find((candidate) => candidate.id === id);
  if (character) {
    character.portrait = `/avatars/${id}.webp`;
    character.kind = 'kid';
    character.glyph = undefined;
    character.hair ??= 'tousled';
  }
}

const FANTASTIC_FRIENDS: Character[] = [
  iconCharacter('glimmer', 'Glimmer', '👽', 'fantastic', '#9bea55', 'A bright-eyed visitor from far away.'),
  iconCharacter('beebo', 'Beebo', '🤖', 'fantastic', '#72ddff', 'A tiny robot with enormous curiosity.'),
  iconCharacter('fuzzbit', 'Fuzzbit', '👾', 'fantastic', '#a98bff', 'Soft, silly, and surprisingly clever.'),
  iconCharacter('emberwing', 'Emberwing', '🐲', 'fantastic', '#42d3cb', 'A little dragon with a brave heart.'),
  iconCharacter('twinkle', 'Twinkle', '⭐', 'fantastic', '#ffd55c', 'Makes every answer shine brighter.'),
  iconCharacter('moonlet', 'Moonlet', '🌙', 'fantastic', '#a8c9ff', 'A calm companion for big ideas.'),
  iconCharacter('gooey', 'Gooey', '🟢', 'fantastic', '#72e15e', 'Bounces back from every mistake.'),
  iconCharacter('puff', 'Puff', '☁️', 'fantastic', '#d7f4ff', 'A cheerful cloud with lofty plans.'),
  iconCharacter('prism', 'Prism', '💎', 'fantastic', '#8b8cff', 'Sees every puzzle from a new angle.'),
  iconCharacter('sprig', 'Sprig', '🌿', 'fantastic', '#77c866', 'Grows a little smarter every day.'),
  iconCharacter('blink', 'Blink', '🟡', 'fantastic', '#ffbd4a', 'One big eye for important details.'),
  iconCharacter('droplet', 'Droplet', '💧', 'fantastic', '#56c9ff', 'Cool under pressure and ready to flow.'),
  iconCharacter('bop', 'Bop', '🎧', 'fantastic', '#b978ff', 'Finds the rhythm in every challenge.'),
  iconCharacter('peep', 'Peep', '🐦', 'fantastic', '#579ee8', 'A quick little friend with sharp focus.'),
  iconCharacter('mushy', 'Mushy', '🍄', 'fantastic', '#ef77c8', 'A magical thinker from the forest floor.'),
  iconCharacter('orbitbot', 'Orbit Bot', '🛸', 'fantastic', '#f2a63b', 'A one-eyed explorer built for adventure.'),
  iconCharacter('nimbus', 'Nimbus', '🐋', 'fantastic', '#76cfff', 'A tiny cloud whale who floats above every worry.'),
  iconCharacter('mossback', 'Mossback', '🪨', 'fantastic', '#77c45b', 'A gentle garden golem with rock-solid focus.'),
  iconCharacter('jellonaut', 'Jellonaut', '🧑‍🚀', 'fantastic', '#66ddec', 'A bouncy space explorer from a watery moon.'),
  iconCharacter('berrywing', 'Berrywing', '🍓', 'fantastic', '#ff667a', 'A strawberry dragon with a sweet brave streak.'),
  iconCharacter('ripple', 'Ripple', '🫧', 'fantastic', '#b68cff', 'A rainbow axolotl who goes with the flow.'),
  iconCharacter('ticker', 'Ticker', '🦉', 'fantastic', '#d99a45', 'A clockwork owl who always spots the pattern.'),
  iconCharacter('moonbun', 'Moonbun', '🐇', 'fantastic', '#d9e5ff', 'A moonlit bunny with sky-high hops.'),
  iconCharacter('reefbot', 'Reef Bot', '🪸', 'fantastic', '#47d5ce', 'A coral-powered robot built to help.'),
  iconCharacter('starfox', 'Starfox', '🦊', 'fantastic', '#6a8dff', 'A starlight fox who follows every clue.'),
  iconCharacter('marsh', 'Marsh', '👻', 'fantastic', '#fff0df', 'A marshmallow ghost who is far too cheerful to haunt.'),
  iconCharacter('crystalbug', 'Crystal Bug', '🪲', 'fantastic', '#66d5ff', 'A jewel-bright beetle with a brilliant shell.'),
  iconCharacter('bubblemage', 'Bubble Mage', '🔮', 'fantastic', '#9b7cff', 'A bubbly wizard who makes clever ideas appear.'),
  iconCharacter('prickles', 'Prickles', '🌵', 'fantastic', '#8fd45d', 'A friendly cactus who sticks with every challenge.'),
  iconCharacter('cometcat', 'Comet Cat', '🐈', 'fantastic', '#668cff', 'A cosmic cat with a tail full of stardust.'),
  iconCharacter('lavapup', 'Lava Pup', '🐕', 'fantastic', '#ff7045', 'A warmhearted pup who glows under pressure.'),
  iconCharacter('snowbell', 'Snowbell', '❄️', 'fantastic', '#bce9ff', 'A pocket-size yeti with mountain-sized courage.'),
  iconCharacter('origami', 'Origami', '🪽', 'fantastic', '#c8b8ff', 'A folded crystal bird with razor-sharp ideas.'),
  iconCharacter('cyclops', 'Cyclops', '👁️', 'fantastic', '#57e7bd', 'One enormous eye for every tiny detail.'),
  iconCharacter('shroomguard', 'Shroom Guard', '🍄', 'fantastic', '#f17467', 'A tiny mushroom knight who protects good ideas.'),
  iconCharacter('solario', 'Solario', '🦁', 'fantastic', '#ffbd4f', 'A solar lion who brightens the hardest level.'),
  iconCharacter('puddlefin', 'Puddlefin', '🐟', 'fantastic', '#48d7db', 'A little sea monster with a huge imagination.'),
  iconCharacter('candybat', 'Candy Bat', '🦇', 'fantastic', '#f77fbd', 'A sugar-sweet flier with lightning reflexes.'),
  iconCharacter('bloomie', 'Bloomie', '🌸', 'fantastic', '#ff89be', 'A flower alien who grows new ideas everywhere.'),
  iconCharacter('cabinet', 'Cabinet', '🕹️', 'fantastic', '#54dff3', 'A smiling arcade machine who is always ready for one more round.'),
];

CHARACTERS.push(...FANTASTIC_FRIENDS);
for (const character of FANTASTIC_FRIENDS) {
  character.portrait = `/avatars/${character.id}.webp`;
}

/** The dog leads, because he was the one specifically asked for. */
export const DEFAULT_CHARACTER_ID: CharacterId = 'marty';

export function getCharacter(id: string | null | undefined): Character {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}

// --- drawing ---------------------------------------------------------------

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function ellipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  rot = 0,
): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fill();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
  ctx.fill();
}

/**
 * The curly coat that makes a bernedoodle read as a bernedoodle rather than a
 * generic black dog. Scalloped arcs around a silhouette, seeded off position so
 * the same shape gets the same curls every frame instead of boiling.
 */
function curlyEdge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string,
  count = 13,
): void {
  ctx.fillStyle = color;
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2;
    // Alternating radius gives the lumpy fleece outline.
    const bump = i % 2 === 0 ? 1.0 : 0.9;
    circle(ctx, cx + Math.cos(a) * rx * bump, cy + Math.sin(a) * ry * bump, rx * 0.2);
  }
}

/** Two big eyes with a catchlight. Shared by kids and the dog. */
function eyes(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  spread: number,
  r: number,
  look = 0,
): void {
  for (const s of [-1, 1]) {
    const ex = cx + s * spread;
    ctx.fillStyle = '#ffffff';
    ellipse(ctx, ex, cy, r * 1.05, r * 1.15);
    ctx.fillStyle = '#2a2f3a';
    circle(ctx, ex + look * r * 0.3, cy + r * 0.1, r * 0.62);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    circle(ctx, ex + look * r * 0.3 - r * 0.22, cy - r * 0.18, r * 0.22);
  }
}

/**
 * Marty's face. `size` is the head diameter.
 *
 * The markings are the recognisable part: black coat, a white blaze straight up
 * the muzzle and between the eyes, white muzzle and chin, and rust eyebrow dots
 * above each eye. Tongue out, because in every photo it is.
 */
export function drawDogFace(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  opts: { tongue?: boolean; look?: number } = {},
): void {
  const r = size / 2;
  const { tongue = true, look = 0 } = opts;

  // Ears first, so the head overlaps them.
  ctx.fillStyle = '#141418';
  for (const s of [-1, 1]) {
    ellipse(ctx, cx + s * r * 0.92, cy + r * 0.12, r * 0.34, r * 0.6, s * 0.22);
    curlyEdge(ctx, cx + s * r * 0.92, cy + r * 0.12, r * 0.34, r * 0.6, '#141418', 9);
  }

  // Head.
  curlyEdge(ctx, cx, cy, r * 0.94, r * 0.9, '#1d1d22');
  ctx.fillStyle = '#1d1d22';
  ellipse(ctx, cx, cy, r * 0.94, r * 0.9);

  // White blaze up the middle, widening into the muzzle.
  ctx.fillStyle = '#f6f3ec';
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.82);
  ctx.quadraticCurveTo(cx - r * 0.2, cy - r * 0.3, cx - r * 0.16, cy + r * 0.05);
  ctx.quadraticCurveTo(cx - r * 0.62, cy + r * 0.5, cx, cy + r * 0.92);
  ctx.quadraticCurveTo(cx + r * 0.62, cy + r * 0.5, cx + r * 0.16, cy + r * 0.05);
  ctx.quadraticCurveTo(cx + r * 0.2, cy - r * 0.3, cx, cy - r * 0.82);
  ctx.closePath();
  ctx.fill();

  // Rust eyebrow dots - the tricolour tell.
  ctx.fillStyle = '#8a4f22';
  for (const s of [-1, 1]) {
    ellipse(ctx, cx + s * r * 0.42, cy - r * 0.34, r * 0.15, r * 0.1, s * 0.3);
  }

  eyes(ctx, cx, cy - r * 0.14, r * 0.4, r * 0.15, look);

  // Nose and mouth.
  ctx.fillStyle = '#15151a';
  ellipse(ctx, cx, cy + r * 0.34, r * 0.19, r * 0.15);
  ctx.strokeStyle = '#15151a';
  ctx.lineWidth = Math.max(1, r * 0.055);
  ctx.beginPath();
  ctx.moveTo(cx, cy + r * 0.47);
  ctx.lineTo(cx, cy + r * 0.55);
  ctx.stroke();

  if (tongue) {
    ctx.fillStyle = '#f2748f';
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.16, cy + r * 0.54);
    ctx.quadraticCurveTo(cx, cy + r * 1.02, cx + r * 0.16, cy + r * 0.54);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(160,50,80,0.5)';
    ctx.lineWidth = Math.max(1, r * 0.03);
    ctx.beginPath();
    ctx.moveTo(cx, cy + r * 0.62);
    ctx.lineTo(cx, cy + r * 0.9);
    ctx.stroke();
  }
}

/** Hair, drawn behind and then in front of the head. */
function drawHairBack(
  ctx: CanvasRenderingContext2D,
  c: Character,
  cx: number,
  cy: number,
  r: number,
): void {
  ctx.fillStyle = c.hairShade;
  if (c.hair === 'ponytail') {
    // Ponytail off to one side, so it is visible in a front-facing portrait.
    ellipse(ctx, cx + r * 0.95, cy + r * 0.1, r * 0.26, r * 0.52, 0.25);
  } else if (c.hair === 'bun') {
    circle(ctx, cx, cy - r * 0.95, r * 0.34);
  } else if (c.hair === 'pigtails') {
    // Two ponytails, one per side, so both read in a front-facing portrait.
    for (const s of [-1, 1]) {
      ellipse(ctx, cx + s * r * 0.92, cy + r * 0.14, r * 0.22, r * 0.48, s * 0.15);
    }
  } else if (c.hair === 'puffs') {
    // Round afro puffs, curly-edged like the dog's coat, one per side.
    for (const s of [-1, 1]) {
      curlyEdge(ctx, cx + s * r * 0.88, cy - r * 0.48, r * 0.3, r * 0.3, c.hairShade, 9);
      ctx.fillStyle = c.hairColor;
      ellipse(ctx, cx + s * r * 0.88, cy - r * 0.48, r * 0.27, r * 0.27);
    }
  }
}

function drawHairFront(
  ctx: CanvasRenderingContext2D,
  c: Character,
  cx: number,
  cy: number,
  r: number,
): void {
  ctx.fillStyle = c.hairColor;
  switch (c.hair) {
    case 'tousled':
      // Four-year-old hair: light, spiky, going its own way.
      ellipse(ctx, cx, cy - r * 0.52, r * 0.92, r * 0.5);
      for (let i = -2; i <= 2; i += 1) {
        ctx.save();
        ctx.translate(cx + i * r * 0.3, cy - r * 0.86);
        ctx.rotate(i * 0.28);
        ellipse(ctx, 0, 0, r * 0.13, r * 0.3);
        ctx.restore();
      }
      break;
    case 'part':
      // Neat side part.
      ellipse(ctx, cx, cy - r * 0.55, r * 0.94, r * 0.48);
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.9, cy - r * 0.42);
      ctx.quadraticCurveTo(cx - r * 0.1, cy - r * 0.86, cx + r * 0.86, cy - r * 0.3);
      ctx.quadraticCurveTo(cx + r * 0.2, cy - r * 0.5, cx - r * 0.9, cy - r * 0.42);
      ctx.closePath();
      ctx.fill();
      break;
    case 'ponytail':
      ellipse(ctx, cx, cy - r * 0.5, r * 0.95, r * 0.55);
      // Swept fringe.
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.92, cy - r * 0.34);
      ctx.quadraticCurveTo(cx, cy - r * 0.98, cx + r * 0.9, cy - r * 0.36);
      ctx.quadraticCurveTo(cx + r * 0.1, cy - r * 0.58, cx - r * 0.92, cy - r * 0.34);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = c.accent;
      // Hair tie, a spot of her colour.
      ellipse(ctx, cx + r * 0.78, cy - r * 0.18, r * 0.12, r * 0.09);
      break;
    case 'bun':
      // Pulled back smooth, a few strands loose at the temples.
      ellipse(ctx, cx, cy - r * 0.56, r * 0.94, r * 0.46);
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.9, cy - r * 0.2);
      ctx.quadraticCurveTo(cx - r * 0.55, cy - r * 0.8, cx, cy - r * 0.9);
      ctx.quadraticCurveTo(cx + r * 0.55, cy - r * 0.8, cx + r * 0.9, cy - r * 0.2);
      ctx.quadraticCurveTo(cx, cy - r * 0.62, cx - r * 0.9, cy - r * 0.2);
      ctx.closePath();
      ctx.fill();
      break;
    case 'pigtails':
      // A smooth top layer, plus a coloured tie at the base of each pigtail.
      ellipse(ctx, cx, cy - r * 0.56, r * 0.94, r * 0.48);
      ctx.fillStyle = c.accent;
      for (const s of [-1, 1]) {
        ellipse(ctx, cx + s * r * 0.88, cy - r * 0.02, r * 0.11, r * 0.09);
      }
      break;
    case 'puffs':
      // The puffs themselves are drawn behind the head; just the ties show up front.
      ctx.fillStyle = c.accent;
      for (const s of [-1, 1]) {
        ellipse(ctx, cx + s * r * 0.7, cy - r * 0.28, r * 0.09, r * 0.07);
      }
      break;
    case 'cap': {
      // Dome plus a brim jutting off to one side, in the character's own colour.
      ctx.fillStyle = c.accent;
      ellipse(ctx, cx, cy - r * 0.5, r * 0.98, r * 0.56);
      ctx.beginPath();
      ctx.ellipse(cx + r * 0.62, cy - r * 0.34, r * 0.46, r * 0.16, -0.2, 0, Math.PI * 2);
      ctx.fill();
      // A little fringe peeking out at the temples below the cap.
      ctx.fillStyle = c.hairColor;
      for (const s of [-1, 1]) {
        ellipse(ctx, cx + s * r * 0.84, cy - r * 0.02, r * 0.1, r * 0.18, s * 0.25);
      }
      break;
    }
    case 'buzz':
      // Short and close to the scalp, with a few flecks of texture rather than a
      // big silhouette.
      ellipse(ctx, cx, cy - r * 0.58, r * 0.9, r * 0.4);
      ctx.fillStyle = c.hairShade;
      for (let i = -3; i <= 3; i += 1) {
        circle(ctx, cx + i * r * 0.18, cy - r * 0.62, r * 0.05);
      }
      break;
    default:
      break;
  }
}

/** A kid's face. `size` is the head diameter. */
export function drawKidFace(
  ctx: CanvasRenderingContext2D,
  c: Character,
  cx: number,
  cy: number,
  size: number,
  opts: { look?: number } = {},
): void {
  const r = size / 2;
  const { look = 0 } = opts;

  drawHairBack(ctx, c, cx, cy, r);

  // Head, with a soft shade along the jaw so it is not a flat disc.
  ctx.fillStyle = c.skinShade;
  ellipse(ctx, cx, cy + r * 0.06, r * 0.9, r * 0.92);
  ctx.fillStyle = c.skin;
  ellipse(ctx, cx, cy, r * 0.88, r * 0.9);

  // Ears.
  ctx.fillStyle = c.skinShade;
  for (const s of [-1, 1]) circle(ctx, cx + s * r * 0.88, cy + r * 0.08, r * 0.15);

  drawHairFront(ctx, c, cx, cy, r);

  eyes(ctx, cx, cy + r * 0.04, r * 0.36, r * 0.16, look);

  if (c.glasses) {
    // Simple round frames, sized to sit just outside the eyes drawn above.
    const gy = cy + r * 0.04;
    const gSpread = r * 0.36;
    const gr = r * 0.22;
    ctx.strokeStyle = '#2c2c34';
    ctx.lineWidth = Math.max(1.2, r * 0.05);
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + s * gSpread, gy, gr, gr * 0.9, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Bridge between the lenses.
    ctx.beginPath();
    ctx.moveTo(cx - gSpread + gr, gy - gr * 0.1);
    ctx.lineTo(cx + gSpread - gr, gy - gr * 0.1);
    ctx.stroke();
  }

  // Blush.
  ctx.fillStyle = 'rgba(240,140,140,0.32)';
  for (const s of [-1, 1]) ellipse(ctx, cx + s * r * 0.55, cy + r * 0.32, r * 0.17, r * 0.11);

  if (c.freckles) {
    // A scatter of small dots across the nose and cheeks.
    ctx.fillStyle = 'rgba(180,100,60,0.55)';
    const freckleSpots = [
      [-0.42, 0.26],
      [-0.3, 0.34],
      [-0.16, 0.28],
      [0.16, 0.28],
      [0.3, 0.34],
      [0.42, 0.26],
    ] as const;
    for (const [dx, dy] of freckleSpots) {
      circle(ctx, cx + dx * r, cy + dy * r, r * 0.025);
    }
  }

  // Nose.
  ctx.fillStyle = c.skinShade;
  ellipse(ctx, cx, cy + r * 0.3, r * 0.07, r * 0.05);

  // Smile.
  ctx.strokeStyle = '#a8544a';
  ctx.lineWidth = Math.max(1.2, r * 0.07);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.34, r * 0.32, 0.32 * Math.PI, 0.68 * Math.PI);
  ctx.stroke();

  if (c.braces) {
    // A thin bright line across the smile. Small detail, instantly recognisable.
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = Math.max(1, r * 0.045);
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.34, r * 0.26, 0.36 * Math.PI, 0.64 * Math.PI);
    ctx.stroke();
  }
}

/** A polished medallion for animals, space objects, and arcade power-ups. */
function drawIconFace(
  ctx: CanvasRenderingContext2D,
  c: Character,
  cx: number,
  cy: number,
  size: number,
): void {
  const r = size / 2;
  const shadow = ctx.createRadialGradient(cx, cy + r * 0.34, r * 0.08, cx, cy, r * 1.05);
  shadow.addColorStop(0, `${c.accent}66`);
  shadow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shadow;
  circle(ctx, cx, cy + r * 0.18, r * 1.08);

  const badge = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  badge.addColorStop(0, '#252544');
  badge.addColorStop(0.58, '#151526');
  badge.addColorStop(1, '#0c0c18');
  ctx.fillStyle = badge;
  circle(ctx, cx, cy, r * 0.94);

  ctx.strokeStyle = c.accent;
  ctx.globalAlpha = 0.74;
  ctx.lineWidth = Math.max(1.5, r * 0.07);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.87, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.fillStyle = 'rgba(255,255,255,.18)';
  ellipse(ctx, cx - r * 0.24, cy - r * 0.48, r * 0.34, r * 0.12, -0.35);
  ctx.fillStyle = '#ffffff';
  circle(ctx, cx + r * 0.58, cy - r * 0.5, Math.max(1.2, r * 0.055));
  circle(ctx, cx - r * 0.62, cy + r * 0.26, Math.max(1, r * 0.035));

  ctx.font = `${Math.round(size * 0.58)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(c.glyph ?? '★', cx, cy + size * 0.025);
}

/** Face only, for menus and the celebration card. */
export function drawCharacterFace(
  ctx: CanvasRenderingContext2D,
  c: Character,
  cx: number,
  cy: number,
  size: number,
  opts: { look?: number } = {},
): void {
  if (c.kind === 'dog') drawDogFace(ctx, cx, cy, size, opts);
  else if (c.kind === 'kid') drawKidFace(ctx, c, cx, cy, size, opts);
  else drawIconFace(ctx, c, cx, cy, size);
}

/**
 * Full body, for in-game use. Drawn inside the box (x, y, w, h) with the feet on
 * the bottom edge, so a game can hand over its own collision box and trust the
 * art to sit in it.
 *
 * `frame` advances a two-step walk cycle, `facing` flips it, and `squash` is the
 * usual jump/land stretch: above 1 for the rise, below 1 for the landing.
 */
export function drawCharacterSprite(
  ctx: CanvasRenderingContext2D,
  c: Character,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { frame?: number; facing?: 1 | -1; squash?: number; airborne?: boolean } = {},
): void {
  const { frame = 0, facing = 1, squash = 1, airborne = false } = opts;

  const sw = w / squash;
  const sh = h * squash;
  const cx = x + w / 2;
  const feet = y + h;

  ctx.save();
  ctx.translate(cx, feet);
  ctx.scale(facing, 1);

  const headSize = sh * (c.kind === 'dog' ? 0.52 : 0.46);
  const bodyTop = -sh + headSize * 0.86;
  const bodyH = -bodyTop;
  const step = Math.sin(frame * Math.PI) * (airborne ? 0 : 1);

  if (c.kind === 'icon') {
    const bob = airborne ? -sh * 0.06 : Math.sin(frame * Math.PI * 2) * sh * 0.018;
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ellipse(ctx, 0, -sh * 0.015, sw * 0.3, sh * 0.045);
    drawIconFace(ctx, c, 0, -sh * 0.53 + bob, Math.min(sw, sh) * 0.88);
    ctx.restore();
    return;
  }

  if (c.kind === 'dog') {
    // Four legs, a body and a tail. Side-on, since he is running or hopping.
    ctx.fillStyle = '#141418';
    for (const [i, lx] of [-sw * 0.26, sw * 0.24].entries()) {
      const swing = step * sw * 0.12 * (i === 0 ? 1 : -1);
      roundRect(ctx, lx + swing - sw * 0.07, -bodyH * 0.3, sw * 0.15, bodyH * 0.3, sw * 0.06);
    }
    // Tail, up and wagging, white tip.
    ctx.save();
    ctx.translate(-sw * 0.42, bodyTop + bodyH * 0.34);
    ctx.rotate(-0.5 + Math.sin(frame * Math.PI * 2) * 0.25);
    ctx.fillStyle = '#141418';
    roundRect(ctx, -sw * 0.06, -bodyH * 0.42, sw * 0.12, bodyH * 0.44, sw * 0.06);
    ctx.fillStyle = '#f6f3ec';
    circle(ctx, 0, -bodyH * 0.42, sw * 0.07);
    ctx.restore();

    // Body.
    curlyEdge(ctx, -sw * 0.04, bodyTop + bodyH * 0.42, sw * 0.36, bodyH * 0.3, '#1d1d22', 11);
    ctx.fillStyle = '#1d1d22';
    ellipse(ctx, -sw * 0.04, bodyTop + bodyH * 0.42, sw * 0.36, bodyH * 0.3);
    // White chest.
    ctx.fillStyle = '#f6f3ec';
    ellipse(ctx, sw * 0.2, bodyTop + bodyH * 0.5, sw * 0.14, bodyH * 0.2);
    // Rust legs.
    ctx.fillStyle = '#8a4f22';
    roundRect(ctx, sw * 0.16, -bodyH * 0.26, sw * 0.13, bodyH * 0.16, sw * 0.05);

    drawDogFace(ctx, sw * 0.24, bodyTop + headSize * 0.12, headSize, { tongue: true });
    ctx.restore();
    return;
  }

  // --- kid ---
  const legH = bodyH * 0.36;
  ctx.fillStyle = '#2c3550';
  for (const [i, lx] of [-sw * 0.16, sw * 0.1].entries()) {
    const swing = step * sw * 0.14 * (i === 0 ? 1 : -1);
    roundRect(ctx, lx + swing, -legH, sw * 0.16, legH, sw * 0.06);
  }
  // Shoes.
  ctx.fillStyle = '#f4f4f6';
  for (const [i, lx] of [-sw * 0.16, sw * 0.1].entries()) {
    const swing = step * sw * 0.14 * (i === 0 ? 1 : -1);
    roundRect(ctx, lx + swing - sw * 0.02, -sw * 0.09, sw * 0.2, sw * 0.1, sw * 0.045);
  }

  // Torso.
  const torsoTop = bodyTop + headSize * 0.78;
  const torsoH = -legH - torsoTop;
  ctx.fillStyle = c.shirtShade;
  roundRect(ctx, -sw * 0.28, torsoTop, sw * 0.56, torsoH, sw * 0.12);
  ctx.fillStyle = c.shirt;
  roundRect(ctx, -sw * 0.26, torsoTop, sw * 0.52, torsoH * 0.94, sw * 0.11);

  if (c.stripes) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(-sw * 0.26, torsoTop, sw * 0.52, torsoH * 0.94);
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let sy = torsoTop; sy < torsoTop + torsoH; sy += torsoH * 0.18) {
      ctx.fillRect(-sw * 0.26, sy, sw * 0.52, torsoH * 0.08);
    }
    ctx.restore();
  }
  if (c.dots) {
    for (const [i, d] of [
      [-0.1, 0.28],
      [0.12, 0.5],
      [-0.05, 0.72],
    ].entries()) {
      ctx.fillStyle = ['#ff8fbf', '#f5a800', '#43d6c4'][i];
      circle(ctx, sw * d[0], torsoTop + torsoH * d[1], sw * 0.035);
    }
  }

  // Arms, swinging opposite the legs, or up when airborne.
  ctx.fillStyle = c.skin;
  for (const s of [-1, 1]) {
    const swing = airborne ? -bodyH * 0.16 : -step * bodyH * 0.1 * s;
    roundRect(
      ctx,
      s * sw * 0.3 - sw * 0.06,
      torsoTop + torsoH * 0.1 + swing,
      sw * 0.12,
      torsoH * 0.6,
      sw * 0.055,
    );
  }

  drawKidFace(ctx, c, 0, bodyTop + headSize * 0.42, headSize);
  ctx.restore();
}

// --- selection -------------------------------------------------------------

const KEY = 'isee-arcade:character';

export function readCharacterId(): CharacterId {
  if (typeof window === 'undefined') return DEFAULT_CHARACTER_ID;
  try {
    const v = window.localStorage.getItem(KEY);
    return getCharacter(v).id;
  } catch {
    return DEFAULT_CHARACTER_ID;
  }
}

// localStorage is an external store, so the choice is read through
// useSyncExternalStore rather than hydrated with a mount effect. That is the
// blessed pattern for this: it gives a stable server snapshot (the default, so
// SSR and the first client paint match) and avoids setting state from an effect
// entirely. Writes go through the module-level store so every mounted hook -
// the picker and each game shell - re-renders together.
const listeners = new Set<() => void>();

function subscribeCharacter(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/**
 * Set the chosen character from outside the hook (e.g. when a learner profile is
 * activated, so the games render that kid's avatar). Writes the store and
 * notifies every mounted useCharacter.
 */
export function setCharacterId(next: CharacterId): void {
  try {
    window.localStorage.setItem(KEY, next);
  } catch {
    // Private browsing: the notify still refreshes the in-memory view this session.
  }
  listeners.forEach((l) => l());
}

/** The chosen character, persisted so it survives a reload. */
export function useCharacter(): [Character, (id: CharacterId) => void] {
  const id = useSyncExternalStore(subscribeCharacter, readCharacterId, () => DEFAULT_CHARACTER_ID);

  const choose = useCallback((next: CharacterId) => {
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // Private browsing. The choice then lasts only this session, in which case
      // the notify below still refreshes the in-memory view.
    }
    listeners.forEach((l) => l());
  }, []);

  return [getCharacter(id), choose];
}

// --- custom name -------------------------------------------------------------

const NAME_KEY = 'isee-arcade:character-name';
const NAME_MAX_LENGTH = 16;

/**
 * Letters and spaces only, capped to a short length. Trimming is left to the
 * caller (typically on blur) rather than done here, so a space typed between
 * two words is not stripped mid-keystroke.
 */
export function sanitizeCharacterName(raw: string): string {
  return raw.replace(/[^a-zA-Z ]/g, '').slice(0, NAME_MAX_LENGTH);
}

export function readCharacterName(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

// Same external-store shape as useCharacter above, and for the same reason:
// useSyncExternalStore gives a stable ('') server snapshot and avoids setting
// state from an effect, and writes go through a module-level listener set so
// every mounted hook re-renders together.
const nameListeners = new Set<() => void>();

function subscribeCharacterName(cb: () => void): () => void {
  nameListeners.add(cb);
  return () => {
    nameListeners.delete(cb);
  };
}

/**
 * A custom name for the chosen character, persisted so it survives a reload.
 * Empty string means "no custom name set" - callers should fall back to the
 * character's own `name`.
 */
export function useCharacterName(): [string, (next: string) => void] {
  const name = useSyncExternalStore(subscribeCharacterName, readCharacterName, () => '');

  const setName = useCallback((next: string) => {
    const clean = sanitizeCharacterName(next);
    try {
      if (clean) window.localStorage.setItem(NAME_KEY, clean);
      else window.localStorage.removeItem(NAME_KEY);
    } catch {
      // Private browsing. The name then lasts only this session, in which case
      // the notify below still refreshes the in-memory view.
    }
    nameListeners.forEach((l) => l());
  }, []);

  return [name, setName];
}
