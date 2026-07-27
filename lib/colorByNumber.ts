/** Pure template data and geometry for the original Color by Number gallery. */

export type PictureCategory = 'animals' | 'fantasy' | 'nature' | 'space' | 'vehicles' | 'patterns';
export type PaletteColor = { hex: string; name: string };
export type PictureTemplate = {
  id: string; name: string; category: PictureCategory; rows: number; cols: number; palette: PaletteColor[]; cells: number[];
};

type Spec = { name: string; category: PictureCategory; variant: number; seed: number; rows: number; cols: number; colors: number };

const NAMES: Record<PictureCategory, string[]> = {
  animals: ['Copper Fox', 'Moon Cat', 'Sea Turtle', 'Peacock Parade', 'Honeybee Garden', 'Arctic Owl', 'Coral Seahorse'],
  fantasy: ['Crystal Dragon', 'Cloud Unicorn', 'Mushroom Cottage', 'Phoenix Flight', 'Tiny Wizard', 'Mermaid Lagoon', 'Moon Castle'],
  nature: ['Mountain Meadow', 'Sunflower Field', 'Sakura Rain', 'Aurora Pines', 'Desert Bloom', 'Waterfall Trail', 'Autumn Cabin'],
  space: ['Ringed Planet', 'Rocket Mail', 'Nebula Whale', 'Star Observatory', 'Comet Garden', 'Robot Rover', 'Galaxy Telescope'],
  vehicles: ['Cherry Scooter', 'Harbor Sailboat', 'Cloud Train', 'Fire Truck', 'Jungle Jeep', 'Submarine', 'Hot Air Balloon'],
  patterns: ['Mosaic Mandala', 'Rainbow Quilt', 'Tile Labyrinth', 'Prism Waves', 'Garden Geometric', 'Pixel Plaid', 'Starlight Kaleidoscope'],
};

const CATEGORY_ORDER: PictureCategory[] = ['animals', 'fantasy', 'nature', 'space', 'vehicles', 'patterns'];
const COLOR_NAMES = ['Ink', 'Coral', 'Gold', 'Leaf', 'Sky', 'Indigo', 'Plum', 'Rose', 'Mint', 'Amber', 'Ocean', 'Lilac', 'Berry', 'Lime', 'Sun', 'Cloud'];

