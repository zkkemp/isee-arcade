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

export type CharacterId = 'marty' | 'dakota' | 'carson' | 'colton' | 'hudson';

type HairStyle = 'bun' | 'ponytail' | 'part' | 'tousled';

export type Character = {
  id: CharacterId;
  name: string;
  kind: 'dog' | 'kid';
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
};

const SKIN = '#f7dcc4';
const SKIN_SHADE = '#e8bfa0';

export const CHARACTERS: Character[] = [
  {
    id: 'marty',
    name: 'Marty',
    kind: 'dog',
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
];

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

  // Blush.
  ctx.fillStyle = 'rgba(240,140,140,0.32)';
  for (const s of [-1, 1]) ellipse(ctx, cx + s * r * 0.55, cy + r * 0.32, r * 0.17, r * 0.11);

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
  else drawKidFace(ctx, c, cx, cy, size, opts);
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
