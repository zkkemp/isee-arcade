import {
  PICTURES,
  availableColors,
  boardLayout,
  cellAt,
  emptyPainting,
  isComplete,
  paintCell,
  paletteLayout,
  pictureHash,
  progressFor,
  remainingByColor,
  silhouetteHash,
} from '../lib/colorByNumber.js';
import { readFileSync } from 'node:fs';

const assert = (value: unknown, message: string) => { if (!value) throw new Error(`Color by Number check failed: ${message}`); };
const categories = new Set(PicturesCategories());
function PicturesCategories() { return PICTURES.map((picture) => picture.category); }

assert(PICTURES.length >= 40, 'gallery must contain at least 40 pictures');
assert(categories.size === 6, 'gallery must include every requested category');
assert(new Set(PICTURES.map((picture) => picture.name)).size === PICTURES.length, 'picture names must be unique');
assert(new Set(PICTURES.map(pictureHash)).size === PICTURES.length, 'pixel templates must have unique hashes');
assert(new Set(PICTURES.map(silhouetteHash)).size === PICTURES.length, 'all 42 pictures must use distinct structural silhouettes');
const componentSource = readFileSync(new URL('../components/games/ColorByNumber.tsx', import.meta.url), 'utf8');
assert(componentSource.includes('onPointerDown={onPointerDown}') && componentSource.includes('pointersRef.current.size === 2'), 'canvas must support two-finger gestures');
assert(componentSource.includes('onWheel=') && componentSource.includes('zoomAround'), 'canvas must support mouse/trackpad zoom');
assert(componentSource.includes("ctx.fillStyle = '#ffffff'"), 'painting sheet must use a non-blending white background');

for (const picture of PICTURES) {
  assert(picture.rows >= 34 && picture.cols >= 36 && picture.cells.length >= 1200, `${picture.name} is not intricate enough`);
  assert(picture.palette.length >= 10 && picture.palette.length <= 16, `${picture.name} palette must be rich but usable`);
  assert(picture.cells.length === picture.rows * picture.cols, `${picture.name} grid size mismatch`);
  const used = new Set(picture.cells);
  for (let color = 0; color < picture.palette.length; color += 1) assert(used.has(color), `${picture.name} does not use palette color ${color + 1}`);
  assert(picture.cells.every((color) => Number.isInteger(color) && color >= 0 && color < picture.palette.length), `${picture.name} has invalid color numbers`);
  const blank = emptyPainting(picture);
  assert(progressFor(picture, blank) === 0 && !isComplete(picture, blank), `${picture.name} must start incomplete`);
  const initialRemaining = remainingByColor(picture, blank);
  assert(initialRemaining.reduce((sum, count) => sum + count, 0) === picture.cells.length, `${picture.name} initial color counts do not cover its grid`);
  assert(availableColors(picture, blank).length === picture.palette.length, `${picture.name} must begin with every used color available`);
  const firstColorDone = blank.map((value, index) => picture.cells[index] === 0 ? 0 : value);
  assert(remainingByColor(picture, firstColorDone)[0] === 0, `${picture.name} did not recognize a completed color`);
  assert(!availableColors(picture, firstColorDone).includes(0), `${picture.name} must hide a completed palette color`);
  assert(availableColors(picture, firstColorDone).length === picture.palette.length - 1, `${picture.name} hid the wrong number of palette colors`);
  let painted = blank;
  for (let index = 0; index < picture.cells.length; index += 1) {
    const bad = paintCell(picture, painted, index, (picture.cells[index] + 1) % picture.palette.length);
    assert(!bad.correct && bad.next[index] === -1, `${picture.name} accepted a wrong color`);
    const right = paintCell(picture, painted, index, picture.cells[index]);
    assert(right.correct, `${picture.name} rejected its correct color`);
    painted = right.next;
  }
  assert(isComplete(picture, painted) && progressFor(picture, painted) === 1, `${picture.name} cannot finish exactly`);
  for (const [width, height] of [[768, 1024], [1024, 768]] as const) {
    const fitted = boardLayout(width, height, picture);
    const key = paletteLayout(width, height, picture.palette.length);
    assert(fitted.x >= 11 && fitted.x + fitted.width <= width - 11, `${picture.name} does not fit horizontally at ${width}x${height}`);
    assert(fitted.y >= 98 && fitted.y + fitted.height <= key.top, `${picture.name} overlaps the header or palette at ${width}x${height}`);
    const layout = boardLayout(width, height, picture, 1.4, 18, -12);
    assert(cellAt(layout, picture, layout.x + layout.cell * .5, layout.y + layout.cell * .5) === 0, `${picture.name} misses top-left hit at ${width}x${height}`);
    const last = picture.cells.length - 1;
    assert(cellAt(layout, picture, layout.x + layout.width - layout.cell * .5, layout.y + layout.height - layout.cell * .5) === last, `${picture.name} misses bottom-right hit at ${width}x${height}`);
    assert(cellAt(layout, picture, layout.x - 2, layout.y - 2) === null, `${picture.name} accepts out-of-board hit at ${width}x${height}`);
    const zoomed = boardLayout(width, height, picture, 5.5);
    assert(zoomed.cell > fitted.cell * 5, `${picture.name} does not provide meaningful detail zoom at ${width}x${height}`);
  }
}

console.log(`Color by Number verified: ${PICTURES.length} distinct 1,200+ cell pictures, responsive iPad layout, detail zoom, and auto-hiding completed colors.`);