function hsl(h: number, s: number, l: number) { return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`; }
function mod(n: number, m: number) { return ((n % m) + m) % m; }

function makePalette(seed: number, count: number): PaletteColor[] {
  return Array.from({ length: count }, (_, i) => ({
    hex: hsl(mod(seed * 41 + i * 360 / count + (i % 3) * 17, 360), 61 + (i * 9) % 24, 36 + (i * 11) % 31),
    name: COLOR_NAMES[i],
  }));
}

const ellipse = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) =>
  ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const box = (x: number, y: number, cx: number, cy: number, width: number, height: number) =>
  Math.abs(x - cx) <= width / 2 && Math.abs(y - cy) <= height / 2;
const segment = (x: number, y: number, ax: number, ay: number, bx: number, by: number, thickness: number) => {
  const dx = bx - ax; const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) <= thickness;
};
const triangle = (
  x: number, y: number,
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number,
) => {
  const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by);
  const d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy);
  const d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
  return !(d1 < 0 || d2 < 0 || d3 < 0) || !(d1 > 0 || d2 > 0 || d3 > 0);
};

/**
 * Forty-two distinct, original silhouettes. The gallery names now describe
 * the actual shape a child uncovers instead of being labels over six masks.
 */
function subjectMask(category: PictureCategory, variant: number, x: number, y: number): number {
  let inside = false;
  if (category === 'animals') {
    if (variant === 0) inside = ellipse(x, y, 0, .05, .38, .37) || triangle(x, y, -.34, -.12, -.64, -.7, -.08, -.42) || triangle(x, y, .34, -.12, .64, -.7, .08, -.42) || triangle(x, y, 0, .12, -.24, .48, .24, .48); // fox
    if (variant === 1) inside = ellipse(x, y, 0, -.03, .4, .38) || triangle(x, y, -.3, -.25, -.48, -.72, -.04, -.4) || triangle(x, y, .3, -.25, .48, -.72, .04, -.4) || segment(x, y, .33, .2, .68, .62, .08); // cat
    if (variant === 2) inside = ellipse(x, y, 0, .08, .5, .3) || ellipse(x, y, .56, .04, .17, .14) || ellipse(x, y, -.3, .37, .15, .1) || ellipse(x, y, .28, .37, .15, .1); // turtle
    if (variant === 3) inside = ellipse(x, y, 0, -.02, .17, .48) || ellipse(x, y, 0, -.12, .7, .58) && !ellipse(x, y, 0, .02, .32, .39) || segment(x, y, 0, .28, 0, .72, .09); // peacock
    if (variant === 4) inside = ellipse(x, y, 0, .08, .4, .25) || ellipse(x, y, -.32, -.12, .25, .2) || ellipse(x, y, .32, -.12, .25, .2) || triangle(x, y, .4, .03, .68, .18, .4, .25); // bee
    if (variant === 5) inside = ellipse(x, y, 0, .12, .37, .52) || ellipse(x, y, -.2, -.2, .2, .2) || ellipse(x, y, .2, -.2, .2, .2) || triangle(x, y, 0, -.02, -.08, .15, .08, .15); // owl
    if (variant === 6) inside = segment(x, y, .15, -.42, -.05, .52, .16) || ellipse(x, y, .15, -.45, .28, .2) || segment(x, y, -.05, .5, -.38, .4, .1) || ellipse(x, y, -.35, .38, .18, .15); // seahorse
  } else if (category === 'fantasy') {
    if (variant === 0) inside = ellipse(x, y, .02, .12, .43, .25) || triangle(x, y, -.2, .02, -.72, -.48, -.42, .18) || triangle(x, y, .14, .03, .66, -.42, .42, .2) || segment(x, y, .35, .2, .72, .55, .1); // dragon
    if (variant === 1) inside = ellipse(x, y, .05, .05, .3, .42) || triangle(x, y, .02, -.35, .2, -.82, .25, -.25) || segment(x, y, -.18, .28, -.5, .68, .16); // unicorn
    if (variant === 2) inside = ellipse(x, y, 0, -.26, .62, .3) || box(x, y, 0, .24, .58, .67) || ellipse(x, y, 0, .38, .13, .24); // mushroom cottage
    if (variant === 3) inside = ellipse(x, y, 0, .04, .16, .42) || triangle(x, y, -.08, -.05, -.72, -.55, -.42, .18) || triangle(x, y, .08, -.05, .72, -.55, .42, .18) || triangle(x, y, 0, .18, -.35, .75, 0, .48) || triangle(x, y, 0, .18, .35, .75, 0, .48); // phoenix
    if (variant === 4) inside = ellipse(x, y, 0, -.08, .26, .25) || triangle(x, y, -.45, -.2, .38, -.72, .48, -.05) || triangle(x, y, 0, .08, -.42, .7, .42, .7); // wizard
    if (variant === 5) inside = ellipse(x, y, 0, -.38, .2, .2) || box(x, y, 0, -.08, .3, .42) || triangle(x, y, 0, .08, -.5, .72, .5, .72); // mermaid
    if (variant === 6) inside = box(x, y, 0, .2, .72, .72) || box(x, y, -.47, .03, .22, .9) || box(x, y, .47, .03, .22, .9) || triangle(x, y, -.47, -.42, -.68, -.08, -.26, -.08) || triangle(x, y, .47, -.42, .26, -.08, .68, -.08); // castle
  } else if (category === 'nature') {
    if (variant === 0) inside = triangle(x, y, -.36, -.56, -.9, .58, .15, .58) || triangle(x, y, .32, -.42, -.28, .58, .9, .58) || ellipse(x, y, .55, -.56, .18, .18); // mountains
    if (variant === 1) inside = ellipse(x, y, 0, -.12, .24, .24) || Array.from({ length: 10 }, (_, i) => { const a = i * Math.PI / 5; return ellipse(x, y, Math.cos(a) * .43, -.12 + Math.sin(a) * .43, .2, .13); }).some(Boolean) || segment(x, y, 0, .1, 0, .78, .07); // sunflower
    if (variant === 2) inside = segment(x, y, -.12, .7, .02, -.3, .11) || segment(x, y, -.02, .1, -.55, -.28, .08) || segment(x, y, 0, -.08, .54, -.45, .08) || ellipse(x, y, -.5, -.32, .27, .22) || ellipse(x, y, .46, -.5, .3, .23); // sakura
    if (variant === 3) inside = triangle(x, y, -.42, -.35, -.75, .72, -.08, .72) || triangle(x, y, .36, -.48, .02, .72, .72, .72) || Math.abs(y + .62 + .08 * Math.sin(x * 7)) < .08; // aurora pines
    if (variant === 4) inside = box(x, y, -.2, .12, .15, .82) || box(x, y, .12, .34, .5, .13) || box(x, y, -.46, -.03, .4, .13) || y > .48 + .1 * Math.sin(x * 6); // desert cactus
    if (variant === 5) inside = box(x, y, 0, .05, .24, 1.3) || triangle(x, y, -.45, -.65, -.9, .65, -.13, .65) || triangle(x, y, .45, -.65, .13, .65, .9, .65) || ellipse(x, y, 0, .66, .5, .13); // waterfall
    if (variant === 6) inside = box(x, y, 0, .26, .7, .57) || triangle(x, y, 0, -.5, -.55, .05, .55, .05) || box(x, y, .05, .35, .18, .38) || triangle(x, y, -.65, -.22, -.9, .64, -.4, .64); // cabin
  } else if (category === 'space') {
    if (variant === 0) inside = ellipse(x, y, 0, 0, .38, .38) || Math.abs(((x / .72) ** 2 + (y / .2) ** 2) - 1) < .35; // ringed planet
    if (variant === 1) inside = box(x, y, 0, -.02, .32, .75) || triangle(x, y, 0, -.72, -.2, -.38, .2, -.38) || triangle(x, y, -.16, .2, -.48, .55, -.16, .55) || triangle(x, y, .16, .2, .48, .55, .16, .55) || triangle(x, y, 0, .36, -.15, .78, .15, .78); // rocket
    if (variant === 2) inside = ellipse(x, y, 0, .02, .62, .3) || triangle(x, y, -.45, .08, -.78, -.32, -.67, .22) || segment(x, y, .42, .06, .72, -.24, .1); // nebula whale
    if (variant === 3) inside = box(x, y, 0, .28, .72, .56) || ellipse(x, y, 0, -.04, .5, .38) && y <= -.04 || box(x, y, 0, .02, .1, .32); // observatory
    if (variant === 4) inside = ellipse(x, y, -.38, .28, .2, .2) || triangle(x, y, -.22, .22, .78, -.5, .42, .12); // comet
    if (variant === 5) inside = box(x, y, 0, .1, .65, .38) || ellipse(x, y, -.3, .42, .18, .18) || ellipse(x, y, .3, .42, .18, .18) || box(x, y, .05, -.26, .18, .36) || ellipse(x, y, .12, -.48, .2, .14); // rover
    if (variant === 6) inside = segment(x, y, -.4, .05, .42, -.48, .18) || ellipse(x, y, .46, -.5, .28, .18) || segment(x, y, -.2, .15, -.5, .72, .09) || segment(x, y, -.2, .15, .22, .72, .09); // telescope
  } else if (category === 'vehicles') {
    if (variant === 0) inside = ellipse(x, y, -.2, .45, .2, .2) || ellipse(x, y, .38, .45, .2, .2) || segment(x, y, -.2, .4, .05, -.05, .09) || segment(x, y, .05, -.05, .38, .4, .09) || segment(x, y, .05, -.05, .4, -.2, .08); // scooter
    if (variant === 1) inside = triangle(x, y, .02, -.6, .02, .25, .65, .25) || triangle(x, y, -.03, -.45, -.03, .25, -.58, .25) || segment(x, y, 0, -.62, 0, .5, .06) || triangle(x, y, 0, .56, -.7, .25, .7, .25); // sailboat
    if (variant === 2) inside = box(x, y, 0, .15, 1.4, .42) || box(x, y, -.38, -.18, .45, .28) || ellipse(x, y, -.48, .43, .18, .18) || ellipse(x, y, .45, .43, .18, .18); // train
    if (variant === 3) inside = box(x, y, -.12, .08, 1.15, .55) || box(x, y, .4, -.22, .28, .34) || ellipse(x, y, -.42, .43, .18, .18) || ellipse(x, y, .35, .43, .18, .18) || segment(x, y, -.45, -.2, .15, -.58, .07); // fire truck
    if (variant === 4) inside = box(x, y, 0, .12, 1.22, .48) || box(x, y, -.14, -.22, .5, .3) || ellipse(x, y, -.43, .42, .2, .2) || ellipse(x, y, .43, .42, .2, .2); // jeep
    if (variant === 5) inside = ellipse(x, y, 0, .02, .68, .3) || box(x, y, 0, -.3, .28, .35) || segment(x, y, -.48, 0, -.75, -.25, .08); // submarine
    if (variant === 6) inside = ellipse(x, y, 0, -.3, .55, .47) || triangle(x, y, 0, .02, -.28, .56, .28, .56) || box(x, y, 0, .62, .32, .22); // balloon
  } else {
    const angle = Math.atan2(y, x); const radius = Math.hypot(x, y);
    if (variant === 0) inside = Math.sin(angle * 8 + radius * 10) > .1;
    if (variant === 1) inside = mod(Math.floor((x + 1) * 5) + Math.floor((y + 1) * 5), 2) === 0;
    if (variant === 2) inside = Math.abs(Math.sin(x * 9) * Math.cos(y * 9)) > .48;
    if (variant === 3) inside = Math.sin((x + y) * 9) > .15;
    if (variant === 4) inside = mod(Math.floor((x + 1) * 7), 3) === mod(Math.floor((y + 1) * 7), 3);
    if (variant === 5) inside = Math.sin(x * 13) + Math.sin(y * 8) > .35;
    if (variant === 6) inside = Math.sin(angle * 6 + radius * 18) > .08;
  }
  return inside ? 1 : 0;
}

function makeCells(spec: Spec): number[] {
  const cells: number[] = [];
  for (let r = 0; r < spec.rows; r += 1) for (let c = 0; c < spec.cols; c += 1) {
    const x = (c + .5) / spec.cols * 2 - 1;
    const y = (r + .5) / spec.rows * 2 - 1;
    const wave = Math.sin(x * (4 + spec.seed % 5) + spec.seed) + Math.cos(y * (5 + spec.seed % 4) - spec.seed * .7) + Math.sin((x + y) * 7);
    const texture = mod(Math.floor((wave + 3) * 2.3) + r * 3 + c * 5 + spec.seed, spec.colors);
    const mask = subjectMask(spec.category, spec.variant, x, y);
    // Two quiet background colors make the named silhouette readable. Every
    // other palette color is reserved for rich detail inside the subject.
    const value = mask
      ? 2 + mod(texture + Math.floor((x - y + 2) * 2), spec.colors - 2)
      : mod(texture + Math.floor((r + c) / 5), 2);
    cells.push(value);
  }
  // Guarantee palette coverage without scattering foreground "spark" pixels
  // into the quiet background around a recognizable silhouette.
  const background = cells.flatMap((value, index) => value < 2 ? [index] : []);
  const foreground = cells.flatMap((value, index) => value >= 2 ? [index] : []);
  for (let color = 0; color < spec.colors; color += 1) {
    const candidates = color < 2 ? background : foreground;
    if (candidates.length > 0) {
      cells[candidates[(spec.seed * 17 + color * 29) % candidates.length]] = color;
    }
  }
  return cells;
}

function specs(): Spec[] {
  const result: Spec[] = [];
  let seed = 11;
  CATEGORY_ORDER.forEach((category, catIndex) => NAMES[category].forEach((name, variant) => {
    result.push({ name, category, variant, seed: seed++, rows: 18 + (variant + catIndex) % 5, cols: 20 + (variant * 2 + catIndex) % 5, colors: 8 + (variant * 3 + catIndex) % 9 });
  }));
  return result;
}

export const PICTURES: PictureTemplate[] = specs().map((spec, i) => ({
  id: `${spec.category}-${spec.name.toLowerCase().replaceAll(' ', '-')}`,
  name: spec.name, category: spec.category, rows: spec.rows, cols: spec.cols,
  palette: makePalette(spec.seed + i * 3, spec.colors), cells: makeCells(spec),
}));

export function pictureHash(picture: PictureTemplate): string {
  let hash = 2166136261;
  for (const cell of picture.cells) { hash ^= cell + 31; hash = Math.imul(hash, 16777619); }
  return `${picture.rows}x${picture.cols}:${hash >>> 0}`;
}

/** Binary foreground signature used to guard against recycled silhouettes. */
export function silhouetteHash(picture: PictureTemplate): string {
  let hash = 2166136261;
  for (const cell of picture.cells) {
    hash ^= cell >= 2 ? 1 : 0;
    hash = Math.imul(hash, 16777619);
  }
  return `${picture.rows}x${picture.cols}:${hash >>> 0}`;
}

export function emptyPainting(picture: PictureTemplate): number[] { return Array.from({ length: picture.cells.length }, () => -1); }
export function isComplete(picture: PictureTemplate, painted: readonly number[]): boolean { return painted.length === picture.cells.length && painted.every((v, i) => v === picture.cells[i]); }
export function progressFor(picture: PictureTemplate, painted: readonly number[]): number {
  if (painted.length !== picture.cells.length) return 0;
  let correct = 0; for (let i = 0; i < painted.length; i += 1) if (painted[i] === picture.cells[i]) correct += 1;
  return correct / picture.cells.length;
}

export type BoardLayout = { x: number; y: number; cell: number; width: number; height: number };
export function boardLayout(width: number, height: number, picture: PictureTemplate, zoom = 1, panX = 0, panY = 0): BoardLayout {
  // Reserve actual room for the one/two-row key. Without this a 16-colour
  // picture could look fine at first and then hide its lower cells beneath the
  // palette on a portrait iPad.
  const keyRows = Math.ceil(picture.palette.length / 8);
  const keyTop = height - keyRows * 47 - 8;
  const usableHeight = Math.max(56, keyTop - 116);
  const base = Math.min((width - 28) / picture.cols, usableHeight / picture.rows);
  const cell = Math.max(7, base * zoom);
  const boardWidth = cell * picture.cols; const boardHeight = cell * picture.rows;
  return { x: (width - boardWidth) / 2 + panX, y: 104 + (usableHeight - boardHeight) / 2 + panY, cell, width: boardWidth, height: boardHeight };
}
export function cellAt(layout: BoardLayout, picture: PictureTemplate, x: number, y: number): number | null {
  const col = Math.floor((x - layout.x) / layout.cell); const row = Math.floor((y - layout.y) / layout.cell);
  return row >= 0 && row < picture.rows && col >= 0 && col < picture.cols ? row * picture.cols + col : null;
}
export function paintCell(picture: PictureTemplate, painted: readonly number[], index: number, color: number): { next: number[]; correct: boolean } {
  const next = [...painted]; const correct = index >= 0 && index < picture.cells.length && picture.cells[index] === color;
  if (correct) next[index] = color;
  return { next, correct };
}
