import { PICTURES, boardLayout, cellAt, emptyPainting, isComplete, paintCell, pictureHash, progressFor, silhouetteHash } from '../lib/colorByNumber.js';

const assert = (value: unknown, message: string) => { if (!value) throw new Error(`Color by Number check failed: ${message}`); };
const categories = new Set(PicturesCategories());
function PicturesCategories() { return PICTURES.map((picture) => picture.category); }

assert(PICTURES.length >= 40, 'gallery must contain at least 40 pictures');
assert(categories.size === 6, 'gallery must include every requested category');
assert(new Set(PICTURES.map((picture) => picture.name)).size === PICTURES.length, 'picture names must be unique');
assert(new Set(PICTURES.map(pictureHash)).size === PICTURES.length, 'pixel templates must have unique hashes');
assert(new Set(PICTURES.map(silhouetteHash)).size === PICTURES.length, 'all 42 pictures must use distinct structural silhouettes');

for (const picture of PICTURES) {
  assert(picture.rows >= 18 && picture.cols >= 20 && picture.cells.length >= 360, `${picture.name} is not intricate enough`);
  assert(picture.palette.length >= 8 && picture.palette.length <= 16, `${picture.name} palette must be rich but usable`);
  assert(picture.cells.length === picture.rows * picture.cols, `${picture.name} grid size mismatch`);
  const used = new Set(picture.cells);
  for (let color = 0; color < picture.palette.length; color += 1) assert(used.has(color), `${picture.name} does not use palette color ${color + 1}`);
  assert(picture.cells.every((color) => Number.isInteger(color) && color >= 0 && color < picture.palette.length), `${picture.name} has invalid color numbers`);
  const blank = emptyPainting(picture);
  assert(progressFor(picture, blank) === 0 && !isComplete(picture, blank), `${picture.name} must start incomplete`);
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
    const layout = boardLayout(width, height, picture, 1.4, 18, -12);
    assert(cellAt(layout, picture, layout.x + layout.cell * .5, layout.y + layout.cell * .5) === 0, `${picture.name} misses top-left hit at ${width}x${height}`);
    const last = picture.cells.length - 1;
    assert(cellAt(layout, picture, layout.x + layout.width - layout.cell * .5, layout.y + layout.height - layout.cell * .5) === last, `${picture.name} misses bottom-right hit at ${width}x${height}`);
    assert(cellAt(layout, picture, layout.x - 2, layout.y - 2) === null, `${picture.name} accepts out-of-board hit at ${width}x${height}`);
  }
}

console.log(`Color by Number verified: ${PICTURES.length} original, solvable pixel-art pictures.`);
