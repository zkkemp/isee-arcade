/**
 * Focused checks for Block Drop's selectable large boards and randomized
 * openings.
 *
 * Run: node --import tsx scripts/check-block-sizes.ts
 */
import {
  BASES,
  BOARD_H,
  BOARD_SIZES,
  BOARD_W,
  PATTERN_NAMES,
  aimAt,
  anyFits,
  canPlace,
  cellCentre,
  cellForSize,
  clearLines,
  dragOrigin,
  fullRowFor,
  layoutFor,
  lcg,
  makeBoard,
  masksAgree,
  nextPatternOffset,
  patternBoard,
  patternMaskForLevel,
  refillTray,
  setupChoiceAt,
  setupPlayAt,
  type BoardSize,
} from '../components/games/Blocks';

const problems: string[] = [];
const fail = (message: string) => problems.push(message);
const shapes = BASES.flatMap((base) => base.rotations);

function checkBoard(size: BoardSize): void {
  const board = makeBoard(size);
  if (board.cells.length !== size * size || board.rows.length !== size) {
    fail(`${size}x${size}: board arrays have the wrong dimensions`);
  }
  if (!masksAgree(board)) fail(`${size}x${size}: a fresh board's masks disagree`);

  for (const shape of shapes) {
    if (!canPlace(board, shape, 0, 0)) {
      fail(`${size}x${size}: ${shape.id} does not fit on a blank board`);
      break;
    }
  }

  // One full row and one full column must clear as a union at every size.
  const row = Math.floor(size / 3);
  const col = Math.floor((size * 2) / 3);
  board.rows[row] = fullRowFor(size);
  for (let c = 0; c < size; c += 1) board.cells[row * size + c] = 1;
  for (let r = 0; r < size; r += 1) {
    board.rows[r] |= 1 << col;
    board.cells[r * size + col] = 2;
  }
  const cleared = clearLines(board);
  if (cleared.rows.join() !== `${row}` || cleared.cols.join() !== `${col}`) {
    fail(`${size}x${size}: cross clear found rows ${cleared.rows} and cols ${cleared.cols}`);
  }
  if (cleared.cells.length !== size * 2 - 1 || !masksAgree(board)) {
    fail(`${size}x${size}: cross clear removed the wrong union or desynced masks`);
  }

  for (let level = 1; level <= PATTERN_NAMES.length; level += 1) {
    const mask = patternMaskForLevel(level, size);
    const picture = patternBoard(level, size);
    const density = mask.filter(Boolean).length / mask.length;
    if (mask.length !== size * size) fail(`${size}x${size}: level ${level} mask has wrong length`);
    if (density < 0.08 || density > 0.72) {
      fail(`${size}x${size}: level ${level} picture density ${density.toFixed(2)} is unreasonable`);
    }
    if (!masksAgree(picture)) fail(`${size}x${size}: level ${level} picture masks disagree`);
  }

  // The easy and normal guarantees must remain true on every larger-board deal.
  for (const difficulty of ['easy', 'normal'] as const) {
    for (let seed = 1; seed <= 300; seed += 1) {
      const crowded = patternBoard(seed, size);
      const tray = refillTray(crowded, lcg(seed * 7919 + size), difficulty);
      if (!anyFits(crowded, tray.map((piece) => piece.shape))) {
        fail(`${size}x${size}: ${difficulty} seed ${seed} dealt no legal move`);
        break;
      }
    }
  }
}

function checkTouch(size: BoardSize): void {
  const layout = layoutFor(768, 1024, 120);
  const physicalCell = cellForSize(size) * layout.scale;
  if (physicalCell < 32) {
    fail(`${size}x${size}: iPad cell is only ${physicalCell.toFixed(1)} physical pixels`);
  }

  const shape = shapes.find((candidate) => candidate.w === 2 && candidate.h === 2);
  if (!shape) throw new Error('checker needs a 2x2 shape');
  const board = makeBoard(size);
  const cell = cellForSize(size);
  const first = cellCentre(0, 0, size);
  const gridX = first.x - cell / 2;
  const gridY = first.y - cell / 2;
  const probe = dragOrigin(shape, 0, 0, size);
  const lift = -probe.y - (shape.h * cell) / 2;
  const anchors = [
    [0, 0],
    [Math.floor((size - shape.h) / 2), Math.floor((size - shape.w) / 2)],
    [size - shape.h, size - shape.w],
  ];
  for (const [r, c] of anchors) {
    const fx = gridX + c * cell + (shape.w * cell) / 2;
    const fy = gridY + r * cell + lift + (shape.h * cell) / 2;
    const aimed = aimAt(board, shape, fx, fy);
    if (!aimed.valid || aimed.ar !== r || aimed.ac !== c) {
      fail(`${size}x${size}: fingertip aim at ${r},${c} became ${aimed.ar},${aimed.ac}`);
    }
  }
}

for (const size of BOARD_SIZES) {
  checkBoard(size);
  checkTouch(size);
}

// The three setup cards have broad, disjoint hit targets, and the play target is
// separate. Sampling finds their centres without coupling the checker to private
// drawing constants.
for (const size of BOARD_SIZES) {
  let hits = 0;
  for (let y = 0; y <= BOARD_H; y += 2) {
    for (let x = 0; x <= BOARD_W; x += 2) if (setupChoiceAt(x, y) === size) hits += 1;
  }
  if (hits < 900) fail(`${size}x${size}: setup touch target is too small (${hits} samples)`);
}
if (!setupPlayAt(BOARD_W / 2, 285) || setupChoiceAt(BOARD_W / 2, 285) !== null) {
  fail('setup play button is missing or overlaps a board-size card');
}

// Openings are deterministic for a seed but varied between restarts. The
// component carries the previous offset, so even a hash collision cannot repeat
// the same picture twice in a row.
const signatures = new Set<string>();
let previous: number | null = null;
for (let seed = 1; seed <= 72; seed += 1) {
  const offset = nextPatternOffset(seed, previous);
  if (offset === previous) fail(`seed ${seed}: opening picture repeated immediately`);
  previous = offset;
  const board = patternBoard(1 + offset, 12);
  const tray = refillTray(board, lcg(seed), 'normal');
  signatures.add(
    `${offset}:${tray.map((piece) => `${piece.shape.id}/${piece.tone}`).join('|')}`,
  );
}
if (signatures.size < 60) fail(`only ${signatures.size}/72 opening board-and-tray signatures varied`);

if (problems.length > 0) {
  console.error(`Block Drop large-board checks FAILED (${problems.length})`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(
  `Block Drop large-board checks passed: ${BOARD_SIZES.join(', ')} grids, ` +
    `${shapes.length} rotations, iPad touch geometry, setup hit targets, ` +
    `${signatures.size} varied deterministic openings.`,
);
